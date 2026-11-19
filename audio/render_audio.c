/*
 * render_audio.c - render one Sound Test number of the game to a 16-bit stereo 44100 Hz WAV by running the
 * game's own Z80 sound driver (taken from the user's ROM) on three third-party chip cores:
 *   vendor/z80     Z80 CPU      (MIT, Nicolas Allemand)
 *   vendor/ym3438  Nuked-OPN2   (LGPL-2.1-or-later), in YM2612 mode
 *   vendor/psg     emu76489     (MIT, Mitsutaka Okazaki)
 * This file: Copyright (c) 2026 DarthNuts, MIT licence (SPDX-License-Identifier: MIT).
 * The asset extractor runs it once per sound, in parallel.  No audio device, no real time: the sound plays as fast
 * as the CPU emulates it.
 *
 * Build (the vendor directories are the only dependencies; the WebAssembly build adds --target=wasm32-wasi):
 *   cc -O2 -std=c99 -ffp-contract=off -I vendor/z80 -I vendor/ym3438 -I vendor/psg \
 *      render_audio.c vendor/z80/z80.c vendor/ym3438/ym3438.c vendor/psg/emu76489.c \
 *      -lm -o render_audio
 *
 * Usage:
 *   render_audio [options] ROM NUMBER OUT.wav
 *     NUMBER             Sound Test number, hex 00..FF (the ROM's sound command table row)
 *     --music-seconds S  length of a music render, fade included (default 150, 1..1000)
 *     --driver A:B       ROM range of the Z80 driver blob, hex (default 58F78:5A804)
 *     --ptrs A,B,C,D     the four 24-bit bank pointers sent to the driver, hex (default 5A804,5B0C0,5B0CC,5E51C)
 *     --table A          ROM address of the sound command table, hex (default C5EB4)
 *   The extractor reads these ROM facts from the ROM and passes them in; the defaults are the values of the
 *   accepted ROM image.
 *
 * What it does (everything below is a fact of the hardware or of the ROM, not a choice):
 *  - Z80 address map: 0000-3FFF 8 KB RAM, mirrored; 4000-5FFF the YM2612 (port = address & 3; a read returns the
 *    chip's status byte: busy and timer flags); 6000-60FF the bank register (9 bits, one bit shifted in per
 *    write from bit 0 of the data, least significant bit first); 7F11 the SN76489; 8000-FFFF a 32 KB window onto
 *    the 68000's address space at (bank register << 15) | (address & 7FFF).  The driver only ever reads ROM
 *    there (sample banks); anything past the end of the ROM reads 0xFF.
 *  - Boot: the 68000 copies the driver blob into Z80 RAM at 0 and clears the rest of the 8 KB, then sends the
 *    driver bytes through a command ring (64 bytes at Z80 1B40, write index kept at Z80 0036, every command
 *    is FF opcode args...): opcode 0B + the four 24-bit bank pointers (low byte first), then the five setup
 *    commands 1A 0F 04, 1C 04, 02 0F 12, 1C 0E, 1C 0D (the ones the game sends at start-up).
 *  - Timing: master clock 53693175 Hz; Z80 and SN76489 = master / 15; YM2612 = master / 7, and Nuked-OPN2
 *    advances 6 master clocks per OPN2_Clock call; 24 calls = one native FM sample (144 master clocks).  The
 *    Z80 gets a 60 Hz vertical-blank interrupt (data 0xFF).
 *  - Mix: one native FM sample is the sum of the 24 per-call outputs; output = FM * 4 + PSG per side, clamped.
 *  - The sound number selects a row of the ROM's sound command table (3 bytes: mode, command, variant); the
 *    68000 sends the driver, by mode:
 *      0 music   05 var, 10 cmd
 *      1 effect  01 0D 00, 02 0D cmd, 00 0D var        (channel 0D; the first, a stop of channel 0D, is a no-op)
 *      2, 3 voice  1A 0F var, 00 0F cmd                (sample on channel 0F)
 *
 * Rendering: a fresh machine runs 44 blocks of 1024 samples (1.02 s) after the boot commands, then the sound
 * command is written into the ring.  Music renders exactly --music-seconds from that point; the last 4 s fade
 * out linearly (the tune loops for ever).  Effects and voices render until the output has been silent for 1 s
 * (see SILENT_*), at most 15 s; the file keeps the audible part plus a 0.25 s tail (a sound that never goes
 * silent is cut at 15 s with a 1 s fade).
 *
 * Output: RIFF WAV, 16-bit stereo, 44100 Hz.  All arithmetic is integer except two double accumulators that
 * only ever add and subtract the same constants, so the same input gives the same file on every host.
 * stdout, one line:
 *   render_audio: number=87 mode=0 cmd=01 var=52 samples=N seconds=S active=A first=F last=L capped=C peak=P
 * (samples = frames in the file; active = frames that differ from the idle level; first/last = first and last
 * such frame, -1 when none).  Exit 0 on success, 1 on a usage or input error, 2 on an output error.
 */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "z80.h"
#include "ym3438.h"
#include "emu76489.h"

#define MASTER_HZ        53693175u
#define Z80_HZ           (MASTER_HZ / 15u)
#define FM_HZ            (MASTER_HZ / 7u)
#define OUT_RATE         44100
#define VBLANK_SAMPLES   (OUT_RATE / 60)            /* 735 output samples per 60 Hz interrupt */
#define BLOCK            1024
#define LEAD_BLOCKS      44                         /* idle blocks between the boot commands and the sound */
#define FADE_SECONDS     4
#define Z80_RAM_BYTES    0x2000u
#define RING_INDEX       0x0036u
#define RING_BASE        0x1B40u
#define RING_MASK        0x3Fu

#define DEFAULT_DRIVER_START 0x058F78u
#define DEFAULT_DRIVER_END   0x05A804u
#define DEFAULT_TABLE        0x0C5EB4u

#define SILENT_RUN       OUT_RATE                   /* 1 s of idle output ends an effect or a voice */
#define SILENT_TOLERANCE 4                          /* |sample - idle level| <= this counts as idle */
#define CAP_SECONDS      15
#define TAIL_SAMPLES     (OUT_RATE / 4)             /* silence kept after the last audible sample */
#define CAP_FADE         OUT_RATE                   /* fade when an effect is cut at the cap */

typedef struct {
    z80 cpu;
    ym3438_t fm;
    SNG *psg;
    uint8_t ram[Z80_RAM_BYTES];
    const uint8_t *rom;
    size_t rom_size;
    uint32_t bank;
    int16_t fm_l, fm_r;       /* last complete native FM sample */
    int32_t acc_l, acc_r;     /* running sum of the 24 calls of the sample in progress */
    int slot;                 /* 0..23 */
    double fm_credit;         /* FM calls owed */
    double z80_credit;        /* Z80 cycles owed */
    int vblank_count;
} machine;

static void fail(int code, const char *msg, const char *arg)
{
    fprintf(stderr, "render_audio: %s%s%s\n", msg, arg ? ": " : "", arg ? arg : "");
    exit(code);
}

/* ---- the FM chip: one Nuked-OPN2 call, accumulated into the native 24-call sample ---- */

static void fm_call(machine *m)
{
    int16_t out[2];
    OPN2_Clock(&m->fm, out);
    m->acc_l += out[0];
    m->acc_r += out[1];
    if (++m->slot == 24) {
        m->fm_l = (int16_t)m->acc_l;
        m->fm_r = (int16_t)m->acc_r;
        m->acc_l = m->acc_r = 0;
        m->slot = 0;
    }
    m->fm_credit -= 1.0;
}

/* ---- Z80 memory map ---- */

static uint8_t bus_read(void *ud, uint16_t a)
{
    machine *m = (machine *)ud;
    if (a < 0x4000u)
        return m->ram[a & (Z80_RAM_BYTES - 1u)];
    if (a < 0x6000u)
        return (uint8_t)OPN2_Read(&m->fm, (Bit32u)(a & 3u));
    if (a < 0x8000u)
        return 0xFFu;
    {
        uint32_t src = (m->bank << 15) | (uint32_t)(a & 0x7FFFu);
        return src < m->rom_size ? m->rom[src] : 0xFFu;
    }
}

static void bus_write(void *ud, uint16_t a, uint8_t v)
{
    machine *m = (machine *)ud;
    if (a < 0x4000u) {
        m->ram[a & (Z80_RAM_BYTES - 1u)] = v;
    } else if (a < 0x6000u) {
        OPN2_Write(&m->fm, (Bit32u)(a & 3u), v);
        /* The core only queues a write and applies it a few calls later; it detects a write as an edge, which
         * re-arms only after the queue has been clocked.  Two calls per write make every write of a burst
         * (sample streaming, patch loads) land.  They are drawn from the same budget as the calls made per
         * output sample, so the chip's average rate stays exactly FM_HZ / 6. */
        fm_call(m);
        fm_call(m);
    } else if (a < 0x6100u) {
        m->bank = (m->bank >> 1) | ((uint32_t)(v & 1u) << 8);
    } else if (a >= 0x7F00u && a < 0x8000u && (a & 0xFFu) == 0x11u) {
        SNG_writeIO(m->psg, v);
    }
    /* 6100-7EFF and the other 7Fxx ports: unused by the driver, ignored */
}

static uint8_t port_in(z80 *z, uint8_t p)
{
    (void)z; (void)p;
    return 0xFFu;
}

static void port_out(z80 *z, uint8_t p, uint8_t v)
{
    (void)z; (void)p; (void)v;
}

/* ---- the command ring, as the 68000 writes it ---- */

static void ring_put(machine *m, uint8_t byte)
{
    uint8_t idx = m->ram[RING_INDEX];
    m->ram[RING_BASE + idx] = byte;
    m->ram[RING_INDEX] = (uint8_t)((idx + 1u) & RING_MASK);
}

static void ring_cmd(machine *m, const uint8_t *args, int n)    /* FF, opcode, args */
{
    int i;
    ring_put(m, 0xFFu);
    for (i = 0; i < n; ++i)
        ring_put(m, args[i]);
}

static void machine_boot(machine *m, const uint8_t *rom, size_t rom_size, uint32_t drv_a, uint32_t drv_b,
                         const uint32_t ptrs[4])
{
    int i;
    memset(m, 0, sizeof *m);
    m->rom = rom;
    m->rom_size = rom_size;
    z80_init(&m->cpu);
    m->cpu.userdata = m;
    m->cpu.read_byte = bus_read;
    m->cpu.write_byte = bus_write;
    m->cpu.port_in = port_in;
    m->cpu.port_out = port_out;
    OPN2_Reset(&m->fm);
    OPN2_SetChipType(ym3438_mode_ym2612);    /* the core's default also answers a status read on every port */
    m->psg = SNG_new(Z80_HZ, OUT_RATE);
    if (!m->psg)
        fail(2, "out of memory", NULL);
    SNG_reset(m->psg);

    memcpy(m->ram, rom + drv_a, drv_b - drv_a);

    {   /* 0B + four 24-bit pointers, low byte first */
        uint8_t a[13];
        a[0] = 0x0Bu;
        for (i = 0; i < 4; ++i) {
            a[1 + 3 * i] = (uint8_t)ptrs[i];
            a[2 + 3 * i] = (uint8_t)(ptrs[i] >> 8);
            a[3 + 3 * i] = (uint8_t)(ptrs[i] >> 16);
        }
        ring_cmd(m, a, 13);
    }
    {
        static const uint8_t c1[] = { 0x1A, 0x0F, 0x04 }, c2[] = { 0x1C, 0x04 }, c3[] = { 0x02, 0x0F, 0x12 },
                             c4[] = { 0x1C, 0x0E }, c5[] = { 0x1C, 0x0D };
        ring_cmd(m, c1, 3);
        ring_cmd(m, c2, 2);
        ring_cmd(m, c3, 3);
        ring_cmd(m, c4, 2);
        ring_cmd(m, c5, 2);
    }
}

/* ---- one output frame ---- */

static void next_frame(machine *m, int16_t *left, int16_t *right)
{
    int32_t l, r, p;
    if (++m->vblank_count >= VBLANK_SAMPLES) {
        m->vblank_count = 0;
        z80_gen_int(&m->cpu, 0xFFu);
    }
    m->z80_credit += (double)Z80_HZ / (double)OUT_RATE;
    if (m->z80_credit >= 1.0) {
        unsigned long cycles = (unsigned long)m->z80_credit;
        unsigned long target = m->cpu.cyc + cycles;
        while (m->cpu.cyc < target)
            z80_step(&m->cpu);
        m->z80_credit -= (double)cycles;
    }
    m->fm_credit += ((double)FM_HZ / 6.0) / (double)OUT_RATE;
    while (m->fm_credit >= 1.0)
        fm_call(m);
    p = SNG_calc(m->psg);
    l = (int32_t)m->fm_l * 4 + p;
    r = (int32_t)m->fm_r * 4 + p;
    *left = (int16_t)(l > 32767 ? 32767 : l < -32768 ? -32768 : l);
    *right = (int16_t)(r > 32767 ? 32767 : r < -32768 ? -32768 : r);
}

/* ---- WAV ---- */

static void put_le(uint8_t *p, uint32_t v, int bytes)
{
    int i;
    for (i = 0; i < bytes; ++i)
        p[i] = (uint8_t)(v >> (8 * i));
}

static int write_wav(const char *path, const int16_t *frames, long n)
{
    uint8_t h[44];
    long i;
    FILE *f = fopen(path, "wb");
    if (!f)
        return 0;
    memcpy(h, "RIFF", 4);              put_le(h + 4, 36u + (uint32_t)n * 4u, 4);
    memcpy(h + 8, "WAVEfmt ", 8);      put_le(h + 16, 16, 4);
    put_le(h + 20, 1, 2);              put_le(h + 22, 2, 2);
    put_le(h + 24, OUT_RATE, 4);       put_le(h + 28, OUT_RATE * 4u, 4);
    put_le(h + 32, 4, 2);              put_le(h + 34, 16, 2);
    memcpy(h + 36, "data", 4);         put_le(h + 40, (uint32_t)n * 4u, 4);
    if (fwrite(h, 1, sizeof h, f) != sizeof h)
        goto bad;
    for (i = 0; i < n * 2; ++i) {      /* little-endian whatever the host is */
        uint8_t s[2];
        s[0] = (uint8_t)((uint16_t)frames[i] & 0xFFu);
        s[1] = (uint8_t)((uint16_t)frames[i] >> 8);
        if (fwrite(s, 1, 2, f) != 2)
            goto bad;
    }
    return fclose(f) == 0;
bad:
    fclose(f);
    return 0;
}

/* ---- main ---- */

static uint32_t parse_hex(const char *s, const char *what)
{
    char *end;
    unsigned long v = strtoul(s, &end, 16);
    if (end == s || *end)
        fail(1, "bad hexadecimal value for", what);
    return (uint32_t)v;
}

int main(int argc, char **argv)
{
    const char *pos[3];
    int npos = 0, i;
    double music_seconds = 150.0;
    uint32_t drv_a = DEFAULT_DRIVER_START, drv_b = DEFAULT_DRIVER_END, table = DEFAULT_TABLE;
    uint32_t ptrs[4] = { 0x05A804u, 0x05B0C0u, 0x05B0CCu, 0x05E51Cu };
    uint8_t *rom;
    size_t rom_size;
    FILE *f;
    unsigned number;
    uint8_t mode, cmd, var;
    machine *m;
    int16_t *out;
    long total, n, k;
    int16_t blk[2];

    for (i = 1; i < argc; ++i) {
        if (!strcmp(argv[i], "--music-seconds") && i + 1 < argc) {
            music_seconds = atof(argv[++i]);
            if (!(music_seconds >= 1.0 && music_seconds <= 1000.0))
                fail(1, "--music-seconds must be 1..1000", NULL);
        } else if (!strcmp(argv[i], "--driver") && i + 1 < argc) {
            char *c = strchr(argv[++i], ':');
            if (!c)
                fail(1, "--driver wants A:B", NULL);
            *c = 0;
            drv_a = parse_hex(argv[i], "--driver");
            drv_b = parse_hex(c + 1, "--driver");
        } else if (!strcmp(argv[i], "--ptrs") && i + 1 < argc) {
            char *s = argv[++i];
            int k2;
            for (k2 = 0; k2 < 4; ++k2) {
                char *c = strchr(s, ',');
                if (c)
                    *c = 0;
                ptrs[k2] = parse_hex(s, "--ptrs");
                s = c ? c + 1 : s + strlen(s);
            }
        } else if (!strcmp(argv[i], "--table") && i + 1 < argc) {
            table = parse_hex(argv[++i], "--table");
        } else if (argv[i][0] == '-' && argv[i][1] == '-') {
            fail(1, "unknown option", argv[i]);
        } else if (npos < 3) {
            pos[npos++] = argv[i];
        } else {
            fail(1, "too many arguments", NULL);
        }
    }
    if (npos != 3)
        fail(1, "usage: render_audio [options] ROM NUMBER OUT.wav", NULL);
    number = parse_hex(pos[1], "NUMBER");
    if (number > 0xFFu)
        fail(1, "NUMBER must be 00..FF", NULL);

    f = fopen(pos[0], "rb");
    if (!f)
        fail(1, "cannot open the ROM", pos[0]);
    fseek(f, 0, SEEK_END);
    rom_size = (size_t)ftell(f);
    fseek(f, 0, SEEK_SET);
    rom = (uint8_t *)malloc(rom_size + 1);
    if (!rom || fread(rom, 1, rom_size, f) != rom_size)
        fail(1, "cannot read the ROM", pos[0]);
    fclose(f);
    if (drv_a >= drv_b || drv_b > rom_size || drv_b - drv_a > Z80_RAM_BYTES || table + 3u * (number + 1u) > rom_size)
        fail(1, "driver range or sound table outside the ROM", NULL);

    mode = rom[table + 3u * number];
    cmd = rom[table + 3u * number + 1u];
    var = rom[table + 3u * number + 2u];
    if (mode > 3u)
        fail(1, "this number is not a sound command table row", pos[1]);

    m = (machine *)malloc(sizeof *m);
    total = mode == 0 ? (long)(music_seconds * OUT_RATE) : (long)CAP_SECONDS * OUT_RATE;
    out = (int16_t *)malloc((size_t)total * 4u);
    if (!m || !out)
        fail(2, "out of memory", NULL);
    machine_boot(m, rom, rom_size, drv_a, drv_b, ptrs);

    for (k = 0; k < (long)LEAD_BLOCKS * BLOCK; ++k)
        next_frame(m, &blk[0], &blk[1]);
    /* the level the output sits at with nothing playing: the last frame of the idle lead */
    {
        const int idle_l = blk[0], idle_r = blk[1];
        long active = 0, first = -1, last = -1, run = 0;
        int peak = 0, capped = 0;
        uint8_t c1[3];

        if (mode == 0) {
            c1[0] = 0x05; c1[1] = var;  ring_cmd(m, c1, 2);
            c1[0] = 0x10; c1[1] = cmd;  ring_cmd(m, c1, 2);
        } else if (mode == 1) {
            c1[0] = 0x01; c1[1] = 0x0D; c1[2] = 0x00; ring_cmd(m, c1, 3);
            c1[0] = 0x02; c1[1] = 0x0D; c1[2] = cmd;  ring_cmd(m, c1, 3);
            c1[0] = 0x00; c1[1] = 0x0D; c1[2] = var;  ring_cmd(m, c1, 3);
        } else {
            c1[0] = 0x1A; c1[1] = 0x0F; c1[2] = var;  ring_cmd(m, c1, 3);
            c1[0] = 0x00; c1[1] = 0x0F; c1[2] = cmd;  ring_cmd(m, c1, 3);
        }

        for (n = 0; n < total; ++n) {
            int16_t *p = out + 2 * n;
            int dl, dr, a;
            next_frame(m, &p[0], &p[1]);
            dl = p[0] - idle_l;
            dr = p[1] - idle_r;
            a = (dl < 0 ? -dl : dl) > (dr < 0 ? -dr : dr) ? (dl < 0 ? -dl : dl) : (dr < 0 ? -dr : dr);
            if (a > peak)
                peak = a;
            if (a > SILENT_TOLERANCE) {
                ++active;
                if (first < 0)
                    first = n;
                last = n;
                run = 0;
            } else {
                ++run;
            }
            if (mode != 0 && run >= SILENT_RUN) {
                ++n;
                break;
            }
        }
        if (mode == 0) {
            /* the tune loops for ever: the last FADE_SECONDS fade out linearly */
            const long fade = (long)FADE_SECONDS * OUT_RATE;
            for (k = 0; k < total; ++k) {
                if (k > total - fade) {
                    double g = (double)(total - k) / (double)fade;
                    out[2 * k] = (int16_t)(out[2 * k] * g);
                    out[2 * k + 1] = (int16_t)(out[2 * k + 1] * g);
                }
            }
            n = total;
        } else if (n >= total && run < SILENT_RUN) {
            /* never went silent: cut at the cap with a short fade */
            for (k = total - CAP_FADE; k < total; ++k) {
                double g = (double)(total - k) / (double)CAP_FADE;
                out[2 * k] = (int16_t)(out[2 * k] * g);
                out[2 * k + 1] = (int16_t)(out[2 * k + 1] * g);
            }
            capped = 1;
        } else {
            /* keep the audible part and a short silent tail */
            long keep = last < 0 ? TAIL_SAMPLES : last + 1 + TAIL_SAMPLES;
            if (keep < n)
                n = keep;
        }
        if (!write_wav(pos[2], out, n))
            fail(2, "cannot write", pos[2]);
        printf("render_audio: number=%02X mode=%u cmd=%02X var=%02X samples=%ld seconds=%.3f active=%ld "
               "first=%ld last=%ld capped=%d peak=%d\n",
               number, (unsigned)mode, (unsigned)cmd, (unsigned)var, n, (double)n / OUT_RATE, active, first,
               last, capped, peak);
    }
    SNG_delete(m->psg);
    free(out);
    free(m);
    free(rom);
    return 0;
}

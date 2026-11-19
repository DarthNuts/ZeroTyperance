import { PyFloat, type Command, type Context, type RomFile } from "../core.js";
const NTSC_MASTER_HZ = 53693175;
const TIMER_TICK_HZ = NTSC_MASTER_HZ / (7 * 144);
const Z80_RAM_BYTES = 0x2000;
const POINTER_STORE_Z80 = 0x0aa5;
const POINTER_COUNT = 4;
const PCM_POINTER_SLOT = 3;
const HEADER_COPY_Z80 = 0x1423;
const HEADER_BYTES = 12;
const NOTE_BASE = 0x30;
const NOTE_SPAN = 0x60;
const DEFAULT_RATE_PARAM = 4;
const REFILL_BLOCK = 0x80;
const FLAG_LOOP = 0x10, FLAG_CUT_ON_RELEASE = 0x20, FLAG_UNUSED_6 = 0x40, FLAG_PACKED = 0x80, RATE_MASK = 0x0f;
const UPLOAD_SITE = 0x0c5c44, UPLOAD_SRC_OPCODE = 0x41f9, UPLOAD_END_OPCODE = 0x43f9, UPLOAD_DEST_SITE = 0x0c5c56;
const UPLOAD_DEST_WORDS = [0x43f9, 0x00a0, 0x0000];
const HANDSHAKE_SITE = 0x0c5b38, PUSH_IMM_OPCODE = 0x2f3c, CALL_OPCODE = 0x6100;
const PCM_CODE: ReadonlyArray<readonly [
    number,
    string,
    string
]> = [
    [0x0983, "fe0bca960a", "ring opcode 0x0B is dispatched to the pointer-store handler"],
    [0x0a96, "21a50a060ccdd101772310f9", "opcode 0x0B stores the next 12 ring bytes (four 24-bit pointers) at 0x0AA5"],
    [0x132e, "79d6303002c6604f06002aae0a3ab00acb21cb10cb21cb1009ce00cb21cb1009ce000e0c112314cdf901", "header index"],
    [0x1358, "ed4b291478b12006", "length word at header +6; zero length plays nothing"],
    [0x1366, "2a5604237efe04280a473a2314e6f0b0322314", "a voice rate parameter other than 4 replaces the header's rate nibble"],
    [0x137f, "3a2314e60fed44cb2fcb2f772b3625233a2314e60fed44e60377", "timer A = 1024 - (header byte 0 & 0x0F)"],
    [0x13b9, "ed4bae0a3ab00a572a24143a2614098aed4b271409ce0022fc0232fe022a291422ff02", "start"],
    [0x13e4, "3a2314cb673e0428013c", "header byte 0 bit 4 selects the looping mode"],
    [0x140e, "3a2314cb7f21000028072ab502d90eaad922c402", "header byte 0 bit 7 selects 4-bit packed data"],
    [0x02b9, "3627cb46cabb022c702d1a1826001c362a23772d08d9c9", "DAC writer"],
    [0x02ec, "cb09380817171717e6f018d01c18f9", "packed mode"],
    [0x08e6, "2ab70222b3022ac40222b502", "boot keeps copies"],
    [0x0322, "2aff02018000373fed42382e282c", "refill"],
    [0x0378, "3a0103fe05c2cc03", "after the final block"],
    [0x038a, "ed4b2b14", "looping"],
    [0x03cc, "3ec932b702", "stop"],
    [0x1714, "3a2314cb6f2007cb67c83e0618023e07320103", "key-off"],
];
class DriverError extends Error {
}
class PcmBankError extends Error {
}
const H = (v: number, w: number): string => v.toString(16).toUpperCase().padStart(w, "0");
const hx = (v: number, width = 6): string => "0x" + H(v, width);
const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const mod = (a: number, n: number): number => ((a % n) + n) % n;
function words(rom: RomFile, off: number, n: number): number[] {
    return Array.from({ length: n }, (_, i) => rom.u16be(off + 2 * i));
}
function locateDriver(rom: RomFile): [
    number,
    number
] {
    if (rom.u16be(UPLOAD_SITE) !== UPLOAD_SRC_OPCODE || rom.u16be(UPLOAD_SITE + 6) !== UPLOAD_END_OPCODE)
        throw new DriverError(`driver upload routine at ${hx(UPLOAD_SITE)}: expected two absolute address loads`);
    const w = words(rom, UPLOAD_DEST_SITE, 3);
    if (w.some((x, i) => x !== UPLOAD_DEST_WORDS[i]))
        throw new DriverError(`driver upload routine at ${hx(UPLOAD_DEST_SITE)}: the copy does not target Z80 RAM`);
    const start = rom.u32be(UPLOAD_SITE + 2), end = rom.u32be(UPLOAD_SITE + 8);
    if (!(0 < start && start < end && end <= rom.size) || end - start > Z80_RAM_BYTES)
        throw new DriverError(`driver upload range ${hx(start)}..${hx(end)} is not a blob that fits Z80 RAM`);
    return [start, end];
}
function bankPointers(rom: RomFile): number[] {
    const pushed: number[] = [];
    for (let k = 0; k < POINTER_COUNT; k++) {
        const site = HANDSHAKE_SITE + 6 * k;
        if (rom.u16be(site) !== PUSH_IMM_OPCODE)
            throw new DriverError(`bank-pointer handshake at ${hx(site)}: expected a 32-bit immediate push`);
        pushed.push(rom.u32be(site + 2));
    }
    const call = HANDSHAKE_SITE + 6 * POINTER_COUNT;
    if (rom.u16be(call) !== CALL_OPCODE)
        throw new DriverError(`bank-pointer handshake at ${hx(call)}: no call follows the pushes`);
    const ptrs = pushed.reverse();
    for (const p of ptrs)
        if (p >= Math.min(rom.size, 1 << 24))
            throw new DriverError(`bank pointer 0x${p.toString(16).toUpperCase()} is outside the ROM`);
    return ptrs;
}
function checkPcmCode(blob: Uint8Array): number[] {
    const bad: string[] = [];
    for (const [addr, hexbytes, meaning] of PCM_CODE) {
        const got = toHex(blob.subarray(addr, addr + hexbytes.length / 2));
        if (got !== hexbytes)
            bad.push(`Z80 0x${H(addr, 4)} (${meaning}): expected ${hexbytes}, found ${got || "<past the blob end>"}`);
    }
    if (bad.length)
        throw new DriverError("the sound driver's PCM code differs from what this extractor relies on:\n  " + bad.join("\n  "));
    return PCM_CODE.map((c) => c[0]);
}
const headerIndex = (note: number): number => mod(note - NOTE_BASE, NOTE_SPAN);
const noteFor = (index: number): number => mod(index + NOTE_BASE, NOTE_SPAN);
function timerAValue(n: number): number {
    const v = -n & 0xff;
    const reg24 = (v >> 2) | (v & 0x80 ? 0xc0 : 0);
    return ((reg24 & 0xff) << 2) | (v & 3);
}
const rateHz = (n: number): number => TIMER_TICK_HZ / (1024 - timerAValue(n));
const pyRound = (x: number, nd: number): number => Number(x.toFixed(nd));
const FORMAT = "ztassets-pcm/1";
const OUT_DIR = "pcm";
const SOUND_TABLE = 0x0c5eb4, SOUND_TABLE_ROW = 3, SOUND_TABLE_LEA_SITE = 0x0c616c, LEA_PC_OPCODE = 0x41fa;
const PCM_MODES = [2, 3];
const PCM_CHANNEL = 15;
const OGG_NOTE = "skipped: --no-ogg";
interface Header {
    flags: number;
    rateNibble: number;
    offset: number;
    offsetAdd: number;
    bytes: number;
    loopBytes: number;
    packed: boolean;
    loop: boolean;
    cutOnRelease: boolean;
    flag6: boolean;
    raw: Uint8Array;
    id: number;
    start: number | null;
}
function parseHeader(raw: Uint8Array): Header {
    const b0 = raw[0]!;
    return {
        flags: b0, rateNibble: b0 & RATE_MASK,
        offset: raw[1]! | (raw[2]! << 8) | (raw[3]! << 16), offsetAdd: raw[4]! | (raw[5]! << 8),
        bytes: raw[6]! | (raw[7]! << 8), loopBytes: raw[8]! | (raw[9]! << 8),
        packed: !!(b0 & FLAG_PACKED), loop: !!(b0 & FLAG_LOOP), cutOnRelease: !!(b0 & FLAG_CUT_ON_RELEASE), flag6: !!(b0 & FLAG_UNUSED_6),
        raw: raw.slice(), id: 0, start: null,
    };
}
type Row = [
    number,
    number,
    number,
    number
];
function soundTablePcmRows(rom: RomFile): Row[] {
    if (rom.u16be(SOUND_TABLE_LEA_SITE) !== LEA_PC_OPCODE)
        throw new PcmBankError(`sound dispatcher at ${hx(SOUND_TABLE_LEA_SITE)}: expected the table load`);
    const disp = rom.u16be(SOUND_TABLE_LEA_SITE + 2);
    const target = SOUND_TABLE_LEA_SITE + 2 + (disp & 0x8000 ? disp - 0x10000 : disp);
    if (target !== SOUND_TABLE)
        throw new PcmBankError(`sound dispatcher loads its table from ${hx(target)}, not ${hx(SOUND_TABLE)}`);
    const rows: Row[] = [];
    for (let sid = 0; sid < 256; sid++) {
        const [mode, note, param] = rom.bytesAt(SOUND_TABLE + SOUND_TABLE_ROW * sid, SOUND_TABLE_ROW) as unknown as [
            number,
            number,
            number
        ];
        if (mode > 3)
            break;
        if (PCM_MODES.includes(mode))
            rows.push([sid, mode, note, param]);
    }
    return rows;
}
function readBank(rom: RomFile) {
    const [drvStart, drvEnd] = locateDriver(rom);
    const sites = checkPcmCode(rom.bytesAt(drvStart, drvEnd - drvStart));
    const ptrs = bankPointers(rom);
    const base = ptrs[PCM_POINTER_SLOT]!;
    const first = parseHeader(rom.bytesAt(base, HEADER_BYTES));
    const tableBytes = first.offset + first.offsetAdd;
    if (first.bytes === 0 || tableBytes <= 0 || tableBytes % HEADER_BYTES)
        throw new PcmBankError(`header 00 at ${hx(base)}: corrupt header table?`);
    const count = tableBytes / HEADER_BYTES;
    if (count > NOTE_SPAN)
        throw new PcmBankError(`header 00 implies ${count} headers; notes reach only ${NOTE_SPAN}`);
    if (base + tableBytes > rom.size)
        throw new PcmBankError("header table runs past the ROM end");
    const headers: Header[] = [];
    let expect = base + tableBytes;
    let prev: number | null = null;
    for (let i = 0; i < count; i++) {
        const h = parseHeader(rom.bytesAt(base + HEADER_BYTES * i, HEADER_BYTES));
        h.id = i;
        if (h.bytes === 0) {
            headers.push(h);
            continue;
        }
        const start = base + h.offset + h.offsetAdd;
        if (start !== expect)
            throw new PcmBankError(`header ${H(i, 2)}: sample at ${hx(start)} ${start < expect ? "overlaps" : "leaves a gap after"} ${prev !== null ? `header ${H(prev, 2)}'s data` : "the table"} (expected ${hx(expect)})`);
        if (h.rateNibble === 0)
            throw new PcmBankError(`header ${H(i, 2)}: rate nibble 0`);
        if (h.loop && !(0 < h.loopBytes && h.loopBytes <= h.bytes))
            throw new PcmBankError(`header ${H(i, 2)}: loop length outside the sample`);
        const end = start + h.bytes;
        if (end > rom.size)
            throw new PcmBankError(`header ${H(i, 2)}: sample runs past the ROM end`);
        h.start = start;
        headers.push(h);
        expect = end;
        prev = i;
    }
    const byIndex = new Map<number, Row[]>();
    for (const r of soundTablePcmRows(rom)) {
        const idx = headerIndex(r[2]);
        if (idx >= count)
            throw new PcmBankError(`sound id ${r[0]} plays header ${H(idx, 2)}, beyond the ${count} headers`);
        if (!byIndex.has(idx))
            byIndex.set(idx, []);
        byIndex.get(idx)!.push(r);
    }
    const maxIdx = byIndex.size ? Math.max(...byIndex.keys()) : null;
    return { driver: [drvStart, drvEnd] as [
            number,
            number
        ], sites, pointers: ptrs, base, tableBytes, count, end: expect, headers, rows: byIndex, maxIndexPlayed: maxIdx };
}
function decode(data: Uint8Array, packed: boolean): Uint8Array {
    if (!packed)
        return data.slice();
    const out = new Uint8Array(data.length * 2);
    data.forEach((b, i) => { out[2 * i] = (b & 0x0f) << 4; out[2 * i + 1] = b & 0xf0; });
    return out;
}
function wavBytes(frames: Uint8Array, rate: number): Uint8Array {
    const out = new Uint8Array(44 + frames.length);
    const dv = new DataView(out.buffer);
    const tag = (o: number, s: string): void => { for (let i = 0; i < 4; i++)
        out[o + i] = s.charCodeAt(i); };
    tag(0, "RIFF");
    dv.setUint32(4, 36 + frames.length, true);
    tag(8, "WAVE");
    tag(12, "fmt ");
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true);
    dv.setUint32(28, rate, true);
    dv.setUint16(32, 1, true);
    dv.setUint16(34, 8, true);
    tag(36, "data");
    dv.setUint32(40, frames.length, true);
    out.set(frames, 44);
    return out;
}
function audibleBytesMin(n: number, loop: boolean): number | null {
    if (loop)
        return null;
    return REFILL_BLOCK * Math.max(0, Math.ceil(n / REFILL_BLOCK) - 2);
}
function run(ctx: Context): void {
    const bank = readBank(ctx.rom);
    const samples: Record<string, unknown>[] = [];
    let total = 0;
    let hdrNo = 0;
    for (const h of bank.headers) {
        ctx.progress(hdrNo++, bank.headers.length, `sample ${hdrNo} of ${bank.headers.length}`);
        const i = h.id;
        const soundIds = (bank.rows.get(i) ?? []).map(([sid, mode, , param]) => ({
            id: sid, mode, rate_param: param,
            rate_nibble: param === DEFAULT_RATE_PARAM ? h.rateNibble : ((h.flags & 0xf0) | param) & RATE_MASK,
        }));
        const e: Record<string, unknown> = {
            id: i, id_hex: hx(i, 2), note: noteFor(i), header_hex: toHex(h.raw), bytes: h.bytes, rate_nibble: h.rateNibble,
            loop: h.loop, loop_bytes: h.loopBytes, cut_on_release: h.cutOnRelease, flag6: h.flag6,
            encoding: h.packed ? "u4_packed" : "u8", sound_ids: soundIds,
        };
        if (h.start === null) {
            Object.assign(e, { empty: true, rom_offset: null, frames: 0, rate_hz: null, wav_rate_hz: null, duration_s: 0, audible_bytes_min: null, wav: null, ogg: null });
            samples.push(e);
            continue;
        }
        const frames = decode(ctx.rom.bytesAt(h.start, h.bytes), h.packed);
        const rate = rateHz(h.rateNibble);
        const wavRate = Math.round(rate);
        const name = H(i, 2);
        Object.assign(e, {
            empty: false, rom_offset: hx(h.start), frames: frames.length, rate_hz: new PyFloat(pyRound(rate, 3)), wav_rate_hz: wavRate,
            duration_s: new PyFloat(pyRound(frames.length / rate, 4)), audible_bytes_min: audibleBytesMin(h.bytes, h.loop),
            wav: name + ".wav", ogg: null,
        });
        ctx.writeBytes(`${OUT_DIR}/${name}.wav`, wavBytes(frames, wavRate), { id: i, rate_hz: wavRate });
        total += h.bytes;
        samples.push(e);
    }
    const written = samples.filter((s) => !s.empty);
    const rates = [...new Set(written.map((s) => (s.rate_hz as PyFloat).value))].sort((a, b) => a - b);
    const [drvStart, drvEnd] = bank.driver;
    const index = {
        format: FORMAT,
        bank_rom_offset: hx(bank.base), bank_end_rom_offset: hx(bank.end), header_table_rom_offset: hx(bank.base),
        header_table_bytes: bank.tableBytes, header_bytes: HEADER_BYTES, header_count: bank.count,
        data_rom_offset: hx(bank.base + bank.tableBytes), sample_bytes_total: total,
        rate_hz_range: [new PyFloat(rates[0]!), new PyFloat(rates[rates.length - 1]!)],
        driver: {
            rom_offset: hx(drvStart), bytes: drvEnd - drvStart, bank_pointers: bank.pointers.map((p) => hx(p)),
            pcm_pointer_slot: PCM_POINTER_SLOT, pointer_store_z80: hx(POINTER_STORE_Z80, 4), header_copy_z80: hx(HEADER_COPY_Z80, 4),
            verified_z80_sites: bank.sites.map((a) => hx(a, 4)),
        },
        selection: {
            note_base: NOTE_BASE, note_span: NOTE_SPAN,
            rule: "a note-on with note byte N on the PCM channel plays header (N - 0x30) mod 0x60",
            channel: PCM_CHANNEL, sound_table_rom_offset: hx(SOUND_TABLE), sound_table_pcm_modes: PCM_MODES.slice(),
            default_rate_param: DEFAULT_RATE_PARAM, highest_header_played: bank.maxIndexPlayed,
        },
        clock: {
            region: "NTSC", master_hz: NTSC_MASTER_HZ, timer_tick_hz: new PyFloat(pyRound(TIMER_TICK_HZ, 3)),
            rule: "rate_hz = timer_tick_hz / rate_nibble (timer A loaded with 1024 - rate_nibble)",
        },
        header_layout: [
            "byte 0: low nibble = rate; bit 4 loop; bit 5 cut at the next refill on key-off; bit 6 never read by the driver; bit 7 4-bit packed data",
            "bytes 1-3: 24-bit offset from the table start, low byte first",
            "bytes 4-5: 16-bit offset added to it, low byte first",
            "bytes 6-7: length in bytes, low byte first (0: empty, the driver plays nothing)",
            "bytes 8-9: loop length in bytes counted back from the end (looping samples only)",
            "bytes 10-11: never read by the driver",
        ],
        ogg: { codec: null, quality: null, ffmpeg: null, note: OGG_NOTE },
        notes: [
            "WAV frames are the bytes the driver writes to the YM2612 DAC (unsigned, 0x80 = silence); every header of this ROM is 8-bit (bit 7 clear), none is 4-bit packed",
            "rates are NTSC; on a PAL console every rate is master 53203424 / 53693175 of it",
            "one-shot samples: the driver stops when it fetches the block holding the last byte, so only audible_bytes_min = 128 * (blocks - 2) bytes are sure to be heard",
            "sound_ids lists the 68000 sound command ids that play the header; rate_nibble there is the effective one (a rate parameter other than 4 replaces the header's)",
        ],
        samples,
    };
    ctx.writeJson(`${OUT_DIR}/index.json`, index, { set: "index", ogg: OGG_NOTE });
    ctx.say(`pcm: bank ${index.bank_rom_offset}..${index.bank_end_rom_offset}, ${bank.count} headers (${bank.count - written.length} empty), ${total} bytes of samples, ${written.length} WAV (OGG ${OGG_NOTE})`);
}
export const pcm: Command = { name: "pcm", run: (ctx) => run(ctx) };

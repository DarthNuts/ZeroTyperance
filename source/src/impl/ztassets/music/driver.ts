import type { RomFile } from "../core.js";
export const DRIVER_ROM = 0x058f78;
export const DRIVER_SIZE = 6284;
export const BANK_INSTRUMENTS = 0x05a804;
export const BANK_MACROS = 0x05b0c0;
export const BANK_TRACKS = 0x05b0cc;
export const BANK_PCM = 0x05e51c;
export const MUSIC_DATA_END = BANK_PCM;
export const INSTRUMENT_BANK_END = BANK_MACROS;
export const INSTRUMENT_BYTES = 39;
export const MACRO_COPY_BYTES = 32;
export const TRACK_HEADER_COPY = 33;
export const PCM_HEADER_BYTES = 12;
export const MAX_CHANNELS = 16;
export const LOOP_SLOTS = 4;
export const MACRO_SLOTS = 4;
export const SOUND_TABLE = 0x0c5eb4;
export const SOUND_TABLE_ENTRIES = 162;
export const SFX_CHANNELS: readonly [
    number,
    number
] = [13, 14];
export const PCM_CHANNEL = 15;
export const BOOT_PCM_INSTRUMENT = 18;
export const DEFAULT_RATE = 0x00cc;
export const RATE_MUL = 0xda;
export const TEMPO_OPCODE_BIAS = 40;
export const PSG_NOTE_BASE = 0x21;
export const PCM_NOTE_BASE = 0x30;
export const NOTE_LIMIT = 0x60;
export const INFINITE_LOOP = 0x7f;
export const MIDI_NOTE_OFFSET = 12;
export const FM_CLOCK = 53693175 / 7.0;
export const PSG_CLOCK = 53693175 / 15.0;
export const INSTRUMENT_TYPES: Record<number, string> = { 0: "fm", 1: "pcm", 2: "psg", 3: "psg_noise" };
export const SIGNATURES: ReadonlyArray<readonly [
    number,
    string,
    string
]> = [
    [0x04bf, "CB7FCA4705CB77283F", "bit 7 clear = command; C0-FF delta / 80-BF gate VLQ classes"],
    [0x0547, "FE603025", "00-5F are notes, 60 and up go to the opcode dispatch"],
    [0x0570, "D660CA0606", "opcode dispatch starts at 60 (end)"],
    [0x05bd, "C3BC04", "opcodes 73-7F fall back into the parse loop"],
    [0x0662, "FE7F", "loop count 7F loops forever"],
    [0x068b, "CDEF03C628CD1D0E", "opcode 68: tempo = argument + 40"],
    [0x0e1d, "11DA00CD5B11", "tempo rate = bpm x 0xDA x 2 >> 8"],
    [0x08be, "CC00", "initial tempo rate 0x00CC"],
    [0x0be9, "2AAB0A", "tracks are read from the third registered bank"],
    [0x1742, "2AA50A", "instruments are read from the first registered bank"],
    [0x0e6f, "2AA80A", "pitch macros are read from the second registered bank"],
    [0x1338, "2AAE0A", "PCM headers are read from the fourth registered bank"],
    [0x1760, "0E27", "an instrument record is 39 bytes"],
    [0x0c2d, "DD360611", "a started channel is active + running"],
    [0x10c5, "7982FE6038", "notes are clamped below 0x60"],
    [0x1104, "D621", "PSG note 0x21 is the first period-table entry"],
    [0x132e, "79D630", "PCM sample index = note - 0x30"],
    [0x0a96, "21A50A060C", "ring 0B stores 12 bytes of bank pointers at Z80 0x0AA5"],
];
export const FM_FNUM_TABLE_Z80 = 0x116a;
export const PSG_PERIOD_TABLE_Z80 = 0x1184;
export const FM_PATCH_TABLE_Z80 = 0x161e;
export const FM_CARRIER_TABLE_Z80 = 0x15c8;
export const OPCODES: Record<number, readonly [
    string,
    number,
    boolean | null,
    number
]> = {
    0x60: ["end", 0, null, 0x0606],
    0x61: ["instrument", 1, true, 0x0613],
    0x62: ["pitch_macro", 1, true, 0x05c0],
    0x63: ["rest", 0, true, 0x055b],
    0x64: ["loop_start", 1, false, 0x0621],
    0x65: ["loop_end", 0, false, 0x064c],
    0x66: ["retrigger_flag", 1, true, 0x05dd],
    0x67: ["voice_rotate_flag", 1, true, 0x05f2],
    0x68: ["tempo", 1, true, 0x068b],
    0x69: ["mute_channel", 1, true, 0x0696],
    0x6a: ["priority", 1, true, 0x06d3],
    0x6b: ["start_track", 1, true, 0x06dc],
    0x6c: ["pitch_offset", 2, true, 0x06eb],
    0x6d: ["frame_clock", 0, true, 0x070c],
    0x6e: ["pcm_rate", 1, true, 0x0713],
    0x6f: ["jump", 2, false, 0x0725],
    0x70: ["status_set", 2, true, 0x074b],
    0x71: ["status_branch", 4, false, 0x0752],
    0x72: ["control", 2, true, 0x07a6],
};
export const NOP_FIRST = 0x73, NOP_LAST = 0x7f;
export const isNop = (b: number): boolean => b >= NOP_FIRST && b <= NOP_LAST;
export const CONTROL_SUBS: Record<number, string> = {
    0: "stop_track", 1: "pause_track", 2: "resume_all", 3: "pause_track_status0", 4: "global_attenuation", 5: "channel_attenuation",
};
export const BRANCH_TESTS: Record<number, string> = { 1: "v == s", 2: "v >= s", 3: "v > s", 4: "v <= s", 5: "v < s" };
export const RING_OPCODES: Record<number, readonly [
    string,
    number,
    number
]> = {
    0x00: ["note_on ch,note", 2, 0x09d6],
    0x01: ["key_off ch,note", 2, 0x09ea],
    0x02: ["instrument ch,i", 2, 0x09f8],
    0x03: ["reload_instrument i", 1, 0x09fe],
    0x04: ["pitch_offset ch,f,c", 3, 0x0a07],
    0x05: ["tempo bpm", 1, 0x0a4b],
    0x06: ["pitch_macro ch,m", 2, 0x0a54],
    0x07: ["retrigger_flag ch,f", 2, 0x0a6d],
    0x0b: ["banks 4 x u24le", 12, 0x0a96],
    0x0c: ["pause_all", 0, 0x0ab1],
    0x0d: ["resume_all", 0, 0x0ac9],
    0x0e: ["voice_rotate_flag ch,f", 2, 0x0acf],
    0x10: ["play_track t", 1, 0x0a84],
    0x12: ["stop_track t (FF = all)", 1, 0x0a8d],
    0x14: ["priority ch,p", 2, 0x0ae6],
    0x16: ["stop_all", 0, 0x0af2],
    0x17: ["mute track,ch,flag", 3, 0x0b12],
    0x1a: ["pcm_rate ch,v", 2, 0x0b4f],
    0x1b: ["status_set i,v", 2, 0x0b64],
    0x1c: ["protect ch", 1, 0x0b75],
    0x1d: ["unprotect ch", 1, 0x0b7f],
    0x1e: ["pitch_offset track,ch,f,c", 4, 0x0a10],
    0x1f: ["attenuation ch,a", 2, 0x0ba8],
    0x20: ["global_attenuation a", 1, 0x0bb4],
};
export class DriverMismatch extends Error {
}
const hex4 = (n: number): string => n.toString(16).toUpperCase().padStart(4, "0");
const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export function z80(rom: RomFile, addr: number, n: number): Uint8Array {
    if (addr < 0 || addr + n > DRIVER_SIZE)
        throw new RangeError(`Z80 range 0x${hex4(addr)}+${n} is outside the driver blob`);
    return rom.bytesAt(DRIVER_ROM + addr, n);
}
const le16 = (b: Uint8Array, i: number): number => b[i]! | (b[i + 1]! << 8);
export function verify(rom: RomFile): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    for (const [addr, want, rule] of SIGNATURES) {
        const got = toHex(z80(rom, addr, want.length >> 1)).toUpperCase();
        if (got !== want)
            throw new DriverMismatch(`driver code at Z80 0x${hex4(addr)} is ${got}, expected ${want} (${rule})`);
        out.push({ z80: `0x${hex4(addr)}`, bytes: want, rule });
    }
    return out;
}
export function fmFnumTable(rom: RomFile): number[] {
    const b = z80(rom, FM_FNUM_TABLE_Z80, 26);
    return Array.from({ length: 13 }, (_, i) => le16(b, 2 * i));
}
export function psgPeriodTable(rom: RomFile): number[] {
    const b = z80(rom, PSG_PERIOD_TABLE_Z80, 128);
    return Array.from({ length: 64 }, (_, i) => le16(b, 2 * i));
}
export function fmPatchTable(rom: RomFile): Array<[
    number,
    number | null,
    boolean
]> {
    const out: Array<[
        number,
        number | null,
        boolean
    ]> = [];
    let a = FM_PATCH_TABLE_Z80;
    for (;;) {
        const reg = z80(rom, a, 1)[0]!;
        if (reg === 0)
            return out;
        const v = z80(rom, a + 1, 1)[0]!;
        out.push([reg, v === 0 ? null : (v & 0x7f) + 1, (v & 0x80) !== 0]);
        a += 2;
        if (a - FM_PATCH_TABLE_Z80 > 128)
            throw new DriverMismatch(`FM patch-write table at Z80 0x${hex4(FM_PATCH_TABLE_Z80)} is not terminated`);
    }
}
export function fmCarrierTable(rom: RomFile): number[] {
    return Array.from(z80(rom, FM_CARRIER_TABLE_Z80, 8));
}
export function tempoRate(bpm: number): number {
    return ((bpm & 0xff) * RATE_MUL * 2) >> 8;
}
export function midiNote(note: number): number {
    return note + MIDI_NOTE_OFFSET;
}
export function fmFrequency(fnumTable: number[], note: number): number {
    const n = Math.max(0, Math.min(note, NOTE_LIMIT - 1));
    const block = Math.floor(n / 12), semi = n % 12;
    return fnumTable[semi]! * (FM_CLOCK / 144.0) * 2.0 ** (block - 1) / (1 << 20);
}
export function psgFrequency(periodTable: number[], note: number): number {
    const n = Math.max(PSG_NOTE_BASE, Math.min(note, NOTE_LIMIT - 1));
    return PSG_CLOCK / (32.0 * periodTable[n - PSG_NOTE_BASE]!);
}

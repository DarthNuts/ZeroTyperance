import type { RomFile } from "../core.js";
import * as D from "../music/driver.js";
import * as IR from "../music/ir.js";
export type Dict = Record<string, any>;
type Table = Array<[
    number,
    number | null,
    boolean
]>;
export const PATCH_FORMAT = "ztassets-patch/1";
export const RECORD_BYTES = D.INSTRUMENT_BYTES;
export const SIGNATURES: ReadonlyArray<readonly [
    number,
    string,
    string
]> = [
    [0x1431, "232356CB7228", "FM key-on reads byte 2 (mode); bit 6 selects the FM-3-only voice table"],
    [0x1485, "DD2A5604DD23", "IX = instrument slot + 1, so (IX+d) is record byte d+1"],
    [0x148f, "FD210040FE02201EDD7E01F615D947D9DD7E01F605672E27", "on FM channel 3, reg 27 = byte 2 OR 0x05"],
    [0x14c1, "DD6600CB5C28102E22", "reg 22 = byte 1, only when its bit 3 is set"],
    [0x14d8, "C521C8150600DD7E02E6074F097E32D0152640011E16CDD215",
        "carrier mask = table 0x15C8[byte 3 & 7]; patch table 0x161E written by 0x15D2"],
    [0x15a8, "DD7E24CB27CB27CB27CB27C1B1FD2100407FFDCB007E20FAFD360028FD7701C9",
        "reg 28 = (byte 37 << 4) | channel: key-on operator mask"],
    [0x15c8, "080808080A0E0E0F", "carrier operator mask per algorithm"],
    [0x15d2, "0AB7C8032E00CB7E20FC6A83772C0AB7CA1916F21316E67FE521D015CB1ED21216D532FB15" +
            "3E7FDD9600F5CB275F16003A0712CD5B11F194673E7F94D1E11807E1321816DD7E007703C3D215",
        "table walk: reg + channel; value 0 -> 0, v -> byte v+1, v | 0x80 -> carrier-scaled TL"],
    [0x12c0, "DD7E00FD771CDD7E01FD7708DD7E02CB27CB27CB27CB27FD7710DD7E03CB27CB27CB27CB27" +
            "FD7724DD7E04FD770CDD7E05FD7714FDCB00C6C9",
        "PSG key-on: bytes 1..6 -> noise control, attack, sustain << 4, peak << 4, decay, release"],
    [0x00d8, "FD362801FD7E04FD4624FD9608380D280BB838082806FD7704C35C01FD7004FD361802", "PSG attack: L -= attack step until <= peak"],
    [0x0103, "FD362801FD7E04FD4610B8380C2817FD960C3812B8380F1808FD860C3808B83005FD7704",
        "PSG decay: L moves toward the sustain level by the decay step"],
    [0x0136, "FD362801FD7E04FD86143805FD77041815FD3604FFFD361800", "PSG release: L += release step until it passes FF"],
    [0x0177, "FD7E04CB3FCB3FCB3FCB3FF69077", "PSG attenuation written = L >> 4"],
];
export const CHANNEL_REGS: ReadonlyArray<readonly [
    number,
    number
]> = [[0xb0, 3], [0xb4, 4]];
export const OP_OFFSETS = [0x00, 0x04, 0x08, 0x0c];
export const OP_FIRST_BYTE: Record<number, number> = { 0x00: 5, 0x04: 11, 0x08: 17, 0x0c: 23 };
export const SLOT_OF_OFFSET: Record<number, number> = { 0x00: 1, 0x04: 3, 0x08: 2, 0x0c: 4 };
export const OP_FIELD_REGS = [0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90];
export const OP_WRITE_ORDER = [0x00, 0x08, 0x04, 0x0c];
export const FM_RESERVED: Record<number, number> = { 3: 0xc0, 4: 0x08, 37: 0xf0 };
for (const b of Object.values(OP_FIRST_BYTE)) {
    Object.assign(FM_RESERVED, { [b]: 0x80, [b + 1]: 0x80, [b + 2]: 0x20, [b + 3]: 0x60, [b + 4]: 0xe0 });
}
export const FM_BYTE_NAMES: Record<number, string> = { 0: "type", 1: "LFO", 2: "mode", 3: "FB/ALG", 4: "pan/AMS/FMS", 37: "key-on mask" };
for (const o of OP_OFFSETS) {
    const b = OP_FIRST_BYTE[o]!;
    ["DT/MUL", "TL", "RS/AR", "AM/D1R", "D2R", "SL/RR"].forEach((n, k) => { FM_BYTE_NAMES[b + k] = `operator S${SLOT_OF_OFFSET[o]} ${n}`; });
}
export const PSG_LEVEL_BYTES = [3, 4];
export const PCM_RATE_DEFAULT = 4;
export class PatchBankError extends Error {
}
export const hx = (v: number): string => "0x" + v.toString(16).toUpperCase().padStart(6, "0");
export const bytesHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const sortNum = (a: number[]): number[] => a.sort((x, y) => x - y);
export function verify(rom: RomFile): Array<Record<string, unknown>> {
    const out = D.verify(rom);
    for (const [addr, want, rule] of SIGNATURES) {
        const got = bytesHex(D.z80(rom, addr, want.length >> 1)).toUpperCase();
        if (got !== want)
            throw new D.DriverMismatch(`driver code at Z80 0x${addr.toString(16).toUpperCase().padStart(4, "0")} is ${got}, expected ${want} (${rule})`);
        out.push({ z80: "0x" + addr.toString(16).toUpperCase().padStart(4, "0"), bytes: want, rule });
    }
    return out;
}
export function patchTable(rom: RomFile): Table {
    const table = D.fmPatchTable(rom);
    const want: Table = CHANNEL_REGS.map(([r, b]): [
        number,
        number | null,
        boolean
    ] => [r, b, false]);
    for (const off of OP_WRITE_ORDER) {
        const first = OP_FIRST_BYTE[off]!;
        OP_FIELD_REGS.forEach((reg, k) => want.push([reg + off, reg === 0x90 ? null : first + k, reg === 0x40]));
    }
    if (JSON.stringify(table) !== JSON.stringify(want)) {
        throw new D.DriverMismatch(`the FM patch-write table at Z80 0x${D.FM_PATCH_TABLE_Z80.toString(16)} is ${JSON.stringify(table)}, expected ${JSON.stringify(want)}`);
    }
    return table;
}
export function carrierBits(table: Table): Record<number, number> {
    const tl = table.filter(([, , t]) => t).map(([reg]) => reg & 0x0c);
    const out: Record<number, number> = {};
    tl.forEach((off, k) => { out[off] = k; });
    return out;
}
function fail(i: number, off: number, msg: string): never {
    throw new PatchBankError(`instrument record ${i} (ROM ${hx(off)}): ${msg}`);
}
const h2 = (v: number): string => "0x" + v.toString(16).toUpperCase().padStart(2, "0");
export function checkRecord(i: number, off: number, rec: Uint8Array): void {
    const t = rec[0]!;
    if (!(t in D.INSTRUMENT_TYPES))
        fail(i, off, `type byte ${t} is not one of ${Object.keys(D.INSTRUMENT_TYPES)}`);
    if (t === 0) {
        for (const b of Object.keys(FM_RESERVED).map(Number).sort((a, c) => a - c)) {
            if (rec[b]! & FM_RESERVED[b]!)
                fail(i, off, `byte ${b} (${FM_BYTE_NAMES[b]}) = ${h2(rec[b]!)} sets bits ${h2(rec[b]! & FM_RESERVED[b]!)} that the driver's register layout leaves at zero`);
        }
        if ((rec[37]! & 15) === 0)
            fail(i, off, "byte 37 (key-on mask) keys no operator");
    }
    else if (t === 2 || t === 3) {
        if (rec[1]! & 0xf8)
            fail(i, off, `byte 1 (noise control) = ${h2(rec[1]!)} has bits above the 3-bit noise register`);
        for (const b of PSG_LEVEL_BYTES) {
            if (rec[b]! & 0xf0)
                fail(i, off, `byte ${b} (${b === 3 ? "sustain" : "peak"} level) = ${h2(rec[b]!)}: the driver shifts the high nibble out`);
        }
    }
    else if (t === 1) {
        if (rec[1]! & 0xf0)
            fail(i, off, `byte 1 (rate code) = ${h2(rec[1]!)} is not a 4-bit timer code`);
    }
}
export function readRecords(rom: RomFile): Array<[
    number,
    number,
    Uint8Array
]> {
    const recs = IR.instrumentRecords(rom);
    const tableEnd = D.BANK_INSTRUMENTS + 2 * recs.length;
    for (const [i, off, rec] of recs) {
        if (!(tableEnd <= off && off < D.INSTRUMENT_BANK_END))
            fail(i, off, `offset points outside the bank 0x${tableEnd.toString(16)}..0x${D.INSTRUMENT_BANK_END.toString(16)}`);
        if (rec[0] === 0 && off + RECORD_BYTES > D.INSTRUMENT_BANK_END)
            fail(i, off, `an FM record runs past the bank end 0x${D.INSTRUMENT_BANK_END.toString(16)}`);
        checkRecord(i, off, rec);
    }
    return recs;
}
export function fmParams(rec: Uint8Array, cbits: Record<number, number>): Dict {
    const ops: Dict[] = [];
    for (const off of OP_OFFSETS) {
        const b = OP_FIRST_BYTE[off]!;
        const [dtmul, tl, rsar, amd1r, d2r, slrr] = [rec[b]!, rec[b + 1]!, rec[b + 2]!, rec[b + 3]!, rec[b + 4]!, rec[b + 5]!];
        ops.push({
            register_offset: off, slot: SLOT_OF_OFFSET[off],
            MUL: dtmul & 15, DT: (dtmul >> 4) & 7, TL: tl & 0x7f,
            RS: rsar >> 6, AR: rsar & 31, AM: amd1r >> 7, D1R: amd1r & 31,
            D2R: d2r & 31, SL: slrr >> 4, RR: slrr & 15, SSG: 0,
            carrier_bit: cbits[off],
        });
    }
    return {
        ALG: rec[3]! & 7, FB: (rec[3]! >> 3) & 7, PAN_L: rec[4]! >> 7, PAN_R: (rec[4]! >> 6) & 1,
        AMS: (rec[4]! >> 4) & 3, FMS: rec[4]! & 7, operators: ops,
    };
}
export function opRegisterValues(op: Dict): Record<number, number> {
    return {
        0x30: (op.DT << 4) | op.MUL, 0x40: op.TL, 0x50: (op.RS << 6) | op.AR, 0x60: (op.AM << 7) | op.D1R,
        0x70: op.D2R, 0x80: (op.SL << 4) | op.RR, 0x90: op.SSG,
    };
}
export function registersFromParams(params: Dict, table: Table): number[][] {
    const chan: Record<number, number> = {
        0xb0: (params.FB << 3) | params.ALG,
        0xb4: (params.PAN_L << 7) | (params.PAN_R << 6) | (params.AMS << 4) | params.FMS,
    };
    const byOff: Record<number, Record<number, number>> = {};
    for (const op of params.operators as Dict[])
        byOff[op.register_offset] = opRegisterValues(op);
    return table.map(([reg]) => [reg, reg in chan ? chan[reg]! : byOff[reg & 0x0c]![reg & 0xf0]!]);
}
function simEnvelope(atk: number, peak: number, dec: number, sus: number, rel: number, limit = 2048): [
    number[],
    number[] | null,
    boolean
] {
    let level = 0xff, state = 1;
    const on: number[] = [];
    while (state !== 3) {
        if (on.length >= limit)
            return [on, null, true];
        if (state === 1) {
            const a = level - atk;
            if (a <= peak) {
                level = peak;
                state = 2;
            }
            else
                level = a;
        }
        else if (level < sus) {
            const a = level + dec;
            if (a > 0xff || a >= sus) {
                level = sus;
                state = 3;
            }
            else
                level = a;
        }
        else if (level === sus) {
            state = 3;
        }
        else {
            const a = level - dec;
            if (a < 0 || a < sus) {
                level = sus;
                state = 3;
            }
            else
                level = a;
        }
        on.push(level >> 4);
    }
    const off: number[] = [];
    for (;;) {
        if (off.length >= limit)
            return [on, off, true];
        const a = level + rel;
        if (a > 0xff) {
            off.push(15);
            break;
        }
        level = a;
        off.push(level >> 4);
    }
    return [on, off, false];
}
export function psgDoc(rec: Uint8Array): Dict {
    const atk = rec[2]!, peak = (rec[4]! << 4) & 0xff, dec = rec[5]!, rel = rec[6]!;
    const sus = (rec[3]! << 4) & 0xff;
    const [on, off, capped] = simEnvelope(atk, peak, dec, sus, rel);
    const ctrl = rec[1]!;
    return {
        noise: { control: ctrl, white: Boolean(ctrl & 4), shift_rate: ctrl & 3, clock: (ctrl & 3) === 3 ? "tone3" : `N/${512 << (ctrl & 3)}` },
        envelope: {
            attack_step: atk, peak_attenuation: rec[4]! & 15, decay_step: dec, sustain_attenuation: rec[3]! & 15, release_step: rel,
            unit: "level steps of 1/16 attenuation step (2 dB / 16) per 60 Hz frame",
        },
        attenuation_per_frame: { key_on_to_sustain: on, sustain: sus >> 4, key_off_to_silence: off, capped },
    };
}
export interface Bank {
    table: Table;
    carrier_bits: Record<number, number>;
    carriers: number[];
    records: Array<[
        number,
        number,
        Uint8Array
    ]>;
    docs: Map<number, Dict>;
}
export function decodeBank(rom: RomFile): Bank {
    const table = patchTable(rom);
    const cbits = carrierBits(table);
    const recs = readRecords(rom);
    const carriers = D.fmCarrierTable(rom);
    const docs = new Map<number, Dict>();
    for (const [i, off, rec] of recs) {
        const t = rec[0]!;
        const doc: Dict = { format: PATCH_FORMAT, index: i, type: D.INSTRUMENT_TYPES[t], rom_offset: hx(off), raw: bytesHex(rec) };
        if (t === 0) {
            const params = fmParams(rec, cbits);
            const mask = carriers[params.ALG]!;
            for (const op of params.operators as Dict[])
                op.carrier = Boolean((mask >> op.carrier_bit) & 1);
            const regs = registersFromParams(params, table);
            Object.assign(doc, {
                params, registers: regs,
                key_on_mask: rec[37]! & 15,
                key_on_slots: [1, 2, 3, 4].filter((n) => (rec[37]! >> (n - 1)) & 1),
                key_on_register: [0x28, (rec[37]! & 15) << 4],
                carrier_tl_registers: table.filter(([r, , isTl]) => isTl && ((mask >> cbits[r & 0x0c]!) & 1)).map(([r]) => r),
                lfo: rec[1], mode: rec[2], ch3_special: Boolean(rec[2]! & 0x40),
                conditional_writes: [
                    { register: 0x22, value: rec[1], written: Boolean(rec[1]! & 8), rule: "written before the patch only when byte 1 bit 3 (LFO enable) is set" },
                    { register: 0x27, value: rec[2]! | 0x05, written: null, rule: "written before the patch only when the voice is FM channel 3" },
                ],
                ch3_frequency_bytes: bytesHex(rec.subarray(29, 37)),
                meaningful_bytes: 38,
            });
        }
        else if (t === 1) {
            Object.assign(doc, {
                rate_override: rec[1], rate_override_active: rec[1] !== PCM_RATE_DEFAULT, meaningful_bytes: 2,
                samples: {
                    header_table_rom_offset: hx(D.BANK_PCM), header_bytes: D.PCM_HEADER_BYTES, note_base: D.PCM_NOTE_BASE,
                    rule: "a note n plays PCM header (n - 0x30) mod 0x60", exported_by: "ztassets pcm (pcm/index.json, pcm/XX.wav)",
                },
            });
        }
        else {
            Object.assign(doc, psgDoc(rec));
            doc.meaningful_bytes = 7;
        }
        docs.set(i, doc);
    }
    return { table, carrier_bits: cbits, carriers, records: recs, docs };
}
export { sortNum };

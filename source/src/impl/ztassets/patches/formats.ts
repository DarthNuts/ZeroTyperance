type Dict = Record<string, any>;
export const OPM_HEADER = "//MiOPMdrv sound bank Paramer Ver2002.04.22\n" +
    "//LFO: LFRQ AMD PMD WF NFRQ\n" +
    "//@:[Num] [Name]\n" +
    "//CH: PAN\tFL CON AMS PMS SLOT NE\n" +
    "//[OPname]: AR D1R D2R\tRR D1L\tTL\tKS MUL DT1 DT2 AMS-EN\n";
export const OPM_OPS: ReadonlyArray<readonly [
    string,
    number
]> = [["M1", 0x00], ["C1", 0x08], ["M2", 0x04], ["C2", 0x0c]];
export const OPM_SLOT_BIT: Record<number, number> = { 1: 8, 2: 16, 3: 32, 4: 64 };
const DMP_VERSION = 11, DMP_SYSTEM_GENESIS = 0x02, DMP_MODE_FM = 1;
export function dtSigned(reg: number): number {
    return reg & 4 ? -(reg & 3) : reg & 3;
}
export const dtToCentered = (reg: number): number => 3 + dtSigned(reg);
function ops(params: Dict): Dict[] {
    const by: Record<number, Dict> = {};
    for (const op of params.operators as Dict[])
        by[op.register_offset] = op;
    return [0x00, 0x04, 0x08, 0x0c].map((o) => by[o]!);
}
export function tfiBytes(params: Dict): Uint8Array {
    const out = [params.ALG, params.FB];
    for (const op of ops(params)) {
        out.push(op.MUL, dtToCentered(op.DT), op.TL, op.RS, op.AR, op.D1R, op.D2R, op.RR, op.SL, op.SSG);
    }
    return Uint8Array.from(out);
}
export function dmpBytes(params: Dict): Uint8Array {
    const out = [DMP_VERSION, DMP_SYSTEM_GENESIS, DMP_MODE_FM, params.FMS, params.FB, params.ALG, params.AMS];
    for (const op of ops(params)) {
        out.push(op.MUL, op.TL, op.AR, op.D1R, op.SL, op.RR, op.AM, op.RS, dtToCentered(op.DT), op.D2R, op.SSG);
    }
    return Uint8Array.from(out);
}
const d3 = (v: number): string => String(v).padStart(3, " ");
export function opmPatchText(num: number, name: string, params: Dict, keyOnSlots: number[]): string {
    const byOff: Record<number, Dict> = {};
    for (const op of params.operators as Dict[])
        byOff[op.register_offset] = op;
    const pan = 64 * params.PAN_L + 128 * params.PAN_R;
    const slot = keyOnSlots.reduce((s, n) => s + OPM_SLOT_BIT[n]!, 0);
    const lines = [
        `@:${num} ${name}`,
        `LFO: ${[0, 0, 0, 0, 0].map(d3).join(" ")}`,
        `CH: ${[pan, params.FB, params.ALG, params.AMS, params.FMS, slot, 0].map(d3).join(" ")}`,
    ];
    for (const [label, off] of OPM_OPS) {
        const op = byOff[off]!;
        lines.push(`${label}: ` + [op.AR, op.D1R, op.D2R, op.RR, op.SL, op.TL, op.RS, op.MUL, op.DT, 0, op.AM ? 128 : 0].map(d3).join(" "));
    }
    return lines.join("\n") + "\n";
}
export function opmBankText(patches: Array<[
    number,
    string,
    Dict,
    number[]
]>): string {
    return OPM_HEADER + patches.map((p) => "\n" + opmPatchText(...p)).join("");
}
export function lossyFields(params: Dict, keyOnMask: number): {
    tfi: string[];
    dmp: string[];
    opm: string[];
} {
    const minusZero = (params.operators as Dict[]).filter((op) => op.DT === 4).map((op) => op.slot);
    const am = (params.operators as Dict[]).some((op) => op.AM);
    const tfi: string[] = [], dmp: string[] = [];
    if (am)
        tfi.push("AM");
    if (params.AMS || params.FMS)
        tfi.push("AMS/FMS");
    if (!(params.PAN_L && params.PAN_R)) {
        tfi.push("pan");
        dmp.push("pan");
    }
    if (keyOnMask !== 15) {
        tfi.push("key-on mask");
        dmp.push("key-on mask");
    }
    if (minusZero.length) {
        const note = `detune 4 (minus zero) on S${minusZero.join(",")} reads back as 0`;
        tfi.push(note);
        dmp.push(note);
    }
    return { tfi, dmp, opm: [] };
}

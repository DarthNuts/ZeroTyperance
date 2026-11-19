export interface TrigTable {
    readonly sin256: readonly number[];
    readonly neg_cos256: readonly number[];
}
export const TRIG_DATA_FORMAT = "zt-data/1";
export const TRIG_DATA_NAME = "trig_table";
interface TrigDoc {
    format?: unknown;
    name?: unknown;
    data?: {
        angle_units_per_turn?: unknown;
        sin256?: unknown;
        neg_cos256?: unknown;
    };
}
function isWordList(v: unknown, n: number): v is number[] {
    return Array.isArray(v) && v.length === n && v.every((x) => typeof x === "number" && Number.isInteger(x) && x >= -32768 && x <= 32767);
}
export function trigFrom(doc: unknown, angles: number): TrigTable {
    const d = doc as TrigDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("trig_table.json: not an object");
    if (d.format !== TRIG_DATA_FORMAT)
        throw new Error(`trig_table.json: format ${String(d.format)}, expected ${TRIG_DATA_FORMAT}`);
    if (d.name !== TRIG_DATA_NAME)
        throw new Error(`trig_table.json: name ${String(d.name)}, expected ${TRIG_DATA_NAME}`);
    const data = d.data;
    if (!data || typeof data !== "object")
        throw new Error("trig_table.json: no data");
    if (data.angle_units_per_turn !== angles)
        throw new Error(`trig_table.json: ${String(data.angle_units_per_turn)} angle units per turn, the spec says ${angles}`);
    if (!isWordList(data.sin256, angles))
        throw new Error(`trig_table.json: sin256 is not a list of ${angles} signed words`);
    if (!isWordList(data.neg_cos256, angles))
        throw new Error(`trig_table.json: neg_cos256 is not a list of ${angles} signed words`);
    return Object.freeze({ sin256: Object.freeze([...data.sin256]), neg_cos256: Object.freeze([...data.neg_cos256]) });
}

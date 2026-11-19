export const DOOR_DATA_FORMAT = "zt-spec-data/1";
const PREFIX = "DOOR.";
export interface DoorConstants {
    readonly QUEUE_SIZE: number;
    readonly BOX: number;
    readonly OPEN_TIMER: number;
    readonly TIMER_STEP: number;
    readonly TIMER_MAX: number;
    readonly TIMER_REMOVE: number;
    readonly REOPEN: number;
    readonly CLOSED_CLASS_X: number;
    readonly CLOSED_CLASS_Y: number;
    readonly OPEN_CLASS_X: number;
    readonly OPEN_CLASS_Y: number;
    readonly ENTRY_TYPE: number;
    readonly SFX_ID: number;
    readonly SFX_NOTE: number;
}
const IDS = [
    "QUEUE_SIZE", "BOX", "OPEN_TIMER", "TIMER_STEP", "TIMER_MAX", "TIMER_REMOVE", "REOPEN",
    "CLOSED_CLASS_X", "CLOSED_CLASS_Y", "OPEN_CLASS_X", "OPEN_CLASS_Y", "ENTRY_TYPE", "SFX_ID", "SFX_NOTE",
] as const;
interface DataConstant {
    id?: unknown;
    value?: unknown;
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
export function doorConstantsFrom(doc: unknown): DoorConstants {
    const d = doc as {
        format?: unknown;
        constants?: unknown;
    } | null;
    if (!d || typeof d !== "object")
        throw new Error("door.json: not an object");
    if (d.format !== DOOR_DATA_FORMAT)
        throw new Error(`door.json: format ${String(d.format)}, expected ${DOOR_DATA_FORMAT}`);
    if (!Array.isArray(d.constants))
        throw new Error("door.json: no constants list");
    const values = new Map<string, unknown>();
    for (const c of d.constants as DataConstant[]) {
        if (typeof c.id !== "string" || !c.id.startsWith(PREFIX))
            throw new Error(`door.json: constant id ${String(c.id)} is not a DOOR.* id`);
        values.set(c.id.slice(PREFIX.length), c.value);
    }
    const known = new Set<string>(IDS);
    for (const id of values.keys())
        if (!known.has(id))
            throw new Error(`door.json: unknown constant ${PREFIX}${id}`);
    const out: Record<string, number> = {};
    for (const id of IDS) {
        const v = values.get(id);
        if (!isInt(v))
            throw new Error(`door.json: ${PREFIX}${id} is missing or not an integer`);
        out[id] = v;
    }
    const C = out as unknown as DoorConstants;
    if (C.REOPEN !== 1)
        throw new Error("door.json: DOOR.REOPEN must be 1 (0 needs a hidden closing state that the original does not have, spec 4.3)");
    return Object.freeze(C);
}

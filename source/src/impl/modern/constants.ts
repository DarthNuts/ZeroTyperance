export const MODERN_DATA_FORMAT = "zt-spec-data/1";
export const MODERN_SPEC = "ZT-PLAYER-MODERN";
const PREFIX = "MODERN.";
export interface ModernConstants {
    readonly MOUSE_TURN_MAX: number;
    readonly DIAG_SCALE: number;
    readonly TURN_CAP_ORIGINAL: number;
    readonly TURN_CAP_FAST: number;
    readonly DIAG_SHIFT: number;
}
const INT_IDS = ["MOUSE_TURN_MAX", "DIAG_SCALE", "TURN_CAP_ORIGINAL", "TURN_CAP_FAST"] as const;
const DIAG_UNIT_SHIFT = 8;
export function modernConstantsFrom(doc: unknown): ModernConstants {
    const file = "player_modern.json";
    const d = doc as {
        format?: unknown;
        spec?: unknown;
        constants?: unknown;
    } | null;
    if (!d || typeof d !== "object")
        throw new Error(`${file}: not an object`);
    if (d.format !== MODERN_DATA_FORMAT)
        throw new Error(`${file}: format ${String(d.format)}, expected ${MODERN_DATA_FORMAT}`);
    if (d.spec !== MODERN_SPEC)
        throw new Error(`${file}: spec ${String(d.spec)}, expected ${MODERN_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error(`${file}: no constants array`);
    const values = new Map<string, unknown>();
    for (const c of d.constants as Array<{
        id?: unknown;
        value?: unknown;
    }>) {
        if (typeof c.id !== "string" || !c.id.startsWith(PREFIX))
            throw new Error(`${file}: a constant without a ${PREFIX}* id`);
        values.set(c.id.slice(PREFIX.length), c.value);
    }
    const num = (id: string): number => {
        const v = values.get(id);
        if (typeof v !== "number" || !Number.isInteger(v))
            throw new Error(`${file}: ${PREFIX}${id} is missing or not an integer`);
        return v;
    };
    for (const id of INT_IDS)
        num(id);
    return Object.freeze({
        MOUSE_TURN_MAX: num("MOUSE_TURN_MAX"),
        DIAG_SCALE: num("DIAG_SCALE"),
        TURN_CAP_ORIGINAL: num("TURN_CAP_ORIGINAL"),
        TURN_CAP_FAST: num("TURN_CAP_FAST"),
        DIAG_SHIFT: DIAG_UNIT_SHIFT,
    });
}

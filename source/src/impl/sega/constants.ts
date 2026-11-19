const SCALAR_IDS = [
    "TICKS", "PALETTE_TICK", "BAND_TICK",
    "FAST_ITERATIONS", "FAST_ITERATION_TICKS", "SLOW_ITERATION_TICKS", "TAIL_TICKS",
    "CYCLE_LAG", "PICTURE_LAG",
    "SWEEP_ITERATIONS", "FLARE_MIN_ITERATIONS", "ITERATIONS",
    "COLOUR_MASK", "CYCLE_PERIOD", "CYCLE_START", "CYCLE_WINDOW", "CYCLE_FIRST_ENTRY",
    "ANGLE_START", "ANGLE_STEP", "ANGLE_BIAS", "ANGLE_MASK", "ANGLE_EXIT",
    "DISTANCE_START", "DISTANCE_TARGET", "DISTANCE_EASE_SHIFT", "DISTANCE_MIN_STEP",
    "ANGLES",
    "PROJ_SIN_SHIFT", "PROJ_NORM", "PROJ_POS_SHIFT", "PROJ_CENTRE", "SCALE_NUMERATOR",
    "STRIPS", "ROWS", "TILE_STRIPS", "BAND_COLUMNS", "BAND_ROWS", "MAX_STRIP_SCALE", "FILL_BYTE",
    "TEX_COLUMNS", "TEX_COLUMN_BYTES", "TEX_COORD_START", "TEX_COORD_END", "TEX_COORD_SCALE",
    "BAND_ROW", "BAND_COL", "BAND_FIRST_ENTRY", "PLANE_A_FILL",
] as const;
const INT_LIST_IDS = ["FLARE_FACE", "TEX_ORDER", "DISPLAY", "SPRITE", "MUSIC_1", "MUSIC_2"] as const;
const INT_TABLE_IDS = ["FACE_OFFSETS"] as const;
const STR_IDS = ["PALETTE_INIT", "PALETTE_CYCLE"] as const;
type ScalarId = (typeof SCALAR_IDS)[number];
type IntListId = (typeof INT_LIST_IDS)[number];
type IntTableId = (typeof INT_TABLE_IDS)[number];
type StrId = (typeof STR_IDS)[number];
export type SegaConstants = {
    readonly [K in ScalarId]: number;
} & {
    readonly [K in IntListId]: readonly number[];
} & {
    readonly [K in IntTableId]: readonly (readonly number[])[];
} & {
    readonly [K in StrId]: string;
};
export const SEGA_DATA_FORMAT = "zt-spec-data/1";
export const SEGA_SPEC = "ZT-UI-SEGA";
export const SEGA_PREFIX = "SEGA.";
interface DataConstant {
    id?: unknown;
    value?: unknown;
}
interface DataDoc {
    format?: unknown;
    spec?: unknown;
    constants?: unknown;
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
export function segaConstantsFrom(doc: unknown): SegaConstants {
    const d = doc as DataDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("sega.json: not an object");
    if (d.format !== SEGA_DATA_FORMAT)
        throw new Error(`sega.json: format ${String(d.format)}, expected ${SEGA_DATA_FORMAT}`);
    if (d.spec !== SEGA_SPEC)
        throw new Error(`sega.json: spec ${String(d.spec)}, expected ${SEGA_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error("sega.json: no constants array");
    const values = new Map<string, unknown>();
    for (const c of d.constants as DataConstant[]) {
        if (typeof c.id !== "string" || !c.id.startsWith(SEGA_PREFIX))
            throw new Error(`sega.json: a constant without a SEGA.* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`sega.json: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const out: Record<string, unknown> = {};
    const take = (id: string, check: (v: unknown) => boolean, what: string): void => {
        const v = values.get(SEGA_PREFIX + id);
        if (v === undefined)
            throw new Error(`sega.json: ${SEGA_PREFIX}${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`sega.json: ${SEGA_PREFIX}${id} is not ${what}`);
        out[id] = typeof v === "object" && v !== null ? Object.freeze(v) : v;
    };
    for (const id of SCALAR_IDS)
        take(id, isInt, "an integer");
    for (const id of INT_LIST_IDS)
        take(id, (v) => Array.isArray(v) && v.length > 0 && v.every(isInt), "a list of integers");
    for (const id of INT_TABLE_IDS) {
        take(id, (v) => Array.isArray(v) && v.length > 0 && v.every((row) => Array.isArray(row) && row.every(isInt)), "a table of integers");
        (out[id] as unknown[]).forEach((row) => Object.freeze(row));
    }
    for (const id of STR_IDS)
        take(id, (v) => typeof v === "string" && v.length > 0, "a palette name");
    const known: readonly string[] = [...SCALAR_IDS, ...INT_LIST_IDS, ...INT_TABLE_IDS, ...STR_IDS];
    for (const id of values.keys()) {
        if (!known.includes(id.slice(SEGA_PREFIX.length)))
            throw new Error(`sega.json: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    return Object.freeze(out) as SegaConstants;
}

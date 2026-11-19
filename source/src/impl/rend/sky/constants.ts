const INT_IDS = [
    "PLANE_COLUMNS", "PLANE_ROWS", "PANORAMA_COLUMNS", "PANORAMA_ROWS", "CELL",
    "VIEW_X", "VIEW_Y", "VIEW_W", "VIEW_H",
    "INITIAL_COLUMNS", "BLANK_WORD",
    "SCROLL_FACTOR", "SCROLL_MASK", "SCROLL_BIAS", "DELTA_BITS",
    "STEP_PX", "STEP_BYTES", "STEP_COLUMNS", "RIGHT_EDGE_BYTES", "LEFT_EDGE_BYTES", "ROW_BYTES",
    "DISPLAY_LAG_TICKS", "VSCROLL_PER_FLOOR", "VSCROLL_BASE",
    "CITY.AZ_BASE", "CITY.Y_SHIFT", "CITY.AZ_END", "CITY.FADE_LEFT", "CITY.FADE_RIGHT", "CITY.X_LEFT", "CITY.WIDTH_MAX",
    "CITY.Y_TOP", "CITY.FLOOR_STEP", "CITY.Z_SHIFT", "CITY.Y_CLIP", "CITY.Y_END", "CITY.TILE_BASE", "CITY.BLOCK_STEP",
] as const;
const CLASS_MAP_IDS = ["CLASS_BY_EPISODE"] as const;
const INT_LIST_IDS = ["CITY.ROW_BLOCKS", "CITY.LIT_TILES"] as const;
type IntId = (typeof INT_IDS)[number];
type ClassMapId = (typeof CLASS_MAP_IDS)[number];
type IntListId = (typeof INT_LIST_IDS)[number];
export type SkyConstants = {
    readonly [K in IntId]: number;
} & {
    readonly [K in ClassMapId]: {
        readonly [episode: string]: string;
    };
} & {
    readonly [K in IntListId]: readonly number[];
} & {
    readonly WORD_BYTES: number;
};
export const SKY_DATA_FORMAT = "zt-spec-data/1";
export const SKY_SPEC = "ZT-REND-SKY";
export const SKY_PREFIX = "REND.SKY.";
export const SKY_ID_COUNT = 41;
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
function isClassMap(v: unknown): v is Record<string, string> {
    return !!v && typeof v === "object" && !Array.isArray(v) && Object.entries(v as Record<string, unknown>).every(([k, c]) => /^\d+$/.test(k) && typeof c === "string" && c.length > 0);
}
export function skyConstantsFrom(doc: unknown): SkyConstants {
    const d = doc as DataDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("rend_sky.json: not an object");
    if (d.format !== SKY_DATA_FORMAT)
        throw new Error(`rend_sky.json: format ${String(d.format)}, expected ${SKY_DATA_FORMAT}`);
    if (d.spec !== SKY_SPEC)
        throw new Error(`rend_sky.json: spec ${String(d.spec)}, expected ${SKY_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error("rend_sky.json: no constants array");
    const values = new Map<string, unknown>();
    for (const c of d.constants as DataConstant[]) {
        if (typeof c.id !== "string" || !c.id.startsWith(SKY_PREFIX))
            throw new Error(`rend_sky.json: a constant without a REND.SKY.* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`rend_sky.json: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const out: Record<string, unknown> = {};
    const take = (id: string, check: (v: unknown) => boolean, what: string): void => {
        const v = values.get(SKY_PREFIX + id);
        if (v === undefined)
            throw new Error(`rend_sky.json: ${SKY_PREFIX}${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`rend_sky.json: ${SKY_PREFIX}${id} is not ${what}`);
        out[id] = Object.freeze(v);
    };
    for (const id of INT_IDS)
        take(id, isInt, "an integer");
    for (const id of CLASS_MAP_IDS)
        take(id, isClassMap, "an object of episode index -> class name");
    for (const id of INT_LIST_IDS)
        take(id, (v) => Array.isArray(v) && v.every(isInt), "an array of integers");
    const known: readonly string[] = [...INT_IDS, ...CLASS_MAP_IDS, ...INT_LIST_IDS];
    for (const id of values.keys()) {
        if (!known.includes(id.slice(SKY_PREFIX.length)))
            throw new Error(`rend_sky.json: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    if (known.length !== SKY_ID_COUNT)
        throw new Error(`rend_sky.json: this implementation knows ${known.length} ids, the spec says ${SKY_ID_COUNT}`);
    const C = out as Record<IntId, number>;
    if (C.ROW_BYTES % C.PANORAMA_COLUMNS !== 0)
        throw new Error("rend_sky.json: ROW_BYTES is not a whole number of words of PANORAMA_COLUMNS");
    out["WORD_BYTES"] = C.ROW_BYTES / C.PANORAMA_COLUMNS;
    if (C.STEP_BYTES !== C.STEP_COLUMNS * (out["WORD_BYTES"] as number))
        throw new Error("rend_sky.json: STEP_BYTES is not STEP_COLUMNS words");
    if (C.PANORAMA_ROWS > C.PLANE_ROWS)
        throw new Error("rend_sky.json: the panorama has more rows than the plane");
    if (C.INITIAL_COLUMNS > C.PLANE_COLUMNS)
        throw new Error("rend_sky.json: INITIAL_COLUMNS exceeds the plane's columns");
    if (C.SCROLL_MASK + 1 !== C.PANORAMA_COLUMNS * C.CELL)
        throw new Error("rend_sky.json: SCROLL_MASK + 1 is not the panorama's width in px");
    if (2 ** C.DELTA_BITS !== C.SCROLL_MASK + 1)
        throw new Error("rend_sky.json: 2 ^ DELTA_BITS is not SCROLL_MASK + 1");
    return Object.freeze(out) as SkyConstants;
}

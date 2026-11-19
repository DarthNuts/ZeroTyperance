const SCALAR_IDS = [
    "OFF_TICK", "ON_TICK", "LOOP_TICK", "LISTS_TICK", "IDLE_STEPS", "IDLE_EXIT_TICK", "PASS_STEPS",
    "SCROLL_STEP", "FLAT_LINES", "SHEAR_LINES", "SHEAR_BASE", "SHEAR_SHIFT", "SHEAR_CENTRE", "SHEAR_CAP",
    "SHEAR_BIT_A", "SHEAR_BIT_B",
    "PLANE_W", "PLANE_H", "PICTURE_ROW", "STRIP_ROWS", "STRIP_PERIOD", "STRIP_COLUMN_SHIFT", "STRIP_COLUMNS",
    "RAMP_LINES", "RAMP_CAP", "RAMP_CENTRE", "RAMP_TOP", "PAL1_LIMIT",
    "CURSOR_START", "CURSOR_OPTIONS", "POINTER_X", "POINTER_Y", "POINTER_STEP",
    "MUSIC_1_OPCODE", "MUSIC_1_VALUE", "MUSIC_2_OPCODE", "MUSIC_2_VALUE",
] as const;
const INT_LIST_IDS = ["POINTER_CELLS", "CAM_X_SEQUENCE", "CAM_Y_SEQUENCE"] as const;
const STR_LIST_IDS = ["CONFIRM_BUTTONS"] as const;
const INT_TABLE_IDS = ["PAL1_GROUPS", "PAL1_SELECT"] as const;
type ScalarId = (typeof SCALAR_IDS)[number];
type IntListId = (typeof INT_LIST_IDS)[number];
type StrListId = (typeof STR_LIST_IDS)[number];
type IntTableId = (typeof INT_TABLE_IDS)[number];
export type TitleConstants = {
    readonly [K in ScalarId]: number;
} & {
    readonly [K in IntListId]: readonly number[];
} & {
    readonly [K in StrListId]: readonly string[];
} & {
    readonly [K in IntTableId]: readonly (readonly number[])[];
};
export const TITLE_DATA_FORMAT = "zt-spec-data/1";
export const TITLE_SPEC = "ZT-UI-MENU";
export const TITLE_PREFIX = "TITLE.";
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
export function titleConstantsFrom(doc: unknown): TitleConstants {
    const d = doc as DataDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("title.json: not an object");
    if (d.format !== TITLE_DATA_FORMAT)
        throw new Error(`title.json: format ${String(d.format)}, expected ${TITLE_DATA_FORMAT}`);
    if (d.spec !== TITLE_SPEC)
        throw new Error(`title.json: spec ${String(d.spec)}, expected ${TITLE_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error("title.json: no constants array");
    const values = new Map<string, unknown>();
    for (const c of d.constants as DataConstant[]) {
        if (typeof c.id !== "string" || !c.id.startsWith(TITLE_PREFIX))
            throw new Error(`title.json: a constant without a TITLE.* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`title.json: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const out: Record<string, unknown> = {};
    const take = (id: string, check: (v: unknown) => boolean, what: string): void => {
        const v = values.get(TITLE_PREFIX + id);
        if (v === undefined)
            throw new Error(`title.json: ${TITLE_PREFIX}${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`title.json: ${TITLE_PREFIX}${id} is not ${what}`);
        out[id] = Object.freeze(v);
    };
    for (const id of SCALAR_IDS)
        take(id, isInt, "an integer");
    for (const id of INT_LIST_IDS)
        take(id, (v) => Array.isArray(v) && v.length > 0 && v.every(isInt), "a list of integers");
    for (const id of STR_LIST_IDS)
        take(id, (v) => Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === "string"), "a list of strings");
    for (const id of INT_TABLE_IDS) {
        take(id, (v) => Array.isArray(v) && v.length > 0 && v.every((row) => Array.isArray(row) && row.every(isInt)), "a table of integers");
        (out[id] as unknown[]).forEach((row) => Object.freeze(row));
    }
    const known: readonly string[] = [...SCALAR_IDS, ...INT_LIST_IDS, ...STR_LIST_IDS, ...INT_TABLE_IDS];
    for (const id of values.keys()) {
        if (!known.includes(id.slice(TITLE_PREFIX.length)))
            throw new Error(`title.json: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    return Object.freeze(out) as TitleConstants;
}

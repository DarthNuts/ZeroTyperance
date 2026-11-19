const INT_IDS = [
    "GRID.ROWS", "GRID.COLS", "CURSOR.START_COL", "CURSOR.START_ROW", "BUFFER.LEN", "BUFFER.BLANK",
    "REPEAT.FIRST_HELD", "REPEAT.NEXT_HELD", "SOUND.MOVE", "SOUND.EDIT", "ERROR.FRAMES",
    "PAD.UP", "PAD.DOWN", "PAD.LEFT", "PAD.RIGHT", "PAD.SELECT_MASK",
    "SPRITE.X0", "SPRITE.Y0", "SPRITE.COUNT", "SPRITE.LAG_FRAMES",
    "FONT.TILE_SLOT", "FONT.FLAGS", "CORNER.TILE_SLOT", "PALETTE.LINE",
    "TEXT.HEADER_ADDR", "TEXT.GRID_ADDR", "TEXT.BUFFER_ADDR", "TEXT.CENTRE_CELLS", "OPTIONS.CURSOR_ITEM",
    "LAYOUT.PLANE_A", "LAYOUT.PLANE_B", "LAYOUT.ROW_BYTES", "LAYOUT.SPRITE_TABLE",
    "REBUILD.ENTRY_FRAMES", "REBUILD.RETURN_FRAMES",
] as const;
const INT_LIST_IDS = { "ROW8.LEFT_REMAP": 8, "ROW8.RIGHT_REMAP": 8, "SPRITE.BOX": 2, "SPRITE.ATTRS": 4 } as const;
const PAIR_LIST_IDS = { "SPRITE.BUTTON_X": 8 } as const;
const STR_IDS = ["PALETTE.NAME"] as const;
type IntId = (typeof INT_IDS)[number];
type IntListId = keyof typeof INT_LIST_IDS;
type PairListId = keyof typeof PAIR_LIST_IDS;
type StrId = (typeof STR_IDS)[number];
export type PasswordConstants = {
    readonly [K in IntId]: number;
} & {
    readonly [K in IntListId]: readonly number[];
} & {
    readonly [K in PairListId]: ReadonlyArray<readonly [
        number,
        number
    ]>;
} & {
    readonly [K in StrId]: string;
};
export const PASSWORD_DATA_FORMAT = "zt-spec-data/1";
export const PASSWORD_SPEC = "ZT-UI-PASSWORD";
export const PASSWORD_PREFIX = "PASSWORD.";
export const PASSWORD_ID_COUNT = 41;
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
function isPair(v: unknown): v is [
    number,
    number
] {
    return Array.isArray(v) && v.length === 2 && v.every(isInt);
}
export function passwordConstantsFrom(doc: unknown): PasswordConstants {
    const d = doc as DataDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("password.json: not an object");
    if (d.format !== PASSWORD_DATA_FORMAT)
        throw new Error(`password.json: format ${String(d.format)}, expected ${PASSWORD_DATA_FORMAT}`);
    if (d.spec !== PASSWORD_SPEC)
        throw new Error(`password.json: spec ${String(d.spec)}, expected ${PASSWORD_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error("password.json: no constants array");
    const values = new Map<string, unknown>();
    for (const c of d.constants as DataConstant[]) {
        if (typeof c.id !== "string" || !c.id.startsWith(PASSWORD_PREFIX))
            throw new Error(`password.json: a constant without a PASSWORD.* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`password.json: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const out: Record<string, unknown> = {};
    const take = (id: string, check: (v: unknown) => boolean, what: string): void => {
        const v = values.get(PASSWORD_PREFIX + id);
        if (v === undefined)
            throw new Error(`password.json: ${PASSWORD_PREFIX}${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`password.json: ${PASSWORD_PREFIX}${id} is not ${what}`);
        out[id] = Object.freeze(v);
    };
    for (const id of INT_IDS)
        take(id, isInt, "an integer");
    for (const [id, n] of Object.entries(INT_LIST_IDS))
        take(id, (v) => Array.isArray(v) && v.length === n && v.every(isInt), `a list of ${n} integers`);
    for (const [id, n] of Object.entries(PAIR_LIST_IDS))
        take(id, (v) => Array.isArray(v) && v.length === n && v.every(isPair), `a list of ${n} integer pairs`);
    for (const id of STR_IDS)
        take(id, (v) => typeof v === "string", "a string");
    const known: readonly string[] = [...INT_IDS, ...Object.keys(INT_LIST_IDS), ...Object.keys(PAIR_LIST_IDS), ...STR_IDS];
    for (const id of values.keys()) {
        if (!known.includes(id.slice(PASSWORD_PREFIX.length)))
            throw new Error(`password.json: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    if (known.length !== PASSWORD_ID_COUNT)
        throw new Error(`password.json: this implementation knows ${known.length} ids, the spec says ${PASSWORD_ID_COUNT}`);
    return Object.freeze(out) as PasswordConstants;
}

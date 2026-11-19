const INT_IDS: Readonly<Record<string, readonly string[]>> = {
    "": ["PHASE_ADVANCE", "SPRITE_ORIGIN"],
    RECORD: [
        "DISPLAY_W", "DISPLAY_H", "VIEW_COLS", "VIEW_ROWS",
        "VIEW_RECT_ROW_FIRST", "VIEW_RECT_ROW_LAST", "VIEW_RECT_COL_FIRST", "VIEW_RECT_COL_LAST",
        "BACKDROP", "PALETTE_LINE", "COLOUR_MASK",
        "BLIP_TILE_FIRST", "BLIP_TILE_LAST", "CARD_TILE_FIRST", "CARD_TILE_LAST",
    ],
    LAG: ["GRID_TICKS", "SPRITE_TICKS"],
    FRAME: ["COLS", "ROWS", "ART_TILE", "FLAGS"],
    IDCARD: ["COL", "ROW", "COLS", "ROWS", "ART_TILE", "CHARACTER_MAX"],
    COUNTER: ["COL", "ROW", "DIGIT_WORD_BASE", "RADIX"],
    HEALTH: ["COL", "ROW", "TILE_FIRST", "SCALE", "DIVISOR", "CAP", "ROTATE_BITS"],
    CARD: ["FIRST_TILE", "TILES", "ATTR_BASE", "W", "H", "Y_WORD", "DIGIT_BYTE_OFFSET", "DIGIT_BYTES", "DIGIT_ROWS", "DIGIT_MASK", "DIGIT_RADIX", "REVEAL_START", "REVEAL_FALL"],
    SCAN: [
        "COLS", "ROWS", "CELL_COL", "CELL_ROW", "WINDOW_BEFORE", "CLAMP_MIN", "CLAMP_MAX", "BASE_WORD",
        "BLINK_MASK", "PLAYER_Y_OFFSET", "PLAYER_X_OFFSET", "SHIFT", "COMPASS_WORD", "COMPASS_PHASE_MASK",
        "ENEMY_RANGE", "ENEMY_Y_OFFSET", "ENEMY_X_OFFSET", "ENEMY_ALIVE_FLAG", "TILE_STEP",
        "MARKER_Y_START", "MARKER_X_START", "MARKER_STEP",
    ],
    MASK: ["ATTR"],
    FLASH: ["ENTRY", "FALL"],
    MSG: ["COL", "ROW", "COLS", "ROWS", "BLANK_WORD", "LETTER_WORD_BASE", "FRAME_WORD"],
};
const CHAR_MAP_IDS: Readonly<Record<string, readonly string[]>> = {
    MSG: ["PUNCT_WORDS"],
};
const INT_LIST_IDS: Readonly<Record<string, Readonly<Record<string, number | null>>>> = {
    HEALTH: { BAND_ABOVE: null, BAND_COLOUR_LONG: null },
    CARD: { X_WORDS: null, RING_WALK: null, HIDDEN_STATES: null },
    SCAN: { BLINK_WORDS: null, COMPASS_SHIFTS: null, COMPASS_HALF: null },
    MASK: { Y_WORDS: null },
};
const INT_LIST_LIST_IDS: Readonly<Record<string, readonly string[]>> = {
    CARD: ["OVERFLOW_TENS"],
};
const RANGE_LIST_IDS: Readonly<Record<string, readonly string[]>> = {
    SCAN: ["MARKER_CLASSES"],
    MASK: ["LINES"],
};
export interface HudConstants {
    readonly PHASE_ADVANCE: number;
    readonly SPRITE_ORIGIN: number;
    readonly RECORD: {
        readonly DISPLAY_W: number;
        readonly DISPLAY_H: number;
        readonly VIEW_COLS: number;
        readonly VIEW_ROWS: number;
        readonly VIEW_RECT_ROW_FIRST: number;
        readonly VIEW_RECT_ROW_LAST: number;
        readonly VIEW_RECT_COL_FIRST: number;
        readonly VIEW_RECT_COL_LAST: number;
        readonly BACKDROP: number;
        readonly PALETTE_LINE: number;
        readonly COLOUR_MASK: number;
        readonly BLIP_TILE_FIRST: number;
        readonly BLIP_TILE_LAST: number;
        readonly CARD_TILE_FIRST: number;
        readonly CARD_TILE_LAST: number;
    };
    readonly LAG: {
        readonly GRID_TICKS: number;
        readonly SPRITE_TICKS: number;
    };
    readonly FRAME: {
        readonly COLS: number;
        readonly ROWS: number;
        readonly ART_TILE: number;
        readonly FLAGS: number;
    };
    readonly IDCARD: {
        readonly COL: number;
        readonly ROW: number;
        readonly COLS: number;
        readonly ROWS: number;
        readonly ART_TILE: number;
        readonly CHARACTER_MAX: number;
    };
    readonly COUNTER: {
        readonly COL: number;
        readonly ROW: number;
        readonly DIGIT_WORD_BASE: number;
        readonly RADIX: number;
    };
    readonly HEALTH: {
        readonly COL: number;
        readonly ROW: number;
        readonly TILE_FIRST: number;
        readonly SCALE: number;
        readonly DIVISOR: number;
        readonly CAP: number;
        readonly ROTATE_BITS: number;
        readonly BAND_ABOVE: readonly number[];
        readonly BAND_COLOUR_LONG: readonly number[];
    };
    readonly CARD: {
        readonly FIRST_TILE: number;
        readonly TILES: number;
        readonly ATTR_BASE: number;
        readonly W: number;
        readonly H: number;
        readonly Y_WORD: number;
        readonly DIGIT_BYTE_OFFSET: number;
        readonly DIGIT_BYTES: number;
        readonly DIGIT_ROWS: number;
        readonly DIGIT_MASK: number;
        readonly DIGIT_RADIX: number;
        readonly X_WORDS: readonly number[];
        readonly RING_WALK: readonly number[];
        readonly HIDDEN_STATES: readonly number[];
        readonly REVEAL_START: number;
        readonly REVEAL_FALL: number;
        readonly OVERFLOW_TENS: ReadonlyArray<readonly number[]>;
    };
    readonly SCAN: {
        readonly COLS: number;
        readonly ROWS: number;
        readonly CELL_COL: number;
        readonly CELL_ROW: number;
        readonly WINDOW_BEFORE: number;
        readonly CLAMP_MIN: number;
        readonly CLAMP_MAX: number;
        readonly BASE_WORD: number;
        readonly BLINK_MASK: number;
        readonly PLAYER_Y_OFFSET: number;
        readonly PLAYER_X_OFFSET: number;
        readonly SHIFT: number;
        readonly COMPASS_WORD: number;
        readonly COMPASS_PHASE_MASK: number;
        readonly ENEMY_RANGE: number;
        readonly ENEMY_Y_OFFSET: number;
        readonly ENEMY_X_OFFSET: number;
        readonly ENEMY_ALIVE_FLAG: number;
        readonly TILE_STEP: number;
        readonly MARKER_Y_START: number;
        readonly MARKER_X_START: number;
        readonly MARKER_STEP: number;
        readonly BLINK_WORDS: readonly number[];
        readonly COMPASS_SHIFTS: readonly number[];
        readonly COMPASS_HALF: readonly number[];
        readonly MARKER_CLASSES: ReadonlyArray<readonly [
            number,
            number
        ]>;
    };
    readonly MASK: {
        readonly ATTR: number;
        readonly Y_WORDS: readonly number[];
        readonly LINES: ReadonlyArray<readonly [
            number,
            number
        ]>;
    };
    readonly FLASH: {
        readonly ENTRY: number;
        readonly FALL: number;
    };
    readonly MSG: {
        readonly COL: number;
        readonly ROW: number;
        readonly COLS: number;
        readonly ROWS: number;
        readonly BLANK_WORD: number;
        readonly LETTER_WORD_BASE: number;
        readonly FRAME_WORD: number;
        readonly PUNCT_WORDS: Readonly<Record<string, number>>;
    };
}
export const HUD_DATA_FORMAT = "zt-spec-data/1";
export const HUD_SPEC = "ZT-UI-HUD";
export const HUD_PREFIX = "HUD.";
export const HUD_ID_COUNT = 98;
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
function isIntList(v: unknown, n: number | null): v is number[] {
    return Array.isArray(v) && (n === null || v.length === n) && v.every(isInt);
}
function isRangeList(v: unknown): v is Array<[
    number,
    number
]> {
    return Array.isArray(v) && v.every((r) => Array.isArray(r) && r.length === 2 && isInt(r[0]) && isInt(r[1]) && r[0] <= r[1]);
}
export function hudConstantsFrom(doc: unknown): HudConstants {
    const d = doc as DataDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("hud.json: not an object");
    if (d.format !== HUD_DATA_FORMAT)
        throw new Error(`hud.json: format ${String(d.format)}, expected ${HUD_DATA_FORMAT}`);
    if (d.spec !== HUD_SPEC)
        throw new Error(`hud.json: spec ${String(d.spec)}, expected ${HUD_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error("hud.json: no constants array");
    const values = new Map<string, unknown>();
    for (const c of d.constants as DataConstant[]) {
        if (typeof c.id !== "string" || !c.id.startsWith(HUD_PREFIX))
            throw new Error(`hud.json: a constant without a HUD.* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`hud.json: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const out: Record<string, Record<string, unknown> | unknown> = {};
    const used = new Set<string>();
    const take = (group: string, name: string, check: (v: unknown) => boolean, what: string): void => {
        const id = HUD_PREFIX + (group ? `${group}.` : "") + name;
        const v = values.get(id);
        if (v === undefined)
            throw new Error(`hud.json: ${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`hud.json: ${id} is not ${what}`);
        used.add(id);
        if (group === "") {
            out[name] = Object.freeze(v);
        }
        else {
            const g = (out[group] ??= {}) as Record<string, unknown>;
            g[name] = Object.freeze(v);
        }
    };
    for (const [group, names] of Object.entries(INT_IDS))
        for (const n of names)
            take(group, n, isInt, "an integer");
    for (const [group, lists] of Object.entries(INT_LIST_IDS))
        for (const [n, len] of Object.entries(lists))
            take(group, n, (v) => isIntList(v, len), len === null ? "a list of integers" : `a list of ${len} integers`);
    for (const [group, names] of Object.entries(RANGE_LIST_IDS))
        for (const n of names)
            take(group, n, isRangeList, "a list of [first, last] integer ranges");
    for (const [group, names] of Object.entries(CHAR_MAP_IDS))
        for (const n of names)
            take(group, n, (v) => !!v && typeof v === "object" && !Array.isArray(v) && Object.entries(v as Record<string, unknown>).every(([k, w]) => k.length === 1 && isInt(w)), "an object of one character -> integer");
    for (const [group, names] of Object.entries(INT_LIST_LIST_IDS))
        for (const n of names)
            take(group, n, (v) => Array.isArray(v) && v.every((row) => isIntList(row, null)), "a list of integer lists");
    const unknown = [...values.keys()].filter((k) => !used.has(k));
    if (unknown.length)
        throw new Error(`hud.json: ids the spec does not use: ${unknown.join(", ")}`);
    if (used.size !== HUD_ID_COUNT)
        throw new Error(`hud.json: ${used.size} ids read, the spec says ${HUD_ID_COUNT}`);
    for (const k of Object.keys(out))
        if (typeof out[k] === "object")
            Object.freeze(out[k]);
    return Object.freeze(out) as unknown as HudConstants;
}

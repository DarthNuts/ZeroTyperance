const INT_IDS = [
    "BLANK_OFFSET", "PICTURE_OFFSET", "LOOP_OFFSET", "PLANE_W",
    "BLANK_CRAM", "BLANK_CELL", "TEXT_SLOT", "TEXT_FLAGS", "CURSOR_SLOT", "CURSOR_FLAGS",
    "CURSOR_X", "CURSOR_Y", "CURSOR_STEP", "CURSOR_EXIT_SKIP",
    "ITEM_COUNT", "ITEM_START", "ITEM_PASSWORD", "ITEM_PLAYERS", "ITEM_MUSIC", "ITEM_VOICE", "ITEM_TEST", "ITEM_EXIT",
    "LABEL_COL", "PLAYERS_DEFAULT", "MUSIC_DEFAULT", "VOICE_DEFAULT", "REPEAT_FIRST", "REPEAT_NEXT",
    "BEEP_SFX_ID", "BEEP_NOTE", "CHANNEL_CTL_OPCODE", "CHANNEL_NOTE_INITIAL",
    "MUSIC_1_OPCODE", "MUSIC_1_VALUE", "MUSIC_2_OPCODE", "MUSIC_2_VALUE",
    "TEST_DEFAULT", "TEST_MIN", "TEST_MAX", "TEST_MODE_MUSIC", "TEST_MODE_SFX",
    "TEST_MUSIC_VAR_OPCODE", "TEST_MUSIC_CMD_OPCODE", "TEST_VOICE_CHANNEL", "BEEP_SOUND_NUMBER", "TITLE_MUSIC_NUMBER",
] as const;
const INT_LIST_IDS = {
    DISPLAY: 3,
    OFFSCREEN_SPRITE: 5,
    CURSOR_SIZE: 2,
    LABEL_ROWS: 6,
    NAME_POS: 2,
    PLAYERS_POS: 2,
    MUSIC_POS: 2,
    VOICE_POS: 2,
    TEST_POS: 2,
    SFX_CHANNELS: 2,
    TEST_MODES_VOICE: 2,
} as const;
const STR_LIST_IDS = { LABEL_STRINGS: 6, PLAYERS_STRINGS: 2, SWITCH_STRINGS: 2, CONFIRM_BUTTONS: 3 } as const;
const STR_IDS = [
    "PALETTE_LINE0", "PALETTE_LINE3", "TEXT_FONT", "CURSOR_TILES", "NAME_DEFAULT", "TEST_DIGITS", "EXIT_BUTTON", "EXIT_TITLE", "EXIT_PASSWORD",
    "TEST_DEC_BUTTON", "TEST_INC_BUTTON", "TEST_TABLE",
] as const;
const BOOL_IDS = ["CHANNEL_CTL_ON", "TEST_STOPS_FIRST"] as const;
type IntId = (typeof INT_IDS)[number];
type IntListId = keyof typeof INT_LIST_IDS;
type StrListId = keyof typeof STR_LIST_IDS;
type StrId = (typeof STR_IDS)[number];
type BoolId = (typeof BOOL_IDS)[number];
export type OptionsConstants = {
    readonly [K in IntId]: number;
} & {
    readonly [K in IntListId]: readonly number[];
} & {
    readonly [K in StrListId]: readonly string[];
} & {
    readonly [K in StrId]: string;
} & {
    readonly [K in BoolId]: boolean;
};
export const OPTIONS_DATA_FORMAT = "zt-spec-data/1";
export const OPTIONS_SPEC = "ZT-UI-OPTIONS";
export const OPTIONS_PREFIX = "OPTIONS.";
export const OPTIONS_ID_COUNT = 75;
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
export function optionsConstantsFrom(doc: unknown): OptionsConstants {
    const d = doc as DataDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("options.json: not an object");
    if (d.format !== OPTIONS_DATA_FORMAT)
        throw new Error(`options.json: format ${String(d.format)}, expected ${OPTIONS_DATA_FORMAT}`);
    if (d.spec !== OPTIONS_SPEC)
        throw new Error(`options.json: spec ${String(d.spec)}, expected ${OPTIONS_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error("options.json: no constants array");
    const values = new Map<string, unknown>();
    for (const c of d.constants as DataConstant[]) {
        if (typeof c.id !== "string" || !c.id.startsWith(OPTIONS_PREFIX))
            throw new Error(`options.json: a constant without an OPTIONS.* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`options.json: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const out: Record<string, unknown> = {};
    const take = (id: string, check: (v: unknown) => boolean, what: string): void => {
        const v = values.get(OPTIONS_PREFIX + id);
        if (v === undefined)
            throw new Error(`options.json: ${OPTIONS_PREFIX}${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`options.json: ${OPTIONS_PREFIX}${id} is not ${what}`);
        out[id] = Object.freeze(v);
    };
    for (const id of INT_IDS)
        take(id, isInt, "an integer");
    for (const [id, n] of Object.entries(INT_LIST_IDS))
        take(id, (v) => Array.isArray(v) && v.length === n && v.every(isInt), `a list of ${n} integers`);
    for (const [id, n] of Object.entries(STR_LIST_IDS))
        take(id, (v) => Array.isArray(v) && v.length === n && v.every((s) => typeof s === "string"), `a list of ${n} strings`);
    for (const id of STR_IDS)
        take(id, (v) => typeof v === "string", "a string");
    for (const id of BOOL_IDS)
        take(id, (v) => typeof v === "boolean", "a boolean");
    const known: readonly string[] = [...INT_IDS, ...Object.keys(INT_LIST_IDS), ...Object.keys(STR_LIST_IDS), ...STR_IDS, ...BOOL_IDS];
    for (const id of values.keys()) {
        if (!known.includes(id.slice(OPTIONS_PREFIX.length)))
            throw new Error(`options.json: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    if (known.length !== OPTIONS_ID_COUNT)
        throw new Error(`options.json: this implementation knows ${known.length} ids, the spec says ${OPTIONS_ID_COUNT}`);
    return Object.freeze(out) as OptionsConstants;
}

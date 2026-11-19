const INT_IDS = [
    "LAYOUT.PLANE_A", "LAYOUT.PLANE_B", "LAYOUT.SPRITE_TABLE", "LAYOUT.ROW_BYTES", "LAYOUT.PAGE_ROWS", "LAYOUT.OVERLAY_PAGE_ROWS",
    "TEXT.INFO.ROW", "TEXT.INFO.COL", "TEXT.INFO.LINES", "TEXT.BIO.ROW", "TEXT.BIO.COL", "TEXT.BIO.LINES",
    "TEXT.LINE_STEP_ROWS", "TEXT.LOWER_ROW", "TEXT.NAME_ROW.ROW", "TEXT.NAME_ROW.COL", "TEXT.NAME_ROW.ENTRY_OFFSET",
    "TEXT.SEPARATOR.ROW", "TEXT.SEPARATOR.COL",
    "SCROLL.STEP", "SCROLL.FRAMES", "SCROLL.MASK",
    "SPRITE.Y_MASK", "SPRITE.Y_SCROLL_BASE",
    "FADE.SETUP_FRAMES", "FADE.STEP_FRAMES", "FADE.STEPS_WRITTEN", "FADE.CHANNEL_MAX",
    "PAL.VISIBLE_MASK",
    "PAD.UP", "PAD.DOWN",
    "CURSOR.COUNT", "CURSOR.UP_WRAP_TO", "CURSOR.DOWN_WRAP_TO",
    "SOUND.MOVE", "SOUND.CONFIRM", "SOUND.DEAD",
    "ALIVE.ENTRY_OK",
] as const;
const INT_LIST_IDS = ["PAD.CONFIRM_BITS"] as const;
export interface SpriteEntry {
    readonly n: number;
    readonly x: number;
    readonly y_base: number;
    readonly size_link: number;
    readonly attr: number;
    readonly width_cells: number;
    readonly height_cells: number;
    readonly link: number;
    readonly tile_slot: number;
    readonly palette_line: number;
    readonly priority: number;
    readonly vflip: number;
    readonly hflip: number;
}
type IntId = (typeof INT_IDS)[number];
type IntListId = (typeof INT_LIST_IDS)[number];
export type CharselConstants = {
    readonly [K in IntId]: number;
} & {
    readonly [K in IntListId]: readonly number[];
} & {
    readonly "SPRITE.ENTRIES": readonly SpriteEntry[];
};
export const CHARSEL_DATA_FORMAT = "zt-spec-data/1";
export const CHARSEL_SPEC = "ZT-UI-CHARSEL";
export const CHARSEL_PREFIX = "CHARSEL.";
export const CHARSEL_ID_COUNT = 40;
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
function wordOf(v: unknown, where: string): number {
    if (isInt(v))
        return v;
    if (typeof v === "string" && /^0x[0-9A-Fa-f]{1,4}$/.test(v))
        return parseInt(v.slice(2), 16);
    throw new Error(`charsel.json: ${where} is not a 16-bit word (number or 0x hex string)`);
}
function spriteEntry(v: unknown, i: number): SpriteEntry {
    const where = `CHARSEL.SPRITE.ENTRIES[${i}]`;
    if (!v || typeof v !== "object")
        throw new Error(`charsel.json: ${where} is not an object`);
    const o = v as Record<string, unknown>;
    const int = (k: string): number => {
        if (!isInt(o[k]))
            throw new Error(`charsel.json: ${where}.${k} is not an integer`);
        return o[k] as number;
    };
    return Object.freeze({
        n: int("n"),
        x: int("x"),
        y_base: int("y_base"),
        size_link: wordOf(o["size_link"], `${where}.size_link`),
        attr: wordOf(o["attr"], `${where}.attr`),
        width_cells: int("width_cells"),
        height_cells: int("height_cells"),
        link: int("link"),
        tile_slot: int("tile_slot"),
        palette_line: int("palette_line"),
        priority: int("priority"),
        vflip: int("vflip"),
        hflip: int("hflip"),
    });
}
export function charselConstantsFrom(doc: unknown): CharselConstants {
    const d = doc as {
        format?: unknown;
        spec?: unknown;
        constants?: unknown;
    } | null;
    if (!d || typeof d !== "object")
        throw new Error("charsel.json: not an object");
    if (d.format !== CHARSEL_DATA_FORMAT)
        throw new Error(`charsel.json: format ${String(d.format)}, expected ${CHARSEL_DATA_FORMAT}`);
    if (d.spec !== CHARSEL_SPEC)
        throw new Error(`charsel.json: spec ${String(d.spec)}, expected ${CHARSEL_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error("charsel.json: no constants array");
    const values = new Map<string, unknown>();
    for (const c of d.constants as Array<{
        id?: unknown;
        value?: unknown;
    }>) {
        if (typeof c.id !== "string" || !c.id.startsWith(CHARSEL_PREFIX))
            throw new Error(`charsel.json: a constant without a CHARSEL.* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`charsel.json: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const out: Record<string, unknown> = {};
    const take = (id: string, check: (v: unknown) => boolean, what: string, map: (v: unknown) => unknown = (v) => v): void => {
        const v = values.get(CHARSEL_PREFIX + id);
        if (v === undefined)
            throw new Error(`charsel.json: ${CHARSEL_PREFIX}${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`charsel.json: ${CHARSEL_PREFIX}${id} is not ${what}`);
        out[id] = Object.freeze(map(v));
    };
    for (const id of INT_IDS)
        take(id, isInt, "an integer");
    for (const id of INT_LIST_IDS)
        take(id, (v) => Array.isArray(v) && v.every(isInt), "a list of integers");
    take("SPRITE.ENTRIES", (v) => Array.isArray(v) && v.length > 0, "a non-empty list", (v) => (v as unknown[]).map(spriteEntry));
    const known: readonly string[] = [...INT_IDS, ...INT_LIST_IDS, "SPRITE.ENTRIES"];
    for (const id of values.keys()) {
        if (!known.includes(id.slice(CHARSEL_PREFIX.length)))
            throw new Error(`charsel.json: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    if (known.length !== CHARSEL_ID_COUNT)
        throw new Error(`charsel.json: this implementation knows ${known.length} ids, the spec says ${CHARSEL_ID_COUNT}`);
    return Object.freeze(out) as CharselConstants;
}

export const PAUSE_DATA_FORMAT = "zt-spec-data/1";
export const PAUSE_SPEC = "ZT-UI-PAUSE";
export const PAUSE_PREFIX = "PAUSE.";
export const PAUSE_ID_COUNT = 38;
const GROUPS = {
    PAD: ["UP_BIT", "DOWN_BIT", "START_BIT"],
    ENTRY: ["BLANKS"],
    EXIT: ["BLANKS_BEFORE_CLEAR", "BLANK_BOUNDARIES"],
    SCREEN: ["COLUMNS", "ROWS"],
    PALETTE: ["TEXT_LINE", "CLEARED_INDEX", "CLEARED_VALUE"],
    CAPTION: ["ROWS_CLEARED", "CENTRE_COLUMN", "ENTRY_LENGTH", "ENTRY_PAD"],
    MAP: ["CELLS", "CELL_PX", "BLOCK_TILES", "TILE_COLUMN", "TILE_ROW", "SCROLL_DOWN"],
    LABEL: ["COLUMN", "ROW", "LENGTH"],
    MARKER: ["X_ADD", "Y_ADD", "POSITION_SHIFT", "SIZE", "BLINK_BIT", "FIRST_FRAME", "PHASE_BACK"],
    BROWSE: ["LOWEST", "REPEAT_FIRST", "REPEAT_PERIOD", "SOUND_REQUEST"],
} as const;
const CAPTION_ROW_IDS = ["PREVIOUS", "CURRENT", "NEXT"] as const;
type Group<K extends keyof typeof GROUPS> = {
    readonly [I in (typeof GROUPS)[K][number]]: number;
};
export interface PauseConstants {
    readonly PAD: Group<"PAD">;
    readonly ENTRY: Group<"ENTRY">;
    readonly EXIT: Group<"EXIT">;
    readonly SCREEN: Group<"SCREEN">;
    readonly PALETTE: Group<"PALETTE">;
    readonly CAPTION: Group<"CAPTION"> & {
        readonly ROW: {
            readonly [I in (typeof CAPTION_ROW_IDS)[number]]: number;
        };
    };
    readonly MAP: Group<"MAP">;
    readonly LABEL: Group<"LABEL">;
    readonly MARKER: Group<"MARKER">;
    readonly BROWSE: Group<"BROWSE">;
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
export function pauseConstantsFrom(doc: unknown): PauseConstants {
    const file = "pause.json";
    const d = doc as {
        format?: unknown;
        spec?: unknown;
        constants?: unknown;
    } | null;
    if (!d || typeof d !== "object")
        throw new Error(`${file}: not an object`);
    if (d.format !== PAUSE_DATA_FORMAT)
        throw new Error(`${file}: format ${String(d.format)}, expected ${PAUSE_DATA_FORMAT}`);
    if (d.spec !== PAUSE_SPEC)
        throw new Error(`${file}: spec ${String(d.spec)}, expected ${PAUSE_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error(`${file}: no constants array`);
    const values = new Map<string, unknown>();
    for (const c of d.constants as Array<{
        id?: unknown;
        value?: unknown;
    }>) {
        if (typeof c.id !== "string" || !c.id.startsWith(PAUSE_PREFIX))
            throw new Error(`${file}: a constant without a ${PAUSE_PREFIX}* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`${file}: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const known = new Set<string>();
    const take = (id: string): number => {
        const v = values.get(PAUSE_PREFIX + id);
        if (v === undefined)
            throw new Error(`${file}: ${PAUSE_PREFIX}${id} (used by the spec) is missing`);
        if (!isInt(v))
            throw new Error(`${file}: ${PAUSE_PREFIX}${id} is not an integer`);
        known.add(id);
        return v;
    };
    const out: Record<string, unknown> = {};
    for (const [name, ids] of Object.entries(GROUPS)) {
        const g: Record<string, unknown> = {};
        for (const id of ids)
            g[id] = take(`${name}.${id}`);
        if (name === "CAPTION") {
            const rows: Record<string, number> = {};
            for (const id of CAPTION_ROW_IDS)
                rows[id] = take(`CAPTION.ROW.${id}`);
            g["ROW"] = Object.freeze(rows);
        }
        out[name] = Object.freeze(g);
    }
    for (const id of values.keys()) {
        if (!known.has(id.slice(PAUSE_PREFIX.length)))
            throw new Error(`${file}: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    if (known.size !== PAUSE_ID_COUNT)
        throw new Error(`${file}: this implementation knows ${known.size} ids, the spec says ${PAUSE_ID_COUNT}`);
    return Object.freeze(out) as unknown as PauseConstants;
}

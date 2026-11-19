const HAND_INT_IDS = [
    "FIRST_ITERATION", "LAG", "SHOT_START", "FLASH_FRAME", "SWAY_X", "SWAY_Y", "LOWER_PX", "FIST_X", "FIST_Y", "FIST_GAP",
    "FIST_FLIP", "FIST_HIDE_FROM", "LONG_BELOW", "KICK_AT", "RESTORE_AT", "WINDOW_TILES", "FIRST_TILE", "DISPLAY_W",
    "DISPLAY_H", "BACKDROP", "SPRITE_ORIGIN", "SPRITE_X_MASK", "SPRITE_Y_MASK", "TILE_MASK", "PALETTE_LINE", "COLOUR_MASK",
    "VIEW_COLS", "VIEW_ROWS", "THROW_HIDE_FROM", "PUFF_STEP", "PUFF_HFLIP", "PUFF_VFLIP",
] as const;
const HAND_INT_LIST_IDS = ["RECOIL", "NO_HAND", "FISTS", "THROWN", "PUFF", "RECOIL_SIDEWAYS"] as const;
const HAND_GUN_TABLE_IDS = ["GUNS"] as const;
type HandIntId = (typeof HAND_INT_IDS)[number];
type HandIntListId = (typeof HAND_INT_LIST_IDS)[number];
type HandGunTableId = (typeof HAND_GUN_TABLE_IDS)[number];
export interface GunRow {
    readonly weapon: number;
    readonly x: number;
    readonly y: number;
    readonly main_dx: number;
    readonly flash_dx: number | null;
    readonly flash_dy: number | null;
}
const GUN_ROW_KEYS: readonly (keyof GunRow)[] = ["weapon", "x", "y", "main_dx", "flash_dx", "flash_dy"];
export type HandConstants = {
    readonly [K in HandIntId]: number;
} & {
    readonly [K in HandIntListId]: readonly number[];
} & {
    readonly [K in HandGunTableId]: readonly GunRow[];
};
export const HAND_PREFIX = "HAND.";
export const HAND_TABLE = "hand_constants";
export const HAND_DATA_FORMAT = "zt-spec-data/1";
export const HAND_ID_COUNT = 39;
interface DataConstant {
    id?: unknown;
    value?: unknown;
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
function isIntList(v: unknown): v is number[] {
    return Array.isArray(v) && v.every(isInt);
}
function isGunRow(v: unknown): v is GunRow {
    return !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === GUN_ROW_KEYS.length && GUN_ROW_KEYS.every((k) => {
        const x = (v as Record<string, unknown>)[k];
        return isInt(x) || ((k === "flash_dx" || k === "flash_dy") && x === null);
    });
}
export function handConstantsFrom(doc: unknown): HandConstants {
    const file = "weapon.json";
    const d = doc as {
        format?: unknown;
        [HAND_TABLE]?: unknown;
    } | null;
    if (!d || typeof d !== "object")
        throw new Error(`${file}: not an object`);
    if (d.format !== HAND_DATA_FORMAT)
        throw new Error(`${file}: format ${String(d.format)}, expected ${HAND_DATA_FORMAT}`);
    const table = d[HAND_TABLE];
    if (!Array.isArray(table))
        throw new Error(`${file}: no ${HAND_TABLE} table (the picture of the hand needs draft 2's second table)`);
    const values = new Map<string, unknown>();
    for (const c of table as DataConstant[]) {
        if (typeof c.id !== "string" || !c.id.startsWith(HAND_PREFIX))
            throw new Error(`${file}: a ${HAND_TABLE} entry without a ${HAND_PREFIX}* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`${file}: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const out: Record<string, unknown> = {};
    const take = (id: string, check: (v: unknown) => boolean, what: string, map: (v: unknown) => unknown = (v) => v): void => {
        const v = values.get(HAND_PREFIX + id);
        if (v === undefined)
            throw new Error(`${file}: ${HAND_PREFIX}${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`${file}: ${HAND_PREFIX}${id} is not ${what}`);
        out[id] = Object.freeze(map(v));
    };
    for (const id of HAND_INT_IDS)
        take(id, isInt, "an integer");
    for (const id of HAND_INT_LIST_IDS)
        take(id, isIntList, "a list of integers");
    for (const id of HAND_GUN_TABLE_IDS) {
        take(id, (v) => Array.isArray(v) && v.every(isGunRow), `a list of gun rows (${GUN_ROW_KEYS.join(", ")})`, (v) => (v as GunRow[]).map((r) => Object.freeze({ ...r })));
    }
    const known: readonly string[] = [...HAND_INT_IDS, ...HAND_INT_LIST_IDS, ...HAND_GUN_TABLE_IDS];
    for (const id of values.keys()) {
        if (!known.includes(id.slice(HAND_PREFIX.length)))
            throw new Error(`${file}: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    if (known.length !== HAND_ID_COUNT)
        throw new Error(`${file}: this implementation knows ${known.length} HAND ids, the spec says ${HAND_ID_COUNT}`);
    const C = out as HandConstants;
    const weapons = new Set<number>();
    for (const r of C.GUNS) {
        if (weapons.has(r.weapon))
            throw new Error(`${file}: HAND.GUNS has two rows for weapon ${r.weapon}`);
        weapons.add(r.weapon);
    }
    return Object.freeze(out) as HandConstants;
}

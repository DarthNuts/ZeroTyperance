export const SNIPER_DATA_FORMAT = "zt-spec-data/1";
export const SNIPER_SPEC = "ZT-WORLD-SNIPER";
export const SNIPER_PREFIX = "SNIPER.";
const INT_IDS = [
    "EPISODE", "CLASS_COVER", "CLASS_EXPOSED", "ATTACKS_START", "RAND_SHIFT", "RAND_MASK",
    "TICK_FIRE_ON", "TICK_CHECK_1", "TICK_CHECK_2", "TICK_SOUND_FIRST", "TICK_SOUND_LAST", "TICK_FIRE_OFF", "TICK_END", "TICK_END_SHOT",
    "COVER_EYE", "IMPULSE", "HIT_DX", "HIT_DY", "SOUND_A", "SOUND_B", "SOUND_BLAST",
    "STREAK_D1_SHIFT", "STREAK_D1_MASK", "STREAK_D2_SHIFT", "STREAK_D2_MASK",
    "AZ_BASE", "AZ_Y_SHIFT", "AZ_MASK", "AZ_END", "FIGURE_Y", "FIGURE_X_OFFSET",
    "STREAK_ANGLE_MASK", "STREAK_LANE_1_END", "STREAK_LANE_2_END", "STREAK_LANE_3_END", "STREAK_LANE_4_END",
    "STREAK_TILE", "STREAK_LOW_ADD", "STREAK_HIGH_ADD", "STREAK_D1_LOW", "STREAK_D1_HIGH", "STREAK_SIZE_WORD", "STREAK_Y_BASE", "STREAK_X_BASE",
    "FLIP_H", "FLIP_V", "AIM_BASE_A", "AIM_BASE_B", "AIM_TILE", "AIM_TILE_ALT", "AIM_ALT_Y_FIRST", "AIM_ALT_Y_LAST",
    "AIM_IMPACT_TILE", "AIM_IMPACT_RANGE", "AIM_VFLIP_Y", "AIM_FLIP_XOR",
    "BULLET_FLOOR", "BULLET_EYE_MIN", "BULLET_AIM_OFFSET", "BULLET_AIM_WINDOW", "SHOT_SET_TICK", "AIM_COLUMN_BASE",
    "ROCKET_X_MIN", "ROCKET_AIM_X", "ROCKET_AIM_WINDOW", "FLASH_Y", "FLASH_X", "FLASH_TURN_STEP", "FLASH_FRAMES_AIMED", "FLASH_FRAMES_UNAIMED",
    "FLASH_AIMED_TICK", "FLASH_BLAST_COUNT", "SHOT_ATTACKS_LEFT", "ROCKET_HEIGHT_DROP",
] as const;
const INT_LIST_IDS = ["FIGURE_TILES"] as const;
const ROW_LIST_IDS = ["FLASH_FRAMES"] as const;
type IntId = (typeof INT_IDS)[number];
type IntListId = (typeof INT_LIST_IDS)[number];
type RowListId = (typeof ROW_LIST_IDS)[number];
export type SniperConstants = {
    readonly [K in IntId]: number;
} & {
    readonly [K in IntListId]: readonly number[];
} & {
    readonly [K in RowListId]: ReadonlyArray<readonly number[]>;
};
export const SNIPER_ID_COUNT = INT_IDS.length + INT_LIST_IDS.length + ROW_LIST_IDS.length;
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
export function sniperConstantsFrom(doc: unknown): SniperConstants {
    const file = "sniper.json";
    const d = doc as {
        format?: unknown;
        spec?: unknown;
        constants?: unknown;
    } | null;
    if (!d || typeof d !== "object")
        throw new Error(`${file}: not an object`);
    if (d.format !== SNIPER_DATA_FORMAT)
        throw new Error(`${file}: format ${String(d.format)}, expected ${SNIPER_DATA_FORMAT}`);
    if (d.spec !== SNIPER_SPEC)
        throw new Error(`${file}: spec ${String(d.spec)}, expected ${SNIPER_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error(`${file}: no constants array`);
    const values = new Map<string, unknown>();
    for (const c of d.constants as Array<{
        id?: unknown;
        value?: unknown;
    }>) {
        if (typeof c.id !== "string" || !c.id.startsWith(SNIPER_PREFIX))
            throw new Error(`${file}: a constant without a ${SNIPER_PREFIX}* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`${file}: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const out: Record<string, unknown> = {};
    const take = (id: string, check: (v: unknown) => boolean, what: string): void => {
        const v = values.get(SNIPER_PREFIX + id);
        if (v === undefined)
            throw new Error(`${file}: ${SNIPER_PREFIX}${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`${file}: ${SNIPER_PREFIX}${id} is not ${what}`);
        out[id] = Array.isArray(v) ? Object.freeze((v as unknown[]).map((p) => (Array.isArray(p) ? Object.freeze([...(p as number[])]) : p))) : v;
    };
    for (const id of INT_IDS)
        take(id, isInt, "an integer");
    for (const id of INT_LIST_IDS)
        take(id, (v) => Array.isArray(v) && v.every(isInt), "a list of integers");
    for (const id of ROW_LIST_IDS)
        take(id, (v) => Array.isArray(v) && v.every((r) => Array.isArray(r) && r.every(isInt)), "a list of integer rows");
    const known: readonly string[] = [...INT_IDS, ...INT_LIST_IDS, ...ROW_LIST_IDS];
    for (const id of values.keys()) {
        if (!known.includes(id.slice(SNIPER_PREFIX.length)))
            throw new Error(`${file}: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    return Object.freeze(out) as SniperConstants;
}

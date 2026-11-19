export const DEATH_DATA_FORMAT = "zt-spec-data/1";
export const DEATH_SPEC = "ZT-GAME-DEATH";
export const DEATH_PREFIX = "DEATH.";
const INT_IDS = [
    "HP_MAX", "HP_SIGNED", "COUNTER_START", "COUNTER_LIMIT",
    "FALL.Z_VEL", "FALL.EYE_STEP", "FALL.EYE_MIN", "FALL.CROUCH_TICKS",
    "FLASH.ENTRY", "FLASH.START", "FLASH.WHITE_STEP", "FLASH.RED_LIMIT", "FLASH.RED_STEP", "FLASH.CRAM_MASK",
    "HANDOVER.CARRY", "HANDOVER.CURSOR", "HANDOVER.ALIVE_AFTER",
    "SOUND.REFUSED", "SOUND.MOVE",
    "RESTART.HP", "RESTART.START_CLASS", "RESTART.NO_START_CELL", "RESTART.SKIP_LOADOUT_EPISODE", "RESTART.SKIP_LOADOUT_FLOOR", "RESTART.CLEAR_DELAY",
    "RESTART.HEALTH_SHOWN", "RESTART.BLACK_FRAMES", "RESTART.FADE_PASSES", "RESTART.FADE_STEP_PERIOD", "RESTART.FADE_QUIET_END",
    "GO.MUSIC_REQUEST", "GO.MUSIC_FRAME", "GO.PICTURE_TICK", "GO.ROWS_E0", "GO.ROWS_E12", "GO.SPACERS", "GO.ART_WAIT", "GO.VOICE_REQUEST",
    "CRAWL.WAIT", "CRAWL.WAIT_UP", "CRAWL.LOOP_START", "CRAWL.RECORD_COUNTS", "CRAWL.WINDOW_FIRST", "CRAWL.WINDOW_LAST", "CRAWL.START_BIT", "CRAWL.UP_BIT",
    "STOP_TRACK.FRAME",
] as const;
const STR_IDS = ["MARKER.BYTE_FIELD", "GO.EXIT_TO", "GO.PICTURE_E0", "GO.PICTURE_E1", "GO.PICTURE_E2", "GO.ART", "RESTART.CARD_OF"] as const;
const PAIR_LIST_IDS = ["HP_VECTORS", "MARKER.ORDER", "RESTART.RAMP_WORDS"] as const;
const INT_LIST_IDS = ["RESTART.VIEW_CELLS", "RESTART.FADE_CHANNEL_SHIFTS"] as const;
type IntId = (typeof INT_IDS)[number];
type StrId = (typeof STR_IDS)[number];
type PairListId = (typeof PAIR_LIST_IDS)[number];
type IntListId = (typeof INT_LIST_IDS)[number];
export type DeathConstants = {
    readonly [K in IntId]: number;
} & {
    readonly [K in StrId]: string;
} & {
    readonly [K in PairListId]: ReadonlyArray<readonly [
        number,
        number
    ]>;
} & {
    readonly [K in IntListId]: readonly number[];
};
export const DEATH_ID_COUNT = INT_IDS.length + STR_IDS.length + PAIR_LIST_IDS.length + INT_LIST_IDS.length;
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
function isPairList(v: unknown): v is [
    number,
    number
][] {
    return Array.isArray(v) && v.every((p) => Array.isArray(p) && p.length === 2 && isInt(p[0]) && isInt(p[1]));
}
export function deathConstantsFrom(doc: unknown): DeathConstants {
    const file = "death.json";
    const d = doc as {
        format?: unknown;
        spec?: unknown;
        constants?: unknown;
    } | null;
    if (!d || typeof d !== "object")
        throw new Error(`${file}: not an object`);
    if (d.format !== DEATH_DATA_FORMAT)
        throw new Error(`${file}: format ${String(d.format)}, expected ${DEATH_DATA_FORMAT}`);
    if (d.spec !== DEATH_SPEC)
        throw new Error(`${file}: spec ${String(d.spec)}, expected ${DEATH_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error(`${file}: no constants array`);
    const values = new Map<string, unknown>();
    for (const c of d.constants as Array<{
        id?: unknown;
        value?: unknown;
    }>) {
        if (typeof c.id !== "string" || !c.id.startsWith(DEATH_PREFIX))
            throw new Error(`${file}: a constant without a ${DEATH_PREFIX}* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`${file}: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const out: Record<string, unknown> = {};
    const take = (id: string, check: (v: unknown) => boolean, what: string): void => {
        const v = values.get(DEATH_PREFIX + id);
        if (v === undefined)
            throw new Error(`${file}: ${DEATH_PREFIX}${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`${file}: ${DEATH_PREFIX}${id} is not ${what}`);
        out[id] = Array.isArray(v) ? Object.freeze((v as unknown[]).map((p) => (Array.isArray(p) ? Object.freeze([...(p as number[])]) : p))) : v;
    };
    for (const id of INT_IDS)
        take(id, isInt, "an integer");
    for (const id of STR_IDS)
        take(id, (v) => typeof v === "string", "a string");
    for (const id of PAIR_LIST_IDS)
        take(id, isPairList, "a list of integer pairs");
    for (const id of INT_LIST_IDS)
        take(id, (v) => Array.isArray(v) && v.every(isInt), "a list of integers");
    const known: readonly string[] = [...INT_IDS, ...STR_IDS, ...PAIR_LIST_IDS, ...INT_LIST_IDS];
    for (const id of values.keys()) {
        if (!known.includes(id.slice(DEATH_PREFIX.length)))
            throw new Error(`${file}: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    return Object.freeze(out) as DeathConstants;
}
export function deathFlashAfter(steps: number, C: DeathConstants): number {
    let colour = C["FLASH.START"];
    for (let i = 0; i < steps; i++)
        colour = deathFlashStep(colour, C);
    return colour;
}
export function deathFlashStep(colour: number, C: DeathConstants): number {
    const step = colour > C["FLASH.RED_LIMIT"] ? C["FLASH.WHITE_STEP"] : C["FLASH.RED_STEP"];
    return Math.max(0, colour - step);
}
export function deathTest(hp: number, C: DeathConstants): boolean {
    const u = ((hp % 0x10000) + 0x10000) % 0x10000;
    const v = C.HP_SIGNED !== 0 ? (u >= 0x8000 ? u - 0x10000 : u) : u;
    return v <= C.HP_MAX;
}

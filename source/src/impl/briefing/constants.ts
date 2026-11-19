const INT_IDS = [
    "BLANK_OFFSET", "PICTURE_OFFSET", "BLANK_ROW_LENGTH", "PLANE_W", "PLANE_H", "HIDE_SCROLL",
    "PICTURE_COLUMNS", "PICTURE_ROWS", "COLOUR_MASK",
    "FADE_STEP_TICKS", "FADE_IN_STEPS", "FADE_IN_WRITTEN", "FADE_OUT_STEPS",
    "CRAWL_WAIT", "CRAWL_WAIT_UP", "RECORD_COUNTS", "TEXT_COL", "RECORD_CHARS", "ROW_WRAP", "ROW_DIV",
    "TEXT_SLOT", "TEXT_FLAGS", "BLANK_CELL", "START_STOP_TRACK_ID", "END_STOP_TRACK_ID",
    "ENDING.MUSIC_TICK", "ENDING.END_STOP_TRACK_ID", "ENDING.PICTURE_TICK", "ENDING.FIRST_FADE_TICK", "ENDING.CRAWL_FIRST_WAIT",
    "ENDING.PAGE_COUNT", "ENDING.EXIT_TICK_OFFSET",
] as const;
const INT_LIST_IDS = {
    DISPLAY: 3,
    OFFSCREEN_SPRITE: 5,
    TEXT_LINES: 2,
    PAGE_COUNTS: 2,
    PAGE_COUNTS_EPISODE_1: 2,
    PAGE_COUNTS_EPISODE_2: 1,
    START_MUSIC_1: 2,
    START_MUSIC_2: 2,
    "ENDING.PICTURE_PALETTE_LINES": 2,
    "ENDING.MUSIC_1": 2,
    "ENDING.MUSIC_2": 2,
} as const;
const STR_LIST_IDS = { CRAWL_PAUSE_BUTTONS: 2 } as const;
const STR_IDS = [
    "PICTURE_PALETTE_LINE", "PICTURE_PALETTE_LINE_2", "TEXT_PALETTE_LINE", "SPACER_SCENE", "TEXT_FONT",
    "CRAWL_END_BUTTON", "CRAWL_FAST_BUTTON", "EXIT_DONE", "EXIT_CANCEL",
    "ENDING.PICTURE", "ENDING.SCENE", "ENDING.EXIT",
] as const;
const PAGE_LIST_IDS = ["PAGES_DEMO", "PAGES_START", "PAGES_EPISODE_1", "PAGES_EPISODE_2"] as const;
type IntId = (typeof INT_IDS)[number];
type IntListId = keyof typeof INT_LIST_IDS;
type StrListId = keyof typeof STR_LIST_IDS;
type StrId = (typeof STR_IDS)[number];
type PageListId = (typeof PAGE_LIST_IDS)[number];
export interface PageRef {
    readonly screen: string;
    readonly scene: string;
}
export type BriefingConstants = {
    readonly [K in IntId]: number;
} & {
    readonly [K in IntListId]: readonly number[];
} & {
    readonly [K in StrListId]: readonly string[];
} & {
    readonly [K in StrId]: string;
} & {
    readonly [K in PageListId]: readonly PageRef[];
};
export const BRIEFING_DATA_FORMAT = "zt-spec-data/1";
export const BRIEFING_SPEC = "ZT-UI-BRIEFING";
export const BRIEFING_PREFIX = "BRIEFING.";
export const BRIEFING_ID_COUNT = 60;
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
function isPageList(v: unknown): v is [
    string,
    string
][] {
    return Array.isArray(v) && v.length >= 1 && v.every((p) => Array.isArray(p) && p.length === 2 && typeof p[0] === "string" && typeof p[1] === "string");
}
export function briefingConstantsFrom(doc: unknown): BriefingConstants {
    const d = doc as DataDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("briefing.json: not an object");
    if (d.format !== BRIEFING_DATA_FORMAT)
        throw new Error(`briefing.json: format ${String(d.format)}, expected ${BRIEFING_DATA_FORMAT}`);
    if (d.spec !== BRIEFING_SPEC)
        throw new Error(`briefing.json: spec ${String(d.spec)}, expected ${BRIEFING_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error("briefing.json: no constants array");
    const values = new Map<string, unknown>();
    for (const c of d.constants as DataConstant[]) {
        if (typeof c.id !== "string" || !c.id.startsWith(BRIEFING_PREFIX))
            throw new Error(`briefing.json: a constant without a BRIEFING.* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`briefing.json: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const out: Record<string, unknown> = {};
    const take = (id: string, check: (v: unknown) => boolean, what: string, map: (v: unknown) => unknown = (v) => v): void => {
        const v = values.get(BRIEFING_PREFIX + id);
        if (v === undefined)
            throw new Error(`briefing.json: ${BRIEFING_PREFIX}${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`briefing.json: ${BRIEFING_PREFIX}${id} is not ${what}`);
        out[id] = Object.freeze(map(v));
    };
    for (const id of INT_IDS)
        take(id, isInt, "an integer");
    for (const [id, n] of Object.entries(INT_LIST_IDS))
        take(id, (v) => Array.isArray(v) && v.length === n && v.every(isInt), `a list of ${n} integers`);
    for (const [id, n] of Object.entries(STR_LIST_IDS))
        take(id, (v) => Array.isArray(v) && v.length === n && v.every((s) => typeof s === "string"), `a list of ${n} strings`);
    for (const id of STR_IDS)
        take(id, (v) => typeof v === "string", "a string");
    for (const id of PAGE_LIST_IDS) {
        take(id, isPageList, "a list of [screen, strings entry] pairs", (v) => (v as [
            string,
            string
        ][]).map(([screen, scene]) => Object.freeze({ screen, scene })));
    }
    const known: readonly string[] = [...INT_IDS, ...Object.keys(INT_LIST_IDS), ...Object.keys(STR_LIST_IDS), ...STR_IDS, ...PAGE_LIST_IDS];
    for (const id of values.keys()) {
        if (!known.includes(id.slice(BRIEFING_PREFIX.length)))
            throw new Error(`briefing.json: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    if (known.length !== BRIEFING_ID_COUNT)
        throw new Error(`briefing.json: this implementation knows ${known.length} ids, the spec says ${BRIEFING_ID_COUNT}`);
    return Object.freeze(out) as BriefingConstants;
}
export const GAMEOVER_SCENES: Readonly<Record<number, string>> = Object.freeze({ 0: "scenes.02", 1: "scenes.05", 2: "scenes.05" });
export function gameOverPages(D: {
    readonly "GO.PICTURE_E0": string;
    readonly "GO.PICTURE_E1": string;
    readonly "GO.PICTURE_E2": string;
}): Readonly<Record<number, PageRef>> {
    return Object.freeze({
        0: Object.freeze({ screen: D["GO.PICTURE_E0"], scene: GAMEOVER_SCENES[0]! }),
        1: Object.freeze({ screen: D["GO.PICTURE_E1"], scene: GAMEOVER_SCENES[1]! }),
        2: Object.freeze({ screen: D["GO.PICTURE_E2"], scene: GAMEOVER_SCENES[2]! }),
    });
}
export function gameOverPageKey(ref: PageRef): string {
    return `${ref.screen}+${ref.scene}`;
}

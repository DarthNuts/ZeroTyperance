export type FrameRect = readonly [
    number,
    number,
    number,
    number
];
export interface HdConstants {
    readonly FOV: {
        readonly AUTO: number;
        readonly MIN: number;
        readonly MAX: number;
    };
    readonly V_SCALE: {
        readonly CONSOLE: number;
        readonly TALL: number;
    };
    readonly EYE: {
        readonly BASE: number;
        readonly PER_E: number;
    };
    readonly NEAR: number;
    readonly CPU: {
        readonly MAX_COLUMNS: number;
    };
    readonly FIX: {
        readonly MISS_MAX: number;
        readonly ROW_TOL: number;
        readonly NEIGHBOUR: number;
        readonly BB_TOL: number;
    };
    readonly DOOR: {
        readonly FAKE_X: number;
        readonly FAKE_Y: number;
    };
    readonly BB_DEPTH_BIAS: number;
    readonly HUD: {
        readonly H_PER_SCALE: number;
        readonly MARGIN: number;
        readonly SCANNER: FrameRect;
        readonly CARDS: FrameRect;
        readonly IDCARD: FrameRect;
        readonly HEALTH: FrameRect;
        readonly ENEMIES: FrameRect;
        readonly MESSAGES: FrameRect;
        readonly WING: FrameRect;
        readonly RADIO: FrameRect;
        readonly COUNTERS: FrameRect;
    };
    readonly RAMP: {
        readonly B_BLEND_MAX: number;
    };
    readonly LOOT: {
        readonly TOSS_UNITS: number;
        readonly DROP_FRAMES: number;
        readonly TOSS_Z: number;
        readonly TOSS_PEAK: number;
        readonly ALT_MS: number;
    };
    readonly LAYER: {
        readonly FLOOR_LIGHT: {
            readonly class: number;
            readonly part: number;
        };
        readonly CORPSE_CLASSES: readonly number[];
        readonly PICKUP_CLASSES: readonly number[];
    };
    readonly HAND: {
        readonly H_PER_PX: number;
    };
    readonly SPR: {
        readonly GLOW_TILES: readonly [
            number,
            number
        ];
        readonly SNIPER_TILES: readonly [
            number,
            number
        ];
    };
    readonly SKYGEN: {
        readonly BAND: Readonly<Record<string, number>>;
        readonly BG: Readonly<Record<string, number>>;
        readonly SHIFT: number;
        readonly BODY_MIN_RUN: number;
        readonly BODY: Readonly<Record<string, {
            readonly cx: number;
            readonly cy: number;
            readonly r: number;
        }>>;
    };
    readonly SMOOTH: {
        readonly SNAP_UNITS: number;
        readonly EASE_FRAMES: number;
        readonly FRAME_WORK_MS: number;
    };
    readonly GLOW: {
        readonly ALPHA: number;
        readonly WIDTH: number;
    };
}
export const HD_DATA_FORMAT = "zt-spec-data/1";
export const HD_SPEC = "ZT-REND-HD";
export const HD_PREFIX = "HD.";
const IDS = [
    "FOV.AUTO", "FOV.MIN", "FOV.MAX", "V_SCALE.CONSOLE", "V_SCALE.TALL", "EYE.BASE", "EYE.PER_E", "NEAR", "CPU.MAX_COLUMNS",
    "FIX.MISS_MAX", "FIX.ROW_TOL", "FIX.NEIGHBOUR", "FIX.BB_TOL", "DOOR.FAKE_X", "DOOR.FAKE_Y", "BB_DEPTH_BIAS",
    "HUD.H_PER_SCALE", "HUD.MARGIN", "HAND.H_PER_PX", "SMOOTH.SNAP_UNITS", "SMOOTH.EASE_FRAMES", "SMOOTH.FRAME_WORK_MS", "GLOW.ALPHA", "GLOW.WIDTH",
    "RAMP.B_BLEND_MAX", "LOOT.TOSS_UNITS", "LOOT.DROP_FRAMES", "LOOT.TOSS_Z", "LOOT.TOSS_PEAK", "LOOT.ALT_MS",
    "SKYGEN.SHIFT", "SKYGEN.BODY_MIN_RUN",
] as const;
const CLASS_IDS = ["SKYGEN.BAND", "SKYGEN.BG", "SKYGEN.BODY"] as const;
type ClassId = (typeof CLASS_IDS)[number];
const ARRAY_IDS = {
    "HUD.SCANNER": 4, "HUD.CARDS": 4, "HUD.IDCARD": 4, "HUD.HEALTH": 4, "HUD.ENEMIES": 4, "HUD.MESSAGES": 4, "SPR.GLOW_TILES": 2,
    "HUD.WING": 4, "HUD.RADIO": 4, "HUD.COUNTERS": 4, "SPR.SNIPER_TILES": 2,
} as const;
type ArrayId = keyof typeof ARRAY_IDS;
const FLOOR_LIGHT_ID = "LAYER.FLOOR_LIGHT";
const LIST_IDS = ["LAYER.CORPSE_CLASSES", "LAYER.PICKUP_CLASSES"] as const;
export function hdConstantsFrom(doc: unknown): HdConstants {
    const d = doc as {
        format?: unknown;
        spec?: unknown;
        constants?: unknown;
    } | null;
    if (!d || typeof d !== "object")
        throw new Error("rend_hd.json: not an object");
    if (d.format !== HD_DATA_FORMAT)
        throw new Error(`rend_hd.json: format ${String(d.format)}, expected ${HD_DATA_FORMAT}`);
    if (d.spec !== HD_SPEC)
        throw new Error(`rend_hd.json: spec ${String(d.spec)}, expected ${HD_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error("rend_hd.json: no constants array");
    const values = new Map<string, number>();
    const arrays = new Map<string, readonly number[]>();
    const classes = new Map<string, Record<string, unknown>>();
    const lists = new Map<string, readonly number[]>();
    let floorLight: {
        class: number;
        part: number;
    } | null = null;
    const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);
    for (const c of d.constants as Array<{
        id?: unknown;
        value?: unknown;
    }>) {
        if (typeof c.id !== "string" || !c.id.startsWith(HD_PREFIX))
            throw new Error(`rend_hd.json: a constant without a HD.* id: ${JSON.stringify(c.id)}`);
        const id = c.id.slice(HD_PREFIX.length);
        if (values.has(id) || arrays.has(id) || classes.has(id) || lists.has(id) || (id === FLOOR_LIGHT_ID && floorLight !== null))
            throw new Error(`rend_hd.json: ${c.id} appears twice`);
        if (id === FLOOR_LIGHT_ID) {
            const o = c.value as Record<string, unknown> | null;
            if (!o || typeof o !== "object" || !isInt(o.class) || !isInt(o.part) || o.part < 1)
                throw new Error(`rend_hd.json: ${c.id} is not {class, part}`);
            floorLight = { class: o.class, part: o.part };
            continue;
        }
        if ((LIST_IDS as readonly string[]).includes(id)) {
            if (!Array.isArray(c.value) || !c.value.every(isInt))
                throw new Error(`rend_hd.json: ${c.id} is not a list of classes`);
            lists.set(id, Object.freeze([...(c.value as number[])]));
            continue;
        }
        if ((CLASS_IDS as readonly string[]).includes(id)) {
            if (!c.value || typeof c.value !== "object" || Array.isArray(c.value))
                throw new Error(`rend_hd.json: ${c.id} is not an object per sky class`);
            const per = c.value as Record<string, unknown>;
            for (const [k, x] of Object.entries(per)) {
                const ok = id === "SKYGEN.BODY"
                    ? !!x && typeof x === "object" && ["cx", "cy", "r"].every((f) => typeof (x as Record<string, unknown>)[f] === "number" && Number.isFinite((x as Record<string, number>)[f]))
                    : typeof x === "number" && Number.isFinite(x);
                if (!ok)
                    throw new Error(`rend_hd.json: ${c.id}.${k} is not ${id === "SKYGEN.BODY" ? "a disc {cx, cy, r}" : "a number"}`);
            }
            classes.set(id, per);
            continue;
        }
        if (id in ARRAY_IDS) {
            const n = ARRAY_IDS[id as ArrayId];
            if (!Array.isArray(c.value) || c.value.length !== n || !c.value.every((x) => typeof x === "number" && Number.isFinite(x)))
                throw new Error(`rend_hd.json: ${c.id} is not an array of ${n} numbers`);
            arrays.set(id, Object.freeze([...(c.value as number[])]));
            continue;
        }
        if (!(IDS as readonly string[]).includes(id))
            throw new Error(`rend_hd.json: ${c.id} is not an id this implementation knows; spec and data file disagree`);
        if (typeof c.value !== "number" || !Number.isFinite(c.value))
            throw new Error(`rend_hd.json: ${c.id} is not a number`);
        values.set(id, c.value);
    }
    const v = (id: (typeof IDS)[number]): number => {
        const x = values.get(id);
        if (x === undefined)
            throw new Error(`rend_hd.json: ${HD_PREFIX}${id} (used by the spec) is missing`);
        return x;
    };
    const cls = (id: ClassId): Record<string, unknown> => {
        const x = classes.get(id);
        if (x === undefined)
            throw new Error(`rend_hd.json: ${HD_PREFIX}${id} (used by the spec) is missing`);
        return x;
    };
    const a = <N extends ArrayId>(id: N): N extends "SPR.GLOW_TILES" | "SPR.SNIPER_TILES" ? readonly [
        number,
        number
    ] : FrameRect => {
        const x = arrays.get(id);
        if (x === undefined)
            throw new Error(`rend_hd.json: ${HD_PREFIX}${id} (used by the spec) is missing`);
        return x as never;
    };
    const list = (id: (typeof LIST_IDS)[number]): readonly number[] => {
        const x = lists.get(id);
        if (x === undefined)
            throw new Error(`rend_hd.json: ${HD_PREFIX}${id} (used by the spec) is missing`);
        return x;
    };
    if (floorLight === null)
        throw new Error(`rend_hd.json: ${HD_PREFIX}${FLOOR_LIGHT_ID} (used by the spec) is missing`);
    return Object.freeze({
        FOV: Object.freeze({ AUTO: v("FOV.AUTO"), MIN: v("FOV.MIN"), MAX: v("FOV.MAX") }),
        V_SCALE: Object.freeze({ CONSOLE: v("V_SCALE.CONSOLE"), TALL: v("V_SCALE.TALL") }),
        EYE: Object.freeze({ BASE: v("EYE.BASE"), PER_E: v("EYE.PER_E") }),
        NEAR: v("NEAR"),
        CPU: Object.freeze({ MAX_COLUMNS: v("CPU.MAX_COLUMNS") }),
        FIX: Object.freeze({ MISS_MAX: v("FIX.MISS_MAX"), ROW_TOL: v("FIX.ROW_TOL"), NEIGHBOUR: v("FIX.NEIGHBOUR"), BB_TOL: v("FIX.BB_TOL") }),
        DOOR: Object.freeze({ FAKE_X: v("DOOR.FAKE_X"), FAKE_Y: v("DOOR.FAKE_Y") }),
        BB_DEPTH_BIAS: v("BB_DEPTH_BIAS"),
        HUD: Object.freeze({
            H_PER_SCALE: v("HUD.H_PER_SCALE"), MARGIN: v("HUD.MARGIN"),
            SCANNER: a("HUD.SCANNER"), CARDS: a("HUD.CARDS"), IDCARD: a("HUD.IDCARD"), HEALTH: a("HUD.HEALTH"), ENEMIES: a("HUD.ENEMIES"), MESSAGES: a("HUD.MESSAGES"),
            WING: a("HUD.WING"), RADIO: a("HUD.RADIO"), COUNTERS: a("HUD.COUNTERS"),
        }),
        RAMP: Object.freeze({ B_BLEND_MAX: v("RAMP.B_BLEND_MAX") }),
        LOOT: Object.freeze({ TOSS_UNITS: v("LOOT.TOSS_UNITS"), DROP_FRAMES: v("LOOT.DROP_FRAMES"), TOSS_Z: v("LOOT.TOSS_Z"), TOSS_PEAK: v("LOOT.TOSS_PEAK"), ALT_MS: v("LOOT.ALT_MS") }),
        LAYER: Object.freeze({ FLOOR_LIGHT: Object.freeze(floorLight), CORPSE_CLASSES: list("LAYER.CORPSE_CLASSES"), PICKUP_CLASSES: list("LAYER.PICKUP_CLASSES") }),
        HAND: Object.freeze({ H_PER_PX: v("HAND.H_PER_PX") }),
        SPR: Object.freeze({ GLOW_TILES: a("SPR.GLOW_TILES"), SNIPER_TILES: a("SPR.SNIPER_TILES") }),
        SKYGEN: Object.freeze({
            BAND: Object.freeze({ ...(cls("SKYGEN.BAND") as Record<string, number>) }),
            BG: Object.freeze({ ...(cls("SKYGEN.BG") as Record<string, number>) }),
            SHIFT: v("SKYGEN.SHIFT"),
            BODY_MIN_RUN: v("SKYGEN.BODY_MIN_RUN"),
            BODY: Object.freeze(Object.fromEntries(Object.entries(cls("SKYGEN.BODY")).map(([k, d]) => { const o = d as Record<string, number>; return [k, Object.freeze({ cx: o.cx!, cy: o.cy!, r: o.r! })]; }))),
        }),
        SMOOTH: Object.freeze({ SNAP_UNITS: v("SMOOTH.SNAP_UNITS"), EASE_FRAMES: v("SMOOTH.EASE_FRAMES"), FRAME_WORK_MS: v("SMOOTH.FRAME_WORK_MS") }),
        GLOW: Object.freeze({ ALPHA: v("GLOW.ALPHA"), WIDTH: v("GLOW.WIDTH") }),
    });
}

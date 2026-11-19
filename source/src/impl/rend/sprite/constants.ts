const SPRITE_INT_IDS = [
    "LIST_MAX", "MARKER_DISTANCE", "CENTRE", "DEPTH_SHIFT", "DEPTH_MIN", "SCALE_NUMERATOR", "COLUMN_CENTRE",
    "EYE_BASE", "ROW_SHIFT", "ROW_BASE", "ASSUMED_EYE", "ASSUMED_HEIGHT", "BAND_SHIFT", "BAND_ENTRIES",
    "VIEW_ROWS", "VIEW_COLUMNS", "ART_ROWS", "ART_COLUMNS", "ART_ROW_SHIFT", "ROW_NUMERATOR", "TALL_HEIGHT",
    "TALL_NUMERATOR", "TALL_FRACTION_BITS", "SMALL_WIDTH", "COLUMN_NUMERATOR", "SMALL_COLUMN_NUMERATOR",
    "FLIP_PHASE_BIT", "BLINK_PHASE_BIT", "COMPOSITE_VIEW", "COMPOSITE_WIDTH_SHIFT", "COMPOSITE_HEIGHT_SHIFT",
    "ALIGN_NONE", "ALIGN_CENTRE",
    "ENTITY_DISTANCE_MAX", "ENTITY_S_CAP", "ENTITY_MODE_SINGLE", "ENTITY_MODE_PAIR", "ENTITY_MODE_FOUR",
    "ENTITY_MODE_SIX", "ENTITY_MODE_EIGHT", "ENTITY_ANGLE_SHIFT", "ENTITY_ANGLE_BIAS", "ENTITY_VIEW4_BACK",
    "ENTITY_VIEW4_FRONT", "ENTITY_VIEW6_BACK", "ENTITY_VIEW6_FRONT", "ENTITY_VIEW6_SIDE_LOW", "ENTITY_VIEW8_BACK",
    "ENTITY_VIEW8_FRONT", "ENTITY_VIEW8_SIDE_LOW", "ENTITY_VIEW8_SIDE_HIGH", "ENTITY_WALK_MIN_SPEED",
    "ENTITY_WALK_COLUMN_SHIFT", "ENTITY_WALK_COLUMN_MASK",
    "FLAME_STREAM_ART", "FLAME_GROUND_ART", "FLAME_MIRROR_BIT", "FLAME_LIFE", "FLAME_SHRINK_SHIFT",
    "GIB_FRAME_SHIFT", "GIB_FRAME_MASK", "GIB_COUNTER_BIT", "GIB_COUNTER_FRAMES",
    "BOSS_POSE_STAND", "BOSS_POSE_WINDUP", "BOSS_POSE_SHOT", "BOSS_POSE_PAIN", "BOSS_POSE_DYING", "BOSS_POSE_CORPSE",
    "BOSS_WINDUP_STATE", "BOSS_PAIN_STATE", "BOSS_SHOT_ART", "BOSS_SHOT_SIZE_SHIFT", "BOSS_SHOT_MIRROR_BIT",
    "BOSS_HIT_WALK_SHIFT", "BOSS_HIT_WALK_LIMIT",
    "MINE_ART", "MINE_ART_ALT", "MINE_ALT_BIT", "MINE_SIZE_SHIFT", "BLAST_ART", "BLAST_MIRROR_BIT",
    "DOG_POSE_STAND", "DOG_POSE_RUN", "DOG_POSE_LUNGE", "DOG_POSE_PAIN", "DOG_POSE_DYING", "DOG_POSE_CORPSE", "DOG_CHARGE_STATE", "DOG_PAIN_STATE",
    "DOG_RUN_COUNTER", "DOG_RUN_DISTANCE", "IMP_POSE_STAND", "IMP_POSE_ARMED", "IMP_POSE_BITE", "IMP_POSE_PAIN", "IMP_POSE_DYING", "IMP_POSE_CORPSE",
    "IMP_ARMED_STATE", "IMP_PAIN_STATE", "SF_POSE_STAND", "SF_POSE_PAIN", "SF_POSE_DYING", "SF_POSE_CORPSE", "SF_ACTION_STATE", "SF_PAIN_STATE",
    "SF_WINDUP_STATE", "SERGEANT_POSE_STAND", "SERGEANT_POSE_PAIN", "SERGEANT_POSE_DYING", "SERGEANT_POSE_TRANSFORM", "SERGEANT_POSE_CORPSE", "SERGEANT_ACTION_STATE", "SERGEANT_PAIN_STATE",
    "SERGEANT_WINDUP_STATE", "SERGEANT_TRANSFORM_STATE", "SERGEANT_TRANSFORM_FRAMES", "BOSS2_POSE_STAND", "BOSS2_POSE_PAIN", "BOSS2_POSE_DYING", "BOSS2_POSE_CORPSE", "BOSS2_POSE_WINDUP",
    "BOSS2_POSE_ATTACK", "BOSS2_WINDUP_STATE", "BOSS2_PAIN_STATE", "BOSS3_POSE_STAND", "BOSS3_POSE_WALK", "BOSS3_POSE_WALK_ALT", "BOSS3_POSE_WINDUP", "BOSS3_POSE_PAIN",
    "BOSS3_POSE_DYING", "BOSS3_POSE_TRANSFORM", "BOSS3_POSE_FLICKER", "BOSS3_POSE_CORPSE", "BOSS3_POSE_TRANSFORM_END", "BOSS3_WINDUP_STATE", "BOSS3_PAIN_STATE", "BOSS3_TRANSFORM_STATE",
    "BOSS3_TRANSFORM_COUNTER", "BOSS3_FLICKER_SHIFT", "BOSS3_FLICKER_MASK", "GRENADE_ART", "GRENADE_SIZE_SHIFT", "IMPACT_ART_BASE",
    "PLAYER_GRENADE_NEAR", "CAMERA_ART", "CAMERA_ALT_BIT", "CAMERA_ROW_OFFSET", "POP_ART", "POP_MIRROR_BIT", "BLAST_LAST_AGE", "BLAST_SWEEP_RANGE", "BLAST_WALL_FLAGS", "BLAST_WALL_AGE",
] as const;
const SPRITE_INT_LIST_IDS = ["POP_SHRINK", "ITEM_CLASSES", "MARKER_CLASSES", "NOT_SPECIFIED_CLASSES", "FLIP_CLASSES", "BLINK_CLASSES", "BOSS_SHOT_COUNTERS", "BLAST_SHIFTS", "IMP_BITE_COUNTERS", "SF_ACTION_POSES", "SF_ACTION_POSES_OTHER", "SF_WINDUP_POSES", "SERGEANT_ACTION_POSES", "SERGEANT_ACTION_POSES_OTHER", "SERGEANT_WINDUP_POSES", "BOSS3_WALK_STATES"] as const;
const SPRITE_NAME_IDS = ["IDENTITY_ARRAY"] as const;
type SpriteIntId = (typeof SPRITE_INT_IDS)[number];
type SpriteIntListId = (typeof SPRITE_INT_LIST_IDS)[number];
type SpriteNameId = (typeof SPRITE_NAME_IDS)[number];
export type SpriteConstants = {
    readonly [K in SpriteIntId]: number;
} & {
    readonly [K in SpriteIntListId]: readonly number[];
} & {
    readonly [K in SpriteNameId]: string;
};
export const SPRITE_DATA_FORMAT = "zt-spec-data/1";
export const SPRITE_SPEC = "ZT-REND-SPRITE";
export const SPRITE_PREFIX = "REND.SPRITE.";
export const PARTNER_PREFIX = "REND.PARTNER.";
export const SPRITE_ID_COUNT = 171;
export const PARTICLE_PICTURE = Object.freeze({
    ART_FLYING: 61,
    ART_RESTING: 62,
    IMPACT_ART_BASE: 63,
    MIRROR_MASK: 1,
    HEIGHT_SHIFT: 2,
    WIDTH_SHIFT: 1,
    COUNTER_FULL: 256,
    COUNTER_SHIFT: 8,
    RESTING_HEIGHT_SHIFT: 3,
    RESTING_WIDTH_SHIFT: 4,
    LANDED_BIAS: 128,
    LANDED_SHIFT: 7,
    IMPACT_STATE_LAST: 2,
    STATE_FLYING: 0,
    STATE_AGAINST_WALL: 1,
});
export const PARTICLE_DRAW_VECTOR = "particle.burst.draw";
export const IMPACT_DRAW_VECTOR = "impact.hit.draw";
const SOLDIER_INT_IDS = [
    "MARKER_CLASS", "ALT_ART_PARITY_MASK", "TAG_OFFSET", "SPAWN_FLAGS", "SPAWN_HP", "SPAWN_Z", "SPAWN_STATE",
    "SPAWN_COUNTER", "SPAWN_TIMER", "SPAWN_SOUND", "POSE_STAND", "POSE_HURT", "POSE_HIT", "HIT_HP_LIMIT",
    "ATTACK_STATE", "HURT_STATE", "ATTACK_POSE_OTHER", "CORPSE_FLAG_MASK", "CORPSE_STATE", "CORPSE_POSE",
    "CORPSE_FRAME_MASK", "CORPSE_COUNTER_BIT", "CORPSE_CELL_CLASS", "LINK_MIRROR_BIT",
] as const;
const SOLDIER_INT_LIST_IDS = ["CORPSE_FRAMES"] as const;
const SOLDIER_NAME_IDS = ["ART_MAIN", "ART_ALT", "SPAWN_SECONDARY_VECTOR"] as const;
const SOLDIER_VECTOR_IDS = ["SPAWN_VECTORS", "CORPSE_VECTORS"] as const;
const SOLDIER_INT_MAP_IDS = ["ATTACK_POSES"] as const;
export const VECTOR_KEYS = ["damage", "draw", "ai", "death"] as const;
export type VectorKey = (typeof VECTOR_KEYS)[number];
export type VectorNames = {
    readonly [K in VectorKey]: string;
};
type SoldierIntId = (typeof SOLDIER_INT_IDS)[number];
type SoldierIntListId = (typeof SOLDIER_INT_LIST_IDS)[number];
type SoldierNameId = (typeof SOLDIER_NAME_IDS)[number];
type SoldierVectorId = (typeof SOLDIER_VECTOR_IDS)[number];
type SoldierIntMapId = (typeof SOLDIER_INT_MAP_IDS)[number];
const SOLDIER_AI_INT_IDS = [
    "WALK_SHIFT", "WALK_LIMIT", "PUSH_LOW", "PUSH_HIGH", "MAGNET_LIMIT", "MAGNET_SHIFT", "STATE_WAIT", "ATTACK_COUNTER",
    "COUNTER_MASK", "SHOT_COUNTER", "CUE_COUNTER_A", "CUE_COUNTER_B", "RETARGET_MASK", "FOLD_RANGE", "LOS_STEP_SHIFT",
    "LOS_MIN_STEPS", "PROBE_OFFSET", "PROBE_COUNT", "THRESH_GROUND", "THRESH_AIR_MODE0", "THRESH_AIR", "NO_ROLL_MODE",
    "ROLL_SHIFT", "ROLL_MASK", "HIT_RANGE", "PLAN_DIST_SHIFT", "PLAN_COUNTER_SHIFT", "PLAN_COUNTER_MASK", "PLAN_HOME_SHIFT",
    "PLAN_HOME_MASK", "PLAN_HOME_BIAS", "PLAN_HOME_Y_SHIFT", "SOUND_A", "SOUND_B", "DEATH_HP_BELOW",
] as const;
const SOLDIER_AI_INT_LIST_IDS = ["MOVE_BLOCKED_CLASSES"] as const;
const SOLDIER_AI_PAIR_LIST_IDS = ["FOLD_ORDER"] as const;
const SOLDIER_AI_CLASS_MAP_IDS = ["LOS_CLASS_VALUES"] as const;
const SOLDIER_AI_PREFIX = "AI.";
type SoldierAiIntId = (typeof SOLDIER_AI_INT_IDS)[number];
type SoldierAiIntListId = (typeof SOLDIER_AI_INT_LIST_IDS)[number];
type SoldierAiPairListId = (typeof SOLDIER_AI_PAIR_LIST_IDS)[number];
type SoldierAiClassMapId = (typeof SOLDIER_AI_CLASS_MAP_IDS)[number];
export type SoldierAiConstants = {
    readonly [K in SoldierAiIntId]: number;
} & {
    readonly [K in SoldierAiIntListId]: readonly number[];
} & {
    readonly [K in SoldierAiPairListId]: ReadonlyArray<readonly [
        number,
        number
    ]>;
} & {
    readonly [K in SoldierAiClassMapId]: ReadonlyMap<number, number>;
};
const KILL_HIT_INT_IDS = ["MIN_DEPTH", "DEPTH_SHIFT", "SCALE_NUMERATOR", "GATE_COLUMN", "LATERAL_BIAS", "CONE_SHIFT", "MAGNITUDE_GATE", "SQUARE_SHIFT", "SQUARE_EXTRA_SHIFT"] as const;
const KILL_DMG_INT_IDS = ["FULL", "UNIT_SHIFT", "LOSS_SHIFT", "VELOCITY_SHIFT", "BURST_LOSS"] as const;
const KILL_HURT_INT_IDS = ["STOP_SPEED", "VELOCITY_SHIFT"] as const;
const KILL_DEATH_INT_IDS = ["SOUND"] as const;
const KILL_CORPSE_INT_IDS = ["LOOT_RANGE", "LOOT_STATE", "LOOT_ITEM", "LOOT_ROUND_BASE", "LOOT_ROUND_SHIFT", "LOOT_ROUND_MASK", "LOOT_AMOUNT_UNIT", "LOOT_SOUND", "STAMP_RANGE", "RELOOK_MASK"] as const;
const KILL_BURST_INT_IDS = ["COUNT_SHIFT", "COUNT_ADD", "LIVE_MAX", "SUBSTEPS", "FRACTION_SHIFT", "DRAG_SHIFT", "GRAVITY", "FLOOR_Z", "KILL_CLASS", "DECAY_PHASE_MASK", "DECAY_Z_FLOOR", "ANIM_RATE_SHIFT", "FLAGS"] as const;
export interface HitFlagMasks {
    readonly eye_zero: number;
    readonly eye_positive: number;
    readonly eye_negative: number;
}
export interface HitCone {
    readonly default: number;
    readonly characters: readonly number[];
    readonly alt: number;
    readonly repeat_character_0?: number;
}
export interface HitMagnitude {
    readonly kind: "square" | "linear" | "fixed";
    readonly shift?: number;
    readonly value?: number;
    readonly by_character?: Readonly<Record<string, number>>;
    readonly weapon_ids?: readonly number[];
    readonly max_octagon_exclusive?: number;
    readonly halved_for?: readonly number[];
    readonly repeat_halved_for?: readonly number[];
}
export interface BurstDrawField {
    readonly field: "vel.x" | "vel.y" | "vel.z" | "pos.z";
    readonly shift: number;
    readonly mask: number;
    readonly bias: number;
    readonly add_to: "unit.x" | "unit.y" | "none";
}
export type KillHitConstants = {
    readonly [K in (typeof KILL_HIT_INT_IDS)[number]]: number;
} & {
    readonly FLAG_MASKS: HitFlagMasks;
    readonly CONES: Readonly<Record<string, HitCone>>;
    readonly MAGNITUDES: Readonly<Record<string, HitMagnitude>>;
};
export type KillDmgConstants = {
    readonly [K in (typeof KILL_DMG_INT_IDS)[number]]: number;
};
export type KillHurtConstants = {
    readonly [K in (typeof KILL_HURT_INT_IDS)[number]]: number;
};
export type KillDeathConstants = {
    readonly [K in (typeof KILL_DEATH_INT_IDS)[number]]: number;
};
export type KillCorpseConstants = {
    readonly [K in (typeof KILL_CORPSE_INT_IDS)[number]]: number;
};
export type KillBurstConstants = {
    readonly [K in (typeof KILL_BURST_INT_IDS)[number]]: number;
} & {
    readonly VECTORS: VectorNames;
    readonly DRAW: readonly BurstDrawField[];
    readonly CELL_VALUE_TABLE: ReadonlyMap<number, number>;
    readonly LANDING_SECONDARY: ReadonlyMap<number, string>;
};
export type SoldierConstants = {
    readonly [K in SoldierIntId]: number;
} & {
    readonly [K in SoldierIntListId]: readonly number[];
} & {
    readonly [K in SoldierNameId]: string;
} & {
    readonly [K in SoldierVectorId]: VectorNames;
} & {
    readonly [K in SoldierIntMapId]: ReadonlyMap<number, number>;
} & {
    readonly AI: SoldierAiConstants;
} & {
    readonly HIT: KillHitConstants;
    readonly DMG: KillDmgConstants;
    readonly HURT: KillHurtConstants;
    readonly DEATH: KillDeathConstants;
    readonly CORPSE: KillCorpseConstants;
    readonly BURST: KillBurstConstants;
};
export const SOLDIER_SPEC = "ZT-ENT-SOLDIER";
export const SOLDIER_PREFIX = "ENT.SOLDIER.";
export const SOLDIER_ID_COUNT = 66 + 3 + 47;
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
function isIntList(v: unknown): v is number[] {
    return Array.isArray(v) && v.every(isInt);
}
function isName(v: unknown): v is string {
    return typeof v === "string" && v.length > 0;
}
function isVectorNames(v: unknown): v is VectorNames {
    return !!v && typeof v === "object" && !Array.isArray(v) && VECTOR_KEYS.every((k) => isName((v as Record<string, unknown>)[k])) && Object.keys(v).length === VECTOR_KEYS.length;
}
function isIntMap(v: unknown): v is Record<string, number> {
    return !!v && typeof v === "object" && !Array.isArray(v) && Object.entries(v).every(([k, x]) => /^\d+$/.test(k) && isInt(x));
}
function isIntListMap(v: unknown): v is Record<string, number[]> {
    return !!v && typeof v === "object" && !Array.isArray(v) && Object.entries(v).every(([k, x]) => /^\d+$/.test(k) && isIntList(x));
}
function isPairList(v: unknown): v is number[][] {
    return Array.isArray(v) && v.every((p) => Array.isArray(p) && p.length === 2 && p.every(isInt));
}
function valuesOf(doc: unknown, file: string, spec: string, prefix: string): Map<string, unknown> {
    const d = doc as DataDoc | null;
    if (!d || typeof d !== "object")
        throw new Error(`${file}: not an object`);
    if (d.format !== SPRITE_DATA_FORMAT)
        throw new Error(`${file}: format ${String(d.format)}, expected ${SPRITE_DATA_FORMAT}`);
    if (d.spec !== spec)
        throw new Error(`${file}: spec ${String(d.spec)}, expected ${spec}`);
    if (!Array.isArray(d.constants))
        throw new Error(`${file}: no constants array`);
    const values = new Map<string, unknown>();
    for (const c of d.constants as DataConstant[]) {
        if (typeof c.id !== "string" || !c.id.startsWith(prefix))
            throw new Error(`${file}: a constant without a ${prefix}* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`${file}: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    return values;
}
function finish(values: Map<string, unknown>, known: readonly string[], file: string, prefix: string, count: number): void {
    for (const id of values.keys()) {
        if (!known.includes(id.slice(prefix.length)))
            throw new Error(`${file}: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    if (known.length !== count)
        throw new Error(`${file}: this implementation knows ${known.length} ids, the spec says ${count}`);
}
export function spriteConstantsFrom(doc: unknown): SpriteConstants {
    const file = "rend_sprite.json";
    const d = doc as {
        constants?: {
            id?: unknown;
        }[];
    } | null;
    const own = d && Array.isArray(d.constants) ? { ...d, constants: d.constants.filter((c) => !(typeof c.id === "string" && c.id.startsWith(PARTNER_PREFIX))) } : doc;
    const values = valuesOf(own, file, SPRITE_SPEC, SPRITE_PREFIX);
    const out: Record<string, unknown> = {};
    const take = (id: string, check: (v: unknown) => boolean, what: string): void => {
        const v = values.get(SPRITE_PREFIX + id);
        if (v === undefined)
            throw new Error(`${file}: ${SPRITE_PREFIX}${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`${file}: ${SPRITE_PREFIX}${id} is not ${what}`);
        out[id] = Object.freeze(v);
    };
    for (const id of SPRITE_INT_IDS)
        take(id, isInt, "an integer");
    for (const id of SPRITE_INT_LIST_IDS)
        take(id, isIntList, "a list of integers");
    for (const id of SPRITE_NAME_IDS)
        take(id, isName, "a name");
    finish(values, [...SPRITE_INT_IDS, ...SPRITE_INT_LIST_IDS, ...SPRITE_NAME_IDS], file, SPRITE_PREFIX, SPRITE_ID_COUNT);
    const C = out as SpriteConstants;
    if (C.BAND_ENTRIES < 1)
        throw new Error(`${file}: BAND_ENTRIES must be at least 1`);
    return Object.freeze(out) as SpriteConstants;
}
export function soldierConstantsFrom(doc: unknown): SoldierConstants {
    const file = "ent_soldier.json";
    const values = valuesOf(doc, file, SOLDIER_SPEC, SOLDIER_PREFIX);
    const out: Record<string, unknown> = {};
    const take = (id: string, check: (v: unknown) => boolean, what: string, map: (v: unknown) => unknown = (v) => v): void => {
        const v = values.get(SOLDIER_PREFIX + id);
        if (v === undefined)
            throw new Error(`${file}: ${SOLDIER_PREFIX}${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`${file}: ${SOLDIER_PREFIX}${id} is not ${what}`);
        out[id] = Object.freeze(map(v));
    };
    for (const id of SOLDIER_INT_IDS)
        take(id, isInt, "an integer");
    for (const id of SOLDIER_INT_LIST_IDS)
        take(id, isIntList, "a list of integers");
    for (const id of SOLDIER_NAME_IDS)
        take(id, isName, "a name");
    for (const id of SOLDIER_VECTOR_IDS)
        take(id, isVectorNames, `an object with the names ${VECTOR_KEYS.join(", ")}`);
    for (const id of SOLDIER_INT_MAP_IDS) {
        take(id, isIntMap, "a map of counter -> bank state", (v) => new Map(Object.entries(v as Record<string, number>).map(([k, x]) => [Number(k), x] as const)));
    }
    const ai: Record<string, unknown> = {};
    const takeAi = (id: string, check: (v: unknown) => boolean, what: string, map: (v: unknown) => unknown = (v) => v): void => {
        const v = values.get(SOLDIER_PREFIX + SOLDIER_AI_PREFIX + id);
        if (v === undefined)
            throw new Error(`${file}: ${SOLDIER_PREFIX}${SOLDIER_AI_PREFIX}${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`${file}: ${SOLDIER_PREFIX}${SOLDIER_AI_PREFIX}${id} is not ${what}`);
        ai[id] = Object.freeze(map(v));
    };
    for (const id of SOLDIER_AI_INT_IDS)
        takeAi(id, isInt, "an integer");
    for (const id of SOLDIER_AI_INT_LIST_IDS)
        takeAi(id, isIntList, "a list of integers");
    for (const id of SOLDIER_AI_PAIR_LIST_IDS)
        takeAi(id, isPairList, "a list of (dx, dy) pairs", (v) => (v as number[][]).map((p) => Object.freeze([p[0]!, p[1]!] as const)));
    for (const id of SOLDIER_AI_CLASS_MAP_IDS) {
        takeAi(id, isIntListMap, "a map of line-of-sight value -> cell classes", (v) => {
            const m = new Map<number, number>();
            for (const [k, classes] of Object.entries(v as Record<string, number[]>)) {
                for (const cls of classes) {
                    if (m.has(cls))
                        throw new Error(`${file}: ${SOLDIER_PREFIX}${SOLDIER_AI_PREFIX}${id} lists class ${cls} under two values`);
                    m.set(cls, Number(k));
                }
            }
            return m;
        });
    }
    out["AI"] = Object.freeze(ai);
    const aiKnown = [...SOLDIER_AI_INT_IDS, ...SOLDIER_AI_INT_LIST_IDS, ...SOLDIER_AI_PAIR_LIST_IDS, ...SOLDIER_AI_CLASS_MAP_IDS].map((id) => SOLDIER_AI_PREFIX + id);
    const killKnown: string[] = [];
    const group = (name: string, intIds: readonly string[], extra: Array<[
        string,
        (v: unknown) => boolean,
        string,
        ((v: unknown) => unknown)?
    ]>): void => {
        const g: Record<string, unknown> = {};
        const takeG = (id: string, check: (v: unknown) => boolean, what: string, map: (v: unknown) => unknown = (v) => v): void => {
            const full = `${SOLDIER_PREFIX}${name}.${id}`;
            const v = values.get(full);
            if (v === undefined)
                throw new Error(`${file}: ${full} (used by the spec) is missing`);
            if (!check(v))
                throw new Error(`${file}: ${full} is not ${what}`);
            g[id] = Object.freeze(map(v));
            killKnown.push(`${name}.${id}`);
        };
        for (const id of intIds)
            takeG(id, isInt, "an integer");
        for (const [id, check, what, map] of extra)
            takeG(id, check, what, map);
        out[name] = Object.freeze(g);
    };
    const isTableId = (v: unknown): boolean => isName(v) && (ai[(v as string).slice((SOLDIER_PREFIX + SOLDIER_AI_PREFIX).length)] instanceof Map) && (v as string).startsWith(SOLDIER_PREFIX + SOLDIER_AI_PREFIX);
    const tableOf = (v: unknown): unknown => ai[(v as string).slice((SOLDIER_PREFIX + SOLDIER_AI_PREFIX).length)];
    const isStateNameMap = (v: unknown): boolean => !!v && typeof v === "object" && !Array.isArray(v) && Object.entries(v as Record<string, unknown>).every(([k, x]) => /^\d+$/.test(k) && isName(x));
    const stateNameMap = (v: unknown): unknown => new Map(Object.entries(v as Record<string, string>).map(([k, x]) => [Number(k), x] as const));
    const isFlagMasks = (v: unknown): boolean => !!v && typeof v === "object" && ["eye_zero", "eye_positive", "eye_negative"].every((k) => isInt((v as Record<string, unknown>)[k]));
    const isCones = (v: unknown): boolean => !!v && typeof v === "object" && Object.values(v as Record<string, unknown>).every((c) => !!c && typeof c === "object" && isInt((c as HitCone).default) && isInt((c as HitCone).alt) && isIntList((c as HitCone).characters));
    const isMagnitudes = (v: unknown): boolean => !!v && typeof v === "object" && Object.values(v as Record<string, unknown>).every((m) => !!m && typeof m === "object" && ["square", "linear", "fixed"].includes((m as HitMagnitude).kind));
    const isDrawFields = (v: unknown): boolean => Array.isArray(v) && v.every((f) => !!f && typeof f === "object" && isName((f as BurstDrawField).field) && isInt((f as BurstDrawField).shift) && isInt((f as BurstDrawField).mask) && isInt((f as BurstDrawField).bias) && isName((f as BurstDrawField).add_to));
    group("HIT", KILL_HIT_INT_IDS, [["FLAG_MASKS", isFlagMasks, "the three flag masks"], ["CONES", isCones, "a map of weapon id -> cone"], ["MAGNITUDES", isMagnitudes, "a map of weapon id -> magnitude rule"]]);
    group("DMG", KILL_DMG_INT_IDS, []);
    group("HURT", KILL_HURT_INT_IDS, []);
    group("DEATH", KILL_DEATH_INT_IDS, []);
    group("CORPSE", KILL_CORPSE_INT_IDS, []);
    group("BURST", KILL_BURST_INT_IDS, [
        ["VECTORS", isVectorNames, `an object with the names ${VECTOR_KEYS.join(", ")}`],
        ["DRAW", isDrawFields, "a list of draw fields"],
        ["CELL_VALUE_TABLE", isTableId, "the id of a class table of the AI group (ENT.SOLDIER.AI.*)", tableOf],
        ["LANDING_SECONDARY", isStateNameMap, "a map of landing state -> vector name", stateNameMap],
    ]);
    finish(values, [...SOLDIER_INT_IDS, ...SOLDIER_INT_LIST_IDS, ...SOLDIER_NAME_IDS, ...SOLDIER_VECTOR_IDS, ...SOLDIER_INT_MAP_IDS, ...aiKnown, ...killKnown], file, SOLDIER_PREFIX, SOLDIER_ID_COUNT);
    const E = out as SoldierConstants;
    if (E.AI.FOLD_ORDER.length !== 9)
        throw new Error(`${file}: AI.FOLD_ORDER has ${E.AI.FOLD_ORDER.length} entries, the fold back looks at nine cells (4.8)`);
    if (E.CORPSE_FRAMES.length !== E.CORPSE_FRAME_MASK + 1)
        throw new Error(`${file}: CORPSE_FRAMES has ${E.CORPSE_FRAMES.length} entries, CORPSE_FRAME_MASK + 1 is ${E.CORPSE_FRAME_MASK + 1}`);
    return Object.freeze(out) as SoldierConstants;
}

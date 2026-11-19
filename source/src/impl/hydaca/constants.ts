import type { ArtName, EntityTypeName, VectorName } from "../../world.js";
const NUMERIC_IDS = [
    "TILE", "ROW_STRIDE", "Z_FLOOR", "Z_CEILING", "Z_SPAWN", "WORLD_LIMIT", "FLOOR_TAG_MAX",
    "HP_SPAWN", "LEG_TIMER_SPAWN", "COOLDOWN_SPAWN", "SPAWN_RANGE", "SPAWN_CELL_CENTER",
    "SPAWN_MARKER_CLASS", "CORPSE_CLASS", "SPECIAL_CORPSE_CLASS", "SPAWN_FLAGS",
    "SPAWN_VIEW_PULLBACK_SHIFT", "BOB_SPEED_MIN", "BOB_PHASE_SHIFT", "BOB_PHASE_MASK",
    "COIN_MASK", "CEILING_DROP_MASK", "CEILING_DROP_CHANCE", "GRAB_MASK", "GRAB_CHANCE",
    "CRAWL_SHIFT", "CRAWL_MASK", "CRAWL_BASE", "LEG_RAND_SHIFT", "LEG_RAND_MASK", "LEG_DIST_SHIFT",
    "LEG_TIMER_MODULUS", "JITTER_SHIFT", "JITTER_HIGH_SHIFT", "JITTER_BYTE_MASK", "JITTER_BIAS", "JITTER_SCALE",
    "CHASE_SHIFT", "SPEED_MAX", "WALL_RUN_SPEED", "FALL_PUSH", "GRAVITY", "FRICTION_SHIFT",
    "PUSHOFF_LOW", "PUSHOFF_HIGH", "MAGNET_LIMIT", "MAGNET_RADIUS",
    "PROBE_REACH", "PROBE_EDGE_LOW", "PROBE_EDGE_HIGH", "PROBE_SPAN_LOW", "PROBE_SPAN_HIGH", "GRAB_CLASS",
    "CLOSE_RANGE", "BITE_RANGE", "BITE_COOLDOWN", "BITE_IMPULSE", "DIAGONAL_CLASS_MIN", "DIAGONAL_CLASS_MAX",
    "DAMAGE_BASE", "HIT_HOP", "KNOCK_LOSS_SHIFT", "UNIT_SHIFT", "KNOCK_OUT_SHIFT",
    "RETARGET_MASK", "PHASE_MODULUS", "DESPAWN_RANGE",
    "CORPSE_ART_STATE", "CORPSE_FRAME_MASK", "CORPSE_CELL_FRAME_MASK", "CORPSE_RETARGET_MASK", "CORPSE_FOLD_RANGE",
    "CORPSE_KNOCK_LOSS_SHIFT",
    "FLAG_CEILING_BIT", "FLAG_FAR_BIT", "FLAG_FLOOR_BIT", "FLAG_MOVING_BITS", "FLAG_ALIVE_BIT",
    "STATE_FLOOR", "STATE_CEILING", "STATE_AIR", "STATE_N_EAST", "STATE_N_WEST", "STATE_S_EAST",
    "STATE_S_WEST", "STATE_E_NORTH", "STATE_E_SOUTH", "STATE_W_NORTH", "STATE_W_SOUTH",
    "SPAWN_SOUND", "BITE_SOUND", "DEATH_SOUND", "VOICE_CHANNEL", "BITE_VOICE_ID", "SPAWN_VOICE_ID",
    "DEATH_VOICE_ID", "VOICE_PARAM",
    "POSE_FLOOR", "POSE_CEILING", "POSE_TUMBLE", "POSE_HOP", "POSE_DYING", "VARIANT_CYCLE", "VARIANT_A",
    "VARIANT_B", "DYING_Z_SPLIT", "POSE_WALL_FRONT_A", "POSE_WALL_FRONT_B", "POSE_WALL_SIDE_A1",
    "POSE_WALL_SIDE_A2", "POSE_WALL_SIDE_B1", "POSE_WALL_SIDE_B2",
] as const;
const LIST_IDS = ["WALL_POSES", "CREATURE_BLOCKED_CLASSES", "BOB_ANGLE_OFFSETS"] as const;
type NumericId = (typeof NUMERIC_IDS)[number];
type ListId = (typeof LIST_IDS)[number];
export type HydConstants = {
    readonly [K in NumericId]: number;
} & {
    readonly [K in ListId]: readonly number[];
};
interface DataConstant {
    id: string;
    value: number | number[];
    unit: string;
    meaning: string;
}
interface DataFile {
    format: string;
    spec: string;
    name: string;
    constants: DataConstant[];
}
const PREFIX = "HYD.";
export function hydConstantsFrom(docIn: unknown): HydConstants {
    const doc = docIn as DataFile;
    const where = "hydaca";
    if (!doc || doc.format !== "zt-spec-data/1" || doc.spec !== "ZT-ENT-HYD") {
        throw new Error(`${where}: not the zt-spec-data/1 file of ZT-ENT-HYD`);
    }
    const byId = new Map<string, number | number[]>();
    for (const c of doc.constants) {
        if (!c.id.startsWith(PREFIX))
            throw new Error(`${where}: id ${c.id} does not start with ${PREFIX}`);
        const key = c.id.slice(PREFIX.length);
        if (byId.has(key))
            throw new Error(`${where}: duplicate id ${c.id}`);
        byId.set(key, c.value);
    }
    const out: Record<string, number | readonly number[]> = {};
    for (const id of NUMERIC_IDS) {
        const v = byId.get(id);
        if (typeof v !== "number")
            throw new Error(`${where}: ${PREFIX}${id} missing or not a number`);
        out[id] = v;
    }
    for (const id of LIST_IDS) {
        const v = byId.get(id);
        if (!Array.isArray(v) || !v.every((x) => typeof x === "number"))
            throw new Error(`${where}: ${PREFIX}${id} missing or not a list of numbers`);
        out[id] = Object.freeze([...v]);
    }
    return Object.freeze(out) as unknown as HydConstants;
}
const blockedCache = new WeakMap<object, ReadonlySet<number>>();
export function blockedClassesOf(C: HydConstants): ReadonlySet<number> {
    let s = blockedCache.get(C);
    if (!s) {
        s = new Set(C.CREATURE_BLOCKED_CLASSES);
        blockedCache.set(C, s);
    }
    return s;
}
export const VECTORS = {
    live: {
        aiFirst: "enemy.rec3.ai" as VectorName,
        ai: "enemy.rec3.ai_alt1" as VectorName,
        draw: "enemy.rec3.draw" as VectorName,
        damage: "enemy.rec3.damage" as VectorName,
        death: "enemy.death.a" as VectorName,
    },
    corpse: {
        ai: "enemy.rec3.corpse.ai" as VectorName,
        draw: "enemy.rec3.corpse.draw" as VectorName,
        damage: "enemy.rec3.corpse.damage" as VectorName,
        death: "enemy.corpse_death.a" as VectorName,
    },
    special: {
        ai: "enemy.gib.ai" as VectorName,
        draw: "enemy.gib.draw" as VectorName,
        damage: "enemy.gib.damage" as VectorName,
        death: "enemy.corpse_death.a" as VectorName,
    },
} as const;
export const SPECIAL_CORPSE = {
    type: "enemy.gib" as EntityTypeName,
    art: "enemy.gib.art" as ArtName,
} as const;

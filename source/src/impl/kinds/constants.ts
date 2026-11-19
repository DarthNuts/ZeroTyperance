import { specDataFrom, typedConstants } from "../tick/spec_data.js";
const STAMP_IDS = ["CORPSE_STAMP_ORDER"] as const;
function stampOrder(v: unknown, where: string): ReadonlyArray<readonly [
    number,
    number
]> {
    if (!Array.isArray(v) || !v.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number")))
        throw new Error(`${where}: CORPSE_STAMP_ORDER is not a list of [dx, dy]`);
    return v as ReadonlyArray<readonly [
        number,
        number
    ]>;
}
const DOG_IDS = [
    "MARKER_CLASS", "SPAWN_FLAGS", "SPAWN_HP", "SPAWN_COUNTER", "SPAWN_Z", "SPAWN_SOUND", "LIVE_FLAGS", "CORPSE_FLAGS", "CORPSE_FLAG_MASK", "CORPSE_CLASS",
    "STATE_APPROACH", "CHARGE_STATE", "RETREAT_STATE", "PAIN_STATE", "CORPSE_STATE", "WALK_SHIFT", "WALK_LIMIT", "TRIGGER_RANGE",
    "CHARGE_DIST_SHIFT", "CHARGE_ADD", "CHARGE_REFRESH_MASK", "CHARGE_SHIFT", "CHARGE_LIMIT", "RETREAT_SHIFT_X", "RETREAT_SHIFT_Y", "RETREAT_COUNTER",
    "ARRIVE_DIST", "HOME_SHIFT", "HOME_MASK", "HOME_BIAS", "BITE_RANGE", "DIAG_FIRST", "DIAG_LAST", "BITE_IMPULSE", "BITE_SOUND", "BITE_KNOCKBACK_SHIFT",
    "PAIN_STOP_SPEED", "PAIN_VEL_SHIFT", "PUSH_LOW", "PUSH_HIGH", "MAGNET_LIMIT", "MAGNET_SHIFT", "RETARGET_MASK", "FOLD_RANGE",
    "DMG_BASE", "DMG_VEL_SHIFT", "CORPSE_VEL_SHIFT", "BURST_LOSS", "BURST_COUNT_SHIFT", "BURST_COUNT_ADD", "DEATH_SOUND",
    "CORPSE_STAMP_RANGE", "CORPSE_RETARGET_MASK", "CORPSE_DOOR_CLAMP_LOW", "CORPSE_DOOR_CLAMP_HIGH", "CORPSE_DOOR_SOUND",
    "POSE_STAND", "POSE_RUN", "POSE_LUNGE", "POSE_PAIN", "POSE_DYING", "POSE_CORPSE",
] as const;
export type DogConstants = ReturnType<typeof dogConstantsFrom>;
export function dogConstantsFrom(doc: unknown) {
    const where = "dog";
    const t = typedConstants(specDataFrom(doc, "ZT-ENT-DOG", "DOG.", where), where, DOG_IDS, [], STAMP_IDS);
    return { ...t, CORPSE_STAMP_ORDER: stampOrder(t.CORPSE_STAMP_ORDER, where) };
}
const IMP_IDS = [
    "MARKER_CLASS", "SPAWN_FLAGS", "SPAWN_HP", "SPAWN_COUNTER", "SPAWN_Z", "SPAWN_SOUND", "CORPSE_FLAGS", "CORPSE_FLAG_MASK", "CORPSE_CLASS",
    "STATE_WANDER", "STATE_ARMED", "STATE_PAIN", "WALK_SHIFT", "WALK_LIMIT", "ARMED_COUNTER", "BITE_COUNTER", "BITE_RANGE", "BITE_IMPULSE", "BITE_SOUND",
    "DEATH_SOUND", "PAIN_STOP_SPEED", "PAIN_VEL_SHIFT", "PLAN_COUNTER_SHIFT", "PLAN_COUNTER_MASK", "PLAN_HOME_SHIFT", "PLAN_HOME_MASK", "PLAN_HOME_BIAS",
    "PUSH_LOW", "PUSH_HIGH", "MAGNET_LIMIT", "MAGNET_SHIFT", "RETARGET_MASK", "FOLD_RANGE", "DMG_BASE", "DMG_VEL_SHIFT", "CORPSE_VEL_SHIFT",
    "BURST_LOSS", "BURST_COUNT_SHIFT", "BURST_COUNT_ADD", "CORPSE_STAMP_RANGE", "CORPSE_RETARGET_MASK",
    "POSE_STAND", "POSE_ARMED", "POSE_BITE", "POSE_PAIN", "POSE_DYING", "POSE_CORPSE",
] as const;
export type ImpConstants = ReturnType<typeof impConstantsFrom>;
export function impConstantsFrom(doc: unknown) {
    const where = "imp";
    const t = typedConstants(specDataFrom(doc, "ZT-ENT-IMP", "IMP.", where), where, IMP_IDS, [], STAMP_IDS);
    return { ...t, CORPSE_STAMP_ORDER: stampOrder(t.CORPSE_STAMP_ORDER, where) };
}
const SF_IDS = [
    "MARKER_CLASS", "SPAWN_FLAGS", "SPAWN_HP", "SPAWN_COUNTER", "SPAWN_Z", "SPAWN_SOUND", "CORPSE_FLAG_MASK", "CORPSE_FLAGS", "CORPSE_CLASS",
    "STATE_WAIT", "STATE_ATTACK", "STATE_HURT", "STATE_CORPSE", "STATE_LOOTED", "STATE_WINDUP", "WALK_SHIFT", "WALK_LIMIT", "PUSH_LOW", "PUSH_HIGH", "MAGNET_LIMIT", "MAGNET_SHIFT",
    "HURT_STOP_SPEED", "HURT_VEL_SHIFT", "ATTACK_COUNTER", "ATTACK_ODDS_MASK", "THROW_MIN_RANGE", "SHOT_COUNTER", "CUE_COUNTER_A", "CUE_COUNTER_B", "THROW_COUNTER",
    "SOUND_A", "SOUND_B", "THROW_SOUND", "HIT_RANGE", "ROLL_SHIFT", "ROLL_MASK", "THRESH_GROUND", "THRESH_AIR_MODE0", "THRESH_AIR",
    "PLAN_FAR_RANGE", "PLAN_FAR_COUNTER", "PLAN_COUNTER_MASK", "PLAN_DIST_SHIFT", "PLAN_HOME_SHIFT", "PLAN_HOME_MASK", "PLAN_HOME_BIAS",
    "DMG_BASE", "DMG_VEL_SHIFT", "CORPSE_VEL_SHIFT", "BURST_LOSS", "BURST_COUNT_SHIFT", "BURST_COUNT_ADD", "DEATH_SOUND", "CORPSE_STAMP_RANGE", "CORPSE_LOOT_RANGE", "RETARGET_MASK", "FOLD_RANGE",
    "GRENADE_FLAGS", "GRENADE_LIFE", "GRENADE_SPEED_SHIFT", "GRENADE_START_Z", "GRENADE_START_VZ", "GRENADE_FLOOR_Z", "GRENADE_GRAVITY", "GRENADE_BOUNCE_SHIFT", "GRENADE_BOUNCE_MIN",
    "GRENADE_BOUNCE_SOUND", "GRENADE_BLAST_SOUND", "GRENADE_BLAST_FLAG_MASK", "GRENADE_SHOT_LIMIT",
] as const;
export type SfConstants = ReturnType<typeof sfConstantsFrom>;
export function sfConstantsFrom(doc: unknown) {
    const where = "sf";
    return typedConstants(specDataFrom(doc, "ZT-ENT-SF", "SF.", where), where, SF_IDS, [], []);
}
const SERGEANT_IDS = [
    "MARKER_CLASS", "SPAWN_HP", "SPAWN_SOUND", "CORPSE_CLASS", "DEATH_SOUND", "ATTACK_ODDS_MASK", "PLAN_COUNTER_MASK",
    "LUNGE_TIMER_BASE", "LUNGE_TIMER_SHIFT", "LUNGE_TIMER_MASK", "HURT_TIMER", "CHANGE_STATE", "CHANGE_CALLS", "CHANGE_HOME_SHIFT", "CHANGE_TIMER_AFTER", "CHANGE_ALIVE_CLASS", "CHANGE_DEAD_CLASS",
] as const;
export type SergeantConstants = ReturnType<typeof sergeantConstantsFrom>;
export function sergeantConstantsFrom(doc: unknown) {
    const where = "sergeant";
    return typedConstants(specDataFrom(doc, "ZT-ENT-SERGEANT", "SERGEANT.", where), where, SERGEANT_IDS, [], []);
}

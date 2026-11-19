import { specDataFrom, typedConstants } from "../tick/spec_data.js";
const NUMERIC_IDS = [
    "MARKER_CLASS", "SPAWN_FLAGS", "SPAWN_HP", "SPAWN_COUNTER", "SPAWN_Z", "CORPSE_FLAG_MASK", "CORPSE_CLASS",
    "WALK_SHIFT", "WALK_LIMIT", "PROBE_STEPS", "MOVE_SLOW_SHIFT", "PUSH_LOW", "PUSH_HIGH", "MAGNET_LIMIT", "MAGNET_SHIFT",
    "PAIN_STOP_SPEED", "PAIN_VEL_SHIFT", "PAIN_COUNTER", "WINDUP_COUNTER", "SHOT_COUNTER",
    "HEADING_DIST_SHIFT", "HEADING_RAND_SHIFT", "HEADING_RAND_MASK",
    "HOME_SHIFT", "HOME_MASK", "HOME_BIAS", "HOME_Y_SHIFT",
    "SHOT_VZ_SHIFT", "SHOT_VZ_MASK", "SHOT_VZ_BIAS", "SHOT_STEP_SHIFT", "SHOT_START_Z", "SHOT_START_HALF_SHIFT", "SHOT_SOUND",
    "LOS_PROBE", "DMG_BASE", "DMG_VEL_SHIFT", "EXPOSED_MIN_COUNTER", "BURST_LOSS", "BURST_CALLS", "DEFEAT_SOUND", "EXIT_START",
    "CORPSE_STAMP_RANGE", "SHOT_Z_LIMIT", "SHOT_HIT_RANGE", "SHOT_IMPULSE", "SHOT_HIT_Z", "SHOT_HIT_SOUND",
    "POSE_STATE_0", "POSE_WINDUP", "POSE_SHOT", "POSE_PAIN", "POSE_DYING", "POSE_CORPSE", "DOOR_SOUND",
] as const;
const LIST_IDS = ["DOOR_CLASSES_A", "DOOR_CLASSES_B"] as const;
const OTHER_IDS = ["CORPSE_STAMP_ORDER"] as const;
export type BossConstants = ReturnType<typeof bossConstantsFrom>;
export function bossConstantsFrom(doc: unknown) {
    const where = "boss";
    const t = typedConstants(specDataFrom(doc, "ZT-ENT-BOSS", "BOSS.", where), where, NUMERIC_IDS, LIST_IDS, OTHER_IDS);
    const order = t.CORPSE_STAMP_ORDER as unknown;
    if (!Array.isArray(order) || !order.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number")))
        throw new Error(`${where}: CORPSE_STAMP_ORDER is not a list of [dx, dy]`);
    return { ...t, CORPSE_STAMP_ORDER: order as ReadonlyArray<readonly [
            number,
            number
        ]> };
}
const BOSS2_NUMERIC_IDS = [
    "MARKER_CLASS", "SPAWN_FLAGS", "SPAWN_HP", "SPAWN_COUNTER", "SPAWN_Z", "CORPSE_FLAG_MASK", "CORPSE_CLASS", "WALK_SHIFT", "WALK_LIMIT", "PROBE_STEPS", "DOOR_SOUND", "MOVE_SLOW_SHIFT",
    "PUSH_LOW", "PUSH_HIGH", "MAGNET_LIMIT", "MAGNET_SHIFT", "PAIN_STOP_SPEED", "PAIN_VEL_SHIFT", "PAIN_COUNTER", "WINDUP_COUNTER", "ATTACK_COUNTER_HIGH", "ATTACK_COUNTER_LOW", "LOS_PROBE",
    "ATTACK_IMPULSE", "ATTACK_RANGE", "ATTACK_SOUND", "HEADING_DIST_SHIFT", "HEADING_RAND_SHIFT", "HEADING_RAND_MASK", "HOME_SHIFT", "HOME_MASK", "HOME_BIAS", "HOME_Y_SHIFT",
    "EXPOSED_MIN_COUNTER", "DMG_BASE", "DMG_VEL_SHIFT", "BURST_LOSS", "BURST_CALLS", "DEFEAT_SOUND", "EXIT_START", "CORPSE_STAMP_RANGE",
    "POSE_STAND", "POSE_PAIN", "POSE_DYING", "POSE_WINDUP", "POSE_ATTACK", "POSE_CORPSE",
] as const;
export type Boss2Constants = ReturnType<typeof boss2ConstantsFrom>;
export function boss2ConstantsFrom(doc: unknown) {
    const where = "boss2";
    const t = typedConstants(specDataFrom(doc, "ZT-ENT-BOSS2", "BOSS2.", where), where, BOSS2_NUMERIC_IDS, LIST_IDS, OTHER_IDS);
    return { ...t, CORPSE_STAMP_ORDER: t.CORPSE_STAMP_ORDER as ReadonlyArray<readonly [
            number,
            number
        ]> };
}
const BOSS3_NUMERIC_IDS = [
    "MARKER_CLASS", "CORPSE_CLASS", "SPAWN_FLAGS", "CORPSE_FLAG_MASK", "SPAWN_HP", "SECOND_HP", "SPAWN_COUNTER", "SPAWN_SOUND", "WALK_SHIFT", "WALK_LIMIT", "MOVE_SLOW_SHIFT", "PROBE_STEPS", "DOOR_SOUND",
    "PUSH_LOW", "PUSH_HIGH", "MAGNET_LIMIT", "MAGNET_SHIFT", "ARRIVE_DIST", "SHOT_STATE", "PAIN_STATE", "CORPSE_STATE", "TRANSFORM_STATE", "ATTACK_COUNTER", "SHOT_COUNTER_HIGH", "SHOT_COUNTER_LOW",
    "PUNCH_COUNTER", "PUNCH_RANGE", "PUNCH_IMPULSE", "PUNCH_SOUND", "SHOT_IMPULSE", "SHOT_SOUND", "SHOT_RANGE", "SHOT_HP_BELOW", "CHOICE_SHOT_BIT", "CHOICE_PUNCH_SHIFT",
    "HEADING_DIST_SHIFT", "HEADING_RAND_SHIFT", "HEADING_RAND_MASK", "HOME_SHIFT", "HOME_MASK", "HOME_BIAS", "PAIN_COUNTER", "PAIN_STOP_SPEED", "PAIN_VEL_SHIFT", "TRANSFORM_COUNTER", "TRANSFORM_DRAW_MIN",
    "EXPOSED_MIN_COUNTER", "DMG_BASE", "DMG_VEL_SHIFT", "BURST_CALLS", "BURST_PARTICLES", "BURST_LIVE_MAX", "CORPSE_VEL_SHIFT", "DEFEAT_SOUND", "EXIT_START", "CORPSE_STAMP_RANGE", "LOS_PROBE",
    "ROLL_SHIFT", "ROLL_MASK", "THRESH_GROUND", "THRESH_AIR_MODE0", "THRESH_AIR",
    "POSE_STAND", "POSE_BLOW_REST", "POSE_BLOW", "POSE_SHOT", "POSE_PAIN", "POSE_DYING", "POSE_TRANSFORM", "POSE_TRANSFORM_FLICKER", "POSE_TRANSFORM_END", "POSE_CORPSE",
] as const;
export type Boss3Constants = ReturnType<typeof boss3ConstantsFrom>;
export function boss3ConstantsFrom(doc: unknown) {
    const where = "boss3";
    return typedConstants(specDataFrom(doc, "ZT-ENT-BOSS3", "BOSS3.", where), where, BOSS3_NUMERIC_IDS, ["DOOR_CLASSES_A", "DOOR_CLASSES_B", "PUNCH_STATES"] as const, []);
}

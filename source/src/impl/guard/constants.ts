export interface GuardConstants {
    readonly HEADING: ReadonlyArray<readonly [
        number,
        number
    ]>;
    readonly PROBE_CELLS: number;
    readonly LOOK_CELLS: number;
    readonly CELL_CENTRE: number;
    readonly VEL_SCALE: number;
    readonly NEAR: number;
    readonly LOOK: number;
    readonly HEADING_MASK: number;
    readonly WALK_SHIFT: number;
    readonly WALK_LIMIT: number;
    readonly ARRIVE: number;
    readonly STAND_COUNTER: number;
    readonly REACH: number;
    readonly STRIKE_IMPULSE: number;
    readonly STRIKE_SOUND: number;
    readonly SHOT_COUNTER: number;
    readonly CUE_COUNTERS: readonly number[];
    readonly SHOT_ROLL: number;
    readonly SHOT_ROLL_AIR_MODE0: number;
    readonly SHOT_ROLL_AIR: number;
    readonly NO_ROLL_MODE: number;
    readonly ROLL_SHIFT: number;
    readonly ROLL_MASK: number;
    readonly SHOT_SCALE: number;
    readonly SHOT_RANGE: number;
    readonly SHOT_SOUND: number;
    readonly REROLL_COUNTER_SHIFT: number;
    readonly REROLL_COUNTER_MASK: number;
    readonly REROLL_DISTANCE_SHIFT: number;
    readonly WALK_STATE: number;
    readonly WAYPOINT_SPREAD: number;
    readonly WAYPOINT_BIAS: number;
    readonly WAYPOINT_SHIFTS: readonly [
        number,
        number
    ];
    readonly ALERT_RANGE: number;
    readonly ALERT_SOUND: number;
    readonly WANDER_STATE_LIMIT: number;
    readonly STAND_STATE: number;
    readonly PAIN_STATE: number;
    readonly PAIN_SHIFT: number;
    readonly PAIN_COUNTER: number;
    readonly DAMAGE_BASE: number;
    readonly PAIN_PUSH: number;
    readonly UNIT_SHIFT: number;
    readonly VELOCITY_SHIFT: number;
    readonly LETHAL_LOSS_SHIFT: number;
    readonly CORPSE_LOSS_SHIFT: number;
    readonly DEATH_SOUND: number;
    readonly CORPSE_FLAG_MASK: number;
    readonly CORPSE_STATE: number;
    readonly LOOT_STATE: number;
    readonly LOOT_ITEM: number;
    readonly LOOT_ROUND_BASE: number;
    readonly LOOT_ROUND_SHIFT: number;
    readonly LOOT_ROUND_MASK: number;
    readonly LOOT_AMOUNT_UNIT: number;
    readonly LOOT_SOUND: number;
    readonly WALK_MIN_SPEED: number;
    readonly BYTE_MASK: number;
    readonly DRAW: GuardDrawTable;
    readonly CORPSE_BANK: number;
    readonly CORPSE_FRAME_MASK: number;
}
export interface GuardDrawTable {
    readonly BANK: string;
    readonly OVERRIDE: number;
    readonly PAIN: ReadonlyArray<readonly [
        number,
        number,
        number
    ]>;
    readonly PAIN_LETHAL: ReadonlyArray<readonly [
        number,
        number,
        number
    ]>;
    readonly STAND_CUE: readonly [
        number,
        number
    ];
    readonly STAND_PLAYER: readonly [
        number,
        number
    ];
    readonly STAND_OTHER: readonly [
        number,
        number
    ];
    readonly WANDER: number;
}
export const GUARD: GuardConstants = Object.freeze({
    HEADING: Object.freeze([[0, -16], [-16, -16], [-16, 0], [-16, 16], [0, 16], [16, 16], [16, 0], [16, -16]] as const),
    PROBE_CELLS: 16,
    LOOK_CELLS: 32,
    CELL_CENTRE: 128,
    VEL_SCALE: 2,
    NEAR: 300,
    LOOK: 384,
    HEADING_MASK: 7,
    WALK_SHIFT: 1,
    WALK_LIMIT: 32,
    ARRIVE: 4,
    STAND_COUNTER: 10,
    REACH: 64,
    STRIKE_IMPULSE: 900,
    STRIKE_SOUND: 27,
    SHOT_COUNTER: 6,
    CUE_COUNTERS: Object.freeze([5, 4]),
    SHOT_ROLL: 768,
    SHOT_ROLL_AIR_MODE0: 512,
    SHOT_ROLL_AIR: 379,
    NO_ROLL_MODE: 0,
    ROLL_SHIFT: 8,
    ROLL_MASK: 1023,
    SHOT_SCALE: 2,
    SHOT_RANGE: 1024,
    SHOT_SOUND: 30,
    REROLL_COUNTER_SHIFT: 16,
    REROLL_COUNTER_MASK: 15,
    REROLL_DISTANCE_SHIFT: 7,
    WALK_STATE: 8,
    WAYPOINT_SPREAD: 511,
    WAYPOINT_BIAS: 256,
    WAYPOINT_SHIFTS: [4, 20] as const,
    ALERT_RANGE: 1024,
    ALERT_SOUND: 113,
    WANDER_STATE_LIMIT: 8,
    STAND_STATE: 9,
    PAIN_STATE: 10,
    PAIN_SHIFT: 1,
    PAIN_COUNTER: 10,
    DAMAGE_BASE: 1024,
    PAIN_PUSH: 14,
    UNIT_SHIFT: 8,
    VELOCITY_SHIFT: 8,
    LETHAL_LOSS_SHIFT: 3,
    CORPSE_LOSS_SHIFT: 4,
    DEATH_SOUND: 39,
    CORPSE_FLAG_MASK: 65327,
    CORPSE_STATE: 11,
    LOOT_STATE: 12,
    LOOT_ITEM: 10,
    LOOT_ROUND_BASE: 2,
    LOOT_ROUND_SHIFT: 8,
    LOOT_ROUND_MASK: 1,
    LOOT_AMOUNT_UNIT: 256,
    LOOT_SOUND: 105,
    WALK_MIN_SPEED: 4,
    BYTE_MASK: 255,
    CORPSE_BANK: 7,
    CORPSE_FRAME_MASK: 1,
    DRAW: Object.freeze({
        BANK: "enemy.rec4.art",
        OVERRIDE: -1,
        PAIN: Object.freeze([[9, 255, 3], [7, 8, 10], [5, 6, 9], [3, 4, 10], [0, 2, 3]] as const),
        PAIN_LETHAL: Object.freeze([[9, 255, 8], [7, 8, 4], [5, 6, 6], [0, 4, 5]] as const),
        STAND_CUE: [4, 6] as const,
        STAND_PLAYER: [2, 1] as const,
        STAND_OTHER: [12, 11] as const,
        WANDER: 0,
    }),
});

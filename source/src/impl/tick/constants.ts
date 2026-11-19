export const TICK = Object.freeze({
    RECOUNT_PERIOD: 64,
    PHASE_ADVANCE: 1,
    EXIT_START: 15,
    DEATH_HP_MAX: 1,
    DEATH_LIMIT: 30,
    BLANK: Object.freeze({ FRAME: 1, VOICE: -1, LINK: 1 }),
    REMOVE_POSITION_MAX: 8191,
    REMOVE_FLOOR_MAX: 15,
    KEEP_FLAG: 32,
    TIMER_STEP: 1,
    TIMER_RUN_BELOW: 0,
    DEMO_COUNT: 200,
    DEMO_SEED_BYTES: 4,
    COUNTED_CLASSES: Object.freeze([41, 42, 43, 101, 102, 103, 104, 105, 106, 107]) as readonly number[],
    COUNT_CAP: 99,
    TILES: Object.freeze({
        EPISODE: 1,
        WRAP: 8,
        OFFSET_STEP: 64,
        OFFSET_MASK: 255,
        PHASE_MASK: 56,
        PHASE_SHIFT: 16,
        CURSOR_RESET: 2,
        PAIRS: Object.freeze([Object.freeze([331, 332]), Object.freeze([370, 371]), Object.freeze([386, 488])]) as readonly (readonly number[])[],
    }),
    SNIPER_GATE_IDLE: 0,
});
export const RAY = Object.freeze({
    SKIP_CLASSES: Object.freeze([18, 19, 20, 21, 22, 23, 50, 51, 52, 60, 61, 62, 63, 68, 69, 70, 71, 76, 77, 78, 79, 81, 82, 83, 85, 86, 87, 89, 90, 91]) as readonly number[],
    STEPS: 32,
    POSITION_SHIFT: 3,
    SOLID_CLASSES: Object.freeze([1, 12, 13, 14, 15, 16, 17, 48, 56, 57, 58, 59, 64, 65, 66, 67, 72, 73, 74, 75, 121, 122, 123, 124, 125, 126, 127, 128, 131, 132]) as readonly number[],
    DOOR_CLASSES: Object.freeze([6, 7]) as readonly number[],
    DIAGONAL_XF_GT_YF: 2,
    DIAGONAL_XF_GT_255_MINUS_YF: 3,
    DIAGONAL_XF_LT_YF: 4,
    DIAGONAL_XF_LT_255_MINUS_YF: 5,
    FRACTION_MASK: 255,
    ABSORB: Object.freeze([
        Object.freeze([1, 110, 111, 145, 146, 147, 148, 149, 150]) as readonly number[],
        Object.freeze([1, 143, 163]) as readonly number[],
        Object.freeze([]) as readonly number[],
    ]) as ReadonlyArray<readonly number[]>,
    ABSORB_EYE_NOT_NEGATIVE: Object.freeze([Object.freeze([]) as readonly number[], Object.freeze([3, 6, 7, 8, 162]) as readonly number[], Object.freeze([]) as readonly number[]]) as ReadonlyArray<readonly number[]>,
    STATE: 3,
    TIMER: 0,
    FLAGS: 1,
    VECTORS: Object.freeze({ ai: "impact.hit.ai", draw: "impact.hit.draw", damage: "none", death: "remove", secondary: "none" }),
    Z_WORD: 0,
    STATE_STEP: 1,
    Z_STEP: 2,
    STATE_BITS: 8,
    TILE_STEPS: 9,
    TILE_VECTOR_SHIFT: 2,
    TILE_STEP_UP: Object.freeze([Object.freeze([121, 122]), Object.freeze([123, 124]), Object.freeze([127, 128])]) as ReadonlyArray<readonly number[]>,
});
export const CONTROLLER_MODE = Object.freeze({
    PAD: 0,
    PLAYBACK: 1,
    RECORDER: 2,
    ENDED_BY_START: 3,
});
export const PAD_BIT = Object.freeze({ UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3, B: 4, C: 5, A: 6, START: 7 });
export const TIMER_BITS = 8;
export const FLAG_IN_USE = 1;
export const FLAG_ON_FLOOR = 4;
export const FLAG_ALIVE = 16;
export const GRID_SIDE = 32;
export const FLOOR_CELLS = GRID_SIDE * GRID_SIDE;
export const FLOOR_COUNT = 16;
export const HEX_PER_BLOCK = 2;
export const WINDOW_RADIUS = 2;
export const WINDOW_SIDE = 2 * WINDOW_RADIUS + 1;

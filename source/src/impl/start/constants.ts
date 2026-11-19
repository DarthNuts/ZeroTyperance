export const START = Object.freeze({
    CLASS_START: 119,
    NO_START_CELL: 648,
    COUNTED_CLASSES: Object.freeze([41, 42, 43, 101, 102, 103, 104, 105, 106, 107]) as readonly number[],
    COUNT_CAP: 99,
    LOWERING: 32,
    READER_DEMO: 4,
    CELL_CENTRE: 128,
    SKIP_LOADOUT_EPISODE: 1,
    SKIP_LOADOUT_FLOOR: 15,
    REWRITE: Object.freeze([
        ...Array.from({ length: 40 - 24 + 1 }, (_, i) => [24 + i, 0] as const),
        [54, 0] as const,
        [130, 0] as const, [131, 0] as const, [132, 0] as const,
        [41, 44] as const, [42, 108] as const, [43, 109] as const,
        ...Array.from({ length: 7 }, (_, i) => [101 + i, 110 + i] as const),
        [121, 122] as const, [123, 124] as const, [125, 126] as const, [127, 128] as const,
    ]) as ReadonlyArray<readonly [
        number,
        number
    ]>,
});
export const LEVEL_BYTE_FLOOR_MASK = 0x0f;
export const LEVEL_BYTE_EPISODE_SHIFT = 4;
export const LEVEL_BYTE_EPISODE_MASK = 0x03;
export const CELL_SIZE = 256;
export const ROUND = 256;
export const GRID_SIDE = 32;
export const RING: readonly number[] = Object.freeze([0, 1, 2, 3, 4]);
export const DEMO_COUNT = 200;
export const WEAPON_NONE = 255;
export const WEAPON_FISTS = 0;
export const PASSIVE_ABSENT = -1;
export const HEX_PER_BLOCK = 2;
export const EPISODE_BY_INDEX = Object.freeze(["spaceship", "highrise", "basement"] as const);
export const CHARACTER_BY_INDEX = Object.freeze(["ishii", "haile", "wolf", "ramos", "gjoerup"] as const);
export const ATTRACT = Object.freeze({
    PICK_DIVISOR: 86,
    CHARACTER_BIT: 1024,
    CHARACTER_SET: 4,
    CHARACTER_CLEAR: 0,
    DEMO_POLLS: 200,
    READER_START: 4,
});
export const START_SCREEN = Object.freeze({
    SELECT_FADEOUT: 28,
    LEAD_FRAMES: 75,
    FADE_PASSES: 44,
    BLACK_FRAMES: 17,
    OFF_FIRST: 17,
    OFF_LAST: 30,
    TARGET_FIRST: 23,
    TARGET_LAST: 29,
    FADE_START: 31,
    PICTURE_START: 32,
    STEP_FIRST_PASS: 2,
    STEP_PERIOD: 2,
    CHANNEL_ORDER: Object.freeze(["green", "blue", "red"] as const),
    STEP_SIZE: 2,
    LEVELS: 7,
    ENTRIES: 64,
    QUIET_END: 2,
    QUIET_CAP: 20,
    COLOUR_MASK: 0x0eee,
    MUSIC_FRAME: 17,
});
export const PICK_SHIFT = 16;
export const PICK_MASK = 255;

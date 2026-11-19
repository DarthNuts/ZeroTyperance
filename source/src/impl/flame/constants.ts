import { specDataFrom, typedConstants } from "../tick/spec_data.js";
const NUMERIC_IDS = [
    "ITEM", "PRESS_COST", "HOLD_COST", "SOUND_PRESS", "SOUND_BURST", "SOUND_FLOOR", "FRAME_PRESS",
    "SPREAD_X_SHIFT", "SPREAD_Y_SHIFT", "SPAWN_OFFSET_MAX", "SPAWN_Z_BELOW_EYE", "VZ_START",
    "FUSE_NONE", "AIM_CONE", "FUSE_LEAD", "FUSE_SHIFT", "Z_BURST", "FLAME_Z", "FLAME_LIFE", "RANGE_MAX",
    "LOSS_BASE", "GIB_LOSS", "PARTICLE_SHIFT", "PARTICLE_BASE", "BURN_RANGE", "BURN_LOSS", "CRAB_DEATH_WITHIN",
    "PILE_BLOCK", "FOLD_DIST",
] as const;
const LIST_IDS = ["WALL_TABLE"] as const;
const OTHER_IDS = ["FOLD_ORDER", "EXPECT"] as const;
export type FlameConstants = ReturnType<typeof flameConstantsFrom>;
export function flameConstantsFrom(doc: unknown) {
    const where = "flame";
    const t = typedConstants(specDataFrom(doc, "ZT-WORLD-FLAME", "FLAME.", where), where, NUMERIC_IDS, LIST_IDS, OTHER_IDS);
    const order = t.FOLD_ORDER as unknown;
    if (!Array.isArray(order) || !order.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number")))
        throw new Error(`${where}: FOLD_ORDER is not a list of [dx, dy]`);
    return { ...t, FOLD_ORDER: order as ReadonlyArray<readonly [
            number,
            number
        ]> };
}

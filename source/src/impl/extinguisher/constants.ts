import { specDataFrom, typedConstants } from "../tick/spec_data.js";
const NUMERIC_IDS = ["ITEM", "SOUND", "AMMO_STEP", "ANIM_RECORDED", "FLAME_CLASS", "REACH_SHIFT", "CELL_CENTER", "FLAME_Z", "FLAME_LIFE", "SUIT_ITEM", "SUIT_DRAIN", "BURN_SOUND", "BURN_LOSS_BASE"] as const;
const OTHER_IDS = ["EXPECT"] as const;
export type ExtinguisherConstants = ReturnType<typeof extinguisherConstantsFrom>;
export function extinguisherConstantsFrom(doc: unknown) {
    const where = "extinguisher";
    return typedConstants(specDataFrom(doc, "ZT-WORLD-EXTINGUISHER", "EXT.", where), where, NUMERIC_IDS, [] as const, OTHER_IDS);
}

import { specDataFrom, typedConstants } from "../tick/spec_data.js";
const NUMERIC_IDS = [
    "ITEM", "SOUND_PLACE", "AMMO_STEP", "AHEAD_STEPS", "AHEAD_SHIFT", "Z", "FLAGS_PLACED", "ARM_TIMER", "RETARGET_PERIOD",
    "TARGET_FLAG", "PROX_RANGE", "HAILE_CHARACTER", "SHOT_IMPULSE", "SOUND_BLAST", "SWEEP_AGE", "BLAST_LIFE", "SWEEP_RANGE",
    "MARK_RANGE", "LOSS_BASE", "GIB_LOSS", "PARTICLE_SHIFT", "PARTICLE_BASE", "SPAWN_RADIUS", "CELL_CENTER", "VEST_DRAIN",
] as const;
const LIST_IDS = ["MARKER_CLASSES"] as const;
const OTHER_IDS = ["SPAWN_HP", "EXPECT"] as const;
export type MineConstants = ReturnType<typeof mineConstantsFrom>;
export function mineConstantsFrom(doc: unknown) {
    const where = "mine";
    const t = typedConstants(specDataFrom(doc, "ZT-WORLD-MINE", "MINE.", where), where, NUMERIC_IDS, LIST_IDS, OTHER_IDS);
    const hp = t.SPAWN_HP as unknown;
    if (!hp || typeof hp !== "object" || !Object.values(hp as object).every((v) => typeof v === "number"))
        throw new Error(`${where}: SPAWN_HP is not a table of numbers by type`);
    return { ...t, SPAWN_HP: hp as Readonly<Record<string, number>> };
}

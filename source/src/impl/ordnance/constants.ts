import { specDataFrom, typedConstants } from "../tick/spec_data.js";
const NUMERIC_IDS = [
    "ITEM", "REQUEST", "AMMO_STEP", "ANIM_BUSY", "RAISE_RECORDS", "FLAGS", "STATE_NO_TARGET", "SPEED_SHIFT", "START_SHIFT", "Z_DROP", "CONE", "FUSE_SHIFT", "FUSE_ADD",
    "SOUND_IMPACT", "SHOT_IMPULSE", "SNIPER_X_MIN", "BLAST_FLAG_MASK", "GRENADE_ITEM", "GRENADE_REQUEST", "GRENADE_THROW_FRAME", "GRENADE_SPEED_SHIFT", "GRENADE_Z_DROP",
    "GRENADE_LIFE", "GRENADE_CONE", "INWALL_REQUEST", "INWALL_FLAGS", "INWALL_LIFE", "GRENADE_STATE_NO_TARGET", "GRENADE_FUSE_SHIFT", "GRENADE_FUSE_ADD",
    "GRENADE_TARGET_VEL_SHIFT", "GRENADE_VZ", "GRENADE_Z_RISE", "GRENADE_ANIM_BUSY", "GRENADE_GRAVITY", "GRENADE_FLOOR_Z", "GRENADE_BOUNCE_SHIFT", "GRENADE_BOUNCE_MIN",
    "GRENADE_BOUNCE_REQUEST", "FISTS_AFTER_LAST", "GRENADE_BLAST_SOUND",
] as const;
const LIST_IDS = ["SNIPER_CLASSES", "IN_WALL_CLASSES"] as const;
const OTHER_IDS = ["Z_BASE", "TARGET_FLAG_MASKS", "EXPECT"] as const;
export type OrdnanceConstants = ReturnType<typeof ordnanceConstantsFrom>;
export function ordnanceConstantsFrom(doc: unknown) {
    const where = "ordnance";
    const t = typedConstants(specDataFrom(doc, "ZT-WORLD-ORDNANCE", "ORDNANCE.", where), where, NUMERIC_IDS, LIST_IDS, OTHER_IDS);
    return { ...t, Z_BASE: t.Z_BASE as Readonly<Record<string, number>>, TARGET_FLAG_MASKS: t.TARGET_FLAG_MASKS as Readonly<Record<string, number>> };
}

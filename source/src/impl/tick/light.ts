export const LIGHT_PREFIX = "LIGHT.";
const LIGHT_IDS = ["ITEM", "ABSENT", "GRANT", "CAP", "DRAIN_PHASE", "DRAIN_MASK", "DRAIN_STEP", "NIGHT_VISION_ITEM", "NIGHT_VISION_PHASE"] as const;
type LightId = (typeof LIGHT_IDS)[number];
export type LightConstants = {
    readonly [K in LightId]: number;
};
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
export function lightConstantsFrom(doc: unknown): LightConstants {
    const d = doc as {
        light_constants?: unknown;
    } | null;
    if (!d || typeof d !== "object" || !Array.isArray(d.light_constants))
        throw new Error("weapon.json: no light_constants table (ZT-PLAYER-WEAPON 4.9a)");
    const values = new Map<string, unknown>();
    for (const c of d.light_constants as Array<{
        id?: unknown;
        value?: unknown;
    }>) {
        if (typeof c.id !== "string" || !c.id.startsWith(LIGHT_PREFIX))
            throw new Error(`weapon.json: light constant id ${String(c.id)} is not a LIGHT.* id`);
        const id = c.id.slice(LIGHT_PREFIX.length);
        if (values.has(id))
            throw new Error(`weapon.json: light constant ${c.id} is doubled`);
        values.set(id, c.value);
    }
    const out: Record<string, number> = {};
    for (const id of LIGHT_IDS) {
        const v = values.get(id);
        if (!isInt(v))
            throw new Error(`weapon.json: ${LIGHT_PREFIX}${id} is missing or not an integer`);
        out[id] = v;
    }
    for (const id of values.keys())
        if (!(LIGHT_IDS as readonly string[]).includes(id))
            throw new Error(`weapon.json: unknown light constant ${LIGHT_PREFIX}${id}`);
    return Object.freeze(out) as LightConstants;
}

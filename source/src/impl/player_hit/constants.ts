const HIT_INT_IDS = [
    "RANGE_LIMIT", "EYE_ABOVE_SHIFT", "EYE_BELOW_SHIFT", "BUCKET_SHIFT", "LOSS_BASE", "CHARACTER_QUARTER", "QUARTER_SHIFT",
    "CHARACTER_HALF", "HALF_SHIFT", "TABLE_SIZE", "KNOCK_LIMIT", "KNOCK_HALVE_SHIFT", "HOP_EYE", "Z_KICK_MIN_SEED",
    "Z_KICK_VEL", "Z_KICK_COUNTDOWN", "FLASH_BASE", "FLASH_SHIFT", "HP_MAX", "VEST_ITEM", "VEST_DRAIN", "VEST_USED_UP",
    "BANNER_HIGH", "BANNER_LOW",
] as const;
const HIT_TABLE_IDS = ["JUMP_SEED", "MUL"] as const;
type HitIntId = (typeof HIT_INT_IDS)[number];
type HitTableId = (typeof HIT_TABLE_IDS)[number];
export type HitConstants = {
    readonly [K in HitIntId]: number;
} & {
    readonly TABLE: {
        readonly [K in HitTableId]: readonly number[];
    };
};
export const HIT_DATA_FORMAT = "zt-spec-data/1";
export const HIT_SPEC = "ZT-PLAYER-HIT";
export const HIT_PREFIX = "HIT.";
export const HIT_TABLE_PREFIX = "TABLE.";
export const HIT_ID_COUNT = 26;
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
export function hitConstantsFrom(doc: unknown): HitConstants {
    const file = "player_hit.json";
    const d = doc as {
        format?: unknown;
        spec?: unknown;
        constants?: unknown;
    } | null;
    if (!d || typeof d !== "object")
        throw new Error(`${file}: not an object`);
    if (d.format !== HIT_DATA_FORMAT)
        throw new Error(`${file}: format ${String(d.format)}, expected ${HIT_DATA_FORMAT}`);
    if (d.spec !== HIT_SPEC)
        throw new Error(`${file}: spec ${String(d.spec)}, expected ${HIT_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error(`${file}: no constants array`);
    const values = new Map<string, unknown>();
    for (const c of d.constants as Array<{
        id?: unknown;
        value?: unknown;
    }>) {
        if (typeof c.id !== "string" || !c.id.startsWith(HIT_PREFIX))
            throw new Error(`${file}: a constant without a ${HIT_PREFIX}* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`${file}: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const out: Record<string, unknown> = {};
    for (const id of HIT_INT_IDS) {
        const v = values.get(HIT_PREFIX + id);
        if (v === undefined)
            throw new Error(`${file}: ${HIT_PREFIX}${id} (used by the spec) is missing`);
        if (!isInt(v))
            throw new Error(`${file}: ${HIT_PREFIX}${id} is not an integer`);
        out[id] = v;
    }
    const table: Record<string, unknown> = {};
    for (const id of HIT_TABLE_IDS) {
        const v = values.get(HIT_PREFIX + HIT_TABLE_PREFIX + id);
        if (v === undefined)
            throw new Error(`${file}: ${HIT_PREFIX}${HIT_TABLE_PREFIX}${id} (used by the spec) is missing`);
        if (!Array.isArray(v) || !v.every(isInt))
            throw new Error(`${file}: ${HIT_PREFIX}${HIT_TABLE_PREFIX}${id} is not a list of integers`);
        table[id] = Object.freeze([...v]);
    }
    out["TABLE"] = Object.freeze(table);
    const known = [...HIT_INT_IDS, ...HIT_TABLE_IDS.map((id) => HIT_TABLE_PREFIX + id)];
    for (const id of values.keys()) {
        if (!known.includes(id.slice(HIT_PREFIX.length)))
            throw new Error(`${file}: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    if (known.length !== HIT_ID_COUNT)
        throw new Error(`${file}: this implementation knows ${known.length} ids, the spec says ${HIT_ID_COUNT}`);
    const C = out as HitConstants;
    if (C.TABLE.JUMP_SEED.length !== C.TABLE_SIZE || C.TABLE.MUL.length !== C.TABLE_SIZE)
        throw new Error(`${file}: the table has ${C.TABLE.JUMP_SEED.length} / ${C.TABLE.MUL.length} rows, TABLE_SIZE is ${C.TABLE_SIZE}`);
    return Object.freeze(out) as HitConstants;
}

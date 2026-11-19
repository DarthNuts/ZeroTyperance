export const WEAPON_DATA_FORMAT = "zt-spec-data/1";
const PREFIX = "WEAPON.";
export interface WeaponDiagonal {
    readonly class: number;
    readonly blocked: "ne" | "se" | "sw" | "nw";
}
export interface WeaponSound {
    readonly request: number;
    readonly event: "Audio.PlaySfx" | "Audio.PlayVoice";
    readonly id: number;
    readonly value: number;
}
const NUMERIC_IDS = [
    "FIRST_ITERATION", "PHASE_OFFSET", "NONE", "NEGATIVE_FROM", "WEAPON_MAX",
    "W_FISTS", "W_MINE", "W_HANDGUN", "W_LASER", "W_SHOTGUN", "W_PULSE",
    "RING_SIZE", "RING_RIGHT", "LOWER_STEP", "LOWER_MAX",
    "EDGE_ONLY", "PENDING_GATE", "FIRE_NEEDS_RAISED", "FISTS_NEED_IDLE",
    "ANIM_FIRE", "ANIM_END", "AMMO_STEP", "LAST_ROUND", "SLOTS_MASK", "AMMO_LOW_FROM", "AMMO_LOW_TO",
    "LASER_STEP", "LASER_REMOVE", "LASER_HOLD_MAX", "LASER_WRAP", "PULSE_BURST_MAX",
    "FISTS_VARIANT", "FISTS_UP", "FISTS_DOWN", "FISTS_RIGHT", "FISTS_LONG_BELOW", "FISTS_LONG_END", "FISTS_SHORT_END",
    "FISTS_HIT_FRAME", "FISTS_REACH_SHIFT", "WALL_MAP_WIDTH", "WALL_CELL", "WALL_DIAGONAL_STRICT", "SILENT_EPISODE",
    "SCANNER_ITEM", "SCANNER_DRAIN_PHASE", "SCANNER_DRAIN_MASK", "SCANNER_STEP",
    "PAD_UP", "PAD_DOWN", "PAD_LEFT", "PAD_RIGHT", "PAD_B", "PAD_C", "PAD_A",
    "REQ_SWITCH", "REQ_FISTS", "REQ_WALL", "REQ_MINE", "REQ_HANDGUN", "REQ_SHOTGUN", "REQ_LASER", "REQ_PULSE", "REQ_TILE_RAY",
    "FISTS_MASK_STAND", "FISTS_MASK_AIR", "FISTS_MASK_CROUCH", "FISTS_DEPTH_SHIFT", "FISTS_MIN_DEPTH", "FISTS_REACH", "FISTS_REACH_CH3",
    "FISTS_SIDE_SHIFT", "FISTS_PERP_SHIFT", "FISTS_MAG", "FISTS_MAG_CH3", "FISTS_MAG_CH4", "REQ_FISTS_HIT_LONG", "REQ_FISTS_HIT_SHORT", "FISTS_HIT_GUARD",
] as const;
const NUMBER_LIST_IDS = ["ITEM_WEAPON", "WALL_SOLID_CLASSES", "WALL_DOOR_CLASSES", "SILENT_BLOCKS", "SILENT_BLOCKS_HIGHRISE", "SILENT_BLOCKS_HIGHRISE_STANDING", "DRAIN_ITEMS_UNMODELLED"] as const;
const ITEM_TABLE_LENGTH = 16;
const TRIANGLES = ["ne", "se", "sw", "nw"] as const;
const EVENTS = ["Audio.PlaySfx", "Audio.PlayVoice"] as const;
type NumericId = (typeof NUMERIC_IDS)[number];
type ListId = (typeof NUMBER_LIST_IDS)[number];
export type WeaponConstants = {
    readonly [K in NumericId]: number;
} & {
    readonly [K in ListId]: readonly number[];
} & {
    readonly WALL_DIAGONALS: readonly WeaponDiagonal[];
    readonly SOUNDS: readonly WeaponSound[];
};
interface DataConstant {
    id?: unknown;
    value?: unknown;
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
function isIntList(v: unknown): v is number[] {
    return Array.isArray(v) && v.every(isInt);
}
export function weaponConstantsFrom(doc: unknown): WeaponConstants {
    const d = doc as {
        format?: unknown;
        constants?: unknown;
    } | null;
    if (!d || typeof d !== "object")
        throw new Error("weapon.json: not an object");
    if (d.format !== WEAPON_DATA_FORMAT)
        throw new Error(`weapon.json: format ${String(d.format)}, expected ${WEAPON_DATA_FORMAT}`);
    if (!Array.isArray(d.constants))
        throw new Error("weapon.json: no constants list");
    const values = new Map<string, unknown>();
    for (const c of d.constants as DataConstant[]) {
        if (typeof c.id !== "string" || !c.id.startsWith(PREFIX))
            throw new Error(`weapon.json: constant id ${String(c.id)} is not a WEAPON.* id`);
        const id = c.id.slice(PREFIX.length);
        if (values.has(id))
            throw new Error(`weapon.json: constant ${c.id} is doubled`);
        values.set(id, c.value);
    }
    const known = new Set<string>([...NUMERIC_IDS, ...NUMBER_LIST_IDS, "WALL_DIAGONALS", "SOUNDS"]);
    for (const id of values.keys())
        if (!known.has(id))
            throw new Error(`weapon.json: unknown constant ${PREFIX}${id}`);
    const out: Record<string, unknown> = {};
    for (const id of NUMERIC_IDS) {
        const v = values.get(id);
        if (!isInt(v))
            throw new Error(`weapon.json: ${PREFIX}${id} is missing or not an integer`);
        out[id] = v;
    }
    for (const id of NUMBER_LIST_IDS) {
        const v = values.get(id);
        if (!isIntList(v))
            throw new Error(`weapon.json: ${PREFIX}${id} is missing or not a list of integers`);
        out[id] = Object.freeze([...v]);
    }
    if ((out.ITEM_WEAPON as number[]).length !== ITEM_TABLE_LENGTH)
        throw new Error(`weapon.json: ${PREFIX}ITEM_WEAPON has ${(out.ITEM_WEAPON as number[]).length} entries, expected ${ITEM_TABLE_LENGTH}`);
    const diag = values.get("WALL_DIAGONALS");
    if (!Array.isArray(diag))
        throw new Error(`weapon.json: ${PREFIX}WALL_DIAGONALS is missing or not a list`);
    out.WALL_DIAGONALS = Object.freeze((diag as Array<{
        class?: unknown;
        blocked?: unknown;
    }>).map((e) => {
        if (!isInt(e.class))
            throw new Error(`weapon.json: a WALL_DIAGONALS entry without an integer class`);
        if (typeof e.blocked !== "string" || !(TRIANGLES as readonly string[]).includes(e.blocked))
            throw new Error(`weapon.json: WALL_DIAGONALS class ${e.class} blocks an unknown triangle ${String(e.blocked)}`);
        return Object.freeze({ class: e.class, blocked: e.blocked as WeaponDiagonal["blocked"] });
    }));
    const sounds = values.get("SOUNDS");
    if (!Array.isArray(sounds))
        throw new Error(`weapon.json: ${PREFIX}SOUNDS is missing or not a list`);
    out.SOUNDS = Object.freeze((sounds as Array<{
        request?: unknown;
        event?: unknown;
        id?: unknown;
        value?: unknown;
    }>).map((s) => {
        if (!isInt(s.request) || !isInt(s.id) || !isInt(s.value))
            throw new Error("weapon.json: a SOUNDS entry without integer request / id / value");
        if (typeof s.event !== "string" || !(EVENTS as readonly string[]).includes(s.event))
            throw new Error(`weapon.json: SOUNDS request ${s.request} has an unknown event ${String(s.event)}`);
        return Object.freeze({ request: s.request, event: s.event as WeaponSound["event"], id: s.id, value: s.value });
    }));
    return Object.freeze(out) as unknown as WeaponConstants;
}
export function soundOfRequest(request: number, C: WeaponConstants): WeaponSound {
    const s = C.SOUNDS.find((e) => e.request === request);
    if (!s)
        throw new Error(`weapon.json: WEAPON.SOUNDS has no entry for request ${request}`);
    return s;
}

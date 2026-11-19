const PICKUP_INT_IDS = [
    "CLASS_LOW_LIMIT", "CLASS_HIGH_LIMIT", "CLASS_ITEM_BASE", "SLOTS", "ITEM_SOUND", "HP_MAX", "LOOT_ITEM", "QUEUE_SIZE",
] as const;
const PICKUP_MEDIPACK_INT_IDS = ["CLASS", "HEAL", "HEAL_CHAR2", "CHAR2", "SOUND"] as const;
const PICKUP_DISPLAY_INT_IDS = ["RELOAD", "STEP_BASE"] as const;
const PICKUP_HEALTH_INT_IDS = ["HIGH", "LOW"] as const;
const PICKUP_GUARD_INT_IDS = ["ENDS_ANNOUNCEMENT", "DROPS_VOICE"] as const;
const PICKUP_MSG_IDS = ["MEDIPACK", "HANDGUN", "HEALTH_LOW", "HEALTH_CRITICAL", "AMMO_LOW"] as const;
const PICKUP_MSG_WITH_VOICE = ["MEDIPACK", "HEALTH_LOW", "HEALTH_CRITICAL", "AMMO_LOW"] as const;
const PICKUP_CHAIN_INT_IDS = ["START", "PROCEED_AT"] as const;
const PICKUP_FLOW_MSG_IDS = ["ZERO", "PROCEED", "SECURED", "NOT_SECURED"] as const;
const PICKUP_ADD_INT_IDS = ["CLAMP_TO_CAP"] as const;
export type AddVector = readonly [
    number,
    number,
    number,
    number | null
];
export type VoiceEntry = readonly [
    number,
    number
];
export interface MessageText {
    readonly rows: readonly string[];
    readonly voice: readonly VoiceEntry[];
}
export type PickupMsgId = (typeof PICKUP_MSG_IDS)[number];
export type PickupConstants = {
    readonly [K in (typeof PICKUP_INT_IDS)[number]]: number;
} & {
    readonly MEDIPACK: {
        readonly [K in (typeof PICKUP_MEDIPACK_INT_IDS)[number]]: number;
    };
    readonly DISPLAY: {
        readonly [K in (typeof PICKUP_DISPLAY_INT_IDS)[number]]: number;
    };
    readonly HEALTH: {
        readonly [K in (typeof PICKUP_HEALTH_INT_IDS)[number]]: number;
    };
    readonly GUARD: {
        readonly [K in (typeof PICKUP_GUARD_INT_IDS)[number]]: number;
    };
    readonly MSG: {
        readonly [K in PickupMsgId]: {
            readonly TEXT: readonly string[];
            readonly VOICE?: readonly VoiceEntry[];
        };
    };
    readonly CHAIN: {
        readonly [K in (typeof PICKUP_CHAIN_INT_IDS)[number]]: number;
    };
    readonly FLOW_MSG: {
        readonly [K in (typeof PICKUP_FLOW_MSG_IDS)[number]]: {
            readonly ID: string;
            readonly VOICE: readonly VoiceEntry[];
        };
    };
    readonly ADD: {
        readonly [K in (typeof PICKUP_ADD_INT_IDS)[number]]: number;
    } & {
        readonly VECTORS: readonly AddVector[];
    };
};
export const PICKUP_DATA_FORMAT = "zt-spec-data/1";
export const PICKUP_SPEC = "ZT-WORLD-PICKUP";
export const PICKUP_PREFIX = "PICKUP.";
export const PICKUP_ID_COUNT = 40;
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
function isRows(v: unknown): v is string[] {
    return Array.isArray(v) && v.length > 0 && v.every((r) => typeof r === "string");
}
function isVoiceList(v: unknown): v is number[][] {
    return Array.isArray(v) && v.every((e) => Array.isArray(e) && e.length === 2 && e.every(isInt));
}
export function pickupConstantsFrom(doc: unknown): PickupConstants {
    const file = "pickup.json";
    const d = doc as {
        format?: unknown;
        spec?: unknown;
        constants?: unknown;
    } | null;
    if (!d || typeof d !== "object")
        throw new Error(`${file}: not an object`);
    if (d.format !== PICKUP_DATA_FORMAT)
        throw new Error(`${file}: format ${String(d.format)}, expected ${PICKUP_DATA_FORMAT}`);
    if (d.spec !== PICKUP_SPEC)
        throw new Error(`${file}: spec ${String(d.spec)}, expected ${PICKUP_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error(`${file}: no constants array`);
    const values = new Map<string, unknown>();
    for (const c of d.constants as Array<{
        id?: unknown;
        value?: unknown;
    }>) {
        if (typeof c.id !== "string" || !c.id.startsWith(PICKUP_PREFIX))
            throw new Error(`${file}: a constant without a ${PICKUP_PREFIX}* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`${file}: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const known: string[] = [];
    const take = <T>(id: string, check: (v: unknown) => v is T, what: string): T => {
        const v = values.get(PICKUP_PREFIX + id);
        if (v === undefined)
            throw new Error(`${file}: ${PICKUP_PREFIX}${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`${file}: ${PICKUP_PREFIX}${id} is not ${what}`);
        known.push(id);
        return v;
    };
    const out: Record<string, unknown> = {};
    for (const id of PICKUP_INT_IDS)
        out[id] = take(id, isInt, "an integer");
    const groupOf = (name: string, ids: readonly string[]): Record<string, number> => {
        const g: Record<string, number> = {};
        for (const id of ids)
            g[id] = take(`${name}.${id}`, isInt, "an integer");
        return Object.freeze(g);
    };
    out["MEDIPACK"] = groupOf("MEDIPACK", PICKUP_MEDIPACK_INT_IDS);
    out["DISPLAY"] = groupOf("DISPLAY", PICKUP_DISPLAY_INT_IDS);
    out["HEALTH"] = groupOf("HEALTH", PICKUP_HEALTH_INT_IDS);
    out["GUARD"] = groupOf("GUARD", PICKUP_GUARD_INT_IDS);
    const msg: Record<string, unknown> = {};
    for (const id of PICKUP_MSG_IDS) {
        const m: Record<string, unknown> = { TEXT: Object.freeze([...take(`MSG.${id}.TEXT`, isRows, "a list of rows")]) };
        if ((PICKUP_MSG_WITH_VOICE as readonly string[]).includes(id)) {
            m["VOICE"] = Object.freeze(take(`MSG.${id}.VOICE`, isVoiceList, "a voice list of [blanks, request] pairs").map((e) => Object.freeze([e[0]!, e[1]!] as const)));
        }
        msg[id] = Object.freeze(m);
    }
    out["MSG"] = Object.freeze(msg);
    out["CHAIN"] = groupOf("CHAIN", PICKUP_CHAIN_INT_IDS);
    const isTextId = (v: unknown): v is string => typeof v === "string" && /^messages\.\d+$/.test(v);
    const flow: Record<string, unknown> = {};
    for (const id of PICKUP_FLOW_MSG_IDS) {
        flow[id] = Object.freeze({
            ID: take(`MSG.${id}.ID`, isTextId, "an extractor id messages.NN"),
            VOICE: Object.freeze(take(`MSG.${id}.VOICE`, isVoiceList, "a voice list of [blanks, request] pairs").map((e) => Object.freeze([e[0]!, e[1]!] as const))),
        });
    }
    out["FLOW_MSG"] = Object.freeze(flow);
    const isVectors = (v: unknown): v is AddVector[] => Array.isArray(v) && v.every((e) => Array.isArray(e) && e.length === 4 && e.slice(0, 3).every(isInt) && (e[3] === null || isInt(e[3])));
    out["ADD"] = Object.freeze({ ...groupOf("ADD", PICKUP_ADD_INT_IDS), VECTORS: Object.freeze(take("ADD.VECTORS", isVectors, "a list of [amount, grant, cap, new amount or null]").map((e) => Object.freeze([e[0], e[1], e[2], e[3]] as const))) });
    for (const id of values.keys()) {
        if (!known.includes(id.slice(PICKUP_PREFIX.length)))
            throw new Error(`${file}: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    if (known.length !== PICKUP_ID_COUNT)
        throw new Error(`${file}: this implementation knows ${known.length} ids, the spec says ${PICKUP_ID_COUNT}`);
    return Object.freeze(out) as PickupConstants;
}
export interface ItemData {
    readonly id: number;
    readonly mapClass: number;
    readonly cap: number;
    readonly defaultGrant: number;
    readonly name: string;
    readonly voice: readonly VoiceEntry[];
}
export interface ItemsData {
    readonly byId: ReadonlyMap<number, ItemData>;
    readonly byClass: ReadonlyMap<number, ItemData>;
    readonly messages: ReadonlyMap<number, readonly string[]> | null;
}
export function pickupMessagesFrom(doc: unknown): ReadonlyMap<number, readonly string[]> {
    const d = doc as {
        entries?: unknown;
    } | null;
    if (!d || !Array.isArray(d.entries))
        throw new Error("pickup_messages.json: no entries array");
    const out = new Map<number, readonly string[]>();
    for (const e of d.entries as Array<{
        meta?: {
            item_id?: unknown;
            lines?: unknown;
        };
    }>) {
        const m = e.meta;
        if (!m || !isInt(m.item_id) || !isRows(m.lines))
            throw new Error("pickup_messages.json: an entry without meta.item_id and meta.lines");
        if (out.has(m.item_id))
            throw new Error(`pickup_messages.json: item ${m.item_id} has two messages`);
        out.set(m.item_id, Object.freeze([...m.lines]));
    }
    return out;
}
export function messagesFrom(doc: unknown): ReadonlyMap<string, readonly string[]> {
    const d = doc as {
        entries?: unknown;
    } | null;
    if (!d || !Array.isArray(d.entries))
        throw new Error("messages.json: no entries array");
    const out = new Map<string, readonly string[]>();
    for (const e of d.entries as Array<{
        id?: unknown;
        meta?: {
            lines?: unknown;
        };
    }>) {
        if (typeof e.id !== "string" || !e.meta || !isRows(e.meta.lines))
            throw new Error("messages.json: an entry without id and meta.lines");
        if (out.has(e.id))
            throw new Error(`messages.json: ${e.id} appears twice`);
        out.set(e.id, Object.freeze([...e.meta.lines]));
    }
    return out;
}
export function textOf(id: string, voice: readonly VoiceEntry[], texts: ReadonlyMap<string, readonly string[]> | null): MessageText {
    const rows = texts?.get(id);
    if (rows === undefined)
        throw new Error(`${id}: no stored text (the extractor's strings/messages.json was not loaded or lacks it)`);
    return { rows, voice };
}
function voiceOf(v: unknown): VoiceEntry[] {
    if (!Array.isArray(v))
        return [];
    const out: VoiceEntry[] = [];
    for (const e of v as Array<{
        duration?: unknown;
        sound_id?: unknown;
    }>) {
        if (isInt(e.duration) && isInt(e.sound_id))
            out.push(Object.freeze([e.duration, e.sound_id] as const));
    }
    return out;
}
export function itemsDataFrom(doc: unknown, messagesDoc: unknown = null): ItemsData {
    const d = doc as {
        data?: {
            items?: unknown;
        };
    } | null;
    const items = d?.data?.items;
    if (!Array.isArray(items))
        throw new Error("items.json: no data.items array");
    const byId = new Map<number, ItemData>();
    const byClass = new Map<number, ItemData>();
    for (const it of items as Array<{
        id?: unknown;
        map_class?: unknown;
        cap?: unknown;
        default_grant?: unknown;
        name?: unknown;
        pickup_voice?: unknown;
    }>) {
        if (!isInt(it.id) || !isInt(it.map_class) || !isInt(it.cap) || !isInt(it.default_grant) || typeof it.name !== "string")
            throw new Error(`items.json: item ${JSON.stringify(it.id)} lacks id, map_class, cap, default_grant or name`);
        const row: ItemData = Object.freeze({ id: it.id, mapClass: it.map_class, cap: it.cap, defaultGrant: it.default_grant, name: it.name, voice: Object.freeze(voiceOf(it.pickup_voice)) });
        if (byId.has(row.id))
            throw new Error(`items.json: item ${row.id} appears twice`);
        if (byClass.has(row.mapClass))
            throw new Error(`items.json: class ${row.mapClass} names two items`);
        byId.set(row.id, row);
        byClass.set(row.mapClass, row);
    }
    return { byId, byClass, messages: messagesDoc === null ? null : pickupMessagesFrom(messagesDoc) };
}

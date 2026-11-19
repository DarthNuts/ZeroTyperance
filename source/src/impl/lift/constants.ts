import type { VoiceEntry } from "../pickup/constants.js";
const LIFT_INT_IDS = ["SOUND", "MUSIC", "STEPPING_EPISODE"] as const;
const LIFT_SLIDE_INT_IDS = ["STEP", "LIMIT"] as const;
const LIFT_STATE_INT_IDS = ["UP", "DOWN", "ARRIVED_UP", "ARRIVED_DOWN"] as const;
const LIFT_CLASS_SET_IDS = ["ARRIVE", "UP", "DOWN", "BOTH"] as const;
const LIFT_STEP_MSG_IDS = ["STEP_UP", "STEP_DOWN"] as const;
const LIFT_ENTERING_TABLE_IDS = ["EP0", "EP1"] as const;
export interface StairRamp {
    readonly axis: "x" | "y";
    readonly offset: number;
    readonly sign: number;
}
export interface StairCrest {
    readonly axis: "x" | "y";
    readonly upKey: number;
}
export type LiftConstants = {
    readonly [K in (typeof LIFT_INT_IDS)[number]]: number;
} & {
    readonly SLIDE: {
        readonly [K in (typeof LIFT_SLIDE_INT_IDS)[number]]: number;
    };
    readonly STATE: {
        readonly [K in (typeof LIFT_STATE_INT_IDS)[number]]: number;
    };
    readonly CLASS: {
        readonly [K in (typeof LIFT_CLASS_SET_IDS)[number]]: readonly number[];
    };
    readonly MSG: {
        readonly [K in (typeof LIFT_STEP_MSG_IDS)[number]]: {
            readonly ID: string;
            readonly VOICE: readonly VoiceEntry[];
        };
    };
    readonly ENTERING: {
        readonly [K in (typeof LIFT_ENTERING_TABLE_IDS)[number]]: readonly number[];
    } & {
        readonly VOICE: ReadonlyMap<number, readonly VoiceEntry[]>;
    };
    readonly EYE: {
        readonly BACK_SHIFT: number;
    };
    readonly CALL: {
        readonly CLASS_MIN: number;
    };
    readonly STAIR: {
        readonly RAMP: ReadonlyMap<number, StairRamp>;
        readonly RAMP_SHIFT: number;
        readonly FLAT: readonly number[];
        readonly LOW: number;
        readonly HIGH: number;
        readonly CREST: ReadonlyMap<number, StairCrest>;
        readonly CREST_MID: number;
        readonly UNSHIPPED: readonly number[];
    };
    readonly SIGN: {
        readonly METATEX: number;
        readonly SLOTS: readonly number[];
        readonly BASE: number;
        readonly DIGIT_TEX: readonly number[];
        readonly BLANK_TEX: number;
    };
};
export const LIFT_DATA_FORMAT = "zt-spec-data/1";
export const LIFT_SPEC = "ZT-WORLD-LIFT";
export const LIFT_PREFIX = "LIFT.";
export const LIFT_ID_COUNT = 35;
export const LIFT_FLOORS = 16;
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
function isIntList(v: unknown): v is number[] {
    return Array.isArray(v) && v.length > 0 && v.every(isInt);
}
function isVoiceList(v: unknown): v is number[][] {
    return Array.isArray(v) && v.every((e) => Array.isArray(e) && e.length === 2 && e.every(isInt));
}
function isTextId(v: unknown): v is string {
    return typeof v === "string" && /^messages\.\d+$/.test(v);
}
function isVoiceTable(v: unknown): v is Record<string, number[][]> {
    return !!v && typeof v === "object" && !Array.isArray(v) && Object.entries(v as object).every(([k, e]) => /^\d+$/.test(k) && isVoiceList(e));
}
function isAxis(v: unknown): v is "x" | "y" {
    return v === "x" || v === "y";
}
function isRampTable(v: unknown): v is Record<string, [
    string,
    number,
    number
]> {
    return !!v && typeof v === "object" && !Array.isArray(v) && Object.entries(v as object).every(([k, e]) => /^\d+$/.test(k) && Array.isArray(e) && e.length === 3 && isAxis(e[0]) && isInt(e[1]) && isInt(e[2]));
}
function isCrestTable(v: unknown): v is Record<string, [
    string,
    number
]> {
    return !!v && typeof v === "object" && !Array.isArray(v) && Object.entries(v as object).every(([k, e]) => /^\d+$/.test(k) && Array.isArray(e) && e.length === 2 && isAxis(e[0]) && isInt(e[1]));
}
const freezeVoice = (l: number[][]): readonly VoiceEntry[] => Object.freeze(l.map((e) => Object.freeze([e[0]!, e[1]!] as const)));
export function liftConstantsFrom(doc: unknown): LiftConstants {
    const file = "lift.json";
    const d = doc as {
        format?: unknown;
        spec?: unknown;
        constants?: unknown;
    } | null;
    if (!d || typeof d !== "object")
        throw new Error(`${file}: not an object`);
    if (d.format !== LIFT_DATA_FORMAT)
        throw new Error(`${file}: format ${String(d.format)}, expected ${LIFT_DATA_FORMAT}`);
    if (d.spec !== LIFT_SPEC)
        throw new Error(`${file}: spec ${String(d.spec)}, expected ${LIFT_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error(`${file}: no constants array`);
    const values = new Map<string, unknown>();
    for (const c of d.constants as Array<{
        id?: unknown;
        value?: unknown;
    }>) {
        if (typeof c.id !== "string" || !c.id.startsWith(LIFT_PREFIX))
            throw new Error(`${file}: a constant without a ${LIFT_PREFIX}* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`${file}: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const known: string[] = [];
    const take = <T>(id: string, check: (v: unknown) => v is T, what: string): T => {
        const v = values.get(LIFT_PREFIX + id);
        if (v === undefined)
            throw new Error(`${file}: ${LIFT_PREFIX}${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`${file}: ${LIFT_PREFIX}${id} is not ${what}`);
        known.push(id);
        return v;
    };
    const out: Record<string, unknown> = {};
    for (const id of LIFT_INT_IDS)
        out[id] = take(id, isInt, "an integer");
    const groupOf = (name: string, ids: readonly string[]): Record<string, number> => {
        const g: Record<string, number> = {};
        for (const id of ids)
            g[id] = take(`${name}.${id}`, isInt, "an integer");
        return Object.freeze(g);
    };
    out["SLIDE"] = groupOf("SLIDE", LIFT_SLIDE_INT_IDS);
    out["STATE"] = groupOf("STATE", LIFT_STATE_INT_IDS);
    const cls: Record<string, readonly number[]> = {};
    for (const id of LIFT_CLASS_SET_IDS)
        cls[id] = Object.freeze([...take(`CLASS.${id}`, isIntList, "a list of classes")]);
    out["CLASS"] = Object.freeze(cls);
    const msg: Record<string, unknown> = {};
    for (const id of LIFT_STEP_MSG_IDS) {
        msg[id] = Object.freeze({ ID: take(`MSG.${id}.ID`, isTextId, "an extractor id messages.NN"), VOICE: freezeVoice(take(`MSG.${id}.VOICE`, isVoiceList, "a voice list")) });
    }
    out["MSG"] = Object.freeze(msg);
    const entering: Record<string, unknown> = {};
    for (const id of LIFT_ENTERING_TABLE_IDS) {
        const t = take(`ENTERING.${id}`, isIntList, "a list of message numbers");
        if (t.length !== LIFT_FLOORS)
            throw new Error(`${file}: ${LIFT_PREFIX}ENTERING.${id} has ${t.length} entries, one per floor (${LIFT_FLOORS}) expected`);
        entering[id] = Object.freeze([...t]);
    }
    const voiceTable = take("ENTERING.VOICE", isVoiceTable, "a table {message number: voice list}");
    entering["VOICE"] = new Map(Object.entries(voiceTable).map(([k, l]) => [Number(k), freezeVoice(l)] as const));
    out["ENTERING"] = Object.freeze(entering);
    out["EYE"] = Object.freeze({ BACK_SHIFT: take("EYE.BACK_SHIFT", isInt, "an integer") });
    out["CALL"] = Object.freeze({ CLASS_MIN: take("CALL.CLASS_MIN", isInt, "an integer") });
    const rampTable = take("STAIR.RAMP", isRampTable, "a table {class: [axis, offset, sign]}");
    const ramps = new Map<number, StairRamp>(Object.entries(rampTable).map(([k, [axis, offset, sign]]) => [Number(k), Object.freeze({ axis: axis as "x" | "y", offset, sign })] as const));
    const rampShift = take("STAIR.RAMP_SHIFT", isInt, "an integer");
    const flat = Object.freeze([...take("STAIR.FLAT", isIntList, "a list of classes")]);
    const low = take("STAIR.LOW", isInt, "an integer");
    const high = take("STAIR.HIGH", isInt, "an integer");
    const crestTable = take("STAIR.CREST", isCrestTable, "a table {class: [axis, up key]}");
    const crests = new Map<number, StairCrest>(Object.entries(crestTable).map(([k, [axis, upKey]]) => [Number(k), Object.freeze({ axis: axis as "x" | "y", upKey })] as const));
    const crestMid = take("STAIR.CREST_MID", isInt, "an integer");
    const unshipped = Object.freeze([...take("STAIR.UNSHIPPED", isIntList, "a list of classes")]);
    out["STAIR"] = Object.freeze({ RAMP: ramps, RAMP_SHIFT: rampShift, FLAT: flat, LOW: low, HIGH: high, CREST: crests, CREST_MID: crestMid, UNSHIPPED: unshipped });
    out["SIGN"] = Object.freeze({
        METATEX: take("SIGN.METATEX", isInt, "an integer"),
        SLOTS: Object.freeze([...take("SIGN.SLOTS", isIntList, "a list of slots")]),
        BASE: take("SIGN.BASE", isInt, "an integer"),
        DIGIT_TEX: Object.freeze([...take("SIGN.DIGIT_TEX", isIntList, "a list of texture numbers")]),
        BLANK_TEX: take("SIGN.BLANK_TEX", isInt, "an integer"),
    });
    for (const id of values.keys()) {
        if (!known.includes(id.slice(LIFT_PREFIX.length)))
            throw new Error(`${file}: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    if (known.length !== LIFT_ID_COUNT)
        throw new Error(`${file}: this implementation knows ${known.length} ids, the spec says ${LIFT_ID_COUNT}`);
    return Object.freeze(out) as LiftConstants;
}

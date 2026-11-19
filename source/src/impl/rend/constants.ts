const INT_IDS = [
    "COLUMNS", "MAP_SIDE", "ANGLES", "QUARTER", "CELL_SHIFT", "FRAC_MASK", "CAMERA_BACK_SHIFT",
    "RAY_LAST", "MODE_MAX", "CLASS_OPEN", "CLASS_WALL", "CLASS_SOLID_FIRST", "CLASS_SOLID_LAST",
    "SIN_SHIFT", "COLUMN_CENTRE", "STEP_NUMERATOR", "LAST_COLUMN", "HEIGHT_LIMIT",
    "VIEW_ROWS", "VIEW_BYTES", "COLUMN_GROUP", "TILE_COLUMN_BYTES", "ROW_STRIDE",
    "TEX_SIZE", "TEX_COLUMNS", "SMALL_HEIGHT_MAX", "BIG_HALF_ROWS", "BIG_STEP", "TC_SHIFT", "TC_FULL",
    "SHADE_BANDS", "CRAM_MASK", "EPISODE_ALT_PALETTE",
] as const;
const INT_LIST_IDS = {
    COLUMN_ANGLES: 129,
    RAY_STEP_BY_MODE: 5,
    VIEW_DISTANCE_BY_MODE: 5,
    WALL_LUT_SET_BY_MODE: 5,
    SOLID_NEIGHBOURS_NE: null,
    SOLID_NEIGHBOURS_SE: null,
    SOLID_NEIGHBOURS_SW: null,
    SOLID_NEIGHBOURS_NW: null,
    SHADE_BAND_BY_HEIGHT: null,
} as const;
const PAIR_LIST_IDS = ["DDA_STEPS"] as const;
const DOOR_INT_IDS = [
    "CLASS_CLOSED_X", "CLASS_CLOSED_Y", "CLASS_PANE_X", "CLASS_PANE_Y",
    "CENTRE", "CELL", "HALF", "TIMER_MAX", "TIMER_STEP",
    "TEX_DEF", "TEX_WORD_B", "TC_SHIFT", "FRAC_TIE", "CAMERA_CLASS_MIN",
] as const;
const DOOR_INT_LIST_IDS = {
    CAMERA_RAY_STEP_BY_MODE: 5,
} as const;
const DOOR_PREFIX = "DOOR.";
type DoorIntId = (typeof DOOR_INT_IDS)[number];
type DoorIntListId = keyof typeof DOOR_INT_LIST_IDS;
export type DoorConstantsGroup = {
    readonly [K in DoorIntId]: number;
} & {
    readonly [K in DoorIntListId]: readonly number[];
};
const FACE_MAP_IDS = ["FACE_WORD"] as const;
export const FACE_KEYS = ["low_y", "low_x", "high_x", "high_y"] as const;
export type FaceKey = (typeof FACE_KEYS)[number];
const DIAG_PREFIX = "DIAG.";
export interface DiagHypotenuse {
    readonly left: readonly [
        number,
        number
    ];
    readonly right: readonly [
        number,
        number
    ];
    readonly first: "left" | "right";
    readonly face_word: number;
}
export const DIAG_FACE_KEYS = ["low-y", "high-y", "low-x", "high-x"] as const;
export type DiagFaceKey = (typeof DIAG_FACE_KEYS)[number];
export interface DiagCameraDiagonal {
    readonly always: number;
    readonly a_le_255: number;
    readonly b_le_255: number;
}
export interface DiagConstantsGroup {
    readonly HYPOTENUSE: ReadonlyMap<number, DiagHypotenuse>;
    readonly BY_FACE: {
        readonly [F in DiagFaceKey]: readonly number[];
    };
    readonly PASS_X: readonly number[];
    readonly PASS_Y: readonly number[];
    readonly CAMERA_STRAIGHT: ReadonlyMap<number, readonly number[]>;
    readonly CAMERA_DIAGONAL: readonly DiagCameraDiagonal[];
}
export const DIAG_CLASS_COUNT = 4;
type IntId = (typeof INT_IDS)[number];
type IntListId = keyof typeof INT_LIST_IDS;
type PairListId = (typeof PAIR_LIST_IDS)[number];
type FaceMapId = (typeof FACE_MAP_IDS)[number];
const RAMP_PREFIX = "RAMP.";
export interface RampWord {
    readonly hi: number;
    readonly lo: number;
}
export type RampWords = readonly [
    RampWord,
    RampWord,
    RampWord,
    RampWord
];
export type RampZeroArm = RampWords | {
    readonly axis: "dx" | "dy";
    readonly then: RampWords;
    readonly else: RampWords;
};
export interface RampArms {
    readonly pos: RampWords;
    readonly zero: RampZeroArm;
    readonly neg: RampWords;
}
export const RAMP_FACE_KEYS = ["low_y", "high_y", "high_x", "low_x"] as const;
export type RampFaceKey = (typeof RAMP_FACE_KEYS)[number];
export interface SegmentRule {
    readonly axis: "dx" | "dy";
    readonly when: "positive" | "negative";
    readonly p1: readonly [
        number,
        number
    ];
    readonly p2: readonly [
        number,
        number
    ];
    readonly kind: "live" | "constant";
}
export interface RampConstantsGroup {
    readonly HIT_CLASSES: readonly number[];
    readonly SEGMENT_CLASSES: readonly number[];
    readonly LIFT_CLASS: number;
    readonly FACE_INDEX: {
        readonly [F in RampFaceKey]: number;
    };
    readonly HI_LO_SWAPPED: boolean;
    readonly FILL_BYTE: number;
    readonly ARMS: ReadonlyMap<number, RampArms>;
    readonly SEGMENT_RULES: ReadonlyMap<number, SegmentRule>;
}
const SNAP_PREFIX = "SNAP.";
export interface SnapConstantsGroup {
    readonly BOB_TABLE: ReadonlyArray<readonly [
        number,
        number
    ]>;
}
const LIGHT_PREFIX = "LIGHT.";
export interface LightConstantsGroup {
    readonly VIEW_DISTANCE: number;
    readonly BEAM_FIRST: number;
    readonly BEAM_COLUMNS: number;
    readonly BEAM_SWAY: number;
}
const NIGHT_PREFIX = "NIGHT.";
export interface NightConstantsGroup {
    readonly VIEW_DISTANCE: number;
}
export const NIGHT_KEEPS_OWN_ART_MODE = 3;
export type RendConstants = {
    readonly [K in IntId]: number;
} & {
    readonly [K in IntListId]: readonly number[];
} & {
    readonly [K in PairListId]: ReadonlyArray<readonly [
        number,
        number
    ]>;
} & {
    readonly [K in FaceMapId]: {
        readonly [F in FaceKey]: number;
    };
} & {
    readonly DOOR: DoorConstantsGroup;
} & {
    readonly DIAG: DiagConstantsGroup;
} & {
    readonly RAMP: RampConstantsGroup;
} & {
    readonly SNAP: SnapConstantsGroup;
} & {
    readonly LIGHT: LightConstantsGroup;
} & {
    readonly NIGHT: NightConstantsGroup;
};
export const REND_DATA_FORMAT = "zt-spec-data/1";
export const REND_SPEC = "ZT-REND-WALL";
export const REND_PREFIX = "REND.";
export const REND_ID_COUNT = 79;
export const REND_EYE = Object.freeze({
    SHEAR_SHIFT: 6,
    LANE_EXTRA_SHIFT: 2,
    LANE_EYE_MAX: 25,
    OWN_FILL_ROWS_MAX: 2,
});
interface DataConstant {
    id?: unknown;
    value?: unknown;
}
interface DataDoc {
    format?: unknown;
    spec?: unknown;
    constants?: unknown;
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
function isIntList(v: unknown, n: number | null): v is number[] {
    return Array.isArray(v) && (n === null || v.length === n) && v.every(isInt);
}
function isPairList(v: unknown, n: number): v is [
    number,
    number
][] {
    return Array.isArray(v) && v.length === n && v.every((p) => Array.isArray(p) && p.length === 2 && isInt(p[0]) && isInt(p[1]));
}
export function rendConstantsFrom(doc: unknown): RendConstants {
    const d = doc as DataDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("rend_wall.json: not an object");
    if (d.format !== REND_DATA_FORMAT)
        throw new Error(`rend_wall.json: format ${String(d.format)}, expected ${REND_DATA_FORMAT}`);
    if (d.spec !== REND_SPEC)
        throw new Error(`rend_wall.json: spec ${String(d.spec)}, expected ${REND_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error("rend_wall.json: no constants array");
    const values = new Map<string, unknown>();
    for (const c of d.constants as DataConstant[]) {
        if (typeof c.id !== "string" || !c.id.startsWith(REND_PREFIX))
            throw new Error(`rend_wall.json: a constant without a REND.* id: ${JSON.stringify(c.id)}`);
        if (values.has(c.id))
            throw new Error(`rend_wall.json: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const out: Record<string, unknown> = {};
    const take = (id: string, check: (v: unknown) => boolean, what: string, map: (v: unknown) => unknown = (v) => v): void => {
        const v = values.get(REND_PREFIX + id);
        if (v === undefined)
            throw new Error(`rend_wall.json: ${REND_PREFIX}${id} (used by the spec) is missing`);
        if (!check(v))
            throw new Error(`rend_wall.json: ${REND_PREFIX}${id} is not ${what}`);
        out[id] = Object.freeze(map(v));
    };
    for (const id of INT_IDS)
        take(id, isInt, "an integer");
    for (const [id, n] of Object.entries(INT_LIST_IDS))
        take(id, (v) => isIntList(v, n), n === null ? "a list of integers" : `a list of ${n} integers`);
    const angles = out["ANGLES"] as number;
    for (const id of PAIR_LIST_IDS) {
        take(id, (v) => isPairList(v, angles), `a list of ${angles} [x step, y step] pairs`, (v) => (v as [
            number,
            number
        ][]).map(([x, y]) => Object.freeze([x, y] as const)));
    }
    const isFaceMap = (v: unknown): boolean => !!v && typeof v === "object" && !Array.isArray(v) && FACE_KEYS.every((k) => isInt((v as Record<string, unknown>)[k])) && Object.keys(v).length === FACE_KEYS.length;
    for (const id of FACE_MAP_IDS)
        take(id, isFaceMap, `an object with the integer keys ${FACE_KEYS.join(", ")}`);
    const door: Record<string, unknown> = {};
    const takeDoor = (id: string, check: (v: unknown) => boolean, what: string): void => {
        const v = values.get(REND_PREFIX + DOOR_PREFIX + id);
        if (v === undefined)
            throw new Error(`rend_wall.json: ${REND_PREFIX}${DOOR_PREFIX}${id} (used by the spec, 4.16) is missing`);
        if (!check(v))
            throw new Error(`rend_wall.json: ${REND_PREFIX}${DOOR_PREFIX}${id} is not ${what}`);
        door[id] = Object.freeze(v);
    };
    for (const id of DOOR_INT_IDS)
        takeDoor(id, isInt, "an integer");
    for (const [id, n] of Object.entries(DOOR_INT_LIST_IDS))
        takeDoor(id, (v) => isIntList(v, n), `a list of ${n} integers`);
    out["DOOR"] = Object.freeze(door);
    const diagIds = ["HYPOTENUSE", "BY_FACE", "PASS_X", "PASS_Y", "CAMERA_STRAIGHT", "CAMERA_DIAGONAL"] as const;
    const diagValue = (id: string): unknown => {
        const v = values.get(REND_PREFIX + DIAG_PREFIX + id);
        if (v === undefined)
            throw new Error(`rend_wall.json: ${REND_PREFIX}${DIAG_PREFIX}${id} (used by the spec, 4.18) is missing`);
        return v;
    };
    const diagFail = (id: string, what: string): never => {
        throw new Error(`rend_wall.json: ${REND_PREFIX}${DIAG_PREFIX}${id} is not ${what}`);
    };
    const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
    const isPair = (v: unknown): v is [
        number,
        number
    ] => Array.isArray(v) && v.length === 2 && isInt(v[0]) && isInt(v[1]);
    const hyp = new Map<number, DiagHypotenuse>();
    const hv = diagValue("HYPOTENUSE");
    if (!isRecord(hv))
        diagFail("HYPOTENUSE", "an object by class");
    for (const [k, e] of Object.entries(hv as Record<string, unknown>)) {
        const cls = Number(k);
        if (!Number.isInteger(cls) || !isRecord(e) || !isPair(e["left"]) || !isPair(e["right"]) || (e["first"] !== "left" && e["first"] !== "right") || !isInt(e["face_word"])) {
            diagFail("HYPOTENUSE", "an object class -> {left [x, y], right [x, y], first left|right, face_word}");
        }
        const r = e as {
            left: [
                number,
                number
            ];
            right: [
                number,
                number
            ];
            first: "left" | "right";
            face_word: number;
        };
        hyp.set(cls, Object.freeze({ left: Object.freeze([r.left[0], r.left[1]] as const), right: Object.freeze([r.right[0], r.right[1]] as const), first: r.first, face_word: r.face_word }));
    }
    if (hyp.size !== DIAG_CLASS_COUNT)
        diagFail("HYPOTENUSE", `a table of ${DIAG_CLASS_COUNT} classes`);
    const bf = diagValue("BY_FACE");
    if (!isRecord(bf) || !DIAG_FACE_KEYS.every((k) => isIntList(bf[k], null)) || Object.keys(bf).length !== DIAG_FACE_KEYS.length) {
        diagFail("BY_FACE", `an object with the class lists ${DIAG_FACE_KEYS.join(", ")}`);
    }
    const byFace: Record<string, readonly number[]> = {};
    for (const k of DIAG_FACE_KEYS)
        byFace[k] = Object.freeze([...((bf as Record<string, number[]>)[k]!)]);
    const quadrants = (out["ANGLES"] as number) / (out["QUARTER"] as number);
    const px = diagValue("PASS_X");
    const py = diagValue("PASS_Y");
    if (!isIntList(px, quadrants))
        diagFail("PASS_X", `a list of ${quadrants} classes`);
    if (!isIntList(py, quadrants))
        diagFail("PASS_Y", `a list of ${quadrants} classes`);
    const cs = diagValue("CAMERA_STRAIGHT");
    if (!isRecord(cs))
        diagFail("CAMERA_STRAIGHT", "an object by ray angle");
    const camStraight = new Map<number, readonly number[]>();
    for (const [k, e] of Object.entries(cs as Record<string, unknown>)) {
        const a = Number(k);
        if (!Number.isInteger(a) || !isIntList(e, null))
            diagFail("CAMERA_STRAIGHT", "an object angle -> class list");
        camStraight.set(a, Object.freeze([...(e as number[])]));
    }
    const cd = diagValue("CAMERA_DIAGONAL");
    if (!Array.isArray(cd) || cd.length !== quadrants || !cd.every((e) => isRecord(e) && isInt(e["always"]) && isInt(e["a_le_255"]) && isInt(e["b_le_255"]))) {
        diagFail("CAMERA_DIAGONAL", `a list of ${quadrants} objects {always, a_le_255, b_le_255}`);
    }
    const camDiag = (cd as DiagCameraDiagonal[]).map((e) => Object.freeze({ always: e.always, a_le_255: e.a_le_255, b_le_255: e.b_le_255 }));
    out["DIAG"] = Object.freeze({
        HYPOTENUSE: hyp,
        BY_FACE: Object.freeze(byFace) as DiagConstantsGroup["BY_FACE"],
        PASS_X: Object.freeze([...(px as number[])]),
        PASS_Y: Object.freeze([...(py as number[])]),
        CAMERA_STRAIGHT: camStraight,
        CAMERA_DIAGONAL: Object.freeze(camDiag),
    });
    const rampIds = ["HIT_CLASSES", "SEGMENT_CLASSES", "LIFT_CLASS", "FACE_INDEX", "HI_LO_SWAPPED", "FILL_BYTE", "ARMS", "SEGMENT_RULES"] as const;
    const rampValue = (id: string): unknown => {
        const v = values.get(REND_PREFIX + RAMP_PREFIX + id);
        if (v === undefined)
            throw new Error(`rend_wall.json: ${REND_PREFIX}${RAMP_PREFIX}${id} (used by the spec, 4.19 / 4.20) is missing`);
        return v;
    };
    const rampFail = (id: string, what: string): never => {
        throw new Error(`rend_wall.json: ${REND_PREFIX}${RAMP_PREFIX}${id} is not ${what}`);
    };
    const hit = rampValue("HIT_CLASSES");
    if (!isIntList(hit, null))
        rampFail("HIT_CLASSES", "a list of classes");
    const seg = rampValue("SEGMENT_CLASSES");
    if (!isIntList(seg, null))
        rampFail("SEGMENT_CLASSES", "a list of classes");
    const liftClass = rampValue("LIFT_CLASS");
    if (!isInt(liftClass))
        rampFail("LIFT_CLASS", "an integer");
    const fi = rampValue("FACE_INDEX");
    if (!isRecord(fi) || !RAMP_FACE_KEYS.every((k) => isInt(fi[k])) || Object.keys(fi).length !== RAMP_FACE_KEYS.length)
        rampFail("FACE_INDEX", `an object with the integer keys ${RAMP_FACE_KEYS.join(", ")}`);
    const swapped = rampValue("HI_LO_SWAPPED");
    if (typeof swapped !== "boolean")
        rampFail("HI_LO_SWAPPED", "a flag");
    const fill = rampValue("FILL_BYTE");
    if (!isInt(fill))
        rampFail("FILL_BYTE", "an integer");
    const sbyte = (h: string): number => {
        const v = parseInt(h, 16);
        return v >= 128 ? v - 256 : v;
    };
    const wordsOf = (s: unknown): RampWords => {
        if (typeof s !== "string" || !/^[0-9A-Fa-f]{4}( [0-9A-Fa-f]{4}){3}$/.test(s))
            rampFail("ARMS", "an arm of four 4-digit hex words");
        const w = (s as string).split(" ").map((h) => Object.freeze({ hi: sbyte(h.slice(0, 2)), lo: sbyte(h.slice(2, 4)) }));
        return Object.freeze([w[0]!, w[1]!, w[2]!, w[3]!] as const);
    };
    const armsDoc = rampValue("ARMS");
    if (!isRecord(armsDoc))
        rampFail("ARMS", "an object by class");
    const arms = new Map<number, RampArms>();
    for (const [k, e] of Object.entries(armsDoc as Record<string, unknown>)) {
        const cls = Number(k);
        if (!Number.isInteger(cls) || !isRecord(e) || e["pos"] === undefined || e["zero"] === undefined || e["neg"] === undefined)
            rampFail("ARMS", "an object class -> {pos, zero, neg}");
        const r = e as Record<string, unknown>;
        const pos = wordsOf(r["pos"]);
        const neg = wordsOf(r["neg"]);
        const z = r["zero"];
        let zero: RampZeroArm;
        if (z === "=pos")
            zero = pos;
        else if (z === "=neg")
            zero = neg;
        else if (isRecord(z) && (z["axis"] === "dx" || z["axis"] === "dy"))
            zero = Object.freeze({ axis: z["axis"] as "dx" | "dy", then: wordsOf(z["then"]), else: wordsOf(z["else"]) });
        else
            zero = wordsOf(z);
        arms.set(cls, Object.freeze({ pos, zero, neg }));
    }
    const rulesDoc = rampValue("SEGMENT_RULES");
    if (!isRecord(rulesDoc))
        rampFail("SEGMENT_RULES", "an object by class");
    const rules = new Map<number, SegmentRule>();
    for (const [k, e] of Object.entries(rulesDoc as Record<string, unknown>)) {
        const cls = Number(k);
        if (!Number.isInteger(cls) || !isRecord(e) || (e["axis"] !== "dx" && e["axis"] !== "dy") || (e["when"] !== "positive" && e["when"] !== "negative") || !isPair(e["p1"]) || !isPair(e["p2"]) || (e["kind"] !== "live" && e["kind"] !== "constant")) {
            rampFail("SEGMENT_RULES", "an object class -> {axis dx|dy, when positive|negative, p1 [x, y], p2 [x, y], kind live|constant}");
        }
        const r = e as {
            axis: "dx" | "dy";
            when: "positive" | "negative";
            p1: [
                number,
                number
            ];
            p2: [
                number,
                number
            ];
            kind: "live" | "constant";
        };
        rules.set(cls, Object.freeze({ axis: r.axis, when: r.when, p1: Object.freeze([r.p1[0], r.p1[1]] as const), p2: Object.freeze([r.p2[0], r.p2[1]] as const), kind: r.kind }));
    }
    for (const cls of seg as number[])
        if (!rules.has(cls))
            throw new Error(`rend_wall.json: segment class ${cls} has no rule in ${REND_PREFIX}${RAMP_PREFIX}SEGMENT_RULES (4.20.1)`);
    for (const cls of hit as number[])
        if (cls !== liftClass && !arms.has(cls))
            throw new Error(`rend_wall.json: hit class ${cls} has no arms in ${REND_PREFIX}${RAMP_PREFIX}ARMS (4.19.1)`);
    const faceIndex: Record<string, number> = {};
    for (const k of RAMP_FACE_KEYS)
        faceIndex[k] = (fi as Record<string, number>)[k]!;
    out["RAMP"] = Object.freeze({
        HIT_CLASSES: Object.freeze([...(hit as number[])]),
        SEGMENT_CLASSES: Object.freeze([...(seg as number[])]),
        LIFT_CLASS: liftClass,
        FACE_INDEX: Object.freeze(faceIndex) as RampConstantsGroup["FACE_INDEX"],
        HI_LO_SWAPPED: swapped,
        FILL_BYTE: fill,
        ARMS: arms,
        SEGMENT_RULES: rules,
    });
    const snapIds = ["BOB_TABLE"] as const;
    const bob = values.get(REND_PREFIX + SNAP_PREFIX + "BOB_TABLE");
    if (bob === undefined)
        throw new Error(`rend_wall.json: ${REND_PREFIX}${SNAP_PREFIX}BOB_TABLE (used by the spec, 4.21) is missing`);
    if (!isPairList(bob, 8))
        throw new Error(`rend_wall.json: ${REND_PREFIX}${SNAP_PREFIX}BOB_TABLE is not a list of 8 [eye delta, angle delta] pairs`);
    out["SNAP"] = Object.freeze({ BOB_TABLE: Object.freeze((bob as [
            number,
            number
        ][]).map(([e, a]) => Object.freeze([e, a] as const))) });
    const lightIds = ["VIEW_DISTANCE", "BEAM_FIRST", "BEAM_COLUMNS", "BEAM_SWAY"] as const;
    const light: Record<string, number> = {};
    for (const id of lightIds) {
        const v = values.get(REND_PREFIX + LIGHT_PREFIX + id);
        if (v === undefined)
            throw new Error(`rend_wall.json: ${REND_PREFIX}${LIGHT_PREFIX}${id} (used by the spec, 4.22) is missing`);
        if (!Number.isInteger(v))
            throw new Error(`rend_wall.json: ${REND_PREFIX}${LIGHT_PREFIX}${id} is not an integer`);
        light[id] = v as number;
    }
    out["LIGHT"] = Object.freeze(light) as unknown as LightConstantsGroup;
    const nightIds = ["VIEW_DISTANCE"] as const;
    const night: Record<string, number> = {};
    for (const id of nightIds) {
        const v = values.get(REND_PREFIX + NIGHT_PREFIX + id);
        if (v === undefined)
            throw new Error(`rend_wall.json: ${REND_PREFIX}${NIGHT_PREFIX}${id} (used by the spec, 4.23) is missing`);
        if (!Number.isInteger(v))
            throw new Error(`rend_wall.json: ${REND_PREFIX}${NIGHT_PREFIX}${id} is not an integer`);
        night[id] = v as number;
    }
    out["NIGHT"] = Object.freeze(night) as unknown as NightConstantsGroup;
    const known: readonly string[] = [
        ...INT_IDS, ...Object.keys(INT_LIST_IDS), ...PAIR_LIST_IDS, ...FACE_MAP_IDS,
        ...DOOR_INT_IDS.map((id) => DOOR_PREFIX + id), ...Object.keys(DOOR_INT_LIST_IDS).map((id) => DOOR_PREFIX + id),
        ...diagIds.map((id) => DIAG_PREFIX + id),
        ...rampIds.map((id) => RAMP_PREFIX + id),
        ...snapIds.map((id) => SNAP_PREFIX + id),
        ...lightIds.map((id) => LIGHT_PREFIX + id),
        ...nightIds.map((id) => NIGHT_PREFIX + id),
    ];
    for (const id of values.keys()) {
        if (!known.includes(id.slice(REND_PREFIX.length)))
            throw new Error(`rend_wall.json: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    if (known.length !== REND_ID_COUNT)
        throw new Error(`rend_wall.json: this implementation knows ${known.length} ids, the spec says ${REND_ID_COUNT}`);
    const C = out as RendConstants;
    if (C.COLUMN_ANGLES.length !== C.RAY_LAST + 1)
        throw new Error(`rend_wall.json: COLUMN_ANGLES has ${C.COLUMN_ANGLES.length} entries, RAY_LAST + 1 is ${C.RAY_LAST + 1}`);
    if (C.RAY_STEP_BY_MODE.length !== C.MODE_MAX + 1 || C.VIEW_DISTANCE_BY_MODE.length !== C.MODE_MAX + 1 || C.WALL_LUT_SET_BY_MODE.length !== C.MODE_MAX + 1) {
        throw new Error("rend_wall.json: the mode tables do not cover modes 0..MODE_MAX");
    }
    if (C.VIEW_BYTES !== C.COLUMNS * C.VIEW_ROWS || C.TILE_COLUMN_BYTES !== C.COLUMN_GROUP * C.VIEW_ROWS || C.ROW_STRIDE !== C.COLUMN_GROUP) {
        throw new Error("rend_wall.json: the view buffer sizes (VIEW_BYTES, TILE_COLUMN_BYTES, ROW_STRIDE) do not agree with COLUMNS, VIEW_ROWS and COLUMN_GROUP");
    }
    if (C.BIG_HALF_ROWS * 2 !== C.VIEW_ROWS)
        throw new Error("rend_wall.json: BIG_HALF_ROWS is not half of VIEW_ROWS");
    if (C.DOOR.CAMERA_RAY_STEP_BY_MODE.length !== C.MODE_MAX + 1)
        throw new Error("rend_wall.json: REND.DOOR.CAMERA_RAY_STEP_BY_MODE does not cover modes 0..MODE_MAX");
    return Object.freeze(out) as RendConstants;
}

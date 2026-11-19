export const MOVE_DATA_FORMAT = "zt-spec-data/1";
const PREFIX = "MOVE.";
export interface DiagonalClass {
    readonly class: number;
    readonly blocked: "ne" | "se" | "sw" | "nw";
}
export interface MoveConstants {
    readonly ANGLE: {
        readonly UNITS: number;
    };
    readonly POS: {
        readonly CELL: number;
    };
    readonly MAP: {
        readonly WIDTH: number;
    };
    readonly VIEW: {
        readonly SHIFT: number;
    };
    readonly FIRST_STEP_TICK: number;
    readonly TURN: {
        readonly TARGET: number;
        readonly SHIFT_HOLD: number;
        readonly SHIFT_RELEASE: number;
    };
    readonly WALK: {
        readonly FORWARD: readonly number[];
        readonly BACK: readonly number[];
    };
    readonly STRAFE: {
        readonly TARGET: number;
    };
    readonly SPEED: {
        readonly SHIFT_HOLD: number;
        readonly SHIFT_RELEASE: number;
    };
    readonly JUMP: {
        readonly TIMER_START: number;
        readonly TIMER_STEP: number;
    };
    readonly CROUCH: {
        readonly Z_VEL: number;
        readonly TICKS: number;
        readonly SPEED_SHIFT: number;
    };
    readonly EXIT: {
        readonly Z_VEL: number;
        readonly CROUCH_TICKS: number;
    };
    readonly EYE: {
        readonly STEP: number;
    };
    readonly KNOCKBACK: {
        readonly SHIFT: number;
    };
    readonly COLLISION: {
        readonly SOLID_CLASSES: readonly number[];
        readonly DIAGONALS: readonly DiagonalClass[];
    };
    readonly CLAMP: {
        readonly LOW: number;
        readonly HIGH: number;
        readonly QUADRANT: number;
        readonly DIAGONAL_LOW: number;
        readonly DIAGONAL_HIGH: number;
    };
    readonly BOB: {
        readonly MIN_SPEED: number;
        readonly INDEX_SHIFT: number;
        readonly TABLE: ReadonlyArray<readonly [
            number,
            number
        ]>;
        readonly ACC_MASK: number;
    };
    readonly FOOTSTEP: {
        readonly PERIOD: number;
        readonly SFX_ID: number;
        readonly NOTES: readonly number[];
    };
    readonly STAIR: {
        readonly HOLD: number;
        readonly EASED: readonly number[];
        readonly CREST: ReadonlyMap<number, StairHold>;
        readonly GUIDE: ReadonlyMap<number, ReadonlyArray<readonly [
            number,
            number
        ]>>;
        readonly GUIDE_DEFAULT: number;
        readonly EYE_SHIFT: number;
    };
    readonly FURNITURE: {
        readonly LARGE_CLASSES: readonly number[];
        readonly LARGE_LIMIT: number;
        readonly LARGE_RADIUS: number;
        readonly SMALL_CLASSES: readonly number[];
        readonly SMALL_LIMIT: number;
        readonly SMALL_RADIUS: number;
    };
}
export interface StairHold {
    readonly axis: "x" | "y";
    readonly kept: "high" | "low";
}
const NUMERIC_IDS = [
    "ANGLE.UNITS", "POS.CELL", "MAP.WIDTH", "VIEW.SHIFT", "FIRST_STEP_TICK",
    "TURN.TARGET", "TURN.SHIFT_HOLD", "TURN.SHIFT_RELEASE",
    "STRAFE.TARGET", "SPEED.SHIFT_HOLD", "SPEED.SHIFT_RELEASE",
    "JUMP.TIMER_START", "JUMP.TIMER_STEP",
    "CROUCH.Z_VEL", "CROUCH.TICKS", "CROUCH.SPEED_SHIFT",
    "EXIT.Z_VEL", "EXIT.CROUCH_TICKS", "EYE.STEP", "KNOCKBACK.SHIFT",
    "CLAMP.LOW", "CLAMP.HIGH", "CLAMP.QUADRANT", "CLAMP.DIAGONAL_LOW", "CLAMP.DIAGONAL_HIGH",
    "BOB.MIN_SPEED", "BOB.INDEX_SHIFT", "BOB.ACC_MASK",
    "FOOTSTEP.PERIOD", "FOOTSTEP.SFX_ID",
    "STAIR.HOLD", "STAIR.GUIDE_DEFAULT", "STAIR.EYE_SHIFT",
    "FURNITURE.LARGE_LIMIT", "FURNITURE.LARGE_RADIUS", "FURNITURE.SMALL_LIMIT", "FURNITURE.SMALL_RADIUS",
] as const;
const NUMBER_LIST_IDS = ["WALK.FORWARD", "WALK.BACK", "COLLISION.SOLID_CLASSES", "FOOTSTEP.NOTES", "STAIR.EASED", "FURNITURE.LARGE_CLASSES", "FURNITURE.SMALL_CLASSES"] as const;
const TRIANGLES = ["ne", "se", "sw", "nw"] as const;
interface DataConstant {
    id?: unknown;
    value?: unknown;
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
export function moveConstantsFrom(doc: unknown): MoveConstants {
    const d = doc as {
        format?: unknown;
        spec?: unknown;
        constants?: unknown;
    } | null;
    if (!d || typeof d !== "object")
        throw new Error("move.json: not an object");
    if (d.format !== MOVE_DATA_FORMAT)
        throw new Error(`move.json: format ${String(d.format)}, expected ${MOVE_DATA_FORMAT}`);
    if (!Array.isArray(d.constants))
        throw new Error("move.json: no constants list");
    const values = new Map<string, unknown>();
    for (const c of d.constants as DataConstant[]) {
        if (typeof c.id !== "string" || !c.id.startsWith(PREFIX))
            throw new Error(`move.json: constant id ${String(c.id)} is not a MOVE.* id`);
        values.set(c.id.slice(PREFIX.length), c.value);
    }
    const num = (id: string): number => {
        const v = values.get(id);
        if (!isInt(v))
            throw new Error(`move.json: ${PREFIX}${id} is missing or not an integer`);
        return v;
    };
    const list = (id: string): readonly number[] => {
        const v = values.get(id);
        if (!Array.isArray(v) || !v.every(isInt))
            throw new Error(`move.json: ${PREFIX}${id} is missing or not a list of integers`);
        return Object.freeze([...v] as number[]);
    };
    const known = new Set<string>([...NUMERIC_IDS, ...NUMBER_LIST_IDS, "COLLISION.DIAGONALS", "BOB.TABLE", "STAIR.CREST", "STAIR.GUIDE"]);
    for (const id of values.keys())
        if (!known.has(id))
            throw new Error(`move.json: unknown constant ${PREFIX}${id}`);
    for (const id of known)
        if (!values.has(id))
            throw new Error(`move.json: ${PREFIX}${id} is missing`);
    const diag = values.get("COLLISION.DIAGONALS");
    if (!Array.isArray(diag))
        throw new Error("move.json: MOVE.COLLISION.DIAGONALS is not a list");
    const diagonals: DiagonalClass[] = diag.map((e: {
        class?: unknown;
        blocked?: unknown;
    }) => {
        if (!isInt(e.class) || typeof e.blocked !== "string" || !(TRIANGLES as readonly string[]).includes(e.blocked)) {
            throw new Error("move.json: a MOVE.COLLISION.DIAGONALS entry is not {class, blocked: ne|se|sw|nw}");
        }
        return Object.freeze({ class: e.class, blocked: e.blocked as DiagonalClass["blocked"] });
    });
    const table = values.get("BOB.TABLE");
    if (!Array.isArray(table) || !table.every((p) => Array.isArray(p) && p.length === 2 && p.every(isInt)))
        throw new Error("move.json: MOVE.BOB.TABLE is not a list of [eye, angle] pairs");
    const bobTable = (table as number[][]).map((p) => Object.freeze([p[0]!, p[1]!] as [
        number,
        number
    ]));
    const crestDoc = values.get("STAIR.CREST");
    if (!crestDoc || typeof crestDoc !== "object" || Array.isArray(crestDoc))
        throw new Error("move.json: MOVE.STAIR.CREST is not a table");
    const crest = new Map<number, StairHold>();
    for (const [k, e] of Object.entries(crestDoc as Record<string, unknown>)) {
        if (!/^\d+$/.test(k) || !Array.isArray(e) || e.length !== 2 || (e[0] !== "x" && e[0] !== "y") || (e[1] !== "high" && e[1] !== "low"))
            throw new Error(`move.json: MOVE.STAIR.CREST entry ${k} is not [axis, high|low]`);
        crest.set(Number(k), Object.freeze({ axis: e[0] as "x" | "y", kept: e[1] as "high" | "low" }));
    }
    const guideDoc = values.get("STAIR.GUIDE");
    if (!guideDoc || typeof guideDoc !== "object" || Array.isArray(guideDoc))
        throw new Error("move.json: MOVE.STAIR.GUIDE is not a table");
    const guide = new Map<number, ReadonlyArray<readonly [
        number,
        number
    ]>>();
    for (const [k, e] of Object.entries(guideDoc as Record<string, unknown>)) {
        if (!/^\d+$/.test(k) || !Array.isArray(e) || !e.every((t) => Array.isArray(t) && t.length === 2 && t.every(isInt)))
            throw new Error(`move.json: MOVE.STAIR.GUIDE entry ${k} is not a list of [offset, crest class]`);
        guide.set(Number(k), Object.freeze((e as number[][]).map((t) => Object.freeze([t[0]!, t[1]!] as const))));
    }
    const C: MoveConstants = {
        ANGLE: { UNITS: num("ANGLE.UNITS") },
        POS: { CELL: num("POS.CELL") },
        MAP: { WIDTH: num("MAP.WIDTH") },
        VIEW: { SHIFT: num("VIEW.SHIFT") },
        FIRST_STEP_TICK: num("FIRST_STEP_TICK"),
        TURN: { TARGET: num("TURN.TARGET"), SHIFT_HOLD: num("TURN.SHIFT_HOLD"), SHIFT_RELEASE: num("TURN.SHIFT_RELEASE") },
        WALK: { FORWARD: list("WALK.FORWARD"), BACK: list("WALK.BACK") },
        STRAFE: { TARGET: num("STRAFE.TARGET") },
        SPEED: { SHIFT_HOLD: num("SPEED.SHIFT_HOLD"), SHIFT_RELEASE: num("SPEED.SHIFT_RELEASE") },
        JUMP: { TIMER_START: num("JUMP.TIMER_START"), TIMER_STEP: num("JUMP.TIMER_STEP") },
        CROUCH: { Z_VEL: num("CROUCH.Z_VEL"), TICKS: num("CROUCH.TICKS"), SPEED_SHIFT: num("CROUCH.SPEED_SHIFT") },
        EXIT: { Z_VEL: num("EXIT.Z_VEL"), CROUCH_TICKS: num("EXIT.CROUCH_TICKS") },
        EYE: { STEP: num("EYE.STEP") },
        KNOCKBACK: { SHIFT: num("KNOCKBACK.SHIFT") },
        COLLISION: { SOLID_CLASSES: list("COLLISION.SOLID_CLASSES"), DIAGONALS: Object.freeze(diagonals) },
        CLAMP: { LOW: num("CLAMP.LOW"), HIGH: num("CLAMP.HIGH"), QUADRANT: num("CLAMP.QUADRANT"), DIAGONAL_LOW: num("CLAMP.DIAGONAL_LOW"), DIAGONAL_HIGH: num("CLAMP.DIAGONAL_HIGH") },
        BOB: { MIN_SPEED: num("BOB.MIN_SPEED"), INDEX_SHIFT: num("BOB.INDEX_SHIFT"), TABLE: Object.freeze(bobTable), ACC_MASK: num("BOB.ACC_MASK") },
        FOOTSTEP: { PERIOD: num("FOOTSTEP.PERIOD"), SFX_ID: num("FOOTSTEP.SFX_ID"), NOTES: list("FOOTSTEP.NOTES") },
        STAIR: { HOLD: num("STAIR.HOLD"), EASED: list("STAIR.EASED"), CREST: crest, GUIDE: guide, GUIDE_DEFAULT: num("STAIR.GUIDE_DEFAULT"), EYE_SHIFT: num("STAIR.EYE_SHIFT") },
        FURNITURE: { LARGE_CLASSES: list("FURNITURE.LARGE_CLASSES"), LARGE_LIMIT: num("FURNITURE.LARGE_LIMIT"), LARGE_RADIUS: num("FURNITURE.LARGE_RADIUS"), SMALL_CLASSES: list("FURNITURE.SMALL_CLASSES"), SMALL_LIMIT: num("FURNITURE.SMALL_LIMIT"), SMALL_RADIUS: num("FURNITURE.SMALL_RADIUS") },
    };
    if (C.WALK.FORWARD.length !== C.WALK.BACK.length)
        throw new Error("move.json: MOVE.WALK.FORWARD and MOVE.WALK.BACK differ in length");
    if (C.FOOTSTEP.NOTES.length !== 2)
        throw new Error("move.json: MOVE.FOOTSTEP.NOTES must hold a note per phase (0, 1)");
    if (C.BOB.TABLE.length === 0)
        throw new Error("move.json: MOVE.BOB.TABLE is empty");
    return deepFreeze(C);
}
function deepFreeze<T>(v: T): T {
    if (v && typeof v === "object" && !Object.isFrozen(v)) {
        Object.freeze(v);
        for (const k of Object.keys(v as object))
            deepFreeze((v as Record<string, unknown>)[k]);
    }
    return v;
}

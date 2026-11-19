import { s16, s32 } from "../arith.js";
import type { TrigTable } from "../trig.js";
import type { SpriteConstants } from "./constants.js";
import { frameOf } from "./entity.js";
import { octagon } from "./types.js";
export const PARTNER_PREFIX = "REND.PARTNER.";
const PARTNER_INT_IDS = [
    "POSE_DYING", "POSE_PAIN", "POSE_SHOOT", "POSE_PUNCH", "POSE_STAND", "POSE_CROUCH_LOW", "POSE_KNEEL", "POSE_KNEEL_SHOOT",
    "PAIN_KNOCKBACK", "STAND_EYE_MIN", "CROUCH_EYE_MIN", "FIRE_FRAME", "WALK_MIN_FORWARD", "WALK_SCALE_SHIFT", "Z_BASE",
    "LOOK_VECTOR_MAGNITUDE", "FLAGS_STAND", "FLAGS_JUMP", "FLAGS_CROUCH", "JUMP_EYE_MIN",
] as const;
export interface PartnerConstants {
    readonly POSE_DYING: number;
    readonly POSE_PAIN: number;
    readonly POSE_SHOOT: number;
    readonly POSE_PUNCH: number;
    readonly POSE_STAND: number;
    readonly POSE_CROUCH_LOW: number;
    readonly POSE_KNEEL: number;
    readonly POSE_KNEEL_SHOOT: number;
    readonly PAIN_KNOCKBACK: number;
    readonly STAND_EYE_MIN: number;
    readonly CROUCH_EYE_MIN: number;
    readonly FIRE_FRAME: number;
    readonly WALK_MIN_FORWARD: number;
    readonly WALK_SCALE_SHIFT: number;
    readonly Z_BASE: number;
    readonly LOOK_VECTOR_MAGNITUDE: number;
    readonly FLAGS_STAND: number;
    readonly FLAGS_JUMP: number;
    readonly FLAGS_CROUCH: number;
    readonly JUMP_EYE_MIN: number;
    readonly BANK_STAND: string;
    readonly BANK_CROUCH: string;
    readonly POSE_HIDDEN: string;
    readonly PUNCH_FRAMES: readonly [
        number,
        number
    ];
    readonly ENTITY_DISTANCE_MAX: number;
}
export function partnerConstantsFrom(doc: unknown): PartnerConstants {
    const file = "rend_sprite.json";
    const list = (doc as {
        constants?: unknown;
    } | null)?.constants;
    if (!Array.isArray(list))
        throw new Error(`${file}: no constants array`);
    const m = new Map<string, unknown>();
    for (const c of list as Array<{
        id?: unknown;
        value?: unknown;
    }>)
        if (typeof c.id === "string")
            m.set(c.id, c.value);
    const get = (id: string): unknown => {
        if (!m.has(id))
            throw new Error(`${file}: ${id} (used by 4.14) is missing`);
        return m.get(id);
    };
    const out: Record<string, unknown> = {};
    for (const id of PARTNER_INT_IDS) {
        const v = get(PARTNER_PREFIX + id);
        if (typeof v !== "number" || !Number.isInteger(v))
            throw new Error(`${file}: ${PARTNER_PREFIX}${id} is not an integer`);
        out[id] = v;
    }
    for (const id of ["BANK_STAND", "BANK_CROUCH", "POSE_HIDDEN"]) {
        const v = get(PARTNER_PREFIX + id);
        if (typeof v !== "string" || v.length === 0)
            throw new Error(`${file}: ${PARTNER_PREFIX}${id} is not a name`);
        out[id] = v;
    }
    const pf = get(PARTNER_PREFIX + "PUNCH_FRAMES");
    if (!Array.isArray(pf) || pf.length !== 2 || !pf.every((x) => Number.isInteger(x)))
        throw new Error(`${file}: ${PARTNER_PREFIX}PUNCH_FRAMES is not a pair of integers`);
    out["PUNCH_FRAMES"] = Object.freeze([pf[0] as number, pf[1] as number]);
    const dm = get("REND.SPRITE.ENTITY_DISTANCE_MAX");
    if (typeof dm !== "number" || !Number.isInteger(dm))
        throw new Error(`${file}: REND.SPRITE.ENTITY_DISTANCE_MAX is not an integer`);
    out["ENTITY_DISTANCE_MAX"] = dm;
    return Object.freeze(out) as unknown as PartnerConstants;
}
export interface PartnerState {
    readonly x: number;
    readonly y: number;
    readonly angle: number;
    readonly forwardSpeed: number;
    readonly knockbackX: number;
    readonly knockbackY: number;
    readonly eyeOffset: number;
    readonly height: number;
    readonly liftTransit: number;
    readonly deathCounter: number;
    readonly weaponIsFists: boolean;
    readonly fireFrame: number;
    readonly counterByte: number;
}
export type PartnerPoseName = "hidden" | "dying" | "pain" | "shoot" | "punch" | "stand" | "crouch_low" | "kneel" | "kneel_shoot";
export interface PartnerPose {
    readonly pose: PartnerPoseName;
    readonly bank: string | null;
    readonly bankState: number | null;
    readonly frame: number | null;
}
export interface PartnerRecord extends PartnerPose {
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly z: number;
    readonly flags: number;
    readonly frameOverride: number | null;
    readonly speed: number;
}
function s8(v: number): number {
    return (v << 24) >> 24;
}
function walkMagnitude(forwardSpeed: number): number {
    const f = s8(forwardSpeed & 0xff);
    return f === -128 ? 128 : Math.abs(f);
}
export function partnerPose(s: PartnerState, C: PartnerConstants): PartnerPose {
    const e = s.eyeOffset;
    const walking = walkMagnitude(s.forwardSpeed) >= C.WALK_MIN_FORWARD;
    const walkFrame = walking ? -1 : 0;
    const stand = (pose: PartnerPoseName, state: number, frame: number): PartnerPose => ({ pose, bank: C.BANK_STAND, bankState: state, frame });
    const crouch = (pose: PartnerPoseName, state: number): PartnerPose => ({ pose, bank: C.BANK_CROUCH, bankState: state, frame: -1 });
    if (s.liftTransit === 1 || s.liftTransit === -1)
        return { pose: "hidden", bank: null, bankState: null, frame: null };
    if (s.deathCounter !== 0)
        return stand("dying", C.POSE_DYING, s.counterByte & 1);
    if (octagon(s16(s.knockbackX), s16(s.knockbackY)) > C.PAIN_KNOCKBACK)
        return stand("pain", C.POSE_PAIN, walkFrame);
    if (e >= C.STAND_EYE_MIN) {
        if (!s.weaponIsFists && s.fireFrame === C.FIRE_FRAME)
            return stand("shoot", C.POSE_SHOOT, walkFrame);
        if (s.weaponIsFists && s.fireFrame >= C.PUNCH_FRAMES[0] && s.fireFrame <= C.PUNCH_FRAMES[1])
            return stand("punch", C.POSE_PUNCH, walkFrame);
        return stand("stand", C.POSE_STAND, walkFrame);
    }
    if (e >= C.CROUCH_EYE_MIN)
        return crouch("crouch_low", C.POSE_CROUCH_LOW);
    if (s.fireFrame !== C.FIRE_FRAME)
        return crouch("kneel", C.POSE_KNEEL);
    return crouch("kneel_shoot", C.POSE_KNEEL_SHOOT);
}
export function partnerHeight(eyeOffset: number, hp: number, C: PartnerConstants): number {
    const e = eyeOffset;
    const t = e >= 0 ? e >> 1 : e === -1 ? -1 : e >> 3;
    return s8(t - s16(hp) - C.Z_BASE);
}
export function partnerFlags(eyeOffset: number, C: PartnerConstants): number {
    if (eyeOffset > C.JUMP_EYE_MIN)
        return C.FLAGS_JUMP;
    return eyeOffset >= -1 ? C.FLAGS_STAND : C.FLAGS_CROUCH;
}
export function partnerRecord(s: PartnerState, C: PartnerConstants, trig: TrigTable): PartnerRecord {
    const p = partnerPose(s, C);
    const n = trig.sin256.length;
    const a = ((s.angle % n) + n) % n;
    const lx = trig.sin256[a]!;
    const ly = trig.neg_cos256[a]!;
    const scaled = p.pose === "pain" || p.pose === "shoot" || p.pose === "punch" || p.pose === "stand";
    const m = walkMagnitude(s.forwardSpeed);
    const walking = scaled && m >= C.WALK_MIN_FORWARD;
    const vx = walking ? s32(m * lx) >> C.WALK_SCALE_SHIFT : lx;
    const vy = walking ? s32(m * ly) >> C.WALK_SCALE_SHIFT : ly;
    return {
        ...p,
        x: s16(s.x),
        y: s16(s.y),
        vx,
        vy,
        z: partnerHeight(s.eyeOffset, s.height, C),
        flags: partnerFlags(s.eyeOffset, C),
        frameOverride: p.frame,
        speed: walking ? octagon(vx, vy) : 0,
    };
}
export function partnerWalk(acc: number, record: Pick<PartnerRecord, "frameOverride" | "speed">, K: number, animLut: ReadonlyArray<readonly number[]>, SC: SpriteConstants): {
    frame: number;
    anim: number;
} | null {
    if (record.frameOverride === null)
        return { frame: 0, anim: acc };
    return frameOf(K, record.frameOverride, record.speed, acc, animLut, SC);
}
export function partnerVisible(viewerFloor: number, partnerFloor: number, octDistFromCamera: number, C: PartnerConstants): boolean {
    return viewerFloor === partnerFloor && octDistFromCamera <= C.ENTITY_DISTANCE_MAX;
}

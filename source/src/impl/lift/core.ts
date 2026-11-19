import type { LiftConstants } from "./constants.js";
import type { VoiceEntry } from "../pickup/constants.js";
export interface LiftState {
    state: number;
    slide: number;
    music: boolean;
}
export function liftStart(): LiftState {
    return { state: 0, slide: 0, music: false };
}
function s16(v: number): number {
    return (v << 16) >> 16;
}
export type LiftCellKind = "arrive" | "up" | "down" | "both" | "other";
export function liftCellKind(cls: number, L: LiftConstants): LiftCellKind {
    if (L.CLASS.ARRIVE.includes(cls))
        return "arrive";
    if (L.CLASS.UP.includes(cls))
        return "up";
    if (L.CLASS.DOWN.includes(cls))
        return "down";
    if (L.CLASS.BOTH.includes(cls))
        return "both";
    return "other";
}
export type RideDirection = "up" | "down";
export interface LiftStartResult {
    readonly notSecured: boolean;
    readonly music: boolean;
    readonly sound: boolean;
}
const NOTHING: LiftStartResult = Object.freeze({ notSecured: false, music: false, sound: false });
export function liftEnter(lift: LiftState, kind: LiftCellKind, securedPhase: number, countedFloor: number, floor: number, L: LiftConstants): LiftStartResult | null {
    if (kind !== "up" && kind !== "down" && kind !== "both")
        return null;
    const notSecured = securedPhase === 0 && countedFloor === floor;
    if (lift.slide !== 0)
        return notSecured ? { notSecured, music: false, sound: false } : NOTHING;
    let music = false;
    if (!lift.music) {
        music = true;
        lift.music = true;
    }
    const dir: RideDirection = kind === "up" ? "up" : kind === "down" ? "down" : lift.state < 0 ? "down" : "up";
    lift.state = dir === "up" ? L.STATE.UP : L.STATE.DOWN;
    return { notSecured, music, sound: true };
}
export type LiftWalkResult = {
    readonly kind: "idle" | "riding" | "ended";
} | {
    readonly kind: "switch";
    readonly direction: RideDirection;
    readonly newFloor: number;
};
export function liftWalk(lift: LiftState, kind: LiftCellKind, floor: number, L: LiftConstants): LiftWalkResult {
    if (lift.state !== L.STATE.UP && lift.state !== L.STATE.DOWN)
        return { kind: "idle" };
    const down = lift.state === L.STATE.DOWN;
    lift.slide = s16(lift.slide + (down ? L.SLIDE.STEP : -L.SLIDE.STEP));
    const endCell = down ? kind === "up" : kind === "down";
    if (endCell) {
        const returned = down ? lift.slide >= 0 : lift.slide < 0;
        if (returned) {
            lift.state = down ? L.STATE.ARRIVED_DOWN : L.STATE.ARRIVED_UP;
            lift.slide = 0;
            return { kind: "ended" };
        }
        return { kind: "riding" };
    }
    if (lift.slide >= -L.SLIDE.LIMIT && lift.slide <= L.SLIDE.LIMIT)
        return { kind: "riding" };
    lift.slide = down ? -L.SLIDE.LIMIT : L.SLIDE.LIMIT;
    return { kind: "switch", direction: down ? "down" : "up", newFloor: floor + (down ? 1 : -1) };
}
export interface Eye {
    readonly cellX: number;
    readonly cellY: number;
    readonly fx: number;
    readonly fy: number;
}
export function eyeOf(x: number, y: number, VX: number, VY: number, L: LiftConstants): Eye {
    const ex = (x - (VX >> L.EYE.BACK_SHIFT)) & 0xffff;
    const ey = (y - (VY >> L.EYE.BACK_SHIFT)) & 0xffff;
    return { cellX: s16(ex) >> 8, cellY: s16(ey) >> 8, fx: ex & 255, fy: ey & 255 };
}
export type StairResult = {
    readonly kind: "none";
} | {
    readonly kind: "switch";
    readonly direction: RideDirection;
    readonly newFloor: number;
};
const NO_STAIR: StairResult = Object.freeze({ kind: "none" });
export function stairRoutine(lift: LiftState, cls: number, eye: Eye, floor: number, L: LiftConstants): StairResult {
    const S = L.STAIR;
    const ramp = S.RAMP.get(cls);
    if (ramp !== undefined) {
        const f = ramp.axis === "x" ? eye.fx : eye.fy;
        lift.slide = s16((ramp.offset + ramp.sign * f) >> S.RAMP_SHIFT);
        return NO_STAIR;
    }
    if (S.FLAT.includes(cls)) {
        lift.slide = 0;
        return NO_STAIR;
    }
    if (cls === S.LOW) {
        lift.slide = -L.SLIDE.LIMIT;
        return NO_STAIR;
    }
    if (cls === S.HIGH) {
        lift.slide = L.SLIDE.LIMIT;
        return NO_STAIR;
    }
    const crest = S.CREST.get(cls);
    if (crest !== undefined) {
        const f = crest.axis === "x" ? eye.fx : eye.fy;
        const highHalf = f >= S.CREST_MID;
        const inUpKeyHalf = crest.upKey === 1 ? highHalf : !highHalf;
        if (lift.slide !== L.SLIDE.LIMIT) {
            if (inUpKeyHalf) {
                lift.slide = L.SLIDE.LIMIT;
                return { kind: "switch", direction: "up", newFloor: floor - 1 };
            }
        }
        else if (!inUpKeyHalf) {
            lift.slide = -L.SLIDE.LIMIT;
            return { kind: "switch", direction: "down", newFloor: floor + 1 };
        }
        return NO_STAIR;
    }
    return NO_STAIR;
}
export function switchText(episode: number, direction: RideDirection, newFloor: number, L: LiftConstants): {
    readonly id: string;
    readonly voice: readonly VoiceEntry[];
} {
    if (episode === L.STEPPING_EPISODE) {
        const m = direction === "up" ? L.MSG.STEP_UP : L.MSG.STEP_DOWN;
        return { id: m.ID, voice: m.VOICE };
    }
    const table = episode === 0 ? L.ENTERING.EP0 : episode === 1 ? L.ENTERING.EP1 : null;
    if (table === null)
        throw new Error(`ZT-WORLD-LIFT 4.4: no ENTERING table for episode ${episode}`);
    const n = table[newFloor];
    if (n === undefined)
        throw new Error(`ZT-WORLD-LIFT 4.4: the ENTERING table of episode ${episode} has no entry for floor ${newFloor}`);
    const voice = L.ENTERING.VOICE.get(n);
    if (voice === undefined)
        throw new Error(`ZT-WORLD-LIFT 4.4: no voice list for messages.${n}`);
    return { id: `messages.${n}`, voice };
}
export function liftArrive(lift: LiftState, L: LiftConstants): boolean {
    const musicBack = lift.music;
    lift.music = false;
    if (lift.state !== 0)
        lift.state = lift.state < 0 ? L.STATE.ARRIVED_DOWN : L.STATE.ARRIVED_UP;
    lift.slide = 0;
    return musicBack;
}

import { asr, approach, mod } from "../move/arith.js";
import type { MoveConstants } from "../move/constants.js";
import type { MoveState, Targets } from "../move/core.js";
import type { ModernConstants } from "./constants.js";
import type { ModernInput } from "./canonical.js";
export interface ModernMoveHook {
    readonly input: ModernInput;
    readonly prev: ModernInput;
    readonly cap: number;
    readonly MD: ModernConstants;
}
export function turnCapOf(setting: "original" | "fast", MD: ModernConstants): number {
    return setting === "fast" ? MD.TURN_CAP_FAST : MD.TURN_CAP_ORIGINAL;
}
function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}
export function modernTargets(state: MoveState, hook: ModernMoveHook, C: MoveConstants): Targets {
    const { input, prev, MD } = hook;
    const t: Targets = { turn: 0, forward: 0, side: 0 };
    if (input.move > 0)
        t.forward = C.WALK.FORWARD[state.character]!;
    else if (input.move < 0)
        t.forward = C.WALK.BACK[state.character]!;
    const grounded = state.eyeOffset <= 0;
    if (grounded) {
        if (input.strafe < 0)
            t.side = -C.STRAFE.TARGET;
        else if (input.strafe > 0)
            t.side = C.STRAFE.TARGET;
    }
    if (input.turn < 0)
        t.turn = -C.TURN.TARGET;
    else if (input.turn > 0)
        t.turn = C.TURN.TARGET;
    if (t.forward !== 0 && t.side !== 0) {
        t.forward = asr(t.forward * MD.DIAG_SCALE, MD.DIAG_SHIFT);
        t.side = asr(t.side * MD.DIAG_SCALE, MD.DIAG_SHIFT);
    }
    if (input.jump && !prev.jump && grounded) {
        if (state.eyeOffset < 0) {
            state.zVel = 0;
        }
        else {
            state.jumpTimer = C.JUMP.TIMER_START;
            state.eyeOffset = 0;
        }
    }
    if (input.crouch) {
        state.zVel = C.CROUCH.Z_VEL;
        state.crouchCountdown = C.CROUCH.TICKS;
    }
    else if (prev.crouch) {
        state.zVel = 0;
        state.crouchCountdown = 0;
    }
    return t;
}
export function modernTurnAndAngle(state: MoveState, targets: Targets, onGround: boolean, hook: ModernMoveHook, C: MoveConstants): number {
    if (onGround) {
        const k = targets.turn !== 0 ? C.TURN.SHIFT_HOLD : C.TURN.SHIFT_RELEASE;
        state.turnVel = approach(state.turnVel, targets.turn, k);
    }
    const mouse = clamp(hook.input.mouse_turn, -hook.MD.MOUSE_TURN_MAX, hook.MD.MOUSE_TURN_MAX);
    const total = clamp(state.turnVel + mouse, -hook.cap, hook.cap);
    if (total !== 0)
        state.angle = mod(state.angle + total, C.ANGLE.UNITS);
    return total;
}

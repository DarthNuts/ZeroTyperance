import { approach, asr, mod, u16 } from "./arith.js";
import type { MoveConstants } from "./constants.js";
import type { MoveState, StepResult, Targets } from "./core.js";
import type { Pad } from "./tape.js";
export function padTargets(state: MoveState, pad: Pad, C: MoveConstants): Targets {
    const t: Targets = { turn: 0, forward: 0, side: 0 };
    if (!pad.a) {
        if (pad.left)
            t.turn = -C.TURN.TARGET;
        if (pad.right)
            t.turn = C.TURN.TARGET;
        if (pad.up)
            t.forward = C.WALK.FORWARD[state.character]!;
        if (pad.down)
            t.forward = C.WALK.BACK[state.character]!;
    }
    else {
        const sides = pad.left || pad.right;
        const grounded = state.eyeOffset <= 0;
        if (grounded) {
            if (pad.left)
                t.side = -C.STRAFE.TARGET;
            if (pad.right)
                t.side = C.STRAFE.TARGET;
        }
        if (pad.up && grounded) {
            if (state.eyeOffset < 0) {
                state.zVel = 0;
            }
            else if (!sides && !(state.prevA && state.prevUp)) {
                state.jumpTimer = C.JUMP.TIMER_START;
                state.eyeOffset = 0;
            }
        }
        if (pad.down && !sides) {
            state.zVel = C.CROUCH.Z_VEL;
            state.crouchCountdown = C.CROUCH.TICKS;
        }
    }
    state.prevA = pad.a;
    state.prevUp = pad.up;
    return t;
}
export function crouchCountdown(state: MoveState, C: MoveConstants): void {
    if (state.zVel !== C.CROUCH.Z_VEL)
        return;
    state.crouchCountdown = u16(state.crouchCountdown - 1);
    if (state.crouchCountdown === 0)
        state.zVel = 0;
}
export function verticalStep(state: MoveState, targets: Targets, C: MoveConstants): boolean {
    if (state.jumpTimer !== 0 || state.eyeOffset > 0) {
        state.eyeOffset += state.jumpTimer;
        state.jumpTimer -= C.JUMP.TIMER_STEP;
        if (state.eyeOffset <= 0) {
            state.eyeOffset = 0;
            state.jumpTimer = 0;
        }
        return true;
    }
    if (state.eyeOffset < 0) {
        targets.forward = asr(targets.forward, C.CROUCH.SPEED_SHIFT);
        targets.side = asr(targets.side, C.CROUCH.SPEED_SHIFT);
    }
    if (state.eyeOffset < state.zVel)
        state.eyeOffset += C.EYE.STEP;
    else if (state.eyeOffset > state.zVel)
        state.eyeOffset -= C.EYE.STEP;
    return false;
}
export function turnAndAngle(state: MoveState, targets: Targets, onGround: boolean, C: MoveConstants): void {
    if (onGround) {
        const k = targets.turn !== 0 ? C.TURN.SHIFT_HOLD : C.TURN.SHIFT_RELEASE;
        state.turnVel = approach(state.turnVel, targets.turn, k);
    }
    if (state.turnVel !== 0)
        state.angle = mod(state.angle + state.turnVel, C.ANGLE.UNITS);
}
export function speeds(state: MoveState, targets: Targets, onGround: boolean, C: MoveConstants): void {
    if (!onGround)
        return;
    const kf = targets.forward !== 0 ? C.SPEED.SHIFT_HOLD : C.SPEED.SHIFT_RELEASE;
    const ks = targets.side !== 0 ? C.SPEED.SHIFT_HOLD : C.SPEED.SHIFT_RELEASE;
    state.forward = approach(state.forward, targets.forward, kf);
    state.side = approach(state.side, targets.side, ks);
}
export function bobAndFootstep(state: MoveState, C: MoveConstants): StepResult {
    const speed = Math.abs(state.forward) + Math.abs(state.side);
    state.bobAcc = (state.bobAcc + speed) & C.BOB.ACC_MASK;
    let bob: {
        readonly eye: number;
        readonly angle: number;
    } | null = null;
    if (speed >= C.BOB.MIN_SPEED) {
        const e = C.BOB.TABLE[mod(state.bobAcc >> C.BOB.INDEX_SHIFT, C.BOB.TABLE.length)]!;
        bob = { eye: e[0], angle: e[1] };
    }
    const phase = Math.floor(state.bobAcc / C.FOOTSTEP.PERIOD) & 1;
    let footstep: {
        readonly id: number;
        readonly note: number;
    } | null = null;
    if (phase !== state.lastFootstepPhase) {
        state.lastFootstepPhase = phase;
        footstep = { id: C.FOOTSTEP.SFX_ID, note: C.FOOTSTEP.NOTES[phase]! };
    }
    return { footstep, bob };
}

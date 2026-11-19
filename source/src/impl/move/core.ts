import type { MoveConstants } from "./constants.js";
import type { FloorKinds } from "./floor_kinds.js";
import type { Pad } from "./tape.js";
import { bobAndFootstep, crouchCountdown, padTargets, speeds, turnAndAngle, verticalStep } from "./step.js";
import { displace } from "./collide.js";
import { furniturePush } from "./furniture.js";
import { stairHold } from "./stair.js";
import { modernTargets, modernTurnAndAngle } from "../modern/move.js";
import type { ModernMoveHook } from "../modern/move.js";
export interface ViewTable {
    readonly sin256: readonly number[];
    readonly neg_cos256: readonly number[];
}
export interface MoveState {
    x: number;
    y: number;
    angle: number;
    forward: number;
    side: number;
    eyeOffset: number;
    jumpTimer: number;
    zVel: number;
    bobAcc: number;
    knockbackX: number;
    knockbackY: number;
    character: number;
    turnVel: number;
    prevA: boolean;
    prevUp: boolean;
    crouchCountdown: number;
    lastFootstepPhase: number | null;
}
export interface Targets {
    turn: number;
    forward: number;
    side: number;
}
export interface FootstepRequest {
    readonly id: number;
    readonly note: number;
}
export interface StepResult {
    readonly footstep: FootstepRequest | null;
    readonly bob: {
        readonly eye: number;
        readonly angle: number;
    } | null;
    readonly angleDelta?: number;
}
export function moveStart(x: number, y: number, character: number, C: MoveConstants): MoveState {
    if (!Number.isInteger(character) || character < 0 || character >= C.WALK.FORWARD.length)
        throw new Error(`character slot ${character} is not 0 .. ${C.WALK.FORWARD.length - 1}`);
    return {
        x, y, angle: 0,
        forward: 0, side: 0,
        eyeOffset: 0, jumpTimer: 0, zVel: 0,
        bobAcc: 0, knockbackX: 0, knockbackY: 0,
        character,
        turnVel: 0, prevA: false, prevUp: false, crouchCountdown: 0, lastFootstepPhase: null,
    };
}
export function isStepTick(tick: number, C: MoveConstants): boolean {
    return tick >= C.FIRST_STEP_TICK;
}
export function moveStep(state: MoveState, pad: Pad, floor: FloorKinds, view: ViewTable, C: MoveConstants, dead = false, modern: ModernMoveHook | null = null): StepResult {
    let targets: Targets;
    if (dead) {
        targets = { turn: 0, forward: 0, side: 0 };
        state.zVel = C.EXIT.Z_VEL;
        state.crouchCountdown = C.EXIT.CROUCH_TICKS;
        state.prevA = pad.a;
        state.prevUp = pad.up;
    }
    else if (modern !== null) {
        targets = modernTargets(state, modern, C);
    }
    else {
        targets = padTargets(state, pad, C);
    }
    crouchCountdown(state, C);
    const jumped = verticalStep(state, targets, C);
    const onGround = state.eyeOffset <= 0;
    let angleDelta: number | null = null;
    if (modern !== null && !dead)
        angleDelta = modernTurnAndAngle(state, targets, onGround, modern, C);
    else
        turnAndAngle(state, targets, onGround, C);
    speeds(state, targets, onGround, C);
    void jumped;
    displace(state, floor, view, C);
    stairHold(state, floor, C);
    furniturePush(state, floor, C);
    const result = bobAndFootstep(state, C);
    return angleDelta === null ? result : { ...result, angleDelta };
}

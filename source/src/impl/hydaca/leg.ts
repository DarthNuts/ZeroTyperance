import type { Ctx } from "./common.js";
import { currentFloor, phaseCounter, targetPos } from "./common.js";
import { bits, draw, octDistBetween, s16, sar, signedShift, u16 } from "./arith.js";
import { LIVE_FOLD, foldBack } from "./death.js";
import type { FoldOptions } from "./death.js";
function mod(x: number, m: number): number {
    return ((x % m) + m) % m;
}
export function newLeg(ctx: Ctx): void {
    const { e, h, C } = ctx;
    const target = targetPos(ctx);
    const r1 = draw(ctx.rng);
    const d = octDistBetween(e.pos.x, e.pos.y, target.x, target.y);
    const distPart = sar(s16(d), C.LEG_DIST_SHIFT);
    const randPart = bits(r1, C.LEG_RAND_SHIFT, C.LEG_RAND_MASK);
    e.counter = mod(distPart + randPart, C.LEG_TIMER_MODULUS);
    e.state = e.pos.z === C.Z_CEILING ? C.STATE_CEILING : C.STATE_FLOOR;
    const r2 = draw(ctx.rng);
    const s = signedShift(r2, C.JITTER_SHIFT);
    const jx = ((s & C.JITTER_BYTE_MASK) - C.JITTER_BIAS) * C.JITTER_SCALE;
    const jy = (((s >> C.JITTER_HIGH_SHIFT) & C.JITTER_BYTE_MASK) - C.JITTER_BIAS) * C.JITTER_SCALE;
    h.waypoint.x = u16(target.x + jx);
    h.waypoint.y = u16(target.y + jy);
}
export interface RetargetOptions {
    readonly mask: (C: Ctx["C"]) => number;
    readonly range: (C: Ctx["C"]) => number;
    readonly fold: FoldOptions;
}
export const LIVE_RETARGET: RetargetOptions = { mask: (C) => C.RETARGET_MASK, range: (C) => C.DESPAWN_RANGE, fold: LIVE_FOLD };
export function retargetStep(ctx: Ctx, opts: RetargetOptions = LIVE_RETARGET): boolean {
    const { e, h, C } = ctx;
    const phaseSum = mod(phaseCounter(ctx.view) + e.tag, C.PHASE_MODULUS);
    if ((phaseSum & opts.mask(C)) === 0) {
        h.target = e.floor === currentFloor(ctx.view) ? "player" : "none";
        if (h.target !== "player") {
            foldBack(ctx, opts.fold);
            return true;
        }
    }
    const target = targetPos(ctx);
    if (octDistBetween(e.pos.x, e.pos.y, target.x, target.y) >= opts.range(C)) {
        foldBack(ctx, opts.fold);
        return true;
    }
    return false;
}

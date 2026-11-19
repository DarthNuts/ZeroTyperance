import type { Entity } from "../../domain.js";
import { mul16, octDist, divTrunc, s16, sar, u8 } from "./arith.js";
import type { Ctx } from "./common.js";
import type { HydConstants } from "./constants.js";
import { CORPSE_FOLD } from "./death.js";
import { retargetStep } from "./leg.js";
import type { RetargetOptions } from "./leg.js";
import { moveWithCollision } from "./move.js";
import type { DamageCall } from "./damage.js";
const CORPSE_RETARGET: RetargetOptions = {
    mask: (C) => C.CORPSE_RETARGET_MASK,
    range: (C) => C.CORPSE_FOLD_RANGE,
    fold: CORPSE_FOLD,
};
function halve(v: number): number {
    return Math.trunc(v / 2);
}
export function corpseTick(ctx: Ctx): void {
    const { e } = ctx;
    const vx = halve(e.vel.x);
    const vy = halve(e.vel.y);
    e.vel.x = vx;
    e.vel.y = vy;
    if (vx !== 0 || vy !== 0)
        moveWithCollision(ctx, vx, vy);
    e.timer = 0;
    retargetStep(ctx, CORPSE_RETARGET);
}
export function corpseDamage(self: Entity, hit: DamageCall, C: HydConstants): Entity {
    const e: Entity = structuredClone(self);
    e.vel.x = 0;
    e.vel.y = 0;
    const loss = s16(C.DAMAGE_BASE - hit.impulse);
    if (loss < 0)
        return e;
    const ax = s16(-hit.rel.x);
    const ay = s16(-hit.rel.y);
    const r = s16(octDist(ax, ay) + 1);
    const scaledX = ax * (1 << C.UNIT_SHIFT);
    const scaledY = ay * (1 << C.UNIT_SHIFT);
    const unitX = r === 0 ? s16(scaledX) : s16(divTrunc(scaledX, r));
    const unitY = r === 0 ? s16(scaledY) : s16(divTrunc(scaledY, r));
    const k = sar(loss, C.CORPSE_KNOCK_LOSS_SHIFT);
    e.vel.x = s16(sar(mul16(unitX, k), C.KNOCK_OUT_SHIFT));
    e.vel.y = s16(sar(mul16(unitY, k), C.KNOCK_OUT_SHIFT));
    e.hp = s16(e.hp - loss);
    e.state = C.STATE_AIR;
    e.counter = u8(e.counter + 1);
    return e;
}

import { s16, sar } from "./arith.js";
import type { Ctx } from "./common.js";
import { setFlagBits } from "./common.js";
import { deathTransition } from "./death.js";
import { newLeg } from "./leg.js";
import { moveWithCollision } from "./move.js";
export function airTick(ctx: Ctx): void {
    const { e, C } = ctx;
    setFlagBits(ctx, C.FLAG_MOVING_BITS);
    e.pos.z = s16(e.pos.z + e.vel.z);
    e.vel.z = s16(e.vel.z - C.GRAVITY);
    if (e.pos.z > C.Z_FLOOR) {
        moveWithCollision(ctx, e.vel.x, e.vel.y);
        e.vel.x = sar(e.vel.x, C.FRICTION_SHIFT);
        e.vel.y = sar(e.vel.y, C.FRICTION_SHIFT);
        return;
    }
    e.pos.z = C.Z_FLOOR;
    e.vel.z = 0;
    e.state = C.STATE_FLOOR;
    if (e.hp < 0) {
        deathTransition(ctx);
    }
    else {
        newLeg(ctx);
    }
}

import type { Entity } from "../../domain.js";
import type { HydConstants } from "./constants.js";
import type { Vec2 } from "./common.js";
import { hiddenOf } from "./hidden.js";
import { divTrunc, mul16, octDist, s16, sar, u8 } from "./arith.js";
export interface DamageCall {
    impulse: number;
    rel: Vec2;
    mark: number;
}
export function damageEntry(self: Entity, hit: DamageCall, C: HydConstants): Entity {
    const e: Entity = structuredClone(self);
    const h = hiddenOf(e);
    e.counter = 0;
    e.vel.x = 0;
    e.vel.y = 0;
    const ax = s16(-hit.rel.x);
    const ay = s16(-hit.rel.y);
    const r = s16(octDist(ax, ay) + 1);
    const scaledX = ax * (1 << C.UNIT_SHIFT);
    const scaledY = ay * (1 << C.UNIT_SHIFT);
    const unitX = r === 0 ? s16(scaledX) : s16(divTrunc(scaledX, r));
    const unitY = r === 0 ? s16(scaledY) : s16(divTrunc(scaledY, r));
    const loss = s16(C.DAMAGE_BASE - hit.impulse);
    if (loss < 0)
        return e;
    if (e.hp >= 0) {
        e.hp = s16(e.hp - loss);
        h.hit_mark = u8(hit.mark);
    }
    const k = sar(loss, C.KNOCK_LOSS_SHIFT);
    e.vel.x = s16(sar(mul16(unitX, k), C.KNOCK_OUT_SHIFT));
    e.vel.y = s16(sar(mul16(unitY, k), C.KNOCK_OUT_SHIFT));
    e.state = C.STATE_AIR;
    e.vel.z = 0;
    if (e.pos.z === C.Z_FLOOR)
        e.vel.z = C.HIT_HOP;
    return e;
}

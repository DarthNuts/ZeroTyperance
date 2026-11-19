import { bits, draw, octDist, s16, sar, u8 } from "../hydaca/arith.js";
import { GRID_SIDE, OutsideSpecError, blockAt, floorRecount, mapWrite, soundRequest } from "./common.js";
import type { Ctx } from "./common.js";
import { moveWith } from "./walk.js";
import { newPlan } from "./attack.js";
export function hurtCall(ctx: Ctx): void {
    const e = ctx.e;
    const H = ctx.C.HURT;
    if (octDist(s16(e.vel.x), s16(e.vel.y)) < H.STOP_SPEED) {
        newPlan(ctx);
        return;
    }
    moveWith(ctx, e.vel.x, e.vel.y);
    e.vel.x = sar(e.vel.x, H.VELOCITY_SHIFT);
    e.vel.y = sar(e.vel.y, H.VELOCITY_SHIFT);
}
export function death(ctx: Ctx): void {
    const e = ctx.e;
    if (e.floor === ctx.inputs.playerFloor)
        soundRequest(ctx, ctx.C.DEATH.SOUND);
    if (e.hitMark !== 0) {
        e.gibbed = true;
        return;
    }
    e.flags = e.flags & ctx.C.CORPSE_FLAG_MASK;
    e.form = "corpse";
    e.timer = 0;
    e.vel.x = 0;
    e.vel.y = 0;
    e.state = ctx.C.CORPSE_STATE;
    floorRecount(ctx);
}
function halve(v: number): number {
    return Math.trunc(v / 2);
}
export function corpseCall(ctx: Ctx): void {
    const e = ctx.e;
    const K = ctx.C.CORPSE;
    e.vel.x = halve(e.vel.x);
    e.vel.y = halve(e.vel.y);
    if (e.vel.x !== 0 || e.vel.y !== 0)
        moveWith(ctx, e.vel.x, e.vel.y);
    const d = octDist(s16(e.pos.x - ctx.target.x), s16(e.pos.y - ctx.target.y));
    if (d >= K.LOOT_RANGE) {
        if ((u8(ctx.inputs.phase + e.tag) & K.RELOOK_MASK) === 0)
            e.target = e.floor === ctx.inputs.playerFloor ? "player" : "none";
        if (e.target === "none" || d >= K.STAMP_RANGE) {
            const col = (e.pos.x & 0xffff) >>> 8;
            const row = (e.pos.y & 0xffff) >>> 8;
            for (const [ox, oy] of ctx.C.AI.FOLD_ORDER) {
                if (blockAt(ctx, (row + oy!) * GRID_SIDE + col + ox!, e.floor) === 0) {
                    mapWrite(ctx, e.floor, col + ox!, row + oy!, ctx.inputs.cells.markerBlock(ctx.C.CORPSE_CELL_CLASS));
                    break;
                }
            }
            ctx.removed = true;
        }
        return;
    }
    if (e.state !== ctx.C.CORPSE_STATE || e.target !== "player")
        return;
    const R = draw(ctx.rng);
    const rounds = K.LOOT_ROUND_BASE + bits(R, K.LOOT_ROUND_SHIFT, K.LOOT_ROUND_MASK);
    if (ctx.inputs.loot === undefined)
        throw new OutsideSpecError("the corpse's loot needs the inventory (4.17 step 3): not modelled by the caller");
    if (!ctx.inputs.loot(K.LOOT_ITEM, rounds * K.LOOT_AMOUNT_UNIT))
        return;
    e.state = K.LOOT_STATE;
    if (e.floor === ctx.inputs.playerFloor)
        soundRequest(ctx, K.LOOT_SOUND);
}

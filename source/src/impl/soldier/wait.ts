import { octDist, s16, u16, u8 } from "../hydaca/arith.js";
import { OutsideSpecError, floorRecount, mapWrite, windowByte } from "./common.js";
import type { Ctx } from "./common.js";
function cellOf(v: number): number {
    return u16(v) >>> 8;
}
export function waitingPath(ctx: Ctx): boolean {
    const e = ctx.e;
    const A = ctx.C.AI;
    e.counter = (e.counter - 1) & A.COUNTER_MASK;
    if (e.counter === 0) {
        e.state = ctx.C.ATTACK_STATE;
        e.counter = A.ATTACK_COUNTER;
        return true;
    }
    retargetAndRangeTest(ctx, ctx.C.MARKER_CLASS);
    return false;
}
export function retargetAndRangeTest(ctx: Ctx, markerClass: number): void {
    const e = ctx.e;
    const A = ctx.C.AI;
    const retargets = (u8(ctx.inputs.phase + e.tag) & A.RETARGET_MASK) === 0;
    if (retargets) {
        if (e.floor === ctx.inputs.playerFloor) {
            e.target = "player";
        }
        else {
            e.target = "none";
            foldBack(ctx, markerClass);
            return;
        }
    }
    else if (e.target !== "player") {
        throw new OutsideSpecError(`hidden.target is ${e.target} at the call's start and the call does not retarget: not specified (4.12)`);
    }
    const d = octDist(s16(e.pos.x - ctx.target.x), s16(e.pos.y - ctx.target.y));
    if (d >= A.FOLD_RANGE)
        foldBack(ctx, markerClass);
}
function foldBack(ctx: Ctx, markerClass: number): void {
    const e = ctx.e;
    const col = cellOf(e.pos.x);
    const row = cellOf(e.pos.y);
    const mx = col - cellOf(ctx.start.x);
    const my = row - cellOf(ctx.start.y);
    if (mx < -1 || mx > 1 || my < -1 || my > 1) {
        throw new OutsideSpecError(`the fold back follows a move of (${mx}, ${my}) cells, more than one cell: not specified (4.8, 8.1)`);
    }
    ctx.removed = true;
    for (const [ox, oy] of ctx.C.AI.FOLD_ORDER) {
        if (windowByte(ctx, mx + ox!, my + oy!) === 0) {
            mapWrite(ctx, e.floor, col + ox!, row + oy!, ctx.inputs.cells.markerBlock(markerClass));
            return;
        }
    }
    floorRecount(ctx);
}

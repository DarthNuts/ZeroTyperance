import { blockedClassesOf } from "./constants.js";
import { cellAtIndex, cellIndex, divTrunc, octDist, s16, u16 } from "./arith.js";
import { targetPos } from "./common.js";
import type { Ctx } from "./common.js";
function blockedAt(ctx: Ctx, x: number, y: number): boolean {
    const idx = cellIndex(x, y, ctx.C.ROW_STRIDE);
    return blockedClassesOf(ctx.C).has(cellAtIndex(ctx.view.map, idx, ctx.C.ROW_STRIDE).cls);
}
function blockedIndex(ctx: Ctx, index: number): boolean {
    return blockedClassesOf(ctx.C).has(cellAtIndex(ctx.view.map, index, ctx.C.ROW_STRIDE).cls);
}
export function moveWithCollision(ctx: Ctx, vx: number, vy: number): void {
    const e = ctx.e;
    e.vel.x = s16(vx);
    e.vel.y = s16(vy);
    const nx = u16(e.pos.x + e.vel.x);
    const ny = u16(e.pos.y + e.vel.y);
    if (!blockedAt(ctx, nx, ny)) {
        e.pos.x = nx;
        e.pos.y = ny;
    }
    else if (!blockedAt(ctx, e.pos.x, ny)) {
        e.pos.y = ny;
    }
    else if (!blockedAt(ctx, nx, e.pos.y)) {
        e.pos.x = nx;
    }
    pushOffAndMagnet(ctx);
}
export function pushOffAndMagnet(ctx: Ctx): void {
    const e = ctx.e;
    const C = ctx.C;
    const stride = C.ROW_STRIDE;
    const c = cellIndex(e.pos.x, e.pos.y, stride);
    let fx = e.pos.x % C.TILE;
    const baseX = e.pos.x - fx;
    if (fx < C.PUSHOFF_LOW && blockedIndex(ctx, c - 1)) {
        fx = C.PUSHOFF_LOW;
    }
    else if (fx > C.PUSHOFF_HIGH && blockedIndex(ctx, c + 1)) {
        fx = C.PUSHOFF_HIGH;
    }
    let fy = e.pos.y % C.TILE;
    const baseY = e.pos.y - fy;
    if (fy < C.PUSHOFF_LOW && blockedIndex(ctx, c - stride)) {
        fy = C.PUSHOFF_LOW;
    }
    else if (fy > C.PUSHOFF_HIGH && blockedIndex(ctx, c + stride)) {
        fy = C.PUSHOFF_HIGH;
    }
    e.pos.x = baseX + fx;
    e.pos.y = baseY + fy;
    const t = targetPos(ctx);
    const dx = s16(e.pos.x - t.x);
    const dy = s16(e.pos.y - t.y);
    const r = u16(octDist(dx, dy) + 1);
    if (r !== 0 && r < C.MAGNET_LIMIT) {
        e.pos.x = u16(t.x + divTrunc(dx * C.MAGNET_RADIUS, r));
        e.pos.y = u16(t.y + divTrunc(dy * C.MAGNET_RADIUS, r));
    }
}

import { clamp, divTrunc, octDist, s16, sar, u16 } from "../hydaca/arith.js";
import { GRID_SIDE, classAt, moveIndex } from "./common.js";
import type { Ctx } from "./common.js";
const FRACTION_MASK = 0xff;
function blocked(ctx: Ctx, flatIndex: number): boolean {
    return ctx.C.AI.MOVE_BLOCKED_CLASSES.includes(classAt(ctx, flatIndex, ctx.e.floor));
}
function blockedAt(ctx: Ctx, x: number, y: number): boolean {
    return blocked(ctx, moveIndex(x, y));
}
function velocityAxis(home: number, position: number, ctx: Ctx): number {
    return clamp(sar(s16(home - position), ctx.C.AI.WALK_SHIFT), -ctx.C.AI.WALK_LIMIT, ctx.C.AI.WALK_LIMIT);
}
export function walkHome(ctx: Ctx): void {
    const e = ctx.e;
    const vx = velocityAxis(e.home.x, e.pos.x, ctx);
    const vy = velocityAxis(e.home.y, e.pos.y, ctx);
    e.vel.x = vx;
    e.vel.y = vy;
    moveWith(ctx, vx, vy);
}
export function moveWith(ctx: Ctx, vx: number, vy: number): void {
    const e = ctx.e;
    const A = ctx.C.AI;
    const x0 = e.pos.x;
    const y0 = e.pos.y;
    const nx = u16(x0 + vx);
    const ny = u16(y0 + vy);
    if (!blockedAt(ctx, nx, ny)) {
        e.pos.x = nx;
        e.pos.y = ny;
    }
    else if (!blockedAt(ctx, x0, ny)) {
        e.pos.y = ny;
    }
    else if (!blockedAt(ctx, nx, y0)) {
        e.pos.x = nx;
    }
    const c = moveIndex(e.pos.x, e.pos.y);
    const fx = e.pos.x & FRACTION_MASK;
    if (fx < A.PUSH_LOW && blocked(ctx, c - 1))
        e.pos.x = (e.pos.x & ~FRACTION_MASK) | A.PUSH_LOW;
    else if (fx > A.PUSH_HIGH && blocked(ctx, c + 1))
        e.pos.x = (e.pos.x & ~FRACTION_MASK) | A.PUSH_HIGH;
    const fy = e.pos.y & FRACTION_MASK;
    if (fy < A.PUSH_LOW && blocked(ctx, c - GRID_SIDE))
        e.pos.y = (e.pos.y & ~FRACTION_MASK) | A.PUSH_LOW;
    else if (fy > A.PUSH_HIGH && blocked(ctx, c + GRID_SIDE))
        e.pos.y = (e.pos.y & ~FRACTION_MASK) | A.PUSH_HIGH;
    const bodies = ctx.inputs.bodies;
    if (bodies === undefined)
        magnet(e, ctx.inputs.player.x, ctx.inputs.player.y, A.MAGNET_LIMIT, A.MAGNET_SHIFT);
    else
        for (const b of bodies.at)
            magnet(e, b.x, b.y, bodies.limit, A.MAGNET_SHIFT);
}
function magnet(e: Ctx["e"], px: number, py: number, limit: number, shift: number): void {
    const dx = s16(e.pos.x - px);
    const dy = s16(e.pos.y - py);
    const r = u16(octDist(dx, dy) + 1);
    if (r !== 0 && r < limit) {
        e.pos.x = u16(px + divTrunc(dx << shift, r));
        e.pos.y = u16(py + divTrunc(dy << shift, r));
    }
}

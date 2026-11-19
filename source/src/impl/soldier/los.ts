import { divTrunc, octDist, s16, u16 } from "../hydaca/arith.js";
import { FRACTION_MAX, blockAt, losIndex } from "./common.js";
import type { Ctx } from "./common.js";
function pointBlocks(ctx: Ctx, qx: number, qy: number): boolean {
    const floor = ctx.e.floor;
    const block = blockAt(ctx, losIndex(qx, qy), floor);
    const cls = ctx.inputs.cells.classOf(block);
    const value = ctx.C.AI.LOS_CLASS_VALUES.get(cls) ?? 0;
    const xf = qx & FRACTION_MAX;
    const yf = qy & FRACTION_MAX;
    switch (value) {
        case 0:
            return false;
        case 1:
        case 6:
        case 7:
            return true;
        case 2:
            return xf > yf;
        case 3:
            return xf + yf > FRACTION_MAX;
        case 4:
            return xf < yf;
        case 5:
            return xf + yf < FRACTION_MAX;
        default:
            return false;
    }
}
function lineClear(ctx: Ctx, px: number, py: number): boolean {
    const A = ctx.C.AI;
    const tx = ctx.target.x;
    const ty = ctx.target.y;
    const n = octDist(tx - px, ty - py) >>> A.LOS_STEP_SHIFT;
    if (n < A.LOS_MIN_STEPS)
        return true;
    const sx = divTrunc(s16(px - tx), n);
    const sy = divTrunc(s16(py - ty), n);
    for (let k = 1; k <= n - 1; k++) {
        if (pointBlocks(ctx, u16(tx + k * sx), u16(ty + k * sy)))
            return false;
    }
    return true;
}
export function shotLineClear(ctx: Ctx, x: number, y: number): boolean {
    const o = ctx.C.AI.PROBE_OFFSET;
    const points: ReadonlyArray<readonly [
        number,
        number
    ]> = [
        [x, y],
        [u16(x + o), y],
        [u16(x - o), y],
        [x, u16(y + o)],
        [x, u16(y - o)],
    ];
    const count = 1 + ctx.C.AI.PROBE_COUNT;
    for (let i = 0; i < count && i < points.length; i++) {
        const p = points[i]!;
        if (!lineClear(ctx, p[0], p[1]))
            return false;
    }
    return true;
}

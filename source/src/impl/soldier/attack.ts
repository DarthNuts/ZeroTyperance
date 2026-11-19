import { bits, draw, octDist, s16, s32, sar, u16, u8 } from "../hydaca/arith.js";
import { combatHitPlayer, cuePair } from "./common.js";
import type { Ctx } from "./common.js";
import { shotLineClear } from "./los.js";
import { death } from "./kill.js";
export function attackPath(ctx: Ctx): void {
    const A = ctx.C.AI;
    const e = ctx.e;
    e.counter = (e.counter - 1) & A.COUNTER_MASK;
    if (e.counter === 0) {
        newPlan(ctx);
    }
    else if (e.counter === A.SHOT_COUNTER) {
        shot(ctx);
    }
    else if (e.counter === A.CUE_COUNTER_A || e.counter === A.CUE_COUNTER_B) {
        cuePair(ctx);
    }
}
export function hitRoll(ctx: Ctx): boolean {
    const A = ctx.C.AI;
    const eye = s16(ctx.inputs.player.eyeOffset);
    const mode = ctx.inputs.cells.renderMode(ctx.inputs.playerFloor);
    if (eye >= 0 && mode === A.NO_ROLL_MODE)
        return true;
    const threshold = eye >= 0 ? A.THRESH_GROUND : mode === A.NO_ROLL_MODE ? A.THRESH_AIR_MODE0 : A.THRESH_AIR;
    const R = draw(ctx.rng);
    return bits(R, A.ROLL_SHIFT, A.ROLL_MASK) < threshold;
}
function shot(ctx: Ctx): void {
    const A = ctx.C.AI;
    const { x, y } = ctx.e.pos;
    const dx = s16(x - ctx.target.x);
    const dy = s16(y - ctx.target.y);
    if (!shotLineClear(ctx, x, y)) {
        newPlan(ctx);
        return;
    }
    if (!hitRoll(ctx)) {
        cuePair(ctx);
        return;
    }
    const d = octDist(dx, dy);
    if (d >= A.HIT_RANGE)
        return;
    combatHitPlayer(ctx, dx, dy, d);
    cuePair(ctx);
}
export function newPlan(ctx: Ctx): void {
    const A = ctx.C.AI;
    const e = ctx.e;
    if (s16(e.hp) < A.DEATH_HP_BELOW) {
        death(ctx);
        return;
    }
    const drawA = draw(ctx.rng);
    const drawB = draw(ctx.rng);
    const d = s16(octDist(s16(e.pos.x - ctx.target.x), s16(e.pos.y - ctx.target.y)));
    e.counter = u8(sar(d, A.PLAN_DIST_SHIFT) + bits(drawA, A.PLAN_COUNTER_SHIFT, A.PLAN_COUNTER_MASK));
    e.state = A.STATE_WAIT;
    const s = sar(s32(drawB), A.PLAN_HOME_SHIFT);
    e.home.x = u16(ctx.target.x + ctx.target.vx + ((s & A.PLAN_HOME_MASK) - A.PLAN_HOME_BIAS));
    e.home.y = u16(ctx.target.y + ctx.target.vy + (((s >> A.PLAN_HOME_Y_SHIFT) & A.PLAN_HOME_MASK) - A.PLAN_HOME_BIAS));
}

import { s16 } from "../arith.js";
import { entityRow } from "./project.js";
import { beamShadingOf, rasterize, shadingOf } from "./raster.js";
import type { DrawChoice } from "./soldier.js";
import { octagon } from "./types.js";
import type { EntityRecord, PassInputs } from "./types.js";
export const DOG_KIND = "enemy.rec6";
export const IMP_KIND = "enemy.rec2";
export const SF_KIND = "enemy.rec7";
export const SERGEANT_KIND = "enemy.rec0";
export const BOSS2_KIND = "enemy.rec9";
export const BOSS3_KIND = "enemy.rec8";
export const GRENADE_DRAW_VECTOR = "grenade.thrown.draw";
const AUTOMATIC = -1;
export function dogDraw(rec: EntityRecord, inputs: PassInputs): DrawChoice {
    const SC = inputs.ctx.SC;
    const bank = `${rec.kind}.art`;
    const st = rec.state & 0xff;
    if (rec.form === "corpse")
        return { bank, state: SC.DOG_POSE_CORPSE, d2: AUTOMATIC };
    if (st === SC.DOG_PAIN_STATE)
        return { bank, state: s16(rec.hp) >= 0 ? SC.DOG_POSE_PAIN : SC.DOG_POSE_DYING, d2: AUTOMATIC };
    if (st === SC.DOG_CHARGE_STATE) {
        const player = inputs.ctx.player;
        if (rec.target !== "player" || player === undefined)
            return { bank, state: SC.DOG_POSE_STAND, d2: AUTOMATIC };
        const far = octagon(s16(rec.pos.x - player.x), s16(rec.pos.y - player.y)) >= SC.DOG_RUN_DISTANCE;
        return { bank, state: (rec.counter & 0xff) >= SC.DOG_RUN_COUNTER && far ? SC.DOG_POSE_RUN : SC.DOG_POSE_LUNGE, d2: AUTOMATIC };
    }
    return { bank, state: SC.DOG_POSE_STAND, d2: AUTOMATIC };
}
export function impDraw(rec: EntityRecord, inputs: PassInputs): DrawChoice {
    const SC = inputs.ctx.SC;
    const bank = `${rec.kind}.art`;
    const st = rec.state & 0xff;
    if (rec.form === "corpse")
        return { bank, state: SC.IMP_POSE_CORPSE, d2: rec.counter & 1 };
    if (st === SC.IMP_PAIN_STATE)
        return { bank, state: s16(rec.hp) >= 0 ? SC.IMP_POSE_PAIN : SC.IMP_POSE_DYING, d2: AUTOMATIC };
    if (st === SC.IMP_ARMED_STATE)
        return { bank, state: SC.IMP_BITE_COUNTERS.includes(rec.counter & 0xff) ? SC.IMP_POSE_BITE : SC.IMP_POSE_ARMED, d2: AUTOMATIC };
    return { bank, state: SC.IMP_POSE_STAND, d2: AUTOMATIC };
}
export function sfDraw(rec: EntityRecord, inputs: PassInputs): DrawChoice {
    const SC = inputs.ctx.SC;
    const bank = `${rec.kind}.art`;
    const st = rec.state & 0xff;
    const c = rec.counter & 0xff;
    if (rec.form === "corpse")
        return { bank, state: SC.SF_POSE_CORPSE, d2: c & 1 };
    if (st === SC.SF_PAIN_STATE)
        return { bank, state: s16(rec.hp) >= 0 ? SC.SF_POSE_PAIN : SC.SF_POSE_DYING, d2: AUTOMATIC };
    if (st === SC.SF_ACTION_STATE) {
        const poses = rec.target === "player" ? SC.SF_ACTION_POSES : SC.SF_ACTION_POSES_OTHER;
        return { bank, state: c >= 6 || c === 1 ? poses[0]! : c === 4 || c === 2 ? poses[1]! : poses[2]!, d2: AUTOMATIC };
    }
    if (st === SC.SF_WINDUP_STATE)
        return { bank, state: c >= 7 || c <= 3 ? SC.SF_WINDUP_POSES[0]! : SC.SF_WINDUP_POSES[1]!, d2: AUTOMATIC };
    return { bank, state: SC.SF_POSE_STAND, d2: AUTOMATIC };
}
export function sergeantDraw(rec: EntityRecord, inputs: PassInputs): DrawChoice {
    const SC = inputs.ctx.SC;
    const bank = `${rec.kind}.art`;
    const st = rec.state & 0xff;
    const c = rec.counter & 0xff;
    if (rec.form === "corpse")
        return { bank, state: SC.SERGEANT_POSE_CORPSE, d2: c & 1 };
    if (st === SC.SERGEANT_PAIN_STATE)
        return { bank, state: s16(rec.hp) >= 0 ? SC.SERGEANT_POSE_PAIN : SC.SERGEANT_POSE_DYING, d2: AUTOMATIC };
    if (st === SC.SERGEANT_ACTION_STATE) {
        const poses = rec.target === "player" ? SC.SERGEANT_ACTION_POSES : SC.SERGEANT_ACTION_POSES_OTHER;
        return { bank, state: c === 1 || c === 9 ? poses[0]! : c === 4 || c === 6 ? poses[1]! : poses[2]!, d2: AUTOMATIC };
    }
    if (st === SC.SERGEANT_WINDUP_STATE)
        return { bank, state: c >= 7 || c <= 3 ? SC.SERGEANT_WINDUP_POSES[0]! : SC.SERGEANT_WINDUP_POSES[1]!, d2: AUTOMATIC };
    if (st === SC.SERGEANT_TRANSFORM_STATE)
        return { bank, state: SC.SERGEANT_POSE_TRANSFORM, d2: Math.min((c + 1) >> 1, SC.SERGEANT_TRANSFORM_FRAMES) };
    return { bank, state: SC.SERGEANT_POSE_STAND, d2: AUTOMATIC };
}
export function boss2Draw(rec: EntityRecord, inputs: PassInputs): DrawChoice {
    const SC = inputs.ctx.SC;
    const bank = `${rec.kind}.art`;
    const st = rec.state & 0xff;
    if (rec.form === "corpse")
        return { bank, state: SC.BOSS2_POSE_CORPSE, d2: AUTOMATIC };
    if (st === SC.BOSS2_PAIN_STATE)
        return { bank, state: s16(rec.hp) >= 0 ? SC.BOSS2_POSE_PAIN : SC.BOSS2_POSE_DYING, d2: AUTOMATIC };
    if (st === SC.BOSS2_WINDUP_STATE)
        return { bank, state: SC.BOSS_SHOT_COUNTERS.includes(rec.counter & 0xff) ? SC.BOSS2_POSE_ATTACK : SC.BOSS2_POSE_WINDUP, d2: AUTOMATIC };
    return { bank, state: SC.BOSS2_POSE_STAND, d2: AUTOMATIC };
}
export function boss3Draw(rec: EntityRecord, inputs: PassInputs): DrawChoice {
    const SC = inputs.ctx.SC;
    const bank = `${rec.kind}.art`;
    const st = rec.state & 0xff;
    const c = rec.counter & 0xff;
    const pose = (state: number): DrawChoice => ({ bank, state, d2: AUTOMATIC });
    if (rec.form === "corpse")
        return pose(SC.BOSS3_POSE_CORPSE);
    if (st === SC.BOSS3_PAIN_STATE)
        return pose(s16(rec.hp) >= 0 ? SC.BOSS3_POSE_PAIN : SC.BOSS3_POSE_DYING);
    if (st === SC.BOSS3_TRANSFORM_STATE) {
        if (c < SC.BOSS3_TRANSFORM_COUNTER)
            return pose(SC.BOSS3_POSE_TRANSFORM_END);
        if (inputs.ctx.draw === undefined) {
            inputs.note(`entity slot ${rec.slot}: Boss 3's transformation needs the generator (4.12p); no draw taken`);
            return pose(SC.BOSS3_POSE_TRANSFORM);
        }
        const R = inputs.ctx.draw();
        return pose(((R >>> SC.BOSS3_FLICKER_SHIFT) & SC.BOSS3_FLICKER_MASK) === 0 ? SC.BOSS3_POSE_FLICKER : SC.BOSS3_POSE_TRANSFORM);
    }
    const inWindow = SC.BOSS_SHOT_COUNTERS.includes(c);
    if (st === SC.BOSS3_WINDUP_STATE)
        return pose(inWindow ? SC.BOSS3_POSE_WINDUP : SC.BOSS3_POSE_WALK);
    if (SC.BOSS3_WALK_STATES.includes(st))
        return pose(inWindow ? SC.BOSS3_POSE_WALK_ALT : SC.BOSS3_POSE_WALK);
    return pose(SC.BOSS3_POSE_STAND);
}
export function kindDraw(rec: EntityRecord, inputs: PassInputs): DrawChoice | null {
    if (rec.kind === DOG_KIND)
        return dogDraw(rec, inputs);
    if (rec.kind === IMP_KIND)
        return impDraw(rec, inputs);
    if (rec.kind === SF_KIND)
        return sfDraw(rec, inputs);
    if (rec.kind === SERGEANT_KIND)
        return sergeantDraw(rec, inputs);
    if (rec.kind === BOSS2_KIND)
        return boss2Draw(rec, inputs);
    if (rec.kind === BOSS3_KIND)
        return boss3Draw(rec, inputs);
    return null;
}
export function drawGrenade(rec: EntityRecord, S: number, sx: number, inputs: PassInputs): void {
    const { ctx, surface, mode, note } = inputs;
    const SC = ctx.SC;
    const sy = entityRow(S, rec.z, inputs.eye, SC);
    const h = S >> SC.GRENADE_SIZE_SHIFT;
    const w = h >> 1;
    const sh = shadingOf(S, mode, ctx.assets, SC, note, inputs.nightVision === true);
    if (sh.table === null)
        return;
    const art = ctx.assets.itemArt(SC.GRENADE_ART);
    if (art === null) {
        note(`grenade slot ${rec.slot}: art slot ${SC.GRENADE_ART} is missing; nothing drawn`);
        return;
    }
    rasterize(surface, art, false, { h, w, left: s16(sx - (w >> 1)), top: s16(sy - w) }, S, sh.table, SC, beamShadingOf(surface, ctx.assets, SC, note).table);
}

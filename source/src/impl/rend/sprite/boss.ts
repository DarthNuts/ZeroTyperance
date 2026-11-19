import { s16 } from "../arith.js";
import { entityRow } from "./project.js";
import { beamShadingOf, rasterize, shadingOf } from "./raster.js";
import type { DrawChoice } from "./soldier.js";
import type { EntityRecord, PassInputs } from "./types.js";
export const BOSS_KIND = "enemy.rec5";
export const SHOT_DRAW_VECTOR = "projectile.shot.draw";
const BOSS_BANK = "enemy.rec5.art";
const AUTOMATIC = -1;
export function bossDraw(rec: EntityRecord, inputs: PassInputs): DrawChoice | null {
    const SC = inputs.ctx.SC;
    let state: number = SC.BOSS_POSE_STAND;
    if (rec.form === "corpse")
        state = SC.BOSS_POSE_CORPSE;
    else if ((rec.state & 0xff) === SC.BOSS_PAIN_STATE)
        state = s16(rec.hp) >= 0 ? SC.BOSS_POSE_PAIN : SC.BOSS_POSE_DYING;
    else if ((rec.state & 0xff) === SC.BOSS_WINDUP_STATE)
        state = SC.BOSS_SHOT_COUNTERS.includes(rec.counter & 0xff) ? SC.BOSS_POSE_SHOT : SC.BOSS_POSE_WINDUP;
    return { bank: BOSS_BANK, state, d2: AUTOMATIC };
}
export function drawShot(rec: EntityRecord, S: number, sx: number, inputs: PassInputs): void {
    const { ctx, surface, mode, note } = inputs;
    const SC = ctx.SC;
    const sy = entityRow(S, rec.z, inputs.eye, SC);
    const h = S >> SC.BOSS_SHOT_SIZE_SHIFT;
    const w = h >> 1;
    const top = sy - w;
    const left = sx - (w >> 1);
    const mirrored = (((ctx.phase ?? 0) + rec.tag) & SC.BOSS_SHOT_MIRROR_BIT) !== 0;
    const sh = shadingOf(S, mode, ctx.assets, SC, note, inputs.nightVision === true);
    if (sh.table === null)
        return;
    const art = ctx.assets.itemArt(SC.BOSS_SHOT_ART);
    if (art === null) {
        note(`shot slot ${rec.slot}: art slot ${SC.BOSS_SHOT_ART} is missing; nothing drawn`);
        return;
    }
    const beamSh = beamShadingOf(surface, ctx.assets, SC, note);
    rasterize(surface, art, mirrored, { h, w, left: s16(left), top: s16(top) }, S, mirrored ? sh.mirrored : sh.table, SC, mirrored ? beamSh.mirrored : beamSh.table);
}

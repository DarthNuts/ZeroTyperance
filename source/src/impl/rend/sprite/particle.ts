import { s16 } from "../arith.js";
import { PARTICLE_PICTURE as P } from "./constants.js";
import { entityRow } from "./project.js";
import { beamShadingOf, rasterize, shadingOf } from "./raster.js";
import type { EntityRecord, PassInputs, SpriteRect } from "./types.js";
function drawSlot(slot: number, mirrored: boolean, rect: SpriteRect, S: number, inputs: PassInputs, what: string): void {
    const { ctx, surface, mode, note } = inputs;
    const sh = shadingOf(S, mode, ctx.assets, ctx.SC, note, inputs.nightVision === true);
    if (sh.table === null)
        return;
    const art = ctx.assets.itemArt(slot);
    if (art === null) {
        note(`${what}: art slot ${slot} is missing; nothing drawn`);
        return;
    }
    const beamSh = beamShadingOf(surface, ctx.assets, ctx.SC, note);
    rasterize(surface, art, mirrored, rect, S, mirrored ? sh.mirrored : sh.table, ctx.SC, mirrored ? beamSh.mirrored : beamSh.table);
}
export function drawParticle(rec: EntityRecord, S: number, sx: number, inputs: PassInputs): void {
    const sy = entityRow(S, rec.z, inputs.eye, inputs.ctx.SC);
    const c = rec.counter & 0xff;
    const st = rec.state & 0xff;
    const mirrored = (rec.tag & P.MIRROR_MASK) !== 0;
    let h: number;
    let w: number;
    let top: number;
    let slot: number;
    if (st === P.STATE_FLYING) {
        slot = P.ART_FLYING;
        h = S >> P.HEIGHT_SHIFT;
        w = h >> P.WIDTH_SHIFT;
        top = sy - w;
    }
    else if (st === P.STATE_AGAINST_WALL) {
        slot = P.ART_RESTING;
        h = ((S * (c + P.COUNTER_FULL)) >> P.COUNTER_SHIFT) >> P.RESTING_HEIGHT_SHIFT;
        w = ((S * (P.COUNTER_FULL - c)) >> P.COUNTER_SHIFT) >> P.RESTING_WIDTH_SHIFT;
        top = sy;
    }
    else {
        slot = P.ART_RESTING;
        w = ((S * (c + P.LANDED_BIAS)) >> P.LANDED_SHIFT) >> P.RESTING_HEIGHT_SHIFT;
        h = ((S * (P.COUNTER_FULL - c)) >> P.COUNTER_SHIFT) >> P.RESTING_WIDTH_SHIFT;
        top = sy - (h >> 1);
    }
    const left = sx - (w >> 1);
    drawSlot(slot, mirrored, { h, w, left: s16(left), top: s16(top) }, S, inputs, `particle slot ${rec.slot}`);
}
export function drawImpact(rec: EntityRecord, S: number, sx: number, inputs: PassInputs): void {
    const sy = entityRow(S, rec.z, inputs.eye, inputs.ctx.SC);
    const st = rec.state & 0xff;
    const slot = P.IMPACT_ART_BASE + (P.IMPACT_STATE_LAST - st);
    const h = S >> P.HEIGHT_SHIFT;
    const w = h >> P.WIDTH_SHIFT;
    drawSlot(slot, false, { h, w, left: s16(sx - (w >> 1)), top: s16(sy - w) }, S, inputs, `impact slot ${rec.slot}`);
}

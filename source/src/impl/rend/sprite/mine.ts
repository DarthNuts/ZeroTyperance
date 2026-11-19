import { s16 } from "../arith.js";
import { entityRow } from "./project.js";
import { beamShadingOf, rasterize, shadingOf } from "./raster.js";
import type { EntityRecord, PassInputs, SpriteRect } from "./types.js";
export const MINE_PLACED_DRAW_VECTOR = "mine.placed.draw";
export const MINE_BLAST_DRAW_VECTOR = "mine.blast.draw";
function drawSlot(slot: number, mirrored: boolean, rect: SpriteRect, S: number, inputs: PassInputs, what: string): void {
    if (rect.h <= 0 || rect.w <= 0)
        return;
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
export function drawMine(rec: EntityRecord, S: number, sx: number, inputs: PassInputs): void {
    const SC = inputs.ctx.SC;
    const phase = inputs.ctx.phase;
    if (phase === null)
        inputs.note(`entity slot ${rec.slot}: a placed mine needs the animation counter (4.12i); counter 0 used`);
    const counter = phase ?? 0;
    const slot = (counter & SC.MINE_ALT_BIT) === 0 ? SC.MINE_ART : SC.MINE_ART_ALT;
    const sy = entityRow(S, rec.z, inputs.eye, SC);
    const h = S >> SC.MINE_SIZE_SHIFT;
    const w = h;
    drawSlot(slot, false, { h, w, left: s16(sx - (w >> 1)), top: s16(sy - h) }, S, inputs, `mine slot ${rec.slot}`);
}
export function drawBlast(rec: EntityRecord, S: number, sx: number, inputs: PassInputs): void {
    const SC = inputs.ctx.SC;
    const phase = inputs.ctx.phase;
    if (phase === null)
        inputs.note(`entity slot ${rec.slot}: a blast needs the animation counter (4.12j); counter 0 used`);
    if (rec.age === undefined)
        inputs.note(`entity slot ${rec.slot}: a blast without its age (4.12j): age 0 used`);
    const age = rec.age ?? 0;
    const shifts = SC.BLAST_SHIFTS;
    const shift = shifts[Math.min(age, shifts.length - 1)]!;
    const mirrored = ((phase ?? 0) & SC.BLAST_MIRROR_BIT) !== 0;
    const sy = entityRow(S, rec.z, inputs.eye, SC);
    const h = s16(2 * S) >> shift;
    const w = h >> 1;
    drawSlot(SC.BLAST_ART, mirrored, { h, w, left: s16(sx - (w >> 1)), top: s16(sy - w) }, S, inputs, `blast slot ${rec.slot}`);
}

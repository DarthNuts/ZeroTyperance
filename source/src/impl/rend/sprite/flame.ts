import { s16, s32 } from "../arith.js";
import type { SpriteConstants } from "./constants.js";
import { PARTICLE_PICTURE as P } from "./constants.js";
import { entityRow } from "./project.js";
import { beamShadingOf, rasterize, shadingOf } from "./raster.js";
import type { DrawChoice } from "./soldier.js";
import type { EntityRecord, PassInputs, SpriteRect } from "./types.js";
export const FLAME_STREAM_AI_VECTOR = "flame.stream.ai";
export const FLAME_STREAM_AI_IN_WALL_VECTOR = "flame.stream.ai_in_wall";
export const FLAME_STREAM_DRAW_VECTOR = "projectile.rocket.draw";
export const FLAME_GROUND_DRAW_VECTOR = "flame.ground.draw";
export const GIB_DRAW_VECTOR = "enemy.gib.draw";
export const GIB_KIND = "enemy.gib";
export function isFlameStream(rec: EntityRecord): boolean {
    return rec.vec.draw === FLAME_STREAM_DRAW_VECTOR && (rec.vec.ai === FLAME_STREAM_AI_VECTOR || rec.vec.ai === FLAME_STREAM_AI_IN_WALL_VECTOR || rec.vec.ai === "projectile.rocket.ai");
}
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
function mirroredByCounter(phase: number | null, SC: SpriteConstants, note: (s: string) => void, what: string): boolean {
    if (phase === null) {
        note(`${what}: the flame's mirror reads the animation counter, which this picture lacks; 0 used (ZT-REND-SPRITE 4.12d)`);
        return false;
    }
    return (phase & SC.FLAME_MIRROR_BIT) !== 0;
}
const FLAME_STREAM_HEIGHT_SHIFT = 1;
export function drawFlameStream(rec: EntityRecord, S: number, sx: number, inputs: PassInputs): void {
    const SC = inputs.ctx.SC;
    const sy = entityRow(S, rec.z, inputs.eye, SC);
    const h = S >> FLAME_STREAM_HEIGHT_SHIFT;
    const w = h >> P.WIDTH_SHIFT;
    const mirrored = mirroredByCounter(inputs.ctx.phase, SC, inputs.note, `flame stream slot ${rec.slot}`);
    drawSlot(SC.FLAME_STREAM_ART, mirrored, { h, w, left: s16(sx - (w >> 1)), top: s16(sy - w) }, S, inputs, `flame stream slot ${rec.slot}`);
}
export function drawGroundFlame(rec: EntityRecord, S: number, sx: number, inputs: PassInputs): void {
    const SC = inputs.ctx.SC;
    const sy = entityRow(S, -SC.EYE_BASE, inputs.eye, SC);
    if (rec.age === undefined)
        inputs.note(`entity slot ${rec.slot}: a ground flame without its age (ZT-REND-SPRITE 4.12e); 0 used`);
    const age = rec.age ?? 0;
    const size = s32(s16(S) * (SC.FLAME_LIFE - age)) >> SC.FLAME_SHRINK_SHIFT;
    if (size <= 0)
        return;
    const w = size >> P.WIDTH_SHIFT;
    const mirrored = mirroredByCounter(inputs.ctx.phase, SC, inputs.note, `ground flame slot ${rec.slot}`);
    drawSlot(SC.FLAME_GROUND_ART, mirrored, { h: size, w, left: s16(sx - (w >> 1)), top: s16(sy - size) }, S, inputs, `ground flame slot ${rec.slot}`);
}
const GIBS_BANK = "gibs.art";
const GIB_STATE = 0;
export function gibDraw(rec: EntityRecord, phase: number | null, inputs: PassInputs): DrawChoice | null {
    const SC = inputs.ctx.SC;
    const base = ((((phase ?? 0) + rec.tag) >> SC.GIB_FRAME_SHIFT) & SC.GIB_FRAME_MASK);
    const d2 = base + ((rec.counter & SC.GIB_COUNTER_BIT) !== 0 ? SC.GIB_COUNTER_FRAMES : 0);
    return { bank: GIBS_BANK, state: GIB_STATE, d2 };
}

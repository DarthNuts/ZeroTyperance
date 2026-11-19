import type { CameraConstants } from "../../camera/constants.js";
import { s16 } from "../arith.js";
import type { SoldierConstants } from "./constants.js";
import { entityRow } from "./project.js";
import { beamShadingOf, rasterize, shadingOf } from "./raster.js";
import type { EntityPool, EntityRecord, PassInputs, SpriteEvent, SpriteRect } from "./types.js";
export const CAMERA_DRAW_VECTOR = "camera.draw";
export const CAMERA_POP_DRAW_VECTOR = "camera.pop.draw";
export const CAMERA_VECTORS = { ai: "camera.ai", damage: "camera.damage", death: "camera.death", draw: CAMERA_DRAW_VECTOR } as const;
export const CAMERA_KIND = "unknown";
const POOL_SLOTS = 64;
export function cameraSpawn(cellX: number, cellY: number, centre: {
    x: number;
    y: number;
}, floor: number, pool: EntityPool, ES: SoldierConstants, C: CameraConstants): {
    record: EntityRecord;
    event: SpriteEvent;
} | null {
    let slot = 0;
    let at = 0;
    for (;;) {
        if (at < pool.records.length && pool.records[at]!.slot === slot) {
            slot++;
            at++;
        }
        else if (pool.occupied?.has(slot)) {
            slot++;
        }
        else
            break;
    }
    if (slot >= POOL_SLOTS)
        return null;
    const left = pool.residue?.(slot);
    const record: EntityRecord = {
        kind: CAMERA_KIND,
        slot,
        tag: slot + ES.TAG_OFFSET,
        form: "live",
        art: "main",
        flags: C.SPAWN_FLAGS,
        vec: { ...CAMERA_VECTORS },
        timer: 0,
        pos: { x: centre.x, y: centre.y },
        z: 0,
        vel: left ? { x: left.vel.x, y: left.vel.y } : { x: 0, y: 0 },
        state: 0,
        counter: 0,
        hp: C.HP,
        anim: left ? left.anim : 0,
        floor,
    };
    pool.records.splice(at, 0, record);
    return { record, event: { type: "Map.Write", floor, x: cellX, y: cellY, block: 0 } };
}
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
export function drawCamera(rec: EntityRecord, S: number, sx: number, inputs: PassInputs): void {
    const SC = inputs.ctx.SC;
    const slot = ((inputs.ctx.phase ?? 0) & SC.CAMERA_ALT_BIT) === 0 ? SC.CAMERA_ART : SC.CAMERA_ART + 1;
    const half = S >> 1;
    const h = half - (half >> 2);
    const w = h >> 1;
    const sy = entityRow(S, SC.CAMERA_ROW_OFFSET, inputs.eye, SC);
    drawSlot(slot, false, { h, w, left: s16(sx - (w >> 1)), top: sy }, S, inputs, `camera slot ${rec.slot}`);
}
export function drawCameraPop(rec: EntityRecord, S: number, sx: number, inputs: PassInputs): void {
    const SC = inputs.ctx.SC;
    const mirrored = ((inputs.ctx.phase ?? 0) & SC.POP_MIRROR_BIT) !== 0;
    const shift = SC.POP_SHRINK[Math.min(rec.counter >> 1, SC.POP_SHRINK.length - 1)]!;
    const h = S >> shift;
    const w = h >> 1;
    const sy = entityRow(S, rec.z, inputs.eye, SC);
    drawSlot(SC.POP_ART, mirrored, { h, w, left: s16(sx - (w >> 1)), top: s16(sy - w) }, S, inputs, `pop slot ${rec.slot}`);
}

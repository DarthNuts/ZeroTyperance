import { asr, divs, s16, s32, tdiv, u16 } from "../arith.js";
import type { SpriteConstants } from "./constants.js";
import type { Camera } from "./types.js";
export interface Projection {
    readonly F: number;
    readonly side: number;
    readonly S: number;
    readonly column: number;
}
function distances(wx: number, wy: number, cam: Camera, SC: SpriteConstants): {
    F: number;
    side: number;
} {
    const dx = s16(u16(wx) - cam.cx);
    const dy = s16(u16(wy) - cam.cy);
    const F = asr(s32(dx * cam.VX + dy * cam.VY), SC.DEPTH_SHIFT);
    const side = s32(dy * cam.VX - dx * cam.VY);
    return { F, side };
}
export function projectCell(wx: number, wy: number, cam: Camera, SC: SpriteConstants, note: (s: string) => void): Projection | null {
    const { F, side } = distances(wx, wy, cam, SC);
    if (F < SC.DEPTH_MIN)
        return null;
    const S = tdiv(SC.SCALE_NUMERATOR, F);
    const column = tdiv(side, F) + SC.COLUMN_CENTRE;
    if (S !== s16(S) || column !== s16(column))
        note(`cell projection: S ${S} or column ${column} outside 16 bits at F = ${F}: not specified (4.3); the truncated quotient is kept`);
    return { F, side, S, column };
}
export function projectEntity(wx: number, wy: number, cam: Camera, SC: SpriteConstants): Projection | null {
    const { F, side } = distances(wx, wy, cam, SC);
    if (F < SC.DEPTH_MIN)
        return null;
    const S0 = divs(SC.SCALE_NUMERATOR, F);
    const q = divs(side, F);
    if (S0 === null || q === null)
        return null;
    const S = u16(S0) <= SC.ENTITY_S_CAP ? S0 : SC.ENTITY_S_CAP;
    return { F, side, S, column: q + SC.COLUMN_CENTRE };
}
export function itemRow(S: number, eye: number, SC: SpriteConstants): number {
    return s16(asr(s32(S * s16(SC.EYE_BASE + eye - SC.ASSUMED_HEIGHT)), SC.ROW_SHIFT) + SC.ROW_BASE);
}
export function entityRow(S: number, z: number, eye: number, SC: SpriteConstants): number {
    return s16(asr(s32(s16(S) * s16(eye - SC.ASSUMED_HEIGHT - z)), SC.ROW_SHIFT) + SC.ROW_BASE);
}

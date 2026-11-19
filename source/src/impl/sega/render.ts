import { PATTERN_BYTES, TILE_PIXELS } from "../boot/model.js";
import type { Texture, TrigTable } from "./assets.js";
import type { SegaConstants } from "./constants.js";
export interface Corner {
    position: number;
    scale: number;
}
const FRAC_BITS = 8;
const FRAC_ONE = 1 << FRAC_BITS;
const HALVES = 2;
export function s16(v: number): number {
    return (v << 16) >> 16;
}
export function tdiv(a: number, b: number): number {
    return (a / b) | 0;
}
export function pictureBytes(C: SegaConstants): number {
    return C.BAND_COLUMNS * C.BAND_ROWS * PATTERN_BYTES;
}
export function pictureOffset(x: number, y: number, C: SegaConstants): number {
    const tile = C.BAND_ROWS * Math.floor(x / C.TILE_STRIPS) + Math.floor(y / TILE_PIXELS);
    return tile * PATTERN_BYTES + C.TILE_STRIPS * (y % TILE_PIXELS) + (x % C.TILE_STRIPS);
}
export function project(a: number, d: number, trig: TrigTable, C: SegaConstants): Corner {
    const i = a & (C.ANGLES - 1);
    const sn = trig.sin256[i]!;
    const nc = trig.negCos256[i]!;
    const D = s16(nc + d);
    let P = tdiv(sn << C.PROJ_SIN_SHIFT, C.PROJ_NORM);
    P = P << C.PROJ_POS_SHIFT;
    if (D !== 0)
        P = tdiv(P, D);
    const position = s16(P + C.PROJ_CENTRE);
    const scale = D !== 0 ? s16(tdiv(C.SCALE_NUMERATOR, D)) : 0;
    return { position, scale };
}
function textureOf(textures: ReadonlyMap<number, Texture>, id: number): Texture {
    const t = textures.get(id);
    if (!t)
        throw new Error(`render: texture ${id} (SEGA.TEX_ORDER) is not loaded`);
    return t;
}
function drawStrip(picture: Uint8Array, x: number, cur: number, c: number, textures: ReadonlyMap<number, Texture>, C: SegaConstants): void {
    const h = cur & ~1;
    const nf = (C.ROWS - h) / HALVES;
    const nw = h / HALVES;
    if (h < 0 || h > C.MAX_STRIP_SCALE || nf < 0) {
        throw new Error(`render: strip ${x} has scale ${cur} (h ${h}); a strip taller than SEGA.MAX_STRIP_SCALE (${C.MAX_STRIP_SCALE}) is not specified`);
    }
    const b = Math.floor(c / C.TEX_COLUMNS);
    const j = c % C.TEX_COLUMNS;
    const upper = textureOf(textures, C.TEX_ORDER[HALVES * b]!).bytes;
    const lower = textureOf(textures, C.TEX_ORDER[HALVES * b + 1]!).bytes;
    const colBase = C.TEX_COLUMN_BYTES * j;
    let y = 0;
    for (let n = 0; n < nf; n++, y++)
        picture[pictureOffset(x, y, C)] = C.FILL_BYTE;
    for (let i = 0; i < nw; i++, y++) {
        const q = Math.floor(((HALVES * i + 1) * C.TEX_COLUMN_BYTES) / h);
        picture[pictureOffset(x, y, C)] = upper[colBase + q]!;
    }
    for (let i = 0; i < nw; i++, y++) {
        const q = Math.floor(((HALVES * i + 1) * C.TEX_COLUMN_BYTES) / h);
        picture[pictureOffset(x, y, C)] = lower[colBase + q]!;
    }
    for (let n = 0; n < nf; n++, y++)
        picture[pictureOffset(x, y, C)] = C.FILL_BYTE;
}
export function drawFace(picture: Uint8Array, depth: Int16Array, xl: number, sl: number, xr: number, sr: number, textures: ReadonlyMap<number, Texture>, C: SegaConstants): boolean {
    if (sl < 0 || sr < 0 || xr < 0)
        return false;
    xl = Math.max(xl, 0);
    if (xl >= C.STRIPS)
        return false;
    xr = Math.min(xr, C.STRIPS - 1);
    const n = xr - xl + 1;
    if (n <= 0)
        return false;
    const ds = tdiv(sr * FRAC_ONE - sl * FRAC_ONE, n);
    const dt = tdiv((C.TEX_COORD_END - C.TEX_COORD_START) * C.TEX_COORD_SCALE, n);
    for (let k = 0; k < n; k++) {
        const x = xl + k;
        const cur = s16((sl * FRAC_ONE + k * ds) >> FRAC_BITS);
        const c = ((k + 1) * dt) >> FRAC_BITS;
        if (cur >= depth[x]!) {
            depth[x] = cur;
            drawStrip(picture, x, cur, c, textures, C);
        }
    }
    return true;
}

import { asr, s16 } from "../arith.js";
import type { SpriteConstants } from "./constants.js";
import type { Art, ItemRecord, SpriteAssets, SpriteObserver, SpriteRect, Surface } from "./types.js";
let ACTIVE_OBSERVER: SpriteObserver | null = null;
export function setSpriteObserver(o: SpriteObserver | null): void {
    ACTIVE_OBSERVER = o;
}
export interface RasterCall {
    readonly art: Art;
    readonly mirrored: boolean;
    readonly rect: SpriteRect;
    readonly clip: {
        readonly x0: number;
        readonly ncols: number;
        readonly row0: number;
        readonly nrows: number;
    };
}
export const RASTER_TRACE: {
    on: boolean;
    calls: RasterCall[];
    items: readonly ItemRecord[];
} = { on: false, calls: [], items: [] };
export interface Shading {
    readonly table: Uint8Array | null;
    readonly mirrored: Uint8Array | null;
}
const NOTHING: Shading = Object.freeze({ table: null, mirrored: null });
export function shadingOf(S: number, mode: number, assets: SpriteAssets & {
    readonly nightArray?: string | null;
}, SC: SpriteConstants, note: (s: string) => void, nightVision = false): Shading {
    const arrayName = nightVision ? (assets.nightArray ?? null) : assets.arrayOfMode(mode);
    if (arrayName === null) {
        note(nightVision ? "sprite shading: no night vision billboard array; nothing drawn" : `sprite shading: render mode ${mode} names no billboard array; nothing drawn`);
        return NOTHING;
    }
    let entry = 0;
    if (arrayName !== SC.IDENTITY_ARRAY) {
        const n = asr(s16(S), SC.BAND_SHIFT);
        if (n < 1)
            return NOTHING;
        entry = Math.max(0, SC.BAND_ENTRIES - n);
    }
    const entries = assets.shadeArray(arrayName);
    if (entries === null || entry >= entries.length) {
        note(`sprite shading: array ${arrayName} has no entry ${entry}; nothing drawn`);
        return NOTHING;
    }
    const lut = entries[entry];
    const table = assets.shadeTable(lut, false);
    const mirrored = assets.shadeTable(lut, true);
    if (table === null || mirrored === null) {
        note(`sprite shading: table ${lut} (array ${arrayName}, entry ${entry}) is missing; nothing drawn`);
        return NOTHING;
    }
    return { table, mirrored };
}
export function beamShadingOf(surface: Surface, assets: SpriteAssets, SC: SpriteConstants, note: (s: string) => void): Shading {
    if (!surface.beam)
        return NOTHING;
    const entries = assets.shadeArray(SC.IDENTITY_ARRAY);
    const lut = entries?.[0];
    if (lut === undefined) {
        note(`sprite shading: the identity array ${SC.IDENTITY_ARRAY} has no entry 0; the beam's columns keep the mode's table`);
        return NOTHING;
    }
    const table = assets.shadeTable(lut, false);
    const mirrored = assets.shadeTable(lut, true);
    if (table === null || mirrored === null) {
        note(`sprite shading: table ${lut} (the identity array) is missing; the beam's columns keep the mode's table`);
        return NOTHING;
    }
    return { table, mirrored };
}
export function rasterize(surface: Surface, art: Art, mirrored: boolean, rect: SpriteRect, S: number, table: Uint8Array | null, SC: SpriteConstants, beamTable: Uint8Array | null = null): void {
    if (table === null)
        return;
    if (ACTIVE_OBSERVER !== null && s16(rect.h) > 0 && s16(rect.w) > 0)
        ACTIVE_OBSERVER.part(art, mirrored, { h: s16(rect.h), w: s16(rect.w), left: s16(rect.left), top: s16(rect.top) });
    const beam = surface.beam ?? null;
    const beamFirst = beam !== null && beamTable !== null ? beam.first : -1;
    const beamEnd = beam !== null && beamTable !== null ? beam.first + beam.count : -1;
    const h = s16(rect.h);
    const w = s16(rect.w);
    const left = s16(rect.left);
    const top = s16(rect.top);
    if (h <= 0 || w <= 0 || left >= SC.VIEW_COLUMNS || top >= SC.VIEW_ROWS)
        return;
    if (s16(left + w - 1) < 0 || s16(top + h - 1) < 0)
        return;
    const row0 = Math.max(top, 0);
    const first = Math.max(-top, 0);
    const nrows = Math.min(h - first, SC.VIEW_ROWS - row0);
    const skip = Math.max(-left, 0);
    const x0 = Math.max(left, 0);
    const ncols = Math.min(w - skip, SC.VIEW_COLUMNS - x0);
    if (nrows <= 0 || ncols <= 0)
        return;
    if (RASTER_TRACE.on && ACTIVE_OBSERVER !== null)
        RASTER_TRACE.calls.push({ art, mirrored, rect: { h, w, left, top }, clip: { x0, ncols, row0, nrows } });
    const Ss = s16(S);
    const tall = h > SC.TALL_HEIGHT;
    const fracMask = (1 << SC.TALL_FRACTION_BITS) - 1;
    let vstep = 0;
    let p0 = 0;
    let a0 = 0;
    if (tall) {
        vstep = Math.floor(SC.TALL_NUMERATOR / h);
        const t = first * (1 << SC.ART_ROW_SHIFT);
        p0 = Math.floor(t / h);
        a0 = Math.floor(((t % h) * vstep) / (1 << SC.ART_ROW_SHIFT)) & fracMask;
    }
    for (let j = 0; j < ncols; j++) {
        const x = x0 + j;
        if (Ss < s16(surface.depth[x]))
            continue;
        const k = skip + j;
        let src: number;
        if (w >= SC.SMALL_WIDTH)
            src = Math.floor((SC.COLUMN_NUMERATOR * k) / w);
        else
            src = Math.max(0, Math.floor(((2 * k - 1) * SC.SMALL_COLUMN_NUMERATOR) / w));
        if (mirrored)
            src = SC.ART_COLUMNS - 1 - src;
        const artBase = src * SC.ART_ROWS;
        const colBase = x * surface.rows + row0;
        const tbl = x >= beamFirst && x < beamEnd ? beamTable! : table;
        for (let i = 0; i < nrows; i++) {
            let p: number;
            if (tall)
                p = p0 + ((a0 + (i + 1) * vstep) >> SC.TALL_FRACTION_BITS);
            else
                p = Math.floor(((2 * (first + i) + 1) * SC.ROW_NUMERATOR) / h);
            const b = art[artBase + p] ?? 0;
            if (b !== 0)
                surface.bytes[colBase + i] = tbl[b];
        }
    }
}

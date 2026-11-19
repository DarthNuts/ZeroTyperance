import type { ScreenPlane, ScreenPlaneFull, ScreenSprite, ScreenState } from "../../screen_types.js";
export type PatternLookup = (slot: number) => Uint8Array;
export interface Frame {
    width: number;
    height: number;
    data: Uint8ClampedArray<ArrayBuffer>;
}
const TILE_MASK = 0x7ff;
const HFLIP = 1 << 11;
const VFLIP = 1 << 12;
const LINE_SHIFT = 13;
const PRIORITY = 1 << 15;
const TILE = 8;
const TILE_SHIFT = 3;
const LEVEL_MAX = 7;
const LEVELS = Array.from({ length: LEVEL_MAX + 1 }, (_, l) => Math.round((l * 255) / LEVEL_MAX));
export function colourRgb(word: number): [
    number,
    number,
    number
] {
    return [LEVELS[(word >> 1) & LEVEL_MAX]!, LEVELS[(word >> 5) & LEVEL_MAX]!, LEVELS[(word >> 9) & LEVEL_MAX]!];
}
function patternPixel(pat: Uint8Array, px: number, py: number): number {
    const byte = pat[py * (TILE / 2) + (px >> 1)] ?? 0;
    return px & 1 ? byte & 15 : byte >> 4;
}
function entryPixel(entry: number, px: number, py: number, pattern: PatternLookup): number {
    const x = entry & HFLIP ? TILE - 1 - px : px;
    const y = entry & VFLIP ? TILE - 1 - py : py;
    const c = patternPixel(pattern(entry & TILE_MASK), x, y);
    return c === 0 ? -1 : (((entry >> LINE_SHIFT) & 3) << 4) | c;
}
function mod(a: number, n: number): number {
    return ((a % n) + n) % n;
}
function isFull(p: ScreenPlane): p is ScreenPlaneFull {
    return "hscroll" in p;
}
function planePixel(plane: ScreenPlane, sx: number, sy: number, pattern: PatternLookup): number {
    let wx: number;
    let wy: number;
    if (isFull(plane)) {
        wx = mod(sx - (plane.hscroll[sy] ?? 0), plane.w * TILE);
        wy = mod(sy + plane.vscroll, plane.h * TILE);
    }
    else {
        wx = sx + plane.fx;
        wy = sy + plane.fy;
    }
    const entry = plane.cells[wy >> TILE_SHIFT]?.[wx >> TILE_SHIFT];
    if (entry === undefined)
        return -1;
    const idx = entryPixel(entry, wx & (TILE - 1), wy & (TILE - 1), pattern);
    return idx < 0 ? -1 : (entry & PRIORITY ? 1 << 8 : 0) | idx;
}
function spritePixel(sprites: readonly ScreenSprite[], sx: number, sy: number, pattern: PatternLookup): number {
    for (const s of sprites) {
        const dx = sx - s.x;
        const dy = sy - s.y;
        if (dx < 0 || dy < 0 || dx >= s.w * TILE || dy >= s.h * TILE)
            continue;
        const cx = s.attr & HFLIP ? s.w - 1 - (dx >> TILE_SHIFT) : dx >> TILE_SHIFT;
        const cy = s.attr & VFLIP ? s.h - 1 - (dy >> TILE_SHIFT) : dy >> TILE_SHIFT;
        const entry = (s.attr & ~TILE_MASK) | (((s.attr & TILE_MASK) + cx * s.h + cy) & TILE_MASK);
        const idx = entryPixel(entry, dx & (TILE - 1), dy & (TILE - 1), pattern);
        if (idx >= 0)
            return (s.attr & PRIORITY ? 1 << 8 : 0) | idx;
    }
    return -1;
}
export function renderState(state: ScreenState, pattern: PatternLookup, into?: Frame): Frame {
    const { width, height, backdrop } = state.display;
    const frame: Frame = into && into.width === width && into.height === height ? into : { width, height, data: new Uint8ClampedArray(width * height * 4) };
    const rgb = state.cram.map(colourRgb);
    const back = rgb[backdrop] ?? [0, 0, 0];
    const out = frame.data;
    let o = 0;
    for (let sy = 0; sy < height; sy++) {
        for (let sx = 0; sx < width; sx++, o += 4) {
            let colour = back;
            if (state.display.enabled) {
                const s = spritePixel(state.sprites, sx, sy, pattern);
                const a = planePixel(state.a, sx, sy, pattern);
                const b = planePixel(state.b, sx, sy, pattern);
                let idx = -1;
                if (s >= 0 && s >> 8)
                    idx = s & 0xff;
                else if (a >= 0 && a >> 8)
                    idx = a & 0xff;
                else if (b >= 0 && b >> 8)
                    idx = b & 0xff;
                else if (s >= 0)
                    idx = s & 0xff;
                else if (a >= 0)
                    idx = a & 0xff;
                else if (b >= 0)
                    idx = b & 0xff;
                if (idx >= 0)
                    colour = rgb[idx] ?? back;
            }
            out[o] = colour[0];
            out[o + 1] = colour[1];
            out[o + 2] = colour[2];
            out[o + 3] = 255;
        }
    }
    return frame;
}

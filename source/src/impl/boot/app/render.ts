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
function mod(a: number, n: number): number {
    return ((a % n) + n) % n;
}
function isFull(p: ScreenPlane): p is ScreenPlaneFull {
    return "hscroll" in p;
}
const SLOTS = 1 << 11;
const decoded = new Uint8Array(SLOTS * 64);
const decodedAt = new Int32Array(SLOTS);
let generation = 0;
const LITTLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
function decodeSlot(slot: number, pattern: PatternLookup): number {
    const base = slot << 6;
    if (decodedAt[slot] !== generation) {
        decodedAt[slot] = generation;
        const pat = pattern(slot);
        for (let y = 0; y < TILE; y++) {
            for (let x = 0; x < TILE; x++) {
                const byte = pat[y * (TILE / 2) + (x >> 1)] ?? 0;
                decoded[base + y * TILE + x] = x & 1 ? byte & 15 : byte >> 4;
            }
        }
    }
    return base;
}
function entryPixel(entry: number, px: number, py: number, pattern: PatternLookup): number {
    const x = entry & HFLIP ? TILE - 1 - px : px;
    const y = entry & VFLIP ? TILE - 1 - py : py;
    const c = decoded[decodeSlot(entry & TILE_MASK, pattern) + y * TILE + x]!;
    return c === 0 ? -1 : (((entry >> LINE_SHIFT) & 3) << 4) | c;
}
let rowS = new Int16Array(0);
let rowA = new Int16Array(0);
let rowB = new Int16Array(0);
function fillPlaneRow(plane: ScreenPlane, sy: number, width: number, row: Int16Array, pattern: PatternLookup): void {
    let wx: number;
    let wy: number;
    let planeW = 0;
    if (isFull(plane)) {
        planeW = plane.w * TILE;
        wx = mod(0 - (plane.hscroll[sy] ?? 0), planeW);
        wy = mod(sy + plane.vscroll, plane.h * TILE);
    }
    else {
        wx = plane.fx;
        wy = sy + plane.fy;
    }
    const cellRow = plane.cells[wy >> TILE_SHIFT];
    const py = wy & (TILE - 1);
    let sx = 0;
    while (sx < width) {
        const run = Math.min(TILE - (wx & (TILE - 1)), width - sx);
        const entry = cellRow?.[wx >> TILE_SHIFT];
        if (entry === undefined) {
            for (let i = 0; i < run; i++)
                row[sx + i] = -1;
        }
        else {
            const prio = entry & PRIORITY ? 1 << 8 : 0;
            const x0 = wx & (TILE - 1);
            for (let i = 0; i < run; i++) {
                const idx = entryPixel(entry, x0 + i, py, pattern);
                row[sx + i] = idx < 0 ? -1 : prio | idx;
            }
        }
        sx += run;
        wx += run;
        if (planeW !== 0 && wx >= planeW)
            wx -= planeW;
    }
}
function fillSpriteRow(sprites: readonly ScreenSprite[], sy: number, width: number, row: Int16Array, pattern: PatternLookup): void {
    row.fill(-1, 0, width);
    for (const s of sprites) {
        const dy = sy - s.y;
        if (dy < 0 || dy >= s.h * TILE)
            continue;
        const from = Math.max(0, -s.x);
        const to = Math.min(s.w * TILE, width - s.x);
        const cy = s.attr & VFLIP ? s.h - 1 - (dy >> TILE_SHIFT) : dy >> TILE_SHIFT;
        const prio = s.attr & PRIORITY ? 1 << 8 : 0;
        for (let dx = from; dx < to; dx++) {
            const sx = s.x + dx;
            if (row[sx]! >= 0)
                continue;
            const cx = s.attr & HFLIP ? s.w - 1 - (dx >> TILE_SHIFT) : dx >> TILE_SHIFT;
            const entry = (s.attr & ~TILE_MASK) | (((s.attr & TILE_MASK) + cx * s.h + cy) & TILE_MASK);
            const idx = entryPixel(entry, dx & (TILE - 1), dy & (TILE - 1), pattern);
            if (idx >= 0)
                row[sx] = prio | idx;
        }
    }
}
const PALETTE_SIZE = 64;
const palette = new Uint32Array(PALETTE_SIZE);
export function packRgba(c: readonly [
    number,
    number,
    number
]): number {
    return (LITTLE ? ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) : ((c[0] << 24) | (c[1] << 16) | (c[2] << 8) | 255)) >>> 0;
}
export function renderState(state: ScreenState, pattern: PatternLookup, into?: Frame): Frame {
    const { width, height, backdrop } = state.display;
    const frame: Frame = into && into.width === width && into.height === height ? into : { width, height, data: new Uint8ClampedArray(width * height * 4) };
    const rgb = state.cram.map(colourRgb);
    const back32 = packRgba(rgb[backdrop] ?? [0, 0, 0]);
    palette.fill(back32);
    for (let i = 0; i < PALETTE_SIZE && i < rgb.length; i++)
        palette[i] = packRgba(rgb[i]!);
    const out = new Uint32Array(frame.data.buffer, frame.data.byteOffset, width * height);
    if (!state.display.enabled) {
        out.fill(back32);
        return frame;
    }
    generation++;
    if (rowS.length < width) {
        rowS = new Int16Array(width);
        rowA = new Int16Array(width);
        rowB = new Int16Array(width);
    }
    let o = 0;
    for (let sy = 0; sy < height; sy++) {
        fillSpriteRow(state.sprites, sy, width, rowS, pattern);
        fillPlaneRow(state.a, sy, width, rowA, pattern);
        fillPlaneRow(state.b, sy, width, rowB, pattern);
        for (let sx = 0; sx < width; sx++, o++) {
            const s = rowS[sx]!;
            const a = rowA[sx]!;
            const b = rowB[sx]!;
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
            out[o] = idx >= 0 && idx < PALETTE_SIZE ? palette[idx]! : back32;
        }
    }
    return frame;
}

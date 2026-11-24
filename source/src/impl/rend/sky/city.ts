import { s16, u16 } from "../arith.js";
import type { SkyConstants } from "./constants.js";
const AZ_MASK = 0x3ff;
const X_FINE_MASK = 7;
const WIDTH_SHIFT = 3;
const STRIP_SHIFT = 2;
const STRIP_FULL_CELLS = 4;
const STRIP_REMAINDER_MASK = 3;
const STRIP_X_STEP = 32;
const STRIP_CELLS_HIGH = 2;
const ROW_STEP = 16;
const TILE_NUMBER_MASK = 0x7ff;
export interface CityStrip {
    readonly xWord: number;
    readonly yWord: number;
    readonly wCells: number;
    readonly hCells: number;
    readonly tileWord: number;
}
export interface CityValues {
    readonly d: number;
    readonly Y: number;
}
export function cityValues(angle: number, y: number, floor: number, z: number, C: SkyConstants): CityValues {
    const d = u16(C["CITY.AZ_BASE"] - 2 * angle - (s16(y) >> C["CITY.Y_SHIFT"])) & AZ_MASK;
    const Y = u16(C["CITY.Y_TOP"] - (C["CITY.FLOOR_STEP"] * floor + (s16(z) >> C["CITY.Z_SHIFT"])));
    return { d, Y };
}
export function cityStrips(angle: number, y: number, floor: number, z: number, C: SkyConstants): CityStrip[] {
    const { d, Y: Y0 } = cityValues(angle, y, floor, z, C);
    if (d === 0 || d >= C["CITY.AZ_END"])
        return [];
    let w: number;
    let x0: number;
    if (d < C["CITY.FADE_LEFT"]) {
        w = d >> WIDTH_SHIFT;
        x0 = (d & X_FINE_MASK) + C["CITY.X_LEFT"];
    }
    else if (d > C["CITY.FADE_RIGHT"]) {
        w = (C["CITY.AZ_END"] - d) >> WIDTH_SHIFT;
        x0 = d;
    }
    else {
        w = C["CITY.WIDTH_MAX"];
        x0 = d;
    }
    const widths: number[] = [];
    for (let i = 0; i < w >> STRIP_SHIFT; i++)
        widths.push(STRIP_FULL_CELLS);
    widths.push((w & STRIP_REMAINDER_MASK) + 1);
    let Y = Y0;
    let j = 0;
    while (s16(Y) <= C["CITY.Y_CLIP"]) {
        Y = u16(Y + ROW_STEP);
        j += 1;
    }
    const out: CityStrip[] = [];
    do {
        const B = j < C["CITY.ROW_BLOCKS"].length ? C["CITY.ROW_BLOCKS"][j]! : 0;
        const tileWord = u16(C["CITY.TILE_BASE"] + C["CITY.BLOCK_STEP"] * B);
        for (let i = 0; i < widths.length; i++) {
            out.push({ xWord: u16(x0 + STRIP_X_STEP * i), yWord: Y, wCells: widths[i]!, hCells: STRIP_CELLS_HIGH, tileWord });
        }
        Y = u16(Y + ROW_STEP);
        j += 1;
    } while (s16(Y) < C["CITY.Y_END"]);
    return out;
}
export function cityBankTile(bank: Uint8Array, tileNumber: number, C: SkyConstants): Uint8Array {
    const tileBytes = (C.CELL / 2) * C.CELL;
    const first = C["CITY.TILE_BASE"] & TILE_NUMBER_MASK;
    const i = tileNumber - first;
    if (i < 0 || (i + 1) * tileBytes > bank.length)
        throw new Error(`city strip: tile ${tileNumber} is outside the bank (first tile ${first}, ${bank.length / tileBytes} tiles)`);
    return bank.subarray(i * tileBytes, (i + 1) * tileBytes);
}
const ROW_COPY_BYTES = 4;
const GROUP_FRAME_BYTES = 256;
const SECOND_TILE_FRAME_OFFSET = 32;
const PATTERN_MASK = 63;
export function twinkleCopy(tiles: Uint8Array, tileBase: number, group: number, counter: number, offset: number, phase: number, frames: Uint8Array, pattern: Uint8Array, pairs: readonly (readonly number[])[], C: SkyConstants): void {
    const pair = pairs[group - 1];
    if (!pair)
        throw new Error(`twinkle: group ${group} has no tile pair`);
    const tileBytes = (C.CELL / 2) * C.CELL;
    const r = pattern[(phase + counter) & PATTERN_MASK]!;
    const src = GROUP_FRAME_BYTES * (group - 1) + offset + r;
    const a = (pair[0]! - tileBase) * tileBytes + r;
    const b = (pair[1]! - tileBase) * tileBytes + r;
    if (a < 0 || b < 0 || a + ROW_COPY_BYTES > tiles.length || b + ROW_COPY_BYTES > tiles.length)
        throw new Error(`twinkle: group ${group}'s tiles ${pair[0]} / ${pair[1]} are outside the class (tile base ${tileBase})`);
    if (src + SECOND_TILE_FRAME_OFFSET + ROW_COPY_BYTES > frames.length)
        throw new Error(`twinkle: frame byte ${src + SECOND_TILE_FRAME_OFFSET} is outside the ${frames.length} bytes of frames`);
    for (let k = 0; k < ROW_COPY_BYTES; k++) {
        tiles[a + k] = frames[src + k]!;
        tiles[b + k] = frames[src + SECOND_TILE_FRAME_OFFSET + k]!;
    }
}
const SPRITE_ORIGIN = 128;
const WRAP_HALF = 512;
const WRAP_MASK = 1023;
const TILE_ROW_BYTES = 4;
const PALETTE_LINE_SHIFT = 13;
const PALETTE_LINE_MASK = 3;
const PALETTE_LINE_COLOURS = 16;
const NIBBLE = 4;
const NIBBLE_MASK = 15;
export function cityBuildingLeft(d: number): number {
    return ((d - SPRITE_ORIGIN + WRAP_HALF) & WRAP_MASK) - WRAP_HALF;
}
export function cityBuildingWidth(C: SkyConstants): number {
    return (C["CITY.WIDTH_MAX"] + 1) << WIDTH_SHIFT;
}
export interface CityBuildingLayer {
    readonly cols: number;
    readonly rows: number;
    readonly indices: Uint8Array;
    readonly x0: number;
    readonly y0: number;
    readonly repeatFrom: number;
    readonly period: number;
}
export function cityBuildingLayer(v: CityValues, far: {
    readonly cols: number;
    readonly rows: number;
    readonly indices: Uint8Array;
}, viewX0: number, viewY0: number, tile: (tileNumber: number) => Uint8Array | undefined, C: SkyConstants): CityBuildingLayer {
    const cell = C.CELL;
    const width = cityBuildingWidth(C);
    const bx = cityBuildingLeft(v.d) - viewX0;
    const top0 = s16(v.Y) - SPRITE_ORIGIN - viewY0;
    const blocks = C["CITY.ROW_BLOCKS"];
    let jRep = blocks.length;
    while (top0 + ROW_STEP * jRep < far.rows)
        jRep += 1;
    const x0 = Math.min(0, bx);
    const y0 = Math.min(0, top0);
    const cols = Math.max(far.cols, bx + width) - x0;
    const rows = top0 + ROW_STEP * (jRep + 1) - y0;
    const out = new Uint8Array(cols * rows);
    for (let j = 0; j <= jRep; j++) {
        const B = j < blocks.length ? blocks[j]! : 0;
        const tw = u16(C["CITY.TILE_BASE"] + C["CITY.BLOCK_STEP"] * B);
        const line = ((tw >> PALETTE_LINE_SHIFT) & PALETTE_LINE_MASK) * PALETTE_LINE_COLOURS;
        const base = tw & TILE_NUMBER_MASK;
        for (let py = 0; py < ROW_STEP; py++) {
            const ly = top0 + ROW_STEP * j + py - y0;
            const r = Math.floor(py / cell);
            for (let px = 0; px < width; px++) {
                const c = Math.floor(px / cell) & STRIP_REMAINDER_MASK;
                const t = tile(base + c * STRIP_CELLS_HIGH + r);
                if (t === undefined)
                    continue;
                const fx = px % cell;
                const byte = t[(py % cell) * TILE_ROW_BYTES + (fx >> 1)]!;
                const nib = (fx & 1) !== 0 ? byte & NIBBLE_MASK : (byte >> NIBBLE) & NIBBLE_MASK;
                if (nib !== 0)
                    out[ly * cols + bx + px - x0] = line + nib;
            }
        }
    }
    for (let y = 0; y < far.rows; y++)
        for (let x = 0; x < far.cols; x++) {
            const i = far.indices[y * far.cols + x]!;
            if (i !== 0)
                out[(y - y0) * cols + x - x0] = i;
        }
    return { cols, rows, indices: out, x0, y0, repeatFrom: top0 + ROW_STEP * jRep - y0, period: ROW_STEP };
}

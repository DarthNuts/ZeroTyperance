import { mod, s16, u16 } from "../arith.js";
import type { SkyConstants } from "./constants.js";
export interface SkyAssets {
    readonly class: string;
    readonly map: Uint16Array;
    readonly tiles: Uint8Array;
    readonly tileBase: number;
    readonly tileCount: number;
    readonly paletteLine: readonly number[];
    readonly cityBankTiles?: Uint8Array;
    readonly twinkleFrames?: Uint8Array;
    readonly twinklePattern?: Uint8Array;
}
const TILE_MASK = 0x7ff;
const FLIP_H_BIT = 1 << 11;
const FLIP_V_BIT = 1 << 12;
const PALETTE_SHIFT = 13;
const PALETTE_MASK = 3;
const COLOURS_PER_LINE = 16;
const NIBBLE_BITS = 4;
const NIBBLE_MASK = 0xf;
const PIXELS_PER_BYTE = 2;
const BYTE_BITS = 8;
const BYTE_MASK = 0xff;
export interface StreamedColumn {
    readonly planeColumn: number;
    readonly words: Uint16Array;
}
export interface PendingWrites {
    readonly hscroll: number | null;
    readonly columns: readonly StreamedColumn[];
}
export interface SkyState {
    prevScroll: number;
    accumulator: number;
    columnOffset: number;
    readonly tiles: Uint8Array;
    readonly plane: Uint16Array;
    hscroll: number;
    pending: PendingWrites;
}
export interface SkyRecord {
    readonly hscroll: number;
    readonly vscroll: number;
    readonly accumulator: number;
    readonly column_offset: number;
    readonly resident: Uint8Array;
    readonly cells: Uint8Array;
}
const noWrites = (): PendingWrites => ({ hscroll: null, columns: [] });
export function skyClassOfEpisode(episode: number, C: SkyConstants): string | null {
    return C.CLASS_BY_EPISODE[String(episode)] ?? null;
}
export function scrollOfAngle(angle: number, C: SkyConstants): number {
    return u16(-C.SCROLL_FACTOR * u16(angle)) & C.SCROLL_MASK;
}
export function vscrollOfFloor(floor: number, C: SkyConstants): number {
    return C.VSCROLL_PER_FLOOR * floor + C.VSCROLL_BASE;
}
function wrappedStep(prevScroll: number, s: number, C: SkyConstants): number {
    const range = 2 ** C.DELTA_BITS;
    const d = mod(prevScroll - s, range);
    return d >= range / 2 ? d - range : d;
}
function panoramaColumn(q: number, assets: SkyAssets, C: SkyConstants): Uint16Array {
    const words = new Uint16Array(C.PANORAMA_ROWS);
    for (let r = 0; r < C.PANORAMA_ROWS; r++)
        words[r] = assets.map[r * C.PANORAMA_COLUMNS + q]!;
    return words;
}
function writeColumn(plane: Uint16Array, col: StreamedColumn, C: SkyConstants): void {
    for (let r = 0; r < C.PANORAMA_ROWS; r++)
        plane[r * C.PLANE_COLUMNS + col.planeColumn] = col.words[r]!;
}
export function skyStart(assets: SkyAssets, C: SkyConstants): SkyState {
    const plane = new Uint16Array(C.PANORAMA_ROWS * C.PLANE_COLUMNS).fill(C.BLANK_WORD);
    for (let q = 0; q < C.INITIAL_COLUMNS; q++) {
        writeColumn(plane, { planeColumn: mod(q, C.PLANE_COLUMNS), words: panoramaColumn(q, assets, C) }, C);
    }
    return { tiles: new Uint8Array(assets.tiles), prevScroll: 0, accumulator: 0, columnOffset: 0, plane, hscroll: C.SCROLL_BIAS, pending: noWrites() };
}
function streamColumns(state: SkyState, edgeBytes: number, assets: SkyAssets, C: SkyConstants): StreamedColumn[] {
    const out: StreamedColumn[] = [];
    for (let i = 0; i < C.STEP_COLUMNS; i++) {
        const b = mod(edgeBytes + state.columnOffset + C.WORD_BYTES * i, C.ROW_BYTES);
        const q = Math.floor(b / C.WORD_BYTES);
        out.push({ planeColumn: mod(q, C.PLANE_COLUMNS), words: panoramaColumn(q, assets, C) });
    }
    return out;
}
export function skyTick(state: SkyState, angle: number, assets: SkyAssets, C: SkyConstants): void {
    if (state.pending.hscroll !== null)
        state.hscroll = state.pending.hscroll;
    for (const col of state.pending.columns)
        writeColumn(state.plane, col, C);
    state.pending = noWrites();
    const s = scrollOfAngle(angle, C);
    if (s === state.prevScroll)
        return;
    const d = wrappedStep(state.prevScroll, s, C);
    state.prevScroll = s;
    state.accumulator = u16(state.accumulator + d);
    let columns: StreamedColumn[] = [];
    if (d < 0) {
        if (s16(state.accumulator) < 0) {
            state.accumulator = u16(state.accumulator + C.STEP_PX);
            state.columnOffset = u16(state.columnOffset - C.STEP_BYTES);
            columns = streamColumns(state, C.LEFT_EDGE_BYTES, assets, C);
        }
    }
    else {
        if (s16(state.accumulator) >= C.STEP_PX) {
            state.accumulator = u16(state.accumulator - C.STEP_PX);
            state.columnOffset = u16(state.columnOffset + C.STEP_BYTES);
            columns = streamColumns(state, C.RIGHT_EDGE_BYTES, assets, C);
        }
    }
    state.pending = { hscroll: s + C.SCROLL_BIAS, columns };
}
export function skyRedrawWhole(state: SkyState, angle: number, assets: SkyAssets, C: SkyConstants): void {
    const s = scrollOfAngle(angle, C);
    const travelled = mod(-s, C.SCROLL_MASK + 1);
    state.prevScroll = s;
    state.accumulator = travelled % C.STEP_PX;
    state.columnOffset = u16(C.STEP_BYTES * Math.floor(travelled / C.STEP_PX));
    state.plane.fill(C.BLANK_WORD);
    const first = Math.floor(mod(state.columnOffset, C.ROW_BYTES) / C.WORD_BYTES);
    for (let j = 0; j < C.INITIAL_COLUMNS; j++) {
        const q = mod(first + j, C.PANORAMA_COLUMNS);
        writeColumn(state.plane, { planeColumn: mod(q, C.PLANE_COLUMNS), words: panoramaColumn(q, assets, C) }, C);
    }
    state.hscroll = s + C.SCROLL_BIAS;
    state.pending = noWrites();
}
export function skyLayer(state: SkyState, floor: number, assets: SkyAssets, C: SkyConstants): Uint8Array {
    const out = new Uint8Array(C.VIEW_W * C.VIEW_H);
    const vs = vscrollOfFloor(floor, C);
    const planeW = C.PLANE_COLUMNS * C.CELL;
    const planeH = C.PLANE_ROWS * C.CELL;
    const tileRowBytes = C.CELL / PIXELS_PER_BYTE;
    const tileBytes = tileRowBytes * C.CELL;
    for (let y = 0; y < C.VIEW_H; y++) {
        const py = mod(C.VIEW_Y + y + vs, planeH);
        const row = Math.floor(py / C.CELL);
        if (row >= C.PANORAMA_ROWS)
            continue;
        for (let x = 0; x < C.VIEW_W; x++) {
            const px = mod(C.VIEW_X + x - state.hscroll, planeW);
            const w = state.plane[row * C.PLANE_COLUMNS + Math.floor(px / C.CELL)]!;
            if (w === C.BLANK_WORD)
                continue;
            const tile = (w & TILE_MASK) - assets.tileBase;
            if (tile < 0 || tile >= assets.tileCount)
                throw new Error(`sky: resident word 0x${w.toString(16)} names tile ${tile + assets.tileBase}, outside the class's ${assets.tileCount} tiles from ${assets.tileBase}`);
            let tx = px % C.CELL;
            let ty = py % C.CELL;
            if (w & FLIP_H_BIT)
                tx = C.CELL - 1 - tx;
            if (w & FLIP_V_BIT)
                ty = C.CELL - 1 - ty;
            const byte = state.tiles[tile * tileBytes + ty * tileRowBytes + Math.floor(tx / PIXELS_PER_BYTE)]!;
            const c = tx % PIXELS_PER_BYTE === 0 ? (byte >> NIBBLE_BITS) & NIBBLE_MASK : byte & NIBBLE_MASK;
            if (c === 0)
                continue;
            out[y * C.VIEW_W + x] = ((w >> PALETTE_SHIFT) & PALETTE_MASK) * COLOURS_PER_LINE + c;
        }
    }
    return out;
}
export function residentBytes(state: SkyState, C: SkyConstants): Uint8Array {
    const out = new Uint8Array(state.plane.length * 2);
    for (let i = 0; i < state.plane.length; i++) {
        out[2 * i] = (state.plane[i]! >> BYTE_BITS) & BYTE_MASK;
        out[2 * i + 1] = state.plane[i]! & BYTE_MASK;
    }
    return out;
}
export function skyRecord(state: SkyState, floor: number, assets: SkyAssets, C: SkyConstants): SkyRecord {
    return {
        hscroll: state.hscroll,
        vscroll: vscrollOfFloor(floor, C),
        accumulator: state.accumulator,
        column_offset: state.columnOffset,
        resident: residentBytes(state, C),
        cells: skyLayer(state, floor, assets, C),
    };
}
export function runSky(angles: readonly number[], floor: number, assets: SkyAssets, C: SkyConstants): SkyRecord {
    const state = skyStart(assets, C);
    for (let k = 1; k < angles.length; k++)
        skyTick(state, angles[k]!, assets, C);
    return skyRecord(state, floor, assets, C);
}

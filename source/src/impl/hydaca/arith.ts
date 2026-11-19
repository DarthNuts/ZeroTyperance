import type { Cell, MapView, Rng } from "../../domain.js";
export function u16(v: number): number {
    return v & 0xffff;
}
export function s16(v: number): number {
    return ((v & 0xffff) ^ 0x8000) - 0x8000;
}
export function u8(v: number): number {
    return v & 0xff;
}
export function s32(v: number): number {
    return v | 0;
}
export function abs16(v: number): number {
    const s = s16(v);
    return s < 0 ? -s : s;
}
export function sar(v: number, n: number): number {
    return v >> n;
}
export function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}
export function octDist(dx: number, dy: number): number {
    const ax = abs16(dx);
    const ay = abs16(dy);
    const m = ax > ay ? ax : ay;
    const s = u16(ax + ay + m);
    return u16(sar(s16(s), 1));
}
export function octDistBetween(ax: number, ay: number, bx: number, by: number): number {
    return octDist(s16(ax - bx), s16(ay - by));
}
export function divTrunc(a: number, b: number): number {
    if (b === 0)
        throw new RangeError("divTrunc: division by zero (the caller skips the division when the divisor is 0)");
    return Math.trunc(a / b);
}
export function mul16(a: number, b: number): number {
    return Math.imul(s16(a), s16(b));
}
export function cellIndex(x: number, y: number, stride: number): number {
    return sar(s16(x), 8) + stride * sar(s16(y), 8);
}
export function cellAtIndex(map: MapView, index: number, stride: number): Cell {
    const { col, row } = colRowOfIndex(index, stride);
    return map.cellAt(col, row);
}
export function classAtPos(map: MapView, x: number, y: number, stride: number): number {
    return cellAtIndex(map, cellIndex(x, y, stride), stride).cls;
}
export function cellAtPos(map: MapView, x: number, y: number, stride: number): Cell {
    return cellAtIndex(map, cellIndex(x, y, stride), stride);
}
export interface CellWindow {
    readonly side: number;
    readonly radius: number;
    readonly cells: readonly (number | null)[];
}
export function cellWindow(cells: readonly (number | null)[]): CellWindow {
    const side = Math.round(Math.sqrt(cells.length));
    if (side * side !== cells.length || side % 2 === 0) {
        throw new RangeError(`cells_around has ${cells.length} entries, not an odd square`);
    }
    return { side, radius: (side - 1) / 2, cells };
}
export function windowCell(w: CellWindow, dx: number, dy: number): number | null {
    if (dx < -w.radius || dx > w.radius || dy < -w.radius || dy > w.radius) {
        throw new RangeError(`cell (${dx}, ${dy}) is outside the ${w.side}x${w.side} window of the record`);
    }
    return w.cells[(dy + w.radius) * w.side + (dx + w.radius)]!;
}
export function colRowOfIndex(index: number, stride: number): {
    col: number;
    row: number;
} {
    const row = Math.floor(index / stride);
    return { col: index - row * stride, row };
}
export function draw(rng: Rng): number {
    return rng.next() >>> 0;
}
export function bits(R: number, shift: number, mask: number): number {
    return (R >>> shift) & mask;
}
export function signedShift(R: number, shift: number): number {
    return sar(s32(R), shift);
}

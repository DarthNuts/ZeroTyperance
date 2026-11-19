export const WORD_MASK = 0xffff;
export const TILE_MASK = 0x7ff;
export const SPRITE_X_MASK = 0x1ff;
export const SPRITE_Y_MASK = 0x3ff;
export const CELL_CORNER_MASK = 0xff00;
export const LOW_BYTE_MASK = 0xff;
export const CELL_SHIFT = 8;
export const TILE_BYTES = 32;
export const TILE_ROW_BYTES = 4;
export const TILE_SIZE = 8;
export const NIBBLE_BITS = 4;
export const NIBBLE_MASK = 0xf;
export const LONG_BITS = 32;
export function s16(v: number): number {
    const w = v & WORD_MASK;
    return w >= 0x8000 ? w - 0x10000 : w;
}
export function u16(v: number): number {
    return v & WORD_MASK;
}
export function asr(v: number, bits: number): number {
    return v >> bits;
}
export function cellOf(v: number): number {
    return v >> CELL_SHIFT;
}
export function splitDigits(n: number, radix: number): {
    tens: number;
    ones: number;
} {
    let tens = 0;
    let rest = n;
    while (rest >= radix) {
        rest -= radix;
        tens++;
    }
    return { tens, ones: rest };
}
export function rotr32(v: number, bits: number): number {
    const b = bits % LONG_BITS;
    if (b === 0)
        return v >>> 0;
    return ((v >>> b) | (v << (LONG_BITS - b))) >>> 0;
}
export function readLong(bytes: Uint8Array, o: number): number {
    return ((bytes[o]! << 24) | (bytes[o + 1]! << 16) | (bytes[o + 2]! << 8) | bytes[o + 3]!) >>> 0;
}
export function writeLong(bytes: Uint8Array, o: number, v: number): void {
    bytes[o] = (v >>> 24) & 0xff;
    bytes[o + 1] = (v >>> 16) & 0xff;
    bytes[o + 2] = (v >>> 8) & 0xff;
    bytes[o + 3] = v & 0xff;
}
export function writeWord(bytes: Uint8Array, o: number, v: number): void {
    bytes[o] = (v >>> 8) & 0xff;
    bytes[o + 1] = v & 0xff;
}
export function tilePixel(tile: Uint8Array, x: number, y: number): number {
    const b = tile[y * TILE_ROW_BYTES + (x >> 1)]!;
    return x & 1 ? b & NIBBLE_MASK : b >> NIBBLE_BITS;
}
export function tileFromImage(pixels: Uint8Array, width: number, x0: number, y0: number): Uint8Array {
    const out = new Uint8Array(TILE_BYTES);
    for (let y = 0; y < TILE_SIZE; y++) {
        for (let x = 0; x < TILE_SIZE; x += 2) {
            const i = (y0 + y) * width + x0 + x;
            out[y * TILE_ROW_BYTES + (x >> 1)] = ((pixels[i]! & NIBBLE_MASK) << NIBBLE_BITS) | (pixels[i + 1]! & NIBBLE_MASK);
        }
    }
    return out;
}

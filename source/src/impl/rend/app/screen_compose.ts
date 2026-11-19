import { colourRgb } from "../../boot/app/render.js";
export const SCREEN_NO_PIXEL = 255;
export const CRAM_ENTRIES = 64;
export const COLOURS_PER_LINE = 16;
const TILE_PX = 8;
const TILE_ROW_BYTES = 4;
const TILE_BITS_MASK = 0x7ff;
const HFLIP_BIT = 1 << 11;
const VFLIP_BIT = 1 << 12;
const LINE_SHIFT = 13;
const LINE_MASK = 3;
const NIBBLE_SHIFT = 4;
const NIBBLE_MASK = 15;
export type TileSource = (index: number) => Uint8Array | undefined;
export interface ComposeSprite {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly attr: number;
    readonly xWord: number;
    readonly tile: TileSource;
}
export interface ComposePlane {
    readonly cells: ReadonlyArray<readonly number[]>;
    readonly tile: TileSource;
}
export interface ComposeView {
    readonly x0: number;
    readonly y0: number;
    readonly columns: number;
    readonly rows: number;
    readonly bytes: Uint8Array;
    readonly columnGroup: number;
    readonly tileColumnBytes: number;
    readonly rowStride: number;
    readonly viewLine: number;
    readonly sky: Uint8Array | null;
}
export interface ComposeInput {
    readonly width: number;
    readonly height: number;
    readonly cram: readonly number[];
    readonly planeB: ComposePlane | null;
    readonly view: ComposeView | null;
    readonly sprites: readonly ComposeSprite[];
}
export interface ComposedScreen {
    readonly width: number;
    readonly height: number;
    readonly indices: Uint8Array;
    readonly cram: number[];
}
function tilePx(tile: Uint8Array, px: number, py: number): number {
    const byte = tile[py * TILE_ROW_BYTES + (px >> 1)] ?? 0;
    return (px & 1) !== 0 ? byte & NIBBLE_MASK : (byte >> NIBBLE_SHIFT) & NIBBLE_MASK;
}
export function maskedFrom(sprites: readonly ComposeSprite[], y: number): number {
    let seenVisible = false;
    for (let k = 0; k < sprites.length; k++) {
        const s = sprites[k]!;
        if (y < s.y || y >= s.y + s.h * TILE_PX)
            continue;
        if (s.xWord !== 0)
            seenVisible = true;
        else if (seenVisible)
            return k;
    }
    return sprites.length;
}
function drawPlane(out: Uint8Array, width: number, height: number, plane: ComposePlane): void {
    for (let r = 0; r < plane.cells.length; r++) {
        const row = plane.cells[r]!;
        for (let c = 0; c < row.length; c++) {
            const word = row[c] ?? 0;
            if (word === 0)
                continue;
            const tile = plane.tile(word & TILE_BITS_MASK);
            if (tile === undefined)
                continue;
            const hf = (word & HFLIP_BIT) !== 0;
            const vf = (word & VFLIP_BIT) !== 0;
            const line = ((word >> LINE_SHIFT) & LINE_MASK) * COLOURS_PER_LINE;
            for (let ty = 0; ty < TILE_PX; ty++) {
                const sy = r * TILE_PX + ty;
                if (sy < 0 || sy >= height)
                    continue;
                for (let tx = 0; tx < TILE_PX; tx++) {
                    const sx = c * TILE_PX + tx;
                    if (sx < 0 || sx >= width)
                        continue;
                    const col = tilePx(tile, hf ? TILE_PX - 1 - tx : tx, vf ? TILE_PX - 1 - ty : ty);
                    if (col !== 0)
                        out[sy * width + sx] = line + col;
                }
            }
        }
    }
}
function drawView(out: Uint8Array, width: number, height: number, v: ComposeView): void {
    const base = v.viewLine * COLOURS_PER_LINE;
    const sky = v.sky;
    const skyW = v.columns * 2;
    for (let c = 0; c < v.columns; c++) {
        const vbase = Math.floor(c / v.columnGroup) * v.tileColumnBytes + (c % v.columnGroup);
        for (let r = 0; r < v.rows; r++) {
            const b = v.bytes[vbase + r * v.rowStride] ?? 0;
            const sy = v.y0 + r;
            if (sy < 0 || sy >= height)
                continue;
            for (let k = 0; k < 2; k++) {
                const sx = v.x0 + c * 2 + k;
                if (sx < 0 || sx >= width)
                    continue;
                const nib = k === 0 ? (b >> NIBBLE_SHIFT) & NIBBLE_MASK : b & NIBBLE_MASK;
                if (nib !== 0)
                    out[sy * width + sx] = base + nib;
                else {
                    const s = sky === null ? 0 : (sky[r * skyW + c * 2 + k] ?? 0);
                    if (s !== 0)
                        out[sy * width + sx] = s;
                }
            }
        }
    }
}
export function composeScreen(input: ComposeInput, into?: ComposedScreen): ComposedScreen {
    const { width, height } = input;
    const screen: ComposedScreen = into !== undefined && into.width === width && into.height === height
        ? into
        : { width, height, indices: new Uint8Array(width * height), cram: [] };
    const out = screen.indices;
    out.fill(SCREEN_NO_PIXEL);
    screen.cram.length = 0;
    for (let i = 0; i < CRAM_ENTRIES; i++)
        screen.cram.push(input.cram[i] ?? 0);
    if (input.planeB !== null)
        drawPlane(out, width, height, input.planeB);
    if (input.view !== null)
        drawView(out, width, height, input.view);
    const sprites = input.sprites;
    const cut = new Array<number>(height);
    for (let y = 0; y < height; y++)
        cut[y] = maskedFrom(sprites, y);
    for (let k = sprites.length - 1; k >= 0; k--) {
        const s = sprites[k]!;
        if (s.xWord === 0)
            continue;
        const hf = (s.attr & HFLIP_BIT) !== 0;
        const vf = (s.attr & VFLIP_BIT) !== 0;
        const first = s.attr & TILE_BITS_MASK;
        const line = ((s.attr >> LINE_SHIFT) & LINE_MASK) * COLOURS_PER_LINE;
        const wpx = s.w * TILE_PX;
        const hpx = s.h * TILE_PX;
        for (let dy = 0; dy < hpx; dy++) {
            const sy = s.y + dy;
            if (sy < 0 || sy >= height || k >= (cut[sy] ?? sprites.length))
                continue;
            const cy = vf ? s.h - 1 - (dy >> 3) : dy >> 3;
            for (let dx = 0; dx < wpx; dx++) {
                const sx = s.x + dx;
                if (sx < 0 || sx >= width)
                    continue;
                const cx = hf ? s.w - 1 - (dx >> 3) : dx >> 3;
                const tile = s.tile((first + cx * s.h + cy) & TILE_BITS_MASK);
                if (tile === undefined)
                    continue;
                const col = tilePx(tile, hf ? TILE_PX - 1 - (dx & 7) : dx & 7, vf ? TILE_PX - 1 - (dy & 7) : dy & 7);
                if (col !== 0)
                    out[sy * width + sx] = line + col;
            }
        }
    }
    return screen;
}
export function composedToRgba(screen: ComposedScreen, into?: Uint8ClampedArray, background: readonly [
    number,
    number,
    number
] = [0, 0, 0]): Uint8ClampedArray {
    const n = screen.width * screen.height;
    const out = into !== undefined && into.length === n * 4 ? into : new Uint8ClampedArray(n * 4);
    const rgb = screen.cram.map(colourRgb);
    for (let i = 0; i < n; i++) {
        const idx = screen.indices[i]!;
        const c = idx === SCREEN_NO_PIXEL ? background : (rgb[idx] ?? background);
        out[i * 4] = c[0];
        out[i * 4 + 1] = c[1];
        out[i * 4 + 2] = c[2];
        out[i * 4 + 3] = 255;
    }
    return out;
}

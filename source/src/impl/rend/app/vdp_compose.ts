export type TileSource = (tileIndex: number) => Uint8Array | undefined;
export interface VdpPlane {
    readonly cols: number;
    readonly rows: number;
    readonly words: ArrayLike<number>;
    readonly hscroll: number;
    readonly vscroll: number;
    readonly tile: TileSource;
}
export interface VdpSprite {
    readonly xWord: number;
    readonly yWord: number;
    readonly wCells: number;
    readonly hCells: number;
    readonly attr: number;
    readonly tile: TileSource;
}
export interface VdpOverlay {
    readonly x0: number;
    readonly y0: number;
    readonly width: number;
    readonly height: number;
    readonly indices: Uint8Array;
}
export interface VdpInput {
    readonly width: number;
    readonly height: number;
    readonly planeA: VdpPlane | null;
    readonly planeB: VdpPlane | null;
    readonly overlayB: VdpOverlay | null;
    readonly sprites: readonly VdpSprite[];
    readonly maxSpritesPerLine: number;
    readonly maxSpritePixelsPerLine: number;
}
const TILE_PX = 8;
const TILE_ROW_BYTES = 4;
const TILE_MASK = 0x7ff;
const HFLIP = 1 << 11;
const VFLIP = 1 << 12;
const PRIO = 1 << 15;
const SPRITE_ORIGIN = 128;
const X_WORD_MASK = 0x1ff;
const Y_WORD_MASK = 0x3ff;
function tilePx(tile: Uint8Array, px: number, py: number): number {
    const byte = tile[py * TILE_ROW_BYTES + (px >> 1)] ?? 0;
    return (px & 1) !== 0 ? byte & 15 : (byte >> 4) & 15;
}
function mod(a: number, n: number): number {
    return ((a % n) + n) % n;
}
function planePixel(p: VdpPlane, x: number, y: number, prioOut: Uint8Array): number {
    const px = mod(x - p.hscroll, p.cols * TILE_PX);
    const py = mod(y + p.vscroll, p.rows * TILE_PX);
    const word = p.words[(py >> 3) * p.cols + (px >> 3)] ?? 0;
    const tile = p.tile(word & TILE_MASK);
    if (tile === undefined)
        return 0;
    let tx = px & 7;
    let ty = py & 7;
    if ((word & HFLIP) !== 0)
        tx = 7 - tx;
    if ((word & VFLIP) !== 0)
        ty = 7 - ty;
    const c = tilePx(tile, tx, ty);
    if (c === 0)
        return 0;
    prioOut[0] = (word & PRIO) !== 0 ? 1 : 0;
    return ((word >> 13) & 3) * 16 + c;
}
export function composeVdp(input: VdpInput, into?: Uint8Array): Uint8Array {
    const { width, height } = input;
    const out = into !== undefined && into.length === width * height ? into : new Uint8Array(width * height);
    out.fill(0);
    const spPix = new Uint8Array(width);
    const spPrio = new Uint8Array(width);
    const pr = new Uint8Array(1);
    const sprites = input.sprites;
    const n = sprites.length;
    const sx = new Array<number>(n);
    const sy = new Array<number>(n);
    for (let k = 0; k < n; k++) {
        const s = sprites[k]!;
        sx[k] = (s.xWord & X_WORD_MASK) - SPRITE_ORIGIN;
        sy[k] = (s.yWord & Y_WORD_MASK) - SPRITE_ORIGIN;
    }
    const ov = input.overlayB;
    for (let y = 0; y < height; y++) {
        spPix.fill(0);
        let any = false;
        let entries = 0;
        let pixelsUsed = 0;
        let seenVisible = false;
        for (let k = 0; k < n; k++) {
            const s = sprites[k]!;
            if (y < sy[k]! || y >= sy[k]! + s.hCells * TILE_PX)
                continue;
            const mask = (s.xWord & X_WORD_MASK) === 0;
            if (mask && seenVisible)
                break;
            if (entries >= input.maxSpritesPerLine)
                break;
            entries++;
            if (mask)
                continue;
            seenVisible = true;
            const wpx = s.wCells * TILE_PX;
            const room = input.maxSpritePixelsPerLine - pixelsUsed;
            if (room <= 0)
                break;
            const drawn = Math.min(wpx, room);
            pixelsUsed += wpx;
            const hf = (s.attr & HFLIP) !== 0;
            const vf = (s.attr & VFLIP) !== 0;
            const first = s.attr & TILE_MASK;
            const line = ((s.attr >> 13) & 3) * 16;
            const prio = (s.attr & PRIO) !== 0 ? 1 : 0;
            const dy = y - sy[k]!;
            const cy = vf ? s.hCells - 1 - (dy >> 3) : dy >> 3;
            const ty = vf ? 7 - (dy & 7) : dy & 7;
            for (let dx = 0; dx < drawn; dx++) {
                const x = sx[k]! + dx;
                if (x < 0 || x >= width || spPix[x] !== 0)
                    continue;
                const cx = hf ? s.wCells - 1 - (dx >> 3) : dx >> 3;
                const tile = s.tile((first + cx * s.hCells + cy) & TILE_MASK);
                if (tile === undefined)
                    continue;
                const c = tilePx(tile, hf ? 7 - (dx & 7) : dx & 7, ty);
                if (c === 0)
                    continue;
                spPix[x] = line + c;
                spPrio[x] = prio;
                any = true;
            }
        }
        for (let x = 0; x < width; x++) {
            const sp = any ? spPix[x]! : 0;
            if (sp !== 0 && spPrio[x] === 1) {
                out[y * width + x] = sp;
                continue;
            }
            pr[0] = 0;
            const a = input.planeA !== null ? planePixel(input.planeA, x, y, pr) : 0;
            const aPrio = pr[0] === 1;
            pr[0] = 0;
            let b = 0;
            let bPrio = false;
            if (ov !== null && x >= ov.x0 && x < ov.x0 + ov.width && y >= ov.y0 && y < ov.y0 + ov.height) {
                const v = ov.indices[(y - ov.y0) * ov.width + (x - ov.x0)] ?? 0;
                if (v !== 0) {
                    b = v;
                    bPrio = true;
                }
            }
            if (b === 0 && input.planeB !== null) {
                b = planePixel(input.planeB, x, y, pr);
                bPrio = pr[0] === 1;
            }
            let v = 0;
            if (a !== 0 && aPrio)
                v = a;
            else if (b !== 0 && bPrio)
                v = b;
            else if (sp !== 0)
                v = sp;
            else if (a !== 0)
                v = a;
            else if (b !== 0)
                v = b;
            out[y * width + x] = v;
        }
    }
    return out;
}

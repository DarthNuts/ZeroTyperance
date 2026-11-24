import type { SkyConstants } from "../sky/constants.js";
import type { HdConstants } from "./constants.js";
import type { SkyPlane } from "./column.js";
const COLOURS_PER_LINE = 16;
export interface SkyExtension {
    readonly width: number;
    readonly rows: number;
    readonly data: Uint8Array;
    readonly bodyPixels: number;
    readonly capRows: number;
    readonly bandOpaque: number;
}
export interface SkyGenVariant {
    readonly noDisc?: boolean;
    readonly aboutCentre?: boolean;
    readonly bandReflected?: boolean;
    readonly shiftZero?: boolean;
}
export function panoramaValues(plane: SkyPlane, SC: SkyConstants): {
    width: number;
    height: number;
    data: Uint8Array;
} {
    const width = SC.PANORAMA_COLUMNS * SC.CELL;
    const height = SC.PANORAMA_ROWS * SC.CELL;
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
            data[y * width + x] = plane(x, y);
    return { width, height, data };
}
export function skyBody(pan: {
    width: number;
    height: number;
    data: Uint8Array;
}, minRun: number): Uint8Array {
    const { width: W, height: H, data } = pan;
    const body = new Uint8Array(W * H);
    let open = false;
    for (let x = 0; x < W; x++)
        if (data[x] === 0) {
            open = true;
            break;
        }
    if (!open)
        return body;
    let start = 0;
    while (data[start] !== 0)
        start++;
    const queue: number[] = [];
    let run: number[] = [];
    const flush = (): void => {
        if (run.length >= minRun)
            for (const x of run)
                if (!body[x]) {
                    body[x] = 1;
                    queue.push(x);
                }
        run = [];
    };
    for (let i = 1; i <= W; i++) {
        const x = (start + i) % W;
        if (data[x] !== 0)
            run.push(x);
        else
            flush();
    }
    flush();
    while (queue.length > 0) {
        const at = queue.pop()!;
        const y = Math.floor(at / W);
        const x = at % W;
        for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= H)
                continue;
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0)
                    continue;
                const n = ny * W + (((x + dx) % W) + W) % W;
                if (!body[n] && data[n] !== 0) {
                    body[n] = 1;
                    queue.push(n);
                }
            }
        }
    }
    return body;
}
export function skyExtensionFrom(plane: SkyPlane, SC: SkyConstants, cls: string, C: HdConstants, variant: SkyGenVariant = {}): SkyExtension | null {
    const G = C.SKYGEN;
    const B = G.BAND[cls];
    const g = G.BG[cls];
    if (B === undefined || g === undefined)
        return null;
    const pan = panoramaValues(plane, SC);
    const { width: W, height: H, data } = pan;
    const rows = H;
    const body = skyBody(pan, G.BODY_MIN_RUN);
    let bodyPixels = 0;
    for (let i = 0; i < body.length; i++)
        bodyPixels += body[i]!;
    const P = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
        const v = data[i]!;
        const asG = body[i] === 1 || (v !== 0 && v % COLOURS_PER_LINE === g);
        P[i] = asG ? (g === 0 || v === 0 ? 0 : v - (v % COLOURS_PER_LINE) + g) : v;
    }
    let bandOpaque = 0;
    for (let i = 0; i < W * B; i++)
        if (P[i] !== 0 && P[i]! % COLOURS_PER_LINE !== g)
            bandOpaque++;
    const shift = variant.shiftZero === true ? 0 : G.SHIFT;
    const out = new Uint8Array(W * rows);
    for (let k = 1; k <= rows; k++) {
        const n = Math.floor((k - 1) / B);
        const m = (k - 1) % B;
        const by = variant.bandReflected === true ? m : B - 1 - m;
        const sx = ((n + 1) * shift) % W;
        for (let px = 0; px < W; px++)
            out[(k - 1) * W + px] = P[by * W + ((px + sx) % W)]!;
    }
    const disc = G.BODY[cls];
    let capRows = 0;
    if (disc !== undefined && bodyPixels > 0) {
        const r2 = disc.r * disc.r;
        for (let k = 1; k <= rows; k++) {
            let any = false;
            for (let px = 0; px < W; px++) {
                const ddx = px + 0.5 - disc.cx;
                const ddy = 0.5 - k - disc.cy;
                const inside = variant.noDisc === true || ddx * ddx + ddy * ddy <= r2;
                if (!inside)
                    continue;
                let sx = px;
                let sy = k - 1;
                if (variant.aboutCentre === true) {
                    sy = Math.floor(2 * disc.cy - (0.5 - k));
                    if (sy < 0 || sy >= H)
                        continue;
                }
                if (sy >= H)
                    continue;
                const at = sy * W + sx;
                if (body[at] === 1) {
                    out[(k - 1) * W + px] = data[at]!;
                    any = true;
                }
            }
            if (any)
                capRows = k;
        }
    }
    return { width: W, rows, data: out, bodyPixels, capRows, bandOpaque };
}
export function skyExtAt(ext: SkyExtension | null | undefined, px: number, raw: number): number {
    if (!ext)
        return -1;
    const row = Math.floor(raw);
    if (row >= 0 || -row > ext.rows)
        return -1;
    return ext.data[(-row - 1) * ext.width + px]!;
}

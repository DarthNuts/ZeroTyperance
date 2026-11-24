import type { HdConstants } from "./constants.js";
import { wordRgb } from "./column.js";
export const GLOW_WORD = 63;
export function damageGlowOn(palette: readonly number[]): boolean {
    return (palette[GLOW_WORD] ?? 0) !== 0;
}
export function damageGlowColour(palette: readonly number[]): [
    number,
    number,
    number
] {
    const t = new Float32Array(3);
    wordRgb(palette[GLOW_WORD] ?? 0, t, 0);
    return [t[0]!, t[1]!, t[2]!];
}
export function damageGlowAlpha(d: number, H: number, C: HdConstants): number {
    return C.GLOW.ALPHA * Math.max(0, 1 - d / (C.GLOW.WIDTH * H));
}
export function damageGlowBuffer(palette: readonly number[], W: number, H: number, C: HdConstants): Uint8ClampedArray | null {
    if (!damageGlowOn(palette))
        return null;
    const [r, g, b] = damageGlowColour(palette);
    const out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const d = Math.min(x, y, W - 1 - x, H - 1 - y);
            const a = damageGlowAlpha(d, H, C);
            if (a <= 0)
                continue;
            const i = (y * W + x) * 4;
            out[i] = r;
            out[i + 1] = g;
            out[i + 2] = b;
            out[i + 3] = Math.round(a * 255);
        }
    }
    return out;
}

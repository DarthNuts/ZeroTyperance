import type { HandConstants } from "./constants.js";
import type { HandSprite } from "./types.js";
export const GLOW = Object.freeze({
    GRAPHIC: "laser_aimed_gun",
    ATTR_BASE: 0xa354,
    TILES: 5,
    DEPTH_SHIFT: 4,
    X_WORD: 285,
    Y_WORD: 206,
    FACTOR: 2,
    AIM_COLUMN: 64,
    AIM_ROW: 40,
    SIZE: 1,
});
export interface GlowView {
    byteAt(col: number, row: number): number;
    depthAt(col: number): number;
}
export function glowSprite(view: GlowView, a: number, f: number, C: HandConstants): HandSprite | null {
    let recoil = 0;
    if (f !== 0) {
        const r = C.RECOIL[f];
        if (r === undefined)
            throw new Error(`hand: no recoil entry for frame ${f}`);
        recoil = r;
    }
    const row = GLOW.AIM_ROW - GLOW.FACTOR * recoil;
    if (view.byteAt(GLOW.AIM_COLUMN, row) === 0)
        return null;
    const D = view.depthAt(GLOW.AIM_COLUMN + C.SWAY_X * a);
    const s = Math.min(D >> GLOW.DEPTH_SHIFT, GLOW.TILES - 1);
    return {
        xWord: GLOW.X_WORD + GLOW.FACTOR * C.SWAY_X * a,
        yWord: GLOW.Y_WORD - GLOW.FACTOR * recoil,
        w: GLOW.SIZE,
        h: GLOW.SIZE,
        attr: GLOW.ATTR_BASE + s,
    };
}
export function glowViewOf(bytes: Uint8Array | null, depth: readonly number[] | null, R: {
    readonly COLUMNS: number;
    readonly VIEW_ROWS: number;
    readonly COLUMN_GROUP: number;
    readonly TILE_COLUMN_BYTES: number;
    readonly ROW_STRIDE: number;
}): GlowView {
    return {
        byteAt(col, row) {
            if (bytes === null || col < 0 || col >= R.COLUMNS || row < 0 || row >= R.VIEW_ROWS)
                return 0;
            return bytes[Math.floor(col / R.COLUMN_GROUP) * R.TILE_COLUMN_BYTES + (col % R.COLUMN_GROUP) + row * R.ROW_STRIDE] ?? 0;
        },
        depthAt(col) {
            if (depth === null || col < 0 || col >= depth.length)
                return 0;
            return (depth[col] ?? 0) & 0xffff;
        },
    };
}

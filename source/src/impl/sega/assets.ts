import type { SegaConstants } from "./constants.js";
export interface TrigTable {
    sin256: Int16Array;
    negCos256: Int16Array;
}
export interface Texture {
    id: number;
    bytes: Uint8Array;
}
export interface SegaAssets {
    line0: readonly number[];
    cycle: readonly number[];
    textures: ReadonlyMap<number, Texture>;
    trig: TrigTable;
}
export function textureFile(id: number): string {
    return `tex_${String(id).padStart(3, "0")}.png`;
}
export const SEGA_BUNDLE_FORMAT = "zt-sega-bundle/1";
export interface SegaBundle {
    format: typeof SEGA_BUNDLE_FORMAT;
    constants: SegaConstants;
    assets: unknown;
}

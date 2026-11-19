import type { BootConstants } from "./constants.js";
export interface TileBlock {
    name: string;
    count: number;
    patterns: Uint8Array;
}
export type PaletteLines = readonly [
    (readonly number[]) | null,
    (readonly number[]) | null,
    (readonly number[]) | null,
    (readonly number[]) | null
];
export interface NameTableScreen {
    name: string;
    cols: number;
    rows: number;
    entries: Uint16Array;
    firstSlot: number;
    palette: PaletteLines;
    tiles: TileBlock;
}
export interface LogoScreen {
    name: string;
    cols: number;
    rows: number;
    frames: Uint16Array[];
    firstSlot: number;
    palette: PaletteLines;
    tiles: TileBlock;
}
export interface BootAssets {
    banner: NameTableScreen;
    logo: LogoScreen;
    scenes: NameTableScreen[];
}
export const BANNER_SCREEN = "intro_banner";
export const LOGO_SCREEN = "accolade_logo";
export function sceneScreen(k: number): string {
    return `slideshow_${k < 10 ? "0" : ""}${k}`;
}
export const BOOT_BUNDLE_FORMAT = "zt-boot-bundle/1";
export interface BootBundle {
    format: typeof BOOT_BUNDLE_FORMAT;
    constants: BootConstants;
    assets: unknown;
}

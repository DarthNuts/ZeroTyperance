import type { TileBlock } from "../boot/assets.js";
import type { TextFont } from "../options/assets.js";
import type { CharselConstants } from "./constants.js";
export interface CharCard {
    name: string;
    cols: number;
    rows: number;
    entries: Uint16Array;
    origin: readonly [
        number,
        number
    ];
    paletteLines: ReadonlyArray<readonly number[]>;
    tiles: TileBlock;
    firstSlot: number;
}
export interface CharselOverlay {
    cols: number;
    rows: number;
    entries: Uint16Array;
}
export interface TileList {
    firstSlot: number;
    entries: readonly number[];
}
export interface CharselAssets {
    cards: readonly CharCard[];
    overlay: CharselOverlay;
    bank: TileBlock;
    bankSlot: number;
    tile: TileBlock;
    tileSlot: number;
    pool: TileBlock;
    tileLists: readonly TileList[];
    separator: string;
    dossiers: readonly Uint8Array[];
    font: TextFont;
    fontSlot: number;
    fontFlags: number;
}
export const CARD_SCREEN_PREFIX = "charcard_";
export const OVERLAY_SCREEN = "charsel_overlay";
export const BANK_BLOCK = "charsel_bank";
export const TILE_BLOCK = "charsel_tile";
export const POOL_BLOCK = "charsel_pool";
export const LAYOUT_DOC = ["charsel", "layout.json"] as const;
export const STRINGS_GROUP = "character_cards";
export const TEXT_FONT = "main";
export const CHARSEL_BUNDLE_FORMAT = "zt-charsel-bundle/1";
export interface CharselBundle {
    format: typeof CHARSEL_BUNDLE_FORMAT;
    constants: CharselConstants;
    assets: unknown;
}

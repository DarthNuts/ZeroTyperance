import type { ScreenSprite } from "../screen_types.js";
import type { NameTableScreen, TileBlock } from "../boot/assets.js";
import type { TitleConstants } from "./constants.js";
export interface SlottedTiles {
    block: TileBlock;
    firstSlot: number;
}
export interface TitleAssets {
    tiles1: SlottedTiles;
    tiles2: SlottedTiles;
    sprites1: SlottedTiles;
    sprites2: SlottedTiles;
    planeA: NameTableScreen;
    planeB: NameTableScreen;
    strip: NameTableScreen;
    sprites: ScreenSprite[];
    line0: number[];
    ramp: number[][];
}
export const TILES1_BLOCK = "title_tiles1";
export const TILES2_BLOCK = "title_tiles2";
export const SPRITES1_BLOCK = "title_sprites1";
export const SPRITES2_BLOCK = "title_sprites2";
export const PLANE_A_SCREEN = "title_plane_a";
export const PLANE_B_SCREEN = "title_plane_b";
export const STRIP_SCREEN = "title_strip";
export const SPRITES_SCREEN = "title_sprites";
export const LINE0_PALETTE = "title_line0";
export const RAMP_PALETTE = "title_pan_ramp";
export const PICTURE_SPRITES = 16;
export const POINTER_SPRITE = 16;
export const LABEL_SPRITES = 4;
export const SPRITE_COUNT = PICTURE_SPRITES + 1 + LABEL_SPRITES;
export const TITLE_BUNDLE_FORMAT = "zt-title-bundle/1";
export interface TitleBundle {
    format: typeof TITLE_BUNDLE_FORMAT;
    constants: TitleConstants;
    assets: unknown;
}

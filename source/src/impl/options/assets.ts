import type { TileBlock } from "../boot/assets.js";
import type { OptionsConstants } from "./constants.js";
import type { SoundTable } from "./sound_table.js";
export interface Glyph {
    upper: number | null;
    lower: number | null;
}
export interface TextFont {
    name: string;
    tiles: TileBlock;
    glyphs: ReadonlyMap<string, Glyph>;
}
export interface OptionsAssets {
    font: TextFont;
    cursor: TileBlock;
    strings: ReadonlyMap<string, string>;
    line0: number[];
    line3: number[];
    soundTable: SoundTable;
}
export const STRINGS_GROUP = "options_menu";
export const FONTS_DOC = "fonts.json";
export const TILES_DOC = "tiles.json";
export const PALETTES_DOC = "palettes.json";
export const OPTIONS_BUNDLE_FORMAT = "zt-options-bundle/1";
export interface OptionsBundle {
    format: typeof OPTIONS_BUNDLE_FORMAT;
    constants: OptionsConstants;
    assets: unknown;
}

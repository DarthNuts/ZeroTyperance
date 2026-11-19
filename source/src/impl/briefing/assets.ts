import type { NameTableScreen } from "../boot/assets.js";
import type { TextFont } from "../options/assets.js";
import type { BriefingConstants } from "./constants.js";
export interface BriefingPage {
    name: string;
    picture: NameTableScreen;
    scene: string;
    records: readonly string[];
}
export interface BriefingAssets {
    pages: ReadonlyMap<string, BriefingPage>;
    spacers: readonly string[];
    font: TextFont;
}
export const STRINGS_GROUP = "scenes";
export const FONTS_DOC = "fonts.json";
export const TILES_DOC = "tiles.json";
export const BRIEFING_BUNDLE_FORMAT = "zt-briefing-bundle/1";
export interface BriefingBundle {
    format: typeof BRIEFING_BUNDLE_FORMAT;
    constants: BriefingConstants;
    assets: unknown;
}

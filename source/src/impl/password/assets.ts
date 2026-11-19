import type { TileBlock } from "../boot/assets.js";
import type { TextFont } from "../options/assets.js";
import type { PasswordConstants } from "./constants.js";
export interface PasswordAssets {
    font: TextFont;
    corner: TileBlock;
    errorText: string;
    heading: string;
    rows: string[];
    buttons: string;
    line2: number[];
    line0: number[];
    line3: number[];
    cells: string[][];
}
export const PASSWORD_STRINGS_GROUP = "password_screen";
export const PASSWORD_CORNER_FONT = "symbols";
export const PASSWORD_ERROR_ID = "password_screen.00";
export const PASSWORD_HEADING_ID = "password_screen.01";
export const PASSWORD_BUNDLE_FORMAT = "zt-password-bundle/1";
export const PASSWORD_ASSETS_SERIAL_FORMAT = "zt-password-assets/1";
export interface PasswordBundle {
    format: typeof PASSWORD_BUNDLE_FORMAT;
    constants: PasswordConstants;
    codec: unknown;
    assets: unknown;
}

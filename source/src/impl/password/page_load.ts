import { isObj, needStr } from "../boot/assets_parse.js";
import { decodeIndexedPng } from "../boot/png.js";
import { sha256Hex } from "../boot/sha256.js";
import { FONTS_DOC, PALETTES_DOC } from "../options/assets.js";
import { optionsConstantsFrom } from "../options/constants.js";
import { outputBytes, outputJson } from "../release/pack_source.js";
import type { PackSource } from "../release/pack_source.js";
import type { PasswordAssets } from "./assets.js";
import { PASSWORD_CORNER_FONT, PASSWORD_ERROR_ID, PASSWORD_HEADING_ID, PASSWORD_STRINGS_GROUP } from "./assets.js";
import { fontSheetName, fontTileCount, parseCells, parseLastTile, parsePaletteLine, parsePasswordStrings, parseTextFont, } from "./assets_parse.js";
import { passwordCodecFrom, makeDecoder } from "./codec.js";
import { passwordConstantsFrom } from "./constants.js";
import type { PasswordConstants } from "./constants.js";
import type { PasswordDecoder } from "./types.js";
function wrap<T>(path: string, f: () => T): T {
    try {
        return f();
    }
    catch (e) {
        const m = (e as Error).message;
        throw new Error(m.includes(path) ? m : `${path}: ${m}`);
    }
}
function fontSheet(src: PackSource, fontsDoc: unknown, name: string) {
    const fontsPath = `fonts/${FONTS_DOC}`;
    const sheetPath = `fonts/${wrap(fontsPath, () => fontSheetName(fontsDoc, name))}`;
    const sheet = decodeIndexedPng(outputBytes(src, sheetPath), (z) => src.inflate(z));
    const entry = (isObj(fontsDoc) && Array.isArray(fontsDoc.entries) ? fontsDoc.entries : []).find((e) => isObj(e) && e.name === name);
    const want = wrap(fontsPath, () => needStr(entry, "sha256_pixels", `font ${name}`));
    const got = sha256Hex(sheet.pixels);
    if (got !== want)
        throw new Error(`${sheetPath}: decoded sheet sha256 ${got} does not match fonts.json sha256_pixels ${want}`);
    return sheet;
}
export function loadPasswordEnvironmentFrom(src: PackSource): {
    assets: PasswordAssets;
    C: PasswordConstants;
    decoder: PasswordDecoder;
} {
    const C = wrap("password", () => passwordConstantsFrom(src.data("password")));
    const codecDoc = src.data("password_codec");
    const decoder = wrap("password_codec", () => makeDecoder(passwordCodecFrom(codecDoc)));
    const cells = wrap("password_codec", () => parseCells(codecDoc));
    const OC = wrap("options", () => optionsConstantsFrom(src.data("options")));
    const fontsPath = `fonts/${FONTS_DOC}`;
    const fontsDoc = outputJson(src, fontsPath);
    const font = wrap(fontsPath, () => parseTextFont(fontsDoc, OC.TEXT_FONT, fontSheet(src, fontsDoc, OC.TEXT_FONT)));
    const corner = wrap(fontsPath, () => parseLastTile(PASSWORD_CORNER_FONT, fontTileCount(fontsDoc, PASSWORD_CORNER_FONT), fontSheet(src, fontsDoc, PASSWORD_CORNER_FONT)));
    const stringsPath = `strings/${PASSWORD_STRINGS_GROUP}.json`;
    const s = wrap(stringsPath, () => parsePasswordStrings(outputJson(src, stringsPath), PASSWORD_STRINGS_GROUP, PASSWORD_ERROR_ID, PASSWORD_HEADING_ID, C["GRID.ROWS"] - 1));
    for (const text of [s.errorText, s.heading, s.buttons, ...s.rows]) {
        for (const ch of text) {
            if (ch !== " " && !font.glyphs.has(ch))
                throw new Error(`${stringsPath}: the character ${JSON.stringify(ch)} has no glyph in font ${font.name}`);
        }
    }
    const palPath = `palettes/${PALETTES_DOC}`;
    const palDoc = outputJson(src, palPath);
    const line2 = wrap(palPath, () => parsePaletteLine(palDoc, C["PALETTE.NAME"]));
    const line0 = wrap(palPath, () => parsePaletteLine(palDoc, OC.PALETTE_LINE0));
    const line3 = wrap(palPath, () => parsePaletteLine(palDoc, OC.PALETTE_LINE3));
    return {
        assets: { font, corner, errorText: s.errorText, heading: s.heading, rows: s.rows, buttons: s.buttons, line0, line2, line3, cells },
        C,
        decoder,
    };
}

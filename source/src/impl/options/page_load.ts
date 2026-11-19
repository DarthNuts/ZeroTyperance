import { isObj, needStr } from "../boot/assets_parse.js";
import { indexBlocksFrom, loadTilesFrom, wrapAt } from "../boot/page_load.js";
import { decodeIndexedPng } from "../boot/png.js";
import { sha256Hex } from "../boot/sha256.js";
import { outputBytes, outputJson } from "../release/pack_source.js";
import type { PackSource } from "../release/pack_source.js";
import { FONTS_DOC, PALETTES_DOC, STRINGS_GROUP, TILES_DOC } from "./assets.js";
import type { OptionsAssets } from "./assets.js";
import { fontSheetName, parsePaletteLine, parseStrings, parseTextFont } from "./assets_parse.js";
import { optionsConstantsFrom } from "./constants.js";
import type { OptionsConstants } from "./constants.js";
import { checkSoundTable, parseSoundTable } from "./sound_table.js";
import type { SoundTable } from "./sound_table.js";
export function loadOptionsConstantsFrom(src: PackSource): OptionsConstants {
    return wrapAt("options", () => optionsConstantsFrom(src.data("options")));
}
export function loadSoundTableFrom(src: PackSource, C: OptionsConstants): SoundTable {
    return wrapAt(C.TEST_TABLE, () => {
        const table = parseSoundTable(src.data(C.TEST_TABLE), C.TEST_TABLE);
        checkSoundTable(table, C);
        return table;
    });
}
function fontSheetSha(doc: unknown, name: string): string {
    const entry = (isObj(doc) && Array.isArray(doc.entries) ? doc.entries : []).find((e) => isObj(e) && e.name === name);
    return needStr(entry, "sha256_pixels", `font ${name}`);
}
export function loadOptionsEnvironmentFrom(src: PackSource): {
    assets: OptionsAssets;
    C: OptionsConstants;
} {
    const C = loadOptionsConstantsFrom(src);
    const soundTable = loadSoundTableFrom(src, C);
    const fontsPath = `fonts/${FONTS_DOC}`;
    const fontsDoc = outputJson(src, fontsPath);
    const sheetPath = `fonts/${wrapAt(fontsPath, () => fontSheetName(fontsDoc, C.TEXT_FONT))}`;
    const sheet = decodeIndexedPng(outputBytes(src, sheetPath), (z) => src.inflate(z));
    const want = wrapAt(fontsPath, () => fontSheetSha(fontsDoc, C.TEXT_FONT));
    const got = sha256Hex(sheet.pixels);
    if (got !== want)
        throw new Error(`${sheetPath}: decoded sheet sha256 ${got} does not match fonts.json sha256_pixels ${want}`);
    const font = wrapAt(fontsPath, () => parseTextFont(fontsDoc, C.TEXT_FONT, sheet));
    const tilesPath = `tiles/${TILES_DOC}`;
    const blocks = indexBlocksFrom(outputJson(src, tilesPath), tilesPath);
    const cursor = loadTilesFrom(src, blocks, C.CURSOR_TILES);
    const cursorTiles = C.CURSOR_SIZE[0]! * C.CURSOR_SIZE[1]!;
    if (cursor.count !== cursorTiles) {
        throw new Error(`${tilesPath}: block ${C.CURSOR_TILES} holds ${cursor.count} tiles, the cursor (${C.CURSOR_SIZE[0]} x ${C.CURSOR_SIZE[1]} cells) needs ${cursorTiles}`);
    }
    const stringsPath = `strings/${STRINGS_GROUP}.json`;
    const strings = wrapAt(stringsPath, () => parseStrings(outputJson(src, stringsPath), STRINGS_GROUP));
    const ids = [...C.LABEL_STRINGS, ...C.PLAYERS_STRINGS, ...C.SWITCH_STRINGS, C.TEST_DIGITS];
    for (const id of ids) {
        const s = strings.get(id);
        if (s === undefined)
            throw new Error(`${stringsPath}: no string ${id} (named by the constants)`);
        for (const ch of s) {
            if (!font.glyphs.has(ch))
                throw new Error(`${stringsPath}: string ${id} has the character ${JSON.stringify(ch)}, which has no glyph in font ${font.name}`);
        }
    }
    for (const ch of C.NAME_DEFAULT) {
        if (!font.glyphs.has(ch))
            throw new Error(`NAME_DEFAULT has the character ${JSON.stringify(ch)}, which has no glyph in font ${font.name}`);
    }
    const palPath = `palettes/${PALETTES_DOC}`;
    const palDoc = outputJson(src, palPath);
    const line0 = wrapAt(palPath, () => parsePaletteLine(palDoc, C.PALETTE_LINE0));
    const line3 = wrapAt(palPath, () => parsePaletteLine(palDoc, C.PALETTE_LINE3));
    return { assets: { font, cursor, strings, line0, line3, soundTable }, C };
}

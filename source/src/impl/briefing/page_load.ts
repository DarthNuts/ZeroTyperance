import type { NameTableScreen } from "../boot/assets.js";
import { parseNameTableScreen } from "../boot/assets_parse.js";
import { indexBlocksFrom, loadTilesFrom, screenDocFrom, wrapAt } from "../boot/page_load.js";
import { decodeIndexedPng } from "../boot/png.js";
import { sha256Hex } from "../boot/sha256.js";
import { deathConstantsFrom } from "../death/constants.js";
import type { DeathConstants } from "../death/constants.js";
import { fontSheetName, parseTextFont } from "../options/assets_parse.js";
import type { TextFont } from "../options/assets.js";
import { outputBytes, outputJson } from "../release/pack_source.js";
import type { PackSource } from "../release/pack_source.js";
import { FONTS_DOC, STRINGS_GROUP, TILES_DOC } from "./assets.js";
import type { BriefingAssets, BriefingPage } from "./assets.js";
import { checkGlyphs, parseSceneRecords } from "./assets_parse.js";
import { briefingConstantsFrom, gameOverPageKey, gameOverPages } from "./constants.js";
import type { BriefingConstants } from "./constants.js";
export function loadBriefingConstantsFrom(src: PackSource): BriefingConstants {
    return wrapAt("briefing", () => briefingConstantsFrom(src.data("briefing")));
}
function fontSheetSha(doc: unknown, name: string): string {
    const entries = (doc as {
        entries?: unknown;
    }).entries;
    const entry = (Array.isArray(entries) ? entries : []).find((e) => typeof e === "object" && e !== null && (e as {
        name?: unknown;
    }).name === name) as {
        sha256_pixels?: unknown;
    } | undefined;
    if (!entry || typeof entry.sha256_pixels !== "string")
        throw new Error(`font ${name}: no sha256_pixels`);
    return entry.sha256_pixels;
}
function vramSlot(doc: unknown, name: string, path: string): number | undefined {
    for (const b of (doc as {
        blocks: Record<string, unknown>[];
    }).blocks) {
        if (b.name !== name)
            continue;
        if (b.vram_tile_slot === undefined)
            return undefined;
        if (typeof b.vram_tile_slot !== "number")
            throw new Error(`${path}: block ${name}: vram_tile_slot is not a number`);
        return b.vram_tile_slot;
    }
    return undefined;
}
export function loadBriefingEnvironmentFrom(src: PackSource): {
    assets: BriefingAssets;
    C: BriefingConstants;
} {
    const C = loadBriefingConstantsFrom(src);
    const fontsPath = `fonts/${FONTS_DOC}`;
    const fontsDoc = outputJson(src, fontsPath);
    const sheetPath = `fonts/${wrapAt(fontsPath, () => fontSheetName(fontsDoc, C.TEXT_FONT))}`;
    const sheet = decodeIndexedPng(outputBytes(src, sheetPath), (z) => src.inflate(z));
    const want = wrapAt(fontsPath, () => fontSheetSha(fontsDoc, C.TEXT_FONT));
    const got = sha256Hex(sheet.pixels);
    if (got !== want)
        throw new Error(`${sheetPath}: decoded sheet sha256 ${got} does not match fonts.json sha256_pixels ${want}`);
    const font: TextFont = wrapAt(fontsPath, () => parseTextFont(fontsDoc, C.TEXT_FONT, sheet));
    const stringsPath = `strings/${STRINGS_GROUP}.json`;
    const stringsDoc = outputJson(src, stringsPath);
    const records = (id: string): string[] => {
        const rows = wrapAt(stringsPath, () => parseSceneRecords(stringsDoc, STRINGS_GROUP, id, C.RECORD_CHARS));
        wrapAt(stringsPath, () => checkGlyphs(rows, font, `entry ${id}`));
        return rows;
    };
    const spacers = records(C.SPACER_SCENE);
    const tilesPath = `tiles/${TILES_DOC}`;
    const tilesDoc = outputJson(src, tilesPath);
    const blocks = indexBlocksFrom(tilesDoc, tilesPath);
    const pages = new Map<string, BriefingPage>();
    const D: DeathConstants = wrapAt("death", () => deathConstantsFrom(src.data("death")));
    const goPages = Object.values(gameOverPages(D)).map((ref) => ({ ref, key: gameOverPageKey(ref) }));
    const endingRef = { screen: C["ENDING.PICTURE"], scene: C["ENDING.SCENE"] };
    const paths = [...C.PAGES_DEMO, ...C.PAGES_START, ...C.PAGES_EPISODE_1, ...C.PAGES_EPISODE_2, endingRef].map((ref) => ({ ref, key: ref.scene }));
    for (const { ref, key } of [...paths, ...goPages]) {
        const known = pages.get(key);
        if (known) {
            if (known.name !== ref.screen)
                throw new Error(`briefing: the text ${ref.scene} is paired with two screens (${known.name}, ${ref.screen})`);
            continue;
        }
        const tiles = loadTilesFrom(src, blocks, ref.screen);
        const d = screenDocFrom(src, ref.screen);
        const picture: NameTableScreen = wrapAt(d.path, () => parseNameTableScreen(d.doc, tiles));
        if (picture.cols !== C.PICTURE_COLUMNS || picture.rows !== C.PICTURE_ROWS) {
            throw new Error(`${d.path}: the picture is ${picture.cols} x ${picture.rows} cells, the spec says ${C.PICTURE_COLUMNS} x ${C.PICTURE_ROWS}`);
        }
        const v = vramSlot(tilesDoc, ref.screen, tilesPath);
        if (v !== undefined && v !== picture.firstSlot)
            throw new Error(`${d.path}: first_slot ${picture.firstSlot} but ${tilesPath} says vram_tile_slot ${v}`);
        const keys = [C.PICTURE_PALETTE_LINE, C.TEXT_PALETTE_LINE];
        if (picture.palette[Number(C.PICTURE_PALETTE_LINE_2)] !== null)
            keys.push(C.PICTURE_PALETTE_LINE_2);
        for (const key of keys) {
            if (!/^[0-3]$/.test(key) || picture.palette[Number(key)] === null)
                throw new Error(`${d.path}: no palette line ${JSON.stringify(key)} (named by the constants)`);
        }
        pages.set(key, { name: ref.screen, picture, scene: ref.scene, records: records(ref.scene) });
    }
    return { assets: { pages, spacers, font }, C };
}

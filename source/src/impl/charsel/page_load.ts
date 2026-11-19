import { isObj, needStr, parseTileBlock } from "../boot/assets_parse.js";
import type { TileBlock } from "../boot/assets.js";
import { decodeIndexedPng } from "../boot/png.js";
import { sha256Hex } from "../boot/sha256.js";
import { fontSheetName, parseTextFont } from "../options/assets_parse.js";
import { outputBytes, outputJson } from "../release/pack_source.js";
import type { PackSource } from "../release/pack_source.js";
import { BANK_BLOCK, CARD_SCREEN_PREFIX, LAYOUT_DOC, OVERLAY_SCREEN, POOL_BLOCK, STRINGS_GROUP, TEXT_FONT, TILE_BLOCK } from "./assets.js";
import type { CharCard, CharselAssets } from "./assets.js";
import { CARD_COUNT, blockHasNoSlot, blockSlot, checkGlyphs, parseCharCard, parseDossiers, parseFontSource, parseLayout, parseOverlay } from "./assets_parse.js";
import { charselConstantsFrom } from "./constants.js";
import type { CharselConstants } from "./constants.js";
function wrap<T>(path: string, f: () => T): T {
    try {
        return f();
    }
    catch (e) {
        const m = (e as Error).message;
        throw new Error(m.includes(path) ? m : `${path}: ${m}`);
    }
}
interface BlockEntry {
    name: string;
    png: string;
    tileCount: number;
    sha: string;
}
function indexBlocks(doc: unknown, path: string): Map<string, BlockEntry> {
    const blocks = (doc as {
        blocks?: unknown;
    } | null)?.blocks;
    if (!Array.isArray(blocks))
        throw new Error(`${path}: no blocks array`);
    const out = new Map<string, BlockEntry>();
    for (const b of blocks as Record<string, unknown>[]) {
        if (typeof b !== "object" || b === null)
            throw new Error(`${path}: a block is not an object`);
        const { name, png, tile_count: tileCount, sha256_pixels: sha } = b;
        if (typeof name !== "string" || typeof png !== "string" || typeof tileCount !== "number" || !Number.isInteger(tileCount) || typeof sha !== "string") {
            throw new Error(`${path}: block ${JSON.stringify(name)} lacks name/png/tile_count/sha256_pixels`);
        }
        out.set(name, { name, png, tileCount, sha });
    }
    return out;
}
function loadTiles(src: PackSource, blocks: Map<string, BlockEntry>, name: string): TileBlock {
    const b = blocks.get(name);
    if (!b)
        throw new Error(`tiles/tiles.json: no block named ${name}`);
    const pngPath = `tiles/${b.png}`;
    const img = decodeIndexedPng(outputBytes(src, pngPath), (z) => src.inflate(z));
    const got = sha256Hex(img.pixels);
    if (got !== b.sha)
        throw new Error(`${pngPath}: decoded sheet sha256 ${got} does not match tiles.json sha256_pixels ${b.sha}`);
    try {
        return parseTileBlock(name, b.tileCount, img);
    }
    catch (e) {
        throw new Error(`${pngPath}: ${(e as Error).message}`);
    }
}
function fontSheetSha(doc: unknown, name: string): string {
    const entry = (isObj(doc) && Array.isArray(doc.entries) ? doc.entries : []).find((e) => isObj(e) && e.name === name);
    return needStr(entry, "sha256_pixels", `font ${name}`);
}
export function loadCharselEnvironmentFrom(src: PackSource): {
    assets: CharselAssets;
    C: CharselConstants;
} {
    const C = wrap("charsel", () => charselConstantsFrom(src.data("charsel")));
    const tilesPath = "tiles/tiles.json";
    const tilesDoc = outputJson(src, tilesPath);
    const blocks = indexBlocks(tilesDoc, tilesPath);
    const cards: CharCard[] = [];
    for (let k = 0; k < CARD_COUNT; k++) {
        const name = `${CARD_SCREEN_PREFIX}${k}`;
        const tiles = loadTiles(src, blocks, name);
        const slot = wrap(tilesPath, () => blockSlot(tilesDoc, name));
        const sPath = `screens/${name}.json`;
        const sDoc = outputJson(src, sPath);
        cards.push(wrap(sPath, () => parseCharCard(sDoc, tiles, slot)));
    }
    const oPath = `screens/${OVERLAY_SCREEN}.json`;
    const oDoc = outputJson(src, oPath);
    const overlay = wrap(oPath, () => parseOverlay(oDoc));
    const bank = loadTiles(src, blocks, BANK_BLOCK);
    const bankSlot = wrap(tilesPath, () => blockSlot(tilesDoc, BANK_BLOCK));
    const tile = loadTiles(src, blocks, TILE_BLOCK);
    const tileSlot = wrap(tilesPath, () => blockSlot(tilesDoc, TILE_BLOCK));
    const pool = loadTiles(src, blocks, POOL_BLOCK);
    wrap(tilesPath, () => blockHasNoSlot(tilesDoc, POOL_BLOCK));
    const layoutPath = LAYOUT_DOC.join("/");
    const layout = wrap(layoutPath, () => parseLayout(outputJson(src, layoutPath), POOL_BLOCK, pool.count));
    const stringsPath = `strings/${STRINGS_GROUP}.json`;
    const dossiers = wrap(stringsPath, () => parseDossiers(outputJson(src, stringsPath)));
    const fontsPath = "fonts/fonts.json";
    const fontsDoc = outputJson(src, fontsPath);
    const sheetPath = `fonts/${wrap(fontsPath, () => fontSheetName(fontsDoc, TEXT_FONT))}`;
    const sheet = decodeIndexedPng(outputBytes(src, sheetPath), (z) => src.inflate(z));
    const want = wrap(fontsPath, () => fontSheetSha(fontsDoc, TEXT_FONT));
    const got = sha256Hex(sheet.pixels);
    if (got !== want)
        throw new Error(`${sheetPath}: decoded sheet sha256 ${got} does not match fonts.json sha256_pixels ${want}`);
    const font = wrap(fontsPath, () => parseTextFont(fontsDoc, TEXT_FONT, sheet));
    const fsrc = wrap(fontsPath, () => parseFontSource(fontsDoc, TEXT_FONT));
    wrap(stringsPath, () => checkGlyphs(dossiers, layout.separator, font, stringsPath));
    return {
        assets: {
            cards,
            overlay,
            bank,
            bankSlot,
            tile,
            tileSlot,
            pool,
            tileLists: layout.tileLists,
            separator: layout.separator,
            dossiers,
            font,
            fontSlot: fsrc.slot,
            fontFlags: fsrc.flags,
        },
        C,
    };
}

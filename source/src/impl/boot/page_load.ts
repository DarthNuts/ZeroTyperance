import { outputBytes, outputJson } from "../release/pack_source.js";
import type { PackSource } from "../release/pack_source.js";
import { BANNER_SCREEN, LOGO_SCREEN, sceneScreen } from "./assets.js";
import type { BootAssets, LogoScreen, NameTableScreen, TileBlock } from "./assets.js";
import { parseLogoScreen, parseNameTableScreen, parseTileBlock } from "./assets_parse.js";
import { bootConstantsFrom } from "./constants.js";
import type { BootConstants } from "./constants.js";
import { decodeIndexedPng } from "./png.js";
import { sha256Hex } from "./sha256.js";
export interface BlockEntry {
    name: string;
    png: string;
    tileCount: number;
    sha: string;
}
export function wrapAt<T>(path: string, f: () => T): T {
    try {
        return f();
    }
    catch (e) {
        const m = (e as Error).message;
        throw new Error(m.includes(path) ? m : `${path}: ${m}`);
    }
}
export function indexBlocksFrom(doc: unknown, path: string): Map<string, BlockEntry> {
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
export function loadTilesFrom(src: PackSource, blocks: Map<string, BlockEntry>, name: string): TileBlock {
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
export function screenDocFrom(src: PackSource, name: string): {
    path: string;
    doc: unknown;
} {
    const path = `screens/${name}.json`;
    return { path, doc: outputJson(src, path) };
}
export function loadBootConstantsFrom(src: PackSource): BootConstants {
    return wrapAt("boot", () => bootConstantsFrom(src.data("boot")));
}
export function loadBootEnvironmentFrom(src: PackSource): {
    assets: BootAssets;
    C: BootConstants;
} {
    const C = loadBootConstantsFrom(src);
    const blocks = indexBlocksFrom(outputJson(src, "tiles/tiles.json"), "tiles/tiles.json");
    const bannerTiles = loadTilesFrom(src, blocks, BANNER_SCREEN);
    const b = screenDocFrom(src, BANNER_SCREEN);
    const banner: NameTableScreen = wrapAt(b.path, () => parseNameTableScreen(b.doc, bannerTiles));
    const logoTiles = loadTilesFrom(src, blocks, LOGO_SCREEN);
    const l = screenDocFrom(src, LOGO_SCREEN);
    const logo: LogoScreen = wrapAt(l.path, () => parseLogoScreen(l.doc, logoTiles));
    const scenes: NameTableScreen[] = [];
    for (let k = 0; k < C.SLIDESHOW_SCENES; k++) {
        const name = sceneScreen(k);
        const tiles = loadTilesFrom(src, blocks, name);
        const s = screenDocFrom(src, name);
        scenes.push(wrapAt(s.path, () => parseNameTableScreen(s.doc, tiles)));
    }
    return { assets: { banner, logo, scenes }, C };
}

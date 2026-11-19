import type { NameTableScreen } from "../boot/assets.js";
import { parseNameTableScreen } from "../boot/assets_parse.js";
import { indexBlocksFrom, loadTilesFrom, screenDocFrom, wrapAt } from "../boot/page_load.js";
import { outputJson } from "../release/pack_source.js";
import type { PackSource } from "../release/pack_source.js";
import type { SlottedTiles, TitleAssets } from "./assets.js";
import { PLANE_A_SCREEN, PLANE_B_SCREEN, SPRITES1_BLOCK, SPRITES2_BLOCK, SPRITES_SCREEN, STRIP_SCREEN, TILES1_BLOCK, TILES2_BLOCK, } from "./assets.js";
import { checkSpriteTileSources, parseTitlePalettes, parseTitleSprites } from "./assets_parse.js";
import { titleConstantsFrom } from "./constants.js";
import type { TitleConstants } from "./constants.js";
export function loadTitleConstantsFrom(src: PackSource): TitleConstants {
    return wrapAt("title", () => titleConstantsFrom(src.data("title")));
}
function vramSlots(doc: unknown, path: string, only: readonly string[]): Map<string, number> {
    const out = new Map<string, number>();
    for (const b of (doc as {
        blocks: Record<string, unknown>[];
    }).blocks) {
        if (!only.includes(b.name as string))
            continue;
        if (typeof b.vram_tile_slot === "number")
            out.set(b.name as string, b.vram_tile_slot);
        else if (b.vram_tile_slot !== undefined)
            throw new Error(`${path}: block ${String(b.name)}: vram_tile_slot is not a number`);
    }
    return out;
}
export function loadTitleEnvironmentFrom(src: PackSource): {
    assets: TitleAssets;
    C: TitleConstants;
} {
    const C = loadTitleConstantsFrom(src);
    const tilesJson = "tiles/tiles.json";
    const tilesDoc = outputJson(src, tilesJson);
    const blocks = indexBlocksFrom(tilesDoc, tilesJson);
    const vram = vramSlots(tilesDoc, tilesJson, [TILES1_BLOCK, TILES2_BLOCK, SPRITES1_BLOCK, SPRITES2_BLOCK]);
    const tiles1 = loadTilesFrom(src, blocks, TILES1_BLOCK);
    const tiles2 = loadTilesFrom(src, blocks, TILES2_BLOCK);
    const spr1 = loadTilesFrom(src, blocks, SPRITES1_BLOCK);
    const spr2 = loadTilesFrom(src, blocks, SPRITES2_BLOCK);
    const table = (name: string, tiles: typeof tiles1): {
        nt: NameTableScreen;
        path: string;
    } => {
        const d = screenDocFrom(src, name);
        return { nt: wrapAt(d.path, () => parseNameTableScreen(d.doc, tiles)), path: d.path };
    };
    const a = table(PLANE_A_SCREEN, tiles2);
    const b = table(PLANE_B_SCREEN, tiles2);
    const strip = table(STRIP_SCREEN, tiles1);
    if (a.nt.firstSlot !== b.nt.firstSlot) {
        throw new Error(`${a.path} and ${b.path}: tile_sources[0].first_slot ${a.nt.firstSlot} and ${b.nt.firstSlot} disagree`);
    }
    const sd = screenDocFrom(src, SPRITES_SCREEN);
    const sprites = wrapAt(sd.path, () => parseTitleSprites(sd.doc));
    const [s1, s2] = wrapAt(sd.path, () => checkSpriteTileSources(sd.doc, [spr1, spr2]));
    const palPath = "palettes/palettes.json";
    const pal = wrapAt(palPath, () => parseTitlePalettes(outputJson(src, palPath)));
    const check = (block: string, slot: number, from: string): void => {
        const v = vram.get(block);
        if (v !== undefined && v !== slot)
            throw new Error(`${from}: first_slot ${slot} for ${block} but ${tilesJson} says vram_tile_slot ${v}`);
    };
    check(TILES1_BLOCK, strip.nt.firstSlot, strip.path);
    check(TILES2_BLOCK, a.nt.firstSlot, a.path);
    check(SPRITES1_BLOCK, s1!, sd.path);
    check(SPRITES2_BLOCK, s2!, sd.path);
    const slotted = (block: typeof tiles1, firstSlot: number): SlottedTiles => ({ block, firstSlot });
    const assets: TitleAssets = {
        tiles1: slotted(tiles1, strip.nt.firstSlot),
        tiles2: slotted(tiles2, a.nt.firstSlot),
        sprites1: slotted(spr1, s1!),
        sprites2: slotted(spr2, s2!),
        planeA: a.nt,
        planeB: b.nt,
        strip: strip.nt,
        sprites,
        line0: pal.line0,
        ramp: pal.ramp,
    };
    return { assets, C };
}

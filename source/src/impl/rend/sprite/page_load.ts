import { decodeIndexedPng } from "../../boot/png.js";
import type { TexturePixels } from "../assets.js";
import { soldierConstantsFrom, spriteConstantsFrom } from "./constants.js";
import type { SoldierConstants, SpriteConstants } from "./constants.js";
import { spriteAssetsFrom } from "./assets.js";
import type { BankSource, SpriteAssetsDoc, SpriteAssetsExtra } from "./assets.js";
import type { SpriteAssets } from "./types.js";
import { outputBytes, outputJson } from "../../release/pack_source.js";
import type { PackSource } from "../../release/pack_source.js";
export interface SpriteEnvironmentFrom {
    readonly SC: SpriteConstants;
    readonly ES: SoldierConstants;
    readonly spriteDoc: unknown;
    readonly soldierDoc: unknown;
}
export function loadSpriteEnvironmentFrom(src: PackSource): SpriteEnvironmentFrom {
    const spriteDoc = src.data("rend_sprite");
    const soldierDoc = src.data("ent_soldier");
    return Object.freeze({ SC: spriteConstantsFrom(spriteDoc), ES: soldierConstantsFrom(soldierDoc), spriteDoc, soldierDoc });
}
export function loadSpriteAssetsFrom(src: PackSource, SC: SpriteConstants): SpriteAssets & SpriteAssetsExtra & {
    readonly doc: SpriteAssetsDoc;
} {
    const decode = (p: string): TexturePixels => {
        const img = decodeIndexedPng(outputBytes(src, p), (z) => src.inflate(z));
        return { width: img.width, height: img.height, pixels: img.pixels };
    };
    const itemsDoc = outputJson(src, "items/items.json");
    const spritesIndex = outputJson(src, "sprites/index.json");
    const animLutDoc = outputJson(src, "sprites/anim_lut.json");
    const palettesDoc = outputJson(src, "palettes/palettes.json");
    const itemArts: Array<TexturePixels | undefined> = [];
    for (const p of src.list("items/")) {
        const m = /^items\/art_(\d+)\.png$/.exec(p);
        if (m)
            itemArts[Number(m[1])] = decode(p);
    }
    const banksList = (spritesIndex as {
        banks?: unknown;
    } | null)?.banks;
    if (!Array.isArray(banksList))
        throw new Error("sprites/index.json: no banks[]");
    const banks: BankSource[] = banksList.map((b: {
        name?: unknown;
        atlas?: unknown;
    }) => {
        if (typeof b.name !== "string" || typeof b.atlas !== "string")
            throw new Error("sprites/index.json: a bank without name and atlas");
        const doc = outputJson(src, `sprites/${b.atlas}`);
        const pngName = (doc as {
            cell_pool?: {
                png?: unknown;
            };
        } | null)?.cell_pool?.png;
        if (typeof pngName !== "string")
            throw new Error(`sprites/${b.atlas}: no cell_pool.png`);
        return { name: b.name, doc, pool: decode(`sprites/${pngName}`) };
    });
    return spriteAssetsFrom({ itemsDoc, itemArts, spritesIndex, banks, animLutDoc, palettesDoc }, SC);
}

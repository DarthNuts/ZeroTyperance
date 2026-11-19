import { wrapAt } from "../boot/page_load.js";
import { decodeIndexedPng } from "../boot/png.js";
import { outputBytes, outputJson } from "../release/pack_source.js";
import type { PackSource } from "../release/pack_source.js";
import { textureFile } from "./assets.js";
import type { SegaAssets, Texture } from "./assets.js";
import { parseSegaPalettes, parseTrigTable, textureFromImage } from "./assets_parse.js";
import { segaConstantsFrom } from "./constants.js";
import type { SegaConstants } from "./constants.js";
export function loadSegaConstantsFrom(src: PackSource): SegaConstants {
    return wrapAt("sega", () => segaConstantsFrom(src.data("sega")));
}
export function loadSegaEnvironmentFrom(src: PackSource): {
    assets: SegaAssets;
    C: SegaConstants;
} {
    const C = loadSegaConstantsFrom(src);
    const palPath = "palettes/palettes.json";
    const pal = wrapAt(palPath, () => parseSegaPalettes(outputJson(src, palPath), C));
    const textures = new Map<number, Texture>();
    for (const id of C.TEX_ORDER) {
        if (textures.has(id))
            continue;
        const pngPath = `textures/${textureFile(id)}`;
        const bytes = outputBytes(src, pngPath);
        textures.set(id, wrapAt(pngPath, () => textureFromImage(id, decodeIndexedPng(bytes, (z) => src.inflate(z)), C)));
    }
    const trig = wrapAt("trig_table", () => parseTrigTable(src.data("trig_table"), C));
    return { assets: { line0: pal.line0, cycle: pal.cycle, textures, trig }, C };
}

import { decodeIndexedPng } from "../boot/png.js";
import { rendConstantsFrom } from "./constants.js";
import type { RendConstants } from "./constants.js";
import { trigFrom } from "./trig.js";
import type { TrigTable } from "./trig.js";
import { MAPS_FORMAT, floorDocFrom, floorMapFrom } from "./floor_map.js";
import type { FloorDoc } from "./floor_map.js";
import type { FloorMap } from "./core.js";
import { TEXTURES_FORMAT, rendAssetsFrom } from "./assets.js";
import type { RendAssets, RendAssetsDoc, TexturePixels } from "./assets.js";
import { outputBytes, outputJson } from "../release/pack_source.js";
import type { PackSource } from "../release/pack_source.js";
export interface RendEnvironmentFrom {
    readonly C: RendConstants;
    readonly trig: TrigTable;
    readonly dataDoc: unknown;
    readonly trigDoc: unknown;
}
export function loadRendEnvironmentFrom(src: PackSource): RendEnvironmentFrom {
    const dataDoc = src.data("rend_wall");
    const C = rendConstantsFrom(dataDoc);
    const trigDoc = src.data("trig_table");
    const trig = trigFrom(trigDoc, C.ANGLES);
    return Object.freeze({ C, trig, dataDoc, trigDoc });
}
const cache = new WeakMap<PackSource, Map<number, unknown>>();
export function mapsDocumentFrom(src: PackSource, episode: number): unknown {
    let per = cache.get(src);
    if (per === undefined)
        cache.set(src, (per = new Map()));
    const cached = per.get(episode);
    if (cached !== undefined)
        return cached;
    const paths = src.list("maps/").filter((n) => n.endsWith(".json"));
    if (paths.length === 0)
        throw new Error("maps/: no stored maps documents (the extraction has not run)");
    for (const p of paths) {
        const doc = outputJson(src, p) as {
            format?: unknown;
            episode?: {
                index?: unknown;
            };
        };
        if (doc.format !== MAPS_FORMAT || doc.episode?.index !== episode)
            continue;
        per.set(episode, doc);
        return doc;
    }
    throw new Error(`maps/: no ${MAPS_FORMAT} document of episode ${episode}`);
}
export function loadFloorFrom(src: PackSource, episode: number, floor: number, C: RendConstants): FloorMap & {
    readonly doc: FloorDoc;
} {
    return floorMapFrom(floorDocFrom(mapsDocumentFrom(src, episode), floor, C.MAP_SIDE));
}
interface TexturesDoc {
    format?: unknown;
    textures?: {
        count?: unknown;
        png_pattern?: unknown;
    };
}
export function loadRendAssetsFrom(src: PackSource, C: RendConstants): RendAssets & {
    readonly doc: RendAssetsDoc;
} {
    const texDoc = outputJson(src, "textures/textures.json") as TexturesDoc;
    const palDoc = outputJson(src, "palettes/palettes.json");
    if (texDoc.format !== TEXTURES_FORMAT)
        throw new Error(`textures.json: format ${String(texDoc.format)}, expected ${TEXTURES_FORMAT}`);
    const count = texDoc.textures?.count;
    if (typeof count !== "number" || !Number.isInteger(count) || count <= 0)
        throw new Error("textures.json: textures.count is not a positive integer");
    const pattern = typeof texDoc.textures?.png_pattern === "string" ? texDoc.textures.png_pattern : "tex_<index:03d>.png";
    const images: TexturePixels[] = [];
    for (let t = 0; t < count; t++) {
        const name = pattern.replace(/<index:0(\d)d>/, (_m, w: string) => String(t).padStart(Number(w), "0"));
        const img = decodeIndexedPng(outputBytes(src, `textures/${name}`), (z) => src.inflate(z));
        images.push({ width: img.width, height: img.height, pixels: img.pixels });
    }
    return rendAssetsFrom(palDoc, images, C);
}

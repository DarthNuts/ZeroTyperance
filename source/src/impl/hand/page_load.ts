import { decodeIndexedPng } from "../boot/png.js";
import type { IndexedImage } from "../boot/png.js";
import { outputBytes, outputJson } from "../release/pack_source.js";
import type { PackSource } from "../release/pack_source.js";
import { handConstantsFrom } from "./constants.js";
import type { HandConstants } from "./constants.js";
import { handAssetsFrom } from "./assets.js";
import type { HandAssets } from "./types.js";
export interface HandEnvironmentFrom {
    readonly C: HandConstants;
    readonly dataDoc: unknown;
}
export function loadHandEnvironmentFrom(src: PackSource): HandEnvironmentFrom {
    const dataDoc = src.data("weapon");
    return Object.freeze({ C: handConstantsFrom(dataDoc), dataDoc });
}
export function loadHandAssetsFrom(src: PackSource, C: HandConstants): HandAssets {
    const docPath = "weapons/weapons.json";
    const doc = outputJson(src, docPath) as {
        entries?: Array<{
            name?: unknown;
            png?: unknown;
        }>;
    };
    const sheets = new Map<string, IndexedImage>();
    for (const e of doc.entries ?? []) {
        if (typeof e.name !== "string" || typeof e.png !== "string")
            throw new Error(`${docPath}: an entry without name / png`);
        sheets.set(e.name, decodeIndexedPng(outputBytes(src, `weapons/${e.png}`), (z) => src.inflate(z)));
    }
    return handAssetsFrom(doc, sheets, C);
}

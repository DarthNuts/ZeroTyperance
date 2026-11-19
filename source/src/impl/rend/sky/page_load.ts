import { skyConstantsFrom } from "./constants.js";
import type { SkyConstants } from "./constants.js";
import { skyAssetsFrom } from "./assets.js";
import type { SkyExtras, SkyAssetsDoc } from "./assets.js";
import { decodeIndexedPng } from "../../boot/png.js";
import { TILE_BYTES, TILE_SIZE, tileFromImage } from "../../hud/words.js";
import type { SkyAssets } from "./core.js";
import { outputBytes, outputJson } from "../../release/pack_source.js";
import type { PackSource } from "../../release/pack_source.js";
export interface SkyEnvironmentFrom {
    readonly C: SkyConstants;
    readonly dataDoc: unknown;
}
export function loadSkyEnvironmentFrom(src: PackSource): SkyEnvironmentFrom {
    const dataDoc = src.data("rend_sky");
    return Object.freeze({ C: skyConstantsFrom(dataDoc), dataDoc });
}
const CITY_CLASS = "city";
const CITY_BANK_PNG = "hud/bank_16da58.png";
const CITY_BANK_TILES = 48;
export function loadSkyAssetsFrom(src: PackSource, className: string, C: SkyConstants): SkyAssets & {
    readonly doc: SkyAssetsDoc;
} {
    const doc = outputJson(src, `sky/${className}.json`);
    const bin = outputBytes(src, `sky/${className}_tiles.bin`);
    return skyAssetsFrom(doc, new Uint8Array(bin), C, className === CITY_CLASS ? loadCityExtrasFrom(src) : {});
}
export function loadCityExtrasFrom(src: PackSource): SkyExtras {
    const img = decodeIndexedPng(outputBytes(src, CITY_BANK_PNG), (z) => src.inflate(z));
    const cols = Math.floor(img.width / TILE_SIZE);
    const rows = Math.floor(img.height / TILE_SIZE);
    if (cols * rows < CITY_BANK_TILES)
        throw new Error(`${CITY_BANK_PNG}: ${img.width} x ${img.height} px holds ${cols * rows} tiles, ${CITY_BANK_TILES} needed`);
    const bank = new Uint8Array(CITY_BANK_TILES * TILE_BYTES);
    for (let t = 0; t < CITY_BANK_TILES; t++)
        bank.set(tileFromImage(img.pixels, img.width, (t % cols) * TILE_SIZE, Math.floor(t / cols) * TILE_SIZE), t * TILE_BYTES);
    return {
        cityBankTiles: bank,
        twinkleFrames: new Uint8Array(outputBytes(src, "sky/deferred/twinkle_frames.bin")),
        twinklePattern: new Uint8Array(outputBytes(src, "sky/deferred/twinkle_pattern.bin")),
    };
}

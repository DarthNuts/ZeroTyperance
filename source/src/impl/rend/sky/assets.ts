import { base64ToBytes, bytesToBase64 } from "../assets.js";
import type { SkyAssets } from "./core.js";
import type { SkyConstants } from "./constants.js";
export const SKY_EXTRACT_FORMAT = "ztassets-sky/1";
export const SKY_ASSETS_DOC_FORMAT = "zt-sky-assets/1";
export interface SkyAssetsDoc {
    readonly format: typeof SKY_ASSETS_DOC_FORMAT;
    readonly class: string;
    readonly tile_base: number;
    readonly tile_count: number;
    readonly map: readonly (readonly number[])[];
    readonly tiles_b64: string;
    readonly palette_line: readonly number[];
    readonly city_bank_b64?: string;
    readonly twinkle_frames_b64?: string;
    readonly twinkle_pattern_b64?: string;
}
export interface SkyExtras {
    readonly cityBankTiles?: Uint8Array;
    readonly twinkleFrames?: Uint8Array;
    readonly twinklePattern?: Uint8Array;
}
interface ExtractDoc {
    format?: unknown;
    class?: unknown;
    map?: {
        columns?: unknown;
        rows?: unknown;
        words?: unknown;
    };
    tiles?: {
        count?: unknown;
        vram_tile_slot?: unknown;
        bytes?: unknown;
    };
    palette_line?: {
        normal?: {
            words?: unknown;
        };
    };
}
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
export function skyAssetsFrom(doc: unknown, tiles: Uint8Array, C: SkyConstants, extras: SkyExtras = {}): SkyAssets & {
    readonly doc: SkyAssetsDoc;
} {
    const d = doc as ExtractDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("sky: the class document is not an object");
    if (d.format !== SKY_EXTRACT_FORMAT)
        throw new Error(`sky: format ${String(d.format)}, expected ${SKY_EXTRACT_FORMAT}`);
    if (typeof d.class !== "string")
        throw new Error("sky: no class name");
    const words = d.map?.words;
    if (d.map?.columns !== C.PANORAMA_COLUMNS || d.map?.rows !== C.PANORAMA_ROWS)
        throw new Error(`sky ${d.class}: the map is ${String(d.map?.columns)} x ${String(d.map?.rows)}, the spec says ${C.PANORAMA_COLUMNS} x ${C.PANORAMA_ROWS}`);
    if (!Array.isArray(words) || words.length !== C.PANORAMA_ROWS || !words.every((r: unknown) => Array.isArray(r) && r.length === C.PANORAMA_COLUMNS && r.every(isInt))) {
        throw new Error(`sky ${d.class}: map.words is not ${C.PANORAMA_ROWS} rows of ${C.PANORAMA_COLUMNS} integers`);
    }
    const tileBase = d.tiles?.vram_tile_slot;
    const tileCount = d.tiles?.count;
    if (!isInt(tileBase) || !isInt(tileCount) || tileCount <= 0)
        throw new Error(`sky ${d.class}: tiles.vram_tile_slot or tiles.count missing`);
    const tileBytes = (C.CELL / 2) * C.CELL;
    if (tiles.length !== tileCount * tileBytes)
        throw new Error(`sky ${d.class}: the tile file holds ${tiles.length} bytes, ${tileCount} tiles need ${tileCount * tileBytes}`);
    const line = d.palette_line?.normal?.words;
    if (!Array.isArray(line) || !line.every(isInt))
        throw new Error(`sky ${d.class}: palette_line.normal.words missing`);
    const map = new Uint16Array(C.PANORAMA_ROWS * C.PANORAMA_COLUMNS);
    const rows = words as number[][];
    for (let r = 0; r < C.PANORAMA_ROWS; r++) {
        for (let q = 0; q < C.PANORAMA_COLUMNS; q++) {
            const w = rows[r]![q]!;
            if (w < 0 || w > 0xffff)
                throw new Error(`sky ${d.class}: map word ${w} at row ${r} column ${q} is not a 16-bit word`);
            map[r * C.PANORAMA_COLUMNS + q] = w;
        }
    }
    const out: SkyAssetsDoc = {
        format: SKY_ASSETS_DOC_FORMAT,
        class: d.class,
        tile_base: tileBase,
        tile_count: tileCount,
        map: rows.map((r) => [...r]),
        tiles_b64: bytesToBase64(tiles),
        palette_line: [...(line as number[])],
        ...(extras.cityBankTiles ? { city_bank_b64: bytesToBase64(extras.cityBankTiles) } : {}),
        ...(extras.twinkleFrames ? { twinkle_frames_b64: bytesToBase64(extras.twinkleFrames) } : {}),
        ...(extras.twinklePattern ? { twinkle_pattern_b64: bytesToBase64(extras.twinklePattern) } : {}),
    };
    return Object.freeze({ class: d.class, map, tiles, tileBase, tileCount, paletteLine: out.palette_line, ...extras, doc: out });
}
export function skyAssetsFromDoc(doc: SkyAssetsDoc, C: SkyConstants): SkyAssets {
    if (doc.format !== SKY_ASSETS_DOC_FORMAT)
        throw new Error(`sky assets: format ${String(doc.format)}, expected ${SKY_ASSETS_DOC_FORMAT}`);
    const map = new Uint16Array(C.PANORAMA_ROWS * C.PANORAMA_COLUMNS);
    if (doc.map.length !== C.PANORAMA_ROWS)
        throw new Error(`sky assets: ${doc.map.length} map rows`);
    for (let r = 0; r < C.PANORAMA_ROWS; r++) {
        const row = doc.map[r]!;
        if (row.length !== C.PANORAMA_COLUMNS)
            throw new Error(`sky assets: map row ${r} has ${row.length} words`);
        for (let q = 0; q < C.PANORAMA_COLUMNS; q++)
            map[r * C.PANORAMA_COLUMNS + q] = row[q]!;
    }
    return Object.freeze({ class: doc.class, map, tiles: base64ToBytes(doc.tiles_b64), tileBase: doc.tile_base, tileCount: doc.tile_count, paletteLine: doc.palette_line,
        ...(doc.city_bank_b64 ? { cityBankTiles: base64ToBytes(doc.city_bank_b64) } : {}),
        ...(doc.twinkle_frames_b64 ? { twinkleFrames: base64ToBytes(doc.twinkle_frames_b64) } : {}),
        ...(doc.twinkle_pattern_b64 ? { twinklePattern: base64ToBytes(doc.twinkle_pattern_b64) } : {}),
    });
}

import { TILE_BYTES } from "./words.js";
export const HUD_ASSETS_FORMAT = "zt-hud-assets/1";
export interface HudCardArtDoc {
    readonly character: number;
    readonly nameTable: ReadonlyArray<readonly number[]>;
    readonly tiles: string;
}
export interface HudAssetsDoc {
    readonly format: typeof HUD_ASSETS_FORMAT;
    readonly frameNameTable: ReadonlyArray<readonly number[]>;
    readonly frameTiles: string;
    readonly idCards: readonly HudCardArtDoc[];
    readonly scannerTiles: string;
    readonly cardArt: readonly string[];
    readonly ammoDigits: ReadonlyArray<readonly number[]>;
    readonly fontTiles: string;
    readonly fontFirstTile: number;
    readonly solidTile: number;
    readonly healthDigitTiles: string;
    readonly paletteLine: readonly number[];
    readonly classDisplayTable: readonly number[];
    readonly sniperBankTiles?: string;
}
export interface HudCardArt {
    readonly character: number;
    readonly nameTable: ReadonlyArray<readonly number[]>;
    readonly tiles: Uint8Array;
}
export interface HudAssets {
    readonly doc: HudAssetsDoc;
    readonly frameNameTable: ReadonlyArray<readonly number[]>;
    readonly frameTiles: Uint8Array;
    readonly idCards: readonly HudCardArt[];
    readonly scannerTiles: Uint8Array;
    readonly cardArt: readonly Uint8Array[];
    readonly ammoDigits: ReadonlyArray<readonly number[]>;
    readonly fontTiles: Uint8Array;
    readonly fontFirstTile: number;
    readonly solidTile: number;
    readonly healthDigitTiles: Uint8Array;
    readonly paletteLine: readonly number[];
    readonly classDisplayTable: readonly number[];
    readonly sniperBankTiles: Uint8Array;
}
export function bytesToHex(b: Uint8Array): string {
    let s = "";
    for (let i = 0; i < b.length; i++)
        s += b[i]!.toString(16).padStart(2, "0");
    return s;
}
export function hexToBytes(hex: string, what: string): Uint8Array {
    if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex))
        throw new Error(`${what}: not a hex string`);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++)
        out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
    return out;
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
function intRows(v: unknown, what: string): ReadonlyArray<readonly number[]> {
    if (!Array.isArray(v) || !v.every((r) => Array.isArray(r) && r.every(isInt)))
        throw new Error(`${what}: not rows of integers`);
    return v as number[][];
}
function tiles(hex: unknown, what: string, count: number | null): Uint8Array {
    const b = hexToBytes(hex as string, what);
    if (b.length % TILE_BYTES !== 0)
        throw new Error(`${what}: ${b.length} bytes is not whole tiles`);
    if (count !== null && b.length !== count * TILE_BYTES)
        throw new Error(`${what}: ${b.length / TILE_BYTES} tiles, expected ${count}`);
    return b;
}
export function hudAssetsFrom(doc: unknown): HudAssets {
    const d = doc as HudAssetsDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("hud assets: not an object");
    if (d.format !== HUD_ASSETS_FORMAT)
        throw new Error(`hud assets: format ${String(d.format)}, expected ${HUD_ASSETS_FORMAT}`);
    if (!Array.isArray(d.idCards))
        throw new Error("hud assets: idCards is not a list");
    if (!Array.isArray(d.cardArt))
        throw new Error("hud assets: cardArt is not a list");
    if (!Array.isArray(d.paletteLine) || !d.paletteLine.every(isInt))
        throw new Error("hud assets: paletteLine is not a list of integers");
    if (!Array.isArray(d.classDisplayTable) || !d.classDisplayTable.every(isInt))
        throw new Error("hud assets: classDisplayTable is not a list of integers");
    if (!isInt(d.fontFirstTile) || !isInt(d.solidTile))
        throw new Error("hud assets: fontFirstTile / solidTile are not integers");
    return Object.freeze({
        doc: d,
        frameNameTable: intRows(d.frameNameTable, "hud assets: frameNameTable"),
        frameTiles: tiles(d.frameTiles, "hud assets: frameTiles", null),
        idCards: d.idCards.map((c, i) => {
            if (!isInt(c.character))
                throw new Error(`hud assets: idCards[${i}].character is not an integer`);
            return Object.freeze({ character: c.character, nameTable: intRows(c.nameTable, `hud assets: idCards[${i}].nameTable`), tiles: tiles(c.tiles, `hud assets: idCards[${i}].tiles`, null) });
        }),
        scannerTiles: tiles(d.scannerTiles, "hud assets: scannerTiles", null),
        cardArt: d.cardArt.map((h, i) => hexToBytes(h, `hud assets: cardArt[${i}]`)),
        ammoDigits: intRows(d.ammoDigits, "hud assets: ammoDigits"),
        fontTiles: tiles(d.fontTiles, "hud assets: fontTiles", null),
        fontFirstTile: d.fontFirstTile,
        solidTile: d.solidTile,
        healthDigitTiles: tiles(d.healthDigitTiles, "hud assets: healthDigitTiles", null),
        paletteLine: d.paletteLine,
        classDisplayTable: d.classDisplayTable,
        sniperBankTiles: d.sniperBankTiles === undefined ? new Uint8Array(0) : tiles(d.sniperBankTiles, "hud assets: sniperBankTiles", null),
    });
}

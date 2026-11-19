import { decodeIndexedPng } from "../boot/png.js";
import type { IndexedImage } from "../boot/png.js";
import { outputBytes } from "../release/pack_source.js";
import type { PackSource } from "../release/pack_source.js";
import { hudConstantsFrom } from "./constants.js";
import type { HudConstants } from "./constants.js";
import { HUD_ASSETS_FORMAT, bytesToHex } from "./assets.js";
import type { HudAssetsDoc, HudCardArtDoc } from "./assets.js";
import { NIBBLE_BITS, TILE_BYTES, TILE_SIZE, tileFromImage } from "./words.js";
export interface HudEnvironmentFrom {
    readonly C: HudConstants;
    readonly dataDoc: unknown;
}
export function loadHudEnvironmentFrom(src: PackSource): HudEnvironmentFrom {
    const dataDoc = src.data("hud");
    return Object.freeze({ C: hudConstantsFrom(dataDoc), dataDoc });
}
const HUD_FORMAT = "ztassets-hud/1";
interface HudJson {
    format?: unknown;
    cards?: Array<{
        item_id?: unknown;
        png?: unknown;
    }>;
    palette?: {
        cram_words?: unknown;
    };
    cockpit?: {
        frame?: {
            name_table?: unknown;
        };
        id_card?: {
            cards?: Array<{
                character?: unknown;
                name_table?: unknown;
                tiles?: unknown;
                tiles_png?: unknown;
            }>;
        };
        font?: {
            bank?: unknown;
            first_tile?: unknown;
            solid_tile?: unknown;
        };
        health?: {
            digit_bank?: unknown;
        };
        scanner?: {
            class_display_table?: {
                values?: unknown;
            };
        };
    };
    entries?: Array<{
        name?: unknown;
        png?: unknown;
        tiles?: unknown;
    }>;
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
function png(src: PackSource, path: string): IndexedImage {
    if (src.bytes(path) === null)
        throw new Error(`${path}: not found; the status display needs the extractor's hud, fonts, tiles and maps outputs`);
    return decodeIndexedPng(outputBytes(src, path), (z) => src.inflate(z));
}
function sheetTiles(img: IndexedImage, count: number, what: string): Uint8Array {
    const cols = Math.floor(img.width / TILE_SIZE);
    const rows = Math.floor(img.height / TILE_SIZE);
    if (cols * rows < count)
        throw new Error(`${what}: ${img.width} x ${img.height} px holds ${cols * rows} tiles, ${count} needed`);
    const out = new Uint8Array(count * TILE_BYTES);
    for (let t = 0; t < count; t++)
        out.set(tileFromImage(img.pixels, img.width, (t % cols) * TILE_SIZE, Math.floor(t / cols) * TILE_SIZE), t * TILE_BYTES);
    return out;
}
function spriteTiles(img: IndexedImage, w: number, h: number, what: string): Uint8Array {
    if (img.width !== w * TILE_SIZE || img.height !== h * TILE_SIZE)
        throw new Error(`${what}: ${img.width} x ${img.height} px, expected ${w * TILE_SIZE} x ${h * TILE_SIZE}`);
    const out = new Uint8Array(w * h * TILE_BYTES);
    for (let n = 0; n < w * h; n++)
        out.set(tileFromImage(img.pixels, img.width, Math.floor(n / h) * TILE_SIZE, (n % h) * TILE_SIZE), n * TILE_BYTES);
    return out;
}
function wordRows(v: unknown, what: string): number[][] {
    if (!Array.isArray(v) || !v.every((r) => typeof r === "string"))
        throw new Error(`${what}: not rows of hex words`);
    return (v as string[]).map((row) => row
        .trim()
        .split(/\s+/)
        .map((w) => {
        if (!/^[0-9A-Fa-f]{1,4}$/.test(w))
            throw new Error(`${what}: ${JSON.stringify(w)} is not a hex word`);
        return parseInt(w, 16);
    }));
}
function ammoGlyphs(img: IndexedImage, C: HudConstants): number[][] {
    const glyphW = img.width / C.CARD.DIGIT_RADIX;
    if (!Number.isInteger(glyphW) || img.height !== C.CARD.DIGIT_ROWS)
        throw new Error(`ammo_digits.png: ${img.width} x ${img.height} px is not ${C.CARD.DIGIT_RADIX} glyphs of ${C.CARD.DIGIT_ROWS} rows`);
    const out: number[][] = [];
    for (let d = 0; d < C.CARD.DIGIT_RADIX; d++) {
        const rows: number[] = [];
        for (let r = 0; r < C.CARD.DIGIT_ROWS; r++) {
            let w = 0;
            for (let x = 0; x < glyphW; x++)
                w = (w << NIBBLE_BITS) | (img.pixels[r * img.width + d * glyphW + x]! & ((1 << NIBBLE_BITS) - 1));
            rows.push(w);
        }
        out.push(rows);
    }
    return out;
}
export function loadHudAssetsDocFrom(src: PackSource, C: HudConstants): HudAssetsDoc {
    const hudJsonPath = "hud/hud.json";
    const text = src.text(hudJsonPath);
    if (text === null)
        throw new Error(`${hudJsonPath}: not found; the status display needs the extractor's hud, fonts, tiles and maps outputs`);
    const doc = JSON.parse(text) as HudJson;
    if (doc.format !== HUD_FORMAT)
        throw new Error(`hud.json: format ${String(doc.format)}, expected ${HUD_FORMAT}`);
    const ck = doc.cockpit;
    if (!ck)
        throw new Error("hud.json has no cockpit member: re-run the extractor's hud command");
    const frameEntry = doc.entries?.find((e) => e.name === "frame");
    const minimapEntry = doc.entries?.find((e) => e.name === "minimap");
    if (!frameEntry || !isInt(frameEntry.tiles) || typeof frameEntry.png !== "string")
        throw new Error("hud.json: no frame entry with tiles and png");
    if (!minimapEntry || !isInt(minimapEntry.tiles) || typeof minimapEntry.png !== "string")
        throw new Error("hud.json: no minimap entry with tiles and png");
    const sniperEntry = doc.entries?.find((e) => e.name === "bank_16e058");
    const frameTiles = sheetTiles(png(src, `hud/${frameEntry.png}`), frameEntry.tiles, "frame.png");
    const scannerTiles = sheetTiles(png(src, `hud/${minimapEntry.png}`), minimapEntry.tiles, "minimap.png");
    const idCards: HudCardArtDoc[] = (ck.id_card?.cards ?? []).map((c, i) => {
        if (!isInt(c.character) || !isInt(c.tiles) || typeof c.tiles_png !== "string")
            throw new Error(`hud.json: cockpit.id_card.cards[${i}] lacks character / tiles / tiles_png`);
        const img = png(src, c.tiles_png);
        return { character: c.character, nameTable: wordRows(c.name_table, `cockpit.id_card.cards[${i}].name_table`), tiles: bytesToHex(sheetTiles(img, c.tiles, c.tiles_png)) };
    });
    if (!Array.isArray(doc.cards) || doc.cards.length === 0)
        throw new Error("hud.json: no cards list");
    const cardArt: string[] = [];
    for (const c of doc.cards) {
        if (!isInt(c.item_id) || typeof c.png !== "string")
            throw new Error("hud.json: a card without item_id / png");
        cardArt[c.item_id - 1] = bytesToHex(spriteTiles(png(src, `hud/${c.png}`), C.CARD.W, C.CARD.H, c.png));
    }
    for (let i = 0; i < cardArt.length; i++)
        if (cardArt[i] === undefined)
            throw new Error(`hud.json: no card of item ${i + 1}`);
    const fontBank = ck.font?.bank;
    const digitBank = ck.health?.digit_bank;
    if (typeof fontBank !== "string" || !isInt(ck.font?.first_tile) || !isInt(ck.font?.solid_tile))
        throw new Error("hud.json: cockpit.font lacks bank / first_tile / solid_tile");
    if (typeof digitBank !== "string")
        throw new Error("hud.json: cockpit.health lacks digit_bank");
    const fontImg = png(src, fontBank);
    const digitImg = png(src, digitBank);
    const words = doc.palette?.cram_words;
    if (!Array.isArray(words) || !words.every((w) => typeof w === "string" && /^0x[0-9A-Fa-f]+$/.test(w)))
        throw new Error("hud.json: palette.cram_words is not a list of hex words");
    const table = ck.scanner?.class_display_table?.values;
    if (!Array.isArray(table) || !table.every(isInt))
        throw new Error("hud.json: cockpit.scanner.class_display_table.values is not a list of integers");
    return {
        format: HUD_ASSETS_FORMAT,
        frameNameTable: wordRows(ck.frame?.name_table, "cockpit.frame.name_table"),
        frameTiles: bytesToHex(frameTiles),
        idCards,
        scannerTiles: bytesToHex(scannerTiles),
        cardArt,
        ammoDigits: ammoGlyphs(png(src, "hud/ammo_digits.png"), C),
        fontTiles: bytesToHex(sheetTiles(fontImg, Math.floor(fontImg.width / TILE_SIZE) * Math.floor(fontImg.height / TILE_SIZE), fontBank)),
        fontFirstTile: ck.font.first_tile,
        solidTile: ck.font.solid_tile,
        healthDigitTiles: bytesToHex(sheetTiles(digitImg, Math.floor(digitImg.width / TILE_SIZE) * Math.floor(digitImg.height / TILE_SIZE), digitBank)),
        paletteLine: (words as string[]).map((w) => parseInt(w, 16)),
        classDisplayTable: table as number[],
        ...(sniperEntry && isInt(sniperEntry.tiles) && typeof sniperEntry.png === "string"
            ? { sniperBankTiles: bytesToHex(sheetTiles(png(src, `hud/${sniperEntry.png}`), sniperEntry.tiles, sniperEntry.png)) }
            : {}),
    };
}

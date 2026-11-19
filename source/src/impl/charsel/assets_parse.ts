import type { TileBlock } from "../boot/assets.js";
import { base64Decode, base64Encode, bytesToU16, hexWord, isObj, need, needArr, needInt, needObj, needStr, u16ToBytes } from "../boot/assets_parse.js";
import type { Glyph, TextFont } from "../options/assets.js";
import type { CharCard, CharselAssets, CharselOverlay, TileList } from "./assets.js";
export const CHARSEL_ASSETS_SERIAL_FORMAT = "zt-charsel-assets/1";
const SCREENS_FORMAT = "ztassets-screens/1";
const STRINGS_FORMAT = "ztassets-strings/1";
const FONTS_FORMAT = "ztassets-fonts/1";
const LAYOUT_KIND = "charsel_layout";
const LINE_WORDS = 16;
const LINE_COUNT = 4;
const TILE_BYTES = 32;
const FIELD_COUNT = 6;
const FIELD_CHARS = 17;
const LINE_COUNT_TEXT = 6;
const LINE_CHARS = 34;
export const DOSSIER_BYTES = FIELD_COUNT * (FIELD_CHARS + 1) + LINE_COUNT_TEXT * (LINE_CHARS + 1);
export const CARD_COUNT = 5;
function wordRows(rows: unknown[], cols: number, nrows: number, where: string): Uint16Array {
    if (rows.length !== nrows)
        throw new Error(`${where}: ${rows.length} rows, expected ${nrows}`);
    const out = new Uint16Array(cols * nrows);
    for (let r = 0; r < nrows; r++) {
        const row = rows[r];
        if (typeof row !== "string")
            throw new Error(`${where}: row ${r} is not a string`);
        const words = row.trim().split(/\s+/);
        if (words.length !== cols)
            throw new Error(`${where}: row ${r} has ${words.length} words, expected ${cols}`);
        for (let c = 0; c < cols; c++) {
            if (!/^[0-9A-Fa-f]{4}$/.test(words[c]!))
                throw new Error(`${where}: row ${r} word ${c} is ${JSON.stringify(words[c])}, expected 4 hex digits`);
            out[r * cols + c] = parseInt(words[c]!, 16);
        }
    }
    return out;
}
function checkScreenHeader(doc: unknown, where: string): void {
    const format = needStr(doc, "format", where);
    if (format !== SCREENS_FORMAT)
        throw new Error(`${where}: format ${format}, expected ${SCREENS_FORMAT}`);
    const kind = needStr(doc, "kind", where);
    if (kind !== "name_table")
        throw new Error(`${where}: kind ${kind}, expected name_table`);
}
function screenName(doc: unknown): string {
    return isObj(doc) && typeof doc.name === "string" ? doc.name : "?";
}
export function blockSlot(tilesDoc: unknown, name: string): number {
    const where = "tiles";
    const b = needArr(tilesDoc, "blocks", where).find((x) => isObj(x) && x.name === name);
    if (b === undefined)
        throw new Error(`${where}: no block named ${name}`);
    const v = need(b, "vram_tile_slot", `${where} block ${name}`);
    if (typeof v !== "number" || !Number.isInteger(v))
        throw new Error(`${where}: block ${name} has vram_tile_slot ${JSON.stringify(v)}, expected an integer`);
    return v;
}
export function blockHasNoSlot(tilesDoc: unknown, name: string): void {
    const b = needArr(tilesDoc, "blocks", "tiles").find((x) => isObj(x) && x.name === name);
    if (b === undefined)
        throw new Error(`tiles: no block named ${name}`);
    const v = isObj(b) ? b.vram_tile_slot : undefined;
    if (v !== null && v !== undefined)
        throw new Error(`tiles: block ${name} has vram_tile_slot ${JSON.stringify(v)}, expected null`);
}
export function parseCharCard(doc: unknown, tiles: TileBlock, firstSlot: number): CharCard {
    const where = `screen ${screenName(doc)}`;
    checkScreenHeader(doc, where);
    const name = needStr(doc, "name", where);
    const geo = needObj(doc, "geometry", where);
    const cols = needInt(geo, "cell_columns", `${where} geometry`);
    const rows = needInt(geo, "cell_rows", `${where} geometry`);
    const entries = wordRows(needArr(needObj(doc, "name_table", where), "entry_rows", `${where} name_table`), cols, rows, `${where} entry_rows`);
    const oc = needArr(needObj(doc, "plane", where), "origin_cell", `${where} plane`);
    if (oc.length !== 2 || oc.some((v) => typeof v !== "number" || !Number.isInteger(v)))
        throw new Error(`${where}: plane.origin_cell is not two integers`);
    const lines = needObj(needObj(doc, "palette", where), "lines", `${where} palette`);
    const paletteLines: number[][] = [];
    for (let l = 0; l < LINE_COUNT; l++) {
        const words = needArr(lines[String(l)], "cram_words", `${where} palette line ${l}`);
        if (words.length !== LINE_WORDS)
            throw new Error(`${where}: palette line ${l} has ${words.length} words, expected ${LINE_WORDS}`);
        paletteLines.push(words.map((w, i) => hexWord(w, `${where} palette line ${l} word ${i}`)));
    }
    const srcs = needArr(doc, "tile_sources", where);
    if (srcs.length < 1)
        throw new Error(`${where}: empty tile_sources`);
    const block = needStr(srcs[0], "block", `${where} tile_sources[0]`);
    if (block !== tiles.name)
        throw new Error(`${where}: tile_sources[0].block is ${block}, the tile block is ${tiles.name}`);
    const n = needInt(srcs[0], "tiles", `${where} tile_sources[0]`);
    if (n !== tiles.count)
        throw new Error(`${where}: tile_sources[0].tiles is ${n}, the tile block holds ${tiles.count}`);
    const first = needInt(srcs[0], "first_slot", `${where} tile_sources[0]`);
    if (first !== firstSlot)
        throw new Error(`${where}: tile_sources[0].first_slot is ${first}, tiles.json vram_tile_slot is ${firstSlot}`);
    return { name, cols, rows, entries, origin: [oc[0] as number, oc[1] as number], paletteLines, tiles, firstSlot };
}
export function parseOverlay(doc: unknown): CharselOverlay {
    const where = `screen ${screenName(doc)}`;
    checkScreenHeader(doc, where);
    const geo = needObj(doc, "geometry", where);
    const cols = needInt(geo, "cell_columns", `${where} geometry`);
    const rows = needInt(geo, "cell_rows", `${where} geometry`);
    const entries = wordRows(needArr(needObj(doc, "name_table", where), "entry_rows", `${where} name_table`), cols, rows, `${where} entry_rows`);
    return { cols, rows, entries };
}
export function parseLayout(doc: unknown, poolBlock: string, poolCount: number): {
    tileLists: TileList[];
    separator: string;
} {
    const where = "charsel layout";
    const format = needStr(doc, "format", where);
    if (format !== SCREENS_FORMAT)
        throw new Error(`${where}: format ${format}, expected ${SCREENS_FORMAT}`);
    const kind = needStr(doc, "kind", where);
    if (kind !== LAYOUT_KIND)
        throw new Error(`${where}: kind ${kind}, expected ${LAYOUT_KIND}`);
    const tileLists = needArr(doc, "tile_lists", where).map((l, i): TileList => {
        const w = `${where} tile_lists[${i}]`;
        const pool = needStr(l, "pool_block", w);
        if (pool !== poolBlock)
            throw new Error(`${w}: pool_block is ${pool}, expected ${poolBlock}`);
        const entries = needArr(l, "entries", w);
        entries.forEach((v, k) => {
            if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= poolCount)
                throw new Error(`${w}: entries[${k}] ${JSON.stringify(v)} is not an index below the pool's ${poolCount} tiles`);
        });
        const tiles = needInt(l, "tiles", w);
        if (tiles !== entries.length)
            throw new Error(`${w}: tiles ${tiles}, entries ${entries.length}`);
        return { firstSlot: needInt(l, "first_slot", w), entries: entries as number[] };
    });
    if (tileLists.length === 0)
        throw new Error(`${where}: no tile_lists`);
    const sep = needObj(doc, "separator_text", where);
    const text = needStr(sep, "text", `${where} separator_text`);
    const length = needInt(sep, "length", `${where} separator_text`);
    if (text.length !== length)
        throw new Error(`${where}: separator_text.length ${length}, the text has ${text.length} characters`);
    return { tileLists, separator: text };
}
export function parseDossiers(doc: unknown): Uint8Array[] {
    const where = "strings character_cards";
    const format = needStr(doc, "format", where);
    if (format !== STRINGS_FORMAT)
        throw new Error(`${where}: format ${format}, expected ${STRINGS_FORMAT}`);
    const out: (Uint8Array | undefined)[] = new Array(CARD_COUNT).fill(undefined);
    const entries = needArr(doc, "entries", where);
    if (entries.length !== CARD_COUNT)
        throw new Error(`${where}: ${entries.length} entries, expected ${CARD_COUNT}`);
    entries.forEach((e, i) => {
        const w = `${where} entries[${i}]`;
        const slot = needInt(needObj(e, "meta", w), "slot", `${w} meta`);
        if (slot < 0 || slot >= CARD_COUNT)
            throw new Error(`${w}: meta.slot ${slot} is not 0..${CARD_COUNT - 1}`);
        if (out[slot] !== undefined)
            throw new Error(`${where}: meta.slot ${slot} appears twice`);
        const hex = needStr(e, "raw_hex", w);
        if (!/^([0-9A-Fa-f]{2})*$/.test(hex))
            throw new Error(`${w}: raw_hex is not an even run of hex digits`);
        const bytes = new Uint8Array(hex.length / 2);
        for (let b = 0; b < bytes.length; b++)
            bytes[b] = parseInt(hex.slice(2 * b, 2 * b + 2), 16);
        if (bytes.length !== DOSSIER_BYTES)
            throw new Error(`${w}: ${bytes.length} bytes, the record is ${DOSSIER_BYTES}`);
        out[slot] = bytes;
    });
    return out as Uint8Array[];
}
export function dossierTexts(rec: Uint8Array): string[] {
    const out: string[] = [];
    let at = 0;
    const take = (n: number): void => {
        let s = "";
        for (let i = 0; i < n; i++)
            s += String.fromCharCode(rec[at + i]!);
        if (rec[at + n] !== 0)
            throw new Error(`dossier record: no NUL after the ${n} characters at byte ${at}`);
        out.push(s);
        at += n + 1;
    };
    for (let i = 0; i < FIELD_COUNT; i++)
        take(FIELD_CHARS);
    for (let i = 0; i < LINE_COUNT_TEXT; i++)
        take(LINE_CHARS);
    return out;
}
export function parseFontSource(doc: unknown, name: string): {
    slot: number;
    flags: number;
} {
    const where = `font ${name}`;
    const format = needStr(doc, "format", "fonts");
    if (format !== FONTS_FORMAT)
        throw new Error(`fonts: format ${format}, expected ${FONTS_FORMAT}`);
    const entry = needArr(doc, "entries", "fonts").find((e) => isObj(e) && e.name === name);
    if (entry === undefined)
        throw new Error(`fonts: no font entry named ${name}`);
    const srcs = needArr(entry, "glyph_sources", where);
    if (srcs.length < 1)
        throw new Error(`${where}: empty glyph_sources`);
    return {
        slot: needInt(srcs[0], "first_tile_number", `${where} glyph_sources[0]`),
        flags: hexWord(need(srcs[0], "flags", `${where} glyph_sources[0]`), `${where} glyph_sources[0] flags`),
    };
}
export function checkGlyphs(dossiers: readonly Uint8Array[], separator: string, font: TextFont, path: string): void {
    const miss = (ch: string, what: string): Error => new Error(`${path}: ${what} has the character ${JSON.stringify(ch)}, which has no glyph in font ${font.name}`);
    dossiers.forEach((rec, k) => {
        for (const s of dossierTexts(rec)) {
            for (const ch of s)
                if (!font.glyphs.has(ch))
                    throw miss(ch, `dossier ${k}`);
        }
    });
    for (const ch of separator)
        if (!font.glyphs.has(ch))
            throw miss(ch, "the separator");
}
function serBlock(b: TileBlock): unknown {
    return { name: b.name, count: b.count, patterns: base64Encode(b.patterns) };
}
function desBlock(x: unknown, where: string): TileBlock {
    const name = needStr(x, "name", where);
    const count = needInt(x, "count", where);
    const patterns = base64Decode(needStr(x, "patterns", where));
    if (patterns.length !== count * TILE_BYTES)
        throw new Error(`${where}: ${patterns.length} pattern bytes for ${count} tiles`);
    return { name, count, patterns };
}
function intList(x: unknown, n: number | null, where: string): number[] {
    if (!Array.isArray(x) || (n !== null && x.length !== n) || x.some((v) => typeof v !== "number" || !Number.isInteger(v))) {
        throw new Error(`${where}: not a list of ${n === null ? "" : n + " "}integers`);
    }
    return x as number[];
}
function words(x: unknown, count: number, where: string): Uint16Array {
    const w = bytesToU16(base64Decode(typeof x === "string" ? x : ""));
    if (w.length !== count)
        throw new Error(`${where}: ${w.length} words, expected ${count}`);
    return w;
}
export function serializeCharselAssets(a: CharselAssets): unknown {
    const glyphs: Record<string, {
        upper: number | null;
        lower: number | null;
    }> = {};
    for (const [ch, g] of a.font.glyphs)
        glyphs[ch] = { upper: g.upper, lower: g.lower };
    return {
        format: CHARSEL_ASSETS_SERIAL_FORMAT,
        cards: a.cards.map((c) => ({
            name: c.name,
            cols: c.cols,
            rows: c.rows,
            entries: base64Encode(u16ToBytes(c.entries)),
            origin: [c.origin[0], c.origin[1]],
            paletteLines: c.paletteLines.map((l) => [...l]),
            tiles: serBlock(c.tiles),
            firstSlot: c.firstSlot,
        })),
        overlay: { cols: a.overlay.cols, rows: a.overlay.rows, entries: base64Encode(u16ToBytes(a.overlay.entries)) },
        bank: serBlock(a.bank),
        bankSlot: a.bankSlot,
        tile: serBlock(a.tile),
        tileSlot: a.tileSlot,
        pool: serBlock(a.pool),
        tileLists: a.tileLists.map((l) => ({ firstSlot: l.firstSlot, entries: [...l.entries] })),
        separator: a.separator,
        dossiers: a.dossiers.map((d) => base64Encode(d)),
        font: { name: a.font.name, tiles: serBlock(a.font.tiles), glyphs },
        fontSlot: a.fontSlot,
        fontFlags: a.fontFlags,
    };
}
export function deserializeCharselAssets(x: unknown): CharselAssets {
    const where = "charsel assets";
    if (needStr(x, "format", where) !== CHARSEL_ASSETS_SERIAL_FORMAT)
        throw new Error(`${where}: format is not ${CHARSEL_ASSETS_SERIAL_FORMAT}`);
    const cards = needArr(x, "cards", where).map((c, i): CharCard => {
        const w = `${where} cards[${i}]`;
        const cols = needInt(c, "cols", w);
        const rows = needInt(c, "rows", w);
        const origin = intList(need(c, "origin", w), 2, `${w} origin`);
        const pal = need(c, "paletteLines", w);
        if (!Array.isArray(pal) || pal.length !== LINE_COUNT)
            throw new Error(`${w}: paletteLines is not ${LINE_COUNT} lines`);
        return {
            name: needStr(c, "name", w),
            cols,
            rows,
            entries: words(need(c, "entries", w), cols * rows, `${w} entries`),
            origin: [origin[0]!, origin[1]!],
            paletteLines: pal.map((l, k) => intList(l, LINE_WORDS, `${w} palette line ${k}`)),
            tiles: desBlock(need(c, "tiles", w), `${w} tiles`),
            firstSlot: needInt(c, "firstSlot", w),
        };
    });
    const ov = need(x, "overlay", where);
    const ocols = needInt(ov, "cols", `${where} overlay`);
    const orows = needInt(ov, "rows", `${where} overlay`);
    const f = need(x, "font", where);
    const fw = `${where} font`;
    const fontTiles = desBlock(need(f, "tiles", fw), `${fw} tiles`);
    const glyphs = new Map<string, Glyph>();
    for (const [ch, g] of Object.entries(needObj(f, "glyphs", fw))) {
        const w = `${fw} glyph ${JSON.stringify(ch)}`;
        const half = (key: "upper" | "lower"): number | null => {
            const v = need(g, key, w);
            if (v === null)
                return null;
            if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= fontTiles.count)
                throw new Error(`${w}: bad ${key} ${JSON.stringify(v)}`);
            return v;
        };
        glyphs.set(ch, { upper: half("upper"), lower: half("lower") });
    }
    return {
        cards,
        overlay: { cols: ocols, rows: orows, entries: words(need(ov, "entries", `${where} overlay`), ocols * orows, `${where} overlay entries`) },
        bank: desBlock(need(x, "bank", where), `${where} bank`),
        bankSlot: needInt(x, "bankSlot", where),
        tile: desBlock(need(x, "tile", where), `${where} tile`),
        tileSlot: needInt(x, "tileSlot", where),
        pool: desBlock(need(x, "pool", where), `${where} pool`),
        tileLists: needArr(x, "tileLists", where).map((l, i) => ({
            firstSlot: needInt(l, "firstSlot", `${where} tileLists[${i}]`),
            entries: intList(need(l, "entries", `${where} tileLists[${i}]`), null, `${where} tileLists[${i}] entries`),
        })),
        separator: needStr(x, "separator", where),
        dossiers: needArr(x, "dossiers", where).map((d, i) => {
            if (typeof d !== "string")
                throw new Error(`${where} dossiers[${i}]: not a string`);
            const b = base64Decode(d);
            if (b.length !== DOSSIER_BYTES)
                throw new Error(`${where} dossiers[${i}]: ${b.length} bytes, expected ${DOSSIER_BYTES}`);
            return b;
        }),
        font: { name: needStr(f, "name", fw), tiles: fontTiles, glyphs },
        fontSlot: needInt(x, "fontSlot", where),
        fontFlags: needInt(x, "fontFlags", where),
    };
}

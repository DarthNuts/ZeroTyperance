import type { TileBlock } from "../boot/assets.js";
import { base64Decode, base64Encode, hexWord, isObj, need, needArr, needInt, needObj, needStr, parseTileBlock } from "../boot/assets_parse.js";
import type { IndexedImage } from "../boot/png.js";
import type { Glyph, OptionsAssets, TextFont } from "./assets.js";
import { deserializeSoundTable, serializeSoundTable } from "./sound_table.js";
export const OPTIONS_ASSETS_SERIAL_FORMAT = "zt-options-assets/2";
const FONTS_FORMAT = "ztassets-fonts/1";
const STRINGS_FORMAT = "ztassets-strings/1";
const PALETTES_FORMAT = "ztassets-palettes/1";
const LINE_WORDS = 16;
const LINE_COUNT = 1;
const TILE_BYTES = 32;
function fontEntry(doc: unknown, name: string): Record<string, unknown> {
    const where = "fonts";
    const format = needStr(doc, "format", where);
    if (format !== FONTS_FORMAT)
        throw new Error(`${where}: format ${format}, expected ${FONTS_FORMAT}`);
    const entry = needArr(doc, "entries", where).find((e) => isObj(e) && e.name === name);
    if (entry === undefined || !isObj(entry))
        throw new Error(`${where}: no font entry named ${name}`);
    return entry;
}
export function parseTextFont(doc: unknown, name: string, sheet: IndexedImage): TextFont {
    const where = `font ${name}`;
    const entry = fontEntry(doc, name);
    const tiles = needInt(entry, "tiles", where);
    const columns = needInt(entry, "columns", where);
    if (sheet.width % 8 !== 0 || sheet.width / 8 !== columns) {
        throw new Error(`${where}: the sheet is ${sheet.width} pixels wide (${sheet.width / 8} tiles per row), fonts.json says columns ${columns}`);
    }
    const block: TileBlock = parseTileBlock(name, tiles, sheet);
    const raw = needObj(entry, "glyphs", where);
    const glyphs = new Map<string, Glyph>();
    for (const [ch, g] of Object.entries(raw)) {
        const w = `${where} glyph ${JSON.stringify(ch)}`;
        if ([...ch].length !== 1)
            throw new Error(`${w}: the key is not one character`);
        const half = (key: "upper" | "lower"): number | null => {
            const v = need(g, key, w);
            if (v === null)
                return null;
            if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= tiles) {
                throw new Error(`${w}: ${key} ${JSON.stringify(v)} is not null or a tile number below ${tiles}`);
            }
            return v;
        };
        glyphs.set(ch, { upper: half("upper"), lower: half("lower") });
    }
    return { name, tiles: block, glyphs };
}
export function fontSheetName(doc: unknown, name: string): string {
    return needStr(fontEntry(doc, name), "png", `font ${name}`);
}
export function parseStrings(doc: unknown, group: string): Map<string, string> {
    const where = `strings ${group}`;
    const format = needStr(doc, "format", where);
    if (format !== STRINGS_FORMAT)
        throw new Error(`${where}: format ${format}, expected ${STRINGS_FORMAT}`);
    const g = needStr(doc, "group", where);
    if (g !== group)
        throw new Error(`${where}: the document's group is ${g}`);
    const out = new Map<string, string>();
    needArr(doc, "entries", where).forEach((e, i) => {
        const w = `${where} entries[${i}]`;
        const id = needStr(e, "id", w);
        if (out.has(id))
            throw new Error(`${where}: id ${id} appears twice`);
        const meta = isObj(e) ? e.meta : undefined;
        const stored = isObj(meta) ? meta.stored : undefined;
        if (stored !== undefined && typeof stored !== "string")
            throw new Error(`${w} (${id}): meta.stored is not a string`);
        out.set(id, stored !== undefined ? stored : needStr(e, "text", `${w} (${id})`));
    });
    return out;
}
export function parsePaletteLine(doc: unknown, name: string): number[] {
    const where = "palettes";
    const format = needStr(doc, "format", where);
    if (format !== PALETTES_FORMAT)
        throw new Error(`${where}: format ${format}, expected ${PALETTES_FORMAT}`);
    const entry = needArr(doc, "palettes", where).find((p) => isObj(p) && p.name === name);
    if (entry === undefined)
        throw new Error(`${where}: no palette named ${name}`);
    const w = `palette ${name}`;
    const entries = needInt(entry, "entries", w);
    if (entries !== LINE_WORDS)
        throw new Error(`${w}: entries is ${entries}, expected ${LINE_WORDS}`);
    const lines = needInt(entry, "lines", w);
    if (lines !== LINE_COUNT)
        throw new Error(`${w}: lines is ${lines}, expected ${LINE_COUNT}`);
    const colors = needArr(entry, "colors", w);
    if (colors.length !== LINE_WORDS)
        throw new Error(`${w}: ${colors.length} colors, expected ${LINE_WORDS}`);
    return colors.map((c, i) => {
        const idx = needInt(c, "index", `${w} colors[${i}]`);
        if (idx !== i)
            throw new Error(`${w}: colour indices are not 0..${LINE_WORDS - 1} in order (found ${idx} at position ${i})`);
        return hexWord(need(c, "bgr333", `${w} colors[${i}]`), `${w} colors[${i}] bgr333`);
    });
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
function intList(x: unknown, n: number, where: string): number[] {
    if (!Array.isArray(x) || x.length !== n || x.some((v) => typeof v !== "number" || !Number.isInteger(v)))
        throw new Error(`${where}: not a list of ${n} integers`);
    return x as number[];
}
export function serializeOptionsAssets(a: OptionsAssets): unknown {
    const glyphs: Record<string, {
        upper: number | null;
        lower: number | null;
    }> = {};
    for (const [ch, g] of a.font.glyphs)
        glyphs[ch] = { upper: g.upper, lower: g.lower };
    const strings: Record<string, string> = {};
    for (const [id, s] of a.strings)
        strings[id] = s;
    return {
        format: OPTIONS_ASSETS_SERIAL_FORMAT,
        font: { name: a.font.name, tiles: serBlock(a.font.tiles), glyphs },
        cursor: serBlock(a.cursor),
        strings,
        line0: [...a.line0],
        line3: [...a.line3],
        soundTable: serializeSoundTable(a.soundTable),
    };
}
export function deserializeOptionsAssets(x: unknown): OptionsAssets {
    const where = "options assets";
    if (needStr(x, "format", where) !== OPTIONS_ASSETS_SERIAL_FORMAT)
        throw new Error(`${where}: format is not ${OPTIONS_ASSETS_SERIAL_FORMAT}`);
    const f = need(x, "font", where);
    const fw = `${where} font`;
    const tiles = desBlock(need(f, "tiles", fw), `${fw} tiles`);
    const glyphs = new Map<string, Glyph>();
    for (const [ch, g] of Object.entries(needObj(f, "glyphs", fw))) {
        const w = `${fw} glyph ${JSON.stringify(ch)}`;
        const half = (key: "upper" | "lower"): number | null => {
            const v = need(g, key, w);
            if (v === null)
                return null;
            if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= tiles.count)
                throw new Error(`${w}: bad ${key} ${JSON.stringify(v)}`);
            return v;
        };
        glyphs.set(ch, { upper: half("upper"), lower: half("lower") });
    }
    const strings = new Map<string, string>();
    for (const [id, s] of Object.entries(needObj(x, "strings", where))) {
        if (typeof s !== "string")
            throw new Error(`${where}: string ${id} is not a string`);
        strings.set(id, s);
    }
    return {
        font: { name: needStr(f, "name", fw), tiles, glyphs },
        cursor: desBlock(need(x, "cursor", where), `${where} cursor`),
        strings,
        line0: intList(need(x, "line0", where), LINE_WORDS, `${where} line0`),
        line3: intList(need(x, "line3", where), LINE_WORDS, `${where} line3`),
        soundTable: deserializeSoundTable(need(x, "soundTable", where)),
    };
}

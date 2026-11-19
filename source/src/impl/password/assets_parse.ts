import type { TileBlock } from "../boot/assets.js";
import { base64Decode, base64Encode, isObj, need, needArr, needInt, needObj, needStr, parseTileBlock } from "../boot/assets_parse.js";
import type { IndexedImage } from "../boot/png.js";
import type { Glyph } from "../options/assets.js";
import { PASSWORD_ASSETS_SERIAL_FORMAT } from "./assets.js";
import type { PasswordAssets } from "./assets.js";
export { fontSheetName, parsePaletteLine, parseTextFont } from "../options/assets_parse.js";
const STRINGS_FORMAT = "ztassets-strings/1";
const TILE_BYTES = 32;
const LINE_WORDS = 16;
export function parseLastTile(name: string, tiles: number, sheet: IndexedImage): TileBlock {
    const all = parseTileBlock(name, tiles, sheet);
    return { name: `${name}.last`, count: 1, patterns: all.patterns.slice((tiles - 1) * TILE_BYTES, tiles * TILE_BYTES) };
}
export function fontTileCount(doc: unknown, name: string): number {
    const entry = needArr(doc, "entries", "fonts").find((e) => isObj(e) && e.name === name);
    if (!entry)
        throw new Error(`fonts: no font entry named ${name}`);
    return needInt(entry, "tiles", `font ${name}`);
}
export interface PasswordStrings {
    errorText: string;
    heading: string;
    rows: string[];
    buttons: string;
}
export function parsePasswordStrings(doc: unknown, group: string, errorId: string, headingId: string, rowCount: number): PasswordStrings {
    const where = `strings ${group}`;
    const format = needStr(doc, "format", where);
    if (format !== STRINGS_FORMAT)
        throw new Error(`${where}: format ${format}, expected ${STRINGS_FORMAT}`);
    if (needStr(doc, "group", where) !== group)
        throw new Error(`${where}: wrong group`);
    const byId = new Map<string, string>();
    const rows: Array<string | undefined> = new Array<string | undefined>(rowCount).fill(undefined);
    let buttons: string | undefined;
    needArr(doc, "entries", where).forEach((e, i) => {
        const w = `${where} entries[${i}]`;
        const id = needStr(e, "id", w);
        const text = needStr(e, "text", `${w} (${id})`);
        byId.set(id, text);
        const meta = isObj(e) ? e.meta : undefined;
        const kind = isObj(meta) ? meta.kind : undefined;
        if (kind === "keyboard_row") {
            const r = needInt(meta, "row", `${w} meta`);
            if (r < 0 || r >= rowCount)
                throw new Error(`${w}: keyboard row ${r} out of range`);
            rows[r] = text;
        }
        else if (kind === "buttons") {
            buttons = text;
        }
    });
    const err = byId.get(errorId);
    const head = byId.get(headingId);
    if (err === undefined || head === undefined)
        throw new Error(`${where}: ${errorId} or ${headingId} missing`);
    if (buttons === undefined)
        throw new Error(`${where}: no buttons entry`);
    const out: string[] = [];
    rows.forEach((r, i) => {
        if (r === undefined)
            throw new Error(`${where}: no keyboard_row ${i}`);
        out.push(r);
    });
    return { errorText: err, heading: head, rows: out, buttons };
}
export function parseCells(codec: unknown): string[][] {
    const data = need(codec, "data", "password_codec");
    return needArr(data, "cells", "password_codec data").map((r, i) => {
        if (!Array.isArray(r) || r.some((c) => typeof c !== "string"))
            throw new Error(`password_codec data cells[${i}]: not a list of strings`);
        return [...(r as string[])];
    });
}
function ser(b: TileBlock): unknown {
    return { name: b.name, count: b.count, patterns: base64Encode(b.patterns) };
}
function des(x: unknown, where: string): TileBlock {
    const name = needStr(x, "name", where);
    const count = needInt(x, "count", where);
    const patterns = base64Decode(needStr(x, "patterns", where));
    if (patterns.length !== count * TILE_BYTES)
        throw new Error(`${where}: ${patterns.length} pattern bytes for ${count} tiles`);
    return { name, count, patterns };
}
function words(x: unknown, where: string): number[] {
    if (!Array.isArray(x) || x.length !== LINE_WORDS || x.some((v) => typeof v !== "number" || !Number.isInteger(v)))
        throw new Error(`${where}: not ${LINE_WORDS} integers`);
    return x as number[];
}
export function serializePasswordAssets(a: PasswordAssets): unknown {
    const glyphs: Record<string, {
        upper: number | null;
        lower: number | null;
    }> = {};
    for (const [ch, g] of a.font.glyphs)
        glyphs[ch] = { upper: g.upper, lower: g.lower };
    return {
        format: PASSWORD_ASSETS_SERIAL_FORMAT,
        font: { name: a.font.name, tiles: ser(a.font.tiles), glyphs },
        corner: ser(a.corner),
        errorText: a.errorText,
        heading: a.heading,
        rows: [...a.rows],
        buttons: a.buttons,
        line0: [...a.line0],
        line2: [...a.line2],
        line3: [...a.line3],
        cells: a.cells.map((r) => [...r]),
    };
}
export function deserializePasswordAssets(x: unknown): PasswordAssets {
    const where = "password assets";
    if (needStr(x, "format", where) !== PASSWORD_ASSETS_SERIAL_FORMAT)
        throw new Error(`${where}: format is not ${PASSWORD_ASSETS_SERIAL_FORMAT}`);
    const f = need(x, "font", where);
    const fw = `${where} font`;
    const tiles = des(need(f, "tiles", fw), `${fw} tiles`);
    const glyphs = new Map<string, Glyph>();
    for (const [ch, g] of Object.entries(needObj(f, "glyphs", fw))) {
        const w = `${fw} glyph ${JSON.stringify(ch)}`;
        const half = (key: "upper" | "lower"): number | null => {
            const v = need(g, key, w);
            if (v === null)
                return null;
            if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= tiles.count)
                throw new Error(`${w}: bad ${key}`);
            return v;
        };
        glyphs.set(ch, { upper: half("upper"), lower: half("lower") });
    }
    const strs = (k: string): string[] => {
        const v = need(x, k, where);
        if (!Array.isArray(v) || v.some((s) => typeof s !== "string"))
            throw new Error(`${where}: ${k} is not a list of strings`);
        return v as string[];
    };
    return {
        font: { name: needStr(f, "name", fw), tiles, glyphs },
        corner: des(need(x, "corner", where), `${where} corner`),
        errorText: needStr(x, "errorText", where),
        heading: needStr(x, "heading", where),
        rows: strs("rows"),
        buttons: needStr(x, "buttons", where),
        line0: words(need(x, "line0", where), `${where} line0`),
        line2: words(need(x, "line2", where), `${where} line2`),
        line3: words(need(x, "line3", where), `${where} line3`),
        cells: needArr(x, "cells", where).map((r, i) => {
            if (!Array.isArray(r) || r.some((c) => typeof c !== "string"))
                throw new Error(`${where}: cells[${i}] bad`);
            return [...(r as string[])];
        }),
    };
}

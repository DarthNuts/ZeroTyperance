import type { BootAssets, LogoScreen, NameTableScreen, PaletteLines, TileBlock } from "./assets.js";
export const ASSETS_SERIAL_FORMAT = "zt-boot-assets/1";
const SCREENS_FORMAT = "ztassets-screens/1";
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_REV = (() => {
    const t = new Int16Array(128).fill(-1);
    for (let i = 0; i < 64; i++)
        t[B64.charCodeAt(i)] = i;
    return t;
})();
export function base64Encode(b: Uint8Array): string {
    let out = "";
    let i = 0;
    for (; i + 2 < b.length; i += 3) {
        const n = (b[i]! << 16) | (b[i + 1]! << 8) | b[i + 2]!;
        out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
    }
    if (i + 1 === b.length) {
        const n = b[i]! << 16;
        out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + "==";
    }
    else if (i + 2 === b.length) {
        const n = (b[i]! << 16) | (b[i + 1]! << 8);
        out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + "=";
    }
    return out;
}
export function base64Decode(s: string): Uint8Array {
    if (s.length % 4 !== 0)
        throw new Error("base64: length is not a multiple of 4");
    let pad = 0;
    if (s.endsWith("=="))
        pad = 2;
    else if (s.endsWith("="))
        pad = 1;
    const out = new Uint8Array((s.length / 4) * 3 - pad);
    let o = 0;
    for (let i = 0; i < s.length; i += 4) {
        let n = 0;
        for (let k = 0; k < 4; k++) {
            const ch = s.charCodeAt(i + k);
            let v: number;
            if (s[i + k] === "=") {
                if (i + k < s.length - pad)
                    throw new Error("base64: misplaced padding");
                v = 0;
            }
            else {
                v = ch < 128 ? B64_REV[ch]! : -1;
                if (v < 0)
                    throw new Error(`base64: bad character at ${i + k}`);
            }
            n = (n << 6) | v;
        }
        if (o < out.length)
            out[o++] = (n >> 16) & 255;
        if (o < out.length)
            out[o++] = (n >> 8) & 255;
        if (o < out.length)
            out[o++] = n & 255;
    }
    return out;
}
export function u16ToBytes(a: Uint16Array): Uint8Array {
    const b = new Uint8Array(a.length * 2);
    for (let i = 0; i < a.length; i++) {
        b[2 * i] = a[i]! >> 8;
        b[2 * i + 1] = a[i]! & 255;
    }
    return b;
}
export function bytesToU16(b: Uint8Array): Uint16Array {
    if (b.length % 2 !== 0)
        throw new Error("assets: odd byte count for 16-bit data");
    const a = new Uint16Array(b.length / 2);
    for (let i = 0; i < a.length; i++)
        a[i] = (b[2 * i]! << 8) | b[2 * i + 1]!;
    return a;
}
export function isObj(x: unknown): x is Record<string, unknown> {
    return x !== null && typeof x === "object" && !Array.isArray(x);
}
export function need(o: unknown, key: string, where: string): unknown {
    if (!isObj(o) || !(key in o))
        throw new Error(`${where}: missing "${key}"`);
    return o[key];
}
export function needObj(o: unknown, key: string, where: string): Record<string, unknown> {
    const v = need(o, key, where);
    if (!isObj(v))
        throw new Error(`${where}: "${key}" is not an object`);
    return v;
}
export function needArr(o: unknown, key: string, where: string): unknown[] {
    const v = need(o, key, where);
    if (!Array.isArray(v))
        throw new Error(`${where}: "${key}" is not an array`);
    return v;
}
export function needInt(o: unknown, key: string, where: string): number {
    const v = need(o, key, where);
    if (typeof v !== "number" || !Number.isInteger(v))
        throw new Error(`${where}: "${key}" is not an integer`);
    return v;
}
export function needStr(o: unknown, key: string, where: string): string {
    const v = need(o, key, where);
    if (typeof v !== "string")
        throw new Error(`${where}: "${key}" is not a string`);
    return v;
}
export function hexWord(s: unknown, where: string): number {
    if (typeof s !== "string" || !/^(0x)?[0-9A-Fa-f]{1,4}$/.test(s))
        throw new Error(`${where}: bad hex word ${JSON.stringify(s)}`);
    return parseInt(s, 16);
}
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
export function parseTileBlock(name: string, count: number, sheet: {
    width: number;
    height: number;
    pixels: Uint8Array;
}): TileBlock {
    const where = `tile block ${name}`;
    if (!Number.isInteger(count) || count < 0)
        throw new Error(`${where}: bad tile count ${count}`);
    if (sheet.width % 8 !== 0 || sheet.height % 8 !== 0)
        throw new Error(`${where}: sheet ${sheet.width} x ${sheet.height} is not a multiple of 8`);
    if (sheet.pixels.length !== sheet.width * sheet.height)
        throw new Error(`${where}: sheet pixels ${sheet.pixels.length}, expected ${sheet.width * sheet.height}`);
    const columns = sheet.width / 8;
    const rows = sheet.height / 8;
    if (count > columns * rows)
        throw new Error(`${where}: ${count} tiles do not fit a ${columns} x ${rows} sheet`);
    const patterns = new Uint8Array(count * 32);
    for (let t = 0; t < count; t++) {
        const tx = (t % columns) * 8;
        const ty = Math.floor(t / columns) * 8;
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x += 2) {
                const l = sheet.pixels[(ty + y) * sheet.width + tx + x]!;
                const r = sheet.pixels[(ty + y) * sheet.width + tx + x + 1]!;
                if (l > 15 || r > 15)
                    throw new Error(`${where}: tile ${t} has a colour index above 15`);
                patterns[t * 32 + y * 4 + (x >> 1)] = (l << 4) | r;
            }
        }
    }
    return { name, count, patterns };
}
function parsePalette(doc: unknown, where: string): PaletteLines {
    const pal = needObj(doc, "palette", where);
    const lines = needObj(pal, "lines", `${where} palette`);
    const out: ((readonly number[]) | null)[] = [null, null, null, null];
    for (const key of Object.keys(lines)) {
        if (!/^[0-3]$/.test(key))
            throw new Error(`${where}: palette line key ${JSON.stringify(key)}`);
        const words = needArr(lines[key], "cram_words", `${where} palette line ${key}`);
        if (words.length !== 16)
            throw new Error(`${where}: palette line ${key} has ${words.length} words, expected 16`);
        out[Number(key)] = words.map((w, i) => hexWord(w, `${where} palette line ${key} word ${i}`));
    }
    return out as unknown as PaletteLines;
}
function parseTileSource(doc: unknown, tiles: TileBlock, where: string): number {
    const srcs = needArr(doc, "tile_sources", where);
    if (srcs.length < 1)
        throw new Error(`${where}: empty tile_sources`);
    const s = srcs[0];
    const block = needStr(s, "block", `${where} tile_sources[0]`);
    if (block !== tiles.name)
        throw new Error(`${where}: tile_sources[0].block is ${block}, the tile block is ${tiles.name}`);
    const n = needInt(s, "tiles", `${where} tile_sources[0]`);
    if (n !== tiles.count)
        throw new Error(`${where}: tile_sources[0].tiles is ${n}, the tile block holds ${tiles.count}`);
    return needInt(s, "first_slot", `${where} tile_sources[0]`);
}
function checkHeader(doc: unknown, kind: string, where: string): string {
    if (needStr(doc, "format", where) !== SCREENS_FORMAT)
        throw new Error(`${where}: format ${String(need(doc, "format", where))}, expected ${SCREENS_FORMAT}`);
    const k = needStr(doc, "kind", where);
    if (k !== kind)
        throw new Error(`${where}: kind ${k}, expected ${kind}`);
    return needStr(doc, "name", where);
}
export function parseNameTableScreen(doc: unknown, tiles: TileBlock): NameTableScreen {
    const where = `screen ${isObj(doc) && typeof doc.name === "string" ? doc.name : "?"}`;
    const name = checkHeader(doc, "name_table", where);
    const geo = needObj(doc, "geometry", where);
    const cols = needInt(geo, "cell_columns", `${where} geometry`);
    const rows = needInt(geo, "cell_rows", `${where} geometry`);
    const nt = needObj(doc, "name_table", where);
    const entries = wordRows(needArr(nt, "entry_rows", `${where} name_table`), cols, rows, `${where} entry_rows`);
    const firstSlot = parseTileSource(doc, tiles, where);
    return { name, cols, rows, entries, firstSlot, palette: parsePalette(doc, where), tiles };
}
export function parseLogoScreen(doc: unknown, tiles: TileBlock): LogoScreen {
    const where = `screen ${isObj(doc) && typeof doc.name === "string" ? doc.name : "?"}`;
    const name = checkHeader(doc, "name_table_frames", where);
    const geo = needObj(doc, "geometry", where);
    const cols = needInt(geo, "cell_columns", `${where} geometry`);
    const rows = needInt(geo, "cell_rows", `${where} geometry`);
    const fr = needArr(doc, "frames", where);
    const sorted = fr.map((f, i) => ({ f, index: needInt(f, "index", `${where} frames[${i}]`) })).sort((a, b) => a.index - b.index);
    const frames = sorted.map((e, i) => {
        if (e.index !== i)
            throw new Error(`${where}: frame indices are not 0..${sorted.length - 1} (found ${e.index} at position ${i})`);
        return wordRows(needArr(e.f, "word_rows", `${where} frame ${i}`), cols, rows, `${where} frame ${i} word_rows`);
    });
    const firstSlot = parseTileSource(doc, tiles, where);
    return { name, cols, rows, frames, firstSlot, palette: parsePalette(doc, where), tiles };
}
function serTiles(t: TileBlock): unknown {
    return { name: t.name, count: t.count, patterns: base64Encode(t.patterns) };
}
function desTiles(x: unknown, where: string): TileBlock {
    const name = needStr(x, "name", where);
    const count = needInt(x, "count", where);
    const patterns = base64Decode(needStr(x, "patterns", where));
    if (patterns.length !== count * 32)
        throw new Error(`${where}: ${patterns.length} pattern bytes for ${count} tiles`);
    return { name, count, patterns };
}
function serPalette(p: PaletteLines): unknown {
    return p.map((l) => (l === null ? null : [...l]));
}
function desPalette(x: unknown, where: string): PaletteLines {
    if (!Array.isArray(x) || x.length !== 4)
        throw new Error(`${where}: palette is not 4 lines`);
    return x.map((l, i) => {
        if (l === null)
            return null;
        if (!Array.isArray(l) || l.length !== 16 || l.some((w) => typeof w !== "number" || !Number.isInteger(w)))
            throw new Error(`${where}: palette line ${i} is not 16 integers`);
        return l as number[];
    }) as unknown as PaletteLines;
}
export function serNt(s: NameTableScreen): unknown {
    return { name: s.name, cols: s.cols, rows: s.rows, entries: base64Encode(u16ToBytes(s.entries)), firstSlot: s.firstSlot, palette: serPalette(s.palette), tiles: serTiles(s.tiles) };
}
export function desNt(x: unknown, where: string): NameTableScreen {
    const cols = needInt(x, "cols", where);
    const rows = needInt(x, "rows", where);
    const entries = bytesToU16(base64Decode(needStr(x, "entries", where)));
    if (entries.length !== cols * rows)
        throw new Error(`${where}: ${entries.length} entries for ${cols} x ${rows}`);
    return {
        name: needStr(x, "name", where),
        cols,
        rows,
        entries,
        firstSlot: needInt(x, "firstSlot", where),
        palette: desPalette(need(x, "palette", where), where),
        tiles: desTiles(need(x, "tiles", where), `${where} tiles`),
    };
}
export function serializeAssets(a: BootAssets): unknown {
    return {
        format: ASSETS_SERIAL_FORMAT,
        banner: serNt(a.banner),
        logo: {
            name: a.logo.name,
            cols: a.logo.cols,
            rows: a.logo.rows,
            frames: a.logo.frames.map((f) => base64Encode(u16ToBytes(f))),
            firstSlot: a.logo.firstSlot,
            palette: serPalette(a.logo.palette),
            tiles: serTiles(a.logo.tiles),
        },
        scenes: a.scenes.map(serNt),
    };
}
export function deserializeAssets(x: unknown): BootAssets {
    const where = "boot assets";
    if (needStr(x, "format", where) !== ASSETS_SERIAL_FORMAT)
        throw new Error(`${where}: format is not ${ASSETS_SERIAL_FORMAT}`);
    const lg = needObj(x, "logo", where);
    const cols = needInt(lg, "cols", `${where} logo`);
    const rows = needInt(lg, "rows", `${where} logo`);
    const frames = needArr(lg, "frames", `${where} logo`).map((f, i) => {
        if (typeof f !== "string")
            throw new Error(`${where} logo frame ${i}: not a string`);
        const e = bytesToU16(base64Decode(f));
        if (e.length !== cols * rows)
            throw new Error(`${where} logo frame ${i}: ${e.length} entries for ${cols} x ${rows}`);
        return e;
    });
    return {
        banner: desNt(need(x, "banner", where), `${where} banner`),
        logo: {
            name: needStr(lg, "name", `${where} logo`),
            cols,
            rows,
            frames,
            firstSlot: needInt(lg, "firstSlot", `${where} logo`),
            palette: desPalette(need(lg, "palette", `${where} logo`), `${where} logo`),
            tiles: desTiles(need(lg, "tiles", `${where} logo`), `${where} logo tiles`),
        },
        scenes: needArr(x, "scenes", where).map((s, i) => desNt(s, `${where} scene ${i}`)),
    };
}

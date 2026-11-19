import { base64Encode, desNt, isObj, need, needArr, needInt, needObj, needStr, serNt } from "../boot/assets_parse.js";
import type { TileBlock } from "../boot/assets.js";
import type { Glyph, TextFont } from "../options/assets.js";
import { base64Decode } from "../boot/assets_parse.js";
import type { BriefingAssets, BriefingPage } from "./assets.js";
export const BRIEFING_ASSETS_SERIAL_FORMAT = "zt-briefing-assets/1";
const STRINGS_FORMAT = "ztassets-strings/1";
const TILE_BYTES = 32;
export function parseSceneRecords(doc: unknown, group: string, id: string, recordChars: number): string[] {
    const where = `strings ${group}`;
    const format = needStr(doc, "format", where);
    if (format !== STRINGS_FORMAT)
        throw new Error(`${where}: format ${format}, expected ${STRINGS_FORMAT}`);
    const g = needStr(doc, "group", where);
    if (g !== group)
        throw new Error(`${where}: the document's group is ${g}`);
    const entry = needArr(doc, "entries", where).find((e) => isObj(e) && e.id === id);
    if (entry === undefined)
        throw new Error(`${where}: no entry ${id}`);
    const w = `${where} entry ${id}`;
    const meta = needObj(entry, "meta", w);
    const rows = needArr(meta, "rows", `${w} meta`);
    if (meta.row_count !== undefined && meta.row_count !== rows.length)
        throw new Error(`${w}: meta.row_count ${String(meta.row_count)} but ${rows.length} rows`);
    return rows.map((r, i) => {
        if (typeof r !== "string")
            throw new Error(`${w}: row ${i} is not a string`);
        const n = Array.from(r).length;
        if (n !== recordChars)
            throw new Error(`${w}: row ${i} has ${n} characters, a record has ${recordChars}`);
        return r;
    });
}
export function checkGlyphs(records: readonly string[], font: TextFont, what: string): void {
    for (const r of records) {
        for (const ch of r) {
            if (!font.glyphs.has(ch))
                throw new Error(`${what}: the character ${JSON.stringify(ch)} has no glyph in font ${font.name}`);
        }
    }
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
function strList(x: unknown, where: string): string[] {
    if (!Array.isArray(x) || x.some((s) => typeof s !== "string"))
        throw new Error(`${where}: not a list of strings`);
    return x as string[];
}
export function serializeBriefingAssets(a: BriefingAssets): unknown {
    const glyphs: Record<string, {
        upper: number | null;
        lower: number | null;
    }> = {};
    for (const [ch, g] of a.font.glyphs)
        glyphs[ch] = { upper: g.upper, lower: g.lower };
    const pages: unknown[] = [];
    for (const [key, p] of a.pages)
        pages.push({ key, name: p.name, scene: p.scene, records: [...p.records], picture: serNt(p.picture) });
    return {
        format: BRIEFING_ASSETS_SERIAL_FORMAT,
        font: { name: a.font.name, tiles: serBlock(a.font.tiles), glyphs },
        pages,
        spacers: [...a.spacers],
    };
}
export function deserializeBriefingAssets(x: unknown): BriefingAssets {
    const where = "briefing assets";
    if (needStr(x, "format", where) !== BRIEFING_ASSETS_SERIAL_FORMAT)
        throw new Error(`${where}: format is not ${BRIEFING_ASSETS_SERIAL_FORMAT}`);
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
    const pages = new Map<string, BriefingPage>();
    needArr(x, "pages", where).forEach((p, i) => {
        const pw = `${where} pages[${i}]`;
        const page: BriefingPage = {
            name: needStr(p, "name", pw),
            scene: needStr(p, "scene", pw),
            records: strList(need(p, "records", pw), `${pw} records`),
            picture: desNt(need(p, "picture", pw), `${pw} picture`),
        };
        const key = (p as {
            key?: unknown;
        }).key;
        pages.set(typeof key === "string" ? key : page.scene, page);
    });
    return {
        font: { name: needStr(f, "name", fw), tiles, glyphs },
        pages,
        spacers: strList(need(x, "spacers", where), `${where} spacers`),
    };
}

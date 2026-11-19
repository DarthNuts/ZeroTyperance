import type { NameTableScreen, TileBlock } from "../boot/assets.js";
import { base64Decode, base64Encode, desNt, hexWord, isObj, need, needArr, needInt, needStr, serNt } from "../boot/assets_parse.js";
import type { SlottedTiles, TitleAssets } from "./assets.js";
import { LINE0_PALETTE, RAMP_PALETTE, SPRITE_COUNT, SPRITES_SCREEN } from "./assets.js";
export const TITLE_ASSETS_SERIAL_FORMAT = "zt-title-assets/1";
const SCREENS_FORMAT = "ztassets-screens/1";
const PALETTES_FORMAT = "ztassets-palettes/1";
const LINE_WORDS = 16;
const RAMP_LINE_COUNT = 32;
export function checkSpriteTileSources(doc: unknown, blocks: readonly TileBlock[]): number[] {
    const where = `screen ${SPRITES_SCREEN}`;
    const srcs = needArr(doc, "tile_sources", where);
    if (srcs.length !== blocks.length)
        throw new Error(`${where}: ${srcs.length} tile_sources, expected ${blocks.length}`);
    return blocks.map((b, i) => {
        const w = `${where} tile_sources[${i}]`;
        const block = needStr(srcs[i], "block", w);
        if (block !== b.name)
            throw new Error(`${w}: block is ${block}, the tile block is ${b.name}`);
        const n = needInt(srcs[i], "tiles", w);
        if (n !== b.count)
            throw new Error(`${w}: tiles is ${n}, the tile block holds ${b.count}`);
        return needInt(srcs[i], "first_slot", w);
    });
}
export function parseTitleSprites(doc: unknown): TitleAssets["sprites"] {
    const where = `screen ${isObj(doc) && typeof doc.name === "string" ? doc.name : SPRITES_SCREEN}`;
    if (needStr(doc, "format", where) !== SCREENS_FORMAT)
        throw new Error(`${where}: format ${String(need(doc, "format", where))}, expected ${SCREENS_FORMAT}`);
    const kind = needStr(doc, "kind", where);
    if (kind !== "sprites")
        throw new Error(`${where}: kind ${kind}, expected sprites`);
    const arr = needArr(doc, "sprites", where);
    if (arr.length !== SPRITE_COUNT)
        throw new Error(`${where}: ${arr.length} sprites, expected ${SPRITE_COUNT}`);
    const sorted = arr
        .map((s, i) => ({ s, index: needInt(s, "index", `${where} sprites[${i}]`) }))
        .sort((a, b) => a.index - b.index);
    return sorted.map((e, i) => {
        const w = `${where} sprite ${i}`;
        if (e.index !== i)
            throw new Error(`${where}: sprite indices are not 0..${sorted.length - 1} (found ${e.index} at position ${i})`);
        return {
            x: needInt(e.s, "x", w),
            y: needInt(e.s, "y", w),
            w: needInt(e.s, "cells_w", w),
            h: needInt(e.s, "cells_h", w),
            attr: hexWord(need(e.s, "attribute", w), `${w} attribute`),
        };
    });
}
function paletteWords(entry: unknown, name: string, entries: number, lines: number): number[] {
    const where = `palette ${name}`;
    if (needInt(entry, "entries", where) !== entries)
        throw new Error(`${where}: entries is ${needInt(entry, "entries", where)}, expected ${entries}`);
    if (needInt(entry, "lines", where) !== lines)
        throw new Error(`${where}: lines is ${needInt(entry, "lines", where)}, expected ${lines}`);
    const colors = needArr(entry, "colors", where);
    if (colors.length !== entries)
        throw new Error(`${where}: ${colors.length} colors, expected ${entries}`);
    return colors.map((c, i) => {
        const idx = needInt(c, "index", `${where} colors[${i}]`);
        if (idx !== i)
            throw new Error(`${where}: colour indices are not 0..${entries - 1} in order (found ${idx} at position ${i})`);
        return hexWord(need(c, "bgr333", `${where} colors[${i}]`), `${where} colors[${i}] bgr333`);
    });
}
export function parseTitlePalettes(doc: unknown): {
    line0: number[];
    ramp: number[][];
} {
    const where = "palettes";
    if (needStr(doc, "format", where) !== PALETTES_FORMAT)
        throw new Error(`${where}: format ${String(need(doc, "format", where))}, expected ${PALETTES_FORMAT}`);
    const list = needArr(doc, "palettes", where);
    const find = (name: string): unknown => {
        const e = list.find((p) => isObj(p) && p.name === name);
        if (e === undefined)
            throw new Error(`${where}: no palette named ${name}`);
        return e;
    };
    const line0 = paletteWords(find(LINE0_PALETTE), LINE0_PALETTE, LINE_WORDS, 1);
    const flat = paletteWords(find(RAMP_PALETTE), RAMP_PALETTE, RAMP_LINE_COUNT * LINE_WORDS, RAMP_LINE_COUNT);
    const ramp: number[][] = [];
    for (let l = 0; l < RAMP_LINE_COUNT; l++)
        ramp.push(flat.slice(l * LINE_WORDS, (l + 1) * LINE_WORDS));
    return { line0, ramp };
}
function serBlock(s: SlottedTiles): unknown {
    return { name: s.block.name, count: s.block.count, patterns: base64Encode(s.block.patterns), firstSlot: s.firstSlot };
}
function desBlock(x: unknown, where: string): SlottedTiles {
    const name = needStr(x, "name", where);
    const count = needInt(x, "count", where);
    const patterns = base64Decode(needStr(x, "patterns", where));
    if (patterns.length !== count * 32)
        throw new Error(`${where}: ${patterns.length} pattern bytes for ${count} tiles`);
    return { block: { name, count, patterns }, firstSlot: needInt(x, "firstSlot", where) };
}
function serTable(s: NameTableScreen): unknown {
    const o = serNt(s) as Record<string, unknown>;
    return { ...o, tiles: s.tiles.name };
}
function desTable(x: unknown, byName: Map<string, TileBlock>, where: string): NameTableScreen {
    const tname = needStr(x, "tiles", where);
    const block = byName.get(tname);
    if (!block)
        throw new Error(`${where}: tiles ${tname} is not one of the serialized blocks`);
    const nt = desNt({ ...(x as Record<string, unknown>), tiles: { name: block.name, count: 0, patterns: "" } }, where);
    return { ...nt, tiles: block };
}
function intList(x: unknown, n: number, where: string): number[] {
    if (!Array.isArray(x) || x.length !== n || x.some((v) => typeof v !== "number" || !Number.isInteger(v)))
        throw new Error(`${where}: not a list of ${n} integers`);
    return x as number[];
}
export function serializeTitleAssets(a: TitleAssets): unknown {
    return {
        format: TITLE_ASSETS_SERIAL_FORMAT,
        tiles1: serBlock(a.tiles1),
        tiles2: serBlock(a.tiles2),
        sprites1: serBlock(a.sprites1),
        sprites2: serBlock(a.sprites2),
        planeA: serTable(a.planeA),
        planeB: serTable(a.planeB),
        strip: serTable(a.strip),
        sprites: a.sprites.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h, attr: s.attr })),
        line0: [...a.line0],
        ramp: a.ramp.map((l) => [...l]),
    };
}
export function deserializeTitleAssets(x: unknown): TitleAssets {
    const where = "title assets";
    if (needStr(x, "format", where) !== TITLE_ASSETS_SERIAL_FORMAT)
        throw new Error(`${where}: format is not ${TITLE_ASSETS_SERIAL_FORMAT}`);
    const tiles1 = desBlock(need(x, "tiles1", where), `${where} tiles1`);
    const tiles2 = desBlock(need(x, "tiles2", where), `${where} tiles2`);
    const sprites1 = desBlock(need(x, "sprites1", where), `${where} sprites1`);
    const sprites2 = desBlock(need(x, "sprites2", where), `${where} sprites2`);
    const byName = new Map<string, TileBlock>([
        [tiles1.block.name, tiles1.block],
        [tiles2.block.name, tiles2.block],
    ]);
    const sprites = needArr(x, "sprites", where).map((s, i) => {
        const w = `${where} sprite ${i}`;
        return { x: needInt(s, "x", w), y: needInt(s, "y", w), w: needInt(s, "w", w), h: needInt(s, "h", w), attr: needInt(s, "attr", w) };
    });
    if (sprites.length !== SPRITE_COUNT)
        throw new Error(`${where}: ${sprites.length} sprites, expected ${SPRITE_COUNT}`);
    const rampRaw = needArr(x, "ramp", where);
    if (rampRaw.length !== RAMP_LINE_COUNT)
        throw new Error(`${where}: ramp has ${rampRaw.length} lines, expected ${RAMP_LINE_COUNT}`);
    return {
        tiles1,
        tiles2,
        sprites1,
        sprites2,
        planeA: desTable(need(x, "planeA", where), byName, `${where} planeA`),
        planeB: desTable(need(x, "planeB", where), byName, `${where} planeB`),
        strip: desTable(need(x, "strip", where), byName, `${where} strip`),
        sprites,
        line0: intList(need(x, "line0", where), LINE_WORDS, `${where} line0`),
        ramp: rampRaw.map((l, i) => intList(l, LINE_WORDS, `${where} ramp line ${i}`)),
    };
}

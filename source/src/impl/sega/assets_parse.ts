import { base64Decode, base64Encode, hexWord, isObj, need, needArr, needInt, needObj, needStr } from "../boot/assets_parse.js";
import type { IndexedImage } from "../boot/png.js";
import type { SegaAssets, Texture, TrigTable } from "./assets.js";
import type { SegaConstants } from "./constants.js";
export const SEGA_ASSETS_SERIAL_FORMAT = "zt-sega-assets/1";
const PALETTES_FORMAT = "ztassets-palettes/1";
const TRIG_FORMAT = "zt-data/1";
const TRIG_NAME = "trig_table";
const LINE_ENTRIES = 16;
function paletteWords(list: unknown[], name: string, entries: number): number[] {
    const where = `palette ${name}`;
    const e = list.find((p) => isObj(p) && p.name === name);
    if (e === undefined)
        throw new Error(`palettes: no palette named ${name}`);
    const declared = needInt(e, "entries", where);
    if (declared !== entries)
        throw new Error(`${where}: entries is ${declared}, expected ${entries}`);
    const colors = needArr(e, "colors", where);
    if (colors.length !== entries)
        throw new Error(`${where}: ${colors.length} colors, expected ${entries}`);
    return colors.map((c, i) => {
        const idx = needInt(c, "index", `${where} colors[${i}]`);
        if (idx !== i)
            throw new Error(`${where}: colour indices are not 0..${entries - 1} in order (found ${idx} at position ${i})`);
        return hexWord(need(c, "bgr333", `${where} colors[${i}]`), `${where} colors[${i}] bgr333`);
    });
}
export function parseSegaPalettes(doc: unknown, C: SegaConstants): {
    line0: number[];
    cycle: number[];
} {
    const where = "palettes";
    if (needStr(doc, "format", where) !== PALETTES_FORMAT)
        throw new Error(`${where}: format ${String(need(doc, "format", where))}, expected ${PALETTES_FORMAT}`);
    const list = needArr(doc, "palettes", where);
    const line0 = paletteWords(list, C.PALETTE_INIT, LINE_ENTRIES);
    const cycle = paletteWords(list, C.PALETTE_CYCLE, C.CYCLE_PERIOD + C.CYCLE_WINDOW);
    return { line0, cycle };
}
export function textureFromImage(id: number, img: IndexedImage, C: SegaConstants): Texture {
    const where = `texture ${id}`;
    const w = 2 * C.TEX_COLUMNS;
    const h = C.TEX_COLUMN_BYTES;
    if (img.width !== w || img.height !== h)
        throw new Error(`${where}: image is ${img.width} x ${img.height}, expected ${w} x ${h}`);
    if (img.pixels.length !== w * h)
        throw new Error(`${where}: ${img.pixels.length} pixels, expected ${w * h}`);
    const bytes = new Uint8Array(C.TEX_COLUMNS * C.TEX_COLUMN_BYTES);
    for (let c = 0; c < C.TEX_COLUMNS; c++) {
        for (let r = 0; r < h; r++) {
            const a = img.pixels[r * w + 2 * c]!;
            const b = img.pixels[r * w + 2 * c + 1]!;
            if (a > 15 || b > 15)
                throw new Error(`${where}: pixel (${a > 15 ? 2 * c : 2 * c + 1}, ${r}) is ${Math.max(a, b)}, above 15`);
            bytes[C.TEX_COLUMN_BYTES * c + r] = (a << 4) | b;
        }
    }
    return { id, bytes };
}
function int16Array(v: unknown, count: number, what: string): Int16Array {
    if (!Array.isArray(v))
        throw new Error(`trig_table: ${what} is not an array`);
    if (v.length !== count)
        throw new Error(`trig_table: ${what} has ${v.length} entries, expected ${count}`);
    const out = new Int16Array(count);
    for (let i = 0; i < count; i++) {
        const x = v[i];
        if (typeof x !== "number" || !Number.isInteger(x) || x < -32768 || x > 32767)
            throw new Error(`trig_table: ${what}[${i}] is ${JSON.stringify(x)}, not a signed 16-bit integer`);
        out[i] = x;
    }
    return out;
}
export function parseTrigTable(doc: unknown, C: SegaConstants): TrigTable {
    const where = "trig_table";
    if (needStr(doc, "format", where) !== TRIG_FORMAT)
        throw new Error(`${where}: format ${String(need(doc, "format", where))}, expected ${TRIG_FORMAT}`);
    if (needStr(doc, "name", where) !== TRIG_NAME)
        throw new Error(`${where}: name ${String(need(doc, "name", where))}, expected ${TRIG_NAME}`);
    const data = needObj(doc, "data", where);
    return {
        sin256: int16Array(need(data, "sin256", `${where} data`), C.ANGLES, "sin256"),
        negCos256: int16Array(need(data, "neg_cos256", `${where} data`), C.ANGLES, "neg_cos256"),
    };
}
export function serializeSegaAssets(a: SegaAssets): unknown {
    return {
        format: SEGA_ASSETS_SERIAL_FORMAT,
        line0: [...a.line0],
        cycle: [...a.cycle],
        textures: [...a.textures.values()].map((t) => ({ id: t.id, bytes: base64Encode(t.bytes) })),
        trig: { sin256: [...a.trig.sin256], negCos256: [...a.trig.negCos256] },
    };
}
function wordList(v: unknown, where: string, count?: number): number[] {
    if (!Array.isArray(v))
        throw new Error(`${where}: not an array`);
    if (count !== undefined && v.length !== count)
        throw new Error(`${where}: ${v.length} entries, expected ${count}`);
    for (const x of v)
        if (typeof x !== "number" || !Number.isInteger(x))
            throw new Error(`${where}: entry ${JSON.stringify(x)} is not an integer`);
    return v as number[];
}
export function deserializeSegaAssets(x: unknown): SegaAssets {
    const where = "sega assets";
    if (needStr(x, "format", where) !== SEGA_ASSETS_SERIAL_FORMAT)
        throw new Error(`${where}: format is not ${SEGA_ASSETS_SERIAL_FORMAT}`);
    const line0 = wordList(need(x, "line0", where), `${where} line0`, LINE_ENTRIES);
    const cycle = wordList(need(x, "cycle", where), `${where} cycle`);
    const textures = new Map<number, Texture>();
    needArr(x, "textures", where).forEach((t, i) => {
        const w = `${where} textures[${i}]`;
        const id = needInt(t, "id", w);
        if (textures.has(id))
            throw new Error(`${w}: texture ${id} appears twice`);
        textures.set(id, { id, bytes: base64Decode(needStr(t, "bytes", w)) });
    });
    const trig = needObj(x, "trig", where);
    const sin = wordList(need(trig, "sin256", `${where} trig`), `${where} trig.sin256`);
    const cos = wordList(need(trig, "negCos256", `${where} trig`), `${where} trig.negCos256`);
    if (sin.length !== cos.length)
        throw new Error(`${where}: trig arrays differ in length (${sin.length}, ${cos.length})`);
    for (const v of [...sin, ...cos])
        if (v < -32768 || v > 32767)
            throw new Error(`${where}: trig entry ${v} is not a signed 16-bit integer`);
    return { line0, cycle, textures, trig: { sin256: Int16Array.from(sin), negCos256: Int16Array.from(cos) } };
}

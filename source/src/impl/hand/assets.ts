import type { IndexedImage } from "../boot/png.js";
import type { HandConstants } from "./constants.js";
import type { HandAssets, HandGraphic, HandPart, SwingRow, SwingSprite } from "./types.js";
export interface HandAssetsDoc {
    readonly format: typeof HAND_ASSETS_DOC_FORMAT;
    readonly [k: string]: unknown;
}
export const HAND_ASSETS_DOC_FORMAT = "zt-hand-assets/1";
export const WEAPONS_DOC_FORMAT = "ztassets-weapons/1";
const TILE_PX = 8;
const TILE_ROW_BYTES = 4;
const TILE_BYTES = TILE_PX * TILE_ROW_BYTES;
const NIBBLE_BITS = 4;
const NIBBLE_MASK = 0x0f;
const CRAM_WORDS = 16;
const HEX = 16;
const WHERE = "weapons.json";
type Obj = Record<string, unknown>;
function fail(msg: string): never {
    throw new Error(`${WHERE}: ${msg}`);
}
function isObj(v: unknown): v is Obj {
    return !!v && typeof v === "object" && !Array.isArray(v);
}
function obj(v: unknown, what: string): Obj {
    if (!isObj(v))
        fail(`${what} is not an object`);
    return v;
}
function arr(v: unknown, what: string): unknown[] {
    if (!Array.isArray(v))
        fail(`${what} is not an array`);
    return v;
}
function int(v: unknown, what: string): number {
    if (typeof v !== "number" || !Number.isInteger(v))
        fail(`${what} is not an integer (${JSON.stringify(v)})`);
    return v;
}
function str(v: unknown, what: string): string {
    if (typeof v !== "string" || v.length === 0)
        fail(`${what} is not a non-empty string`);
    return v;
}
function word(v: unknown, what: string): number {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n !== "number" || !Number.isInteger(n))
        fail(`${what} is not a word (${JSON.stringify(v)})`);
    return n;
}
function cutTile(img: IndexedImage, columns: number, index: number): Uint8Array {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const out = new Uint8Array(TILE_BYTES);
    for (let y = 0; y < TILE_PX; y++) {
        for (let bx = 0; bx < TILE_ROW_BYTES; bx++) {
            const o = (row * TILE_PX + y) * img.width + col * TILE_PX + bx * 2;
            const left = img.pixels[o]!;
            const right = img.pixels[o + 1]!;
            out[y * TILE_ROW_BYTES + bx] = (left << NIBBLE_BITS) | right;
        }
    }
    return out;
}
function parsePart(v: unknown, where: string): HandPart {
    const p = obj(v, where);
    return {
        name: str(p["name"], `${where}.name`),
        attrWord: word(p["attr_word"], `${where}.attr_word`),
        w: int(p["tiles_w"], `${where}.tiles_w`),
        h: int(p["tiles_h"], `${where}.tiles_h`),
        tileOffset: int(p["tile_offset"], `${where}.tile_offset`),
    };
}
function parseSprite(v: unknown, where: string): SwingSprite {
    const s = obj(v, where);
    return {
        attrWord: word(s["attr_word"], `${where}.attr_word`),
        w: int(s["tiles_w"], `${where}.tiles_w`),
        h: int(s["tiles_h"], `${where}.tiles_h`),
        satX: int(s["sat_x"], `${where}.sat_x`),
        satY: int(s["sat_y"], `${where}.sat_y`),
    };
}
export function handAssetsFrom(doc: unknown, sheets: ReadonlyMap<string, IndexedImage>, C: HandConstants): HandAssets {
    const d = obj(doc, "the document");
    if (d["format"] !== WEAPONS_DOC_FORMAT)
        fail(`format ${JSON.stringify(d["format"])}, expected ${WEAPONS_DOC_FORMAT}`);
    const entries = arr(d["entries"], "entries");
    if (entries.length === 0)
        fail("no entries");
    interface Pre {
        name: string;
        itemIds: number[];
        tiles: Uint8Array[];
        origin: {
            x: number;
            y: number;
        } | null;
        parts: HandPart[];
    }
    const pre: Pre[] = [];
    const seen = new Set<string>();
    entries.forEach((ev, ei) => {
        const e = obj(ev, `entries[${ei}]`);
        const name = str(e["name"], `entries[${ei}].name`);
        const where = `entry ${name}`;
        if (seen.has(name))
            fail(`${where} appears twice`);
        seen.add(name);
        const tileCount = int(e["tiles"], `${where}.tiles`);
        const columns = int(e["columns"], `${where}.columns`);
        if (tileCount < 1 || columns < 1)
            fail(`${where}: tiles ${tileCount}, columns ${columns}`);
        if (tileCount > C.WINDOW_TILES)
            fail(`${where}: ${tileCount} tiles do not fit the window of ${C.WINDOW_TILES}`);
        const img = sheets.get(name);
        if (!img)
            fail(`${where}: no decoded tile sheet`);
        if (img.width !== columns * TILE_PX)
            fail(`${where}: sheet width ${img.width}, expected ${columns} x ${TILE_PX}`);
        const rowsNeeded = Math.ceil(tileCount / columns);
        if (img.height < rowsNeeded * TILE_PX)
            fail(`${where}: sheet height ${img.height}, ${rowsNeeded} rows of tiles needed`);
        if (img.pixels.length < img.width * img.height)
            fail(`${where}: sheet pixels ${img.pixels.length}, expected ${img.width * img.height}`);
        for (let i = 0; i < img.width * img.height; i++) {
            if (img.pixels[i]! > NIBBLE_MASK)
                fail(`${where}: pixel ${i} is ${img.pixels[i]}, not a colour index 0..${NIBBLE_MASK}`);
        }
        const tiles: Uint8Array[] = [];
        for (let i = 0; i < tileCount; i++)
            tiles.push(cutTile(img, columns, i));
        const itemIds = arr(e["item_ids"], `${where}.item_ids`).map((x, i) => int(x, `${where}.item_ids[${i}]`));
        let origin: {
            x: number;
            y: number;
        } | null = null;
        if (e["sat_origin"] !== undefined) {
            const o = obj(e["sat_origin"], `${where}.sat_origin`);
            origin = { x: int(o["x"], `${where}.sat_origin.x`), y: int(o["y"], `${where}.sat_origin.y`) };
        }
        const parts = arr(e["parts"], `${where}.parts`).map((p, i) => parsePart(p, `${where}.parts[${i}]`));
        for (const p of parts) {
            if (p.w < 1 || p.h < 1 || p.tileOffset < 0 || p.tileOffset + p.w * p.h > C.WINDOW_TILES) {
                fail(`${where}: part ${p.name} (${p.w} x ${p.h} at tile ${p.tileOffset}) lies outside the window`);
            }
        }
        pre.push({ name, itemIds, tiles, origin, parts });
    });
    const fists = pre.find((p) => p.name === "fists");
    const graphics = new Map<string, HandGraphic>();
    const graphicOfWeapon = new Map<number, string>();
    for (const p of pre) {
        const tiles = p.tiles.slice();
        const tileCount = tiles.length;
        while (tiles.length < C.WINDOW_TILES) {
            const filler = tiles.length === tileCount && fists && fists !== p ? fists.tiles[0]! : new Uint8Array(TILE_BYTES);
            tiles.push(filler.slice());
        }
        for (const id of p.itemIds) {
            const other = graphicOfWeapon.get(id);
            if (other !== undefined)
                fail(`weapon ${id} is listed by two entries (${other} and ${p.name})`);
            graphicOfWeapon.set(id, p.name);
        }
        graphics.set(p.name, { name: p.name, itemIds: p.itemIds, tileCount, tiles, origin: p.origin, parts: p.parts });
    }
    const swings = new Map<number, SwingRow>();
    arr(d["swing_frames"], "swing_frames").forEach((rv, ri) => {
        const r = obj(rv, `swing_frames[${ri}]`);
        const direction = int(r["direction"], `swing_frames[${ri}].direction`);
        if (swings.has(direction))
            fail(`swing_frames: direction ${direction} appears twice`);
        const art = str(r["art"], `swing_frames[${ri}].art`);
        if (!graphics.has(art))
            fail(`swing_frames[${ri}]: art ${art} is not an entry`);
        const frames = arr(r["frames"], `swing_frames[${ri}].frames`).map((fv, fi) => arr(fv, `swing_frames[${ri}].frames[${fi}]`).map((s, si) => parseSprite(s, `swing_frames[${ri}].frames[${fi}][${si}]`)));
        swings.set(direction, { direction, art, frames });
    });
    if (swings.size === 0)
        fail("no swing_frames");
    const throwFrames = arr(d["throw_frames"], "throw_frames").map((s, i) => parseSprite(s, `throw_frames[${i}]`));
    const pal = obj(d["palette"], "palette");
    const paletteLine = int(pal["line"], "palette.line");
    const cramWords = arr(pal["cram_words"], "palette.cram_words").map((w, i) => word(w, `palette.cram_words[${i}]`));
    if (cramWords.length !== CRAM_WORDS)
        fail(`palette.cram_words has ${cramWords.length} words, expected ${CRAM_WORDS}`);
    return { graphics, graphicOfWeapon, swings, throwFrames, paletteLine, cramWords };
}
function toHex(b: Uint8Array): string {
    let s = "";
    for (const x of b)
        s += x.toString(HEX).padStart(2, "0");
    return s;
}
function fromHex(s: string, what: string): Uint8Array {
    if (s.length !== TILE_BYTES * 2 || !/^[0-9a-f]+$/.test(s))
        throw new Error(`${HAND_ASSETS_DOC_FORMAT}: ${what} is not ${TILE_BYTES} bytes of hex`);
    const out = new Uint8Array(TILE_BYTES);
    for (let i = 0; i < TILE_BYTES; i++)
        out[i] = parseInt(s.slice(i * 2, i * 2 + 2), HEX);
    return out;
}
export function handAssetsToDoc(a: HandAssets): HandAssetsDoc {
    return {
        format: HAND_ASSETS_DOC_FORMAT,
        paletteLine: a.paletteLine,
        cramWords: [...a.cramWords],
        graphics: [...a.graphics.values()].map((g) => ({
            name: g.name,
            itemIds: [...g.itemIds],
            tileCount: g.tileCount,
            tiles: g.tiles.map(toHex),
            origin: g.origin ? { x: g.origin.x, y: g.origin.y } : null,
            parts: g.parts.map((p) => ({ name: p.name, attrWord: p.attrWord, w: p.w, h: p.h, tileOffset: p.tileOffset })),
        })),
        swings: [...a.swings.values()].map((s) => ({
            direction: s.direction,
            art: s.art,
            frames: s.frames.map((f) => f.map((x) => ({ attrWord: x.attrWord, w: x.w, h: x.h, satX: x.satX, satY: x.satY }))),
        })),
        throwFrames: a.throwFrames.map((x) => ({ attrWord: x.attrWord, w: x.w, h: x.h, satX: x.satX, satY: x.satY })),
    };
}
export function handAssetsFromDoc(doc: unknown): HandAssets {
    const w = HAND_ASSETS_DOC_FORMAT;
    const bad = (m: string): never => {
        throw new Error(`${w}: ${m}`);
    };
    if (!isObj(doc))
        bad("not an object");
    const d = doc as Obj;
    if (d["format"] !== w)
        bad(`format ${JSON.stringify(d["format"])}, expected ${w}`);
    const num = (v: unknown, what: string): number => (typeof v === "number" && Number.isInteger(v) ? v : bad(`${what} is not an integer`));
    const list = (v: unknown, what: string): unknown[] => (Array.isArray(v) ? v : bad(`${what} is not an array`));
    const rec = (v: unknown, what: string): Obj => (isObj(v) ? v : bad(`${what} is not an object`));
    const text = (v: unknown, what: string): string => (typeof v === "string" ? v : bad(`${what} is not a string`));
    const graphics = new Map<string, HandGraphic>();
    const graphicOfWeapon = new Map<number, string>();
    list(d["graphics"], "graphics").forEach((gv, gi) => {
        const g = rec(gv, `graphics[${gi}]`);
        const name = text(g["name"], `graphics[${gi}].name`);
        if (graphics.has(name))
            bad(`graphic ${name} appears twice`);
        const itemIds = list(g["itemIds"], `${name}.itemIds`).map((x, i) => num(x, `${name}.itemIds[${i}]`));
        for (const id of itemIds) {
            if (graphicOfWeapon.has(id))
                bad(`weapon ${id} is listed by two graphics`);
            graphicOfWeapon.set(id, name);
        }
        const tiles = list(g["tiles"], `${name}.tiles`).map((t, i) => fromHex(text(t, `${name}.tiles[${i}]`), `${name}.tiles[${i}]`));
        let origin: {
            x: number;
            y: number;
        } | null = null;
        if (g["origin"] !== null) {
            const o = rec(g["origin"], `${name}.origin`);
            origin = { x: num(o["x"], `${name}.origin.x`), y: num(o["y"], `${name}.origin.y`) };
        }
        const parts = list(g["parts"], `${name}.parts`).map((pv, i): HandPart => {
            const p = rec(pv, `${name}.parts[${i}]`);
            return {
                name: text(p["name"], `${name}.parts[${i}].name`),
                attrWord: num(p["attrWord"], `${name}.parts[${i}].attrWord`),
                w: num(p["w"], `${name}.parts[${i}].w`),
                h: num(p["h"], `${name}.parts[${i}].h`),
                tileOffset: num(p["tileOffset"], `${name}.parts[${i}].tileOffset`),
            };
        });
        graphics.set(name, { name, itemIds, tileCount: num(g["tileCount"], `${name}.tileCount`), tiles, origin, parts });
    });
    if (graphics.size === 0)
        bad("no graphics");
    const swings = new Map<number, SwingRow>();
    list(d["swings"], "swings").forEach((sv, si) => {
        const s = rec(sv, `swings[${si}]`);
        const direction = num(s["direction"], `swings[${si}].direction`);
        if (swings.has(direction))
            bad(`swing direction ${direction} appears twice`);
        const frames = list(s["frames"], `swings[${si}].frames`).map((fv, fi) => list(fv, `swings[${si}].frames[${fi}]`).map((xv, xi): SwingSprite => {
            const x = rec(xv, `swings[${si}].frames[${fi}][${xi}]`);
            const at = `swings[${si}].frames[${fi}][${xi}]`;
            return { attrWord: num(x["attrWord"], at), w: num(x["w"], at), h: num(x["h"], at), satX: num(x["satX"], at), satY: num(x["satY"], at) };
        }));
        swings.set(direction, { direction, art: text(s["art"], `swings[${si}].art`), frames });
    });
    const cramWords = list(d["cramWords"], "cramWords").map((x, i) => num(x, `cramWords[${i}]`));
    if (cramWords.length !== CRAM_WORDS)
        bad(`cramWords has ${cramWords.length} words, expected ${CRAM_WORDS}`);
    const throwFrames = list(d["throwFrames"], "throwFrames").map((xv, i): SwingSprite => {
        const x = rec(xv, `throwFrames[${i}]`);
        const at = `throwFrames[${i}]`;
        return { attrWord: num(x["attrWord"], at), w: num(x["w"], at), h: num(x["h"], at), satX: num(x["satX"], at), satY: num(x["satY"], at) };
    });
    return { graphics, graphicOfWeapon, swings, throwFrames, paletteLine: num(d["paletteLine"], "paletteLine"), cramWords };
}

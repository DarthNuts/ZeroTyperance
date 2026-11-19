import { base64ToBytes, bytesToBase64 } from "../assets.js";
import type { TexturePixels } from "../assets.js";
import type { SpriteConstants } from "./constants.js";
import type { Art, Bank, BankState, BankView, CompositeEntry, FrameRecord, ItemArt, ItemEntry, ItemGeometry, SpriteAssets } from "./types.js";
export const SPRITE_ASSETS_DOC_FORMAT = "zt-sprite-assets/1";
export const ITEMS_FORMAT_PREFIX = "ztassets-items";
export const SPRITES_FORMAT_PREFIX = "ztassets-sprites";
export const PALETTES_FORMAT = "ztassets-palettes/1";
const LUT_KIND_BILLBOARD = "billboard";
const MIRRORED_SUFFIX = "_mirrored";
const REASON_COMPOSITE = "composite";
const DEFAULT_ORDER: readonly string[] = ["height", "width"];
export interface ItemGeometryDoc {
    readonly height: string;
    readonly width: string;
    readonly top: string;
    readonly left: string;
    readonly order: readonly string[];
}
export interface ItemDoc {
    readonly cls: number;
    readonly arts: ReadonlyArray<{
        readonly slot: number;
        readonly role: string;
    }>;
    readonly geometries: readonly ItemGeometryDoc[];
}
export interface FrameDoc {
    readonly cols: number;
    readonly rows: number;
    readonly slots: readonly number[];
    readonly flips: readonly number[];
    readonly w_num: number;
    readonly h_num: number;
    readonly xmode: number;
    readonly ymode: number;
}
export interface BankDoc {
    readonly name: string;
    readonly states: ReadonlyArray<{
        readonly view_mode: number;
        readonly views: ReadonlyArray<{
            readonly direction: number;
            readonly K: number;
            readonly frames: readonly FrameDoc[];
        }>;
    }>;
    readonly slots: number;
    readonly pool_b64: string;
}
export interface SpriteAssetsDoc {
    readonly format: typeof SPRITE_ASSETS_DOC_FORMAT;
    readonly item_arts_b64?: Readonly<Record<string, string>>;
    readonly items?: readonly ItemDoc[];
    readonly composites?: ReadonlyArray<{
        readonly cls: number;
        readonly bank: string;
        readonly state: number;
        readonly frame: number;
        readonly random: boolean;
    }>;
    readonly draws_nothing?: readonly number[];
    readonly banks?: readonly BankDoc[];
    readonly anim_lut?: ReadonlyArray<readonly number[]>;
    readonly shade_tables_b64?: Readonly<Record<string, string>>;
    readonly shade_arrays?: Readonly<Record<string, readonly string[]>>;
    readonly mode_arrays?: Readonly<Record<string, string>>;
    readonly night_array?: string | null;
    readonly [member: string]: unknown;
}
export interface BankSource {
    readonly name: string;
    readonly doc: unknown;
    readonly pool: TexturePixels;
}
export interface SpriteSources {
    readonly itemsDoc: unknown;
    readonly itemArts: ReadonlyArray<TexturePixels | undefined>;
    readonly spritesIndex: unknown;
    readonly banks: readonly BankSource[];
    readonly animLutDoc: unknown;
    readonly palettesDoc: unknown;
}
export interface SpriteAssetsExtra {
    compositeIsRandom(cls: number): boolean;
    readonly nightArray: string | null;
}
type Rec = Record<string, unknown>;
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
function isRec(v: unknown): v is Rec {
    return !!v && typeof v === "object" && !Array.isArray(v);
}
function isStr(v: unknown): v is string {
    return typeof v === "string" && v.length > 0;
}
function isByteList(v: unknown, n: number): v is number[] {
    return Array.isArray(v) && v.length === n && v.every((b) => isInt(b) && b >= 0 && b <= 255);
}
function parseHex(v: unknown, what: string): number {
    if (typeof v !== "string" || !/^0x[0-9A-Fa-f]+$/.test(v))
        throw new Error(`${what}: ${JSON.stringify(v)} is not a hex string`);
    return parseInt(v, 16);
}
function cutArt(what: string, img: TexturePixels, px0: number, py0: number, SC: SpriteConstants): Art {
    const rows = SC.ART_ROWS;
    const cols = SC.ART_COLUMNS;
    if (px0 + cols * 2 > img.width || py0 + rows > img.height)
        throw new Error(`${what}: the cell at (${px0}, ${py0}) lies outside the ${img.width} x ${img.height} picture`);
    const out = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            const left = img.pixels[(py0 + r) * img.width + px0 + 2 * c]!;
            const right = img.pixels[(py0 + r) * img.width + px0 + 2 * c + 1]!;
            if (left > 15 || right > 15)
                throw new Error(`${what}: a pixel above 15 at row ${r}`);
            out[c * rows + r] = (left << 4) | right;
        }
    }
    return out;
}
function itemArtOf(slot: number, img: TexturePixels, SC: SpriteConstants): Art {
    if (img.width !== SC.ART_COLUMNS * 2 || img.height !== SC.ART_ROWS)
        throw new Error(`items/art_${slot}: ${img.width} x ${img.height} pixels, expected ${SC.ART_COLUMNS * 2} x ${SC.ART_ROWS}`);
    return cutArt(`items/art_${slot}`, img, 0, 0, SC);
}
function geometryOf(g: unknown, what: string): ItemGeometryDoc {
    if (!isRec(g) || !isStr(g.height) || !isStr(g.width) || !isStr(g.top) || !isStr(g.left))
        throw new Error(`${what}: a geometry without height, width, top and left strings`);
    let order: readonly string[] = DEFAULT_ORDER;
    if (g.order !== undefined) {
        if (!Array.isArray(g.order) || g.order.length !== 2 || !g.order.every((o) => o === "height" || o === "width") || g.order[0] === g.order[1]) {
            throw new Error(`${what}: order is not a permutation of height and width`);
        }
        order = g.order as string[];
    }
    return { height: g.height, width: g.width, top: g.top, left: g.left, order: [...order] };
}
function checkDocFormat(d: unknown, file: string, prefix: string): Rec {
    if (!isRec(d))
        throw new Error(`${file}: not an object`);
    if (typeof d.format !== "string" || !d.format.startsWith(prefix))
        throw new Error(`${file}: format ${String(d.format)}, expected ${prefix}...`);
    return d;
}
function frameOf(f: unknown, what: string): FrameDoc {
    if (!isRec(f) || !isRec(f.cells) || !isInt(f.cells.w) || !isInt(f.cells.h))
        throw new Error(`${what}: a frame without cells {w, h}`);
    const cols = f.cells.w;
    const rows = f.cells.h;
    if (cols < 1 || rows < 1)
        throw new Error(`${what}: frame of ${cols} x ${rows} cells`);
    const n = cols * rows;
    if (!Array.isArray(f.cell_slots) || f.cell_slots.length !== n || !f.cell_slots.every((s) => isInt(s) && s >= 0))
        throw new Error(`${what}: cell_slots is not ${n} slot numbers`);
    if (!Array.isArray(f.cell_flip) || f.cell_flip.length !== n || !f.cell_flip.every(isInt))
        throw new Error(`${what}: cell_flip is not ${n} integers`);
    for (const k of ["w_num", "h_num", "xmode", "ymode"])
        if (!isInt(f[k]))
            throw new Error(`${what}: ${k} is not an integer`);
    return {
        cols,
        rows,
        slots: [...(f.cell_slots as number[])],
        flips: [...(f.cell_flip as number[])],
        w_num: f.w_num as number,
        h_num: f.h_num as number,
        xmode: f.xmode as number,
        ymode: f.ymode as number,
    };
}
function bankDocOf(src: BankSource, SC: SpriteConstants): {
    doc: BankDoc;
    romOffset: number;
} {
    const what = `sprites/${src.name}.json`;
    const d = checkDocFormat(src.doc, what, SPRITES_FORMAT_PREFIX);
    if (d.name !== src.name)
        throw new Error(`${what}: name ${String(d.name)}, expected ${src.name}`);
    const romOffset = parseHex(d.bank_rom_offset, `${what} bank_rom_offset`);
    if (!isRec(d.cell_pool) || !isInt(d.cell_pool.slots) || d.cell_pool.slots < 0)
        throw new Error(`${what}: no cell_pool.slots`);
    const slots = d.cell_pool.slots;
    const perRow = isInt(d.cell_pool.columns) ? d.cell_pool.columns : SC.ART_COLUMNS;
    if (perRow !== SC.ART_COLUMNS)
        throw new Error(`${what}: cell_pool.columns ${perRow}, expected ${SC.ART_COLUMNS}`);
    const cellPx = SC.ART_COLUMNS * 2;
    if (src.pool.width !== perRow * cellPx)
        throw new Error(`${what}: pool picture is ${src.pool.width} pixels wide, expected ${perRow * cellPx}`);
    if (src.pool.height < Math.ceil(slots / perRow) * SC.ART_ROWS)
        throw new Error(`${what}: pool picture is ${src.pool.height} pixels high, too small for ${slots} slots`);
    const pool = new Uint8Array(slots * SC.ART_COLUMNS * SC.ART_ROWS);
    for (let s = 0; s < slots; s++) {
        pool.set(cutArt(`${what} pool slot ${s}`, src.pool, (s % perRow) * cellPx, Math.floor(s / perRow) * SC.ART_ROWS, SC), s * SC.ART_COLUMNS * SC.ART_ROWS);
    }
    if (!Array.isArray(d.states))
        throw new Error(`${what}: no states`);
    const states = d.states.map((st: unknown, si: number) => {
        if (!isRec(st) || !isInt(st.view_mode) || !Array.isArray(st.views))
            throw new Error(`${what}: state ${si} has no view_mode and views`);
        if (st.index !== undefined && st.index !== si)
            throw new Error(`${what}: state at position ${si} has index ${String(st.index)}`);
        const views = st.views.map((v: unknown, vi: number) => {
            if (!isRec(v) || !isInt(v.direction) || !isInt(v.frame_count_word) || !Array.isArray(v.frames))
                throw new Error(`${what}: state ${si} view ${vi} has no direction, frame_count_word and frames`);
            const frames = v.frames.map((f: unknown, fi: number) => frameOf(f, `${what}: state ${si} view ${vi} frame ${fi}`));
            for (const f of frames)
                for (const s of f.slots)
                    if (s >= slots)
                        throw new Error(`${what}: state ${si} view ${vi} refers to pool slot ${s} of ${slots}`);
            return { direction: v.direction, K: v.frame_count_word, frames };
        });
        return { view_mode: st.view_mode, views };
    });
    return { doc: { name: src.name, states, slots, pool_b64: bytesToBase64(pool) }, romOffset };
}
export function spriteAssetsFrom(src: SpriteSources, SC: SpriteConstants): SpriteAssets & SpriteAssetsExtra & {
    readonly doc: SpriteAssetsDoc;
} {
    const items = checkDocFormat(src.itemsDoc, "items.json", ITEMS_FORMAT_PREFIX);
    if (!Array.isArray(items.items) || !Array.isArray(items.unmapped))
        throw new Error("items.json: no items[] and unmapped[]");
    const itemArtsB64: Record<string, string> = {};
    src.itemArts.forEach((img, slot) => {
        if (img)
            itemArtsB64[String(slot)] = bytesToBase64(itemArtOf(slot, img, SC));
    });
    const itemDocs: ItemDoc[] = items.items.map((it: unknown) => {
        if (!isRec(it) || !isInt(it.class) || !Array.isArray(it.arts) || it.arts.length < 1)
            throw new Error("items.json: an item without class and arts");
        const what = `items.json class ${it.class}`;
        const arts = it.arts.map((a: unknown) => {
            if (!isRec(a) || !isInt(a.slot) || a.slot < 0 || !isStr(a.role))
                throw new Error(`${what}: an art without slot and role`);
            if (itemArtsB64[String(a.slot)] === undefined)
                throw new Error(`${what}: art slot ${a.slot} has no picture (items/art_${String(a.slot).padStart(2, "0")}.png)`);
            return { slot: a.slot, role: a.role };
        });
        let geometries: ItemGeometryDoc[];
        if (Array.isArray(it.geometries)) {
            if (it.geometries.length !== arts.length)
                throw new Error(`${what}: ${it.geometries.length} geometries for ${arts.length} arts`);
            geometries = it.geometries.map((g: unknown) => geometryOf(g, what));
        }
        else {
            const g = geometryOf(it.geometry, what);
            geometries = arts.map(() => g);
        }
        return { cls: it.class, arts, geometries };
    });
    const idx = checkDocFormat(src.spritesIndex, "sprites/index.json", SPRITES_FORMAT_PREFIX);
    if (!Array.isArray(idx.banks))
        throw new Error("sprites/index.json: no banks[]");
    const bankDocs: BankDoc[] = [];
    const bankByOffset = new Map<number, string>();
    for (const b of idx.banks as unknown[]) {
        if (!isRec(b) || !isStr(b.name))
            throw new Error("sprites/index.json: a bank without a name");
        const name = b.name;
        const bs = src.banks.find((x) => x.name === name);
        if (!bs)
            throw new Error(`sprites/index.json: bank ${name} has no decoded source`);
        const { doc, romOffset } = bankDocOf(bs, SC);
        if (parseHex(b.bank_rom_offset, `sprites/index.json bank ${name}`) !== romOffset)
            throw new Error(`bank ${name}: bank_rom_offset differs between index.json and the bank file`);
        if (bankByOffset.has(romOffset))
            throw new Error(`sprites/index.json: two banks at ${b.bank_rom_offset}`);
        bankByOffset.set(romOffset, name);
        bankDocs.push(doc);
    }
    const composites: Array<{
        cls: number;
        bank: string;
        state: number;
        frame: number;
        random: boolean;
    }> = [];
    const drawsNothing: number[] = [];
    for (const u of items.unmapped as unknown[]) {
        if (!isRec(u) || !isInt(u.class))
            throw new Error("items.json: an unmapped entry without class");
        if (u.reason !== REASON_COMPOSITE) {
            drawsNothing.push(u.class);
            continue;
        }
        const what = `items.json composite class ${u.class}`;
        const bank = bankByOffset.get(parseHex(u.descriptor_rom_offset, `${what} descriptor_rom_offset`));
        if (bank === undefined)
            throw new Error(`${what}: no bank at ${String(u.descriptor_rom_offset)}`);
        if (!isInt(u.first_index) || u.first_index < 0)
            throw new Error(`${what}: first_index is not a state index`);
        const random = !isInt(u.variant);
        composites.push({ cls: u.class, bank, state: u.first_index, frame: random ? 0 : (u.variant as number), random });
    }
    const lutDoc = isRec(src.animLutDoc) ? src.animLutDoc : null;
    if (!lutDoc || !Array.isArray(lutDoc.values) || lutDoc.values.length < 1 || !lutDoc.values.every((r: unknown) => Array.isArray(r) && r.every(isInt)))
        throw new Error("anim_lut.json: no values (rows of frame numbers)");
    const animLut = (lutDoc.values as number[][]).map((r) => [...r]);
    const pal = checkDocFormat(src.palettesDoc, "palettes.json", PALETTES_FORMAT);
    if (pal.format !== PALETTES_FORMAT)
        throw new Error(`palettes.json: format ${String(pal.format)}, expected ${PALETTES_FORMAT}`);
    if (!Array.isArray(pal.shade_luts))
        throw new Error("palettes.json: no shade_luts");
    const tablesB64: Record<string, string> = {};
    for (const l of pal.shade_luts as unknown[]) {
        if (!isRec(l) || l.kind !== LUT_KIND_BILLBOARD)
            continue;
        if (!isStr(l.name) || !isByteList(l.map, 256))
            throw new Error("palettes.json: a billboard shade LUT without a name or a 256-byte map");
        tablesB64[l.name] = bytesToBase64(Uint8Array.from(l.map));
    }
    const bs = pal.billboard_shading;
    if (!isRec(bs) || !Array.isArray(bs.arrays))
        throw new Error("palettes.json: no billboard_shading.arrays");
    const arrays: Record<string, string[]> = {};
    for (const a of bs.arrays as unknown[]) {
        if (!isRec(a) || !isStr(a.name) || !Array.isArray(a.entries))
            throw new Error("palettes.json: a billboard shading array without name and entries");
        const entries: string[] = new Array<string>(a.entries.length);
        for (const e of a.entries as unknown[]) {
            if (!isRec(e) || !isInt(e.index) || e.index < 0 || e.index >= entries.length || !isStr(e.lut))
                throw new Error(`palettes.json: array ${a.name}: an entry without index and lut`);
            if (tablesB64[e.lut] === undefined)
                throw new Error(`palettes.json: array ${a.name} names the unknown table ${e.lut}`);
            entries[e.index] = e.lut;
        }
        if (entries.some((e) => e === undefined))
            throw new Error(`palettes.json: array ${a.name} has a gap in its indices`);
        arrays[a.name] = entries;
    }
    if (!Array.isArray(pal.render_modes))
        throw new Error("palettes.json: no render_modes");
    const modeArrays: Record<string, string> = {};
    for (const m of pal.render_modes as unknown[]) {
        if (!isRec(m) || !isInt(m.mode))
            throw new Error("palettes.json: a render mode without a number");
        if (m.billboard_array === undefined)
            continue;
        if (!isStr(m.billboard_array) || !arrays[m.billboard_array])
            throw new Error(`palettes.json: render mode ${m.mode} names the unknown array ${String(m.billboard_array)}`);
        modeArrays[String(m.mode)] = m.billboard_array;
    }
    const nv = pal.night_vision_render;
    if (!isRec(nv) || !isStr(nv.billboard_array))
        throw new Error("palettes.json: no night_vision_render.billboard_array; run the extractor again: py -3 -m tools.ztassets palettes <image> --out ztassets_out");
    if (!arrays[nv.billboard_array])
        throw new Error(`palettes.json: night_vision_render names the unknown array ${nv.billboard_array}`);
    const doc: SpriteAssetsDoc = {
        format: SPRITE_ASSETS_DOC_FORMAT,
        item_arts_b64: itemArtsB64,
        items: itemDocs,
        composites,
        draws_nothing: drawsNothing,
        banks: bankDocs,
        anim_lut: animLut,
        shade_tables_b64: tablesB64,
        shade_arrays: arrays,
        mode_arrays: modeArrays,
        night_array: nv.billboard_array,
    };
    const built = buildAssets(doc, SC);
    const randoms = new Set(composites.filter((c) => c.random).map((c) => c.cls));
    return Object.freeze({ ...built, compositeIsRandom: (cls: number) => randoms.has(cls), doc });
}
export function spriteAssetsFromDoc(doc: SpriteAssetsDoc, SC: SpriteConstants): SpriteAssets & SpriteAssetsExtra {
    const built = buildAssets(doc, SC);
    const randoms = new Set((doc.composites ?? []).filter((c) => c.random).map((c) => c.cls));
    return Object.freeze({ ...built, compositeIsRandom: (cls: number) => randoms.has(cls) });
}
function need<T>(v: T | undefined, member: string): T {
    if (v === undefined)
        throw new Error(`sprite assets: the document has no ${member}`);
    return v;
}
function buildAssets(doc: SpriteAssetsDoc, SC: SpriteConstants): SpriteAssets & {
    readonly nightArray: string | null;
} {
    if (doc.format !== SPRITE_ASSETS_DOC_FORMAT)
        throw new Error(`sprite assets: format ${String(doc.format)}, expected ${SPRITE_ASSETS_DOC_FORMAT}`);
    const artSize = SC.ART_COLUMNS * SC.ART_ROWS;
    const itemArts = new Map<number, Art>();
    for (const [k, v] of Object.entries(need(doc.item_arts_b64, "item_arts_b64"))) {
        const b = base64ToBytes(v);
        if (b.length !== artSize)
            throw new Error(`sprite assets: item art ${k} has ${b.length} bytes, expected ${artSize}`);
        itemArts.set(Number(k), b);
    }
    const items = new Map<number, ItemEntry>();
    for (const it of need(doc.items, "items")) {
        const arts: ItemArt[] = it.arts.map((a) => ({ slot: a.slot, role: a.role }));
        const geometries: ItemGeometry[] = it.geometries.map((g) => ({ height: g.height, width: g.width, top: g.top, left: g.left, order: [...g.order] }));
        items.set(it.cls, { cls: it.cls, arts, geometries });
    }
    const composites = new Map<number, CompositeEntry>();
    for (const c of need(doc.composites, "composites"))
        composites.set(c.cls, { cls: c.cls, bank: c.bank, state: c.state, frame: c.frame });
    const nothing = new Set(need(doc.draws_nothing, "draws_nothing"));
    const banks = new Map<string, Bank>();
    for (const bd of need(doc.banks, "banks")) {
        const pool = base64ToBytes(bd.pool_b64);
        if (pool.length !== bd.slots * artSize)
            throw new Error(`sprite assets: bank ${bd.name} has ${pool.length} pool bytes for ${bd.slots} slots`);
        const states: BankState[] = bd.states.map((st) => ({
            viewMode: st.view_mode,
            views: st.views.map((v): BankView => ({
                direction: v.direction,
                K: v.K,
                frames: v.frames.map((f): FrameRecord => ({ cols: f.cols, rows: f.rows, slots: [...f.slots], flips: [...f.flips], wNum: f.w_num, hNum: f.h_num, xmode: f.xmode, ymode: f.ymode })),
            })),
        }));
        const slots = bd.slots;
        banks.set(bd.name, {
            name: bd.name,
            states,
            cellArt: (slot: number): Art | null => (Number.isInteger(slot) && slot >= 0 && slot < slots ? pool.subarray(slot * artSize, (slot + 1) * artSize + 1) : null),
        });
    }
    const tables = new Map<string, Uint8Array>();
    for (const [k, v] of Object.entries(need(doc.shade_tables_b64, "shade_tables_b64"))) {
        const b = base64ToBytes(v);
        if (b.length !== 256)
            throw new Error(`sprite assets: shade table ${k} has ${b.length} bytes`);
        tables.set(k, b);
    }
    const arrays = need(doc.shade_arrays, "shade_arrays");
    const modeArrays = need(doc.mode_arrays, "mode_arrays");
    const animLut = need(doc.anim_lut, "anim_lut").map((r) => Object.freeze([...r]));
    const nightArray = doc.night_array ?? null;
    if (nightArray !== null && !arrays[nightArray])
        throw new Error(`sprite assets: night_array names the unknown array ${nightArray}`);
    return {
        nightArray,
        itemArt: (slot) => itemArts.get(slot) ?? null,
        item: (cls) => items.get(cls) ?? null,
        composite: (cls) => composites.get(cls) ?? null,
        drawsNothing: (cls) => nothing.has(cls),
        bank: (name) => banks.get(name) ?? null,
        animLut: Object.freeze(animLut),
        shadeTable: (name, mirrored) => tables.get(mirrored ? name + MIRRORED_SUFFIX : name) ?? null,
        shadeArray: (name) => arrays[name] ?? null,
        arrayOfMode: (mode) => modeArrays[String(mode)] ?? null,
    };
}

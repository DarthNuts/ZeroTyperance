import type { Command, Context, RomFile } from "../core.js";
import { encodePng } from "../png.js";
import { sha256Hex } from "../../boot/sha256.js";
const FORMAT = "ztassets-items/1";
const PORT_UNRENDERED = new Set([0x78]);
const OUT_DIR = "items";
const PAL_ROM = 0x20f2;
const PAL_LINE = 0;
const POOL_START = 0x10e9be;
const ART_BYTES = 0x200;
const POOL_SLOTS = 66;
const POOL_END = POOL_START + POOL_SLOTS * ART_BYTES;
const ART_COLS = 16;
const ART_W = 32;
const ART_H = 32;
const COLUMN_BYTES = 32;
const TABLE = 0x113f4;
const TABLE_ENTRIES = 107;
const CLASS_BASE = 0x18;
const CODE_SCAN_END = 0x20000;
const COMPOSITE_JMP = 0x1bd72;
const SCREEN_ROW_SITE = 0x113d6;
const SCREEN_ROW_WORDS = [0x3405, 0x362e, 0x8e1a, 0x966e, 0x916e, 0x0643, 0x0020, 0xc5c3, 0xec82, 0x0642, 0x0028];
const RTS_OPCODE = 0x4e75;
const MOVEA_A1 = 0x227c;
const SHEET_COLS = 16;
const SHEET_BG = [40, 40, 56];
const SHEET_SCALE = 2;
const SHEET_GAP = 2;
type Obj = Record<string, unknown>;
const CENTER = "sx - (width >> 1)";
const GEOMETRY: Record<string, Obj> = {
    "0x011A3A": { height: "S >> 1", width: "height >> 1", top: "sy - height", left: CENTER, bottom_anchored: true },
    "0x011A52": { height: "S >> 2", width: "height", top: "sy - height", left: CENTER, bottom_anchored: true },
    "0x011A0E": { height: "S", width: "height >> 1", top: "sy - height", left: CENTER, bottom_anchored: true },
    "0x011A24": { height: "S", width: "height >> 2", top: "sy - height", left: CENTER, bottom_anchored: true },
    "0x0115A0": { order: ["height", "width"], height: "S", width: "(S >> 1) + ((S >> 1) >> 2)", top: "sy - height", left: CENTER, bottom_anchored: true },
    "0x011608": { order: ["width", "height"], width: "S >> 1", height: "width >> 1", top: "sy - height", left: CENTER, bottom_anchored: true },
    "0x011676": { height: "(S >> 1) - ((S >> 1) >> 2)", width: "height >> 1", top: "sy - S", left: CENTER, bottom_anchored: false },
    "0x01189A": { height: "S - (S >> 2)", width: "height >> 1", top: "sy - height", left: CENTER, bottom_anchored: true },
    "0x0118BC": { height: "S >> 1", width: "height >> 2", top: "sy - height", left: CENTER, bottom_anchored: true },
    "0x0118DA": { order: ["width", "height"], width: "S >> 1", height: "width - (width >> 2)", top: "sy - height", left: CENTER, bottom_anchored: true },
    "0x0118FC": { height: "S >> 2", width: "height >> 1", top: "sy - S", left: CENTER, bottom_anchored: false },
    "0x011940": { order: ["width", "height"], width: "S >> 1", height: "width >> 2", top: "sy - S", left: CENTER, bottom_anchored: false },
    "0x01191A/1": { order: ["width", "height"], width: "S >> 2", height: "width >> 1", top: "sy - S", left: CENTER, bottom_anchored: false },
    ground_scaled: {
        order: ["width", "height"], width: "S >> 1", height: "(((S >> 2) * (32 + eye - z)) >> 6)", top: "sy - (height >> 1)",
        left: CENTER, bottom_anchored: false, needs: ["eye", "z"],
        note: "height scales with the player's height above the floor; the sprite is vertically centred on sy",
    },
};
interface EntrySpec {
    geometry: string[];
    sites: Array<[
        number,
        string
    ]>;
    animation?: Obj;
}
const SEL = "global animation phase counter, bit 1: clear -> frame 0, set -> frame 1";
const simple = (g: string, site: number): EntrySpec => ({ geometry: [g], sites: [[site, "art"]] });
const ENTRIES = new Map<number, EntrySpec>([
    [0x0115a0, { geometry: ["0x0115A0"], sites: [[0x115b4, "art"]], animation: { flip: "mirrored on odd values of the global animation phase counter" } }],
    [0x0115cc, simple("0x011A3A", 0x115cc)],
    [0x0115d6, simple("0x011A3A", 0x115d6)],
    [0x0115e0, simple("0x011A52", 0x115e0)],
    [0x0115ea, simple("0x011A52", 0x115ea)],
    [0x0115f4, simple("0x011A52", 0x115f4)],
    [0x0115fe, simple("0x011A52", 0x115fe)],
    [0x011608, simple("0x011608", 0x11608)],
    [0x011626, simple("0x011A52", 0x11626)],
    [0x011630, simple("0x011A52", 0x11630)],
    [0x01163a, simple("0x011A52", 0x1163a)],
    [0x011644, simple("0x011A52", 0x11644)],
    [0x01164e, simple("0x011A52", 0x1164e)],
    [0x011658, simple("0x011A52", 0x11658)],
    [0x011662, simple("0x011A52", 0x11662)],
    [0x01166c, simple("0x011A52", 0x1166c)],
    [0x011676, { geometry: ["0x011676"], sites: [[0x11690, "frame 0"], [0x116a0, "frame 1"]], animation: { selector: SEL } }],
    [0x011868, simple("0x011A0E", 0x11868)],
    [0x011872, simple("0x011A0E", 0x11872)],
    [0x01187c, simple("0x011A24", 0x1187c)],
    [0x011886, simple("0x011A24", 0x11886)],
    [0x011890, simple("0x011A24", 0x11890)],
    [0x01189a, simple("0x01189A", 0x1189a)],
    [0x0118bc, simple("0x0118BC", 0x118bc)],
    [0x0118da, simple("0x0118DA", 0x118da)],
    [0x0118fc, simple("0x0118FC", 0x118fc)],
    [0x01191a, {
            geometry: ["0x01191A/1", "ground_scaled"], sites: [[0x1191e, "sprite 1"], [0x1198e, "sprite 2"]],
            animation: { sprites: "two sprites are drawn with the unmodified inputs: sprite 1 above, then sprite 2 centred on sy" },
        }],
    [0x011940, simple("0x011940", 0x11940)],
    [0x01195e, { geometry: ["0x0118FC"], sites: [[0x1195e, "frame 0"], [0x1196c, "frame 1"]], animation: { selector: SEL } }],
    [0x0119be, {
            geometry: ["ground_scaled"], sites: [[0x119c2, "frame 0"]],
            animation: {
                selector: "phase = global animation phase counter & 3: phases 1 and 2 use the art 0x200 bytes after the listed one; phases 2 and 3 are mirrored",
                second_art_offset: ART_BYTES,
            },
        }],
]);
const RTS_ENTRIES = [0x0115ca, 0x013298];
const COMPOSITE = new Map<number, [
    number,
    number,
    number | null
]>([
    [0x011736, [0x1a7828, 0, 0]], [0x01174a, [0x17ba80, 0, 0]], [0x01175e, [0x1b7b38, 0, 0]],
    [0x011772, [0x1cb96a, 0, 2]], [0x011788, [0x1b7b38, 0xb, 0]],
    [0x01179c, [0x16ec58, 4, 0]], [0x0117b0, [0x1a7828, 6, 0]], [0x0117c4, [0x1acc72, 9, null]],
    [0x0117f0, [0x18d078, 7, 0]], [0x011804, [0x183b94, 6, 0]], [0x011818, [0x1784f2, 6, 0]],
    [0x01182c, [0x17ba80, 4, 0]], [0x011840, [0x193f00, 9, 0]], [0x011854, [0x19d50c, 4, 0]],
]);
const COMPOSITE_START = new Map<number, number>([[0x0117c4, 0x0117dc]]);
const COMPOSITE_PREFIX = new Map<number, string>([[0x0117c4, "424748e7e0004eb900000a5c02423f00670252474cdf0007"]]);
const hex = (n: number): string => "0x" + n.toString(16).toUpperCase();
const hex4 = (n: number): string => "0x" + n.toString(16).toUpperCase().padStart(4, "0");
const hex2 = (n: number): string => "0x" + n.toString(16).toUpperCase().padStart(2, "0");
const pad2 = (n: number): string => String(n).padStart(2, "0");
const sortNum = (a: Iterable<number>): number[] => [...a].sort((x, y) => x - y);
function cramToRgb(word: number): [
    number,
    number,
    number
] {
    return [((word >> 1) & 7) * 36, ((word >> 5) & 7) * 36, ((word >> 9) & 7) * 36];
}
function unpackArt(raw: Uint8Array): Uint8Array {
    if (raw.length !== ART_BYTES)
        throw new Error(`art data must be ${ART_BYTES} bytes`);
    const px = new Uint8Array(ART_W * ART_H);
    for (let col = 0; col < ART_COLS; col++) {
        for (let row = 0; row < ART_H; row++) {
            const b = raw[col * COLUMN_BYTES + row]!;
            px[row * ART_W + col * 2] = b >> 4;
            px[row * ART_W + col * 2 + 1] = b & 15;
        }
    }
    return px;
}
function packArt(px: Uint8Array): Uint8Array {
    const raw = new Uint8Array(ART_BYTES);
    for (let col = 0; col < ART_COLS; col++) {
        for (let row = 0; row < ART_H; row++) {
            raw[col * COLUMN_BYTES + row] = (px[row * ART_W + col * 2]! << 4) | px[row * ART_W + col * 2 + 1]!;
        }
    }
    return raw;
}
const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
function contactSheet(pixelSets: Uint8Array[], rgb16: Array<[
    number,
    number,
    number
]>) {
    const s = SHEET_SCALE;
    const cell = ART_W * s;
    const rows = Math.floor((pixelSets.length + SHEET_COLS - 1) / SHEET_COLS);
    const w = SHEET_COLS * cell + (SHEET_COLS - 1) * SHEET_GAP;
    const h = rows * cell + (rows - 1) * SHEET_GAP;
    const buf = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++)
        buf.set(SHEET_BG, i * 3);
    const lut = Array.from({ length: 16 }, (_, v) => (v ? rgb16[v]! : (SHEET_BG as [
        number,
        number,
        number
    ])));
    const cells: Obj[] = [];
    pixelSets.forEach((px, i) => {
        const gx = (i % SHEET_COLS) * (cell + SHEET_GAP);
        const gy = Math.floor(i / SHEET_COLS) * (cell + SHEET_GAP);
        for (let y = 0; y < ART_H * s; y++) {
            let o = ((gy + y) * w + gx) * 3;
            const base = Math.floor(y / s) * ART_W;
            for (let x = 0; x < ART_W; x++) {
                const c = lut[px[base + x]!]!;
                for (let k = 0; k < s; k++) {
                    buf.set(c, o);
                    o += 3;
                }
            }
        }
        cells.push({ index: i, x: gx, y: gy });
    });
    return { png: encodePng({ width: w, height: h, mode: "RGB", pixels: buf, level: 9 }), w, h, cells };
}
function scanArtLoads(rom: RomFile): Map<number, number[]> {
    const data = rom.bytesAt(0, CODE_SCAN_END);
    const sites = new Map<number, number[]>();
    for (let o = 0; o < CODE_SCAN_END - 5; o += 2) {
        if (data[o] === 0x22 && data[o + 1] === 0x7c) {
            const v = ((data[o + 2]! << 24) >>> 0) + (data[o + 3]! << 16) + (data[o + 4]! << 8) + data[o + 5]!;
            if (v >= POOL_START && v < POOL_END && (v - POOL_START) % ART_BYTES === 0) {
                const l = sites.get(v);
                if (l)
                    l.push(o);
                else
                    sites.set(v, [o]);
            }
        }
    }
    return sites;
}
function parseComposite(rom: RomFile, entry: number): [
    number,
    number,
    number | null
] {
    let p = COMPOSITE_START.get(entry) ?? entry;
    const prefix = COMPOSITE_PREFIX.get(entry);
    if (prefix !== undefined) {
        const want = Uint8Array.from(prefix.match(/../g)!.map((h) => parseInt(h, 16)));
        if (!same(rom.bytesAt(entry, want.length), want))
            throw new Error(`composite entry ${hex(entry)}: unexpected random-variant prefix`);
    }
    if (rom.u16be(p) !== MOVEA_A1)
        throw new Error(`composite entry ${hex(entry)}: no movea.l #desc,a1`);
    const desc = rom.u32be(p + 2);
    p += 6;
    if (rom.u16be(p) !== 0x303c)
        throw new Error(`composite entry ${hex(entry)}: no move.w #i,d0`);
    const idx0 = rom.u16be(p + 2);
    p += 4;
    const op = rom.u16be(p);
    let variant: number | null;
    if (op === 0x4243) {
        variant = 0;
        p += 2;
    }
    else if (op === 0x363c) {
        variant = rom.u16be(p + 2);
        p += 4;
    }
    else if (op === 0x3607) {
        variant = null;
        p += 2;
    }
    else
        throw new Error(`composite entry ${hex(entry)}: unexpected variant setup ${hex4(op)}`);
    if (rom.u16be(p) !== 0x4247 || rom.u16be(p + 2) !== 0x4ef9 || rom.u32be(p + 4) !== COMPOSITE_JMP) {
        throw new Error(`composite entry ${hex(entry)} does not end in clr.w d7 / jmp ${hex(COMPOSITE_JMP)}`);
    }
    return [desc, idx0, variant];
}
export const items: Command = {
    name: "items",
    run(ctx: Context) {
        const rom = ctx.rom;
        const words = Array.from({ length: 16 }, (_, i) => rom.u16be(PAL_ROM + (PAL_LINE * 16 + i) * 2));
        const rgb = words.map(cramToRgb);
        const flatPal: number[] = [];
        for (const c of rgb)
            flatPal.push(c[0], c[1], c[2]);
        const palArgs = { palette_rom: hex(PAL_ROM), palette_line: PAL_LINE };
        const table = Array.from({ length: TABLE_ENTRIES }, (_, i) => rom.u32be(TABLE + 4 * i));
        const known = new Set<number>([...ENTRIES.keys(), ...COMPOSITE.keys(), ...RTS_ENTRIES]);
        const stray = sortNum(new Set(table.filter((e) => !known.has(e))));
        if (stray.length)
            throw new Error(`dispatch table names entries this command does not know: ${stray.map(hex).join(", ")}`);
        const tset = new Set(table);
        for (const e of [...ENTRIES.keys(), ...COMPOSITE.keys()])
            if (!tset.has(e))
                throw new Error("an expected entry is missing from the dispatch table");
        for (const e of RTS_ENTRIES)
            if (rom.u16be(e) !== RTS_OPCODE)
                throw new Error(`entry ${hex(e)} is not a bare return`);
        SCREEN_ROW_WORDS.forEach((w, i) => {
            if (rom.u16be(SCREEN_ROW_SITE + 2 * i) !== w)
                throw new Error(`the screen-row computation at ${hex(SCREEN_ROW_SITE)} is not as documented`);
        });
        const loads = scanArtLoads(rom);
        const rawPool = rom.bytesAt(POOL_START, POOL_SLOTS * ART_BYTES);
        const pixels: Uint8Array[] = [];
        for (let i = 0; i < POOL_SLOTS; i++) {
            const raw = rawPool.subarray(i * ART_BYTES, (i + 1) * ART_BYTES);
            const px = unpackArt(raw);
            if (!same(packArt(px), raw))
                throw new Error(`art ${i} does not survive its own pack/unpack round trip`);
            pixels.push(px);
        }
        if (Math.max(...loads.keys()) >= POOL_END)
            throw new Error("an art load lies past the pool end");
        const itemsOut: Obj[] = [];
        const unmapped: Obj[] = [];
        const artItems: number[][] = Array.from({ length: POOL_SLOTS }, () => []);
        let nRts = 0, nComp = 0;
        table.forEach((entry, index) => {
            const cls = CLASS_BASE + index;
            const base: Obj = { class: cls, class_hex: hex2(cls), entry_rom_offset: hex(entry), item_id: index };
            const spec = ENTRIES.get(entry);
            if (spec) {
                const arts: Obj[] = [];
                for (const [site, role] of spec.sites) {
                    if (rom.u16be(site) !== MOVEA_A1)
                        throw new Error(`class ${hex2(cls)}: no 'movea.l #art,a1' at ${hex(site)}`);
                    const art = rom.u32be(site + 2);
                    if (!(art >= POOL_START && art < POOL_END && (art - POOL_START) % ART_BYTES === 0))
                        throw new Error(`class ${hex2(cls)}: art ${hex(art)} is not in the pool`);
                    if (!(loads.get(art) ?? []).includes(site))
                        throw new Error(`class ${hex2(cls)}: load site ${hex(site)} not found by the scan`);
                    const slot = (art - POOL_START) / ART_BYTES;
                    arts.push({ png: `art_${pad2(slot)}.png`, role, rom_offset: hex(art), site_rom_offset: hex(site), slot });
                    artItems[slot]!.push(index);
                }
                const geos: Obj[] = spec.geometry.map((g) => ({ ...GEOMETRY[g]!, variant: g }));
                const item: Obj = {
                    ...base, arts,
                    anchor: { x: "center", y: geos.every((g) => g["bottom_anchored"]) ? "bottom" : "floating" },
                    anchor_px: { x: ART_W / 2, y: ART_H },
                    outside_port_guard: PORT_UNRENDERED.has(cls), px: { h: ART_H, w: ART_W }, status: "mapped",
                };
                if (geos.length === 1)
                    item["geometry"] = geos[0];
                else
                    item["geometries"] = geos;
                if (spec.animation)
                    item["animation"] = { ...spec.animation };
                itemsOut.push(item);
            }
            else if (COMPOSITE.has(entry)) {
                const [desc, idx0, variant] = parseComposite(rom, entry);
                const want = COMPOSITE.get(entry)!;
                if (desc !== want[0] || idx0 !== want[1] || variant !== want[2]) {
                    throw new Error(`composite entry ${hex(entry)} decodes to ${JSON.stringify([desc, idx0, variant])}, expected ${JSON.stringify(want)}`);
                }
                nComp++;
                unmapped.push({
                    ...base, descriptor_rom_offset: hex(desc), first_index: idx0, reason: "composite",
                    variant: variant === null ? "random: 1 when (random word & 0x3F00) != 0, else 0" : variant,
                    detail: "multi-cell billboard drawn by the composite renderer from a descriptor tree; its cell arts are enemy sprite-bank data, not pool arts",
                });
            }
            else {
                nRts++;
                unmapped.push({ ...base, reason: "rts", detail: "the entry returns at once: the class draws no billboard" });
            }
        });
        const entries: Obj[] = [];
        for (let i = 0; i < POOL_SLOTS; i++) {
            const raw = rawPool.subarray(i * ART_BYTES, (i + 1) * ART_BYTES);
            const rel = `art_${pad2(i)}.png`;
            const off = POOL_START + i * ART_BYTES;
            const png = encodePng({ width: ART_W, height: ART_H, mode: "P", pixels: pixels[i]!, palette: flatPal, bits: 4, level: 9 });
            ctx.writeBytes(`${OUT_DIR}/${rel}`, png, { ...palArgs, rom_offset: hex(off), slot: i });
            const refs = sortNum(loads.get(off) ?? []);
            const e: Obj = {
                anchor: { x: ART_W / 2, y: ART_H }, anchor_kind: "bottom-center", bytes: ART_BYTES, cells: { h: 1, w: 1 },
                code_sites: refs.map(hex), height: ART_H, item_ids: sortNum(new Set(artItems[i]!)), name: `art_${pad2(i)}`, png: rel,
                px: { h: ART_H, w: ART_W }, rom_offset: hex(off), slot: i,
                sha256_pixels: sha256Hex(pixels[i]!), sha256_rom: sha256Hex(raw), width: ART_W,
            };
            if (!refs.length && !artItems[i]!.length)
                e["note"] = "no `movea.l #art,a1` names this art: reached by index arithmetic from a neighbouring base, or unused";
            entries.push(e);
        }
        ctx.say(`items: ${POOL_SLOTS} arts from ${hex(POOL_START)}, ${itemsOut.length} classes mapped, ${nComp} composite, ${nRts} return at once`);
        for (const [baseSite, baseSlot, count, note] of [
            [0x15af0, 63, 3, "0x1167BE + (2 - phase) * 0x200, phase 0..2"],
            [0x119c2, 58, 2, "0x115DBE, +0x200 for phases 1 and 2"],
        ] as Array<[
            number,
            number,
            number,
            string
        ]>) {
            if (rom.u16be(baseSite) !== MOVEA_A1 || rom.u32be(baseSite + 2) !== POOL_START + baseSlot * ART_BYTES)
                throw new Error(`computed-reference site ${hex(baseSite)} changed`);
            for (let k = 0; k < count; k++) {
                const e = entries[baseSlot + k]!;
                const l = (e["computed_from"] as Obj[] | undefined) ?? [];
                l.push({ base_site_rom_offset: hex(baseSite), note });
                e["computed_from"] = l;
            }
        }
        const sheet = contactSheet(pixels, rgb);
        ctx.writeBytes(`${OUT_DIR}/contact_sheet.png`, sheet.png, { ...palArgs, set: "contact_sheet" });
        const mappedClasses = sortNum(itemsOut.map((i) => i["class"] as number));
        const index: Obj = {
            contact_sheet: {
                background: [...SHEET_BG], cell: { h: ART_H * SHEET_SCALE, w: ART_W * SHEET_SCALE },
                cells: sheet.cells, columns: SHEET_COLS, gap: SHEET_GAP, height: sheet.h, png: "contact_sheet.png",
                scale: SHEET_SCALE, transparent_index: 0, width: sheet.w,
                note: "RGB; art i at column i % 16, row i // 16; index 0 shown as the background",
            },
            counts: { composite: nComp, mapped: itemsOut.length, return_at_once: nRts, table_entries: TABLE_ENTRIES },
            dispatch_table: { class_base: CLASS_BASE, entries: TABLE_ENTRIES, rom_offset: hex(TABLE) },
            entries,
            format: FORMAT,
            geometry_variants: GEOMETRY,
            items: itemsOut,
            notes: [
                "Art format: 32x32, 4 bits per pixel, column-major (16 columns of 32 bytes; byte c*32+r holds " +
                    "the pixels x=2c (high nibble) and x=2c+1 of row r). PNG pixel values are the raw 4-bit indices.",
                "item_id is the dispatch-table index (class - 0x18). Classes are listed in `items` (mapped to " +
                    "art + geometry) or `unmapped` (reason rts / composite); together they cover all 107 slots.",
                "Class 0x78 is mapped by the ROM table but the port's item dispatcher does not render it " +
                    "(its switch covers 0x18..0x82; 0x82 renders since 2026-10-09); it carries outside_port_guard = true.",
                "Arts 21..45 (and a few others) are named by no in-code load: they are reached through index " +
                    "arithmetic from a neighbouring base or unused; they are written because they lie inside the pool.",
                "The palette is CRAM line 0 of the maze table; the shade tables map indices to indices, so the " +
                    "PNG indices are the raw art values.",
            ],
            palette: {
                cram_words: words.map(hex4), line: PAL_LINE, rgb: rgb.map((c) => [...c]), rom_offset: hex(PAL_ROM),
                evidence: "billboards are plotted into the wall renderer's tile stream, whose name-table words (0x8001..) carry palette bits 0",
            },
            screen_row: {
                expression: "((S * (32 + eye - z)) >> 6) + 40", rom_offset: hex(SCREEN_ROW_SITE),
                note: "sy, the row a billboard stands on, from the record's depth/scale word S and the eye-height " +
                    "offset word and the player's height word; sx is the record's screen column",
            },
            pool: { art_bytes: ART_BYTES, end_rom_offset: hex(POOL_END), mapped_classes: mappedClasses, rom_offset: hex(POOL_START), slots: POOL_SLOTS },
            unmapped,
        };
        (index["screen_row"] as Obj)["note"] =
            "sy, the row a billboard stands on, from the record's depth/scale word S, the eye-height " +
                "offset word and the player's height word; sx is the record's screen column";
        ctx.writeJson(`${OUT_DIR}/items.json`, index, { set: "index" });
        ctx.say(`items: ${ctx.files.size} files`);
    },
};

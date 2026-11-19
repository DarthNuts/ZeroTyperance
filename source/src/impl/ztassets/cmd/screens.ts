import type { Command, Context, RomFile } from "../core.js";
import { encodePng } from "../png.js";
import { sha256Hex } from "../../boot/sha256.js";
import { CARD_COUNT, TILE_BYTES, blockDataEnd, hexs, loadBlocks as loadBlockMap, tileToPixels, type Block } from "./tiles.js";
const FORMAT = "ztassets-screens/1";
const OUT_DIR = "screens";
const SCREEN_W = 320, SCREEN_H = 224;
const GRID_COLS = 40, GRID_ROWS = 28;
const GRID_BYTES = GRID_COLS * GRID_ROWS * 2;
const PAL_LINE_BYTES = 32;
const PAL_LINES = 4;
const INTRO_BANNER_PAL = 0x1cd8e;
const ACCOLADE_PAL = 0x52d80;
const SLIDESHOW_PAL = 0x1fc3e;
const TITLE_LINE0 = 0x1dcf4;
const TITLE_RAMP = 0x1d8f4;
const TITLE_RAMP_FULL = 0x1dcd4;
const BRIEFING_TEXT_PAL = 0xcd47a;
const CHARSEL_PALS: Record<number, number> = { 0: 0xc7322, 1: 0xc7e72, 2: 0xca972, 3: 0xc7302 };
export const MAZE_PAL = 0x20f2;
const HUD_LINE3 = MAZE_PAL + 3 * PAL_LINE_BYTES;
const SLIDESHOW_SCENES = 22;
const SLIDESHOW_END = 0x52c7e;
const SLIDESHOW_PAL_BEFORE_MAP = 0x80;
const ACCOLADE_FRAMES = 16;
const ACCOLADE_PLAYED = 15;
const ACCOLADE_MAP = 0x52da0;
const ACCOLADE_FRAME_BYTES = 0x100;
const ACCOLADE_COLS = 32, ACCOLADE_ROWS = 4;
const TITLE_SPRITE_TABLE = 0x1d5a2;
const TITLE_LABEL_TABLE = 0x1d4d6;
const TITLE_CURSOR = [0x0112, 0x0400, 0x840b, 0x00fc] as const;
type Dict = Record<string, unknown>;
const BRIEFING_SCREENS: ReadonlyArray<readonly [
    string,
    number,
    number,
    number | null,
    readonly [
        number,
        number,
        number
    ]
]> = [
    ["briefing_a", 0xd54ba, 0xd5d7a, null, [2491, 2493, 2495]],
    ["briefing_b", 0xdd63a, 0xddefa, null, [2504, 2506, 2508]],
    ["briefing_c", 0xe679a, 0xe705a, null, [2619, 2620, 2622]],
    ["briefing_d", 0xef2fa, 0xefbba, 0xefbda, [2538, 2540, 2547]],
    ["briefing_e", 0xf84da, 0xf8d9a, null, [2406, 2407, 2419]],
    ["briefing_f", 0x1016da, 0x101f9a, null, [2629, 2630, 2632]],
    ["briefing_g", 0x10a7da, 0x10b09a, 0x10b0ba, [2580, 2582, 2585]],
];
const BRIEFING_USES: Record<string, string> = {
    briefing_a: "first scene of the two-scene handler at 0xCAAF0 (site 0xCAB06) and of the static preview at 0xCADD8 (site 0xCADE6)",
    briefing_b: "second scene of the handler at 0xCAAF0 (site 0xCAB96), first scene of the handler at 0xCAC16 (site 0xCAC2C) " +
        "and the first-episode game-over scene (site 0xCAF48)",
    briefing_c: "second scene of the handler at 0xCAC16 (site 0xCACBC; the port's handler stops after its first scene) " +
        "and the second-episode game-over scene (site 0xCAFC0)",
    briefing_d: "the handler at 0xCAD3C (site 0xCAD52)",
    briefing_e: "the second game-over screen shown after the failure briefing of episodes 2 and 3 (site 0xCB0CC)",
    briefing_f: "the third-episode game-over scene (site 0xCB048)",
    briefing_g: "the handler at 0xCAE7E (site 0xCAE94)",
};
const PNG_NOTE = "PNG mode P, 8 bits per pixel; pixel value = 16 * palette line + colour index (the VDP's CRAM " +
    "index); palette = the screen's own lines, unloaded lines black";
export { hexs };
export function hexw(n: number): string {
    return "0x" + n.toString(16).toUpperCase().padStart(4, "0");
}
const h4 = (v: number): string => v.toString(16).toUpperCase().padStart(4, "0");
export function cram_to_rgb(word: number): [
    number,
    number,
    number
] {
    return [((word >> 1) & 7) * 36, ((word >> 5) & 7) * 36, ((word >> 9) & 7) * 36];
}
export const cramToRgb = cram_to_rgb;
export function palWords(rom: RomFile, off: number): number[] {
    return Array.from({ length: 16 }, (_, i) => rom.u16be(off + 2 * i));
}
export const pal_words = palWords;
function _ev(path: string, line: number, what: string): string {
    return `port screen builder, ${path}:${line} (${what})`;
}
function tileSlotMap(blocks: Record<string, Block>, sources: ReadonlyArray<readonly [
    string,
    number
]>): Map<number, Uint8Array> {
    const out = new Map<number, Uint8Array>();
    for (const [name, slot] of sources) {
        const b = blocks[name]!;
        for (let i = 0; i < b.count; i++)
            out.set(slot + i, tileToPixels(b.data.subarray(i * TILE_BYTES, (i + 1) * TILE_BYTES)));
    }
    return out;
}
function compose(entries: number[], cols: number, rows: number, slots: Map<number, Uint8Array>): [
    Uint8Array,
    number
] {
    const w = cols * 8, h = rows * 8;
    const out = new Uint8Array(w * h);
    let unresolved = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const e = entries[r * cols + c]!;
            const px = slots.get(e & 0x7ff);
            const pal = (e >> 13) & 3;
            if (px === undefined) {
                unresolved++;
                if (pal)
                    for (let y = 0; y < 8; y++)
                        out.fill(pal << 4, (r * 8 + y) * w + c * 8, (r * 8 + y) * w + c * 8 + 8);
                continue;
            }
            const hf = (e >> 11) & 1, vf = (e >> 12) & 1;
            for (let y = 0; y < 8; y++) {
                const sy = vf ? 7 - y : y;
                const o = (r * 8 + y) * w + c * 8;
                for (let x = 0; x < 8; x++)
                    out[o + x] = px[sy * 8 + (hf ? 7 - x : x)]! | (pal << 4);
            }
        }
    }
    return [out, unresolved];
}
function metatileProbe(entries: number[], cols: number, rows: number): Record<string, number> {
    const res: Record<string, number> = {};
    for (const k of [2, 4]) {
        let total = 0, rm = 0, cm = 0;
        for (let oy = 0; oy + k <= rows; oy += k) {
            for (let ox = 0; ox + k <= cols; ox += k) {
                const sub: number[][] = [];
                for (let y = 0; y < k; y++) {
                    sub.push([]);
                    for (let x = 0; x < k; x++)
                        sub[y]!.push(entries[(oy + y) * cols + ox + x]! & 0x7ff);
                }
                const a = sub[0]![0]!;
                if (sub.every((line) => line.every((v) => v === 0)))
                    continue;
                total++;
                let r1 = true, c1 = true;
                for (let y = 0; y < k; y++)
                    for (let x = 0; x < k; x++) {
                        if (sub[y]![x] !== a + y * k + x)
                            r1 = false;
                        if (sub[y]![x] !== a + x * k + y)
                            c1 = false;
                    }
                if (r1)
                    rm++;
                if (c1)
                    cm++;
            }
        }
        res[`groups_${k}x${k}`] = total;
        res[`row_major_${k}x${k}`] = rm;
        res[`column_major_${k}x${k}`] = cm;
    }
    return res;
}
function rowsOf(values: number[], cols: number, rows: number, fmt: (v: number) => string, sep: string): string[] {
    const out: string[] = [];
    for (let r = 0; r < rows; r++) {
        const parts: string[] = [];
        for (let c = 0; c < cols; c++)
            parts.push(fmt(values[r * cols + c]!));
        out.push(parts.join(sep));
    }
    return out;
}
type Rgb = [
    number,
    number,
    number
];
type PalSrc = number | number[];
function palettePng(rom: RomFile, lines: Record<number, PalSrc>): Rgb[] {
    const rgb: Rgb[] = Array.from({ length: 64 }, () => [0, 0, 0] as Rgb);
    for (const [lineS, src] of Object.entries(lines)) {
        const line = Number(lineS);
        const words = Array.isArray(src) ? src : palWords(rom, src);
        words.forEach((w, i) => { rgb[line * 16 + i] = cram_to_rgb(w); });
    }
    return rgb;
}
function paletteInfo(rom: RomFile, lines: Record<number, number>, notes: Record<number, string>): Dict {
    const out: Dict = {};
    const keys = Object.keys(lines).map(Number).sort((a, b) => a - b);
    for (const line of keys) {
        const src = lines[line]!;
        const words = palWords(rom, src);
        out[String(line)] = {
            cram_words: words.map(hexw),
            note: notes[line] ?? "",
            rgb: words.map((w) => cram_to_rgb(w)),
            rom_offset: hexs(src),
        };
    }
    return {
        cram_expansion: "each 3-bit channel (bits 3..1 red, 7..5 green, 11..9 blue) times 36",
        index_0: "transparent on the VDP; the PNG shows the CRAM entry",
        lines: out,
        unloaded_lines: [0, 1, 2, 3].filter((l) => !(l in lines)),
    };
}
interface Result {
    name: string;
    group: string;
    doc: Dict;
    size: [
        number,
        number
    ];
    pixels: Uint8Array;
    rgb64: Rgb[];
}
function sha(p: Uint8Array): string {
    return sha256Hex(p);
}
function gridResult(rom: RomFile, blocks: Record<string, Block>, name: string, group: string, description: string, romWords: number[], cols: number, rows: number, bias: number, mapOffset: number, sources: ReadonlyArray<readonly [
    string,
    number
]>, palLines: Record<number, number>, palNotes: Record<number, string>, plane: Dict, evidence: string[], notes: string[], extra?: Dict, wordsRead?: number): Result {
    const entries = romWords.map((w) => (w + bias) & 0xffff);
    const slots = tileSlotMap(blocks, sources);
    const [pixels, unresolved] = compose(entries, cols, rows, slots);
    if (unresolved)
        throw new Error(`screen ${name}: ${unresolved} cells use tile slots no source provides`);
    const palHist: Record<number, number> = {};
    for (const e of entries)
        palHist[(e >> 13) & 3] = (palHist[(e >> 13) & 3] ?? 0) + 1;
    const undefinedL = Object.keys(palHist).map(Number).filter((p) => !(p in palLines));
    if (undefinedL.length)
        throw new Error(`screen ${name} uses palette lines ${undefinedL} that it does not load`);
    const histOut: Record<string, number> = {};
    for (const k of Object.keys(palHist).map(Number).sort((a, b) => a - b))
        histOut[String(k)] = palHist[k]!;
    const doc: Dict = {
        composite: {
            height: rows * 8,
            pixel_values: "16 * palette line + colour index (CRAM index)",
            png: `${name}.png`,
            sha256_pixels: sha(pixels),
            unresolved_cells: unresolved,
            width: cols * 8,
        },
        description,
        evidence: [...evidence],
        format: FORMAT,
        geometry: { cell_columns: cols, cell_rows: rows, tile_px: 8 },
        group,
        kind: "name_table",
        metatile_probe: metatileProbe(entries, cols, rows),
        name,
        name_table: {
            bias: hexw(bias),
            bias_rule: "entry = (word + bias) & 0xFFFF",
            byte_order: "big",
            entry_bits: "PCCV HTTT TTTT TTTT = priority, palette line (2), vflip, hflip, tile slot (11)",
            entry_rows: rowsOf(entries, cols, rows, h4, " "),
            hflip_rows: rowsOf(entries, cols, rows, (v) => String((v >> 11) & 1), ""),
            palette_line_rows: rowsOf(entries, cols, rows, (v) => String((v >> 13) & 3), ""),
            palette_lines_used: histOut,
            priority_rows: rowsOf(entries, cols, rows, (v) => String((v >> 15) & 1), ""),
            rom_offset: hexs(mapOffset),
            rom_word_rows: rowsOf(romWords, cols, rows, h4, " "),
            tile_slot_rows: rowsOf(entries, cols, rows, (v) => String(v & 0x7ff), " "),
            vflip_rows: rowsOf(entries, cols, rows, (v) => String((v >> 12) & 1), ""),
            words_read_by_loader: wordsRead ?? romWords.length,
        },
        notes: [...notes],
        palette: paletteInfo(rom, palLines, palNotes),
        plane,
        tile_sources: sources.map(([n_, s_]) => ({ block: n_, first_slot: s_, last_slot: s_ + blocks[n_]!.count - 1, tiles: blocks[n_]!.count })),
    };
    if (extra)
        Object.assign(doc, extra);
    return { name, group, doc, size: [cols * 8, rows * 8], pixels, rgb64: palettePng(rom, palLines) };
}
function blockMap(blocks: Record<string, Block>, name: string): [
    number[],
    number,
    number,
    number
] {
    const b = blocks[name]!;
    return [[...b.mapWords!], b.header.map_columns as number, b.header.map_rows as number, b.mapOffset!];
}
function buildBanner(rom: RomFile, blocks: Record<string, Block>): Result {
    const [words, cols, rows, off] = blockMap(blocks, "intro_banner");
    return gridResult(rom, blocks, "intro_banner", "banners", "40 x 28 banner of the start-up sequence (a block map with 288 tiles; it fades from black to white and back)", words, cols, rows, 0x8000, off, [["intro_banner", 0]], { 0: INTRO_BANNER_PAL }, { 0: "the fade target: entry 0 = 0x0000, entries 1..15 = 0x0FFF" }, { origin_cell: [0, 0], row_stride_bytes: 0x80, vram_base: hexs(0xe000) }, [_ev("src/boot_screens.c", 223, "block 0x116DBE blitted to VRAM 0xE000 with attribute base 0x8000"),
        _ev("src/screen.c", 676, "tile base and attribute base are added to every map word: (slot) + attr base"),
        _ev("src/screen.c", 693, "VRAM row stride 0x80 (64 cells)"),
        _ev("src/boot_screens.c", 232, "palette target of the fade-in: ROM 0x1CD8E")], ["observed in a headless dump at frame 200: white text lines on black",
        "palette bits of the map words are all 0 and the priority bit comes from the 0x8000 bias; the words carry flips (26 cells each)"]);
}
function buildTitle(rom: RomFile, blocks: Record<string, Block>): Result[] {
    const out: Result[] = [];
    const b2 = blocks["title_tiles2"]!;
    const cols = b2.header.map_columns as number, rowsAll = b2.header.map_rows as number;
    const words = b2.mapWords!.slice(0, 0x780);
    if (words.length % cols)
        throw new Error("title map: 0x780 words are not a whole number of rows");
    const rows = words.length / cols;
    if (b2.mapWords!.slice(0x780).some((v) => v))
        throw new Error("title map: words behind the first 0x780 are not all zero");
    const rampNote = `full-intensity entry of the cross-fade ramp (32 lines of 32 bytes from ${hexs(TITLE_RAMP)}); the ` +
        "screen's lines 2 and 3 are loaded from that ramp each frame, so the live line moves " +
        "between all-black and this entry";
    const planes: Array<[
        string,
        number,
        number,
        number,
        string
    ]> = [["a", 0x4090, 2, 0xe000, "plane A"], ["b", 0x6090, 3, 0xc000, "plane B"]];
    for (const [plane, bias, line, vramPlane, label] of planes) {
        out.push(gridResult(rom, blocks, `title_plane_${plane}`, "title", `title screen ${label}: the first ${rows} rows of the 128 x 25 map of the second title block, written with ` +
            `bias 0x${h4(bias)} (tile slot 0x90, palette line ${line})`, words, cols, rows, bias, b2.mapOffset!, [["title_tiles2", 0x90]], { [line]: TITLE_RAMP_FULL }, { [line]: rampNote }, { origin_cell: [13, 0], row_stride_bytes: 0x100, vram_base: hexs(vramPlane + 13 * 0x100), vram_plane_base: hexs(vramPlane) }, [_ev("src/player.c", 1419, "map = block + 8 (0x11C576), 0x780 words"),
            _ev("src/player.c", plane === "a" ? 1417 : 1427, `VRAM write command ${plane === "a" ? "0x6D000003" : "0x4D000003"}: row 13 of the plane`),
            _ev("src/player.c", plane === "a" ? 1422 : 1432, `bias 0x${h4(bias)} added to every word`)], [`the rest of the 128 x 25 map (rows ${rows}..${rowsAll - 1}) is all zero and never loaded`,
            "128 cells wide: the title registers select a 128 x 32 plane (row stride 0x100)"], undefined, 0x780));
    }
    const b1 = blocks["title_tiles1"]!;
    const cols1 = b1.header.map_columns as number, rows1 = b1.header.map_rows as number;
    const first = 1, last = 12;
    if (b1.mapWords!.slice(0, cols1 * first).some((v) => v) || b1.mapWords!.slice(cols1 * (last + 1)).some((v) => v)) {
        throw new Error("title strip: map words outside rows 1..12 are not all zero");
    }
    const strip = b1.mapWords!.slice(cols1 * first, cols1 * (last + 1));
    out.push(gridResult(rom, blocks, "title_strip", "title", "title banner strip: rows 1..12 of the 128 x 25 map of the first title block (entry = word + 1); the " +
        "title loop streams it into the first twelve rows of plane A one column at a time", strip, cols1, last - first + 1, 1, b1.mapOffset! + 2 * cols1 * first, [["title_tiles1", 1]], { 0: TITLE_LINE0 }, { 0: "the title screen's own line 0 (CRAM init data)" }, {
        origin_cell: [0, 0], plane_column_of_map_column: "(c + 42) mod 128", row_stride_bytes: 0x100, vram_base: hexs(0xe000),
        stream: "map column c is written to plane A column (c + 42) mod 128, 12 rows, one column per " +
            "4 frames; the picture below is in MAP coordinates",
    }, [_ev("src/player.c", 1516, "source = 0x119B8E + 2 * column: row 1 of the map, stride 0x100 per row"),
        _ev("src/player.c", 1508, "destination address = ((offset + 0x54) & 0xFF) | 0xE000, +0x100 per row"),
        _ev("src/player.c", 1521, "the word written is the map word + 1")], ["map rows 0 and 13..24 are all zero",
        "palette bits of the words are 0 (line 0); the words carry flips (196 horizontal, 260 vertical)"], { map_rows_total: rows1, map_rows_decoded: "1..12" }, strip.length));
    return out;
}
function buildTitleSprites(rom: RomFile, blocks: Record<string, Block>): Result {
    interface Spr {
        attribute: string;
        cells_h: number;
        cells_w: number;
        first_tile: number;
        hflip: number;
        index: number;
        last_tile: number;
        palette_line: number;
        priority: number;
        role: string;
        rom_words: string[];
        source: string;
        vflip: number;
        x: number;
        y: number;
        block?: string;
    }
    const sprites: Spr[] = [];
    const add = (source: string, y: number, size: number, attr: number, x: number, role: string): void => {
        const w = ((size >> 10) & 3) + 1;
        const h = ((size >> 8) & 3) + 1;
        sprites.push({
            attribute: hexw(attr), cells_h: h, cells_w: w, first_tile: attr & 0x7ff, hflip: (attr >> 11) & 1, index: sprites.length,
            last_tile: (attr & 0x7ff) + w * h - 1, palette_line: (attr >> 13) & 3, priority: (attr >> 15) & 1, role,
            rom_words: [hexw(y), hexw(size), hexw(attr), hexw(x)], source, vflip: (attr >> 12) & 1, x: (x & 0x1ff) - 128, y: (y & 0x3ff) - 128,
        });
    };
    for (let i = 0; i < 16; i++) {
        const o = TITLE_SPRITE_TABLE + 8 * i;
        add(`sprite table ${hexs(TITLE_SPRITE_TABLE)}`, rom.u16be(o), rom.u16be(o + 2), rom.u16be(o + 4), rom.u16be(o + 6), "art");
    }
    const [cy, csize, cattr, cx] = TITLE_CURSOR;
    add("computed by the title loop", cy, csize, cattr, cx, "pointer (position for flag value 1)");
    for (let i = 0; i < 4; i++) {
        const o = TITLE_LABEL_TABLE + 8 * i;
        add(`sprite table ${hexs(TITLE_LABEL_TABLE)}`, rom.u16be(o), rom.u16be(o + 2), rom.u16be(o + 4), rom.u16be(o + 6), "label");
    }
    const b1 = blocks["title_sprites1"]!, b2 = blocks["title_sprites2"]!;
    const slots = tileSlotMap(blocks, [["title_sprites1", b1.vramTile!], ["title_sprites2", b2.vramTile!]]);
    const used: number[] = [];
    for (const s of sprites)
        for (let t = s.first_tile; t <= s.last_tile; t++)
            used.push(t);
    used.sort((a, b) => a - b);
    const want: number[] = [];
    for (let t = b1.vramTile!; t < b2.vramTile! + b2.count; t++)
        want.push(t);
    if (used.length !== want.length || used.some((v, i) => v !== want[i]))
        throw new Error(`title sprites do not tile slots ${want[0]}..${want[want.length - 1]} exactly`);
    for (const s of sprites)
        s.block = s.first_tile < b2.vramTile! ? "title_sprites1" : "title_sprites2";
    const canvas = new Uint8Array(SCREEN_W * SCREEN_H);
    for (const s of [...sprites].reverse()) {
        const w = s.cells_w, h = s.cells_h;
        for (let cxx = 0; cxx < w; cxx++) {
            for (let cyy = 0; cyy < h; cyy++) {
                const col = s.hflip ? w - 1 - cxx : cxx;
                const row = s.vflip ? h - 1 - cyy : cyy;
                const px = slots.get(s.first_tile + col * h + row)!;
                for (let py = 0; py < 8; py++) {
                    for (let pxx = 0; pxx < 8; pxx++) {
                        const sx = s.hflip ? 7 - pxx : pxx;
                        const sy = s.vflip ? 7 - py : py;
                        const v = px[sy * 8 + sx]!;
                        if (!v)
                            continue;
                        const X = s.x + cxx * 8 + pxx, Y = s.y + cyy * 8 + py;
                        if (X >= 0 && X < SCREEN_W && Y >= 0 && Y < SCREEN_H)
                            canvas[Y * SCREEN_W + X] = (s.palette_line << 4) | v;
                    }
                }
            }
        }
    }
    const palLines = { 0: TITLE_LINE0 };
    const rgb = palettePng(rom, palLines);
    for (let i = 0; i < 16; i++)
        rgb[16 + i] = [17 * i, 17 * i, 17 * i];
    const doc: Dict = {
        composite: {
            height: SCREEN_H, pixel_values: "16 * palette line + colour index (CRAM index); transparent pixels are 0",
            png: "title_sprites.png", sha256_pixels: sha(canvas), width: SCREEN_W,
        },
        description: "the title screen's hardware sprites placed on a 320 x 224 canvas: the sixteen 'art' sprites " +
            "that use all 182 tiles of title_sprites1, the pointer sprite and the four label sprites " +
            "(24 + 2 tiles of title_sprites2)",
        evidence: [_ev("src/player.c", 1578, "sixteen sprites read from 0x1D5A2: Y, size, tile attribute, X"),
            _ev("src/player.c", 1600, "four more sprites read from 0x1D4D6"),
            _ev("src/player.c", 1596, "computed sprite: size word 0x400, attribute 0x840B, X 0xFC"),
            _ev("src/player.c", 1592, "its Y = (flag - 1) * 24 + 0x112")],
        format: FORMAT,
        group: "title",
        kind: "sprites",
        name: "title_sprites",
        notes: ["sprite coordinates are the hardware ones (screen X/Y + 128); x and y below are screen pixels",
            "tiles inside a sprite run down the columns first (hardware order)",
            "a lower sprite index is in front; the PNG paints from the last sprite to the first",
            "the loop writes the link field; the ROM words carry link 0",
            "palette line 1 is not static: it is built from a lookup each frame, so the PNG embeds a grey " +
                "placeholder for it (pixel values are unaffected)",
            "the pointer sprite shown is the one for flag value 1 (x 124, y 146)"],
        palette: { ...paletteInfo(rom, palLines, { 0: "the title screen's own line 0" }), unresolved_lines: [1] },
        sprites,
        tile_sources: [
            { block: "title_sprites1", first_slot: b1.vramTile!, last_slot: b1.vramTile! + b1.count - 1, tiles: b1.count },
            { block: "title_sprites2", first_slot: b2.vramTile!, last_slot: b2.vramTile! + b2.count - 1, tiles: b2.count },
        ],
    };
    return { name: "title_sprites", group: "title", doc, size: [SCREEN_W, SCREEN_H], pixels: canvas, rgb64: rgb };
}
function accoladeWords(rom: RomFile, off: number): number[] {
    const raw = rom.bytesAt(off, ACCOLADE_FRAME_BYTES);
    return Array.from({ length: ACCOLADE_COLS * ACCOLADE_ROWS }, (_, i) => (raw[2 * i + 1]! << 8) | raw[2 * i]!);
}
function buildAccolade(rom: RomFile, blocks: Record<string, Block>): Result {
    const b = blocks["accolade_logo"]!;
    const slots = tileSlotMap(blocks, [["accolade_logo", 0]]);
    const frames: Dict[] = [];
    const stripParts: Uint8Array[] = [];
    const allWords: number[] = [];
    for (let k = 0; k < ACCOLADE_FRAMES; k++) {
        const off = ACCOLADE_MAP + k * ACCOLADE_FRAME_BYTES;
        const words = accoladeWords(rom, off);
        const [px, unresolved] = compose(words, ACCOLADE_COLS, ACCOLADE_ROWS, slots);
        if (unresolved)
            throw new Error(`logo frame ${k} has ${unresolved} cells outside the tile block`);
        stripParts.push(px);
        allWords.push(...words);
        frames.push({
            hflip_rows: rowsOf(words, ACCOLADE_COLS, ACCOLADE_ROWS, (v) => String((v >> 11) & 1), ""),
            index: k,
            palette_line_rows: rowsOf(words, ACCOLADE_COLS, ACCOLADE_ROWS, (v) => String((v >> 13) & 3), ""),
            played_by_loader: k < ACCOLADE_PLAYED,
            priority_rows: rowsOf(words, ACCOLADE_COLS, ACCOLADE_ROWS, (v) => String((v >> 15) & 1), ""),
            rom_offset: hexs(off),
            sha256_pixels: sha(px),
            tile_slot_rows: rowsOf(words, ACCOLADE_COLS, ACCOLADE_ROWS, (v) => String(v & 0x7ff), " "),
            vflip_rows: rowsOf(words, ACCOLADE_COLS, ACCOLADE_ROWS, (v) => String((v >> 12) & 1), ""),
            word_rows: rowsOf(words, ACCOLADE_COLS, ACCOLADE_ROWS, h4, " "),
        });
    }
    const pixels = new Uint8Array(stripParts.reduce((n, p) => n + p.length, 0));
    let po = 0;
    for (const p of stripParts) {
        pixels.set(p, po);
        po += p.length;
    }
    const palLines = { 0: ACCOLADE_PAL };
    const doc: Dict = {
        composite: {
            frame_height: ACCOLADE_ROWS * 8, frame_width: ACCOLADE_COLS * 8, height: ACCOLADE_FRAMES * ACCOLADE_ROWS * 8,
            layout: "frame k occupies rows k * 32 .. k * 32 + 31", pixel_values: "16 * palette line + colour index (CRAM index)",
            png: "accolade_logo.png", sha256_pixels: sha(pixels), width: ACCOLADE_COLS * 8,
        },
        description: `logo screen: one 32 x 4 cell block redrawn ${ACCOLADE_PLAYED} times at the same place of the plane at ` +
            "VRAM 0x8000, using the 409 tiles of accolade_logo (observed in headless dumps at " +
            "frames 400..500: the logo growing letter by letter)",
        evidence: [_ev("src/boot_screens.c", 139, "frame k at ROM 0x52DA0 + k * 0x100"),
            _ev("src/boot_screens.c", 155, "each word is assembled (byte 1 << 8) | byte 0, i.e. stored low byte first"),
            _ev("src/boot_screens.c", 140, "every frame is written after the VDP command 0x45080002: the same place (row 10, column 4 of the plane at 0x8000)"),
            _ev("src/boot_screens.c", 138, "the loop plays frames 0..14"),
            _ev("src/boot_screens.c", 108, "palette line 0 from ROM 0x52D80")],
        format: FORMAT,
        frames,
        geometry: { cell_columns: ACCOLADE_COLS, cell_rows: ACCOLADE_ROWS, tile_px: 8 },
        group: "logos",
        kind: "name_table_frames",
        metatile_probe: metatileProbe(allWords, ACCOLADE_COLS, ACCOLADE_ROWS * ACCOLADE_FRAMES),
        name: "accolade_logo",
        name_table: {
            bias: "none",
            byte_order: "little (the loader assembles each word as (byte 1 << 8) | byte 0)",
            entry_bits: "PCCV HTTT TTTT TTTT = priority, palette line (2), vflip, hflip, tile slot (11)",
            frame_bytes: ACCOLADE_FRAME_BYTES,
            rom_offset: hexs(ACCOLADE_MAP),
        },
        notes: [`the ROM holds ${ACCOLADE_FRAMES} frames; the loader plays the first ${ACCOLADE_PLAYED}, frame ${ACCOLADE_FRAMES - 1} is never uploaded`],
        palette: paletteInfo(rom, palLines, { 0: "the logo screen's palette line 0" }),
        plane: { origin_cell: [10, 4], row_stride_bytes: 0x80, vram_base: hexs(0x8508), vram_plane_base: hexs(0x8000) },
        tile_sources: [{ block: "accolade_logo", first_slot: 0, last_slot: b.count - 1, tiles: b.count }],
    };
    return { name: "accolade_logo", group: "logos", doc, size: [ACCOLADE_COLS * 8, ACCOLADE_FRAMES * ACCOLADE_ROWS * 8], pixels, rgb64: palettePng(rom, palLines) };
}
function buildSlideshow(rom: RomFile, blocks: Record<string, Block>): Result[] {
    const out: Result[] = [];
    const names = Array.from({ length: SLIDESHOW_SCENES }, (_, k) => `slideshow_${String(k).padStart(2, "0")}`);
    const maps = names.map((n) => blocks[n]!.romOffset - GRID_BYTES);
    for (let k = 0; k < SLIDESHOW_SCENES; k++) {
        const nxt = k + 1 < SLIDESHOW_SCENES ? maps[k + 1]! : SLIDESHOW_END;
        if (blockDataEnd(blocks[names[k]!]!) !== nxt)
            throw new Error(`slideshow layout: scene ${k} tiles end at ${hexs(blockDataEnd(blocks[names[k]!]!))}, expected ${hexs(nxt)}`);
    }
    const pal0 = maps[0]! - SLIDESHOW_PAL_BEFORE_MAP;
    if (pal0 !== SLIDESHOW_PAL)
        throw new Error(`slideshow palette not at ${hexs(SLIDESHOW_PAL)}`);
    const palLines: Record<number, number> = {};
    for (let l = 0; l < PAL_LINES; l++)
        palLines[l] = SLIDESHOW_PAL + l * PAL_LINE_BYTES;
    names.forEach((n, k) => {
        const b = blocks[n]!;
        const words = Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => rom.u16be(maps[k]! + 2 * i));
        const palNotes: Record<number, string> = {};
        for (let l = 0; l < PAL_LINES; l++)
            palNotes[l] = l === 0 ? "the screen builder fades all four lines in to this table once, in scene 0" : "";
        out.push(gridResult(rom, blocks, n, "slideshow", `slideshow scene ${k}: 40 x 28 name table at ROM ${hexs(maps[k]!)}, tiles in VRAM slot ${hexs(b.vramTile!)}`, words, GRID_COLS, GRID_ROWS, b.vramTile!, maps[k]!, [[n, b.vramTile!]], palLines, palNotes, { origin_cell: [0, 0], row_stride_bytes: 0x80, vram_base: hexs(0xc000) }, [_ev("src/screen.c", 403, `tiles to slot ${hexs(b.vramTile!)}`),
            _ev("src/screen.c", 415, "name table at VRAM 0xC000 with the scene's tile slot as bias"),
            _ev("src/screen.c", 150, "row stride parameter 0x40 is doubled: 0x80 bytes per row"),
            _ev("src/screen.c", 395, "palette reference of scene 0: ROM 0x1FC3E")], [`the screen builder reads ${GRID_COLS} x 32 words: the 4 rows beyond the 28 shown are the first 640 bytes of ` +
                "the scene's tile data read as words (below the 224-pixel screen, never visible)",
            `scene ${k} of ${SLIDESHOW_SCENES}; scenes alternate between tile slot 1 and tile slot 0x2BC so the next scene can be ` +
                "uploaded while the previous one is on screen",
            "observed in headless dumps at frames 560..900: the dissolving triangle logo animation"], undefined, GRID_COLS * 32));
    });
    return out;
}
function buildBriefings(rom: RomFile, blocks: Record<string, Block>): Result[] {
    const out: Result[] = [];
    for (const [name, mapOff, pal0, pal1, ev] of BRIEFING_SCREENS) {
        const b = blocks[name]!;
        if (blockDataEnd(b) !== mapOff)
            throw new Error(`${name}: tiles end at ${hexs(blockDataEnd(b))} but the map starts at ${hexs(mapOff)}`);
        if (mapOff + GRID_BYTES !== pal0)
            throw new Error(`${name}: the palette block does not follow the map`);
        if (pal1 !== null && pal1 !== pal0 + PAL_LINE_BYTES)
            throw new Error(`${name}: palette line 1 is not the next line`);
        const words = Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => rom.u16be(mapOff + 2 * i));
        const used = [...new Set(words.map((w) => ((w + 1) >> 13) & 3))].sort((a, c) => a - c);
        const lines: Record<number, number> = { 0: pal0, 3: BRIEFING_TEXT_PAL };
        const notes: Record<number, string> = { 0: "first copy of the palette block", 3: "shared text palette line (the scrolling text uses it)" };
        if (pal1 !== null) {
            lines[1] = pal1;
            notes[1] = "second copy: the builder copies the next 32 bytes of the palette block";
        }
        out.push(gridResult(rom, blocks, name, "briefings", "40 x 28 picture of a briefing / game-over scene; tiles (VRAM slot 1), then this name table, then a " +
            "128-byte palette block follow each other in the ROM", words, GRID_COLS, GRID_ROWS, 1, mapOff, [[name, 1]], lines, notes, { origin_cell: [0, 0], row_stride_bytes: 0x100, vram_base: hexs(0xe000) }, [_ev("src/game.c", ev[0], "tile upload to slot 1"),
            _ev("src/game.c", ev[1], "name table at VRAM 0xE000, 40 x 28, row stride parameter 0x80 (doubled), bias 1"),
            _ev("src/game.c", ev[2], `palette line copied from ROM ${hexs(pal0)}`),
            _ev("src/game.c", 2497, "line 3 copied from the shared text palette 0xCD47A")], ["used by: " + BRIEFING_USES[name],
            "the plane at VRAM 0xE000 is VDP plane B in the register set these screens run with (register 4 = 0x07)",
            `the picture's pixels use palette line${used.length > 1 ? "s" : ""} ${used.join(" and ")}${pal1 !== null && !used.includes(1) ? " (the builder copies a second line that the picture does not use)" : ""}`]));
    }
    return out;
}
function buildCharsel(rom: RomFile, blocks: Record<string, Block>): Result[] {
    const out: Result[] = [];
    const palNotes: Record<number, string> = {
        0: "first of the four lines the screen copies", 1: "second line", 2: "third line (also used by the overlay)", 3: "fourth line",
    };
    for (let k = 0; k < CARD_COUNT; k++) {
        const name = `charcard_${k}`;
        const b = blocks[name]!;
        const [words, cols, rows, off] = blockMap(blocks, name);
        out.push(gridResult(rom, blocks, name, "charsel", `ID card ${k}: 16 x 12 cells, tiles back to back from slot 1 (this card at slot ${b.vramTile})`, words, cols, rows, b.vramTile!, off, [[name, b.vramTile!]], CHARSEL_PALS, palNotes, { origin_cell: [1, 1], page_b_vram_base: hexs(0xf082), row_stride_bytes: 0x80, vram_base: hexs(0xe082) }, [_ev("src/main.c", 200, "bias = (tile base byte address >> 5) + palette offset 0"),
            _ev("src/main.c", 213, "words written as map word + bias"),
            _ev("src/main.c", 271, "the card is drawn on one of two pages, VRAM 0xE082 or 0xF082"),
            _ev("src/main.c", 434, "the four palette lines: ROM 0xC7322, 0xC7E72, 0xCA972, 0xC7302")], ["the map's own palette bits are all 0, so the card uses line 0 (ROM 0xC7322); in a gameplay dump the " +
                "cockpit draws card 0 with palette line 3 = line 3 of the gameplay table at ROM 0x20F2, which differs from " +
                "ROM 0xC7322 only in entry 0 (transparent) and one unused bit",
            "the in-game cockpit shows card 0's map at row 16, column 24 of the plane at VRAM 0xC000 (the slot base " +
                "differs there; checked against a gameplay dump)"]));
    }
    const overOff = 0xca0b2;
    const words = Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => rom.u16be(overOff + 2 * i));
    if (blockDataEnd(blocks["charsel_bank"]!) !== overOff)
        throw new Error("charsel overlay does not follow the tile bank");
    out.push(gridResult(rom, blocks, "charsel_overlay", "charsel", "full-screen overlay drawn over an ID card page (a name table plus the 270 tiles of charsel_bank)", words, GRID_COLS, GRID_ROWS, 0x43a2, overOff, [["charsel_bank", 0x3a2]], { 2: CHARSEL_PALS[2]! }, { 2: "the third palette line copied by the screen (ROM 0xCA972), which the overlay's bias selects" }, { origin_cell: [0, 0], page_b_vram_base: hexs(0xd000), row_stride_bytes: 0x80, vram_base: hexs(0xc000) }, [_ev("src/main.c", 290, "map read from ROM 0xCA0B2, 40 x 28"),
        _ev("src/main.c", 292, "page base VRAM 0xC000 or 0xD000"),
        _ev("src/main.c", 310, "words written as map word + 0x43A2 (palette line 2, tile slot 0x3A2)")], ["drawn when the shown card's character is flagged dead by the screen; the map is followed by the " +
            "palette block at ROM 0xCA972"]));
    return out;
}
const CHARSEL_TEXT_ROM = 0xc716c;
const CHARSEL_POOL_ROM = 0xc7342;
const CHARSEL_TILE_LISTS: ReadonlyArray<readonly [
    number,
    number,
    number,
    number
]> = [[0xc76a2, 0x546, 3, 4], [0xc76f2, 0x552, 4, 4]];
function buildCharselLayout(rom: RomFile, blocks: Record<string, Block>): Dict {
    const pool = blocks["charsel_pool"]!;
    if (pool.romOffset !== CHARSEL_POOL_ROM)
        throw new Error(`charsel pool is not at ${hexs(CHARSEL_POOL_ROM)}`);
    const lists: Dict[] = [];
    for (const [off, slot, cols, rows] of CHARSEL_TILE_LISTS) {
        const entries = Array.from({ length: cols * rows }, (_, i) => rom.u16be(off + 2 * i));
        if (Math.max(...entries) >= pool.count)
            throw new Error(`charsel tile list at ${hexs(off)} points past the pool`);
        lists.push({ columns: cols, entries, first_slot: slot, pool_block: "charsel_pool", rows, rom_offset: hexs(off), tiles: cols * rows });
    }
    let end = CHARSEL_TEXT_ROM;
    while (rom.u8(end) !== 0)
        end++;
    const raw = rom.bytesAt(CHARSEL_TEXT_ROM, end - CHARSEL_TEXT_ROM);
    const text = Array.from(raw, (b) => String.fromCharCode(b)).join("");
    if (text !== "-".repeat(raw.length))
        throw new Error("charsel separator text is not a line of '-'");
    return {
        description: "Data of the character-select screen that the tile, font, string and screen outputs do not hold: " +
            "the two index lists that copy tiles of charsel_pool to sprite tile slots, and the separator line.",
        evidence: [
            _ev("src/main.c", 466, "first tile-list call: pool ROM 0xC7342, index list ROM 0xC76A2, slot 0x546, 0x18 x 0x20 pixels"),
            _ev("src/main.c", 469, "second tile-list call: index list ROM 0xC76F2, slot 0x552, 0x20 x 0x20 pixels"),
            _ev("src/main.c", 225, "the list reader takes (columns >> 3) * (rows >> 3) big-endian words, entry i goes to slot first + i"),
            _ev("src/main.c", 483, "separator text ROM 0xC716C, written twice (two pages) with the double-height text writer"),
        ],
        format: FORMAT,
        kind: "charsel_layout",
        notes: [
            "each list holds more words in the ROM than the builder reads (the first list is 0..9 then 0x0A repeated up to " +
                "the second list); only the words the builder reads are recorded",
            "the sprites read a block of tiles column by column: a 3 x 4 block is first_slot + column * 4 + row",
            "the separator is 40 characters of '-' (the screen is 40 cells wide); with the main font's glyph table each " +
                "character is an upper and a lower tile, so the line is two cells tall",
        ],
        separator_text: {
            length: raw.length, raw_hex: Array.from(raw, (b) => b.toString(16).padStart(2, "0")).join(""),
            rom_offset: hexs(CHARSEL_TEXT_ROM), text,
        },
        tile_lists: lists,
    };
}
function buildFrames(rom: RomFile, blocks: Record<string, Block>): Result[] {
    const out: Result[] = [];
    let [words, cols, rows, off] = blockMap(blocks, "pause_backdrop");
    out.push(gridResult(rom, blocks, "pause_backdrop", "screens", "40 x 28 backdrop of the paused-map screen (90 tiles at slot 0x141, drawn with attribute base 0x6000)", words, cols, rows, 0x141 + 0x6000, off, [["pause_backdrop", 0x141]], { 3: HUD_LINE3 }, { 3: "inferred: line 3 of the gameplay CRAM table at ROM 0x20F2, which a gameplay dump shows in CRAM " +
            "(equal modulo the unused bits); entry 0 is transparent" }, { origin_cell: [0, 0], row_stride_bytes: 0x80, vram_base: hexs(0xe000) }, [_ev("src/game.c", 4133, "block blitted with tile bank address 0x2820 (slot 0x141), attribute base 0x6000"),
        _ev("src/game.c", 3642, "words written as map word + (bank address >> 5) + attribute base")], ["the palette line is inferred, not loaded by the screen; the picture cannot be reached by the attract demo"]));
    [words, cols, rows, off] = blockMap(blocks, "hud_frame");
    out.push(gridResult(rom, blocks, "hud_frame", "screens", "40 x 28 cockpit frame (172 tiles at slot 0x359, attribute base 0xE000); the 3D viewport, the map " +
        "panel and the ID-card area are overwritten at run time", words, cols, rows, 0x359 + 0xe000, off, [["hud_frame", 0x359]], { 3: HUD_LINE3 }, { 3: "line 3 of the gameplay CRAM table at ROM 0x20F2; a gameplay dump shows exactly this line in CRAM " +
            "(equal modulo the unused bits); entry 0 is transparent" }, { origin_cell: [0, 0], row_stride_bytes: 0x80, vram_base: hexs(0xc000) }, [_ev("src/game.c", 3843, "block blitted with tile bank address 0x6B20 (slot 0x359), attribute base 0xE000"),
        _ev("src/game.c", 3642, "words written as map word + (bank address >> 5) + attribute base")], ["rows 5..14, columns 4..35 hold the viewport name-table words 0x8001.. at run time (textures command); " +
            "rows 17..25, columns 13..21 and rows 16..27, columns 24..39 are also rewritten while playing"]));
    return out;
}
function run(ctx: Context): void {
    const rom = ctx.rom;
    const blocks = Object.fromEntries(loadBlockMap(rom));
    let results: Result[] = [];
    results.push(buildBanner(rom, blocks));
    results.push(buildAccolade(rom, blocks));
    results.push(...buildSlideshow(rom, blocks));
    results.push(...buildBriefings(rom, blocks));
    results.push(...buildTitle(rom, blocks));
    results.push(buildTitleSprites(rom, blocks));
    results.push(...buildCharsel(rom, blocks));
    results.push(...buildFrames(rom, blocks));
    results = results.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const indexRows: Dict[] = [];
    const probeTotal: Record<string, number> = {};
    let nfiles = 0;
    let screenNo = 0;
    for (const r of results) {
        ctx.progress(screenNo++, results.length, `screen ${screenNo} of ${results.length}`);
        const palette: number[] = [];
        for (const [rr, g, b] of r.rgb64)
            palette.push(rr, g, b);
        const png = encodePng({ width: r.size[0], height: r.size[1], mode: "P", pixels: r.pixels, palette, bits: 8, level: 9 });
        ctx.writeBytes(`${OUT_DIR}/${r.name}.png`, png, { screen: r.name });
        ctx.writeJson(`${OUT_DIR}/${r.name}.json`, r.doc, { screen: r.name });
        nfiles += 2;
        const probe = r.doc["metatile_probe"] as Record<string, number> | undefined;
        if (probe)
            for (const [k, v] of Object.entries(probe))
                probeTotal[k] = (probeTotal[k] ?? 0) + v;
        const sources = r.doc["tile_sources"] as Array<{
            block: string;
        }>;
        const comp = r.doc["composite"] as {
            sha256_pixels: string;
        };
        indexRows.push({
            blocks: sources.map((s) => s.block).sort(),
            group: r.group,
            height: r.size[1],
            json: `${r.name}.json`,
            kind: r.doc["kind"],
            name: r.name,
            png: `${r.name}.png`,
            sha256_pixels: comp.sha256_pixels,
            width: r.size[0],
        });
    }
    const index: Dict = {
        entry_format: {
            bits: "PCCV HTTT TTTT TTTT", bias_rule: "entry = (word + bias) & 0xFFFF",
            fields: "priority (15), palette line (14..13), vflip (12), hflip (11), tile slot (10..0)",
        },
        format: FORMAT,
        metatile_finding: {
            conclusion: "none: no name table is organised in 2 x 2 or 4 x 4 groups of consecutive tiles (the " +
                "few 2 x 2 groups that are consecutive are coincidences, no 4 x 4 group is); tiles are numbered in raster order of first use and shared",
            totals: probeTotal,
        },
        png: PNG_NOTE,
        screens: indexRows,
    };
    ctx.writeJson(`${OUT_DIR}/screens.json`, index, { screens: results.length });
    ctx.writeJson("charsel/layout.json", buildCharselLayout(rom, blocks), { screen: "charsel" });
    nfiles += 2;
    ctx.say(`screens: ${results.length} screens, ${nfiles} files`);
}
export const screens: Command = {
    name: "screens",
    run(ctx: Context, _options: Record<string, unknown>) {
        run(ctx);
    },
};

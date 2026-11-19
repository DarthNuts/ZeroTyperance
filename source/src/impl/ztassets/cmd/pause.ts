import type { Command, Context, RomFile } from "../core.js";
import { sha256Hex } from "../../boot/sha256.js";
import { loadBlocks, type Block } from "./tiles.js";
import { CAPTION_TABLE, captionStrings, decodeTile, encodeTile, mainCharMap } from "./fonts.js";
import { MAZE_PAL, cramToRgb, hexs, hexw, palWords } from "./screens.js";
const FORMAT = "ztassets-pause/1";
const TILES_FORMAT = "ztassets-pause-tiles/1";
const OUT_DIR = "pause";
const TILE_BYTES = 32;
const LOOK_COUNT = 8;
const GLYPH_ROWS = 4;
const NAME_STRIDE = 25;
const NAME_ROWS = 48;
const STATUS_LEN = 13;
const MAP_CELLS = 32;
const MAP_TILES = 16;
const CAPTION_FIRST = 0x20, CAPTION_LAST = 0x7a;
type Dict = Record<string, unknown>;
type V = Record<string, number>;
class SiteError extends Error {
}
const h4 = (n: number): string => n.toString(16).toUpperCase().padStart(4, "0");
function op(rom: RomFile, site: number, opcode: number): void {
    const got = rom.u16be(site);
    if (got !== opcode)
        throw new SiteError(`code site 0x${site.toString(16).toUpperCase()}: opcode 0x${h4(opcode)} expected, 0x${h4(got)} found`);
}
function imm16(rom: RomFile, site: number, opcode: number): number {
    op(rom, site, opcode);
    return rom.u16be(site + 2);
}
function imm32(rom: RomFile, site: number, opcode: number): number {
    op(rom, site, opcode);
    return rom.u32be(site + 2);
}
function pcrel(rom: RomFile, site: number, opcode: number): number {
    op(rom, site, opcode);
    const w = rom.u16be(site + 2);
    return site + 2 + w - (w & 0x8000 ? 0x10000 : 0);
}
function pcindex(rom: RomFile, site: number, opcode: number): number {
    op(rom, site, opcode);
    const d = rom.u16be(site + 2) & 0xff;
    return site + 2 + (d & 0x80 ? d - 256 : d);
}
function vdpAddr(cmd: number): number {
    return ((cmd >>> 16) & 0x3fff) | ((cmd & 3) << 14);
}
function hexpix(px: ArrayLike<number>): string {
    let s = "";
    for (let i = 0; i < px.length; i++)
        s += px[i]!.toString(16);
    return s;
}
function ranges(values: number[]): number[][] {
    const out: number[][] = [];
    for (const v of values) {
        const last = out[out.length - 1];
        if (last && last[1] === v - 1)
            last[1] = v;
        else
            out.push([v, v]);
    }
    return out;
}
function cstr(raw: Uint8Array): string {
    let n = raw.indexOf(0);
    const s = n < 0 ? raw : raw.subarray(0, n);
    for (const b of s)
        if (b < 0x20 || b > 0x7e)
            throw new Error("non-printable byte in a caption string");
    return Array.from(s, (b) => String.fromCharCode(b)).join("");
}
const ascii = (raw: Uint8Array): string => {
    for (const b of raw)
        if (b > 0x7f)
            throw new Error("non-ASCII byte");
    return Array.from(raw, (b) => String.fromCharCode(b)).join("");
};
function readSites(rom: RomFile): {
    v: V;
    ev: Dict[];
} {
    const ev: Dict[] = [];
    const v: V = {};
    const note = (site: number, what: string): void => { ev.push({ rom_offset: hexs(site), what }); };
    v.backdrop_block = imm32(rom, 0x2d30, 0x207c);
    note(0x2d30, "movea.l #imm, a0: the backdrop picture block");
    v.backdrop_tile_vram = imm16(rom, 0x2d20, 0x303c);
    v.backdrop_plane_vram = imm16(rom, 0x2d24, 0x323c);
    v.backdrop_attr_base = imm16(rom, 0x2d2c, 0x363c);
    note(0x2d20, "tile VRAM address, plane address and tile attribute base given to the blitter");
    v.cram63_cmd = imm32(rom, 0x2d00, 0x23fc);
    v.cram63_value = imm16(rom, 0x2d0a, 0x33fc);
    note(0x2d00, "CRAM address 0x7E (index 63) is set to 0");
    const banks: Array<[
        string,
        number,
        number,
        number
    ]> = [
        ["symbols", 0x2d3a, 0x2d44, 0x2d4a], ["caption_font", 0x2d58, 0x2d62, 0x2d68], ["label_font", 0x2d76, 0x2d80, 0x2d86]
    ];
    for (const [name, cmdSite, srcSite, cntSite] of banks) {
        v[name + "_vram"] = vdpAddr(imm32(rom, cmdSite, 0x23fc));
        v[name + "_rom"] = imm32(rom, srcSite, 0x41f9);
        v[name + "_longs"] = imm16(rom, cntSite, 0x3e3c) + 1;
        note(srcSite, `${name}: ROM source, VRAM destination (control long at 0x${cmdSite.toString(16).toUpperCase()}), long count (dbra, count + 1)`);
    }
    v.map_plane_addr = imm16(rom, 0x2d94, 0x343c);
    v.map_tile_base = imm16(rom, 0x2d98, 0x363c);
    note(0x2d94, "plane B address of the first map tile and the first tile word (0xE267)");
    if (imm32(rom, 0x2dd4, 0x23fc) !== 0x40000010)
        throw new SiteError("VSRAM write command at 0x2DD4 is not 'write VSRAM address 0'");
    v.vsram_a = imm16(rom, 0x2dde, 0x38bc);
    v.vsram_b = imm16(rom, 0x2de2, 0x38bc);
    note(0x2dd4, "VSRAM 0: plane A scroll 0, plane B scroll 0xFFFC (-4)");
    v.text_cram_cmd = imm32(rom, 0x2de6, 0x23fc);
    v.text_palette_rom = imm32(rom, 0x2df0, 0x207c);
    note(0x2de6, "CRAM address 0x40 (line 2) receives 8 long words (16 colours) from the text palette");
    v.pointer_table = pcrel(rom, 0x2fb2, 0x47fa);
    note(0x2fb2, "lea pc-relative: the table of eight glyph pointers");
    v.class_look_table = pcindex(rom, 0xe238, 0x163b);
    note(0xe238, "move.b d8(pc, d3.w), d3: the 256-byte class -> look table");
    v.label_vram_cmd = imm32(rom, 0x3062, 0x23fc);
    v.label_table = pcrel(rom, 0x3078, 0x41fa);
    note(0x3062, "label: plane B address, then the 16-character string of (episode << 4) + floor");
    v.name_table = pcrel(rom, 0x5761e, 0x43fa);
    v.name_stride = imm16(rom, 0x5762c, 0xc2fc);
    note(0x5761e, "level-name table and its row stride (mulu.w #0x19)");
    v.writer_font_table = pcrel(rom, 0x57d5c, 0x43fa);
    v.writer_clear_words = imm16(rom, 0x57d50, 0x3e3c) + 1;
    v.writer_clear_value = imm16(rom, 0x57d54, 0x38bc);
    v.writer_centre_col = imm16(rom, 0x57d70, 0x0641);
    note(0x57d5c, "text writer: character table, clear of 128 words with 0x8000, centre column 0x14");
    v.status_not_secured = pcrel(rom, 0x57670, 0x43fa);
    v.status_secured = pcrel(rom, 0x5766a, 0x43fa);
    note(0x5766a, "the two 13-character status strings");
    v.carry_title_a = pcrel(rom, 0x57b5a, 0x43fa);
    v.carry_title_b = pcrel(rom, 0x57b66, 0x43fa);
    note(0x57b5a, "the two world titles of the carry-over row");
    v.row_prev = imm16(rom, 0x57572, 0x303c);
    v.row_cur = imm16(rom, 0x575b8, 0x303c);
    v.row_next = imm16(rom, 0x575da, 0x303c);
    note(0x57572, "VRAM addresses of the three caption rows (plane A rows 1, 3, 5)");
    v.marker_y_add = imm16(rom, 0x2f0e, 0x0640);
    v.marker_attr = imm16(rom, 0x2f22, 0x34fc);
    v.marker_x_add = imm16(rom, 0x2f2c, 0x0640);
    if (rom.u16be(0x2f0c) !== 0xec40 || rom.u16be(0x2f2a) !== 0xec40)
        throw new SiteError("marker position shift is not asr.w #6");
    note(0x2f0e, "marker sprite: Y = (position >> 6) + 0xD1, attribute word 0xE19D, X = (position >> 6) + 0xDD");
    return { v, ev };
}
type Bank = [
    number,
    number,
    Uint8Array,
    string,
    number
];
function writerTable(rom: RomFile, v: V): Dict[] {
    const mp = mainCharMap(rom);
    const first = v.caption_font_vram >> 5;
    const rows: Dict[] = [];
    for (let code = CAPTION_FIRST; code <= CAPTION_LAST; code++) {
        const up = rom.u16be(v.writer_font_table + 4 * (code - 0x20));
        const lo = rom.u16be(v.writer_font_table + 4 * (code - 0x20) + 2);
        const tiles: Array<number | null> = [];
        for (const w of [up, lo]) {
            if (w === 0)
                tiles.push(null);
            else {
                if ((w & 0xf800) !== 0xc000)
                    throw new Error(`writer table char 0x${code.toString(16)}: word 0x${h4(w)} is not palette 2 + priority`);
                tiles.push((w & 0x7ff) - first);
            }
        }
        const m = mp.get(code)!;
        if (tiles[0] !== m[0] || tiles[1] !== m[1])
            throw new Error(`writer table differs from the font's character map at 0x${code.toString(16)}`);
        rows.push({ char: String.fromCharCode(code), code, font_tiles: tiles, lower_word: hexw(lo), upper_word: hexw(up) });
    }
    return rows;
}
function renderText(text: string, words: Map<number, [
    number,
    number
]>): {
    col: number;
    up: number[];
    lo: number[];
} {
    const col = 0x14 - Math.floor(text.length / 2);
    const up = Array.from(text, (c) => words.get(c.charCodeAt(0))![0]);
    const lo = Array.from(text, (c) => words.get(c.charCodeAt(0))![1]);
    return { col, up, lo };
}
function labelWords(text: string, v: V): number[] {
    const out: number[] = [];
    for (const ch of text) {
        const b = ch.charCodeAt(0);
        if (b < 0x30)
            out.push(0x8000);
        else if (b <= 0x39)
            out.push(v.label_digit_base + b - 0x30);
        else if (b >= 0x41 && b <= 0x5a)
            out.push(v.label_letter_base + b - 0x41);
        else
            throw new Error(`label character ${JSON.stringify(ch)} is not a digit, a capital or a blank`);
    }
    return out;
}
export const pause: Command = {
    name: "pause",
    run(ctx: Context, _options: Record<string, unknown>) {
        const rom = ctx.rom;
        const { v, ev: evidence } = readSites(rom);
        v.label_digit_base = imm16(rom, 0x3096, 0x0640);
        v.label_letter_base = imm16(rom, 0x30a6, 0x0640);
        if (rom.u16be(0x3086) !== 0x0c00 || rom.u16be(0x3088) !== 0x0030 || rom.u16be(0x308c) !== 0x0c00 || rom.u16be(0x308e) !== 0x0039) {
            throw new SiteError("label character class checks (cmpi.b #0x30 / #0x39) not found");
        }
        evidence.push({ rom_offset: "0x3086", what: "label characters: below '0' -> blank 0x8000, '0'..'9' -> 0xE243 + digit, others -> 0xE24D + (c - 'A')" });
        let bd: Block | null = null;
        for (const b of loadBlocks(rom).values())
            if (b.kind === "selfrel" && b.romOffset === v.backdrop_block)
                bd = b;
        if (!bd)
            throw new Error("no selfrel block at the backdrop address");
        const cols = bd.header.map_columns as number, rows = bd.header.map_rows as number;
        const words = bd.mapWords!;
        const banks: Record<string, Bank> = {};
        banks.backdrop = [v.backdrop_tile_vram >> 5, bd.count, bd.data, `the 90 tiles of the backdrop block (ROM 0x${v.backdrop_block.toString(16).toUpperCase()})`, bd.dataOffset];
        const bankSpecs: Array<[
            string,
            string
        ]> = [
            ["symbols", "map-cell patterns (tiles 0-1), the marker (tile 2), small graphics"],
            ["caption_font", "the 8 x 16 text font: tile pairs, upper then lower"],
            ["label_font", "the label font, one tile per character: digits 0-9 then A-Z"]
        ];
        for (const [name, what] of bankSpecs) {
            const n = Math.floor((v[name + "_longs"]! * 4) / TILE_BYTES);
            banks[name] = [v[name + "_vram"]! >> 5, n, rom.bytesAt(v[name + "_rom"]!, n * TILE_BYTES), what, v[name + "_rom"]!];
        }
        const tbanks: Dict = {};
        const tileHex: Record<string, string[]> = {};
        for (const name of Object.keys(banks).sort()) {
            const [slot0, n, data, what, romOff] = banks[name]!;
            const tiles: string[] = [];
            for (let i = 0; i < n; i++)
                tiles.push(hexpix(decodeTile(data.subarray(i * TILE_BYTES, (i + 1) * TILE_BYTES))));
            const back = new Uint8Array(n * TILE_BYTES);
            tiles.forEach((t, i) => back.set(encodeTile(Uint8Array.from(t, (c) => parseInt(c, 16))), i * TILE_BYTES));
            for (let i = 0; i < back.length; i++)
                if (back[i] !== data[i])
                    throw new Error(`bank ${name} does not round-trip`);
            tileHex[name] = tiles;
            tbanks[name] = {
                description: what, first_tile_slot: slot0, rom_offset: hexs(romOff), sha256_rom: sha256Hex(data),
                tile_count: n, tiles, vram_address: hexs(slot0 << 5),
            };
        }
        const tdoc: Dict = {
            banks: tbanks, format: TILES_FORMAT,
            tile_format: "one tile = 64 hex digits, row-major (8 rows of 8 pixels, top row first, left pixel " +
                "first); each digit is the colour index within the palette line of the tile's " +
                "name-table word; index 0 is transparent",
        };
        const bias = (v.backdrop_tile_vram >> 5) + v.backdrop_attr_base;
        const entries = words.map((w) => (w + bias) & 0xffff);
        const slot0 = banks.backdrop![0];
        const bad = entries.filter((e) => !(slot0 <= (e & 0x7ff) && (e & 0x7ff) < slot0 + banks.backdrop![1]));
        if (bad.length)
            throw new Error("backdrop name table reaches outside its tile block");
        const rowStr = (arr: number[], r: number): string => Array.from({ length: cols }, (_, c) => h4(arr[r * cols + c]!)).join(" ");
        const backdrop: Dict = {
            attribute_base: hexw(v.backdrop_attr_base), bias: hexw(bias), bias_rule: "entry = (word + bias) & 0xFFFF",
            columns: cols, entry_bits: "PCCV HTTT TTTT TTTT (priority, palette line, vflip, hflip, tile slot)",
            entry_rows: Array.from({ length: rows }, (_, r) => rowStr(entries, r)),
            first_tile_slot: slot0, palette_line: 3, plane_vram_address: hexs(v.backdrop_plane_vram),
            priority: 0, rom_offset: hexs(v.backdrop_block), rows,
            tile_bank: "backdrop", tile_of_entry: "bank tile = (entry & 0x7FF) - first_tile_slot",
            rom_words_rows: Array.from({ length: rows }, (_, r) => rowStr(words, r)),
        };
        const tw = palWords(rom, v.text_palette_rom);
        const line3: Dict = {};
        for (const off of [0, 0x100, -0x80, 0x80])
            line3[hexs(MAZE_PAL + off)] = palWords(rom, MAZE_PAL + off + 0x60).map(hexw);
        const palettes: Dict = {
            caption_line: {
                cram_line: Math.floor(Math.floor(vdpAddr(v.text_cram_cmd) / 2) / 16), cram_words: tw.map(hexw),
                rgb: tw.map((w) => [...cramToRgb(w)]), rom_offset: hexs(v.text_palette_rom), used_by: "caption font (palette bits 2)",
            },
            cram_index_63: {
                cram_index: Math.floor(vdpAddr(v.cram63_cmd) / 2), value: hexw(v.cram63_value),
                note: "the last colour of line 3 is set to 0 (the hit-flash colour)",
            },
            inherited_lines: {
                lines: [0, 1, 3],
                note: "not written by the screen: the colours of the level that was running; line 3 " +
                    "carries the backdrop, the map tiles, the label, the marker and the symbol " +
                    "graphics (colour index 15 of line 3 reads 0)",
                line_3_of_the_gameplay_tables: line3,
            },
            cram_expansion: "each 3-bit channel (bits 3..1 red, 7..5 green, 11..9 blue) times 36",
        };
        const table = Array.from(rom.bytesAt(v.class_look_table, 256));
        if (Math.max(...table) >= LOOK_COUNT)
            throw new Error("a class maps to a look >= 8");
        const byLookArr = new Map<number, number[]>();
        table.forEach((k, c) => { if (!byLookArr.has(k))
            byLookArr.set(k, []); byLookArr.get(k)!.push(c); });
        const byLook: Dict = {};
        for (const k of [...byLookArr.keys()].sort((a, b) => a - b))
            byLook[String(k)] = ranges(byLookArr.get(k)!);
        const symLo = banks.symbols![4], symHi = symLo + banks.symbols![1] * TILE_BYTES;
        const looks: Dict[] = [];
        for (let i = 0; i < LOOK_COUNT; i++) {
            const p = rom.u32be(v.pointer_table + 4 * i);
            if (!(symLo <= p && p + 4 * (GLYPH_ROWS - 1) + 2 <= symHi))
                throw new Error(`glyph pointer ${i} outside the symbol bank`);
            looks.push({
                look: i, pattern_rom_offset: hexs(p),
                rows: Array.from({ length: GLYPH_ROWS }, (_, r) => h4(rom.u16be(p + 4 * r))),
                row_rom_offsets: Array.from({ length: GLYPH_ROWS }, (_, r) => hexs(p + 4 * r)),
            });
        }
        const planeB = 0xc000;
        const offB = v.map_plane_addr - planeB;
        const mcol = Math.floor((offB % 0x80) / 2), mrow = Math.floor(offB / 0x80);
        if (mcol !== 12 || mrow !== 10)
            throw new Error("map origin is not plane cell (12, 10)");
        const scrollB = v.vsram_b & 0x8000 ? v.vsram_b - 0x10000 : v.vsram_b;
        const origin = [mcol * 8, mrow * 8 - scrollB];
        const mapDoc: Dict = {
            cell_array: {
                columns: MAP_CELLS, rows: MAP_CELLS, index: "cell (x, y) = byte 32 * y + x",
                source: "the player's floor: the live cell array of the floor the player is on, every cell read at the moment the screen opens",
            },
            class_of_cell: "class = the level's 256-byte class table [cell value] (built per level, not part of this screen)",
            class_to_look: table,
            class_to_look_rom_offset: hexs(v.class_look_table),
            classes_by_look: byLook,
            glyph_pixels: "each glyph is 4 x 4 pixels; a row is one 16-bit word, 4 hex digits = 4 pixels left to right " +
                "(colour index in palette line 3); stored with a stride of 4 bytes (the partner glyph's row " +
                "sits 2 bytes later); index 0 is transparent",
            looks,
            pointer_table_rom_offset: hexs(v.pointer_table),
            screen_origin_px: origin,
            screen_size_px: [MAP_CELLS * 4, MAP_CELLS * 4],
            tile_block: {
                columns: MAP_TILES, rows: MAP_TILES, first_plane_cell: [mcol, mrow],
                plane: "B", plane_address: hexs(v.map_plane_addr), palette_line: 3, priority: 1,
                plane_b_scroll_px: scrollB, plane_a_scroll_px: v.vsram_a,
                first_tile_word: hexw(v.map_tile_base),
                first_tile_slot: v.map_tile_base & 0x7ff, tile_count: MAP_TILES * MAP_TILES,
                tile_word_rule: "word of the tile at row ty, column tx = first_tile_word + 16 * ty + tx",
                tile_pixels: "8 x 8, written by the map builder into slots 0x267..0x366",
            },
            tile_build: {
                quadrants: [
                    { cell: [0, 0], tile_rows: [0, 3], tile_columns: [0, 3] },
                    { cell: [1, 0], tile_rows: [0, 3], tile_columns: [4, 7] },
                    { cell: [0, 1], tile_rows: [4, 7], tile_columns: [0, 3] },
                    { cell: [1, 1], tile_rows: [4, 7], tile_columns: [4, 7] }
                ],
                rule: "tile (tx, ty) covers cells (2 * tx, 2 * ty) .. (2 * tx + 1, 2 * ty + 1); each cell is drawn " +
                    "with the glyph of its look; quadrant 'cell' is the offset (dx, dy) inside the 2 x 2 group; " +
                    "pixel (px, py) of the tile = row (py mod 4) of the glyph, pixel (px mod 4) of that row",
                order: "tiles are written row-major, 16 per row, to VRAM tile slots 0x267 + 16 * ty + tx",
                each_cell_row_word: "the 32-bit tile row = glyph row word of the left cell, then of the right cell",
            },
        };
        const symTiles = tileHex.symbols!;
        const markerSlot = v.marker_attr & 0x7ff;
        const markerTile = markerSlot - banks.symbols![0];
        const marker: Dict = {
            attribute_word: hexw(v.marker_attr), attribute_bits: "priority 1, palette line 3, tile slot 0x19D",
            blink: "drawn while bit 4 of the frame counter is set: 16 frames shown, 16 hidden",
            link_word: "the sprite's size/link word is its own index + 1 with size 0 (one 8 x 8 tile)",
            position: {
                x_sprite: "(player x >> 6) + 0xDD", y_sprite: "(player y >> 6) + 0xD1",
                shift: "arithmetic shift right of the 16-bit position word",
                x_screen: `(player x >> 6) + ${v.marker_x_add - 128}`,
                y_screen: `(player y >> 6) + ${v.marker_y_add - 128}`,
                unit: "256 position units per floor cell, 64 per map pixel; the sprite's top-left corner",
                sprite_origin_offset: 128,
            },
            tile: symTiles[markerTile], tile_bank: "symbols", tile_index_in_bank: markerTile,
            tile_slot: markerSlot,
        };
        const caps = captionStrings(rom);
        if (v.label_table !== CAPTION_TABLE)
            throw new Error("label table address differs from the fonts command's");
        const labOff = vdpAddr(v.label_vram_cmd) - planeB;
        const labCol = Math.floor((labOff % 0x80) / 2), labRow = Math.floor(labOff / 0x80);
        const label: Dict = {
            characters: 16, first_plane_cell: [labCol, labRow], plane: "B",
            plane_address: hexs(vdpAddr(v.label_vram_cmd)),
            screen_px: [labCol * 8, labRow * 8 - scrollB],
            string_index: "(episode << 4) + floor of the PLAYER's floor",
            table_rom_offset: hexs(v.label_table),
            table_entries: caps.map((s, i) => ({ index: i, episode: i >> 4, floor: i & 15, text: s })),
            table_note: "44 strings of 16 characters; indices 44..47 do not exist (the third episode has 12 floors) - the " +
                "bytes behind the table are the glyph pointers",
            tile_bank: "label_font",
            word_rule: {
                below_0x30: "0x8000 (blank, priority)", digit: hexw(v.label_digit_base) + " + (c - '0')",
                letter: hexw(v.label_letter_base) + " + (c - 'A')",
            },
        };
        for (const s of caps)
            labelWords(s, v);
        const names: Dict[] = [];
        for (let i = 0; i < NAME_ROWS; i++) {
            names.push({
                index: i, episode: i >> 4, floor: i & 15,
                text: cstr(rom.bytesAt(v.name_table + NAME_STRIDE * i, NAME_STRIDE)),
                rom_offset: hexs(v.name_table + NAME_STRIDE * i),
            });
        }
        if (v.name_stride !== NAME_STRIDE)
            throw new Error("name stride differs from 25");
        const status: Record<string, {
            rom_offset: string;
            text: string;
            length: number;
        }> = {};
        for (const [key, name] of [["not_secured", "status_not_secured"], ["secured", "status_secured"]] as const) {
            status[key] = { rom_offset: hexs(v[name]!), text: ascii(rom.bytesAt(v[name]!, STATUS_LEN)), length: STATUS_LEN };
        }
        const titles: Dict = {};
        for (const [key, name] of [["episode_1", "carry_title_a"], ["other_episodes", "carry_title_b"]] as const) {
            titles[key] = { rom_offset: hexs(v[name]!), text: cstr(rom.bytesAt(v[name]!, NAME_STRIDE)) };
        }
        const wt = writerTable(rom, v);
        const wmap = new Map<number, [
            number,
            number
        ]>();
        for (const r of wt)
            wmap.set(r.code as number, [parseInt((r.upper_word as string).slice(2), 16), parseInt((r.lower_word as string).slice(2), 16)]);
        const rowAddrs: Array<[
            string,
            number
        ]> = [["previous", v.row_prev], ["current", v.row_cur], ["next", v.row_next]];
        const examples: Dict[] = [];
        for (const text of [(names[0]!.text as string) + status.not_secured!.text, (names[5]!.text as string) + status.secured!.text]) {
            const { col, up, lo } = renderText(text, wmap);
            examples.push({ column: col, lower_words: lo.map(hexw), text, upper_words: up.map(hexw) });
        }
        const exLabel: Dict[] = [];
        for (const i of [0, 5])
            exLabel.push({ index: i, text: caps[i], words: labelWords(caps[i]!, v).map(hexw) });
        const captions: Dict = {
            carry_over_titles: titles,
            clear: {
                words: v.writer_clear_words, value: hexw(v.writer_clear_value),
                rule: "before a row is written 128 words from its address (two plane rows of 64) are set to 0x8000",
            },
            examples,
            level_names: {
                rom_offset: hexs(v.name_table), row_stride: NAME_STRIDE, rows: names,
                index: "(episode << 4) + floor; text ends at the first NUL; the stored text includes the " +
                    "' : ' separator; rows of 24 blanks are floors that do not exist",
            },
            name_index_note: "floor = the browsed floor, episode = the current episode",
            palette_line: 2,
            rows: rowAddrs.map(([r, a]) => {
                const pr = Math.floor((a - 0xe000) / 0x80);
                return { role: r, vram_address: hexs(a), plane_row: pr, tile_rows: [pr, pr + 1], screen_y_px: [pr * 8, pr * 8 + 15] };
            }),
            status,
            text_rule: "text = level name of the row's floor + entry; entry = the status string for the counted floor " +
                "(secured when the floor's secured flag is non-zero, else not secured), else the 9 stored " +
                "characters of that floor + 4 blanks; the previous row of floor 0 holds the carry-over row " +
                "(title + 9 stored characters + 4 blanks) when one exists, else it is blank (words 0x0000); the " +
                "next row is blank when floor + 1 is past the counted floor",
            writer: {
                centre: "column = 20 - (length of the whole string) // 2, the trailing blanks count",
                font_table_rom_offset: hexs(v.writer_font_table), font_bank: "caption_font",
                layout: "4 bytes per character from 0x20: upper-tile word, lower-tile word (0 = no tile); the upper " +
                    "word goes to the row's plane row, the lower to the next plane row, same column",
                characters: wt, palette_line: 2, priority: 1,
            },
        };
        const tileBanks: Dict = {};
        for (const k of Object.keys(banks).sort()) {
            tileBanks[k] = { first_slot: (tbanks[k] as Dict).first_tile_slot, tiles: (tbanks[k] as Dict).tile_count };
        }
        const doc: Dict = {
            backdrop, captions, evidence, format: FORMAT, label, label_examples: exLabel, map: mapDoc, marker, palettes,
            screen: {
                display_px: [320, 224], plane_a_vram: "0xE000", plane_b_vram: "0xC000", plane_row_stride_bytes: 128,
                regions: {
                    backdrop_px: [0, 0, 319, 223],
                    captions_px: [0, 8, 319, 55],
                    label_px: [origin[0]!, labRow * 8 - scrollB, origin[0]! + 127, labRow * 8 - scrollB + 7],
                    map_px: [origin[0]!, origin[1]!, origin[0]! + 127, origin[1]! + 127],
                },
                regions_note: "rectangles are [x0, y0, x1, y1] inclusive; the caption band overwrites the backdrop " +
                    "completely (full-width clears); the marker sprite lies inside map_px",
                tile_banks: tileBanks,
            },
            tiles_file: "tiles.json",
        };
        ctx.writeJson(`${OUT_DIR}/pause.json`, doc, { part: "recipe" });
        ctx.writeJson(`${OUT_DIR}/tiles.json`, tdoc, { part: "tiles" });
        ctx.say("pause: 2 files");
    },
};

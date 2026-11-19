import type { Command, Context, RomFile } from "../core.js";
import { encodePng } from "../png.js";
import { sha256Hex } from "../../boot/sha256.js";
export const FORMAT = "ztassets-fonts/1";
export const OUT_DIR = "fonts";
export const TILE_BYTES = 32;
type Rgb = readonly [
    number,
    number,
    number
];
const SETS: ReadonlyArray<readonly [
    string,
    number,
    number,
    number,
    string,
    string
]> = [
    ["main", 0x125116, 4800, 15, "newgame", "text font, 8x16 characters made of an upper and a lower tile"],
    ["symbols", 0x12e846, 608, 19, "maze3", "pause-map symbol bank: two tiles of map-cell patterns, the player marker, small graphics"],
    ["font2", 0x12eaa6, 1152, 12, "maze3", "pause-map caption font: digits 0-9 then letters A-Z, one tile each"],
    ["hud_digits", 0x16e618, 320, 10, "maze3", "health-percentage digit masks '0'..'9' (pixels 0 and 15)"],
    ["hud_letters", 0x16e758, 1280, 10, "maze3", "scroll-text font: A-Z, 0-9, '.', '-', ':', '?' (pixels 7 and 15)"],
];
const PALETTES: Record<string, readonly [
    number,
    number,
    string
]> = {
    newgame: [0x1cdae, 0,
        "the new-game text screen copies this 16-word table into CRAM line 0 and draws " +
            "the font with name-table words 0x8001.. (palette bits 0)"],
    maze3: [0x20f2, 3,
        "line 3 of the maze CRAM table: caption, marker, scroll-text and HUD counter " +
            "name-table/sprite words carry palette bits 3 (the line is the same in 0x21F2 " +
            "and in the night-vision tables)"],
};
const MAIN_TABLES: ReadonlyArray<readonly [
    number,
    number,
    number,
    number,
    string
]> = [
    [0xc6aa4, 0xc7196, 0x4b0, 0x6000, "palette 3, no priority"],
    [0x1dea6, 0x1dd3a, 0x001, 0x8000, "priority, palette 0"],
];
const CHAR_FIRST = 0x20, CHAR_LAST = 0x7a;
const GLYPH_COLS = 13, GLYPH_ROWS = 7;
const HUD_LETTER_TABLE = 0x1e04c;
const HUD_LETTER_LAST = 0x5a;
const HUD_LETTER_FIRST_TILE = 0x574;
const HUD_BLANK_WORD = 0xe573;
const FONT2_DIGIT_BASE = 0xe243;
const FONT2_LETTER_BASE = 0xe24d;
const FONT2_FIRST_TILE = 0x243;
export const CAPTION_TABLE = 0x30b2;
export const CAPTION_COUNT = 44;
const SHEET_BG: Rgb = [40, 40, 56];
const SHEET_SCALE = 2;
const SHEET_MAX_WIDTH = 640;
const SHEET_GAP = 4;
const hex = (n: number): string => "0x" + n.toString(16).toUpperCase();
const hex4 = (n: number): string => "0x" + n.toString(16).toUpperCase().padStart(4, "0");
const hex2 = (n: number): string => n.toString(16).toUpperCase().padStart(2, "0");
export function cramToRgb(word: number): Rgb {
    return [((word >> 1) & 7) * 36, ((word >> 5) & 7) * 36, ((word >> 9) & 7) * 36];
}
function paletteLine(rom: RomFile, base: number, line: number): {
    words: number[];
    rgb: Rgb[];
} {
    const words = Array.from({ length: 16 }, (_, i) => rom.u16be(base + (line * 16 + i) * 2));
    return { words, rgb: words.map(cramToRgb) };
}
export function decodeTile(raw: Uint8Array): Uint8Array {
    if (raw.length !== TILE_BYTES)
        throw new Error(`a tile is ${TILE_BYTES} bytes`);
    const px = new Uint8Array(64);
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 4; c++) {
            const b = raw[r * 4 + c]!;
            px[r * 8 + 2 * c] = b >> 4;
            px[r * 8 + 2 * c + 1] = b & 15;
        }
    }
    return px;
}
export function encodeTile(px: Uint8Array): Uint8Array {
    if (px.length !== 64 || Math.max(...px) > 15)
        throw new Error("tile pixels must be 64 indices in 0..15");
    const out = new Uint8Array(32);
    for (let k = 0; k < 32; k++)
        out[k] = (px[2 * k]! << 4) | px[2 * k + 1]!;
    return out;
}
function gridPixels(tiles: Uint8Array[], cols: number): {
    w: number;
    h: number;
    px: Uint8Array;
} {
    const rows = Math.floor((tiles.length + cols - 1) / cols);
    const w = cols * 8;
    const out = new Uint8Array(w * rows * 8);
    tiles.forEach((t, i) => {
        const gx = (i % cols) * 8, gy = Math.floor(i / cols) * 8;
        for (let y = 0; y < 8; y++)
            out.set(t.subarray(y * 8, y * 8 + 8), (gy + y) * w + gx);
    });
    return { w, h: rows * 8, px: out };
}
function cellsPixels(cells: Uint8Array[], cw: number, ch: number, cols: number): {
    w: number;
    h: number;
    px: Uint8Array;
} {
    const rows = Math.floor((cells.length + cols - 1) / cols);
    const w = cols * cw;
    const out = new Uint8Array(w * rows * ch);
    cells.forEach((c, i) => {
        const gx = (i % cols) * cw, gy = Math.floor(i / cols) * ch;
        for (let y = 0; y < ch; y++)
            out.set(c.subarray(y * cw, (y + 1) * cw), (gy + y) * w + gx);
    });
    return { w, h: rows * ch, px: out };
}
function indexedPng(w: number, h: number, pixels: Uint8Array, rgb16: readonly Rgb[]): Uint8Array {
    const flat: number[] = [];
    for (const [r, g, b] of rgb16)
        flat.push(r, g, b);
    return encodePng({ width: w, height: h, mode: "P", pixels, palette: flat, bits: 4, level: 9 });
}
type Panel = readonly [
    string,
    number,
    number,
    Uint8Array,
    readonly Rgb[]
];
function contactSheet(panels: Panel[]): {
    png: Uint8Array;
    w: number;
    h: number;
    info: Array<Record<string, unknown>>;
} {
    const s = SHEET_SCALE;
    let x = 0, y = 0, rowH = 0;
    const placed: Array<{
        name: string;
        x: number;
        y: number;
        w: number;
        h: number;
        px: Uint8Array;
        rgb: readonly Rgb[];
    }> = [];
    for (const [name, w, h, px, rgb] of panels) {
        const pw = w * s, ph = h * s;
        if (x && x + pw > SHEET_MAX_WIDTH) {
            x = 0;
            y = y + rowH + SHEET_GAP;
            rowH = 0;
        }
        placed.push({ name, x, y, w, h, px, rgb });
        x += pw + SHEET_GAP;
        rowH = Math.max(rowH, ph);
    }
    const totalW = Math.max(...placed.map((p) => p.x + p.w * s));
    const totalH = y + rowH;
    const buf = new Uint8Array(totalW * totalH * 3);
    for (let i = 0; i < totalW * totalH; i++)
        buf.set(SHEET_BG, i * 3);
    const info: Array<Record<string, unknown>> = [];
    for (const p of placed) {
        const lut = Array.from({ length: 16 }, (_, v) => (v ? p.rgb[v]! : SHEET_BG));
        for (let sy = 0; sy < p.h * s; sy++) {
            const base = Math.floor(sy / s) * p.w;
            let o = ((p.y + sy) * totalW + p.x) * 3;
            for (let k = 0; k < p.w; k++) {
                const c = lut[p.px[base + k]!]!;
                for (let r = 0; r < s; r++) {
                    buf.set(c, o);
                    o += 3;
                }
            }
        }
        info.push({ h: p.h * s, name: p.name, w: p.w * s, x: p.x, y: p.y });
    }
    return { png: encodePng({ width: totalW, height: totalH, mode: "RGB", pixels: buf, level: 9 }), w: totalW, h: totalH, info };
}
export type CharMap = Map<number, [
    number | null,
    number | null
]>;
export function mainCharMap(rom: RomFile): CharMap {
    const nTiles = 150;
    const maps: CharMap[] = [];
    for (const [, table, first, flags] of MAIN_TABLES) {
        const m: CharMap = new Map();
        for (let code = CHAR_FIRST; code <= CHAR_LAST; code++) {
            const pair: Array<number | null> = [];
            for (const half of [0, 1]) {
                const w = rom.u16be(table + (code - 0x20) * 4 + half * 2);
                if (w === 0) {
                    pair.push(null);
                    continue;
                }
                if ((w & 0xf800) !== flags)
                    throw new Error(`table ${hex(table)} char 0x${hex2(code)}: word ${hex4(w)} lacks flags ${hex4(flags)}`);
                const t = (w & 0x7ff) - first;
                if (!(t >= 0 && t < nTiles))
                    throw new Error(`table ${hex(table)} char 0x${hex2(code)}: tile ${t} outside the font`);
                pair.push(t);
            }
            m.set(code, [pair[0]!, pair[1]!]);
        }
        maps.push(m);
    }
    const bad: number[] = [];
    for (const [c, p] of maps[0]!) {
        const q = maps[1]!.get(c)!;
        if (p[0] !== q[0] || p[1] !== q[1])
            bad.push(c);
    }
    if (bad.length)
        throw new Error(`the two text-writer tables disagree for characters ${JSON.stringify(bad)}`);
    return maps[0]!;
}
function hudLetterMap(rom: RomFile): Map<number, number | null> {
    const m = new Map<number, number | null>();
    for (let code = 0x20; code <= HUD_LETTER_LAST; code++) {
        const w = rom.u16be(HUD_LETTER_TABLE + (code - 0x20) * 2);
        if (w === HUD_BLANK_WORD)
            m.set(code, null);
        else {
            const t = (w & 0x7ff) - HUD_LETTER_FIRST_TILE;
            if ((w & 0xf800) !== 0xe000 || !(t >= 0 && t < 40))
                throw new Error(`HUD letter table: char 0x${hex2(code)} word ${hex4(w)} is not a font tile`);
            m.set(code, t);
        }
    }
    return m;
}
function font2CharMap(): Map<string, number> {
    const m = new Map<string, number>();
    for (let i = 0; i < 10; i++)
        m.set(String.fromCharCode(0x30 + i), FONT2_DIGIT_BASE + i - 0xe000 - FONT2_FIRST_TILE);
    for (let i = 0; i < 26; i++)
        m.set(String.fromCharCode(0x41 + i), FONT2_LETTER_BASE + i - 0xe000 - FONT2_FIRST_TILE);
    return m;
}
export function captionStrings(rom: RomFile): string[] {
    return Array.from({ length: CAPTION_COUNT }, (_, i) => Array.from(rom.bytesAt(CAPTION_TABLE + 16 * i, 16), (b) => String.fromCharCode(b)).join(""));
}
const rgbList = (c: Rgb): number[] => [c[0], c[1], c[2]];
export const fonts: Command = {
    name: "fonts",
    run(ctx: Context, _options: Record<string, unknown>) {
        const rom = ctx.rom;
        let nfiles = 0;
        const pal: Record<string, {
            cram_words: string[];
            evidence: string;
            line: number;
            rgb: number[][];
            rom_offset: string;
            _rgb: Rgb[];
        }> = {};
        for (const key of Object.keys(PALETTES).sort()) {
            const [base, line, why] = PALETTES[key]!;
            const { words, rgb } = paletteLine(rom, base, line);
            pal[key] = { cram_words: words.map(hex4), evidence: why, line, rgb: rgb.map(rgbList), rom_offset: hex(base), _rgb: rgb };
        }
        const cmap = mainCharMap(rom);
        const hmap = hudLetterMap(rom);
        const f2map = font2CharMap();
        captionStrings(rom).forEach((s, i) => {
            for (const ch of s)
                if (ch !== " " && !f2map.has(ch))
                    throw new Error(`caption ${i} uses '${ch}', which font2 has no glyph for`);
        });
        const entries: Array<Record<string, unknown>> = [];
        const panels: Panel[] = [];
        const tilePx = new Map<string, Uint8Array[]>();
        for (const [key, off, nbytes, cols, pkey, role] of SETS) {
            if (nbytes % TILE_BYTES)
                throw new Error(`${key}: size ${nbytes} is not a whole number of tiles`);
            const raw = rom.bytesAt(off, nbytes);
            const n = nbytes / TILE_BYTES;
            const tiles = Array.from({ length: n }, (_, i) => decodeTile(raw.subarray(i * TILE_BYTES, (i + 1) * TILE_BYTES)));
            for (let i = 0; i < n; i++) {
                const e = encodeTile(tiles[i]!);
                for (let k = 0; k < 32; k++)
                    if (e[k] !== raw[i * 32 + k])
                        throw new Error(`${key} does not survive its own pack/unpack round trip`);
            }
            tilePx.set(key, tiles);
            const { w, h, px } = gridPixels(tiles, cols);
            const rgb = pal[pkey]!._rgb;
            const a = { palette_rom: pal[pkey]!.rom_offset, palette_line: pal[pkey]!.line, rom_offset: hex(off), set: key };
            const rel = `${key}.png`;
            ctx.writeBytes(`${OUT_DIR}/${rel}`, indexedPng(w, h, px, rgb), a);
            nfiles++;
            panels.push([key, w, h, px, rgb]);
            entries.push({
                anchor: { x: 0, y: 0 }, anchor_kind: "top-left",
                bytes: nbytes, columns: cols, height: h, name: key,
                padding_cells: cols * (h / 8) - n, palette: pkey, png: rel,
                role, rom_offset: hex(off), rows: h / 8,
                sha256_pixels: sha256Hex(px),
                sha256_rom: sha256Hex(raw),
                tiles: n, width: w,
            });
            ctx.say(`fonts: ${key}: ${n} tiles from ${hex(off)}`);
        }
        const byName = new Map(entries.map((e) => [e["name"] as string, e]));
        const mt = tilePx.get("main")!;
        const blank = new Uint8Array(64);
        const cells: Uint8Array[] = [];
        const glyphs: Record<string, unknown> = {};
        const pairUse = new Map<string, number[]>();
        const pk = (code: number): string => JSON.stringify(cmap.get(code));
        for (let code = CHAR_FIRST; code <= CHAR_LAST; code++) {
            const k = pk(code);
            if (!pairUse.has(k))
                pairUse.set(k, []);
            pairUse.get(k)!.push(code);
        }
        for (let code = CHAR_FIRST; code <= CHAR_LAST; code++) {
            const [up, lo] = cmap.get(code)!;
            const cell = new Uint8Array(128);
            cell.set(up !== null ? mt[up]! : blank, 0);
            cell.set(lo !== null ? mt[lo]! : blank, 64);
            cells.push(cell);
            const g: Record<string, unknown> = { code, lower: lo, tiles: [up, lo].filter((t) => t !== null), upper: up };
            const users = pairUse.get(pk(code))!;
            if (users.length > 1 && !(up === null && lo === null))
                g["shared_tiles_with"] = users.filter((c) => c !== code).map((c) => String.fromCharCode(c));
            glyphs[String.fromCharCode(code)] = g;
        }
        const ga = cellsPixels(cells, 8, 16, GLYPH_COLS);
        if (ga.w !== GLYPH_COLS * 8 || ga.h !== GLYPH_ROWS * 16 || cells.length !== GLYPH_COLS * GLYPH_ROWS)
            throw new Error("glyph atlas geometry");
        const grgb = pal["newgame"]!._rgb;
        ctx.writeBytes(`${OUT_DIR}/main_glyphs.png`, indexedPng(ga.w, ga.h, ga.px, grgb), { palette_rom: pal["newgame"]!.rom_offset, palette_line: 0, set: "main_glyphs" });
        nfiles++;
        panels.unshift(["main_glyphs", ga.w, ga.h, ga.px, grgb]);
        const main = byName.get("main")!;
        main["glyph_atlas"] = {
            cell: { h: 16, w: 8 }, columns: GLYPH_COLS, first_code: CHAR_FIRST,
            height: ga.h, last_code: CHAR_LAST, png: "main_glyphs.png", rows: GLYPH_ROWS,
            sha256_pixels: sha256Hex(ga.px), width: ga.w
        };
        main["glyphs"] = glyphs;
        main["glyph_sources"] = MAIN_TABLES.map(([writer, table, first, flags, what]) => ({
            flags: hex4(flags), flags_meaning: what, first_tile_number: first,
            table_rom_offset: hex(table), writer_rom_offset: hex(writer),
            layout: "4 bytes per character from 0x20: upper-tile word, lower-tile word"
        }));
        const hl: Record<string, unknown> = {};
        for (const [code, t] of [...hmap.entries()].sort((a, b) => a[0] - b[0])) {
            hl[String.fromCharCode(code)] = t !== null ? { code, tile: t } : { blank: true, code };
        }
        const hudLetters = byName.get("hud_letters")!;
        hudLetters["glyphs"] = hl;
        hudLetters["glyph_sources"] = [{
                blank: "characters without a glyph map to a solid tile of 15s that the game uploads in " +
                    "front of this bank (tile 0x573); it is not part of the ROM bank",
                first_tile_number: HUD_LETTER_FIRST_TILE, table_rom_offset: hex(HUD_LETTER_TABLE),
                layout: "one name-table word per character from 0x20 (0xE000 | tile)"
            }];
        const hd: Record<string, unknown> = {};
        for (let d = 0; d < 10; d++)
            hd[String.fromCharCode(0x30 + d)] = { code: 0x30 + d, tile: d };
        const hudDigits = byName.get("hud_digits")!;
        hudDigits["glyphs"] = hd;
        hudDigits["glyph_sources"] = [{
                layout: "tens and ones digit of the percentage are used as tile numbers (the health " +
                    "bar routine adds 0x20 bytes per step from the bank start); the masks are OR-ed " +
                    "with a dither pattern at run time",
                table_rom_offset: hex(0x16e618)
            }];
        const f2: Record<string, unknown> = {};
        for (const [ch, t] of [...f2map.entries()].sort((a, b) => a[0].charCodeAt(0) - b[0].charCodeAt(0)))
            f2[ch] = { code: ch.charCodeAt(0), tile: t };
        const font2 = byName.get("font2")!;
        font2["glyphs"] = f2;
        font2["glyph_sources"] = [{
                layout: "digit d -> tile d, letter L -> tile 10 + (L - 'A'); the caption strings are 16 " +
                    "characters each, a character below '0' is a blank cell",
                strings_rom_offset: hex(CAPTION_TABLE), strings: CAPTION_COUNT,
                writer_rom_offset: "0x2FA0"
            }];
        byName.get("symbols")!["tile_roles"] = [
            { role: "eight 4x4-pixel map-cell patterns (four 16-bit rows at a stride of 4 bytes, the " +
                    "partner pattern interleaved at +2), read through the pointer table at ROM 0x3372; " +
                    "pattern pointers are 0x12E846, 0x12E848, 0x12E856, 0x12E858, 0x12E866, 0x12E868, " +
                    "0x12E876, 0x12E878",
                tiles: [0, 1] },
            { role: "pause-map player marker (8x8 sprite, drawn on alternate frame groups)", tiles: [2] },
            { role: "small label / digit / arrow graphics; their characters are not decoded here",
                tiles: Array.from({ length: 16 }, (_, i) => 3 + i) },
        ];
        const sheet = contactSheet(panels);
        ctx.writeBytes(`${OUT_DIR}/contact_sheet.png`, sheet.png, { set: "contact_sheet" });
        nfiles++;
        const palette: Record<string, unknown> = {};
        for (const k of Object.keys(pal).sort()) {
            const { _rgb, ...rest } = pal[k]!;
            void _rgb;
            palette[k] = rest;
        }
        const index = {
            contact_sheet: {
                background: rgbList(SHEET_BG), height: sheet.h, panels: sheet.info, png: "contact_sheet.png",
                scale: SHEET_SCALE, transparent_index: 0, width: sheet.w,
                note: "RGB; index 0 is shown as the background; panels in the order listed"
            },
            entries,
            format: FORMAT,
            notes: [
                "Tile format: 8x8, 4 bits per pixel, 32 bytes per tile, 4 bytes per pixel row, the high " +
                    "nibble is the left pixel. PNG pixel values are the raw 4-bit indices.",
                "The documented symbol bank 0x12E876 (560 B) starts inside the map-cell patterns; the bank " +
                    "uploaded by the pause screen starts at 0x12E846 (608 B, 19 tiles) and ends where font2 " +
                    "begins.",
                "The embedded palettes are display aids; the real colours depend on the CRAM line each " +
                    "screen loads. Colour index 0 is transparent on the VDP and is not marked in the PNGs.",
            ],
            palette,
        };
        ctx.writeJson(`${OUT_DIR}/fonts.json`, index, { set: "index" });
        nfiles++;
        ctx.say(`fonts: ${entries.length} tile banks + glyph atlas, ${nfiles} files`);
    },
};

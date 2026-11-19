import type { Command, Context, RomFile } from "../core.js";
import { encodePng } from "../png.js";
import { sha256Hex } from "../../boot/sha256.js";
export const FORMAT = "ztassets-tiles/1";
export const OUT_DIR = "tiles";
export const TILE_BYTES = 32;
export const TILE_W = 8;
export const TILE_H = 8;
export const TILE_PIXELS = TILE_W * TILE_H;
export const SHEET_COLS = 16;
export const PAD_INDEX = 0;
const HDR_BYTES = 8;
const SCAN_MAX_COUNT = 1500;
const SCAN_MAX_COLS = 128;
const SCAN_MAX_ROWS = 64;
const CARD_TABLE = 0xc634e;
export const CARD_COUNT = 5;
export type Rgb = readonly [
    number,
    number,
    number
];
export function hexs(n: number): string {
    return "0x" + n.toString(16).toUpperCase();
}
function ev(path: string, line: number, what: string): string {
    return `port screen builder, ${path}:${line} (${what})`;
}
interface Spec {
    name: string;
    kind: "raw" | "selfrel";
    off: number | null;
    count: number | null;
    vram: number | null;
    group: string;
    role: string;
    evidence: string[];
    notes: string[];
}
const SPECS: Spec[] = [];
function spec(name: string, kind: "raw" | "selfrel", off: number | null, count: number | null, vram: number | null, group: string, role: string, evidence: string[], notes: string[] = []): void {
    SPECS.push({ name, kind, off, count, vram, group, role, evidence, notes });
}
const h = (n: number): string => n.toString(16).toUpperCase();
const h6 = (n: number): string => h(n).padStart(6, "0");
spec("accolade_logo", "raw", 0x53da0, 409, 0, "logos", "tile patterns of the logo screen (3272 longwords = 409 tiles), uploaded to VRAM tile 0", [ev("src/boot_screens.c", 129, "ROM 0x53DA0, loop of 0x0CC7 + 1 = 3272 longwords after the VDP command 0x40000000 (VRAM 0)"),
    ev("src/boot_screens.c", 46, "the same upload described in the routine header: 3272 longwords")], ["name-table frames and palette of this screen: see the accolade_logo screen"]);
const SLIDESHOW: ReadonlyArray<readonly [
    number,
    number,
    number
]> = [
    [0xd9, 0x2057e, 1], [0xd5, 0x2295e, 0x2bc], [0xd8, 0x24cbe, 1], [0xd5, 0x2707e, 0x2bc],
    [0xeb, 0x293de, 1], [0xfd, 0x2b9fe, 0x2bc], [0xe6, 0x2e25e, 1], [0xda, 0x307de, 0x2bc],
    [0xd8, 0x32bde, 1], [0xde, 0x34f9e, 0x2bc], [0xe7, 0x3741e, 1], [0xe2, 0x399be, 0x2bc],
    [0xe2, 0x3bebe, 1], [0xdf, 0x3e3be, 0x2bc], [0xda, 0x4085e, 1], [0xd5, 0x42c5e, 0x2bc],
    [0xf0, 0x44fbe, 1], [0xf9, 0x4767e, 0x2bc], [0xfb, 0x49e5e, 1], [0xf6, 0x4c67e, 0x2bc],
    [0xe3, 0x4edfe, 1], [0xcb, 0x5131e, 0x2bc],
];
const SCENE_LINES: number[] = [366];
for (let k = 1; k < 15; k++)
    SCENE_LINES.push(367 + k);
for (let k = 15; k < 21; k++)
    SCENE_LINES.push(368 + k);
SCENE_LINES.push(390);
SLIDESHOW.forEach(([c, o, t], k) => {
    spec(`slideshow_${String(k).padStart(2, "0")}`, "raw", o, c, t, "slideshow", `tile patterns of slideshow scene ${k} (scenes alternate between tile slot 1 and tile slot 0x2BC)`, [ev("src/screen.c", SCENE_LINES[k]!, `scene ${k}: tile slot 0x${h(t)}, tile count 0x${h(c)}, tiles at ROM 0x${h6(o)}`),
        ev("src/screen.c", 403, "the upload call: count * 16 big-endian words to VRAM tile slot * 32")], [`name table and palette of this scene: see the slideshow_${String(k).padStart(2, "0")} screen`]);
});
spec("charsel_pool", "raw", 0xc7342, 27, null, "charsel", "27 tile patterns; the screen copies them to sprite tile slots through two index lists " +
    "(12 tiles to slot 0x546, 16 tiles to slot 0x552)", [ev("src/main.c", 467, "pool base 0xC7342 and the two index lists 0xC76A2 / 0xC76F2"),
    ev("src/main.c", 467, "second tile-list call, 16 tiles")], ["27 = highest index used by the two lists (0x1A) + 1; the pool ends exactly at the first list"]);
spec("charsel_bank", "raw", 0xc7ef2, 270, 0x3a2, "charsel", "270 tile patterns uploaded to VRAM slot 0x3A2; the overlay map at 0xCA0B2 refers to them", [ev("src/main.c", 458, "ROM 0xC7EF2, 0x86F + 1 = 2160 longwords written after the VDP command 0x74400001"),
    ev("src/main.c", 310, "the overlay name-table words are added to 0x43A2 (slot 0x3A2, palette line 2)")], ["the bank ends exactly where the overlay name table (0xCA0B2) begins"]);
spec("charsel_tile", "raw", 0xca9f2, 1, 0x562, "charsel", "one tile pattern uploaded to VRAM slot 0x562 (used by the screen's sprites)", [ev("src/main.c", 472, "ROM 0xCA9F2, 8 longwords written after the VDP command 0x6C400002")]);
const BRIEFINGS: ReadonlyArray<readonly [
    string,
    number,
    number,
    number
]> = [
    ["briefing_a", 0xcd49a, 0x401, 2491],
    ["briefing_b", 0xd5dfa, 0x3c2, 2504],
    ["briefing_c", 0xddf7a, 0x441, 2619],
    ["briefing_d", 0xe70da, 0x411, 2538],
    ["briefing_e", 0xefc3a, 0x445, 2406],
    ["briefing_f", 0xf8e1a, 0x446, 2629],
    ["briefing_g", 0x10201a, 0x43e, 2580],
];
for (const [n, o, c, l] of BRIEFINGS) {
    spec(n, "raw", o, c, 1, "briefings", "full-screen picture tiles of a briefing / game-over scene, uploaded to VRAM slot 1", [ev("src/game.c", l, `tile upload to slot 1, count 0x${h(c)}, ROM 0x${h(o)}`)], [`name table (40 x 28) and palette follow the tiles directly; see the ${n} screen`]);
}
spec("options_cursor", "raw", 0x10cb7c, 2, 0x4ae, "options", "two tile patterns (16 longwords) uploaded to VRAM slot 0x4AE, used by the options screen cursor sprite", [ev("src/player.c", 1149, "ROM 0x10CB7C, 16 longwords written after the VDP command 0x55C00002")]);
spec("intro_banner", "selfrel", 0x116dbe, null, 0, "banners", "40 x 28 banner: 288 tiles to VRAM slot 0, map written with attribute base 0x8000 (priority set)", [ev("src/boot_screens.c", 223, "block address 0x116DBE passed to the banner blit with VRAM slot 0 and attribute base 0x8000"),
    ev("src/boot_screens.c", 220, "the banner is a 40 x 28 name table on the plane at VRAM 0xE000")]);
spec("title_tiles1", "selfrel", 0x119a86, null, 1, "title", "143 tiles uploaded to VRAM slot 1; the attached 128 x 25 map is streamed one column at a time " +
    "(rows 1..12, entry = word + 1) into the first twelve rows of plane A", [ev("src/player.c", 1394, "block header at 0x119A86: tile count and data displacement, 8 longwords per tile"),
    ev("src/player.c", 1516, "map words read from 0x119B8E + 2 * column (row 1, stride 0x100), written as word + 1")]);
spec("title_tiles2", "selfrel", 0x11c56e, null, 0x90, "title", "709 tiles uploaded to VRAM slot 0x90 (right behind title_tiles1); the first 0x780 words of the " +
    "attached map are written to both scroll planes", [ev("src/player.c", 1406, "block header at 0x11C56E, same format as the first block"),
    ev("src/player.c", 1419, "map read at block + 8 = 0x11C576, 0x780 words"),
    ev("src/player.c", 1422, "plane A copy: word + 0x4090 (palette line 2, tile slot 0x90)"),
    ev("src/player.c", 1432, "plane B copy: word + 0x6090 (palette line 3, tile slot 0x90)")]);
spec("title_sprites1", "raw", 0x123716, 182, 0x355, "title", "182 sprite tile patterns (0x5B0 longwords) uploaded to VRAM slot 0x355, right behind title_tiles2", [ev("src/player.c", 1439, "ROM 0x123716, 0x5B0 longwords written after the VDP command 0x6AA00001")]);
spec("title_sprites2", "raw", 0x124dd6, 26, 0x40b, "title", "26 sprite tile patterns (0xD0 longwords), the upload continues right behind title_sprites1", [ev("src/player.c", 1446, "ROM 0x124DD6, 0xD0 longwords, same write stream")]);
for (let k = 0; k < CARD_COUNT; k++) {
    spec(`charcard_${k}`, "selfrel", null, null, null, "charsel", `ID card ${k}: 16 x 12 map and its tiles (card tiles are allocated back to back from VRAM slot 1 ` +
        "on the character-select screen; the in-game cockpit shows one card's map too)", [ev("src/main.c", 441, "pointer table 0xC634E, five big-endian u32 block addresses"),
        ev("src/main.c", 446, "each block is uploaded in turn; the running VRAM address becomes the card's tile base")]);
}
spec("pause_backdrop", "selfrel", 0x12d43e, null, 0x141, "screens", "40 x 28 backdrop map and 90 tiles for the paused-map screen, VRAM slot 0x141, attribute base 0x6000", [ev("src/game.c", 4133, "block 0x12D43E blitted with tile bank address 0x2820 (slot 0x141) and attribute base 0x6000")]);
spec("hud_frame", "selfrel", 0x1563e6, null, 0x359, "screens", "40 x 28 cockpit frame map and 172 tiles, VRAM slot 0x359, attribute base 0xE000 (priority, line 3)", [ev("src/game.c", 3843, "block 0x1563E6 blitted with tile bank address 0x6B20 (slot 0x359) and attribute base 0xE000")]);
export interface Block {
    name: string;
    kind: "raw" | "selfrel";
    group: string;
    role: string;
    romOffset: number;
    dataOffset: number;
    count: number;
    data: Uint8Array;
    header: Record<string, unknown>;
    mapWords: number[] | null;
    mapOffset: number | null;
    vramTile: number | null;
    evidence: string[];
    notes: string[];
}
export function blockDataEnd(b: Block): number {
    return b.dataOffset + b.count * TILE_BYTES;
}
export interface SelfrelHit {
    off: number;
    count: number;
    cols: number;
    rows: number;
}
export function scanSelfrel(rom: RomFile): SelfrelHit[] {
    const data = rom.bytesAt(0, rom.size);
    const n = Math.floor((data.length - HDR_BYTES) / 2);
    const nw = data.length >> 1;
    const words = new Uint16Array(nw);
    for (let i = 0; i < nw; i++)
        words[i] = (data[2 * i]! << 8) | data[2 * i + 1]!;
    const hits: SelfrelHit[] = [];
    for (let i = 0; i < n; i++) {
        const w = words[i + 2]!;
        if (!(w >= 1 && w <= SCAN_MAX_COLS))
            continue;
        const hh = words[i + 3]!;
        if (!(hh >= 1 && hh <= SCAN_MAX_ROWS))
            continue;
        const c = words[i]!;
        if (!(c >= 1 && c <= SCAN_MAX_COUNT))
            continue;
        if (words[i + 1] !== HDR_BYTES + 2 * w * hh)
            continue;
        const off = i * 2;
        if (off + words[i + 1]! + c * TILE_BYTES > data.length)
            continue;
        hits.push({ off, count: c, cols: w, rows: hh });
    }
    return hits;
}
function readSelfrel(rom: RomFile, off: number) {
    const count = rom.u16be(off);
    const disp = rom.u16be(off + 2);
    const cols = rom.u16be(off + 4);
    const rows = rom.u16be(off + 6);
    if (disp !== HDR_BYTES + 2 * cols * rows)
        throw new Error(`block at 0x${h(off)}: displacement 0x${h(disp)} != 8 + 2 * ${cols} * ${rows}`);
    const raw = rom.bytesAt(off + HDR_BYTES, 2 * cols * rows);
    const words: number[] = [];
    for (let i = 0; i < cols * rows; i++)
        words.push((raw[2 * i]! << 8) | raw[2 * i + 1]!);
    const data = rom.bytesAt(off + disp, count * TILE_BYTES);
    return { count, disp, cols, rows, words, data };
}
const CHAIN: ReadonlyArray<readonly [
    string,
    string
]> = [
    ["intro_banner", "title_tiles1"], ["title_tiles1", "title_tiles2"],
    ["title_tiles2", "title_sprites1"], ["title_sprites1", "title_sprites2"],
    ["charcard_0", "charcard_1"], ["charcard_1", "charcard_2"], ["charcard_2", "charcard_3"],
    ["charcard_3", "charcard_4"], ["charcard_4", "pause_backdrop"],
];
function checkChain(blocks: Map<string, Block>): void {
    for (const [a, b] of CHAIN) {
        const A = blocks.get(a)!, B = blocks.get(b)!;
        if (blockDataEnd(A) !== B.romOffset)
            throw new Error(`layout: ${a} ends at 0x${h(blockDataEnd(A))} but ${b} starts at 0x${h(B.romOffset)}`);
    }
    if (blockDataEnd(blocks.get("charsel_pool")!) !== 0xc76a2)
        throw new Error("layout: charsel_pool should end at the first index list (0xC76A2)");
    if (blockDataEnd(blocks.get("hud_frame")!) !== 0x15822e)
        throw new Error("layout: hud_frame should end at 0x15822E");
}
export function loadBlocks(rom: RomFile): Map<string, Block> {
    const hits = scanSelfrel(rom);
    const found = new Set(hits.map((x) => x.off));
    const cards: number[] = [];
    for (let i = 0; i < CARD_COUNT; i++)
        cards.push(rom.u32be(CARD_TABLE + 4 * i));
    const blocks = new Map<string, Block>();
    for (const s of SPECS) {
        let off = s.off as number;
        if (s.name.startsWith("charcard_"))
            off = cards[Number(s.name.split("_")[1])]!;
        const b: Block = {
            name: s.name, kind: s.kind, group: s.group, role: s.role, romOffset: off, dataOffset: 0, count: 0,
            data: new Uint8Array(0), header: {}, mapWords: null, mapOffset: null, vramTile: s.vram,
            evidence: s.evidence, notes: s.notes,
        };
        if (s.kind === "selfrel") {
            if (!found.has(off))
                throw new Error(`${s.name}: no selfrel signature at 0x${h(off)}`);
            const r = readSelfrel(rom, off);
            b.count = r.count;
            b.data = r.data;
            b.mapWords = r.words;
            b.dataOffset = off + r.disp;
            b.mapOffset = off + HDR_BYTES;
            b.header = { count: r.count, data_displacement: r.disp, map_columns: r.cols, map_rows: r.rows };
        }
        else {
            b.count = s.count!;
            b.dataOffset = off;
            b.data = rom.bytesAt(off, s.count! * TILE_BYTES);
            b.header = { count: s.count!, source: "loader constant" };
        }
        blocks.set(s.name, b);
    }
    const registered = new Set([...blocks.values()].filter((b) => b.kind === "selfrel").map((b) => b.romOffset));
    const same = registered.size === found.size && [...registered].every((x) => found.has(x));
    if (!same)
        throw new Error("selfrel scan found a different set than the registry");
    let base = 1;
    for (let k = 0; k < CARD_COUNT; k++) {
        const b = blocks.get(`charcard_${k}`)!;
        b.vramTile = base;
        base += b.count;
    }
    checkChain(blocks);
    const sorted = [...blocks.entries()].sort((a, b) => (a[1].romOffset - b[1].romOffset) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return new Map(sorted);
}
export function tileToPixels(raw: Uint8Array): Uint8Array {
    if (raw.length !== TILE_BYTES)
        throw new Error(`a tile is ${TILE_BYTES} bytes`);
    const px = new Uint8Array(TILE_PIXELS);
    for (let i = 0; i < raw.length; i++) {
        px[i * 2] = raw[i]! >> 4;
        px[i * 2 + 1] = raw[i]! & 15;
    }
    return px;
}
export function pixelsToTile(px: Uint8Array): Uint8Array {
    if (px.length !== TILE_PIXELS || Math.max(...px) > 15)
        throw new Error("tile pixels must be 64 indices in 0..15");
    const out = new Uint8Array(TILE_BYTES);
    for (let i = 0; i < TILE_PIXELS; i += 2)
        out[i / 2] = (px[i]! << 4) | px[i + 1]!;
    return out;
}
export function sheetGeometry(count: number): [
    number,
    number,
    number
] {
    const rows = Math.floor((count + SHEET_COLS - 1) / SHEET_COLS);
    return [SHEET_COLS * TILE_W, rows * TILE_H, rows];
}
export function tilesToSheet(data: Uint8Array, count: number): Uint8Array {
    const [w, hh] = sheetGeometry(count);
    const out = new Uint8Array(w * hh).fill(PAD_INDEX);
    for (let i = 0; i < count; i++) {
        const px = tileToPixels(data.subarray(i * TILE_BYTES, (i + 1) * TILE_BYTES));
        const gx = (i % SHEET_COLS) * TILE_W, gy = Math.floor(i / SHEET_COLS) * TILE_H;
        for (let y = 0; y < TILE_H; y++)
            out.set(px.subarray(y * TILE_W, (y + 1) * TILE_W), (gy + y) * w + gx);
    }
    return out;
}
export function sheetToTiles(px: Uint8Array, count: number): Uint8Array {
    const [w, hh] = sheetGeometry(count);
    if (px.length !== w * hh)
        throw new Error(`sheet is ${px.length} pixels, expected ${w * hh}`);
    const out = new Uint8Array(count * TILE_BYTES);
    for (let i = 0; i < count; i++) {
        const gx = (i % SHEET_COLS) * TILE_W, gy = Math.floor(i / SHEET_COLS) * TILE_H;
        const tile = new Uint8Array(TILE_PIXELS);
        for (let y = 0; y < TILE_H; y++)
            tile.set(px.subarray((gy + y) * w + gx, (gy + y) * w + gx + TILE_W), y * TILE_W);
        out.set(pixelsToTile(tile), i * TILE_BYTES);
    }
    return out;
}
export const GREY_RAMP: Rgb[] = Array.from({ length: 16 }, (_, i) => [17 * i, 17 * i, 17 * i] as Rgb);
export function indexedPng(size: readonly [
    number,
    number
], pixels: Uint8Array, paletteRgb: readonly Rgb[], eightBit = false): Uint8Array {
    const flat: number[] = [];
    for (const [r, g, b] of paletteRgb)
        flat.push(r, g, b);
    return encodePng({ width: size[0], height: size[1], mode: "P", pixels, palette: flat, bits: eightBit ? 8 : 4, level: 9 });
}
export const tiles: Command = {
    name: "tiles",
    run(ctx: Context): void {
        const rom = ctx.rom;
        const blocks = loadBlocks(rom);
        const entries: Record<string, unknown>[] = [];
        let totalTiles = 0, totalBytes = 0;
        for (const b of blocks.values()) {
            const sheet = tilesToSheet(b.data, b.count);
            const back = sheetToTiles(sheet, b.count);
            if (back.length !== b.data.length || back.some((v, i) => v !== b.data[i]))
                throw new Error(`block ${b.name} does not survive its own sheet round trip`);
            const [w, hh, rows] = sheetGeometry(b.count);
            ctx.writeBytes(`${OUT_DIR}/${b.name}.png`, indexedPng([w, hh], sheet, GREY_RAMP), { block: b.name, rom_offset: hexs(b.romOffset), tiles: b.count });
            const e: Record<string, unknown> = {
                bytes: b.count * TILE_BYTES,
                data_rom_end: hexs(blockDataEnd(b)),
                data_rom_offset: hexs(b.dataOffset),
                group: b.group,
                header: b.header,
                kind: b.kind,
                loader_evidence: [...b.evidence],
                name: b.name,
                notes: [...b.notes],
                png: `${b.name}.png`,
                rom_offset: hexs(b.romOffset),
                role: b.role,
                sha256_pixels: sha256Hex(sheet),
                sha256_rom: sha256Hex(b.data),
                sheet: { columns: SHEET_COLS, height: hh, rows, width: w },
                tile_count: b.count,
                vram_tile_slot: b.vramTile,
            };
            if (b.kind === "selfrel") {
                e.map = { bytes: 2 * b.mapWords!.length, columns: b.header.map_columns, rom_offset: hexs(b.mapOffset!), rows: b.header.map_rows };
            }
            entries.push(e);
            totalTiles += b.count;
            totalBytes += b.count * TILE_BYTES;
        }
        ctx.say(`tiles: ${entries.length} blocks, ${totalTiles} tiles, ${totalBytes} bytes`);
        const hits = scanSelfrel(rom);
        const index = {
            blocks: entries,
            format: FORMAT,
            not_a_tile_set: [{
                    evidence: ["port screen builder, src/player.c:901 (the shade lookup tables are selected inside " +
                            "the block at 0x10D1BE: 0x10DCBE is its row 11)"],
                    rom_offset: "0x10D2BE",
                    size: 6144,
                    what: "starts one 256-byte row into the 24 x 256-byte shade lookup-table block that spans " +
                        "0x10D1BE..0x10E9BD (palettes command): 5888 bytes are rows 1..23 of that block and the " +
                        "last 256 bytes lie in the art that follows it.  No loader reads it as tiles, so it is " +
                        "not extracted here",
                }],
            selfrel_scan: {
                found: hits.map((x) => ({ columns: x.cols, count: x.count, rom_offset: hexs(x.off), rows: x.rows })),
                rule: `count 1..${SCAN_MAX_COUNT}, columns 1..${SCAN_MAX_COLS}, rows 1..${SCAN_MAX_ROWS}, displacement == 8 + 2 * columns * rows, ` +
                    "tile data inside the ROM; every even offset of the ROM was tested",
            },
            sheet: {
                columns: SHEET_COLS,
                padding_index: PAD_INDEX,
                palette: "grey ramp, index i -> (17 * i, 17 * i, 17 * i); human eyes only",
                pixel_values: "raw 4-bit colour indices",
                tile_order: "tile i at column i % 16, row i // 16",
            },
            tile_format: {
                bytes_per_tile: TILE_BYTES,
                nibbles: "high nibble = left pixel",
                pixel_rows: "4 bytes per row, top row first",
                size: "8 x 8",
            },
            totals: { blocks: entries.length, bytes: totalBytes, tiles: totalTiles },
        };
        ctx.writeJson(`${OUT_DIR}/tiles.json`, index, { blocks: entries.length });
        ctx.say(`tiles: ${ctx.files.size} files`);
    },
};

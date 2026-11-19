import type { Command, Context, RomFile } from "../core.js";
import { sha256Hex } from "../../boot/sha256.js";
import { SKY_SPRITE_STACK_ROWS_NOTE } from "../reference_notes.js";
import { GREY_RAMP, SHEET_COLS, TILE_BYTES, indexedPng, sheetGeometry, sheetToTiles, tilesToSheet } from "./tiles.js";
const FORMAT = "ztassets-sky/1";
const OUT_DIR = "sky";
const MAP_COLUMNS = 128;
const MAP_ROWS = 16;
const MAP_BYTES = 2 * MAP_COLUMNS * MAP_ROWS;
const MAP_ROW_STRIDE = 2 * MAP_COLUMNS;
const TILE_SLOT = 321;
const TILE_VRAM_ADDRESS = TILE_SLOT * TILE_BYTES;
const PALETTE_LINE = 2;
const PALETTE_WORDS = 16;
const CRAM_MASK = 0x0eee;
interface ClassSpec {
    cls: string;
    episodes: number[];
    tilesOff: number;
    count: number;
    mapOff: number;
    palNormal: number;
    palNight: number;
    evidence: string[];
    notes: string[];
}
const CLASSES: ClassSpec[] = [
    { cls: "city", episodes: [1], tilesOff: 0x14f046, count: 518, mapOff: 0x153106, palNormal: 0x20f2, palNight: 0x2072,
        evidence: [
            "ROM 0x0105E..0x0107C: the episode-selector flag word is cleared, then set to 1 unless the episode " +
                "(level byte >> 4 and 3) is 1",
            "ROM 0x011B2: move.l #$153106 - the map pointer's default; 0x011BA tests the flag word " +
                "and branches over the stars pointer when it is 0",
            "ROM 0x02B2A..0x02B4A: flag word 0 -> after the VDP command 0x68200000 (VRAM 0x2820) move.w #$102f / dbra = " +
                "0x1030 = 4144 longwords from 0x14F046 (= 518 tiles)",
            "ROM 0x112F6: palette table 0x20F2 for flag word 0 (the night-vision variant 0x2072 is the palettes " +
                "command's maze_nightvision_a)"
        ],
        notes: [
            "the level setup clears the episode-selector flag word for episode index 1 only (see the palettes command, " +
                "maze_normal_a)",
            "the twinkle routine runs on this class only (ROM 0x01458..0x0145E: tst.w flag / bne over jsr $22be): see " +
                "deferred twinkle_frames"
        ] },
    { cls: "stars", episodes: [0, 2], tilesOff: 0x154406, count: 127, mapOff: 0x1553e6, palNormal: 0x21f2, palNight: 0x2172,
        evidence: [
            "ROM 0x0105E..0x0107C: the episode-selector flag word is set to 1 for every episode but 1",
            "ROM 0x011C0: move.l #$1553e6 - the map pointer when the episode-selector flag word is not 0",
            "ROM 0x02B50..0x02B6A: flag word not 0 -> the same VDP command, move.w #$3f7 / dbra = 0x3F8 = 1016 " +
                "longwords from 0x154406 (= 127 tiles; the block ends where the map starts)",
            "ROM 0x112FC..0x11302: palette table 0x21F2 for a flag word that is not 0 (night-vision variant 0x2172, " +
                "maze_nightvision_b)"
        ],
        notes: ["episodes 0 and 2: the flag word is set for every episode index except 1"] },
];
const DEFERRED: ReadonlyArray<readonly [
    string,
    number,
    number,
    string,
    string | null
]> = [
    ["twinkle_frames", 0x154106, 0x300,
        "three 256-byte groups (1, 2, 3 in file order), each four 64-byte frames of a PAIR of tiles (32 bytes tile A, then " +
            "32 bytes tile B; 4-byte pixel rows, colour index 15 = lit, 14 / 12 / 5 mix in), directly behind the city map",
        "read by the routine at ROM 0x0022BE: every call picks one group (its pair of VRAM tiles: 331 / 332, 370 / 371, " +
            "386 / 488 = VRAM bytes 0x2960 / 0x2980, 0x2E40 / 0x2E60, 0x3040 / 0x3D00 inside the sky tile area), whose byte " +
            "index (a multiple of 0x40 = the frame) steps by 0x40 every 8 of its calls, and copies ONE 4-byte pixel row: " +
            "row byte r = twinkle_pattern[(phase + counter) and 0x3F]; frame bytes [r .. r + 3] into tile A at byte r and " +
            "[0x20 + r .. 0x23 + r] into tile B at byte r.  Checked against the console's video memory at every boundary " +
            "of both episode-1 demos (396 calls).  City only (ROM 0x01458..0x0145E skips the call when the " +
            "episode-selector flag word is not 0)."],
    ["twinkle_pattern", 0x2382, 0x40,
        "64 bytes of pixel-row byte offsets (0..0x1C, multiples of 4: row = value / 4) that the twinkle routine indexes " +
            "with (phase + counter) and 0x3F",
        "ROM 0x002334: move.b $2382(pc,d2.w),d0 with d2 = (phase + counter) and 0x3F."],
    ["sprite_stack_rows", 0x2510, 0xf0,
        "20 entries of 6 words, one per width index d3 (0..19): the SIZE words of the strips of one row (high byte = " +
            "the sprite size: 0x0D = 4 x 2 cells, 0x01 / 0x05 / 0x09 = 1 / 2 / 3 x 2 cells; 0xFFFF ends the entry): " +
            "d3 >> 2 strips of 0x0D00, then one of 0x0100 + 0x400 * (d3 and 3) (d3 = 19: five 0x0D00)",
        SKY_SPRITE_STACK_ROWS_NOTE],
    ["sprite_stack_tiles", 0x2600, 0x84,
        "47 row tile words (0x2600: 0x4515 + 8 * block, blocks 0,1,1,2,2,3,3,4,4,5,5,4,3,2,1,0 then 0; palette line 2, " +
            "priority 0, tiles 0x515 ..) and 16 figure words (0x265E: tiles 0x545 .. 0x54B); the last 3 words (from 0x267E) " +
            "are code, not data",
        "the row words are indexed from ROM 0x0024CE (a1 = 0x2600, stepped by 2 for each row above screen line 24 that " +
            "is skipped and for each row drawn); the figure words from ROM 0x002452 (a0 = 0x265E + (tick and ~1)), only " +
            "while the sniper sequencer's gate is set."],
];
const hexs = (n: number): string => "0x" + n.toString(16).toUpperCase();
function words(rom: RomFile, off: number, n: number): number[] {
    const raw = rom.bytesAt(off, 2 * n);
    const out: number[] = [];
    for (let i = 0; i < n; i++)
        out.push((raw[2 * i]! << 8) | raw[2 * i + 1]!);
    return out;
}
function paletteLine(rom: RomFile, table: number) {
    const ws = words(rom, table + 2 * PALETTE_LINE * PALETTE_WORDS, PALETTE_WORDS);
    return {
        cram_line: PALETTE_LINE,
        rgb3: ws.map((w) => [(w >> 1) & 7, (w >> 5) & 7, (w >> 9) & 7]),
        rom_offset: hexs(table + 2 * PALETTE_LINE * PALETTE_WORDS),
        stray_bits: ws.flatMap((w, i) => ((w & ~CRAM_MASK & 0xffff) !== 0 ? [i] : [])),
        table_rom_offset: hexs(table),
        words: ws,
    };
}
interface Loaded {
    cls: string;
    episodes: number[];
    tilesOff: number;
    count: number;
    data: Uint8Array;
    mapOff: number;
    rows: number[][];
    palNormal: ReturnType<typeof paletteLine>;
    palNight: ReturnType<typeof paletteLine>;
    evidence: string[];
    notes: string[];
}
function loadClass(rom: RomFile, s: ClassSpec): Loaded {
    const data = rom.bytesAt(s.tilesOff, s.count * TILE_BYTES);
    if (s.tilesOff + data.length !== s.mapOff)
        throw new Error(`sky ${s.cls}: the tiles end at 0x${(s.tilesOff + data.length).toString(16)}, the map starts at 0x${s.mapOff.toString(16)}`);
    const ws = words(rom, s.mapOff, MAP_COLUMNS * MAP_ROWS);
    const rows: number[][] = [];
    for (let r = 0; r < MAP_ROWS; r++)
        rows.push(ws.slice(r * MAP_COLUMNS, (r + 1) * MAP_COLUMNS));
    const used = new Set<number>();
    for (const w of ws) {
        if (((w >> 13) & 3) !== PALETTE_LINE || (w >> 15) !== 0)
            throw new Error(`sky ${s.cls}: map word 0x${w.toString(16)} does not select palette line ${PALETTE_LINE}, priority 0`);
        const t = w & 0x7ff;
        if (!(t >= TILE_SLOT && t < TILE_SLOT + s.count))
            throw new Error(`sky ${s.cls}: map word 0x${w.toString(16)} points outside the class's tile block`);
        used.add(t);
    }
    if (used.size !== s.count)
        throw new Error(`sky ${s.cls}: the map uses ${used.size} of the block's ${s.count} tiles`);
    return {
        cls: s.cls, episodes: s.episodes, tilesOff: s.tilesOff, count: s.count, data, mapOff: s.mapOff, rows,
        palNormal: paletteLine(rom, s.palNormal), palNight: paletteLine(rom, s.palNight),
        evidence: s.evidence, notes: s.notes,
    };
}
function checkChain(classes: Map<string, Loaded>): void {
    const city = classes.get("city")!, stars = classes.get("stars")!;
    if (city.mapOff + MAP_BYTES !== DEFERRED[0]![1])
        throw new Error("layout: the twinkle tables should start where the city map ends");
    if (DEFERRED[0]![1] + DEFERRED[0]![2] !== stars.tilesOff)
        throw new Error("layout: the twinkle tables should end where the stars tiles start");
    if (stars.mapOff + MAP_BYTES !== 0x1563e6)
        throw new Error("layout: the stars map should end where the cockpit frame block starts (0x1563E6)");
}
export const sky: Command = {
    name: "sky",
    run(ctx: Context): void {
        const rom = ctx.rom;
        const classes = new Map<string, Loaded>();
        for (const s of CLASSES)
            classes.set(s.cls, loadClass(rom, s));
        checkChain(classes);
        const entries: Record<string, unknown>[] = [];
        for (const c of classes.values()) {
            const name = c.cls;
            const sheet = tilesToSheet(c.data, c.count);
            const back = sheetToTiles(sheet, c.count);
            if (back.some((v, i) => v !== c.data[i]))
                throw new Error(`sky ${name} does not survive its own sheet round trip`);
            const [w, hh, srows] = sheetGeometry(c.count);
            ctx.writeBytes(`${OUT_DIR}/${name}_tiles.png`, indexedPng([w, hh], sheet, GREY_RAMP), { class: name, rom_offset: hexs(c.tilesOff), tiles: c.count });
            ctx.writeBytes(`${OUT_DIR}/${name}_tiles.bin`, c.data, { class: name, rom_offset: hexs(c.tilesOff) });
            const doc = {
                class: name,
                episodes: c.episodes,
                format: FORMAT,
                loader_evidence: c.evidence,
                map: {
                    bytes: MAP_BYTES,
                    columns: MAP_COLUMNS,
                    row_stride_bytes: MAP_ROW_STRIDE,
                    rom_offset: hexs(c.mapOff),
                    rows: MAP_ROWS,
                    sha256_rom: sha256Hex(rom.bytesAt(c.mapOff, MAP_BYTES)),
                    words: c.rows,
                },
                notes: [...c.notes,
                    "map words are absolute: tile = tile.vram_tile_slot + index into this class's tiles; palette line 2; " +
                        "priority 0; flips in bits 11-12",
                    "the resident plane holds 64 of the 128 columns (column c at plane column c mod 64); rows 0..15 only"],
                palette_line: { night_vision: c.palNight, normal: c.palNormal },
                tiles: {
                    bin: `${name}_tiles.bin`,
                    bytes: c.count * TILE_BYTES,
                    count: c.count,
                    png: `${name}_tiles.png`,
                    rom_offset: hexs(c.tilesOff),
                    sha256_pixels: sha256Hex(sheet),
                    sha256_rom: sha256Hex(c.data),
                    sheet: { columns: SHEET_COLS, height: hh, rows: srows, width: w },
                    vram_byte_address: hexs(TILE_VRAM_ADDRESS),
                    vram_tile_slot: TILE_SLOT,
                },
            };
            ctx.writeJson(`${OUT_DIR}/${name}.json`, doc, { class: name });
            entries.push({ class: name, episodes: c.episodes, json: `${name}.json`, map_columns: MAP_COLUMNS, map_rows: MAP_ROWS,
                tile_count: c.count, tile_png: `${name}_tiles.png`, tile_bin: `${name}_tiles.bin` });
            ctx.say(`sky: ${name}: ${c.count} tiles, map ${MAP_COLUMNS}x${MAP_ROWS}, palette line ${PALETTE_LINE}`);
        }
        const deferred: Record<string, unknown>[] = [];
        for (const [dname, off, size, what, note] of DEFERRED) {
            const raw = rom.bytesAt(off, size);
            ctx.writeBytes(`${OUT_DIR}/deferred/${dname}.bin`, raw, { rom_offset: hexs(off), bytes: size });
            deferred.push({ bytes: size, file: `deferred/${dname}.bin`, name: dname, ...(note !== null ? { note } : {}), rom_offset: hexs(off), sha256_rom: sha256Hex(raw), what });
        }
        const index = {
            classes: entries,
            deferred,
            deferred_note: "raw bytes, not decoded into other files: the twinkling lights (ZT-GAME-TICK 4.1b) and the " +
                "highrise's building strips (ZT-REND-SKY); each entry's note says how the routine reads it",
            format: FORMAT,
            map: { columns: MAP_COLUMNS, rows: MAP_ROWS, word: "VDP name-table word, absolute tile index" },
            tile_format: { bytes_per_tile: TILE_BYTES, nibbles: "high nibble = left pixel", pixel_rows: "4 bytes per row, top row first", size: "8 x 8" },
            tile_slot: TILE_SLOT,
        };
        ctx.writeJson(`${OUT_DIR}/index.json`, index, { classes: entries.length });
        ctx.say(`sky: ${ctx.files.size} files`);
    },
};

import type { Command, Context } from "../core.js";
import { encodePng } from "../png.js";
const NAME = "palettes";
const FORMAT = "ztassets-palettes/1";
const OUT_DIR = "palettes";
const PNG_COMPRESS_LEVEL = 6;
const CRAM_MASK = 0x0eee;
const LINE = 16;
const LUT_SIZE = 256;
const WALL_BANDS = 8;
const WALL_HEIGHT_TABLE = 0x4392;
const WALL_PLAIN_TABLE = 0x4436;
const BILL_BASE = 0x10d1be;
const BILL_MIRROR = 0xc00;
const LANE_ART_SIZE = 160;
const NIGHT_VISION_DISTANCE = 16;
const PALETTES: ReadonlyArray<readonly [
    string,
    number,
    number,
    string,
    number[],
    string
]> = [["title_line0", 122100, 16, "title_intro", [0], "Loaded into CRAM line 0 by the title/password screen setup (8 longword writes); lines 1-3 are cleared to zero right after.  White to cyan to dark blue ramp.  Older descriptions of this table as greyscale, or as 32 longwords, are wrong: it is 16 entries and the bytes that follow (0x1DD14) are VDP register words."], ["title_pan_ramp", 121076, 512, "title_intro", [2, 3], "32 consecutive 16-entry lines (0x1D8F4..0x1DCF3, directly before title_line0).  Line 0 is all black, line 31 is the brightest.  The intro animation picks line 31-k with k = min(abs(min(counter, 64) - 32), 31), i.e. source address 0x1DCD4 - 32*k, once for CRAM line 2 and once for CRAM line 3 on every frame (two independent counters)."], ["intro_raycast_line0", 356546, 16, "title_intro", [0], "Loaded into CRAM line 0 at the start of the raycast intro (8 longword writes).  Entries 4..15 equal the first 12 entries of intro_raycast_cycle. Not a weapon palette: the port's loader is the raycast intro (camera sweep)."], ["intro_raycast_cycle", 356554, 34, "title_intro", [0], "Blue ramp, a triangle wave of period 22.  Every frame of the raycast intro writes a 12-entry window table[f .. f+11] to CRAM entries 4..15, with f running 0..21 (the frame counter is incremented, then wrapped at 22, before it is used).  The 34 entries are 22 + 12 so that the window never leaves the table.  Two call sites of the intro use it."], ["banner1_line0", 339328, 16, "title_intro", [0], "Loaded into CRAM line 0 by the first banner routine after boot (8 longword writes; the port's loader calls it the Accolade banner).  The 16 entries that follow (0x52DA0) are zero."], ["banner2_fade", 130110, 64, "title_intro", [0, 1, 2, 3], "64-entry reference of the fade-out and fade-in of the second banner screen of the intro (the fade writes all four CRAM lines).  A CRAM capture taken during that fade matches all 64 entries to within one fade step per channel, and line 0 exactly."], ["maze_normal_a", 8434, 64, "level", [0, 1, 2, 3], "Maze palette (four CRAM lines), used when night vision is not owned and the episode-selector flag word is 0.  Written wholesale to CRAM (32 longwords) by the level-entry/redraw routine at ROM 0x29DA, and used as the target of the level fade-in (ROM 0x1C24).  The level setup clears the flag for episode index 1 only and sets it for every other index.  A routine near ROM 0x1B7A that reads back VDP data and compares it with line 3 of this table (and one word at 0x2162) reloads the maze palette on a mismatch."], ["maze_normal_b", 8690, 64, "level", [0, 1, 2, 3], "As maze_normal_a, for a nonzero episode-selector flag word."], ["maze_nightvision_a", 8306, 64, "level", [0, 1, 2, 3], "Green maze palette used when night vision is owned and the episode-selector flag word is 0.  Also loaded immediately when night vision is switched on (state setter at ROM 0x11286)."], ["maze_nightvision_b", 8562, 64, "level", [0, 1, 2, 3], "As maze_nightvision_a, for a nonzero episode-selector flag word."], ["fade_target_black", 117998, 64, "fade", [0, 1, 2, 3], "Fade-to-black target (64 zero entries); the title fade uses the first 16."], ["fade_target_white", 118158, 16, "fade", [0], "Fade-to-white target.  Entries 1..15 are 0x0FFF; the fade stepper only compares the bits in 0x0EEE, so the stray low bits are never reached."], ["fade_start_black", 130046, 16, "fade", [0], "CRAM line 0 written (all zero) at the start of the fade-in routine."], ["fade_start_white", 130078, 16, "fade", [0], "CRAM line 0 written (all 0x0EEE) at the start of the fade-from-white routine."], ["shared_line_1CDAE", 118190, 16, "screens", [0, 2, 3], "Loaded from six code sites (see references): CRAM line 0 (two sites, direct longword copies), CRAM line 2 (two sites, direct copies) and CRAM line 3 (two sites, through the one-line loader)."], ["screen_line_10CBDC", 1100764, 16, "screens", [0], "CRAM line 0 of the screen set up at ROM 0x10B3E4 (through the one-line loader), which also loads shared_line_1CDAE as line 3.  The 16 entries that follow (0x10CBFC) are not referenced by any code."], ["scene_0C7322", 815906, 16, "screens", [0], "First of four consecutive lines copied to staging lines 0..3 by the screen setup at ROM 0xC6520 (one call of the 32-byte copy helper each), then faded in."], ["scene_0C7E72", 818802, 16, "screens", [1], "Second line of the setup at ROM 0xC6520."], ["scene_0CA972", 829810, 16, "screens", [2], "Third line of the setup at ROM 0xC6520."], ["scene_0C7302", 815874, 16, "screens", [3], "Fourth line of the setup at ROM 0xC6520."], ["scene_0D5D7A", 875898, 16, "screens", [0], "Staging line 0 copied by two scene handlers (see references), which fade it in and out together with scene_0CD47A as line 3."], ["scene_0DDEFA", 909050, 16, "screens", [0], "Staging line 0 copied by three scene handlers (see references)."], ["scene_0E705A", 946266, 16, "screens", [0], "Staging line 0 copied by two scene handlers (see references)."], ["scene_0EFBBA", 981946, 16, "screens", [0], "Staging line 0 of a scene handler that copies two consecutive lines with two calls (this one, then scene_0EFBDA as line 1)."], ["scene_0EFBDA", 981978, 16, "screens", [1], "Second copy of the pair that starts at scene_0EFBBA (source and destination pointers both advance by 32 bytes; no code references this address)."], ["scene_10B09A", 1093786, 16, "screens", [0], "Staging line 0 of a scene handler that copies two consecutive lines with two calls (this one, then scene_10B0BA as line 1)."], ["scene_10B0BA", 1093818, 16, "screens", [1], "Second copy of the pair that starts at scene_10B09A (no code references this address)."], ["scene_101F9A", 1056666, 16, "screens", [0], "Staging line 0 copied by one scene handler."], ["scene_0F8D9A", 1019290, 16, "screens", [0], "Staging line 0 copied by the scene handler at ROM 0xCB0BE (the port's second 'game over' screen), which then fades it in from white."], ["scene_0CD47A", 840826, 16, "screens", [3], "Staging line 3 copied by eleven scene handlers (see references)."]];
const REFERENCES: Record<string, Array<[
    number,
    number
]>> = { "title_line0": [[118722, 122100]], "title_pan_ramp": [[119064, 121076], [119072, 121076], [119970, 121076], [119978, 121076]], "intro_raycast_line0": [[356670, 356546], [356892, 356554], [357506, 356554]], "intro_raycast_cycle": [[356892, 356554], [357506, 356554]], "banner1_line0": [[339126, 339328]], "banner2_fade": [[126890, 130110], [126984, 130110]], "maze_normal_a": [[7138, 8434], [7232, 8434], [10742, 8434], [70390, 8434], [7096, 8530]], "maze_normal_b": [[7150, 8690], [7246, 8690], [10754, 8690], [70402, 8690]], "maze_nightvision_a": [[7158, 8306], [7256, 8306], [10762, 8306], [70282, 8306]], "maze_nightvision_b": [[7170, 8562], [7270, 8562], [10774, 8562], [70294, 8562]], "fade_target_black": [[7356, 117998], [118504, 117998]], "fade_target_white": [[118420, 118158]], "fade_start_black": [[129144, 130046]], "fade_start_white": [[129544, 130078]], "shared_line_1CDAE": [[6974, 118190], [11760, 118190], [117454, 118190], [360604, 118190], [1094644, 118190], [1100952, 118190]], "screen_line_10CBDC": [[1094632, 1100764]], "scene_0C7322": [[812320, 815906]], "scene_0C7E72": [[812338, 818802]], "scene_0CA972": [[812350, 829810]], "scene_0C7302": [[812362, 815874]], "scene_0D5D7A": [[830252, 875898], [830988, 875898]], "scene_0DDEFA": [[830396, 909050], [830546, 909050], [831342, 909050]], "scene_0E705A": [[830690, 946266], [831462, 946266]], "scene_0EFBBA": [[830840, 981946]], "scene_10B09A": [[831162, 1093786]], "scene_101F9A": [[831598, 1056666]], "scene_0F8D9A": [[831784, 1019290]], "scene_0CD47A": [[830270, 840826], [830414, 840826], [830564, 840826], [830708, 840826], [830864, 840826], [831006, 840826], [831186, 840826], [831360, 840826], [831480, 840826], [831616, 840826], [831802, 840826]] };
const WALL_SETS: ReadonlyArray<readonly [
    number,
    number,
    number[]
]> = [[1, 13202, [1, 3, 4]], [2, 15250, [2]]];
const WALL_HEIGHT_BANDS: Record<string, number> = { "2": 8, "4": 8, "6": 8, "8": 8, "10": 7, "12": 7, "14": 7, "16": 6, "18": 6, "20": 6, "22": 5, "24": 5, "26": 4, "28": 4, "30": 3, "32": 3, "34": 2, "36": 2, "38": 1, "40": 1 };
const BILL_ARRAYS: ReadonlyArray<readonly [
    string,
    number,
    number[]
]> = [["identity", 60752, [0, 0, 0, 0, 0]], ["set1", 60772, [1, 2, 3, 4, 5]], ["set2", 60792, [6, 7, 8, 9, 10]], ["nightvision", 60812, [11, 11, 11, 11, 11]]];
const RENDER_MODES: ReadonlyArray<readonly [
    number,
    number,
    number | null,
    string,
    number
]> = [[0, 17462, null, "identity", 16], [1, 17298, 1, "set1", 5], [2, 17298, 2, "set2", 5], [3, 17298, 1, "set1", 12], [4, 17298, 1, "set1", 5]];
const LANE_ART: Record<number, number> = { "0": 1371750, "1": 1371430, "2": 1371590, "3": 1371910, "4": 1372070 };
const LANE_ART_NOTE = "bytes 0..79 are rows 0..79 of the lane read by the ODD view columns, bytes 80..159 rows 0..79 of the lane read by the EVEN view columns (view column = ray column 0..127, two pixels wide); a byte is two 4-bit pixels, high nibble = left pixel; colour index 0 is transparent (the sky layer shows through)";
const KNOWN_NOT_EXPORTED = [{ "what": "CRAM line 1 during the title intro", "reason": "taken from a work-RAM block that the intro scroll code fills at run time, not from a ROM table (CRAM line 0 is title_line0, lines 2 and 3 come from title_pan_ramp)" }, { "what": "CRAM entry 63", "reason": "overwritten every frame with a fade/flash value computed at run time, not a table" }, { "what": "CRAM clears", "reason": "zero fills of CRAM (boot, level changes, screen changes) write no table" }, { "what": "boot-time single CRAM word", "reason": "one immediate word (0x0EEE written at CRAM entry 1 by the boot code before any table is loaded); no table" }, { "what": "16-entry line", "rom_offset": "0x1CD6E", "entries": 16, "reason": "no absolute or PC-relative reference found; sits between fade_target_black and fade_target_white" }, { "what": "16-entry line", "rom_offset": "0x10CBFC", "entries": 16, "reason": "no absolute or PC-relative reference found; directly follows screen_line_10CBDC" }];
const COVERAGE = "Sources of palette data were collected by scanning the whole ROM for calls to the 32-byte copy helper, the one-line loader, the 64-word loader and the fade routines (with the pointer loaded just before the call), for the fade-target pointer stores, and for CRAM write commands followed by a pointer load.  Data reached only through pointers computed at run time would not be found by these scans; tests/ztassets_palettes_test.py repeats them and fails if a source is neither exported nor listed in known_but_not_exported.";
const BILL_NAMES: string[] = ["billboard_identity"];
for (let i = 0; i < 5; i++)
    BILL_NAMES.push(`billboard_set1_step${i}`);
for (let i = 0; i < 5; i++)
    BILL_NAMES.push(`billboard_set2_step${i}`);
BILL_NAMES.push("billboard_nightvision");
const hex = (v: number): string => "0x" + v.toString(16).toUpperCase();
const hex4 = (v: number): string => "0x" + v.toString(16).toUpperCase().padStart(4, "0");
type Rec = Record<string, unknown>;
function color(index: number, word: number): Rec {
    const r3 = (word >> 1) & 7, g3 = (word >> 5) & 7, b3 = (word >> 9) & 7;
    return { index, bgr333: hex4(word), rgb3: [r3, g3, b3], rgb: [r3 * 36, g3 * 36, b3 * 36] };
}
const rgbOf = (word: number): [
    number,
    number,
    number
] => [((word >> 1) & 7) * 36, ((word >> 5) & 7) * 36, ((word >> 9) & 7) * 36];
const swapNibbles = (b: number): number => ((b & 15) << 4) | (b >> 4);
function stripPng(words: number[]): {
    w: number;
    h: number;
    px: Uint8Array;
} {
    const n = words.length;
    const cols = n <= 64 ? n : LINE;
    const rows = n <= 64 ? 1 : Math.floor((n + LINE - 1) / LINE);
    const w = cols * 16, h = rows * 16;
    const px = new Uint8Array(w * h * 3);
    words.forEach((word, i) => {
        const rgb = rgbOf(word);
        const x0 = (i % cols) * 16, y0 = Math.floor(i / cols) * 16;
        for (let y = y0; y < y0 + 16; y++)
            for (let x = x0; x < x0 + 16; x++)
                px.set(rgb, (y * w + x) * 3);
    });
    return { w, h, px };
}
function lutPng(lut: Uint8Array, line: number[]): {
    w: number;
    h: number;
    px: Uint8Array;
} {
    const w = 256;
    const px = new Uint8Array(w * w * 3);
    const rgb = line.map(rgbOf);
    for (let b = 0; b < 256; b++) {
        const out = lut[b]!;
        const cx = (b & 15) * 16, cy = (b >> 4) * 16;
        for (const [half, value] of [[0, b], [8, out]] as const) {
            const left = rgb[value >> 4]!, right = rgb[value & 15]!;
            for (let y = cy + half; y < cy + half + 8; y++) {
                for (let k = 0; k < 8; k++) {
                    px.set(left, (y * w + cx + k) * 3);
                    px.set(right, (y * w + cx + 8 + k) * 3);
                }
            }
        }
    }
    return { w, h: w, px };
}
function buildPalettes(ctx: Context): {
    out: Rec[];
    byName: Map<string, number[]>;
} {
    const rom = ctx.rom;
    const out: Rec[] = [];
    const byName = new Map<string, number[]>();
    for (const [name, off, count, group, lines, notes] of PALETTES) {
        const words = Array.from({ length: count }, (_, i) => rom.u16be(off + 2 * i));
        const entry: Rec = {
            name, group, rom_offset: hex(off), entries: count,
            lines: count % LINE === 0 ? count / LINE : null,
            layout: count <= 64 ? "strip" : "grid16",
            png: `${OUT_DIR}/${name}.png`,
            cram_lines: lines,
            colors: words.map((w, i) => color(i, w)),
            notes,
        };
        entry["references"] = (REFERENCES[name] ?? []).map(([a, t]) => ({ site: hex(a), loads: hex(t) }));
        const stray = words.map((w, i) => ({ index: i, bits: w & ~CRAM_MASK & 0xffff })).filter((s) => s.bits).map((s) => ({ index: s.index, bits: hex4(s.bits) }));
        if (stray.length)
            entry["stray_bits"] = stray;
        out.push(entry);
        byName.set(name, words);
    }
    const cyc = byName.get("intro_raycast_cycle")!;
    for (let i = 0; i < 12; i++)
        if (cyc[i] !== cyc[i + 22])
            throw new Error("intro_raycast_cycle is not periodic with period 22");
    const l0 = byName.get("intro_raycast_line0")!.slice(4, 16);
    if (l0.some((v, i) => v !== cyc[i]))
        throw new Error("intro_raycast_line0 entries 4..15 differ from the cycle start");
    out.find((e) => e["name"] === "intro_raycast_cycle")!["cycle"] = { frames: 22, window: 12, cram_start_entry: 4, period: 22 };
    const maze = ["maze_normal_a", "maze_normal_b", "maze_nightvision_a", "maze_nightvision_b"];
    for (const e of out) {
        const en = e["name"] as string;
        if (maze.includes(en)) {
            const d: Rec = {};
            for (const o of maze) {
                if (o === en)
                    continue;
                const a = byName.get(en)!, b = byName.get(o)!;
                let n = 0;
                for (let i = 0; i < Math.min(a.length, b.length); i++)
                    if (a[i] !== b[i])
                        n++;
                d[o] = n;
            }
            e["differs_from"] = d;
        }
    }
    return { out, byName };
}
function wallLuts(ctx: Context): Rec[] {
    const luts: Rec[] = [];
    for (const [setNo, base, modes] of WALL_SETS) {
        for (let band = 1; band <= WALL_BANDS; band++) {
            const off = base + LUT_SIZE * (band - 1);
            luts.push({
                name: `wall_set${setNo}_band${band}`, kind: "wall", set: setNo, band, rom_offset: hex(off), size: LUT_SIZE,
                render_modes: modes, map: Array.from(ctx.rom.bytesAt(off, LUT_SIZE)), palette: "maze_normal_a",
                notes: `Band ${band} of 8 (1 = lightest, 8 = darkest) of wall LUT set ${setNo}.`,
            });
        }
    }
    return luts;
}
function billboardLuts(ctx: Context): {
    arrays: Rec[];
    luts: Rec[];
} {
    const rom = ctx.rom;
    const arrays: Rec[] = [];
    for (const [aname, aoff, idxs] of BILL_ARRAYS) {
        const entries: Rec[] = [];
        idxs.forEach((lutIdx, i) => {
            const target = rom.u32be(aoff + 4 * i);
            const expected = BILL_BASE + LUT_SIZE * lutIdx;
            if (target !== expected)
                throw new Error(`billboard array ${aname}[${i}] -> ${hex(target)}, expected ${hex(expected)}`);
            entries.push({ index: i, target: hex(target), lut: BILL_NAMES[lutIdx] });
        });
        arrays.push({ name: "billboard_array_" + aname, rom_offset: hex(aoff), entries });
    }
    const luts: Rec[] = [];
    BILL_NAMES.forEach((lname, i) => {
        const plain = rom.bytesAt(BILL_BASE + LUT_SIZE * i, LUT_SIZE);
        const twin = rom.bytesAt(BILL_BASE + BILL_MIRROR + LUT_SIZE * i, LUT_SIZE);
        for (let b = 0; b < 256; b++)
            if (twin[b] !== swapNibbles(plain[b]!))
                throw new Error(`${lname}: twin is not the nibble-swapped table`);
        const uniq = (xs: number[]): number[] => [...new Set(xs)].sort((a, b) => a - b);
        const range1 = Array.from({ length: 15 }, (_, k) => k + 1);
        const left = uniq(range1.map((v) => plain[v]! >> 4));
        const right = uniq(range1.map((v) => plain[v << 4]! & 15));
        const night = lname === "billboard_nightvision";
        for (const mirrored of [false, true]) {
            const data = mirrored ? twin : plain;
            const off = BILL_BASE + (mirrored ? BILL_MIRROR : 0) + LUT_SIZE * i;
            luts.push({
                name: lname + (mirrored ? "_mirrored" : ""), kind: "billboard", rom_offset: hex(off), size: LUT_SIZE, map: Array.from(data),
                mirrored, mirror_of: mirrored ? lname : null,
                palette: night ? "maze_nightvision_a" : "maze_normal_a",
                left_zero_nibble_maps_to: left.length === 1 && !night ? left[0] : null,
                right_zero_nibble_maps_to: right.length === 1 && !night ? right[0] : null,
                notes: mirrored ? "Nibble-swapped twin (out = swap(LUT[in])) used when the billboard is drawn mirrored." : "Billboard LUT, drawn unmirrored.",
            });
        }
    });
    return { arrays, luts };
}
export const palettes: Command = {
    name: NAME,
    run(ctx: Context, _options: Record<string, unknown>): void {
        const rom = ctx.rom;
        const { out: pals, byName } = buildPalettes(ctx);
        const wall = wallLuts(ctx);
        const { arrays, luts: bill } = billboardLuts(ctx);
        const luts = [...wall, ...bill];
        const png = (path: string, im: {
            w: number;
            h: number;
            px: Uint8Array;
        }, args: Rec): void => {
            ctx.writeBytes(path, encodePng({ width: im.w, height: im.h, mode: "RGB", pixels: im.px, level: PNG_COMPRESS_LEVEL }), args);
        };
        for (const entry of pals)
            png(entry["png"] as string, stripPng(byName.get(entry["name"] as string)!), { palette: entry["name"], layout: entry["layout"] });
        for (const lut of luts) {
            const line = byName.get(lut["palette"] as string)!.slice(0, LINE);
            lut["png"] = `${OUT_DIR}/shade_${lut["name"]}.png`;
            png(lut["png"] as string, lutPng(Uint8Array.from(lut["map"] as number[]), line), { lut: lut["name"], palette: lut["palette"] });
        }
        const laneArt = (m: number): number[] => Array.from(rom.bytesAt(LANE_ART[m]!, LANE_ART_SIZE));
        const doc: Rec = {
            format: FORMAT,
            color_model: {
                cram_word: "0000 BBB0 GGG0 RRR0 (big-endian in ROM)",
                rgb3: "[r, g, b], 3 bits per channel, from bits 1-3, 5-7, 9-11",
                rgb: "8-bit channels = rgb3 * 36",
                stray_bits: "bits outside 0x0EEE are ignored by the hardware; a palette that has any lists them under stray_bits, and CRAM captured from the port may show them cleared",
            },
            cram: { lines: 4, entries_per_line: LINE, bytes_per_line: 32 },
            palettes: pals,
            shade_luts: luts,
            wall_shading: {
                lut_sets: WALL_SETS.map(([s, b, m]) => ({ set: s, rom_offset: hex(b), bands: WALL_BANDS, stride: LUT_SIZE, render_modes: m })),
                routine_table: hex(WALL_HEIGHT_TABLE),
                plain_routine_table: hex(WALL_PLAIN_TABLE),
                height_to_band: WALL_HEIGHT_BANDS,
                notes: "Index = projected wall height in rows (even).  Heights 0 and >= 48 use the plain routines (same pointers as the plain table); 42, 44 and 46 have their own routines without a LUT read.  Band 1 is the lightest, 8 the darkest.  A LUT byte holds two 4-bit pixels.",
            },
            billboard_shading: {
                arrays,
                mirror_offset: hex(BILL_MIRROR),
                entry_rule: "array 0xED50 (identity): entry 0, no depth test.  Other arrays: n = (depth_word >> 3) arithmetic; n < 1 skips the sprite; entry = max(0, 5 - n); entry 0 = nearest/lightest, 4 = darkest.",
                mirror_rule: "mirrored billboards use LUT_address + 0xC00 (out = swap(LUT[in]))",
                transparent_rule: "an art byte of 0 is skipped (not looked up); other bytes with one zero nibble are looked up and the zero nibble is replaced by the fill colour shown in left_zero_nibble_maps_to / right_zero_nibble_maps_to",
                notes: "billboard_identity is the identity map except for zero nibbles, which become 9.  billboard_nightvision maps every byte to one of 0x44, 0x4C, 0xC4 or 0xCC.",
            },
            render_modes: RENDER_MODES.map(([m, t, s, a, d]) => ({
                mode: m, wall_routine_table: hex(t), wall_lut_set: s, billboard_array: "billboard_array_" + a, view_distance_cells: d,
                floor_ceiling_art: { rom_offset: hex(LANE_ART[m]!), size: LANE_ART_SIZE, bytes: laneArt(m), notes: LANE_ART_NOTE },
            })),
            night_vision_render: {
                wall_routine_table: hex(WALL_PLAIN_TABLE), wall_lut_set: null,
                billboard_array: "billboard_array_nightvision", view_distance_cells: NIGHT_VISION_DISTANCE,
                floor_ceiling_art: { rom_offset: hex(LANE_ART[0]!), size: LANE_ART_SIZE, bytes: laneArt(0), notes: "every render mode but 3, which keeps its own art. " + LANE_ART_NOTE },
                notes: "Night vision switches to the plain wall routines, render mode 0's lanes (mode 3 keeps its own), a view distance of 16 cells and its own billboard array.",
            },
            known_but_not_exported: KNOWN_NOT_EXPORTED,
            coverage: COVERAGE,
        };
        ctx.writeJson(`${OUT_DIR}/palettes.json`, doc);
        ctx.say(`palettes: ${pals.length} palette tables, ${luts.length} shade LUTs (${wall.length} wall, ${bill.length} billboard)`);
    },
};

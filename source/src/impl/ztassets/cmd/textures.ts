import type { Command, Context, RomFile } from "../core.js";
import { encodePng } from "../png.js";
import { sha256Hex } from "../../boot/sha256.js";
const FORMAT = "ztassets-textures/1";
const OUT_DIR = "textures";
const TEX_ROM = 0x12ef26;
const TEX_COUNT = 255;
const TEX_BYTES = 512;
const TEX_W = 32, TEX_H = 32;
const COLUMN_BYTES = 32;
const PAL_ROM = 0x20f2;
const PAL_LINE = 0;
const PAL_ROM_ALT = 0x21f2;
const META_W = 128, META_H = 64;
const DEF_OFF = 4, DEF_COUNT = 256, DEF_BYTES = 16;
const BLOCK_OFF = DEF_OFF + DEF_COUNT * DEF_BYTES;
const BLOCK_COUNT = 256, BLOCK_BYTES = 8;
const WORLDS: ReadonlyArray<readonly [
    string,
    string,
    number
]> = [
    ["ep0", "spaceship", 0x15a106],
    ["ep1", "highrise", 0x160420],
    ["ep2", "basement", 0x166028],
];
const SHEET_COLS = 16;
const SHEET_FILL = [64, 64, 64];
const hex = (n: number): string => "0x" + n.toString(16).toUpperCase();
const hex4 = (n: number): string => "0x" + n.toString(16).toUpperCase().padStart(4, "0");
const pad3 = (n: number): string => String(n).padStart(3, "0");
function unpackTexture(raw: Uint8Array): Uint8Array {
    const px = new Uint8Array(TEX_W * TEX_H);
    for (let col = 0; col < TEX_W / 2; col++) {
        for (let row = 0; row < TEX_H; row++) {
            const b = raw[col * COLUMN_BYTES + row]!;
            px[row * TEX_W + col * 2] = b >> 4;
            px[row * TEX_W + col * 2 + 1] = b & 15;
        }
    }
    return px;
}
function compose(tiles: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(META_W * META_H);
    tiles.forEach((tile, slot) => {
        const gx = (slot >> 1) * TEX_W;
        const gy = (slot & 1) * TEX_H;
        for (let y = 0; y < TEX_H; y++)
            out.set(tile.subarray(y * TEX_W, (y + 1) * TEX_W), (gy + y) * META_W + gx);
    });
    return out;
}
function readWorld(rom: RomFile, off: number): {
    defs: number[][];
    faces: Set<number>;
} {
    const m = rom.bytesAt(off, 4);
    if (!(m[0] === 0x5a && m[1] === 0x4d && m[2] === 0x41 && m[3] === 0x50))
        throw new Error(`no ZMAP magic at ${hex(off)}`);
    const defs: number[][] = [];
    for (let i = 0; i < DEF_COUNT; i++) {
        const row: number[] = [];
        for (let s = 0; s < 8; s++)
            row.push(rom.u16be(off + DEF_OFF + i * DEF_BYTES + s * 2));
        defs.push(row);
    }
    const faces = new Set<number>();
    for (let i = 0; i < (BLOCK_COUNT * BLOCK_BYTES) / 2; i++)
        faces.add(rom.u16be(off + BLOCK_OFF + i * 2));
    return { defs, faces };
}
export const textures: Command = {
    name: "textures",
    run(ctx: Context) {
        const rom = ctx.rom;
        const words: number[] = [];
        const altWords: number[] = [];
        for (let i = 0; i < 16; i++) {
            words.push(rom.u16be(PAL_ROM + (PAL_LINE * 16 + i) * 2));
            altWords.push(rom.u16be(PAL_ROM_ALT + (PAL_LINE * 16 + i) * 2));
        }
        const rgb16: number[][] = words.map((w) => [((w >> 1) & 7) * 36, ((w >> 5) & 7) * 36, ((w >> 9) & 7) * 36]);
        const flatPal: number[] = rgb16.flat();
        const palArgs = { palette_rom: hex(PAL_ROM), palette_line: PAL_LINE };
        const indexed = (w: number, h: number, px: Uint8Array): Uint8Array => encodePng({ width: w, height: h, mode: "P", pixels: px, palette: flatPal, bits: 4, level: 9 });
        const pool = rom.bytesAt(TEX_ROM, TEX_COUNT * TEX_BYTES);
        const pixels: Uint8Array[] = [];
        for (let i = 0; i < TEX_COUNT; i++) {
            ctx.progress(i, TEX_COUNT, `texture ${i + 1} of ${TEX_COUNT}`);
            const px = unpackTexture(pool.subarray(i * TEX_BYTES, (i + 1) * TEX_BYTES));
            pixels.push(px);
            ctx.writeBytes(`${OUT_DIR}/tex_${pad3(i)}.png`, indexed(TEX_W, TEX_H, px), { ...palArgs, index: i });
        }
        ctx.say(`textures: ${TEX_COUNT} wall textures from ${hex(TEX_ROM)}`);
        const meta: Record<string, unknown[]> = {};
        const episodes: Record<string, unknown> = {};
        for (const [key, name, off] of WORLDS) {
            const { defs, faces } = readWorld(rom, off);
            const entries: unknown[] = [];
            let nZeroRef = 0, nZeroSkipped = 0;
            defs.forEach((slots, idx) => {
                const allZero = !slots.some((s) => s !== 0);
                const referenced = faces.has(idx);
                if (allZero && !referenced) {
                    nZeroSkipped++;
                    return;
                }
                const mx = Math.max(...slots);
                if (mx >= TEX_COUNT)
                    throw new Error(`${key} definition ${idx} names texture ${mx} (pool has ${TEX_COUNT})`);
                if (allZero)
                    nZeroRef++;
                const comp = compose(slots.map((t) => pixels[t]!));
                const rel = `metatex_${key}_${pad3(idx)}.png`;
                ctx.writeBytes(`${OUT_DIR}/${rel}`, indexed(META_W, META_H, comp), { ...palArgs, episode: key, index: idx, textures: [...slots] });
                entries.push({ all_zero: allZero, index: idx, png: rel, referenced, sha256_pixels: sha256Hex(comp), textures: [...slots] });
            });
            meta[key] = entries;
            episodes[key] = {
                all_zero_referenced: nZeroRef,
                all_zero_skipped: nZeroSkipped,
                definitions: DEF_COUNT,
                definitions_rom_offset: hex(off + DEF_OFF),
                name,
                non_zero: entries.length - nZeroRef,
                written: entries.length,
                zmap_rom_offset: hex(off),
            };
            ctx.say(`textures: ${key} (${name}): ${entries.length} of ${DEF_COUNT} definitions written`);
        }
        const rows = Math.floor((pixels.length + SHEET_COLS - 1) / SHEET_COLS);
        const sw = SHEET_COLS * TEX_W, sh = rows * TEX_H;
        const sheet = new Uint8Array(sw * sh * 3);
        for (let i = 0; i < sw * sh; i++)
            sheet.set(SHEET_FILL, i * 3);
        pixels.forEach((px, i) => {
            const gx = (i % SHEET_COLS) * TEX_W, gy = Math.floor(i / SHEET_COLS) * TEX_H;
            for (let y = 0; y < TEX_H; y++) {
                let o = ((gy + y) * sw + gx) * 3;
                for (let x = 0; x < TEX_W; x++) {
                    sheet.set(rgb16[px[y * TEX_W + x]!]!, o);
                    o += 3;
                }
            }
        });
        ctx.writeBytes(`${OUT_DIR}/contact_sheet.png`, encodePng({ width: sw, height: sh, mode: "RGB", pixels: sheet, level: 9 }), palArgs);
        const allZeroTex: number[] = [];
        const shaEach: string[] = [];
        for (let i = 0; i < TEX_COUNT; i++) {
            const raw = pool.subarray(i * TEX_BYTES, (i + 1) * TEX_BYTES);
            if (!raw.some((b) => b !== 0))
                allZeroTex.push(i);
            shaEach.push(sha256Hex(raw));
        }
        const index = {
            contact_sheet: {
                cell: [TEX_W, TEX_H],
                columns: SHEET_COLS,
                height: sh,
                note: "RGB, cell i at column i%16, row i//16; the unused last cell is grey",
                png: "contact_sheet.png",
                width: sw,
            },
            episodes,
            format: FORMAT,
            metatexture_format: {
                bytes_per_definition: DEF_BYTES,
                grid: {
                    columns: 4,
                    rows: 2,
                    slot_to_cell: "slot k -> grid column k // 2, grid row k % 2, each cell 32 x 32 pixels",
                },
                height: META_H,
                png_pattern: "metatex_<episode>_<index:03d>.png",
                runtime_notes: [{
                        index: 20,
                        note: "slots 0, 2 and 4 are overwritten at run time by the level-exit code with " +
                            "digit glyph numbers; the ROM values are placeholders",
                        slots: [0, 2, 4],
                    }],
                slot_encoding: "eight big-endian u16 texture numbers",
                width: META_W,
                written_rule: "a definition is written iff it is not all zero or is named by at least one " +
                    "face word of at least one of the 256 block entries of the same episode " +
                    "(an all-zero definition is eight times texture 0)",
            },
            metatextures: meta,
            palette: {
                alternate_first_episode_line_identical: altWords.every((w, i) => w === words[i]),
                alternate_first_episode_rom_offset: hex(PAL_ROM_ALT),
                cram_words: words.map(hex4),
                evidence: "the viewport name-table words are 0x8001, 0x8002, ... (palette bits 14..13 = 0, " +
                    "priority bit set), so the wall pixels use palette line 0; in the maze the CRAM " +
                    "is loaded from the 64-word table at rom_offset (line 0 = its first 16 words)",
                expansion: "each 3-bit channel (bits 3..1 red, 7..5 green, 11..9 blue) times 36",
                index_0: "transparent on the VDP; not marked transparent in the PNGs",
                line: PAL_LINE,
                night_vision_note: "the night-vision maze palette (ROM 0x2072) has a different, green line 0; " +
                    "it is not embedded",
                rgb: rgb16,
                rom_offset: hex(PAL_ROM),
            },
            palette_line: PAL_LINE,
            textures: {
                all_zero: allZeroTex,
                bytes_per_texture: TEX_BYTES,
                count: TEX_COUNT,
                height: TEX_H,
                layout: "column-major: 16 columns of 32 bytes; byte c*32+r holds the pixels x=2c (high nibble) " +
                    "and x=2c+1 (low nibble) of row r; PNG pixel values are the raw 4-bit indices",
                png_pattern: "tex_<index:03d>.png",
                rom_offset: hex(TEX_ROM),
                sha256_each: shaEach,
                sha256_of_rom_slice: sha256Hex(pool),
                width: TEX_W,
            },
        };
        ctx.writeJson(`${OUT_DIR}/textures.json`, index, { palette_rom: hex(PAL_ROM), palette_line: PAL_LINE });
        ctx.say(`textures: palette line ${PAL_LINE} of ${hex(PAL_ROM)}; ${ctx.files.size} files`);
    },
};

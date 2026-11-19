import type { Command, Context, RomFile } from "../core.js";
import { encodePng } from "../png.js";
import { sha256Hex } from "../../boot/sha256.js";
import { SPRITES_ALT1_LABEL_SOURCE } from "../reference_notes.js";
const FORMAT = "ztassets-sprites/1";
const FORMAT_INDEX = "ztassets-sprites-index/1";
const FORMAT_LUT = "ztassets-sprites-animlut/1";
const OUT_DIR = "sprites";
const PAL_ROM = 0x20f2;
const PAL_ROM_TWIN = 0x21f2;
const PAL_LINE = 0;
const CELL_BYTES = 0x200;
const CELL_COLS = 16;
const CELL_W = 32;
const CELL_H = 32;
const COLUMN_BYTES = 32;
const FRAME_BYTES = 0x26;
const GRID = 4;
const FLIP_AT = 6;
const CELL_AT = 6 + 0x10;
const VIEW_MODES = [1, 2, 4, 6, 8];
const MAX_STATES = 64;
const LUT_ROM = 0x1bbaa;
const LUT_ROWS = 8;
const LUT_COLS = 32;
const SHADE_ROM = 0x10d1be;
const SHADE_TABLES = 12;
const SHADE_TWIN = 0xc00;
type BankRow = readonly [
    string,
    string | null,
    string | null,
    number
];
const BANKS: readonly BankRow[] = [
    ["enemy.rec0.art", "enemy.rec0", null, 0x1b7b38],
    ["enemy.rec1.art", "enemy.rec1", null, 0x16ec58],
    ["enemy.rec1.art_alt1", "enemy.rec1", null, 0x1c258a],
    ["enemy.rec2.art", "enemy.rec2", null, 0x1a7828],
    ["enemy.rec3.art", "enemy.rec3", "hydaca", 0x1acc72],
    ["enemy.rec4.art", "enemy.rec4", null, 0x18d078],
    ["enemy.rec5.art", "enemy.rec5", null, 0x183b94],
    ["enemy.rec6.art", "enemy.rec6", null, 0x1784f2],
    ["enemy.rec7.art", "enemy.rec7", null, 0x17ba80],
    ["enemy.rec8.art", "enemy.rec8", null, 0x193f00],
    ["enemy.rec9.art", "enemy.rec9", null, 0x19d50c],
    ["gibs.art", null, null, 0x1cb96a],
    ["link.player.art", null, null, 0x1cc034],
];
const LABELS: Record<string, [
    string,
    string | null
]> = {
    "enemy.rec1.art_alt1": [
        "alternate art of enemy.rec1: the spawn routine of the enemy markers installs it " +
            "instead of enemy.rec1.art when the spawn cell's column and row differ in " +
            "parity ((column xor row) & 1), on every floor; the 'floor index is not 0' " +
            "condition belongs to another spawn path",
        SPRITES_ALT1_LABEL_SOURCE,
    ],
    "gibs.art": [
        "gibs",
        "the extraction plan's graphics inventory names this bank 'gibs'; installed by " +
            "three death-effect draw stubs and drawn by one item composite entry; the name " +
            "is not verified against gameplay",
    ],
    "link.player.art": [
        "the two-player partner's crouched figure (3 states x 6 views: crouched, kneeling, " +
            "kneeling and firing)",
        "installed by the link-play mirror's draw stubs while the " +
            "remote player crouches (the face-to-face two-player capture); standing poses " +
            "use enemy.rec0.art",
    ],
};
const LIVE_TABLE = 0xab0c;
const LIVE_STRIDE = 38;
const CORPSE_TABLE = 0xac88;
const CORPSE_STRIDE = 26;
const ART_FIELD = 20;
const RECORDS = 10;
const CODE_SCAN_END = 0x20000;
const ART_SLOT_DISP = 0x0042;
const COMPOSITE_ENTRY = 0x1bd72;
const KNOWN_ASSETS: ReadonlyArray<readonly [
    string,
    number,
    number
]> = [
    ["item_art_pool", 0x10e9be, 0x116dbe],
    ["wall_textures", 0x12ef26, 0x12ef26 + 255 * 0x200],
    ["weapon_hands", 0x16c038, 0x16da58],
    ["hud_tile_banks", 0x16da58, 0x16ec58],
];
const ZMAPS: ReadonlyArray<readonly [
    string,
    number
]> = [
    ["zmap_spaceship", 0x15a106],
    ["zmap_highrise", 0x160420],
    ["zmap_basement", 0x166028],
];
const ZMAP_TABLE = 0x5914;
const CODE_CHECKS: ReadonlyArray<readonly [
    number,
    string,
    string
]> = [
    [0x1ba0e, "b0596504", "the state index is compared with the count word, unsigned; index >= count returns without drawing"],
    [0x1ba16, "2449d4d1e348d2f10002", "pool = (bank+2) + signed word at bank+2; state record = (bank+2) + signed word at bank+4+2*state"],
    [0x1ba20, "3e110c4700016700", "the view mode word at state+0; mode 1 takes view 0"],
    [0x1ba44, "0c470002660a4a816b0000dc", "mode 2: view 0 when dot < 0, else view 1"],
    [0x1baa0, "0c470004661a0c43009b6c0000840c43ff656f000076", "mode 4: c >= 155 -> view 1, c <= -155 -> view 0, else by the sign of cross"],
    [0x1bac0, "0c470006662a0c43009b6c0000640c43ff386f0000560c43ffa66c0a", "mode 6: c >= 155 -> view 1, c <= -200 -> view 0, c >= -90 -> views 2/3, else 4/5"],
    [0x1baf0, "0c4300c86c00003a0c43ff386f00002c0c43ffa66c0a", "other modes: c >= 200 -> view 1, c <= -200 -> view 0, c < -90 -> views 4/5"],
    [0x1bb10, "0c43005a6f0a", "other modes: c <= 90 -> views 2/3, else views 6/7"],
    [0x1bb2a, "d2e900026028d2e900046022d2e90006601cd2e900086016d2e9000a6010d2e9000c600ad2e9000e6004" + "d2e90010", "view v array = state + signed word at state+2+2v, v = 0..7"],
    [0x1bb58, "3e19321f6b0cb24763000148424160000142", "K = word at the view; an explicit frame f >= 0 is used when f <= K (unsigned), else frame 0"],
    [0x1bb6a, "42414a476700013a", "automatic frame: frame 0 when K = 0"],
    [0x1bb80, "42410c40000465000122d168003c3228003ce6410241001f47fa00105347eb4fd6c712331000", "automatic frame: 0 when speed < 4, else acc += speed and frame = lut[(K-1)*32 + ((acc >> 3) & 31)]"],
    [0x1bba6, "60000102", "the code branches over the 256-byte animation table at 0x1BBAA"],
    [0x1bcaa, "c2fc0026d3c1", "frame record = array + 2 + 38*f (the K word was already skipped)"],
    [0x1bcb8, "3405362e8e1a966e916e96680024c5c3ec8206420028", "sy = ((S * (eye - z - Z)) >> 6) + 40"],
    [0x1bcce, "42461c290002ccc5ea8642471e290003cec5e887", "cw = (byte +2 * S) >> 5, ch = (byte +3 * S) >> 4"],
    [0x1bce2, "424316290004c6c64a11670e0c110001670492436004e2439243", "x alignment by byte +0: 0 none, 1 half of cols*cw, other the full width"],
    [0x1bcfc, "424316290005c6c74a29000167100c2900010001670494436004e2439443", "y alignment by byte +1: 0 none, 1 half of rows*ch, other the full height"],
    [0x1bd1a, "426e9088", "the flip word is cleared once per frame"],
    [0x1bd3c, "1d5390894283162b0010e34b48c3e18bd3c3", "per cell: flip flag = byte at grid+r*4+c, cell art = pool + 512 * byte at grid+0x10+r*4+c"],
    [0x1bd5c, "524bd24451ceffd8", "next column: grid byte + 1, x += cw"],
    [0x1bd64, "4cdf0a02d440584b51cfffc0", "next row: grid row + 4 bytes, y += ch"],
    [0xee36, "3d7c0020908a4a6e9088670cd2fc01e0446e908ad6fc0c00", "cell rasterizer: column step 0x20; a flipped cell starts at +0x1E0, steps -0x20 and uses the shade table + 0xC00"],
];
const X_KIND = ["left", "center", "right"];
const Y_KIND = ["top", "middle", "bottom"];
const SELECTORS: Record<number, string[]> = {
    1: ["always"],
    2: ["front: dot < 0", "back: dot >= 0"],
    4: ["front: c <= -155", "back: c >= 155", "-155 < c < 155 and cross < 0", "-155 < c < 155 and cross >= 0"],
    6: ["front: c <= -200", "back: c >= 155", "-90 <= c < 155 and cross < 0", "-90 <= c < 155 and cross >= 0", "-200 < c < -90 and cross < 0", "-200 < c < -90 and cross >= 0"],
    8: ["front: c <= -200", "back: c >= 200", "-90 <= c <= 90 and cross < 0", "-90 <= c <= 90 and cross >= 0", "-200 < c < -90 and cross < 0", "-200 < c < -90 and cross >= 0", "90 < c < 200 and cross < 0", "90 < c < 200 and cross >= 0"],
};
const ANIM_RULE = "the caller passes a frame number f: f >= 0 draws frame f when f <= K, else frame 0; f < 0 is " +
    "automatic: frame 0 when K = 0 or speed = mag(vel) < 4, otherwise the entity's 16-bit animation " +
    "accumulator (anim of the world snapshot) gains speed and frame = anim_lut[K-1][(acc >> 3) & 31] " +
    "(values 1..K); frame 0 is the standing frame";
function rules(): Record<string, unknown> {
    const modes: Record<string, string[]> = {};
    for (const m of [1, 2, 4, 6, 8])
        modes[String(m)] = [...SELECTORS[m]!];
    return {
        cell_art: "32x32 pixels, 4 bits per pixel, column-major: 16 columns of 32 bytes; byte c*32+r holds the " +
            "pixels x=2c (high nibble) and x=2c+1 of row r; 512 bytes per cell",
        flip: "a non-zero flip flag mirrors the cell horizontally (drawn from its last column backwards through " +
            "the nibble-swapped twin shade table); the cell keeps its grid position; frame PNGs show it mirrored",
        transparency: "a cell byte of 0 (pixels x=2k and x=2k+1 both index 0) is not drawn; an index-0 pixel paired " +
            "with a non-zero pixel is drawn as colour 0",
        placement: {
            cell_size: "cw = (w_num * S) >> 5 screen columns (2 pixels each), ch = (h_num * S) >> 4 rows; S is the " +
                "entity's depth/scale word",
            screen_y: "sy = ((S * (eye - z - Z)) >> 6) + 40; eye: eye-height word, z: player height word, Z: the " +
                "entity's altitude (pos.z of the world snapshot)",
            x_align: "x0 = sx (xmode 0), sx - ((cols * cw) >> 1) (xmode 1), sx - cols * cw (any other xmode)",
            y_align: "y0 = sy (ymode 0), sy - ((rows * ch) >> 1) (ymode 1), sy - rows * ch (any other ymode)",
            grid: "cells are drawn row by row from (x0, y0): x += cw per cell, y += ch per row",
            anchor: "anchor = the frame pixel at native size (32 px per cell) that lands on (sx, sy): x = 0, W/2, W " +
                "for xmode 0, 1, other; y = 0, H/2, H for ymode 0, 1, other",
        },
        view_selection: {
            inputs: "rel = entity position - player position, vel = entity velocity (vel of the world snapshot); " +
                "dot = rel.x*vel.x + rel.y*vel.y; cross = rel.y*vel.x - rel.x*vel.y; mag(a, b) = (max(|a|, |b|) " +
                "+ |a| + |b|) >> 1; c = ((dot / (mag(rel) + 1)) << 8) / (mag(vel) + 1), 16-bit signed " +
                "divisions (c is about 256 * cos of the angle between rel and vel)",
            meaning: "dot < 0: the entity moves towards the viewer (view 0 = front, view 1 = back for modes >= 2)",
            modes,
            other_modes: "a mode outside 1, 2, 4, 6 selects like 8",
        },
        animation: ANIM_RULE,
    };
}
const SHEET_BG: [
    number,
    number,
    number
] = [40, 40, 56];
const SHEET_SCALE = 2;
const SHEET_FRAME_GAP = 2;
const SHEET_VIEW_GAP = 10;
const SHEET_ROW_GAP = 8;
const POOL_COLUMNS = 16;
const hex = (n: number): string => "0x" + n.toString(16).toUpperCase();
const hex4 = (n: number): string => "0x" + n.toString(16).toUpperCase().padStart(4, "0");
const toHexStr = (d: Uint8Array): string => Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
const fromHexStr = (s: string): Uint8Array => Uint8Array.from(s.match(/../g)!, (h) => parseInt(h, 16));
const s16 = (v: number): number => (v & 0x8000 ? v - 0x10000 : v);
function camToRgb(word: number): [
    number,
    number,
    number
] {
    return [((word >> 1) & 7) * 36, ((word >> 5) & 7) * 36, ((word >> 9) & 7) * 36];
}
function unpackCell(raw: Uint8Array, flip: boolean): Uint8Array {
    if (raw.length !== CELL_BYTES)
        throw new Error(`cell art must be ${CELL_BYTES} bytes`);
    const px = new Uint8Array(CELL_W * CELL_H);
    for (let col = 0; col < CELL_COLS; col++) {
        const base = col * COLUMN_BYTES;
        for (let row = 0; row < CELL_H; row++) {
            const b = raw[base + row]!;
            const x = col * 2;
            px[row * CELL_W + x] = b >> 4;
            px[row * CELL_W + x + 1] = b & 15;
        }
    }
    if (flip)
        for (let r = 0; r < CELL_H; r++)
            px.subarray(r * CELL_W, (r + 1) * CELL_W).reverse();
    return px;
}
function packCell(px: Uint8Array, flip: boolean): Uint8Array {
    let p = px;
    if (flip) {
        p = px.slice();
        for (let r = 0; r < CELL_H; r++)
            p.subarray(r * CELL_W, (r + 1) * CELL_W).reverse();
    }
    const raw = new Uint8Array(CELL_BYTES);
    for (let col = 0; col < CELL_COLS; col++)
        for (let row = 0; row < CELL_H; row++)
            raw[col * COLUMN_BYTES + row] = (p[row * CELL_W + col * 2]! << 4) | p[row * CELL_W + col * 2 + 1]!;
    return raw;
}
function blit(dst: Uint8Array, dstW: number, x: number, y: number, src: Uint8Array, srcW: number, srcH: number): void {
    for (let r = 0; r < srcH; r++)
        dst.set(src.subarray(r * srcW, (r + 1) * srcW), (y + r) * dstW + x);
}
function cut(src: Uint8Array, srcW: number, x: number, y: number, w: number, h: number): Uint8Array {
    const out = new Uint8Array(w * h);
    for (let r = 0; r < h; r++)
        out.set(src.subarray((y + r) * srcW + x, (y + r) * srcW + x + w), r * w);
    return out;
}
function bytesEq(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++)
        if (a[i] !== b[i])
            return false;
    return true;
}
function anchorOf(xmode: number, ymode: number, w: number, h: number): [
    {
        x: number;
        y: number;
    },
    string
] {
    const ax = xmode === 0 ? 0 : xmode === 1 ? Math.floor(w / 2) : w;
    const ay = ymode === 0 ? 0 : ymode === 1 ? Math.floor(h / 2) : h;
    return [{ x: ax, y: ay }, `${Y_KIND[Math.min(ymode, 2)]}-${X_KIND[Math.min(xmode, 2)]}`];
}
function checkCode(rom: RomFile): unknown[] {
    const out: unknown[] = [];
    for (const [off, hexbytes, what] of CODE_CHECKS) {
        const want = fromHexStr(hexbytes);
        const got = rom.bytesAt(off, want.length);
        if (!bytesEq(got, want))
            throw new Error(`the sprite rasterizer's code at ${hex(off)} is not as documented (${what}): expected ${hexbytes}, found ${toHexStr(got)}`);
        out.push({ bytes: hexbytes, rom_offset: hex(off), what });
    }
    for (let k = 0; k < SHADE_TABLES; k++) {
        const t = rom.bytesAt(SHADE_ROM + 0x100 * k, 0x100);
        const tw = rom.bytesAt(SHADE_ROM + SHADE_TWIN + 0x100 * k, 0x100);
        for (let i = 0; i < 0x100; i++)
            if (tw[i] !== (((t[i]! & 15) << 4) | (t[i]! >> 4)))
                throw new Error(`shade table ${k} at ${hex(SHADE_ROM + 0x100 * k)}: its twin at +${hex(SHADE_TWIN)} is not the nibble swap`);
    }
    return out;
}
function scanCode(rom: RomFile): {
    stores: Map<number, number[]>;
    comps: Map<number, number[]>;
} {
    const data = rom.bytesAt(0, CODE_SCAN_END);
    const stores = new Map<number, number[]>();
    const comps = new Map<number, number[]>();
    const jmp = new Uint8Array([0x4e, 0xf9, (COMPOSITE_ENTRY >>> 24) & 255, (COMPOSITE_ENTRY >>> 16) & 255, (COMPOSITE_ENTRY >>> 8) & 255, COMPOSITE_ENTRY & 255]);
    const u32 = (o: number): number => ((data[o]! << 24) >>> 0) + (data[o + 1]! << 16) + (data[o + 2]! << 8) + data[o + 3]!;
    const push = (m: Map<number, number[]>, k: number, v: number): void => {
        const a = m.get(k);
        if (a)
            a.push(v);
        else
            m.set(k, [v]);
    };
    for (let o = 0; o < CODE_SCAN_END - 7; o += 2) {
        const w = (data[o]! << 8) | data[o + 1]!;
        if ((w & 0xf1ff) === 0x217c && data[o + 6] === 0 && data[o + 7] === ART_SLOT_DISP)
            push(stores, u32(o + 2), o);
        else if (w === 0x227c) {
            for (let k = 6; k < 24; k += 2) {
                if (o + k + 6 > data.length)
                    continue;
                let eq = true;
                for (let j = 0; j < 6; j++)
                    if (data[o + k + j] !== jmp[j]) {
                        eq = false;
                        break;
                    }
                if (eq) {
                    push(comps, u32(o + 2), o);
                    break;
                }
            }
        }
    }
    return { stores, comps };
}
function zmapExtent(rom: RomFile, start: number): number {
    let pos = start + ZMAP_TABLE;
    for (let i = 0; i < 4096; i++) {
        const n = rom.u16be(pos);
        if (n === 0)
            return pos + 2;
        if (n < 2 || n & 1)
            throw new Error(`ZMAP at ${hex(start)}: bad animation record size ${n} at ${hex(pos)}`);
        pos += n;
    }
    throw new Error(`ZMAP at ${hex(start)}: animation chain does not terminate`);
}
interface Frame {
    rom_offset: number;
    xmode: number;
    ymode: number;
    w_num: number;
    h_num: number;
    cols: number;
    rows: number;
    flips: number[];
    slots: number[];
}
interface View {
    rom_offset: number;
    k: number;
    frames: Frame[];
}
interface State {
    rom_offset: number;
    mode: number;
    views: View[];
}
interface Parsed {
    art: number;
    count: number;
    pool: number;
    pool_end: number;
    struct_end: number;
    states: State[];
    unused_grid: Array<[
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number
    ]>;
    max_slot: number;
}
function parseBank(rom: RomFile, art: number, poolEndIn: number | null): Parsed {
    const need = (cond: boolean, msg: string): void => {
        if (!cond)
            throw new Error(`bank ${hex(art)}: ${msg}`);
    };
    need(art >= 0 && art + 4 <= rom.size, `the bank header lies outside the ${rom.size}-byte ROM`);
    const count = rom.u16be(art);
    need(count >= 1 && count <= MAX_STATES, `state count ${count} is outside 1..${MAX_STATES} (corrupt header, or not a sprite bank)`);
    const p2 = art + 2;
    const pool = p2 + s16(rom.u16be(p2));
    need(pool > art + 4 + 2 * count, `the cell pool (${hex(pool)}) does not lie after the state table`);
    need(pool < rom.size, `the cell pool (${hex(pool)}) lies outside the ROM`);
    const inside = (o: number, n: number, what: string): void => need(art <= o && o + n <= pool, `${what} at ${hex(o)} (+${n} bytes) is outside the structure ${hex(art)}..${hex(pool)}`);
    const states: State[] = [];
    let structEnd = art + 4 + 2 * count;
    let maxSlot = -1;
    const unusedGrid: Parsed["unused_grid"] = [];
    for (let s = 0; s < count; s++) {
        const sr = p2 + s16(rom.u16be(p2 + 2 + 2 * s));
        inside(sr, 2, `state ${s} record`);
        const mode = rom.u16be(sr);
        need(VIEW_MODES.includes(mode), `state ${s}: view mode ${mode} is not one of (${VIEW_MODES.join(", ")})`);
        inside(sr, 2 + 2 * mode, `state ${s} view table`);
        structEnd = Math.max(structEnd, sr + 2 + 2 * mode);
        const views: View[] = [];
        for (let v = 0; v < mode; v++) {
            const vo = sr + s16(rom.u16be(sr + 2 + 2 * v));
            inside(vo, 2, `state ${s} view ${v} array`);
            const k = rom.u16be(vo);
            need(k <= LUT_ROWS, `state ${s} view ${v}: highest frame number ${k} exceeds the ${LUT_ROWS}-row animation table`);
            inside(vo, 2 + FRAME_BYTES * (k + 1), `state ${s} view ${v} frames`);
            structEnd = Math.max(structEnd, vo + 2 + FRAME_BYTES * (k + 1));
            const frames: Frame[] = [];
            for (let f = 0; f <= k; f++) {
                const g = vo + 2 + FRAME_BYTES * f;
                const rec = rom.bytesAt(g, FRAME_BYTES);
                const [xmode, ymode, w_num, h_num, cols, rows] = [rec[0]!, rec[1]!, rec[2]!, rec[3]!, rec[4]!, rec[5]!];
                need(cols >= 1 && cols <= GRID && rows >= 1 && rows <= GRID, `frame record ${hex(g)}: grid ${cols}x${rows} is outside 1..4 x 1..4`);
                const flips: number[] = [];
                const slots: number[] = [];
                for (let r = 0; r < GRID; r++)
                    for (let c = 0; c < GRID; c++) {
                        const fl = rec[FLIP_AT + GRID * r + c]!;
                        const n = rec[CELL_AT + GRID * r + c]!;
                        if (c < cols && r < rows) {
                            flips.push(fl);
                            slots.push(n);
                        }
                        else if (fl || n)
                            unusedGrid.push([s, v, f, r, c, fl, n, g]);
                    }
                maxSlot = Math.max(maxSlot, ...slots);
                frames.push({ rom_offset: g, xmode, ymode, w_num, h_num, cols, rows, flips, slots });
            }
            views.push({ rom_offset: vo, k, frames });
        }
        states.push({ rom_offset: sr, mode, views });
    }
    const poolEnd = poolEndIn === null ? pool + CELL_BYTES * (maxSlot + 1) : poolEndIn;
    need((poolEnd - pool) % CELL_BYTES === 0 && poolEnd > pool, `the pool ${hex(pool)}..${hex(poolEnd)} is not a whole number of 512-byte cells`);
    need(poolEnd <= rom.size, `the cell pool runs past the end of the ROM (${hex(poolEnd)})`);
    need(pool + CELL_BYTES * (maxSlot + 1) <= poolEnd, `cell number ${maxSlot} reaches past the pool end ${hex(poolEnd)}`);
    return { art, count, pool, pool_end: poolEnd, struct_end: structEnd, states, unused_grid: unusedGrid, max_slot: maxSlot };
}
function pngIndexed(w: number, h: number, px: Uint8Array, flat: number[]): Uint8Array {
    return encodePng({ width: w, height: h, mode: "P", pixels: px, palette: flat, bits: 4, level: 9 });
}
function run(ctx: Context): void {
    const rom = ctx.rom;
    const warnings: string[] = [];
    const codeChecks = checkCode(rom);
    const words: number[] = [];
    for (let i = 0; i < 16; i++)
        words.push(rom.u16be(PAL_ROM + (PAL_LINE * 16 + i) * 2));
    for (let i = 0; i < 16; i++)
        if (words[i] !== rom.u16be(PAL_ROM_TWIN + (PAL_LINE * 16 + i) * 2))
            throw new Error(`line 0 of the maze tables ${hex(PAL_ROM)} and ${hex(PAL_ROM_TWIN)} differ`);
    const rgb = words.map(camToRgb);
    const flat: number[] = [];
    for (const c of rgb)
        flat.push(c[0], c[1], c[2]);
    const palette = {
        cram_words: words.map((w) => hex4(w)), line: PAL_LINE, rom_offset: hex(PAL_ROM), rgb: rgb.map((c) => [...c]),
        evidence: "billboard cells are plotted into the wall renderer's tile stream, whose name-table " +
            "words carry palette bits 0; line 0 is identical in both normal maze tables (0x20F2, " +
            "0x21F2); under night vision the green tables apply",
    };
    const palArgs = { palette_line: PAL_LINE, palette_rom: hex(PAL_ROM) };
    const byOff = new Map<number, BankRow>(BANKS.map((b) => [b[3], b]));
    const descriptors = new Map<string, unknown[]>();
    for (let i = 0; i < RECORDS; i++) {
        const live = rom.u32be(LIVE_TABLE + LIVE_STRIDE * i + ART_FIELD);
        const corpse = rom.u32be(CORPSE_TABLE + CORPSE_STRIDE * i + ART_FIELD);
        const name = `enemy.rec${i}.art`;
        if (live !== corpse || byOff.get(live)?.[0] !== name)
            throw new Error(`descriptor record ${i} names art ${hex(live)} / ${hex(corpse)}, expected ${name}`);
        descriptors.set(name, [
            { index: i, rom_offset: hex(LIVE_TABLE + LIVE_STRIDE * i), table: "live" },
            { index: i, rom_offset: hex(CORPSE_TABLE + CORPSE_STRIDE * i), table: "corpse" },
        ]);
    }
    const { stores, comps } = scanCode(rom);
    const storeKeys = [...stores.keys()].sort((a, b) => a - b);
    if (storeKeys.length !== byOff.size || storeKeys.some((k) => !byOff.has(k)))
        throw new Error("the art-pointer stores name banks that differ from the table");
    for (const k of comps.keys())
        if (!byOff.has(k))
            throw new Error(`composite entries name unknown bank ${hex(k)}`);
    const offsets = [...byOff.keys()].sort((a, b) => a - b);
    const parsed = new Map<number, Parsed>();
    offsets.forEach((off, i) => parsed.set(off, parseBank(rom, off, i + 1 < offsets.length ? offsets[i + 1]! : null)));
    const regionEnd = parsed.get(offsets[offsets.length - 1]!)!.pool_end;
    for (const off of offsets) {
        const p = parsed.get(off)!;
        const nm = byOff.get(off)![0];
        if (p.struct_end !== p.pool)
            warnings.push(`${nm}: the structure ends at ${hex(p.struct_end)} but the cell pool starts at ${hex(p.pool)}`);
        for (const [s, v, f, r, c, fl, n, g] of p.unused_grid)
            warnings.push(`${nm}: state ${s} view ${v} frame ${f} (record ${hex(g)}): grid entry row ${r} column ${c} lies outside the frame's grid but holds flip ${fl}, cell ${n} (the rasterizer never reads it)`);
    }
    const known: Array<readonly [
        string,
        number,
        number
    ]> = [...KNOWN_ASSETS, ...ZMAPS.map(([n, o]) => [n, o, zmapExtent(rom, o)] as const)];
    known.sort((a, b) => a[1] - b[1]);
    let ranges = 0;
    for (const off of offsets) {
        const p = parsed.get(off)!;
        const name = byOff.get(off)![0];
        const spans: Array<[
            string,
            number,
            number
        ]> = [["bank", off, p.pool_end]];
        for (const st of p.states)
            for (const vw of st.views)
                for (const fr of vw.frames)
                    for (const n of fr.slots) {
                        const a = p.pool + CELL_BYTES * n;
                        spans.push(["cell art", a, a + CELL_BYTES]);
                    }
        for (const [what, a, b] of spans) {
            ranges++;
            if (!(0 <= a && a < b && b <= rom.size))
                warnings.push(`${name}: ${what} ${hex(a)}..${hex(b)} lies outside the ROM`);
            if (what === "cell art" && !(p.pool <= a && b <= p.pool_end))
                warnings.push(`${name}: cell art ${hex(a)} lies outside its pool`);
            for (const [kname, ka, kb] of known)
                if (a < kb && ka < b)
                    warnings.push(`${name}: ${what} ${hex(a)}..${hex(b)} overlaps ${kname} ${hex(ka)}..${hex(kb)}`);
        }
        for (const off2 of offsets)
            if (off2 !== off && off < parsed.get(off2)!.pool_end && off2 < p.pool_end)
                warnings.push(`${name} overlaps bank ${hex(off2)}`);
    }
    const warningsSorted = [...new Set(warnings)].sort();
    let contiguous = true;
    for (let i = 0; i + 1 < offsets.length; i++)
        if (parsed.get(offsets[i]!)!.pool_end !== offsets[i + 1])
            contiguous = false;
    const rt = { frames: 0, equal: 0, cells: 0, cells_equal: 0, pool_slots: 0, pool_slots_equal: 0 };
    const bankRows: Array<Record<string, unknown>> = [];
    let bankNo = 0;
    for (const [name, etype, alias, off] of BANKS) {
        ctx.progress(bankNo++, BANKS.length, `bank ${bankNo} of ${BANKS.length}`);
        const p = parsed.get(off)!;
        const pool = p.pool;
        const cellCache = new Map<number, Uint8Array>();
        const cellRaw = (n: number): Uint8Array => {
            let c = cellCache.get(n);
            if (!c) {
                c = rom.bytesAt(pool + CELL_BYTES * n, CELL_BYTES);
                cellCache.set(n, c);
            }
            return c;
        };
        const statesOut: unknown[] = [];
        const panels: unknown[] = [];
        type Item = [
            number,
            number,
            number,
            Uint8Array
        ];
        const sheetRows: Array<Array<Item[]>> = [];
        const referenced = new Set<number>();
        let nViews = 0, nFrames = 0, nCells = 0;
        p.states.forEach((st, si) => {
            const viewsOut: unknown[] = [];
            const rowItems: Item[][] = [];
            st.views.forEach((vw, vi) => {
                const framesOut: unknown[] = [];
                const viewItems: Item[] = [];
                vw.frames.forEach((fr, fi) => {
                    const { cols, rows } = fr;
                    const w = CELL_W * cols, h = CELL_H * rows;
                    const px = new Uint8Array(w * h);
                    fr.slots.forEach((n, k) => {
                        const r = Math.floor(k / cols), c = k % cols;
                        blit(px, w, c * CELL_W, r * CELL_H, unpackCell(cellRaw(n), fr.flips[k] !== 0), CELL_W, CELL_H);
                        referenced.add(n);
                    });
                    const rel = `${name}/${si}/${vi}/${fi}.png`;
                    const data = pngIndexed(w, h, px, flat);
                    let ok = true;
                    fr.slots.forEach((n, k) => {
                        const r = Math.floor(k / cols), c = k % cols;
                        const same = ok && bytesEq(packCell(cut(px, w, c * CELL_W, r * CELL_H, CELL_W, CELL_H), fr.flips[k] !== 0), cellRaw(n));
                        rt.cells++;
                        if (same)
                            rt.cells_equal++;
                        ok = ok && same;
                    });
                    rt.frames++;
                    if (ok)
                        rt.equal++;
                    ctx.writeBytes(`${OUT_DIR}/${rel}`, data, { ...palArgs, rom_offset: hex(fr.rom_offset) });
                    const [anchor, kind] = anchorOf(fr.xmode, fr.ymode, w, h);
                    framesOut.push({
                        anchor, anchor_kind: kind,
                        cell_art: fr.slots.map((n) => hex(pool + CELL_BYTES * n)),
                        cell_flip: [...fr.flips], cell_slots: [...fr.slots],
                        cells: { h: rows, w: cols }, h_num: fr.h_num, index: fi, png: rel,
                        px: { h, w }, rom_offset: hex(fr.rom_offset),
                        sha256_pixels: sha256Hex(px),
                        w_num: fr.w_num, xmode: fr.xmode, ymode: fr.ymode,
                    });
                    viewItems.push([fi, w, h, px]);
                    nFrames++;
                    nCells += fr.slots.length;
                });
                const k = vw.k;
                viewsOut.push({
                    anim: { idle_frame: 0, lut_frames: k ? [1, k] : null, lut_row: k ? k - 1 : null },
                    direction: vi, frame_count_word: k, frames: framesOut,
                    rom_offset: hex(vw.rom_offset), selector: SELECTORS[st.mode]![vi],
                });
                rowItems.push(viewItems);
                nViews++;
            });
            statesOut.push({ index: si, rom_offset: hex(st.rom_offset), view_mode: st.mode, views: viewsOut });
            sheetRows.push(rowItems.map((it) => it) as unknown as Array<Item[]>);
        });
        const slotsN = (p.pool_end - pool) / CELL_BYTES;
        const prow = Math.floor((slotsN + POOL_COLUMNS - 1) / POOL_COLUMNS);
        const pw = POOL_COLUMNS * CELL_W, ph = prow * CELL_H;
        const ppx = new Uint8Array(pw * ph);
        for (let n = 0; n < slotsN; n++)
            blit(ppx, pw, (n % POOL_COLUMNS) * CELL_W, Math.floor(n / POOL_COLUMNS) * CELL_H, unpackCell(cellRaw(n), false), CELL_W, CELL_H);
        const pdata = pngIndexed(pw, ph, ppx, flat);
        for (let n = 0; n < slotsN; n++) {
            rt.pool_slots++;
            if (bytesEq(packCell(cut(ppx, pw, (n % POOL_COLUMNS) * CELL_W, Math.floor(n / POOL_COLUMNS) * CELL_H, CELL_W, CELL_H), false), cellRaw(n)))
                rt.pool_slots_equal++;
        }
        const poolRel = `${name}/pool.png`;
        ctx.writeBytes(`${OUT_DIR}/${poolRel}`, pdata, { ...palArgs, rom_offset: hex(pool), set: "pool" });
        const unref: number[] = [];
        for (let n = 0; n < slotsN; n++)
            if (!referenced.has(n))
                unref.push(n);
        const sc = SHEET_SCALE;
        type Placed = {
            si: number;
            vi: number;
            fi: number;
            x: number;
            w: number;
            h: number;
            px: Uint8Array;
            py: number;
        };
        const layout: Placed[] = [];
        let y = 0, sheetW = 1;
        p.states.forEach((_st, si) => {
            const row: Array<Omit<Placed, "py">> = [];
            let x = 0;
            (sheetRows[si] as unknown as Item[][]).forEach((viewItems, vi) => {
                for (const [fi, w, h, px] of viewItems) {
                    row.push({ si, vi, fi, x, w, h, px });
                    x += w * sc + SHEET_FRAME_GAP;
                }
                x += SHEET_VIEW_GAP - SHEET_FRAME_GAP;
            });
            sheetW = Math.max(sheetW, x - SHEET_VIEW_GAP);
            const rowH = Math.max(...row.map((it) => it.h)) * sc;
            for (const it of row)
                layout.push({ ...it, py: y + rowH - it.h * sc });
            y += rowH + SHEET_ROW_GAP;
        });
        const sheetH = Math.max(1, y - SHEET_ROW_GAP);
        const sheet = new Uint8Array(sheetW * sheetH * 3);
        for (let i = 0; i < sheetW * sheetH; i++)
            sheet.set(SHEET_BG, i * 3);
        for (const { si, vi, fi, x, w, h, px, py } of layout) {
            for (let iy = 0; iy < h; iy++)
                for (let ix = 0; ix < w; ix++) {
                    const v = px[iy * w + ix]!;
                    if (v === 0)
                        continue;
                    const c = rgb[v]!;
                    for (let dy = 0; dy < sc; dy++)
                        for (let dx = 0; dx < sc; dx++)
                            sheet.set(c, ((py + iy * sc + dy) * sheetW + (x + ix * sc + dx)) * 3);
                }
            panels.push({ frame: fi, h: h * sc, state: si, view: vi, w: w * sc, x, y: py });
        }
        const contactRel = `contact_${name}.png`;
        ctx.writeBytes(`${OUT_DIR}/${contactRel}`, encodePng({ width: sheetW, height: sheetH, mode: "RGB", pixels: sheet, level: 9 }), { ...palArgs, set: "contact_sheet", bank: name });
        const lab = LABELS[name] ?? [`enemy type ${etype} (its live and corpse records both point here)`, "the enemy descriptor tables at 0xAB0C and 0xAC88"];
        const [label, source] = lab;
        const distinct = referenced.size;
        const atlas = {
            anim_lut: "anim_lut.json",
            bank_rom_offset: hex(off),
            bytes: p.pool_end - off,
            cell_pool: {
                cell_bytes: CELL_BYTES, columns: POOL_COLUMNS, end_rom_offset: hex(p.pool_end), png: poolRel, referenced_slots: distinct,
                rom_offset: hex(pool), sha256_rom: sha256Hex(rom.bytesAt(pool, p.pool_end - pool)), slots: slotsN, unreferenced_slots: unref,
            },
            code_sites: [...(stores.get(off) ?? [])].sort((a, b) => a - b).map(hex),
            composite_sites: [...(comps.get(off) ?? [])].sort((a, b) => a - b).map(hex),
            contact_sheet: {
                background: [...SHEET_BG], height: sheetH, panels, png: contactRel, scale: SHEET_SCALE, transparent_index: 0, width: sheetW,
                note: "RGB; one row per state; views left to right, separated by a wider gap; frames bottom-aligned; index 0 shown as the background",
            },
            counts: { cells: nCells, distinct_cells: distinct, frames: nFrames, states: p.count, views: nViews },
            descriptor_records: descriptors.get(name) ?? [],
            format: FORMAT,
            label,
            ...(source !== null ? { label_source: source } : {}),
            name,
            palette,
            rules: rules(),
            states: statesOut,
            structure: { bytes: pool - off, end_rom_offset: hex(pool), rom_offset: hex(off) },
            type: etype,
            type_alias: alias,
        };
        ctx.writeJson(`${OUT_DIR}/${name}.json`, atlas, { set: "atlas", bank: name });
        bankRows.push({
            atlas: `${name}.json`, bank_rom_offset: hex(off), bytes: p.pool_end - off,
            cells: nCells, contact_sheet: contactRel, distinct_cells: distinct,
            end_rom_offset: hex(p.pool_end), frames: nFrames, label, name,
            pool_bytes: p.pool_end - pool, pool_slots: slotsN, states: p.count,
            structure_bytes: pool - off, type: etype, type_alias: alias,
            unreferenced_slots: unref.length, view_modes: [...new Set(p.states.map((s) => s.mode))].sort((a, b) => a - b),
            views: nViews, views_per_state: p.states.map((s) => s.mode),
        });
        ctx.say(`sprites: ${name}: ${p.count} states, ${nViews} views, ${nFrames} frames, ${nCells} cells (${distinct} distinct of ${slotsN} pool slots) from ${hex(off)}`);
    }
    if (rt.equal !== rt.frames || rt.cells_equal !== rt.cells || rt.pool_slots_equal !== rt.pool_slots)
        throw new Error(`PNG round trip failed: ${JSON.stringify(rt)}`);
    const lut: number[][] = [];
    for (let r = 0; r < LUT_ROWS; r++)
        lut.push(Array.from(rom.bytesAt(LUT_ROM + LUT_COLS * r, LUT_COLS)));
    lut.forEach((row, r) => {
        if (Math.min(...row) < 1 || Math.max(...row) !== r + 1)
            throw new Error(`animation table row ${r} holds values outside 1..${r + 1}`);
    });
    const lutDoc = {
        columns: LUT_COLS, format: FORMAT_LUT, rom_offset: hex(LUT_ROM), rows: LUT_ROWS,
        row_frame_counts: Array.from({ length: LUT_ROWS }, (_, r) => r + 1),
        rule: ANIM_RULE,
        values: lut,
        notes: [
            "row K-1 serves a view whose highest frame number is K; its values run 1..K, so frame 0 (the standing frame) is never picked by the table",
            "the column is (acc >> 3) & 31 of the 16-bit accumulator: one pass over a row takes 256 units of accumulated speed",
            "the table is embedded in the rasterizer's code, which branches over it",
        ],
    };
    ctx.writeJson(`${OUT_DIR}/anim_lut.json`, lutDoc, { set: "anim_lut" });
    const sumOf = (k: string): number => bankRows.reduce((a, b) => a + (b[k] as number), 0);
    const totals: Record<string, number> = {};
    for (const k of ["states", "views", "frames", "cells", "bytes"])
        totals[k] = sumOf(k);
    let storeSites = 0, compSites = 0;
    for (const v of stores.values())
        storeSites += v.length;
    for (const v of comps.values())
        compSites += v.length;
    const index = {
        anim_lut: "anim_lut.json",
        audit: {
            checked_ranges: ranges,
            known_assets: known.map(([n, a, b]) => ({ end_rom_offset: hex(b), name: n, rom_offset: hex(a) })),
            note: "every bank range and every cell-art range checked against the ROM size, its own pool, the other banks and the known neighbouring assets",
        },
        banks: bankRows,
        code_checks: codeChecks,
        format: FORMAT_INDEX,
        notes: [
            "The bank set is read from the ROM: the ten live and ten corpse descriptor records (each pair names " +
                "the same bank), plus every art-pointer store and every composite-renderer jump in the code below " +
                "0x20000; the command fails if that set differs from its table.",
            "composite_sites are code sites that load a bank's address and jump to the composite renderer: 21 " +
                "sites, 14 of them entries of the item dispatch table (see the items command); the other 7 " +
                "(0x116AA..0x11722, frame 0 of state 0 of seven enemy banks) are named by no dispatch-table slot.",
            "Corpses have no banks of their own: corpse record i points at the bank of live record i.",
            "View modes 2 and 8 are implemented by the rasterizer but used by no bank.",
            "Frame PNGs are at native size (32 px per cell); the game scales each cell to cw x ch (see the " +
                "atlas rules). Frames with w_num != h_num are drawn with a different aspect.",
            "The round trip decodes every PNG this run wrote, re-packs each cell (undoing its flip) and compares " +
                "the bytes with the ROM; the pool PNGs are checked the same way.",
        ],
        palette,
        region: { bytes: regionEnd - offsets[0]!, contiguous, end_rom_offset: hex(regionEnd), rom_offset: hex(offsets[0]!) },
        roundtrip: rt,
        scan: { art_pointer_store_sites: storeSites, composite_entry_sites: compSites, end_rom_offset: hex(CODE_SCAN_END) },
        totals,
        warnings: warningsSorted,
    };
    ctx.writeJson(`${OUT_DIR}/index.json`, index, { set: "index" });
    for (const w of warningsSorted)
        ctx.say("sprites: warning: " + w);
    ctx.say(`sprites: ${bankRows.length} banks, ${rt.frames} frames, round trip ${rt.equal}/${rt.frames} frames equal, ${warningsSorted.length} warning(s), ${ctx.files.size} files`);
}
export const sprites: Command = {
    name: "sprites",
    run(ctx: Context, _options: Record<string, unknown>) {
        run(ctx);
    },
};

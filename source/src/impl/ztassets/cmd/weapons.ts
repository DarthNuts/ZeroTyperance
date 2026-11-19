import type { Command, Context } from "../core.js";
import { encodePng } from "../png.js";
import { sha256Hex } from "../../boot/sha256.js";
const FORMAT = "ztassets-weapons/1";
const OUT_DIR = "weapons";
const TILE_BYTES = 32;
const PAL_ROM = 0x20f2;
const PAL_LINE = 1;
const VRAM_TILE_BASE = 0x500;
const HAND_TABLE = 0x11c98;
const HAND_IDS = 15;
const DRAW_TABLE = 0x11d0c;
const FIRE_ROUTINE = 0x12a70;
const DMA_PARAMS: ReadonlyArray<readonly [
    number,
    number,
    number
]> = [[0x11c8a, 0x3a3c, 0xa000], [0x11c8e, 0x3c3c, 0x0150]];
const DMA_WORDS = 0x150;
const MESSAGE_TABLE = 0x1ef14;
const BLOCK_START = 0x16c038;
const BLOCK_END = 0x16da58;
const KICK = 0x16c038;
const KICK_BYTES = 640;
const ART_BYTES = 672;
const KICK_SITE = 0x11fbe;
const FISTS = 0x16c2b8;
const FISTS_SITE = 0x11fdc;
const SWING_TABLE = 0x1219a;
const SWING_SECOND = 0x1222a;
const THROW_TABLE = 0x11f14;
const GRENADE = 0x16cd38;
type Part = readonly [
    string,
    number,
    number,
    number,
    string
];
const EFFECT = "3x3 sprite drawn on fire-animation frame 2 (a muzzle effect), a few pixels up and left of the main sprite";
const PARTS = new Map<number, readonly Part[]>([
    [0x16c038, [["main", 0, 0x0f00, 0xa500, "4x4 sprite: the kick (swing middle frame)"],
            ["strip", 16, 0x0c00, 0xa510, "4x1 sprite: first and last swing frames"]]],
    [0x16c2b8, [["main", 0, 0x0b00, 0xa500, "3x4 sprite: a fist (idle, and the melee swings)"],
            ["second", 12, 0x0a00, 0xa50c, "3x3 sprite placed 32 pixels below the fist in the swings of directions 4 and 5"]]],
    [0x16c558, [["main", 0, 0x0b00, 0xa500, "3x4 sprite: the weapon in hand"], ["effect", 12, 0x0a00, 0xa50c, EFFECT]]],
    [0x16c7f8, [["main", 0, 0x0b00, 0xa500, "3x4 sprite: the tool in hand"],
            ["effect", 12, 0x0a00, 0xa50c, "3x3 sprite drawn while firing, flipped by the frame count"]]],
    [0x16ca98, [["main", 0, 0x0b00, 0xa500, "3x4 sprite: the weapon in hand"], ["effect", 12, 0x0a00, 0xa50c, EFFECT]]],
    [0x16cd38, [["main", 0, 0x0b00, 0xa500, "3x4 sprite: the grenade in hand (idle and throw frames 0-2)"],
            ["second", 12, 0x0a00, 0xa50c, "3x3 sprite: the throw frames 3 and 4"]]],
    [0x16cfd8, [["main", 0, 0x0b00, 0xa500, "3x4 sprite: the weapon in hand"], ["effect", 12, 0x0a00, 0xa50c, EFFECT]]],
    [0x16d278, [["main", 0, 0x0e00, 0xa500, "4x3 sprite: the weapon in hand"], ["effect", 12, 0x0a00, 0xa50c, EFFECT]]],
    [0x16d518, [["main", 0, 0x0b00, 0xa500, "3x4 sprite: the weapon in hand"], ["effect", 12, 0x0a00, 0xa50c, EFFECT]]],
    [0x16d7b8, [["main", 0, 0x0b00, 0xa500, "3x4 sprite: the weapon in hand"]]],
]);
const UNREFERENCED = new Map<number, number[]>([[0x16d7b8, Array.from({ length: 9 }, (_, i) => 12 + i)]]);
const ORIGIN = new Map<number, readonly [
    number,
    number
]>([
    [0x16c558, [0x118, 0xd9]], [0x16c7f8, [0x114, 0xd9]], [0x16ca98, [0x114, 0xd9]], [0x16cfd8, [0x114, 0xd9]],
    [0x16d278, [0x120, 0xe1]], [0x16d518, [0x114, 0xd9]], [0x16d7b8, [0x114, 0xd9]], [0x16cd38, [0x134, 0xe8]],
]);
const COLS = new Map<number, number>([[640, 5], [672, 7]]);
const EXTERNAL = new Map<number, {
    attr_base_word: number;
    tiles: number;
    note: string;
}>([
    [0x16c558, {
            attr_base_word: 0xa354, tiles: 5,
            note: "depth-shaded muzzle glow: 8x8 sprites 0x354..0x358, which are not in the hand graphic (they are the HUD minimap bank's tiles 13..17)",
        }],
]);
const SHEET_BG = [40, 40, 56];
const SHEET_SCALE = 2;
const SHEET_GAP = 4;
const hex = (n: number): string => "0x" + n.toString(16).toUpperCase();
const hex4 = (n: number): string => "0x" + n.toString(16).toUpperCase().padStart(4, "0");
function cramToRgb(word: number): number[] {
    return [((word >> 1) & 7) * 36, ((word >> 5) & 7) * 36, ((word >> 9) & 7) * 36];
}
function decodeTile(raw: Uint8Array): Uint8Array {
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
function encodeTile(px: Uint8Array): Uint8Array {
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
function spritePixels(tiles: Uint8Array[], hs: number, vs: number): {
    w: number;
    h: number;
    px: Uint8Array;
} {
    if (tiles.length !== hs * vs)
        throw new Error(`a ${hs}x${vs} sprite needs ${hs * vs} tiles`);
    const w = hs * 8, h = vs * 8;
    const out = new Uint8Array(w * h);
    tiles.forEach((t, n) => {
        const gx = Math.floor(n / vs) * 8, gy = (n % vs) * 8;
        for (let y = 0; y < 8; y++)
            out.set(t.subarray(y * 8, y * 8 + 8), (gy + y) * w + gx);
    });
    return { w, h, px: out };
}
const satSize = (word: number): [
    number,
    number
] => [((word >> 10) & 3) + 1, ((word >> 8) & 3) + 1];
function flatPalette(rgb: number[][]): number[] {
    return rgb.flat();
}
function indexedPng(w: number, h: number, px: Uint8Array, rgb: number[][]): Uint8Array {
    return encodePng({ width: w, height: h, mode: "P", pixels: px, palette: flatPalette(rgb), bits: 4, level: 9 });
}
type Panel = [
    string,
    number,
    number,
    Uint8Array,
    number[][]
];
function contactSheet(rows: Panel[][]): {
    png: Uint8Array;
    w: number;
    h: number;
    info: unknown[];
} {
    const s = SHEET_SCALE;
    let y = 0;
    const placed: Array<[
        string,
        number,
        number,
        number,
        number,
        Uint8Array,
        number[][]
    ]> = [];
    let totalW = 0;
    for (const row of rows) {
        let x = 0, rowH = 0;
        for (const [name, w, h, px, rgb] of row) {
            placed.push([name, x, y, w, h, px, rgb]);
            x += w * s + SHEET_GAP;
            rowH = Math.max(rowH, h * s);
        }
        totalW = Math.max(totalW, x - SHEET_GAP);
        y += rowH + SHEET_GAP;
    }
    const totalH = y - SHEET_GAP;
    const buf = new Uint8Array(totalW * totalH * 3);
    for (let i = 0; i < totalW * totalH; i++)
        buf.set(SHEET_BG, i * 3);
    const info: unknown[] = [];
    for (const [name, px0, py0, w, h, px, rgb] of placed) {
        for (let sy = 0; sy < h * s; sy++) {
            const srow = Math.floor(sy / s) * w;
            let o = ((py0 + sy) * totalW + px0) * 3;
            for (let x = 0; x < w; x++) {
                const v = px[srow + x]!;
                const c = v ? rgb[v]! : SHEET_BG;
                for (let k = 0; k < s; k++) {
                    buf[o++] = c[0]!;
                    buf[o++] = c[1]!;
                    buf[o++] = c[2]!;
                }
            }
        }
        info.push({ h: h * s, name, w: w * s, x: px0, y: py0 });
    }
    return { png: encodePng({ width: totalW, height: totalH, mode: "RGB", pixels: buf, level: 9 }), w: totalW, h: totalH, info };
}
function messageName(text36: string): string {
    let rows = [0, 1, 2, 3].map((i) => text36.slice(i * 9, (i + 1) * 9).trim());
    if (rows.length && rows[rows.length - 1] === "COLLECTED")
        rows.pop();
    rows = rows.filter((r) => r);
    let out = "";
    for (const r of rows) {
        if (out.endsWith("-"))
            out = out.slice(0, -1) + r;
        else
            out = out ? out + " " + r : r;
    }
    return out.replaceAll("COLLECTED", "").trim();
}
function wordsIn(ctx: Context, lo: number, hi: number, value: number): number[] {
    const r: number[] = [];
    for (let o = lo; o < hi - 1; o += 2)
        if (ctx.rom.u16be(o) === value)
            r.push(o);
    return r;
}
function addiSites(ctx: Context, lo: number, hi: number, reg: number, imm: number): number[] {
    const r: number[] = [];
    for (let o = lo; o < hi - 3; o += 2)
        if (ctx.rom.u16be(o) === 0x0640 + reg && ctx.rom.u16be(o + 2) === imm)
            r.push(o);
    return r;
}
interface SpriteRec {
    attr_word: string;
    hflip: boolean;
    palette_line: number;
    priority: boolean;
    rom_offset: string;
    sat_x: number;
    sat_y: number;
    size_word: string;
    tile_offset: number;
    tiles_h: number;
    tiles_w: number;
    vflip: boolean;
}
function decodeSpriteRecord(ctx: Context, off: number): SpriteRec {
    const [y, size, attr, x] = [0, 1, 2, 3].map((i) => ctx.rom.u16be(off + 2 * i)) as [
        number,
        number,
        number,
        number
    ];
    const [w, h] = satSize(size);
    return {
        attr_word: hex4(attr), hflip: !!(attr & 0x800), palette_line: (attr >> 13) & 3, priority: !!(attr & 0x8000),
        rom_offset: hex(off), sat_x: x, sat_y: y, size_word: hex4(size & 0xff00), tile_offset: (attr & 0x7ff) - VRAM_TILE_BASE,
        tiles_h: h, tiles_w: w, vflip: !!(attr & 0x1000),
    };
}
const eq = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
export const weapons: Command = {
    name: "weapons",
    run(ctx: Context, _options: Record<string, unknown>) {
        const rom = ctx.rom;
        let nRecords = 0;
        const count = (): void => { nRecords++; };
        for (const [site, opcode, value] of DMA_PARAMS) {
            if (rom.u16be(site) !== opcode || rom.u16be(site + 2) !== value)
                throw new Error(`DMA parameter at ${hex(site)} is not as expected`);
        }
        for (const [site, art] of [[KICK_SITE, KICK], [FISTS_SITE, FISTS]] as const) {
            if (rom.u16be(site) !== 0x283c || rom.u32be(site + 2) !== art)
                throw new Error(`no 'move.l #${hex(art)},d4' at ${hex(site)}`);
        }
        const words = Array.from({ length: 16 }, (_, i) => rom.u16be(PAL_ROM + (PAL_LINE * 16 + i) * 2));
        const rgb = words.map(cramToRgb);
        const palArgs = { palette_rom: hex(PAL_ROM), palette_line: PAL_LINE };
        const sources = Array.from({ length: HAND_IDS }, (_, i) => rom.u32be(HAND_TABLE + 4 * i));
        const draw = Array.from({ length: HAND_IDS }, (_, i) => rom.u32be(DRAW_TABLE + 4 * i));
        const idsOf = new Map<number, number[]>();
        sources.forEach((s, i) => { if (!idsOf.has(s))
            idsOf.set(s, []); idsOf.get(s)!.push(i); });
        const arts = [...new Set([...idsOf.keys(), KICK])].sort((a, b) => a - b);
        if (arts[0] !== BLOCK_START)
            throw new Error(`the hand block does not start at ${hex(BLOCK_START)}`);
        const ends = [...arts.slice(1), BLOCK_END];
        const sizes = new Map<number, number>(arts.map((a, i) => [a, ends[i]! - a]));
        if (sizes.get(KICK) !== KICK_BYTES || arts.some((a) => a !== KICK && sizes.get(a) !== ART_BYTES))
            throw new Error("unexpected graphic sizes");
        const partKeys = [...PARTS.keys()].sort((a, b) => a - b);
        if (arts.length !== partKeys.length || arts.some((a, i) => a !== partKeys[i]))
            throw new Error("graphics differ from the part table");
        const routines = [...new Set([...draw, FIRE_ROUTINE])].sort((a, b) => a - b);
        const routineRange = (entry: number): [
            number,
            number
        ] => [entry, routines[routines.indexOf(entry) + 1]!];
        const swing: unknown[] = [];
        const allRecs: SpriteRec[] = [];
        const used: Record<string, Set<string>> = { kick: new Set(), fists: new Set(), grenade: new Set() };
        for (let d = 0; d < 6; d++) {
            const frames: SpriteRec[][] = [];
            for (let f = 0; f < 3; f++) {
                const sprites = [decodeSpriteRecord(ctx, SWING_TABLE + 24 * d + 8 * f)];
                if (d >= 4)
                    sprites.push(decodeSpriteRecord(ctx, SWING_SECOND + 24 * (d - 4) + 8 * f));
                frames.push(sprites);
                for (const sp of sprites) {
                    allRecs.push(sp);
                    used[d < 2 ? "kick" : "fists"]!.add(`${sp.tile_offset},${sp.tiles_w},${sp.tiles_h}`);
                }
            }
            swing.push({ art: d < 2 ? "kick" : "fists", direction: d, frames });
        }
        const throwFrames = Array.from({ length: 5 }, (_, k) => decodeSpriteRecord(ctx, THROW_TABLE + 8 * k));
        for (const sp of throwFrames) {
            allRecs.push(sp);
            used["grenade"]!.add(`${sp.tile_offset},${sp.tiles_w},${sp.tiles_h}`);
        }
        for (const rec of allRecs) {
            if (rec.palette_line !== PAL_LINE || !rec.priority)
                throw new Error(`a swing/throw record is not palette line ${PAL_LINE} + priority`);
        }
        const entries: unknown[] = [];
        const panelRows: Panel[][] = [];
        for (const art of arts) {
            const ids = idsOf.get(art) ?? [];
            let name: string, evid: string;
            if (art === KICK) {
                name = "kick";
                evid = "documentation name; the ROM only shows this is the graphic swapped in for the low melee swing";
            }
            else if (ids.length > 1) {
                name = "fists";
                evid = `item ids [${ids.join(", ")}] share this graphic; those with a draw routine use the melee routine, the others draw nothing`;
            }
            else {
                const mptr = rom.u32be(MESSAGE_TABLE + 4 * ids[0]!);
                const text = Array.from(rom.bytesAt(mptr, 36), (b) => String.fromCharCode(b)).join("");
                name = messageName(text).toLowerCase().replaceAll(" ", "_");
                evid = `rom_message_table (item id ${ids[0]})`;
            }
            const nbytes = sizes.get(art)!;
            const raw = rom.bytesAt(art, nbytes);
            const n = nbytes / TILE_BYTES;
            const tiles = Array.from({ length: n }, (_, i) => decodeTile(raw.subarray(i * TILE_BYTES, (i + 1) * TILE_BYTES)));
            const back = new Uint8Array(nbytes);
            tiles.forEach((t, i) => back.set(encodeTile(t), i * TILE_BYTES));
            if (!eq(back, raw))
                throw new Error(`${name} does not survive its own pack/unpack round trip`);
            const cols = COLS.get(nbytes)!;
            const { w, h, px } = gridPixels(tiles, cols);
            if (cols * (h / 8) !== n)
                throw new Error(`tile sheet of ${name} has padding`);
            const rel = `${name}_tiles.png`;
            ctx.writeBytes(`${OUT_DIR}/${rel}`, indexedPng(w, h, px, rgb), { ...palArgs, rom_offset: hex(art), set: name });
            count();
            const real = (ids.length ? ids : [0]).filter((i) => rom.u16be(draw[i]!) !== 0x4e75);
            const routine = draw[real[0]!]!;
            if (real.some((i) => draw[i] !== routine))
                throw new Error(`${name}: item ids use different draw routines`);
            const [lo, hi] = routineRange(routine);
            const parts: unknown[] = [];
            const partPanels: Panel[] = [];
            for (const [pname, toff, sizeWord, attrWord, role] of PARTS.get(art)!) {
                const [tw, th] = satSize(sizeWord);
                if (toff + tw * th > n || (attrWord & 0x7ff) - VRAM_TILE_BASE !== toff)
                    throw new Error(`${name}/${pname}: attribute word does not point at tile ${toff}`);
                if (((attrWord >> 13) & 3) !== PAL_LINE || !(attrWord & 0x8000))
                    throw new Error(`${name}/${pname}: attribute word is not palette line + priority`);
                const sizeSites = wordsIn(ctx, lo, hi, sizeWord);
                const attrSites = wordsIn(ctx, lo, hi, attrWord);
                if (!sizeSites.length || !attrSites.length)
                    throw new Error(`${name}/${pname}: size or attribute word not found in the routine at ${hex(routine)}`);
                const sp = spritePixels(tiles.slice(toff, toff + tw * th), tw, th);
                const prel = `${name}_${pname}.png`;
                ctx.writeBytes(`${OUT_DIR}/${prel}`, indexedPng(sp.w, sp.h, sp.px, rgb), { ...palArgs, rom_offset: hex(art), set: name, part: pname });
                count();
                partPanels.push([`${name}_${pname}`, sp.w, sp.h, sp.px, rgb]);
                parts.push({
                    anchor: { x: sp.w >> 1, y: sp.h }, anchor_kind: "bottom-center",
                    attr_word: hex4(attrWord), bytes: tw * th * TILE_BYTES, height: sp.h,
                    name: pname, palette_line: PAL_LINE, png: prel,
                    rom_sites: { attr_word: attrSites.slice(0, 6).map(hex), size_word: sizeSites.slice(0, 6).map(hex) },
                    role, sha256_pixels: sha256Hex(sp.px),
                    size_word: hex4(sizeWord), tile_offset: toff, tile_order: "column-major",
                    tiles: tw * th, tiles_h: th, tiles_w: tw, width: sp.w,
                });
            }
            panelRows.push(partPanels);
            const entry: Record<string, unknown> = {
                anchor: { x: 0, y: 0 }, anchor_kind: "top-left", bytes: nbytes, columns: cols,
                height: h, item_ids: ids, name, name_evidence: evid, parts,
                png: rel, rom_offset: hex(art), routine_rom_offset: hex(routine), rows: h / 8,
                sha256_pixels: sha256Hex(px), sha256_rom: sha256Hex(raw),
                tiles: n, width: w, dma_window_bytes: DMA_WORDS * 2,
            };
            const org = ORIGIN.get(art);
            if (org) {
                const [ox, oy] = org;
                const xs = addiSites(ctx, lo, hi, 1, ox), ys = addiSites(ctx, lo, hi, 0, oy);
                if (!xs.length || !ys.length)
                    throw new Error(`${name}: sprite origin not found in the routine at ${hex(routine)}`);
                entry["sat_origin"] = {
                    note: "main sprite top-left in sprite coordinates = origin + (horizontal bob, raise + vertical bob); screen pixel = sprite coordinate - 128",
                    rom_sites: { x: xs.slice(0, 3).map(hex), y: ys.slice(0, 3).map(hex) },
                    screen: { x: ox - 128, y: oy - 128 }, x: ox, y: oy,
                };
            }
            if (UNREFERENCED.has(art))
                entry["unreferenced_tiles"] = UNREFERENCED.get(art);
            const ext = EXTERNAL.get(art);
            if (ext) {
                if (!wordsIn(ctx, lo, hi, ext.attr_base_word).length)
                    throw new Error(`${name}: external attribute word not found`);
                entry["external_tiles"] = { attr_base_word: hex4(ext.attr_base_word), note: ext.note, tiles: ext.tiles };
            }
            if (art === KICK) {
                entry["note"] = `the DMA copies ${DMA_WORDS * 2} bytes: tile 20 of the window is the first tile of the fists graphic and is not part of this graphic`;
            }
            entries.push(entry);
            ctx.say(`weapons: ${name}: ${n} tiles from ${hex(art)}, ${parts.length} part(s)`);
        }
        for (const [key, art] of [["kick", KICK], ["fists", FISTS], ["grenade", GRENADE]] as const) {
            const want = new Set(PARTS.get(art)!.map(([, t, sz]) => `${t},${satSize(sz).join(",")}`));
            for (const g of used[key]!)
                if (!want.has(g))
                    throw new Error(`${key} frame tables use sprites outside the parts`);
        }
        const sheet = contactSheet(panelRows);
        ctx.writeBytes(`${OUT_DIR}/contact_sheet.png`, sheet.png, { ...palArgs, set: "contact_sheet" });
        count();
        const index = {
            contact_sheet: {
                background: [...SHEET_BG], height: sheet.h, panels: sheet.info, png: "contact_sheet.png",
                scale: SHEET_SCALE, transparent_index: 0, width: sheet.w,
                note: "RGB; index 0 is shown as the background; one row per weapon, ROM order",
            },
            dma: {
                destination_tile: VRAM_TILE_BASE, destination_vram: "0xA000", table_rom_offset: hex(HAND_TABLE),
                table: Array.from({ length: HAND_IDS }, (_, i) => ({ draw_routine: hex(draw[i]!), item_id: i, source: hex(sources[i]!) })),
                words: DMA_WORDS,
                kick_code_rom_offset: hex(KICK_SITE), fists_code_rom_offset: hex(FISTS_SITE),
            },
            entries,
            format: FORMAT,
            notes: [
                "The hand graphics are hardware-sprite tiles, not billboard art: the weapon routine DMAs " +
                    "672 bytes to VRAM tile 0x500 and queues sprites with attribute words 0xA500.. (priority, " +
                    "palette line 1).",
                "Sprite tiles are numbered column-major; the *_tiles.png sheets are plain ROM-order tile " +
                    "grids, the <name>_<part>.png files are the assembled sprites.",
                "Item id 2 (MINE) has no draw routine of its own (an immediate return); ids 0, 1, 2, 3, 5, 6 " +
                    "and 9 all select the fists graphic.",
                "The ROM data layout lists three graphics (0x16C038, 0x16C558, 0x16CD38); the block holds ten, " +
                    "6688 bytes up to 0x16DA58, where the HUD level-entry tile bank starts.",
            ],
            palette: {
                cram_words: words.map(hex4), line: PAL_LINE,
                rgb: rgb.map((c) => [...c]), rom_offset: hex(PAL_ROM),
                evidence: "every sprite attribute word is 0xA5xx / 0xAD..: bits 14..13 = 1, i.e. CRAM " +
                    "line 1 of the maze table (identical in 0x21F2; under night vision the game " +
                    "loads the green tables at 0x2072/0x2172, whose line 1 differs)",
            },
            swing_frames: swing,
            swing_table_rom_offset: hex(SWING_TABLE), swing_second_table_rom_offset: hex(SWING_SECOND),
            throw_frames: throwFrames, throw_table_rom_offset: hex(THROW_TABLE),
        };
        ctx.writeJson(`${OUT_DIR}/weapons.json`, index, { set: "index" });
        nRecords++;
        ctx.say(`weapons: ${entries.length} graphics, ${nRecords} files`);
    },
};

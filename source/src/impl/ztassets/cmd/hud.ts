import type { Command, Context, RomFile } from "../core.js";
import { encodePng } from "../png.js";
import { sha256Hex } from "../../boot/sha256.js";
const FORMAT = "ztassets-hud/1";
const OUT_DIR = "hud";
const TILE_BYTES = 32;
const PAL_ROM = 0x20f2;
const PAL_LINE = 3;
const COCKPIT_CALL = 0x2a3e;
const COCKPIT_DESC = 0x1563e6;
const COCKPIT_VRAM = 0x6b20;
const COCKPIT_BASE_FLAGS = 0xe000;
const FRAME_TILES = 172;
const FRAME_COLS = 16;
const HEALTH_BAR_CELLS: ReadonlyArray<readonly [
    number,
    number
]> = [[37, 9], [38, 9]];
const HEALTH_BAR_TILES = [60, 61];
type Bank = readonly [
    string,
    number,
    number,
    number,
    readonly [
        number,
        number,
        number
    ],
    string
];
const BANKS: readonly Bank[] = [
    ["minimap", 0x15822e, 18, 9, [0x2bba, 0x2bc4, 0x2bca], "scanner grid cell tiles, player blip and enemy blip frames"],
    ["bank_16da58", 0x16da58, 48, 12, [0x2bd8, 0x2be2, 0x2be8], "tile bank the HUD rebuild loads after the weapon-hand tiles; its consumer is not identified"],
    ["bank_16e058", 0x16e058, 46, 12, [0x26ba, 0x26c4, 0x26ca], "tile bank the rooftop-sniper map trigger loads (sniper / fire effect art)"],
];
const VRAM_TILE: Record<string, number> = { minimap: 0x347, bank_16da58: 0x515, bank_16e058: 0x545 };
const range = (a: number, b: number): number[] => Array.from({ length: b - a }, (_, i) => a + i);
const MINIMAP_ROLES = [
    { role: "10 x 10 scanner grid cells: name-table word 0xE347 + the cell's display class (0..7)", tiles: range(0, 8) },
    { role: "player / marker blip, pulsing: the blink table (words 0xE34F,0xE350,0xE351,0xE352," +
            "0xE353,0xE352,0xE351,0xE350 at ROM 0xE956 and 0xEB4A) steps through these five", tiles: range(8, 13) },
    { role: "enemy blips: the blink table word + 5", tiles: range(13, 18) },
];
const BLINK_TABLES = [0xe956, 0xeb4a];
const BLINK_WORDS = [0xe34f, 0xe350, 0xe351, 0xe352, 0xe353, 0xe352, 0xe351, 0xe350];
const GRID_WORD_SITES = [0xe920, 0xeb24];
const GRID_WORD = 0xe347;
const ENEMY_BLIP_SITE = 0xe94a;
const CARD_TABLE = 0x10ac8;
const CARD_BASE = 0x15846e;
const CARD_BYTES = 0x200;
const CARD_COUNT = 14;
const CARD_VRAM_BASE = 0x9600;
const DIGIT_AREA = { h: 6, w: 8, x: 0, y: 26 };
const MESSAGE_TABLE = 0x1ef14;
const AMMO_DIGITS = 0x15a06e;
const AMMO_BYTES = 120;
const AMMO_ROWS = 6;
const AMMO_GLYPH_W = 4;
const SHEET_BG: readonly [
    number,
    number,
    number
] = [40, 40, 56];
const SHEET_SCALE = 2;
const SHEET_MAX_WIDTH = 700;
const SHEET_GAP = 4;
type Rgb = readonly [
    number,
    number,
    number
];
type Panel = readonly [
    string,
    number,
    number,
    Uint8Array,
    readonly Rgb[]
];
type Obj = Record<string, unknown>;
const hex = (n: number): string => "0x" + n.toString(16).toUpperCase();
const hex4 = (n: number): string => n.toString(16).toUpperCase().padStart(4, "0");
function cramToRgb(word: number): Rgb {
    return [((word >> 1) & 7) * 36, ((word >> 5) & 7) * 36, ((word >> 9) & 7) * 36];
}
function decodeTile(raw: Uint8Array): Uint8Array {
    if (raw.length !== TILE_BYTES)
        throw new Error(`a tile is ${TILE_BYTES} bytes`);
    const px = new Uint8Array(64);
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 4; c++) {
            const b = raw[r * 4 + c]!;
            px[r * 8 + 2 * c] = b >> 4;
            px[r * 8 + 2 * c + 1] = b & 15;
        }
    return px;
}
function encodeTile(px: Uint8Array): Uint8Array {
    const out = new Uint8Array(32);
    for (let k = 0; k < 32; k++)
        out[k] = (px[2 * k]! << 4) | px[2 * k + 1]!;
    return out;
}
function gridPixels(tiles: Uint8Array[], cols: number): [
    number,
    number,
    Uint8Array
] {
    const rows = Math.floor((tiles.length + cols - 1) / cols);
    const w = cols * 8;
    const out = new Uint8Array(w * rows * 8);
    tiles.forEach((t, i) => {
        const gx = (i % cols) * 8, gy = Math.floor(i / cols) * 8;
        for (let y = 0; y < 8; y++)
            out.set(t.subarray(y * 8, y * 8 + 8), (gy + y) * w + gx);
    });
    return [w, rows * 8, out];
}
function spritePixels(tiles: Uint8Array[], hs: number, vs: number): [
    number,
    number,
    Uint8Array
] {
    if (tiles.length !== hs * vs)
        throw new Error(`a ${hs}x${vs} sprite needs ${hs * vs} tiles`);
    const w = hs * 8, h = vs * 8;
    const out = new Uint8Array(w * h);
    tiles.forEach((t, n) => {
        const gx = Math.floor(n / vs) * 8, gy = (n % vs) * 8;
        for (let y = 0; y < 8; y++)
            out.set(t.subarray(y * 8, y * 8 + 8), (gy + y) * w + gx);
    });
    return [w, h, out];
}
function flipTile(t: Uint8Array, hflip: boolean, vflip: boolean): Uint8Array {
    const rows: Uint8Array[] = [];
    for (let y = 0; y < 8; y++)
        rows.push(t.slice(y * 8, y * 8 + 8));
    if (vflip)
        rows.reverse();
    const out = new Uint8Array(64);
    rows.forEach((r, y) => out.set(hflip ? r.reverse() : r, y * 8));
    return out;
}
function indexedPng(w: number, h: number, pixels: Uint8Array, rgb16: readonly Rgb[]): Uint8Array {
    const palette: number[] = [];
    for (const [r, g, b] of rgb16)
        palette.push(r, g, b);
    return encodePng({ width: w, height: h, mode: "P", pixels, palette, bits: 4, level: 9 });
}
function contactSheet(panels: readonly Panel[]): {
    png: Uint8Array;
    w: number;
    h: number;
    info: Obj[];
} {
    const s = SHEET_SCALE;
    let x = 0, y = 0, rowH = 0;
    const placed: Array<[
        string,
        number,
        number,
        number,
        number,
        Uint8Array,
        readonly Rgb[]
    ]> = [];
    for (const [name, w, h, px, rgb] of panels) {
        const pw = w * s, ph = h * s;
        if (x && x + pw > SHEET_MAX_WIDTH) {
            x = 0;
            y = y + rowH + SHEET_GAP;
            rowH = 0;
        }
        placed.push([name, x, y, w, h, px, rgb]);
        x += pw + SHEET_GAP;
        rowH = Math.max(rowH, ph);
    }
    const totalW = Math.max(...placed.map((p) => p[1] + p[3] * s));
    const totalH = y + rowH;
    const buf = new Uint8Array(totalW * totalH * 3);
    for (let i = 0; i < totalW * totalH; i++)
        buf.set(SHEET_BG, i * 3);
    const info: Obj[] = [];
    for (const [name, px0, py0, w, h, px, rgb] of placed) {
        const lut = range(0, 16).map((v) => (v ? rgb[v]! : SHEET_BG));
        for (let sy = 0; sy < h * s; sy++) {
            const base = Math.floor(sy / s) * w;
            let o = ((py0 + sy) * totalW + px0) * 3;
            for (let i = 0; i < w; i++) {
                const c = lut[px[base + i]!]!;
                for (let k = 0; k < s; k++) {
                    buf[o++] = c[0];
                    buf[o++] = c[1];
                    buf[o++] = c[2];
                }
            }
        }
        info.push({ h: h * s, name, w: w * s, x: px0, y: py0 });
    }
    return { png: encodePng({ width: totalW, height: totalH, mode: "RGB", pixels: buf, level: 9 }), w: totalW, h: totalH, info };
}
interface Loader {
    cmd_site: number;
    longwords: number;
    rom_offset: number;
    vram_address: number;
}
function readLoader(rom: RomFile, cmdSite: number, leaSite: number, cntSite: number): Loader {
    if (rom.u16be(cmdSite) !== 0x23fc || rom.u32be(cmdSite + 6) !== 0xc00004)
        throw new Error(`no 'move.l #cmd,$C00004.l' at ${hex(cmdSite)}`);
    const cmd = rom.u32be(cmdSite + 2);
    if (Math.floor(cmd / 2 ** 30) !== 1 || ((cmd >>> 4) & 0xf) !== 0)
        throw new Error(`command ${hex(cmd)} at ${hex(cmdSite)} is not a plain VRAM write`);
    const vram = ((cmd >>> 16) & 0x3fff) | ((cmd & 3) << 14);
    if (rom.u16be(leaSite) !== 0x41f9)
        throw new Error(`no 'lea.l abs,a0' at ${hex(leaSite)}`);
    const src = rom.u32be(leaSite + 2);
    if (rom.u16be(cntSite) !== 0x3e3c)
        throw new Error(`no 'move.w #n,d7' at ${hex(cntSite)}`);
    return { cmd_site: cmdSite, longwords: rom.u16be(cntSite + 2) + 1, rom_offset: src, vram_address: vram };
}
interface Call {
    art_vram: number;
    descriptor: number;
    flags: number;
    nametable_vram: number;
}
function readCockpitCall(rom: RomFile): Call {
    const s = COCKPIT_CALL;
    const got = [rom.u16be(s), rom.u16be(s + 4), rom.u16be(s + 8), rom.u16be(s + 12), rom.u16be(s + 16)];
    const want = [0x303c, 0x323c, 0x343c, 0x363c, 0x207c];
    if (got.some((g, i) => g !== want[i]))
        throw new Error(`the cockpit blitter call at ${hex(s)} is not the expected instruction sequence`);
    return { art_vram: rom.u16be(s + 2), descriptor: rom.u32be(s + 18), flags: rom.u16be(s + 14), nametable_vram: rom.u16be(s + 6) };
}
const PY_WS = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0]);
function pyStrip(s: string): string {
    let a = 0, b = s.length;
    while (a < b && PY_WS.has(s.charCodeAt(a)))
        a++;
    while (b > a && PY_WS.has(s.charCodeAt(b - 1)))
        b--;
    return s.slice(a, b);
}
function messageName(text36: string): string {
    let rows = range(0, 4).map((i) => pyStrip(text36.slice(i * 9, (i + 1) * 9)));
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
    return pyStrip(out.split("COLLECTED").join(""));
}
const words = (rom: RomFile, site: number, n: number): number[] => range(0, n).map((i) => rom.u16be(site + 2 * i));
function need(rom: RomFile, site: number, ...w: number[]): void {
    const got = words(rom, site, w.length);
    if (got.some((g, i) => g !== w[i]))
        throw new Error(`cockpit: ROM ${hex(site)} holds ${got.map(hex4).join(" ")}, expected ${w.map(hex4).join(" ")}`);
}
function imm16(rom: RomFile, site: number, opcode: number): number {
    if (rom.u16be(site) !== opcode)
        throw new Error(`cockpit: ROM ${hex(site)} holds opcode ${hex4(rom.u16be(site))}, expected ${hex4(opcode)}`);
    return rom.u16be(site + 2);
}
function imm32(rom: RomFile, site: number, opcode: number): number {
    if (rom.u16be(site) !== opcode)
        throw new Error(`cockpit: ROM ${hex(site)} holds opcode ${hex4(rom.u16be(site))}, expected ${hex4(opcode)}`);
    return rom.u32be(site + 2);
}
function vdpAddress(rom: RomFile, site: number): number {
    need(rom, site, 0x23fc);
    if (rom.u32be(site + 6) !== 0xc00004)
        throw new Error(`cockpit: no VDP command at ${hex(site)}`);
    const cmd = rom.u32be(site + 2);
    return ((cmd >>> 16) & 0x3fff) | ((cmd & 3) << 14);
}
function planeBCell(rom: RomFile, site: number): [
    number,
    number
] {
    const off = vdpAddress(rom, site) - 0xc000;
    if (!(off >= 0 && off < 0x2000) || (off & 1))
        throw new Error(`cockpit: the command at ${hex(site)} is not a plane B cell`);
    return [Math.floor((off % 128) / 2), Math.floor(off / 128)];
}
const cellOf = (vram: number): [
    number,
    number
] => [Math.floor(((vram - 0xc000) % 128) / 2), Math.floor((vram - 0xc000) / 128)];
const rowsHex = (ws: number[], cols: number): string[] => range(0, Math.floor(ws.length / cols)).map((r) => ws.slice(r * cols, (r + 1) * cols).map(hex4).join(" "));
function buildCockpit(rom: RomFile): Obj {
    const c: Obj = {};
    const call = readCockpitCall(rom);
    const d = COCKPIT_DESC;
    const [count, , cols, rows] = range(0, 4).map((i) => rom.u16be(d + 2 * i)) as [
        number,
        number,
        number,
        number
    ];
    const baseTile = call.art_vram >> 5;
    const nt = range(0, cols * rows).map((i) => (rom.u16be(d + 8 + 2 * i) + baseTile + call.flags) & 0xffff);
    c["frame"] = { art_tile: baseTile, cols, flags: call.flags, name_table: rowsHex(nt, cols), origin_cell: cellOf(call.nametable_vram), rows, tiles: count };
    const cell = planeBCell(rom, 0xd998);
    if (cell[0] !== HEALTH_BAR_CELLS[0]![0] || cell[1] !== HEALTH_BAR_CELLS[0]![1])
        throw new Error(`cockpit: the health read command names cell ${cell}`);
    const cap = imm16(rom, 0xd9da, 0x0c40);
    const scale = imm16(rom, 0xd9ea, 0xc0fc);
    need(rom, 0xd9ee, 0x5380);
    const divisor = imm16(rom, 0xd9f4, 0x80fc);
    if (scale !== 100 || divisor !== 100 || cap !== 100)
        throw new Error(`cockpit: health scale ${scale} / ${divisor} cap ${cap}`);
    const bands: Obj[] = [];
    for (const [siteCmp, siteCol] of [[0xd9fe, 0xd9f8], [0xda0a, 0xda04], [0xda16, 0xda10], [0xda22, 0xda1c]] as const) {
        bands.push({ above: imm16(rom, siteCmp, 0x0c40), colour_long: imm32(rom, siteCol, 0x223c) });
    }
    const lowest = imm32(rom, 0xda28, 0x223c);
    const bank = imm32(rom, 0xda2e, 0x207c);
    need(rom, 0xda36, 0xe89b);
    need(rom, 0xda38, 0x0c40, 0x000a);
    need(rom, 0xda42, 0xd0fc, 0x0020);
    need(rom, 0xda48, 0x2418, 0x8481, 0x2882, 0x2418, 0x8483, 0x2882);
    if (bank !== 0x16e618)
        throw new Error(`cockpit: health digit bank ${hex(bank)}`);
    c["health"] = {
        bands, bank_rom_offset: bank, cap, cells: HEALTH_BAR_CELLS.map((x) => [...x]), digit_bank: "fonts/hud_digits.png", divisor,
        lowest_colour_long: lowest,
        pct_rule: "pct = max(hp * scale - 1, 0) div divisor with hp clamped to 0..cap; the tens and the ones digit tile; " +
            "the colour long is the first band whose `above` is below pct, else lowest_colour_long",
        scale, tiles: HEALTH_BAR_TILES.map((t) => baseTile + t),
    };
    const ccell = planeBCell(rom, 0x1e028);
    const w0 = imm16(rom, 0x1e032, 0x0645);
    if (imm16(rom, 0x1e03c, 0x0646) !== w0)
        throw new Error("cockpit: the counter's digit words differ");
    need(rom, 0x1e01a, 0x0c46, 0x000a);
    need(rom, 0x2b04, 0x7eff, ...Array(8).fill(0x2887));
    const solidTile = vdpAddress(rom, 0x2afa) >> 5;
    const font = readLoader(rom, 0x2afa, 0x2b16, 0x2b1c);
    c["counter"] = { cell: ccell, digit_word_base: w0, rule: "two digits, tens then ones, by repeated subtraction of 10; word = digit_word_base + digit" };
    c["font"] = { bank: "fonts/hud_letters.png", first_tile: solidTile + 1, rom_offset: font.rom_offset, solid_tile: solidTile, tiles: Math.floor(font.longwords / 8) };
    need(rom, 0x2acc, 0x41fa, 0x01fa);
    const idTable = 0x2ace + 0x01fa;
    const clampMax = imm16(rom, 0x2ad4, 0x0c40);
    const artVram = imm16(rom, 0x2ae6, 0x303c);
    const nameVram = imm16(rom, 0x2aea, 0x323c);
    const flags = imm16(rom, 0x2af2, 0x363c);
    const artTile = artVram >> 5;
    const cards: Obj[] = [];
    for (let k = 0; k <= clampMax; k++) {
        const dsc = rom.u32be(idTable + 4 * k);
        const [n, off, ccols, crows] = range(0, 4).map((i) => rom.u16be(dsc + 2 * i)) as [
            number,
            number,
            number,
            number
        ];
        if (ccols !== 16 || crows !== 12)
            throw new Error(`cockpit: ID card ${k} is ${ccols} x ${crows} cells`);
        if (artTile + n > (CARD_VRAM_BASE >> 5))
            throw new Error(`cockpit: ID card ${k} art runs into the weapon cards`);
        const cwords = range(0, ccols * crows).map((i) => (rom.u16be(dsc + 8 + 2 * i) + artTile + flags) & 0xffff);
        cards.push({ art_rom_offset: dsc + off, character: k, descriptor_rom_offset: dsc, name_table: rowsHex(cwords, ccols), tiles: n, tiles_png: `tiles/charcard_${k}.png` });
    }
    c["id_card"] = { art_tile: artTile, cards, character_max: clampMax, cols: 16, flags, name_table_cell: cellOf(nameVram), pointer_table_rom_offset: idTable, rows: 12 };
    need(rom, 0x108e2, 0x0040, 0x0f00);
    const blocks = [[0x108e8, 0x108f8, 0x10914, 0x108fe], [0x1091a, 0x1092a, 0x10946, 0x10930], [0x1094c, 0x1095a, 0x10974, 0x10960],
        [0x1097a, 0x1098a, 0x109a6, 0x10990], [0x109ac, 0x109bc, 0x109d8, 0x109c2]] as const;
    const slots: Obj[] = [];
    for (const [siteRing, siteCmp, siteX, siteY] of blocks) {
        let ringOff: number;
        if (rom.u16be(siteRing) === 0x1228)
            ringOff = rom.u16be(siteRing + 2);
        else if (rom.u16be(siteRing) === 0x1210)
            ringOff = 0;
        else
            throw new Error(`cockpit: ring read at ${hex(siteRing)}`);
        need(rom, siteCmp, 0x0c02, 0x0003);
        slots.push({ ring_offset: ringOff, x_word: imm16(rom, siteX, 0x34fc), y_word: imm16(rom, siteY, 0x34fc) });
    }
    const attrBase = imm16(rom, 0x1090e, 0x0641);
    need(rom, 0x10a9a, 0x3028, 0x0002);
    need(rom, 0x10a9e, 0x5340);
    need(rom, 0x10aa0, 0xe048);
    need(rom, 0x10aa2, 0x5240);
    const before = imm16(rom, 0x10a90, 0x3c3c) + 1;
    const skip = imm16(rom, 0x10aaa, 0xd2fc);
    const after = imm16(rom, 0x10aae, 0x3c3c) + 1;
    if ((before + Math.floor(skip / 4) + after) * 4 !== CARD_BYTES)
        throw new Error(`cockpit: the card row is not ${CARD_BYTES} bytes`);
    const mask = imm16(rom, 0x1df60, 0x0240);
    need(rom, 0x1df64, 0x0c40, 0x000a);
    c["cards"] = {
        attr_base: attrBase, first_tile: CARD_VRAM_BASE >> 5, hidden_states: [1, 3], slots, sprite: { h: 4, w: 4 }, tiles_per_card: 16,
        digit: {
            amount_rule: "n = ((amount - 1) & 0xFFFF) >> 8, plus 1; n & mask; two digits, the tens digit blank when n < 10",
            byte_offset: before * 4, bytes: skip, mask, rows: AMMO_ROWS,
        },
        empty_slot: "an empty slot's 16 tiles hold zeros",
    };
    const clLo = imm16(rom, 0xe81a, 0x0c40), clHi = imm16(rom, 0xe82a, 0x0c40);
    if (imm16(rom, 0xe840, 0x0c40) !== clLo || imm16(rom, 0xe850, 0x0c40) !== clHi)
        throw new Error("cockpit: the two axes clamp differently");
    need(rom, 0xe8d4, 0x5b40);
    need(rom, 0xe8de, 0x5b40);
    const gridFirst = imm16(rom, 0xe8c6, 0x343c);
    const rowStep = imm16(rom, 0xe8ee, 0x0642);
    const nRows = imm16(rom, 0xe8e4, 0x3e3c) + 1;
    const nCols = imm16(rom, 0xe8e8, 0x3c3c) + 1;
    const gridWord = imm16(rom, 0xe91e, 0x0643);
    need(rom, 0xe238, 0x163b, 0x3004);
    const classTable = rom.bytesAt(0xe23e, 256);
    need(rom, 0xe93c, 0x0240, 0x0007);
    need(rom, 0xe868, 0x4a6e, 0x9062);
    const py = imm16(rom, 0xe974, 0x0640);
    const px = imm16(rom, 0xe998, 0x0642);
    need(rom, 0xe972, 0xea40);
    need(rom, 0xe996, 0xea42);
    const tickWord = imm16(rom, 0xe9c4, 0x34fc);
    if (imm16(rom, 0xe9f2, 0x34fc) !== tickWord || imm16(rom, 0xea20, 0x34fc) !== tickWord)
        throw new Error("cockpit: the compass tick words differ");
    need(rom, 0xe9b0, 0xec43);
    need(rom, 0xe9cc, 0xec43);
    need(rom, 0xe9de, 0xea43);
    need(rom, 0xe9fa, 0xea43);
    need(rom, 0xea0c, 0xe243);
    need(rom, 0xe99e, 0x082e, 0x0000, 0x8eb7);
    const rng = imm16(rom, 0xeb78, 0x0446);
    for (const [site, op] of [[0xeb7c, 0x0447], [0xeb80, 0x0643], [0xeb84, 0x0644]] as const) {
        if (imm16(rom, site, op) !== rng)
            throw new Error(`cockpit: enemy range at ${hex(site)}`);
    }
    need(rom, 0xeb88, 0x3028, 0x0004);
    const alive = imm16(rom, 0xeb8c, 0x0240);
    need(rom, 0xeb96, 0xb028, 0x0032);
    need(rom, 0xeb9c, 0x3028, 0x0020);
    need(rom, 0xeba0, 0x3228, 0x0022);
    need(rom, 0xebb8, 0xea41);
    need(rom, 0xebd0, 0xea40);
    const ey = imm16(rom, 0xebba, 0x0641);
    const ex = imm16(rom, 0xebd2, 0x0640);
    const my = imm16(rom, 0xeab4, 0x383c);
    const mx = imm16(rom, 0xeae4, 0x323c);
    need(rom, 0xeab8, 0x5a45);
    need(rom, 0xeb2c, 0x5041);
    need(rom, 0xeb32, 0x5044);
    const classes = [[imm16(rom, 0xeaf2, 0x0c03), imm16(rom, 0xeaf8, 0x0c03)], [imm16(rom, 0xeafe, 0x0c03), imm16(rom, 0xeb04, 0x0c03)]];
    need(rom, 0xeb5a, 0x342e, 0xa4e8);
    const firstOff = gridFirst + rowStep - 0xc000;
    c["scanner"] = {
        bio_scanner_path: "the grid is redrawn every tick and a marker blip is drawn for every window cell of a marker class when the player owns the bio scanner; " +
            "otherwise the grid is redrawn only when the camera cell changes or on the level-entry request",
        blink_words: [...BLINK_WORDS],
        class_display_table: { rom_offset: 0xe23e, values: Array.from(classTable) },
        clamp: { keep_low_byte: true, max: clHi, min: clLo },
        compass: { asr_shifts: [6, 5, 5], half_extra: [false, false, true], phase_bit: 0, tile_word: tickWord },
        enemy_blip: { alive_flag: alive, range: rng, shift: 5, tile_step: 5, x_offset: ex, y_offset: ey },
        grid: { base_word: gridWord, cols: nCols, first_cell: [Math.floor((firstOff % 128) / 2), Math.floor(firstOff / 128)], rows: nRows, window_before: 5 },
        marker: { classes, step: 8, tile_step: 5, x_start: mx, y_start: my },
        player_blip: { shift: 5, x_offset: px, y_offset: py },
        sprite_origin: 128,
    };
    return c;
}
export const hud: Command = {
    name: "hud",
    run(ctx: Context, _options: Record<string, unknown>) {
        const rom = ctx.rom;
        const records: unknown[] = [];
        const entries: Obj[] = [];
        const panels: Panel[] = [];
        const evidence: Obj = {};
        const palWords = range(0, 16).map((i) => rom.u16be(PAL_ROM + (PAL_LINE * 16 + i) * 2));
        const rgb = palWords.map(cramToRgb);
        const palArgs = { palette_rom: hex(PAL_ROM), palette_line: PAL_LINE };
        const addPng = (rel: string, w: number, h: number, px: Uint8Array, extra: Obj): void => {
            records.push(ctx.writeBytes(`${OUT_DIR}/${rel}`, indexedPng(w, h, px, rgb), { ...palArgs, ...extra }));
        };
        const addTileBank = (key: string, off: number, nbytes: number, cols: number, role: string): [
            Obj,
            Uint8Array[]
        ] => {
            const raw = rom.bytesAt(off, nbytes);
            const n = Math.floor(nbytes / TILE_BYTES);
            const tiles = range(0, n).map((i) => decodeTile(raw.subarray(i * TILE_BYTES, (i + 1) * TILE_BYTES)));
            const back = new Uint8Array(nbytes);
            tiles.forEach((t, i) => back.set(encodeTile(t), i * TILE_BYTES));
            if (back.some((b, i) => b !== raw[i]))
                throw new Error(`${key} does not survive its own pack/unpack round trip`);
            const [w, h, px] = gridPixels(tiles, cols);
            const rel = `${key}.png`;
            addPng(rel, w, h, px, { rom_offset: hex(off), set: key });
            panels.push([key, w, h, px, rgb]);
            const e: Obj = {
                anchor: { x: 0, y: 0 }, anchor_kind: "top-left", bytes: nbytes, columns: cols, height: h, name: key,
                padding_cells: cols * Math.floor(h / 8) - n, png: rel, role, rom_offset: hex(off), rows: Math.floor(h / 8),
                sha256_pixels: sha256Hex(px), sha256_rom: sha256Hex(raw), tiles: n, width: w,
            };
            entries.push(e);
            return [e, tiles];
        };
        const call = readCockpitCall(rom);
        if (call.art_vram !== COCKPIT_VRAM || call.flags !== COCKPIT_BASE_FLAGS || call.descriptor !== COCKPIT_DESC) {
            throw new Error(`cockpit blitter call differs from the expected constants: ${JSON.stringify(call)}`);
        }
        const d = COCKPIT_DESC;
        const [count, artOff, cols, rows] = range(0, 4).map((i) => rom.u16be(d + 2 * i)) as [
            number,
            number,
            number,
            number
        ];
        const art = d + artOff;
        if (count !== FRAME_TILES || cols !== 40 || rows !== 28)
            throw new Error(`cockpit descriptor: ${count} tiles, ${cols}x${rows} cells`);
        const [frameE, ftiles] = addTileBank("frame", art, count * TILE_BYTES, FRAME_COLS, "cockpit frame art (172 tiles)");
        const baseTile = COCKPIT_VRAM >> 5;
        const nt = range(0, cols * rows).map((i) => rom.u16be(d + 8 + 2 * i));
        const comp = new Uint8Array(cols * 8 * rows * 8);
        const cellPal = new Set<number>();
        nt.forEach((rawW, i) => {
            const word = (rawW + baseTile + COCKPIT_BASE_FLAGS) & 0xffff;
            const t = (word & 0x7ff) - baseTile;
            if (!(t >= 0 && t < count))
                throw new Error(`cockpit cell ${i} references tile ${t} outside the art`);
            cellPal.add((word >> 13) & 3);
            const px = flipTile(ftiles[t]!, !!(word & 0x0800), !!(word & 0x1000));
            const gx = (i % cols) * 8, gy = Math.floor(i / cols) * 8;
            for (let y = 0; y < 8; y++)
                comp.set(px.subarray(y * 8, y * 8 + 8), (gy + y) * cols * 8 + gx);
        });
        if (cellPal.size !== 1 || !cellPal.has(PAL_LINE))
            throw new Error(`cockpit cells use palette lines ${[...cellPal].sort()}, expected only ${PAL_LINE}`);
        const barCells = HEALTH_BAR_CELLS.map(([c, r]) => [c, r]);
        HEALTH_BAR_CELLS.forEach(([c, r], i) => {
            const t = HEALTH_BAR_TILES[i]!;
            if (((nt[r * cols + c]! + baseTile + COCKPIT_BASE_FLAGS) & 0x7ff) - baseTile !== t)
                throw new Error(`cell (${c},${r}) does not reference tile ${t}`);
        });
        addPng("frame_composite.png", cols * 8, rows * 8, comp, { rom_offset: hex(d), set: "frame_composite" });
        panels.unshift(["frame_composite", cols * 8, rows * 8, comp, rgb]);
        frameE["composite"] = {
            cells: { columns: cols, rows }, descriptor_rom_offset: hex(d), height: rows * 8, nametable_rom_offset: hex(d + 8),
            png: "frame_composite.png", sha256_pixels: sha256Hex(comp), width: cols * 8,
            word_rule: "word = (stored word + art VRAM tile + 0xE000) & 0xFFFF; tile = word & 0x7FF; " +
                "bit 11 = horizontal flip, bit 12 = vertical flip, bits 14..13 = palette line",
            note: "static frame only; the 3D viewport, slot cards, scanner symbols and weapon card are drawn by other routines",
        };
        frameE["descriptor"] = {
            art_offset: artOff, columns: cols, rom_offset: hex(d), rows, tiles: count,
            vram_art_address: hex(call.art_vram), vram_nametable_address: hex(call.nametable_vram),
        };
        frameE["runtime_rewritten"] = { cells: barCells, role: "health bar: two tiles redrawn from the health percentage", tiles: [...HEALTH_BAR_TILES] };
        evidence["frame"] = { call_rom_offset: hex(COCKPIT_CALL) };
        ctx.say(`hud: frame: ${count} tiles from ${hex(art)}, composite ${cols * 8}x${rows * 8}`);
        const prevEnd = art + count * TILE_BYTES;
        for (const [key, off, n, cols_, sites, role] of BANKS) {
            const info = readLoader(rom, ...sites);
            if (info.rom_offset !== off || info.longwords * 4 !== n * TILE_BYTES)
                throw new Error(`${key}: loader at ${hex(sites[0])} says ${JSON.stringify(info)}`);
            if ((info.vram_address >> 5) !== VRAM_TILE[key])
                throw new Error(`${key}: loader VRAM tile ${hex(info.vram_address >> 5)}`);
            const [e] = addTileBank(key, off, n * TILE_BYTES, cols_, role);
            e["loader"] = { code_rom_offset: hex(info.cmd_site), longwords: info.longwords, vram_address: hex(info.vram_address), vram_tile: info.vram_address >> 5 };
            if (key === "minimap") {
                if (prevEnd !== off)
                    throw new Error("the frame art does not end where the minimap bank starts");
                for (const site of BLINK_TABLES) {
                    if (words(rom, site, 8).some((w, i) => w !== BLINK_WORDS[i]))
                        throw new Error(`blink table at ${hex(site)} changed`);
                }
                for (const site of GRID_WORD_SITES) {
                    if (rom.u16be(site - 2) !== 0x0643 || rom.u16be(site) !== GRID_WORD)
                        throw new Error(`grid word site ${hex(site)} changed`);
                }
                if (rom.u16be(ENEMY_BLIP_SITE) !== 0x5a45)
                    throw new Error(`the +5 step to the enemy blips at ${hex(ENEMY_BLIP_SITE)} changed`);
                e["tile_roles"] = MINIMAP_ROLES.map((r) => ({ ...r }));
                e["evidence"] = {
                    blink_tables: BLINK_TABLES.map(hex), grid_word_sites: GRID_WORD_SITES.map(hex), enemy_blip_step_rom_offset: hex(ENEMY_BLIP_SITE),
                };
            }
            ctx.say(`hud: ${key}: ${n} tiles from ${hex(off)} (VRAM tile ${hex(VRAM_TILE[key]!)})`);
        }
        const cardEntries: Obj[] = [];
        for (let i = 0; i < CARD_COUNT; i++) {
            const ptr = rom.u32be(CARD_TABLE + 4 * i);
            if (ptr !== CARD_BASE + i * CARD_BYTES)
                throw new Error(`card pointer ${i} is ${hex(ptr)}, expected ${hex(CARD_BASE + i * CARD_BYTES)}`);
        }
        const nxt = rom.u32be(CARD_TABLE + 4 * CARD_COUNT);
        if (CARD_BASE <= nxt && nxt < AMMO_DIGITS && (nxt - CARD_BASE) % CARD_BYTES === 0)
            throw new Error(`the card pointer table continues past entry ${CARD_COUNT}`);
        for (let itemId = 1; itemId <= CARD_COUNT; itemId++) {
            const off = CARD_BASE + (itemId - 1) * CARD_BYTES;
            const raw = rom.bytesAt(off, CARD_BYTES);
            const tiles = range(0, 16).map((i) => decodeTile(raw.subarray(i * TILE_BYTES, (i + 1) * TILE_BYTES)));
            const [w, h, px] = spritePixels(tiles, 4, 4);
            const mptr = rom.u32be(MESSAGE_TABLE + 4 * itemId);
            const name = messageName(Array.from(rom.bytesAt(mptr, 36), (b) => String.fromCharCode(b)).join(""));
            const rel = `card_${String(itemId).padStart(2, "0")}.png`;
            addPng(rel, w, h, px, { item_id: itemId, rom_offset: hex(off), set: "card" });
            panels.push([rel.slice(0, -4), w, h, px, rgb]);
            cardEntries.push({
                anchor: { x: 0, y: 0 }, anchor_kind: "top-left", bytes: CARD_BYTES, digit_area: { ...DIGIT_AREA }, height: h, item_id: itemId,
                message_rom_offset: hex(mptr), name, name_evidence: "rom_message_table", png: rel, rom_offset: hex(off),
                sha256_pixels: sha256Hex(px), sha256_rom: sha256Hex(raw), tile_order: "column-major", tiles: 16, tiles_h: 4, tiles_w: 4,
                vram_address_slot0: hex(CARD_VRAM_BASE), width: w,
            });
        }
        ctx.say(`hud: ${CARD_COUNT} slot cards from ${hex(CARD_BASE)}`);
        const raw = rom.bytesAt(AMMO_DIGITS, AMMO_BYTES);
        const glyphs: number[][] = [];
        for (let dgt = 0; dgt < 10; dgt++) {
            const base = (dgt & ~1) * 12 + 2 * (dgt & 1);
            glyphs.push(range(0, AMMO_ROWS).map((k) => (raw[base + 4 * k]! << 8) | raw[base + 4 * k + 1]!));
        }
        const gw = 10 * AMMO_GLYPH_W;
        const px = new Uint8Array(gw * AMMO_ROWS);
        glyphs.forEach((rows_, dgt) => rows_.forEach((wv, y) => {
            for (let x = 0; x < 4; x++)
                px[y * gw + dgt * 4 + x] = (wv >> (12 - 4 * x)) & 15;
        }));
        addPng("ammo_digits.png", gw, AMMO_ROWS, px, { rom_offset: hex(AMMO_DIGITS), set: "ammo_digits" });
        panels.push(["ammo_digits", gw, AMMO_ROWS, px, rgb]);
        const glyphMap: Obj = {};
        for (let dgt = 0; dgt < 10; dgt++)
            glyphMap[String(dgt)] = { x: dgt * 4, block_offset: (dgt & ~1) * 12 + 2 * (dgt & 1) };
        entries.push({
            anchor: { x: 0, y: 0 }, anchor_kind: "top-left", bytes: AMMO_BYTES, glyph: { h: AMMO_ROWS, w: AMMO_GLYPH_W }, glyphs: glyphMap,
            height: AMMO_ROWS, name: "ammo_digits", png: "ammo_digits.png", rom_offset: hex(AMMO_DIGITS),
            role: "two-digit ammo / charge counter glyphs", sha256_pixels: sha256Hex(px), sha256_rom: sha256Hex(raw), width: gw,
            layout: "digit d: block (d // 2) * 24, six 16-bit rows at byte stride 4, +0 even / +2 odd digit",
        });
        ctx.say(`hud: 10 counter digits from ${hex(AMMO_DIGITS)}`);
        const sheet = contactSheet(panels);
        records.push(ctx.writeBytes(`${OUT_DIR}/contact_sheet.png`, sheet.png, { ...palArgs, set: "contact_sheet" }));
        const index: Obj = {
            cards: cardEntries,
            contact_sheet: {
                background: [...SHEET_BG], height: sheet.h, panels: sheet.info, png: "contact_sheet.png", scale: SHEET_SCALE,
                transparent_index: 0, width: sheet.w, note: "RGB; index 0 is shown as the background; panels in the order listed",
            },
            entries,
            evidence,
            format: FORMAT,
            notes: [
                "Tile format: 8x8, 4 bits per pixel, 32 bytes per tile, 4 bytes per pixel row, high nibble " +
                    "= left pixel; cards are 4x4 hardware sprites with column-major tile order.",
                "Documented offsets that disagree with the ROM: the frame is the 172-tile art at 0x156CAE " +
                    "(not 7776 bytes at 0x157B2E), the minimap bank is 576 bytes (not 736), there are 14 cards " +
                    "(ids 1..14, not 7) and card 6 is the FLASH LIGHT.",
                "The counter digits and the two digit pairs are written over cards and bar tiles at run " +
                    "time; the ROM bytes of the cards keep placeholders in the digit area.",
            ],
            cockpit: buildCockpit(rom),
            palette: {
                cram_words: palWords.map((w) => "0x" + hex4(w)), line: PAL_LINE, rgb: rgb.map((c) => [...c]), rom_offset: hex(PAL_ROM),
                evidence: "HUD name-table words (0xE000 base) and the slot sprites (attribute " +
                    "0xE4B0 + ...) carry palette bits 3; line 3 equals line 3 of 0x21F2 " +
                    "and of the night-vision tables",
            },
        };
        records.push(ctx.writeJson(`${OUT_DIR}/hud.json`, index, { set: "index" }));
        ctx.say(`hud: ${records.length} files`);
    },
};

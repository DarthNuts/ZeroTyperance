import type { Command, Context, RomFile } from "../core.js";
import { encodePng } from "../png.js";
import { MAPS_TABLE_NOTES } from "../reference_notes.js";
export const FORMAT = "ztassets-maps/1";
export const EPISODES: ReadonlyArray<readonly [
    string,
    number
]> = [
    ["spaceship", 0x15a106],
    ["highrise", 0x160420],
    ["basement", 0x166028],
];
const MAGIC = [0x5a, 0x4d, 0x41, 0x50];
const NUM_METATEX = 256;
const METATEX_SIZE = 16;
const NUM_BLOCKS = 256;
const WALL_RECORD_SIZE = 8;
export const GRID_W = 32;
export const GRID_H = 32;
export const GRID_SIZE = GRID_W * GRID_H;
const NUM_FLOORS = 16;
const META_SIZE = 16;
const OFF_METATEX = 4;
const OFF_WALLS = OFF_METATEX + NUM_METATEX * METATEX_SIZE;
const OFF_PROPS = OFF_WALLS + NUM_BLOCKS * WALL_RECORD_SIZE;
const OFF_GRIDS = OFF_PROPS + NUM_BLOCKS;
const OFF_META = OFF_GRIDS + NUM_FLOORS * GRID_SIZE;
const OFF_TABLE = OFF_META + META_SIZE;
const ENTRY_HEADER = 6;
const MAX_ENTRIES = 1024;
const WALL_WORD_ORDER = [
    { word: 0, label: "n", edge: "low_y" },
    { word: 1, label: "e", edge: "low_x" },
    { word: 2, label: "w", edge: "high_x" },
    { word: 3, label: "s", edge: "high_y" },
];
export const CELL_PX = 8;
type Color = readonly [
    number,
    number,
    number
];
const range = (a: number, b: number): number[] => Array.from({ length: b - a }, (_, i) => a + i);
const ITEM_CLASS = new Map<number, number>([...range(1, 13).map((i) => [0x18 + i, i] as [
        number,
        number
    ]), [0x82, 13], [0x36, 14]]);
const MEDIPACK_CLASS = 0x25;
const CAMERA_CLASS = 0x26;
const DOOR_CLASSES = [0x06, 0x07];
const PLAYER_START_CLASS = 0x77;
const BURNING_CLASS = 0x18;
const ENEMY_CLASSES = [0x29, 0x2a, 0x2b, ...range(0x65, 0x6c)];
const ENVIRONMENT_CLASSES = [0x08, 0x09, 0x0a, 0x0b];
const SNIPER_CLASSES = [0x27, 0x28];
const LIFT_CLASSES = [...range(0x31, 0x35), ...range(0x50, 0x5c)];
const EPISODE_END_CLASS = 0x81;
const FAKE_DOOR_CLASSES = [0x2d, 0x2e, 0x83, 0x84];
const sortedNum = (a: Iterable<number>): number[] => [...a].sort((x, y) => x - y);
type Category = readonly [
    string,
    string,
    number[] | null,
    Color | null
];
const CATEGORIES: readonly Category[] = [
    ["open", "open floor", [0x00], [22, 24, 30]],
    ["wall_other", "wall or other block (grey shade follows the block index)", null, null],
    ["player_start", "player start", [PLAYER_START_CLASS], [0, 230, 60]],
    ["item", "item pickup (ids 1..14)", sortedNum(ITEM_CLASS.keys()), [255, 205, 0]],
    ["medipack", "medipack pickup (restores health)", [MEDIPACK_CLASS], [255, 105, 180]],
    ["enemy", "enemy marker", ENEMY_CLASSES, [230, 40, 40]],
    ["camera", "surveillance camera marker", [CAMERA_CLASS], [170, 100, 255]],
    ["door_cell", "auto-door cell (stepping on it opens the door)", DOOR_CLASSES, [0, 200, 255]],
    ["burning_floor", "burning floor", [BURNING_CLASS], [255, 110, 0]],
    ["environment", "environment cell (sets the render configuration 0..3)", ENVIRONMENT_CLASSES, [0, 160, 140]],
    ["snipers", "invisible snipers cell", SNIPER_CLASSES, [0, 100, 30]],
    ["lift", "lift cell (arrive / up / down / both, one set per entrance side)", LIFT_CLASSES, [60, 120, 255]],
    ["episode_end", "episode-end cell (sets the transition flag; unused by the shipped floors)", [EPISODE_END_CLASS], [255, 255, 255]],
    ["fake_door", "fake door (drawn as a door, no step routine)", FAKE_DOOR_CLASSES, [0, 110, 140]],
];
const CATEGORY_COLOR = new Map<string, Color | null>(CATEGORIES.map((c) => [c[0], c[3]]));
const CATEGORY_OF_CLASS = (() => {
    const table = new Map<number, string>();
    for (const [cid, , classes] of CATEGORIES) {
        for (const cls of classes ?? []) {
            if (table.has(cls))
                throw new Error(`class 0x${cls.toString(16).toUpperCase().padStart(2, "0")} is listed in two categories`);
            table.set(cls, cid);
        }
    }
    return table;
})();
export function classify(cls: number): [
    string,
    number | null
] {
    const cid = CATEGORY_OF_CLASS.get(cls) ?? "wall_other";
    return [cid, cid === "item" ? ITEM_CLASS.get(cls)! : null];
}
const hex2 = (n: number): string => "0x" + n.toString(16).toUpperCase().padStart(2, "0");
const hex = (n: number): string => "0x" + n.toString(16).toUpperCase();
function classText(classes: readonly number[]): string {
    const cs = sortedNum(classes);
    const parts: string[] = [];
    let i = 0;
    while (i < cs.length) {
        let j = i;
        while (j + 1 < cs.length && cs[j + 1] === cs[j]! + 1)
            j++;
        if (j - i >= 2)
            parts.push(`${hex2(cs[i]!)}-${hex2(cs[j]!)}`);
        else
            for (const c of cs.slice(i, j + 1))
                parts.push(hex2(c));
        i = j + 1;
    }
    return parts.join(", ");
}
function grey(block: number): Color {
    const v = 64 + ((block * 37) & 0x3f) * 2;
    return [v, v, v];
}
const u16 = (d: Uint8Array, off: number): number => (d[off]! << 8) | d[off + 1]!;
const toHex = (d: Uint8Array): string => Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
function walkTable(rom: RomFile, start: number): {
    entries: Array<[
        number,
        Uint8Array
    ]>;
    total: number;
} {
    const entries: Array<[
        number,
        Uint8Array
    ]> = [];
    let pos = start;
    for (;;) {
        if (entries.length >= MAX_ENTRIES)
            throw new Error(`animation chain at ${hex(start)} does not terminate`);
        const count = rom.u16be(pos);
        if (count === 0) {
            pos += 2;
            break;
        }
        if (count < ENTRY_HEADER || (count & 1))
            throw new Error(`bad record size ${count} at ${hex(pos)}`);
        entries.push([pos - start, rom.bytesAt(pos, count)]);
        pos += count;
    }
    return { entries, total: pos - start };
}
function decodeEntry(index: number, offset: number, data: Uint8Array): Record<string, unknown> {
    const count = data.length;
    const cur = u16(data, 4);
    const frames = new Map<number, {
        offset: number;
        patches: unknown[];
        end_word: number;
        next_offset: number;
        _end: number;
    }>();
    const order: number[] = [];
    let off = cur;
    while (!frames.has(off)) {
        if (off < ENTRY_HEADER || off + 2 > count || (off & 1))
            throw new Error(`record ${index}: frame offset ${hex(off)} outside the record`);
        let q = off;
        const patches: unknown[] = [];
        let endWord: number;
        for (;;) {
            if (q + 2 > count)
                throw new Error(`record ${index}: frame at ${hex(off)} runs off the record`);
            const word = u16(data, q);
            q += 2;
            if (word & 0x8000) {
                endWord = word;
                break;
            }
            if (q + 2 > count)
                throw new Error(`record ${index}: frame at ${hex(off)} runs off the record`);
            const value = u16(data, q);
            q += 2;
            if ((word & 1) || word >= NUM_METATEX * METATEX_SIZE)
                throw new Error(`record ${index}: bad patch target ${hex(word)}`);
            patches.push({ target: word, metatexture: word >> 4, slot: (word & 15) >> 1, value });
        }
        if (q + 2 > count)
            throw new Error(`record ${index}: frame at ${hex(off)} has no next-frame offset`);
        const nxt = u16(data, q);
        q += 2;
        frames.set(off, { offset: off, patches, end_word: endWord, next_offset: nxt, _end: q });
        order.push(off);
        off = nxt;
    }
    const spans = [...frames.values()].map((f) => [f.offset, f._end] as [
        number,
        number
    ]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let pos = ENTRY_HEADER;
    let covers = true;
    for (const [a, b] of spans) {
        if (a !== pos) {
            covers = false;
            break;
        }
        pos = b;
    }
    covers = covers && pos === count;
    const outFrames = order.map((o) => {
        const f = frames.get(o)!;
        return { offset: f.offset, patches: f.patches, end_word: f.end_word, next_offset: f.next_offset };
    });
    return {
        index, offset, count, subframe: data[2]!, reload: data[3]!, sublist_offset: cur,
        frames: outFrames, frames_cover_record: covers, raw_hex: toHex(data),
    };
}
export interface World {
    name: string;
    index: number;
    offset: number;
    metatex: Uint8Array;
    walls: Uint8Array;
    props: Uint8Array;
    grids: Uint8Array;
    meta: Uint8Array;
    tableEntries: Array<[
        number,
        Uint8Array
    ]>;
    tableTotal: number;
    tableOffset: number;
}
export function readWorld(rom: RomFile, name: string, index: number, off: number): World {
    const m = rom.bytesAt(off, 4);
    if (!MAGIC.every((b, i) => m[i] === b))
        throw new Error(`${name}: no ZMAP magic at ${hex(off)}`);
    const { entries, total } = walkTable(rom, off + OFF_TABLE);
    return {
        name, index, offset: off,
        metatex: rom.bytesAt(off + OFF_METATEX, NUM_METATEX * METATEX_SIZE),
        walls: rom.bytesAt(off + OFF_WALLS, NUM_BLOCKS * WALL_RECORD_SIZE),
        props: rom.bytesAt(off + OFF_PROPS, NUM_BLOCKS),
        grids: rom.bytesAt(off + OFF_GRIDS, NUM_FLOORS * GRID_SIZE),
        meta: rom.bytesAt(off + OFF_META, META_SIZE),
        tableEntries: entries, tableTotal: total, tableOffset: off + OFF_TABLE,
    };
}
const LEGEND_NOTES = [
    "Items: a floor pickup's class is 0x18 + item id for ids 1..12 (classes 0x19-0x24); the pickup routine tests " +
        "class 0x82 (item 13) and class 0x36 (item 14) before it subtracts 0x18. Class 0x25 is the medipack, not an " +
        "item, and class 0x26 is not a pickup at all (its step trigger is empty). The step-trigger table (ROM 0xE420) " +
        "sends exactly the classes 0x19-0x25, 0x36 and 0x82 to the pickup routine.",
    "Class 0x26: the renderer's class table (ROM 0x923A) sends it to a routine of its own (documented as a " +
        "surveillance camera); it is a camera marker, not an item.",
    "Doors: classes 0x06 and 0x07 are the auto-door cells. The step-trigger table gives them the door-open " +
        "routines (ROM 0xB25E and 0xB29A) and the renderer draws the closed door through the cell centre.",
    "Classes 0x0C and 0x0D are not doors: the step-trigger table gives them the empty routine (the same as class 0) " +
        "and the renderer draws them as walls with per-face ramp words (as it does for 0x0C-0x11). They are plain " +
        "wall_other cells. " +
        "(An older reading took them for door triggers because it indexed the step-trigger table six entries off.)",
    "Fake doors: classes 0x83 and 0x84 are drawn by the same renderer routines as 0x06 and 0x07, but they lie " +
        "above the end of the step-trigger table (0x82), so stepping on them triggers nothing; classes 0x2D and 0x2E " +
        "have door renderer routines of their own and the empty step routine. The level editor's cell list names all " +
        "four 'fake horizontal/vertical door'. Only 0x83/0x84 occur on shipped floors (three Highrise cells).",
    "Environment: classes 0x08-0x0B each hold a step routine that loads 0..3 and jumps to the render-configuration " +
        "selector (the same routine the level change feeds from meta.render_mode_by_floor). The editor names them " +
        "'Environment: Bright / Dim / Haze / No ceiling'. No shipped floor contains one.",
    "Episode end: class 0x81's step routine sets the level-transition flag directly. In the game the episode ends " +
        "when the boss dies: the three boss death handlers (and the link message type 0x18 on the other console) start " +
        "a 15-frame countdown that sets the same flag. No shipped floor contains a 0x81 cell, so the cell is an unused " +
        "(editor/concept) way of ending an episode, not the way the game does it.",
    "Lifts: the step-trigger table holds four lift routines (arrive, up, down, both directions) and repeats them " +
        "for the four entrance sides: 0x31-0x34 (left), 0x50-0x53 (right), 0x54-0x57 (bottom), 0x58-0x5B (top); the " +
        "'arrive' class is the cell in front of the lift. Stairs (0x12-0x17, 0x38-0x3F, 0x40-0x4F and the stair " +
        "walls) have NO step routine: each has a renderer routine of its own, so stairs are a renderer/ramp " +
        "mechanism, not a trigger.",
    "Snipers: classes 0x27 and 0x28 share one step routine (the 'invisible snipers' cells of the editor; " +
        "FINDINGS: rooftop snipers). Class 0x2F ('enemy blocker' in the editor) has no step routine and the plain-cell " +
        "renderer routine of open floor: whatever it does is in the enemy movement code, not in these tables " +
        "(unverified).",
    "Class 0x78 ('floor fan' in the editor) has a routine of its own in the item-render dispatch table " +
        "(ROM 0x113F4, classes 0x18-0x82, no bounds check) but no shipped floor contains it. Class 0x82 (item 13, " +
        "the flamethrower) has its own entry there too and occurs on 50 Basement/Spaceship cells.",
    "Classes 0x79-0x80 share renderer routine 0x9458 (the editor: shootable walls 0x79/0x7B/0x7F, wall 0x80, " +
        "unknown 0x7A/0x7C-0x7E); what distinguishes them is not in the class tables.",
];
function legendDoc(): Record<string, unknown> {
    const cats = CATEGORIES.map(([cid, label, classes, color]) => ({
        id: cid, label,
        classes: classes === null ? "all other classes" : classText(classes),
        class_list: classes === null ? null : sortedNum(classes),
        color: color ? [...color] : null,
    }));
    return {
        cell_class: "props[grid[y][x]]",
        classes_are: "block property byte values, written in hex",
        grid_axes: "x to the right, y downwards; minimap cell = 8 px",
        categories: cats,
        item_classes: sortedNum(ITEM_CLASS.keys()).map((c) => ({ class: c, item_id: ITEM_CLASS.get(c)! })),
        wall_other_shade: "grey level 64 + 2 * ((block * 37) & 63)",
        notes: LEGEND_NOTES,
    };
}
const NOTES = [
    "Generated by ztassets maps from the ROM image; nothing here comes from a running game.",
    "grid cells are block indices; the class of a cell is props[block]; floors are indexed by the level sub-id.",
    "A floor is 'used' when its grid is not all zero.",
    "Wall words are stored in the ROM order word0..word3; see wall_faces for the edge each word draws. " +
        "The n/e/s/w labels are the port's names for the four wall-drawing routines, not an independently established compass.",
];
export function buildDoc(w: World): Record<string, unknown> {
    const { metatex, walls, props, grids, meta } = w;
    const order = new Map(WALL_WORD_ORDER.map((o) => [o.word, o.label]));
    const metatextures: number[][] = [];
    for (let i = 0; i < NUM_METATEX; i++)
        metatextures.push(range(0, 8).map((s) => u16(metatex, i * METATEX_SIZE + 2 * s)));
    const blocks: unknown[] = [];
    for (let i = 0; i < NUM_BLOCKS; i++) {
        const words = range(0, 4).map((k) => u16(walls, i * WALL_RECORD_SIZE + 2 * k));
        const wl: Record<string, number> = {};
        for (let k = 0; k < 4; k++)
            wl[order.get(k)!] = words[k]!;
        blocks.push({ index: i, walls: wl, props: props[i]!, category: classify(props[i]!)[0] });
    }
    const floors: unknown[] = [];
    for (let f = 0; f < NUM_FLOORS; f++) {
        const cells = grids.subarray(f * GRID_SIZE, (f + 1) * GRID_SIZE);
        const counts: Record<string, number> = {};
        const markers: unknown[] = [];
        for (let pos = 0; pos < cells.length; pos++) {
            const block = cells[pos]!;
            const cls = props[block]!;
            const [cat, itemId] = classify(cls);
            counts[cat] = (counts[cat] ?? 0) + 1;
            if (cat !== "open" && cat !== "wall_other") {
                const m: Record<string, unknown> = { x: pos % GRID_W, y: Math.floor(pos / GRID_W), block, class: cls, category: cat };
                if (itemId !== null)
                    m["item_id"] = itemId;
                markers.push(m);
            }
        }
        floors.push({
            index: f,
            used: cells.some((c) => c !== 0),
            grid: range(0, GRID_H).map((y) => Array.from(cells.subarray(y * GRID_W, (y + 1) * GRID_W))),
            category_counts: counts,
            markers,
        });
    }
    const entries = w.tableEntries.map(([off, data], i) => decodeEntry(i, off, data));
    return {
        format: FORMAT,
        episode: { index: w.index, name: w.name, rom_offset: hex(w.offset) },
        grid: { width: GRID_W, height: GRID_H, floors: NUM_FLOORS, cell_index: "y * 32 + x" },
        wall_faces: WALL_WORD_ORDER.map((o) => ({ ...o })),
        metatextures,
        blocks,
        floors,
        meta: {
            raw_hex: toHex(meta),
            render_mode_by_floor: Array.from(meta),
            notes: ["One byte per floor, indexed by the level sub-id: the level-change routine " +
                    "hands it to the render-configuration selector (0..4; larger values act as 0)."],
        },
        spawn_table: {
            rom_offset: hex(w.tableOffset),
            rom_end: hex(w.tableOffset + w.tableTotal),
            byte_count_total: w.tableTotal,
            terminator_bytes: 2,
            entry_count: entries.length,
            entries,
            ...(MAPS_TABLE_NOTES !== null ? { notes: MAPS_TABLE_NOTES } : {}),
        },
        class_legend: legendDoc(),
        notes: NOTES,
    };
}
export interface Pixels {
    readonly width: number;
    readonly height: number;
    readonly rgb: Uint8Array;
}
const FONT_SRC = `
A .#. #.# ### #.# #.#
B ##. #.# ##. #.# ##.
C .## #.. #.. #.. .##
D ##. #.# #.# #.# ##.
E ### #.. ##. #.. ###
F ### #.. ##. #.. #..
G .## #.. #.# #.# .##
H #.# #.# ### #.# #.#
I ### .#. .#. .#. ###
J ..# ..# ..# #.# .#.
K #.# #.# ##. #.# #.#
L #.. #.. #.. #.. ###
M #.# ### ### #.# #.#
N ##. #.# #.# #.# #.#
O .#. #.# #.# #.# .#.
P ##. #.# ##. #.. #..
Q .#. #.# #.# ##. .##
R ##. #.# ##. #.# #.#
S .## #.. .#. ..# ##.
T ### .#. .#. .#. .#.
U #.# #.# #.# #.# ###
V #.# #.# #.# #.# .#.
W #.# #.# ### ### #.#
X #.# #.# .#. #.# #.#
Y #.# #.# .#. .#. .#.
Z ### ..# .#. #.. ###
0 ### #.# #.# #.# ###
1 .#. ##. .#. .#. ###
2 ##. ..# .#. #.. ###
3 ##. ..# .#. ..# ##.
4 #.# #.# ### ..# ..#
5 ### #.. ##. ..# ##.
6 .## #.. ### #.# ###
7 ### ..# .#. .#. .#.
8 ### #.# ### #.# ###
9 ### #.# ### ..# ##.
( .#. #.. #.. #.. .#.
) .#. ..# ..# ..# .#.
, ... ... ... .#. #..
/ ..# ..# .#. #.. #..
- ... ... ### ... ...
+ ... .#. ### .#. ...
= ... ### ... ### ...
. ... ... ... ... .#.
`;
function font(): Map<string, boolean[][]> {
    const glyphs = new Map<string, boolean[][]>();
    for (const line of FONT_SRC.trim().split("\n")) {
        const [ch, ...rows] = line.trim().split(/\s+/);
        glyphs.set(ch!, rows.map((r) => Array.from(r, (c) => c === "#")));
    }
    return glyphs;
}
function tile(color: Color, border: boolean): Uint8Array[] {
    const ring = [8, 8, 10];
    const rows: Uint8Array[] = [];
    for (let y = 0; y < CELL_PX; y++) {
        const row = new Uint8Array(CELL_PX * 3);
        for (let x = 0; x < CELL_PX; x++) {
            const edge = x === 0 || x === CELL_PX - 1 || y === 0 || y === CELL_PX - 1;
            row.set(border && edge ? ring : color, x * 3);
        }
        rows.push(row);
    }
    return rows;
}
export function floorPixels(gridBytes: Uint8Array, props: Uint8Array): Pixels {
    const tiles = new Map<string, Uint8Array[]>();
    const tileFor = (block: number): Uint8Array[] => {
        const cat = classify(props[block]!)[0];
        const key = cat === "wall_other" ? `wall_other:${block}` : `${cat}:0`;
        let t = tiles.get(key);
        if (t === undefined) {
            const color = cat === "wall_other" ? grey(block) : CATEGORY_COLOR.get(cat)!;
            t = tile(color!, cat !== "open" && cat !== "wall_other");
            tiles.set(key, t);
        }
        return t;
    };
    const w = GRID_W * CELL_PX, h = GRID_H * CELL_PX;
    const out = new Uint8Array(w * h * 3);
    let o = 0;
    for (let y = 0; y < GRID_H; y++) {
        const rowTiles = range(0, GRID_W).map((x) => tileFor(gridBytes[y * GRID_W + x]!));
        for (let r = 0; r < CELL_PX; r++)
            for (const t of rowTiles) {
                out.set(t[r]!, o);
                o += t[r]!.length;
            }
    }
    return { width: w, height: h, rgb: out };
}
export function legendPixels(): Pixels {
    const glyphs = font();
    const scale = 2;
    const adv = 4 * scale;
    const rowH = 16;
    const labels: Array<[
        string,
        Color | "grey" | null
    ]> = [
        ["CLASS = BLOCK PROPERTY BYTE (HEX)", null],
        ["OPEN FLOOR (00)", CATEGORY_COLOR.get("open")!],
        ["WALL OR OTHER (GREY BY BLOCK)", "grey"],
        ["PLAYER START (77)", CATEGORY_COLOR.get("player_start")!],
        ["ITEM (19-24 = ID 1-12, 82 = 13, 36 = 14)", CATEGORY_COLOR.get("item")!],
        ["MEDIPACK (25)", CATEGORY_COLOR.get("medipack")!],
        ["ENEMY (29-2B, 65-6B)", CATEGORY_COLOR.get("enemy")!],
        ["SURVEILLANCE CAMERA (26)", CATEGORY_COLOR.get("camera")!],
        ["DOOR CELL (06, 07)", CATEGORY_COLOR.get("door_cell")!],
        ["BURNING FLOOR (18)", CATEGORY_COLOR.get("burning_floor")!],
        ["ENVIRONMENT (08-0B)", CATEGORY_COLOR.get("environment")!],
        ["SNIPERS (27, 28)", CATEGORY_COLOR.get("snipers")!],
        ["LIFT (31-34, 50-5B)", CATEGORY_COLOR.get("lift")!],
        ["EPISODE END (81)", CATEGORY_COLOR.get("episode_end")!],
        ["FAKE DOOR (2D, 2E, 83, 84)", CATEGORY_COLOR.get("fake_door")!],
    ];
    const textX = 24;
    const width = textX + Math.max(...labels.map(([t]) => t.length)) * adv + 8;
    const height = rowH * labels.length + 8;
    const bg: Color = [32, 34, 40];
    const fg: Color = [230, 230, 230];
    const rgb = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height; i++)
        rgb.set(bg, i * 3);
    const rect = (x0: number, y0: number, w: number, h: number, color: Color): void => {
        for (let y = y0; y < y0 + h; y++)
            for (let x = x0; x < x0 + w; x++)
                rgb.set(color, (y * width + x) * 3);
    };
    labels.forEach(([text, color], i) => {
        const y0 = 4 + i * rowH;
        if (color === "grey")
            for (let k = 0; k < 4; k++)
                rect(4 + k * 4, y0 + 2, 4, 12, grey(k * 11 + 3));
        else if (color !== null)
            rect(4, y0 + 2, 16, 12, color);
        let x = textX;
        for (const ch of text) {
            const g = glyphs.get(ch);
            if (g !== undefined) {
                g.forEach((grow, gy) => grow.forEach((on, gx) => { if (on)
                    rect(x + gx * scale, y0 + 3 + gy * scale, scale, scale, fg); }));
            }
            x += adv;
        }
    });
    return { width, height, rgb };
}
export type PngWriter = (width: number, height: number, rgb: Uint8Array) => Uint8Array;
export const maps: Command = {
    name: "maps",
    run(ctx: Context, options: Record<string, unknown>) {
        const png: PngWriter | undefined = options["noPng"] ? undefined : ((options["png"] as PngWriter | undefined) ?? ((width, height, rgb) => encodePng({ width, height, mode: "RGB", pixels: rgb, level: 9 })));
        EPISODES.forEach(([name, off], index) => {
            ctx.progress(index, EPISODES.length, `episode ${index + 1} of ${EPISODES.length}: ${name}`);
            const w = readWorld(ctx.rom, name, index, off);
            const doc = buildDoc(w);
            const epArgs = { episode: name, rom_offset: hex(off) };
            ctx.writeJson(`maps/${name}.json`, doc, epArgs);
            const floors = doc["floors"] as Array<{
                index: number;
                used: boolean;
            }>;
            const used = floors.filter((f) => f.used).map((f) => f.index);
            ctx.say(`${name}: ${used.length} used floor(s), ${w.tableEntries.length} animation record(s), ${w.tableTotal} bytes of table`);
            if (png) {
                let fl = 0;
                for (const f of used) {
                    ctx.progress(index + fl++ / used.length, EPISODES.length, `episode ${index + 1} of ${EPISODES.length}: ${name} floor ${fl} of ${used.length}`);
                    const p = floorPixels(w.grids.subarray(f * GRID_SIZE, (f + 1) * GRID_SIZE), w.props);
                    ctx.writeBytes(`maps/${name}_floor_${String(f).padStart(2, "0")}.png`, png(p.width, p.height, p.rgb), { ...epArgs, floor: f, cell_px: CELL_PX });
                }
            }
        });
        if (png) {
            const p = legendPixels();
            ctx.writeBytes("maps/legend.png", png(p.width, p.height, p.rgb), { cell_px: CELL_PX });
        }
    },
};

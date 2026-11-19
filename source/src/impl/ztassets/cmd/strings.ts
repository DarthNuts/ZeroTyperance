import type { Command, Context, RomFile } from "../core.js";
const FORMAT = "ztassets-strings/1";
const INDEX_FORMAT = "ztassets-strings-index/1";
const OUT_DIR = "strings";
const ENCODING = "ascii";
const HEADER_FIELDS: ReadonlyArray<readonly [
    string,
    number,
    number
]> = [
    ["console_name", 0x100, 16], ["copyright", 0x110, 16], ["domestic_title", 0x120, 48],
    ["overseas_title", 0x150, 48], ["serial", 0x180, 14], ["device_support", 0x190, 16],
    ["modem_support", 0x1bc, 12], ["notes", 0x1c8, 40], ["region", 0x1f0, 16],
];
const BOOT_NOTICES = [0x44f, 0x46f, 0x479, 0x48a, 0x498];
const NAME_TABLE = 0x576aa;
const NAME_STRIDE = 25;
const NAME_ROWS = 48;
const WORLDS = ["spaceship", "highrise", "basement"];
const WORLD_SLOTS = 16;
const CAPTION_TABLE = 0x30b2;
const CAPTION_COUNT = 44;
const CAPTION_WIDTH = 16;
const STATUS_LABELS: ReadonlyArray<readonly [
    number,
    number
]> = [[0x57690, 13], [0x5769d, 13]];
const WORLD_TITLES: ReadonlyArray<readonly [
    number,
    number
]> = [[0x57b90, 25], [0x57ba9, 25]];
const MESSAGE_FIRST = 0x1e326;
const MESSAGE_COUNT = 55;
const MESSAGE_TEXT = 36;
const MESSAGE_COLUMNS = 9;
const MESSAGE_MAX_PAIRS = 8;
const ITEM_TABLE = 0x1ef14;
const ITEM_COUNT = 15;
const POINTER_TABLE_END = ITEM_TABLE;
const SCENE_TEXT: readonly [
    number,
    number
] = [0xcb3a8, 0xcd30e];
const SCENE_ROW = 36;
const CARD_BASE = 0xc6b36;
const CARD_STRIDE = 0x13e;
const CARD_COUNT = 5;
const CARD_FIELDS = 6;
const CARD_FIELD_WIDTH = 17;
const CARD_LINES = 6;
const CARD_LINE_WIDTH = 34;
const OPTION_MENU = 0x10b710;
const OPTION_STRINGS = 10;
const OPTION_DIGITS = 0x10b76c;
const PASSWORD_MESSAGES = [0x584be, 0x584d1];
const PASSWORD_ROWS = 0x584e1;
const PASSWORD_ROW_COUNT = 8;
const PASSWORD_BUTTONS = 0x58561;
const PASSWORD_GRID = 0x585a2;
const PASSWORD_ALPHABET = 0x585ea;
const PASSWORD_CHARS = 64;
const LINK_STRINGS = [0x1b5e, 0x1cbc8, 0x1cbed];
const LITERAL_CHAINS: ReadonlyArray<readonly [
    number,
    number
]> = [[0x58a74, 0x58ac8], [0x58ac8, 0x58b1c], [0x58b1c, 0x58baa]];
const LITERAL_LENGTH = 9;
export class StringsError extends Error {
}
type Doc = Record<string, any>;
type Entry = Record<string, unknown>;
const hex = (n: number): string => "0x" + n.toString(16).toUpperCase();
const hex2 = (n: number): string => n.toString(16).toUpperCase().padStart(2, "0");
const toHex = (d: Uint8Array): string => Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
const rstripSpaces = (s: string): string => s.replace(/ +$/, "");
const latin = (d: Uint8Array): string => Array.from(d, (b) => String.fromCharCode(b)).join("");
function span(rom: RomFile, group: string, off: number, n: number, what: string): Uint8Array {
    try {
        return rom.bytesAt(off, n);
    }
    catch (e) {
        if (e instanceof RangeError) {
            throw new StringsError(`${group}: ${what} at ${hex(off)} needs ${n} byte(s) but the ROM image ends before that (truncated table?)`);
        }
        throw e;
    }
}
const u16 = (rom: RomFile, g: string, off: number, what: string): number => { const b = span(rom, g, off, 2, what); return (b[0]! << 8) | b[1]!; };
const u32 = (rom: RomFile, g: string, off: number, what: string): number => { const b = span(rom, g, off, 4, what); return ((b[0]! << 24) >>> 0) + (b[1]! << 16) + (b[2]! << 8) + b[3]!; };
function printable(group: string, off: number, raw: Uint8Array, what: string, allowNul = false): string {
    for (let i = 0; i < raw.length; i++) {
        const b = raw[i]!;
        if (!((b >= 0x20 && b <= 0x7e) || (allowNul && b === 0))) {
            throw new StringsError(`${group}: ${what} at ${hex(off)}: byte 0x${hex2(b)} at offset ${hex(off + i)} is not printable ASCII`);
        }
    }
    return latin(raw);
}
function cstr(rom: RomFile, group: string, off: number, what: string, limit = 80): [
    string,
    number
] {
    const raw: number[] = [];
    for (let i = 0; i < limit; i++) {
        const b = span(rom, group, off + i, 1, what)[0]!;
        if (b === 0) {
            if (raw.length === 0)
                throw new StringsError(`${group}: ${what} at ${hex(off)} is empty`);
            return [printable(group, off, Uint8Array.from(raw), what), off + i + 1];
        }
        raw.push(b);
    }
    throw new StringsError(`${group}: ${what} at ${hex(off)} has no terminator within ${limit} bytes`);
}
function entry(group: string, index: number, romOffset: number, text: string, raw: Uint8Array, meta: Record<string, unknown> = {}): Entry {
    return { id: `${group}.${String(index).padStart(2, "0")}`, meta: { ...meta }, raw_hex: toHex(raw), rom_offset: hex(romOffset), text };
}
const rows_ = rstripSpaces;
function groupDoc(group: string, ranges: ReadonlyArray<readonly [
    number,
    number
]>, description: string, layout: string, entries: Entry[], tables?: unknown[], notes?: string[]): Doc {
    const doc: Doc = {
        description, encoding: ENCODING, entries, format: FORMAT, group, layout,
        rom_offset: hex(Math.min(...ranges.map((r) => r[0]))),
        rom_ranges: ranges.map(([a, b]) => ({ end: hex(b), start: hex(a) })),
    };
    if (tables && tables.length)
        doc["tables"] = tables;
    if (notes && notes.length)
        doc["notes"] = notes;
    return doc;
}
function decodeCartridgeHeader(rom: RomFile): Doc {
    const g = "cartridge_header";
    const entries: Entry[] = [];
    HEADER_FIELDS.forEach(([key, off, width], i) => {
        const raw = span(rom, g, off, width, "header field " + key);
        const stored = printable(g, off, raw, "header field " + key, true);
        const text = stored.replace(/[ \x00]+$/, "");
        const meta: Record<string, unknown> = { field: key, width };
        if (text !== stored)
            meta["stored"] = stored.replace(/\x00/g, " ");
        entries.push(entry(g, i, off, text, raw, meta));
    });
    return groupDoc(g, [[0x100, 0x200]], "The text fields of the cartridge header.", "Fixed-width fields, padded with blanks (and NULs in the unused part); no terminators.", entries);
}
function decodeBootNotices(rom: RomFile): Doc {
    const g = "boot_notices";
    const entries: Entry[] = [];
    let end = BOOT_NOTICES[0]!;
    BOOT_NOTICES.forEach((off, i) => {
        let text: string;
        [text, end] = cstr(rom, g, off, `notice ${i}`);
        entries.push(entry(g, i, off, text, span(rom, g, off, end - off, "notice"), { length: text.length }));
    });
    return groupDoc(g, [[BOOT_NOTICES[0]!, end]], "Notices stored in the boot area, between small binary fields.", "NUL-terminated strings; the bytes between them are binary and not decoded.", entries, undefined, ["The notices sit among binary fields (lengths/positions); only the five strings are decoded."]);
}
function slotRow(rom: RomFile, g: string, off: number, what: string): [
    string,
    Uint8Array
] {
    const raw = span(rom, g, off, NAME_STRIDE, what);
    let k = raw.indexOf(0);
    if (k < 0)
        k = NAME_STRIDE;
    if (raw.subarray(k).some((b) => b !== 0))
        throw new StringsError(`${g}: ${what} at ${hex(off)}: bytes after the first NUL are not all NUL`);
    return [printable(g, off, raw.subarray(0, k), what), raw];
}
function decodeLevelNames(rom: RomFile): Doc {
    const g = "level_names";
    const entries: Entry[] = [];
    let running = 0;
    for (let slot = 0; slot < NAME_ROWS; slot++) {
        const off = NAME_TABLE + NAME_STRIDE * slot;
        const [stored, raw] = slotRow(rom, g, off, `row ${slot}`);
        const blank = stored.trim() === "";
        if (!blank && !stored.includes(":"))
            throw new StringsError(`${g}: row ${slot} at ${hex(off)} has no ':' separator`);
        const name = blank ? "" : stored.split(":")[0]!.trim();
        const meta: Record<string, unknown> = {
            blank, floor_index: slot % WORLD_SLOTS, global_number: null, name, slot, stored, world: WORLDS[Math.floor(slot / WORLD_SLOTS)],
        };
        if (!blank) {
            running++;
            meta["global_number"] = running;
        }
        entries.push(entry(g, slot, off, rows_(stored), raw, meta));
    }
    return groupDoc(g, [[NAME_TABLE, NAME_TABLE + NAME_STRIDE * NAME_ROWS]], "Level names: 3 worlds x 16 slots; empty slots are all blanks.", "25-byte rows: name, blanks, ':' and a blank, then NUL padding.  slot = world * 16 + floor_index; " +
        "global_number counts the non-empty slots in slot order (1..45).", entries, undefined, ["World names are the asset extractor's labels for the three map containers.",
        "global_number is the running number 1..45 used by the password list; it is derived " +
            "from the order of the non-empty slots."]);
}
function decodeLevelCaptions(rom: RomFile): Doc {
    const g = "level_captions";
    const entries: Entry[] = [];
    for (let i = 0; i < CAPTION_COUNT; i++) {
        const off = CAPTION_TABLE + CAPTION_WIDTH * i;
        const raw = span(rom, g, off, CAPTION_WIDTH, `caption ${i}`);
        const stored = printable(g, off, raw, `caption ${i}`);
        entries.push(entry(g, i, off, rows_(stored), raw, {
            floor_index: i % WORLD_SLOTS, level_name: `level_names.${String(i).padStart(2, "0")}`,
            name: stored.trim(), slot: i, stored, world: WORLDS[Math.floor(i / WORLD_SLOTS)],
        }));
    }
    return groupDoc(g, [[CAPTION_TABLE, CAPTION_TABLE + CAPTION_WIDTH * CAPTION_COUNT]], "Short level captions: 16 characters, centred in the field.", "44 fields of 16 characters, no terminators; caption i belongs to level-name slot i (the " +
        "world is slot // 16).  The basement world has captions for its first 12 slots only.", entries);
}
function decodeMapLabels(rom: RomFile): Doc {
    const g = "map_labels";
    const entries: Entry[] = [];
    const ranges: Array<[
        number,
        number
    ]> = [];
    let index = 0;
    for (const [off, width] of STATUS_LABELS) {
        const raw = span(rom, g, off, width, "status label");
        const stored = printable(g, off, raw, "status label");
        entries.push(entry(g, index, off, rows_(stored), raw, { kind: "status_label", stored, width }));
        ranges.push([off, off + width]);
        index++;
    }
    for (const [off, width] of WORLD_TITLES) {
        const [stored, raw] = slotRow(rom, g, off, "world title");
        if (!stored.includes(":"))
            throw new StringsError(`${g}: world title at ${hex(off)} has no ':' separator`);
        entries.push(entry(g, index, off, rows_(stored), raw, { kind: "world_title", name: stored.split(":")[0]!.trim(), stored, width }));
        ranges.push([off, off + width]);
        index++;
    }
    return groupDoc(g, ranges, "Two status labels of the pause screen's first caption row and two world titles.", "Status labels: 13 fixed characters without terminator.  World titles: 25-byte rows in the " +
        "format of the level-name rows (name, blanks, ':' and a blank, NUL padding).", entries);
}
interface MsgRec {
    off: number;
    text: string;
    pairs: Array<{
        duration: number;
        sound_id: number;
    }>;
    end: number;
}
function messageRecords(rom: RomFile, g: string): MsgRec[] {
    const recs: MsgRec[] = [];
    let p = MESSAGE_FIRST;
    for (let i = 0; i < MESSAGE_COUNT; i++) {
        const text = printable(g, p, span(rom, g, p, MESSAGE_TEXT, `message ${i} text`), `message ${i} text`);
        let q = p + MESSAGE_TEXT;
        const pairs: MsgRec["pairs"] = [];
        for (;;) {
            const first = u16(rom, g, q, `message ${i} pair`);
            if (first === 0xffff) {
                q += 2;
                break;
            }
            if (pairs.length >= MESSAGE_MAX_PAIRS) {
                throw new StringsError(`${g}: message ${i} at ${hex(p)} has no 0xFFFF terminator within ${MESSAGE_MAX_PAIRS} pairs`);
            }
            pairs.push({ duration: first, sound_id: u16(rom, g, q + 2, `message ${i} pair`) });
            q += 4;
        }
        recs.push({ off: p, text, pairs, end: q });
        p = q;
    }
    return recs;
}
function pointerTable(rom: RomFile, g: string, base: number, count: number, starts: Map<number, number>, what: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
        const ptr = u32(rom, g, base + 4 * i, `${what} entry ${i}`);
        const s = starts.get(ptr);
        if (s === undefined) {
            throw new StringsError(`${g}: ${what} entry ${i} at ${hex(base + 4 * i)} points to ${hex(ptr)}, which is not the start of a message record`);
        }
        out.push(s);
    }
    return out;
}
function messageLines(text: string): string[] {
    const out: string[] = [];
    for (let i = 0; i < MESSAGE_TEXT; i += MESSAGE_COLUMNS)
        out.push(text.slice(i, i + MESSAGE_COLUMNS));
    return out;
}
function flat(lines: string[]): string {
    let out = "";
    for (const ln of lines.map((x) => x.trim())) {
        if (!ln)
            continue;
        out = out.endsWith("-") ? out.slice(0, -1) + ln : (out ? out + " " + ln : ln);
    }
    return out;
}
function messageName(text36: string): string {
    let rows: string[] = [];
    for (let i = 0; i < 4; i++)
        rows.push(text36.slice(i * 9, (i + 1) * 9).trim());
    if (rows.length && rows[rows.length - 1] === "COLLECTED")
        rows.pop();
    rows = rows.filter((r) => r);
    let out = "";
    for (const r of rows)
        out = out.endsWith("-") ? out.slice(0, -1) + r : (out ? out + " " + r : r);
    return out.split("COLLECTED").join("").trim();
}
const idRef = (g: string, n: number): string => `${g}.${String(n).padStart(2, "0")}`;
function decodeMessages(rom: RomFile): Doc {
    const g = "messages";
    const recs = messageRecords(rom, g);
    const starts = new Map(recs.map((r, i) => [r.off, i] as [
        number,
        number
    ]));
    const tableBase = recs[recs.length - 1]!.end;
    if (tableBase >= POINTER_TABLE_END || (POINTER_TABLE_END - tableBase) % 4) {
        throw new StringsError(`${g}: the records end at ${hex(tableBase)}, which does not leave a whole number of pointers before ${hex(POINTER_TABLE_END)}`);
    }
    const nPtr = (POINTER_TABLE_END - tableBase) / 4;
    const byTable = pointerTable(rom, g, tableBase, nPtr, starts, "record pointer table");
    const byItem = pointerTable(rom, g, ITEM_TABLE, ITEM_COUNT, starts, "item pointer table");
    const idxs = (arr: number[], i: number): number[] => arr.flatMap((r, k) => (r === i ? [k] : []));
    const entries = recs.map((r, i) => {
        const lines = messageLines(r.text);
        return entry(g, i, r.off, lines.map(rows_).join("\n"), span(rom, g, r.off, r.end - r.off, "message"), {
            flat: flat(lines), item_ids: idxs(byItem, i), lines, record_bytes: r.end - r.off, table_ids: idxs(byTable, i), voice: r.pairs,
        });
    });
    const tables = [
        { count: nPtr, entry_bytes: 4, kind: "record_pointers", name: "record_pointer_table", rom_offset: hex(tableBase), targets: byTable.map((r) => idRef(g, r)) },
        { count: ITEM_COUNT, entry_bytes: 4, kind: "item_pointers", name: "item_pointer_table", rom_offset: hex(ITEM_TABLE), targets: byItem.map((r) => idRef(g, r)) },
    ];
    return groupDoc(g, [[MESSAGE_FIRST, tableBase], [tableBase, POINTER_TABLE_END + 4 * ITEM_COUNT]], "Short on-screen messages: four rows of nine characters, each with the sound cues played with it.", "Record = 36 text characters (four rows of 9), then [duration u16][sound id u16] pairs, ended by a " +
        "0xFFFF word.  The records are followed by a table of 32-bit pointers to them (record_pointer_table) " +
        "and, directly after it, the item pointer table (see pickup_messages).  meta.table_ids / item_ids " +
        "list the table positions that point at the record.", entries, tables, ["Two table entries may point at the same record; ids in meta.table_ids are positions in " +
            "record_pointer_table, ids in meta.item_ids are positions in item_pointer_table."]);
}
function decodePickupMessages(rom: RomFile): Doc {
    const g = "pickup_messages";
    const recs = messageRecords(rom, "messages");
    const starts = new Map(recs.map((r, i) => [r.off, i] as [
        number,
        number
    ]));
    const entries: Entry[] = [];
    for (let itemId = 0; itemId < ITEM_COUNT; itemId++) {
        const ptrAt = ITEM_TABLE + 4 * itemId;
        const ptr = u32(rom, g, ptrAt, `item pointer ${itemId}`);
        const si = starts.get(ptr);
        if (si === undefined)
            throw new StringsError(`${g}: pointer ${itemId} at ${hex(ptrAt)} points to ${hex(ptr)}, which is not the start of a message record`);
        const r = recs[si]!;
        const lines = messageLines(r.text);
        entries.push(entry(g, itemId, r.off, lines.map(rows_).join("\n"), span(rom, g, r.off, r.end - r.off, "record"), {
            flat: flat(lines), item_id: itemId, lines, message: idRef("messages", si), name: messageName(r.text),
            pointer_rom_offset: hex(ptrAt), voice: r.pairs,
        }));
    }
    return groupDoc(g, [[ITEM_TABLE, ITEM_TABLE + 4 * ITEM_COUNT]], "The pickup messages, indexed by item id (id 0 is an empty message).", "15 32-bit pointers to message records; entry i is the message shown when item id i is collected.  " +
        "meta.name is the display name: the rows joined, the trailing 'COLLECTED' row dropped, a row-end " +
        "hyphen joins a split word.", entries);
}
function findWords(blob: Uint8Array, value: number): number[] {
    const b0 = (value >>> 24) & 255, b1 = (value >>> 16) & 255, b2 = (value >>> 8) & 255, b3 = value & 255;
    const out: number[] = [];
    for (let i = 0; i + 4 <= blob.length; i += 2) {
        if (blob[i] === b0 && blob[i + 1] === b1 && blob[i + 2] === b2 && blob[i + 3] === b3)
            out.push(i);
    }
    return out;
}
function decodeScenes(rom: RomFile): Doc {
    const g = "scenes";
    const [lo, hi] = SCENE_TEXT;
    const blob = span(rom, g, lo, hi - lo, "scene text block");
    const whole = span(rom, g, 0, rom.size, "ROM image");
    const scenes: Array<[
        number,
        string[],
        number
    ]> = [];
    let p = lo, rows: string[] = [], start = lo;
    while (p < hi) {
        if (blob[p - lo] === 0) {
            scenes.push([start, rows, p + 1]);
            p += 1;
            rows = [];
            start = p;
            continue;
        }
        if (p + SCENE_ROW + 1 > hi)
            throw new StringsError(`${g}: row at ${hex(p)} runs past the end of the text block ${hex(hi)}`);
        const raw = blob.subarray(p - lo, p - lo + SCENE_ROW + 1);
        if (raw[SCENE_ROW] !== 0)
            throw new StringsError(`${g}: row at ${hex(p)} is not followed by a NUL after ${SCENE_ROW} characters`);
        rows.push(printable(g, p, raw.subarray(0, SCENE_ROW), "row"));
        p += SCENE_ROW + 1;
    }
    if (rows.length || p !== hi)
        throw new StringsError(`${g}: the text block does not end with a scene terminator at ${hex(hi)}`);
    const entries: Entry[] = [];
    scenes.forEach(([s, rws, end], i) => {
        const refs = findWords(whole, s);
        if (!refs.length)
            throw new StringsError(`${g}: the scene at ${hex(s)} is not referenced by any word of the ROM; the row grid is probably misaligned`);
        entries.push(entry(g, i, s, rws.map(rows_).join("\n"), blob.subarray(s - lo, end - lo), {
            end_rom_offset: hex(end), referenced_by: refs.map(hex), row_count: rws.length, rows: rws,
        }));
    });
    return groupDoc(g, [SCENE_TEXT], "Story text pages (briefings, failure and victory texts, the ending and the credits).", "Rows of 36 characters + NUL; a scene is a run of rows closed by a row that starts with NUL " +
        "(a single NUL byte).  meta.referenced_by lists the even ROM offsets of 32-bit words equal to the " +
        "scene's start address; the scenes are shown by routines that load those words.", entries, undefined, ["Scenes are numbered in ROM order; which scene is shown when is decided by the code that " +
            "references it (meta.referenced_by), not by this table."]);
}
function decodeCharacterCards(rom: RomFile): Doc {
    const g = "character_cards";
    const entries: Entry[] = [];
    const fieldKeys = ["name", "code", "specialty", "height", "weight", "dob"];
    for (let slot = 0; slot < CARD_COUNT; slot++) {
        const off = CARD_BASE + CARD_STRIDE * slot;
        const raw = span(rom, g, off, CARD_STRIDE, `record ${slot}`);
        let pos = 0;
        const fields: string[] = [];
        const lines: string[] = [];
        for (let k = 0; k < CARD_FIELDS; k++) {
            const f = raw.subarray(pos, pos + CARD_FIELD_WIDTH + 1);
            if (f[CARD_FIELD_WIDTH] !== 0)
                throw new StringsError(`${g}: field ${k} of record ${slot} at ${hex(off + pos)} is not followed by a NUL`);
            fields.push(printable(g, off + pos, f.subarray(0, CARD_FIELD_WIDTH), `field ${k}`));
            pos += CARD_FIELD_WIDTH + 1;
        }
        for (let k = 0; k < CARD_LINES; k++) {
            const f = raw.subarray(pos, pos + CARD_LINE_WIDTH + 1);
            if (f[CARD_LINE_WIDTH] !== 0)
                throw new StringsError(`${g}: line ${k} of record ${slot} at ${hex(off + pos)} is not followed by a NUL`);
            lines.push(printable(g, off + pos, f.subarray(0, CARD_LINE_WIDTH), `line ${k}`));
            pos += CARD_LINE_WIDTH + 1;
        }
        if (pos !== CARD_STRIDE)
            throw new StringsError(`${g}: record layout adds up to ${pos} bytes, not ${CARD_STRIDE}`);
        const m = /^\s*CODE:\s*"([^"]*)"\s*$/.exec(fields[1]!);
        if (!m)
            throw new StringsError(`${g}: field 1 of record ${slot} at ${hex(off + CARD_FIELD_WIDTH + 1)} is not of the form CODE: "..."`);
        const vals = fields.map((f) => f.trim());
        const text = [...fields.map(rows_), ...lines.map(rows_)].join("\n");
        const fieldsObj: Record<string, string> = {};
        fieldKeys.forEach((k, i) => { fieldsObj[k] = vals[i]!; });
        entries.push(entry(g, slot, off, text, raw, { bio: lines.map(rstripSpaces), code_name: m[1]!, fields: fieldsObj, slot }));
    }
    return groupDoc(g, [[CARD_BASE, CARD_BASE + CARD_STRIDE * CARD_COUNT]], "The five ID cards of the character-select screen.", "Records of 318 bytes, slot = character index: six fields of 17 characters (name, code name, " +
        "specialty, height, weight, date of birth), then six lines of 34 characters; every field and " +
        "line is followed by a NUL.", entries);
}
function decodeOptionsMenu(rom: RomFile): Doc {
    const g = "options_menu";
    const entries: Entry[] = [];
    let p = OPTION_MENU;
    for (let i = 0; i < OPTION_STRINGS; i++) {
        const [text, end] = cstr(rom, g, p, `menu string ${i}`);
        const meta: Record<string, unknown> = { kind: "string" };
        if (text !== rstripSpaces(text))
            meta["stored"] = text;
        entries.push(entry(g, i, p, rows_(text), span(rom, g, p, end - p, "menu string"), meta));
        p = end;
    }
    if (p > OPTION_DIGITS || span(rom, g, p, OPTION_DIGITS - p, "padding").some((b) => b !== 0)) {
        throw new StringsError(`${g}: the digit table at ${hex(OPTION_DIGITS)} does not follow the menu strings (they end at ${hex(p)})`);
    }
    const [text, end] = cstr(rom, g, OPTION_DIGITS, "digit table");
    entries.push(entry(g, OPTION_STRINGS, OPTION_DIGITS, text, span(rom, g, OPTION_DIGITS, end - OPTION_DIGITS, "digit table"), { kind: "digit_table" }));
    return groupDoc(g, [[OPTION_MENU, end]], "The options menu: item labels, choices and the digit table of the sound test.", "NUL-terminated strings back to back; a padding NUL pads the end of the last choice to an even " +
        "address, where the 16-character digit table follows.  Some choices are padded with blanks to a " +
        "common width (meta.stored).", entries);
}
function decodePasswordScreen(rom: RomFile): Doc {
    const g = "password_screen";
    const entries: Entry[] = [];
    let p = 0;
    PASSWORD_MESSAGES.forEach((off, i) => {
        const [text, end] = cstr(rom, g, off, `message ${i}`);
        entries.push(entry(g, entries.length, off, text, span(rom, g, off, end - off, "message"), { kind: "message" }));
        p = end;
    });
    if (p !== PASSWORD_ROWS)
        throw new StringsError(`${g}: the keyboard rows should follow the messages at ${hex(p)}, they are announced at ${hex(PASSWORD_ROWS)}`);
    const rows: string[] = [];
    for (let r = 0; r < PASSWORD_ROW_COUNT; r++) {
        const [text, end] = cstr(rom, g, p, `keyboard row ${r}`);
        rows.push(text);
        entries.push(entry(g, entries.length, p, text, span(rom, g, p, end - p, "row"), { kind: "keyboard_row", row: r }));
        p = end;
    }
    if (p !== PASSWORD_BUTTONS)
        throw new StringsError(`${g}: the button row should follow the keyboard rows at ${hex(p)}, it is announced at ${hex(PASSWORD_BUTTONS)}`);
    const [btext, end] = cstr(rom, g, p, "button row");
    entries.push(entry(g, entries.length, p, btext, span(rom, g, p, end - p, "button row"), { kind: "buttons" }));
    const gridRaw = span(rom, g, PASSWORD_GRID, PASSWORD_CHARS, "character grid");
    const alphaRaw = span(rom, g, PASSWORD_ALPHABET, PASSWORD_CHARS, "code alphabet");
    const grid = printable(g, PASSWORD_GRID, gridRaw, "character grid");
    const alpha = printable(g, PASSWORD_ALPHABET, alphaRaw, "code alphabet");
    if (rows.map((r) => r.replace(/ /g, "")).join("") !== grid)
        throw new StringsError(`${g}: the keyboard rows do not spell the character grid at ${hex(PASSWORD_GRID)}`);
    const sortStr = (s: string): string => [...s].sort().join("");
    if (sortStr(grid) !== sortStr(alpha) || new Set(alpha).size !== PASSWORD_CHARS) {
        throw new StringsError(`${g}: the code alphabet at ${hex(PASSWORD_ALPHABET)} is not a permutation of the ${PASSWORD_CHARS} grid characters`);
    }
    entries.push(entry(g, entries.length, PASSWORD_GRID, grid, gridRaw, { kind: "grid", order: "on-screen order: 8 columns, 8 rows, row by row" }));
    entries.push(entry(g, entries.length, PASSWORD_ALPHABET, alpha, alphaRaw, {
        kind: "alphabet", order: "code order: the position of a character is its 6-bit value", same_glyphs_as: idRef(g, entries.length - 1),
    }));
    return groupDoc(g, [[PASSWORD_MESSAGES[0]!, end], [PASSWORD_GRID, PASSWORD_ALPHABET + PASSWORD_CHARS]], "The password entry screen: messages, keyboard, buttons and the two 64-character tables.", "NUL-terminated strings back to back (two messages, eight keyboard rows of eight characters " +
        "separated by blanks, one button row), then two tables of 64 characters without terminator: the " +
        "on-screen grid and the code alphabet (same 64 glyphs, different order; the keyboard rows spell " +
        "the grid).", entries, undefined, ["The code alphabet has no I, l, 0 or 1."]);
}
function decodeLinkScreens(rom: RomFile): Doc {
    const g = "link_screens";
    const entries: Entry[] = [];
    const ranges: Array<[
        number,
        number
    ]> = [];
    LINK_STRINGS.forEach((off, i) => {
        const [text, end] = cstr(rom, g, off, `string ${i}`);
        entries.push(entry(g, i, off, text, span(rom, g, off, end - off, "string"), {}));
        ranges.push([off, end]);
    });
    return groupDoc(g, ranges, "Texts of the two-player link waiting screens.", "NUL-terminated strings (the last two are adjacent).", entries);
}
function indexOfSeq(seg: Uint8Array, pat: number[], from: number): number {
    for (let i = from; i + pat.length <= seg.length; i++) {
        let ok = true;
        for (let k = 0; k < pat.length; k++)
            if (seg[i + k] !== pat[k]) {
                ok = false;
                break;
            }
        if (ok)
            return i;
    }
    return -1;
}
function decodeLiteralPasswords(rom: RomFile): Doc {
    const g = "literal_passwords";
    const entries: Entry[] = [];
    LITERAL_CHAINS.forEach(([a, b], i) => {
        const seg = span(rom, g, a, b - a, `compare chain ${i}`);
        if (!(seg[0] === 0x0c && seg[1] === 0x10 && seg[2] === 0x00))
            throw new StringsError(`${g}: the chain at ${hex(a)} does not start with a compare of the first character`);
        const chars: number[] = [seg[3]!];
        let pos = 4;
        for (let k = 1; k < LITERAL_LENGTH; k++) {
            const j = indexOfSeq(seg, [0x0c, 0x28, 0x00], pos);
            if (j < 0 || !(seg[j + 4] === 0 && seg[j + 5] === k))
                throw new StringsError(`${g}: the chain at ${hex(a)} has no compare of character ${k}`);
            chars.push(seg[j + 3]!);
            pos = j + 6;
        }
        const rest = seg.subarray(pos);
        let sel = -1;
        for (let i2 = 0; i2 + 6 <= rest.length; i2++) {
            if (rest[i2] === 0x1d && rest[i2 + 1] === 0x7c && rest[i2 + 2] === 0x00 && rest[i2 + 4] === 0xa8 && rest[i2 + 5] === 0xfc) {
                sel = rest[i2 + 3]!;
                break;
            }
        }
        if (sel < 0)
            throw new StringsError(`${g}: the chain at ${hex(a)} stores no level selector`);
        const raw = Uint8Array.from(chars);
        entries.push(entry(g, i, a, printable(g, a, raw, `literal password ${i}`), raw, { chain_end_rom_offset: hex(b), level_selector: sel }));
    });
    return groupDoc(g, [[LITERAL_CHAINS[0]![0], LITERAL_CHAINS[LITERAL_CHAINS.length - 1]![1]]], "Three passwords that bypass the encoded format: the game compares them character by character.", "Each password is a chain of nine compare-immediate instructions (the first character, then eight " +
        "indexed ones); the character is the immediate byte.  The chain ends by storing a level selector " +
        "(world * 16 + floor_index).  raw_hex holds the nine characters, not the code.", entries);
}
const DECODERS: ReadonlyArray<readonly [
    string,
    (rom: RomFile) => Doc
]> = [
    ["cartridge_header", decodeCartridgeHeader],
    ["boot_notices", decodeBootNotices],
    ["level_names", decodeLevelNames],
    ["level_captions", decodeLevelCaptions],
    ["map_labels", decodeMapLabels],
    ["messages", decodeMessages],
    ["pickup_messages", decodePickupMessages],
    ["scenes", decodeScenes],
    ["character_cards", decodeCharacterCards],
    ["options_menu", decodeOptionsMenu],
    ["password_screen", decodePasswordScreen],
    ["link_screens", decodeLinkScreens],
    ["literal_passwords", decodeLiteralPasswords],
];
const MAIN_TABLES: ReadonlyArray<readonly [
    number,
    number,
    number
]> = [
    [0xc7196, 0x4b0, 0x6000],
    [0x1dd3a, 0x001, 0x8000],
];
const CHAR_FIRST = 0x20, CHAR_LAST = 0x7a;
function mainChars(rom: RomFile): Set<string> {
    const maps: string[][] = [];
    for (const [table, first, flags] of MAIN_TABLES) {
        const m: string[] = [];
        for (let code = CHAR_FIRST; code <= CHAR_LAST; code++) {
            const pair: string[] = [];
            for (let half = 0; half < 2; half++) {
                const w = rom.u16be(table + (code - 0x20) * 4 + half * 2);
                if (w === 0) {
                    pair.push("none");
                    continue;
                }
                if ((w & 0xf800) !== flags)
                    throw new Error(`table 0x${table.toString(16).toUpperCase()} char 0x${hex2(code)}: word 0x${w.toString(16).toUpperCase()} lacks flags`);
                const t = (w & 0x7ff) - first;
                if (!(t >= 0 && t < 150))
                    throw new Error(`table 0x${table.toString(16).toUpperCase()} char 0x${hex2(code)}: tile ${t} outside the font`);
                pair.push(String(t));
            }
            m.push(pair.join(","));
        }
        maps.push(m);
    }
    if (maps[0]!.join("|") !== maps[1]!.join("|"))
        throw new Error("the two text-writer tables disagree");
    const out = new Set<string>([" "]);
    maps[0]!.forEach((p, i) => { if (p !== "none,none")
        out.add(String.fromCharCode(CHAR_FIRST + i)); });
    return out;
}
function hudChars(rom: RomFile): Set<string> {
    const out = new Set<string>([" "]);
    for (let code = 0x20; code <= 0x5a; code++) {
        const w = rom.u16be(0x1e04c + (code - 0x20) * 2);
        if (w === 0xe573)
            continue;
        const t = (w & 0x7ff) - 0x574;
        if ((w & 0xf800) !== 0xe000 || !(t >= 0 && t < 40))
            throw new Error(`HUD letter table: char 0x${hex2(code)} word 0x${w.toString(16).toUpperCase()} is not a font tile`);
        out.add(String.fromCharCode(code));
    }
    return out;
}
function font2Chars(): Set<string> {
    const out = new Set<string>([" "]);
    for (let i = 0; i < 10; i++)
        out.add(String.fromCharCode(0x30 + i));
    for (let i = 0; i < 26; i++)
        out.add(String.fromCharCode(0x41 + i));
    return out;
}
function addCoverage(doc: Doc, maps: Record<string, Set<string>>): Doc {
    const chars = new Set<string>([" "]);
    for (const e of doc["entries"] as Entry[])
        for (const c of e["text"] as string)
            if (c !== "\n")
                chars.add(c);
    doc["chars"] = [...chars].sort().join("");
    const cov: Record<string, boolean> = {};
    for (const k of Object.keys(maps).sort())
        cov[k] = [...chars].every((c) => maps[k]!.has(c));
    doc["glyph_coverage"] = cov;
    return doc;
}
export const strings: Command = {
    name: "strings",
    run(ctx: Context) {
        const rom = ctx.rom;
        const maps = { main: mainChars(rom), hud_letters: hudChars(rom), font2: font2Chars() };
        const summary: Array<Record<string, unknown>> = [];
        for (const [name, fn] of DECODERS) {
            const doc = addCoverage(fn(rom), maps);
            ctx.writeJson(`${OUT_DIR}/${name}.json`, doc, { group: name });
            const ents = doc["entries"] as Entry[];
            summary.push({
                count: ents.length, description: doc["description"], encoding: doc["encoding"], file: name + ".json",
                first_id: ents[0]!["id"], glyph_coverage: doc["glyph_coverage"], group: name, last_id: ents[ents.length - 1]!["id"],
                rom_offset: doc["rom_offset"], rom_ranges: doc["rom_ranges"],
            });
            ctx.say(`strings: ${name.padEnd(18)} ${String(ents.length).padStart(4)} entries  ${doc["rom_offset"]}`);
        }
        const total = summary.reduce((s, x) => s + (x["count"] as number), 0);
        const index = {
            format: INDEX_FORMAT,
            groups: summary,
            total_entries: total,
            notes: [
                "Every group is plain ASCII; the character code is the glyph code (see fonts/fonts.json for " +
                    "the code -> tile maps of the main font, the scroll-text font and the caption font).",
                "Entry ids are '<group>.<NN>', NN = position in ROM order.",
                "No other text was located in the ROM image: a search for printable runs and for ASCII shifted " +
                    "by a constant found only the strings listed here; other screen captions are not stored as text.",
            ],
        };
        ctx.writeJson(`${OUT_DIR}/index.json`, index, { set: "index" });
        ctx.say(`strings: ${summary.length} groups, ${total} entries, ${summary.length + 1} files`);
    },
};

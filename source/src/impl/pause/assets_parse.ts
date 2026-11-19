import type { PauseAssets, SlotTileSource } from "./types.js";
type Obj = Record<string, unknown>;
function obj(v: unknown, what: string): Obj {
    if (v === null || typeof v !== "object" || Array.isArray(v))
        throw new Error(`pause assets: ${what} is not an object`);
    return v as Obj;
}
function arr(v: unknown, what: string): unknown[] {
    if (!Array.isArray(v))
        throw new Error(`pause assets: ${what} is not an array`);
    return v;
}
function str(v: unknown, what: string): string {
    if (typeof v !== "string")
        throw new Error(`pause assets: ${what} is not a string`);
    return v;
}
function int(v: unknown, what: string): number {
    if (typeof v !== "number" || !Number.isInteger(v))
        throw new Error(`pause assets: ${what} is not an integer`);
    return v;
}
function word(v: unknown, what: string): number {
    if (typeof v === "number")
        return v;
    const s = str(v, what);
    const n = parseInt(s.startsWith("0x") || s.startsWith("0X") ? s.slice(2) : s, 16);
    if (Number.isNaN(n))
        throw new Error(`pause assets: ${what} is not a hex word: ${s}`);
    return n;
}
export function tileBytes(hex: string): Uint8Array {
    if (hex.length !== 64)
        throw new Error(`pause assets: a tile of ${hex.length} hex digits, expected 64`);
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++)
        out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
    return out;
}
export function bankSource(tilesDoc: unknown): {
    readonly source: SlotTileSource;
    readonly bank: (name: string) => ReadonlyArray<Uint8Array>;
} {
    const banks = obj(obj(tilesDoc, "tiles.json")["banks"], "tiles.json banks");
    const bySlot = new Map<number, Uint8Array>();
    const byName = new Map<string, Uint8Array[]>();
    for (const [name, b] of Object.entries(banks)) {
        const bo = obj(b, `bank ${name}`);
        const first = int(bo["first_tile_slot"], `bank ${name} first_tile_slot`);
        const tiles = arr(bo["tiles"], `bank ${name} tiles`).map((t) => tileBytes(str(t, `bank ${name} tile`)));
        tiles.forEach((t, i) => bySlot.set(first + i, t));
        byName.set(name, tiles);
    }
    return { source: (slot) => bySlot.get(slot), bank: (name) => byName.get(name) ?? [] };
}
export function pauseAssetsFrom(pauseDoc: unknown, tilesDoc: unknown): PauseAssets {
    const p = obj(pauseDoc, "pause.json");
    const backdrop = obj(p["backdrop"], "backdrop");
    const rows = arr(backdrop["entry_rows"], "backdrop.entry_rows").map((r, i) => str(r, `entry_rows[${i}]`).trim().split(/\s+/).map((w) => word(w, "backdrop word")));
    const palettes = obj(p["palettes"], "palettes");
    const captionCram = arr(obj(palettes["caption_line"], "caption_line")["cram_words"], "cram_words").map((w) => word(w, "cram word"));
    const map = obj(p["map"], "map");
    const classToLook = arr(map["class_to_look"], "class_to_look").map((v) => int(v, "class_to_look"));
    const looks = arr(map["looks"], "map.looks").map((l, i) => {
        const lo = obj(l, `look ${i}`);
        if (int(lo["look"], "look index") !== i)
            throw new Error(`pause assets: looks[${i}] has index ${String(lo["look"])}`);
        return arr(lo["rows"], `look ${i} rows`).map((r) => [...str(r, "glyph row")].map((ch) => parseInt(ch, 16)));
    });
    const tb = obj(map["tile_block"], "map.tile_block");
    const marker = obj(p["marker"], "marker");
    const label = obj(p["label"], "label");
    const wr = obj(label["word_rule"], "label.word_rule");
    const baseOf = (s: unknown, what: string): number => {
        const m = /0x([0-9A-Fa-f]+)/.exec(str(s, what));
        if (!m)
            throw new Error(`pause assets: ${what}: no hex base in ${String(s)}`);
        return parseInt(m[1]!, 16);
    };
    const captions = obj(p["captions"], "captions");
    const status = obj(captions["status"], "captions.status");
    const titles = obj(captions["carry_over_titles"], "captions.carry_over_titles");
    const writer = new Map<number, {
        upper: number;
        lower: number;
    }>();
    for (const c of arr(obj(captions["writer"], "captions.writer")["characters"], "writer.characters")) {
        const co = obj(c, "writer character");
        writer.set(int(co["code"], "writer code"), { upper: word(co["upper_word"], "upper_word"), lower: word(co["lower_word"], "lower_word") });
    }
    const levelNames: string[] = [];
    for (const r of arr(obj(captions["level_names"], "level_names")["rows"], "level_names.rows")) {
        const ro = obj(r, "level name row");
        levelNames[int(ro["index"], "level name index")] = str(ro["text"], "level name text");
    }
    const labels: string[] = [];
    for (const r of arr(label["table_entries"], "label.table_entries")) {
        const ro = obj(r, "label entry");
        labels[int(ro["index"], "label index")] = str(ro["text"], "label text");
    }
    const bk = bankSource(tilesDoc);
    const symbols = bk.bank("symbols");
    const markerTile = symbols[int(marker["tile_index_in_bank"], "marker.tile_index_in_bank")];
    if (markerTile === undefined)
        throw new Error("pause assets: the marker's tile is not in the symbols bank");
    return {
        backdrop: rows,
        captionCram,
        tiles: bk.source,
        classToLook,
        looks,
        planFirstWord: word(tb["first_tile_word"], "tile_block.first_tile_word"),
        planFirstSlot: int(tb["first_tile_slot"], "tile_block.first_tile_slot"),
        marker: { attr: word(marker["attribute_word"], "marker.attribute_word"), tile: markerTile },
        labels,
        labelWord: { blank: baseOf(wr["below_0x30"], "word_rule.below_0x30"), digit: baseOf(wr["digit"], "word_rule.digit"), letter: baseOf(wr["letter"], "word_rule.letter") },
        levelNames,
        status: {
            secured: str(obj(status["secured"], "status.secured")["text"], "status.secured.text"),
            notSecured: str(obj(status["not_secured"], "status.not_secured")["text"], "status.not_secured.text"),
        },
        carryTitles: {
            episode1: str(obj(titles["episode_1"], "carry episode_1")["text"], "carry episode_1 text"),
            other: str(obj(titles["other_episodes"], "carry other_episodes")["text"], "carry other text"),
        },
        writer,
        clearWord: word(obj(captions["clear"], "captions.clear")["value"], "captions.clear.value"),
    };
}

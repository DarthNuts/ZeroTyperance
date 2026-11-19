import type { FloorMap } from "./core.js";
export const MAPS_FORMAT = "ztassets-maps/1";
export const FLOOR_DOC_FORMAT = "zt-rend-floor/2";
const WALL_LABELS = ["n", "e", "w", "s"] as const;
export const METATEXTURE_SLOTS = 8;
export interface FloorDoc {
    readonly format: typeof FLOOR_DOC_FORMAT;
    readonly episode: number;
    readonly floor: number;
    readonly side: number;
    readonly mode: number;
    readonly classes: readonly number[];
    readonly blocks: readonly number[];
    readonly words: Readonly<Record<number, readonly number[]>>;
    readonly metatextures: ReadonlyArray<readonly number[]>;
}
interface MapsDoc {
    format?: unknown;
    episode?: {
        index?: unknown;
    };
    grid?: {
        width?: unknown;
        height?: unknown;
    };
    meta?: {
        render_mode_by_floor?: unknown;
    };
    blocks?: Array<{
        index?: unknown;
        props?: unknown;
        walls?: Record<string, unknown>;
    }>;
    floors?: Array<{
        index?: unknown;
        grid?: unknown;
    }>;
    metatextures?: unknown;
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
export function floorDocFrom(doc: unknown, floor: number, side: number): FloorDoc {
    const d = doc as MapsDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("maps document: not an object");
    if (d.format !== MAPS_FORMAT)
        throw new Error(`maps document: format ${String(d.format)}, expected ${MAPS_FORMAT}`);
    const episode = d.episode?.index;
    if (!isInt(episode))
        throw new Error("maps document: no episode index");
    if (d.grid?.width !== side || d.grid?.height !== side)
        throw new Error(`maps document: the grid is ${String(d.grid?.width)} x ${String(d.grid?.height)}, the spec says ${side} x ${side}`);
    if (!Array.isArray(d.blocks))
        throw new Error("maps document: no blocks table");
    const props = new Map<number, number>();
    const wordsOf = new Map<number, number[]>();
    for (const b of d.blocks) {
        if (!isInt(b.index) || !isInt(b.props))
            throw new Error("maps document: a block without index/props");
        props.set(b.index, b.props);
        const w = b.walls;
        if (!w || typeof w !== "object")
            throw new Error(`maps document: block ${b.index} has no walls`);
        const words = WALL_LABELS.map((l) => {
            const v = w[l];
            if (!isInt(v) || v < 0)
                throw new Error(`maps document: block ${b.index}: wall word ${l} is not an integer`);
            return v;
        });
        wordsOf.set(b.index, words);
    }
    const modes = d.meta?.render_mode_by_floor;
    if (!Array.isArray(modes) || !modes.every(isInt))
        throw new Error("maps document: meta.render_mode_by_floor is not a list of integers");
    const mode = modes[floor];
    if (mode === undefined)
        throw new Error(`maps document: no render mode of floor ${floor}`);
    const f = d.floors?.find((x) => x.index === floor);
    if (!f || !Array.isArray(f.grid) || f.grid.length !== side)
        throw new Error(`maps document: no ${side}-row grid of floor ${floor}`);
    const classes: number[] = [];
    const blocks: number[] = [];
    const words: Record<number, readonly number[]> = {};
    for (let y = 0; y < side; y++) {
        const row = f.grid[y] as unknown;
        if (!Array.isArray(row) || row.length !== side || !row.every(isInt))
            throw new Error(`maps document: row ${y} of floor ${floor} is not ${side} block indices`);
        for (const block of row as number[]) {
            const cls = props.get(block);
            if (cls === undefined)
                throw new Error(`maps document: block ${block} of floor ${floor} is not in the blocks table`);
            classes.push(cls);
            blocks.push(block);
            words[block] = Object.freeze(wordsOf.get(block)!);
        }
    }
    const mt = d.metatextures;
    if (!Array.isArray(mt) || !mt.every((def) => Array.isArray(def) && def.length === METATEXTURE_SLOTS && def.every(isInt))) {
        throw new Error(`maps document: metatextures is not a list of ${METATEXTURE_SLOTS}-slot definitions`);
    }
    return Object.freeze({
        format: FLOOR_DOC_FORMAT,
        episode,
        floor,
        side,
        mode,
        classes: Object.freeze(classes),
        blocks: Object.freeze(blocks),
        words: Object.freeze(words),
        metatextures: Object.freeze((mt as number[][]).map((def) => Object.freeze(def.slice()))),
    });
}
export function floorMapFrom(doc: FloorDoc): FloorMap & {
    readonly doc: FloorDoc;
} {
    if (doc.format !== FLOOR_DOC_FORMAT)
        throw new Error(`floor: format ${String(doc.format)}, expected ${FLOOR_DOC_FORMAT}`);
    const side = doc.side;
    if (doc.classes.length !== side * side || doc.blocks.length !== side * side)
        throw new Error(`floor: ${doc.classes.length} classes / ${doc.blocks.length} blocks, expected ${side * side}`);
    const slots: number[] = [];
    for (const def of doc.metatextures)
        slots.push(...def);
    return Object.freeze({
        doc,
        mode: doc.mode,
        episode: doc.episode,
        classAt(x: number, y: number): number | null {
            if (x < 0 || y < 0 || x >= side || y >= side)
                return null;
            return doc.classes[y * side + x]!;
        },
        faceWord(x: number, y: number, word: number): number | null {
            if (x < 0 || y < 0 || x >= side || y >= side)
                return null;
            return doc.words[doc.blocks[y * side + x]!]?.[word] ?? null;
        },
        textureOfSlot(word: number, slot: number): number | null {
            const i = word * METATEXTURE_SLOTS + slot;
            return i >= 0 && i < slots.length ? slots[i]! : null;
        },
    });
}

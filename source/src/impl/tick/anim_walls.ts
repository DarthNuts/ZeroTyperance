import { METATEXTURE_SLOTS } from "../rend/floor_map.js";
interface Patch {
    readonly target: number;
    readonly value: number;
}
interface Frame {
    readonly patches: readonly Patch[];
    readonly nextOffset: number;
}
export interface AnimWallRecord {
    subframe: number;
    readonly reload: number;
    frame: number;
    readonly frames: ReadonlyMap<number, Frame>;
}
export interface AnimWallState {
    readonly table: number[];
    readonly records: AnimWallRecord[];
}
const BYTE_MASK = 0xff;
const BYTES_PER_WORD = 2;
interface MapsDocShape {
    metatextures?: unknown;
    spawn_table?: {
        entries?: unknown;
    };
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
export function animWallsStart(mapsDoc: unknown): AnimWallState {
    const d = mapsDoc as MapsDocShape | null;
    if (!d || typeof d !== "object")
        throw new Error("maps document: not an object");
    const mt = d.metatextures;
    if (!Array.isArray(mt) || !mt.every((def) => Array.isArray(def) && def.length === METATEXTURE_SLOTS && def.every(isInt))) {
        throw new Error(`maps document: metatextures is not a list of ${METATEXTURE_SLOTS}-slot definitions`);
    }
    const table: number[] = [];
    for (const def of mt as number[][])
        table.push(...def);
    const entries = d.spawn_table?.entries;
    if (!Array.isArray(entries))
        throw new Error("maps document: spawn_table.entries is not a list (ZT-REND-WALL 4.11a)");
    const records: AnimWallRecord[] = entries.map((e: unknown, i: number) => {
        const r = e as {
            subframe?: unknown;
            reload?: unknown;
            sublist_offset?: unknown;
            frames?: unknown;
        };
        if (!isInt(r.subframe) || !isInt(r.reload) || !isInt(r.sublist_offset) || !Array.isArray(r.frames)) {
            throw new Error(`maps document: spawn_table.entries[${i}] lacks subframe / reload / sublist_offset / frames`);
        }
        const frames = new Map<number, Frame>();
        for (const f of r.frames as Array<{
            offset?: unknown;
            next_offset?: unknown;
            patches?: unknown;
        }>) {
            if (!isInt(f.offset) || !isInt(f.next_offset) || !Array.isArray(f.patches))
                throw new Error(`maps document: spawn_table.entries[${i}]: a frame lacks offset / next_offset / patches`);
            const patches = (f.patches as Array<{
                target?: unknown;
                value?: unknown;
            }>).map((p) => {
                if (!isInt(p.target) || !isInt(p.value))
                    throw new Error(`maps document: spawn_table.entries[${i}]: a patch lacks target / value`);
                return { target: p.target, value: p.value };
            });
            frames.set(f.offset, { patches, nextOffset: f.next_offset });
        }
        return { subframe: r.subframe, reload: r.reload, frame: r.sublist_offset, frames };
    });
    return { table, records };
}
export function animatedDefinitions(s: AnimWallState): ReadonlySet<number> {
    const out = new Set<number>();
    for (const r of s.records)
        for (const f of r.frames.values())
            for (const p of f.patches)
                out.add(Math.floor(p.target / BYTES_PER_WORD / METATEXTURE_SLOTS));
    return out;
}
export function animWallsClone(s: AnimWallState): AnimWallState {
    return { table: s.table.slice(), records: s.records.map((r) => ({ subframe: r.subframe, reload: r.reload, frame: r.frame, frames: r.frames })) };
}
export function animWallsStep(s: AnimWallState): void {
    for (const r of s.records) {
        r.subframe = (r.subframe - 1) & BYTE_MASK;
        if (r.subframe !== 0)
            continue;
        r.subframe = r.reload;
        const f = r.frames.get(r.frame);
        if (!f)
            throw new Error(`animated-wall chain: no frame at offset ${r.frame} (ZT-REND-WALL 4.11a)`);
        for (const p of f.patches) {
            const w = Math.floor(p.target / BYTES_PER_WORD);
            if (w < 0 || w >= s.table.length)
                throw new Error(`animated-wall chain: patch target ${p.target} is outside the table (ZT-REND-WALL 4.11a)`);
            s.table[w] = p.value;
        }
        r.frame = f.nextOffset;
    }
}
export interface FloorSign {
    readonly METATEX: number;
    readonly SLOTS: readonly number[];
    readonly BASE: number;
    readonly DIGIT_TEX: readonly number[];
    readonly BLANK_TEX: number;
}
export function floorSignWrite(s: AnimWallState, floor: number, SIGN: FloorSign): void {
    const n = SIGN.BASE - floor;
    const digit = (d: number): number => {
        const t = SIGN.DIGIT_TEX[d];
        if (t === undefined)
            throw new Error(`floor sign: no texture for the digit ${d} (ZT-WORLD-LIFT 4.4 item 2a)`);
        return t;
    };
    const hundreds = n < 100 ? SIGN.BLANK_TEX : digit(Math.floor(n / 100) % 10);
    const tens = n % 100 < 10 ? SIGN.BLANK_TEX : digit(Math.floor(n / 10) % 10);
    const ones = digit(n % 10);
    const words = [hundreds, tens, ones];
    SIGN.SLOTS.forEach((slot, i) => {
        const w = SIGN.METATEX * METATEXTURE_SLOTS + slot;
        if (w < 0 || w >= s.table.length)
            throw new Error(`floor sign: slot ${slot} of definition ${SIGN.METATEX} is outside the table`);
        s.table[w] = words[i]!;
    });
}
export function animWallsDefinitions(s: AnimWallState): number[][] {
    const out: number[][] = [];
    for (let i = 0; i < s.table.length; i += METATEXTURE_SLOTS)
        out.push(s.table.slice(i, i + METATEXTURE_SLOTS));
    return out;
}

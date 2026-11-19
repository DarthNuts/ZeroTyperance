import type { FloorClasses } from "./core.js";
export const MAPS_FORMAT = "ztassets-maps/1";
interface MapsDoc {
    format?: unknown;
    grid?: {
        width?: unknown;
        height?: unknown;
    };
    blocks?: Array<{
        index?: unknown;
        props?: unknown;
    }>;
    floors?: Array<{
        index?: unknown;
        grid?: unknown;
    }>;
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
export function floorClassesOf(side: number, classes: readonly number[]): FloorClasses {
    if (classes.length !== side * side)
        throw new Error(`floor classes: ${classes.length} entries, expected ${side} x ${side}`);
    return Object.freeze({
        side,
        classAt(x: number, y: number): number {
            if (x < 0 || y < 0 || x >= side || y >= side)
                throw new Error(`floor cell (${x}, ${y}) is outside the ${side} x ${side} grid`);
            return classes[y * side + x]!;
        },
    });
}
export function floorClassesFromMaps(doc: unknown, floor: number): FloorClasses & {
    readonly classes: readonly number[];
} {
    const d = doc as MapsDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("maps document: not an object");
    if (d.format !== MAPS_FORMAT)
        throw new Error(`maps document: format ${String(d.format)}, expected ${MAPS_FORMAT}`);
    const w = d.grid?.width;
    const h = d.grid?.height;
    if (!isInt(w) || !isInt(h) || w !== h)
        throw new Error(`maps document: the grid is ${String(w)} x ${String(h)}, not square`);
    if (!Array.isArray(d.blocks))
        throw new Error("maps document: no blocks table");
    const props = new Map<number, number>();
    for (const b of d.blocks) {
        if (!isInt(b.index) || !isInt(b.props))
            throw new Error("maps document: a block without index/props");
        props.set(b.index, b.props);
    }
    const f = d.floors?.find((x) => x.index === floor);
    if (!f || !Array.isArray(f.grid) || f.grid.length !== h)
        throw new Error(`maps document: no ${h}-row grid of floor ${floor}`);
    const classes: number[] = [];
    for (const row of f.grid as unknown[]) {
        if (!Array.isArray(row) || row.length !== w)
            throw new Error(`maps document: a row of floor ${floor} is not ${w} wide`);
        for (const block of row as unknown[]) {
            if (!isInt(block))
                throw new Error("maps document: a block index is not an integer");
            const cls = props.get(block);
            if (cls === undefined)
                throw new Error(`maps document: block ${block} has no entry in the blocks table`);
            classes.push(cls);
        }
    }
    return Object.freeze({ ...floorClassesOf(w, classes), classes: Object.freeze(classes) });
}

import type { MoveConstants } from "./constants.js";
export type CellKind = "open" | "solid" | "ne" | "se" | "sw" | "nw";
export interface FloorKinds {
    readonly width: number;
    readonly kinds: readonly CellKind[];
    kindAt(index: number): CellKind;
    readonly classes: readonly number[];
    classAt(index: number): number;
}
export function kindOfClass(cls: number, C: MoveConstants): CellKind {
    if (C.COLLISION.SOLID_CLASSES.includes(cls))
        return "solid";
    const d = C.COLLISION.DIAGONALS.find((e) => e.class === cls);
    return d ? d.blocked : "open";
}
export function floorKindsOf(classes: readonly number[], C: MoveConstants): FloorKinds {
    const width = C.MAP.WIDTH;
    if (classes.length !== width * width)
        throw new Error(`floor: ${classes.length} cells, the step needs a ${width} x ${width} floor`);
    const kinds: CellKind[] = classes.map((cls) => kindOfClass(cls, C));
    const n = kinds.length;
    return Object.freeze({
        width,
        kinds: Object.freeze(kinds),
        kindAt(index: number): CellKind {
            return index < 0 || index >= n ? "open" : kinds[index]!;
        },
        classes: Object.freeze([...classes]),
        classAt(index: number): number {
            return index < 0 || index >= n ? -1 : classes[index]!;
        },
    });
}

import { MAPS_FORMAT } from "../hud/floor_classes.js";
import { doorConstantsFrom } from "./constants.js";
import type { DoorConstants } from "./constants.js";
import type { PackSource } from "../release/pack_source.js";
export interface DoorEnvironmentFrom {
    readonly C: DoorConstants;
    readonly dataDoc: unknown;
}
export function loadDoorEnvironmentFrom(src: PackSource): DoorEnvironmentFrom {
    const dataDoc = src.data("door");
    const C = doorConstantsFrom(dataDoc);
    return Object.freeze({ C, dataDoc });
}
interface MapsDoc {
    format?: unknown;
    blocks?: Array<{
        index?: unknown;
        props?: unknown;
    }>;
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
export function blockClassTableFrom(mapsDoc: unknown): number[] {
    const d = mapsDoc as MapsDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("maps document: not an object");
    if (d.format !== MAPS_FORMAT)
        throw new Error(`maps document: format ${String(d.format)}, expected ${MAPS_FORMAT}`);
    if (!Array.isArray(d.blocks))
        throw new Error("maps document: no blocks table");
    const table: number[] = [];
    for (const b of d.blocks) {
        if (!isInt(b.index) || b.index < 0 || !isInt(b.props))
            throw new Error("maps document: a block without index/props");
        while (table.length <= b.index)
            table.push(-1);
        table[b.index] = b.props;
    }
    return table;
}

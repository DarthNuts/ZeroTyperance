import { trigFrom } from "../rend/trig.js";
import { moveConstantsFrom } from "./constants.js";
import type { MoveConstants } from "./constants.js";
import type { ViewTable } from "./core.js";
import type { PackSource } from "../release/pack_source.js";
export interface MoveEnvironmentFrom {
    readonly C: MoveConstants;
    readonly view: ViewTable;
    readonly dataDoc: unknown;
}
export function loadMoveEnvironmentFrom(src: PackSource): MoveEnvironmentFrom {
    const dataDoc = src.data("move");
    const C = moveConstantsFrom(dataDoc);
    const trigDoc = src.data("trig_table");
    const view = trigFrom(trigDoc, C.ANGLE.UNITS);
    return Object.freeze({ C, view, dataDoc });
}

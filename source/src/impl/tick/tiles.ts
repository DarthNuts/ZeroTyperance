import type { Rng } from "../../rng.js";
import { draw } from "../hydaca/arith.js";
import { TICK } from "./constants.js";
export interface TileGroup {
    counter: number;
    offset: number;
    phase: number;
}
export interface TilePassState {
    cursor: number;
    g1: TileGroup;
    g2: TileGroup;
    g3: TileGroup;
}
export function tilePassStart(from: TilePassState): TilePassState {
    return { cursor: from.cursor, g1: { ...from.g1 }, g2: { ...from.g2 }, g3: { ...from.g3 } };
}
export function tilePass(t: TilePassState, rng: Rng): {
    readonly index: 1 | 2 | 3;
    readonly group: TileGroup;
} {
    const T = TICK.TILES;
    t.cursor -= 1;
    let g: TileGroup;
    let index: 1 | 2 | 3;
    if (t.cursor > 0) {
        g = t.g1;
        index = 1;
    }
    else if (t.cursor === 0) {
        g = t.g2;
        index = 2;
    }
    else {
        g = t.g3;
        index = 3;
        t.cursor = T.CURSOR_RESET;
    }
    g.counter -= 1;
    if (g.counter < 0) {
        g.counter += T.WRAP;
        g.offset = (g.offset + T.OFFSET_STEP) & T.OFFSET_MASK;
        const seed = draw(rng);
        g.phase = (seed >>> T.PHASE_SHIFT) & T.PHASE_MASK;
    }
    return { index, group: g };
}

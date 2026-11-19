import type { HudConstants } from "../hud/constants.js";
import { TILE_SIZE } from "../hud/words.js";
export interface CardWindow {
    readonly col: number;
    readonly row: number;
    readonly cols: number;
    readonly rows: number;
}
export interface SlotsHud {
    readonly order: readonly number[];
    readonly redPosition: number;
    readonly windows: readonly CardWindow[];
}
export function slotsHud(ring0: number, C: HudConstants): SlotsHud {
    const n = C.CARD.X_WORDS.length;
    if (!Number.isInteger(ring0) || ring0 < 0 || ring0 >= n)
        throw new Error(`slotsHud: slot ${ring0} is not 0 .. ${n - 1}`);
    const order = Array.from({ length: n }, (_, k) => k);
    const redPosition = C.CARD.RING_WALK.indexOf(0);
    if (redPosition < 0)
        throw new Error("slotsHud: the ring walk places no card in hand");
    const span = (from: number, len: number): {
        first: number;
        count: number;
    } => {
        const first = Math.floor(from / TILE_SIZE);
        return { first, count: Math.ceil((from + len) / TILE_SIZE) - first };
    };
    const windows = C.CARD.X_WORDS.map((x) => {
        const c = span(x - C.SPRITE_ORIGIN, C.CARD.W * TILE_SIZE);
        const r = span(C.CARD.Y_WORD - C.SPRITE_ORIGIN, C.CARD.H * TILE_SIZE);
        return { col: c.first, row: r.first, cols: c.count, rows: r.count };
    });
    return { order, redPosition, windows };
}
export function slotsWindowCells(cells: readonly (readonly number[])[], ring0: number, C: HudConstants): number[][] {
    const out = cells.map((r) => [...r]);
    const h = slotsHud(ring0, C);
    if (ring0 === h.redPosition)
        return out;
    const red = h.windows[h.redPosition]!;
    const hand = h.windows[ring0]!;
    for (let r = 0; r < red.rows; r++) {
        for (let c = 0; c < red.cols; c++) {
            const a = cells[red.row + r]?.[red.col + c];
            const b = cells[hand.row + r]?.[hand.col + c];
            if (a === undefined || b === undefined)
                throw new Error(`slotsWindowCells: the windows lie outside plane B (${red.col + c}, ${red.row + r})`);
            out[hand.row + r]![hand.col + c] = a;
            out[red.row + r]![red.col + c] = b;
        }
    }
    return out;
}

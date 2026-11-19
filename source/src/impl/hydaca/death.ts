import { cellIndex, cellWindow, colRowOfIndex, s16, sar, windowCell } from "./arith.js";
import type { Ctx } from "./common.js";
import { clearFlagBits, floorRecount, mapWrite, noteOutside, soundRequest } from "./common.js";
import { SPECIAL_CORPSE, VECTORS } from "./constants.js";
export function deathTransition(ctx: Ctx): void {
    const { C } = ctx;
    soundRequest(ctx, C.DEATH_SOUND);
    if (ctx.h.hit_mark !== 0)
        specialCorpse(ctx);
    else
        plainCorpse(ctx);
}
function specialCorpse(ctx: Ctx): void {
    const { e, C } = ctx;
    e.type = SPECIAL_CORPSE.type;
    e.type_alias = null;
    delete e.hidden;
    e.form = "corpse";
    e.vec.ai = VECTORS.special.ai;
    e.vec.damage = VECTORS.special.damage;
    e.vec.draw = VECTORS.special.draw;
    e.vec.death = VECTORS.special.death;
    e.art = SPECIAL_CORPSE.art;
    e.cell_class.dead = C.SPECIAL_CORPSE_CLASS;
    clearFlagBits(ctx, C.FLAG_ALIVE_BIT | C.FLAG_FAR_BIT | C.FLAG_FLOOR_BIT);
    e.timer = 0;
    e.vel.x = 0;
    e.vel.y = 0;
    floorRecount(ctx);
    noteOutside(ctx, `death transition (4.10 step 2): in link play a death message is also sent; not modelled (single play, ` +
        `the runner's WorldView carries no link state); what the special corpse does next is the corpse spec's`);
}
function plainCorpse(ctx: Ctx): void {
    const { e, C } = ctx;
    clearFlagBits(ctx, C.FLAG_ALIVE_BIT | C.FLAG_FAR_BIT | C.FLAG_FLOOR_BIT);
    e.vec.ai = VECTORS.corpse.ai;
    e.vec.draw = VECTORS.corpse.draw;
    e.vec.damage = VECTORS.corpse.damage;
    e.vec.death = VECTORS.corpse.death;
    e.form = "corpse";
    e.timer = 0;
    e.vel.x = 0;
    e.vel.y = 0;
    e.state = C.STATE_FLOOR;
    floorRecount(ctx);
    noteOutside(ctx, `death transition (4.10 step 3): in link play a death message is also sent; not modelled (single play, ` +
        `the runner's WorldView carries no link state)`);
}
export interface FoldOptions {
    readonly cls: (e: Ctx["e"]) => number;
    readonly recountWhenPinned: boolean;
}
export const LIVE_FOLD: FoldOptions = { cls: (e) => e.cell_class.alive, recountWhenPinned: true };
export const CORPSE_FOLD: FoldOptions = { cls: (e) => e.cell_class.dead, recountWhenPinned: false };
export function foldBack(ctx: Ctx, opts: FoldOptions = LIVE_FOLD): void {
    const { e, C } = ctx;
    const stride = C.ROW_STRIDE;
    const order: ReadonlyArray<readonly [
        number,
        number
    ]> = [
        [0, 0],
        [-1, 0],
        [+1, 0],
        [0, -1],
        [0, +1],
        [-1, +1],
        [+1, +1],
        [+1, -1],
        [-1, -1],
    ];
    const reached = cellIndex(e.pos.x, e.pos.y, stride);
    const window = cellWindow(ctx.h.cells_around);
    const cdx = sar(s16(e.pos.x), 8) - sar(s16(ctx.start.x), 8);
    const cdy = sar(s16(e.pos.y), 8) - sar(s16(ctx.start.y), 8);
    let chosen: number | null = null;
    for (const [dx, dy] of order) {
        const block = windowCell(window, dx + cdx, dy + cdy);
        if (block === null) {
            throw new Error(`fold back (4.11 step 1): cells_around has no block byte at window cell (${dx + cdx}, ${dy + cdy}) ` +
                `(outside the floors' storage, 7.6): the spec does not say whether it counts as empty`);
        }
        if (block === 0) {
            chosen = reached + dx + stride * dy;
            break;
        }
    }
    if (chosen !== null) {
        const { col, row } = colRowOfIndex(chosen, stride);
        mapWrite(ctx, e.floor, col, row, ctx.markerBlock(ctx.view.level.episode.value, opts.cls(e)));
    }
    else {
        if (opts.recountWhenPinned)
            floorRecount(ctx);
    }
    noteOutside(ctx, `fold back (4.11 step 4): entity of slot ${e.slot} removed from the pool`);
    ctx.removed = true;
}

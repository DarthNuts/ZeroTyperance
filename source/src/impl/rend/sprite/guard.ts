import type { GuardConstants } from "../../guard/constants.js";
import type { DrawChoice } from "./soldier.js";
import type { EntityRecord } from "./types.js";
function rowOf(table: ReadonlyArray<readonly [
    number,
    number,
    number
]>, counter: number): number | null {
    for (const [lo, hi, b] of table)
        if (counter >= lo && counter <= hi)
            return b;
    return null;
}
export function guardDraw(rec: EntityRecord, G: GuardConstants): DrawChoice | null {
    const D = G.DRAW;
    if (rec.form === "corpse") {
        return { bank: D.BANK, state: G.CORPSE_BANK, d2: rec.counter & G.CORPSE_FRAME_MASK };
    }
    let state: number | null;
    if (rec.state === G.PAIN_STATE) {
        state = rowOf(rec.hp < 0 ? D.PAIN_LETHAL : D.PAIN, rec.counter & G.BYTE_MASK);
    }
    else if (rec.state === G.STAND_STATE) {
        const cue = rec.counter >= D.STAND_CUE[0] && rec.counter <= D.STAND_CUE[1];
        const pair = (rec.target ?? "player") === "player" ? D.STAND_PLAYER : D.STAND_OTHER;
        state = cue ? pair[0] : pair[1];
    }
    else if (rec.state < G.STAND_STATE) {
        state = D.WANDER;
    }
    else {
        state = null;
    }
    if (state === null)
        return null;
    return { bank: D.BANK, state, d2: D.OVERRIDE };
}

import type { MoveConstants, StairHold } from "./constants.js";
import type { FloorKinds } from "./floor_kinds.js";
import type { MoveState } from "./core.js";
import { asr, cellOf, fractionOf, u16 } from "./arith.js";
function holdRow(cls: number, index: number, floor: FloorKinds, C: MoveConstants): StairHold | null {
    const own = C.STAIR.CREST.get(cls);
    if (own)
        return own;
    const tests = C.STAIR.GUIDE.get(cls);
    if (!tests)
        return null;
    for (const [offset, crestClass] of tests) {
        if (floor.classAt(index + offset) === crestClass)
            return C.STAIR.CREST.get(crestClass) ?? null;
    }
    const dflt = C.STAIR.CREST.get(C.STAIR.GUIDE_DEFAULT);
    return dflt ?? null;
}
export function stairHold(state: MoveState, floor: FloorKinds, C: MoveConstants): void {
    const cell = C.POS.CELL;
    const col = cellOf(state.x, cell);
    const row = cellOf(state.y, cell);
    const index = col + floor.width * row;
    const cls = floor.classAt(index);
    const hasRule = C.STAIR.EASED.includes(cls) || C.STAIR.CREST.has(cls) || C.STAIR.GUIDE.has(cls);
    if (!hasRule)
        return;
    state.eyeOffset = asr(state.eyeOffset, C.STAIR.EYE_SHIFT);
    state.zVel = 0;
    state.jumpTimer = 0;
    const hold = holdRow(cls, index, floor, C);
    if (!hold)
        return;
    const v = hold.axis === "x" ? state.x : state.y;
    const frac = fractionOf(v, cell);
    const h = C.STAIR.HOLD;
    const turn = hold.kept === "high" ? frac < h : frac > h;
    if (!turn)
        return;
    const nv = u16(v - frac + h);
    if (hold.axis === "x")
        state.x = nv;
    else
        state.y = nv;
}

import type { MoveConstants } from "./constants.js";
import type { FloorKinds } from "./floor_kinds.js";
import type { MoveState } from "./core.js";
import { cellOf, u16 } from "./arith.js";
export function furniturePush(state: MoveState, floor: FloorKinds, C: MoveConstants): void {
    const cell = C.POS.CELL;
    const col = cellOf(state.x, cell);
    const row = cellOf(state.y, cell);
    const cls = floor.classAt(col + floor.width * row);
    const F = C.FURNITURE;
    const ring = F.LARGE_CLASSES.includes(cls) ? { limit: F.LARGE_LIMIT, radius: F.LARGE_RADIUS } : F.SMALL_CLASSES.includes(cls) ? { limit: F.SMALL_LIMIT, radius: F.SMALL_RADIUS } : null;
    if (!ring)
        return;
    const cx = col * cell + C.STAIR.HOLD;
    const cy = row * cell + C.STAIR.HOLD;
    const dx = state.x - cx;
    const dy = state.y - cy;
    const d = (Math.max(Math.abs(dx), Math.abs(dy)) + Math.abs(dx) + Math.abs(dy)) >> 1;
    if (d >= ring.limit)
        return;
    state.x = u16(cx + Math.trunc((dx * ring.radius) / (d + 1)));
    state.y = u16(cy + Math.trunc((dy * ring.radius) / (d + 1)));
}

import type { MoveConstants } from "./constants.js";
import type { MoveState, ViewTable } from "./core.js";
import type { CellKind, FloorKinds } from "./floor_kinds.js";
import { asr, cellOf, fractionOf, s16, stepToward, u16 } from "./arith.js";
function cellIndex(x: number, y: number, floor: FloorKinds, C: MoveConstants): number {
    return cellOf(x, C.POS.CELL) + floor.width * cellOf(y, C.POS.CELL);
}
export function blockedAt(x: number, y: number, floor: FloorKinds, C: MoveConstants): boolean {
    const px = u16(x);
    const py = u16(y);
    const kind = floor.kindAt(cellIndex(px, py, floor, C));
    return blockedInKind(kind, fractionOf(px, C.POS.CELL), fractionOf(py, C.POS.CELL), C);
}
function blockedInKind(kind: CellKind, fx: number, fy: number, C: MoveConstants): boolean {
    const top = C.POS.CELL - 1;
    switch (kind) {
        case "solid": return true;
        case "ne": return fx >= fy;
        case "se": return fx >= top - fy;
        case "sw": return fx <= fy;
        case "nw": return fx <= top - fy;
        default: return false;
    }
}
export function displace(state: MoveState, floor: FloorKinds, view: ViewTable, C: MoveConstants): void {
    if (state.forward === 0 && state.knockbackX === 0 && state.knockbackY === 0 && state.side === 0)
        return;
    const ahead = state.forward !== 0 ? state.forward : s16(state.knockbackX | state.knockbackY);
    if (state.forward !== 0 || state.knockbackX !== 0 || state.knockbackY !== 0) {
        state.knockbackX = s16(state.knockbackX + stepToward(-state.knockbackX, C.KNOCKBACK.SHIFT));
        state.knockbackY = s16(state.knockbackY + stepToward(-state.knockbackY, C.KNOCKBACK.SHIFT));
    }
    const e0 = view.sin256[state.angle]!;
    const e2 = view.neg_cos256[state.angle]!;
    let d1 = asr(ahead * e0, C.VIEW.SHIFT);
    let d2 = asr(ahead * e2, C.VIEW.SHIFT);
    if (state.side !== 0) {
        d1 += asr(-e2 * state.side, C.VIEW.SHIFT);
        d2 += asr(e0 * state.side, C.VIEW.SHIFT);
    }
    d1 += state.knockbackX;
    d2 += state.knockbackY;
    d1 = s16(d1);
    d2 = s16(d2);
    const x = state.x;
    const y = state.y;
    const probeX = u16(x + d1);
    const probeY = u16(y + d2);
    const probeKind = floor.kindAt(cellIndex(probeX, probeY, floor, C));
    let target: {
        x: number;
        y: number;
    } | null = null;
    if (probeKind === "open") {
        target = { x: probeX, y: probeY };
    }
    else if (probeKind === "solid") {
        if (!blockedAt(x + d1, y, floor, C))
            target = { x: u16(x + d1), y };
        else if (!blockedAt(x, y + d2, floor, C))
            target = { x, y: u16(y + d2) };
    }
    else if (!blockedInKind(probeKind, fractionOf(probeX, C.POS.CELL), fractionOf(probeY, C.POS.CELL), C)) {
        target = { x: probeX, y: probeY };
    }
    else {
        const h = asr(d2 - d1, 1);
        if (!blockedAt(x - h, y + h, floor, C))
            target = { x: u16(x - h), y: u16(y + h) };
        else if (!blockedAt(x + d1 + h, y + d2 - h, floor, C))
            target = { x: u16(x + d1 + h), y: u16(y + d2 - h) };
    }
    if (target === null)
        return;
    state.x = target.x;
    state.y = target.y;
    clamp(state, floor, C);
}
const BLOCKS_WEST: ReadonlySet<CellKind> = new Set<CellKind>(["solid", "ne", "se"]);
const BLOCKS_NORTH: ReadonlySet<CellKind> = new Set<CellKind>(["solid", "se", "sw"]);
const BLOCKS_EAST: ReadonlySet<CellKind> = new Set<CellKind>(["solid", "sw", "nw"]);
const BLOCKS_SOUTH: ReadonlySet<CellKind> = new Set<CellKind>(["solid", "ne", "nw"]);
const BLOCKS_NW: ReadonlySet<CellKind> = new Set<CellKind>(["solid", "ne", "se", "sw"]);
const BLOCKS_SW: ReadonlySet<CellKind> = new Set<CellKind>(["solid", "ne", "se", "nw"]);
const BLOCKS_NE: ReadonlySet<CellKind> = new Set<CellKind>(["solid", "se", "sw", "nw"]);
const BLOCKS_SE: ReadonlySet<CellKind> = new Set<CellKind>(["solid", "ne", "sw", "nw"]);
function clamp(state: MoveState, floor: FloorKinds, C: MoveConstants): void {
    const cell = C.POS.CELL;
    const w = floor.width;
    const { LOW, HIGH, QUADRANT, DIAGONAL_LOW: DL, DIAGONAL_HIGH: DH } = C.CLAMP;
    const cx = cellOf(state.x, cell);
    const cy = cellOf(state.y, cell);
    let fx = fractionOf(state.x, cell);
    let fy = fractionOf(state.y, cell);
    const i = cx + w * cy;
    const own = floor.kindAt(i);
    const west = fx < QUADRANT;
    const north = fy < QUADRANT;
    const quad: "nw" | "sw" | "ne" | "se" = north ? (west ? "nw" : "ne") : (west ? "sw" : "se");
    const edgeX = floor.kindAt(west ? i - 1 : i + 1);
    const edgeY = floor.kindAt(north ? i - w : i + w);
    const diag = floor.kindAt(i + (north ? -w : w) + (west ? -1 : 1));
    const xBlocks = (west ? BLOCKS_WEST : BLOCKS_EAST).has(edgeX);
    const yBlocks = (north ? BLOCKS_NORTH : BLOCKS_SOUTH).has(edgeY);
    const cornerSet = quad === "nw" ? BLOCKS_NW : quad === "sw" ? BLOCKS_SW : quad === "ne" ? BLOCKS_NE : BLOCKS_SE;
    const limX = west ? LOW : HIGH;
    const limY = north ? LOW : HIGH;
    if ((west ? fx < LOW : fx > HIGH) && xBlocks)
        fx = limX;
    if ((north ? fy < LOW : fy > HIGH) && yBlocks)
        fy = limY;
    if ((west ? fx < LOW : fx > HIGH) && (north ? fy < LOW : fy > HIGH) && cornerSet.has(diag)) {
        fx = limX;
        fy = limY;
    }
    const far = cell + DL;
    switch (`${quad}/${own}`) {
        case "nw/ne":
            fy = Math.max(fy, fx + DL);
            break;
        case "nw/sw":
            fx = Math.max(fx, fy + DL);
            break;
        case "nw/se":
            fy = Math.min(fy, DH - fx);
            break;
        case "sw/se":
            fy = Math.min(fy, DH - fx);
            break;
        case "sw/nw":
            fx = Math.max(fx, far - fy);
            break;
        case "sw/ne":
            fx = Math.min(fx, fy - DL);
            break;
        case "ne/se":
            fx = Math.min(fx, DH - fy);
            break;
        case "ne/nw":
            fy = Math.max(fy, far - fx);
            break;
        case "ne/sw":
            fx = Math.max(fx, fy + DL);
            break;
        case "se/ne":
            fx = Math.min(fx, fy - DL);
            break;
        case "se/sw":
            fy = Math.min(fy, fx - DL);
            break;
        case "se/nw":
            fx = Math.max(fx, far - fy);
            break;
        default: break;
    }
    state.x = u16(cx * cell + fx);
    state.y = u16(cy * cell + fy);
}

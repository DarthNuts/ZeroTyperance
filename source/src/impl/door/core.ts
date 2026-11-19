import type { DoorConstants } from "./constants.js";
export const CAMERA_ENTRY_TYPE = 2;
export interface DoorEntry {
    readonly cell: readonly [
        number,
        number
    ];
    readonly floor: number;
    timer: number;
    readonly restoreBlock: number;
    readonly type: number;
    playerIn: boolean;
    entityIn: boolean;
}
export interface DoorFloor {
    readonly width: number;
    readonly cellSize: number;
    readonly blocks: number[];
    readonly classOfBlock: readonly number[];
}
export function doorFloorOf(grid: readonly number[], classOfBlock: readonly number[], width: number, cellSize: number): DoorFloor {
    if (grid.length !== width * width)
        throw new Error(`door floor: ${grid.length} cells, expected ${width} x ${width}`);
    return { width, cellSize, blocks: [...grid], classOfBlock };
}
function cellIndex(floor: DoorFloor, col: number, row: number): number {
    if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= floor.width || row >= floor.width)
        return -1;
    return row * floor.width + col;
}
export function cellClass(floor: DoorFloor, col: number, row: number): number {
    const i = cellIndex(floor, col, row);
    if (i < 0)
        return -1;
    const cls = floor.classOfBlock[floor.blocks[i]!];
    return cls === undefined ? -1 : cls;
}
export function paneBlockOfClass(floor: DoorFloor, cls: number): number {
    const b = floor.classOfBlock.indexOf(cls);
    if (b < 0)
        throw new Error(`door floor: no block of class ${cls}`);
    return b;
}
export interface DoorState {
    readonly queue: DoorEntry[];
    readonly floor: DoorFloor;
}
export function doorStart(floor: DoorFloor): DoorState {
    return { queue: [], floor };
}
export interface DoorSound {
    readonly id: number;
    readonly note: number;
}
export type EntityOccupancy = (entry: Readonly<DoorEntry>, index: number) => boolean;
function sound(C: DoorConstants): DoorSound {
    return { id: C.SFX_ID, note: C.SFX_NOTE };
}
function paneClassOf(cls: number, C: DoorConstants): number {
    if (cls === C.CLOSED_CLASS_X)
        return C.OPEN_CLASS_X;
    if (cls === C.CLOSED_CLASS_Y)
        return C.OPEN_CLASS_Y;
    return -1;
}
function inBox(floor: DoorFloor, cell: readonly [
    number,
    number
], x: number, y: number, C: DoorConstants): boolean {
    const x0 = cell[0] * floor.cellSize;
    const y0 = cell[1] * floor.cellSize;
    return x >= x0 && x <= x0 + C.BOX - 1 && y >= y0 && y <= y0 + C.BOX - 1;
}
export function doorOpener(state: DoorState, x: number, y: number, floorNumber: number, C: DoorConstants): DoorSound | null {
    const floor = state.floor;
    const col = Math.floor(x / floor.cellSize);
    const row = Math.floor(y / floor.cellSize);
    const i = cellIndex(floor, col, row);
    if (i < 0)
        return null;
    const paneClass = paneClassOf(cellClass(floor, col, row), C);
    if (paneClass < 0)
        return null;
    if (state.queue.length >= C.QUEUE_SIZE)
        return null;
    const block = floor.blocks[i]!;
    state.queue.push({ cell: [col, row], floor: floorNumber, timer: C.OPEN_TIMER, restoreBlock: block, type: C.ENTRY_TYPE, playerIn: false, entityIn: false });
    floor.blocks[i] = paneBlockOfClass(floor, paneClass);
    return sound(C);
}
export function doorWalker(state: DoorState, x: number, y: number, entityIn: EntityOccupancy, C: DoorConstants): DoorSound[] {
    const floor = state.floor;
    const sounds: DoorSound[] = [];
    let i = 0;
    while (i < state.queue.length) {
        const e = state.queue[i]!;
        if (e.type === CAMERA_ENTRY_TYPE) {
            e.playerIn = false;
            e.entityIn = false;
            if (e.timer >= C.TIMER_MAX) {
                floor.blocks[cellIndex(floor, e.cell[0], e.cell[1])] = e.restoreBlock;
                state.queue.splice(i, 1);
                continue;
            }
            e.timer += C.TIMER_STEP;
            i++;
            continue;
        }
        if (e.type !== C.ENTRY_TYPE) {
            e.playerIn = false;
            e.entityIn = false;
            i++;
            continue;
        }
        e.playerIn = inBox(floor, e.cell, x, y, C);
        e.entityIn = entityIn(e, i);
        if (e.playerIn || e.entityIn) {
            e.timer = Math.min(e.timer + C.TIMER_STEP, C.TIMER_MAX);
            i++;
            continue;
        }
        e.timer -= C.TIMER_STEP;
        if (e.timer <= C.TIMER_REMOVE) {
            floor.blocks[cellIndex(floor, e.cell[0], e.cell[1])] = e.restoreBlock;
            sounds.push(sound(C));
            state.queue.splice(i, 1);
            continue;
        }
        i++;
    }
    return sounds;
}
export function doorTick(state: DoorState, x: number, y: number, floorNumber: number, entityIn: EntityOccupancy, C: DoorConstants): DoorSound[] {
    const out: DoorSound[] = [];
    const opened = doorOpener(state, x, y, floorNumber, C);
    if (opened)
        out.push(opened);
    out.push(...doorWalker(state, x, y, entityIn, C));
    return out;
}
export interface DoorRecordEntry {
    cell: [
        number,
        number
    ];
    floor: number;
    timer: number;
    restore_block: number;
    type: number;
    player_in: boolean;
    entity_in: boolean;
}
export interface DoorRecord {
    queue: DoorRecordEntry[];
    cells: number[];
}
export function doorRecord(state: DoorState): DoorRecord {
    return {
        queue: state.queue.map((e) => ({
            cell: [e.cell[0], e.cell[1]],
            floor: e.floor,
            timer: e.timer,
            restore_block: e.restoreBlock,
            type: e.type,
            player_in: e.playerIn,
            entity_in: e.entityIn,
        })),
        cells: state.queue.map((e) => cellClass(state.floor, e.cell[0], e.cell[1])),
    };
}

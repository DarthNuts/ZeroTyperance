import type { Rng } from "../../rng.js";
import type { SoldierConstants } from "../rend/sprite/constants.js";
import { s16, u16 } from "../hydaca/arith.js";
export interface Vec2 {
    x: number;
    y: number;
}
export type TargetName = "player" | "none" | "unknown";
export interface SoldierBody {
    pos: Vec2;
    vel: Vec2;
    state: number;
    counter: number;
    timer: number;
    hp: number;
    flags: number;
    form: "live" | "corpse";
    hitMark: number;
    gibbed?: boolean;
    readonly floor: number;
    readonly tag: number;
    home: Vec2;
    target: TargetName;
    readonly cellsAround: readonly (number | null)[];
}
export interface PlayerInputs {
    readonly x: number;
    readonly y: number;
    readonly angle: number;
    readonly eyeOffset: number;
}
export interface ViewVectors {
    readonly sin256: readonly number[];
    readonly neg_cos256: readonly number[];
}
export interface CellSource {
    block(flatIndex: number, floor: number): number;
    classOf(block: number): number;
    renderMode(floor: number): number;
    markerBlock(cls: number): number;
}
export interface AiInputs {
    readonly player: PlayerInputs;
    readonly playerFloor: number;
    readonly phase: number;
    readonly view: ViewVectors;
    readonly cells: CellSource;
    readonly loot?: (item: number, amount: number) => boolean;
    readonly bodies?: {
        readonly at: ReadonlyArray<{
            readonly x: number;
            readonly y: number;
        }>;
        readonly limit: number;
    };
}
export type SoldierEvent = {
    readonly type: "Audio.Request";
    readonly request: number;
} | {
    readonly type: "Combat.Hit";
    readonly target: "player";
    readonly impulse: number;
    readonly dx: number;
    readonly dy: number;
} | {
    readonly type: "Floor.Recount";
} | {
    readonly type: "Map.Write";
    readonly floor: number;
    readonly x: number;
    readonly y: number;
    readonly block: number;
};
export class OutsideSpecError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "OutsideSpecError";
    }
}
export interface Target {
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
}
export const GRID_SIDE = 32;
export const FLOOR_BYTES = GRID_SIDE * GRID_SIDE;
export const FLOOR_COUNT = 16;
export const WINDOW_SIDE = 5;
export const WINDOW_RADIUS = 2;
export const FRACTION_MAX = 255;
export interface Ctx {
    readonly e: SoldierBody;
    readonly inputs: AiInputs;
    readonly rng: Rng;
    readonly emit: (ev: SoldierEvent) => void;
    readonly C: SoldierConstants;
    readonly start: Readonly<Vec2>;
    readonly startIndex: number;
    readonly target: Target;
    removed: boolean;
}
export function moveIndex(x: number, y: number): number {
    return s16((s16(x) >> 8) + (s16(y & 0xff00) >> 3));
}
export function losIndex(qx: number, qy: number): number {
    return u16((u16(qx) >>> 8) + ((u16(qy) & 0xff00) >>> 3));
}
export function blockAt(ctx: Ctx, flatIndex: number, floor: number): number {
    if (floor === ctx.e.floor) {
        const w = windowByteAt(ctx, flatIndex);
        if (w !== undefined)
            return w;
    }
    return ctx.inputs.cells.block(flatIndex, floor);
}
function windowByteAt(ctx: Ctx, flatIndex: number): number | undefined {
    const rel = flatIndex - ctx.startIndex;
    for (let dy = -WINDOW_RADIUS; dy <= WINDOW_RADIUS; dy++) {
        const dx = rel - dy * GRID_SIDE;
        if (dx >= -WINDOW_RADIUS && dx <= WINDOW_RADIUS)
            return windowByte(ctx, dx, dy);
    }
    return undefined;
}
export function windowByte(ctx: Ctx, dx: number, dy: number): number {
    const cells = ctx.e.cellsAround;
    if (cells.length !== WINDOW_SIDE * WINDOW_SIDE)
        throw new OutsideSpecError(`hidden.cells_around has ${cells.length} entries, not ${WINDOW_SIDE * WINDOW_SIDE}`);
    if (dx < -WINDOW_RADIUS || dx > WINDOW_RADIUS || dy < -WINDOW_RADIUS || dy > WINDOW_RADIUS) {
        throw new OutsideSpecError(`cell (${dx}, ${dy}) is outside the ${WINDOW_SIDE} x ${WINDOW_SIDE} window`);
    }
    const b = cells[(dy + WINDOW_RADIUS) * WINDOW_SIDE + (dx + WINDOW_RADIUS)]!;
    if (b === null)
        throw new OutsideSpecError(`window byte (${dx}, ${dy}) is null: a cell outside the floors' storage (4.8, 8.1)`);
    return b;
}
export function classAt(ctx: Ctx, flatIndex: number, floor: number): number {
    return ctx.inputs.cells.classOf(blockAt(ctx, flatIndex, floor));
}
export function soundRequest(ctx: Ctx, request: number): void {
    ctx.emit({ type: "Audio.Request", request });
}
export function cuePair(ctx: Ctx): void {
    if (ctx.e.floor !== ctx.inputs.playerFloor)
        return;
    soundRequest(ctx, ctx.C.AI.SOUND_A);
    soundRequest(ctx, ctx.C.AI.SOUND_B);
}
export function combatHitPlayer(ctx: Ctx, dx: number, dy: number, impulse: number): void {
    ctx.emit({ type: "Combat.Hit", target: "player", impulse, dx, dy });
}
export function floorRecount(ctx: Ctx): void {
    ctx.emit({ type: "Floor.Recount" });
}
export function mapWrite(ctx: Ctx, floor: number, x: number, y: number, block: number): void {
    ctx.emit({ type: "Map.Write", floor, x, y, block });
}
export function targetOf(inputs: AiInputs): Target {
    const a = inputs.player.angle;
    const vx = inputs.view.sin256[a];
    const vy = inputs.view.neg_cos256[a];
    if (vx === undefined || vy === undefined)
        throw new RangeError(`player.angle ${a} is outside the view-vector table`);
    return { x: inputs.player.x, y: inputs.player.y, vx, vy };
}

import type { Entity, EventSink, Rng, WorldView } from "../../domain.js";
import type { HydacaHidden } from "../../world.js";
import type { HydConstants } from "./constants.js";
export interface Vec2 {
    x: number;
    y: number;
}
export type HiddenState = HydacaHidden & {
    bite_cooldown: number;
};
export interface Ctx {
    readonly view: WorldView;
    readonly e: Entity;
    readonly h: HiddenState;
    readonly rng: Rng;
    readonly events: EventSink;
    readonly C: HydConstants;
    readonly markerBlock: (episode: number, cls: number) => number;
    readonly start: Readonly<Vec2>;
    removed: boolean;
    readonly outside: string[];
}
export function noteOutside(ctx: Ctx, what: string): void {
    ctx.outside.push(what);
}
export function hasTarget(ctx: Ctx): boolean {
    return ctx.h.target === "player";
}
export function targetPos(ctx: Ctx): Vec2 {
    return { x: ctx.view.player.pos.x, y: ctx.view.player.pos.y };
}
export function currentFloor(view: WorldView): number {
    return view.level.sub_id;
}
export function phaseCounter(view: WorldView): number {
    return view.core.phase;
}
function syncFlagBooleans(e: Entity, C: HydConstants): void {
    e.flags.alive = (e.flags.value & C.FLAG_ALIVE_BIT) !== 0;
}
export function setFlagBits(ctx: Ctx, bitsToSet: number): void {
    ctx.e.flags.value = (ctx.e.flags.value | bitsToSet) & 0xffff;
    syncFlagBooleans(ctx.e, ctx.C);
}
export function clearFlagBits(ctx: Ctx, bitsToClear: number): void {
    ctx.e.flags.value = (ctx.e.flags.value & ~bitsToClear) & 0xffff;
    syncFlagBooleans(ctx.e, ctx.C);
}
export function soundRequest(ctx: Ctx, requestId: number): void {
    if (ctx.e.floor !== currentFloor(ctx.view))
        return;
    ctx.events.emit({ type: "Audio.Request", request: requestId });
}
export function combatHitPlayer(ctx: Ctx, impulse: number, dx: number, dy: number): void {
    ctx.events.emit({ type: "Combat.Hit", target: "player", impulse, dx, dy });
}
export function floorRecount(ctx: Ctx): void {
    ctx.events.emit({ type: "Floor.Recount" });
}
export function mapWrite(ctx: Ctx, floor: number, x: number, y: number, block: number): void {
    ctx.events.emit({ type: "Map.Write", floor, x, y, block });
}

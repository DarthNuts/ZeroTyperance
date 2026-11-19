import type { Core, Entity, Level, Player } from "./world.js";
import type { GameEvent } from "./events.js";
import type { Rng } from "./rng.js";
export type { Core, Entity, Level, Player, World } from "./world.js";
export type { GameEvent, BoundaryEvent } from "./events.js";
export type { Rng } from "./rng.js";
export interface Cell {
    readonly block: number;
    readonly cls: number;
}
export interface MapView {
    readonly floor: number;
    readonly width: number;
    readonly height: number;
    cellAt(x: number, y: number): Cell;
    cellAtPos(x: number, y: number): Cell;
    category(cls: number): string;
}
export interface WorldView {
    map: MapView;
    player: Player;
    core: Core;
    level: Level;
    entities: ReadonlyArray<Entity>;
}
export interface EventSink {
    emit(e: GameEvent): void;
}
export interface EntityAi {
    readonly handlers?: readonly string[];
    aiTick(view: WorldView, self: Entity, rng: Rng, events: EventSink): Entity | null;
}
export interface ExpectedResult {
    entity: Entity | null;
    events: GameEvent[];
    rngDraws: number[];
}
export interface ParityEchoHook {
    readonly parityEcho: true;
    setExpected(expected: ExpectedResult): void;
}

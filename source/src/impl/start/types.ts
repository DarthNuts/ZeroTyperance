import type { World } from "../../world.js";
import type { SnapHiddenLine, SnapSnipers, SnapTiles } from "../tick/snap_types.js";
export interface LevelStartInput {
    readonly kind: "new_game" | "demo" | "next_episode" | "password";
    readonly episode: number;
    readonly character: number;
    readonly floor?: number;
    readonly level_byte?: number;
    readonly controller_mode: 0 | 1;
    readonly seed: string;
    readonly frame: number;
    readonly setup_blanks: number;
    readonly carried: {
        readonly phase: number;
        readonly bob_acc: number;
        readonly sky_tile_counter: number;
        readonly intro_camera: {
            readonly angle: number;
            readonly distance: number;
        };
        readonly hp: number;
        readonly team_alive: Readonly<Record<string, boolean>>;
        readonly options: World["options"];
        readonly tile_pass: SnapTiles;
        readonly sniper_gates: SnapSnipers;
        readonly items: ReadonlyArray<{
            readonly item: number;
            readonly rounds: number;
        }>;
    };
}
export interface LoadoutEntry {
    readonly item: number;
    readonly amount: number;
}
export interface DemoBlock {
    readonly episode: number;
    readonly seed: number;
    readonly inputs: readonly number[];
}
export interface StartData {
    readonly loadouts: ReadonlyArray<readonly LoadoutEntry[]>;
    readonly items: ReadonlyMap<number, {
        readonly name: string;
        readonly cap: number;
        readonly defaultGrant: number;
    }>;
    readonly demos: readonly DemoBlock[];
    readonly bytesPerDemo: number;
}
export interface StartWorld {
    readonly world: World;
    readonly hidden: SnapHiddenLine;
    readonly events: readonly StartEvent[];
    readonly earlierFloors: ReadonlyMap<number, readonly number[]>;
    readonly notes: readonly string[];
}
export type StartEvent = {
    readonly type: "Audio.Music";
    readonly id: number;
};
export interface StartMaps {
    readonly mapsDoc: unknown;
    readonly classOfBlock: readonly number[];
}

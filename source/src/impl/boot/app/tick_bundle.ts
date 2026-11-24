import type { HandAssetsDoc } from "../../hand/assets.js";
import type { RendAssetsDoc } from "../../rend/assets.js";
import type { SkyAssetsDoc } from "../../rend/sky/assets.js";
import type { SpriteAssetsDoc } from "../../rend/sprite/assets.js";
export const TICK_BUNDLE_FORMAT = "zt-tick-bundle/11";
export interface LevelStartPace {
    readonly a: number;
    readonly tf: number;
    readonly tl: number;
}
export interface TickBundle {
    readonly format: typeof TICK_BUNDLE_FORMAT;
    readonly data: {
        readonly move: unknown;
        readonly door: unknown;
        readonly weapon: unknown;
        readonly rend: unknown;
        readonly trig: unknown;
        readonly sprite: unknown;
        readonly soldier: unknown;
        readonly sky: unknown;
        readonly hd?: unknown;
        readonly view?: unknown;
        readonly hit: unknown;
        readonly pickup: unknown;
        readonly items: unknown;
        readonly pickupMessages: unknown;
        readonly messages: unknown;
        readonly lift: unknown;
        readonly loadouts: unknown;
        readonly demoInputs: unknown;
        readonly enemyDescriptors: unknown;
        readonly hydaca: unknown;
        readonly flame: unknown;
        readonly boss: unknown;
        readonly mine: unknown;
        readonly camera: unknown;
        readonly ordnance: unknown;
        readonly extinguisher: unknown;
        readonly boss2: unknown;
        readonly boss3: unknown;
        readonly dog: unknown;
        readonly imp: unknown;
        readonly sf: unknown;
        readonly sergeant: unknown;
        readonly soundTable: unknown;
        readonly pause: unknown;
        readonly death: unknown;
        readonly sniper: unknown;
        readonly modern?: unknown;
    };
    readonly lcg: {
        readonly multiplier: number;
        readonly increment: number;
    };
    readonly hostDefaultSeed: string;
    readonly rendAssets: RendAssetsDoc | null;
    readonly spriteAssets: SpriteAssetsDoc;
    readonly episodes: ReadonlyArray<{
        readonly mapsDoc: unknown;
        readonly sky: SkyAssetsDoc | null;
    }>;
    readonly vblanks: readonly number[];
    readonly handAssets: HandAssetsDoc;
    readonly demos: ReadonlyArray<{
        readonly name: string;
        readonly kind: "demo" | "new_game" | "password";
        readonly setupBlanks: number;
        readonly episode: number;
        readonly floor: number;
        readonly character: number;
        readonly vblanks: readonly number[];
        readonly guards: ReadonlyArray<ReadonlyArray<readonly [
            number,
            number
        ]> | null>;
        readonly pace: LevelStartPace | null;
    }>;
    readonly pauseAssets: {
        readonly pause: unknown;
        readonly tiles: unknown;
    } | null;
    readonly pauseExit: {
        readonly entryBlanks: number;
        readonly exitBlanks: number;
    } | null;
    readonly notes: readonly string[];
}
export interface TickFixtures {
    readonly vblanks: number[];
    readonly demos: Array<TickBundle["demos"][number]>;
    readonly pauseExit: TickBundle["pauseExit"];
    readonly notes: string[];
}

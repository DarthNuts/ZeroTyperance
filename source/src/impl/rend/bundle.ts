import type { FloorDoc } from "./floor_map.js";
import type { Pose } from "./core.js";
import type { RendAssetsDoc } from "./assets.js";
import type { SkyAssetsDoc } from "./sky/assets.js";
import type { SpriteAssetsDoc } from "./sprite/assets.js";
import type { HandAssetsDoc } from "../hand/assets.js";
export const REND_BUNDLE_FORMAT = "zt-rend-bundle/8";
export interface RendBundle {
    readonly format: typeof REND_BUNDLE_FORMAT;
    readonly data: unknown;
    readonly trig: unknown;
    readonly floor: FloorDoc;
    readonly episode: number;
    readonly floorNumber: number;
    readonly sky: {
        readonly data: unknown;
        readonly assets: SkyAssetsDoc;
    };
    readonly move: {
        readonly data: unknown;
    };
    readonly door: {
        readonly data: unknown;
        readonly blockClasses: readonly number[];
    };
    readonly weapon: {
        readonly data: unknown;
    };
    readonly sprite: {
        readonly data: unknown;
        readonly soldier: unknown;
        readonly assets: SpriteAssetsDoc;
        readonly soundTable: unknown;
    };
    readonly hand: {
        readonly assets: HandAssetsDoc;
    };
    readonly lcg: {
        readonly multiplier: number;
        readonly increment: number;
    };
    readonly assets: RendAssetsDoc;
    readonly start: Pose;
}

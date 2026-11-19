import type { HudAssetsDoc } from "./assets.js";
export const HUD_BUNDLE_FORMAT = "zt-hud-bundle/1";
export interface HudBundle {
    readonly format: typeof HUD_BUNDLE_FORMAT;
    readonly data: unknown;
    readonly assets: HudAssetsDoc;
}

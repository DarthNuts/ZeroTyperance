import type { ScreenDisplay, ScreenPlaneView, ScreenSprite } from "../screen_types.js";
export interface HandPart {
    readonly name: string;
    readonly attrWord: number;
    readonly w: number;
    readonly h: number;
    readonly tileOffset: number;
}
export interface HandGraphic {
    readonly name: string;
    readonly itemIds: readonly number[];
    readonly tileCount: number;
    readonly tiles: readonly Uint8Array[];
    readonly origin: {
        readonly x: number;
        readonly y: number;
    } | null;
    readonly parts: readonly HandPart[];
}
export interface SwingSprite {
    readonly attrWord: number;
    readonly w: number;
    readonly h: number;
    readonly satX: number;
    readonly satY: number;
}
export interface SwingRow {
    readonly direction: number;
    readonly art: string;
    readonly frames: ReadonlyArray<readonly SwingSprite[]>;
}
export interface HandAssets {
    readonly graphics: ReadonlyMap<string, HandGraphic>;
    readonly graphicOfWeapon: ReadonlyMap<number, string>;
    readonly swings: ReadonlyMap<number, SwingRow>;
    readonly throwFrames: readonly SwingSprite[];
    readonly paletteLine: number;
    readonly cramWords: readonly number[];
}
export interface HandInputs {
    readonly tick: number;
    readonly current: number;
    readonly pending: number;
    readonly lowering: number;
    readonly anim: number;
    readonly variant: number;
    readonly bob_angle: number;
    readonly bob_eye: number;
}
export interface HandSprite {
    readonly xWord: number;
    readonly yWord: number;
    readonly w: number;
    readonly h: number;
    readonly attr: number;
}
export interface HandState {
    list: HandSprite[];
    loaded: string | null;
    window: Uint8Array[] | null;
}
export interface HandPicture {
    readonly display: ScreenDisplay;
    readonly cram: number[];
    readonly a: ScreenPlaneView;
    readonly b: ScreenPlaneView;
    readonly sprites: ScreenSprite[];
}

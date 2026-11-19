import type { EventSink } from "../domain.js";
export interface ScreenDisplay {
    enabled: boolean;
    width: 256 | 320;
    height: 224 | 240;
    backdrop: number;
}
export interface ScreenPlaneView {
    ox: number;
    oy: number;
    fx: number;
    fy: number;
    cells: number[][];
}
export type PlaneSize = 32 | 64 | 128;
export interface ScreenPlaneFull {
    w: PlaneSize;
    h: PlaneSize;
    hscroll: number[];
    vscroll: number;
    cells: number[][];
}
export type ScreenPlane = ScreenPlaneView | ScreenPlaneFull;
export interface ScreenSprite {
    x: number;
    y: number;
    w: number;
    h: number;
    attr: number;
}
export interface ScreenState {
    display: ScreenDisplay;
    cram: number[];
    a: ScreenPlane;
    b: ScreenPlane;
    sprites: ScreenSprite[];
    patterns_sha256: string;
}
export interface ScreenEnv {
    kitRoot: string;
    assetsDir: string | null;
}
export interface ScreenProgram {
    reset(env: ScreenEnv): void;
    tick(pad: number, events: EventSink): ScreenState;
    tilePatterns?(indices: readonly number[]): ReadonlyArray<ArrayLike<number>>;
}

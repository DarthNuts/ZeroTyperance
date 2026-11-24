import type { HdConstants } from "./constants.js";
import { blendAngle } from "./blend.js";
import type { ViewSnapshot } from "./snapshot.js";
export function keptTriple(kept: readonly ViewSnapshot[]): {
    n: ViewSnapshot;
    nPrev: ViewSnapshot | null;
    newest: ViewSnapshot;
} | null {
    const len = kept.length;
    if (len === 0)
        return null;
    const newest = kept[len - 1]!;
    if (len === 1)
        return { n: newest, nPrev: null, newest };
    return { n: kept[len - 2]!, nPrev: len >= 3 ? kept[len - 3]! : null, newest };
}
export function modernDrawnAngle(newestAngle: number, pendingMouseTurn: number, angles: number): number {
    return (((newestAngle + pendingMouseTurn) % angles) + angles) % angles;
}
export interface EaseCamera {
    readonly x: number;
    readonly y: number;
    readonly angle: number;
}
export class CameraEase {
    private last: EaseCamera | null = null;
    private from: EaseCamera | null = null;
    private k = 0;
    constructor(private readonly C: HdConstants, private readonly angles: number) { }
    replaced(): void {
        this.from = this.last;
        this.k = 0;
    }
    get active(): boolean { return this.from !== null; }
    reset(): void {
        this.last = null;
        this.from = null;
        this.k = 0;
    }
    frame(target: EaseCamera): EaseCamera {
        const E = this.C.SMOOTH.EASE_FRAMES;
        let out = target;
        const f = this.from;
        if (f !== null) {
            if (Math.abs(target.x - f.x) > this.C.SMOOTH.SNAP_UNITS || Math.abs(target.y - f.y) > this.C.SMOOTH.SNAP_UNITS) {
                this.from = null;
            }
            else {
                this.k++;
                if (this.k >= E) {
                    this.from = null;
                }
                else {
                    const t = this.k / E;
                    out = { x: f.x + (target.x - f.x) * t, y: f.y + (target.y - f.y) * t, angle: blendAngle(f.angle, target.angle, t, this.angles) };
                }
            }
        }
        this.last = out;
        return out;
    }
}
export function withCamera(s: ViewSnapshot, cam: EaseCamera): ViewSnapshot {
    return { ...s, cam: { ...s.cam, x: cam.x, y: cam.y, angle: cam.angle } };
}

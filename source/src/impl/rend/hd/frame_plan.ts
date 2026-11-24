import type { RendConstants } from "../constants.js";
import type { HdConstants } from "./constants.js";
import { blendSnapshots, smoothAlpha } from "./blend.js";
import { CameraEase, keptTriple, modernDrawnAngle, withCamera } from "./smooth.js";
import type { ViewSnapshot } from "./snapshot.js";
export interface FramePlanInput {
    readonly kept: readonly ViewSnapshot[];
    readonly nowMs: number;
    readonly boundaryMs: number;
    readonly stepMs: number;
    readonly smoothMotion: boolean;
    readonly modernPending: number | null;
    readonly ease: CameraEase | null;
}
export function baseSnapshot(kept: readonly ViewSnapshot[]): {
    n: ViewSnapshot;
    nPrev: ViewSnapshot | null;
    newest: ViewSnapshot;
} | null {
    const t = keptTriple(kept);
    if (t === null)
        return null;
    if (t.n !== t.newest && (t.n.floor_key.floor !== t.newest.floor_key.floor || t.n.floor_key.episode !== t.newest.floor_key.episode))
        return { n: t.newest, nPrev: null, newest: t.newest };
    return t;
}
export function planHdFrame(p: FramePlanInput, C: HdConstants, R: RendConstants): ViewSnapshot | null {
    const b = baseSnapshot(p.kept);
    if (b === null)
        return null;
    if (!p.smoothMotion)
        return b.n;
    const alpha = smoothAlpha(p.nowMs, p.boundaryMs, p.stepMs);
    let s = alpha >= 1 || b.nPrev === null ? b.n : blendSnapshots(b.n, b.nPrev, alpha, C, R);
    if (p.modernPending !== null) {
        s = withCamera(s, { x: s.cam.x, y: s.cam.y, angle: modernDrawnAngle(b.newest.cam.angle, p.modernPending, R.ANGLES) });
    }
    if (p.ease !== null)
        s = withCamera(s, p.ease.frame({ x: s.cam.x, y: s.cam.y, angle: s.cam.angle }));
    return s;
}

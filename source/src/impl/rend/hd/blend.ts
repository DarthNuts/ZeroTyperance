import type { RendConstants } from "../constants.js";
import type { HdConstants } from "./constants.js";
import type { SnapshotEntity, SnapshotRamp, ViewSnapshot } from "./snapshot.js";
import type { DoorView } from "../core.js";
const lerp = (a: number, b: number, alpha: number): number => a * (1 - alpha) + b * alpha;
function bankKey(e: SnapshotEntity): string {
    const set = new Set<string>();
    for (const p of e.parts)
        set.add(p.art.bank === null ? "\u0000" : p.art.bank);
    return [...set].sort().join("\u0001");
}
export function blendAngle(a: number, b: number, alpha: number, angles: number): number {
    let d = (((b - a) % angles) + angles) % angles;
    if (d > angles / 2)
        d -= angles;
    const r = (((a + d * alpha) % angles) + angles) % angles;
    return r;
}
export function snaps(n: ViewSnapshot, nPrev: ViewSnapshot | null, C: HdConstants): boolean {
    if (nPrev === null)
        return true;
    if (n.floor_key.episode !== nPrev.floor_key.episode || n.floor_key.floor !== nPrev.floor_key.floor)
        return true;
    const S = C.SMOOTH.SNAP_UNITS;
    return Math.abs(n.cam.x - nPrev.cam.x) > S || Math.abs(n.cam.y - nPrev.cam.y) > S;
}
function cellOf(v: number, R: RendConstants): number {
    const s = v >= 32768 ? v - 65536 : v;
    return Math.floor(s / (1 << R.CELL_SHIFT));
}
export function blendSnapshots(n: ViewSnapshot, nPrev: ViewSnapshot | null, alpha: number, C: HdConstants, R: RendConstants): ViewSnapshot {
    if (nPrev === null || snaps(n, nPrev, C))
        return n;
    const a = Math.min(1, Math.max(0, alpha));
    const S = C.SMOOTH.SNAP_UNITS;
    const x = lerp(nPrev.cam.x, n.cam.x, a);
    const y = lerp(nPrev.cam.y, n.cam.y, a);
    const cam = {
        x,
        y,
        angle: blendAngle(nPrev.cam.angle, n.cam.angle, a, R.ANGLES),
        eye_walls: lerp(nPrev.cam.eye_walls, n.cam.eye_walls, a),
        eye_lanes: Math.round(lerp(nPrev.cam.eye_lanes, n.cam.eye_lanes, a)),
        slide: lerp(nPrev.cam.slide, n.cam.slide, a),
    };
    const cx = cellOf(x, R);
    const cy = cellOf(y, R);
    const holds = (s: ViewSnapshot): boolean => s.box.cell[0] === cx && s.box.cell[1] === cy;
    const box = holds(n) ? n.box : holds(nPrev) ? nPrev.box : n.box;
    const prevBySlot = new Map<number, SnapshotEntity>();
    for (const e of nPrev.entities)
        if (!prevBySlot.has(e.slot))
            prevBySlot.set(e.slot, e);
    const entities = n.entities.map((e): SnapshotEntity => {
        const p = prevBySlot.get(e.slot);
        if (p === undefined || bankKey(p) !== bankKey(e) || Math.abs(e.x - p.x) > S || Math.abs(e.y - p.y) > S)
            return e;
        return { ...e, x: lerp(p.x, e.x, a), y: lerp(p.y, e.y, a), z: lerp(p.z, e.z, a) };
    });
    const prevDoor = new Map<string, DoorView>();
    for (const d of nPrev.doors)
        prevDoor.set(`${d.cell[0]},${d.cell[1]}`, d);
    const doors = n.doors.map((d): DoorView => {
        const p = prevDoor.get(`${d.cell[0]},${d.cell[1]}`);
        return p === undefined ? d : { cell: d.cell, timer: lerp(p.timer, d.timer, a) };
    });
    const sky = n.sky.vs !== null && nPrev.sky.vs !== null ? { ...n.sky, vs: Math.round(lerp(nPrev.sky.vs, n.sky.vs, a)) } : n.sky;
    const ramps = Math.sign(n.cam.slide) === Math.sign(nPrev.cam.slide) ? blendRamps(n, nPrev, a, C) : n.ramps;
    return { ...n, cam, box, entities, doors, sky, ramps };
}
function blendRamps(n: ViewSnapshot, nPrev: ViewSnapshot, a: number, C: HdConstants): ViewSnapshot["ramps"] {
    const prev = new Map<string, SnapshotRamp>();
    for (const r of nPrev.ramps)
        prev.set(`${r.cell[0]},${r.cell[1]},${r.face}`, r);
    return n.ramps.map((r): SnapshotRamp => {
        const p = prev.get(`${r.cell[0]},${r.cell[1]},${r.face}`);
        if (p === undefined)
            return r;
        if (r.hi === r.lo && p.hi === p.lo && Math.abs(r.hi - p.hi) > C.RAMP.B_BLEND_MAX)
            return r;
        return { cell: r.cell, face: r.face, hi: lerp(p.hi, r.hi, a), lo: lerp(p.lo, r.lo, a) };
    });
}
export function smoothAlpha(nowMs: number, boundaryMs: number, stepMs: number): number {
    if (!(stepMs > 0))
        return 1;
    const a = (nowMs - boundaryMs) / stepMs;
    return a < 0 ? 0 : a > 1 ? 1 : a;
}
export interface StepLengthParams {
    readonly mode: "original" | "custom";
    readonly originalBlanks: number;
    readonly customSteps: number;
    readonly blanksPerSecond: number;
}
export function paceStepMs(pace: {
    readonly num: number;
    readonly den: number;
}, blanksPerSecond: number): number {
    return pace.den > 0 ? (pace.num / pace.den) * (1000 / blanksPerSecond) : 0;
}
export function stepLengthMs(p: StepLengthParams): number {
    const blankMs = 1000 / p.blanksPerSecond;
    return p.mode === "original" ? p.originalBlanks * blankMs : (p.blanksPerSecond / p.customSteps) * blankMs;
}

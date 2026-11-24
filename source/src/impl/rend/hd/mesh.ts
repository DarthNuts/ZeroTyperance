import { collectWorld } from "./column.js";
import type { HdStatics, WorldFace, WorldStrip } from "./column.js";
import type { HdConstants } from "./constants.js";
import type { ViewSnapshot } from "./snapshot.js";
export const MESH_FLOATS = 12;
export const MESH_VERTS_PER_FACE = 6;
export const FLAG_TWO_SIDED = 1;
export const FLAG_HALF = 2;
export const FLAG_IS_LOW = 4;
export const FLAG_RAMP = 8;
export const FLAG_CONSTANT_STRIP = 16;
export const FLAG_LIFT = 32;
export const FLAG_STAIR = 64;
export const FULL_HEIGHT = 8192;
const CORNERS: ReadonlyArray<readonly [
    number,
    number
]> = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
export interface HdMesh {
    readonly faces: Float32Array;
    readonly faceCount: number;
    readonly strips: Float32Array;
    readonly stripCount: number;
    readonly list: readonly WorldFace[];
    readonly stripList: readonly WorldStrip[];
    readonly notes: readonly string[];
}
export function faceFlags(f: WorldFace): number {
    return (f.twoSided ? FLAG_TWO_SIDED : 0) | (f.isLow !== null ? FLAG_HALF : 0) | (f.isLow === true ? FLAG_IS_LOW : 0) | (f.ramp ? FLAG_RAMP : 0) | (f.lift === true ? FLAG_LIFT : 0) | (f.stair === true ? FLAG_STAIR : 0);
}
function pushVerts(out: Float32Array, base: number, ax: number, ay: number, bx: number, by: number, flags: number, word: number, uBase: number, uSpan: number, hi: number, lo: number): void {
    for (let v = 0; v < MESH_VERTS_PER_FACE; v++) {
        const o = (base * MESH_VERTS_PER_FACE + v) * MESH_FLOATS;
        const [end, zsel] = CORNERS[v]!;
        out[o] = ax;
        out[o + 1] = ay;
        out[o + 2] = bx;
        out[o + 3] = by;
        out[o + 4] = end;
        out[o + 5] = zsel;
        out[o + 6] = flags;
        out[o + 7] = word;
        out[o + 8] = uBase;
        out[o + 9] = uSpan;
        out[o + 10] = hi;
        out[o + 11] = lo;
    }
}
export function buildHdMesh(snap: ViewSnapshot, st: HdStatics, C: HdConstants, params: {
    readonly cab?: boolean;
} = {}): HdMesh {
    const w = collectWorld(snap, st, C, params);
    const faces = new Float32Array(w.faces.length * MESH_VERTS_PER_FACE * MESH_FLOATS);
    w.faces.forEach((f, i) => pushVerts(faces, i, f.ax, f.ay, f.bx, f.by, faceFlags(f), f.word ?? -1, f.uBase, f.uSpan, f.ramp?.hi ?? 0, f.ramp?.lo ?? 0));
    const strips = new Float32Array(w.strips.length * MESH_VERTS_PER_FACE * MESH_FLOATS);
    w.strips.forEach((s, i) => pushVerts(strips, i, s.x1, s.y1, s.x2, s.y2, (s.kind === "constant" ? FLAG_CONSTANT_STRIP : 0) | (s.stair === true ? FLAG_STAIR : 0), -1, 0, 0, 0, 0));
    return { faces, faceCount: w.faces.length, strips, stripCount: w.strips.length, list: w.faces, stripList: w.strips, notes: w.notes };
}
function sameArray(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
    if (a === b)
        return true;
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++)
        if (a[i] !== b[i])
            return false;
    return true;
}
export function meshChanged(a: ViewSnapshot | null, b: ViewSnapshot): boolean {
    if (a === null)
        return true;
    if (a === b)
        return false;
    if (a.floor_key.episode !== b.floor_key.episode || a.floor_key.floor !== b.floor_key.floor)
        return true;
    const x = a.box;
    const y = b.box;
    if (x.cell[0] !== y.cell[0] || x.cell[1] !== y.cell[1] || x.xl !== y.xl || x.xr !== y.xr || x.yb !== y.yb || x.yt !== y.yt)
        return true;
    if (a.map.side !== b.map.side || !sameArray(a.map.cls, b.map.cls) || !sameArray(a.map.block, b.map.block))
        return true;
    if (a.doors.length !== b.doors.length)
        return true;
    for (let i = 0; i < a.doors.length; i++) {
        const d = a.doors[i]!;
        const e = b.doors[i]!;
        if (d.cell[0] !== e.cell[0] || d.cell[1] !== e.cell[1] || d.timer !== e.timer)
            return true;
    }
    if (a.ramps.length !== b.ramps.length)
        return true;
    for (let i = 0; i < a.ramps.length; i++) {
        const r = a.ramps[i]!;
        const s = b.ramps[i]!;
        if (r.cell[0] !== s.cell[0] || r.cell[1] !== s.cell[1] || r.face !== s.face || r.hi !== s.hi || r.lo !== s.lo)
            return true;
    }
    return false;
}
export function metatexChanged(a: ViewSnapshot | null, b: ViewSnapshot): boolean {
    return a === null || !sameArray(a.metatex, b.metatex);
}

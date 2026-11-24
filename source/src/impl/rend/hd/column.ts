import { FACE_DOOR, FACE_HIGH_X, FACE_HIGH_Y, FACE_HYPOTENUSE, FACE_LOW_X, FACE_LOW_Y, FACE_NAMES } from "../core.js";
import type { Face } from "../core.js";
import type { RendAssets } from "../assets.js";
import type { RendConstants } from "../constants.js";
import { DIAG_FACE_KEYS, NIGHT_KEEPS_OWN_ART_MODE as NIGHT_OWN_ART_MODE } from "../constants.js";
import type { FloorDoc } from "../floor_map.js";
import { METATEXTURE_SLOTS } from "../floor_map.js";
import { laneBeyondArtRow, rebuildLanes } from "../shear.js";
import type { SkyConstants } from "../sky/constants.js";
import type { SkyAssets } from "../sky/core.js";
import type { SkyExtension } from "./skygen.js";
import { skyExtAt } from "./skygen.js";
import type { ViewSnapshot } from "./snapshot.js";
import type { HdConstants } from "./constants.js";
import { drawBillboards } from "./billboard.js";
import type { BillboardDraw, BillboardEnv } from "./billboard.js";
import { areaToFrame, areaToFrameOnSky, areaToFrameSky, farSkyShift, frameGeometry, framingFor, sampleFarLayer } from "./framing.js";
import type { FarLayer } from "./framing.js";
import { cabFloorZ, cabSceneOf, rideLaneRow } from "./cab.js";
import type { CabScene, HdLiftClasses } from "./cab.js";
export type SkyPlane = (px: number, py: number) => number;
export interface HdStatics {
    readonly floor: FloorDoc;
    readonly assets: RendAssets;
    readonly R: RendConstants;
    readonly sky: {
        readonly C: SkyConstants;
        readonly plane: SkyPlane;
        readonly ext?: SkyExtension | null;
    } | null;
    readonly lift?: HdLiftClasses;
}
export interface HdScreen {
    readonly palette: readonly number[];
    readonly backdrop: number;
    readonly skyPlane?: SkyPlane;
    readonly far?: FarLayer;
    readonly farHs?: number;
}
export interface HdParams {
    readonly fov: "auto" | number;
    readonly vertical: number;
    readonly smooth: boolean;
    readonly filter: "sharp" | "smooth";
    readonly strips?: boolean;
    readonly fillBeyond?: boolean;
    readonly opaqueZero?: boolean;
    readonly seeThrough?: boolean;
    readonly rayFill?: boolean;
    readonly beyondRows?: boolean;
    readonly cityWindow?: boolean;
    readonly farByFraming?: boolean;
    readonly farByAzimuth?: boolean;
    readonly skyCylinder?: boolean;
    readonly edgeFaceSky?: boolean;
    readonly cab?: boolean;
    readonly cabSurfacesAtRest?: boolean;
    readonly doorway?: boolean;
    readonly stairs?: boolean;
    readonly laneClamp?: boolean;
    readonly stairWord?: boolean;
    readonly stairOwner?: boolean;
}
export const EDGE_SKY = 1;
export const EDGE_RAMP = 2;
export const EDGE_LIVE = 4;
export const EDGE_CONST = 8;
export interface HdArea {
    readonly cols: number;
    readonly rows: number;
    readonly width: number;
    readonly height: number;
    readonly bar: boolean;
    readonly colPhase?: number;
}
export interface HdHit {
    readonly cell: readonly [
        number,
        number
    ];
    readonly face: number;
}
export interface HdPicture {
    readonly cols: number;
    readonly rows: number;
    readonly rgba: Uint8ClampedArray;
    readonly height: Float32Array;
    readonly forward: Float32Array;
    readonly hit: Array<HdHit | null>;
    readonly stripForward: Float32Array;
    readonly source: Uint8Array;
    readonly transparent: Uint8Array;
    readonly fx: number;
    readonly fy: number;
    readonly notes: string[];
    readonly billboards?: BillboardDraw[];
}
export const TIE_EPS = 1e-6;
export const SRC_FACE = 0;
export const SRC_RAMP_FILL = 1;
export const SRC_LANE = 2;
export const SRC_STRIP_LANE = 3;
export const SRC_STRIP_FILL = 4;
export const SRC_BEYOND = 5;
export const SRC_CAB_FLOOR = 6;
export const SRC_CAB_CEILING = 7;
export const SRC_DOORWAY = 8;
export const SRC_RIDE_SHAFT = 9;
const faceOfNeighbour = (dx: number, dy: number): Face => (dx === 1 ? FACE_LOW_X : dx === -1 ? FACE_HIGH_X : dy === 1 ? FACE_LOW_Y : FACE_HIGH_Y);
const edgeOfCell = (dx: number, dy: number, X: number, Y: number, S: number): readonly [
    number,
    number,
    number,
    number
] => dx === 1 ? [X + S, Y, X + S, Y + S] : dx === -1 ? [X, Y, X, Y + S] : dy === 1 ? [X, Y + S, X + S, Y + S] : [X, Y, X + S, Y];
export function cabsOf(snap: ViewSnapshot, st: HdStatics, C: HdConstants, params: Pick<HdParams, "cab">): CabScene | null {
    if (st.lift === undefined || params.cab === false)
        return null;
    return cabSceneOf(snap, st.R, st.lift, faceOfNeighbour, edgeOfCell, C.EYE.PER_E);
}
export function hdDefaults(C: HdConstants): HdParams {
    return { fov: "auto", vertical: C.V_SCALE.CONSOLE, smooth: true, filter: "sharp" };
}
export function hdProjection(params: HdParams, area: HdArea, C: HdConstants): {
    fx: number;
    fy: number;
    cx: number;
    cy: number;
    fovDegrees: number;
} {
    const fovDegrees = area.bar || params.fov === "auto" ? C.FOV.AUTO : Math.max(C.FOV.MIN, Math.min(C.FOV.MAX, params.fov));
    const half43 = area.bar ? area.width / 2 : (area.height * 4) / 3 / 2;
    const fx = half43 / Math.tan((fovDegrees * Math.PI) / 360);
    return { fx, fy: fx * params.vertical, cx: area.width / 2, cy: area.height / 2, fovDegrees };
}
const COLUMN_CENTRE_PHASE = 0.5;
const LEVEL_MAX = 7;
const BYTE_MAX = 255;
export function wordRgb(word: number, out: Float32Array, at: number): void {
    out[at] = Math.round(((word >> 1) & LEVEL_MAX) * BYTE_MAX / LEVEL_MAX);
    out[at + 1] = Math.round(((word >> 5) & LEVEL_MAX) * BYTE_MAX / LEVEL_MAX);
    out[at + 2] = Math.round(((word >> 9) & LEVEL_MAX) * BYTE_MAX / LEVEL_MAX);
}
const TILE_MASK = 0x7ff;
const FLIP_H_BIT = 1 << 11;
const FLIP_V_BIT = 1 << 12;
const PALETTE_SHIFT = 13;
const PALETTE_MASK = 3;
const COLOURS_PER_LINE = 16;
const NIBBLE_MASK = 0xf;
const NIBBLE_BITS = 4;
export function skyPlaneFrom(assets: SkyAssets, C: SkyConstants, tiles: Uint8Array = assets.tiles): SkyPlane {
    const cell = C.CELL;
    const rowBytes = cell / 2;
    const tileBytes = rowBytes * cell;
    return (px, py) => {
        const row = Math.floor(py / cell);
        if (row < 0 || row >= C.PANORAMA_ROWS)
            return 0;
        const col = Math.floor(px / cell);
        const w = assets.map[row * C.PANORAMA_COLUMNS + col]!;
        const tile = (w & TILE_MASK) - assets.tileBase;
        if (tile < 0 || tile >= assets.tileCount)
            return 0;
        let tx = px % cell;
        let ty = py % cell;
        if (w & FLIP_H_BIT)
            tx = cell - 1 - tx;
        if (w & FLIP_V_BIT)
            ty = cell - 1 - ty;
        const byte = tiles[tile * tileBytes + ty * rowBytes + (tx >> 1)]!;
        const c = tx % 2 === 0 ? (byte >> NIBBLE_BITS) & NIBBLE_MASK : byte & NIBBLE_MASK;
        return c === 0 ? 0 : ((w >> PALETTE_SHIFT) & PALETTE_MASK) * COLOURS_PER_LINE + c;
    };
}
interface Prim {
    fa: number;
    sa: number;
    fb: number;
    sb: number;
    ga: number;
    gb: number;
    cell: readonly [
        number,
        number
    ];
    face: number;
    word: number | null;
    uBase: number;
    uSpan: number;
    ramp: {
        hi: number;
        lo: number;
    } | null;
    lift?: boolean;
    stair?: boolean;
}
interface Strip {
    fa: number;
    sa: number;
    fb: number;
    sb: number;
    kind: "live" | "constant";
    stair: boolean;
}
const FACE_ORDER: readonly Face[] = [FACE_LOW_Y, FACE_HIGH_Y, FACE_LOW_X, FACE_HIGH_X];
function faceEnds(face: Face, X: number, Y: number, S: number): [
    number,
    number,
    number,
    number
] {
    switch (face) {
        case FACE_LOW_Y: return [X + S, Y, X, Y];
        case FACE_HIGH_Y: return [X, Y + S, X + S, Y + S];
        case FACE_LOW_X: return [X, Y, X, Y + S];
        default: return [X + S, Y + S, X + S, Y];
    }
}
const FACE_NEIGHBOUR: Readonly<Record<number, readonly [
    number,
    number
]>> = { [FACE_LOW_Y]: [0, -1], [FACE_HIGH_Y]: [0, 1], [FACE_LOW_X]: [-1, 0], [FACE_HIGH_X]: [1, 0] };
const FACE_OPPOSITE: Readonly<Record<number, Face>> = { [FACE_LOW_Y]: FACE_HIGH_Y, [FACE_HIGH_Y]: FACE_LOW_Y, [FACE_LOW_X]: FACE_HIGH_X, [FACE_HIGH_X]: FACE_LOW_X };
interface Scene {
    readonly prims: Prim[];
    readonly bins: number[][];
    readonly strips: Strip[];
    readonly stripBins: number[][];
}
export interface WorldFace {
    readonly ax: number;
    readonly ay: number;
    readonly bx: number;
    readonly by: number;
    readonly twoSided: boolean;
    readonly isLow: boolean | null;
    readonly cell: readonly [
        number,
        number
    ];
    readonly face: number;
    readonly word: number | null;
    readonly uBase: number;
    readonly uSpan: number;
    readonly ramp: {
        readonly hi: number;
        readonly lo: number;
    } | null;
    readonly lift?: boolean;
    readonly stair?: boolean;
}
export interface WorldStrip {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
    readonly kind: "live" | "constant";
    readonly stair?: boolean;
}
class SceneBuilder {
    readonly prims: Prim[] = [];
    readonly strips: Strip[] = [];
    readonly worldFaces: WorldFace[] = [];
    readonly worldStrips: WorldStrip[] = [];
    private readonly cell: number;
    private readonly cosA: number;
    private readonly sinA: number;
    private readonly camX: number;
    private readonly camY: number;
    private readonly doorTimer = new Map<string, number>();
    private readonly rampOf = new Map<string, {
        hi: number;
        lo: number;
    }>();
    readonly notes: string[] = [];
    constructor(private readonly snap: ViewSnapshot, private readonly st: HdStatics, private readonly C: HdConstants, private readonly cab: CabScene | null = null, private readonly stairsOn = true) {
        const R = st.R;
        this.cell = 1 << R.CELL_SHIFT;
        const a = (snap.cam.angle * 2 * Math.PI) / R.ANGLES;
        this.sinA = Math.sin(a);
        this.cosA = Math.cos(a);
        this.camX = snap.cam.x;
        this.camY = snap.cam.y;
        for (const d of snap.doors)
            this.doorTimer.set(`${d.cell[0]},${d.cell[1]}`, d.timer);
        for (const r of snap.ramps)
            this.rampOf.set(`${r.cell[0]},${r.cell[1]},${r.face}`, { hi: r.hi, lo: r.lo });
    }
    private fs(wx: number, wy: number): [
        number,
        number
    ] {
        const dx = wx - this.camX;
        const dy = wy - this.camY;
        return [dx * this.sinA - dy * this.cosA, dx * this.cosA + dy * this.sinA];
    }
    private edgeSolid(cls: number, face: Face): boolean {
        const R = this.st.R;
        if (cls === R.CLASS_WALL || (cls >= R.CLASS_SOLID_FIRST && cls <= R.CLASS_SOLID_LAST) || R.RAMP.HIT_CLASSES.includes(cls))
            return true;
        if (R.DIAG.HYPOTENUSE.has(cls)) {
            const key = DIAG_FACE_KEYS[DIAG_FACE_KEYS.indexOf(FACE_NAMES[face].replace("_", "-") as (typeof DIAG_FACE_KEYS)[number])]!;
            return !R.DIAG.BY_FACE[key].includes(cls);
        }
        return false;
    }
    private clsAt(x: number, y: number): number | null {
        const m = this.snap.map;
        if (x < 0 || y < 0 || x >= m.side || y >= m.side)
            return null;
        return m.cls[y * m.side + x]!;
    }
    private wordOf(x: number, y: number, word: number): number | null {
        const m = this.snap.map;
        return this.st.floor.words[m.block[y * m.side + x]!]?.[word] ?? null;
    }
    private addSegment(ax: number, ay: number, bx: number, by: number, twoSided: boolean, make: (swapped: boolean) => Omit<Prim, "fa" | "sa" | "fb" | "sb" | "ga" | "gb">, isLow: boolean | null = null): void {
        const m0 = make(false);
        this.worldFaces.push({ ax, ay, bx, by, twoSided, isLow, cell: m0.cell, face: m0.face, word: m0.word, uBase: m0.uBase, uSpan: m0.uSpan, ramp: m0.ramp, ...(m0.lift === true ? { lift: true } : {}), ...(m0.stair === true ? { stair: true } : {}) });
        let [fa, sa] = this.fs(ax, ay);
        let [fb, sb] = this.fs(bx, by);
        const cross = sa * fb - sb * fa;
        if (cross === 0)
            return;
        let swapped = false;
        if (cross > 0) {
            if (!twoSided)
                return;
            [fa, sa, fb, sb] = [fb, sb, fa, sa];
            swapped = true;
        }
        const near = this.C.NEAR;
        let ga = 0;
        let gb = 1;
        if (fa < near && fb < near)
            return;
        if (fa < near) {
            const k = (near - fa) / (fb - fa);
            sa += k * (sb - sa);
            fa = near;
            ga = k;
        }
        else if (fb < near) {
            const k = (near - fa) / (fb - fa);
            sb = sa + k * (sb - sa);
            fb = near;
            gb = k;
        }
        this.prims.push({ fa, sa, fb, sb, ga, gb, ...make(swapped) });
    }
    build(): void {
        const { snap, st } = this;
        const R = st.R;
        const S = this.cell;
        const box = snap.box;
        const [bcx, bcy] = box.cell;
        const D = R.DOOR;
        const fakeX = this.C.DOOR.FAKE_X;
        const fakeY = this.C.DOOR.FAKE_Y;
        for (let cy = bcy + box.yb; cy <= bcy + box.yt; cy++) {
            for (let cx = bcx + box.xl; cx <= bcx + box.xr; cx++) {
                const cls = this.clsAt(cx, cy);
                if (cls === null)
                    continue;
                const X = S * cx;
                const Y = S * cy;
                const full = cls === R.CLASS_WALL || (cls >= R.CLASS_SOLID_FIRST && cls <= R.CLASS_SOLID_LAST) || R.RAMP.HIT_CLASSES.includes(cls);
                const diag = R.DIAG.HYPOTENUSE.get(cls);
                if (full || diag) {
                    for (const face of FACE_ORDER) {
                        if (diag && !this.edgeSolid(cls, face))
                            continue;
                        const [dx, dy] = FACE_NEIGHBOUR[face]!;
                        const ncls = this.clsAt(cx + dx, cy + dy);
                        if (ncls === null)
                            continue;
                        if (this.edgeSolid(ncls, FACE_OPPOSITE[face]!))
                            continue;
                        const [ax, ay, bx, by] = faceEnds(face, X, Y, S);
                        const word = this.wordOf(cx, cy, R.FACE_WORD[FACE_NAMES[face] as keyof typeof R.FACE_WORD]);
                        let ramp = this.rampOf.get(`${cx},${cy},${face}`) ?? null;
                        const lift = this.cab !== null && cls === R.RAMP.LIFT_CLASS;
                        if (lift) {
                            const sh = this.cab!.shiftOf([cx, cy], face) / this.C.EYE.PER_E;
                            ramp = sh === 0 ? null : { hi: sh, lo: sh };
                        }
                        const stair = this.stairsOn && cls !== R.RAMP.LIFT_CLASS && R.RAMP.HIT_CLASSES.includes(cls);
                        this.addSegment(ax, ay, bx, by, false, () => ({ cell: [cx, cy] as const, face, word, uBase: 0, uSpan: this.texelsWide(), ramp, lift, stair }));
                    }
                    if (diag) {
                        const word = this.wordOf(cx, cy, diag.face_word);
                        this.addSegment(X + diag.left[0], Y + diag.left[1], X + diag.right[0], Y + diag.right[1], false, () => ({ cell: [cx, cy] as const, face: FACE_HYPOTENUSE, word, uBase: 0, uSpan: this.texelsWide(), ramp: null }));
                    }
                    continue;
                }
                const closedX = cls === D.CLASS_CLOSED_X || cls === fakeX;
                const closedY = cls === D.CLASS_CLOSED_Y || cls === fakeY;
                const queuedX = cls === D.CLASS_PANE_X;
                const queuedY = cls === D.CLASS_PANE_Y;
                if (closedX || closedY || queuedX || queuedY) {
                    this.door(cx, cy, closedX || queuedX, closedX || closedY);
                    continue;
                }
                const rule = this.cab !== null && this.cab.liftClasses.has(cls) ? undefined : R.RAMP.SEGMENT_RULES.get(cls);
                if (rule) {
                    const dx = cx - bcx;
                    const dy = cy - bcy;
                    const o = rule.axis === "dx" ? dx : dy;
                    if (rule.when === "positive" ? o > 0 : o < 0) {
                        const [fa, sa] = this.fs(S * (bcx + dx + rule.p1[0]), S * (bcy + dy + rule.p1[1]));
                        const [fb, sb] = this.fs(S * (bcx + dx + rule.p2[0]), S * (bcy + dy + rule.p2[1]));
                        const stair = this.stairStrip(cls);
                        this.strips.push({ fa, sa, fb, sb, kind: rule.kind, stair });
                        this.worldStrips.push({ x1: S * (bcx + dx + rule.p1[0]), y1: S * (bcy + dy + rule.p1[1]), x2: S * (bcx + dx + rule.p2[0]), y2: S * (bcy + dy + rule.p2[1]), kind: rule.kind, ...(stair ? { stair: true } : {}) });
                    }
                }
            }
        }
    }
    private stairStrip(cls: number): boolean {
        const L = this.st.lift;
        if (L === undefined || !this.stairsOn)
            return false;
        return !(L.UP.includes(cls) || L.DOWN.includes(cls) || L.BOTH.includes(cls) || L.ARRIVE.includes(cls));
    }
    private texelsWide(): number {
        return (METATEXTURE_SLOTS / 2) * this.st.R.TEX_COLUMNS * 2;
    }
    private door(cx: number, cy: number, alongX: boolean, closed: boolean): void {
        const D = this.st.R.DOOR;
        const S = this.cell;
        const X = S * cx;
        const Y = S * cy;
        const base = alongX ? X : Y;
        const word = D.TEX_DEF;
        const wide = this.texelsWide();
        const line = (lo: number, hi: number): [
            number,
            number,
            number,
            number
        ] => (alongX ? [lo, Y + D.CENTRE, hi, Y + D.CENTRE] : [X + D.CENTRE, lo, X + D.CENTRE, hi]);
        if (closed) {
            const [ax, ay, bx, by] = line(base, base + D.CELL);
            this.addSegment(ax, ay, bx, by, true, () => ({ cell: [cx, cy] as const, face: FACE_DOOR, word, uBase: 0, uSpan: wide, ramp: null }));
            return;
        }
        const t = this.doorTimer.get(`${cx},${cy}`);
        if (t === undefined) {
            this.notes.push(`door cell (${cx}, ${cy}) has a pane class and no entry in the snapshot's door list (W 4.16.2): nothing drawn`);
            return;
        }
        if (t >= D.TIMER_MAX)
            return;
        const halves: Array<{
            lo: number;
            hi: number;
            isLow: boolean;
        }> = [
            { lo: base - t, hi: base - t + D.HALF, isLow: true },
            { lo: base + D.HALF + t, hi: base + 2 * D.HALF + t, isLow: false },
        ];
        for (const h of halves) {
            const [ax, ay, bx, by] = line(h.lo, h.hi);
            this.addSegment(ax, ay, bx, by, true, (swapped) => {
                const leftIsLow = !swapped;
                const isLeftHalf = h.isLow === leftIsLow;
                return { cell: [cx, cy] as const, face: FACE_DOOR, word, uBase: isLeftHalf ? 0 : wide / 2, uSpan: wide / 2, ramp: null };
            }, h.isLow);
        }
    }
    bin(ucol: Float64Array): Scene {
        const cols = ucol.length;
        const bins: number[][] = Array.from({ length: cols }, () => []);
        const stripBins: number[][] = Array.from({ length: cols }, () => []);
        const u0 = ucol[0]!;
        const du = cols > 1 ? ucol[1]! - u0 : 1;
        const span = (a: number, b: number, into: number[][], id: number): void => {
            const lo = Math.min(a, b);
            const hi = Math.max(a, b);
            const j0 = Math.max(0, Math.ceil((lo - u0) / du - 1e-9));
            const j1 = Math.min(cols - 1, Math.floor((hi - u0) / du + 1e-9));
            for (let j = j0; j <= j1; j++)
                into[j]!.push(id);
        };
        this.prims.forEach((p, i) => span(p.sa / p.fa, p.sb / p.fb, bins, i));
        this.strips.forEach((s, i) => {
            let { fa, sa, fb, sb } = s;
            const near = this.C.NEAR;
            if (fa < near && fb < near)
                return;
            if (fa < near) {
                const k = (near - fa) / (fb - fa);
                sa += k * (sb - sa);
                fa = near;
            }
            else if (fb < near) {
                const k = (near - fa) / (fb - fa);
                sb = sa + k * (sb - sa);
                fb = near;
            }
            s.fa = fa;
            s.sa = sa;
            s.fb = fb;
            s.sb = sb;
            span(sa / fa, sb / fb, stripBins, i);
        });
        return { prims: this.prims, bins, strips: this.strips, stripBins };
    }
}
export function bandFunction(table: readonly number[], smooth: boolean): (c: number) => number {
    const runs: Array<{
        start: number;
        end: number;
        band: number;
    }> = [];
    for (let k = 0; k < table.length; k++) {
        const b = table[k]!;
        if (b <= 0)
            continue;
        const last = runs[runs.length - 1];
        if (last && last.band === b && last.end === 2 * k)
            last.end = 2 * k + 2;
        else
            runs.push({ start: 2 * k, end: 2 * k + 2, band: b });
    }
    if (runs.length === 0)
        return () => 0;
    const first = runs[0]!.start;
    const endAll = runs[runs.length - 1]!.end;
    if (!smooth) {
        return (c) => {
            if (c < first)
                return 0;
            const k = Math.floor(c / 2);
            return table[k] ?? 0;
        };
    }
    const pts: Array<[
        number,
        number
    ]> = runs.map((r) => [(r.start + r.end) / 2, r.band]);
    pts.push([endAll, 0]);
    return (c) => {
        if (c < first || c >= endAll)
            return 0;
        if (c <= pts[0]![0])
            return pts[0]![1];
        for (let i = 1; i < pts.length; i++) {
            const [c1, b1] = pts[i]!;
            if (c <= c1) {
                const [c0, b0] = pts[i - 1]!;
                return b0 + ((b1 - b0) * (c - c0)) / (c1 - c0);
            }
        }
        return 0;
    };
}
export function collectWorld(snap: ViewSnapshot, st: HdStatics, C: HdConstants, params: Pick<HdParams, "cab"> = {}): {
    faces: WorldFace[];
    strips: WorldStrip[];
    notes: string[];
} {
    const cabScene = cabsOf(snap, st, C, params);
    const sb = new SceneBuilder(snap, st, C, cabScene);
    sb.build();
    return { faces: sb.worldFaces, strips: sb.worldStrips, notes: sb.notes };
}
export function paletteRgb(words: readonly number[]): Float32Array {
    const pal = new Float32Array(64 * 3);
    for (let i = 0; i < 64; i++)
        wordRgb(words[i] ?? 0, pal, 3 * i);
    return pal;
}
export interface LaneColours {
    readonly rgb: Float32Array;
    readonly opaque: Uint8Array;
    readonly artRgb: Float32Array;
    readonly artOpaque: Uint8Array;
    readonly E: number;
}
export function laneColours(snap: ViewSnapshot, st: HdStatics, pal: Float32Array): LaneColours {
    const R = st.R;
    const laneRows = R.VIEW_ROWS;
    const art = (snap.night && snap.mode !== NIGHT_OWN_ART_MODE ? st.assets.nightLaneArt : st.assets.laneArt(snap.mode)) ?? null;
    const lanes = art ? rebuildLanes(art, snap.cam.eye_lanes, R) : null;
    const deDither = (src: Uint8Array | null): {
        rgb: Float32Array;
        opaque: Uint8Array;
    } => {
        const rgb = new Float32Array(laneRows * 3);
        const opaque = new Uint8Array(laneRows);
        if (src) {
            for (let r = 0; r < laneRows; r++) {
                let n = 0;
                const acc = [0, 0, 0];
                for (const byte of [src[r]!, src[laneRows + r]!]) {
                    for (const idx of [byte >> NIBBLE_BITS, byte & NIBBLE_MASK]) {
                        if (idx === 0)
                            continue;
                        n++;
                        for (let k = 0; k < 3; k++)
                            acc[k] += pal[3 * idx + k]!;
                    }
                }
                if (n > 0) {
                    opaque[r] = 1;
                    for (let k = 0; k < 3; k++)
                        rgb[3 * r + k] = acc[k]! / n;
                }
            }
        }
        return { rgb, opaque };
    };
    const own = deDither(lanes);
    const raw = deDither(art);
    return { rgb: own.rgb, opaque: own.opaque, artRgb: raw.rgb, artOpaque: raw.opaque, E: snap.cam.eye_lanes };
}
export function laneAt(lc: LaneColours, r: number, R: HdStatics["R"], out: Float64Array | Float32Array, at = 0): boolean {
    const inside = r >= 0 && r < R.VIEW_ROWS;
    const row = inside ? r : laneBeyondArtRow(r, lc.E, R);
    const rgb = inside ? lc.rgb : lc.artRgb;
    const opq = inside ? lc.opaque : lc.artOpaque;
    out[at] = rgb[3 * row]!;
    out[at + 1] = rgb[3 * row + 1]!;
    out[at + 2] = rgb[3 * row + 2]!;
    return opq[row] === 1;
}
export function shadeTables(snap: ViewSnapshot, st: HdStatics, pal: Float32Array): {
    shaded: boolean;
    tables: Float32Array[];
} {
    const R = st.R;
    const lutSet = R.WALL_LUT_SET_BY_MODE[snap.mode]!;
    const shaded = !snap.night && lutSet !== 0;
    const tables: Float32Array[] = [];
    for (let b = 0; b <= R.SHADE_BANDS; b++) {
        const t = new Float32Array(16 * 3);
        const lut = b > 0 && shaded ? st.assets.lut(lutSet, b) : null;
        for (let i = 0; i < 16; i++) {
            if (lut) {
                const v = lut[(i << NIBBLE_BITS) | i]!;
                for (let k = 0; k < 3; k++)
                    t[3 * i + k] = (pal[3 * (v >> NIBBLE_BITS) + k]! + pal[3 * (v & NIBBLE_MASK) + k]!) / 2;
            }
            else
                for (let k = 0; k < 3; k++)
                    t[3 * i + k] = pal[3 * i + k]!;
        }
        tables.push(t);
    }
    return { shaded, tables };
}
const OWN_EPS = 1e-9;
export const PERMIT_RAMP = 0;
export const PERMIT_LIVE = 1;
export const PERMIT_CONST = 2;
export const PERMIT_KINDS = 3;
export function originalColumnOf(u: number, R: HdStatics["R"]): number {
    return Math.floor(u * R.COLUMN_CENTRE + R.COLUMN_CENTRE);
}
function rayPermits(sb: SceneBuilder, R: HdStatics["R"], C: HdConstants): Uint8Array {
    const k = (2 * Math.PI) / R.ANGLES;
    const tan = Float64Array.from(R.COLUMN_ANGLES, (a) => Math.tan(a * k));
    const scene = sb.bin(new Float64Array(1));
    const allPrims = scene.prims.map((_, i) => i);
    const allStrips = scene.strips.map((_, i) => i);
    const out = new Uint8Array(PERMIT_KINDS * tan.length);
    for (let j = 0; j < tan.length; j++) {
        const u = tan[j]!;
        let best = -1;
        let bestF = Infinity;
        for (const id of allPrims) {
            const p = scene.prims[id]!;
            const den = p.sb - p.sa - u * (p.fb - p.fa);
            if (Math.abs(den) < 1e-12)
                continue;
            const t = (u * p.fa - p.sa) / den;
            if (t < -1e-9 || t > 1 + 1e-9)
                continue;
            const F = p.fa + t * (p.fb - p.fa);
            if (F < C.NEAR - 1e-9)
                continue;
            if (F < bestF) {
                best = id;
                bestF = F;
            }
        }
        if (best >= 0 && scene.prims[best]!.ramp)
            out[PERMIT_KINDS * j + PERMIT_RAMP] = 1;
        for (const id of allStrips) {
            const s = scene.strips[id]!;
            const den = s.sb - s.sa - u * (s.fb - s.fa);
            if (Math.abs(den) < 1e-12)
                continue;
            const t = (u * s.fa - s.sa) / den;
            if (t < -1e-9 || t > 1 + 1e-9)
                continue;
            const F = s.fa + t * (s.fb - s.fa);
            if (F < C.NEAR - 1e-9 || F > bestF * (1 + TIE_EPS))
                continue;
            out[PERMIT_KINDS * j + (s.kind === "live" ? PERMIT_LIVE : PERMIT_CONST)] = 1;
        }
    }
    return out;
}
export interface BeyondEdges {
    readonly top: Uint8Array;
    readonly bot: Uint8Array;
}
export function beyondEdges(snap: ViewSnapshot, st: HdStatics, screen: HdScreen, params: HdParams, area: HdArea, C: HdConstants): BeyondEdges {
    const out: BeyondEdges = { top: new Uint8Array(area.cols), bot: new Uint8Array(area.cols) };
    renderColumns(snap, st, screen, params, area, C, undefined, out);
    return out;
}
export function originalRayPermits(snap: ViewSnapshot, st: HdStatics, C: HdConstants, params: Pick<HdParams, "cab"> = {}): Uint8Array {
    const sb = new SceneBuilder(snap, st, C, cabsOf(snap, st, C, params));
    sb.build();
    return rayPermits(sb, st.R, C);
}
export function ownColumnTangents(angles: readonly number[], turn: number): [
    number,
    number
] {
    const k = (2 * Math.PI) / turn;
    return [Math.tan(angles[0]! * k), Math.tan(angles[angles.length - 1]! * k)];
}
export function rampFillRgb(st: HdStatics, pal: Float32Array): Float32Array {
    const fill = new Float32Array(3);
    const fb = st.R.RAMP.FILL_BYTE;
    for (let k = 0; k < 3; k++)
        fill[k] = (pal[3 * (fb >> NIBBLE_BITS) + k]! + pal[3 * (fb & NIBBLE_MASK) + k]!) / 2;
    return fill;
}
export function renderColumns(snap: ViewSnapshot, st: HdStatics, screen: HdScreen, params: HdParams, area: HdArea, C: HdConstants, billboards?: BillboardEnv, probeOut?: BeyondEdges): HdPicture {
    const R = st.R;
    const { cols, rows } = area;
    const { fx, fy, cx, cy } = hdProjection(params, area, C);
    const CELL = 1 << R.CELL_SHIFT;
    const colW = area.width / cols;
    const rowH = area.height / rows;
    const notes: string[] = [];
    const pal = paletteRgb(screen.palette);
    const backdropRgb: [
        number,
        number,
        number
    ] = [pal[3 * screen.backdrop]!, pal[3 * screen.backdrop + 1]!, pal[3 * screen.backdrop + 2]!];
    const ucol = new Float64Array(cols);
    const phase = area.colPhase ?? COLUMN_CENTRE_PHASE;
    for (let j = 0; j < cols; j++)
        ucol[j] = ((j + phase) * colW - cx) / fx;
    const cabScene = cabsOf(snap, st, C, params);
    const sb = new SceneBuilder(snap, st, C, cabScene, params.stairs !== false);
    sb.build();
    notes.push(...sb.notes);
    const permits = params.rayFill === false ? null : rayPermits(sb, R, C);
    const scene = sb.bin(ucol);
    const laneRows = R.VIEW_ROWS;
    const lanesOf = laneColours(snap, st, pal);
    const { rgb: laneRgb, opaque: laneOpaque } = lanesOf;
    const origFy = R.COLUMN_CENTRE;
    const rawR = new Float64Array(rows);
    const laneRow = new Int32Array(rows);
    const rowRgb = new Float64Array(rows * 3);
    const rowOpaque = new Uint8Array(rows);
    for (let y = 0; y < rows; y++) {
        const dyc = (y + 0.5) * rowH - cy;
        rawR[y] = Math.floor(R.BIG_HALF_ROWS + (dyc * origFy) / fy);
        laneRow[y] = Math.max(0, Math.min(laneRows - 1, rawR[y]!));
        rowOpaque[y] = laneAt(params.laneClamp === true ? { ...lanesOf, artRgb: lanesOf.rgb, artOpaque: lanesOf.opaque, E: 0 } : lanesOf, rawR[y]!, R, rowRgb, 3 * y) ? 1 : 0;
    }
    const rideRow = new Int32Array(rows).fill(-2);
    if (cabScene !== null && cabScene.riding !== null) {
        const hl = C.EYE.BASE + C.EYE.PER_E * snap.cam.eye_lanes;
        const hw = C.EYE.BASE + C.EYE.PER_E * snap.cam.eye_walls;
        for (let y = 0; y < rows; y++) {
            const rr = R.BIG_HALF_ROWS + (((y + 0.5) * rowH - cy) * origFy) / fy;
            const m = rideLaneRow(rr, R.BIG_HALF_ROWS, hl, hw, CELL);
            rideRow[y] = m === null ? -1 : Math.max(0, Math.min(laneRows - 1, Math.floor(m)));
        }
    }
    const camAng = (snap.cam.angle * 2 * Math.PI) / R.ANGLES;
    const sinA = Math.sin(camAng);
    const cosA = Math.cos(camAng);
    const fillRow = new Uint8Array(rows);
    for (let y = 0; y < rows; y++)
        fillRow[y] = params.fillBeyond === true || (rawR[y]! >= 0 && rawR[y]! < laneRows) ? 1 : 0;
    let yTop = rows;
    let yBot = -1;
    for (let y = 0; y < rows; y++) {
        if (rawR[y]! >= 0 && y < yTop)
            yTop = y;
        if (rawR[y]! < laneRows)
            yBot = y;
    }
    const beyondOn = params.beyondRows !== false && params.fillBeyond !== true && (yTop > 0 || yBot < rows - 1) && yTop <= yBot;
    const edgeTop = probeOut ? probeOut.top : new Uint8Array(cols);
    const edgeBot = probeOut ? probeOut.bot : new Uint8Array(cols);
    const beyondOf = (y: number): number => (rawR[y]! < 0 ? 1 : rawR[y]! >= laneRows ? 2 : 0);
    const [tanLo, tanHi] = ownColumnTangents(R.COLUMN_ANGLES, R.ANGLES);
    const { shaded, tables: tbl } = shadeTables(snap, st, pal);
    const bands = R.SHADE_BANDS;
    const bandOf = bandFunction(R.SHADE_BAND_BY_HEIGHT, params.smooth);
    const bandOrig = bandFunction(R.SHADE_BAND_BY_HEIGHT, false);
    const lutSetOf = R.WALL_LUT_SET_BY_MODE[snap.mode]!;
    const lutShaded = !snap.night && lutSetOf !== 0;
    const fill = rampFillRgb(st, pal);
    const far = screen.far;
    const framing = far ? framingFor({ fx, fy, cx, cy }, frameGeometry(R)) : null;
    const farRgb = new Float64Array(3);
    const farShift = st.sky !== null ? farSkyShift(st.sky.C, snap.cam.angle, screen.farHs ?? null) : 0;
    const sky = st.sky;
    const plane = screen.skyPlane ?? sky?.plane ?? null;
    const skyOn = sky !== null && plane !== null && snap.sky.class !== null && snap.sky.vs !== null;
    const eyeWalls = C.EYE.BASE + C.EYE.PER_E * snap.cam.eye_walls;
    const texH = 2 * R.TEX_SIZE;
    const unitsToRad = (2 * Math.PI) / R.ANGLES;
    const texelOf = (word: number | null, ut: number, vt: number): number => {
        if (word === null)
            return 0;
        const pair = Math.floor(ut / (R.TEX_COLUMNS * 2));
        const px = ut % (R.TEX_COLUMNS * 2);
        const slot = 2 * pair + (vt >= R.TEX_SIZE ? 1 : 0);
        const t = snap.metatex[word * METATEXTURE_SLOTS + slot];
        if (t === undefined || t >= st.assets.textureCount)
            return 0;
        const byte = st.assets.textures[(t * R.TEX_COLUMNS + (px >> 1)) * R.TEX_SIZE + (vt % R.TEX_SIZE)]!;
        return px & 1 ? byte & NIBBLE_MASK : byte >> NIBBLE_BITS;
    };
    const opaqueOf = (word: number | null, ut: number, vt: number, b0: number): boolean => {
        if (word === null || params.opaqueZero === true)
            return true;
        const pair = Math.floor(ut / (R.TEX_COLUMNS * 2));
        const px = ut % (R.TEX_COLUMNS * 2);
        const slot = 2 * pair + (vt >= R.TEX_SIZE ? 1 : 0);
        const t = snap.metatex[word * METATEXTURE_SLOTS + slot];
        if (t === undefined || t >= st.assets.textureCount)
            return true;
        let byte = st.assets.textures[(t * R.TEX_COLUMNS + (px >> 1)) * R.TEX_SIZE + (vt % R.TEX_SIZE)]!;
        if (b0 > 0 && lutShaded) {
            const lut = st.assets.lut(lutSetOf, b0);
            if (lut)
                byte = lut[byte]!;
        }
        return (px & 1 ? byte & NIBBLE_MASK : byte >> NIBBLE_BITS) !== 0;
    };
    const bufRows = probeOut ? 2 : rows;
    const rgba = new Uint8ClampedArray(cols * bufRows * 4);
    const source = new Uint8Array(cols * bufRows);
    const transparent = new Uint8Array(cols * bufRows);
    const height = new Float32Array(cols);
    const forward = new Float32Array(cols);
    const stripForward = new Float32Array(cols);
    const hit: Array<HdHit | null> = new Array<HdHit | null>(cols).fill(null);
    const rgb = new Float64Array(3);
    for (let j = 0; j < cols; j++) {
        const u = ucol[j]!;
        const ownCol = params.fillBeyond === true || (u >= tanLo - OWN_EPS && u <= tanHi + OWN_EPS);
        const oj = originalColumnOf(u, R);
        const permit = (kind: number): boolean => permits === null || params.fillBeyond === true || permits[PERMIT_KINDS * oj + kind] === 1;
        let best = -1;
        let bestF = Infinity;
        let bestG = 0;
        const cands: Array<{
            id: number;
            F: number;
            G: number;
        }> = [];
        for (const id of scene.bins[j]!) {
            const p = scene.prims[id]!;
            const den = p.sb - p.sa - u * (p.fb - p.fa);
            if (Math.abs(den) < 1e-12)
                continue;
            const k = (u * p.fa - p.sa) / den;
            if (k < -1e-9 || k > 1 + 1e-9)
                continue;
            const F = p.fa + k * (p.fb - p.fa);
            if (F < C.NEAR - 1e-9)
                continue;
            if (params.seeThrough === true)
                cands.push({ id, F, G: p.ga + k * (p.gb - p.ga) });
            if (F < bestF) {
                best = id;
                bestF = F;
                bestG = p.ga + k * (p.gb - p.ga);
            }
        }
        const prim = best >= 0 ? scene.prims[best]! : null;
        if (prim) {
            height[j] = (fy * CELL) / bestF;
            forward[j] = bestF;
            hit[j] = { cell: prim.cell, face: prim.face };
        }
        const near: Array<{
            F: number;
            kind: "live" | "constant";
            stair: boolean;
        }> = [];
        for (const id of params.strips === false ? [] : scene.stripBins[j]!) {
            const s = scene.strips[id]!;
            const den = s.sb - s.sa - u * (s.fb - s.fa);
            if (Math.abs(den) < 1e-12)
                continue;
            const k = (u * s.fa - s.sa) / den;
            if (k < -1e-9 || k > 1 + 1e-9)
                continue;
            const F = s.fa + k * (s.fb - s.fa);
            if (F < C.NEAR - 1e-9 || F > bestF * (1 + TIE_EPS))
                continue;
            near.push({ F, kind: s.kind, stair: s.stair });
        }
        near.sort((a, b) => b.F - a.F);
        if (near.length > 0)
            stripForward[j] = near[0]!.F;
        let beta = 0;
        let b0 = 0;
        let bLo = 0;
        let bHi = 0;
        let bFr = 0;
        const shadeFor = (F: number): void => {
            beta = 0;
            b0 = 0;
            if (shaded) {
                b0 = bandOrig(R.STEP_NUMERATOR / ((1 << (R.CELL_SHIFT - R.SIN_SHIFT)) * F));
                beta = bandOf(R.STEP_NUMERATOR / ((1 << (R.CELL_SHIFT - R.SIN_SHIFT)) * F));
                if (snap.beam_first !== null && beta > 0) {
                    const o = u * R.COLUMN_CENTRE + R.COLUMN_CENTRE;
                    const first = snap.beam_first;
                    const w = params.smooth ? Math.max(0, Math.min(1, Math.min(o - first, first + R.LIGHT.BEAM_COLUMNS - o) + 0.5)) : o >= first && o < first + R.LIGHT.BEAM_COLUMNS ? 1 : 0;
                    beta *= 1 - w;
                    if (w > 0.5)
                        b0 = 0;
                }
            }
            bLo = Math.floor(beta);
            bHi = Math.min(bands, Math.ceil(beta));
            bFr = beta - bLo;
        };
        if (prim)
            shadeFor(bestF);
        const shadeRgb = (i: number, out: Float64Array, weight: number, accumulate: boolean): void => {
            for (let k = 0; k < 3; k++) {
                const v = bFr === 0 ? tbl[bLo]![3 * i + k]! : tbl[bLo]![3 * i + k]! * (1 - bFr) + tbl[bHi]![3 * i + k]! * bFr;
                out[k] = accumulate ? out[k]! + v * weight : v * weight;
            }
        };
        const theta = Math.atan(u) / unitsToRad;
        let lastBgLane = true;
        let rideShaft = false;
        const edgeBitsOf = (y: number): number => {
            if (!beyondOn)
                return 0;
            const b = beyondOf(y);
            return b === 1 ? edgeTop[j]! : b === 2 ? edgeBot[j]! : 0;
        };
        const bg = (y: number, out: Float64Array, skyOnly = false, noEdge = false): void => {
            const d11 = skyOnly && params.cityWindow === false;
            if (d11)
                skyOnly = false;
            const rideR = rideRow[y]!;
            if (rideR === -1 && !skyOnly) {
                lastBgLane = true;
                rideShaft = true;
                out[0] = fill[0]!;
                out[1] = fill[1]!;
                out[2] = fill[2]!;
                return;
            }
            const r = rideR >= 0 ? rideR : laneRow[y]!;
            lastBgLane = false;
            const ridden = rideR >= 0;
            if (!skyOnly && (ridden ? laneOpaque[r] : rowOpaque[y]) && (noEdge || (edgeBitsOf(y) & EDGE_SKY) === 0)) {
                lastBgLane = true;
                out[0] = ridden ? laneRgb[3 * r]! : rowRgb[3 * y]!;
                out[1] = ridden ? laneRgb[3 * r + 1]! : rowRgb[3 * y + 1]!;
                out[2] = ridden ? laneRgb[3 * r + 2]! : rowRgb[3 * y + 2]!;
                return;
            }
            if (far && framing && !d11) {
                const ax = (j + phase) * colW;
                const ay = (y + 0.5) * rowH;
                const [ffx, ffy] = params.farByFraming === true ? areaToFrame(framing, ax, ay) : params.farByAzimuth === true || params.skyCylinder === true ? areaToFrameSky(framing, ax, ay) : areaToFrameOnSky(framing, ax, ay, farShift);
                if (sampleFarLayer(far, ffx, ffy, params.filter === "smooth", pal, farRgb)) {
                    out[0] = farRgb[0]!;
                    out[1] = farRgb[1]!;
                    out[2] = farRgb[2]!;
                    return;
                }
            }
            if (skyOn) {
                const SC = sky!.C;
                const wPx = SC.PANORAMA_COLUMNS * SC.CELL;
                const wPy = SC.PLANE_ROWS * SC.CELL;
                const off = params.skyCylinder === true ? 2 * theta : (u * SC.VIEW_W) / 2;
                const px = (((Math.floor(SC.VIEW_X - SC.SCROLL_BIAS + SC.SCROLL_FACTOR * snap.cam.angle + SC.VIEW_W / 2 + off)) % wPx) + wPx) % wPx;
                const rawPy = SC.VIEW_Y + rawR[y]! + snap.sky.vs!;
                const py = ((rawPy % wPy) + wPy) % wPy;
                const ev = skyExtAt(sky!.ext, px, rawPy);
                if (ev > 0) {
                    out[0] = pal[3 * ev]!;
                    out[1] = pal[3 * ev + 1]!;
                    out[2] = pal[3 * ev + 2]!;
                    return;
                }
                if (ev < 0 && py < SC.PANORAMA_ROWS * SC.CELL) {
                    const v = plane!(px, py);
                    if (v !== 0) {
                        out[0] = pal[3 * v]!;
                        out[1] = pal[3 * v + 1]!;
                        out[2] = pal[3 * v + 2]!;
                        return;
                    }
                }
            }
            out[0] = backdropRgb[0];
            out[1] = backdropRgb[1];
            out[2] = backdropRgb[2];
        };
        const dirX = sinA + u * cosA;
        const dirY = -cosA + u * sinA;
        const cabPixel = (dyc: number): number => {
            const sc = cabScene!;
            let bestSrc = -1;
            let nearF = bestF;
            if (dyc !== 0) {
                for (const cab of sc.cabs) {
                    const z0 = params.cabSurfacesAtRest === true ? 0 : cabFloorZ(sc, cab);
                    const z = dyc > 0 ? z0 : z0 + CELL;
                    const F = (fy * (eyeWalls - z)) / dyc;
                    if (!(F >= C.NEAR) || F >= nearF)
                        continue;
                    const wx = snap.cam.x + F * dirX;
                    const wy = snap.cam.y + F * dirY;
                    if (wx < cab.cx * CELL || wx >= (cab.cx + 1) * CELL || wy < cab.cy * CELL || wy >= (cab.cy + 1) * CELL)
                        continue;
                    nearF = F;
                    bestSrc = dyc > 0 ? SRC_CAB_FLOOR : SRC_CAB_CEILING;
                }
            }
            const rc = sc.riding;
            if (rc !== null && sc.inside && rc.entrance !== null && params.doorway !== false) {
                const [ex1, ey1, ex2, ey2] = rc.entrance;
                const ddx = ex2 - ex1;
                const ddy = ey2 - ey1;
                const den = dirX * ddy - dirY * ddx;
                if (Math.abs(den) > 1e-12) {
                    const qx = ex1 - snap.cam.x;
                    const qy = ey1 - snap.cam.y;
                    const F = (qx * ddy - qy * ddx) / den;
                    const t = (qx * dirY - qy * dirX) / den;
                    if (F >= C.NEAR && F < nearF && t >= 0 && t <= 1) {
                        const z = eyeWalls - (dyc * F) / fy;
                        if (z < 0 || z >= CELL) {
                            nearF = F;
                            bestSrc = SRC_DOORWAY;
                        }
                    }
                }
            }
            return bestSrc;
        };
        const drawRow = (y: number): void => {
            const dyc = (y + 0.5) * rowH - cy;
            let done = false;
            let src = SRC_LANE;
            const eb = edgeBitsOf(y);
            const ownRowOf = (bit: number, permitKind: number): boolean => (fillRow[y]! > 0 && ownCol && permit(permitKind)) || (eb & bit) !== 0;
            let transparentPx = false;
            let stairPx = false;
            const facePixel = (pr: NonNullable<typeof prim>, F: number, G: number): void => {
                const shift = pr.ramp ? C.EYE.PER_E * (pr.ramp.hi * (1 - G) + pr.ramp.lo * G) : 0;
                const wz = eyeWalls - (dyc * F) / fy + shift;
                if (wz >= 0 && wz < CELL) {
                    const v = ((CELL - wz) / CELL) * texH;
                    const ufl = pr.uBase + pr.uSpan * G;
                    if (params.filter === "smooth") {
                        const lo = pr.uBase;
                        const hi = pr.uBase + pr.uSpan - 1;
                        const uu = ufl - 0.5;
                        const vv = v - 0.5;
                        const u0 = Math.floor(uu);
                        const v0 = Math.floor(vv);
                        const fu = uu - u0;
                        const fv = vv - v0;
                        rgb.fill(0);
                        let wsum = 0;
                        for (let dv = 0; dv < 2; dv++) {
                            for (let du = 0; du < 2; du++) {
                                const tu = Math.max(lo, Math.min(hi, u0 + du));
                                const tv = Math.max(0, Math.min(texH - 1, v0 + dv));
                                const wgt = (du ? fu : 1 - fu) * (dv ? fv : 1 - fv);
                                if (!opaqueOf(pr.word, tu, tv, b0))
                                    continue;
                                shadeRgb(texelOf(pr.word, tu, tv), rgb, wgt, true);
                                wsum += wgt;
                            }
                        }
                        const cu = Math.max(lo, Math.min(hi, Math.floor(ufl)));
                        const cv = Math.max(0, Math.min(texH - 1, Math.floor(v)));
                        if (wsum > 0 && opaqueOf(pr.word, cu, cv, b0)) {
                            for (let k = 0; k < 3; k++)
                                rgb[k] = rgb[k]! / wsum;
                            done = true;
                            src = SRC_FACE;
                        }
                    }
                    else {
                        const tu = Math.max(pr.uBase, Math.min(pr.uBase + pr.uSpan - 1, Math.floor(ufl)));
                        const tv = Math.max(0, Math.min(texH - 1, Math.floor(v)));
                        if (opaqueOf(pr.word, tu, tv, b0)) {
                            shadeRgb(texelOf(pr.word, tu, tv), rgb, 1, false);
                            done = true;
                            src = SRC_FACE;
                        }
                    }
                    if (!done)
                        transparentPx = true;
                }
                else if (pr.lift !== true && ((pr.stair === true && (pr.ramp !== null || params.stairWord === false)) || (pr.stair !== true && pr.ramp !== null && ownRowOf(EDGE_RAMP, PERMIT_RAMP)))) {
                    rgb[0] = fill[0]!;
                    rgb[1] = fill[1]!;
                    rgb[2] = fill[2]!;
                    done = true;
                    src = SRC_RAMP_FILL;
                    stairPx = pr.stair === true;
                }
            };
            const cabSrc = cabScene !== null ? cabPixel(dyc) : -1;
            if (cabSrc >= 0) {
                rgb[0] = fill[0]!;
                rgb[1] = fill[1]!;
                rgb[2] = fill[2]!;
                done = true;
                src = cabSrc;
            }
            else if (prim) {
                facePixel(prim, bestF, bestG);
                if (transparentPx) {
                    transparent[(probeOut ? (y === yTop ? 0 : 1) : y) * cols + j] = 1;
                    if (params.seeThrough === true) {
                        for (const c of cands.sort((a, b) => a.F - b.F)) {
                            if (c.id === best || c.F <= bestF)
                                continue;
                            transparentPx = false;
                            shadeFor(c.F);
                            facePixel(scene.prims[c.id]!, c.F, c.G);
                            if (done)
                                break;
                        }
                        shadeFor(bestF);
                    }
                }
            }
            rideShaft = false;
            if (!done)
                bg(y, rgb, transparentPx);
            if (!done && rideShaft)
                src = SRC_RIDE_SHAFT;
            for (const s of near) {
                const top = cy - (fy * (CELL - eyeWalls)) / s.F;
                const bottom = cy + (fy * eyeWalls) / s.F;
                const ys = (y + 0.5) * rowH;
                const stripBit = s.kind === "live" ? EDGE_LIVE : EDGE_CONST;
                const outside = ys < top || ys > bottom;
                if (s.stair ? outside : (outside && ownRowOf(stripBit, s.kind === "live" ? PERMIT_LIVE : PERMIT_CONST)) || (eb & stripBit) !== 0) {
                    stairPx = s.stair;
                    if (s.kind === "live") {
                        bg(y, rgb, false, s.stair);
                        src = SRC_STRIP_LANE;
                    }
                    else {
                        src = SRC_STRIP_FILL;
                        rgb[0] = fill[0]!;
                        rgb[1] = fill[1]!;
                        rgb[2] = fill[2]!;
                    }
                }
            }
            if (eb !== 0 && !stairPx && (src === SRC_RAMP_FILL || src === SRC_STRIP_FILL || src === SRC_STRIP_LANE) && !(fillRow[y]! > 0 && ownCol))
                src = SRC_BEYOND;
            const yy = probeOut ? (y === yTop ? 0 : 1) : y;
            source[yy * cols + j] = src;
            const o = 4 * (yy * cols + j);
            rgba[o] = Math.round(rgb[0]!);
            rgba[o + 1] = Math.round(rgb[1]!);
            rgba[o + 2] = Math.round(rgb[2]!);
            rgba[o + 3] = BYTE_MAX;
            if (beyondOn && beyondOf(y) === 0 && (y === yTop || y === yBot)) {
                let bits = 0;
                if (stairPx)
                    bits = 0;
                else if (src === SRC_RAMP_FILL)
                    bits = EDGE_RAMP;
                else if (src === SRC_STRIP_FILL)
                    bits = EDGE_CONST;
                else if (src === SRC_STRIP_LANE)
                    bits = EDGE_LIVE | (lastBgLane ? 0 : EDGE_SKY);
                else if (src === SRC_LANE && ((transparentPx && params.edgeFaceSky === true) || (!transparentPx && !lastBgLane)))
                    bits = EDGE_SKY;
                if (y === yTop)
                    edgeTop[j] = bits;
                if (y === yBot)
                    edgeBot[j] = bits;
            }
        };
        if (probeOut) {
            if (beyondOn) {
                drawRow(yTop);
                if (yBot !== yTop)
                    drawRow(yBot);
            }
            continue;
        }
        if (beyondOn) {
            drawRow(yTop);
            if (yBot !== yTop)
                drawRow(yBot);
        }
        for (let y = 0; y < rows; y++)
            if (!(beyondOn && (y === yTop || y === yBot)))
                drawRow(y);
    }
    if (probeOut)
        return { cols, rows, rgba, height, forward, hit, stripForward, source, transparent, fx, fy, notes };
    const pic: HdPicture = { cols, rows, rgba, height, forward, hit, stripForward, source, transparent, fx, fy, notes };
    if (!billboards)
        return pic;
    const drawn = drawBillboards(pic, snap, billboards, pal, params, { fx, fy, cx, cy, colW, rowH, cols, rows }, C);
    return { ...pic, billboards: drawn };
}

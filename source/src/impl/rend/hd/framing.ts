export interface FramingProjection {
    readonly fx: number;
    readonly fy: number;
    readonly cx: number;
    readonly cy: number;
}
export interface FrameGeometry {
    readonly ox: number;
    readonly oy: number;
    readonly hw: number;
    readonly hh: number;
}
export interface FrameGeometrySource {
    readonly COLUMNS: number;
    readonly VIEW_ROWS: number;
    readonly COLUMN_CENTRE: number;
}
export function frameGeometry(R: FrameGeometrySource): FrameGeometry {
    return { ox: R.COLUMNS, oy: R.VIEW_ROWS / 2, hw: R.COLUMNS, hh: R.COLUMN_CENTRE };
}
export interface Framing extends FramingProjection {
    readonly g: FrameGeometry;
}
export function framingFor(p: FramingProjection, g: FrameGeometry): Framing {
    return { fx: p.fx, fy: p.fy, cx: p.cx, cy: p.cy, g };
}
export function frameToArea(m: Framing, x: number, y: number): [
    number,
    number
] {
    return [m.cx + (m.fx * (x - m.g.ox)) / m.g.hw, m.cy + (m.fy * (y - m.g.oy)) / m.g.hh];
}
export function areaToFrame(m: Framing, sx: number, sy: number): [
    number,
    number
] {
    return [m.g.ox + ((sx - m.cx) * m.g.hw) / m.fx, m.g.oy + ((sy - m.cy) * m.g.hh) / m.fy];
}
export const FRAMING_HALF_ANGLE = Math.atan(1);
export function frameToAreaSky(m: Framing, x: number, y: number): [
    number,
    number
] {
    return [m.cx + m.fx * Math.tan(((x - m.g.ox) / m.g.hw) * FRAMING_HALF_ANGLE), m.cy + (m.fy * (y - m.g.oy)) / m.g.hh];
}
export function areaToFrameSky(m: Framing, sx: number, sy: number): [
    number,
    number
] {
    return [m.g.ox + (Math.atan((sx - m.cx) / m.fx) / FRAMING_HALF_ANGLE) * m.g.hw, m.g.oy + ((sy - m.cy) * m.g.hh) / m.fy];
}
export interface SkyScrollSource {
    readonly SCROLL_FACTOR: number;
    readonly SCROLL_BIAS: number;
    readonly PANORAMA_COLUMNS: number;
    readonly CELL: number;
}
export function farSkyShift(SC: SkyScrollSource, drawnAngle: number, hs: number | null): number {
    if (hs === null)
        return 0;
    const w = SC.PANORAMA_COLUMNS * SC.CELL;
    const d = (((SC.SCROLL_FACTOR * drawnAngle + hs - SC.SCROLL_BIAS) % w) + w) % w;
    return d >= w / 2 ? d - w : d;
}
export function frameToAreaOnSky(m: Framing, x: number, y: number, shift: number): [
    number,
    number
] {
    return [m.cx + ((x - m.g.ox - shift) * m.fx) / m.g.hw, m.cy + (m.fy * (y - m.g.oy)) / m.g.hh];
}
export function areaToFrameOnSky(m: Framing, sx: number, sy: number, shift: number): [
    number,
    number
] {
    return [m.g.ox + ((sx - m.cx) * m.g.hw) / m.fx + shift, m.g.oy + ((sy - m.cy) * m.g.hh) / m.fy];
}
export function framingUniform(m: Framing): [
    number,
    number,
    number,
    number
] {
    return [m.g.ox, m.g.oy, m.g.hw / m.fx, m.g.hh / m.fy];
}
export interface FarLayer {
    readonly cols: number;
    readonly rows: number;
    readonly indices: Uint8Array;
    readonly x0?: number;
    readonly y0?: number;
    readonly repeatFrom?: number;
    readonly period?: number;
}
export function farLayerAt(layer: FarLayer, tx: number, ty: number): number {
    let y = ty;
    const rf = layer.repeatFrom;
    const per = layer.period;
    if (rf !== undefined && per !== undefined && per > 0 && y >= rf)
        y = rf + ((y - rf) % per);
    if (tx < 0 || y < 0 || tx >= layer.cols || y >= layer.rows)
        return -1;
    return y * layer.cols + tx;
}
export function farOriginUniform(layer: FarLayer | null): [
    number,
    number,
    number,
    number
] {
    if (layer === null)
        return [0, 0, 0, 0];
    return [layer.x0 ?? 0, layer.y0 ?? 0, layer.repeatFrom ?? 0, layer.period ?? 0];
}
export function packFarTexture(layer: FarLayer): {
    width: number;
    height: number;
    data: Uint8Array;
} {
    return { width: layer.cols, height: layer.rows, data: layer.indices };
}
export function farLayerUsed(layer: FarLayer | undefined | null): layer is FarLayer {
    if (!layer)
        return false;
    for (let i = 0; i < layer.indices.length; i++)
        if (layer.indices[i] !== 0)
            return true;
    return false;
}
export function sampleFarLayer(layer: FarLayer, x: number, y: number, smooth: boolean, pal: ArrayLike<number>, out: Float64Array): boolean {
    const { indices } = layer;
    x -= layer.x0 ?? 0;
    y -= layer.y0 ?? 0;
    const at = farLayerAt(layer, Math.floor(x), Math.floor(y));
    if (at < 0)
        return false;
    const own = indices[at]!;
    if (own === 0)
        return false;
    if (!smooth) {
        out[0] = pal[3 * own]!;
        out[1] = pal[3 * own + 1]!;
        out[2] = pal[3 * own + 2]!;
        return true;
    }
    const uu = x - 0.5;
    const vv = y - 0.5;
    const u0 = Math.floor(uu);
    const v0 = Math.floor(vv);
    const fu = uu - u0;
    const fv = vv - v0;
    let r = 0;
    let g = 0;
    let b = 0;
    let wsum = 0;
    for (let dv = 0; dv < 2; dv++) {
        for (let du = 0; du < 2; du++) {
            const t = farLayerAt(layer, u0 + du, v0 + dv);
            if (t < 0)
                continue;
            const v = indices[t]!;
            if (v === 0)
                continue;
            const w = (du ? fu : 1 - fu) * (dv ? fv : 1 - fv);
            r += pal[3 * v]! * w;
            g += pal[3 * v + 1]! * w;
            b += pal[3 * v + 2]! * w;
            wsum += w;
        }
    }
    if (wsum <= 0) {
        out[0] = pal[3 * own]!;
        out[1] = pal[3 * own + 1]!;
        out[2] = pal[3 * own + 2]!;
        return true;
    }
    out[0] = r / wsum;
    out[1] = g / wsum;
    out[2] = b / wsum;
    return true;
}
export const SPRITE_GROUP = { NONE: 0, GLOW: 1, HAND: 2, FAR: 3, SHOT: 4 } as const;
export type SpriteGroup = (typeof SPRITE_GROUP)[keyof typeof SPRITE_GROUP];
export interface SpriteGroups {
    readonly width: number;
    readonly height: number;
    readonly indices: Uint8Array;
    readonly group: Uint8Array;
    readonly farWhole?: Uint8Array;
}
export function farLayerOf(g: SpriteGroups, x0: number, y0: number, w: number, h: number): FarLayer {
    if (g.farWhole === undefined)
        return groupLayer(g, SPRITE_GROUP.FAR, x0, y0, w, h);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            out[y * w + x] = g.farWhole[(y0 + y) * g.width + x0 + x]!;
    return { cols: w, rows: h, indices: out };
}
export function spriteGroupOf(tile: number, priority: boolean, glowTiles: readonly [
    number,
    number
], sniperTiles?: readonly [
    number,
    number
]): SpriteGroup {
    if (tile >= glowTiles[0] && tile <= glowTiles[1])
        return SPRITE_GROUP.GLOW;
    if (priority && sniperTiles !== undefined && tile >= sniperTiles[0] && tile <= sniperTiles[1])
        return SPRITE_GROUP.SHOT;
    return priority ? SPRITE_GROUP.HAND : SPRITE_GROUP.FAR;
}
export function groupLayer(g: SpriteGroups, group: SpriteGroup, x0: number, y0: number, w: number, h: number): FarLayer {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const at = (y0 + y) * g.width + x0 + x;
            if (g.group[at] === group)
                out[y * w + x] = g.indices[at]!;
        }
    return { cols: w, rows: h, indices: out };
}

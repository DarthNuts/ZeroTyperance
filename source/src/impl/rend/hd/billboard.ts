import type { RendConstants } from "../constants.js";
import type { SpriteConstants } from "../sprite/constants.js";
import type { Art, SpriteAssets } from "../sprite/types.js";
import type { HdConstants } from "./constants.js";
import type { HdParams, HdPicture } from "./column.js";
import type { SnapshotPart, ViewSnapshot } from "./snapshot.js";
export type MarkerMode = "show" | "transparent" | "shadow";
export interface BillboardEnv {
    readonly markers?: MarkerMode;
    readonly R: RendConstants;
    readonly SC: SpriteConstants;
    readonly assets: SpriteAssets & {
        readonly nightArray?: string | null;
    };
    readonly itemsOverCorpses?: boolean;
    readonly floorLayers?: boolean;
    readonly ownSquare?: boolean;
}
const OVER_CORPSE_SHARE = 1e-4;
function itemsOverCorpses(rects: PartRect[], cell: number): void {
    for (const it of rects) {
        if (it.role !== "P")
            continue;
        for (const co of rects) {
            if (co.role !== "C" || co.F >= it.drawF)
                continue;
            if (Math.hypot(co.wx - it.wx, co.wy - it.wy) > cell)
                continue;
            if (co.x1 <= it.x0 || it.x1 <= co.x0 || co.y1 <= it.y0 || it.y1 <= co.y0)
                continue;
            it.drawF = co.F * (1 - OVER_CORPSE_SHARE);
        }
    }
}
export type PartKind = "F" | "C" | "P" | "O";
export function billboardOrder(rects: readonly PartRect[]): number[] {
    const under = (r: PartRect): number => (r.role === "F" ? 0 : 1);
    return rects.map((r, i) => i).sort((a, b) => under(rects[a]!) - under(rects[b]!) || rects[b]!.drawF - rects[a]!.drawF);
}
export interface BillboardView {
    readonly fx: number;
    readonly fy: number;
    readonly cx: number;
    readonly cy: number;
    readonly colW: number;
    readonly rowH: number;
    readonly cols: number;
    readonly rows: number;
}
export interface PartRect {
    readonly source: "entity" | "cell";
    readonly index: number;
    readonly partIndex: number;
    readonly part: SnapshotPart;
    readonly F: number;
    readonly L: number;
    readonly S: number;
    readonly sx: number;
    readonly sy: number;
    readonly atCap: boolean;
    readonly shadow: boolean;
    drawF: number;
    readonly role: PartKind;
    readonly wx: number;
    readonly wy: number;
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
}
export interface BillboardDraw {
    readonly rect: PartRect;
    readonly drawn: Uint16Array;
}
const PIXELS_PER_BYTE = 2;
const NIBBLE_BITS = 4;
const NIBBLE_MASK = 0xf;
const BYTE_MAX = 255;
function camera(snap: ViewSnapshot, R: RendConstants): (wx: number, wy: number) => [
    number,
    number
] {
    const a = (snap.cam.angle * 2 * Math.PI) / R.ANGLES;
    const s = Math.sin(a);
    const c = Math.cos(a);
    return (wx, wy) => {
        const dx = wx - snap.cam.x;
        const dy = wy - snap.cam.y;
        return [dx * s - dy * c, dx * c + dy * s];
    };
}
export function billboardRects(snap: ViewSnapshot, B: BillboardEnv, view: BillboardView, C: HdConstants): PartRect[] {
    const { R, SC } = B;
    const cell = 1 << R.CELL_SHIFT;
    const eye = C.EYE.BASE + C.EYE.PER_E * snap.cam.eye_walls;
    const toCam = camera(snap, R);
    const out: PartRect[] = [];
    const place = (source: "entity" | "cell", index: number, wx: number, wy: number, S: number, sx: number, sy: number, z: number | null, parts: readonly SnapshotPart[], atCap: boolean, shadow = false, roleOf: (partIndex: number) => PartKind = () => "O"): void => {
        if (S < 1)
            return;
        const [F, L] = toCam(wx, wy);
        if (F <= C.NEAR)
            return;
        let eyeHere = eye;
        if (z !== null)
            eyeHere = eye - C.EYE.PER_E * (z + SC.EYE_BASE);
        const baseX = view.cx + (view.fx * L) / F;
        const baseY = view.cy + (view.fy * eyeHere) / F;
        const kx = (view.fx * cell) / (S * F);
        const ky = (view.fy * cell) / (S * F);
        parts.forEach((part, partIndex) => {
            const r = part.rect;
            let x0 = baseX + (r.left - sx) * kx;
            let x1 = baseX + (r.left + r.w - sx) * kx;
            const y0 = baseY + (r.top - sy) * ky;
            const y1 = baseY + (r.top + r.h - sy) * ky;
            const fit = part.own?.fitTo;
            if (part.own !== undefined && fit !== undefined && fit.length > 0 && B.ownSquare !== false) {
                const target = Math.max(...fit.map((b) => Math.max(b.w * kx, b.h * ky)));
                const g = gunBox(part.own.art, SC);
                if (g !== null) {
                    const s = target / Math.max(g.x1 - g.x0, g.y1 - g.y0);
                    const mid = (x0 + x1) / 2;
                    const bottom = y1 - (SC.ART_ROWS - g.y1) * s;
                    const left = mid - ((g.x0 + g.x1) / 2) * s;
                    out.push({ source, index, partIndex, part, F, L, S, sx, sy, atCap, shadow, drawF: F, role: roleOf(partIndex), wx, wy, x0: left, x1: left + SC.ART_COLUMNS * PIXELS_PER_BYTE * s, y0: bottom - SC.ART_ROWS * s, y1: bottom });
                    return;
                }
            }
            if (part.own !== undefined && B.ownSquare !== false) {
                const mid = (x0 + x1) / 2;
                const half = ((y1 - y0) * SC.ART_COLUMNS * PIXELS_PER_BYTE) / SC.ART_ROWS / 2;
                x0 = mid - half;
                x1 = mid + half;
            }
            out.push({
                source,
                index,
                partIndex,
                part,
                F,
                L,
                S,
                sx,
                sy,
                atCap,
                shadow,
                drawF: F,
                role: roleOf(partIndex),
                wx,
                wy,
                x0,
                x1,
                y0,
                y1,
            });
        });
    };
    const markers = B.markers ?? "show";
    const layers = B.floorLayers !== false;
    snap.cells.forEach((c, i) => {
        const marker = c.at === undefined && SC.MARKER_CLASSES.includes(c.cls);
        if (marker && markers === "transparent")
            return;
        const role = (k: number): PartKind => {
            if (!layers)
                return c.at !== undefined || SC.ITEM_CLASSES.includes(c.cls) ? "P" : marker ? "O" : "C";
            if (c.at !== undefined || C.LAYER.PICKUP_CLASSES.includes(c.cls))
                return "P";
            if (C.LAYER.CORPSE_CLASSES.includes(c.cls))
                return "C";
            return c.cls === C.LAYER.FLOOR_LIGHT.class && k === C.LAYER.FLOOR_LIGHT.part - 1 ? "F" : "O";
        };
        if (c.at === undefined)
            place("cell", i, c.cell[0] * cell + SC.CENTRE, c.cell[1] * cell + SC.CENTRE, c.S, c.sx, c.sy, null, c.parts, false, marker && markers === "shadow", role);
        else
            place("cell", i, c.at.x, c.at.y, c.S, c.sx, c.sy, c.at.h / C.EYE.PER_E - SC.EYE_BASE, c.parts, false, false, role);
    });
    snap.entities.forEach((e, i) => place("entity", i, e.x, e.y, e.S, e.sx, e.sy, e.z, e.parts, e.S >= SC.ENTITY_S_CAP, false, () => (e.corpse === true ? "C" : "O")));
    if (B.itemsOverCorpses !== false)
        itemsOverCorpses(out, cell);
    return out;
}
function gunBox(art: Uint8Array, SC: SpriteConstants): {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
} | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let c = 0; c < SC.ART_COLUMNS; c++)
        for (let y = 0; y < SC.ART_ROWS; y++) {
            const b = art[c * SC.ART_ROWS + y] ?? 0;
            if (b === 0)
                continue;
            x0 = Math.min(x0, PIXELS_PER_BYTE * c);
            x1 = Math.max(x1, PIXELS_PER_BYTE * (c + 1));
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y + 1);
        }
    return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
}
export function shadeHdOf(F: number, R: RendConstants, SC: SpriteConstants): number {
    return SC.SCALE_NUMERATOR / (F * ((1 << R.SIN_SHIFT) >> SC.DEPTH_SHIFT));
}
export function artOf(part: SnapshotPart, assets: SpriteAssets): Art | null {
    if (part.own !== undefined)
        return part.own.art;
    return part.art.bank === null ? assets.itemArt(part.art.slot) : (assets.bank(part.art.bank)?.cellArt(part.art.slot) ?? null);
}
export const PALETTE_LINE = 16;
export function ownShade(B: BillboardEnv, mirrored: boolean): PartShade | null {
    const id = B.assets.shadeArray(B.SC.IDENTITY_ARRAY)?.[0];
    const t = id === undefined ? null : B.assets.shadeTable(id, mirrored);
    return t === null ? null : { lo: t, hi: t, w: 0, beam: null };
}
export interface PartShade {
    readonly lo: Uint8Array;
    readonly hi: Uint8Array;
    readonly w: number;
    readonly beam: Uint8Array | null;
}
export function shadeOf(snap: ViewSnapshot, B: BillboardEnv, Shd: number, mirrored: boolean, smooth: boolean): PartShade | null {
    const { SC, assets } = B;
    const arrayName = snap.night ? (assets.nightArray ?? null) : assets.arrayOfMode(snap.mode);
    if (arrayName === null)
        return null;
    const entries = assets.shadeArray(arrayName);
    if (entries === null)
        return null;
    let eLo = 0;
    let eHi = 0;
    let w = 0;
    if (arrayName !== SC.IDENTITY_ARRAY) {
        const n = Shd / (1 << SC.BAND_SHIFT);
        if (n < 1)
            return null;
        if (smooth) {
            const e = Math.max(0, SC.BAND_ENTRIES - n);
            eLo = Math.floor(e);
            eHi = Math.min(eLo + 1, SC.BAND_ENTRIES);
            w = e - eLo;
        }
        else {
            eLo = eHi = Math.max(0, SC.BAND_ENTRIES - Math.floor(n));
        }
    }
    const lutLo = entries[Math.min(eLo, entries.length - 1)];
    const lutHi = entries[Math.min(eHi, entries.length - 1)];
    if (lutLo === undefined || lutHi === undefined)
        return null;
    const lo = assets.shadeTable(lutLo, mirrored);
    const hi = assets.shadeTable(lutHi, mirrored);
    if (lo === null || hi === null)
        return null;
    let beam: Uint8Array | null = null;
    if (snap.beam_first !== null) {
        const id = assets.shadeArray(SC.IDENTITY_ARRAY)?.[0];
        if (id !== undefined)
            beam = assets.shadeTable(id, mirrored);
    }
    return { lo, hi, w, beam };
}
export function drawBillboards(pic: HdPicture, snap: ViewSnapshot, B: BillboardEnv, pal: Float32Array, params: HdParams, view: BillboardView, C: HdConstants): BillboardDraw[] {
    const { SC, R } = B;
    const rects = billboardRects(snap, B, view, C);
    const order = billboardOrder(rects);
    const out: BillboardDraw[] = [];
    const texW = SC.ART_COLUMNS * PIXELS_PER_BYTE;
    const texH = SC.ART_ROWS;
    const smoothShade = params.smooth;
    const bilinear = params.filter === "smooth";
    const rgb = [0, 0, 0];
    const tmp = [0, 0, 0];
    for (const id of order) {
        const pr = rects[id]!;
        const art = artOf(pr.part, B.assets);
        if (art === null)
            continue;
        const shadeHd = shadeHdOf(pr.F, R, SC);
        const shade = pr.part.own !== undefined ? ownShade(B, pr.part.mirrored) : shadeOf(snap, B, shadeHd, pr.part.mirrored, smoothShade);
        if (shade === null)
            continue;
        const lineOff = pr.part.own !== undefined ? pr.part.own.line * PALETTE_LINE : 0;
        const drawn = new Uint16Array(view.cols);
        out.push({ rect: pr, drawn });
        const w = pr.x1 - pr.x0;
        const h = pr.y1 - pr.y0;
        if (!(w > 0) || !(h > 0))
            continue;
        const j0 = Math.max(0, Math.floor(pr.x0 / view.colW - 0.5));
        const j1 = Math.min(view.cols - 1, Math.ceil(pr.x1 / view.colW));
        const y0 = Math.max(0, Math.floor(pr.y0 / view.rowH - 0.5));
        const y1 = Math.min(view.rows - 1, Math.ceil(pr.y1 / view.rowH));
        const texel = (tx: number, ty: number, t: PartShade, useBeam: boolean, out3: number[]): boolean => {
            const col = pr.part.mirrored ? SC.ART_COLUMNS - 1 - (tx >> 1) : tx >> 1;
            const b = art[col * SC.ART_ROWS + ty] ?? 0;
            if (b === 0)
                return false;
            const pick = (table: Uint8Array): number => {
                const v = table[b]!;
                return (tx & 1) === 0 ? v >> NIBBLE_BITS : v & NIBBLE_MASK;
            };
            const tables = useBeam && t.beam !== null ? [t.beam, t.beam] : [t.lo, t.hi];
            const wHi = useBeam && t.beam !== null ? 0 : t.w;
            const iLo = pick(tables[0]!);
            const iHi = wHi === 0 ? iLo : pick(tables[1]!);
            for (let k = 0; k < 3; k++)
                out3[k] = pal[3 * (iLo + lineOff) + k]! * (1 - wHi) + pal[3 * (iHi + lineOff) + k]! * wHi;
            return true;
        };
        for (let j = j0; j <= j1; j++) {
            const xc = (j + 0.5) * view.colW;
            if (xc < pr.x0 || xc >= pr.x1)
                continue;
            const wallF = pic.forward[j]!;
            const hidden = wallF > 0 && pr.F >= wallF * (1 + C.BB_DEPTH_BIAS);
            if (hidden && params.seeThrough !== true)
                continue;
            const u = (xc - pr.x0) / w;
            let beamW = 0;
            if (snap.beam_first !== null) {
                const o = ((xc - view.cx) / view.fx) * R.COLUMN_CENTRE + R.COLUMN_CENTRE;
                const first = snap.beam_first;
                beamW = smoothShade ? Math.max(0, Math.min(1, Math.min(o - first, first + R.LIGHT.BEAM_COLUMNS - o) + 0.5)) : o >= first && o < first + R.LIGHT.BEAM_COLUMNS ? 1 : 0;
            }
            for (let y = y0; y <= y1; y++) {
                const yc = (y + 0.5) * view.rowH;
                if (yc < pr.y0 || yc >= pr.y1)
                    continue;
                if (hidden && pic.transparent[y * pic.cols + j] !== 1)
                    continue;
                const v = (yc - pr.y0) / h;
                const tx = Math.min(texW - 1, Math.floor(u * texW));
                const ty = Math.min(texH - 1, Math.floor(v * texH));
                const sample = (t: PartShade, useBeam: boolean, o3: number[]): boolean => {
                    if (!bilinear)
                        return texel(tx, ty, t, useBeam, o3);
                    if (!texel(tx, ty, t, useBeam, tmp))
                        return false;
                    const uu = u * texW - 0.5;
                    const vv = v * texH - 0.5;
                    const u0 = Math.floor(uu);
                    const v0 = Math.floor(vv);
                    const fu = uu - u0;
                    const fv = vv - v0;
                    let acc0 = 0;
                    let acc1 = 0;
                    let acc2 = 0;
                    let wsum = 0;
                    for (let dv = 0; dv < 2; dv++) {
                        for (let du = 0; du < 2; du++) {
                            const nx = Math.max(0, Math.min(texW - 1, u0 + du));
                            const ny = Math.max(0, Math.min(texH - 1, v0 + dv));
                            if (!texel(nx, ny, t, useBeam, o3))
                                continue;
                            const wgt = (du ? fu : 1 - fu) * (dv ? fv : 1 - fv);
                            acc0 += o3[0]! * wgt;
                            acc1 += o3[1]! * wgt;
                            acc2 += o3[2]! * wgt;
                            wsum += wgt;
                        }
                    }
                    if (wsum <= 0)
                        return texel(tx, ty, t, useBeam, o3);
                    o3[0] = acc0 / wsum;
                    o3[1] = acc1 / wsum;
                    o3[2] = acc2 / wsum;
                    return true;
                };
                if (!sample(shade, false, rgb))
                    continue;
                if (pr.shadow)
                    rgb[0] = rgb[1] = rgb[2] = 0;
                else if (beamW > 0 && shade.beam !== null) {
                    const b3 = [0, 0, 0];
                    if (sample(shade, true, b3))
                        for (let k = 0; k < 3; k++)
                            rgb[k] = rgb[k]! * (1 - beamW) + b3[k]! * beamW;
                }
                const o = 4 * (y * pic.cols + j);
                pic.rgba[o] = Math.round(rgb[0]!);
                pic.rgba[o + 1] = Math.round(rgb[1]!);
                pic.rgba[o + 2] = Math.round(rgb[2]!);
                pic.rgba[o + 3] = BYTE_MAX;
                drawn[j] = drawn[j]! + 1;
            }
        }
    }
    return out;
}

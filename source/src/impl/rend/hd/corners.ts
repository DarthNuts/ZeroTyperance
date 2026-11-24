import type { HdConstants } from "./constants.js";
import { damageGlowBuffer, GLOW_WORD } from "./glow.js";
import { frameToArea, areaToFrame, areaToFrameOnSky, frameToAreaOnSky, framingFor, sampleFarLayer } from "./framing.js";
import type { FarLayer, FrameGeometry, FramingProjection } from "./framing.js";
import { paletteRgb } from "./column.js";
export const ELEMENT_IDS = ["scanner", "cards", "idcard", "counters", "messages"] as const;
export type ElementId = (typeof ELEMENT_IDS)[number];
const STATUS_BLACK = GLOW_WORD;
export interface CornersElement {
    readonly id: ElementId;
    readonly fw: number;
    readonly fh: number;
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
    readonly w: number;
    readonly h: number;
}
export interface CornersLayout {
    readonly s: number;
    readonly m: number;
    readonly elements: readonly CornersElement[];
}
type Rect = readonly [
    number,
    number,
    number,
    number
];
function sizeOf(C: HdConstants, id: ElementId): readonly [
    number,
    number
] {
    switch (id) {
        case "scanner": return [C.HUD.SCANNER[2], C.HUD.SCANNER[3]];
        case "cards": return [2 * C.HUD.WING[2] + C.HUD.CARDS[2], Math.max(C.HUD.WING[3], C.HUD.CARDS[3])];
        case "idcard": return [C.HUD.IDCARD[2], C.HUD.IDCARD[3]];
        case "counters": return [2 * C.HUD.COUNTERS[2], C.HUD.COUNTERS[3]];
        case "messages": return [C.HUD.RADIO[2], C.HUD.RADIO[3]];
    }
}
function placesFor(W: number, H: number, s: number, m: number, C: HdConstants): CornersElement[] {
    return ELEMENT_IDS.map((id) => {
        const [fw, fh] = sizeOf(C, id);
        const w = fw * s, h = fh * s;
        let at: {
            x: number;
            y: number;
        };
        switch (id) {
            case "scanner":
                at = { x: m, y: m };
                break;
            case "cards":
                at = { x: Math.floor((W - w) / 2), y: m };
                break;
            case "idcard":
                at = { x: W - m - w, y: m };
                break;
            case "counters":
                at = { x: W - m - w, y: H - m - h };
                break;
            case "messages":
                at = { x: m, y: H - m - h };
                break;
        }
        return { id, fw, fh, at, w, h };
    });
}
function overlaps(a: CornersElement, b: CornersElement): boolean {
    return a.at.x < b.at.x + b.w && b.at.x < a.at.x + a.w && a.at.y < b.at.y + b.h && b.at.y < a.at.y + a.h;
}
function fits(elements: readonly CornersElement[], W: number, H: number): boolean {
    for (const e of elements)
        if (e.at.x < 0 || e.at.y < 0 || e.at.x + e.w > W || e.at.y + e.h > H)
            return false;
    for (let i = 0; i < elements.length; i++)
        for (let j = i + 1; j < elements.length; j++)
            if (overlaps(elements[i]!, elements[j]!))
                return false;
    return true;
}
export function cornersLayout(W: number, H: number, C: HdConstants): CornersLayout {
    let s = Math.max(1, Math.floor(H / C.HUD.H_PER_SCALE));
    for (;;) {
        const m = C.HUD.MARGIN * s;
        const elements = placesFor(W, H, s, m, C);
        if (s <= 1 || fits(elements, W, H))
            return { s, m, elements };
        s--;
    }
}
export function cutElement(indices: Uint8Array, frameW: number, rect: Rect, nothing?: number): Uint8Array {
    const [x0, y0, w, h] = rect;
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const v = indices[(y0 + y) * frameW + x0 + x] ?? 0;
            out[y * w + x] = nothing !== undefined && v === nothing ? 0 : v;
        }
    return out;
}
export interface ElementPixels {
    readonly px: Uint8Array;
    readonly mask: Uint8Array;
}
export function scannerMask(px: Uint8Array, w: number, h: number): Uint8Array {
    const solid = new Uint8Array(w * h);
    const nb = (x: number, y: number): boolean => px[y * w + x] !== STATUS_BLACK;
    for (let y = 0; y + 1 < h; y++)
        for (let x = 0; x + 1 < w; x++)
            if (nb(x, y) && nb(x + 1, y) && nb(x, y + 1) && nb(x + 1, y + 1))
                solid[y * w + x] = 1;
    const opened = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            if (solid[y * w + x]) {
                opened[y * w + x] = 1;
                opened[y * w + x + 1] = 1;
                opened[(y + 1) * w + x] = 1;
                opened[(y + 1) * w + x + 1] = 1;
            }
        }
    const label = new Int32Array(w * h).fill(-1);
    let best = -1, bestExtent = 0, n = 0;
    const stack: number[] = [];
    for (let i = 0; i < w * h; i++) {
        if (!opened[i] || label[i]! >= 0)
            continue;
        let x0 = w, x1 = -1, y0 = h, y1 = -1;
        stack.push(i);
        label[i] = n;
        while (stack.length) {
            const p = stack.pop()!;
            const x = p % w, y = (p / w) | 0;
            if (x < x0)
                x0 = x;
            if (x > x1)
                x1 = x;
            if (y < y0)
                y0 = y;
            if (y > y1)
                y1 = y;
            const nbrs = [x > 0 ? p - 1 : -1, x + 1 < w ? p + 1 : -1, y > 0 ? p - w : -1, y + 1 < h ? p + w : -1];
            for (const q of nbrs)
                if (q >= 0 && opened[q] && label[q]! < 0) {
                    label[q] = n;
                    stack.push(q);
                }
        }
        const extent = (x1 - x0 + 1) * (y1 - y0 + 1);
        if (extent > bestExtent) {
            bestExtent = extent;
            best = n;
        }
        n++;
    }
    const mask = new Uint8Array(w * h);
    if (best < 0)
        return mask.fill(1);
    for (let y = 0; y < h; y++) {
        let lo = -1, hi = -1;
        for (let x = 0; x < w; x++)
            if (label[y * w + x] === best) {
                if (lo < 0)
                    lo = x;
                hi = x;
            }
        if (lo >= 0)
            for (let x = lo; x <= hi; x++)
                mask[y * w + x] = 1;
    }
    return mask;
}
export function idCardMask(px: Uint8Array, w: number, h: number): Uint8Array {
    const mask = scannerMask(px, w, h);
    for (let x = 0; x < w; x++) {
        mask[x] = 0;
        mask[(h - 1) * w + x] = 0;
    }
    for (let y = 0; y < h; y++) {
        mask[y * w] = 0;
        mask[y * w + w - 1] = 0;
    }
    return mask;
}
function blit(dst: ElementPixels, dw: number, src: Uint8Array, sw: number, sh: number, dx: number, dy: number, mirror: boolean, srcMask?: Uint8Array): void {
    for (let y = 0; y < sh; y++)
        for (let x = 0; x < sw; x++) {
            const d = (dy + y) * dw + dx + (mirror ? sw - 1 - x : x);
            dst.px[d] = src[y * sw + x]!;
            dst.mask[d] = srcMask ? srcMask[y * sw + x]! : 1;
        }
}
export interface CornersScreen {
    readonly indices: Uint8Array;
    readonly width: number;
    readonly nothing?: number;
}
function cardsGroup(scr: CornersScreen, C: HdConstants): ElementPixels {
    const [gw, gh] = sizeOf(C, "cards");
    const wing = C.HUD.WING, strip = C.HUD.CARDS;
    const g: ElementPixels = { px: new Uint8Array(gw * gh), mask: new Uint8Array(gw * gh) };
    const wpx = cutElement(scr.indices, scr.width, wing, scr.nothing);
    const wmask = new Uint8Array(wing[2] * wing[3]);
    for (let y = 0; y < wing[3]; y++) {
        let lo = -1;
        for (let x = 0; x < wing[2]; x++)
            if (wpx[y * wing[2] + x] !== STATUS_BLACK && wpx[y * wing[2] + x] !== 0) {
                lo = x;
                break;
            }
        if (lo < 0)
            continue;
        for (let x = lo; x < wing[2]; x++)
            wmask[y * wing[2] + x] = 1;
    }
    blit(g, gw, wpx, wing[2], wing[3], 0, 0, false, wmask);
    blit(g, gw, wpx, wing[2], wing[3], gw - wing[2], 0, true, wmask);
    blit(g, gw, cutElement(scr.indices, scr.width, strip, scr.nothing), strip[2], strip[3], wing[2], 0, false);
    return g;
}
function countersGroup(scr: CornersScreen, C: HdConstants): ElementPixels {
    const [gw, gh] = sizeOf(C, "counters");
    const st = C.HUD.COUNTERS, en = C.HUD.ENEMIES, he = C.HUD.HEALTH;
    const g: ElementPixels = { px: new Uint8Array(gw * gh), mask: new Uint8Array(gw * gh) };
    const spx = cutElement(scr.indices, scr.width, st, scr.nothing);
    const bx = he[0] - st[0], by = he[1] - st[1];
    blit(g, gw, spx, st[2], st[3], 0, 0, false);
    blit(g, gw, spx, st[2], st[3], st[2], 0, true);
    blit(g, gw, cutElement(scr.indices, scr.width, en, scr.nothing), en[2], en[3], bx, by, false);
    blit(g, gw, cutElement(scr.indices, scr.width, he, scr.nothing), he[2], he[3], st[2] + st[2] - 1 - (bx + he[2] - 1), by, false);
    return g;
}
export function buildElement(id: ElementId, scr: CornersScreen, C: HdConstants): ElementPixels {
    const [fw, fh] = sizeOf(C, id);
    switch (id) {
        case "scanner": {
            const px = cutElement(scr.indices, scr.width, C.HUD.SCANNER, scr.nothing);
            return { px, mask: scannerMask(px, fw, fh) };
        }
        case "cards": return cardsGroup(scr, C);
        case "idcard": {
            const px = cutElement(scr.indices, scr.width, C.HUD.IDCARD, scr.nothing);
            return { px, mask: idCardMask(px, fw, fh) };
        }
        case "counters": return countersGroup(scr, C);
        case "messages": return { px: cutElement(scr.indices, scr.width, C.HUD.RADIO, scr.nothing), mask: new Uint8Array(fw * fh).fill(1) };
    }
}
export function fillElement(rgba: Uint8ClampedArray, W: number, H: number, e: CornersElement, s: number, el: ElementPixels, rgb: ArrayLike<number>): void {
    const { fw, fh } = e;
    for (let y = 0; y < fh; y++)
        for (let x = 0; x < fw; x++) {
            if (!el.mask[y * fw + x])
                continue;
            const idx = el.px[y * fw + x]!;
            const r = Math.round(rgb[3 * idx]!);
            const g = Math.round(rgb[3 * idx + 1]!);
            const b = Math.round(rgb[3 * idx + 2]!);
            for (let dy = 0; dy < s; dy++)
                for (let dx = 0; dx < s; dx++) {
                    const X = e.at.x + x * s + dx;
                    const Y = e.at.y + y * s + dy;
                    if (X < 0 || Y < 0 || X >= W || Y >= H)
                        continue;
                    const i = (Y * W + X) * 4;
                    rgba[i] = r;
                    rgba[i + 1] = g;
                    rgba[i + 2] = b;
                    rgba[i + 3] = 255;
                }
        }
}
export interface HandMap {
    readonly sh: number;
    readonly ox: number;
    readonly oy: number;
}
export function handMap(W: number, H: number, C: HdConstants, handScale = 1): HandMap {
    return { sh: (handScale * H) / C.HAND.H_PER_PX, ox: W / 2, oy: H };
}
export const HAND_DOUBLE = 2;
export function handScaleOf(size: number | "normal" | "double" | undefined): number {
    if (typeof size === "number" && Number.isFinite(size) && size > 0)
        return size;
    return size === "normal" ? 1 : HAND_DOUBLE;
}
export function handToArea(m: HandMap, g: FrameGeometry, rows: number, x: number, y: number): [
    number,
    number
] {
    return [m.ox + (x - g.ox) * m.sh, m.oy + (y - rows) * m.sh];
}
export function areaToHand(m: HandMap, g: FrameGeometry, rows: number, sx: number, sy: number): [
    number,
    number
] {
    return [g.ox + (sx - m.ox) / m.sh, rows + (sy - m.oy) / m.sh];
}
function layerBox(layer: FarLayer): [
    number,
    number,
    number,
    number
] | null {
    let x0 = layer.cols, y0 = layer.rows, x1 = 0, y1 = 0;
    for (let y = 0; y < layer.rows; y++)
        for (let x = 0; x < layer.cols; x++) {
            if (layer.indices[y * layer.cols + x] === 0)
                continue;
            if (x < x0)
                x0 = x;
            if (y < y0)
                y0 = y;
            if (x + 1 > x1)
                x1 = x + 1;
            if (y + 1 > y1)
                y1 = y + 1;
        }
    return x1 > x0 ? [x0, y0, x1, y1] : null;
}
function drawLayer(rgba: Uint8ClampedArray, W: number, H: number, layer: FarLayer, toArea: (x: number, y: number) => [
    number,
    number
], toFrame: (sx: number, sy: number) => [
    number,
    number
], smooth: boolean, pal: ArrayLike<number>): number {
    const box = layerBox(layer);
    if (!box)
        return 0;
    const [ax0, ay0] = toArea(box[0], box[1]);
    const [ax1, ay1] = toArea(box[2], box[3]);
    const X0 = Math.max(0, Math.floor(Math.min(ax0, ax1)) - 1);
    const X1 = Math.min(W, Math.ceil(Math.max(ax0, ax1)) + 1);
    const Y0 = Math.max(0, Math.floor(Math.min(ay0, ay1)) - 1);
    const Y1 = Math.min(H, Math.ceil(Math.max(ay0, ay1)) + 1);
    const out = new Float64Array(3);
    let n = 0;
    for (let Y = Y0; Y < Y1; Y++)
        for (let X = X0; X < X1; X++) {
            const [fx, fy] = toFrame(X + 0.5, Y + 0.5);
            if (!sampleFarLayer(layer, fx, fy, smooth, pal, out))
                continue;
            const i = (Y * W + X) * 4;
            rgba[i] = Math.round(out[0]!);
            rgba[i + 1] = Math.round(out[1]!);
            rgba[i + 2] = Math.round(out[2]!);
            rgba[i + 3] = 255;
            n++;
        }
    return n;
}
export function damageGlowFor(layout: "corners" | "bar", palette: readonly number[], W: number, H: number, C: HdConstants): Uint8ClampedArray | null {
    return layout === "corners" ? damageGlowBuffer(palette, W, H, C) : null;
}
function over(buf: Uint8ClampedArray, i: number, r: number, g: number, b: number, a: number): void {
    const da = buf[i + 3]! / 255;
    const sa = a / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0)
        return;
    buf[i] = Math.round((r * sa + buf[i]! * da * (1 - sa)) / oa);
    buf[i + 1] = Math.round((g * sa + buf[i + 1]! * da * (1 - sa)) / oa);
    buf[i + 2] = Math.round((b * sa + buf[i + 2]! * da * (1 - sa)) / oa);
    buf[i + 3] = Math.round(oa * 255);
}
export interface CornersInput {
    readonly W: number;
    readonly H: number;
    readonly C: HdConstants;
    readonly projection: FramingProjection;
    readonly geometry: FrameGeometry;
    readonly viewRows: number;
    readonly screen: {
        readonly indices: Uint8Array;
        readonly width: number;
        readonly palette: readonly number[];
        readonly nothing?: number;
    };
    readonly glow: FarLayer;
    readonly hand: FarLayer;
    readonly shot?: FarLayer;
    readonly shotShift?: number;
    readonly filter: "sharp" | "smooth";
    readonly handScale?: number;
}
export interface CornersOverlay {
    readonly rgba: Uint8ClampedArray;
    readonly layout: CornersLayout;
    readonly drawn: {
        readonly glow: number;
        readonly hand: number;
        readonly damage: boolean;
        readonly shot: number;
    };
}
export function composeCornersOverlay(p: CornersInput): CornersOverlay {
    const { W, H, C } = p;
    const rgba = new Uint8ClampedArray(W * H * 4);
    const pal = paletteRgb(p.screen.palette);
    const smooth = p.filter === "smooth";
    const framing = framingFor(p.projection, p.geometry);
    const sh = p.shotShift ?? 0;
    const shot = p.shot ? drawLayer(rgba, W, H, p.shot, (x, y) => frameToAreaOnSky(framing, x, y, sh), (sx, sy) => areaToFrameOnSky(framing, sx, sy, sh), smooth, pal) : 0;
    const glow = drawLayer(rgba, W, H, p.glow, (x, y) => frameToArea(framing, x, y), (sx, sy) => areaToFrame(framing, sx, sy), smooth, pal);
    const dg = damageGlowFor("corners", p.screen.palette, W, H, C);
    if (dg) {
        for (let i = 0; i < W * H; i++) {
            const a = dg[4 * i + 3]!;
            if (a !== 0)
                over(rgba, 4 * i, dg[4 * i]!, dg[4 * i + 1]!, dg[4 * i + 2]!, a);
        }
    }
    const hm = handMap(W, H, C, p.handScale ?? 1);
    const hand = drawLayer(rgba, W, H, p.hand, (x, y) => handToArea(hm, p.geometry, p.viewRows, x, y), (sx, sy) => areaToHand(hm, p.geometry, p.viewRows, sx, sy), smooth, pal);
    const layout = cornersLayout(W, H, C);
    for (const e of layout.elements)
        fillElement(rgba, W, H, e, layout.s, buildElement(e.id, p.screen, C), pal);
    return { rgba, layout, drawn: { glow, hand, damage: dg !== null, shot } };
}

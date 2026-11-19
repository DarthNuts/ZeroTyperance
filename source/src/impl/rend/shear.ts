import type { RendConstants } from "./constants.js";
import { REND_EYE } from "./constants.js";
import { asr, s16, u16 } from "./arith.js";
function growLane(src: Uint8Array, m: number, rows: number, half: number): Uint8Array {
    const out = new Uint8Array(rows);
    const at = (i: number): number => src[Math.max(0, Math.min(rows - 1, i))]!;
    const n0 = m + asr(m, REND_EYE.LANE_EXTRA_SHIFT);
    let w = 0;
    for (let i = 0; i < n0 && w < rows; i++)
        out[w++] = at(0);
    const d1 = half - n0;
    if (d1 > 0) {
        let ia = 0;
        let d2 = -d1;
        for (let i = 0; i < d1 && w < rows; i++) {
            out[w++] = at(ia);
            ia++;
            d2 += half - d1;
            while (d2 >= 0) {
                ia++;
                d2 -= d1;
            }
        }
    }
    const d0 = n0 + half;
    let ib = half;
    let d2 = -d0;
    for (let i = 0; i < half && w < rows; i++) {
        out[w++] = at(ib);
        d2 += half;
        if (d2 >= 0) {
            ib++;
            d2 -= d0;
            while (d2 >= 0) {
                ib++;
                d2 -= d0;
            }
        }
    }
    return out;
}
export function rebuildLanes(art: Uint8Array, E: number, C: RendConstants): Uint8Array {
    const rows = C.VIEW_ROWS;
    const half = C.BIG_HALF_ROWS;
    const res = Uint8Array.from(art);
    if (E === 0)
        return res;
    for (let lane = 0; lane < 2; lane++) {
        const src = art.subarray(lane * rows, (lane + 1) * rows);
        let out: Uint8Array;
        if (E > 0) {
            out = growLane(src, E, rows, half);
        }
        else {
            out = growLane(Uint8Array.from(src).reverse(), -E, rows, half).reverse();
        }
        res.set(out, lane * rows);
    }
    return res;
}
function divmod16(n: number, d: number): [
    number,
    number
] {
    if (d <= 0)
        return [0, 0];
    n = u16(n);
    return [u16(Math.floor(n / d)), n % d];
}
export function shearedColumn(out: Uint8Array, c: number, E: number, upper: Uint8Array, lower: Uint8Array, lane: (r: number) => number, lutOf: (h: number) => Uint8Array | null, C: RendConstants, sGiven?: number): void {
    const rows = C.VIEW_ROWS;
    const half = C.BIG_HALF_ROWS;
    const last = C.TEX_SIZE - 1;
    const fillTo = (from: number, to: number): void => {
        for (let r = from; r < to; r++)
            out[r] = lane(r);
    };
    const sc = s16(c);
    const s = sGiven !== undefined ? s16(sGiven) : s16(asr(sc * E, REND_EYE.SHEAR_SHIFT));
    const cu = u16(c);
    if (cu <= C.SMALL_HEIGHT_MAX && (cu >> 1) + Math.abs(s) <= half) {
        const h = cu & ~1;
        if (h === 0) {
            fillTo(0, rows);
            return;
        }
        const hr = h / 2;
        const own = half - hr <= REND_EYE.OWN_FILL_ROWS_MAX;
        const top = own ? half - hr : half - hr + s;
        const bottom = own ? half - hr : half - hr - s;
        fillTo(0, top);
        for (let i = 0; i < hr; i++) {
            const idx = Math.floor(((2 * i + 1) * C.TEX_SIZE) / h);
            out[top + i] = upper[idx]!;
            out[top + hr + i] = lower[idx]!;
        }
        fillTo(rows - bottom, rows);
        const lut = lutOf(h);
        if (lut)
            for (let r = top; r < top + h; r++)
                out[r] = lut[out[r]!]!;
        return;
    }
    const hh = asr(sc, 1);
    if (hh <= 0 || hh - s <= -half || hh + s <= -half) {
        fillTo(0, rows);
        return;
    }
    const walk = (tex: Uint8Array, row: number, q: number, d: number, count: number): number => {
        for (let i = 0; i < count && row < rows; i++) {
            out[row++] = tex[Math.min(q, last)]!;
            d += C.TEX_SIZE;
            while (d >= 0) {
                q++;
                d -= hh;
            }
        }
        return row;
    };
    if (s > -half && s < half) {
        const d0 = s + half;
        const t = d0 - hh;
        let w = 0;
        if (t > 0) {
            fillTo(0, t);
            w = walk(upper, t, 0, -hh, hh);
        }
        else {
            const skip = hh - s - half;
            const [q, r] = divmod16(skip * C.TEX_SIZE, hh);
            w = walk(upper, 0, q, r - hh, s + half);
        }
        const n = Math.min(rows - w, hh);
        w = walk(lower, w, 0, -hh, n);
        fillTo(w, rows);
    }
    else if (s >= half) {
        const t = s + half - hh;
        if (t > 0) {
            fillTo(0, t);
            const w = walk(upper, t, 0, -hh, Math.min(hh, rows - t));
            fillTo(w, rows);
        }
        else {
            const skip = -t;
            const [q, r] = divmod16(skip * C.TEX_SIZE, hh);
            const w = walk(upper, 0, q, r - hh, Math.min(s + half, rows));
            fillTo(w, rows);
        }
    }
    else {
        const skip = -(s + half);
        const [q, r] = divmod16(skip * C.TEX_SIZE, hh);
        const n = Math.min(hh + s + half, rows);
        const w = walk(lower, 0, q, r - hh, n);
        fillTo(w, rows);
    }
}

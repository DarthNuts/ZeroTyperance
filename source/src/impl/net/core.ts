import type { SeatScheme } from "./scheme.js";
export interface Effect {
    readonly kind: string;
    readonly id: string | number;
    readonly source: string | number;
}
let RUNNING_STEP: number | null = null;
export function runningStep(): number | null { return RUNNING_STEP; }
export function setRunningStep(t: number | null): void { RUNNING_STEP = t; }
export interface NetCore {
    step(pad0: number, pad1: number): readonly Effect[];
    save(): string;
    load(state: string): void;
    snap?(): unknown;
    restore?(s: unknown): void;
    snapText?(s: unknown): string;
    digest?(): string;
    setSchemes?(schemes: readonly [
        SeatScheme,
        SeatScheme
    ]): void;
    seatLost?(seat: 0 | 1): void;
    setPace?(pace: StepPace): void;
    startAudio?(): readonly Effect[];
}
export interface StepPace {
    readonly num: number;
    readonly den: number;
}
const K256 = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
export function sha256Hex(text: string): string {
    const msg = new TextEncoder().encode(text);
    const len = msg.length;
    const total = (((len + 9) + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(msg);
    buf[len] = 0x80;
    const bits = len * 8;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor(bits / 0x100000000));
    dv.setUint32(total - 4, bits >>> 0);
    const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const w = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
        for (let i = 0; i < 16; i++)
            w[i] = dv.getUint32(off + i * 4);
        for (let i = 16; i < 64; i++) {
            const a = w[i - 15]!, b = w[i - 2]!;
            const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
            const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
            w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
        }
        let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!, f = h[5]!, g = h[6]!, hh = h[7]!;
        for (let i = 0; i < 64; i++) {
            const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            const ch = (e & f) ^ (~e & g);
            const t1 = (hh + S1 + ch + K256[i]! + w[i]!) >>> 0;
            const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            hh = g;
            g = f;
            f = e;
            e = (d + t1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) >>> 0;
        }
        h[0] = (h[0]! + a) >>> 0;
        h[1] = (h[1]! + b) >>> 0;
        h[2] = (h[2]! + c) >>> 0;
        h[3] = (h[3]! + d) >>> 0;
        h[4] = (h[4]! + e) >>> 0;
        h[5] = (h[5]! + f) >>> 0;
        h[6] = (h[6]! + g) >>> 0;
        h[7] = (h[7]! + hh) >>> 0;
    }
    return [...h].map((x) => x.toString(16).padStart(8, "0")).join("");
}
export function digestOf(saved: string): string {
    return sha256Hex(saved).slice(0, 16);
}
export const STANDIN_CELLS = 64;
export interface StandinState {
    readonly k: number;
    readonly seed: number;
    readonly nextId: number;
    readonly cells: readonly number[];
    readonly live: readonly number[];
}
export function standinStart(seed: number): StandinState {
    let s = seed >>> 0;
    const cells: number[] = [];
    for (let i = 0; i < STANDIN_CELLS; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        cells.push(s | 0);
    }
    return { k: 0, seed: s, nextId: 1, cells, live: [] };
}
export function standinStep(st: StandinState, pad0: number, pad1: number): {
    next: StandinState;
    effects: Effect[];
} {
    let s = st.seed;
    const c = st.cells.slice();
    const mix = ((pad0 & 0xff) * 0x01000193) ^ ((pad1 & 0xff) * 0x2f0b3c49) ^ st.k;
    for (let i = 0; i < STANDIN_CELLS; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const right = c[(i + 1) % STANDIN_CELLS]!;
        c[i] = (Math.imul(c[i]! ^ mix, 0x9e3779b1) + (right >>> 3) + (s >>> 16) + i) | 0;
    }
    const effects: Effect[] = [];
    const live = st.live.slice();
    let nextId = st.nextId;
    if (((c[0]! >>> 4) & 15) === 0) {
        live.push(nextId);
        effects.push({ kind: "event", id: "spawn", source: nextId });
        nextId++;
    }
    if (live.length > 0 && ((c[1]! >>> 6) & 15) === 0)
        live.splice((c[2]! >>> 0) % live.length, 1);
    if ((c[3]! & 7) === 0)
        effects.push({ kind: "sound", id: (c[3]! >>> 28) & 15, source: (c[4]! >>> 30) & 3 });
    if ((c[5]! & 31) === 0)
        effects.push({ kind: "sound", id: 16 + ((c[5]! >>> 28) & 15), source: "music" });
    return { next: { k: st.k + 1, seed: s, nextId, cells: c, live }, effects };
}
export function standinSave(st: StandinState): string {
    return `{"k":${st.k},"seed":${st.seed},"nextId":${st.nextId},"cells":[${st.cells.join(",")}],"live":[${st.live.join(",")}]}`;
}
export function standinLoad(text: string): StandinState {
    const o = JSON.parse(text) as StandinState;
    return { k: o.k, seed: o.seed, nextId: o.nextId, cells: o.cells.slice(), live: o.live.slice() };
}
export class StandinCore implements NetCore {
    state: StandinState;
    constructor(seed: number) { this.state = standinStart(seed); }
    step(pad0: number, pad1: number): readonly Effect[] {
        const r = standinStep(this.state, pad0, pad1);
        this.state = r.next;
        return r.effects;
    }
    save(): string { return standinSave(this.state); }
    load(state: string): void { this.state = standinLoad(state); }
}

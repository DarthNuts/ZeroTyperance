import type { FrozenGraph } from "../release/savestate.js";
class Lanes {
    a = 0x811c9dc5 | 0;
    b = 0x9747b28c | 0;
    word(x: number): void {
        this.a = Math.imul(this.a ^ x, 0x01000193);
        this.b = Math.imul(this.b ^ x, 0x5bd1e995);
        this.b ^= this.b >>> 15;
    }
    hex(): string {
        const h = (v: number): string => (v >>> 0).toString(16).padStart(8, "0");
        return h(this.a) + h(this.b);
    }
}
const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);
function prim(l: Lanes, v: unknown): void {
    if (v === undefined) {
        l.word(1);
        return;
    }
    if (v === null) {
        l.word(2);
        return;
    }
    switch (typeof v) {
        case "boolean":
            l.word(v ? 4 : 3);
            return;
        case "number":
            if (Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff) {
                l.word(5);
                l.word(v | 0);
                return;
            }
            F64[0] = v;
            l.word(6);
            l.word(U32[0]!);
            l.word(U32[1]!);
            return;
        case "string": {
            l.word(7);
            l.word(v.length);
            for (let i = 0; i < v.length; i++)
                l.word(v.charCodeAt(i));
            return;
        }
        case "bigint":
            prim(l, v.toString());
            return;
        default:
            l.word(8);
            return;
    }
}
function ref(l: Lanes, v: unknown): void {
    if (v !== null && typeof v === "object") {
        const t = v as {
            r?: number;
            x?: string;
        };
        if (t.r !== undefined) {
            l.word(9);
            l.word(t.r);
            return;
        }
        if (t.x !== undefined) {
            l.word(10);
            prim(l, t.x);
            return;
        }
    }
    prim(l, v);
}
const tableHashes = new WeakMap<object, [
    number,
    number
]>();
function table(l: Lanes, copy: object, feed: (t: Lanes) => void): void {
    let h = tableHashes.get(copy);
    if (h === undefined) {
        const t = new Lanes();
        feed(t);
        h = [t.a, t.b];
        tableHashes.set(copy, h);
    }
    l.word(h[0]);
    l.word(h[1]);
}
export function frozenDigest(g: FrozenGraph, extra: readonly unknown[]): string {
    const l = new Lanes();
    for (const x of extra)
        prim(l, typeof x === "object" && x !== null ? JSON.stringify(x) : x);
    ref(l, g.root);
    l.word(g.nodes.length);
    for (const n of g.nodes as ReadonlyArray<{
        k: string;
        v?: unknown;
        c?: string;
        p?: string | null;
        f?: ReadonlyArray<[
            string,
            unknown
        ]>;
    }>) {
        prim(l, n.k);
        switch (n.k) {
            case "P": {
                const v = n.v as readonly unknown[];
                table(l, v, (t) => { t.word(v.length); for (const x of v)
                    prim(t, x); });
                break;
            }
            case "t": {
                const v = n.v as ArrayBufferView;
                prim(l, n.c);
                table(l, v, (t) => {
                    const u8 = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
                    t.word(u8.length);
                    let i = 0;
                    for (; i + 4 <= u8.length; i += 4)
                        t.word(u8[i]! | (u8[i + 1]! << 8) | (u8[i + 2]! << 16) | (u8[i + 3]! << 24));
                    for (; i < u8.length; i++)
                        t.word(u8[i]!);
                });
                break;
            }
            case "a": {
                const v = n.v as readonly unknown[];
                l.word(v.length);
                for (const x of v)
                    ref(l, x);
                break;
            }
            case "m": {
                const v = n.v as ReadonlyArray<[
                    unknown,
                    unknown
                ]>;
                l.word(v.length);
                for (const [a, b] of v) {
                    ref(l, a);
                    ref(l, b);
                }
                break;
            }
            case "s": {
                const v = n.v as readonly unknown[];
                l.word(v.length);
                for (const x of v)
                    ref(l, x);
                break;
            }
            case "d":
                prim(l, n.v);
                break;
            case "o": {
                prim(l, n.p ?? null);
                const f = n.f ?? [];
                l.word(f.length);
                for (const [k, v] of f) {
                    prim(l, k);
                    ref(l, v);
                }
                break;
            }
            default: break;
        }
    }
    return l.hex();
}

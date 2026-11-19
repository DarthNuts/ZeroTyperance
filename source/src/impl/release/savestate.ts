export interface GraphData {
    readonly root: unknown;
    readonly nodes: readonly unknown[];
}
type Node = {
    k: "a";
    v: unknown[];
} | {
    k: "o";
    p: string | null;
    f: [
        string,
        unknown
    ][];
} | {
    k: "t";
    c: string;
    v: number[] | string[];
} | {
    k: "m";
    v: [
        unknown,
        unknown
    ][];
} | {
    k: "s";
    v: unknown[];
} | {
    k: "d";
    v: number;
};
export class Externals {
    readonly byObject = new Map<unknown, string>();
    readonly byName = new Map<string, unknown>();
    readonly classes = new Map<string, object>();
    constructor(roots: Readonly<Record<string, unknown>>, classes: readonly (abstract new (...a: never[]) => unknown)[] = [], readonly rebuilt: ReadonlySet<string> = new Set()) {
        for (const c of classes)
            this.classes.set(c.name, c.prototype as object);
        for (const [name, v] of Object.entries(roots))
            this.walk(v, name);
    }
    private walk(v: unknown, path: string): void {
        if ((typeof v !== "object" && typeof v !== "function") || v === null)
            return;
        if (this.byObject.has(v))
            return;
        this.byObject.set(v, path);
        this.byName.set(path, v);
        if (typeof v === "function")
            return;
        if (ArrayBuffer.isView(v))
            return;
        if (v instanceof Map) {
            let i = 0;
            for (const [k, x] of v) {
                this.walk(k, `${path}.<k${i}>`);
                this.walk(x, `${path}.<v${i}>`);
                i++;
            }
            return;
        }
        if (v instanceof Set) {
            let i = 0;
            for (const x of v)
                this.walk(x, `${path}.<s${i++}>`);
            return;
        }
        const proto = Object.getPrototypeOf(v) as {
            constructor?: {
                name?: string;
            };
        } | null;
        if (proto && proto !== Object.prototype && proto !== Array.prototype && proto.constructor?.name)
            this.classes.set(proto.constructor.name, proto);
        for (const key of Object.keys(v))
            this.walk((v as Record<string, unknown>)[key], `${path}.${key}`);
    }
}
const TYPED: Readonly<Record<string, new (a: ArrayLike<number> | ArrayLike<bigint>) => ArrayBufferView>> = {
    Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array,
    BigInt64Array: BigInt64Array as never, BigUint64Array: BigUint64Array as never,
};
export function writeGraph(root: unknown, ext: Externals): GraphData {
    const ids = new Map<object, number>();
    const nodes: unknown[] = [];
    const value = (v: unknown, path: string): unknown => {
        switch (typeof v) {
            case "number":
                if (Number.isFinite(v) && !Object.is(v, -0))
                    return v;
                return { n: Object.is(v, -0) ? "-0" : String(v) };
            case "string":
            case "boolean": return v;
            case "undefined": return { u: 1 };
            case "bigint": return { b: v.toString() };
            case "symbol": throw new Error(`a symbol at ${path}`);
        }
        if (v === null)
            return null;
        const shared = ext.byObject.get(v);
        if (shared !== undefined)
            return { x: shared };
        if (typeof v === "function") {
            if (ext.rebuilt.has(path.slice(path.lastIndexOf(".") + 1)))
                return { u: 1 };
            throw new Error(`a function that is not shared data at ${path}`);
        }
        const o = v as object;
        const seen = ids.get(o);
        if (seen !== undefined)
            return { r: seen };
        const id = nodes.length;
        ids.set(o, id);
        nodes.push(null);
        let node: Node;
        if (Array.isArray(o)) {
            node = { k: "a", v: o.map((x, i) => value(x, `${path}[${i}]`)) };
        }
        else if (ArrayBuffer.isView(o)) {
            const c = o.constructor.name;
            if (!(c in TYPED))
                throw new Error(`a ${c} at ${path}`);
            const arr = Array.from(o as unknown as ArrayLike<number | bigint>);
            node = { k: "t", c, v: typeof arr[0] === "bigint" ? arr.map(String) : (arr as number[]) };
        }
        else if (o instanceof Map) {
            node = { k: "m", v: [...o].map(([a, b], i) => [value(a, `${path}.<k${i}>`), value(b, `${path}.<v${i}>`)] as [
                    unknown,
                    unknown
                ]) };
        }
        else if (o instanceof Set) {
            node = { k: "s", v: [...o].map((x, i) => value(x, `${path}.<s${i}>`)) };
        }
        else if (o instanceof Date) {
            node = { k: "d", v: o.getTime() };
        }
        else {
            const proto = Object.getPrototypeOf(o) as {
                constructor?: {
                    name?: string;
                };
            } | null;
            let p: string | null;
            if (proto === null)
                p = "-";
            else if (proto === Object.prototype)
                p = null;
            else {
                p = proto.constructor?.name ?? "";
                if (ext.classes.get(p) !== proto)
                    throw new Error(`an instance of the unregistered class ${p || "(anonymous)"} at ${path}`);
            }
            const unsaved = (proto?.constructor as {
                unsavedFields?: readonly string[];
            } | undefined)?.unsavedFields ?? [];
            node = { k: "o", p, f: Object.keys(o).filter((key) => !unsaved.includes(key)).map((key) => [key, value((o as Record<string, unknown>)[key], `${path}.${key}`)] as [
                    string,
                    unknown
                ]) };
        }
        nodes[id] = node;
        return { r: id };
    };
    const r = value(root, "state");
    return { root: r, nodes };
}
export function survey(root: unknown, ext: Externals): {
    classes: Map<string, string>;
    functions: string[];
} {
    const classes = new Map<string, string>();
    const functions: string[] = [];
    const seen = new Set<unknown>();
    const walk = (v: unknown, path: string): void => {
        if ((typeof v !== "object" && typeof v !== "function") || v === null || ext.byObject.has(v) || seen.has(v))
            return;
        seen.add(v);
        if (typeof v === "function") {
            if (!ext.rebuilt.has(path.slice(path.lastIndexOf(".") + 1)))
                functions.push(path);
            return;
        }
        if (ArrayBuffer.isView(v))
            return;
        if (v instanceof Map) {
            let i = 0;
            for (const [a, b] of v) {
                walk(a, `${path}.<k${i}>`);
                walk(b, `${path}.<v${i}>`);
                i++;
            }
            return;
        }
        if (v instanceof Set) {
            let i = 0;
            for (const x of v)
                walk(x, `${path}.<s${i++}>`);
            return;
        }
        const proto = Object.getPrototypeOf(v) as {
            constructor?: {
                name?: string;
            };
        } | null;
        if (proto && proto !== Object.prototype && proto !== Array.prototype && !(v instanceof Date)) {
            const n = proto.constructor?.name ?? "";
            if (ext.classes.get(n) !== proto && !classes.has(n))
                classes.set(n, path);
        }
        const unsaved = (proto?.constructor as {
            unsavedFields?: readonly string[];
        } | undefined)?.unsavedFields ?? [];
        for (const key of Object.keys(v))
            if (!unsaved.includes(key))
                walk((v as Record<string, unknown>)[key], `${path}.${key}`);
    };
    walk(root, "state");
    return { classes, functions };
}
export function readGraph(data: GraphData, ext: Externals): unknown {
    const built: unknown[] = new Array(data.nodes.length);
    data.nodes.forEach((raw, i) => {
        const n = raw as Node;
        switch (n.k) {
            case "a":
                built[i] = new Array(n.v.length);
                break;
            case "t": {
                const C = TYPED[n.c];
                if (!C)
                    throw new Error(`unknown typed array ${n.c}`);
                built[i] = new C(n.c.startsWith("Big") ? (n.v as string[]).map((x) => BigInt(x)) : (n.v as number[]));
                break;
            }
            case "m":
                built[i] = new Map();
                break;
            case "s":
                built[i] = new Set();
                break;
            case "d":
                built[i] = new Date(n.v);
                break;
            case "o": {
                if (n.p === null)
                    built[i] = {};
                else if (n.p === "-")
                    built[i] = Object.create(null);
                else {
                    const proto = ext.classes.get(n.p);
                    if (!proto)
                        throw new Error(`unknown class ${n.p}`);
                    built[i] = Object.create(proto);
                }
                break;
            }
            default: throw new Error(`bad node ${i}`);
        }
    });
    const value = (v: unknown): unknown => {
        if (v === null || typeof v !== "object")
            return v;
        const t = v as {
            r?: number;
            x?: string;
            u?: 1;
            n?: string;
            b?: string;
        };
        if (t.r !== undefined)
            return built[t.r];
        if (t.x !== undefined) {
            if (!ext.byName.has(t.x))
                throw new Error(`unknown shared data ${t.x}`);
            return ext.byName.get(t.x);
        }
        if (t.u !== undefined)
            return undefined;
        if (t.n !== undefined)
            return t.n === "-0" ? -0 : Number(t.n);
        if (t.b !== undefined)
            return BigInt(t.b);
        throw new Error("bad value");
    };
    data.nodes.forEach((raw, i) => {
        const n = raw as Node;
        const b = built[i];
        if (n.k === "a")
            n.v.forEach((x, j) => { (b as unknown[])[j] = value(x); });
        else if (n.k === "m")
            for (const [a, c] of n.v)
                (b as Map<unknown, unknown>).set(value(a), value(c));
        else if (n.k === "s")
            for (const x of n.v)
                (b as Set<unknown>).add(value(x));
        else if (n.k === "o")
            for (const [key, x] of n.f)
                (b as Record<string, unknown>)[key] = value(x);
    });
    return value(data.root);
}

interface DataConstant {
    id: string;
    value: unknown;
}
interface DataFile {
    format: string;
    spec: string;
    constants: DataConstant[];
}
export function specDataFrom(docIn: unknown, spec: string, prefix: string, where: string): Map<string, unknown> {
    const doc = docIn as DataFile;
    if (!doc || doc.format !== "zt-spec-data/1" || doc.spec !== spec)
        throw new Error(`${where}: not the zt-spec-data/1 file of ${spec}`);
    const byId = new Map<string, unknown>();
    for (const c of doc.constants) {
        if (!c.id.startsWith(prefix))
            throw new Error(`${where}: id ${c.id} is outside ${prefix}*`);
        byId.set(c.id.slice(prefix.length), c.value);
    }
    return byId;
}
export function typedConstants<N extends string, L extends string, O extends string>(byId: Map<string, unknown>, where: string, numeric: readonly N[], lists: readonly L[], others: readonly O[]): {
    readonly [K in N]: number;
} & {
    readonly [K in L]: readonly number[];
} & {
    readonly [K in O]: unknown;
} {
    const out: Record<string, unknown> = {};
    for (const id of numeric) {
        const v = byId.get(id);
        if (typeof v !== "number")
            throw new Error(`${where}: ${id} is not a number`);
        out[id] = v;
    }
    for (const id of lists) {
        const v = byId.get(id);
        if (!Array.isArray(v) || !v.every((x) => typeof x === "number"))
            throw new Error(`${where}: ${id} is not a list of numbers`);
        out[id] = v;
    }
    for (const id of others) {
        if (!byId.has(id))
            throw new Error(`${where}: ${id} is missing`);
        out[id] = byId.get(id);
    }
    return out as {
        readonly [K in N]: number;
    } & {
        readonly [K in L]: readonly number[];
    } & {
        readonly [K in O]: unknown;
    };
}

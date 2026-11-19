import { inflateZlib } from "../boot/inflate.js";
import { packDoc } from "./data_pack.js";
import type { DataPack } from "./data_pack.js";
export interface PackSource {
    data(name: string): unknown;
    bytes(path: string): Uint8Array | null;
    text(path: string): string | null;
    list(prefix: string): string[];
    inflate(z: Uint8Array): Uint8Array;
}
export function packSource(pack: DataPack, outputs: ReadonlyMap<string, Uint8Array>): PackSource {
    const decoder = new TextDecoder();
    return {
        data(name: string): unknown {
            const d = packDoc(pack, name);
            if (d === undefined)
                throw new Error(`the data pack has no ${name}`);
            return d;
        },
        bytes: (path) => outputs.get(path) ?? null,
        text: (path) => {
            const b = outputs.get(path);
            return b === undefined ? null : decoder.decode(b);
        },
        list: (prefix) => [...outputs.keys()].filter((p) => p.startsWith(prefix)).sort(),
        inflate: inflateZlib,
    };
}
export function outputJson(src: PackSource, path: string): unknown {
    const t = src.text(path);
    if (t === null)
        throw new Error(`${path}: not among the stored outputs`);
    try {
        return JSON.parse(t) as unknown;
    }
    catch (e) {
        throw new Error(`${path}: not valid JSON: ${(e as Error).message}`);
    }
}
export function outputBytes(src: PackSource, path: string): Uint8Array {
    const b = src.bytes(path);
    if (b === null)
        throw new Error(`${path}: not among the stored outputs`);
    return b;
}

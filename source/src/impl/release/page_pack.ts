import { bareName, packDoc } from "./data_pack.js";
import type { DataPack } from "./data_pack.js";
import type { AssetStore } from "./store.js";
export const ROM_TABLES_NAME = "rom_tables";
export const TABLES_FILE = "tables/tables.json";
export const TABLES_FILE_FORMAT = "zt-rom-tables/1";
export interface RomTableEntry {
    readonly id: string;
    readonly file: string;
    readonly path: string;
}
export function romTableList(pack: DataPack): RomTableEntry[] {
    const doc = packDoc(pack, ROM_TABLES_NAME) as {
        tables?: unknown;
    } | undefined;
    if (!doc || !Array.isArray(doc.tables))
        throw new Error(`the data pack has no ${ROM_TABLES_NAME} list`);
    return doc.tables.map((e: unknown, i: number) => {
        const x = e as Partial<RomTableEntry> | null;
        if (!x || typeof x.id !== "string" || typeof x.file !== "string" || typeof x.path !== "string")
            throw new Error(`${ROM_TABLES_NAME}: entry ${i} has no id, file and path`);
        return { id: x.id, file: x.file, path: x.path };
    });
}
export function pathSteps(path: string): (string | number)[] {
    const steps: (string | number)[] = [];
    let again = "";
    for (const m of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
        if (m[1] !== undefined) {
            again += (again === "" ? "" : ".") + m[1];
            steps.push(m[1]);
        }
        else {
            again += `[${m[2]}]`;
            steps.push(Number(m[2]));
        }
    }
    if (steps.length === 0 || again !== path)
        throw new Error(`${ROM_TABLES_NAME}: the path ${JSON.stringify(path)} is not dotted keys and [index]`);
    return steps;
}
function holderOf(doc: unknown, path: string): {
    holder: Record<string | number, unknown>;
    last: string | number;
} {
    const steps = pathSteps(path);
    let at: unknown = doc;
    for (const s of steps.slice(0, -1)) {
        if (at === null || typeof at !== "object" || !Object.prototype.hasOwnProperty.call(at, s))
            throw new Error(`${ROM_TABLES_NAME}: ${path}: no ${String(s)}`);
        at = (at as Record<string | number, unknown>)[s];
    }
    const last = steps[steps.length - 1]!;
    if (at === null || typeof at !== "object" || !Object.prototype.hasOwnProperty.call(at, last))
        throw new Error(`${ROM_TABLES_NAME}: ${path}: no ${String(last)}`);
    return { holder: at as Record<string | number, unknown>, last };
}
export function valueAt(doc: unknown, path: string): unknown {
    const { holder, last } = holderOf(doc, path);
    return holder[last];
}
function fileKey(files: Readonly<Record<string, unknown>>, name: string): string {
    if (Object.prototype.hasOwnProperty.call(files, name))
        return name;
    for (const k of Object.keys(files))
        if (bareName(k) === name)
            return k;
    throw new Error(`${ROM_TABLES_NAME}: the data pack has no file ${name}`);
}
function withListed(pack: DataPack, list: readonly RomTableEntry[], value: (e: RomTableEntry) => unknown): DataPack {
    const files = JSON.parse(JSON.stringify(pack.files)) as Record<string, unknown>;
    for (const e of list) {
        const { holder, last } = holderOf(files[fileKey(files, e.file)], e.path);
        holder[last] = value(e);
    }
    return { format: pack.format, files, tick: pack.tick };
}
export function nullListed(pack: DataPack): DataPack {
    return withListed(pack, romTableList(pack), () => null);
}
export function romTablesFrom(bytes: Uint8Array): Readonly<Record<string, unknown>> | undefined {
    try {
        const d = JSON.parse(new TextDecoder().decode(bytes)) as {
            format?: unknown;
            tables?: unknown;
        } | null;
        if (!d || d.format !== TABLES_FILE_FORMAT || d.tables === null || typeof d.tables !== "object" || Array.isArray(d.tables))
            return undefined;
        return d.tables as Record<string, unknown>;
    }
    catch {
        return undefined;
    }
}
export type FilledPack = {
    readonly ok: true;
    readonly pack: DataPack;
} | {
    readonly ok: false;
    readonly missing: readonly string[];
};
export function fillPack(pack: DataPack, tables: Readonly<Record<string, unknown>>): FilledPack {
    const list = romTableList(pack);
    const missing = list.filter((e) => !Object.prototype.hasOwnProperty.call(tables, e.id)).map((e) => e.id);
    if (missing.length > 0)
        return { ok: false, missing };
    return { ok: true, pack: withListed(pack, list, (e) => tables[e.id]) };
}
export function fillFromStored(pack: DataPack, tablesBytes: Uint8Array | undefined): FilledPack {
    const tables = tablesBytes === undefined ? undefined : romTablesFrom(tablesBytes);
    if (tables === undefined)
        return { ok: false, missing: romTableList(pack).map((e) => e.id) };
    return fillPack(pack, tables);
}
let current: Promise<FilledPack> | null = null;
export function openPagePack(readPack: () => Promise<DataPack>, store: AssetStore, md5: string, version: string): Promise<FilledPack> {
    const opening = (async () => fillFromStored(await readPack(), await store.get(md5, version, TABLES_FILE)))();
    current = opening;
    opening.catch(() => { if (current === opening)
        current = null; });
    return opening;
}
export function closePagePack(): void {
    current = null;
}
export async function pagePack(): Promise<DataPack> {
    if (current === null)
        throw new Error("the data pack is not open (the ROM gate comes first)");
    const f = await current;
    if (!f.ok)
        throw new Error(`the stored set lacks ${f.missing.length} of the ROM's tables`);
    return f.pack;
}
export async function pagePackDoc(names: readonly string[]): Promise<unknown> {
    const pack = await pagePack();
    for (const n of names) {
        const hit = packDoc(pack, n);
        if (hit !== undefined)
            return hit;
    }
    throw new Error(`the data pack has no ${names.join(" / ")}`);
}

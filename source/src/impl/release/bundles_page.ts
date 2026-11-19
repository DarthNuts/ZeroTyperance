import { BUNDLE_PATHS, pageBundle } from "./page_bundles.js";
import { dataPackFrom } from "./data_pack.js";
import type { DataPack } from "./data_pack.js";
import { packSource } from "./pack_source.js";
import type { PackSource } from "./pack_source.js";
import type { AssetStore } from "./store.js";
const SKIPPED_PREFIX = "audio/";
export async function fetchDataPack(url: string | URL, fetchFn: (u: string | URL) => Promise<Response> = (u) => fetch(u)): Promise<DataPack> {
    const r = await fetchFn(url);
    if (!r.ok)
        throw new Error(`${String(url)}: ${r.status}`);
    return dataPackFrom(await r.json());
}
export class PageBundles {
    private src: {
        source: PackSource;
        pack: DataPack;
    } | null = null;
    private loading: Promise<{
        source: PackSource;
        pack: DataPack;
    }> | null = null;
    private readonly built = new Map<string, string>();
    constructor(private readonly store: AssetStore, private readonly md5: string, private readonly version: string, private readonly pack: () => Promise<DataPack>, private readonly onStep: (text: string) => void = () => { }) { }
    reset(): void {
        this.src = null;
        this.loading = null;
        this.built.clear();
    }
    private async load(): Promise<{
        source: PackSource;
        pack: DataPack;
    }> {
        if (this.src)
            return this.src;
        this.loading ??= (async () => {
            this.onStep("fetching the data pack");
            const pack = await this.pack();
            this.onStep("listing the stored files");
            const paths = (await this.store.list(this.md5, this.version)).filter((p) => !p.startsWith(SKIPPED_PREFIX));
            this.onStep(`reading the stored files 0/${paths.length}`);
            const all = await this.store.getMany(this.md5, this.version, paths, (n, total) => this.onStep(`reading the stored files ${n}/${total}`));
            const outputs = new Map<string, Uint8Array>();
            paths.forEach((path, i) => { const bytes = all[i]; if (bytes)
                outputs.set(path, bytes); });
            this.src = { source: packSource(pack, outputs), pack };
            return this.src;
        })();
        return this.loading;
    }
    async source(path: string): Promise<string | undefined> {
        if (!(BUNDLE_PATHS as readonly string[]).includes(path))
            return undefined;
        const cached = this.built.get(path);
        if (cached !== undefined)
            return cached;
        const { source, pack } = await this.load();
        this.onStep(`building ${path}`);
        const value = pageBundle(path, source, pack.tick);
        if (value === undefined)
            return undefined;
        const text = JSON.stringify(value);
        this.built.set(path, text);
        return text;
    }
}

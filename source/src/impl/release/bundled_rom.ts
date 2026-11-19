import { ExtractionCancelled, ExtractionRefused, extractAndStore } from "./flow.js";
import type { Extraction, Progress, RomVerifier } from "./flow.js";
import type { AssetStore } from "./store.js";
export interface FetchAnswer {
    readonly ok: boolean;
    readonly headers?: {
        get(name: string): string | null;
    };
    arrayBuffer(): Promise<ArrayBuffer>;
}
export type FetchLike = (url: string, init?: {
    signal?: AbortSignal;
    cache?: "no-store";
}) => Promise<FetchAnswer>;
export async function fetchBundledRom(url: string, fetchFn: FetchLike, signal?: AbortSignal): Promise<Uint8Array | null> {
    let answer: FetchAnswer;
    try {
        answer = await fetchFn(url, { ...(signal ? { signal } : {}), cache: "no-store" });
        if (signal?.aborted)
            throw new ExtractionCancelled();
        if (!answer.ok)
            return null;
        if ((answer.headers?.get("content-type") ?? "").toLowerCase().startsWith("text/html"))
            return null;
        const bytes = new Uint8Array(await answer.arrayBuffer());
        if (signal?.aborted)
            throw new ExtractionCancelled();
        return bytes.length > 0 ? bytes : null;
    }
    catch (err) {
        if (signal?.aborted || err instanceof ExtractionCancelled)
            throw new ExtractionCancelled();
        return null;
    }
}
export type BundledOutcome = {
    readonly kind: "none";
} | {
    readonly kind: "stored";
    readonly md5: string;
} | {
    readonly kind: "refused";
    readonly reason: string;
} | {
    readonly kind: "cancelled";
} | {
    readonly kind: "failed";
    readonly message: string;
};
export interface BundledOptions {
    readonly url: string;
    readonly fetch: FetchLike;
    readonly store: AssetStore;
    readonly extraction: Extraction;
    readonly verify: RomVerifier;
    readonly onProgress?: (p: Progress) => void;
    readonly signal?: AbortSignal;
    readonly onTaking?: (bytes: Uint8Array) => void;
    readonly version?: string;
}
export async function takeBundledRom(o: BundledOptions): Promise<BundledOutcome> {
    let bytes: Uint8Array | null;
    try {
        bytes = await fetchBundledRom(o.url, o.fetch, o.signal);
    }
    catch {
        return { kind: "cancelled" };
    }
    if (bytes === null)
        return { kind: "none" };
    const check = o.verify(bytes);
    if (!check.ok)
        return { kind: "refused", reason: check.reason };
    o.onTaking?.(bytes);
    try {
        const md5 = await extractAndStore(bytes, o.store, o.extraction, o.onProgress ?? ((): void => undefined), o.signal, o.verify, ...(o.version !== undefined ? [o.version] : []));
        return { kind: "stored", md5 };
    }
    catch (err) {
        if (err instanceof ExtractionCancelled || o.signal?.aborted === true)
            return { kind: "cancelled" };
        if (err instanceof ExtractionRefused)
            return { kind: "refused", reason: err.message };
        return { kind: "failed", message: err instanceof Error ? err.message : String(err) };
    }
}
export const PICK_OWN_NOTE = "Pick your own ROM image.";

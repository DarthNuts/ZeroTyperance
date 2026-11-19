import { renderSound } from "../ztassets/cmd/audio.js";
import type { RenderAll, SoundResult } from "../ztassets/cmd/audio.js";
export interface PoolWorker {
    onmessage: ((e: {
        data: unknown;
    }) => void) | null;
    onerror: ((e: {
        message?: string;
    }) => void) | null;
    postMessage(m: unknown): void;
    terminate(): void;
}
export type WorkerFactory = () => PoolWorker;
export function splitInterleaved<T>(items: readonly T[], parts: number): T[][] {
    const out: T[][] = Array.from({ length: Math.max(1, Math.min(parts, items.length)) }, () => []);
    items.forEach((x, i) => out[i % out.length]!.push(x));
    return out;
}
export function parallelRenderAll(make: WorkerFactory, cores: number, signal?: {
    readonly aborted: boolean;
}): RenderAll {
    return async ({ wasm, rom, job, numbers, onDone }) => {
        const shares = splitInterleaved(numbers, cores);
        const results = new Map<number, SoundResult>();
        const workers: PoolWorker[] = [];
        let closed = false;
        try {
            await Promise.all(shares.map((share) => new Promise<void>((resolve, reject) => {
                let w: PoolWorker;
                try {
                    w = make();
                }
                catch (err) {
                    reject(err);
                    return;
                }
                workers.push(w);
                w.onmessage = (e) => {
                    if (closed)
                        return;
                    const m = e.data as {
                        type: string;
                        n?: number;
                        stat?: Record<string, number>;
                        wav?: Uint8Array;
                        message?: string;
                    };
                    if (m.type === "one") {
                        results.set(m.n!, { stat: m.stat!, wav: m.wav! });
                        try {
                            onDone();
                        }
                        catch (err) {
                            closed = true;
                            reject(new CallbackError(err));
                        }
                    }
                    else if (m.type === "end")
                        resolve();
                    else if (m.type === "error")
                        reject(new Error(m.message));
                };
                w.onerror = (e) => reject(new Error(e.message || "an audio worker failed"));
                (w as {
                    onmessageerror?: unknown;
                }).onmessageerror = () => reject(new Error("an audio worker message failed"));
                try {
                    w.postMessage({ type: "render", wasm: wasm.slice(), rom: rom.slice(), job, numbers: share });
                }
                catch (err) {
                    reject(err);
                }
            })));
        }
        catch (err) {
            if (err instanceof CallbackError)
                throw err.cause;
        }
        finally {
            closed = true;
            for (const w of workers) {
                try {
                    w.terminate();
                }
                catch { }
            }
        }
        if (signal?.aborted)
            throw new Error("cancelled");
        const missing = numbers.filter((n) => !results.has(n));
        if (missing.length > 0) {
            const module = await WebAssembly.compile(wasm as BufferSource);
            for (const n of missing) {
                await new Promise<void>((r) => setTimeout(r, 0));
                results.set(n, await renderSound(module, rom, job, n));
                onDone();
                if (signal?.aborted)
                    throw new Error("cancelled");
            }
        }
        return results;
    };
}
class CallbackError {
    constructor(readonly cause: unknown) { }
}

/// <reference lib="dom" />
import { renderSound } from "../ztassets/cmd/audio.js";
import type { AudioJob } from "../ztassets/cmd/audio.js";
const w = self as unknown as {
    postMessage(m: unknown, transfer?: Transferable[]): void;
    onmessage: ((e: MessageEvent) => void) | null;
};
w.onmessage = (e: MessageEvent) => {
    const m = e.data as {
        type: string;
        wasm: Uint8Array;
        rom: Uint8Array;
        job: AudioJob;
        numbers: number[];
    };
    if (m.type !== "render")
        return;
    void (async () => {
        try {
            const module = await WebAssembly.compile(m.wasm as BufferSource);
            for (const n of m.numbers) {
                const r = await renderSound(module, m.rom, m.job, n);
                w.postMessage({ type: "one", n, stat: r.stat, wav: r.wav }, [r.wav.buffer]);
            }
            w.postMessage({ type: "end" });
        }
        catch (err) {
            w.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
        }
    })();
};

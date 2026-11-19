/// <reference lib="dom" />
import { RomFile } from "../ztassets/core.js";
import { COMMANDS } from "../ztassets/index.js";
import { Cancelled, commandOptions, runCommands } from "./runner.js";
import type { FileLoader } from "./runner.js";
import { parallelRenderAll } from "./audio_pool.js";
import type { WorkerFactory } from "./audio_pool.js";
import { isRelayReply, relayFactory } from "./audio_relay.js";
function audioPool(relay: {
    make: WorkerFactory;
}) {
    const cores = Math.min(typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 1 : 1, 16);
    if (cores < 2)
        return undefined;
    return parallelRenderAll(relay.make, cores, flag);
}
const w = self as unknown as {
    postMessage(m: unknown, transfer?: Transferable[]): void;
    onmessage: ((e: MessageEvent) => void) | null;
};
const flag = { aborted: false };
const relay = relayFactory((m, t) => w.postMessage(m, t));
export function fetchLoader(base: string): FileLoader {
    return async (name) => {
        const url = new URL(name, base);
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`${url.pathname}: HTTP ${res.status} (one of the page's own files is missing)`);
        return new Uint8Array(await res.arrayBuffer());
    };
}
w.onmessage = (e: MessageEvent) => {
    const m = e.data as {
        type: string;
        rom?: ArrayBuffer;
        base?: string;
        audioRelay?: boolean;
    };
    if (isRelayReply(m)) {
        relay.onReply(m);
        return;
    }
    if (m.type === "cancel") {
        flag.aborted = true;
        return;
    }
    if (m.type !== "run" || !m.rom || !m.base)
        return;
    void (async () => {
        try {
            const rom = new RomFile(new Uint8Array(m.rom!));
            const outs = await runCommands(rom, COMMANDS, (p) => w.postMessage({ type: "progress", ...p }), flag, commandOptions(fetchLoader(m.base!), m.audioRelay ? audioPool(relay) : undefined));
            const files = outs.map((f) => ({ path: f.path, producer: f.producer, args: f.args, bytes: f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) as ArrayBuffer }));
            w.postMessage({ type: "done", files }, files.map((f) => f.bytes));
        }
        catch (err) {
            if (err instanceof Cancelled)
                w.postMessage({ type: "cancelled" });
            else
                w.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
        }
    })();
};

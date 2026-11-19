import type { PoolWorker, WorkerFactory } from "./audio_pool.js";
export type RelayRequest = {
    type: "audio-spawn";
    id: number;
} | {
    type: "audio-post";
    id: number;
    msg: unknown;
} | {
    type: "audio-terminate";
    id: number;
};
export type RelayReply = {
    type: "audio-msg";
    id: number;
    data: unknown;
} | {
    type: "audio-error";
    id: number;
    message: string;
};
export const isRelayRequest = (m: {
    type?: string;
}): m is RelayRequest => m.type === "audio-spawn" || m.type === "audio-post" || m.type === "audio-terminate";
export const isRelayReply = (m: {
    type?: string;
}): m is RelayReply => m.type === "audio-msg" || m.type === "audio-error";
export function transferList(msg: unknown): ArrayBuffer[] {
    const out: ArrayBuffer[] = [];
    if (msg && typeof msg === "object") {
        for (const v of Object.values(msg as Record<string, unknown>)) {
            if (v instanceof Uint8Array && v.buffer instanceof ArrayBuffer && !out.includes(v.buffer))
                out.push(v.buffer);
        }
    }
    return out;
}
export function relayFactory(post: (m: RelayRequest, transfer: ArrayBuffer[]) => void): {
    make: WorkerFactory;
    onReply(m: RelayReply): void;
} {
    const proxies = new Map<number, PoolWorker>();
    let next = 0;
    const make: WorkerFactory = () => {
        const id = next++;
        const proxy: PoolWorker = {
            onmessage: null, onerror: null,
            postMessage(msg) { post({ type: "audio-post", id, msg }, transferList(msg)); },
            terminate() { proxies.delete(id); post({ type: "audio-terminate", id }, []); },
        };
        proxies.set(id, proxy);
        post({ type: "audio-spawn", id }, []);
        return proxy;
    };
    const onReply = (m: RelayReply): void => {
        const p = proxies.get(m.id);
        if (!p)
            return;
        if (m.type === "audio-msg")
            p.onmessage?.({ data: m.data });
        else
            p.onerror?.({ message: m.message });
    };
    return { make, onReply };
}
export class AudioRelayHost {
    private readonly workers = new Map<number, PoolWorker>();
    constructor(private readonly spawn: WorkerFactory, private readonly reply: (m: RelayReply, transfer: ArrayBuffer[]) => void) { }
    handle(m: {
        type?: string;
    }): boolean {
        if (!isRelayRequest(m))
            return false;
        if (m.type === "audio-spawn") {
            try {
                const w = this.spawn();
                this.workers.set(m.id, w);
                const id = m.id;
                w.onmessage = (e) => this.reply({ type: "audio-msg", id, data: e.data }, transferList(e.data));
                w.onerror = (e) => this.reply({ type: "audio-error", id, message: e.message || "an audio worker failed" }, []);
                (w as {
                    onmessageerror?: unknown;
                }).onmessageerror = () => this.reply({ type: "audio-error", id, message: "an audio worker message failed" }, []);
            }
            catch (err) {
                this.reply({ type: "audio-error", id: m.id, message: err instanceof Error ? err.message : String(err) }, []);
            }
        }
        else if (m.type === "audio-post") {
            try {
                this.workers.get(m.id)?.postMessage(m.msg);
            }
            catch (err) {
                this.reply({ type: "audio-error", id: m.id, message: err instanceof Error ? err.message : String(err) }, []);
            }
        }
        else {
            this.workers.get(m.id)?.terminate();
            this.workers.delete(m.id);
        }
        return true;
    }
    terminateAll(): void {
        for (const w of this.workers.values())
            w.terminate();
        this.workers.clear();
    }
}

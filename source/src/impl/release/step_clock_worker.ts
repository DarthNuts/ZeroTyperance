/// <reference lib="dom" />
const w = self as unknown as {
    postMessage(m: unknown): void;
    onmessage: ((e: MessageEvent) => void) | null;
};
let timer: ReturnType<typeof setInterval> | null = null;
w.onmessage = (e: MessageEvent) => {
    const m = e.data as {
        type: string;
        ms?: number;
    };
    if (timer !== null) {
        clearInterval(timer);
        timer = null;
    }
    if (m.type === "start")
        timer = setInterval(() => w.postMessage({ type: "tick" }), Math.max(1, m.ms ?? 1));
};

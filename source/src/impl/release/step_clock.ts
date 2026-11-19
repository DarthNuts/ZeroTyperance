export type StepClock = (cb: (now: number) => void) => {
    stop(): void;
};
export const STEP_CLOCK_TICK_MS = 4;
export interface ClockWorker {
    onmessage: ((e: {
        data: unknown;
    }) => void) | null;
    onerror?: ((e: unknown) => void) | null;
    postMessage(m: unknown): void;
    terminate(): void;
}
export const STEP_CLOCK_WORKER_SOURCE = "let t=null;self.onmessage=(e)=>{const m=e.data||{};if(t!==null){clearInterval(t);t=null;}" +
    "if(m.type==='start')t=setInterval(()=>self.postMessage({type:'tick'}),Math.max(1,m.ms||1));};";
export function workerStepClock(makeWorker: () => ClockWorker | null, now: () => number, timers: {
    setInterval(fn: () => void, ms: number): unknown;
    clearInterval(h: unknown): void;
}, ms: number = STEP_CLOCK_TICK_MS, fallbacks: readonly (() => ClockWorker | null)[] = []): StepClock {
    return (cb) => {
        let on = true;
        let worker: ClockWorker | null = null;
        let interval: unknown = null;
        const makers = [makeWorker, ...fallbacks];
        const next = (): void => {
            while (on && makers.length > 0) {
                const make = makers.shift()!;
                let w: ClockWorker | null = null;
                try {
                    w = make();
                }
                catch {
                    w = null;
                }
                if (w === null)
                    continue;
                const me = w;
                worker = me;
                me.onmessage = (e) => { if (on && worker === me && (e.data as {
                    type?: string;
                } | null)?.type === "tick")
                    cb(now()); };
                me.onerror = () => { if (worker !== me)
                    return; worker = null; try {
                    me.terminate();
                }
                catch { } next(); };
                me.postMessage({ type: "start", ms });
                return;
            }
            if (on && worker === null && interval === null)
                interval = timers.setInterval(() => { if (on)
                    cb(now()); }, ms);
        };
        next();
        return {
            stop(): void {
                if (!on)
                    return;
                on = false;
                const w = worker;
                worker = null;
                if (w !== null) {
                    w.postMessage({ type: "stop" });
                    w.terminate();
                }
                if (interval !== null)
                    timers.clearInterval(interval);
            },
        };
    };
}

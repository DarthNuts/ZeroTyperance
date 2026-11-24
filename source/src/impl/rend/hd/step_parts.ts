export interface StepParts {
    worldMs: number;
    pictureMs: number;
    snapshotMs: number;
    restMs: number;
}
export interface StepPartsProbe {
    pictureMs: number;
    snapshotMs: number;
    iterationMs: number;
}
export const newStepPartsProbe = (): StepPartsProbe => ({ pictureMs: 0, snapshotMs: 0, iterationMs: 0 });
export function partsOf(p: StepPartsProbe, tickMs: number): StepParts {
    const worldMs = Math.max(0, p.iterationMs - p.pictureMs - p.snapshotMs);
    return { worldMs, pictureMs: p.pictureMs, snapshotMs: p.snapshotMs, restMs: Math.max(0, tickMs - worldMs - p.pictureMs - p.snapshotMs) };
}
const HOST = globalThis as {
    __ztStepParts?: StepPartsProbe;
};
export function stepPartsProbe(): StepPartsProbe | null {
    return HOST.__ztStepParts ?? null;
}
export function setStepPartsProbe(p: StepPartsProbe | null): StepPartsProbe | null {
    const before = HOST.__ztStepParts ?? null;
    if (p === null)
        delete HOST.__ztStepParts;
    else
        HOST.__ztStepParts = p;
    return before;
}
export const partsClockMs = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
export function timedPart<T>(field: "pictureMs" | "snapshotMs" | "iterationMs", f: () => T): T {
    const p = HOST.__ztStepParts;
    if (p === undefined)
        return f();
    const t0 = partsClockMs();
    try {
        return f();
    }
    finally {
        p[field] += partsClockMs() - t0;
    }
}

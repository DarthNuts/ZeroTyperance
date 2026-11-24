import { makeFrameCadence } from "./frame_cadence.js";
import type { FrameCadence } from "./frame_cadence.js";
import { newStepPartsProbe, partsOf, setStepPartsProbe } from "../../rend/hd/step_parts.js";
import type { StepParts } from "../../rend/hd/step_parts.js";
export interface PaceLike {
    start(nowMs: number): void;
    poll(nowMs: number): number;
    dueMs?(n: number): number | null;
    readonly stepsRun?: number;
}
export interface FrameClock {
    readonly nowMs: number;
    dueMs: number | null;
}
let currentFrame: FrameClock | null = null;
export function frameClock(): FrameClock | null { return currentFrame; }
const STEP_EPS_MS = 1e-6;
type CarryHook = (step: number | null) => void;
export const turnCarry = {
    get hook(): CarryHook | null { return (globalThis as {
        __ztTurnCarry?: CarryHook;
    }).__ztTurnCarry ?? null; },
    set hook(f: CarryHook | null) { (globalThis as {
        __ztTurnCarry?: CarryHook | undefined;
    }).__ztTurnCarry = f ?? undefined; },
};
export function withFrameClock<T>(fc: FrameClock, f: () => T): T {
    const was = currentFrame;
    currentFrame = fc;
    try {
        return f();
    }
    finally {
        currentFrame = was;
    }
}
export interface MotionLoopRecord {
    readonly frameTimeMs: number;
    readonly kind: "paced" | "free";
    readonly ticksRun: number;
    readonly loopFrameMs: number;
}
export interface MotionTickRecord {
    readonly startMs: number;
    readonly endMs: number;
    readonly pictureBuilt: boolean;
    readonly worldStep: boolean;
    readonly frameTimeMs: number;
    readonly parts?: StepParts;
    readonly pageThreadMs?: number;
}
export interface MotionHdRecord {
    readonly frameTimeMs: number;
    readonly blendAlpha: number;
    readonly blendSnapshotIteration: number;
    readonly blendPrevSnapshotIteration: number | null;
    readonly newestSnapshotIteration: number;
    readonly newestSnapshotCamAngle: number;
    readonly modernTurnAdded: number | null;
    readonly mouseTurnsView?: boolean;
    readonly drawnCamX: number;
    readonly drawnCamY: number;
    readonly drawnCamAngle: number;
    readonly drawHdMs: number;
    readonly pathDrawn: "gl" | "cpu" | "both";
    readonly smoothMotion: boolean;
    readonly episode?: number;
    readonly floor?: number;
    readonly cellX?: number;
    readonly cellY?: number;
    readonly coop?: MotionCoopHd;
}
export interface MotionCoopRecord {
    readonly frameTimeMs: number;
    readonly stepsLive: number;
    readonly stepsRerun: number;
    readonly saveMs: number;
    readonly restoreMs: number;
    readonly stepsMs: number;
    readonly turnsSent: readonly {
        readonly turn: number;
        readonly at: number | null;
    }[];
    readonly episode?: number;
    readonly floor?: number;
    readonly cellX?: number;
    readonly cellY?: number;
}
export interface MotionCoopHd {
    readonly snapshotsRecorded: number;
    readonly kept: number;
    readonly easeActive: boolean;
}
export interface MotionSnapshotRecord {
    readonly arrivedAtMs: number;
    readonly iteration: number;
    readonly camAngle: number;
}
export interface MotionObserver {
    loopFrame(r: MotionLoopRecord): void;
    tick(r: MotionTickRecord): void;
    hdFrame(r: MotionHdRecord): void;
    snapshot(r: MotionSnapshotRecord): void;
    coopFrame?(r: MotionCoopRecord): void;
}
export function motionObserver(): MotionObserver | null {
    const o = (globalThis as {
        __ztMotion?: MotionObserver;
    }).__ztMotion;
    return o ?? null;
}
const wallMs = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
export interface LoopClock {
    accumulator: number;
    lastNow: number;
    lastPace: PaceLike | null;
    cadence?: FrameCadence;
    owedTicks?: number;
    stepLine?: number;
    stepTicks?: number;
}
export function resetLoopClock(clock: LoopClock, now: number): void {
    delete clock.stepLine;
    clock.accumulator = 0;
    clock.owedTicks = 0;
    clock.lastNow = now;
    clock.cadence?.reset(now);
}
export interface LoopHooks {
    pace(): PaceLike | null;
    running(): boolean;
    stopped(): boolean;
    tasOn(): boolean;
    levelWait(): number | null;
    runOneTick(render: boolean): void;
    updateStatus(): void;
    readonly tickMs: number;
    readonly maxCatchUp: number;
}
export function loopFrame(clock: LoopClock, h: LoopHooks, now: number): "paced" | "free" {
    currentFrame = { nowMs: now, dueMs: null };
    try {
        return loopFrameObserved(clock, h, now);
    }
    finally {
        currentFrame = null;
    }
}
function loopFrameObserved(clock: LoopClock, h: LoopHooks, now: number): "paced" | "free" {
    const obs = motionObserver();
    if (obs === null)
        return loopFrameBody(clock, h, now, null);
    const t0 = wallMs();
    const seen = { ticks: 0 };
    const kind = loopFrameBody(clock, h, now, { obs, now, seen });
    try {
        obs.loopFrame({ frameTimeMs: now, kind, ticksRun: seen.ticks, loopFrameMs: wallMs() - t0 });
    }
    catch { }
    return kind;
}
interface Watch {
    readonly obs: MotionObserver;
    readonly now: number;
    readonly seen: {
        ticks: number;
    };
}
function oneTick(h: LoopHooks, w: Watch | null, render: boolean): void {
    if (w === null) {
        h.runOneTick(render);
        return;
    }
    const wait = h.levelWait();
    const worldStep = wait !== null && wait <= 1;
    const probe = worldStep ? newStepPartsProbe() : null;
    const before = probe !== null ? setStepPartsProbe(probe) : null;
    const startMs = wallMs();
    try {
        h.runOneTick(render);
    }
    finally {
        if (probe !== null)
            setStepPartsProbe(before);
    }
    const endMs = wallMs();
    w.seen.ticks++;
    const parts = probe !== null ? { parts: partsOf(probe, endMs - startMs), pageThreadMs: endMs - startMs } : {};
    try {
        w.obs.tick({ startMs, endMs, pictureBuilt: render, worldStep, frameTimeMs: w.now, ...parts });
    }
    catch { }
}
function loopFrameBody(clock: LoopClock, h: LoopHooks, now: number, w: Watch | null): "paced" | "free" {
    const pace = h.pace();
    if (pace !== null && h.running() && !h.stopped() && !h.tasOn() && h.levelWait() !== null) {
        if (pace !== clock.lastPace) {
            pace.start(now);
            clock.lastPace = pace;
        }
        if (pace.poll(now) > 0) {
            if (currentFrame !== null && pace.dueMs !== undefined && pace.stepsRun !== undefined)
                currentFrame.dueMs = pace.dueMs(pace.stepsRun - 1);
            while ((h.levelWait() ?? 0) > 1 && h.running() && !h.stopped())
                oneTick(h, w, false);
            if (h.running() && !h.stopped())
                oneTick(h, w, true);
        }
        delete clock.stepLine;
        clock.accumulator = 0;
        clock.owedTicks = 0;
        clock.cadence?.reset(now);
        h.updateStatus();
        clock.lastNow = now;
        return "paced";
    }
    clock.lastPace = null;
    if (h.running() && !h.stopped()) {
        clock.cadence ??= makeFrameCadence({ tickMs: h.tickMs, maxCatchUp: h.maxCatchUp, start: clock.lastNow });
        let n = clock.cadence.frame(now) + (clock.owedTicks ?? 0);
        clock.owedTicks = 0;
        {
            const wait0 = h.levelWait();
            if (wait0 !== null && clock.stepLine !== undefined && now + STEP_EPS_MS >= clock.stepLine)
                n = Math.max(n, wait0);
        }
        let begun = 0;
        for (let i = 0; i < n && !h.stopped() && h.running(); i++) {
            const wait = h.levelWait();
            const begins = wait !== null && wait <= 1;
            if (begins && begun > 0) {
                clock.owedTicks = Math.min(n - i, h.maxCatchUp);
                break;
            }
            if (begins) {
                const line = clock.stepLine;
                const half = clock.stepTicks === undefined ? 0 : (clock.stepTicks * h.tickMs) / 2;
                const onLine = line !== undefined && Math.abs(now - line) <= half;
                if (onLine && now + STEP_EPS_MS < line) {
                    clock.owedTicks = Math.min(n - i, h.maxCatchUp);
                    break;
                }
                begun++;
                if (currentFrame !== null)
                    currentFrame.dueMs = onLine ? line : now;
                const due = onLine ? line : now;
                oneTick(h, w, true);
                const next = h.levelWait();
                if (next !== null && next > 0) {
                    clock.stepTicks = next;
                    clock.stepLine = due + next * h.tickMs;
                }
                continue;
            }
            oneTick(h, w, i === n - 1);
        }
        h.updateStatus();
    }
    else
        clock.cadence?.reset(now);
    clock.lastNow = now;
    return "free";
}
export function levelWaitOf(phase: string, newGame: {
    readonly stage: string;
    readonly pendingWait: number;
} | null): number | null {
    if (phase === "newgame" && newGame !== null && newGame.stage === "play")
        return newGame.pendingWait;
    return null;
}

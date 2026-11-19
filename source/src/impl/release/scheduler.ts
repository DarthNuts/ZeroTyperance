import type { AppConstants } from "./constants.js";
const BLANKS_PER_SECOND = 60;
const CLOCK_EPS_MS = 1e-6;
export type SpeedMode = "original" | "custom";
export function clampCustomSteps(c: AppConstants, v: number): number {
    if (typeof v !== "number" || !Number.isFinite(v))
        return c.speed.customDefault;
    return Math.min(c.speed.customMax, Math.max(c.speed.customMin, Math.round(v)));
}
export class SpeedScheduler {
    private readonly c: AppConstants;
    private mode: SpeedMode;
    private steps: number;
    private num = 1;
    private den = 1;
    private origin = 0;
    private n = 0;
    private started = false;
    private pausedAt: number | null = null;
    constructor(c: AppConstants, mode: SpeedMode, customSteps: number) {
        this.c = c;
        this.mode = mode;
        this.steps = clampCustomSteps(c, customSteps);
        this.setRate();
    }
    private setRate(): void {
        if (this.mode === "original") {
            this.num = BLANKS_PER_SECOND;
            this.den = this.c.speed.originalBlanks;
        }
        else {
            this.num = this.steps;
            this.den = 1;
        }
    }
    get currentMode(): SpeedMode { return this.mode; }
    get customSteps(): number { return this.steps; }
    get isPaused(): boolean { return this.pausedAt !== null; }
    get stepsRun(): number { return this.n; }
    get rate(): number { return this.num / this.den; }
    dueMs(n: number): number | null { return this.started ? this.origin + (n * 1000 * this.den) / this.num : null; }
    start(nowMs: number): void {
        this.started = true;
        this.origin = nowMs;
        this.n = 0;
        if (this.pausedAt !== null)
            this.pausedAt = nowMs;
    }
    setMode(mode: SpeedMode, customSteps: number, nowMs: number): void {
        this.mode = mode;
        this.steps = clampCustomSteps(this.c, customSteps);
        this.setRate();
        this.start(nowMs);
    }
    pause(nowMs: number): void { if (this.pausedAt === null)
        this.pausedAt = nowMs; }
    resume(nowMs: number): void {
        if (this.pausedAt === null)
            return;
        if (this.started)
            this.origin += Math.max(0, nowMs - this.pausedAt);
        this.pausedAt = null;
    }
    poll(nowMs: number): number {
        if (!this.started || this.pausedAt !== null)
            return 0;
        if ((nowMs - this.origin + CLOCK_EPS_MS) * this.num >= this.n * 1000 * this.den) {
            this.n++;
            return 1;
        }
        return 0;
    }
}
export function worldBlanks(c: AppConstants, recorded?: number): number {
    return recorded === undefined ? c.speed.originalBlanks : recorded;
}
export function stepPace(c: AppConstants, mode: SpeedMode, customSteps: number): {
    num: number;
    den: number;
} {
    return mode === "original" ? { num: c.speed.originalBlanks, den: 1 } : { num: BLANKS_PER_SECOND, den: clampCustomSteps(c, customSteps) };
}
export interface StepDriver {
    step(blanks: number): void;
}
export function pump(s: SpeedScheduler, nowMs: number, driver: StepDriver, blanksOf: () => number): number {
    const k = s.poll(nowMs);
    if (k > 0)
        driver.step(blanksOf());
    return k;
}

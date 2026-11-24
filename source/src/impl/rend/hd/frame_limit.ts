const INTERVALS_KEPT = 8;
const MS_PER_SECOND = 1000;
export type FrameLimit = "display" | number;
export class FrameLimiter {
    private due: number | null = null;
    private lastFrame: number | null = null;
    private readonly intervals: number[] = [];
    reset(): void {
        this.due = null;
        this.lastFrame = null;
        this.intervals.length = 0;
    }
    displayFrameMs(): number {
        return this.intervals.length === 0 ? 0 : Math.min(...this.intervals);
    }
    frame(nowMs: number, limit: FrameLimit): boolean {
        if (this.lastFrame !== null) {
            const d = nowMs - this.lastFrame;
            if (d > 0) {
                this.intervals.push(d);
                if (this.intervals.length > INTERVALS_KEPT)
                    this.intervals.shift();
            }
        }
        this.lastFrame = nowMs;
        if (limit === "display") {
            this.due = null;
            return true;
        }
        const period = MS_PER_SECOND / limit;
        if (this.due === null || nowMs - this.due > period) {
            this.due = nowMs + period;
            return true;
        }
        if (nowMs >= this.due - this.displayFrameMs() / 2) {
            this.due += period;
            return true;
        }
        return false;
    }
}

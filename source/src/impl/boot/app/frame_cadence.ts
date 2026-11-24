export const CADENCE_TOLERANCE = 0.02;
export const CADENCE_MAX_K = 4;
export const CADENCE_WINDOW = 60;
export const CADENCE_STALL_PERIODS = 2.5;
export interface FrameCadence {
    frame(now: number): number;
    reset(now: number): void;
    readonly locked: number;
}
export interface CadenceOptions {
    readonly tickMs: number;
    readonly maxCatchUp: number;
    readonly start: number;
}
export function makeFrameCadence(o: CadenceOptions): FrameCadence {
    const intervals: number[] = [];
    let last = o.start;
    let acc = 0;
    let k = 0;
    let since = 0;
    function period(): number {
        if (intervals.length < CADENCE_WINDOW)
            return 0;
        let s = 0;
        for (const d of intervals)
            s += d;
        return s / intervals.length;
    }
    function judge(): void {
        const p = period();
        if (p <= 0) {
            k = 0;
            return;
        }
        const m = Math.round(o.tickMs / p);
        k = m >= 1 && m <= CADENCE_MAX_K && Math.abs(m * p - o.tickMs) <= CADENCE_TOLERANCE * o.tickMs ? m : 0;
    }
    return {
        frame(now: number): number {
            const dt = Math.max(0, now - last);
            last = now;
            const p = period();
            const framePeriod = p > 0 ? p : o.tickMs;
            const stall = dt > CADENCE_STALL_PERIODS * framePeriod;
            if (!stall) {
                intervals.push(dt);
                if (intervals.length > CADENCE_WINDOW)
                    intervals.shift();
                const was = k;
                judge();
                if (k !== was)
                    acc = 0;
            }
            since++;
            if (k !== 0) {
                if (stall) {
                    since = 0;
                    return Math.min(o.maxCatchUp, Math.max(1, Math.round(dt / o.tickMs)));
                }
                if (since >= k) {
                    since = 0;
                    return 1;
                }
                return 0;
            }
            acc += dt;
            let n = Math.round(acc / o.tickMs);
            if (n < 0)
                n = 0;
            acc -= n * o.tickMs;
            if (n > o.maxCatchUp) {
                n = o.maxCatchUp;
                acc = 0;
            }
            if (n > 0)
                since = 0;
            return n;
        },
        reset(now: number): void {
            last = now;
            acc = 0;
            since = 0;
        },
        get locked() { return k; },
    };
}

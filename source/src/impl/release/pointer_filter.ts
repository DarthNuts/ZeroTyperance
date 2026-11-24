export interface SpikeConstants {
    readonly spikeRefMs: number;
    readonly spikeMinCounts: number;
    readonly spikeRateFactor: number;
    readonly spikeConfirmDiv: number;
}
export interface FilterWindow {
    readonly startMs: number;
    readonly endMs: number;
    readonly raw: number;
    readonly events: number;
    readonly largestMove: number;
    readonly spanMs: number;
    readonly suspect: boolean;
    readonly refRate: number;
    readonly given: number;
    readonly released: number;
    readonly accepted: number;
    readonly held: number;
    readonly discarded: number;
}
interface RateMark {
    readonly endMs: number;
    readonly rate: number;
}
export class PointerFilter {
    private sum = 0;
    private events = 0;
    private largest = 0;
    private firstAt: number | null = null;
    private lastAt: number | null = null;
    private windowStart: number | null = null;
    private marks: RateMark[] = [];
    private heldRest = 0;
    private heldSum = 0;
    private heldMark: RateMark | null = null;
    private totalRaw = 0;
    private totalAccepted = 0;
    private totalDiscarded = 0;
    private totalDiscardedSigned = 0;
    constructor(private readonly c: SpikeConstants) { }
    add(dx: number, atMs: number): void {
        if (!Number.isFinite(dx) || dx === 0) {
            if (Number.isFinite(dx))
                this.events++;
            return;
        }
        this.sum += dx;
        this.events++;
        if (Math.abs(dx) > Math.abs(this.largest))
            this.largest = dx;
        if (this.firstAt === null)
            this.firstAt = atMs;
        this.lastAt = atMs;
        this.totalRaw += dx;
    }
    private refAt(startMs: number): number {
        const from = startMs - this.c.spikeRefMs;
        this.marks = this.marks.filter((m) => m.endMs > from);
        let ref = 0;
        for (const m of this.marks)
            if (m.rate > ref)
                ref = m.rate;
        return ref;
    }
    close(nowMs: number): FilterWindow {
        const startMs = this.windowStart ?? nowMs;
        const len = Math.max(0, nowMs - startMs);
        this.windowStart = nowMs;
        const raw = this.sum;
        const mag = Math.abs(raw);
        const sign = Math.sign(raw);
        let released = 0;
        let discarded = 0;
        if (this.heldRest !== 0) {
            if (sign === Math.sign(this.heldRest) && mag >= this.heldSum / this.c.spikeConfirmDiv) {
                released = this.heldRest;
                if (this.heldMark)
                    this.marks.push(this.heldMark);
            }
            else {
                discarded = Math.abs(this.heldRest);
                this.totalDiscardedSigned += this.heldRest;
            }
            this.heldRest = 0;
            this.heldSum = 0;
            this.heldMark = null;
        }
        const ref = this.refAt(startMs);
        const rate = len > 0 ? mag / len : mag > 0 ? Infinity : 0;
        const suspect = mag >= this.c.spikeMinCounts && rate > this.c.spikeRateFactor * ref;
        let given = raw;
        if (suspect) {
            const allow = ref > 0 ? Math.trunc(ref * len) : this.c.spikeMinCounts;
            given = sign * Math.min(mag, allow);
            this.heldRest = raw - given;
            this.heldSum = mag;
            this.heldMark = { endMs: nowMs, rate };
        }
        else
            this.marks.push({ endMs: nowMs, rate });
        const accepted = given + released;
        this.totalAccepted += accepted;
        this.totalDiscarded += discarded;
        const w: FilterWindow = {
            startMs, endMs: nowMs, raw, events: this.events, largestMove: this.largest,
            spanMs: this.firstAt !== null && this.lastAt !== null ? this.lastAt - this.firstAt : 0,
            suspect, refRate: ref, given: given === 0 ? 0 : given, released, accepted: accepted === 0 ? 0 : accepted,
            held: Math.abs(this.heldRest), discarded,
        };
        this.sum = 0;
        this.events = 0;
        this.largest = 0;
        this.firstAt = null;
        this.lastAt = null;
        return w;
    }
    reset(): number {
        const d = Math.abs(this.heldRest);
        this.totalDiscarded += d;
        this.totalDiscardedSigned += this.heldRest;
        this.heldRest = 0;
        this.heldSum = 0;
        this.heldMark = null;
        this.marks = [];
        return d;
    }
    get held(): number { return this.heldRest; }
    get totals(): {
        raw: number;
        accepted: number;
        held: number;
        discarded: number;
        discardedSigned: number;
        open: number;
    } {
        return { raw: this.totalRaw, accepted: this.totalAccepted, held: this.heldRest, discarded: this.totalDiscarded, discardedSigned: this.totalDiscardedSigned, open: this.sum };
    }
}

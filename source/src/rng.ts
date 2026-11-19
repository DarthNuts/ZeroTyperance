export interface Rng {
    next(): number;
}
export interface LcgParams {
    multiplier: number;
    increment: number;
}
export function lcgStep(state: number, p: LcgParams): number {
    return (Math.imul(state >>> 0, p.multiplier >>> 0) + p.increment) >>> 0;
}
export function lcgDraws(seed: number, count: number, p: LcgParams): number[] {
    const out: number[] = [];
    let s = seed >>> 0;
    for (let i = 0; i < count; i++) {
        s = lcgStep(s, p);
        out.push(s);
    }
    return out;
}
export class LcgRng implements Rng {
    private s: number;
    count = 0;
    constructor(seed: number, private readonly params: LcgParams) {
        this.s = seed >>> 0;
    }
    get state(): number {
        return this.s;
    }
    next(): number {
        this.s = lcgStep(this.s, this.params);
        this.count++;
        return this.s;
    }
}
export class ReplayRng implements Rng {
    private pos = 0;
    private tail: number;
    constructor(private readonly draws: readonly number[], private readonly params: LcgParams, seedBefore: number) {
        this.tail = (draws.length ? draws[draws.length - 1]! : seedBefore) >>> 0;
    }
    get count(): number {
        return this.pos;
    }
    get overrun(): number {
        return Math.max(0, this.pos - this.draws.length);
    }
    get underrun(): number {
        return Math.max(0, this.draws.length - this.pos);
    }
    next(): number {
        const i = this.pos++;
        if (i < this.draws.length)
            return this.draws[i]! >>> 0;
        this.tail = lcgStep(this.tail, this.params);
        return this.tail;
    }
}

import { START_SCREEN as S } from "./constants.js";
export interface LeadScreenFrame {
    readonly t: number;
    readonly display: 0 | 1;
    readonly cram: readonly number[];
    readonly indices: Uint8Array | null;
}
export interface Pace {
    readonly a: number;
    readonly tf: number;
    readonly tl: number;
}
const SHIFT = { red: 1, green: 5, blue: 9 } as const;
export class LevelStartScreen {
    private readonly table: LeadScreenFrame[] = [];
    private readonly end: number;
    private readonly F: number;
    private readonly pace: Pace;
    constructor(boundary: {
        readonly indices: Uint8Array;
        readonly cram: readonly number[];
    }, pace?: Pace) {
        this.pace = pace ?? { a: S.OFF_FIRST, tf: S.TARGET_FIRST, tl: S.TARGET_LAST };
        const { a, tf, tl } = this.pace;
        const F = tl + 2;
        const target: number[] = [];
        for (let i = 0; i < S.ENTRIES; i++)
            target.push((boundary.cram[i] ?? 0) & S.COLOUR_MASK);
        const zero: readonly number[] = new Array(S.ENTRIES).fill(0);
        const frames = F + S.FADE_PASSES;
        this.F = F;
        const shown: (readonly number[])[] = [];
        let W = zero.slice() as number[];
        let P: number[] = zero.slice() as number[];
        let Q = 0;
        let n = 0;
        shown.push(P.slice());
        let endPass = -1;
        const bound = S.STEP_FIRST_PASS + S.STEP_PERIOD * (3 * S.LEVELS + 3) + 2 * S.QUIET_CAP;
        for (let u = 1; u <= bound; u++) {
            if (Q === 0)
                P = W.slice();
            let changed = false;
            if (u >= S.STEP_FIRST_PASS && (u - S.STEP_FIRST_PASS) % S.STEP_PERIOD === 0) {
                n += 1;
                const ch = S.CHANNEL_ORDER[(n - 1) % S.CHANNEL_ORDER.length]!;
                const sh = SHIFT[ch];
                for (let i = 0; i < S.ENTRIES; i++) {
                    const cur = (W[i]! >> sh) & 7;
                    const want = (target[i]! >> sh) & 7;
                    if (cur === want)
                        continue;
                    const next = cur < want ? cur + 1 : cur - 1;
                    W[i] = (W[i]! & ~(7 << sh)) | (next << sh);
                    changed = true;
                }
            }
            Q = changed ? 0 : Math.min(Q + 1, S.QUIET_CAP);
            shown.push(P.slice());
            if (Q === S.QUIET_END) {
                endPass = u;
                break;
            }
        }
        this.end = endPass;
        for (let t = 0; t < frames; t++) {
            let display: 0 | 1 = 1;
            let cram: readonly number[] = zero;
            if (t >= a && t <= F - 1) {
                display = 0;
                if (t >= tf && t <= tl)
                    cram = target;
            }
            else if (t > F) {
                const u = t - F;
                cram = shown[Math.min(u, shown.length - 1)]!;
            }
            this.table.push({ t, display, cram, indices: t >= F + 1 ? boundary.indices : null });
        }
    }
    get frames(): number {
        return this.F + S.FADE_PASSES;
    }
    get fadeStart(): number {
        return this.F;
    }
    get musicFrame(): number {
        return this.pace.a;
    }
    get pictureStart(): number {
        return this.F + 1;
    }
    get creationFrame(): number {
        return this.pace.tl;
    }
    get afterExit(): number {
        return S.SELECT_FADEOUT;
    }
    frame(t: number): LeadScreenFrame {
        const f = this.table[t];
        if (!Number.isInteger(t) || f === undefined)
            throw new Error(`lead frame ${t} outside 0..${this.F + S.FADE_PASSES - 1}`);
        return f;
    }
    get endPass(): number {
        return this.end;
    }
}

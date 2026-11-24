import type { NetCore, Effect, StepPace } from "./core.js";
import { digestOf } from "./core.js";
import { freezeCore, loadCore, saveCore, thawCore } from "../boot/app/state.js";
import { frozenDigest } from "./frozen_hash.js";
import type { FreezeMemo, FrozenGraph } from "../release/savestate.js";
import type { CoreState, StateKit } from "../boot/app/state.js";
import { addSecondSeat } from "../tick/seats.js";
import type { SeatRules } from "../tick/seats.js";
import { ORIGINAL_SCHEME, originalByteOfPad, unpackModernPad } from "./scheme.js";
import type { SeatScheme } from "./scheme.js";
import type { ComposedScreen } from "../rend/app/screen_compose.js";
import { modernPadByte, setModern } from "../modern/api.js";
import { moveSnapshotSink } from "../rend/hd/snapshot.js";
const SINK = { emit: (): void => undefined } as never;
const STEP_TICK_LIMIT = 1000;
export class StepRefusedError extends Error {
    constructor(readonly refusal: string) { super(`the world refused a step: ${refusal}`); this.name = "StepRefusedError"; }
}
export const TEST_ONLY_SNAP: {
    leaveOut: string | null;
} = { leaveOut: null };
export const TEST_ONLY_DIGEST = { text: false };
export class RealCore implements NetCore {
    private st: CoreState;
    private pad1 = 0;
    private schemes: readonly [
        SeatScheme,
        SeatScheme
    ] = [ORIGINAL_SCHEME, ORIGINAL_SCHEME];
    private pace: StepPace | null = null;
    private acc = 0;
    private capture: (() => ComposedScreen | null) | null = null;
    private passPics: (ComposedScreen | null)[] = [];
    private passStamp = 0;
    private readonly startMusic: readonly unknown[];
    constructor(private readonly tickKit: StateKit, start: string, twoSeats: {
        readonly offsetX: number;
        readonly seat1Start?: string;
        readonly rules?: SeatRules;
        readonly startMusic?: readonly unknown[];
    } | null = null) {
        this.st = loadCore(start, tickKit);
        this.startMusic = twoSeats?.startMusic ?? [];
        if (twoSeats !== null) {
            const ts = this.st.session.run!.state;
            if (ts.seats === undefined) {
                const other = twoSeats.seat1Start === undefined ? undefined : loadCore(twoSeats.seat1Start, tickKit).session.run!.state;
                ts.seats = addSecondSeat(ts, twoSeats.offsetX, other, twoSeats.rules);
                this.st.session.run!.seat1Entry();
            }
        }
    }
    get state(): CoreState { return this.st; }
    setPassCapture(f: (() => ComposedScreen | null) | null): void { this.capture = f; }
    get passPictures(): {
        readonly stamp: number;
        readonly pics: readonly (ComposedScreen | null)[];
    } { return { stamp: this.passStamp, pics: this.passPics }; }
    setSchemes(schemes: readonly [
        SeatScheme,
        SeatScheme
    ]): void { this.schemes = schemes; }
    startAudio(): readonly Effect[] { return this.startMusic.map((s, i): Effect => ({ kind: "sound", id: JSON.stringify(s), source: `start${i}` })); }
    private padOf(k: 0 | 1, pad: number, inLevel: boolean): number {
        const sc = this.schemes[k];
        if (sc.scheme !== "modern")
            return pad & 0xff;
        const input = unpackModernPad(pad);
        if (inLevel)
            setModern(this.st.session.run!.state, k, { scheme: "modern", turnCap: sc.turnCap, selection: sc.selection, input });
        if (this.st.session.seatOnScreen(k))
            return originalByteOfPad(pad);
        return modernPadByte(input);
    }
    setPace(pace: StepPace): void { this.pace = { num: pace.num, den: pace.den }; }
    screenByte(k: 0 | 1, pad: number): number {
        return this.schemes[k].scheme === "modern" ? originalByteOfPad(pad) : pad & 0xff;
    }
    step(pad0: number, pad1: number): readonly Effect[] {
        this.pad1 = pad1;
        const session = this.st.session;
        const run = session.run;
        const inLevel = session.stage === "play" && run !== null;
        const seats = run?.state.seats;
        const b0 = this.padOf(0, pad0, inLevel);
        const b1 = seats !== undefined ? this.padOf(1, pad1, inLevel) : pad1 & 0xff;
        if (seats !== undefined)
            seats.pad1 = b1;
        const refusedBefore = session.lastError;
        const sounds: unknown[] = [];
        this.passStamp = (this.passStamp ?? 0) + 1;
        this.passPics = [];
        const tickOnce = (): void => {
            const blank = this.st.blank;
            (this.st as {
                blank: number;
            }).blank = blank + 1;
            const onScreen = typeof this.capture === "function" && (session.stage as string) !== "play";
            sounds.push(...session.tick(b0, SINK, blank).sounds);
            if (onScreen) {
                const pic = this.capture!();
                this.passPics.push(pic === null ? null : { width: pic.width, height: pic.height, indices: pic.indices.slice(), cram: [...pic.cram] });
            }
        };
        const pace = this.pace;
        if (pace === null)
            tickOnce();
        else if (session.stage === "play") {
            for (let i = 0; i < STEP_TICK_LIMIT && session.stage === "play" && session.pendingWait > 1; i++)
                tickOnce();
            if (session.stage === "play")
                tickOnce();
        }
        else {
            this.acc += pace.num;
            const passes = Math.floor(this.acc / pace.den);
            this.acc -= passes * pace.den;
            for (let i = 0; i < passes && (session.stage as string) !== "play"; i++)
                tickOnce();
        }
        if (session.lastError !== "" && session.lastError !== refusedBefore)
            throw new StepRefusedError(session.lastError);
        return sounds.map((s, i): Effect => ({ kind: "sound", id: JSON.stringify(s), source: i }));
    }
    seatLost(seat: 0 | 1): void {
        this.st.session.loseSeat(seat);
    }
    save(): string {
        return JSON.stringify({ pad1: this.pad1, schemes: this.schemes, ...(this.pace !== null ? { acc: this.acc } : {}), core: saveCore(this.st, this.tickKit) });
    }
    private memo: FreezeMemo = new WeakMap();
    lastSnapBytes = 0;
    lastSharedBytes = 0;
    snap(): unknown {
        const g = freezeCore(this.st, this.tickKit, this.memo);
        this.lastSnapBytes = g.copiedBytes;
        this.lastSharedBytes = g.sharedBytes;
        return { pad1: this.pad1, schemes: this.schemes, acc: this.acc, g } satisfies Snap;
    }
    digest(): string {
        if (TEST_ONLY_DIGEST.text)
            return digestOf(this.save());
        const g = freezeCore(this.st, this.tickKit, this.memo);
        return frozenDigest(g, [this.pad1, this.schemes, this.pace !== null ? this.acc : null]);
    }
    restore(s: unknown): void {
        const o = s as Snap;
        const before = this.st.session.run?.state;
        this.memo = new WeakMap();
        const live = this.st;
        this.st = thawCore(o.g, this.tickKit, this.memo);
        const f = TEST_ONLY_SNAP.leaveOut;
        if (f !== null && live.session.run && this.st.session.run)
            (this.st.session.run.state as unknown as Record<string, unknown>)[f] = (live.session.run.state as unknown as Record<string, unknown>)[f];
        moveSnapshotSink(before, this.st.session.run?.state);
        this.pad1 = o.pad1;
        this.schemes = o.schemes;
        this.acc = o.acc;
    }
    snapText(s: unknown): string {
        const o = s as Snap;
        const st = thawCore(o.g, this.tickKit);
        return JSON.stringify({ pad1: o.pad1, schemes: o.schemes, ...(this.pace !== null ? { acc: o.acc } : {}), core: saveCore(st, this.tickKit) });
    }
    load(state: string): void {
        const o = JSON.parse(state) as {
            pad1: number;
            schemes?: [
                SeatScheme,
                SeatScheme
            ];
            acc?: number;
            core: string;
        };
        const before = this.st.session.run?.state;
        this.st = loadCore(o.core, this.tickKit);
        moveSnapshotSink(before, this.st.session.run?.state);
        this.pad1 = o.pad1;
        this.schemes = o.schemes ?? [ORIGINAL_SCHEME, ORIGINAL_SCHEME];
        this.acc = o.acc ?? 0;
    }
}
interface Snap {
    readonly pad1: number;
    readonly schemes: readonly [
        SeatScheme,
        SeatScheme
    ];
    readonly acc: number;
    readonly g: FrozenGraph;
}

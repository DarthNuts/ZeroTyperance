import type { NetCore, Effect, StepPace } from "./core.js";
import { loadCore, saveCore } from "../boot/app/state.js";
import type { CoreState, StateKit } from "../boot/app/state.js";
import { addSecondSeat } from "../tick/seats.js";
import type { SeatRules } from "../tick/seats.js";
import { ORIGINAL_SCHEME, originalByteOfPad, unpackModernPad } from "./scheme.js";
import type { SeatScheme } from "./scheme.js";
import { modernPadByte, setModern } from "../modern/api.js";
const SINK = { emit: (): void => undefined } as never;
const STEP_TICK_LIMIT = 1000;
export class StepRefusedError extends Error {
    constructor(readonly refusal: string) { super(`the world refused a step: ${refusal}`); this.name = "StepRefusedError"; }
}
export class RealCore implements NetCore {
    private st: CoreState;
    private pad1 = 0;
    private schemes: readonly [
        SeatScheme,
        SeatScheme
    ] = [ORIGINAL_SCHEME, ORIGINAL_SCHEME];
    private pace: StepPace | null = null;
    private acc = 0;
    constructor(private readonly tickKit: StateKit, start: string, twoSeats: {
        readonly offsetX: number;
        readonly seat1Start?: string;
        readonly rules?: SeatRules;
    } | null = null) {
        this.st = loadCore(start, tickKit);
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
    setSchemes(schemes: readonly [
        SeatScheme,
        SeatScheme
    ]): void { this.schemes = schemes; }
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
        const tickOnce = (): void => {
            const blank = this.st.blank;
            (this.st as {
                blank: number;
            }).blank = blank + 1;
            sounds.push(...session.tick(b0, SINK, blank).sounds);
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
        this.st = loadCore(o.core, this.tickKit);
        this.pad1 = o.pad1;
        this.schemes = o.schemes ?? [ORIGINAL_SCHEME, ORIGINAL_SCHEME];
        this.acc = o.acc ?? 0;
    }
}

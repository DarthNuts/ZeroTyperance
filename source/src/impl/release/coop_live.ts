import { medianMs, pingText } from "./ping.js";
import { motionObserver, withFrameClock } from "../boot/app/pace_loop.js";
import { CoopPage } from "./coop_page.js";
import type { CoopPageOptions, ScreenPicture } from "./coop_page.js";
import { SpeedScheduler } from "./scheduler.js";
import type { AppConstants } from "./constants.js";
import type { Effect, NetCore } from "../net/core.js";
import { composedToRgba } from "../rend/app/screen_compose.js";
import type { ComposedScreen } from "../rend/app/screen_compose.js";
import { inSeat, seatPauseRequests } from "../tick/core.js";
import { heardBy } from "../tick/sound.js";
import type { SoundDriver } from "../tick/sound.js";
import { pauseFrame, pauseFrameRecord } from "../pause/core.js";
import type { PauseScreen } from "../pause/core.js";
import { stepPace } from "./scheduler.js";
import type { TickState } from "../tick/core.js";
import type { StepClock } from "./step_clock.js";
import { makeFrameCadence } from "../boot/app/frame_cadence.js";
import type { FrameCadence } from "../boot/app/frame_cadence.js";
export const PASS_MS = 1000 / 60;
export const SCREEN_CATCH_UP = 10;
export interface PartnerInfo {
    readonly hp: number | null;
    readonly choosing?: boolean;
    readonly paused?: boolean;
    readonly waiting?: boolean;
}
export const PARTNER_PAUSED_LINE = "The other player paused the game";
export const WAITING_LINE = "Waiting for the other player";
export const COOP_PARTNER_PAUSE = { on: true };
function pauseFlagsOf(seats: {
    pause: readonly boolean[];
    out: readonly boolean[];
} | undefined, seat: 0 | 1): {
    own: boolean;
    partnerAlone: boolean;
} {
    if (seats === undefined)
        return { own: false, partnerAlone: false };
    const partner = seat === 0 ? 1 : 0;
    const own = seats.pause[seat] === true;
    return { own, partnerAlone: COOP_PARTNER_PAUSE.on && !own && seats.pause[partner] === true && seats.out[seat] !== true };
}
export interface LiveHooks {
    readonly onDraw: NonNullable<CoopPageOptions["onDraw"]>;
    readonly onEffect: NonNullable<CoopPageOptions["onEffect"]>;
    readonly onAudio: NonNullable<CoopPageOptions["onAudio"]>;
    readonly clock: () => number;
}
export interface CoopLiveOptions {
    readonly consts: AppConstants;
    readonly speed: {
        readonly mode: "original" | "custom";
        readonly custom_steps: number;
    };
    readonly now: () => number;
    readonly path?: () => "direct" | "relay";
    readonly makePage: (hooks: LiveHooks) => CoopPage;
    readonly pad: () => number;
    readonly menuOpen: () => boolean;
    readonly turnsSent?: () => readonly {
        readonly turn: number;
        readonly at: number | null;
    }[];
    readonly draw?: (seat: 0 | 1, step: number, core: NetCore) => void;
    readonly drawScreen?: (picture: ScreenPicture) => void;
    readonly sound?: (seat: 0 | 1, e: Effect, step: number) => void;
    readonly audio?: (seat: 0 | 1, list: readonly Effect[], step: number) => void;
    readonly partnerInfo?: (core: NetCore, seat: 0 | 1) => PartnerInfo | null;
    readonly characterName?: (i: number) => string;
    readonly onLine?: (line: string) => void;
    readonly onStatus?: (status: string) => void;
    readonly onStarted?: () => void;
    readonly onEnd?: (reason: string) => void;
    readonly gameOver?: (core: NetCore) => boolean;
    readonly onGameOver?: () => void;
    readonly stepClock?: StepClock;
    readonly raf?: (cb: (t: number) => void) => unknown;
    readonly cancelRaf?: (h: unknown) => void;
    readonly ownPause?: OwnPauseHooks;
    readonly onStepError?: (text: string, err: unknown) => void;
    readonly drawOwn?: (screen: ComposedScreen) => void;
    readonly drawComposed?: (seat: 0 | 1, screen: ComposedScreen) => void;
    readonly gameBlanks?: (n: number) => void;
}
export interface OwnPause {
    pass(core: NetCore, pad: number): readonly Effect[];
    picture(): ComposedScreen;
    close(): readonly Effect[];
    readonly opened: readonly Effect[];
}
export interface OwnPauseHooks {
    flag(core: NetCore, seat: 0 | 1): boolean;
    open(core: NetCore, seat: 0 | 1): OwnPause | null;
}
export interface CoopLive {
    readonly coop: CoopPage;
    frame(now?: number): void;
    pump(now?: number): void;
    paint(now?: number): void;
    readonly steps: number;
    line(): string;
    pingText(): string | null;
    leave(): void;
    stop(): void;
    readonly stopped: boolean;
}
export function partnerLine(coop: CoopPage, info: PartnerInfo | null, name: (i: number) => string): string {
    const p = coop.page;
    const seat = p.seat;
    const chars = p.start?.options["characters"] as readonly number[] | undefined;
    const who = chars !== undefined && chars[1 - seat] !== undefined ? name(chars[1 - seat]!) : "partner";
    if (p.phase === "ended" && p.reason !== null)
        return `Partner: ${who} - ${p.partnerLost ? "PLAYER CONNECTION LOST, gone" : p.offlineFrom !== null ? "gone" : "no session"} (${coop.reason || p.reason})`;
    if (p.phase !== "running")
        return `Partner: ${coop.statusLine}`;
    const hp = info?.hp;
    if (info?.choosing === true)
        return `Partner: ${who} - the partner is choosing a character`;
    if (info?.waiting === true)
        return WAITING_LINE;
    if (info?.paused === true)
        return PARTNER_PAUSED_LINE;
    return `Partner: ${who}${hp === null || hp === undefined ? "" : `, ${hp} hit points`} - ${coop.status === "waiting for the partner" ? "waiting for the partner" : "linked"}`;
}
export const FRAMES_GONE_MS = 250;
export const TEST_ONLY_PAD = { eager: false };
export const TEST_ONLY_GATE = { catchUp: false, onePerFrame: false };
export function dueCountOf(dueMs: (n: number) => number | null): (t: number) => number {
    return (t) => {
        const d0 = dueMs(0), d1 = dueMs(1);
        if (d0 === null || d1 === null || !(d1 > d0) || t < d0)
            return 0;
        return Math.floor((t - d0) / (d1 - d0) + 1e-9) + 1;
    };
}
export class FrameStepGate {
    private stepsSinceFrame = 0;
    private lastFrameAt = Number.NEGATIVE_INFINITY;
    frame(now: number): void { this.stepsSinceFrame = 0; this.lastFrameAt = now; }
    framesGone(now: number): boolean { return now - this.lastFrameAt > FRAMES_GONE_MS; }
    mayStep(now: number, dueCount?: (t: number) => number): boolean {
        if (TEST_ONLY_GATE.catchUp || now - this.lastFrameAt > FRAMES_GONE_MS)
            return true;
        const onTime = !TEST_ONLY_GATE.onePerFrame && dueCount !== undefined && Number.isFinite(this.lastFrameAt) ? Math.max(0, dueCount(now) - dueCount(this.lastFrameAt)) : 0;
        return this.stepsSinceFrame < (TEST_ONLY_GATE.onePerFrame ? 1 : onTime + 1);
    }
    stepped(): void { this.stepsSinceFrame++; }
    get onePerTick(): boolean { return !TEST_ONLY_GATE.catchUp; }
}
export function startCoopLive(o: CoopLiveOptions): CoopLive {
    const gate = new FrameStepGate();
    let scheduler: SpeedScheduler | null = null;
    let speedKey = "";
    let steps = 0;
    let stopped = false;
    let endedTold = false;
    let overTold = false;
    let startedTold = false;
    let lastStatus = "";
    let lastLine = "";
    let handle: unknown = null;
    let clockH: {
        stop(): void;
    } | null = null;
    const deferDraw = o.stepClock !== undefined && o.raf !== undefined;
    let pendingDraw: {
        seat: 0 | 1;
        step: number;
    } | null = null;
    let cadence: FrameCadence | null = null;
    let sched: {
        t0: number;
        pics: (ComposedScreen | null)[];
        shown: number;
    } | null = null;
    let lastPassStamp = -1;
    let lastPassStep = -1;
    const name = o.characterName ?? ((i: number): string => `character ${i + 1}`);
    function hand(list: readonly Effect[], step: number): void {
        if (o.audio)
            o.audio(coop.page.seat, list, step);
        else
            for (const e of list)
                o.sound?.(coop.page.seat, e, step);
    }
    const hooks: LiveHooks = {
        clock: o.now,
        onDraw: (seat, step) => { if (deferDraw)
            pendingDraw = { seat, step };
        else if (coop.page.core && own === null)
            o.draw?.(seat, step, coop.page.core); },
        onEffect: (_key, e, step) => { o.sound?.(coop.page.seat, e, step); },
        onAudio: (step, list) => { hand(list, step); },
    };
    const coop = o.makePage(hooks);
    if (deferDraw) {
        coop.screensByFrame = true;
        cadence = makeFrameCadence({ tickMs: PASS_MS, maxCatchUp: SCREEN_CATCH_UP, start: o.now() });
        coop.coreMade = (c) => {
            const core = c as unknown as {
                setPassCapture?(f: (() => ComposedScreen | null) | null): void;
            };
            core.setPassCapture?.(() => (coop.page.core ? realSeatScreen(coop.page.core, coop.page.seat) : null));
        };
    }
    function speedOf(): {
        mode: "original" | "custom";
        custom_steps: number;
    } {
        const sp = coop.page.start?.options["speed"] as {
            mode?: unknown;
            custom_steps?: unknown;
        } | undefined;
        if (sp && (sp.mode === "original" || sp.mode === "custom") && typeof sp.custom_steps === "number")
            return { mode: sp.mode, custom_steps: sp.custom_steps };
        return o.speed;
    }
    function due(now: number): boolean {
        const sp = speedOf();
        const key = `${sp.mode}/${sp.custom_steps}`;
        if (scheduler === null) {
            scheduler = new SpeedScheduler(o.consts, sp.mode, sp.custom_steps);
            scheduler.start(now);
            speedKey = key;
        }
        else if (key !== speedKey) {
            scheduler.setMode(sp.mode, sp.custom_steps, now);
            speedKey = key;
        }
        return scheduler.poll(now) > 0;
    }
    function between(): void {
        try {
            coop.page.between();
        }
        catch (err) {
            stepFailed(err);
        }
    }
    function frame(now: number = o.now()): void {
        if (stopped)
            return;
        between();
        if (due(now))
            runStep(now);
    }
    function pump(now: number = o.now()): void {
        between();
        const sch = (): SpeedScheduler | null => scheduler;
        while (!stopped && gate.mayStep(now, sch() !== null ? dueCountOf((n) => sch()!.dueMs(n)) : undefined) && due(now)) {
            runStep(now);
            gate.stepped();
            if (gate.onePerTick)
                break;
        }
    }
    function screenPasses(now: number): boolean {
        const n = cadence!.frame(now);
        if (!coop.preWorld)
            return false;
        let ran = false;
        for (let i = 0; i < n; i++) {
            const pad = o.menuOpen() ? 0 : o.pad();
            let done: boolean;
            try {
                done = coop.screenPass(pad);
            }
            catch (err) {
                stepFailed(err);
                return false;
            }
            ran = true;
            if (done)
                break;
        }
        return ran;
    }
    let seen = { live: 0, rerun: 0, save: 0, restore: 0, steps: 0 };
    function reportCoop(now: number): void {
        const w = motionObserver();
        if (w === null || w.coopFrame === undefined)
            return;
        const p = coop.page;
        const k = { live: p.liveSteps, rerun: p.rerunSteps, save: p.work.saveMs, restore: p.work.restoreMs, steps: p.work.stepsMs };
        try {
            w.coopFrame({ frameTimeMs: now, stepsLive: k.live - seen.live, stepsRerun: k.rerun - seen.rerun, saveMs: k.save - seen.save, restoreMs: k.restore - seen.restore, stepsMs: k.steps - seen.steps, turnsSent: o.turnsSent?.() ?? [], ...(p.core ? realSeatWhere(p.core, p.seat) ?? {} : {}) });
        }
        catch { }
        seen = k;
    }
    function paint(now: number = o.now()): void {
        gate.frame(now);
        reportCoop(now);
        if (stopped)
            return;
        const passed = cadence !== null ? screenPasses(now) : false;
        if (stopped)
            return;
        const d = pendingDraw;
        pendingDraw = null;
        let busy = false;
        if (sched !== null) {
            const due = Math.min(sched.pics.length - 1, Math.floor((now - sched.t0) / PASS_MS + 1e-9));
            let i = due;
            while (i > sched.shown && sched.pics[i] === null)
                i--;
            if (i > sched.shown && sched.pics[i] !== null) {
                sched.shown = i;
                const pic = sched.pics[i]!;
                if (own !== null || o.drawComposed === undefined)
                    o.drawOwn?.(pic);
                else
                    o.drawComposed(coop.page.seat, pic);
                busy = true;
            }
            if (due >= sched.pics.length - 1)
                sched = null;
            else
                busy = true;
        }
        if (!busy) {
            if (own !== null)
                o.drawOwn?.(own.picture());
            else if (d !== null && coop.page.core)
                o.draw?.(d.seat, d.step, coop.page.core);
        }
        if (passed) {
            const pic = coop.screenPicture();
            if (pic)
                o.drawScreen?.(pic);
        }
    }
    let own: OwnPause | null = null;
    let ownAcc = 0;
    const playOwn = (es: readonly Effect[]): void => { if (es.length > 0)
        hand(es, coop.page.n); };
    function ownPauseStep(pad: number): (ComposedScreen | null)[] | null {
        const core = coop.page.core;
        const hooks = o.ownPause;
        if (!hooks || !core || (coop.page.phase !== "running" && coop.page.phase !== "ended"))
            return null;
        const set = hooks.flag(core, coop.page.seat);
        if (own !== null && !set) {
            playOwn(own.close());
            own = null;
            pendingDraw = { seat: coop.page.seat, step: coop.page.n };
            if (!deferDraw && coop.page.core)
                o.draw?.(coop.page.seat, coop.page.n, coop.page.core);
            return null;
        }
        if (own === null && set) {
            own = hooks.open(core, coop.page.seat);
            ownAcc = 0;
            if (own !== null) {
                playOwn(own.opened);
                if (!deferDraw)
                    o.drawOwn?.(own.picture());
            }
            return null;
        }
        if (own === null)
            return null;
        const sp = speedOf();
        const pace = stepPace(o.consts, sp.mode, sp.custom_steps);
        ownAcc += pace.num;
        const passes = Math.floor(ownAcc / pace.den);
        ownAcc -= passes * pace.den;
        const pics: (ComposedScreen | null)[] = [];
        for (let i = 0; i < passes; i++) {
            playOwn(own.pass(core, pad));
            if (deferDraw) {
                const pic = own.picture();
                pics.push({ width: pic.width, height: pic.height, indices: pic.indices.slice(), cram: [...pic.cram] });
            }
        }
        if (!deferDraw)
            o.drawOwn?.(own.picture());
        return pics.length > 0 ? pics : null;
    }
    function stepFailed(err: unknown): void {
        const text = err instanceof Error ? err.message : String(err);
        try {
            coop.page.failStep(text);
        }
        catch { }
        stopLoop();
        o.onStepError?.(text, err);
        if (!endedTold) {
            endedTold = true;
            o.onEnd?.(coop.page.reason ?? text);
        }
        const l = line();
        if (l !== lastLine) {
            lastLine = l;
            o.onLine?.(l);
        }
    }
    function stepPictures(): (ComposedScreen | null)[] | null | undefined {
        const core = coop.page.core as unknown as {
            passPictures?: {
                stamp: number;
                pics: (ComposedScreen | null)[];
            };
        } | null;
        const p = core?.passPictures;
        if (p === undefined)
            return null;
        if (p.stamp === lastPassStamp || coop.page.n === lastPassStep)
            return undefined;
        lastPassStamp = p.stamp;
        lastPassStep = coop.page.n;
        return p.pics.length > 0 ? [...p.pics] : null;
    }
    function runStep(stepAt: number): void {
        let taken: number | null = null;
        const takePad = (): number => (taken ??= deferDraw && coop.preWorld ? 0 : o.menuOpen() ? 0 : TEST_ONLY_PAD.eager ? eager : o.pad());
        const eager = TEST_ONLY_PAD.eager && !(deferDraw && coop.preWorld) && !o.menuOpen() ? o.pad() : 0;
        const sch = scheduler as SpeedScheduler | null;
        const dueAt = sch !== null ? sch.dueMs(sch.stepsRun - 1) : null;
        try {
            withFrameClock({ nowMs: stepAt, dueMs: dueAt }, () => coop.tick(takePad));
        }
        catch (err) {
            stepFailed(err);
            return;
        }
        steps++;
        if (o.gameBlanks && coop.page.phase === "running" && coop.page.core && worldRuns(coop.page.core)) {
            const sp = speedOf();
            const pace = stepPace(o.consts, sp.mode, sp.custom_steps);
            o.gameBlanks(pace.num / pace.den);
        }
        const ownPics = ownPauseStep(own !== null || taken !== null ? takePad() : 0);
        if (deferDraw) {
            const fresh = stepPictures();
            const pics = ownPics ?? fresh;
            if (pics !== undefined && pics !== null && pics.length > 0) {
                sched = { t0: stepAt, pics, shown: -1 };
                pendingDraw = null;
            }
            else if (fresh !== undefined || ownPics !== null)
                sched = null;
        }
        if (!deferDraw) {
            const pic = coop.screenPicture();
            if (pic)
                o.drawScreen?.(pic);
        }
        if (coop.page.phase === "ended" && !endedTold) {
            endedTold = true;
            o.onEnd?.(coop.reason || coop.page.reason || "ended");
        }
        const settled = coop.page.phase === "ended" || (coop.page.phase === "running" && coop.page.confirmed >= coop.page.n - 1);
        if (!overTold && settled && coop.page.core && o.gameOver?.(coop.page.core)) {
            overTold = true;
            o.onGameOver?.();
        }
        if (!startedTold && coop.status === "started") {
            startedTold = true;
            o.onStarted?.();
        }
        if (coop.statusLine !== lastStatus) {
            lastStatus = coop.statusLine;
            o.onStatus?.(lastStatus);
        }
        const l = line();
        if (l !== lastLine) {
            lastLine = l;
            o.onLine?.(l);
        }
    }
    function line(): string {
        const core = coop.page.core;
        return partnerLine(coop, core ? o.partnerInfo?.(core, coop.page.seat) ?? null : null, name);
    }
    function stopLoop(): void { stopped = true; clockH?.stop(); if (handle !== null && o.cancelRaf)
        o.cancelRaf(handle); }
    function loop(t: number): void {
        if (stopped)
            return;
        frame(t);
        handle = o.raf!(loop);
    }
    function drawLoop(): void {
        if (stopped)
            return;
        paint();
        handle = o.raf!(drawLoop);
    }
    if (o.stepClock) {
        clockH = o.stepClock((now) => { if (!stopped)
            pump(now); });
        if (o.raf)
            handle = o.raf(drawLoop);
    }
    else if (o.raf)
        handle = o.raf(loop);
    return {
        coop,
        frame,
        pump,
        paint,
        get steps() { return steps; },
        line,
        pingText(): string | null {
            const p = coop.page;
            if (p.phase !== "running")
                return null;
            const t = p.roundTrips();
            return pingText(medianMs(t, t.length), o.path?.() ?? "direct");
        },
        leave(): void { coop.leave(); const l = line(); if (l !== lastLine) {
            lastLine = l;
            o.onLine?.(l);
        } if (!endedTold) {
            endedTold = true;
            o.onEnd?.(coop.reason || coop.page.reason || "ended");
        } },
        stop: stopLoop,
        get stopped() { return stopped; },
    };
}
export function seatHearsEffect(seat: 0 | 1, e: Effect): boolean {
    if (e.kind !== "sound" || typeof e.id !== "string")
        return false;
    return heardBy(JSON.parse(e.id) as {
        seat?: unknown;
    }, seat);
}
interface SeatSession {
    run?: {
        state: TickState;
        liveScreen(): ComposedScreen;
    } | null;
    seatPicture?(seat: 0 | 1): {
        display: 0 | 1;
        cram: readonly number[];
        indices: Uint8Array | null;
    } | null;
    readonly choosingSeat?: 0 | 1 | null;
    seatWaiting?(seat: 0 | 1): boolean;
}
export function realSeatScreen(core: NetCore, seat: 0 | 1): ComposedScreen | null {
    const session = (core as unknown as {
        state?: {
            session?: SeatSession;
        };
    }).state?.session;
    const run = session?.run;
    if (!run)
        return null;
    const own = session.seatPicture?.(seat) ?? null;
    if (own !== null) {
        const live = run.liveScreen();
        const n = live.width * live.height;
        return { width: live.width, height: live.height, indices: own.display === 1 && own.indices !== null ? own.indices : new Uint8Array(n), cram: [...own.cram] };
    }
    const shown: 0 | 1 = run.state.seats?.out[seat] === true && run.state.seats.out[seat === 0 ? 1 : 0] !== true ? (seat === 0 ? 1 : 0) : seat;
    return inSeat(run.state, shown, () => run.liveScreen());
}
export const realOwnPause: OwnPauseHooks = {
    flag(core: NetCore, seat: 0 | 1): boolean {
        const session = (core as unknown as {
            state?: {
                session?: OwnPauseSession;
            };
        }).state?.session;
        const seats = session?.run?.state.seats;
        if (seats === undefined || seats.out[seat] === true)
            return false;
        const f = pauseFlagsOf(seats, seat);
        return (seat === 1 && f.own) || f.partnerAlone;
    },
    open(core: NetCore, seat: 0 | 1): OwnPause | null {
        const session = (core as unknown as {
            state?: {
                session?: OwnPauseSession;
            };
        }).state?.session;
        const made = session?.seatPauseOpen(seat) ?? null;
        if (!session || made === null)
            return null;
        const live = session.run!.liveScreen();
        const fx = (evs: readonly unknown[]): Effect[] => evs.map((e, i) => ({ kind: "sound", id: JSON.stringify({ ...(e as object), seat }), source: `own${i}` }));
        return {
            opened: fx([{ type: "Audio.Pause" }]),
            pass(c: NetCore, pad: number): readonly Effect[] {
                const r = pauseFrame(made.screen, (c as {
                    screenByte?: (k: 0 | 1, pad: number) => number;
                }).screenByte?.(seat, pad) ?? pad & 0xff);
                const st = (c as unknown as {
                    state?: {
                        session?: OwnPauseSession;
                    };
                }).state?.session?.run?.state;
                const evs: unknown[] = [];
                if (st)
                    seatPauseRequests(st, made.driver, r.requests, (e) => evs.push(e));
                return fx(evs);
            },
            picture(): ComposedScreen {
                const rec = pauseFrameRecord(made.screen);
                return { width: live.width, height: live.height, indices: rec.indices, cram: [...rec.cram] };
            },
            close: () => (seat === 0 && session.run?.state.seats?.pause[0] === true ? [] : fx([{ type: "Audio.Resume" }])),
        };
    },
};
interface OwnPauseSession {
    run?: {
        state: TickState;
        liveScreen(): ComposedScreen;
    } | null;
    seatPauseOpen(seat: 0 | 1): {
        screen: PauseScreen;
        driver: SoundDriver;
    } | null;
}
export function realSeatWhere(core: NetCore, seat: 0 | 1): {
    episode: number;
    floor: number;
    cellX: number;
    cellY: number;
} | null {
    const st = (core as unknown as {
        state?: {
            session?: {
                run?: {
                    state: TickState;
                } | null;
            };
        };
    }).state?.session?.run?.state;
    if (!st)
        return null;
    const seats = st.seats;
    const mine = seats === undefined || seats.live === seat;
    const pos = mine ? st.world.player.pos : seats!.data.player.pos;
    const shift = st.env.R.CELL_SHIFT;
    return { episode: st.world.level.episode.value, floor: mine ? st.floorNumber : seats!.data.floorNumber, cellX: pos.x >> shift, cellY: pos.y >> shift };
}
function worldRuns(core: NetCore): boolean {
    const session = (core as unknown as {
        state?: {
            session?: {
                stage?: unknown;
                run?: {
                    state: TickState;
                } | null;
            };
        };
    }).state?.session;
    const seats = session?.run?.state.seats;
    return session?.stage === "play" && !(seats?.pause[0] === true || seats?.pause[1] === true);
}
export function realGameOver(core: NetCore): boolean {
    const session = (core as unknown as {
        state?: {
            session?: {
                stage?: unknown;
                exitStartup?: unknown;
            };
        };
    }).state?.session;
    return session?.stage === "ended" && session.exitStartup === true;
}
export function realPartnerInfo(core: NetCore, seat: 0 | 1): PartnerInfo | null {
    const session = (core as unknown as {
        state?: {
            session?: SeatSession;
        };
    }).state?.session;
    const st = session?.run?.state;
    const seats = st?.seats;
    if (!st || !seats)
        return null;
    const partner: 0 | 1 = seat === 0 ? 1 : 0;
    return { hp: (seat === 0 ? seats.data.player : st.world.player).hp, choosing: session?.choosingSeat === partner, ...(pauseFlagsOf(seats, seat).partnerAlone ? { paused: true } : {}), ...(session?.seatWaiting?.(seat) === true ? { waiting: true } : {}) };
}
export function paintScreen(ctx: {
    canvas: {
        width: number;
        height: number;
    };
    putImageData(d: unknown, x: number, y: number): void;
    createImageData(w: number, h: number): {
        data: Uint8ClampedArray;
    };
}, screen: ComposedScreen): void {
    if (ctx.canvas.width !== screen.width || ctx.canvas.height !== screen.height) {
        ctx.canvas.width = screen.width;
        ctx.canvas.height = screen.height;
    }
    const img = ctx.createImageData(screen.width, screen.height);
    composedToRgba(screen, img.data);
    ctx.putImageData(img, 0, 0);
}

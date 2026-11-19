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
export interface PartnerInfo {
    readonly hp: number | null;
    readonly choosing?: boolean;
}
export interface LiveHooks {
    readonly onDraw: NonNullable<CoopPageOptions["onDraw"]>;
    readonly onEffect: NonNullable<CoopPageOptions["onEffect"]>;
    readonly clock: () => number;
}
export interface CoopLiveOptions {
    readonly consts: AppConstants;
    readonly speed: {
        readonly mode: "original" | "custom";
        readonly custom_steps: number;
    };
    readonly now: () => number;
    readonly makePage: (hooks: LiveHooks) => CoopPage;
    readonly pad: () => number;
    readonly menuOpen: () => boolean;
    readonly draw?: (seat: 0 | 1, step: number, core: NetCore) => void;
    readonly drawScreen?: (picture: ScreenPicture) => void;
    readonly sound?: (seat: 0 | 1, e: Effect, step: number) => void;
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
    paint(): void;
    readonly steps: number;
    line(): string;
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
    return `Partner: ${who}${hp === null || hp === undefined ? "" : `, ${hp} hit points`} - ${coop.status === "waiting for the partner" ? "waiting for the partner" : "linked"}`;
}
export function startCoopLive(o: CoopLiveOptions): CoopLive {
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
    let pendingScreen = false;
    const name = o.characterName ?? ((i: number): string => `character ${i + 1}`);
    const hooks: LiveHooks = {
        clock: o.now,
        onDraw: (seat, step) => { if (deferDraw)
            pendingDraw = { seat, step };
        else if (coop.page.core && own === null)
            o.draw?.(seat, step, coop.page.core); },
        onEffect: (_key, e, step) => { o.sound?.(coop.page.seat, e, step); },
    };
    const coop = o.makePage(hooks);
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
    function frame(now: number = o.now()): void {
        if (stopped)
            return;
        if (due(now))
            runStep();
    }
    function pump(now: number = o.now()): void {
        while (!stopped && due(now))
            runStep();
    }
    function paint(): void {
        const d = pendingDraw;
        pendingDraw = null;
        if (own !== null)
            o.drawOwn?.(own.picture());
        else if (d !== null && coop.page.core)
            o.draw?.(d.seat, d.step, coop.page.core);
        if (pendingScreen) {
            pendingScreen = false;
            const pic = coop.screenPicture();
            if (pic)
                o.drawScreen?.(pic);
        }
    }
    let own: OwnPause | null = null;
    let ownAcc = 0;
    const playOwn = (es: readonly Effect[]): void => { for (const e of es)
        o.sound?.(coop.page.seat, e, coop.page.n); };
    function ownPauseStep(pad: number): void {
        const core = coop.page.core;
        const hooks = o.ownPause;
        if (!hooks || !core || (coop.page.phase !== "running" && coop.page.phase !== "ended"))
            return;
        const set = hooks.flag(core, coop.page.seat);
        if (own !== null && !set) {
            playOwn(own.close());
            own = null;
            pendingDraw = { seat: coop.page.seat, step: coop.page.n };
            if (!deferDraw && coop.page.core)
                o.draw?.(coop.page.seat, coop.page.n, coop.page.core);
            return;
        }
        if (own === null && set) {
            own = hooks.open(core, coop.page.seat);
            ownAcc = 0;
            if (own !== null) {
                playOwn(own.opened);
                if (!deferDraw)
                    o.drawOwn?.(own.picture());
            }
            return;
        }
        if (own === null)
            return;
        const sp = speedOf();
        const pace = stepPace(o.consts, sp.mode, sp.custom_steps);
        ownAcc += pace.num;
        const passes = Math.floor(ownAcc / pace.den);
        ownAcc -= passes * pace.den;
        for (let i = 0; i < passes; i++)
            playOwn(own.pass(core, pad));
        if (!deferDraw)
            o.drawOwn?.(own.picture());
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
    function runStep(): void {
        const pad = o.menuOpen() ? 0 : o.pad();
        try {
            coop.tick(pad);
        }
        catch (err) {
            stepFailed(err);
            return;
        }
        steps++;
        ownPauseStep(pad);
        if (deferDraw) {
            if (coop.page.phase !== "running" && coop.page.phase !== "ended")
                pendingScreen = true;
        }
        else {
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
        if (seat !== 1)
            return false;
        const session = (core as unknown as {
            state?: {
                session?: OwnPauseSession;
            };
        }).state?.session;
        const seats = session?.run?.state.seats;
        return seats !== undefined && seats.pause[1] === true && seats.out[1] !== true;
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
            close: () => fx([{ type: "Audio.Resume" }]),
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
    return { hp: (seat === 0 ? seats.data.player : st.world.player).hp, choosing: session?.choosingSeat === partner };
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

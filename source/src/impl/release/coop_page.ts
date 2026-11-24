import { RollbackPage, REASON_ROM, REASON_VERSION, roomCode } from "../net/rollback.js";
import type { HostScreen, NetEvent, StartOptions } from "../net/rollback.js";
import type { NetConstants } from "../net/constants.js";
import type { Effect, NetCore, StepPace } from "../net/core.js";
import type { Transport } from "../net/transport.js";
import type { EventSink } from "../../domain.js";
import type { Settings } from "./settings.js";
import { originalByteOfPad } from "../net/scheme.js";
import type { SeatScheme } from "../net/scheme.js";
export type CoopStartPoint = {
    readonly kind: "episode";
    readonly episode: number;
} | {
    readonly kind: "password";
    readonly code: string;
};
export interface CoopChoices {
    readonly start: CoopStartPoint;
    readonly characters?: readonly [
        number,
        number
    ];
}
export function sessionOptions(s: Settings, choices: CoopChoices): Record<string, unknown> {
    return {
        start: choices.start, ...(choices.characters ? { characters: [...choices.characters] } : {}),
        cheats: { ...s.cheats }, fix_990: s.game.fix_990, speed: { mode: s.speed.mode, custom_steps: s.speed.custom_steps },
    };
}
export function cheatsOn(options: Readonly<Record<string, unknown>> | undefined): boolean {
    const c = options?.["cheats"];
    return typeof c === "object" && c !== null && Object.values(c as Record<string, unknown>).some((v) => v !== false && v !== "off" && v !== null && v !== undefined);
}
export interface ScreenPicture {
    readonly width: number;
    readonly height: number;
    readonly rgba: Uint8ClampedArray;
}
export interface PreScreen<T> {
    tick(pad: number, events: EventSink): void;
    readonly result: T | null;
    picture(): ScreenPicture;
    where?(): Exclude<HostScreen, "starting">;
}
export interface CoopScreens {
    title(): PreScreen<CoopStartPoint>;
    select(point: CoopStartPoint): PreScreen<number>;
    briefing?(point: CoopStartPoint, title: PreScreen<CoopStartPoint> | null): PreScreen<true> | null;
}
export function sessionDelay(s: Settings, c: NetConstants): number {
    const d = s.net.delay ?? c.delayDefault;
    return Math.min(c.delayMax, Math.max(0, d));
}
export type CoopStatus = "connecting" | "joined" | "refused" | "waiting for the host" | "waiting for the partner" | "started" | "ended";
export function refusalWords(reason: string): string {
    if (reason === REASON_VERSION)
        return "another app version";
    if (reason === REASON_ROM)
        return "another ROM image";
    return reason;
}
export interface CoopPageOptions {
    readonly consts: NetConstants;
    readonly hello: {
        readonly version: string;
        readonly md5: string;
    };
    readonly clock: () => number;
    readonly transport: Transport;
    readonly seat: 0 | 1;
    readonly scheme?: SeatScheme;
    readonly makeCore: (start: StartOptions) => NetCore;
    readonly onDraw?: (seat: 0 | 1, step: number) => void;
    readonly onConfirmed?: (step: number, saved: string) => void;
    readonly onEffect?: (key: string, e: Effect, step: number) => void;
    readonly onAudio?: (step: number, list: readonly Effect[]) => void;
    readonly screens?: CoopScreens;
    readonly startWith?: () => {
        readonly settings: Settings;
        readonly seed: number;
    };
    readonly onScreenEvents?: (events: readonly unknown[]) => void;
    readonly screenPace?: (start: StartOptions | null) => StepPace;
}
export class CoopPage {
    readonly page: RollbackPage;
    status: CoopStatus = "connecting";
    reason = "";
    code = "";
    coreMade: ((core: NetCore) => void) | null = null;
    constructor(private readonly o: CoopPageOptions) {
        this.page = new RollbackPage({
            seat: o.seat, ...(o.scheme ? { scheme: o.scheme } : {}), ...(o.screens ? { selectCharacter: true } : {}), consts: o.consts, transport: o.transport, clock: o.clock, hello: o.hello,
            makeCore: (start) => { const c = o.makeCore(start); this.coreMade?.(c); return c; },
            onDraw: (step) => o.onDraw?.(o.seat, step),
            ...(o.onConfirmed ? { onConfirmed: o.onConfirmed } : {}),
            ...(o.onEffect ? { onEffect: o.onEffect } : {}),
            ...(o.onAudio ? { onAudio: o.onAudio } : {}),
            onEvent: (e) => this.onEvent(e),
        });
        if (o.seat === 0 && o.screens)
            this.page.setScreen("title");
    }
    static newCode(c: NetConstants, rand: () => number): string { return roomCode(c, rand); }
    private onEvent(e: NetEvent): void {
        if (e.type !== "Net.Session")
            return;
        if (e.state === "started")
            this.status = "started";
        else if (e.state === "waiting" && this.page.phase === "running")
            this.status = "waiting for the partner";
        else if (e.state === "ended") {
            const r = e.reason ?? "";
            this.status = this.page.joined || this.started ? "ended" : "refused";
            if (r === REASON_ROM || r === REASON_VERSION)
                this.status = "refused";
            this.reason = refusalWords(r);
        }
    }
    private started = false;
    private paceAcc = 0;
    get canStart(): boolean { return this.o.seat === 0 && this.page.joined && this.page.phase === "hello"; }
    private title: PreScreen<CoopStartPoint> | null = null;
    private select: PreScreen<number> | null = null;
    private briefing: PreScreen<true> | null | undefined = undefined;
    private shown: PreScreen<unknown> | null = null;
    private screenEvents: unknown[] = [];
    private readonly screenSink: EventSink = { emit: (e: unknown) => { this.screenEvents.push(e); } } as unknown as EventSink;
    screenPicture(): ScreenPicture | null { return this.page.phase === "running" || this.page.phase === "ended" ? null : this.shown?.picture() ?? null; }
    private screensTick(pad: number): void {
        const sc = this.o.screens;
        if (!sc)
            return;
        const p = this.page;
        if (this.o.seat === 0 && p.joined && p.phase === "hello") {
            this.title ??= sc.title();
            this.shown = this.title;
            this.title.tick(pad, this.screenSink);
            const point = this.title.result;
            this.page.setScreen(point !== null ? "starting" : this.title.where?.() ?? "title");
            if (point !== null) {
                const w = this.o.startWith?.() ?? null;
                if (w === null)
                    throw new Error("the host's page has no settings to start with");
                this.startSession(w.settings, { start: point }, w.seed);
            }
            return;
        }
        if (p.phase === "starting" && !p.chosen && p.start) {
            const point = p.start.options["start"] as CoopStartPoint;
            if (this.briefing === undefined)
                this.briefing = sc.briefing?.(point, this.title) ?? null;
            if (this.briefing !== null && this.select === null) {
                const b = this.briefing;
                this.shown = b;
                if (b.result === null) {
                    b.tick(pad, this.screenSink);
                    return;
                }
            }
            this.select ??= sc.select(point);
            this.shown = this.select;
            this.select.tick(pad, this.screenSink);
            if (this.select.result !== null)
                p.chooseCharacter(this.select.result);
        }
    }
    get hostScreen(): HostScreen | null { return this.page.peerScreen; }
    startSession(settings: Settings, choices: CoopChoices, seed: number): void {
        if (!this.canStart)
            throw new Error("Start: no guest has joined");
        this.page.host({ delay: sessionDelay(settings, this.o.consts), seed: seed >>> 0, options: sessionOptions(settings, choices) });
    }
    screensByFrame = false;
    private screenPad(pad: number): number { return this.o.scheme?.scheme === "modern" ? originalByteOfPad(pad) : pad & 0xff; }
    get preWorld(): boolean { return this.page.phase !== "running" && this.page.phase !== "ended"; }
    screenPass(pad: number): boolean {
        if (!this.preWorld)
            return true;
        const screen = this.shown;
        const was = screen?.result ?? null;
        this.screenEvents = [];
        this.screensTick(this.screenPad(pad));
        if (this.shown !== null)
            this.o.onScreenEvents?.(this.screenEvents);
        return (screen !== null && this.shown !== screen) || (this.shown !== null && this.shown.result !== was) || this.page.phase === "running";
    }
    tick(padIn: number | (() => number)): void {
        const before = this.page.phase === "running" || this.page.phase === "ended";
        const pad = before || typeof padIn === "number" ? padIn : this.screensByFrame ? 0 : padIn();
        try {
            if (!before && !this.screensByFrame && typeof pad === "number") {
                let passes = 1;
                const pace = this.o.screenPace?.(this.page.start);
                if (pace) {
                    this.paceAcc += pace.num;
                    passes = Math.floor(this.paceAcc / pace.den);
                    this.paceAcc -= passes * pace.den;
                }
                for (let i = 0; i < passes; i++)
                    if (this.screenPass(pad))
                        break;
            }
        }
        finally {
            this.afterScreens(before, pad);
        }
    }
    private afterScreens(before: boolean, pad: number | (() => number)): void {
        this.page.tick(before ? pad : 0);
        if (this.page.phase === "running")
            this.started = true;
        if (!this.started && this.status !== "refused" && this.status !== "ended")
            this.status = this.preStatus();
    }
    private preStatus(): CoopStatus {
        const p = this.page;
        if (!p.joined)
            return "connecting";
        if (this.o.screens && p.phase === "starting" && p.chosen)
            return "waiting for the partner";
        if (this.o.seat === 1 && p.phase === "hello")
            return "waiting for the host";
        return "joined";
    }
    leave(): void { this.page.leave(); }
    get statusLine(): string {
        const base = this.reason && (this.status === "refused" || this.status === "ended") ? `${this.status}: ${this.reason}` : this.status === "joined" ? "partner joined" : this.status;
        return this.o.seat === 1 && this.page.start !== null && cheatsOn(this.page.start.options) ? `${base} (the host plays with cheats)` : base;
    }
}

import type { NetConstants } from "./constants.js";
import type { Effect, NetCore } from "./core.js";
import { digestOf, runningStep, setRunningStep } from "./core.js";
import type { Transport } from "./transport.js";
import { ORIGINAL_SCHEME, schemeOf } from "./scheme.js";
import type { SeatScheme } from "./scheme.js";
export interface StartOptions {
    readonly delay: number;
    readonly seed: number;
    readonly options: Readonly<Record<string, unknown>>;
}
export interface Hello {
    readonly protocol: number;
    readonly version: string;
    readonly md5: string;
}
type Msg = {
    t: "hello";
    protocol: number;
    version: string;
    md5: string;
} | {
    t: "start";
    start: StartOptions;
} | {
    t: "ready";
    scheme?: SeatScheme;
    character?: number;
} | {
    t: "ping";
} | {
    t: "pong";
} | {
    t: "go";
    character?: number;
} | {
    t: "wait";
    screen?: HostScreen;
} | {
    t: "input";
    first: number;
    pads: number[];
    confirmed: number;
    n: number;
    lead: number;
    digests: [
        number,
        string
    ][];
    dack: number;
} | {
    t: "state";
    step: number;
    state: string;
} | {
    t: "echo";
    n: number;
} | {
    t: "echoBack";
    n: number;
} | {
    t: "bye";
    reason: string;
};
export type HostScreen = "title" | "options" | "password" | "starting";
export const HOST_SCREENS: readonly HostScreen[] = ["title", "options", "password", "starting"];
export type NetEvent = {
    readonly type: "Net.Session";
    readonly state: "connecting" | "started" | "waiting" | "ended";
    readonly reason?: string;
} | {
    readonly type: "Net.Desync";
    readonly step: number;
} | {
    readonly type: "Net.Rollback";
    readonly from: number;
    readonly to: number;
};
export interface PageOptions {
    readonly seat: 0 | 1;
    readonly consts: NetConstants;
    readonly transport: Transport;
    readonly clock: () => number;
    readonly hello: {
        readonly version: string;
        readonly md5: string;
        readonly protocol?: number;
    };
    readonly makeCore: (start: StartOptions) => NetCore;
    readonly scheme?: SeatScheme;
    readonly selectCharacter?: boolean;
    readonly onEffect?: (key: string, e: Effect, step: number) => void;
    readonly onAudio?: (step: number, list: readonly Effect[]) => void;
    readonly onDraw?: (step: number) => void;
    readonly onEvent?: (e: NetEvent) => void;
    readonly onConfirmed?: (step: number, saved: string) => void;
    readonly echo?: boolean;
}
export type Phase = "hello" | "starting" | "running" | "ended";
export const REASON_VERSION = "another version of the app";
export const REASON_ROM = "another ROM image";
export const REASON_PARTNER_ERROR = "the partner's page stopped on an error";
export const REASON_OWN_ERROR = "the session ended on an error of this page";
export function playedKeyId(e: Effect): string | number {
    if (e.kind !== "sound" || typeof e.id !== "string" || !e.id.includes('"place"'))
        return e.id;
    try {
        const o = JSON.parse(e.id) as Record<string, unknown>;
        delete o["place"];
        return JSON.stringify(o);
    }
    catch {
        return e.id;
    }
}
export function isEffectOrVoice(e: Effect): boolean {
    if (e.kind !== "sound")
        return false;
    if (typeof e.id === "string" && e.id.startsWith("{")) {
        try {
            const type = (JSON.parse(e.id) as {
                type?: unknown;
            }).type;
            return type === "Audio.PlaySfx" || type === "Audio.PlayVoice" || type === "Audio.Request";
        }
        catch {
            return true;
        }
    }
    return e.source !== "music";
}
export { runningStep } from "./core.js";
export class RollbackPage {
    readonly seat: 0 | 1;
    phase: Phase = "hello";
    reason: string | null = null;
    offlineFrom: number | null = null;
    lostSeat: 0 | 1 | null = null;
    get partnerLost(): boolean { return this.lostSeat !== null; }
    core: NetCore | null = null;
    start: StartOptions | null = null;
    schemes: readonly [
        SeatScheme,
        SeatScheme
    ] = [ORIGINAL_SCHEME, ORIGINAL_SCHEME];
    n = 0;
    confirmed = -1;
    readonly local = new Map<number, number>();
    readonly remote = new Map<number, number>();
    readonly used = new Map<number, number>();
    readonly ring = new Map<number, unknown>();
    private readonly runDigest = new Map<number, string>();
    private readonly runText = new Map<number, string>();
    delay = 0;
    acked = -1;
    private readonly played = new Map<number, Set<string>>();
    private readonly audio = new Map<number, readonly Effect[]>();
    private handed = -1;
    private startAudio: readonly Effect[] = [];
    droppedStaleAudio = 0;
    private readonly lags: number[] = [];
    linkLag(): number {
        return this.lags.length === 0 ? 0 : Math.min(...this.lags);
    }
    lateLimit(): number {
        return this.o.consts.lateEffectMax + this.linkLag();
    }
    private echoN = 0;
    private readonly echoSent = new Map<number, number>();
    private readonly trips: number[] = [];
    private nextEchoAt: number | null = null;
    roundTrips(): readonly number[] { return this.trips; }
    liveSteps = 0;
    readonly work = { saveMs: 0, restoreMs: 0, stepsMs: 0, digestMs: 0, digests: 0, saves: 0, restores: 0, predictedRuns: 0 };
    private readonly timer: () => number = typeof performance !== "undefined" ? () => performance.now() : () => Date.now();
    private saveState(): unknown {
        const t0 = this.timer();
        const s = this.core!.snap ? this.core!.snap() : this.core!.save();
        this.work.saveMs += this.timer() - t0;
        this.work.saves++;
        return s;
    }
    private loadState(state: unknown): void {
        const t0 = this.timer();
        if (typeof state === "string")
            this.core!.load(state);
        else
            this.core!.restore!(state);
        this.work.restoreMs += this.timer() - t0;
        this.work.restores++;
    }
    private textOf(s: unknown): string { return typeof s === "string" ? s : this.core!.snapText!(s); }
    private keepBefore(t: number): void {
        if (this.remote.has(t)) {
            this.ring.delete(t);
            return;
        }
        this.work.predictedRuns++;
        this.ring.set(t, this.saveState());
    }
    rollbacks = 0;
    rerunSteps = 0;
    skips = 0;
    stalls = 0;
    desyncs = 0;
    firstDesync: number | null = null;
    droppedLateEffects = 0;
    lastRollbackAt = -1;
    private newestRemote = -1;
    private rollbackPoint: number | null = null;
    private lastHeard: number;
    private lastTickAt: number | null = null;
    private stallSince: number | null = null;
    private waitingShown = false;
    private readonly leads: {
        readonly v: number;
        readonly at: number;
    }[] = [];
    private peerLead = 0;
    private lastSkipStep = Number.NEGATIVE_INFINITY;
    private readonly myDigests = new Map<number, string>();
    private readonly peerDigests = new Map<number, string>();
    private readonly compared = new Set<number>();
    private peerDack = Number.NEGATIVE_INFINITY;
    private dack: number;
    private sentHello = false;
    private readyFromGuest = false;
    private ownCharacter: number | null = null;
    private guestCharacter: number | null = null;
    private readySent = false;
    private pingAt: number | null = null;
    private roundTrip: number | null = null;
    private goAt: number | null = null;
    private helloOk = false;
    private lastWaitAt: number | null = null;
    private ownScreen: HostScreen | null = null;
    peerScreen: HostScreen | null = null;
    constructor(private readonly o: PageOptions) {
        this.seat = o.seat;
        this.lastHeard = o.clock();
        this.dack = -o.consts.digestEvery;
        this.emit({ type: "Net.Session", state: "connecting" });
        o.transport.onArrival = () => { try {
            this.between();
        }
        catch { } };
    }
    private held: string[] = [];
    between(): void {
        if (this.phase === "ended")
            return;
        const now = this.o.clock();
        for (const text of this.o.transport.receive()) {
            const m = JSON.parse(text) as Msg;
            if (m.t === "echo" || m.t === "echoBack") {
                this.handle(m);
            }
            else
                this.held.push(text);
        }
        if (this.phase === "running")
            this.sendEcho(now);
    }
    host(start: StartOptions): void {
        if (this.seat !== 0)
            throw new Error("only the host starts a session");
        if (start.delay < 0 || start.delay > this.o.consts.delayMax)
            throw new Error(`delay ${start.delay} outside 0 .. ${this.o.consts.delayMax}`);
        this.start = { ...start, options: { ...start.options, schemes: [this.o.scheme ?? ORIGINAL_SCHEME] } };
        if (this.helloOk && this.phase === "hello")
            this.sendStart();
    }
    get joined(): boolean { return this.helloOk; }
    private sendStart(): void {
        this.send("reliable", { t: "start", start: this.start! });
        this.phase = "starting";
        this.takeDelay(this.start!);
    }
    chooseCharacter(character: number): void {
        if (this.ownCharacter !== null || this.phase !== "starting")
            return;
        this.ownCharacter = character;
        if (this.seat === 1)
            this.sendReady();
    }
    get chosen(): boolean { return this.o.selectCharacter !== true || this.ownCharacter !== null; }
    private sendReady(): void {
        if (this.readySent)
            return;
        this.readySent = true;
        this.send("reliable", { t: "ready", scheme: this.o.scheme ?? ORIGINAL_SCHEME, ...(this.ownCharacter !== null ? { character: this.ownCharacter } : {}) });
    }
    private finalStart(host: number | null, guest: number | null): StartOptions {
        const s = this.start!;
        if (this.o.selectCharacter !== true)
            return s;
        return { ...s, options: { ...s.options, characters: [host ?? 0, guest ?? 0] } };
    }
    private emit(e: NetEvent): void { this.o.onEvent?.(e); }
    private send(channel: "reliable" | "unreliable", m: Msg): void { this.o.transport.send(channel, JSON.stringify(m)); }
    lastStoredAt: number | null = null;
    tick(pad: number | (() => number)): void {
        this.lastStoredAt = null;
        const now = this.o.clock();
        if (this.lastTickAt !== null && now - this.lastTickAt > this.o.consts.timeoutMs / 2)
            this.lastHeard = now;
        this.lastTickAt = now;
        if (!this.sentHello) {
            this.sentHello = true;
            const h = this.o.hello;
            this.send("reliable", { t: "hello", protocol: h.protocol ?? this.o.consts.protocol, version: h.version, md5: h.md5 });
        }
        const arrived = this.held.length > 0 ? [...this.held.splice(0), ...this.o.transport.receive()] : this.o.transport.receive();
        for (const text of arrived) {
            const m = JSON.parse(text) as Msg;
            if (m.t !== "echo" && m.t !== "echoBack")
                this.lastHeard = now;
            if (this.phase === "ended")
                continue;
            this.handle(m);
        }
        if (this.helloOk && (this.phase === "hello" || this.phase === "starting") && (this.lastWaitAt === null || now - this.lastWaitAt >= this.o.consts.waitEveryMs))
            this.sendWait(now);
        if (this.phase !== "ended" && now - this.lastHeard > this.o.consts.timeoutMs)
            this.end("no message from the partner", false);
        if (this.phase === "ended") {
            if (this.offlineFrom !== null)
                this.runOffline(padTaken(pad));
            return;
        }
        if (this.seat === 0 && this.phase === "starting" && this.readyFromGuest && this.chosen && this.pingAt === null) {
            this.pingAt = now;
            this.send("reliable", { t: "ping" });
        }
        if (this.seat === 0 && this.phase === "starting" && this.roundTrip !== null && this.goAt === null) {
            this.start = this.finalStart(this.ownCharacter, this.guestCharacter);
            this.prepare(this.start);
            this.send("reliable", { t: "go", ...(this.ownCharacter !== null ? { character: this.ownCharacter } : {}) });
            this.goAt = now + this.roundTrip / 2;
        }
        if (this.seat === 0 && this.phase === "starting" && this.goAt !== null && now >= this.goAt)
            this.begin();
        if (this.phase !== "running")
            return;
        this.sendEcho(now);
        this.wallStep(pad, now);
    }
    private sendWait(now: number): void {
        this.lastWaitAt = now;
        this.send("reliable", this.seat === 0 && this.ownScreen !== null ? { t: "wait", screen: this.ownScreen } : { t: "wait" });
    }
    setScreen(screen: HostScreen): void {
        if (this.seat !== 0 || screen === this.ownScreen)
            return;
        this.ownScreen = screen;
        if (this.helloOk && (this.phase === "hello" || this.phase === "starting"))
            this.sendWait(this.o.clock());
    }
    private handle(m: Msg): void {
        switch (m.t) {
            case "hello": {
                const mine = this.o.hello;
                const reason = m.protocol !== (mine.protocol ?? this.o.consts.protocol) || m.version !== mine.version ? REASON_VERSION : m.md5 !== mine.md5 ? REASON_ROM : null;
                if (reason) {
                    this.end(reason, true);
                    return;
                }
                this.helloOk = true;
                if (this.seat === 0 && this.start)
                    this.sendStart();
                return;
            }
            case "start":
                if (this.seat !== 1 || !this.helloOk)
                    return;
                if (this.start !== null)
                    return;
                this.start = m.start;
                this.takeDelay(m.start);
                this.schemes = [schemeOf((m.start.options["schemes"] as unknown[] | undefined)?.[0]), this.o.scheme ?? ORIGINAL_SCHEME];
                this.phase = "starting";
                if (this.chosen)
                    this.sendReady();
                return;
            case "ready":
                if (this.seat === 0 && !this.readyFromGuest) {
                    this.readyFromGuest = true;
                    this.guestCharacter = typeof m.character === "number" ? m.character : null;
                    this.schemes = [this.o.scheme ?? ORIGINAL_SCHEME, schemeOf(m.scheme)];
                }
                return;
            case "ping":
                if (this.seat === 1)
                    this.send("reliable", { t: "pong" });
                return;
            case "pong":
                if (this.seat === 0 && this.pingAt !== null && this.roundTrip === null)
                    this.roundTrip = this.o.clock() - this.pingAt;
                return;
            case "go":
                if (this.seat === 1 && this.phase === "starting" && this.readySent) {
                    this.start = this.finalStart(typeof m.character === "number" ? m.character : null, this.ownCharacter);
                    this.prepare(this.start);
                    this.begin();
                }
                return;
            case "wait":
                if (this.seat === 1 && typeof m.screen === "string" && (HOST_SCREENS as readonly string[]).includes(m.screen))
                    this.peerScreen = m.screen;
                return;
            case "input":
                this.takeInput(m);
                return;
            case "state":
                if (this.seat === 1 && this.phase === "running")
                    this.repair(m.step, m.state);
                return;
            case "echo":
                this.send("unreliable", { t: "echoBack", n: m.n });
                return;
            case "echoBack": {
                const at = this.echoSent.get(m.n);
                if (at === undefined)
                    return;
                this.echoSent.delete(m.n);
                this.trips.push(this.o.clock() - at);
                while (this.trips.length > this.o.consts.echoWindow)
                    this.trips.shift();
                return;
            }
            case "bye":
                this.end(m.reason || "the partner left", false);
                return;
        }
    }
    private prepare(start: StartOptions): void {
        this.core = this.o.makeCore(start);
        this.core.setSchemes?.(this.schemes);
        this.startAudio = this.core.startAudio?.() ?? [];
    }
    private takeDelay(start: StartOptions): void {
        this.delay = start.delay;
        for (let t = 0; t < this.delay; t++)
            this.local.set(t, 0);
    }
    private sendEcho(now: number): void {
        if (this.o.echo === false)
            return;
        if (this.nextEchoAt === null)
            this.nextEchoAt = now;
        if (now < this.nextEchoAt)
            return;
        const n = this.echoN++;
        this.echoSent.set(n, now);
        this.send("unreliable", { t: "echo", n });
        this.nextEchoAt = now + this.o.consts.echoEveryMs;
    }
    private begin(): void {
        this.phase = "running";
        this.emit({ type: "Net.Session", state: "started" });
    }
    private takeInput(m: Extract<Msg, {
        t: "input";
    }>): void {
        if (this.phase !== "running" && this.phase !== "starting")
            return;
        for (let i = 0; i < m.pads.length; i++) {
            const t = m.first + i;
            const p = m.pads[i]!;
            const held = this.remote.get(t);
            if (held !== undefined) {
                if (held !== p) {
                    this.end("protocol error: a different pad for a step already received", true);
                    return;
                }
                continue;
            }
            this.remote.set(t, p);
            if (t > this.newestRemote)
                this.newestRemote = t;
            const u = this.used.get(t);
            if (t < this.n && u !== undefined && u !== p)
                this.rollbackPoint = this.rollbackPoint === null ? t : Math.min(this.rollbackPoint, t);
        }
        if (m.confirmed > this.acked)
            this.acked = m.confirmed;
        this.leads.push({ v: this.n - m.n, at: this.o.clock() });
        if (this.leads.length > this.o.consts.syncWindow)
            this.leads.shift();
        this.peerLead = m.lead;
        for (const [s, d] of m.digests)
            if (!this.peerDigests.has(s))
                this.peerDigests.set(s, d);
        while (this.peerDigests.has(this.dack + this.o.consts.digestEvery))
            this.dack += this.o.consts.digestEvery;
        if (m.dack > this.peerDack)
            this.peerDack = m.dack;
        this.checkDigests();
    }
    remotePad(t: number): number {
        if (this.offlineFrom !== null && t > this.offlineFrom)
            return 0;
        const r = this.remote.get(t);
        if (r !== undefined)
            return r;
        for (let u = t - 1; u >= 0; u--) {
            const p = this.remote.get(u);
            if (p !== undefined)
                return p;
        }
        return 0;
    }
    private pads(t: number): [
        number,
        number
    ] {
        const l = this.local.get(t);
        if (l === undefined)
            throw new Error(`no local pad for step ${t}`);
        const r = this.remotePad(t);
        return this.seat === 0 ? [l, r] : [r, l];
    }
    private runStep(t: number, live: boolean, newest: number = this.n - 1): void {
        const [p0, p1] = this.pads(t);
        this.used.set(t, this.seat === 0 ? p1 : p0);
        const was = runningStep();
        setRunningStep(t);
        let effects: readonly Effect[];
        const t0 = this.timer();
        try {
            effects = this.core!.step(p0, p1);
        }
        finally {
            setRunningStep(was);
            this.work.stepsMs += this.timer() - t0;
        }
        if (live)
            this.liveSteps++;
        if (t % this.o.consts.digestEvery === 0 && this.offlineFrom === null) {
            const d0 = this.timer();
            this.runDigest.set(t, this.core!.digest ? this.core!.digest() : digestOf(this.core!.save()));
            this.work.digestMs += this.timer() - d0;
            this.work.digests++;
            if (this.o.onConfirmed)
                this.runText.set(t, this.core!.save());
        }
        else if (this.o.onConfirmed)
            this.runText.set(t, this.core!.save());
        let keys = this.played.get(t);
        if (!keys) {
            keys = new Set();
            this.played.set(t, keys);
        }
        const age = newest - t;
        const limit = this.lateLimit();
        const audioOn = this.o.onAudio !== undefined;
        if (audioOn)
            this.audio.set(t, effects.filter((e) => e.kind === "sound"));
        effects.forEach((e, order) => {
            if (audioOn && e.kind === "sound")
                return;
            const key = `${t}|${e.kind}|${playedKeyId(e)}|${e.source}|${order}`;
            if (keys!.has(key))
                return;
            if (!live && age > limit) {
                this.droppedLateEffects++;
                return;
            }
            keys!.add(key);
            this.o.onEffect?.(key, e, t);
        });
        if (live)
            this.o.onDraw?.(t);
    }
    private rerun(from: number, to: number): void {
        for (let t = from; t < to; t++) {
            if (t > from)
                this.keepBefore(t);
            this.runStep(t, false);
            this.rerunSteps++;
        }
    }
    private wallStep(pad: number | (() => number), now: number): void {
        const c = this.o.consts;
        if (this.rollbackPoint !== null) {
            const r = this.rollbackPoint;
            this.rollbackPoint = null;
            const saved = this.ring.get(r);
            if (saved === undefined)
                throw new Error(`rollback to ${r}: no state in the ring (confirmed ${this.confirmed}, n ${this.n})`);
            this.loadState(saved);
            this.rerun(r, this.n);
            this.rollbacks++;
            this.lastRollbackAt = this.n;
            this.emit({ type: "Net.Rollback", from: r, to: this.n - 1 });
        }
        const tooFar = this.n - (this.newestRemote + 1) >= c.maxPrediction;
        const skip = !tooFar && this.syncSkip();
        if (tooFar || skip) {
            if (tooFar) {
                this.stalls++;
                if (this.stallSince === null)
                    this.stallSince = now;
                if (!this.waitingShown && now - this.stallSince >= c.waitNoticeMs) {
                    this.waitingShown = true;
                    this.emit({ type: "Net.Session", state: "waiting" });
                }
            }
            else {
                this.skips++;
                this.lastSkipStep = this.n;
            }
        }
        else {
            if (this.waitingShown)
                this.emit({ type: "Net.Session", state: "started" });
            this.stallSince = null;
            this.waitingShown = false;
            if (!this.local.has(this.n + this.delay)) {
                this.local.set(this.n + this.delay, padTaken(pad));
                this.lastStoredAt = this.n + this.delay;
            }
            this.keepBefore(this.n);
            this.runStep(this.n, true);
            this.n++;
        }
        this.advanceConfirmed();
        this.sendInput();
    }
    private syncSkip(): boolean {
        const c = this.o.consts;
        const mine = this.averageLead();
        if (mine === null)
            return false;
        const lead = (mine - this.peerLead) / 2;
        return lead >= c.syncAhead && this.n - this.lastSkipStep >= c.syncSkipEvery;
    }
    private myLead(): number {
        return this.averageLead() ?? 0;
    }
    private averageLead(): number | null {
        const now = this.o.clock();
        const fresh = this.leads.filter((x) => now - x.at <= this.o.consts.syncWindowMs);
        return fresh.length === 0 ? null : fresh.reduce((a, x) => a + x.v, 0) / fresh.length;
    }
    private advanceConfirmed(): void {
        const c = this.o.consts;
        let s = this.confirmed;
        while (s + 1 < this.n && (this.remote.has(s + 1) || (this.offlineFrom !== null && s + 1 > this.offlineFrom)))
            s++;
        for (let t = this.confirmed + 1; t <= s; t++) {
            const needDigest = t % c.digestEvery === 0 && this.offlineFrom === null;
            if (!needDigest && !this.o.onConfirmed)
                continue;
            if (this.o.onConfirmed)
                this.o.onConfirmed(t, this.runText.get(t) ?? this.core!.save());
            if (needDigest)
                this.myDigests.set(t, this.runDigest.get(t) ?? (this.core!.digest ? this.core!.digest() : digestOf(this.core!.save())));
        }
        if (s > this.confirmed) {
            const limit = this.lateLimit();
            if (this.o.onAudio)
                for (let t = Math.max(this.confirmed, this.handed) + 1; t <= s; t++)
                    this.handOver(t, limit);
            for (let t = this.confirmed + 1; t <= s; t++) {
                this.lags.push(this.n - 1 - t);
                if (this.lags.length > c.lagWindow)
                    this.lags.shift();
            }
            this.confirmed = s;
            for (const k of [...this.audio.keys()])
                if (k <= s)
                    this.audio.delete(k);
            for (const k of [...this.ring.keys()])
                if (k <= s)
                    this.ring.delete(k);
            for (const k of [...this.runDigest.keys()])
                if (k <= s)
                    this.runDigest.delete(k);
            for (const k of [...this.runText.keys()])
                if (k <= s)
                    this.runText.delete(k);
            for (const k of [...this.played.keys()])
                if (k < s - c.maxPrediction)
                    this.played.delete(k);
            for (const k of [...this.local.keys()])
                if (k < s - c.redundancy * 2)
                    this.local.delete(k);
            for (const k of [...this.used.keys()])
                if (k <= s)
                    this.used.delete(k);
            this.checkDigests();
        }
    }
    private handOver(t: number, limit: number): void {
        this.handed = t;
        let list: readonly Effect[] = this.audio.get(t) ?? [];
        if (t === 0 && this.startAudio.length > 0)
            list = [...this.startAudio, ...list];
        if (this.n - 1 - t > limit) {
            const kept = list.filter((e) => !isEffectOrVoice(e));
            this.droppedStaleAudio += list.length - kept.length;
            list = kept;
        }
        this.o.onAudio!(t, list);
    }
    private checkDigests(): void {
        for (const [s, d] of this.myDigests) {
            if (this.compared.has(s))
                continue;
            const p = this.peerDigests.get(s);
            if (p === undefined)
                continue;
            this.compared.add(s);
            if (p === d)
                continue;
            this.desyncs++;
            if (this.firstDesync === null)
                this.firstDesync = s;
            this.emit({ type: "Net.Desync", step: s });
            if (this.seat === 0) {
                const at = this.confirmed + 1;
                const state = at < this.n && this.ring.has(at) ? this.textOf(this.ring.get(at)) : this.core!.save();
                this.send("reliable", { t: "state", step: at, state });
            }
        }
    }
    private repair(s: number, state: string): void {
        const was = this.n;
        const newest = was - 1;
        this.loadState(state);
        this.ring.clear();
        this.ring.set(s, state);
        this.confirmed = s - 1;
        this.n = s;
        this.rollbackPoint = null;
        for (const k of [...this.myDigests.keys()])
            if (k >= s) {
                this.myDigests.delete(k);
                this.compared.delete(k);
            }
        for (const k of [...this.compared])
            if (k >= s)
                this.compared.delete(k);
        for (let t = s; t < was && this.local.has(t); t++) {
            if (t > s)
                this.keepBefore(t);
            this.runStep(t, false, newest);
            this.n = t + 1;
        }
    }
    private sendInput(): void {
        const c = this.o.consts;
        let newest = this.n + this.delay - 1;
        while (this.local.has(newest + 1))
            newest++;
        const first = Math.max(this.acked + 1, 0);
        const last = Math.min(newest, first + c.redundancy - 1);
        const pads: number[] = [];
        for (let t = first; t <= last; t++)
            pads.push(this.local.get(t)!);
        const digests: [
            number,
            string
        ][] = [];
        for (const [s, d] of this.myDigests)
            if (s > this.peerDack)
                digests.push([s, d]);
        this.send("unreliable", { t: "input", first, pads, confirmed: this.confirmed, n: this.n, lead: this.myLead(), digests, dack: this.dack });
    }
    end(reason: string, tellPeer: boolean): void {
        if (this.phase === "ended")
            return;
        if (tellPeer)
            this.send("reliable", { t: "bye", reason });
        const wasRunning = this.phase === "running" || (this.phase === "starting" && this.core !== null);
        this.phase = "ended";
        this.reason = reason;
        if (wasRunning && this.core) {
            const at = this.confirmed + 1;
            if (at < this.n) {
                this.loadState(this.ring.get(at)!);
                this.n = at;
            }
            this.ring.clear();
            this.offlineFrom = this.confirmed;
            this.lostSeat = this.seat === 0 ? 1 : 0;
            this.core.seatLost?.(this.lostSeat);
        }
        this.emit({ type: "Net.Session", state: "ended", reason });
    }
    leave(): void { this.end("the partner left", true); }
    failStep(text: string): void {
        if (this.phase === "ended")
            return;
        this.send("reliable", { t: "bye", reason: REASON_PARTNER_ERROR });
        this.phase = "ended";
        this.reason = `${REASON_OWN_ERROR}: ${text}`;
        this.emit({ type: "Net.Session", state: "ended", reason: this.reason });
    }
    private runOffline(pad: number): void {
        if (!this.local.has(this.n + this.delay)) {
            this.local.set(this.n + this.delay, pad);
            this.lastStoredAt = this.n + this.delay;
        }
        this.runStep(this.n, true);
        this.n++;
        this.advanceConfirmed();
    }
}
function padTaken(pad: number | (() => number)): number { return typeof pad === "function" ? pad() : pad; }
export function roomCode(c: NetConstants, rand: () => number): string {
    let s = "";
    for (let i = 0; i < c.roomCodeLen; i++)
        s += c.roomCodeAlphabet[Math.floor(rand() * c.roomCodeAlphabet.length)]!;
    return s;
}

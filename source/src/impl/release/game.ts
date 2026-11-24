/// <reference lib="dom" />
import { cheatRulesOf } from "./cheats_page.js";
import { PageBundles } from "./bundles_page.js";
import { pagePack } from "./page_pack.js";
import { drawnRenderer, fitScale, hdDrawSettings } from "./settings.js";
import { hasWebgl2 } from "./webgl2_check.js";
import { paceStepMs, stepLengthMs } from "../rend/hd/blend.js";
import type { Settings } from "./settings.js";
import { BLANKS_PER_SECOND, SpeedScheduler } from "./scheduler.js";
import type { AppConstants } from "./constants.js";
import type { AssetStore } from "./store.js";
import type { AppHost } from "../boot/app/host.js";
import type { ModernDescriptor } from "../modern/seat.js";
import type { NetCore } from "../net/core.js";
import type { CoopStartPoint, HostMoment } from "../boot/app/host.js";
import type { CoopScreens } from "./coop_page.js";
import type { SeatRules } from "../tick/seats.js";
export type BundleSource = (path: string) => Promise<string | undefined>;
export interface GameOptions {
    container: HTMLElement;
    consts: AppConstants;
    store: AssetStore;
    md5: string;
    version: string;
    getSettings: () => Settings;
    pad: () => number;
    modern?: () => ModernDescriptor | null;
    modernTurn?: (newestSessionStep: number | null, onePlayerPlays: boolean) => number | null;
    webgl2?: boolean;
    bundleSource?: BundleSource;
    loadCore?: () => Promise<unknown>;
    stallWarnMs?: number;
    stallFailMs?: number;
}
export const STALL_WARN_MS = 15000;
export const STALL_FAIL_MS = 180000;
const AUDIO_ROUTE = "/audio/";
const AUDIO_TYPES: Readonly<Record<string, string>> = { json: "application/json", wav: "audio/wav", ogg: "audio/ogg" };
const DEBUG_IDS: readonly [
    string,
    string
][] = [
    ["status", "div"], ["log", "div"], ["note", "div"], ["banner", "div"], ["palette", "div"], ["sound", "div"],
    ["play", "button"], ["step", "button"], ["restart", "button"], ["skip", "button"], ["skipintro", "button"],
];
export class GameHost {
    private readonly o: GameOptions;
    private readonly host: AppHost = {};
    private canvas: HTMLCanvasElement | null = null;
    private style: HTMLStyleElement | null = null;
    private stage: HTMLElement | null = null;
    private started = false;
    private scheduler: SpeedScheduler | null = null;
    private paused = false;
    private origFetch: typeof fetch | null = null;
    private bundles: PageBundles | null = null;
    private statusBox: HTMLElement | null = null;
    private step = "";
    private stepAt = 0;
    private lastText = "";
    private statusTimer: ReturnType<typeof setInterval> | null = null;
    private coreError = "";
    constructor(o: GameOptions) {
        this.o = o;
    }
    get running(): boolean { return this.started; }
    get isPaused(): boolean { return this.paused; }
    get canvasElement(): HTMLCanvasElement | null { return this.canvas; }
    async start(): Promise<void> {
        if (this.started)
            return;
        this.started = true;
        const o = this.o;
        this.buildDom();
        this.setStep("starting the game");
        this.statusTimer = setInterval(() => this.paintStatus(), 500);
        try {
            await this.startCore(o);
        }
        catch (err) {
            this.showStatus(`The game could not start: ${err instanceof Error ? err.message : String(err)}`, true);
            throw err;
        }
        finally {
            if (this.statusTimer)
                clearInterval(this.statusTimer);
            this.statusTimer = null;
        }
        this.showStatus("", false);
        const watch = setInterval(() => {
            const err = this.readCoreError();
            if (err) {
                this.showStatus(err, true);
                clearInterval(watch);
            }
        }, 1000);
    }
    private setStep(text: string): void {
        if (text === this.step)
            return;
        this.step = text;
        this.stepAt = Date.now();
        this.paintStatus();
    }
    private paintStatus(): void {
        const idle = Date.now() - this.stepAt;
        if (idle >= (this.o.stallWarnMs ?? STALL_WARN_MS))
            this.showStatus(`Still waiting (${Math.floor(idle / 1000)} s without progress): ${this.step}`, true);
        else
            this.showStatus(`Starting: ${this.step}`, false);
    }
    private showStatus(text: string, warn: boolean): void {
        this.lastText = text;
        const b = this.statusBox;
        if (!b)
            return;
        b.textContent = text;
        b.hidden = text === "";
        b.style.color = warn ? "#f96" : "#ccc";
    }
    async coopReady(): Promise<boolean> {
        await this.start();
        const api = await this.waitForApi();
        api?.pause();
        return api !== undefined;
    }
    coopCore(point: CoopStartPoint, seed: number, offsetX: number, characters: readonly [
        number,
        number
    ], rules?: SeatRules): NetCore | null {
        return this.host.api?.coopCore(point, seed, offsetX, characters, rules) ?? null;
    }
    coopHd(core: unknown, seat: 0 | 1, screen: {
        readonly cram: readonly number[];
        readonly indices?: Uint8Array;
    }): void { this.host.api?.coopHd?.(core, seat, screen); }
    coopHdHide(): void { this.host.api?.coopHdHide?.(); }
    coopSounds(json: readonly string[]): void { this.host.api?.coopSounds(json); }
    coopGameBlanks(n: number): void { (this.host.api?.engine as {
        gameBlanks?(n: number): void;
    } | undefined)?.gameBlanks?.(n); }
    coopAudio(session: {
        readonly seat: 0 | 1;
        readonly voices: number;
    } | null): void { this.host.api?.coopAudio(session); }
    coopScreens(prefill: () => string | null): CoopScreens | null { return this.host.api?.coopScreens(prefill) ?? null; }
    coopScreenEvents(events: readonly unknown[]): void { this.host.api?.coopScreenEvents(events); }
    keptPassword: string | null = null;
    private webgl2Known: boolean | null = null;
    private hasWebgl2(): boolean {
        this.webgl2Known ??= this.o.webgl2 ?? hasWebgl2(() => document.createElement("canvas"));
        return this.webgl2Known;
    }
    get statusText(): string { return this.lastText; }
    private async startCore(o: GameOptions, skipIntro = o.getSettings().game.intro === "skip"): Promise<void> {
        this.host.pad = () => o.pad();
        this.host.modern = () => o.modern?.() ?? null;
        this.host.intro = () => o.getSettings().game.intro;
        this.host.cheats = () => cheatRulesOf(o.getSettings());
        this.host.hd = () => { const s = o.getSettings(); return { renderer: drawnRenderer(s, this.hasWebgl2()), ...hdDrawSettings(s) }; };
        this.host.modernTurn = (k, plays) => o.modernTurn?.(k, plays) ?? null;
        this.host.stepMs = (paced: boolean) => {
            const sch = paced ? this.scheduler : null;
            return stepLengthMs({ mode: sch ? "custom" : "original", originalBlanks: o.consts.speed.originalBlanks, customSteps: sch ? sch.customSteps : 1, blanksPerSecond: BLANKS_PER_SECOND });
        };
        this.host.paceMs = (pace) => paceStepMs(pace, BLANKS_PER_SECOND);
        (globalThis as {
            __ztHost?: AppHost;
        }).__ztHost = this.host;
        this.installFetch();
        this.applySettings();
        window.addEventListener("resize", () => this.layout());
        this.setStep("loading the game core");
        await (o.loadCore ? o.loadCore() : import("../boot/app/page_core.js"));
        const api = await this.waitForApi();
        if (!api)
            throw new Error("the game core did not come up");
        this.applySettings();
        if (skipIntro)
            api?.skipToTitle();
    }
    async startFromPassword(code: string): Promise<boolean> {
        if (!this.started) {
            this.started = true;
            this.buildDom();
            this.setStep("starting the game");
            this.statusTimer = setInterval(() => this.paintStatus(), 500);
            try {
                await this.startCore(this.o, false);
            }
            finally {
                if (this.statusTimer)
                    clearInterval(this.statusTimer);
                this.statusTimer = null;
            }
            this.showStatus("", false);
        }
        const api = await this.waitForApi();
        const ok = api ? api.powerOnWithPassword(code, this.o.getSettings().game.intro === "skip") : false;
        if (ok)
            this.keptPassword = code;
        return ok;
    }
    passwordNow(): {
        readonly code: string;
        readonly episode: number;
        readonly floor: number;
    } | null {
        return this.started ? this.host.api?.passwordNow() ?? null : null;
    }
    momentNow(): HostMoment | null {
        return this.started ? this.host.api?.momentNow?.() ?? null : null;
    }
    private async waitForApi(): Promise<AppHost["api"]> {
        while (!this.host.api) {
            const err = this.readCoreError();
            if (err)
                throw new Error(err);
            const idle = Date.now() - this.stepAt;
            if (idle >= (this.o.stallFailMs ?? STALL_FAIL_MS))
                throw new Error(`no progress for ${Math.floor(idle / 1000)} s: ${this.step}`);
            await new Promise((r) => setTimeout(r, 50));
        }
        return this.host.api;
    }
    private readCoreError(): string {
        const e = document.getElementById("status");
        if (e && e.className === "error" && e.textContent)
            this.coreError = e.textContent;
        return this.coreError;
    }
    private buildDom(): void {
        const c = this.o.container;
        const stage = document.createElement("div");
        stage.className = "zt-stage";
        stage.style.cssText = "position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000;overflow:hidden";
        const canvas = document.createElement("canvas");
        canvas.id = "screen";
        canvas.width = 320;
        canvas.height = 224;
        canvas.style.cssText = "display:block;background:#000";
        stage.appendChild(canvas);
        const holder = document.createElement("div");
        holder.hidden = true;
        const status = document.createElement("div");
        status.style.cssText = "position:absolute;left:0;right:0;bottom:0;padding:6px 12px;background:rgba(0,0,0,.8);font:14px sans-serif;z-index:1";
        status.hidden = true;
        stage.appendChild(status);
        this.statusBox = status;
        for (const [id, tag] of DEBUG_IDS) {
            const e = document.createElement(tag);
            e.id = id;
            holder.appendChild(e);
        }
        stage.appendChild(holder);
        c.appendChild(stage);
        this.style = document.createElement("style");
        document.head.appendChild(this.style);
        this.canvas = canvas;
        this.stage = stage;
        this.layout();
    }
    private installFetch(): void {
        if (this.origFetch)
            return;
        const orig = window.fetch.bind(window);
        this.origFetch = orig;
        const o = this.o;
        const bundleSource: BundleSource = o.bundleSource ?? ((p) => this.pageBundles().source(p));
        window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            let path = raw;
            try {
                path = new URL(raw, window.location.href).pathname;
            }
            catch { }
            if (path.startsWith(AUDIO_ROUTE)) {
                const rel = path.slice(1);
                const bytes = await o.store.get(o.md5, o.version, rel);
                if (bytes) {
                    const type = AUDIO_TYPES[rel.slice(rel.lastIndexOf(".") + 1)] ?? "application/octet-stream";
                    return new Response(bytes.slice().buffer as ArrayBuffer, { status: 200, headers: { "Content-Type": type } });
                }
            }
            else if (/^\/[a-z_]+_bundle\.json$|^\/bundle\.json$/.test(path)) {
                this.setStep(`building ${path}`);
                const text = await bundleSource(path);
                if (text !== undefined)
                    return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
            }
            return orig(input, init);
        };
    }
    private pageBundles(): PageBundles {
        this.bundles ??= new PageBundles(this.o.store, this.o.md5, this.o.version, () => pagePack(), (t) => this.setStep(t));
        return this.bundles;
    }
    applySettings(): void {
        const s = this.o.getSettings();
        if (s.speed.mode === "custom") {
            if (!this.scheduler || this.scheduler.currentMode !== "custom" || this.scheduler.customSteps !== s.speed.custom_steps) {
                this.scheduler = new SpeedScheduler(this.o.consts, "custom", s.speed.custom_steps);
            }
            this.host.pace = this.scheduler;
        }
        else {
            this.scheduler = null;
            this.host.pace = null;
        }
        this.host.api?.engine.setLevel(s.audio.mute ? 0 : s.audio.volume / 100);
        (this.host.api?.engine as {
            setVoiceLimit?(m: string, x: number): void;
        } | undefined)?.setVoiceLimit?.(s.audio.voice_mode, s.audio.voice_interval);
        this.layout();
    }
    layout(): void {
        if (!this.canvas || !this.stage || !this.style)
            return;
        const s = this.o.getSettings().video;
        const w = this.stage.clientWidth || window.innerWidth;
        const h = this.stage.clientHeight || window.innerHeight;
        const { sx, sy } = fitScale(w, h, s.keep_aspect, s.scale);
        const cw = Math.floor(320 * sx);
        const ch = Math.floor(224 * sy);
        this.style.textContent = `#screen{width:${cw}px !important;height:${ch}px !important;image-rendering:${s.filter === "nearest" ? "pixelated" : "auto"} !important}`;
    }
    maxIntegerScale(): number {
        const w = this.stage?.clientWidth || window.innerWidth;
        const h = this.stage?.clientHeight || window.innerHeight;
        return Math.max(1, Math.floor(Math.min(w / 320, h / 224)));
    }
    saveState(): {
        readonly state: string;
        readonly episode: number;
        readonly floor: number;
    } | null {
        return this.started ? this.host.api?.saveState() ?? null : null;
    }
    async loadState(state: string): Promise<boolean> {
        await this.start();
        const api = await this.waitForApi();
        return api ? api.loadState(state) : false;
    }
    pause(): void {
        if (!this.started || this.paused)
            return;
        this.paused = true;
        this.host.api?.pause();
    }
    resume(): void {
        if (!this.started || !this.paused)
            return;
        this.paused = false;
        this.host.api?.resume();
    }
    show(visible: boolean): void {
        if (this.stage)
            this.stage.hidden = !visible;
        if (visible)
            this.layout();
    }
}

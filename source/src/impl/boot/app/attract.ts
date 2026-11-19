/// <reference lib="dom" />
import { DEFAULT_VBLANKS, DemoRun, PAD_START, demoLevelStartInput } from "./demo_run.js";
import type { DemoRunDeps } from "./demo_run.js";
import { composedToRgba } from "../../rend/app/screen_compose.js";
import type { TickState } from "../../tick/core.js";
import type { SoundEvent } from "../../tick/sound.js";
import type { AttractKit, DemoPace } from "./tick_kit.js";
import { hex8 } from "./tick_kit.js";
export * from "./tick_kit.js";
export const DEMO_ITERATIONS = 200;
export const TEARDOWN_TICKS = 44;
export const FADE_IN_TICKS = 33;
export const FIRST_ITERATION_TICKS = 43;
export { DEFAULT_VBLANKS, PAD_START };
const PAGE_BLACK = [0, 0, 0] as const;
export type DemoEnd = "countdown" | "start" | "error";
type Stage = "fade_in" | "hold" | "play" | "teardown";
export interface DemoTickResult {
    readonly changed: boolean;
    readonly end: DemoEnd | null;
}
export class DemoSession {
    readonly episode: number;
    readonly character: number;
    readonly run: DemoRun;
    readonly pace: DemoPace | null;
    stage: Stage = "fade_in";
    notes = 0;
    lastError = "";
    endKind: DemoEnd | null = null;
    private wait = FADE_IN_TICKS;
    get pendingWait(): number {
        return this.stage === "play" ? this.wait : 0;
    }
    onSound: ((events: readonly SoundEvent[], when: "start" | "iteration") => void) | null = null;
    startSounds(): readonly SoundEvent[] {
        return this.run.startEvents;
    }
    constructor(private readonly tickKit: AttractKit, episode: number, character: number, frame: number, pace?: DemoPace) {
        this.episode = episode;
        this.character = character;
        this.pace = pace ?? null;
        const env = tickKit.envs[episode];
        if (env === undefined)
            throw new Error(`no environment for episode ${episode}`);
        const demo = env.start.demos[episode];
        if (demo === undefined)
            throw new Error(`demo_inputs.json has no demo of episode ${episode}`);
        const input = demoLevelStartInput(episode, character, frame, demo.seed);
        const deps: DemoRunDeps = { env, HC: tickKit.HC, hudAssets: tickKit.hudAssets, HAND: tickKit.HAND, handAssets: tickKit.handAssets };
        this.run = new DemoRun(deps, input, pace ? pace.vblanks : episode === 0 ? tickKit.vblanks : [], pace ? pace.guards : []);
    }
    get state(): TickState {
        return this.run.state;
    }
    get k(): number {
        return this.run.k;
    }
    get nextByte(): number {
        return this.tickKit.envs[this.episode]!.start.demos[this.episode]!.inputs[this.k] ?? 0;
    }
    tick(realPad: number): DemoTickResult {
        switch (this.stage) {
            case "fade_in":
                if (--this.wait <= 0) {
                    this.stage = "hold";
                    this.wait = FIRST_ITERATION_TICKS;
                    return { changed: true, end: null };
                }
                return { changed: false, end: null };
            case "hold":
                if (--this.wait <= 0) {
                    this.stage = "play";
                    this.wait = 0;
                    return this.play(realPad);
                }
                return { changed: false, end: null };
            case "play":
                if (--this.wait > 0)
                    return { changed: false, end: null };
                return this.play(realPad);
            case "teardown":
                if (--this.wait <= 0)
                    return { changed: false, end: this.endKind ?? "countdown" };
                return { changed: false, end: null };
        }
    }
    private play(realPad: number): DemoTickResult {
        const vblanks = this.run.vblanksOf(this.run.k);
        try {
            const res = this.run.step(realPad);
            this.notes += res.notes.length;
            if (this.onSound !== null)
                this.onSound(res.events, "iteration");
            this.wait = vblanks;
            if (res.ended) {
                this.stage = "teardown";
                this.wait = TEARDOWN_TICKS;
                this.endKind = (realPad & PAD_START) !== 0 ? "start" : "countdown";
            }
        }
        catch (err) {
            this.lastError = err instanceof Error ? err.message : String(err);
            this.stage = "teardown";
            this.wait = TEARDOWN_TICKS;
            this.endKind = "error";
        }
        return { changed: true, end: null };
    }
    paceText(): string {
        if (this.pace !== null)
            return `pace: ${this.pace.name} (the console's blanks per iteration)`;
        return this.episode === 0 ? `pace: attract_e0's blanks / ${DEFAULT_VBLANKS} per iteration` : `pace: ${DEFAULT_VBLANKS} blanks per iteration`;
    }
    statusText(): string {
        const w = this.state.world;
        const p = w.player;
        const c = this.state.hidden.controller;
        const mode = c.mode;
        const countdown = c.countdown;
        const stage = this.stage === "fade_in" ? "level start (fade-in)" : this.stage === "hold" ? "level start (first picture)" : this.stage === "play" ? "playing" : "end (fade-out / teardown)";
        return (`demo: episode ${this.episode}, character ${this.character} - ${stage} - iteration ${this.k}/${DEMO_ITERATIONS} - ` +
            `controller mode ${mode} countdown ${countdown} tape_offset ${c.tapeOffset} - pad byte ${this.nextByte} (0x${this.nextByte.toString(16).padStart(2, "0")}) - ` +
            `player (${p.pos.x}, ${p.pos.y}) angle ${p.angle} hp ${p.hp} - notes ${this.notes}` +
            ` - ${this.paceText()}` +
            (this.run.notes.length > 0 ? ` - not drawn / approximated: ${this.run.notes.join("; ")}` : "") +
            (this.lastError !== "" ? ` - ERROR: ${this.lastError}` : ""));
    }
}
export class DemoScreen {
    private readonly ctx: CanvasRenderingContext2D;
    private readonly image: ImageData;
    constructor(private readonly canvas: HTMLCanvasElement, private readonly tickKit: AttractKit, scale: number) {
        const ctx = canvas.getContext("2d");
        if (!ctx)
            throw new Error("no 2d canvas context");
        this.ctx = ctx;
        canvas.width = tickKit.screenW;
        canvas.height = tickKit.screenH;
        canvas.style.width = `${tickKit.screenW * scale}px`;
        canvas.style.height = `${tickKit.screenH * scale}px`;
        this.image = ctx.createImageData(tickKit.screenW, tickKit.screenH);
    }
    draw(session: DemoSession): void {
        const px = this.image.data;
        if (session.stage === "fade_in") {
            for (let i = 0; i < px.length; i += 4) {
                px[i] = PAGE_BLACK[0];
                px[i + 1] = PAGE_BLACK[1];
                px[i + 2] = PAGE_BLACK[2];
                px[i + 3] = 255;
            }
        }
        else {
            composedToRgba(session.run.liveScreen(), px, PAGE_BLACK);
        }
        this.ctx.putImageData(this.image, 0, 0);
    }
}

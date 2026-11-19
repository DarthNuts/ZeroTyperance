/// <reference lib="dom" />
import { LcgRng } from "../../../rng.js";
import { attractCharacter, attractPick } from "../../start/attract.js";
import { DemoScreen, DemoSession, hex8 } from "./attract.js";
import type { DemoPace } from "./attract.js";
import type { AudioRequest } from "./audio.js";
import type { CoreControl, DebugPart } from "./debug_hooks.js";
export interface AttractCycle {
    readonly hasPick: boolean;
    readonly demoOn: boolean;
    titleExit(to: string, briefing: boolean): void;
    clearPick(): void;
    startDemo(): void;
    beginDemo(episode: number, character: number, pace: DemoPace | undefined): boolean;
    presentDemo(): void;
    demoTick(): void;
    demoLevelWait(): number | null;
    demoStatus(state: string): string | null;
    clear(): void;
    dropAll(): void;
}
export function attractCycle(c: CoreControl): AttractCycle {
    const tickKit = c.tickKit;
    let pendingEpisode: number | null = null;
    let demo: DemoSession | null = null;
    let demoScreen: DemoScreen | null = null;
    function wireDemoSound(session: DemoSession): void {
        session.onSound = (events) => c.playSounds(events, `demo iteration ${session.k - 1}`);
        c.playSounds(session.startSounds(), "demo level start");
    }
    function startDemo(): void {
        const k = tickKit!;
        const rng = c.rng!;
        const episode = pendingEpisode!;
        pendingEpisode = null;
        const before = rng.state;
        const character = attractCharacter(rng);
        c.logLine(`-- attract character: seed ${hex8(before)} -> ${hex8(rng.state)}, character ${character} --`);
        try {
            demo = new DemoSession(k, episode, character, c.blankCounter);
            demoScreen = demoScreen ?? new DemoScreen(c.canvas, k, c.scale);
        }
        catch (err) {
            c.logLine(`-- the demo's level start failed: ${c.errorText(err)} --`);
            demo = null;
            c.endRun("game", "briefing");
            return;
        }
        c.logLine(`-- demo level start: episode ${episode}, character ${character}, demo seed, controller mode 1 (set-up blanks 0) --`);
        c.phase = "demo";
        c.resetPicture();
        c.clearLatched();
        c.latching = c.running;
        demoScreen.draw(demo);
        wireDemoSound(demo);
    }
    function beginDemo(episode: number, character: number, pace: DemoPace | undefined): boolean {
        if (!tickKit)
            return false;
        try {
            demo = new DemoSession(tickKit, episode, character, c.blankCounter, pace);
            demoScreen = demoScreen ?? new DemoScreen(c.canvas, tickKit, c.scale);
        }
        catch (err) {
            c.logLine(`-- the chosen demo's level start failed: ${c.errorText(err)} --`);
            demo = null;
            pendingEpisode = null;
            return false;
        }
        pendingEpisode = null;
        return true;
    }
    function presentDemo(): void {
        if (!demo || !demoScreen)
            return;
        demoScreen.draw(demo);
        wireDemoSound(demo);
    }
    function demoTick(): void {
        if (!demo || !demoScreen)
            return;
        const res = demo.tick(c.samplePad());
        if (res.changed)
            demoScreen.draw(demo);
        if (res.end === null)
            return;
        const finished = demo;
        demo = null;
        c.engine.stopAll();
        if (res.end === "start") {
            c.logLine("-- demo ended by Start: straight to the title (the fade-out and the teardown are held, not faded) --");
            c.rng = new LcgRng(finished.state.rng.state, tickKit!.lcg);
            c.startTitle();
            const titleCore = c.titleCore;
            if (titleCore) {
                for (const [opcode, value] of [[titleCore.C.MUSIC_1_OPCODE, titleCore.C.MUSIC_1_VALUE], [titleCore.C.MUSIC_2_OPCODE, titleCore.C.MUSIC_2_VALUE]] as const) {
                    const e = { type: "Audio.PlayMusic", opcode, value };
                    c.logLine(`title: ${c.describeEvent(e)}`);
                    c.engine.request(e as AudioRequest);
                }
            }
        }
        else {
            const why = res.end === "error" ? ` (stopped by an error: ${finished.lastError})` : "";
            c.restart();
            c.logLine(`demo ended by the countdown: restart${why} (as from power-on; the fade-out is not modelled)`);
        }
    }
    return {
        get hasPick() { return pendingEpisode !== null; },
        get demoOn() { return demo !== null; },
        titleExit(to: string, briefing: boolean): void {
            const rng = c.rng;
            if (to === "demo" && briefing && rng) {
                const before = rng.state;
                pendingEpisode = attractPick(rng);
                c.logLine(`-- attract pick: seed ${hex8(before)} -> ${hex8(rng.state)}, episode ${pendingEpisode}, controller mode 1 --`);
            }
            else
                pendingEpisode = null;
        },
        clearPick(): void { pendingEpisode = null; },
        startDemo,
        beginDemo,
        presentDemo,
        demoTick,
        demoLevelWait(): number | null {
            return demo && demo.stage === "play" ? demo.pendingWait : null;
        },
        demoStatus(state: string): string | null {
            if (c.phase !== "demo" || !demo)
                return null;
            const paceText = demo.pace ? `the pace is the recorded console run ${demo.pace.name}'s (the console's blanks per iteration)` : "the pace is the random cycle's (5 blanks per iteration)";
            return `${demo.statusText()} - ${state} [still approximated: set-up blanks 0, fade-in = black 33 ticks, fade-out = last picture held 44 ticks; the counter's and the message window's changes during play are not drawn (no spec); ${paceText}]`;
        },
        clear(): void {
            demo = null;
            pendingEpisode = null;
        },
        dropAll(): void {
            demo = null;
            demoScreen = null;
            pendingEpisode = null;
        },
    };
}
export function attractPart(c: CoreControl): DebugPart {
    const cycle = attractCycle(c);
    return {
        tas: false,
        tasFinished: false,
        get busy() { return cycle.demoOn; },
        get hasPick() { return cycle.hasPick; },
        statusText: (state) => cycle.demoStatus(state),
        tasTick: () => false,
        titleExit: (to, briefing) => cycle.titleExit(to, briefing),
        clearPick: () => cycle.clearPick(),
        startDemo: () => cycle.startDemo(),
        demoTick: () => cycle.demoTick(),
        demoLevelWait: () => cycle.demoLevelWait(),
        clear: () => cycle.clear(),
        stopTas: () => undefined,
        dropAll: () => cycle.dropAll(),
        updateButtons: () => undefined,
        onError: () => undefined,
    };
}

import type { EventSink } from "../../../domain.js";
import type { GameEvent } from "../../../events.js";
import type { LcgRng } from "../../../rng.js";
import { CharselCore } from "../../charsel/core.js";
import type { CharselDriver } from "../../charsel/core.js";
import type { CharselAssets } from "../../charsel/assets.js";
import type { CharselConstants } from "../../charsel/constants.js";
import { LevelStartScreen } from "../../start/screen.js";
import type { LeadScreenFrame, Pace } from "../../start/screen.js";
import type { LevelStartInput } from "../../start/types.js";
import { CHARACTER_BY_INDEX, START_SCREEN, LEVEL_BYTE_EPISODE_MASK, LEVEL_BYTE_EPISODE_SHIFT, LEVEL_BYTE_FLOOR_MASK } from "../../start/constants.js";
import type { PasswordRecord } from "../../password/types.js";
import { soundDriverPowerOn, soundRequest } from "../../tick/sound.js";
import type { SoundEvent, SoundGates, SoundTable } from "../../tick/sound.js";
import { DemoRun, demoLevelStartInput } from "./demo_run.js";
import type { DemoRunDeps } from "./demo_run.js";
import { pauseFrame, pauseFrameRecord } from "../../pause/core.js";
import type { PauseScreen } from "../../pause/core.js";
import { coopEvent, deathGameOverFrame, deathGameOverOpen, deathRestart, deathSelectFrame, deathSelectOpen, inSeat, loseSeat, MissingPartnerError, pauseRequests, seat1PauseEdge, pauseResume, request, seatPauseScreen, seatRestart, tickHidden, withSoundSource } from "../../tick/core.js";
import { addSecondSeat } from "../../tick/seats.js";
import type { Seats } from "../../tick/seats.js";
import type { DeathSelect } from "../../tick/core.js";
import { BriefingCore } from "../../briefing/core.js";
import { PATTERN_BYTES, SLOT_COUNT } from "../../boot/model.js";
import { encodePassword } from "../../password/codec.js";
import { EPISODE_BY_INDEX, LEVEL_BYTE_EPISODE_SHIFT as EPISODE_SHIFT, ROUND } from "../../start/constants.js";
import type { AttractKit, DemoPace } from "./tick_kit.js";
import { hex8 } from "./tick_kit.js";
export const NEW_GAME_EPISODE = 0;
export const NEW_GAME_CURSOR = 0;
export const NEW_GAME_ALIVE: readonly number[] = [1, 1, 1, 1, 1];
const PAD_BYTE_MASK = 0xff;
export type NewGameStart = {
    readonly kind: "new_game";
} | {
    readonly kind: "password";
    readonly record: PasswordRecord;
};
export function episodeOfLevelByte(b: number): number {
    return (b >> LEVEL_BYTE_EPISODE_SHIFT) & LEVEL_BYTE_EPISODE_MASK;
}
export function floorOfLevelByte(b: number): number {
    return b & LEVEL_BYTE_FLOOR_MASK;
}
export type NewGameStage = "select" | "level_start" | "play" | "pause" | "death_select" | "restart_setup" | "game_over" | "episode_end" | "ended";
const EPISODE_END_BRIEFING_DELAY = 44;
type EpisodeEnd = {
    readonly kind: "fade";
    wait: number;
} | {
    readonly kind: "briefing";
    readonly screen: BriefingCore;
    eventsFrom: number;
    frame: number;
    readonly ending?: true;
};
interface EpisodeCarry {
    readonly items: ReadonlyArray<{
        readonly item: number;
        readonly rounds: number;
    }>;
    readonly hp: number;
    readonly teamAlive: Readonly<Record<string, boolean>>;
    readonly phase: number;
    readonly bobAcc: number;
    readonly options: LevelStartInput["carried"]["options"];
    readonly introCamera: {
        readonly angle: number;
        readonly distance: number;
    };
    readonly tilePass: LevelStartInput["carried"]["tile_pass"];
    readonly sniperGates: LevelStartInput["carried"]["sniper_gates"];
    readonly skyTileCounter: number;
    readonly levelByte: number;
}
const FLOOR_ENTRY_COUNT = 16;
export interface NewGameTickResult {
    readonly changed: boolean;
    readonly sounds: readonly SoundEvent[];
    readonly log: readonly string[];
}
export interface IndexedPicture {
    readonly display: 0 | 1;
    readonly cram: readonly number[];
    readonly indices: Uint8Array | null;
    readonly nothing?: number;
}
export function charselSoundDriver(table: SoundTable): CharselDriver {
    const driver = soundDriverPowerOn();
    const gates: SoundGates = { musicOn: true, sfxOn: true, voiceOn: true, announcing: false, delayTimer: 0 };
    return (events: EventSink, request: number): void => {
        soundRequest(driver, table, request, gates, (e) => {
            if (e.type !== "Audio.Request")
                events.emit(e as unknown as GameEvent);
        });
    };
}
export class NewGameSession {
    readonly charsel: CharselCore;
    stage: NewGameStage = "select";
    character: number | null = null;
    run: DemoRun | null = null;
    private screen: LevelStartScreen | null = null;
    private restartD = 0;
    t = 0;
    private wait = 0;
    get pendingWait(): number {
        return this.stage === "play" ? this.wait : 0;
    }
    private lastPad = 0;
    lastError = "";
    floorEntries: string[] = new Array<string>(FLOOR_ENTRY_COUNT).fill("");
    carriedEntry = "";
    private pause: {
        screen: PauseScreen;
        frames: number;
        pic: IndexedPicture;
        eventsFrom: number;
        lastRequests: readonly number[];
    } | null = null;
    private blank: "none" | "draw" | "drawn" = "none";
    readonly notes: string[] = [];
    private death: {
        sel: DeathSelect;
        frames: number;
        eventsFrom: number;
        character: number | null;
        seat?: 0 | 1;
    } | null = null;
    private over: {
        screen: BriefingCore;
        frame: number;
        eventsFrom: number;
        seat: 0 | 1;
    } | null = null;
    private seatScreen: {
        seat: 0 | 1;
        kind: "setup";
        screen: LevelStartScreen;
        t: number;
        d: number;
    } | {
        seat: 0 | 1;
        kind: "crawl";
        screen: BriefingCore;
        frame: number;
    } | null = null;
    exitStartup = false;
    gameOverExitFrame = -1;
    deaths = 0;
    private pace: readonly number[] = [];
    private paceName = "";
    tas: {
        readonly pace: readonly {
            readonly pad: number;
            readonly vblanks: number;
        }[];
        onIteration?: (index: number, run: DemoRun) => boolean;
        seedAt?: (index: number, own: number) => number | null;
        frameAt?: (index: number, own: number) => number | null;
    } | null = null;
    iterBase = 0;
    tasStopped = false;
    episode: number;
    floor: number;
    private end: EpisodeEnd | null = null;
    episodesEnded = 0;
    constructor(private readonly tickKit: AttractKit, assets: CharselAssets, C: CharselConstants, private readonly rng: LcgRng, readonly start: NewGameStart = { kind: "new_game" }, driver?: CharselDriver | null, prevPad = 0) {
        this.episode = start.kind === "password" ? episodeOfLevelByte(start.record.level_byte) : NEW_GAME_EPISODE;
        this.floor = start.kind === "password" ? floorOfLevelByte(start.record.level_byte) : 0;
        const env = tickKit.envs[this.episode];
        if (!env)
            throw new Error(`no environment of episode ${this.episode} in the tick bundle`);
        const d = driver === undefined ? charselSoundDriver(env.sounds) : driver;
        this.charsel = new CharselCore(assets, C, d);
        const alive = start.kind === "password" ? start.record.alive : NEW_GAME_ALIVE;
        this.charsel.reset(NEW_GAME_CURSOR, alive, prevPad);
    }
    rebuildAfterLoad(): void {
        const env = this.tickKit.envs[this.episode];
        if (!env)
            throw new Error(`no environment of episode ${this.episode} in the tick bundle`);
        (this.charsel as unknown as {
            driver: CharselDriver | null;
        }).driver = charselSoundDriver(env.sounds);
        this.run?.rebuildAfterLoad();
    }
    get k(): number {
        return this.run?.k ?? 0;
    }
    tick(pad: number, sink: EventSink, blankCounter: number): NewGameTickResult {
        const log: string[] = [];
        switch (this.stage) {
            case "select": {
                this.charsel.tick(pad & PAD_BYTE_MASK, sink);
                if (this.character === null && this.charsel.exit !== null) {
                    this.character = this.charsel.exit.character;
                    this.lastPad = pad & PAD_BYTE_MASK;
                    log.push(`-- character select: Flow.Exit {to: level, character: ${this.character}} at frame ${this.charsel.frame}; the fade-out follows --`);
                }
                if (this.charsel.finished) {
                    this.levelStart(blankCounter, log);
                    this.stage = "level_start";
                    this.t = 0;
                }
                return { changed: true, sounds: [], log };
            }
            case "level_start": {
                const screen = this.screen!;
                const run = this.run!;
                this.t++;
                let sounds: readonly SoundEvent[] = [];
                if (this.t === screen.musicFrame)
                    sounds = run.startMusic;
                if (this.t === screen.creationFrame && run.startCreation.length > 0)
                    sounds = [...sounds, ...run.startCreation];
                if (this.t >= screen.frames) {
                    this.stage = "play";
                    this.wait = run.vblanksOf(0);
                    log.push(`-- boundary 0 (t = ${this.t}): the level, played with the keyboard; pace ${this.paceName} --`);
                }
                return { changed: true, sounds, log };
            }
            case "play": {
                const own = this.seatScreenTick(pad);
                if (--this.wait > 0) {
                    const draw = this.blank === "draw";
                    if (draw)
                        this.blank = "drawn";
                    return { changed: draw || own.length > 0 || this.seatScreen !== null, sounds: own, log };
                }
                const run = this.run!;
                if (this.tas) {
                    const index = this.iterBase + run.k;
                    const line = this.tas.pace[index];
                    if (line === undefined || (this.tas.onIteration && !this.tas.onIteration(index, run))) {
                        this.tasStopped = true;
                        this.stage = "ended";
                        log.push(line === undefined ? `-- the movie's pace has no iteration ${index}: the TAS run ends --` : `-- the TAS run stopped at iteration ${index} (a check value differs) --`);
                        return { changed: false, sounds: [], log };
                    }
                    pad = line.pad;
                }
                const seats = run.state.seats;
                if (seats?.handOver1 === true)
                    return this.seatHandOver(log);
                if (seats?.out[0] === true)
                    pad = 0;
                const out0Before = seats?.out[0] === true;
                const out1Before = seats?.out[1] === true;
                try {
                    const op = run.stepOpen(pad & PAD_BYTE_MASK, { floorEntries: this.floorEntries, carriedEntry: this.carriedEntry });
                    if (op.kind === "paused") {
                        coopEvent(run.state, { type: "Coop.Pause", seat: 0, on: true });
                        if (seats !== undefined)
                            seats.pause[0] = true;
                        const evs = [...run.state.events];
                        this.pause = { screen: op.screen, frames: 0, pic: { ...pauseFrameRecord(op.screen) }, eventsFrom: evs.length, lastRequests: [] };
                        this.stage = "pause";
                        log.push(`-- the pause screen (ZT-UI-PAUSE): Audio.Pause; the browsed floor ${op.screen.browsed}; Up / Down = browse, Start = resume --`);
                        return { changed: true, sounds: evs, log };
                    }
                    const res = op.result;
                    this.blank = "none";
                    this.wait = run.vblanksOf(run.k);
                    if (seats !== undefined && !out1Before && seats.out[1] && !seats.out[0])
                        own.push(...this.seatCrawlOpen(1, log));
                    if (own.length > 0)
                        return { changed: true, sounds: [...own, ...res.events], log };
                    if (res.ended)
                        return { changed: true, sounds: [...res.events, ...this.episodeEnd(log)], log };
                    if (seats !== undefined && seats.out[0] && seats.out[1])
                        return { changed: true, sounds: [...res.events, ...this.gameOverOpen(out0Before ? 1 : 0, log)], log };
                    return { changed: true, sounds: res.events, log };
                }
                catch (err) {
                    if (err instanceof MissingPartnerError)
                        throw err;
                    if (run.state.hidden.deathCounter >= run.deps.env.death.COUNTER_LIMIT)
                        return this.handOver(log);
                    this.lastError = err instanceof Error ? err.message : String(err);
                    this.stage = "ended";
                    log.push(`-- the iteration refused: ${this.lastError} --`);
                    return { changed: false, sounds: [], log };
                }
            }
            case "death_select":
                return this.deathSelectTick(pad & PAD_BYTE_MASK, log);
            case "restart_setup":
                return this.restartSetupTick(log);
            case "game_over":
                return this.gameOverTick(pad & PAD_BYTE_MASK, log);
            case "pause":
                return this.pauseTick(pad & PAD_BYTE_MASK, log);
            case "episode_end":
                return this.episodeEndTick(pad & PAD_BYTE_MASK, log, blankCounter);
            case "ended":
                return { changed: false, sounds: [], log };
        }
    }
    private episodeEnd(log: string[]): SoundEvent[] {
        const run = this.run!;
        const st = run.state;
        if (st.hidden.controller.mode !== 0) {
            this.stage = "ended";
            log.push("-- the iteration ended the level (ZT-GAME-TICK T3) in a controller mode other than 0: the exit is ZT-UI-ATTRACT 4.5's, not the episode's end --");
            return [];
        }
        const w = st.world;
        const next = w.level.episode.value + 1;
        const codec = run.deps.env.passwordCodec;
        if (codec) {
            const inv = w.inventory;
            this.carriedEntry = encodePassword(codec, {
                alive: CHARACTER_BY_INDEX.map((nm) => (w.team.alive[nm] ? 1 : 0)),
                items: inv.map((slot) => slot.item.value),
                amounts: inv.map((slot) => Math.floor(slot.amount / ROUND)),
                levelByte: next << EPISODE_SHIFT,
            });
        }
        this.end = { kind: "fade", wait: EPISODE_END_BRIEFING_DELAY };
        this.stage = "episode_end";
        this.episodesEnded++;
        log.push(`-- the loop left (ZT-GAME-TICK T3: the exit countdown reached 0): episode ${w.level.episode.value} ended; the password ${this.carriedEntry === "" ? "(no codec)" : this.carriedEntry} kept, the music stops, the screen fades out and clears; the briefing of the case follows after ${EPISODE_END_BRIEFING_DELAY} frames (ZT-GAME-START 4.13) --`);
        return [{ type: "Audio.StopTrack", id: w.level.episode.value }];
    }
    private episodeEndTick(pad: number, log: string[], blankCounter: number): NewGameTickResult {
        const e = this.end!;
        const run = this.run!;
        const st = run.state;
        try {
            if (e.kind === "fade") {
                if (--e.wait > 0)
                    return { changed: false, sounds: [], log };
                const next = st.world.level.episode.value + 1;
                const env = run.deps.env;
                if (env.briefing === null)
                    throw new Error("the episode's briefing (ZT-UI-BRIEFING 4.9, 4.11): the environment has no briefing assets");
                if (next >= EPISODE_BY_INDEX.length) {
                    const screen = new BriefingCore(env.briefing.assets, env.briefing.C);
                    screen.enterEnding();
                    this.end = { kind: "briefing", screen, eventsFrom: st.events.length, frame: 0, ending: true };
                    log.push("-- the last episode ended: the ending (ZT-UI-BRIEFING 4.11, case 4: briefing_g, scenes.07) starts --");
                    return { changed: true, sounds: [], log };
                }
                const screen = new BriefingCore(env.briefing.assets, env.briefing.C);
                const C = env.briefing.C;
                const cells = C.PLANE_W * C.PLANE_H;
                screen.enter({ planeA: new Uint16Array(cells), planeB: new Uint16Array(cells), patterns: new Uint8Array(SLOT_COUNT * PATTERN_BYTES), pad }, next === 1 ? "episode1" : "episode2");
                this.end = { kind: "briefing", screen, eventsFrom: st.events.length, frame: 0 };
                log.push(`-- the entry briefing of episode ${next} (ZT-UI-BRIEFING 4.9, case ${next}) starts --`);
                return { changed: true, sounds: [], log };
            }
            const sink: EventSink = {
                emit: (ev: GameEvent) => {
                    const x = ev as unknown as {
                        type: string;
                        request?: number;
                    };
                    if (x.type === "Audio.Request" && typeof x.request === "number")
                        request(st, x.request);
                    else if (x.type !== "Flow.Exit")
                        st.events.push(x as unknown as SoundEvent);
                },
            };
            e.screen.tick(pad, sink);
            e.frame++;
            const sounds = st.events.slice(e.eventsFrom);
            e.eventsFrom = st.events.length;
            if (e.screen.finished && e.ending === true) {
                this.exitStartup = true;
                this.stage = "ended";
                log.push(`-- the ending's Flow.Exit {to: ${e.screen.exit}} at its frame ${e.frame}: the cold reset to the boot screens (ZT-GAME-START 4.13 step 4) --`);
            }
            else if (e.screen.finished) {
                log.push(`-- the briefing's Flow.Exit {to: ${e.screen.exit}} at its frame ${e.frame}: the next episode's level start follows (ZT-GAME-START 4.13 steps 4 and 5) --`);
                this.nextEpisodeStart(pad, blankCounter, log);
            }
            return { changed: true, sounds, log };
        }
        catch (err) {
            this.lastError = err instanceof Error ? err.message : String(err);
            this.stage = "ended";
            log.push(`-- the episode's end refused: ${this.lastError} --`);
            return { changed: false, sounds: [], log };
        }
    }
    private nextEpisodeStart(pad: number, blankCounter: number, log: string[]): void {
        const st = this.run!.state;
        const next = st.world.level.episode.value + 1;
        const carryOf = (): EpisodeCarry => {
            const w = st.world;
            const hidden = tickHidden(st);
            return {
                items: w.inventory.filter((s) => s.item.value !== 0).map((s) => ({ item: s.item.value, rounds: Math.floor(s.amount / ROUND) })),
                hp: w.player.hp,
                teamAlive: { ...w.team.alive },
                phase: w.core.phase,
                bobAcc: w.player.bob_acc,
                options: structuredClone(w.options) as LevelStartInput["carried"]["options"],
                introCamera: { angle: w.intro.camera.angle, distance: w.intro.camera.distance },
                tilePass: (hidden.tiles ?? { cursor: 0, g1: { counter: 0, offset: 0, phase: 0 }, g2: { counter: 0, offset: 0, phase: 0 }, g3: { counter: 0, offset: 0, phase: 0 } }) as LevelStartInput["carried"]["tile_pass"],
                sniperGates: (hidden.snipers ?? { gate_1: 0, gate_2: 0, gate_3: 0 }) as LevelStartInput["carried"]["sniper_gates"],
                skyTileCounter: st.sky?.accumulator ?? 0,
                levelByte: next << EPISODE_SHIFT,
            };
        };
        const carry = carryOf();
        const seats = st.seats;
        const seat1 = seats !== undefined && !seats.out[1] ? inSeat(st, 1, () => ({ carry: carryOf(), character: st.world.player.character.value })) : null;
        this.episode = next;
        this.floor = 0;
        this.lastPad = pad;
        this.end = null;
        const run1 = seat1 !== null ? this.levelStartRun(blankCounter, log, seat1.carry, seat1.character) : null;
        this.levelStart(blankCounter, log, carry);
        if (seats !== undefined && run1 !== null) {
            const ts = this.run!.state;
            const alone = seats.out[0];
            (ts as {
                seats?: Seats;
            }).seats = addSecondSeat(ts, alone ? 0 : (seats.offsetX ?? 0), run1.state, seats.rules);
            if (alone)
                ts.seats!.out[0] = true;
            this.run!.seat1Entry();
            log.push(`-- ZT-COOP 4.14: both seats start episode ${next} together${alone ? " (seat 0 is out: seat 1 alone, no offset)" : ""} --`);
        }
        this.stage = "level_start";
        this.t = 0;
    }
    private pauseTick(pad: number, log: string[]): NewGameTickResult {
        const run = this.run!;
        const p = this.pause!;
        try {
            p.pic = { ...pauseFrameRecord(p.screen) };
            const r = pauseFrame(p.screen, pad);
            p.frames++;
            p.lastRequests = r.requests;
            pauseRequests(run.state, r.requests);
            if (r.requests.length > 0)
                log.push(`-- pause frame ${p.frames - 1}: browsed floor ${p.screen.browsed}, request ${r.requests.join(", ")} --`);
            const seats = run.state.seats;
            if (!r.closed) {
                if (seats !== undefined)
                    seat1PauseEdge(run.state);
                const sounds = run.state.events.slice(p.eventsFrom);
                p.eventsFrom = run.state.events.length;
                return { changed: true, sounds, log };
            }
            pauseResume(run.state);
            coopEvent(run.state, { type: "Coop.Pause", seat: 0, on: false });
            if (seats !== undefined) {
                seats.pause[0] = false;
                seat1PauseEdge(run.state);
            }
            const sounds = run.state.events.slice(p.eventsFrom);
            p.eventsFrom = run.state.events.length;
            const pc = run.deps.env.pause!.C;
            const entryBlanks = this.tickKit.pauseExit?.entryBlanks ?? pc.ENTRY.BLANKS;
            const exitBlanks = this.tickKit.pauseExit?.exitBlanks ?? pc.EXIT.BLANKS_BEFORE_CLEAR;
            const res = run.stepClose({ exitBlanks, vblanks: entryBlanks + p.frames + exitBlanks }, []);
            const after = res.events.slice(p.eventsFrom);
            this.pause = null;
            this.stage = "play";
            this.blank = "draw";
            this.wait = exitBlanks + run.vblanksOf(run.k);
            log.push(`-- the pause screen closed after ${p.frames} frames: Audio.Resume; the exit's ${exitBlanks} blanks, then the game (blank boundary, 4.10) --`);
            if (res.ended) {
                this.stage = "ended";
                log.push("-- the iteration ended the level (ZT-GAME-TICK 4.4: the tail's exit) --");
            }
            return { changed: true, sounds: [...sounds, ...after], log };
        }
        catch (err) {
            this.lastError = err instanceof Error ? err.message : String(err);
            this.stage = "ended";
            log.push(`-- the pause screen refused: ${this.lastError} --`);
            return { changed: false, sounds: [], log };
        }
    }
    private handOver(log: string[]): NewGameTickResult {
        const run = this.run!;
        const st = run.state;
        this.deaths++;
        this.blank = "none";
        const sounds = [...st.events];
        const left = CHARACTER_BY_INDEX.filter((nm) => st.world.team.alive[nm]).length;
        const seats = st.seats;
        if (left === 0 && seats !== undefined && !seats.out[1]) {
            seats.out[0] = true;
            seats.pause[0] = false;
            this.wait = run.vblanksOf(run.k);
            log.push("-- seat 0's last character died (ZT-COOP 4.13 item 4): seat 0 is out, seat 1 plays on --");
            return { changed: true, sounds: [...sounds, ...this.seatCrawlOpen(0, log)], log };
        }
        if (left === 0) {
            this.over = { screen: withSoundSource(st, "own", () => deathGameOverOpen(st)), frame: 0, eventsFrom: st.events.length, seat: 0 };
            this.stage = "game_over";
            log.push("-- the last member died (ZT-GAME-DEATH 4.7): Audio.StopTrack, the game over (ZT-UI-BRIEFING 4.10) --");
        }
        else {
            const sel = withSoundSource(st, "own", () => deathSelectOpen(st));
            this.death = { sel, frames: 0, eventsFrom: st.events.length, character: null };
            this.stage = "death_select";
            log.push(`-- the player died (ZT-GAME-DEATH 4.4): Audio.StopTrack, the dead member's flag cleared, ${left} member(s) left: the character select on the dead member's card (it cannot be chosen) --`);
        }
        return { changed: true, sounds, log };
    }
    private seatHandOver(log: string[]): NewGameTickResult {
        const st = this.run!.state;
        this.deaths++;
        const sel = inSeat(st, 1, () => withSoundSource(st, "own", () => deathSelectOpen(st)));
        this.death = { sel, frames: 0, eventsFrom: st.events.length, character: null, seat: 1 };
        this.stage = "death_select";
        log.push("-- seat 1 died (ZT-COOP 4.13 item 2): its character select; the world holds until it returns --");
        return { changed: true, sounds: [], log };
    }
    private seatRestartOf(seat: 0 | 1, sounds: readonly SoundEvent[], log: string[]): NewGameTickResult {
        const run = this.run!;
        const st = run.state;
        const d = this.death!;
        const character = d.sel.screen.exit!.character;
        const notes: string[] = [];
        inSeat(st, seat, () => withSoundSource(st, "own", () => seatRestart(st, d.sel.carried, character, notes)));
        for (const n of notes)
            if (!this.notes.includes(n))
                this.notes.push(n);
        const all = [...sounds, ...st.events.slice(d.eventsFrom)];
        this.death = null;
        if (seat === 1) {
            st.seats!.handOver1 = false;
            run.seat1Entry();
        }
        else {
            this.character = character;
            run.restartDisplay(st.display.flashEntry);
        }
        const pace: Pace = { a: START_SCREEN.OFF_FIRST, tf: START_SCREEN.FADE_START, tl: START_SCREEN.FADE_START - 1 };
        this.seatScreen = { seat, kind: "setup", screen: inSeat(st, seat, () => new LevelStartScreen(run.vdpScreen(), pace)), t: 0, d: pace.tf };
        this.stage = "play";
        this.wait = run.vblanksOf(run.k);
        log.push(`-- seat ${seat}'s restart (ZT-COOP 4.13 item 3): character ${character}, the world not reset, no reseed --`);
        return { changed: true, sounds: all, log };
    }
    loseSeat(k: 0 | 1): void {
        const run = this.run;
        if (run === null || run.state.seats === undefined)
            return;
        loseSeat(run.state, k);
        this.lostSeat = k;
        if (this.stage === "death_select" && (this.death?.seat ?? 0) === k) {
            this.death = null;
            this.stage = "play";
            this.wait = run.vblanksOf(run.k);
        }
        if (this.stage === "pause" && k === 0) {
            this.pause = null;
            this.stage = "play";
            this.wait = run.vblanksOf(run.k);
        }
        if (this.seatScreen !== null && this.seatScreen.seat === k)
            this.seatScreen = null;
    }
    lostSeat: 0 | 1 | null = null;
    private seatCrawlOpen(seat: 0 | 1, log: string[]): SoundEvent[] {
        const st = this.run!.state;
        const from = st.events.length;
        this.seatScreen = { seat, kind: "crawl", screen: inSeat(st, seat, () => withSoundSource(st, "own", () => deathGameOverOpen(st))), frame: 0 };
        log.push(`-- seat ${seat} is out (ZT-COOP 4.13 item 4): its game over's crawl on its page, then the partner's view --`);
        return st.events.slice(from);
    }
    private seatScreenTick(pad: number): SoundEvent[] {
        const o = this.seatScreen;
        if (o === null)
            return [];
        const st = this.run!.state;
        if (o.kind === "setup") {
            o.t++;
            if (o.t >= o.screen.frames)
                this.seatScreen = null;
            return [];
        }
        const from = st.events.length;
        const sp = o.seat === 1 ? (st.seats?.pad1 ?? 0) & PAD_BYTE_MASK : pad & PAD_BYTE_MASK;
        o.frame++;
        inSeat(st, o.seat, () => withSoundSource(st, "own", () => deathGameOverFrame(st, o.screen, sp)));
        if (o.screen.finished)
            this.seatScreen = null;
        return st.events.slice(from).filter((e) => (e.type as string) !== "Flow.Exit");
    }
    seatPicture(seat: 0 | 1): IndexedPicture | null {
        if (this.stage === "pause" && seat === 0)
            return this.picture();
        if (this.stage === "death_select" && (this.death?.seat ?? 0) === seat)
            return this.picture();
        const o = this.seatScreen;
        if (this.stage === "game_over" && (o === null || o.seat !== seat || o.kind !== "crawl"))
            return this.picture();
        if (o === null || o.seat !== seat || (this.stage !== "play" && this.stage !== "ended" && this.stage !== "game_over"))
            return null;
        if (o.kind === "crawl")
            return { display: o.screen.display, cram: o.screen.cram, indices: o.screen.indices() };
        return setupPicture(o.screen, o.t, o.d);
    }
    seatOnScreen(seat: 0 | 1): boolean {
        if (this.stage !== "play")
            return true;
        const o = this.seatScreen;
        if (o !== null && o.seat === seat && o.kind === "crawl")
            return true;
        return this.run?.state.seats?.pause[seat] === true;
    }
    seatPauseOpen(seat: 0 | 1): ReturnType<typeof seatPauseScreen> {
        const st = this.run?.state;
        if (!st || st.seats === undefined)
            return null;
        return seatPauseScreen(st, seat, this.floorEntries, this.carriedEntry);
    }
    get choosingSeat(): 0 | 1 | null {
        return this.stage === "death_select" ? (this.death?.seat ?? 0) : null;
    }
    private gameOverOpen(seat: 0 | 1, log: string[]): SoundEvent[] {
        const st = this.run!.state;
        const from = st.events.length;
        this.over = { screen: inSeat(st, seat, () => withSoundSource(st, "own", () => deathGameOverOpen(st))), frame: 0, eventsFrom: st.events.length, seat };
        this.stage = "game_over";
        this.blank = "none";
        log.push("-- both seats are out (ZT-COOP 4.13 item 5): the game over --");
        const evs = st.events.slice(from);
        this.over.eventsFrom = st.events.length;
        return evs;
    }
    private deathSelectTick(pad: number, log: string[]): NewGameTickResult {
        const run = this.run!;
        const st = run.state;
        const d = this.death!;
        try {
            const frame = d.frames++;
            const seat = d.seat ?? 0;
            const sp = seat === 1 ? st.seats!.pad1 & PAD_BYTE_MASK : pad;
            inSeat(st, seat, () => withSoundSource(st, "own", () => deathSelectFrame(st, d.sel.screen, sp)));
            if (d.character === null && d.sel.screen.exit !== null) {
                d.character = d.sel.screen.exit.character;
                coopEvent(st, { type: "Seat.Switch", seat, character: d.character });
                log.push(`-- death select: Flow.Exit {to: level, character: ${d.character}} at frame ${frame}; the fade-out follows --`);
            }
            let sounds = st.events.slice(d.eventsFrom);
            d.eventsFrom = st.events.length;
            if (!d.sel.screen.finished)
                return { changed: true, sounds, log };
            if (st.seats !== undefined)
                return this.seatRestartOf(seat, sounds, log);
            const pace: Pace = { a: START_SCREEN.OFF_FIRST, tf: START_SCREEN.FADE_START, tl: START_SCREEN.FADE_START - 1 };
            const frames = new LevelStartScreen(run.vdpScreen(), pace).frames;
            const notes: string[] = [];
            deathRestart(st, d.sel.carried, d.sel.screen.exit!.character, { restartSeed: null, deathCellMark: null, blanksAfter: frames }, notes);
            for (const n of notes)
                if (!this.notes.includes(n))
                    this.notes.push(n);
            this.character = d.sel.screen.exit!.character;
            sounds = [...sounds, ...st.events.slice(d.eventsFrom)];
            this.death = null;
            run.restartDisplay(st.display.flashEntry);
            this.screen = new LevelStartScreen(run.vdpScreen(), pace);
            this.restartD = pace.tf;
            this.t = 0;
            this.stage = "restart_setup";
            log.push(`-- the restart (ZT-GAME-DEATH 4.5): character ${this.character}, hp ${st.world.player.hp}, the music request, the set-up's ${this.screen.frames} frames follow --`);
            return { changed: true, sounds, log };
        }
        catch (err) {
            this.lastError = err instanceof Error ? err.message : String(err);
            this.stage = "ended";
            log.push(`-- the death select refused: ${this.lastError} --`);
            return { changed: false, sounds: [], log };
        }
    }
    private restartSetupTick(log: string[]): NewGameTickResult {
        const screen = this.screen!;
        const run = this.run!;
        this.t++;
        if (this.t >= screen.frames) {
            this.stage = "play";
            this.wait = run.vblanksOf(run.k);
            log.push(`-- the restart's set-up ended (t = ${this.t}): the level goes on --`);
        }
        return { changed: true, sounds: [], log };
    }
    private gameOverTick(pad: number, log: string[]): NewGameTickResult {
        const o = this.over!;
        const st = this.run!.state;
        try {
            const own = this.seatScreenTick(pad);
            const frame = o.frame++;
            const op = o.seat === 1 ? (st.seats?.pad1 ?? 0) & PAD_BYTE_MASK : pad;
            const from = st.events.length;
            inSeat(st, o.seat, () => withSoundSource(st, "own", () => deathGameOverFrame(st, o.screen, op)));
            const sounds = [...own, ...st.events.slice(Math.max(o.eventsFrom, from)).filter((e) => (e.type as string) !== "Flow.Exit")];
            o.eventsFrom = st.events.length;
            if (o.screen.finished) {
                this.exitStartup = true;
                this.gameOverExitFrame = frame;
                this.stage = "ended";
                log.push(`-- game over: Flow.Exit {to: ${o.screen.exit}} at frame ${frame}; the start-up follows --`);
            }
            return { changed: true, sounds, log };
        }
        catch (err) {
            this.lastError = err instanceof Error ? err.message : String(err);
            this.stage = "ended";
            log.push(`-- the game over refused: ${this.lastError} --`);
            return { changed: false, sounds: [], log };
        }
    }
    get deathSelectFrames(): number {
        return this.death?.frames ?? 0;
    }
    get deathSelectScreen(): CharselCore | null {
        return this.death?.sel.screen ?? null;
    }
    get gameOverFrames(): number {
        return this.over?.frame ?? 0;
    }
    get pauseScreen(): PauseScreen | null {
        return this.pause?.screen ?? null;
    }
    get pauseFrames(): number {
        return this.pause?.frames ?? 0;
    }
    private paceFixture(character: number): DemoPace | null {
        const demos = this.tickKit.demos;
        if (this.start.kind === "password") {
            return demos.find((d) => d.kind === "password" && d.episode === this.episode && d.floor === this.floor) ?? null;
        }
        return demos.find((d) => d.kind === "new_game" && d.episode === this.episode && d.character === character) ?? null;
    }
    private levelStartRun(blankCounter: number, log: string[], carry: EpisodeCarry, character: number): DemoRun {
        const keep = { run: this.run, floorEntries: this.floorEntries, pace: this.pace, paceName: this.paceName, carriedEntry: this.carriedEntry, iterBase: this.iterBase };
        this.levelStart(blankCounter, log, carry, character);
        const run = this.run!;
        this.run = keep.run;
        this.floorEntries = keep.floorEntries;
        this.pace = keep.pace;
        this.paceName = keep.paceName;
        this.carriedEntry = keep.carriedEntry;
        this.iterBase = keep.iterBase;
        return run;
    }
    private levelStart(blankCounter: number, log: string[], carry: EpisodeCarry | null = null, character: number = this.character!): void {
        if (this.tas && this.run)
            this.iterBase += this.run.k;
        let seed = this.rng.state >>> 0;
        if (this.tas?.seedAt) {
            const fed = this.tas.seedAt(this.iterBase, seed);
            if (fed !== null)
                seed = fed >>> 0;
        }
        let frame = blankCounter & 0xffff;
        if (this.tas?.frameAt) {
            const fed = this.tas.frameAt(this.iterBase, frame);
            if (fed !== null)
                frame = fed & 0xffff;
        }
        const base = demoLevelStartInput(this.episode, character, frame, seed);
        const env = this.tickKit.envs[this.episode];
        if (!env)
            throw new Error(`no environment of episode ${this.episode} in the tick bundle`);
        const pace = this.paceFixture(character);
        const setupBlanks = pace ? pace.setupBlanks : 0;
        let input: LevelStartInput;
        if (carry !== null) {
            input = {
                ...base,
                kind: "password",
                controller_mode: 0,
                setup_blanks: setupBlanks,
                floor: 0,
                level_byte: carry.levelByte,
                carried: {
                    phase: carry.phase,
                    bob_acc: carry.bobAcc,
                    sky_tile_counter: carry.skyTileCounter,
                    intro_camera: carry.introCamera,
                    hp: carry.hp,
                    team_alive: carry.teamAlive,
                    options: carry.options,
                    tile_pass: carry.tilePass,
                    sniper_gates: carry.sniperGates,
                    items: carry.items,
                },
            };
        }
        else if (this.start.kind === "password") {
            const rec = this.start.record;
            const teamAlive: Record<string, boolean> = {};
            CHARACTER_BY_INDEX.forEach((name, i) => {
                teamAlive[name] = rec.alive[i] === 1;
            });
            const items = rec.items.map((item, slot) => ({ item, rounds: rec.amounts[slot] ?? 0 })).filter((e) => e.item !== 0);
            input = {
                ...base,
                kind: "password",
                controller_mode: 0,
                setup_blanks: setupBlanks,
                floor: this.floor,
                level_byte: rec.level_byte,
                carried: { ...base.carried, hp: rec.max_health, team_alive: teamAlive, items },
            };
        }
        else {
            input = { ...base, kind: "new_game", controller_mode: 0, setup_blanks: setupBlanks };
        }
        this.pace = pace ? pace.vblanks : [];
        if (this.tas) {
            this.pace = this.tas.pace.slice(this.iterBase).map((l) => l.vblanks);
        }
        const what = carry !== null || this.start.kind === "password" ? "password game of this episode and floor" : "new game of this character";
        this.paceName = this.tas ? `the TAS movie's blanks per iteration from its iteration ${this.iterBase}` : pace ? `${pace.name}'s blanks per iteration (the console's ${what}), then 5` : `5 blanks per iteration (no console ${what} in the tickKit)`;
        const deps: DemoRunDeps = { env, HC: this.tickKit.HC, hudAssets: this.tickKit.hudAssets, HAND: this.tickKit.HAND, handAssets: this.tickKit.handAssets };
        this.run = new DemoRun(deps, input, this.pace, [], this.lastPad);
        this.floorEntries = new Array<string>(FLOOR_ENTRY_COUNT).fill("");
        const pauseAssets = env.pause?.assets;
        if (this.start.kind === "password" && pauseAssets) {
            const mark = pauseAssets.status.secured.trim();
            for (let f = 0; f < this.floor && f < FLOOR_ENTRY_COUNT; f++)
                this.floorEntries[f] = mark;
        }
        if (carry === null)
            this.carriedEntry = "";
        this.screen = new LevelStartScreen(this.run.vdpScreen(), pace?.pace ?? undefined);
        if (!pace?.pace)
            this.notes.push("the level start's pace (a, tf, tl of ZT-GAME-START 4.12) is the floor-0 new game's: no recorded console run of this start in the tickKit");
        if (this.screen.endPass !== this.screen.frames - this.screen.fadeStart)
            this.notes.push(`the fade-in's loop ends at pass ${this.screen.endPass}, not at boundary 0's (ZT-GAME-START 9 item 6)`);
        log.push(`-- level start (${carry !== null ? `the next episode after an episode's end, level byte ${carry.levelByte} (ZT-GAME-START 4.13)` : this.start.kind === "password" ? `password game, level byte ${this.start.record.level_byte}` : "new game"}): episode ${this.episode}, floor ${this.floor}, character ${character}, seed ${hex8(seed)} (the app's generator state: the console's seeding is not reproducible, ZT-GAME-START 3), frame ${blankCounter & 0xffff}, set-up blanks ${setupBlanks} (${pace ? "the recorded pace's" : "none: no recorded pace"}), pace ${pace?.pace ? `a ${pace.pace.a} tf ${pace.pace.tf} tl ${pace.pace.tl} (${pace.name})` : "the floor-0 new game's"}, controller mode 0, previous pad 0x${this.lastPad.toString(16)} --`);
        for (const n of this.run.notes)
            this.notes.push(n);
    }
    picture(): IndexedPicture {
        switch (this.stage) {
            case "select":
                return { display: this.charsel.display, cram: this.charsel.cram, indices: this.charsel.indices() };
            case "level_start": {
                const f: LeadScreenFrame = this.screen!.frame(Math.min(this.t, this.screen!.frames - 1));
                return { display: f.display, cram: f.cram, indices: f.indices };
            }
            case "pause":
                return this.pause!.pic;
            case "death_select": {
                const sc = this.death!.sel.screen;
                return { display: sc.display, cram: sc.cram, indices: sc.indices() };
            }
            case "game_over": {
                const sc = this.over!.screen;
                return { display: sc.display, cram: sc.cram, indices: sc.indices() };
            }
            case "episode_end": {
                const e = this.end!;
                if (e.kind !== "briefing")
                    return { display: 0, cram: this.run!.cram(), indices: null };
                return { display: e.screen.display, cram: e.screen.cram, indices: e.screen.indices() };
            }
            case "restart_setup":
                return setupPicture(this.screen!, this.t, this.restartD);
            case "play":
            case "ended": {
                if (this.blank !== "none")
                    return { display: 0, cram: this.run!.cram(), indices: null };
                const s = this.run!.liveScreen();
                return { display: 1, cram: s.cram, indices: s.indices, nothing: 255 };
            }
        }
    }
    statusText(): string {
        const kind = this.start.kind === "password" ? `password game (level byte ${this.start.record.level_byte})` : "new game";
        switch (this.stage) {
            case "select":
                return `character select: frame ${this.charsel.frame} - cursor ${this.charsel.cursor}${this.character !== null ? ` - chosen ${this.character}, fade-out` : ""} (Up / Down = card, Enter / A / S / D = confirm)`;
            case "level_start":
                return `level start on screen (ZT-GAME-START 4.12): t = ${this.t} of ${this.screen!.frames}, display ${this.screen!.frame(Math.min(this.t, this.screen!.frames - 1)).display} - ${kind}, episode ${this.episode}, floor ${this.floor}, character ${this.character}`;
            case "death_select": {
                const d = this.death!;
                const sc = d.sel.screen;
                return `${kind}: the player died (death ${this.deaths}, counter ${this.run!.state.hidden.deathCounter}) - character select on the dead member's card: frame ${d.frames} - cursor ${sc.cursor}${d.character !== null ? ` - chosen ${d.character}, fade-out` : ""} (Up / Down = card, Enter / A / S / D = confirm; the dead card is refused)`;
            }
            case "restart_setup":
                return `${kind}: the restart on the same floor (ZT-GAME-DEATH 4.5) - character ${this.character}, set-up t = ${this.t} of ${this.screen!.frames}`;
            case "game_over":
                return `${kind}: GAME OVER (ZT-GAME-DEATH 4.7, ZT-UI-BRIEFING 4.10) - frame ${this.over!.frame} (Start ends the crawl; the start-up follows)`;
            case "episode_end": {
                const e = this.end!;
                if (e.kind === "briefing" && e.ending === true)
                    return `${kind}: the game's END (ZT-UI-BRIEFING 4.11) - frame ${e.frame} (Start ends the crawl; the boot screens follow)`;
                return e.kind === "fade"
                    ? `${kind}: episode ${this.episode} ENDED (ZT-GAME-START 4.13) - the screen cleared, the briefing in ${e.wait} frames`
                    : `${kind}: the entry briefing of episode ${this.episode + 1} (ZT-UI-BRIEFING 4.9) - frame ${e.frame}, page ${e.screen.page} (A / B / C = faster, Start = skip page 2)`;
            }
            case "pause": {
                const ps = this.pause!;
                return `${kind}: PAUSED (ZT-UI-PAUSE) - frame ${ps.frames} - browsed floor ${ps.screen.browsed} of the counted floor ${this.run!.state.hidden.countedFloor} - Up / Down = browse, Enter = resume`;
            }
            case "play":
            case "ended": {
                const w = this.run!.state.world;
                const p = w.player;
                return (`${kind}: episode ${this.episode}, floor ${this.floor}, character ${this.character} - ${this.stage === "ended" ? (this.exitStartup ? "GAME OVER or the ending (back to the start-up)" : "ENDED") : "playing"} - deaths ${this.deaths} - iteration ${this.k} - player (${p.pos.x}, ${p.pos.y}) angle ${p.angle} hp ${p.hp} - ` +
                    `pace ${this.paceName}` +
                    (this.notes.length > 0 ? ` - not drawn / approximated: ${this.notes.join("; ")}` : "") +
                    (this.lastError !== "" ? ` - stopped: ${this.lastError}` : ""));
            }
        }
    }
}
function setupPicture(sc: LevelStartScreen, t: number, d: number): IndexedPicture {
    const f: LeadScreenFrame = sc.frame(Math.min(t, sc.frames - 1));
    const first = sc.frame(sc.pictureStart).indices;
    if (f.t === d)
        return { display: 1, cram: new Array<number>(f.cram.length).fill(0), indices: first };
    return { display: f.display, cram: f.cram, indices: f.t > d ? first : f.indices };
}

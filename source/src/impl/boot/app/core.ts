/// <reference lib="dom" />
import type { BootBundle } from "../assets.js";
import { BOOT_BUNDLE_FORMAT } from "../assets.js";
import { deserializeAssets } from "../assets_parse.js";
import { BootCore } from "../schedule.js";
import { SEGA_BUNDLE_FORMAT } from "../../sega/assets.js";
import type { SegaBundle } from "../../sega/assets.js";
import { deserializeSegaAssets } from "../../sega/assets_parse.js";
import { SegaCore } from "../../sega/core.js";
import { TITLE_BUNDLE_FORMAT } from "../../title/assets.js";
import type { TitleBundle } from "../../title/assets.js";
import { deserializeTitleAssets } from "../../title/assets_parse.js";
import { TitleCore } from "../../title/loop.js";
import { OPTIONS_BUNDLE_FORMAT } from "../../options/assets.js";
import type { OptionsBundle } from "../../options/assets.js";
import { deserializeOptionsAssets } from "../../options/assets_parse.js";
import { OptionsCore } from "../../options/core.js";
import { BRIEFING_BUNDLE_FORMAT } from "../../briefing/assets.js";
import type { BriefingBundle } from "../../briefing/assets.js";
import { deserializeBriefingAssets } from "../../briefing/assets_parse.js";
import { BriefingCore } from "../../briefing/core.js";
import { TitleFlowChain } from "../../briefing/chain.js";
import { briefingExitAction } from "./briefing_exit.js";
import { colourRgb, renderState } from "./render.js";
import type { Frame, PatternLookup } from "./render.js";
import { AudioEngine } from "./audio.js";
import type { AudioRequest } from "./audio.js";
import type { SoundEvent } from "../../tick/sound.js";
import { LcgRng } from "../../../rng.js";
import { loadAttractKit } from "./tick_kit.js";
import type { AttractKit } from "./tick_kit.js";
import { CHARSEL_BUNDLE_FORMAT } from "../../charsel/assets.js";
import type { CharselAssets, CharselBundle } from "../../charsel/assets.js";
import type { CharselConstants } from "../../charsel/constants.js";
import { deserializeCharselAssets } from "../../charsel/assets_parse.js";
import { attachDeathScreens } from "./tick_kit.js";
import { NewGameSession, charselSoundDriver, episodeOfLevelByte, floorOfLevelByte } from "./newgame.js";
import type { IndexedPicture, NewGameStart } from "./newgame.js";
import { PASSWORD_BUNDLE_FORMAT } from "../../password/assets.js";
import type { PasswordAssets, PasswordBundle } from "../../password/assets.js";
import type { PasswordConstants } from "../../password/constants.js";
import { deserializePasswordAssets } from "../../password/assets_parse.js";
import { PasswordCore } from "../../password/core.js";
import { makeDecoder, passwordCodecFrom } from "../../password/codec.js";
import type { PasswordCodecTables } from "../../password/codec.js";
import type { PasswordDecoder, PasswordRecord } from "../../password/types.js";
import type { ScreenState } from "../../screen_types.js";
import { getHost } from "./host.js";
import type { QuickGrid, QuickView } from "./host.js";
import { quickViewOf } from "./quick_view.js";
import { canSave, loadCore, saveCore } from "./state.js";
import { passwordOfRunningState } from "./password_now.js";
import { setCheatRules } from "../../tick/cheats.js";
import { modernPadByte, setModern } from "../../modern/api.js";
import type { NetCore } from "../../net/core.js";
import type { CoopStartPoint } from "./host.js";
import type { ModernDescriptor } from "../../modern/seat.js";
import { coopStartCore } from "./coop_start.js";
import { coopScreens } from "./coop_screens.js";
import type { CoopScreens } from "../../release/coop_page.js";
import { modernForTick } from "./modern_step.js";
import type { SeatRules } from "../../tick/seats.js";
import type { CoreControl, DebugPart, Phase } from "./debug_hooks.js";
export function startCore(makeDebug?: (c: CoreControl) => DebugPart): void {
    const host = getHost();
    const TICKS_PER_SECOND = 60;
    const TICK_MS = 1000 / TICKS_PER_SECOND;
    const MAX_CATCH_UP = 4;
    const SCALE = 3;
    const PALETTE_ENTRIES = 64;
    const LOG_LINES = 400;
    const PAD_BUTTONS = ["up", "down", "left", "right", "a", "b", "c", "start", "x", "y", "z", "mode"] as const;
    type PadButton = (typeof PAD_BUTTONS)[number];
    const KEY_MAP: Readonly<Record<string, PadButton>> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        Enter: "start",
        NumpadEnter: "start",
        KeyA: "a",
        KeyS: "b",
        KeyD: "c",
    };
    function padBit(button: PadButton): number {
        return 1 << PAD_BUTTONS.indexOf(button);
    }
    let debug: DebugPart | null = null;
    function el<T extends HTMLElement>(id: string): T {
        const e = document.getElementById(id);
        if (!e)
            throw new Error(`index.html has no #${id}`);
        return e as T;
    }
    const canvas = el<HTMLCanvasElement>("screen");
    const statusLine = el<HTMLElement>("status");
    const logBox = el<HTMLElement>("log");
    const noteBox = el<HTMLElement>("note");
    const bannerBox = el<HTMLElement>("banner");
    const strip = el<HTMLElement>("palette");
    const btnPlay = el<HTMLButtonElement>("play");
    const btnStep = el<HTMLButtonElement>("step");
    const btnRestart = el<HTMLButtonElement>("restart");
    const btnSkip = el<HTMLButtonElement>("skip");
    const btnSkipIntro = el<HTMLButtonElement>("skipintro");
    const soundBox = el<HTMLElement>("sound");
    const ctx = canvas.getContext("2d");
    if (!ctx)
        throw new Error("no 2d canvas context");
    const engine = new AudioEngine();
    engine.onNote = (note) => {
        soundBox.textContent = note;
    };
    window.addEventListener("keydown", () => engine.resume(), true);
    window.addEventListener("pointerdown", () => engine.resume(), true);
    const swatches: HTMLElement[] = [];
    for (let i = 0; i < PALETTE_ENTRIES; i++) {
        const s = document.createElement("div");
        s.className = "swatch";
        s.title = `entry ${i}`;
        strip.appendChild(s);
        swatches.push(s);
    }
    function showError(message: string): void {
        statusLine.textContent = `error: ${message}`;
        statusLine.className = "error";
        btnPlay.disabled = btnStep.disabled = btnRestart.disabled = btnSkip.disabled = btnSkipIntro.disabled = true;
        debug?.onError();
    }
    function describeEvent(e: object): string {
        const rest: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(e))
            if (k !== "type" && k !== "tick" && k !== "origin" && k !== "outcome")
                rest[k] = v;
        const type = String((e as {
            type?: unknown;
        }).type);
        switch (type) {
            case "Audio.Stop":
                return "Audio.Stop (all sound stopped)";
            case "Audio.PlayMusic":
                return `Audio.PlayMusic opcode ${String(rest.opcode)} value ${String(rest.value)}`;
            case "Audio.ChannelCtl":
                return `Audio.ChannelCtl channel ${String(rest.channel)} ${rest.on ? "on" : "off"} opcode ${String(rest.opcode)} value ${String(rest.value)}`;
            case "Audio.PlaySfx":
                return `Audio.PlaySfx channel ${String(rest.channel)} id ${String(rest.id)} note ${String(rest.note)}`;
            case "Audio.PlayVoice":
                return `Audio.PlayVoice channel ${String(rest.channel)} id ${String(rest.id)} param ${String(rest.param)}`;
            default:
                return `${type} ${JSON.stringify(rest)}`;
        }
    }
    function logLine(text: string): void {
        logBox.appendChild(Object.assign(document.createElement("div"), { textContent: text }));
        while (logBox.childElementCount > LOG_LINES)
            logBox.removeChild(logBox.firstElementChild!);
        logBox.scrollTop = logBox.scrollHeight;
    }
    async function fetchJson(url: string): Promise<unknown> {
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`${url}: HTTP ${res.status}: ${(await res.text()).trim()}`);
        return res.json() as Promise<unknown>;
    }
    async function loadBootBundle(): Promise<BootBundle> {
        const bundle = (await fetchJson("/bundle.json")) as BootBundle;
        if (bundle.format !== BOOT_BUNDLE_FORMAT)
            throw new Error(`bundle format ${String(bundle.format)}, expected ${BOOT_BUNDLE_FORMAT}`);
        return bundle;
    }
    async function loadOptionsCore(): Promise<OptionsCore> {
        const bundle = (await fetchJson("/options_bundle.json")) as OptionsBundle;
        if (bundle.format !== OPTIONS_BUNDLE_FORMAT)
            throw new Error(`options bundle format ${String(bundle.format)}, expected ${OPTIONS_BUNDLE_FORMAT}`);
        return new OptionsCore(deserializeOptionsAssets(bundle.assets), bundle.constants);
    }
    async function loadBriefingCore(): Promise<BriefingCore> {
        const bundle = (await fetchJson("/briefing_bundle.json")) as BriefingBundle;
        if (bundle.format !== BRIEFING_BUNDLE_FORMAT)
            throw new Error(`briefing bundle format ${String(bundle.format)}, expected ${BRIEFING_BUNDLE_FORMAT}`);
        return new BriefingCore(deserializeBriefingAssets(bundle.assets), bundle.constants);
    }
    async function loadCharselKit(): Promise<{
        assets: CharselAssets;
        C: CharselConstants;
    }> {
        const bundle = (await fetchJson("/charsel_bundle.json")) as CharselBundle;
        if (bundle.format !== CHARSEL_BUNDLE_FORMAT)
            throw new Error(`charsel bundle format ${String(bundle.format)}, expected ${CHARSEL_BUNDLE_FORMAT}`);
        return { assets: deserializeCharselAssets(bundle.assets), C: bundle.constants };
    }
    async function loadPasswordKit(): Promise<{
        assets: PasswordAssets;
        C: PasswordConstants;
        decoder: PasswordDecoder;
        codec: PasswordCodecTables;
    }> {
        const bundle = (await fetchJson("/password_bundle.json")) as PasswordBundle;
        if (bundle.format !== PASSWORD_BUNDLE_FORMAT)
            throw new Error(`password bundle format ${String(bundle.format)}, expected ${PASSWORD_BUNDLE_FORMAT}`);
        const codec = passwordCodecFrom(bundle.codec);
        return { assets: deserializePasswordAssets(bundle.assets), C: bundle.constants, decoder: makeDecoder(codec), codec };
    }
    async function loadTitleCore(): Promise<TitleCore> {
        const bundle = (await fetchJson("/title_bundle.json")) as TitleBundle;
        if (bundle.format !== TITLE_BUNDLE_FORMAT)
            throw new Error(`title bundle format ${String(bundle.format)}, expected ${TITLE_BUNDLE_FORMAT}`);
        return new TitleCore(deserializeTitleAssets(bundle.assets), bundle.constants, { startsRun: false });
    }
    async function loadSegaBundle(): Promise<{
        assets: ReturnType<typeof deserializeSegaAssets>;
        C: SegaBundle["constants"];
    }> {
        const bundle = (await fetchJson("/sega_bundle.json")) as SegaBundle;
        if (bundle.format !== SEGA_BUNDLE_FORMAT)
            throw new Error(`sega bundle format ${String(bundle.format)}, expected ${SEGA_BUNDLE_FORMAT}`);
        return { assets: deserializeSegaAssets(bundle.assets), C: bundle.constants };
    }
    function errorText(reason: unknown): string {
        return reason instanceof Error ? reason.message : String(reason);
    }
    const held = new Set<string>();
    const latched = new Set<string>();
    let latching = false;
    window.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (!(ev.code in KEY_MAP) || ev.ctrlKey || ev.metaKey || ev.altKey)
            return;
        ev.preventDefault();
        held.add(ev.code);
        if (latching)
            latched.add(ev.code);
    });
    window.addEventListener("keyup", (ev: KeyboardEvent) => {
        if (!(ev.code in KEY_MAP))
            return;
        ev.preventDefault();
        held.delete(ev.code);
    });
    window.addEventListener("blur", () => {
        held.clear();
        latched.clear();
    });
    function samplePad(keepTaps = false): number {
        if (host?.pad)
            return host.pad();
        let pad = 0;
        for (const code of held)
            pad |= padBit(KEY_MAP[code]!);
        for (const code of latched)
            pad |= padBit(KEY_MAP[code]!);
        if (!keepTaps)
            latched.clear();
        return pad;
    }
    async function main(): Promise<void> {
        const [bootResult, titleResult, segaResult, optionsResult, briefingResult, attractResult, charselResult, passwordResult] = await Promise.allSettled([
            loadBootBundle(),
            loadTitleCore(),
            loadSegaBundle(),
            loadOptionsCore(),
            loadBriefingCore(),
            loadAttractKit(fetchJson),
            loadCharselKit(),
            loadPasswordKit(),
        ]);
        if (bootResult.status === "rejected")
            throw bootResult.reason;
        const bundle = bootResult.value;
        const C = bundle.constants;
        engine.onPlay = (text) => logLine(text);
        void engine.load().then(() => {
            if (!engine.loaded)
                return;
            const pair = [
                [C.MUSIC_1_OPCODE, C.MUSIC_1_VALUE],
                [C.MUSIC_2_OPCODE, C.MUSIC_2_VALUE],
            ] as const;
            const varByte = pair.find(([op]) => op === 5)?.[1];
            const cmd = pair.find(([op]) => op === 16)?.[1];
            if (varByte !== undefined && cmd !== undefined)
                engine.prefetchMusic(varByte, cmd);
            logLine(`-- sound: ${engine.count} sounds available (ztassets_out/audio/, the extractor's audio command); every Audio.* request below is played --`);
        });
        const tickKit: AttractKit | null = attractResult.status === "fulfilled" ? attractResult.value : null;
        const attractError = attractResult.status === "rejected" ? errorText(attractResult.reason) : "";
        let rng: LcgRng | null = tickKit ? new LcgRng(tickKit.hostSeed, tickKit.lcg) : null;
        const charselKit = charselResult.status === "fulfilled" ? charselResult.value : null;
        const charselError = charselResult.status === "rejected" ? errorText(charselResult.reason) : "";
        if (tickKit && charselKit && briefingResult.status === "fulfilled")
            attachDeathScreens(tickKit, charselKit, { assets: briefingResult.value.assets, C: briefingResult.value.C });
        if (tickKit && passwordResult.status === "fulfilled")
            for (const env of tickKit.envs)
                if (env)
                    Object.assign(env, { passwordCodec: passwordResult.value.codec });
        let newGame: NewGameSession | null = null;
        let newGameImage: ImageData | null = null;
        let blankCounter = 0;
        const titleCore = titleResult.status === "fulfilled" ? titleResult.value : null;
        const titleError = titleResult.status === "rejected" ? errorText(titleResult.reason) : "";
        const optionsCore = optionsResult.status === "fulfilled" ? optionsResult.value : null;
        const briefingCore = briefingResult.status === "fulfilled" ? briefingResult.value : null;
        let chain: TitleFlowChain | null = null;
        let optionsError = "";
        let briefingError = "";
        if (optionsResult.status === "rejected")
            optionsError = errorText(optionsResult.reason);
        if (briefingResult.status === "rejected")
            briefingError = errorText(briefingResult.reason);
        let passwordError = passwordResult.status === "rejected" ? errorText(passwordResult.reason) : "";
        let passwordCore: PasswordCore | null = null;
        let passwordBlank = -1;
        let passwordGrid: QuickGrid | null = null;
        if (passwordResult.status === "fulfilled" && optionsCore) {
            try {
                const pk = passwordResult.value;
                const driver = tickKit ? charselSoundDriver(tickKit.envs[0]!.sounds) : null;
                passwordCore = new PasswordCore(pk.assets, pk.C, pk.decoder, driver);
                passwordBlank = pk.C["BUFFER.BLANK"];
                passwordGrid = { cells: pk.assets.cells, cols: pk.C["GRID.COLS"], rows: pk.C["GRID.ROWS"], leftRemap: pk.C["ROW8.LEFT_REMAP"], rightRemap: pk.C["ROW8.RIGHT_REMAP"] };
                optionsCore.attachPassword(passwordCore, pk.C["REBUILD.RETURN_FRAMES"]);
            }
            catch (err) {
                passwordError = errorText(err);
                passwordCore = null;
            }
        }
        let storedRecord: PasswordRecord | null = null;
        let storedCode: string | null = null;
        if (titleCore) {
            try {
                const c = new TitleFlowChain(titleCore, optionsCore, briefingCore);
                c.reset();
                chain = c;
            }
            catch (err) {
                const message = errorText(err);
                if (briefingCore)
                    briefingError = message;
                else
                    optionsError = message;
            }
        }
        let sega: SegaCore | null = null;
        let segaError = "";
        if (segaResult.status === "fulfilled") {
            try {
                sega = new SegaCore(segaResult.value.assets, segaResult.value.C);
            }
            catch (err) {
                segaError = errorText(err);
            }
        }
        else {
            segaError = errorText(segaResult.reason);
        }
        const bootCore = new BootCore(deserializeAssets(bundle.assets), C, { startsRun: sega === null });
        const handOver = sega ? sega.C.TICKS - 1 : -1;
        let phase: Phase = sega ? "sega" : "boot";
        let ran = 0;
        let titleRan = 0;
        let exitTo: string | null = null;
        let exitFrom: "title" | "options" | "briefing" = "title";
        let running = true;
        let frame: Frame | undefined;
        let lastCram = "";
        let accumulator = 0;
        let lastNow = performance.now();
        const bootRan = (): number => (sega ? Math.max(0, ran - handOver) : ran);
        const bootFinished = (): boolean => bootCore.finished || bootRan() >= C.TICKS;
        const onScreen = (): boolean => phase === "title" || phase === "options" || phase === "briefing";
        const ended = (): boolean => onScreen() && exitTo !== null;
        const stopped = (): boolean => (debug?.tas ? debug.tasFinished : ended() || (phase === "boot" && bootFinished()));
        function updateStatus(): void {
            const state = stopped() ? "finished" : running ? "running" : "paused";
            statusLine.className = "";
            const debugText = debug?.statusText(state) ?? null;
            if (debugText !== null) {
                statusLine.textContent = debugText;
            }
            else if (phase === "newgame" && newGame) {
                statusLine.textContent = `${newGame.statusText()} - ${state}`;
            }
            else if (phase === "sega" && sega) {
                const shown = ran === 0 ? "-" : String(ran - 1);
                const hand = ran - 1 === handOver ? " (hand-over: boot tick 0)" : "";
                statusLine.textContent = `intro: tick ${shown} / ${sega.C.TICKS}${hand} - ${state}`;
            }
            else if (phase === "boot") {
                const n = bootRan();
                const shown = n === 0 ? "-" : String(n - 1);
                statusLine.textContent = `boot: tick ${shown} / ${C.TICKS} - ${state}`;
                if (titleError && bootFinished()) {
                    statusLine.className = "error";
                    statusLine.textContent = `boot: finished - the title is not available: ${titleError}`;
                }
            }
            else if (exitTo !== null) {
                statusLine.textContent = `${exitFrom} ended: Flow.Exit to ${exitTo}`;
            }
            else if (phase === "briefing" && chain?.briefing) {
                const b = chain.briefing;
                const kind = b.briefingPath === "start" ? "new game" : "idle";
                const mode = b.crawling ? "crawling" : "fade";
                statusLine.textContent = `briefing (${kind}): tick ${titleRan === 0 ? "-" : String(titleRan - 1)} - page ${b.page} - counter ${b.crawlCounter} [${mode}] - ${state}`;
            }
            else if (phase === "options" && chain?.options && chain.options.showingPassword && passwordCore) {
                const p = passwordCore;
                statusLine.textContent = `password screen (ZT-UI-PASSWORD): frame ${p.frame} - cursor (${p.cursorCell.row}, ${p.cursorCell.col}) - buffer ${p.buffer} (arrows = cursor with auto-repeat, Enter / A / S / D = select the cell: a glyph, DEL, CANCEL, DONE) - ${state}`;
            }
            else if (phase === "options" && chain?.options) {
                const o = chain.options;
                const n = o.soundTest;
                const shownTest = n.toString(16).toUpperCase().padStart(2, "0");
                const onTest = o.item === o.C.ITEM_TEST ? " - on Sound Test (Left / Right = number, A / S / D = play)" : "";
                statusLine.textContent = `options: tick ${titleRan === 0 ? "-" : String(titleRan - 1)} - item ${o.item}${onTest} (players ${o.players}, music ${o.music}, voice ${o.voice}, test ${n} (${shownTest})) - ${state}`;
            }
            else {
                const shown = titleRan === 0 ? "-" : String(titleRan - 1);
                statusLine.textContent = `title: tick ${shown} - cursor ${titleCore ? titleCore.cursor : "-"} - ${state}`;
            }
            btnPlay.textContent = running && !stopped() ? "Pause" : "Play";
            btnStep.disabled = stopped();
            btnPlay.disabled = ended();
            btnSkip.disabled = titleCore === null;
            btnSkipIntro.disabled = !(sega && phase === "sega");
            debug?.updateButtons();
            const notes: string[] = [];
            if (segaError)
                notes.push(`intro not available (${segaError}); the page runs the boot screens, then the title`);
            if (optionsError)
                notes.push(`options screen not available (${optionsError}); the title's OPTIONS item ends the run`);
            if (briefingError)
                notes.push(`briefing screens not available (${briefingError}); the title's start / demo exits end the run`);
            if (attractError)
                notes.push(`attract cycle not available (${attractError}); the idle briefing's exit ends the run`);
            if (charselError)
                notes.push(`character select not available (${charselError}); the new-game briefing's exit ends the run`);
            if (passwordError)
                notes.push(`password screen not available (${passwordError}); the options screen's Password item ends the run`);
            if (storedRecord)
                notes.push(`stored password ${storedCode ?? ""}: level byte ${storedRecord.level_byte} (episode ${episodeOfLevelByte(storedRecord.level_byte)}, floor ${floorOfLevelByte(storedRecord.level_byte)}); the title's Start begins the password game`);
            if (tickKit && tickKit.notes.length > 0)
                notes.push(`tick bundle: ${tickKit.notes.join("; ")}`);
            noteBox.textContent = notes.join(" | ");
            if (exitTo !== null) {
                bannerBox.textContent =
                    exitFrom === "options"
                        ? `Flow.Exit {to: ${exitTo}}: the ${exitTo} screen is out of scope`
                        : exitFrom === "briefing"
                            ? `Flow.Exit {to: ${exitTo}}: the ${exitTo} would start here; it is out of scope`
                            : `Flow.Exit {to: ${exitTo}}: the title ends here; what follows is out of scope`;
                bannerBox.hidden = false;
            }
            else {
                bannerBox.hidden = true;
                bannerBox.textContent = "";
            }
        }
        function present(state: ScreenState, pattern: PatternLookup): void {
            frame = renderState(state, pattern, frame);
            if (canvas.width !== frame.width || canvas.height !== frame.height) {
                canvas.width = frame.width;
                canvas.height = frame.height;
            }
            canvas.style.width = `${frame.width * SCALE}px`;
            canvas.style.height = `${frame.height * SCALE}px`;
            ctx!.putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0);
            const cram = state.cram.join(",");
            if (cram !== lastCram) {
                lastCram = cram;
                state.cram.forEach((w, i) => {
                    const [r, g, b] = colourRgb(w);
                    swatches[i]!.style.background = `rgb(${r},${g},${b})`;
                });
            }
        }
        function runRunTick(render: boolean): void {
            const t = ran;
            const inIntro = sega !== null && t <= handOver;
            const label = inIntro ? `intro tick ${t}` : `boot tick ${sega ? t - handOver : t}`;
            const lines: string[] = [];
            const sink = {
                emit(e: {
                    type?: unknown;
                }): void {
                    if (!String(e.type).startsWith("Audio."))
                        return;
                    lines.push(`${label}: ${describeEvent(e)}`);
                    engine.request(e as AudioRequest);
                },
            };
            let state: ScreenState;
            let model: typeof bootCore.model;
            if (inIntro && sega) {
                state = sega.tick(sink);
                model = sega.model;
                if (t === handOver)
                    bootCore.tick({ emit: () => undefined });
            }
            else {
                state = bootCore.tick(sink);
                model = bootCore.model;
            }
            engine.endTick();
            ran++;
            phase = inIntro ? "sega" : "boot";
            for (const l of lines)
                logLine(l);
            if (render)
                present(state, (slot) => model.pattern(slot));
            if (phase === "boot" && bootFinished())
                startTitle();
        }
        function runScreenTick(): void {
            if (!titleCore || exitTo !== null)
                return;
            const tick = titleRan;
            const screen: "title" | "options" | "briefing" = chain ? chain.phase : "title";
            const lines: string[] = [];
            const asked: {
                exit: string | null;
            } = { exit: null };
            const sink = {
                emit(e: {
                    type?: unknown;
                }): void {
                    const type = String(e.type);
                    if (type.startsWith("Audio.") || type.startsWith("Flow."))
                        lines.push(`${screen} tick ${tick}: ${describeEvent(e)}`);
                    if (type === "Flow.Exit")
                        asked.exit = String((e as {
                            to?: unknown;
                        }).to);
                    if (type.startsWith("Audio."))
                        engine.request(e as AudioRequest);
                },
            };
            const pad = samplePad(screen === "briefing" && chain?.briefing?.padWaits === true);
            const state = chain ? chain.tick(pad, sink) : titleCore.tick(pad, sink);
            engine.endTick();
            titleRan++;
            phase = chain ? chain.shown : "title";
            for (const l of lines)
                logLine(l);
            if (phase === "options" && chain?.options?.showingPassword && passwordCore) {
                drawIndexed({ display: passwordCore.display, cram: passwordCore.cram, indices: passwordCore.indices() });
            }
            else {
                const model = chain ? chain.shownModel() : titleCore.model;
                present(state, (slot) => model.pattern(slot));
            }
            const to = asked.exit;
            if (to === null)
                return;
            if (screen === "title" && to === "options" && chain?.options)
                return;
            if (screen === "options" && to === "options" && chain?.options) {
                const r = chain.options.passwordResult;
                if (r) {
                    if (r.accepted) {
                        storedRecord = r.record;
                        storedCode = r.stored;
                    }
                    else if (passwordCore && [...r.stored].every((ch) => ch.charCodeAt(0) === passwordBlank)) {
                        storedRecord = null;
                        storedCode = null;
                    }
                    logLine(`-- password screen returned: stored ${r.stored}, accepted ${r.accepted}${r.record ? `, record level byte ${r.record.level_byte}, items ${r.record.items.join("/")}, amounts ${r.record.amounts.join("/")}, max health ${r.record.max_health}` : ""}; the options screen goes on (cursor on Exit) --`);
                }
                return;
            }
            if (screen === "title")
                debug?.titleExit(to, chain?.briefing != null);
            if (screen === "briefing") {
                const action = briefingExitAction(to, chain?.briefing?.briefingPath ?? null, { pick: debug?.hasPick ?? false, demoKit: tickKit !== null && rng !== null, charsel: charselKit !== null, storedRecord: storedRecord !== null });
                if (action === "title") {
                    logLine("-- briefing Exit {to: title}: a Start ended the idle briefing's page (ZT-UI-BRIEFING 4.7); the title program restarts at its tick 0, the music plays on --");
                    startTitle([...held].some((code) => KEY_MAP[code] === "start") ? padBit("start") : 0);
                    return;
                }
                if (action === "demo") {
                    debug!.startDemo();
                    return;
                }
                if (action === "end" && debug === null && chain?.briefing?.briefingPath === "demo") {
                    logLine("-- the idle briefing ended: no attract demo on this page; the title program restarts at its tick 0 --");
                    startTitle();
                    return;
                }
                if (action === "new_game") {
                    startNewGame(tickKit!, { kind: "new_game" });
                    return;
                }
                if (action === "password_game") {
                    startNewGame(tickKit!, { kind: "password", record: storedRecord! });
                    return;
                }
            }
            if (screen === "title" && to === "start" && chain?.briefing && chain.startCaseValue === "none" && tickKit && rng && charselKit && storedRecord) {
                logLine(`-- title exit start with the stored password's record (level byte ${storedRecord.level_byte}): no briefing, the character select follows at once --`);
                startNewGame(tickKit, { kind: "password", record: storedRecord });
                return;
            }
            if (screen === "title" && (to === "demo" || to === "start") && chain?.briefing) {
                const which = to === "demo" ? "idle" : chain.startCaseValue === "episode1" ? "entry (episode 1)" : chain.startCaseValue === "episode2" ? "entry (episode 2)" : "new-game";
                logLine(`-- title exit ${to}: the ${which} briefing follows --`);
                return;
            }
            if (screen === "options" && to === "title") {
                logLine("-- options Exit: back to the title; a second visit is not specified (ZT-UI-OPTIONS), the title program restarts at its tick 0 --");
                startTitle();
                return;
            }
            exitTo = to;
            exitFrom = screen;
            running = false;
            latching = false;
        }
        function startNewGame(k: AttractKit, start: NewGameStart): void {
            debug?.clearPick();
            try {
                newGame = new NewGameSession(k, charselKit!.assets, charselKit!.C, rng!, start);
            }
            catch (err) {
                logLine(`-- the character select failed: ${errorText(err)} --`);
                newGame = null;
                exitTo = "game";
                exitFrom = "briefing";
                running = false;
                latching = false;
                return;
            }
            logLine(`-- character select (ZT-UI-CHARSEL): cursor 0, ${start.kind === "password" ? `the record's alive flags ${start.record.alive.join("")}` : "all five alive"}; Up / Down = card, Enter / A / S / D = confirm --`);
            phase = "newgame";
            frame = undefined;
            lastCram = "";
            latched.clear();
            latching = running;
            drawIndexed(newGame.picture());
        }
        function drawIndexed(pic: IndexedPicture): void {
            if (!tickKit)
                return;
            const W = tickKit.screenW;
            const H = tickKit.screenH;
            if (canvas.width !== W || canvas.height !== H) {
                canvas.width = W;
                canvas.height = H;
                newGameImage = null;
            }
            canvas.style.width = `${W * SCALE}px`;
            canvas.style.height = `${H * SCALE}px`;
            newGameImage = newGameImage ?? ctx!.createImageData(W, H);
            const px = newGameImage.data;
            const rgb = pic.cram.map(colourRgb);
            const back = rgb[0] ?? [0, 0, 0];
            const n = W * H;
            for (let i = 0; i < n; i++) {
                let c: readonly [
                    number,
                    number,
                    number
                ] = back;
                if (pic.display === 1 && pic.indices !== null) {
                    const idx = pic.indices[i]!;
                    c = pic.nothing !== undefined && idx === pic.nothing ? back : (rgb[idx] ?? back);
                }
                px[i * 4] = c[0];
                px[i * 4 + 1] = c[1];
                px[i * 4 + 2] = c[2];
                px[i * 4 + 3] = 255;
            }
            ctx!.putImageData(newGameImage, 0, 0);
            const cramKey = pic.cram.join(",");
            if (cramKey !== lastCram) {
                lastCram = cramKey;
                pic.cram.forEach((w, i) => {
                    const [r, g, b] = colourRgb(w);
                    swatches[i]!.style.background = `rgb(${r},${g},${b})`;
                });
            }
        }
        function runNewGameTick(): void {
            if (!newGame)
                return;
            const lines: string[] = [];
            const stageBefore = newGame.stage;
            const frameBefore = newGame.charsel.frame + 1;
            const sink = {
                emit(e: {
                    type?: unknown;
                }): void {
                    const type = String(e.type);
                    if (type === "Audio.Request" || type === "Flow.Exit")
                        lines.push(`select frame ${frameBefore}: ${describeEvent(e)}`);
                    if (type.startsWith("Audio."))
                        engine.request(e as AudioRequest);
                },
            };
            let padNow = samplePad();
            const levelRun = newGame.stage === "play" && !debug?.tas ? newGame.run : null;
            if (levelRun) {
                modernNow = modernForTick(newGame, host?.modern, modernNow);
                if (modernNow !== null) {
                    setModern(levelRun.state, 0, modernNow);
                    padNow = modernPadByte(modernNow.input);
                }
                else if (levelRun.state.modern !== undefined)
                    setModern(levelRun.state, 0, null);
            }
            const res = newGame.tick(padNow, sink, blankCounter);
            if (res.sounds.length > 0)
                playSounds(res.sounds, stageBefore === "level_start" ? `level start t = ${newGame.t}` : stageBefore === "pause" || newGame.stage === "pause" ? `pause frame ${newGame.pauseFrames}` : stageBefore === "death_select" || newGame.stage === "death_select" ? `death select frame ${newGame.deathSelectFrames}` : stageBefore === "game_over" || newGame.stage === "game_over" ? `game over frame ${newGame.gameOverFrames}` : stageBefore === "restart_setup" ? `restart set-up t = ${newGame.t}` : `iteration ${newGame.k - 1}`);
            else
                engine.endTick();
            for (const l of lines)
                logLine(l);
            for (const l of res.log)
                logLine(l);
            if (res.changed || newGame.stage !== stageBefore)
                drawIndexed(newGame.picture());
            if (newGame.exitStartup) {
                logLine("-- the game ended (game over, or the ending's cold reset): Flow.Exit {to: startup}; the start-up runs again --");
                restart();
                return;
            }
            if (newGame.stage === "ended") {
                running = false;
                latching = false;
                bannerBox.textContent = newGame.lastError !== "" ? `the level stopped: ${newGame.lastError}` : "the level ended (the tail's exit); what follows is out of scope";
                bannerBox.hidden = false;
            }
        }
        function playSounds(events: readonly SoundEvent[], label: string): void {
            for (const e of events) {
                if (e.type === "Audio.PlayMusic" || e.type === "Audio.PlaySfx" || e.type === "Audio.PlayVoice")
                    logLine(`${label}: ${describeEvent(e)}`);
                if (e.type === "Audio.Pause") {
                    logLine(`${label}: Audio.Pause (the pause screen)`);
                    engine.pause();
                    continue;
                }
                if (e.type === "Audio.Resume") {
                    logLine(`${label}: Audio.Resume`);
                    engine.unpause();
                    continue;
                }
                engine.request(e as AudioRequest);
            }
            engine.endTick();
        }
        let modernNow: ModernDescriptor | null = null;
        function runOneTick(): void {
            setCheatRules(host?.cheats?.());
            if (debug?.tasTick())
                return;
            blankCounter = (blankCounter + 1) & 0xffff;
            if (phase === "demo")
                debug?.demoTick();
            else if (phase === "newgame")
                runNewGameTick();
            else if (onScreen())
                runScreenTick();
            else
                runRunTick(true);
        }
        function startTitle(heldPad = 0): void {
            if (!titleCore)
                return;
            phase = "title";
            debug?.clear();
            newGame = null;
            frame = undefined;
            if (chain) {
                chain.reset(heldPad);
                let startCase: "start" | "episode1" | "episode2" | "none" = "start";
                if (storedRecord) {
                    const ep = episodeOfLevelByte(storedRecord.level_byte);
                    const floor = floorOfLevelByte(storedRecord.level_byte);
                    startCase = floor === 0 && ep === 1 ? "episode1" : floor === 0 && ep === 2 ? "episode2" : "none";
                }
                chain.setStartCase(startCase);
                if (chain.options && storedCode !== null)
                    chain.options.setStoredPassword(storedCode);
            }
            else
                titleCore.reset();
            titleRan = 0;
            exitTo = null;
            latched.clear();
            latching = running;
            lastCram = "";
            accumulator = 0;
            lastNow = performance.now();
            logLine("-- title --");
        }
        function skipIntro(): void {
            if (!sega || phase !== "sega")
                return;
            while (ran <= handOver)
                runRunTick(ran === handOver);
            running = true;
            engine.unpause();
            accumulator = 0;
            lastNow = performance.now();
            logLine("-- intro skipped --");
        }
        function restart(): void {
            if (sega)
                sega.reset();
            bootCore.reset();
            phase = sega ? "sega" : "boot";
            debug?.clear();
            newGame = null;
            storedRecord = null;
            storedCode = null;
            blankCounter = 0;
            frame = undefined;
            if (tickKit)
                rng = new LcgRng(tickKit.hostSeed, tickKit.lcg);
            ran = 0;
            titleRan = 0;
            exitTo = null;
            running = true;
            latching = false;
            latched.clear();
            lastCram = "";
            accumulator = 0;
            lastNow = performance.now();
            logBox.textContent = "";
            engine.stopAll();
            engine.unpause();
            ctx!.clearRect(0, 0, canvas.width, canvas.height);
            updateStatus();
        }
        btnPlay.addEventListener("click", () => {
            if (ended())
                return;
            if (phase === "boot" && bootFinished())
                restart();
            else
                running = !running;
            if (running)
                engine.unpause();
            else
                engine.pause();
            latching = (onScreen() || phase === "newgame") && running;
            latched.clear();
            lastNow = performance.now();
            accumulator = 0;
            updateStatus();
        });
        btnStep.addEventListener("click", () => {
            if (stopped())
                return;
            running = false;
            latching = false;
            runOneTick();
            updateStatus();
        });
        btnRestart.addEventListener("click", () => {
            debug?.stopTas();
            restart();
        });
        btnSkipIntro.addEventListener("click", () => {
            skipIntro();
            updateStatus();
        });
        btnSkip.addEventListener("click", () => {
            if (!titleCore)
                return;
            running = true;
            engine.unpause();
            startTitle();
            updateStatus();
        });
        function levelWait(): number | null {
            if (phase === "demo")
                return debug?.demoLevelWait() ?? null;
            if (phase === "newgame" && newGame && newGame.stage === "play")
                return newGame.pendingWait;
            return null;
        }
        let lastPace: unknown = null;
        function loop(now: number): void {
            const pace = host?.pace ?? null;
            if (pace && running && !stopped() && !debug?.tas && levelWait() !== null) {
                if (pace !== lastPace) {
                    pace.start(now);
                    lastPace = pace;
                }
                if (pace.poll(now) > 0) {
                    while ((levelWait() ?? 0) > 1 && running && !stopped())
                        runOneTick();
                    if (running && !stopped())
                        runOneTick();
                }
                accumulator = 0;
                updateStatus();
                lastNow = now;
                requestAnimationFrame(loop);
                return;
            }
            lastPace = null;
            if (running && !stopped()) {
                accumulator += now - lastNow;
                let n = 0;
                while (accumulator >= TICK_MS && n < MAX_CATCH_UP && !stopped() && running) {
                    runOneTick();
                    accumulator -= TICK_MS;
                    n++;
                }
                if (n === MAX_CATCH_UP)
                    accumulator = 0;
                updateStatus();
            }
            lastNow = now;
            requestAnimationFrame(loop);
        }
        const control: CoreControl = {
            get phase() { return phase; },
            set phase(p: Phase) { phase = p; },
            get rng() { return rng; },
            set rng(r: LcgRng | null) { rng = r; },
            get running() { return running; },
            set running(v: boolean) { running = v; },
            set latching(v: boolean) { latching = v; },
            get blankCounter() { return blankCounter; },
            tickKit, titleCore, canvas, scale: SCALE, engine, logBox,
            clearLatched: () => latched.clear(),
            resetPicture: () => { frame = undefined; lastCram = ""; },
            resetClock: () => { accumulator = 0; lastNow = performance.now(); },
            endRun: (to: string, from: "title" | "options" | "briefing") => { exitTo = to; exitFrom = from; running = false; latching = false; },
            clearExit: () => { exitTo = null; },
            logLine, playSounds, present, drawIndexed, startTitle, restart, updateStatus, samplePad, describeEvent, errorText, fetchJson,
        };
        debug = makeDebug ? makeDebug(control) : null;
        if (host) {
            host.api = {
                engine,
                pause(): void {
                    if (!running)
                        return;
                    running = false;
                    engine.pause();
                    latching = false;
                    latched.clear();
                    updateStatus();
                },
                resume(): void {
                    if (running || stopped())
                        return;
                    running = true;
                    engine.unpause();
                    latching = (onScreen() || phase === "newgame") && running;
                    latched.clear();
                    lastNow = performance.now();
                    accumulator = 0;
                    updateStatus();
                },
                saveState() {
                    if (!tickKit || !charselKit || !rng || phase !== "newgame" || (debug?.busy ?? false) || !canSave(newGame))
                        return null;
                    return { state: saveCore({ session: newGame!, rng, blank: blankCounter }, { tickKit, charselAssets: charselKit.assets, charselC: charselKit.C }), episode: newGame!.episode, floor: newGame!.floor };
                },
                loadState(state: string): boolean {
                    if (!tickKit || !charselKit)
                        return false;
                    let loaded;
                    try {
                        loaded = loadCore(state, { tickKit, charselAssets: charselKit.assets, charselC: charselKit.C });
                    }
                    catch (err) {
                        logLine(`-- the state could not be loaded: ${errorText(err)} --`);
                        return false;
                    }
                    debug?.dropAll();
                    exitTo = null;
                    newGame = loaded.session;
                    rng = loaded.rng;
                    blankCounter = loaded.blank;
                    phase = "newgame";
                    frame = undefined;
                    lastCram = "";
                    latched.clear();
                    bannerBox.hidden = true;
                    engine.stopAll();
                    const music = newGame.run?.startMusic ?? [];
                    if (music.length > 0)
                        playSounds(music, "state load");
                    else
                        engine.endTick();
                    drawIndexed(newGame.picture());
                    logLine(`-- state loaded: episode ${newGame.episode} floor ${newGame.floor}, iteration ${newGame.k} --`);
                    updateStatus();
                    return true;
                },
                powerOnWithPassword(code: string, skipIntro: boolean): boolean {
                    if (passwordResult.status !== "fulfilled")
                        return false;
                    const record = passwordResult.value.decoder(code, [0, 0, 0, 0, 0]);
                    if (record === null)
                        return false;
                    debug?.dropAll();
                    restart();
                    storedRecord = record;
                    storedCode = code;
                    logLine(`-- power-on with the kept password ${code}: level byte ${record.level_byte} (ZT-APP-RELEASE 4.5) --`);
                    if (skipIntro)
                        host.api!.skipToTitle();
                    return true;
                },
                setModern(desc: ModernDescriptor | null): void {
                    modernNow = desc;
                },
                coopCore(point: CoopStartPoint, seed: number, offsetX: number, characters: readonly [
                    number,
                    number
                ], rules?: SeatRules): NetCore | null {
                    if (!tickKit || !charselKit)
                        return null;
                    let start: NewGameStart;
                    if (point.kind === "password") {
                        if (passwordResult.status !== "fulfilled")
                            return null;
                        const record = passwordResult.value.decoder(point.code, [0, 0, 0, 0, 0]);
                        if (!record)
                            return null;
                        start = { kind: "password", record };
                    }
                    else if (point.episode === 0)
                        start = { kind: "new_game" };
                    else
                        return null;
                    return coopStartCore({ tickKit, charselAssets: charselKit.assets, charselC: charselKit.C }, start, seed, characters, offsetX, rules);
                },
                coopScreens(prefill: () => string | null): CoopScreens | null {
                    if (!titleCore || !charselKit || !tickKit)
                        return null;
                    const pk = passwordResult.status === "fulfilled" ? passwordResult.value : null;
                    return coopScreens({
                        title: { assets: titleCore.assets, C: titleCore.C },
                        options: optionsCore ? { assets: optionsCore.assets, C: optionsCore.C } : null,
                        password: pk ? { assets: pk.assets, C: pk.C, decoder: pk.decoder } : null,
                        charsel: { assets: charselKit.assets, C: charselKit.C },
                        briefing: briefingCore ? { assets: briefingCore.assets, C: briefingCore.C } : null,
                        screenW: tickKit.screenW, screenH: tickKit.screenH,
                    }, prefill);
                },
                coopScreenEvents(events: readonly unknown[]): void {
                    for (const e of events)
                        if (String((e as {
                            type?: unknown;
                        }).type).startsWith("Audio."))
                            engine.request(e as AudioRequest);
                    engine.endTick();
                },
                coopSounds(json: readonly string[]): void {
                    const evs = json.map((j) => JSON.parse(j) as SoundEvent);
                    if (evs.length > 0)
                        playSounds(evs, "co-op step");
                },
                passwordNow() {
                    if (phase !== "newgame" || (debug?.busy ?? false) || !canSave(newGame))
                        return null;
                    const run = newGame!.run!;
                    const code = passwordOfRunningState(run.state, run.deps.env.passwordCodec);
                    return code === null ? null : { code, episode: newGame!.episode, floor: newGame!.floor };
                },
                skipToTitle(): void {
                    if (!titleCore)
                        return;
                    running = true;
                    engine.unpause();
                    startTitle();
                    for (const [opcode, value] of [[titleCore.C.MUSIC_1_OPCODE, titleCore.C.MUSIC_1_VALUE], [titleCore.C.MUSIC_2_OPCODE, titleCore.C.MUSIC_2_VALUE]] as const) {
                        engine.request({ type: "Audio.PlayMusic", opcode, value } as AudioRequest);
                    }
                    updateStatus();
                },
            };
        }
        if (sega)
            sega.reset();
        bootCore.reset();
        updateStatus();
        requestAnimationFrame(loop);
    }
    main().catch((err: unknown) => showError(errorText(err)));
}

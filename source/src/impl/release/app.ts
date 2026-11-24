/// <reference lib="dom" />
import { NO_LEVEL_NOTICE, buildMoment, momentFileName, savedNotice } from "./moment.js";
import { downloadText, momentPictures } from "./moment_page.js";
import type { AppConstants } from "./constants.js";
import type { AssetStore } from "./store.js";
import { GameHost } from "./game.js";
import { pagePackDoc } from "./page_pack.js";
import type { BundleSource } from "./game.js";
import { clearBinding, clearModernBinding, inputRowLayout, isClearKey, type ClearPart, type InputRowDesc } from "./input_rows.js";
import { numberCells, numberClick, numberKey } from "./number_row.js";
import type { NumberRow } from "./number_row.js";
import { ACTIONS, HOTKEYS, InputState, defaultKeyBindings, defaultPadBindings, rebindKey, rebindPad } from "./input.js";
import type { Action } from "./input.js";
import { TouchVisibility } from "./touch.js";
import { TouchOverlay } from "./touch_dom.js";
import { OriginalMouse } from "./mouse.js";
import { PointerFilter } from "./pointer_filter.js";
import { turnBacklogText } from "./input_rows.js";
import type { CaptureMode } from "./mouse_dom.js";
import { attachMouse } from "./mouse_dom.js";
import { installMotionLogInBrowser, motionLogKey } from "./motion_log.js";
import type { InstalledMotionLog } from "./motion_log.js";
import { MODERN_ACTIONS, ModernInputState, defaultModernBindings, modernCapsFrom, mouseCode, rebindModern, wheelCode } from "./modern_input.js";
import type { ModernAction, ModernConfig } from "./modern_input.js";
import { OwnStepsSinceSnapshot, coopSeatPlays, predictedTurn, storedTurnsAfter } from "./own_turn.js";
import type { CoopLive } from "./coop_live.js";
import type { ModernDescriptor } from "../modern/seat.js";
import { MODERN_IDLE } from "../modern/canonical.js";
import { CHARACTER_NAMES, createCoopPage, onlineConnector } from "./coop_dom.js";
import type { CoopPageController, WaitingScreen } from "./coop_dom.js";
import { REASON_OWN_ERROR } from "../net/rollback.js";
import { padPoll } from "./pad_poll.js";
import { paintScreen, realGameOver, realOwnPause, realPartnerInfo, realSeatScreen, seatHearsEffect } from "./coop_live.js";
import { STEP_CLOCK_TICK_MS, STEP_CLOCK_WORKER_SOURCE, workerStepClock } from "./step_clock.js";
import type { ClockWorker } from "./step_clock.js";
import { netConstantsFrom } from "../net/constants.js";
import { ORIGINAL_SCHEME, packModernPad } from "../net/scheme.js";
import type { SeatScheme } from "../net/scheme.js";
import type { NetConstants } from "../net/constants.js";
import { GAMEPLAY_ROW, MenuModel, ROWS, menuKeyOf } from "./menu.js";
import { SetupWizard, VOICE_INTERVAL_LABEL, closeWizard, finishWizard, withWizardValues } from "./wizard.js";
import type { MenuEffect, MenuKey, PageId } from "./menu.js";
import { CHEAT_ROWS, FIX990_ROW, cheatValue, stepCheat } from "./cheats_page.js";
import { freeEntryProblem, loadAlphabet, loadPasswords } from "./quickstart.js";
import type { PasswordRow } from "./quickstart.js";
import { checkPassword, clearSlot, loadExtraCodes, normalizeEntry, readSlots as readPasswordSlots, storeInSlot } from "./passwords.js";
import type { ExtraCode, PasswordTarget } from "./passwords.js";
import { passwordCodecFrom } from "../password/codec.js";
import type { PasswordCodecTables } from "../password/codec.js";
import { slotLabel, slotNumbers, slotStatus, stateStorage } from "./states.js";
import type { StateRecord } from "./states.js";
import { defaultSettings, loadSettings, saveSettings } from "./settings.js";
import type { IntroMode, KeyValueStorage, Settings } from "./settings.js";
import { RENDERER_LABELS, rendererChoice } from "./settings.js";
import { GAMEPLAY_ROW_IDS, HAND_SIZE_MAX_TENTHS, HAND_SIZE_MIN_TENTHS, INTRO_MODES, VOICE_INTERVAL_MAX, VOICE_INTERVAL_MIN, VOICE_MODES, cycle, adjustHdRow, drawnRenderer, hdDrawSettings, rendererNote, videoRowIds } from "./settings.js";
import type { FovRange, GameplayRowId, VideoRowId } from "./settings.js";
import { mountPing, pingRefresher } from "./ping.js";
import { hasWebgl2 } from "./webgl2_check.js";
import { hdConstantsFrom } from "../rend/hd/constants.js";
import { placeConstantsFrom, setPlaceConstants } from "../coop/place.js";
import type { GameViewGuard } from "./leaving.js";
import { ABOUT_ROWS, StorageQuestion } from "./storage_actions.js";
export interface ReleaseDeps {
    consts: AppConstants;
    store: AssetStore;
    md5: string;
    version: string;
    storage: KeyValueStorage | undefined;
    onReextract(): void;
    onForget(): Promise<void>;
    onResetSettings?(): Promise<void>;
    onClearAssets?(): Promise<void>;
    bundleSource?: BundleSource;
    passwordsJson?: unknown;
    alphabetJson?: unknown;
    guard?: GameViewGuard;
    hdJson?: unknown;
    webgl2?: boolean;
}
export const PASSWORD_URLS: readonly string[] = ["password_floors"];
export const ALPHABET_URLS: readonly string[] = ["password_codec"];
export const MODERN_URLS: readonly string[] = ["player_modern"];
export const NET_URLS: readonly string[] = ["net_rollback"];
export const COOP_URLS: readonly string[] = ["coop"];
export const HD_URLS: readonly string[] = ["rend_hd"];
const SEED_RANGE = 2 ** 32;
const STEP_CLOCK_WORKER_FILE = "dist/impl/release/step_clock_worker.js";
const FREE_ENTRY_LENGTH = 9;
const fetchFirst = (names: readonly string[]): Promise<unknown> => pagePackDoc(names);
const ACTION_LABELS: Readonly<Record<Action, string>> = {
    up: "Up", down: "Down", left: "Left", right: "Right", a: "A", b: "B", c: "C", start: "Start",
    a_up: "A + Up", a_down: "A + Down", a_left: "A + Left", a_right: "A + Right",
    menu: "Menu", fullscreen: "Full screen", mute: "Mute", state_save: "Save state (slot 1)", state_load: "Load state (slot 1)",
    pw_save: "Save password",
};
const MODERN_LABELS: Readonly<Record<ModernAction, string>> = {
    forward: "Forward", back: "Back", strafeLeft: "Strafe left", strafeRight: "Strafe right", turnLeft: "Turn left", turnRight: "Turn right",
    jump: "Jump", crouch: "Crouch", fire: "Fire", nextItem: "Next item", prevItem: "Previous item",
    slot1: "Slot 1", slot2: "Slot 2", slot3: "Slot 3", slot4: "Slot 4", slot5: "Slot 5", pause: "Pause (Start)",
};
const PERCENT_MAX = 100;
const INTRO_LABELS: Readonly<Record<IntroMode, string>> = { none: "None", start: "By Start button", skip: "Skip" };
export const STYLE = `
.zt-root{position:fixed;inset:0;background:#000;color:#ddd;font:16px/1.5 sans-serif}
.zt-menu{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);z-index:2}
.zt-panel{min-width:360px;max-width:92vw;max-height:92vh;overflow:auto;padding:16px 24px;border:1px solid #666;background:#111}
.zt-panel h1{font-size:20px;margin:0 0 8px}
.zt-row{padding:2px 10px;cursor:pointer;display:flex;justify-content:space-between;gap:24px}
.zt-row.sel{background:#335;color:#fff}
.zt-back{padding:2px 10px;margin-top:8px;cursor:pointer;border-top:1px solid #444}
.zt-cell{padding:0 2px;cursor:pointer}
.zt-mark{padding:0 6px;cursor:pointer}
.zt-mark.dim{opacity:.3;cursor:default}
.zt-note{color:#999;font-size:13px;margin-top:8px}
.zt-version{color:#777;font-size:11px;margin-top:8px}
.zt-game{position:absolute;inset:0;z-index:0;isolation:isolate}
.zt-panel.zt-wait{position:absolute;inset:0;max-width:none;max-height:none;border:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}
.zt-spin{width:48px;height:48px;border:4px solid #444;border-top-color:#ddd;border-radius:50%}
[hidden]{display:none !important}
`;
export async function mountRelease(container: HTMLElement, deps: ReleaseDeps): Promise<() => void> {
    const c = deps.consts;
    const hdDoc = deps.hdJson ?? (await fetchFirst(HD_URLS).catch(() => undefined));
    const hdC = hdDoc === undefined ? null : hdConstantsFrom(hdDoc);
    const fovRange: FovRange | undefined = hdC ? { min: hdC.FOV.MIN, max: hdC.FOV.MAX } : undefined;
    const webgl2 = deps.webgl2 ?? hasWebgl2(() => document.createElement("canvas"));
    let settings: Settings = loadSettings(deps.storage, c, fovRange);
    const input = new InputState(settings.input.keys, settings.input.pad, c.pad.stickDeadZone);
    const menu = new MenuModel(false);
    let menuOpen = true;
    let latch = 0;
    let capture: {
        action: Action;
    } | null = null;
    let note = "";
    const touchVis = new TouchVisibility(settings.input.touch);
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);
    container.classList.add("zt-root");
    const gameDiv = document.createElement("div");
    gameDiv.className = "zt-game";
    const menuDiv = document.createElement("div");
    menuDiv.className = "zt-menu";
    const panel = document.createElement("div");
    panel.className = "zt-panel";
    menuDiv.appendChild(panel);
    container.append(gameDiv, menuDiv);
    const touch = new TouchOverlay(gameDiv, c, (actions) => {
        const before = input.controllerByte();
        input.setTouch(actions);
        latch |= input.controllerByte() & ~before;
        for (const e of input.takeEdges())
            onAction(e);
    });
    const noticeDiv = document.createElement("div");
    noticeDiv.style.cssText = "position:absolute;left:0;right:0;top:0;padding:4px 12px;background:rgba(0,0,0,.7);font:14px sans-serif;z-index:3;text-align:center";
    noticeDiv.hidden = true;
    container.appendChild(noticeDiv);
    let noticeTimer: ReturnType<typeof setTimeout> | null = null;
    const showNotice = (text: string): void => {
        noticeDiv.textContent = text;
        noticeDiv.hidden = false;
        if (noticeTimer)
            clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => { noticeDiv.hidden = true; }, c.pw.noticeMs);
    };
    const mouse = new OriginalMouse(c.mouse, settings.input.mouse.sensitivity);
    const pointer = new PointerFilter(c.mouse);
    let captureMode: CaptureMode = "plain";
    const modernOn = (): boolean => settings.input.scheme === "modern";
    mouse.enabled = settings.input.mouse.enabled || modernOn();
    const modernCfg = (): ModernConfig => ({
        bindings: settings.input.modern.keys, mouse: settings.input.modern.mouse,
        turnCap: settings.input.modern.turn_cap, crouchToggle: settings.input.modern.crouch_toggle,
        turnBacklogSteps: settings.input.modern.turn_backlog === "steps6" ? c.modern.turnBacklogSteps : null,
    });
    let modernIn: ModernInputState | null = null;
    let modernCapture: ModernAction | null = null;
    void fetchFirst(MODERN_URLS).then((doc) => { modernIn = new ModernInputState(modernCfg(), modernCapsFrom(doc)); }, () => { note = "The Modern scheme's data could not be loaded: the Original scheme is used."; if (menuOpen)
        render(); });
    const modernLive = (): ModernInputState | null => (modernOn() ? modernIn : null);
    const syncModern = (): void => {
        modernIn?.configure(modernCfg());
        mouse.enabled = settings.input.mouse.enabled || modernOn();
        if (!mouse.enabled)
            mouseAtt.release();
        menu.setItemCount("input", items("input").length);
    };
    let motion: InstalledMotionLog | null = null;
    let mouseBits = 0;
    const mouseAtt = attachMouse(gameDiv, mouse, () => game.running && !menuOpen, () => {
        if (!menuOpen) {
            menu.open(gameOn(), canSavePassword());
            setMenuOpen(true);
            render();
        }
    }, {
        move: (dx) => pointer.add(dx, performance.now()),
        raw: () => settings.input.mouse.raw,
        onMode: (m) => { captureMode = m; },
        onRelease: () => { pointer.reset(); },
    });
    const syncTouch = (): void => touch.setVisible(game.running && !menuOpen && touchVis.visible);
    const save = (): void => { saveSettings(deps.storage, c, settings, fovRange); };
    const game = new GameHost({
        container: gameDiv, consts: c, store: deps.store, md5: deps.md5, version: deps.version,
        getSettings: () => settings,
        pad: () => {
            const v = menuOpen ? 0 : latch | input.controllerByte() | (modernOn() ? 0 : mouseBits);
            latch = 0;
            motion?.log.noteControllerByte(v);
            return v;
        },
        modern: (): ModernDescriptor | null => {
            const m = modernLive();
            if (m === null)
                return null;
            const stepInput = m.stepInput();
            ownSteps.ran(stepInput.mouse_turn);
            motion?.log.noteModernMouseTurn(stepInput.mouse_turn);
            return { scheme: "modern", turnCap: settings.input.modern.turn_cap, selection: settings.input.modern.selection, input: stepInput };
        },
        modernTurn: (newestStep, onePlayerPlays) => {
            const m = modernLive();
            if (m === null || (coopSession && sessionScheme.scheme !== "modern"))
                return null;
            newestKeptStep = newestStep;
            if (coopSession) {
                const pg = coopLiveNow?.coop.page;
                if (!pg)
                    return 0;
                return predictedTurn({ played: coopSeatPlays(pg, pg.seat, menuOpen), stored: storedTurnsAfter(pg, newestStep).sum, pending: m.pendingMouseTurn(), delay: pg.delay, mouseTurnMax: m.mouseTurnMax });
            }
            const played = onePlayerPlays && !menuOpen;
            if (!played)
                ownSteps.clear();
            return predictedTurn({ played, stored: ownSteps.sum, pending: m.pendingMouseTurn(), delay: 0, mouseTurnMax: m.mouseTurnMax });
        },
        webgl2,
        ...(deps.bundleSource ? { bundleSource: deps.bundleSource } : {}),
    });
    (globalThis as {
        __ztTurnCarry?: (step: number | null) => void;
    }).__ztTurnCarry = (step) => { if (step === null)
        ownSteps.snapshot(); };
    motion = installMotionLogInBrowser({
        settings: () => ({
            renderer: settings.video.renderer, layout: settings.video.hd.layout, smoothMotion: settings.video.hd.smooth_motion, resolution: settings.video.hd.resolution,
            speedMode: settings.speed.mode, customStepsPerSecond: settings.speed.custom_steps, inputScheme: settings.input.scheme,
            originalMouseEnabled: settings.input.mouse.enabled, originalMouseSensitivity: settings.input.mouse.sensitivity,
            modernMouseSensitivity: settings.input.modern.mouse.sensitivity, modernMouseAcceleration: settings.input.modern.mouse.accel,
            modernMouseDeceleration: settings.input.modern.mouse.decel, modernMouseSmoothingSteps: settings.input.modern.mouse.smoothing, modernTurnCap: settings.input.modern.turn_cap,
            modernTurnBacklog: settings.input.modern.turn_backlog, rawMouse: settings.input.mouse.raw, captureMode,
            devicePixelRatio: window.devicePixelRatio, innerWidthPx: window.innerWidth, innerHeightPx: window.innerHeight,
        }),
        renderer: () => settings.video.renderer,
        mouseLocked: () => mouseAtt.locked,
        levelPlayed: () => levelPlayedNow(),
        bobUnits: c.motionLogBobUnits,
        notice: (text) => showNotice(text),
    });
    interface Item {
        label: string;
        value: string;
        cells?: {
            id: "saved" | "default" | "save" | "load" | "no" | "yes";
            text: string;
        }[];
        group?: string;
        num?: NumberRow;
        keyText?: string;
        padText?: string;
        clear?: (part: ClearPart) => void;
    }
    let passwords: PasswordRow[] | null = null;
    let alphabet = "";
    let freeEntry: string | null = null;
    let extras: ExtraCode[] = [];
    let codec: PasswordCodecTables | null = null;
    const pwCell: ("saved" | "default")[] = [];
    const check = (code: string): PasswordTarget | null => (codec ? checkPassword(codec, code) : null);
    const savedSlots = (): string[] => readPasswordSlots(settings.passwords.saved, c.pw.slots, codec ? check : null);
    const levelName = (t: {
        episode: number;
        floor: number;
    }): string => passwords?.find((r) => r.episode === t.episode && r.floor === t.floor)?.name ?? `episode ${t.episode + 1} floor ${t.floor}`;
    let coopSession = false;
    let coopLiveNow: CoopLive | null = null;
    let newestKeptStep: number | null = null;
    const ownSteps = new OwnStepsSinceSnapshot();
    const gameOn = (): boolean => game.running || coopSession || (coopCtl?.inSession ?? false);
    let sessionScheme: SeatScheme = ORIGINAL_SCHEME;
    const characterPair = (v: unknown): readonly [
        number,
        number
    ] => (Array.isArray(v) && typeof v[0] === "number" && typeof v[1] === "number" ? [v[0], v[1]] : [0, 0]);
    let coopCtl: CoopPageController | null = null;
    function leaveGameView(): void {
        coopCtl?.quit();
        stopPing();
        game.coopHdHide();
        coopSession = false;
        partnerDiv.hidden = true;
    }
    function dropSessionView(): void {
        stopPing();
        game.coopHdHide();
        coopSession = false;
        partnerDiv.hidden = true;
    }
    function endCoopGame(): void {
        if (coopCtl === null || !(coopSession || coopCtl.inSession))
            return;
        leaveGameView();
    }
    let coopError = "";
    const pingPlate = mountPing(gameDiv);
    let pingStop: {
        stop(): void;
    } | null = null;
    const stopPing = (): void => { pingStop?.stop(); pingStop = null; pingPlate.set(null); };
    const partnerDiv = document.createElement("div");
    partnerDiv.style.cssText = "position:absolute;left:0;right:0;bottom:0;padding:4px 12px;background:rgba(0,0,0,.7);font:14px sans-serif;z-index:3;text-align:center";
    partnerDiv.hidden = true;
    container.appendChild(partnerDiv);
    const unguard = deps.guard?.add(() => leaveGameView()) ?? ((): void => undefined);
    async function prepareCoop(): Promise<void> {
        if (coopCtl)
            return;
        try {
            const [netDoc, coopDoc, pwDoc] = await Promise.all([fetchFirst(NET_URLS), fetchFirst(COOP_URLS), deps.passwordsJson ?? fetchFirst(PASSWORD_URLS)]);
            const net: NetConstants = netConstantsFrom(netDoc as Parameters<typeof netConstantsFrom>[0]);
            setPlaceConstants(placeConstantsFrom(coopDoc));
            const offsetX = (coopDoc as {
                constants: {
                    id: string;
                    value: unknown;
                }[];
            }).constants.find((x) => x.id === "COOP.START_OFFSET_X")?.value;
            if (typeof offsetX !== "number")
                throw new Error("coop.json: no COOP.START_OFFSET_X");
            const coopValue = (id: string): number => { const v = (coopDoc as {
                constants: {
                    id: string;
                    value: unknown;
                }[];
            }).constants.find((x) => x.id === id)?.value; if (typeof v !== "number")
                throw new Error(`coop.json: no ${id}`); return v; };
            const voices = coopValue("COOP.SOUND.VOICES");
            const seatRules = { bodyRadius: coopValue("COOP.BODY_RADIUS"), exitCountdown: coopValue("COOP.EXIT_COUNTDOWN") };
            loadPasswords(pwDoc);
            if (!(await game.coopReady()))
                throw new Error("the game core did not come up");
            const screens = game.coopScreens(() => coopCtl?.hostStart?.code ?? null);
            if (screens === null)
                throw new Error("the title menu or the character select is not loaded");
            coopCtl = createCoopPage({
                passwordChoice: { rows: () => passwords, extras: () => extras, saved: () => savedSlots(), check, levelName, store: storePassword, load: loadPasswordList },
                net, app: c, getSettings: () => settings, hello: { version: c.appVersion, md5: deps.md5 },
                connector: (server, reach) => onlineConnector(server, settings, net, undefined, reach),
                page: { protocol: location.protocol, host: location.host },
                saveServer: (server) => { settings = { ...settings, net: { ...settings.net, server } }; save(); },
                makeCore: (start) => {
                    const point = start.options["start"] as Parameters<GameHost["coopCore"]>[0];
                    const core = game.coopCore(point, start.seed, offsetX, characterPair(start.options["characters"]), seatRules);
                    if (core === null)
                        throw new Error("this start point could not be built");
                    return core;
                },
                scheme: (): SeatScheme => {
                    sessionScheme = modernLive() !== null ? { scheme: "modern", turnCap: settings.input.modern.turn_cap, selection: settings.input.modern.selection } : ORIGINAL_SCHEME;
                    return sessionScheme;
                },
                screens, onScreenEvents: (evs) => { game.coopScreenEvents(evs); },
                sessionAudio: (seat) => { game.coopAudio(seat === null ? null : { seat, voices }); },
                characterNames: CHARACTER_NAMES,
                live: {
                    now: () => performance.now(),
                    pad: () => {
                        readGamepad();
                        const v = latch | input.controllerByte();
                        latch = 0;
                        if (sessionScheme.scheme === "modern") {
                            const m = modernLive();
                            return packModernPad(m === null ? MODERN_IDLE : m.stepInput(), v);
                        }
                        return v;
                    },
                    menuOpen: () => menuOpen,
                    turnsSent: () => { const pg = coopLiveNow?.coop.page; return pg && sessionScheme.scheme === "modern" ? storedTurnsAfter(pg, newestKeptStep).turns : []; },
                    drawScreen: (pic) => {
                        game.coopHdHide();
                        const ctx = game.canvasElement?.getContext("2d");
                        if (!ctx)
                            return;
                        if (ctx.canvas.width !== pic.width || ctx.canvas.height !== pic.height) {
                            ctx.canvas.width = pic.width;
                            ctx.canvas.height = pic.height;
                        }
                        ctx.putImageData(new ImageData(new Uint8ClampedArray(pic.rgba), pic.width, pic.height), 0, 0);
                    },
                    draw: (seat, _step, core) => {
                        const scr = realSeatScreen(core, seat);
                        const ctx = game.canvasElement?.getContext("2d");
                        if (scr && ctx)
                            paintScreen(ctx, scr);
                        if (scr)
                            game.coopHd(core, seat, scr);
                        else
                            game.coopHdHide();
                    },
                    ownPause: realOwnPause,
                    onStepError: (text, err) => { console.error(`${REASON_OWN_ERROR}: ${text}`, err); },
                    drawOwn: (scr) => { game.coopHdHide(); const ctx = game.canvasElement?.getContext("2d"); if (ctx)
                        paintScreen(ctx, scr); },
                    sound: (seat, e) => { if (seatHearsEffect(seat, e))
                        game.coopSounds([e.id as string]); },
                    audio: (seat, list) => { game.coopSounds(list.filter((e) => seatHearsEffect(seat, e)).map((e) => e.id as string)); },
                    partnerInfo: realPartnerInfo,
                    gameBlanks: (n) => game.coopGameBlanks(n),
                    gameOver: realGameOver,
                    stepClock: workerStepClock(() => new Worker(new URL(STEP_CLOCK_WORKER_FILE, document.baseURI), { type: "module" }) as unknown as ClockWorker, () => performance.now(), { setInterval: (f, ms) => setInterval(f, ms), clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>) }, STEP_CLOCK_TICK_MS, [() => new Worker(URL.createObjectURL(new Blob([STEP_CLOCK_WORKER_SOURCE], { type: "text/javascript" }))) as unknown as ClockWorker]),
                    raf: (cb) => requestAnimationFrame(cb),
                    cancelRaf: (h) => cancelAnimationFrame(h as number),
                },
                requestRender: () => { if (menuOpen) {
                    menu.setItemCount("coop", items("coop").length);
                    render();
                } },
                onSessionStart: (live) => {
                    coopSession = true;
                    coopLiveNow = live;
                    ownSteps.clear();
                    newestKeptStep = null;
                    pingStop?.stop();
                    pingStop = pingRefresher(() => (settings.video.show_ping ? live.pingText() : null), pingPlate, { setInterval: (f, ms) => setInterval(f, ms), clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>) }, net.echoEveryMs);
                    partnerDiv.hidden = false;
                    menuOpen = false;
                    menuDiv.hidden = true;
                    gameDiv.hidden = false;
                    input.releaseAll();
                    latch = 0;
                },
                onSessionEnd: (reason, lost) => { note = reason.startsWith(REASON_OWN_ERROR) ? `${reason}.` : lost ? `PLAYER CONNECTION LOST: ${reason}. You play on alone.` : `The session ended: ${reason}. You play on alone.`; },
                onSessionDropped: () => { dropSessionView(); },
                onGameOver: () => {
                    coopSession = false;
                    stopPing();
                    partnerDiv.hidden = true;
                    coopCtl?.quit();
                    note = "";
                    menu.open(false);
                    setMenuOpen(true);
                    render();
                },
                onLine: (l) => { partnerDiv.textContent = l; },
                rand: Math.random,
                seed: () => Math.floor(Math.random() * SEED_RANGE) >>> 0,
            });
        }
        catch (err) {
            coopError = `Co-op is not available: ${err instanceof Error ? err.message : String(err)}`;
        }
        if (menuOpen && menu.page === "coop") {
            menu.setItemCount("coop", items("coop").length);
            render();
        }
    }
    let loadingPasswords = false;
    let aboutAsk: {
        row: number;
        q: StorageQuestion;
    } | null = null;
    const states = stateStorage(c);
    let slots: (StateRecord | undefined)[] = [];
    const slotAction: ("save" | "load")[] = slotNumbers(c).map(() => "load");
    async function readSlots(): Promise<void> {
        slots = await Promise.all(slotNumbers(c).map((n) => states.get(n).catch(() => undefined)));
    }
    const keyName = (code: string | null): string => (code === null ? "(unbound)" : code);
    const padName = (b: number | null): string => (b === null ? "(unbound)" : `button ${b}`);
    interface InputRow {
        label: string;
        value: string;
        act(delta: -1 | 1, chosen: boolean): void;
        num?: NumberRow;
        keyText?: string;
        padText?: string;
        clear?: (part: ClearPart) => void;
    }
    function inputRows(): InputRow[] {
        const step = (delta: -1 | 1, chosen: boolean): number => (chosen ? 1 : delta);
        const numRow = (label: string, value: number, min: number, max: number, set: (v: number) => void): InputRow => {
            const num: NumberRow = { value, min, max, step: 1 };
            return { label, value: String(value), num, act: (d, ch) => { const v = numberKey(num, d, ch); if (v !== null)
                    set(v); } };
        };
        const setModern = (m: Partial<Settings["input"]["modern"]>): void => {
            change(() => { settings = { ...settings, input: { ...settings.input, modern: { ...settings.input.modern, ...m } } }; });
            syncModern();
        };
        const setModernMouse = (m: Partial<Settings["input"]["modern"]["mouse"]>): void => setModern({ mouse: { ...settings.input.modern.mouse, ...m } });
        const touchRow: InputRow = {
            label: "Touch controls", value: settings.input.touch,
            act: (delta, chosen) => {
                const modes = ["auto", "on", "off"] as const;
                const next = modes[(modes.indexOf(settings.input.touch) + step(delta, chosen) + modes.length) % modes.length]!;
                change(() => { settings = { ...settings, input: { ...settings.input, touch: next } }; });
                touchVis.setMode(next);
                syncTouch();
            },
        };
        const codes = (a: ModernAction): string => (settings.input.modern.keys[a].length === 0 ? "(unbound)" : settings.input.modern.keys[a].join(", "));
        const mm = settings.input.modern.mouse;
        const layout = inputRowLayout({
            scheme: modernOn() ? "modern" : "original", actions: ACTIONS, hotkeys: HOTKEYS, modernActions: MODERN_ACTIONS,
            labels: ACTION_LABELS, modernLabels: MODERN_LABELS,
        });
        const build = (d: InputRowDesc): InputRow => {
            const label = d.label;
            switch (d.kind) {
                case "controls":
                    return {
                        label, value: modernOn() ? "Modern" : "Original",
                        act: () => {
                            const scheme = modernOn() ? "original" : "modern";
                            change(() => { settings = { ...settings, input: { ...settings.input, scheme } }; });
                            input.releaseAll();
                            modernIn?.reset();
                            syncModern();
                            render();
                        },
                    };
                case "binding": {
                    const a = d.action as Action;
                    const waiting = capture?.action === a;
                    return {
                        label,
                        value: waiting ? "press a key or a pad button..." : `${keyName(settings.input.keys[a])}  |  ${padName(settings.input.pad[a])}`,
                        ...(waiting ? {} : { keyText: keyName(settings.input.keys[a]), padText: padName(settings.input.pad[a]) }),
                        act: (_d, chosen) => { if (chosen) {
                            capture = { action: a };
                            render();
                        } },
                        clear: (part) => clearOriginal(a, part),
                    };
                }
                case "defaults":
                    return { label, value: "", act: (_d, chosen) => { if (chosen)
                            changeBindings(defaultKeyBindings(c), defaultPadBindings(c)); } };
                case "modern_binding": {
                    const a = d.action as ModernAction;
                    return {
                        label,
                        value: modernCapture === a ? "press a key, a mouse button or turn the wheel..." : codes(a),
                        act: (_d, chosen) => { if (chosen) {
                            modernCapture = a;
                            render();
                        } },
                        clear: () => clearModernRow(a),
                    };
                }
                case "modern_defaults":
                    return { label, value: "", act: (_d, chosen) => { if (chosen)
                            setModern({ keys: defaultModernBindings(c) }); } };
                case "touch":
                    return touchRow;
                case "mouse":
                    return {
                        label, value: settings.input.mouse.enabled ? "on" : "off",
                        act: () => {
                            const on = !settings.input.mouse.enabled;
                            change(() => { settings = { ...settings, input: { ...settings.input, mouse: { ...settings.input.mouse, enabled: on } } }; });
                            syncModern();
                        },
                    };
                case "mouse_sensitivity":
                    return numRow(label, settings.input.mouse.sensitivity, c.mouse.sensMin, c.mouse.sensMax, (v) => {
                        change(() => { settings = { ...settings, input: { ...settings.input, mouse: { ...settings.input.mouse, sensitivity: v } } }; });
                        mouse.sensitivity = v;
                    });
                case "modern_sensitivity":
                    return numRow(label, mm.sensitivity, c.modern.mouse.sensMin, c.modern.mouse.sensMax, (v) => setModernMouse({ sensitivity: v }));
                case "modern_accel":
                    return numRow(label, mm.accel, 0, PERCENT_MAX, (v) => setModernMouse({ accel: v }));
                case "modern_decel":
                    return numRow(label, mm.decel, 0, PERCENT_MAX, (v) => setModernMouse({ decel: v }));
                case "modern_smoothing":
                    return numRow(label, mm.smoothing, 1, c.modern.mouse.smoothMax, (v) => setModernMouse({ smoothing: v }));
                case "turn_cap":
                    return { label, value: settings.input.modern.turn_cap,
                        act: () => setModern({ turn_cap: settings.input.modern.turn_cap === "fast" ? "original" : "fast" }) };
                case "selection":
                    return { label, value: settings.input.modern.selection === "slots" ? "Slots" : "Carousel",
                        act: () => setModern({ selection: settings.input.modern.selection === "slots" ? "carousel" : "slots" }) };
                case "crouch_toggle":
                    return { label, value: settings.input.modern.crouch_toggle ? "on" : "off",
                        act: () => setModern({ crouch_toggle: !settings.input.modern.crouch_toggle }) };
                case "turn_backlog":
                    return { label, value: turnBacklogText(settings.input.modern.turn_backlog),
                        act: () => setModern({ turn_backlog: settings.input.modern.turn_backlog === "steps6" ? "unlimited" : "steps6" }) };
                case "raw_mouse":
                    return { label, value: settings.input.mouse.raw ? "on" : "off",
                        act: () => { const raw = !settings.input.mouse.raw; change(() => { settings = { ...settings, input: { ...settings.input, mouse: { ...settings.input.mouse, raw } } }; }); } };
            }
        };
        return layout.map(build);
    }
    function takeModernCapture(code: string): void {
        const a = modernCapture!;
        modernCapture = null;
        if (code === "Escape") {
            render();
            return;
        }
        const r = rebindModern(settings.input.modern.keys, a, code);
        note = r.unbound.length > 0 ? `${r.unbound.map((u) => MODERN_LABELS[u]).join(", ")} now unbound.` : "";
        change(() => { settings = { ...settings, input: { ...settings.input, modern: { ...settings.input.modern, keys: r.bindings } } }; });
        syncModern();
    }
    const customStepsRow = (): NumberRow => ({ value: settings.speed.custom_steps, min: c.speed.customMin, max: c.speed.customMax, step: 1 });
    const handSizeRow = (): NumberRow => ({ value: Math.round(settings.video.hd.hand_size * 10), min: HAND_SIZE_MIN_TENTHS, max: HAND_SIZE_MAX_TENTHS, step: 1, show: (v) => `${(v / 10).toFixed(1)}x` });
    const VOICE_MODE_LABELS: Readonly<Record<string, string>> = { classic: "Classic", once: "Once per X seconds", once_per_phrase: "Once per X seconds per phrase" };
    const voiceIntervalRow = (): NumberRow => ({ value: settings.audio.voice_interval, min: VOICE_INTERVAL_MIN, max: VOICE_INTERVAL_MAX, step: 1 });
    const volumeRow = (): NumberRow => ({ value: settings.audio.volume, min: 0, max: c.audio.volumeMax, step: c.audio.volumeStep });
    function clearOriginal(a: Action, part: ClearPart): void {
        const r = clearBinding(settings.input.keys, settings.input.pad, a, part);
        if (r.note !== null) {
            note = r.note;
            render();
            return;
        }
        if (r.changed) {
            note = "";
            changeBindings(r.keys, r.pad);
        }
    }
    function clearModernRow(a: ModernAction): void {
        const r = clearModernBinding(settings.input.modern.keys, a);
        if (!r.changed)
            return;
        note = "";
        change(() => { settings = { ...settings, input: { ...settings.input, modern: { ...settings.input.modern, keys: r.bindings } } }; });
        syncModern();
    }
    const ONOFF = (b: boolean): string => (b ? "On" : "Off");
    const CAP = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
    function videoItem(id: VideoRowId): Item {
        const h = settings.video.hd;
        switch (id) {
            case "scale": return { label: "Scale", value: settings.video.scale === "fit" ? "fit" : `${settings.video.scale}x` };
            case "filter": return { label: "Filter", value: settings.video.filter };
            case "keep_aspect": return { label: "Keep aspect", value: settings.video.keep_aspect ? "on" : "off" };
            case "renderer": {
                const n = rendererNote(settings, webgl2);
                return { label: "Renderer", value: RENDERER_LABELS[rendererChoice(settings)] + (n ? ` (${n})` : "") };
            }
            case "hd_layout": return { label: "HUD", value: CAP(h.layout) };
            case "hd_hand_size": {
                const num = handSizeRow();
                return { label: "Weapon size", value: num.show!(num.value), num };
            }
            case "hd_frame_limit": return { label: "Frame limit", value: h.frame_limit === "display" ? "Display" : String(h.frame_limit) };
            case "hd_fov": return { label: "Field of view", value: h.fov === "auto" ? "Auto" : String(h.fov) };
            case "hd_resolution": return { label: "Resolution", value: CAP(h.resolution) };
            case "hd_smooth_motion": return { label: "Smooth motion", value: ONOFF(h.smooth_motion) };
            case "hd_smooth_shading": return { label: "Smooth shading", value: ONOFF(h.smooth_shading) };
            case "hd_texture_filter": return { label: "Textures", value: CAP(h.texture_filter) };
            case "hd_loot": return { label: "Loot", value: ONOFF(h.loot) };
            case "hd_markers": return { label: "Sleeping enemies", value: CAP(h.markers) };
            case "fullscreen": return { label: "Full screen", value: document.fullscreenElement ? "on" : "off" };
            case "show_ping": return { label: "Show ping", value: ONOFF(settings.video.show_ping) };
        }
    }
    function gameplayItem(id: GameplayRowId): Item {
        switch (id) {
            case "speed": return { label: "Speed", value: settings.speed.mode === "original" ? "Original" : "Custom" };
            case "custom_steps": return { label: "Custom steps a second", value: String(settings.speed.custom_steps), num: customStepsRow() };
            case "intro": return { label: "Skip intro", value: INTRO_LABELS[settings.game.intro] };
            case "fix990": return { label: FIX990_ROW.label, value: cheatValue(settings, FIX990_ROW.key) };
            case "setup": return { label: "Setup again", value: "" };
        }
    }
    function items(page: PageId): Item[] {
        switch (page) {
            case "input":
                return inputRows().map((r) => ({ label: r.label, value: r.value, num: r.num, keyText: r.keyText, padText: r.padText, clear: r.clear }));
            case "gameplay":
                return GAMEPLAY_ROW_IDS.map(gameplayItem);
            case "video":
                return videoRowIds(settings, webgl2).map(videoItem);
            case "sound":
                return [
                    { label: "Volume", value: String(settings.audio.volume), num: volumeRow() },
                    { label: "Mute", value: settings.audio.mute ? "on" : "off" },
                    { label: "Voice mode", value: VOICE_MODE_LABELS[settings.audio.voice_mode] },
                    ...(settings.audio.voice_mode !== "classic" ? [{ label: VOICE_INTERVAL_LABEL, value: String(settings.audio.voice_interval), num: voiceIntervalRow() }] : []),
                ];
            case "password": {
                const slots = savedSlots();
                return [
                    ...(pwTop() ? [{ label: "Save password", value: "the running game's password, in its level's slot" }] : []),
                    ...(passwords ?? []).map((r, i) => {
                        const saved = `Saved ${slots[i] || "-"}`, def = `Default ${r.code}`;
                        const sv = (pwCell[i] ?? "default") === "saved";
                        return { label: r.name, value: sv ? `[${saved}]  ${def}` : `${saved}  [${def}]`, group: `Episode ${r.episode + 1}`, cells: [{ id: "saved" as const, text: sv ? `[${saved}]` : saved }, { id: "default" as const, text: sv ? def : `[${def}]` }] };
                    }),
                    ...extras.map((x) => ({ label: `${x.code} (${levelName(x)})`, value: x.code, group: "Extra codes" })),
                    { label: "Free entry...", value: freeEntry ?? "" },
                ];
            }
            case "states": {
                const canSave = saveable();
                return slotNumbers(c).map((n, i) => {
                    const usable = slotStatus(slots[i], c, deps.md5) === "usable";
                    const save = canSave ? "Save" : "(Save)";
                    const load = usable ? "Load" : "(Load)";
                    const sv = slotAction[i] === "save";
                    return { label: slotLabel(n, slots[i], c, deps.md5), value: sv ? `[${save}]  ${load}` : `${save}  [${load}]`, cells: [{ id: "save" as const, text: sv ? `[${save}]` : save }, { id: "load" as const, text: sv ? load : `[${load}]` }] };
                });
            }
            case "coop":
                return coopCtl ? coopCtl.items() : [{ label: coopError || "Loading the co-op data...", value: "" }];
            case "cheats":
                return CHEAT_ROWS.map((r) => ({ label: r.label, value: cheatValue(settings, r.key) }));
            case "about":
                return ABOUT_ROWS.map((r, i) => {
                    if (aboutAsk === null || aboutAsk.row !== i)
                        return { label: r.label, value: "" };
                    const no = aboutAsk.q.choice === "no";
                    return { label: `${r.label}: ${r.deletes}?`, value: no ? "[No]  Yes" : "No  [Yes]", cells: [{ id: "no" as const, text: no ? "[No]" : "No" }, { id: "yes" as const, text: no ? "Yes" : "[Yes]" }] };
                });
            default:
                return [];
        }
    }
    let waitShown: {
        spin: HTMLElement;
        line: string;
    } | null = null;
    function renderWaiting(ws: WaitingScreen): void {
        panel.className = "zt-panel zt-wait";
        const spin = document.createElement("div");
        spin.className = "zt-spin";
        spin.style.transform = `rotate(${ws.angle}deg)`;
        const h = document.createElement("h1");
        h.textContent = ws.heading;
        const line = document.createElement("div");
        line.textContent = ws.line;
        const row = document.createElement("div");
        row.className = "zt-row sel";
        row.textContent = ws.row;
        armHold(row);
        row.addEventListener("click", () => { setCursor("coop", 0); apply(menu.press("choose")); });
        const hint = document.createElement("div");
        hint.className = "zt-note";
        hint.textContent = "Enter / A / Esc / B cancel";
        panel.append(spin, h, line, row, hint);
        waitShown = { spin, line: ws.line };
    }
    let wiz: {
        model: SetupWizard;
    } | null = null;
    function openWizard(): void {
        wiz = { model: new SetupWizard(settings, webgl2) };
        note = "";
        render();
    }
    function wizardEffect(e: ReturnType<SetupWizard["press"]>): void {
        if (wiz === null)
            return;
        const model = wiz.model;
        switch (e.type) {
            case "none":
            case "step": break;
            case "change":
                settings = model.apply(settings);
                game.applySettings();
                break;
            case "close":
                wiz = null;
                change(() => { settings = closeWizard(settings, model.initial, model.initialHd); });
                syncModern();
                return;
            case "finish":
                wiz = null;
                change(() => { settings = finishWizard(model.apply(settings), model.values); });
                syncModern();
                return;
        }
        render();
    }
    function renderWizard(model: SetupWizard): void {
        panel.className = "zt-panel";
        const h = document.createElement("h1");
        h.textContent = c.title;
        panel.appendChild(h);
        const t = document.createElement("div");
        t.textContent = `Setup ${model.stepNumber} / ${model.steps().length}: ${model.title}`;
        t.style.fontWeight = "bold";
        panel.appendChild(t);
        model.choices().forEach((ch, i) => {
            const d = document.createElement("div");
            d.className = `zt-row${i === model.cursor ? " sel" : ""}`;
            if (ch.dim)
                d.style.opacity = "0.4";
            const l = document.createElement("span");
            l.textContent = ch.label;
            const v = document.createElement("span");
            v.textContent = ch.text;
            d.append(l, v);
            armHold(d);
            d.addEventListener("click", () => {
                if (ch.dim)
                    return;
                wizardEffect(model.select(i));
                if (wiz !== null)
                    wizardEffect(model.press("choose"));
            });
            panel.appendChild(d);
        });
        const iv = model.intervalRow;
        if (iv !== null) {
            const d = document.createElement("div");
            d.className = "zt-row";
            const l = document.createElement("span");
            l.textContent = VOICE_INTERVAL_LABEL;
            const v = document.createElement("span");
            const num: NumberRow = { value: iv, min: VOICE_INTERVAL_MIN, max: VOICE_INTERVAL_MAX, step: 1 };
            const cells = numberCells(num);
            const mark = (text: string, dim: boolean, delta: -1 | 1): HTMLSpanElement => {
                const m = document.createElement("span");
                m.textContent = text;
                m.className = `zt-mark${dim ? " dim" : ""}`;
                m.dataset.part = delta < 0 ? "lower" : "raise";
                m.addEventListener("click", (ev) => { ev.stopPropagation(); wizardEffect(model.interval(delta)); });
                return m;
            };
            const val = document.createElement("span");
            val.textContent = cells.value;
            v.append(mark(cells.lower, cells.lowerDim, -1), " ", val, " ", mark(cells.raise, cells.raiseDim, 1));
            d.append(l, v);
            panel.appendChild(d);
        }
        if (model.note) {
            const p = document.createElement("div");
            p.className = "zt-note";
            p.textContent = model.note;
            panel.appendChild(p);
        }
        const hint = document.createElement("div");
        hint.className = "zt-note";
        hint.textContent = iv !== null ? "Up / Down choose, Left / Right the interval, Enter / A / Start next, Esc / B back" : "Up / Down choose, Enter / A / Start next, Esc / B back";
        panel.appendChild(hint);
        panel.appendChild(backControl(() => wizardEffect(model.press("back"))));
        const ver = document.createElement("div");
        ver.className = "zt-version";
        ver.textContent = `version ${c.appVersion}`;
        panel.appendChild(ver);
    }
    let pointerHeld = false;
    let renderDeferred = false;
    const releaseHold = (): void => { setTimeout(() => { pointerHeld = false; if (renderDeferred) {
        renderDeferred = false;
        render();
    } }, 0); };
    window.addEventListener("pointerup", releaseHold);
    window.addEventListener("pointercancel", releaseHold);
    const armHold = (el: HTMLElement): void => { el.addEventListener("pointerdown", () => { pointerHeld = true; }); };
    function backControl(act: () => void): HTMLElement {
        const b = document.createElement("div");
        b.className = "zt-back";
        b.textContent = "Back";
        armHold(b);
        b.addEventListener("click", () => { if (capture || modernCapture)
            return; act(); });
        return b;
    }
    function pickCell(page: PageId, i: number, id: string): void {
        if (page === "states")
            slotAction[i] = id === "save" ? "save" : "load";
        else if (page === "password")
            pwCell[i - pwTop()] = id === "saved" ? "saved" : "default";
        else if (page === "coop" && (id === "saved" || id === "default"))
            coopCtl?.pickCell(i, id);
        else if (page === "about" && aboutAsk !== null && aboutAsk.row === i)
            aboutAsk.q.choice = id === "yes" ? "yes" : "no";
    }
    function render(): void {
        if (pointerHeld) {
            renderDeferred = true;
            return;
        }
        panel.textContent = "";
        waitShown = null;
        if (wiz !== null) {
            renderWizard(wiz.model);
            return;
        }
        const ws = menu.page === "coop" && coopCtl ? coopCtl.waitingScreen(performance.now()) : null;
        if (ws !== null) {
            renderWaiting(ws);
            return;
        }
        panel.className = "zt-panel";
        const h = document.createElement("h1");
        h.textContent = c.title;
        panel.appendChild(h);
        const page = menu.page;
        const rows: Item[] = page === "root" ? menu.rootLabels().map((label) => ({ label, value: "" })) : items(page);
        const sel = page === "root" ? menu.cursor : menu.item;
        if (page !== "root") {
            const t = document.createElement("div");
            t.textContent = [GAMEPLAY_ROW, ...ROWS].find((r) => r.page === page)?.label ?? "";
            t.style.fontWeight = "bold";
            panel.appendChild(t);
        }
        rows.forEach((r, i) => {
            if (r.group !== undefined && (i === 0 || rows[i - 1]!.group !== r.group)) {
                const gh = document.createElement("div");
                gh.className = "zt-note";
                gh.textContent = r.group;
                panel.appendChild(gh);
            }
            const d = document.createElement("div");
            d.className = `zt-row${i === sel ? " sel" : ""}`;
            const l = document.createElement("span");
            l.textContent = r.label;
            const v = document.createElement("span");
            if (r.num) {
                const cells = numberCells(r.num);
                const mark = (text: string, dim: boolean, part: "lower" | "raise"): HTMLSpanElement => {
                    const m = document.createElement("span");
                    m.textContent = text;
                    m.className = `zt-mark${dim ? " dim" : ""}`;
                    m.dataset.part = part;
                    m.addEventListener("click", (ev) => {
                        ev.stopPropagation();
                        if (capture || modernCapture)
                            return;
                        setCursor(page, i);
                        const nv = numberClick(r.num!, part);
                        if (nv === null) {
                            render();
                            return;
                        }
                        adjust(page, i, part === "raise" ? 1 : -1, false);
                    });
                    return m;
                };
                const val = document.createElement("span");
                val.textContent = cells.value;
                v.append(mark(cells.lower, cells.lowerDim, "lower"), " ", val, " ", mark(cells.raise, cells.raiseDim, "raise"));
            }
            else if (r.keyText !== undefined && r.padText !== undefined) {
                const k = document.createElement("span");
                k.textContent = r.keyText;
                k.dataset.part = "key";
                const pd = document.createElement("span");
                pd.textContent = r.padText;
                pd.dataset.part = "pad";
                v.append(k, "  |  ", pd);
            }
            else if (r.cells) {
                r.cells.forEach((cell, k) => {
                    const s = document.createElement("span");
                    s.textContent = cell.text;
                    s.className = "zt-cell";
                    s.dataset.part = cell.id;
                    s.addEventListener("click", (ev) => {
                        ev.stopPropagation();
                        if (capture || modernCapture)
                            return;
                        setCursor(page, i);
                        pickCell(page, i, cell.id);
                        apply(menu.press("choose"));
                        render();
                    });
                    if (k > 0)
                        v.append("  ");
                    v.appendChild(s);
                });
            }
            else
                v.textContent = r.value;
            d.append(l, v);
            armHold(d);
            d.addEventListener("click", () => {
                if (capture || modernCapture)
                    return;
                setCursor(page, i);
                if (r.num) {
                    render();
                    return;
                }
                apply(menu.press("choose"));
            });
            d.addEventListener("contextmenu", (ev) => {
                if (!r.clear)
                    return;
                ev.preventDefault();
                if (capture || modernCapture)
                    return;
                setCursor(page, i);
                const part = (ev.target instanceof HTMLElement ? ev.target.dataset.part : undefined) === "pad" ? "pad" : "key";
                note = "";
                r.clear(part);
            });
            panel.appendChild(d);
        });
        if (page === "password") {
            const p = document.createElement("div");
            p.className = "zt-note";
            p.textContent = passwords === null ? (loadingPasswords ? "Loading the list..." : "The password list could not be loaded.")
                : "Choose a password: the game starts with it as its kept password; Start Game on the title begins the password game. B on a Saved cell clears it.";
            panel.appendChild(p);
            if (freeEntry !== null) {
                const input = document.createElement("input");
                input.type = "text";
                input.maxLength = FREE_ENTRY_LENGTH;
                input.value = freeEntry;
                input.size = 14;
                input.spellcheck = false;
                input.autocomplete = "off";
                const verdict = document.createElement("div");
                verdict.className = "zt-note";
                const play = document.createElement("button");
                play.textContent = "Play";
                const saveBtn = document.createElement("button");
                saveBtn.textContent = "Save";
                const judge = (): PasswordTarget | null => {
                    const text = freeEntry ?? "";
                    const problem = freeEntryProblem(text, FREE_ENTRY_LENGTH, alphabet);
                    const t = problem === null ? check(text) : null;
                    verdict.textContent = problem ?? (t ? `Accepted: ${levelName(t)}` : "The game refuses this password.");
                    play.disabled = saveBtn.disabled = t === null;
                    return t;
                };
                input.addEventListener("input", () => {
                    const n = normalizeEntry(input.value);
                    if (n !== input.value)
                        input.value = n;
                    freeEntry = n;
                    judge();
                });
                input.addEventListener("keydown", (ev) => {
                    if (ev.key === "Enter") {
                        if (judge())
                            startFromPassword(freeEntry ?? "");
                    }
                    else if (ev.key === "Escape") {
                        freeEntry = null;
                        note = "";
                        render();
                    }
                });
                play.addEventListener("click", () => { if (judge())
                    startFromPassword(freeEntry ?? ""); });
                saveBtn.addEventListener("click", () => {
                    const t = judge();
                    if (t) {
                        note = storePassword(freeEntry ?? "", t) ? `Saved for ${levelName(t)}.` : "No level row for this password.";
                        render();
                    }
                });
                panel.append(input, play, saveBtn, verdict);
                judge();
                setTimeout(() => input.focus(), 0);
            }
        }
        if (page === "coop" && coopCtl)
            coopCtl.renderExtra(panel);
        if (page === "about") {
            const p = document.createElement("div");
            p.className = "zt-note";
            p.textContent = `${c.title} - assets of extractor ${deps.version}, ROM md5 ${deps.md5}`;
            panel.appendChild(p);
        }
        panel.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
        if (note) {
            const p = document.createElement("div");
            p.className = "zt-note";
            p.textContent = note;
            panel.appendChild(p);
        }
        const hint = document.createElement("div");
        hint.className = "zt-note";
        hint.textContent = "Up / Down move, Enter / A / Start choose, Left / Right change, Esc / B back";
        panel.appendChild(hint);
        if (page !== "root" || menu.gameRunning)
            panel.appendChild(backControl(() => menuPress("back")));
        const ver = document.createElement("div");
        ver.className = "zt-version";
        ver.textContent = `version ${c.appVersion}`;
        panel.appendChild(ver);
    }
    function setCursor(page: PageId, index: number): void {
        const n = page === "root" ? menu.rootLabels().length : items(page).length;
        const cur = page === "root" ? menu.cursor : menu.item;
        let steps = (index - cur + n) % n;
        while (steps-- > 0)
            menu.press("down");
    }
    function setMenuOpen(open: boolean): void {
        menuOpen = open;
        menuDiv.hidden = !open;
        gameDiv.hidden = !game.running;
        syncTouch();
        modernIn?.releaseAll();
        if (open) {
            pointer.reset();
            input.releaseAll();
            mouseAtt.release();
            mouseBits = 0;
            if (!coopSession)
                game.pause();
        }
        else {
            input.releaseAll();
            latch = 0;
            if (!coopSession)
                game.resume();
        }
    }
    function change(mutate: () => void): void {
        mutate();
        save();
        game.applySettings();
        render();
    }
    function changeBindings(keys: Settings["input"]["keys"], pad: Settings["input"]["pad"]): void {
        change(() => { settings = { ...settings, input: { ...settings.input, keys, pad } }; });
        input.setBindings(settings.input.keys, settings.input.pad);
    }
    const cycleScale = (delta: number): void => {
        const max = game.maxIntegerScale();
        const choices: ("fit" | number)[] = ["fit"];
        for (let i = 1; i <= max; i++)
            choices.push(i);
        const at = Math.max(0, choices.indexOf(settings.video.scale));
        const next = choices[(at + delta + choices.length) % choices.length]!;
        change(() => { settings = { ...settings, video: { ...settings.video, scale: next } }; });
    };
    function toggleFullscreen(): void {
        if (document.fullscreenElement)
            void document.exitFullscreen().then(render);
        else
            void container.requestFullscreen().then(render, () => { note = "Full screen was refused by the browser."; render(); });
    }
    function adjust(page: PageId, index: number, delta: -1 | 1, chosen: boolean): void {
        note = "";
        if (page === "input") {
            inputRows()[index]?.act(delta, chosen);
            return;
        }
        if (page === "coop") {
            const viewBefore = coopCtl?.view;
            coopCtl?.adjust(index, delta, chosen);
            if (coopCtl && coopCtl.view !== viewBefore)
                menu.reenter("coop");
            menu.setItemCount("coop", items("coop").length);
            render();
            return;
        }
        if (page === "video") {
            const id = videoRowIds(settings, webgl2)[index];
            switch (id) {
                case "scale":
                    cycleScale(delta);
                    break;
                case "filter":
                    change(() => { settings = { ...settings, video: { ...settings.video, filter: settings.video.filter === "nearest" ? "smooth" : "nearest" } }; });
                    break;
                case "keep_aspect":
                    change(() => { settings = { ...settings, video: { ...settings.video, keep_aspect: !settings.video.keep_aspect } }; });
                    break;
                case "renderer":
                case "hd_layout":
                case "hd_hand_size":
                case "hd_frame_limit":
                case "hd_fov":
                case "hd_resolution":
                case "hd_smooth_motion":
                case "hd_smooth_shading":
                case "hd_texture_filter":
                case "hd_loot":
                case "hd_markers":
                    change(() => { settings = adjustHdRow(settings, id, chosen ? 1 : delta, fovRange); });
                    menu.setItemCount("video", items("video").length);
                    render();
                    break;
                case "fullscreen":
                    if (chosen)
                        toggleFullscreen();
                    break;
                case "show_ping":
                    change(() => { settings = { ...settings, video: { ...settings.video, show_ping: !settings.video.show_ping } }; });
                    break;
            }
            return;
        }
        if (page === "gameplay") {
            switch (GAMEPLAY_ROW_IDS[index]) {
                case "speed":
                    change(() => { settings = { ...settings, speed: { ...settings.speed, mode: settings.speed.mode === "original" ? "custom" : "original" } }; });
                    break;
                case "custom_steps": {
                    const v = numberKey(customStepsRow(), delta, chosen);
                    if (v !== null)
                        change(() => { settings = { ...settings, speed: { ...settings.speed, custom_steps: v } }; });
                    break;
                }
                case "intro": {
                    const at = INTRO_MODES.indexOf(settings.game.intro);
                    const next = INTRO_MODES[(at + (chosen ? 1 : delta) + INTRO_MODES.length) % INTRO_MODES.length]!;
                    change(() => { settings = { ...settings, game: { ...settings.game, intro: next } }; });
                    break;
                }
                case "fix990":
                    change(() => { settings = stepCheat(settings, FIX990_ROW.key, chosen ? 1 : delta); });
                    break;
                case "setup":
                    if (chosen)
                        openWizard();
                    break;
            }
            return;
        }
        if (page === "sound") {
            if (index === 0) {
                const v = numberKey(volumeRow(), delta, chosen);
                if (v !== null)
                    change(() => { settings = { ...settings, audio: { ...settings.audio, volume: v } }; });
            }
            else if (index === 1) {
                change(() => { settings = { ...settings, audio: { ...settings.audio, mute: !settings.audio.mute } }; });
            }
            else if (index === 2) {
                change(() => { settings = { ...settings, audio: { ...settings.audio, voice_mode: cycle(VOICE_MODES, settings.audio.voice_mode, chosen ? 1 : delta) } }; });
                menu.setItemCount("sound", items("sound").length);
                render();
            }
            else {
                const v = numberKey(voiceIntervalRow(), delta, chosen);
                if (v !== null)
                    change(() => { settings = { ...settings, audio: { ...settings.audio, voice_interval: v } }; });
            }
            return;
        }
        if (page === "states") {
            if (!chosen) {
                slotAction[index] = slotAction[index] === "save" ? "load" : "save";
                render();
                return;
            }
            const n = slotNumbers(c)[index]!;
            if (slotAction[index] === "save")
                void saveSlot(n);
            else
                void loadSlot(n);
            return;
        }
        if (page === "cheats") {
            const row = CHEAT_ROWS[index];
            if (row)
                change(() => { settings = stepCheat(settings, row.key, chosen ? 1 : delta); });
            return;
        }
        if (page === "password") {
            if (pwTop()) {
                if (index === 0) {
                    if (chosen)
                        void savePasswordNow().then(render);
                    return;
                }
                index--;
            }
            const list = passwords ?? [];
            if (index < list.length) {
                if (!chosen) {
                    pwCell[index] = (pwCell[index] ?? "default") === "saved" ? "default" : "saved";
                    render();
                    return;
                }
                const code = (pwCell[index] ?? "default") === "saved" ? savedSlots()[index] ?? "" : list[index]!.code;
                if (code !== "")
                    startFromPassword(code);
            }
            else if (index < list.length + extras.length) {
                if (chosen)
                    startFromPassword(extras[index - list.length]!.code);
            }
            else if (chosen) {
                freeEntry = freeEntry === null ? "" : null;
                render();
            }
            return;
        }
        if (page === "about") {
            const row = ABOUT_ROWS[index];
            if (!row)
                return;
            if (aboutAsk !== null && aboutAsk.row === index) {
                const answer = aboutAsk.q.press(chosen ? "choose" : delta < 0 ? "left" : "right");
                if (answer === null) {
                    render();
                    return;
                }
                aboutAsk = null;
                if (answer === "no") {
                    render();
                    return;
                }
                leaveGameView();
                if (row.id === "reset")
                    void deps.onResetSettings?.();
                else if (row.id === "clear")
                    void deps.onClearAssets?.();
                else
                    void deps.onForget();
                render();
                return;
            }
            if (!chosen)
                return;
            if (row.id === "reextract") {
                aboutAsk = null;
                leaveGameView();
                deps.onReextract();
                return;
            }
            aboutAsk = { row: index, q: new StorageQuestion(row.id) };
            render();
        }
    }
    async function loadPasswordList(): Promise<void> {
        loadingPasswords = true;
        render();
        try {
            const floorsJson = deps.passwordsJson ?? (await fetchFirst(PASSWORD_URLS));
            passwords = loadPasswords(floorsJson);
            extras = loadExtraCodes(floorsJson, passwords);
            try {
                const codecJson = deps.alphabetJson ?? (await fetchFirst(ALPHABET_URLS));
                alphabet = loadAlphabet(codecJson);
                codec = passwordCodecFrom(codecJson);
            }
            catch {
                alphabet = "";
                codec = null;
            }
        }
        catch (err) {
            note = `The password list could not be loaded: ${err instanceof Error ? err.message : String(err)}`;
        }
        loadingPasswords = false;
        if (passwords)
            menu.setItemCount("password", items("password").length);
        render();
    }
    function startFromPassword(code: string): void {
        note = "";
        if (codec && check(code) === null) {
            note = "The game refuses this password.";
            render();
            return;
        }
        freeEntry = null;
        endCoopGame();
        const run = game.startFromPassword(code);
        setMenuOpen(false);
        run.then((ok) => {
            if (!ok) {
                note = "The game refuses this password.";
                menu.open(gameOn());
                setMenuOpen(true);
                render();
            }
        }, (err: unknown) => {
            note = `The game could not start: ${err instanceof Error ? err.message : String(err)}`;
            setMenuOpen(true);
            render();
        });
    }
    function storePassword(code: string, t: PasswordTarget): boolean {
        if (!passwords)
            return false;
        const r = storeInSlot(savedSlots(), passwords, code, t);
        if (!r)
            return false;
        change(() => { settings = { ...settings, passwords: { saved: r.slots } }; });
        return true;
    }
    function canSavePassword(): boolean {
        return !coopSession && game.passwordNow() !== null;
    }
    function pwTop(): number {
        return canSavePassword() ? 1 : 0;
    }
    async function savePasswordNow(): Promise<void> {
        if (coopSession)
            return;
        const now = game.passwordNow();
        if (!now)
            return;
        if (passwords === null || codec === null)
            await loadPasswordList();
        const t = check(now.code);
        if (!t) {
            showNotice("The running game's password was refused by the game's check: nothing stored.");
            return;
        }
        if (storePassword(now.code, t))
            showNotice(`password saved: ${levelName(t)}`);
    }
    function apply(e: MenuEffect): void {
        switch (e.type) {
            case "none":
                render();
                return;
            case "play":
                if (coopSession) {
                    setMenuOpen(false);
                    return;
                }
                {
                    const started = game.start();
                    setMenuOpen(false);
                    started.catch((err: unknown) => {
                        note = `The game could not start: ${err instanceof Error ? err.message : String(err)}`;
                        setMenuOpen(true);
                        render();
                    });
                }
                return;
            case "resume":
                setMenuOpen(false);
                return;
            case "save_password":
                void savePasswordNow().then(render);
                return;
            case "enter":
                if (e.page === "about")
                    aboutAsk = null;
                menu.setItemCount(e.page, items(e.page).length);
                render();
                if (e.page === "states")
                    void readSlots().then(render);
                if (e.page === "coop")
                    void prepareCoop();
                if (e.page === "password" && passwords === null && !loadingPasswords)
                    void loadPasswordList();
                return;
            case "leave":
                if (e.page === "coop" && coopCtl?.back()) {
                    menu.reenter("coop");
                    menu.setItemCount("coop", items("coop").length);
                }
                capture = null;
                note = "";
                render();
                return;
            case "item":
                adjust(e.page, e.index, 1, true);
                return;
            case "adjust":
                adjust(e.page, e.index, e.delta, false);
                return;
        }
    }
    function clearSavedCell(): boolean {
        if (menu.page !== "password" || !passwords)
            return false;
        const i = menu.item - pwTop();
        if (i < 0 || i >= passwords.length || (pwCell[i] ?? "default") !== "saved" || (savedSlots()[i] ?? "") === "")
            return false;
        const next = clearSlot(savedSlots(), i);
        change(() => { settings = { ...settings, passwords: { saved: next } }; });
        return true;
    }
    function menuAction(a: Action): void {
        const k = menuKeyOf(a);
        if (k && wiz !== null) {
            wizardEffect(wiz.model.press(k));
            return;
        }
        if (k)
            menuPress(k);
    }
    function menuPress(k: MenuKey): void {
        if (aboutAsk !== null && (k === "back" || k === "up" || k === "down")) {
            aboutAsk = null;
            if (k === "back") {
                render();
                return;
            }
        }
        apply(menu.press(k));
    }
    function saveable(): boolean {
        return game.running && game.saveState() !== null;
    }
    async function saveSlot(n: number): Promise<void> {
        if (coopSession) {
            note = "not in a co-op session";
            showNotice(note);
            if (menuOpen)
                render();
            return;
        }
        const st = game.saveState();
        if (!st)
            return;
        if (passwords === null) {
            try {
                passwords = loadPasswords(deps.passwordsJson ?? (await fetchFirst(PASSWORD_URLS)));
            }
            catch { }
        }
        const name = passwords?.find((r) => r.episode === st.episode && r.floor === st.floor)?.name ?? `episode ${st.episode + 1} floor ${st.floor}`;
        const rec: StateRecord = { format: c.state.format, md5: deps.md5, level: { episode: st.episode, floor: st.floor, name }, savedAt: Date.now(), state: st.state };
        try {
            await states.put(n, rec);
            note = `Saved to slot ${n}.`;
        }
        catch (err) {
            note = `The state could not be stored: ${err instanceof Error ? err.message : String(err)}`;
        }
        await readSlots();
        if (menuOpen)
            render();
    }
    async function loadSlot(n: number): Promise<void> {
        if (coopSession) {
            note = "not in a co-op session";
            showNotice(note);
            if (menuOpen)
                render();
            return;
        }
        const rec = await states.get(n).catch(() => undefined);
        if (slotStatus(rec, c, deps.md5) !== "usable")
            return;
        const ok = await game.loadState(rec!.state);
        if (!ok) {
            note = `Slot ${n} could not be loaded by this version of the game.`;
            if (menuOpen)
                render();
            return;
        }
        note = "";
        setMenuOpen(false);
    }
    function hotkey(a: Action): void {
        if (a === "state_save") {
            void saveSlot(1);
            return;
        }
        if (a === "state_load") {
            void loadSlot(1);
            return;
        }
        if (a === "pw_save") {
            void savePasswordNow();
            return;
        }
        if (a === "menu" && gameOn() && !menuOpen) {
            menu.open(true, canSavePassword());
            setMenuOpen(true);
            render();
        }
        else if (a === "fullscreen")
            toggleFullscreen();
        else if (a === "mute")
            change(() => { settings = { ...settings, audio: { ...settings.audio, mute: !settings.audio.mute } }; });
    }
    function switchRenderer(): void {
        change(() => { settings = { ...settings, video: { ...settings.video, renderer: settings.video.renderer === "original" ? "custom" : "original" } }; });
        menu.setItemCount("video", items("video").length);
        const note1 = rendererNote(settings, webgl2);
        showNotice(note1 || `Renderer: ${RENDERER_LABELS[rendererChoice(settings)]}`);
    }
    function saveMoment(): void {
        const m = menuOpen ? null : game.momentNow();
        if (m === null) {
            showNotice(NO_LEVEL_NOTICE);
            return;
        }
        const pageTimeMs = performance.now();
        const dpr = window.devicePixelRatio || 1;
        const shown: "custom" | "original" = m.hdCanvases.length > 0 && m.view !== null ? "custom" : "original";
        const pics = momentPictures(m.frame, shown === "custom" ? m.hdCanvases : [], dpr);
        const file = buildMoment({
            page: { version: c.appVersion, pageTimeMs, areaCss: pics.css, areaDevice: pics.device, devicePixelRatio: dpr, webgl2 },
            settings: { video: settings.video, speed: settings.speed, scheme: settings.input.scheme, hd: hdDrawSettings(settings) },
            place: { ...m.place, camera: m.view?.camera ?? null },
            view: shown === "custom" ? m.view : null,
            pictures: { shown, custom: pics.custom, original: pics.original },
        });
        const name = momentFileName(m.place, pageTimeMs);
        downloadText(name, JSON.stringify(file));
        motion?.log.noteMoment();
        showNotice(savedNotice(name));
    }
    function switchLayout(): void {
        change(() => { settings = adjustHdRow(settings, "hd_layout", 1, fovRange); });
        menu.setItemCount("video", items("video").length);
        showNotice(`Layout: ${CAP(settings.video.hd.layout)}${drawnRenderer(settings, webgl2) === "custom" ? "" : " (Custom)"}`);
    }
    function onAction(a: Action): void {
        if (menuOpen) {
            if (a === "fullscreen" || a === "mute" || a === "state_save" || a === "state_load")
                hotkey(a);
            else if (a === "b" && clearSavedCell())
                render();
            else
                menuAction(a);
        }
        else if (a === "menu" || a === "fullscreen" || a === "mute" || a === "state_save" || a === "state_load" || a === "pw_save")
            hotkey(a);
    }
    window.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (ev.ctrlKey || ev.metaKey || ev.altKey)
            return;
        if (ev.target instanceof HTMLInputElement)
            return;
        if (modernCapture) {
            ev.preventDefault();
            if (!ev.repeat)
                takeModernCapture(ev.code);
            return;
        }
        const mi = menuOpen ? null : modernLive();
        if (mi && !ev.repeat && MODERN_ACTIONS.some((x) => settings.input.modern.keys[x].includes(ev.code))) {
            mi.press(ev.code);
            ev.preventDefault();
        }
        if (menuOpen && !capture && isClearKey(ev.code) && menu.page === "input") {
            const row = items("input")[menu.item];
            if (row?.clear) {
                ev.preventDefault();
                if (!ev.repeat) {
                    note = "";
                    row.clear("key");
                }
                return;
            }
        }
        if (capture) {
            ev.preventDefault();
            if (ev.repeat)
                return;
            const action = capture.action;
            capture = null;
            if (ev.code === "Escape" && action !== "menu") {
                render();
                return;
            }
            const r = rebindKey(settings.input.keys, action, ev.code);
            note = r.unbound ? `${ACTION_LABELS[r.unbound]} is now unbound.` : "";
            changeBindings(r.bindings, settings.input.pad);
            return;
        }
        if (ev.code === c.keys.renderer) {
            ev.preventDefault();
            if (!ev.repeat)
                switchRenderer();
            return;
        }
        if (ev.code === c.keys.layout) {
            ev.preventDefault();
            if (!ev.repeat)
                switchLayout();
            return;
        }
        if (ev.code === c.keys.moment) {
            ev.preventDefault();
            if (!ev.repeat)
                saveMoment();
            return;
        }
        if (motionLogKey(motion, c.keys.motionLog, ev, showNotice))
            return;
        const before = input.controllerByte();
        const a = input.keyDown(ev.code);
        if (a === null)
            return;
        touchVis.keyOrPad();
        syncTouch();
        ev.preventDefault();
        latch |= input.controllerByte() & ~before;
        if (ev.repeat) {
            input.takeEdges();
            if (menuOpen && (a === "up" || a === "down" || a === "left" || a === "right"))
                menuAction(a);
            return;
        }
        for (const e of input.takeEdges())
            onAction(e);
    });
    window.addEventListener("keyup", (ev: KeyboardEvent) => { input.keyUp(ev.code); modernIn?.release(ev.code); });
    window.addEventListener("mousedown", (ev: MouseEvent) => {
        if (modernCapture) {
            ev.preventDefault();
            ev.stopPropagation();
            takeModernCapture(mouseCode(ev.button));
            return;
        }
        const mi = modernLive();
        if (mi && mouseAtt.locked && !menuOpen) {
            mi.press(mouseCode(ev.button));
            ev.preventDefault();
        }
    }, true);
    window.addEventListener("mouseup", (ev: MouseEvent) => { modernIn?.release(mouseCode(ev.button)); });
    window.addEventListener("wheel", (ev: WheelEvent) => {
        if (modernCapture) {
            const w = wheelCode(ev.deltaY);
            if (w) {
                ev.preventDefault();
                takeModernCapture(w);
            }
            return;
        }
        const mi = modernLive();
        if (mi && mouseAtt.locked && !menuOpen) {
            mi.wheel(ev.deltaY);
            ev.preventDefault();
        }
    }, { passive: false });
    window.addEventListener("pointerdown", (ev: PointerEvent) => { if (ev.pointerType === "touch") {
        touchVis.touched();
        syncTouch();
    } }, true);
    window.addEventListener("blur", () => { input.releaseAll(); modernIn?.releaseAll(); });
    document.addEventListener("fullscreenchange", () => { game.layout(); if (menuOpen)
        render(); });
    let prevPad: boolean[] = [];
    const pads = padPoll({ getGamepads: () => (typeof navigator.getGamepads === "function" ? navigator.getGamepads() : []), hasFocus: () => document.hasFocus() }, input);
    function readGamepad(): void {
        const gp = pads.read();
        if (!pads.focused)
            prevPad = [];
        if (gp) {
            const buttons = gp.buttons;
            if (capture) {
                const i = buttons.findIndex((b, k) => b && !prevPad[k]);
                if (i >= 0) {
                    const action = capture.action;
                    capture = null;
                    const r = rebindPad(settings.input.pad, action, i);
                    note = r.unbound ? `${ACTION_LABELS[r.unbound]} is now unbound.` : "";
                    changeBindings(settings.input.keys, r.bindings);
                }
            }
            else {
                const before = input.controllerByte();
                if (buttons.some((b, k) => b && !prevPad[k])) {
                    touchVis.keyOrPad();
                    syncTouch();
                }
                input.setPad(buttons, gp.axes);
                latch |= input.controllerByte() & ~before;
                for (const e of input.takeEdges())
                    onAction(e);
            }
            prevPad = buttons;
        }
    }
    const levelPlayedNow = (): boolean => {
        if (menuOpen || !game.running)
            return false;
        const pg = coopSession ? coopLiveNow?.coop.page : null;
        return pg ? coopSeatPlays(pg, pg.seat, menuOpen) : game.levelPlays;
    };
    let wasPlayed = false;
    const poll = (stamp: number): void => {
        const begun = performance.now();
        const played = levelPlayedNow();
        if (played && !wasPlayed)
            pointer.reset();
        wasPlayed = played;
        const w = pointer.close(begun);
        if (w.accepted !== 0 && game.running && !menuOpen) {
            mouse.move(w.accepted);
            modernLive()?.motion(w.accepted);
        }
        motion?.log.noteFilterWindow(w, { latenessMs: begun - stamp, captureMode, backlogDiscardedUnits: modernIn?.backlogDiscarded ?? 0 });
        mouseBits = mouseAtt.poll(performance.now());
        readGamepad();
        if (menuOpen && menu.page === "coop" && coopCtl) {
            const ws = coopCtl.waitingScreen(performance.now());
            if (ws === null ? waitShown !== null : waitShown === null || ws.line !== waitShown.line)
                render();
            else if (waitShown !== null && ws !== null)
                waitShown.spin.style.transform = `rotate(${ws.angle}deg)`;
        }
        requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
    void defaultSettings;
    menu.open(false);
    setMenuOpen(true);
    if (!settings.setup.done)
        openWizard();
    render();
    return () => { leaveGameView(); unguard(); motion?.uninstall(); };
}

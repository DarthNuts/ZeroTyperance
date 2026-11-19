/// <reference lib="dom" />
import type { AppConstants } from "./constants.js";
import type { AssetStore } from "./store.js";
import { GameHost } from "./game.js";
import { pagePackDoc } from "./page_pack.js";
import type { BundleSource } from "./game.js";
import { inputRowLayout, type InputRowDesc } from "./input_rows.js";
import { ACTIONS, HOTKEYS, InputState, defaultKeyBindings, defaultPadBindings, rebindKey, rebindPad } from "./input.js";
import type { Action } from "./input.js";
import { TouchVisibility } from "./touch.js";
import { TouchOverlay } from "./touch_dom.js";
import { OriginalMouse } from "./mouse.js";
import { attachMouse } from "./mouse_dom.js";
import { MODERN_ACTIONS, ModernInputState, defaultModernBindings, modernCapsFrom, mouseCode, rebindModern, wheelCode } from "./modern_input.js";
import type { ModernAction, ModernConfig } from "./modern_input.js";
import type { ModernDescriptor } from "../modern/seat.js";
import { MODERN_IDLE } from "../modern/canonical.js";
import { CHARACTER_NAMES, createCoopPage, onlineConnector } from "./coop_dom.js";
import type { CoopPageController } from "./coop_dom.js";
import { REASON_OWN_ERROR } from "../net/rollback.js";
import { padPoll } from "./pad_poll.js";
import { paintScreen, realGameOver, realOwnPause, realPartnerInfo, realSeatScreen, seatHearsEffect } from "./coop_live.js";
import { STEP_CLOCK_TICK_MS, STEP_CLOCK_WORKER_SOURCE, workerStepClock } from "./step_clock.js";
import type { ClockWorker } from "./step_clock.js";
import { netConstantsFrom } from "../net/constants.js";
import { ORIGINAL_SCHEME, packModernPad } from "../net/scheme.js";
import type { SeatScheme } from "../net/scheme.js";
import type { NetConstants } from "../net/constants.js";
import { MenuModel, ROWS, menuKeyOf } from "./menu.js";
import type { MenuEffect, PageId } from "./menu.js";
import { CHEAT_ROWS, cheatValue, stepCheat } from "./cheats_page.js";
import { freeEntryProblem, loadAlphabet, loadPasswords } from "./quickstart.js";
import type { PasswordRow } from "./quickstart.js";
import { checkPassword, clearSlot, loadExtraCodes, normalizeEntry, readSlots as readPasswordSlots, storeInSlot } from "./passwords.js";
import type { ExtraCode, PasswordTarget } from "./passwords.js";
import { passwordCodecFrom } from "../password/codec.js";
import type { PasswordCodecTables } from "../password/codec.js";
import { slotLabel, slotNumbers, slotStatus, stateStorage } from "./states.js";
import type { StateRecord } from "./states.js";
import { defaultSettings, loadSettings, saveSettings } from "./settings.js";
import type { KeyValueStorage, Settings } from "./settings.js";
import type { GameViewGuard } from "./leaving.js";
export interface ReleaseDeps {
    consts: AppConstants;
    store: AssetStore;
    md5: string;
    version: string;
    storage: KeyValueStorage | undefined;
    onReextract(): void;
    onForget(): Promise<void>;
    bundleSource?: BundleSource;
    passwordsJson?: unknown;
    alphabetJson?: unknown;
    guard?: GameViewGuard;
}
export const PASSWORD_URLS: readonly string[] = ["password_floors"];
export const ALPHABET_URLS: readonly string[] = ["password_codec"];
export const MODERN_URLS: readonly string[] = ["player_modern"];
export const NET_URLS: readonly string[] = ["net_rollback"];
export const COOP_URLS: readonly string[] = ["coop"];
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
const STYLE = `
.zt-root{position:fixed;inset:0;background:#000;color:#ddd;font:16px/1.5 sans-serif}
.zt-menu{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);z-index:2}
.zt-panel{min-width:360px;max-width:92vw;max-height:92vh;overflow:auto;padding:16px 24px;border:1px solid #666;background:#111}
.zt-panel h1{font-size:20px;margin:0 0 8px}
.zt-row{padding:2px 10px;cursor:pointer;display:flex;justify-content:space-between;gap:24px}
.zt-row.sel{background:#335;color:#fff}
.zt-note{color:#999;font-size:13px;margin-top:8px}
.zt-version{color:#777;font-size:11px;margin-top:8px}
.zt-game{position:absolute;inset:0}
[hidden]{display:none !important}
`;
export async function mountRelease(container: HTMLElement, deps: ReleaseDeps): Promise<() => void> {
    const c = deps.consts;
    let settings: Settings = loadSettings(deps.storage, c);
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
    const modernOn = (): boolean => settings.input.scheme === "modern";
    mouse.enabled = settings.input.mouse.enabled || modernOn();
    const modernCfg = (): ModernConfig => ({
        bindings: settings.input.modern.keys, mouse: settings.input.modern.mouse,
        turnCap: settings.input.modern.turn_cap, crouchToggle: settings.input.modern.crouch_toggle,
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
    let mouseBits = 0;
    const mouseAtt = attachMouse(gameDiv, mouse, () => game.running && !menuOpen, () => {
        if (!menuOpen) {
            menu.open(true, canSavePassword());
            setMenuOpen(true);
            render();
        }
    });
    const syncTouch = (): void => touch.setVisible(game.running && !menuOpen && touchVis.visible);
    const save = (): void => { saveSettings(deps.storage, c, settings); };
    const game = new GameHost({
        container: gameDiv, consts: c, store: deps.store, md5: deps.md5, version: deps.version,
        getSettings: () => settings,
        pad: () => {
            const v = menuOpen ? 0 : latch | input.controllerByte() | (modernOn() ? 0 : mouseBits);
            latch = 0;
            return v;
        },
        modern: (): ModernDescriptor | null => {
            const m = modernLive();
            if (m === null)
                return null;
            return { scheme: "modern", turnCap: settings.input.modern.turn_cap, selection: settings.input.modern.selection, input: m.stepInput() };
        },
        ...(deps.bundleSource ? { bundleSource: deps.bundleSource } : {}),
    });
    interface Item {
        label: string;
        value: string;
        group?: string;
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
    let sessionScheme: SeatScheme = ORIGINAL_SCHEME;
    const characterPair = (v: unknown): readonly [
        number,
        number
    ] => (Array.isArray(v) && typeof v[0] === "number" && typeof v[1] === "number" ? [v[0], v[1]] : [0, 0]);
    let coopCtl: CoopPageController | null = null;
    function leaveGameView(): void {
        coopCtl?.quit();
        coopSession = false;
        partnerDiv.hidden = true;
    }
    let coopError = "";
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
            const seatRules = { lootSoundPartner: coopValue("COOP.LOOT_SOUND_PARTNER"), bodyRadius: coopValue("COOP.BODY_RADIUS"), exitCountdown: coopValue("COOP.EXIT_COUNTDOWN") };
            loadPasswords(pwDoc);
            if (!(await game.coopReady()))
                throw new Error("the game core did not come up");
            const screens = game.coopScreens(() => game.keptPassword);
            if (screens === null)
                throw new Error("the title menu or the character select is not loaded");
            coopCtl = createCoopPage({
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
                    drawScreen: (pic) => {
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
                    },
                    ownPause: realOwnPause,
                    onStepError: (text, err) => { console.error(`${REASON_OWN_ERROR}: ${text}`, err); },
                    drawOwn: (scr) => { const ctx = game.canvasElement?.getContext("2d"); if (ctx)
                        paintScreen(ctx, scr); },
                    sound: (seat, e) => { if (seatHearsEffect(seat, e))
                        game.coopSounds([e.id as string]); },
                    partnerInfo: realPartnerInfo,
                    gameOver: realGameOver,
                    stepClock: workerStepClock(() => new Worker(new URL(STEP_CLOCK_WORKER_FILE, document.baseURI), { type: "module" }) as unknown as ClockWorker, () => performance.now(), { setInterval: (f, ms) => setInterval(f, ms), clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>) }, STEP_CLOCK_TICK_MS, [() => new Worker(URL.createObjectURL(new Blob([STEP_CLOCK_WORKER_SOURCE], { type: "text/javascript" }))) as unknown as ClockWorker]),
                    raf: (cb) => requestAnimationFrame(cb),
                    cancelRaf: (h) => cancelAnimationFrame(h as number),
                },
                requestRender: () => { if (menuOpen) {
                    menu.setItemCount("coop", items("coop").length);
                    render();
                } },
                onSessionStart: () => {
                    coopSession = true;
                    partnerDiv.hidden = false;
                    menuOpen = false;
                    menuDiv.hidden = true;
                    gameDiv.hidden = false;
                    input.releaseAll();
                    latch = 0;
                },
                onSessionEnd: (reason, lost) => { note = reason.startsWith(REASON_OWN_ERROR) ? `${reason}.` : lost ? `PLAYER CONNECTION LOST: ${reason}. You play on alone.` : `The session ended: ${reason}. You play on alone.`; },
                onGameOver: () => {
                    coopSession = false;
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
    }
    function inputRows(): InputRow[] {
        const step = (delta: -1 | 1, chosen: boolean): number => (chosen ? 1 : delta);
        const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
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
                    return {
                        label,
                        value: capture?.action === a ? "press a key or a pad button..." : `${keyName(settings.input.keys[a])}  |  ${padName(settings.input.pad[a])}`,
                        act: (_d, chosen) => { if (chosen) {
                            capture = { action: a };
                            render();
                        } },
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
                    return {
                        label, value: String(settings.input.mouse.sensitivity),
                        act: (delta, chosen) => {
                            const v = clamp(settings.input.mouse.sensitivity + step(delta, chosen), c.mouse.sensMin, c.mouse.sensMax);
                            change(() => { settings = { ...settings, input: { ...settings.input, mouse: { ...settings.input.mouse, sensitivity: v } } }; });
                            mouse.sensitivity = v;
                        },
                    };
                case "modern_sensitivity":
                    return { label, value: String(mm.sensitivity),
                        act: (d2, ch) => setModernMouse({ sensitivity: clamp(mm.sensitivity + step(d2, ch), c.modern.mouse.sensMin, c.modern.mouse.sensMax) }) };
                case "modern_accel":
                    return { label, value: String(mm.accel), act: (d2, ch) => setModernMouse({ accel: clamp(mm.accel + step(d2, ch), 0, PERCENT_MAX) }) };
                case "modern_decel":
                    return { label, value: String(mm.decel), act: (d2, ch) => setModernMouse({ decel: clamp(mm.decel + step(d2, ch), 0, PERCENT_MAX) }) };
                case "modern_smoothing":
                    return { label, value: String(mm.smoothing),
                        act: (d2, ch) => setModernMouse({ smoothing: clamp(mm.smoothing + step(d2, ch), 1, c.modern.mouse.smoothMax) }) };
                case "turn_cap":
                    return { label, value: settings.input.modern.turn_cap,
                        act: () => setModern({ turn_cap: settings.input.modern.turn_cap === "fast" ? "original" : "fast" }) };
                case "selection":
                    return { label, value: settings.input.modern.selection === "slots" ? "Slots" : "Carousel",
                        act: () => setModern({ selection: settings.input.modern.selection === "slots" ? "carousel" : "slots" }) };
                case "crouch_toggle":
                    return { label, value: settings.input.modern.crouch_toggle ? "on" : "off",
                        act: () => setModern({ crouch_toggle: !settings.input.modern.crouch_toggle }) };
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
    function items(page: PageId): Item[] {
        switch (page) {
            case "input":
                return inputRows().map((r) => ({ label: r.label, value: r.value }));
            case "video":
                return [
                    { label: "Scale", value: settings.video.scale === "fit" ? "fit" : `${settings.video.scale}x` },
                    { label: "Filter", value: settings.video.filter },
                    { label: "Keep aspect", value: settings.video.keep_aspect ? "on" : "off" },
                    { label: "Full screen", value: document.fullscreenElement ? "on" : "off" },
                    { label: "Speed", value: settings.speed.mode === "original" ? "Original" : "Custom" },
                    { label: "Custom steps a second", value: String(settings.speed.custom_steps) },
                ];
            case "sound":
                return [
                    { label: "Volume", value: String(settings.audio.volume) },
                    { label: "Mute", value: settings.audio.mute ? "on" : "off" },
                ];
            case "password": {
                const slots = savedSlots();
                return [
                    ...(pwTop() ? [{ label: "Save password", value: "the running game's password, in its level's slot" }] : []),
                    ...(passwords ?? []).map((r, i) => {
                        const saved = `Saved ${slots[i] || "-"}`, def = `Default ${r.code}`;
                        return { label: r.name, value: (pwCell[i] ?? "default") === "saved" ? `[${saved}]  ${def}` : `${saved}  [${def}]`, group: `Episode ${r.episode + 1}` };
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
                    return { label: slotLabel(n, slots[i], c, deps.md5), value: slotAction[i] === "save" ? `[${save}]  ${load}` : `${save}  [${load}]` };
                });
            }
            case "coop":
                return coopCtl ? coopCtl.items() : [{ label: coopError || "Loading the co-op data...", value: "" }];
            case "cheats":
                return CHEAT_ROWS.map((r) => ({ label: r.label, value: cheatValue(settings, r.key) }));
            case "about":
                return [
                    { label: "Re-extract", value: "" },
                    { label: "Forget", value: "" },
                ];
            default:
                return [];
        }
    }
    function render(): void {
        panel.textContent = "";
        const h = document.createElement("h1");
        h.textContent = c.title;
        panel.appendChild(h);
        const page = menu.page;
        const rows: Item[] = page === "root" ? menu.rootLabels().map((label) => ({ label, value: "" })) : items(page);
        const sel = page === "root" ? menu.cursor : menu.item;
        if (page !== "root") {
            const t = document.createElement("div");
            t.textContent = ROWS.find((r) => r.page === page)?.label ?? "";
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
            v.textContent = r.value;
            d.append(l, v);
            d.addEventListener("click", () => {
                if (capture || modernCapture)
                    return;
                setCursor(page, i);
                apply(menu.press("choose"));
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
            coopCtl?.adjust(index, delta, chosen);
            menu.setItemCount("coop", items("coop").length);
            render();
            return;
        }
        if (page === "video") {
            switch (index) {
                case 0:
                    cycleScale(delta);
                    break;
                case 1:
                    change(() => { settings = { ...settings, video: { ...settings.video, filter: settings.video.filter === "nearest" ? "smooth" : "nearest" } }; });
                    break;
                case 2:
                    change(() => { settings = { ...settings, video: { ...settings.video, keep_aspect: !settings.video.keep_aspect } }; });
                    break;
                case 3:
                    if (chosen)
                        toggleFullscreen();
                    break;
                case 4:
                    change(() => { settings = { ...settings, speed: { ...settings.speed, mode: settings.speed.mode === "original" ? "custom" : "original" } }; });
                    break;
                case 5: {
                    const step = chosen ? 1 : delta;
                    const v = Math.min(c.speed.customMax, Math.max(c.speed.customMin, settings.speed.custom_steps + step));
                    change(() => { settings = { ...settings, speed: { ...settings.speed, custom_steps: v } }; });
                    break;
                }
            }
            return;
        }
        if (page === "sound") {
            if (index === 0) {
                const v = Math.min(100, Math.max(0, settings.audio.volume + (chosen ? 5 : delta * 5)));
                change(() => { settings = { ...settings, audio: { ...settings.audio, volume: v } }; });
            }
            else {
                change(() => { settings = { ...settings, audio: { ...settings.audio, mute: !settings.audio.mute } }; });
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
        if (page === "about" && chosen) {
            leaveGameView();
            if (index === 0)
                deps.onReextract();
            else
                void deps.onForget();
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
        const run = game.startFromPassword(code);
        setMenuOpen(false);
        run.then((ok) => {
            if (!ok) {
                note = "The game refuses this password.";
                menu.open(game.running);
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
        if (k)
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
        if (a === "menu" && game.running && !menuOpen) {
            menu.open(true, canSavePassword());
            setMenuOpen(true);
            render();
        }
        else if (a === "fullscreen")
            toggleFullscreen();
        else if (a === "mute")
            change(() => { settings = { ...settings, audio: { ...settings.audio, mute: !settings.audio.mute } }; });
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
    document.addEventListener("mousemove", (ev: MouseEvent) => { const mi = modernLive(); if (mi && mouseAtt.locked && !menuOpen)
        mi.motion(ev.movementX); });
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
    const poll = (): void => {
        mouseBits = mouseAtt.poll(performance.now());
        readGamepad();
        requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
    void defaultSettings;
    menu.open(false);
    setMenuOpen(true);
    render();
    return () => { leaveGameView(); unguard(); };
}

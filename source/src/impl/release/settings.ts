import { DISPLAY_HEIGHT, DISPLAY_WIDTH } from "../boot/model.js";
import type { AppConstants } from "./constants.js";
import { ACTIONS, defaultKeyBindings, defaultPadBindings } from "./input.js";
import type { KeyBindings, PadBindings } from "./input.js";
import { MODERN_ACTIONS, defaultModernBindings } from "./modern_input.js";
import type { ModernBindings } from "./modern_input.js";
export const SETTINGS_VERSION = 1;
const VOLUME_MIN = 0;
export type IntroMode = "none" | "start" | "skip";
export const INTRO_MODES: readonly IntroMode[] = ["none", "start", "skip"];
export type CheatSelector = "off" | "none" | "half" | "double";
const SELECTORS: readonly string[] = ["off", "none", "half", "double"];
export interface ModernSettings {
    keys: ModernBindings;
    mouse: {
        sensitivity: number;
        accel: number;
        decel: number;
        smoothing: number;
    };
    turn_cap: "original" | "fast";
    turn_backlog: "steps6" | "unlimited";
    selection: "carousel" | "slots";
    crouch_toggle: boolean;
}
const PERCENT_MAX = 100;
export type HdLayout = "corners" | "bar";
export type HdResolution = "native" | "half" | "quarter" | "original";
export type HdTextureFilter = "sharp" | "smooth";
export type Renderer = "original" | "custom";
export const HD_LAYOUTS: readonly HdLayout[] = ["corners", "bar"];
export const HD_RESOLUTIONS: readonly HdResolution[] = ["native", "half", "quarter", "original"];
export type HdMarkers = "show" | "transparent" | "shadow";
export const HD_MARKERS: readonly HdMarkers[] = ["show", "transparent", "shadow"];
export const HD_TEXTURE_FILTERS: readonly HdTextureFilter[] = ["sharp", "smooth"];
export type HdHandSize = number;
export const HAND_SIZE_MIN_TENTHS = 5;
export const HAND_SIZE_MAX_TENTHS = 40;
const TENTHS = 10;
const HAND_SIZE_OLD: Readonly<Record<string, number>> = { normal: 1, double: 2 };
export function handSizeOf(v: unknown, d: number): number {
    if (typeof v === "string" && v in HAND_SIZE_OLD)
        return HAND_SIZE_OLD[v]!;
    if (typeof v !== "number" || !Number.isFinite(v))
        return d;
    return Math.min(HAND_SIZE_MAX_TENTHS, Math.max(HAND_SIZE_MIN_TENTHS, Math.round(v * TENTHS))) / TENTHS;
}
export function stepHandSize(cur: number, delta: number): number {
    return handSizeOf((Math.round(cur * TENTHS) + delta) / TENTHS, cur);
}
export type VoiceMode = "classic" | "once" | "once_per_phrase";
export const VOICE_MODES: readonly VoiceMode[] = ["classic", "once", "once_per_phrase"];
export const VOICE_INTERVAL_MIN = 1;
export const VOICE_INTERVAL_MAX = 60;
const VOICE_INTERVAL_DEFAULT = 10;
export type HdFrameLimit = "display" | 60 | 30;
export const HD_FRAME_LIMITS: readonly HdFrameLimit[] = ["display", 60, 30];
export const RENDERERS: readonly Renderer[] = ["original", "custom"];
export const FOV_STEP = 5;
export interface FovRange {
    readonly min: number;
    readonly max: number;
}
export interface HdSettings {
    layout: HdLayout;
    fov: "auto" | number;
    resolution: HdResolution;
    smooth_motion: boolean;
    smooth_shading: boolean;
    texture_filter: HdTextureFilter;
    loot: boolean;
    markers: HdMarkers;
    hand_size: HdHandSize;
    frame_limit: HdFrameLimit;
}
export interface Settings {
    version: number;
    speed: {
        mode: "original" | "custom";
        custom_steps: number;
    };
    video: {
        scale: "fit" | number;
        filter: "nearest" | "smooth";
        keep_aspect: boolean;
        renderer: Renderer;
        hd: HdSettings;
        show_ping: boolean;
    };
    setup: {
        done: boolean;
    };
    audio: {
        volume: number;
        mute: boolean;
        voice_mode: VoiceMode;
        voice_interval: number;
    };
    game: {
        intro: IntroMode;
        fix_990: boolean;
    };
    cheats: {
        c1: boolean;
        c2: boolean;
        c3: boolean;
        c4: boolean;
        c5: CheatSelector;
        c6: CheatSelector;
    };
    input: {
        keys: KeyBindings;
        pad: PadBindings;
        touch: "auto" | "on" | "off";
        mouse: {
            enabled: boolean;
            sensitivity: number;
            raw: boolean;
        };
        scheme: "original" | "modern";
        modern: ModernSettings;
    };
    passwords: {
        saved: string[];
    };
    net: {
        server: string;
        stun: string[];
        delay: number | null;
    };
}
const PASSWORD_CHARS = 9;
export function defaultModernSettings(c: AppConstants): ModernSettings {
    return {
        keys: defaultModernBindings(c),
        mouse: { sensitivity: c.modern.mouse.sensDefault, accel: 0, decel: 0, smoothing: 1 },
        turn_cap: "fast", turn_backlog: "steps6", selection: "slots", crouch_toggle: false,
    };
}
function modernKeys(v: unknown, d: ModernBindings): ModernBindings {
    const out = {} as ModernBindings;
    const seen = new Set<string>();
    const src = isObj(v) ? v : {};
    for (const a of MODERN_ACTIONS) {
        const x = src[a];
        const list = Array.isArray(x) && x.every((e) => typeof e === "string" && e !== "") ? (x as string[]) : d[a];
        out[a] = [];
        for (const code of list)
            if (!seen.has(code)) {
                seen.add(code);
                out[a].push(code);
            }
    }
    return out;
}
function normalizeModern(v: unknown, c: AppConstants, d: ModernSettings): ModernSettings {
    const m = isObj(v) ? v : {};
    const mouse = isObj(m.mouse) ? m.mouse : {};
    return {
        keys: modernKeys(m.keys, d.keys),
        mouse: {
            sensitivity: clampInt(mouse.sensitivity, c.modern.mouse.sensMin, c.modern.mouse.sensMax, d.mouse.sensitivity),
            accel: clampInt(mouse.accel, 0, PERCENT_MAX, d.mouse.accel),
            decel: clampInt(mouse.decel, 0, PERCENT_MAX, d.mouse.decel),
            smoothing: clampInt(mouse.smoothing, 1, c.modern.mouse.smoothMax, d.mouse.smoothing),
        },
        turn_cap: oneOf(m.turn_cap, ["original", "fast"], d.turn_cap),
        turn_backlog: oneOf(m.turn_backlog, ["steps6", "unlimited"], d.turn_backlog),
        selection: oneOf(m.selection, ["carousel", "slots"], d.selection),
        crouch_toggle: bool(m.crouch_toggle, d.crouch_toggle),
    };
}
export function defaultHdSettings(): HdSettings {
    return { layout: "corners", fov: "auto", resolution: "native", smooth_motion: true, smooth_shading: true, texture_filter: "sharp", loot: true, markers: "transparent", hand_size: 2, frame_limit: "display" };
}
function fovOf(v: unknown, range: FovRange | undefined, d: "auto" | number): "auto" | number {
    if (v === "auto")
        return "auto";
    if (typeof v !== "number" || !Number.isInteger(v) || v % FOV_STEP !== 0)
        return d;
    if (range ? v < range.min || v > range.max : v < 1)
        return d;
    return v;
}
function normalizeHd(v: unknown, range: FovRange | undefined, d: HdSettings): HdSettings {
    const h = isObj(v) ? v : {};
    return {
        layout: oneOf(h.layout, HD_LAYOUTS, d.layout),
        fov: fovOf(h.fov, range, d.fov),
        resolution: oneOf(h.resolution, HD_RESOLUTIONS, d.resolution),
        smooth_motion: bool(h.smooth_motion, d.smooth_motion),
        smooth_shading: bool(h.smooth_shading, d.smooth_shading),
        texture_filter: oneOf(h.texture_filter, HD_TEXTURE_FILTERS, d.texture_filter),
        loot: bool(h.loot, d.loot),
        markers: oneOf(h.markers, HD_MARKERS, d.markers),
        hand_size: handSizeOf(h.hand_size, d.hand_size),
        frame_limit: HD_FRAME_LIMITS.includes(h.frame_limit as HdFrameLimit) ? (h.frame_limit as HdFrameLimit) : d.frame_limit,
    };
}
export function defaultSettings(c: AppConstants): Settings {
    return {
        version: SETTINGS_VERSION,
        setup: { done: false },
        speed: { mode: "original", custom_steps: c.speed.customDefault },
        video: { scale: "fit", filter: "nearest", keep_aspect: true, renderer: "custom", hd: defaultHdSettings(), show_ping: false },
        audio: { volume: c.audio.volumeDefault, mute: false, voice_mode: "once_per_phrase", voice_interval: VOICE_INTERVAL_DEFAULT },
        game: { intro: "start", fix_990: true },
        cheats: { c1: false, c2: false, c3: false, c4: false, c5: "off", c6: "off" },
        input: { keys: defaultKeyBindings(c), pad: defaultPadBindings(c), touch: c.touch.default, mouse: { enabled: false, sensitivity: c.mouse.sensDefault, raw: false },
            scheme: "modern", modern: defaultModernSettings(c) },
        passwords: { saved: Array.from({ length: c.pw.slots }, () => "") },
        net: { server: "", stun: [], delay: null },
    };
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
function clampInt(v: unknown, lo: number, hi: number, d: number): number {
    if (typeof v !== "number" || !Number.isFinite(v))
        return d;
    return Math.min(hi, Math.max(lo, Math.round(v)));
}
function oneOf<T extends string>(v: unknown, allowed: readonly string[], d: T): T {
    return typeof v === "string" && allowed.includes(v) ? (v as T) : d;
}
function bindings<T extends string | number>(v: unknown, d: Record<(typeof ACTIONS)[number], T | null>, ok: (x: unknown) => x is T): Record<(typeof ACTIONS)[number], T | null> {
    if (!isObj(v))
        return { ...d };
    const out = { ...d };
    const seen = new Set<T>();
    for (const a of ACTIONS) {
        const x = v[a];
        if (x === null)
            out[a] = null;
        else if (ok(x) && !seen.has(x))
            out[a] = x;
        else if (x !== undefined)
            out[a] = d[a];
        if (out[a] !== null) {
            if (seen.has(out[a] as T))
                out[a] = null;
            else
                seen.add(out[a] as T);
        }
    }
    return out;
}
function introOf(game: Record<string, unknown>, d: IntroMode): IntroMode {
    if (typeof game.intro === "string" && (INTRO_MODES as readonly string[]).includes(game.intro))
        return game.intro as IntroMode;
    if (typeof game.skip_intro === "boolean")
        return game.skip_intro ? "skip" : "start";
    return d;
}
export function normalizeSettings(v: unknown, c: AppConstants, fov?: FovRange): Settings {
    const d = defaultSettings(c);
    if (!isObj(v) || v.version !== SETTINGS_VERSION)
        return d;
    const speed = isObj(v.speed) ? v.speed : {};
    const video = isObj(v.video) ? v.video : {};
    const audio = isObj(v.audio) ? v.audio : {};
    const game = isObj(v.game) ? v.game : {};
    const cheats = isObj(v.cheats) ? v.cheats : {};
    const input = isObj(v.input) ? v.input : {};
    const mouse = isObj(input.mouse) ? input.mouse : {};
    const pw = isObj(v.passwords) ? v.passwords : {};
    const net = isObj(v.net) ? v.net : {};
    const setup = isObj(v.setup) ? v.setup : {};
    const scale = video.scale;
    return {
        version: SETTINGS_VERSION,
        setup: { done: bool(setup.done, true) },
        speed: {
            mode: oneOf(speed.mode, ["original", "custom"], d.speed.mode),
            custom_steps: clampInt(speed.custom_steps, c.speed.customMin, c.speed.customMax, d.speed.custom_steps),
        },
        video: {
            scale: scale === "fit" ? "fit" : typeof scale === "number" && Number.isInteger(scale) && scale >= 1 ? scale : d.video.scale,
            filter: oneOf(video.filter, ["nearest", "smooth"], d.video.filter),
            keep_aspect: bool(video.keep_aspect, d.video.keep_aspect),
            renderer: oneOf(video.renderer, RENDERERS, d.video.renderer),
            hd: normalizeHd(video.hd, fov, d.video.hd),
            show_ping: bool(video.show_ping, d.video.show_ping),
        },
        audio: {
            volume: clampInt(audio.volume, VOLUME_MIN, c.audio.volumeMax, d.audio.volume),
            mute: bool(audio.mute, d.audio.mute),
            voice_mode: oneOf(audio.voice_mode, VOICE_MODES, d.audio.voice_mode),
            voice_interval: clampInt(audio.voice_interval, VOICE_INTERVAL_MIN, VOICE_INTERVAL_MAX, d.audio.voice_interval),
        },
        game: { intro: introOf(game, d.game.intro), fix_990: bool(game.fix_990, d.game.fix_990) },
        cheats: {
            c1: bool(cheats.c1, false), c2: bool(cheats.c2, false), c3: bool(cheats.c3, false), c4: bool(cheats.c4, false),
            c5: oneOf(cheats.c5, SELECTORS, "off"), c6: oneOf(cheats.c6, SELECTORS, "off"),
        },
        input: {
            keys: bindings(input.keys, d.input.keys, (x): x is string => typeof x === "string" && x !== ""),
            pad: bindings(input.pad, d.input.pad, (x): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0),
            touch: oneOf(input.touch, ["auto", "on", "off"], d.input.touch),
            scheme: oneOf(input.scheme, ["original", "modern"], d.input.scheme),
            modern: normalizeModern(input.modern, c, d.input.modern),
            mouse: {
                enabled: bool(mouse.enabled, d.input.mouse.enabled),
                sensitivity: clampInt(mouse.sensitivity, c.mouse.sensMin, c.mouse.sensMax, d.input.mouse.sensitivity),
                raw: bool(mouse.raw, d.input.mouse.raw),
            },
        },
        passwords: {
            saved: d.passwords.saved.map((_, i) => {
                const v = Array.isArray(pw.saved) ? pw.saved[i] : undefined;
                return typeof v === "string" && [...v].length === PASSWORD_CHARS ? v : "";
            }),
        },
        net: {
            server: typeof net.server === "string" ? net.server : "",
            stun: Array.isArray(net.stun) ? net.stun.filter((x): x is string => typeof x === "string" && x !== "") : [],
            delay: typeof net.delay === "number" && Number.isInteger(net.delay) && net.delay >= 0 ? net.delay : null,
        },
    };
}
export interface KeyValueStorage {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
}
export function loadSettings(s: KeyValueStorage | undefined, c: AppConstants, fov?: FovRange): Settings {
    if (!s)
        return defaultSettings(c);
    try {
        const raw = s.getItem(c.settingsKey);
        if (raw === null || raw === undefined)
            return defaultSettings(c);
        return normalizeSettings(JSON.parse(raw), c, fov);
    }
    catch {
        return defaultSettings(c);
    }
}
export function saveSettings(s: KeyValueStorage | undefined, c: AppConstants, v: Settings, fov?: FovRange): boolean {
    if (!s)
        return false;
    try {
        s.setItem(c.settingsKey, JSON.stringify({ ...normalizeSettings(v, c, fov), version: SETTINGS_VERSION }));
        return true;
    }
    catch {
        return false;
    }
}
export class MemoryKeyValueStorage implements KeyValueStorage {
    readonly map = new Map<string, string>();
    getItem(k: string): string | null { return this.map.has(k) ? this.map.get(k)! : null; }
    setItem(k: string, v: string): void { this.map.set(k, v); }
    removeItem(k: string): void { this.map.delete(k); }
}
export function fitScale(winW: number, winH: number, keepAspect: boolean, scale: "fit" | number = "fit"): {
    sx: number;
    sy: number;
} {
    const fx = winW / DISPLAY_WIDTH;
    const fy = winH / DISPLAY_HEIGHT;
    if (scale === "fit")
        return keepAspect ? { sx: Math.min(fx, fy), sy: Math.min(fx, fy) } : { sx: fx, sy: fy };
    const k = Math.max(1, Math.min(scale, Math.floor(keepAspect ? Math.min(fx, fy) : Math.min(fx, fy))));
    return { sx: k, sy: k };
}
export function drawnRenderer(s: Settings, webgl2Available: boolean): Renderer {
    return s.video.renderer === "custom" && webgl2Available ? "custom" : "original";
}
export interface HdDrawSettings {
    resolution: HdResolution;
    layout: HdLayout;
    smooth_motion: boolean;
    loot: boolean;
    markers: HdMarkers;
    hand_size: HdHandSize;
    frame_limit: HdFrameLimit;
    params: {
        fov: "auto" | number;
        smooth: boolean;
        filter: HdTextureFilter;
    };
}
export function hdDrawSettings(s: Settings): HdDrawSettings {
    const h = s.video.hd;
    return { resolution: h.resolution, layout: h.layout, smooth_motion: h.smooth_motion, loot: h.loot, markers: h.markers, hand_size: h.hand_size, frame_limit: h.frame_limit, params: { fov: h.fov, smooth: h.smooth_shading, filter: h.texture_filter } };
}
export type VideoRowId = "scale" | "filter" | "keep_aspect" | "renderer" | "hd_layout" | "hd_hand_size" | "hd_fov" | "hd_resolution" | "hd_smooth_motion" | "hd_frame_limit" | "hd_smooth_shading" | "hd_texture_filter" | "hd_loot" | "hd_markers" | "fullscreen" | "show_ping";
export type GameplayRowId = "speed" | "custom_steps" | "intro" | "fix990" | "setup";
export const GAMEPLAY_ROW_IDS: readonly GameplayRowId[] = ["speed", "custom_steps", "intro", "fix990", "setup"];
export const HD_ROW_IDS: readonly VideoRowId[] = ["hd_layout", "hd_hand_size", "hd_fov", "hd_resolution", "hd_smooth_motion", "hd_frame_limit", "hd_smooth_shading", "hd_texture_filter", "hd_loot", "hd_markers"];
export function videoRowIds(s: Settings, webgl2Available: boolean): VideoRowId[] {
    const shown = (id: VideoRowId): boolean => (id !== "hd_hand_size" || s.video.hd.layout === "corners") && (id !== "hd_frame_limit" || s.video.hd.smooth_motion);
    const hd = drawnRenderer(s, webgl2Available) === "custom" ? HD_ROW_IDS.filter(shown) : [];
    return ["scale", "filter", "keep_aspect", "renderer", ...hd, "fullscreen", "show_ping"];
}
export type RendererChoice = "original" | "custom" | "classic_smooth";
export const RENDERER_CHOICES: readonly RendererChoice[] = ["original", "custom", "classic_smooth"];
export const RENDERER_LABELS: Readonly<Record<RendererChoice, string>> = { original: "Original", custom: "Custom", classic_smooth: "Classic smooth" };
const CLASSIC_SMOOTH: Pick<HdSettings, "layout" | "resolution" | "fov" | "smooth_motion"> = { layout: "bar", resolution: "original", fov: "auto", smooth_motion: true };
export function isClassicSmooth(s: Settings): boolean {
    const h = s.video.hd;
    return s.video.renderer === "custom" && h.layout === CLASSIC_SMOOTH.layout && h.resolution === CLASSIC_SMOOTH.resolution && h.fov === CLASSIC_SMOOTH.fov && h.smooth_motion === CLASSIC_SMOOTH.smooth_motion;
}
export function rendererChoice(s: Settings): RendererChoice {
    return s.video.renderer === "original" ? "original" : isClassicSmooth(s) ? "classic_smooth" : "custom";
}
export function withRendererChoice(s: Settings, c: RendererChoice): Settings {
    const v = s.video;
    if (c === "original")
        return { ...s, video: { ...v, renderer: "original" } };
    if (c === "classic_smooth")
        return { ...s, video: { ...v, renderer: "custom", hd: { ...v.hd, ...CLASSIC_SMOOTH } } };
    const back = isClassicSmooth({ ...s, video: { ...v, renderer: "custom" } });
    const d = defaultHdSettings();
    return { ...s, video: { ...v, renderer: "custom", hd: back ? { ...v.hd, layout: d.layout, resolution: d.resolution, fov: d.fov, smooth_motion: d.smooth_motion } : v.hd } };
}
export const CUSTOM_NEEDS_WEBGL2 = "Custom needs WebGL2: this browser shows Original";
export function rendererNote(s: Settings, webgl2Available: boolean): string {
    return s.video.renderer === "custom" && !webgl2Available ? CUSTOM_NEEDS_WEBGL2 : "";
}
export function fovChoices(range: FovRange): ("auto" | number)[] {
    const out: ("auto" | number)[] = ["auto"];
    for (let v = range.min; v <= range.max; v += FOV_STEP)
        out.push(v);
    return out;
}
export function cycle<T>(list: readonly T[], cur: T, delta: number): T {
    const at = Math.max(0, list.indexOf(cur));
    return list[(at + delta + list.length) % list.length]!;
}
export function adjustHdRow(s: Settings, id: VideoRowId, delta: number, range: FovRange | undefined): Settings {
    const v = s.video, h = v.hd;
    const set = (hd: Partial<HdSettings>): Settings => ({ ...s, video: { ...v, hd: { ...h, ...hd } } });
    switch (id) {
        case "renderer": return withRendererChoice(s, cycle(RENDERER_CHOICES, rendererChoice(s), delta));
        case "hd_layout": return set({ layout: cycle(HD_LAYOUTS, h.layout, delta) });
        case "hd_hand_size": return set({ hand_size: stepHandSize(h.hand_size, delta) });
        case "hd_frame_limit": return set({ frame_limit: cycle(HD_FRAME_LIMITS, h.frame_limit, delta) });
        case "hd_fov": return range ? set({ fov: cycle(fovChoices(range), h.fov, delta) }) : s;
        case "hd_resolution": return set({ resolution: cycle(HD_RESOLUTIONS, h.resolution, delta) });
        case "hd_smooth_motion": return set({ smooth_motion: !h.smooth_motion });
        case "hd_smooth_shading": return set({ smooth_shading: !h.smooth_shading });
        case "hd_texture_filter": return set({ texture_filter: cycle(HD_TEXTURE_FILTERS, h.texture_filter, delta) });
        case "hd_loot": return set({ loot: !h.loot });
        case "hd_markers": return set({ markers: cycle(HD_MARKERS, h.markers, delta) });
        default: return s;
    }
}

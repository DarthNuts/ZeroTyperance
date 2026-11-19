import { DISPLAY_HEIGHT, DISPLAY_WIDTH } from "../boot/model.js";
import type { AppConstants } from "./constants.js";
import { ACTIONS, defaultKeyBindings, defaultPadBindings } from "./input.js";
import type { KeyBindings, PadBindings } from "./input.js";
import { MODERN_ACTIONS, defaultModernBindings } from "./modern_input.js";
import type { ModernBindings } from "./modern_input.js";
export const SETTINGS_VERSION = 1;
const VOLUME_MIN = 0;
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
    selection: "carousel" | "slots";
    crouch_toggle: boolean;
}
const PERCENT_MAX = 100;
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
    };
    audio: {
        volume: number;
        mute: boolean;
    };
    game: {
        skip_intro: boolean;
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
        turn_cap: "fast", selection: "slots", crouch_toggle: false,
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
        selection: oneOf(m.selection, ["carousel", "slots"], d.selection),
        crouch_toggle: bool(m.crouch_toggle, d.crouch_toggle),
    };
}
export function defaultSettings(c: AppConstants): Settings {
    return {
        version: SETTINGS_VERSION,
        speed: { mode: "original", custom_steps: c.speed.customDefault },
        video: { scale: "fit", filter: "nearest", keep_aspect: true },
        audio: { volume: c.audio.volumeDefault, mute: false },
        game: { skip_intro: false, fix_990: true },
        cheats: { c1: false, c2: false, c3: false, c4: false, c5: "off", c6: "off" },
        input: { keys: defaultKeyBindings(c), pad: defaultPadBindings(c), touch: c.touch.default, mouse: { enabled: false, sensitivity: c.mouse.sensDefault },
            scheme: "original", modern: defaultModernSettings(c) },
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
export function normalizeSettings(v: unknown, c: AppConstants): Settings {
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
    const scale = video.scale;
    return {
        version: SETTINGS_VERSION,
        speed: {
            mode: oneOf(speed.mode, ["original", "custom"], d.speed.mode),
            custom_steps: clampInt(speed.custom_steps, c.speed.customMin, c.speed.customMax, d.speed.custom_steps),
        },
        video: {
            scale: scale === "fit" ? "fit" : typeof scale === "number" && Number.isInteger(scale) && scale >= 1 ? scale : d.video.scale,
            filter: oneOf(video.filter, ["nearest", "smooth"], d.video.filter),
            keep_aspect: bool(video.keep_aspect, d.video.keep_aspect),
        },
        audio: {
            volume: clampInt(audio.volume, VOLUME_MIN, c.audio.volumeMax, d.audio.volume),
            mute: bool(audio.mute, d.audio.mute),
        },
        game: { skip_intro: bool(game.skip_intro, d.game.skip_intro), fix_990: bool(game.fix_990, d.game.fix_990) },
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
export function loadSettings(s: KeyValueStorage | undefined, c: AppConstants): Settings {
    if (!s)
        return defaultSettings(c);
    try {
        const raw = s.getItem(c.settingsKey);
        if (raw === null || raw === undefined)
            return defaultSettings(c);
        return normalizeSettings(JSON.parse(raw), c);
    }
    catch {
        return defaultSettings(c);
    }
}
export function saveSettings(s: KeyValueStorage | undefined, c: AppConstants, v: Settings): boolean {
    if (!s)
        return false;
    try {
        s.setItem(c.settingsKey, JSON.stringify({ ...normalizeSettings(v, c), version: SETTINGS_VERSION }));
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

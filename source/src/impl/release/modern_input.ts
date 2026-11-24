import type { AppConstants } from "./constants.js";
export const MODERN_ACTIONS = [
    "forward", "back", "strafeLeft", "strafeRight", "turnLeft", "turnRight", "jump", "crouch", "fire",
    "nextItem", "prevItem", "slot1", "slot2", "slot3", "slot4", "slot5", "pause",
] as const;
export type ModernAction = (typeof MODERN_ACTIONS)[number];
export type ModernBindings = Record<ModernAction, string[]>;
export const WHEEL_UP = "WheelUp";
export const WHEEL_DOWN = "WheelDown";
export const mouseCode = (button: number): string => `Mouse${button}`;
export const wheelCode = (deltaY: number): string | null => (deltaY < 0 ? WHEEL_UP : deltaY > 0 ? WHEEL_DOWN : null);
export function defaultModernBindings(c: AppConstants): ModernBindings {
    const out = {} as ModernBindings;
    for (const a of MODERN_ACTIONS)
        out[a] = [...c.modern.keys[a]];
    return out;
}
export function rebindModern(b: ModernBindings, action: ModernAction, code: string): {
    bindings: ModernBindings;
    unbound: ModernAction[];
} {
    const out = {} as ModernBindings;
    const unbound: ModernAction[] = [];
    for (const a of MODERN_ACTIONS) {
        if (a === action) {
            out[a] = [code];
            continue;
        }
        out[a] = b[a].filter((x) => x !== code);
        if (out[a].length !== b[a].length && out[a].length === 0)
            unbound.push(a);
    }
    return { bindings: out, unbound };
}
import type { ModernInput, ModernSelect } from "../modern/canonical.js";
export type { ModernInput, ModernSelect } from "../modern/canonical.js";
export { decodeModernInput, encodeModernInput } from "../modern/canonical.js";
export interface ModernCaps {
    original: number;
    fast: number;
    mouseTurnMax: number;
}
export function modernCapsFrom(doc: unknown): ModernCaps {
    const cs = (doc as {
        constants?: {
            id: string;
            value: unknown;
        }[];
    } | null)?.constants;
    if (!Array.isArray(cs))
        throw new Error("player_modern.json: no constants array");
    const get = (id: string): number => {
        const v = cs.find((x) => x.id === id)?.value;
        if (typeof v !== "number" || !Number.isInteger(v))
            throw new Error(`player_modern.json: ${id} is not an integer`);
        return v;
    };
    return { original: get("MODERN.TURN_CAP_ORIGINAL"), fast: get("MODERN.TURN_CAP_FAST"), mouseTurnMax: get("MODERN.MOUSE_TURN_MAX") };
}
export interface ModernMouseSettings {
    sensitivity: number;
    accel: number;
    decel: number;
    smoothing: number;
}
export interface ModernConfig {
    bindings: ModernBindings;
    mouse: ModernMouseSettings;
    turnCap: "original" | "fast";
    crouchToggle: boolean;
    turnBacklogSteps?: number | null;
}
export const TEST_ONLY = { capPending: false, wholePending: false };
const PERCENT = 100;
export class ModernInputState {
    private cfg: ModernConfig;
    private readonly caps: ModernCaps;
    private readonly held = new Set<string>();
    private readonly latched = new Set<string>();
    private readonly pulses = new Set<string>();
    private selectCmd: ModernSelect = "none";
    private crouchOn = false;
    private counts = 0;
    private history: number[] = [];
    private frac = 0;
    private prevTurn = 0;
    private backlogCut = 0;
    constructor(cfg: ModernConfig, caps: ModernCaps) {
        this.cfg = { bindings: cfg.bindings, mouse: { ...cfg.mouse }, turnCap: cfg.turnCap, crouchToggle: cfg.crouchToggle, turnBacklogSteps: cfg.turnBacklogSteps ?? null };
        this.caps = caps;
    }
    configure(cfg: ModernConfig): void {
        if (this.cfg.crouchToggle && !cfg.crouchToggle)
            this.crouchOn = false;
        this.cfg = { bindings: cfg.bindings, mouse: { ...cfg.mouse }, turnCap: cfg.turnCap, crouchToggle: cfg.crouchToggle, turnBacklogSteps: cfg.turnBacklogSteps ?? null };
    }
    private actionsOf(code: string): ModernAction[] {
        return MODERN_ACTIONS.filter((a) => this.cfg.bindings[a].includes(code));
    }
    private edge(code: string): void {
        for (const a of this.actionsOf(code)) {
            if (a === "crouch" && this.cfg.crouchToggle)
                this.crouchOn = !this.crouchOn;
            else if (a === "nextItem")
                this.selectCmd = "next";
            else if (a === "prevItem")
                this.selectCmd = "prev";
            else if (a.startsWith("slot"))
                this.selectCmd = Number(a.slice("slot".length)) as ModernSelect;
        }
    }
    press(code: string): void {
        if (this.held.has(code))
            return;
        this.held.add(code);
        this.latched.add(code);
        this.edge(code);
    }
    release(code: string): void { this.held.delete(code); }
    wheel(deltaY: number): void {
        const code = wheelCode(deltaY);
        if (code === null)
            return;
        this.pulses.add(code);
        this.edge(code);
    }
    motion(dx: number): void { if (Number.isFinite(dx))
        this.counts += dx; }
    releaseAll(): void {
        this.held.clear();
        this.latched.clear();
        this.pulses.clear();
        this.selectCmd = "none";
        this.counts = 0;
    }
    reset(): void {
        this.releaseAll();
        this.crouchOn = false;
        this.history = [];
        this.frac = 0;
        this.prevTurn = 0;
    }
    private on(a: ModernAction): boolean {
        for (const code of this.cfg.bindings[a])
            if (this.held.has(code) || this.latched.has(code) || this.pulses.has(code))
                return true;
        return false;
    }
    stepInput(v = 0): ModernInput {
        const sign = (p: boolean, n: boolean): -1 | 0 | 1 => (p === n ? 0 : p ? 1 : -1);
        const crouch = this.cfg.crouchToggle ? this.crouchOn : this.on("crouch");
        const out = {
            move: sign(this.on("forward"), this.on("back")),
            strafe: sign(this.on("strafeRight"), this.on("strafeLeft")),
            turn: sign(this.on("turnRight"), this.on("turnLeft")),
            mouse_turn: this.mouseTurn(v),
            jump: this.on("jump") ? 1 : 0,
            crouch: crouch ? 1 : 0,
            fire: this.on("fire") ? 1 : 0,
            start: this.on("pause") ? 1 : 0,
            select: this.selectCmd,
        } as ModernInput;
        this.latched.clear();
        this.pulses.clear();
        this.selectCmd = "none";
        return out;
    }
    private mouseTurn(v: number): number {
        const plan = this.planMouseTurn(v);
        this.history = plan.history;
        this.counts = 0;
        this.prevTurn = plan.t;
        this.frac = plan.total - plan.given;
        this.backlogCut += plan.cut;
        return plan.given === 0 ? 0 : plan.given;
    }
    pendingMouseTurn(v = 0): number {
        const p = this.planMouseTurn(v);
        const g = TEST_ONLY.capPending ? p.given : TEST_ONLY.wholePending ? Math.trunc(p.total) : p.total;
        return g === 0 ? 0 : g;
    }
    get backlogDiscarded(): number { return this.backlogCut; }
    get mouseTurnMax(): number { return this.caps.mouseTurnMax; }
    private planMouseTurn(v: number): {
        history: number[];
        t: number;
        total: number;
        given: number;
        cut: number;
    } {
        const m = this.cfg.mouse;
        const n = Math.max(1, Math.floor(m.smoothing));
        const history = [...this.history, this.counts];
        while (history.length > n)
            history.shift();
        let sum = 0;
        for (const c of history)
            sum += c;
        const c = sum / n;
        const accelerated = c * (1 + (m.accel / PERCENT) * (Math.abs(c) / PERCENT));
        let t = (accelerated * m.sensitivity) / PERCENT;
        if (m.decel > 0) {
            const floor = (m.decel / PERCENT) * this.prevTurn;
            if (this.prevTurn !== 0 && Math.abs(t) < Math.abs(floor) && t * this.prevTurn >= 0)
                t = floor;
        }
        let total = t + this.frac;
        const cap = this.cfg.turnCap === "original" ? this.caps.original : this.caps.fast;
        let cut = 0;
        const steps = this.cfg.turnBacklogSteps;
        if (steps !== null && steps !== undefined && Math.abs(total) > steps * cap) {
            cut = Math.abs(total) - steps * cap;
            total = Math.sign(total) * steps * cap;
        }
        const whole = Math.trunc(total);
        const lo = Math.max(-cap - v, -this.caps.mouseTurnMax);
        const hi = Math.min(cap - v, this.caps.mouseTurnMax);
        const given = Math.min(hi, Math.max(lo, whole));
        return { history, t, total, given, cut };
    }
}

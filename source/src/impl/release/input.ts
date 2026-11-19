import { PAD_BIT } from "../tick/constants.js";
import type { AppConstants } from "./constants.js";
export type Action = "up" | "down" | "left" | "right" | "a" | "b" | "c" | "start" | "a_up" | "a_down" | "a_left" | "a_right" | "menu" | "fullscreen" | "mute" | "state_save" | "state_load" | "pw_save";
export type KeyBindings = Record<Action, string | null>;
export type PadBindings = Record<Action, number | null>;
export const ACTIONS: readonly Action[] = [
    "up", "down", "left", "right", "a", "b", "c", "start", "a_up", "a_down", "a_left", "a_right", "menu", "fullscreen", "mute",
    "state_save", "state_load", "pw_save",
];
export const HOTKEYS: readonly Action[] = ["menu", "fullscreen", "mute", "state_save", "state_load", "pw_save"];
const STICK_X = 0;
const STICK_Y = 1;
export function defaultKeyBindings(c: AppConstants): KeyBindings {
    const t = c.keys;
    return {
        up: t.up, down: t.down, left: t.left, right: t.right,
        a: t.a, b: t.b, c: t.c, start: t.start,
        a_up: null, a_down: null, a_left: null, a_right: null,
        menu: t.menu, fullscreen: t.fullscreen, mute: t.mute,
        state_save: t.stateSave, state_load: t.stateLoad,
        pw_save: t.savePassword,
    };
}
export function defaultPadBindings(c: AppConstants): PadBindings {
    const p = c.pad;
    return {
        up: p.up, down: p.down, left: p.left, right: p.right,
        a: p.a, b: p.b, c: p.c, start: p.start,
        a_up: null, a_down: null, a_left: null, a_right: null,
        menu: p.menu, fullscreen: null, mute: null,
        state_save: null, state_load: null, pw_save: null,
    };
}
function rebind<T extends string | number>(b: Record<Action, T | null>, action: Action, v: T): {
    bindings: Record<Action, T | null>;
    unbound: Action | null;
} {
    const out = { ...b };
    let unbound: Action | null = null;
    for (const a of ACTIONS) {
        if (a !== action && out[a] === v) {
            out[a] = null;
            unbound = a;
        }
    }
    out[action] = v;
    return { bindings: out, unbound };
}
export function rebindKey(b: KeyBindings, action: Action, code: string): {
    bindings: KeyBindings;
    unbound: Action | null;
} {
    return rebind(b, action, code);
}
export function rebindPad(b: PadBindings, action: Action, button: number): {
    bindings: PadBindings;
    unbound: Action | null;
} {
    return rebind(b, action, button);
}
const BITS: Readonly<Record<Action, number>> = (() => {
    const bit = (n: number): number => 1 << n;
    const a = bit(PAD_BIT.A);
    return {
        up: bit(PAD_BIT.UP), down: bit(PAD_BIT.DOWN), left: bit(PAD_BIT.LEFT), right: bit(PAD_BIT.RIGHT),
        a, b: bit(PAD_BIT.B), c: bit(PAD_BIT.C), start: bit(PAD_BIT.START),
        a_up: a | bit(PAD_BIT.UP), a_down: a | bit(PAD_BIT.DOWN), a_left: a | bit(PAD_BIT.LEFT), a_right: a | bit(PAD_BIT.RIGHT),
        menu: 0, fullscreen: 0, mute: 0, state_save: 0, state_load: 0, pw_save: 0,
    };
})();
export class InputState {
    private keys: KeyBindings;
    private pad: PadBindings;
    private readonly heldCodes = new Set<string>();
    private padButtons: readonly boolean[] = [];
    private touch: ReadonlySet<Action> = new Set();
    private stick = { left: false, right: false, up: false, down: false };
    private prevHeld = new Set<Action>();
    private edges: Action[] = [];
    constructor(keys: KeyBindings, pad: PadBindings, private readonly deadZone: number) {
        this.keys = { ...keys };
        this.pad = { ...pad };
    }
    setBindings(keys: KeyBindings, pad: PadBindings): void {
        this.keys = { ...keys };
        this.pad = { ...pad };
        this.releaseAll();
    }
    actionOf(code: string): Action | null {
        for (const a of ACTIONS)
            if (this.keys[a] === code)
                return a;
        return null;
    }
    keyDown(code: string): Action | null {
        const a = this.actionOf(code);
        if (a === null)
            return null;
        this.heldCodes.add(code);
        this.refreshEdges();
        return a;
    }
    keyUp(code: string): void {
        this.heldCodes.delete(code);
        this.refreshEdges();
    }
    setPad(buttons: readonly boolean[], axes: readonly number[]): void {
        this.padButtons = buttons.slice();
        const x = axes[STICK_X] ?? 0;
        const y = axes[STICK_Y] ?? 0;
        const dz = this.deadZone;
        this.stick = { left: x < -dz, right: x > dz, up: y < -dz, down: y > dz };
        this.refreshEdges();
    }
    setTouch(actions: Iterable<Action>): void {
        this.touch = new Set(actions);
        this.refreshEdges();
    }
    private heldActions(): Set<Action> {
        const held = new Set<Action>(this.touch);
        for (const a of ACTIONS) {
            const k = this.keys[a];
            if (k !== null && this.heldCodes.has(k))
                held.add(a);
            const p = this.pad[a];
            if (p !== null && this.padButtons[p] === true)
                held.add(a);
        }
        if (this.stick.up)
            held.add("up");
        if (this.stick.down)
            held.add("down");
        if (this.stick.left)
            held.add("left");
        if (this.stick.right)
            held.add("right");
        return held;
    }
    private refreshEdges(): void {
        const now = this.heldActions();
        for (const a of now)
            if (!this.prevHeld.has(a))
                this.edges.push(a);
        this.prevHeld = now;
    }
    controllerByte(): number {
        let v = 0;
        for (const a of this.heldActions())
            v |= BITS[a];
        return v;
    }
    takePresses(): Action[] {
        const out = this.edges.filter((a) => HOTKEYS.includes(a));
        this.edges = this.edges.filter((a) => !HOTKEYS.includes(a));
        return out;
    }
    takeEdges(): Action[] {
        const out = this.edges;
        this.edges = [];
        return out;
    }
    releaseAll(): void {
        this.heldCodes.clear();
        this.padButtons = [];
        this.touch = new Set();
        this.stick = { left: false, right: false, up: false, down: false };
        this.prevHeld = new Set();
        this.edges = [];
    }
}

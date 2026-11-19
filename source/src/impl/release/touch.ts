import { PAD_BIT } from "../tick/constants.js";
import type { AppConstants } from "./constants.js";
import type { Action } from "./input.js";
export type ControlId = "dpad" | "a" | "b" | "c" | "start" | "menu";
export interface Control {
    id: ControlId;
    cx: number;
    cy: number;
    r: number;
}
export interface TouchPoint {
    x: number;
    y: number;
}
const ORDER: readonly ControlId[] = ["menu", "start", "a", "b", "c", "dpad"];
export function layout(w: number, h: number, c: AppConstants): Control[] {
    const t = c.touch;
    const s = Math.min(w, h);
    const m = t.margin * s;
    const dr = (t.dpadSize * s) / 2;
    const br = (t.buttonSize * s) / 2;
    const gap = m;
    const by = h - m - br;
    const step = 2 * br + gap;
    const cRight = w - m - br;
    const mr = br / 2;
    return [
        { id: "dpad", cx: m + dr, cy: h - m - dr, r: dr },
        { id: "a", cx: cRight - 2 * step, cy: by, r: br },
        { id: "b", cx: cRight - step, cy: by, r: br },
        { id: "c", cx: cRight, cy: by, r: br },
        { id: "start", cx: m + mr, cy: m + mr, r: mr },
        { id: "menu", cx: w - m - mr, cy: m + mr, r: mr },
    ];
}
const SECTORS: readonly (readonly Action[])[] = [
    ["right"], ["right", "down"], ["down"], ["left", "down"], ["left"], ["left", "up"], ["up"], ["right", "up"],
];
export function dpadDirections(dx: number, dy: number, r: number, deadzone: number): readonly Action[] {
    const d = Math.hypot(dx, dy);
    if (d > r || d <= deadzone * r)
        return [];
    const sector = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    return SECTORS[sector]!;
}
export interface TouchHit {
    actions: Set<Action>;
    pressed: Set<ControlId>;
    bits: number;
}
const BIT: Readonly<Partial<Record<Action, number>>> = {
    up: 1 << PAD_BIT.UP, down: 1 << PAD_BIT.DOWN, left: 1 << PAD_BIT.LEFT, right: 1 << PAD_BIT.RIGHT,
    a: 1 << PAD_BIT.A, b: 1 << PAD_BIT.B, c: 1 << PAD_BIT.C, start: 1 << PAD_BIT.START,
};
export function controlAt(p: TouchPoint, controls: readonly Control[]): Control | null {
    for (const id of ORDER) {
        const k = controls.find((x) => x.id === id);
        if (k && Math.hypot(p.x - k.cx, p.y - k.cy) <= k.r)
            return k;
    }
    return null;
}
export function hit(points: readonly TouchPoint[], controls: readonly Control[], c: AppConstants): TouchHit {
    const out: TouchHit = { actions: new Set(), pressed: new Set(), bits: 0 };
    for (const p of points) {
        const k = controlAt(p, controls);
        if (!k)
            continue;
        if (k.id === "dpad") {
            const dirs = dpadDirections(p.x - k.cx, p.y - k.cy, k.r, c.touch.dpadDeadzone);
            if (dirs.length === 0)
                continue;
            for (const a of dirs)
                out.actions.add(a);
        }
        else {
            out.actions.add(k.id);
        }
        out.pressed.add(k.id);
    }
    for (const a of out.actions)
        out.bits |= BIT[a] ?? 0;
    return out;
}
export function opacityOf(pressed: boolean, c: AppConstants): number {
    return Math.min(1, pressed ? 2 * c.touch.opacity : c.touch.opacity);
}
export class TouchVisibility {
    private shown = false;
    constructor(private mode: "auto" | "on" | "off") { }
    setMode(m: "auto" | "on" | "off"): void { this.mode = m; }
    touched(): void { this.shown = true; }
    keyOrPad(): void { this.shown = false; }
    get visible(): boolean { return this.mode === "on" || (this.mode === "auto" && this.shown); }
}

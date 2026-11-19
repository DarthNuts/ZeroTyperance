/// <reference lib="dom" />
import type { AppConstants } from "./constants.js";
import type { Action } from "./input.js";
import { hit, layout, opacityOf } from "./touch.js";
import type { Control, ControlId, TouchPoint } from "./touch.js";
const LABEL: Readonly<Record<ControlId, string>> = { dpad: "", a: "A", b: "B", c: "C", start: "Start", menu: "Menu" };
export class TouchOverlay {
    readonly element: HTMLDivElement;
    private readonly points = new Map<number, TouchPoint>();
    private controls: Control[] = [];
    private pressed = new Set<ControlId>();
    private shown = false;
    private readonly nodes = new Map<ControlId, HTMLDivElement>();
    constructor(parent: HTMLElement, private readonly c: AppConstants, private readonly onHeld: (actions: Set<Action>) => void) {
        const el = document.createElement("div");
        el.className = "zt-touch";
        el.style.cssText = "position:absolute;inset:0;touch-action:none;user-select:none;-webkit-user-select:none;z-index:2";
        el.hidden = true;
        parent.appendChild(el);
        this.element = el;
        const move = (e: PointerEvent): void => {
            if (!this.points.has(e.pointerId) && e.type !== "pointerdown")
                return;
            this.points.set(e.pointerId, this.local(e));
            this.update();
        };
        el.addEventListener("pointerdown", (e) => { e.preventDefault(); move(e); });
        el.addEventListener("pointermove", move);
        const up = (e: PointerEvent): void => { this.points.delete(e.pointerId); this.update(); };
        el.addEventListener("pointerup", up);
        el.addEventListener("pointercancel", up);
        el.addEventListener("lostpointercapture", up);
        window.addEventListener("resize", () => this.draw());
    }
    private local(e: PointerEvent): TouchPoint {
        const r = this.element.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    private update(): void {
        const w = this.element.clientWidth, h = this.element.clientHeight;
        this.controls = layout(w, h, this.c);
        const r = hit([...this.points.values()], this.controls, this.c);
        this.pressed = r.pressed;
        this.draw();
        this.onHeld(r.actions);
    }
    setVisible(v: boolean): void {
        if (v === this.shown)
            return;
        this.shown = v;
        this.element.hidden = !v;
        if (!v) {
            this.points.clear();
            this.pressed = new Set();
            this.onHeld(new Set());
        }
        else
            this.draw();
    }
    draw(): void {
        if (!this.shown)
            return;
        const w = this.element.clientWidth, h = this.element.clientHeight;
        this.controls = layout(w, h, this.c);
        for (const k of this.controls) {
            let n = this.nodes.get(k.id);
            if (!n) {
                n = document.createElement("div");
                n.textContent = LABEL[k.id];
                n.style.cssText = "position:absolute;border-radius:50%;background:#fff;color:#000;display:flex;align-items:center;justify-content:center;font:bold 14px sans-serif;pointer-events:none;box-sizing:border-box";
                this.element.appendChild(n);
                this.nodes.set(k.id, n);
            }
            n.style.left = `${k.cx - k.r}px`;
            n.style.top = `${k.cy - k.r}px`;
            n.style.width = n.style.height = `${2 * k.r}px`;
            n.style.opacity = String(opacityOf(this.pressed.has(k.id), this.c));
        }
    }
}

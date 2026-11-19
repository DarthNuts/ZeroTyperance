import { PAD_BIT } from "../tick/constants.js";
import type { AppConstants } from "./constants.js";
const BLANKS_PER_SECOND = 60;
const MS_PER_SECOND = 1000;
export const MOUSE_BUTTON = Object.freeze({ LEFT: 0, MIDDLE: 1, RIGHT: 2 });
export class BlankClock {
    private origin: number | null = null;
    private done = 0;
    advance(nowMs: number): number {
        if (this.origin === null) {
            this.origin = nowMs;
            return 0;
        }
        const total = Math.max(0, Math.floor(((nowMs - this.origin) * BLANKS_PER_SECOND) / MS_PER_SECOND));
        const n = Math.max(0, total - this.done);
        this.done += n;
        return n;
    }
    reset(): void { this.origin = null; this.done = 0; }
}
export class OriginalMouse {
    enabled = false;
    private sens: number;
    private acc = 0;
    private held = 0;
    private btnB = false;
    private btnC = false;
    private readonly clock = new BlankClock();
    constructor(private readonly c: AppConstants["mouse"], sensitivity: number = c.sensDefault) {
        this.sens = this.clampSens(sensitivity);
    }
    private clampSens(v: number): number {
        const r = Number.isFinite(v) ? Math.round(v) : this.c.sensDefault;
        return Math.min(this.c.sensMax, Math.max(this.c.sensMin, r));
    }
    get sensitivity(): number { return this.sens; }
    set sensitivity(v: number) { this.sens = this.clampSens(v); }
    get accumulator(): number { return this.acc; }
    move(movementX: number): void {
        if (!this.enabled || !Number.isFinite(movementX))
            return;
        const cap = this.c.drain * this.c.capBlanks;
        this.acc = Math.min(cap, Math.max(-cap, this.acc + movementX * this.sens));
    }
    blank(): number {
        if (!this.enabled) {
            this.held = 0;
            return 0;
        }
        const dir = this.acc > 0 ? 1 : this.acc < 0 ? -1 : 0;
        if (this.acc > 0)
            this.acc = Math.max(0, this.acc - this.c.drain);
        else if (this.acc < 0)
            this.acc = Math.min(0, this.acc + this.c.drain);
        this.held = dir;
        return dir;
    }
    advance(nowMs: number): number {
        const n = this.clock.advance(nowMs);
        for (let i = 0; i < n; i++)
            this.blank();
        return n;
    }
    button(button: number, down: boolean): void {
        if (!this.enabled && down)
            return;
        if (button === MOUSE_BUTTON.LEFT)
            this.btnB = down;
        else if (button === MOUSE_BUTTON.RIGHT)
            this.btnC = down;
    }
    bits(): number {
        if (!this.enabled)
            return 0;
        let b = 0;
        if (this.held > 0)
            b |= 1 << PAD_BIT.RIGHT;
        if (this.held < 0)
            b |= 1 << PAD_BIT.LEFT;
        if (this.btnB)
            b |= 1 << PAD_BIT.B;
        if (this.btnC)
            b |= 1 << PAD_BIT.C;
        return b;
    }
    reset(): void {
        this.acc = 0;
        this.held = 0;
        this.btnB = false;
        this.btnC = false;
        this.clock.reset();
    }
}

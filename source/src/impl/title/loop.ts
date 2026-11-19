import type { EventSink } from "../../domain.js";
import type { ScreenSprite, ScreenState } from "../screen_types.js";
import { LINE_ENTRIES, VideoModel } from "../boot/model.js";
import { PICTURE_SPRITES, POINTER_SPRITE } from "./assets.js";
import type { TitleAssets } from "./assets.js";
import { advanceCounter, line1Buffer, newCounter, rampIndex, scrollTable } from "./camera.js";
import type { Counter } from "./camera.js";
import type { TitleConstants } from "./constants.js";
export type ExitTo = "start" | "options" | "demo";
export const PAD_ORDER = ["up", "down", "left", "right", "a", "b", "c", "start", "x", "y", "z", "mode"] as const;
export function padBit(button: string): number {
    const i = (PAD_ORDER as readonly string[]).indexOf(button);
    if (i < 0)
        throw new Error(`unknown button ${JSON.stringify(button)}`);
    return 1 << i;
}
interface Lists {
    a: number[];
    b: number[];
    sprites: ScreenSprite[];
}
export interface TitleCoreOptions {
    startsRun?: boolean;
}
export class TitleCore {
    readonly model: VideoModel;
    readonly startsRun: boolean;
    private tickNo = 0;
    private cursorValue = 0;
    private exitTo: ExitTo | null = null;
    private n = 0;
    private m = 0;
    private cx: Counter = newCounter();
    private cy: Counter = newCounter();
    private buffer: number[] = new Array<number>(LINE_ENTRIES).fill(0);
    private prevPad = 0;
    private pending: Lists | null = null;
    private readonly confirmMask: number;
    private readonly upBit = padBit("up");
    private readonly downBit = padBit("down");
    constructor(readonly assets: TitleAssets, readonly C: TitleConstants, opts: TitleCoreOptions = {}) {
        this.startsRun = opts.startsRun ?? true;
        this.model = new VideoModel(C.PLANE_W, C.PLANE_H);
        this.confirmMask = C.CONFIRM_BUTTONS.reduce((mask, name) => mask | padBit(name), 0);
    }
    reset(heldPad = 0): void {
        this.model.powerOn();
        this.tickNo = 0;
        this.cursorValue = 0;
        this.exitTo = null;
        this.n = 0;
        this.m = 0;
        this.cx = newCounter();
        this.cy = newCounter();
        this.buffer = new Array<number>(LINE_ENTRIES).fill(0);
        this.prevPad = heldPad;
        this.pending = null;
    }
    get tickIndex(): number {
        return this.tickNo;
    }
    get cursor(): number {
        return this.cursorValue;
    }
    get exit(): ExitTo | null {
        return this.exitTo;
    }
    get finished(): boolean {
        return this.exit !== null;
    }
    tick(pad: number, events: EventSink): ScreenState {
        if (this.exitTo !== null)
            return this.model.state();
        const t = this.tickNo;
        const C = this.C;
        if (t <= C.ON_TICK)
            this.prevPad &= pad;
        if (t === 0) {
            this.tick0(events);
        }
        else if (t === C.OFF_TICK) {
            this.setUp();
        }
        else if (t === C.ON_TICK) {
            this.model.displayEnabled = true;
        }
        else {
            this.step(pad, events);
        }
        this.tickNo = t + 1;
        return this.model.state();
    }
    private tick0(events: EventSink): void {
        const C = this.C;
        if (!this.startsRun)
            return;
        events.emit({ type: "Audio.PlayMusic", opcode: C.MUSIC_1_OPCODE as 5 | 16, value: C.MUSIC_1_VALUE });
        events.emit({ type: "Audio.PlayMusic", opcode: C.MUSIC_2_OPCODE as 5 | 16, value: C.MUSIC_2_VALUE });
    }
    private setUp(): void {
        const { model, assets, C } = this;
        model.displayEnabled = false;
        model.clearPatterns();
        for (const b of [assets.tiles1, assets.tiles2, assets.sprites1, assets.sprites2])
            model.load(b.firstSlot, b.block);
        model.clearPalette();
        model.setLine(0, assets.line0);
        model.resizePlanes(C.PLANE_W, C.PLANE_H);
        const a = assets.planeA;
        for (let r = 0; r < a.rows; r++)
            for (let c = 0; c < a.cols; c++)
                model.writeCellA(c, C.PICTURE_ROW + r, a.entries[r * a.cols + c]!);
        const b = assets.planeB;
        for (let r = 0; r < b.rows; r++)
            for (let c = 0; c < b.cols; c++)
                model.writeCellB(c, C.PICTURE_ROW + r, b.entries[r * b.cols + c]!);
        model.setVScrollA(0);
        model.setVScrollB(0);
        model.planeA.clearLineScroll();
        model.planeB.clearLineScroll();
        model.setSprites([]);
    }
    private step(pad: number, events: EventSink): void {
        const { model, assets, C } = this;
        this.n += 1;
        if (this.pending) {
            model.setLineScroll(this.pending.a, this.pending.b);
            model.setSprites(this.pending.sprites);
        }
        model.setLine(1, this.buffer);
        model.setLine(2, assets.ramp[rampIndex(this.cx.value, C)]!);
        model.setLine(3, assets.ramp[rampIndex(this.cy.value, C)]!);
        const p = pad;
        const q = this.prevPad;
        this.prevPad = p;
        this.m += 1;
        advanceCounter(this.cx, C.CAM_X_SEQUENCE);
        advanceCounter(this.cy, C.CAM_Y_SEQUENCE);
        this.buffer = line1Buffer(this.cx.value, this.cy.value, C);
        if (this.m % C.STRIP_PERIOD === 0)
            this.stripColumn(this.m / C.STRIP_PERIOD - 1);
        const table = scrollTable(this.m, this.cx.value, this.cy.value, C);
        const sprites: ScreenSprite[] = [];
        for (let i = 0; i < PICTURE_SPRITES; i++)
            sprites.push({ ...assets.sprites[i]! });
        if (this.cursorValue !== 0) {
            sprites.push({
                x: C.POINTER_X,
                y: C.POINTER_Y + C.POINTER_STEP * (this.cursorValue - C.CURSOR_START),
                w: C.POINTER_CELLS[0]!,
                h: C.POINTER_CELLS[1]!,
                attr: assets.sprites[POINTER_SPRITE]!.attr,
            });
            for (let i = POINTER_SPRITE + 1; i < assets.sprites.length; i++)
                sprites.push({ ...assets.sprites[i]! });
        }
        this.pending = { a: table.a, b: table.b, sprites };
        if (this.n === C.IDLE_STEPS) {
            this.cursorValue = C.CURSOR_START;
            this.finish("demo", events);
            return;
        }
        if (this.m === C.PASS_STEPS) {
            if (this.cursorValue === 0)
                this.cursorValue = C.CURSOR_START;
            this.m = 0;
            this.cx = newCounter();
            this.cy = newCounter();
            for (let r = 0; r < C.STRIP_ROWS; r++)
                for (let c = 0; c < C.PLANE_W; c++)
                    model.writeCellA(c, r, 0);
        }
        const fresh = p & ~q;
        if (fresh & this.confirmMask) {
            if (this.cursorValue === 0)
                this.cursorValue = C.CURSOR_START;
            else
                this.finish(this.cursorValue === C.CURSOR_START ? "start" : "options", events);
        }
        else {
            if (fresh & this.upBit && this.cursorValue !== 0)
                this.cursorValue = C.CURSOR_START;
            if (fresh & this.downBit && this.cursorValue !== 0)
                this.cursorValue = C.CURSOR_OPTIONS;
        }
    }
    private stripColumn(j: number): void {
        const { model, assets, C } = this;
        const column = (j + C.STRIP_COLUMN_SHIFT) % C.PLANE_W;
        for (let r = 0; r < C.STRIP_ROWS; r++) {
            const entry = j < C.STRIP_COLUMNS ? assets.strip.entries[r * assets.strip.cols + j]! : 0;
            model.writeCellA(column, r, entry);
        }
    }
    private finish(to: ExitTo, events: EventSink): void {
        this.exitTo = to;
        events.emit({ type: "Flow.Exit", to });
    }
}

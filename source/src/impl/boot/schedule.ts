import type { EventSink } from "../../domain.js";
import type { ScreenState } from "../screen_types.js";
import type { BootAssets, NameTableScreen, PaletteLines } from "./assets.js";
import type { BootConstants } from "./constants.js";
import { VideoModel, LINE_ENTRIES, PALETTE_LINES, channelsOf, wordOf } from "./model.js";
const PLANE_WIDTH = 64;
const PLANE_ROWS_SHORT = 32;
const PLANE_ROWS_TALL = 64;
const BANNER_STEP_PERIOD = 2;
const CHANNELS = 3;
const SCENE_LONG = 14;
type Levels = readonly (readonly {
    r: number;
    g: number;
    b: number;
}[])[];
function targetLevels(palette: PaletteLines): Levels {
    const lines: {
        r: number;
        g: number;
        b: number;
    }[][] = [];
    for (let l = 0; l < PALETTE_LINES; l++) {
        const raw = palette[l];
        const line: {
            r: number;
            g: number;
            b: number;
        }[] = [];
        for (let e = 0; e < LINE_ENTRIES; e++)
            line.push(raw ? channelsOf(raw[e] ?? 0) : { r: 0, g: 0, b: 0 });
        lines.push(line);
    }
    return lines;
}
export interface BootCoreOptions {
    startsRun?: boolean;
}
export class BootCore {
    readonly model: VideoModel;
    readonly sceneTicks: number[] = [];
    readonly fadeOutTick: number;
    readonly startsRun: boolean;
    private t = 0;
    private readonly slideTarget: Levels;
    constructor(readonly assets: BootAssets, readonly C: BootConstants, opts: BootCoreOptions = {}) {
        this.startsRun = opts.startsRun ?? true;
        this.model = new VideoModel(PLANE_WIDTH, PLANE_ROWS_SHORT);
        const T = this.sceneTicks;
        T[0] = C.SLIDESHOW_START_TICK;
        T[1] = T[0]! + C.CHANNEL_MAX * C.PAL_STEP_TICKS + C.SCENE0_WAIT;
        for (let k = 2; k < C.SLIDESHOW_SCENES; k++)
            T[k] = T[k - 1]! + (k - 1 === SCENE_LONG ? C.SCENE14_WAIT : C.SCENE_WAIT);
        this.fadeOutTick = T[C.SLIDESHOW_SCENES - 1]! + C.SCENE21_WAIT + C.FINAL_HOLD;
        this.slideTarget = targetLevels(assets.scenes[0]!.palette);
    }
    reset(): void {
        this.t = 0;
        this.model.powerOn();
    }
    get tickIndex(): number {
        return this.t;
    }
    get finished(): boolean {
        return this.t >= this.C.TICKS;
    }
    tick(events: EventSink): ScreenState {
        if (this.finished)
            return this.model.state();
        const t = this.t;
        const C = this.C;
        const m = this.model;
        if (t === 0 && this.startsRun) {
            events.emit({ type: "Audio.PlayMusic", opcode: C.MUSIC_1_OPCODE as 5 | 16, value: C.MUSIC_1_VALUE });
            events.emit({ type: "Audio.PlayMusic", opcode: C.MUSIC_2_OPCODE as 5 | 16, value: C.MUSIC_2_VALUE });
        }
        if (t < C.BLANK_TICK)
            this.banner(t);
        else if (t === C.BLANK_TICK)
            this.blank();
        if (t === C.LOGO_LOAD_TICK)
            this.logoLoad();
        this.logoFrame(t);
        if (t === C.SLIDESHOW_START_TICK)
            this.slideshowSetup();
        for (let k = 0; k < this.sceneTicks.length; k++)
            if (t === this.sceneTicks[k])
                this.loadScene(k);
        this.slideshowFade(t);
        this.t = t + 1;
        return m.state();
    }
    private banner(t: number): void {
        const C = this.C;
        const m = this.model;
        const b = this.assets.banner;
        if (t === C.BANNER_SETUP_TICK) {
            m.load(b.firstSlot, b.tiles);
            this.writeNameTable(b);
        }
        if (t < C.BANNER_SETUP_TICK)
            return;
        const white = channelsOf(C.BANNER_TARGET_WHITE);
        const inEnd = C.BANNER_FADE_IN_ITERATIONS + 1;
        let r: number, g: number, bl: number;
        if (t <= inEnd) {
            const n = Math.min(C.BANNER_FADE_STEPS, Math.floor((t - 1) / BANNER_STEP_PERIOD));
            g = Math.min(white.g, Math.ceil(n / CHANNELS));
            bl = Math.min(white.b, Math.floor((n + 1) / CHANNELS));
            r = Math.min(white.r, Math.floor(n / CHANNELS));
        }
        else {
            const n = Math.min(C.BANNER_FADE_STEPS, Math.floor((t - inEnd) / BANNER_STEP_PERIOD));
            g = Math.max(0, white.g - Math.ceil(n / CHANNELS));
            bl = Math.max(0, white.b - Math.floor((n + 1) / CHANNELS));
            r = Math.max(0, white.r - Math.floor(n / CHANNELS));
        }
        const word = wordOf(r, g, bl);
        m.setColour(0, 0);
        for (let e = 1; e < LINE_ENTRIES; e++)
            m.setColour(e, word);
    }
    private writeNameTable(s: NameTableScreen): void {
        this.model.clearPlaneA();
        for (let r = 0; r < s.rows; r++)
            for (let c = 0; c < s.cols; c++)
                this.model.writeCellA(c, r, s.entries[r * s.cols + c]!);
    }
    private blank(): void {
        const m = this.model;
        m.clearPalette();
        m.clearPatterns();
        m.resizePlanes(PLANE_WIDTH, PLANE_ROWS_TALL);
        m.setVScrollA(this.C.VSCROLL_LOGO);
        m.setVScrollB(this.C.VSCROLL_LOGO);
    }
    private logoLoad(): void {
        const m = this.model;
        const logo = this.assets.logo;
        m.clearPalette();
        const line0 = logo.palette[0];
        if (line0)
            for (let e = 0; e < LINE_ENTRIES; e++)
                m.setColour(e, line0[e] ?? 0);
        m.load(logo.firstSlot, logo.tiles);
        m.resizePlanes(PLANE_WIDTH, PLANE_ROWS_SHORT);
    }
    private logoFrame(t: number): void {
        const C = this.C;
        const d = t - C.LOGO_FIRST_TICK;
        if (d < 0 || d % C.LOGO_PERIOD !== 0)
            return;
        const k = d / C.LOGO_PERIOD;
        if (k >= C.LOGO_FRAMES)
            return;
        const logo = this.assets.logo;
        const frame = logo.frames[k]!;
        for (let r = 0; r < C.LOGO_HEIGHT; r++) {
            for (let c = 0; c < C.LOGO_WIDTH; c++)
                this.model.writeCellA(C.LOGO_COL + c, C.LOGO_ROW + r, frame[r * logo.cols + c]!);
        }
    }
    private slideshowSetup(): void {
        const m = this.model;
        m.clearPalette();
        m.clearPatterns();
        m.resizePlanes(PLANE_WIDTH, PLANE_ROWS_TALL);
        m.setVScrollA(this.C.VSCROLL_SLIDESHOW_A);
    }
    private loadScene(k: number): void {
        const s = this.assets.scenes[k]!;
        const slot = k % 2 === 0 ? this.C.SLOT_EVEN : this.C.SLOT_ODD;
        this.model.load(slot, s.tiles);
        this.writeNameTable(s);
    }
    private writeAllLines(f: (level: number) => number): void {
        for (let l = 0; l < PALETTE_LINES; l++) {
            for (let e = 0; e < LINE_ENTRIES; e++) {
                const t = this.slideTarget[l]![e]!;
                this.model.setColour(l * LINE_ENTRIES + e, wordOf(f(t.r), f(t.g), f(t.b)));
            }
        }
    }
    private slideshowFade(t: number): void {
        const C = this.C;
        const S = C.SLIDESHOW_START_TICK;
        const F = this.fadeOutTick;
        if (t > S && t < F) {
            const d = t - S;
            if (d % C.PAL_STEP_TICKS === 0) {
                const j = d / C.PAL_STEP_TICKS;
                if (j <= C.PAL_STEPS_SHOWN)
                    this.writeAllLines((v) => Math.min(v, j));
            }
        }
        if (t === F) {
            for (let e = 0; e < LINE_ENTRIES; e++) {
                const c = this.slideTarget[0]![e]!;
                this.model.setColour(e, wordOf(c.r, c.g, c.b));
            }
        }
        else if (t > F) {
            const d = t - F;
            if (d % C.PAL_STEP_TICKS === 0) {
                const j = d / C.PAL_STEP_TICKS;
                if (j <= C.PAL_STEPS_SHOWN)
                    this.writeAllLines((v) => Math.max(0, v - j));
            }
        }
    }
}

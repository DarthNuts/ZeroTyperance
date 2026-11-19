import type { EventSink } from "../../domain.js";
import type { ScreenState } from "../screen_types.js";
import type { TileBlock } from "../boot/assets.js";
import { LINE_ENTRIES, PATTERN_BYTES, VideoModel } from "../boot/model.js";
import type { SegaAssets } from "./assets.js";
import type { SegaConstants } from "./constants.js";
import { drawFace, project } from "./render.js";
export const PLANE_WIDTH = 64;
export const PLANE_ROWS = 32;
const PICTURE_FIRST_SLOT = 1;
const S16_BITS = 16;
const RULE_LIMIT = 100000;
export interface SegaRenderer {
    project: typeof project;
    drawFace: typeof drawFace;
}
export interface SegaCoreOptions {
    startsRun?: boolean;
    renderer?: SegaRenderer;
}
function s16(v: number): number {
    return (v << S16_BITS) >> S16_BITS;
}
function nextCycle(f: number, C: SegaConstants): number {
    return (f + 1) % C.CYCLE_PERIOD;
}
function nextCamera(angle: number, distance: number, C: SegaConstants): {
    angle: number;
    distance: number;
} {
    let a = s16(angle + C.ANGLE_STEP);
    const e = s16(distance - C.DISTANCE_TARGET) >> C.DISTANCE_EASE_SHIFT;
    const step = Math.max(e, C.DISTANCE_MIN_STEP);
    const d = s16(Math.max(distance - step, C.DISTANCE_TARGET));
    a = ((a + C.ANGLE_BIAS) & C.ANGLE_MASK) - C.ANGLE_BIAS;
    return { angle: a, distance: d };
}
function sweepIterationsFromRule(C: SegaConstants): number {
    let angle = C.ANGLE_START;
    let distance = C.DISTANCE_START;
    for (let k = 1; k <= RULE_LIMIT; k++) {
        ({ angle, distance } = nextCamera(angle, distance, C));
        if (angle === C.ANGLE_EXIT && distance === C.DISTANCE_TARGET)
            return k;
    }
    throw new Error("sega core: the sweep exit rule (4.1) never holds");
}
function flatIterationsFromRule(sweep: number, C: SegaConstants): number {
    let f = C.CYCLE_START;
    for (let k = 1; k <= sweep; k++)
        f = nextCycle(f, C);
    for (let j = 1; j <= RULE_LIMIT; j++) {
        f = nextCycle(f, C);
        if (j >= C.FLARE_MIN_ITERATIONS && f === C.CYCLE_START)
            return j;
    }
    throw new Error("sega core: the flat-phase end rule (4.1) never holds");
}
export class SegaCore {
    readonly model: VideoModel;
    readonly startsRun: boolean;
    readonly sweepIterations: number;
    readonly iterations: number;
    private readonly renderer: SegaRenderer;
    private readonly starts: number[] = [];
    private readonly iterationAtStart = new Map<number, number>();
    private t = 0;
    private k = 0;
    private angle = 0;
    private distance = 0;
    private f = 0;
    private readonly windowF = new Map<number, number>();
    private readonly pending = new Map<number, Uint8Array>();
    private readonly depth: Int16Array;
    constructor(readonly assets: SegaAssets, readonly C: SegaConstants, opts: SegaCoreOptions = {}) {
        this.startsRun = opts.startsRun ?? true;
        this.renderer = opts.renderer ?? { project, drawFace };
        this.model = new VideoModel(PLANE_WIDTH, PLANE_ROWS);
        const s0 = this.model.state();
        const [dw, dh, db] = C.DISPLAY;
        if (!s0.display.enabled || s0.display.width !== dw || s0.display.height !== dh || s0.display.backdrop !== db) {
            throw new Error(`sega core: the model's display ${JSON.stringify(s0.display)} is not SEGA.DISPLAY ${JSON.stringify(C.DISPLAY)}`);
        }
        const [sx, sy, sw, sh, sa] = C.SPRITE;
        const sp = s0.sprites;
        if (sp.length !== 1 || sp[0]!.x !== sx || sp[0]!.y !== sy || sp[0]!.w !== sw || sp[0]!.h !== sh || sp[0]!.attr !== sa) {
            throw new Error(`sega core: the model's sprites ${JSON.stringify(sp)} are not SEGA.SPRITE ${JSON.stringify(C.SPRITE)}`);
        }
        this.sweepIterations = sweepIterationsFromRule(C);
        this.iterations = this.sweepIterations + flatIterationsFromRule(this.sweepIterations, C);
        if (this.sweepIterations !== C.SWEEP_ITERATIONS) {
            throw new Error(`sega core: the sweep rule (4.1) gives ${this.sweepIterations} iterations, SEGA.SWEEP_ITERATIONS is ${C.SWEEP_ITERATIONS}`);
        }
        if (this.iterations !== C.ITERATIONS) {
            throw new Error(`sega core: the two rules (4.1) give ${this.iterations} iterations, SEGA.ITERATIONS is ${C.ITERATIONS}`);
        }
        this.starts.push(C.BAND_TICK);
        for (let k = 1; k <= this.iterations; k++) {
            this.starts.push(this.starts[k - 1]! + (k <= C.FAST_ITERATIONS ? C.FAST_ITERATION_TICKS : C.SLOW_ITERATION_TICKS));
        }
        for (let k = 1; k <= this.iterations; k++)
            this.iterationAtStart.set(this.starts[k - 1]!, k);
        const last = this.starts[this.iterations]! + C.TAIL_TICKS;
        if (last !== C.TICKS - 1) {
            throw new Error(`sega core: the last iteration ends at tick ${this.starts[this.iterations]}, the tail makes the last logo tick ${last}, SEGA.TICKS - 1 is ${C.TICKS - 1}`);
        }
        this.depth = new Int16Array(C.STRIPS);
        this.reset();
    }
    startTick(k: number): number {
        const s = this.starts[k - 1];
        if (!Number.isInteger(k) || s === undefined)
            throw new Error(`sega core: no iteration ${k} (1 .. ${this.iterations + 1})`);
        return s;
    }
    get cameraAngle(): number {
        return this.angle;
    }
    get cameraDistance(): number {
        return this.distance;
    }
    get cycleCounter(): number {
        return this.f;
    }
    get iteration(): number {
        return this.k;
    }
    reset(): void {
        this.t = 0;
        this.k = 0;
        this.angle = this.C.ANGLE_START;
        this.distance = this.C.DISTANCE_START;
        this.f = this.C.CYCLE_START;
        this.windowF.clear();
        this.pending.clear();
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
        if (t === 0 && this.startsRun) {
            events.emit({ type: "Audio.PlayMusic", opcode: C.MUSIC_1[0]! as 5 | 16, value: C.MUSIC_1[1]! });
            events.emit({ type: "Audio.PlayMusic", opcode: C.MUSIC_2[0]! as 5 | 16, value: C.MUSIC_2[1]! });
        }
        if (t === C.PALETTE_TICK)
            this.paletteAndPlaneA();
        if (t === C.BAND_TICK)
            this.band();
        const starting = this.iterationAtStart.get(t);
        if (starting !== undefined)
            this.runIteration(starting);
        const windowOf = this.iterationAtStart.get(t - C.CYCLE_LAG);
        if (windowOf !== undefined)
            this.cycleWindow(windowOf);
        const nextStarted = this.iterationAtStart.get(t - C.PICTURE_LAG);
        if (nextStarted !== undefined && nextStarted > 1)
            this.uploadPicture(nextStarted - 1);
        this.t = t + 1;
        return this.model.state();
    }
    tilePatterns(indices: readonly number[]): Uint8Array[] {
        return indices.map((i) => this.model.pattern(i).slice());
    }
    private paletteAndPlaneA(): void {
        const C = this.C;
        const m = this.model;
        for (let e = 0; e < LINE_ENTRIES; e++)
            m.setColour(e, (this.assets.line0[e] ?? 0) & C.COLOUR_MASK);
        for (let row = 0; row < m.planeA.height; row++)
            for (let col = 0; col < m.planeA.width; col++)
                m.writeCellA(col, row, C.PLANE_A_FILL);
    }
    private band(): void {
        const C = this.C;
        for (let x = 0; x < C.BAND_COLUMNS; x++) {
            for (let y = 0; y < C.BAND_ROWS; y++)
                this.model.writeCellB(C.BAND_COL + x, C.BAND_ROW + y, C.BAND_FIRST_ENTRY + C.BAND_ROWS * x + y);
        }
    }
    private cycleWindow(k: number): void {
        const f = this.windowF.get(k);
        if (f === undefined)
            throw new Error(`sega core: no cycle counter kept for iteration ${k}`);
        this.windowF.delete(k);
        const C = this.C;
        for (let i = 0; i < C.CYCLE_WINDOW; i++)
            this.model.setColour(C.CYCLE_FIRST_ENTRY + i, (this.assets.cycle[f + i] ?? 0) & C.COLOUR_MASK);
    }
    private uploadPicture(k: number): void {
        const picture = this.pending.get(k);
        if (!picture)
            throw new Error(`sega core: no picture kept for iteration ${k}`);
        this.pending.delete(k);
        const block: TileBlock = { name: `sega_picture_${k}`, count: picture.length / PATTERN_BYTES, patterns: picture };
        this.model.load(PICTURE_FIRST_SLOT, block);
    }
    private runIteration(k: number): void {
        const C = this.C;
        const R = this.renderer;
        this.k = k;
        this.f = nextCycle(this.f, C);
        this.windowF.set(k, this.f);
        const picture = new Uint8Array(C.BAND_COLUMNS * C.BAND_ROWS * PATTERN_BYTES);
        this.depth.fill(0);
        if (k <= this.sweepIterations) {
            ({ angle: this.angle, distance: this.distance } = nextCamera(this.angle, this.distance, C));
            for (const [offLeft, offRight] of C.FACE_OFFSETS) {
                const l = R.project(this.angle + offLeft!, this.distance, this.assets.trig, C);
                const r = R.project(this.angle + offRight!, this.distance, this.assets.trig, C);
                R.drawFace(picture, this.depth, l.position, l.scale, r.position, r.scale, this.assets.textures, C);
            }
        }
        else {
            const [xl, sl, xr, sr] = C.FLARE_FACE;
            R.drawFace(picture, this.depth, xl!, sl!, xr!, sr!, this.assets.textures, C);
        }
        this.pending.set(k, picture);
    }
}

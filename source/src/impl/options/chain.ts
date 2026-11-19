import type { EventSink } from "../../domain.js";
import type { ScreenState } from "../screen_types.js";
import { TitleCore } from "../title/loop.js";
import { OptionsCore } from "./core.js";
export type ChainPhase = "title" | "options";
export class TitleOptionsChain {
    private t = 0;
    private exitTick: number | null = null;
    constructor(readonly title: TitleCore, readonly options: OptionsCore) { }
    reset(): void {
        this.t = 0;
        this.exitTick = null;
        this.title.reset();
        this.options.reset();
    }
    get tickIndex(): number {
        return this.t;
    }
    get E(): number | null {
        return this.exitTick;
    }
    get phase(): ChainPhase {
        return this.exitTick === null ? "title" : "options";
    }
    get shown(): ChainPhase {
        return this.exitTick === null || this.t - 1 <= this.exitTick ? "title" : "options";
    }
    get finished(): boolean {
        if (this.exitTick === null)
            return this.title.finished;
        return this.options.finished;
    }
    tick(pad: number, events: EventSink): ScreenState {
        const t = this.t;
        let state: ScreenState;
        if (this.exitTick === null) {
            state = this.title.tick(pad, events);
            if (this.title.exit === "options") {
                this.exitTick = t;
                const m = this.title.model;
                this.options.enter({ planeA: m.planeA.cells, planeB: m.planeB.cells, patterns: m.patterns, pad });
            }
        }
        else {
            state = this.options.tick(pad, events);
        }
        this.t = t + 1;
        return state;
    }
    tilePatterns(indices: readonly number[]): Uint8Array[] {
        const model = this.shown === "title" ? this.title.model : this.options.model;
        return indices.map((i) => model.pattern(i).slice());
    }
}

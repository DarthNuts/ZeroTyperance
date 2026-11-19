import type { EventSink } from "../../domain.js";
import type { ScreenState } from "../screen_types.js";
import { TitleCore } from "../title/loop.js";
import { OptionsCore } from "../options/core.js";
import { BriefingCore } from "./core.js";
export type FlowPhase = "title" | "options" | "briefing";
export class TitleFlowChain {
    private t = 0;
    private exitTick: number | null = null;
    private next: FlowPhase = "title";
    private startCase: "start" | "episode1" | "episode2" | "none" = "start";
    constructor(readonly title: TitleCore, readonly options: OptionsCore | null, readonly briefing: BriefingCore | null) { }
    get startCaseValue(): "start" | "episode1" | "episode2" | "none" {
        return this.startCase;
    }
    setStartCase(c: "start" | "episode1" | "episode2" | "none"): void {
        this.startCase = c;
    }
    reset(heldPad = 0): void {
        this.t = 0;
        this.exitTick = null;
        this.next = "title";
        this.title.reset(heldPad);
        this.options?.reset();
        this.briefing?.reset();
    }
    get tickIndex(): number {
        return this.t;
    }
    get E(): number | null {
        return this.exitTick;
    }
    get phase(): FlowPhase {
        return this.exitTick === null ? "title" : this.next;
    }
    get shown(): FlowPhase {
        return this.exitTick === null || this.t - 1 <= this.exitTick ? "title" : this.next;
    }
    get finished(): boolean {
        if (this.exitTick === null)
            return this.title.finished;
        return this.next === "options" ? this.options!.finished : this.briefing!.finished;
    }
    tick(pad: number, events: EventSink): ScreenState {
        const t = this.t;
        let state: ScreenState;
        if (this.exitTick === null) {
            state = this.title.tick(pad, events);
            const to = this.title.exit;
            if (to !== null) {
                const m = this.title.model;
                const handOver = { planeA: m.planeA.cells, planeB: m.planeB.cells, patterns: m.patterns, pad };
                if (to === "options" && this.options) {
                    this.exitTick = t;
                    this.next = "options";
                    this.options.enter(handOver);
                }
                else if ((to === "demo" || (to === "start" && this.startCase !== "none")) && this.briefing) {
                    this.exitTick = t;
                    this.next = "briefing";
                    this.briefing.enter(handOver, to === "start" ? (this.startCase as "start" | "episode1" | "episode2") : to);
                }
            }
        }
        else if (this.next === "options") {
            state = this.options!.tick(pad, events);
        }
        else {
            state = this.briefing!.tick(pad, events);
        }
        this.t = t + 1;
        return state;
    }
    tilePatterns(indices: readonly number[]): Uint8Array[] {
        const model = this.shownModel();
        return indices.map((i) => model.pattern(i).slice());
    }
    shownModel(): TitleCore["model"] {
        const s = this.shown;
        if (s === "options")
            return this.options!.model;
        if (s === "briefing")
            return this.briefing!.model;
        return this.title.model;
    }
}

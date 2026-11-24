import type { EventSink } from "../../domain.js";
import type { ScreenState } from "../screen_types.js";
import { DISPLAY_BACKDROP, DISPLAY_HEIGHT, DISPLAY_WIDTH, LINE_ENTRIES, PALETTE_ENTRIES, PATTERN_BYTES, SCREEN_LINES, SLOT_COUNT, VideoModel, channelsOf, wordOf, } from "../boot/model.js";
import { padBit } from "../title/loop.js";
import type { TitleHandOver } from "../options/core.js";
import type { BriefingAssets, BriefingPage } from "./assets.js";
import type { BriefingConstants } from "./constants.js";
import { gameOverPageKey, gameOverPages } from "./constants.js";
import { composeVdp, type VdpPlane } from "../rend/app/vdp_compose.js";
import type { DeathConstants } from "../death/constants.js";
export type BriefingPath = "demo" | "start" | "episode1" | "episode2" | "gameover" | "ending";
function entersGame(path: BriefingPath | null): boolean {
    return path === "start" || path === "episode1" || path === "episode2";
}
export type BriefingExitTo = "game" | "title" | "startup";
export type { TitleHandOver };
function fadeWord(target: number, f: (level: number) => number): number {
    const c = channelsOf(target);
    return wordOf(f(c.r), f(c.g), f(c.b));
}
export class BriefingCore {
    readonly model: VideoModel;
    private handOver: TitleHandOver | null = null;
    private path: BriefingPath | null = null;
    private pages: readonly BriefingPage[] = [];
    private k = 0;
    private pageIndex = 0;
    private P = 0;
    private F: number | null = null;
    private counter = 0;
    private record = 0;
    private inSpacer = false;
    private nextRead: number | null = null;
    private upFlag = false;
    private prevPad = 0;
    private endedBy: "counter" | "start" | null = null;
    private startDownAtEnd = false;
    private exitTo: BriefingExitTo | null = null;
    private go: {
        D: DeathConstants;
        episode: number;
        sink: ((request: number) => void) | null;
        leftLines: ReadonlyArray<readonly number[]> | null;
    } | null = null;
    private ending: {
        leftVScroll: number;
        leftLine2: readonly number[] | null;
        blackDone: boolean;
    } | null = null;
    readonly notes: string[] = [];
    static readonly unsavedFields: readonly string[] = ["composed"];
    private composed: Uint8Array | null = null;
    private readonly upBit: number;
    private readonly startBit: number;
    private readonly pauseMask: number;
    constructor(readonly assets: BriefingAssets, readonly C: BriefingConstants) {
        this.model = new VideoModel(C.PLANE_W, C.PLANE_H);
        this.upBit = padBit(C.CRAWL_FAST_BUTTON);
        this.startBit = padBit(C.CRAWL_END_BUTTON);
        this.pauseMask = C.CRAWL_PAUSE_BUTTONS.reduce((mask, name) => mask | padBit(name), 0);
        if (C.DISPLAY[0] !== DISPLAY_WIDTH || C.DISPLAY[1] !== DISPLAY_HEIGHT || C.DISPLAY[2] !== DISPLAY_BACKDROP) {
            throw new Error(`BRIEFING.DISPLAY ${JSON.stringify(C.DISPLAY)} is not the video model's display`);
        }
        if (C.PLANE_W * C.PLANE_H !== C.BLANK_ROW_LENGTH * C.BLANK_ROW_LENGTH) {
            throw new Error(`BRIEFING.BLANK_ROW_LENGTH ${C.BLANK_ROW_LENGTH} squared is not the title's ${C.PLANE_W} x ${C.PLANE_H} entries`);
        }
        for (const ref of [...C.PAGES_DEMO, ...C.PAGES_START, ...C.PAGES_EPISODE_1, ...C.PAGES_EPISODE_2, { screen: C["ENDING.PICTURE"], scene: C["ENDING.SCENE"] }]) {
            if (!assets.pages.has(ref.scene))
                throw new Error(`briefing: no assets for the page ${ref.screen} + ${ref.scene}`);
        }
    }
    reset(): void {
        this.handOver = null;
        this.path = null;
        this.pages = [];
        this.model.powerOn();
        this.k = 0;
        this.pageIndex = 0;
        this.P = 0;
        this.F = null;
        this.counter = 0;
        this.record = 0;
        this.inSpacer = false;
        this.nextRead = null;
        this.upFlag = false;
        this.prevPad = 0;
        this.endedBy = null;
        this.startDownAtEnd = false;
        this.exitTo = null;
        this.go = null;
        this.ending = null;
        this.composed = null;
        this.notes.length = 0;
    }
    enter(handOver: TitleHandOver, path: BriefingPath): void {
        const C = this.C;
        const cells = C.PLANE_W * C.PLANE_H;
        if (handOver.planeA.length !== cells || handOver.planeB.length !== cells) {
            throw new Error(`hand-over planes have ${handOver.planeA.length} / ${handOver.planeB.length} entries, expected ${cells}`);
        }
        if (handOver.patterns.length !== SLOT_COUNT * PATTERN_BYTES)
            throw new Error(`hand-over pattern store has ${handOver.patterns.length} bytes`);
        this.handOver = {
            planeA: Uint16Array.from(handOver.planeA),
            planeB: Uint16Array.from(handOver.planeB),
            patterns: Uint8Array.from(handOver.patterns),
            pad: handOver.pad,
        };
        this.path = path;
        const list = path === "demo" ? C.PAGES_DEMO : path === "start" ? C.PAGES_START : path === "episode1" ? C.PAGES_EPISODE_1 : C.PAGES_EPISODE_2;
        this.pages = list.map((ref) => this.assets.pages.get(ref.scene)!);
        this.upFlag = false;
        this.prevPad = handOver.pad & 0xff;
        this.k = C.BLANK_OFFSET;
    }
    enterGameOver(episode: number, D: DeathConstants, requestSink?: (request: number) => void, leftLines?: ReadonlyArray<readonly number[]>): void {
        const ref = gameOverPages(D)[episode];
        if (ref === undefined)
            throw new Error(`briefing: no game over page for episode ${episode}`);
        const page = this.assets.pages.get(gameOverPageKey(ref));
        if (!page)
            throw new Error(`briefing: no assets for the game over page ${ref.screen} + ${ref.scene}`);
        const R = episode === 0 ? D["GO.ROWS_E0"] : D["GO.ROWS_E12"];
        if (page.records.length !== R)
            throw new Error(`game over ${ref.scene}: ${page.records.length} records, DEATH.GO.ROWS says ${R}`);
        if (this.assets.spacers.length !== D["GO.SPACERS"])
            throw new Error(`game over: ${this.assets.spacers.length} spacers, DEATH.GO.SPACERS says ${D["GO.SPACERS"]}`);
        this.reset();
        this.path = "gameover";
        this.pages = [page];
        this.go = { D, episode, sink: requestSink ?? null, leftLines: leftLines ?? null };
        this.upFlag = false;
        this.prevPad = 0;
        this.k = 0;
    }
    enterEnding(left?: {
        vscroll?: number;
        line2?: readonly number[];
    }): void {
        const C = this.C;
        const page = this.assets.pages.get(C["ENDING.SCENE"]);
        if (!page || page.name !== C["ENDING.PICTURE"])
            throw new Error(`briefing: no assets for the ending's page ${C["ENDING.PICTURE"]} + ${C["ENDING.SCENE"]}`);
        this.reset();
        this.path = "ending";
        this.pages = [page];
        this.ending = { leftVScroll: left?.vscroll ?? 0, leftLine2: left?.line2 ?? null, blackDone: false };
        this.model.setVScrollA(this.ending.leftVScroll);
        this.scrollWord = this.ending.leftVScroll;
        this.model.setVScrollB(0);
        this.nullSprite();
        this.upFlag = false;
        this.prevPad = 0;
        this.k = 1;
    }
    get tickIndex(): number {
        return this.k;
    }
    get briefingPath(): BriefingPath | null {
        return this.path;
    }
    scrollWord = 0;
    get padRead(): number {
        return this.prevPad;
    }
    get endBit(): number {
        return this.startBit;
    }
    get page(): number {
        return this.k > this.C.BLANK_OFFSET ? this.pageIndex + 1 : 0;
    }
    get crawlCounter(): number {
        return this.counter;
    }
    get crawling(): boolean {
        return this.nextRead !== null && this.F === null;
    }
    get padWaits(): boolean {
        return this.crawling && this.k !== this.nextRead;
    }
    get exit(): BriefingExitTo | null {
        return this.exitTo;
    }
    get finished(): boolean {
        return this.exitTo !== null;
    }
    endCount(page: BriefingPage): number {
        return this.C.RECORD_COUNTS * (page.records.length + this.assets.spacers.length - 2);
    }
    tick(pad: number, events: EventSink): ScreenState {
        this.composed = null;
        if (this.ending !== null)
            return this.tickEnding(pad, events);
        if (this.exitTo !== null)
            return this.model.state();
        if (this.go !== null)
            return this.tickGameOver(pad, events);
        if (this.handOver === null)
            throw new Error("BriefingCore.tick before enter()");
        const C = this.C;
        const k = this.k;
        if (k === C.BLANK_OFFSET) {
            this.blankFrame(this.handOver);
        }
        else if (k === C.PICTURE_OFFSET) {
            this.P = k;
            this.pageIndex = 0;
            this.picture(true, events);
        }
        else if (this.F === null) {
            this.pageRun(k, pad, events);
        }
        else {
            this.fadeOut(k, events);
        }
        this.k = k + 1;
        return this.model.state();
    }
    get display(): 0 | 1 {
        return this.model.displayEnabled ? 1 : 0;
    }
    get cram(): readonly number[] {
        return Array.from(this.model.cram);
    }
    indices(): Uint8Array {
        if (this.composed)
            return this.composed;
        const m = this.model;
        const tile = (slot: number): Uint8Array => m.pattern(slot);
        const mk = (p: {
            width: number;
            height: number;
            cells: Uint16Array;
            vscroll: number;
        }, hscroll: number): VdpPlane => ({
            cols: p.width, rows: p.height, words: p.cells, hscroll, vscroll: p.vscroll, tile,
        });
        const table = m.planeA.lineScroll;
        const values = table ? Array.from(new Set(Array.from(table))) : [0];
        const out = new Uint8Array(DISPLAY_WIDTH * DISPLAY_HEIGHT);
        for (const v of values) {
            const one = composeVdp({
                width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT, planeA: mk(m.planeA, v), planeB: mk(m.planeB, 0), overlayB: null, sprites: [],
                maxSpritesPerLine: 0, maxSpritePixelsPerLine: 0,
            });
            for (let y = 0; y < DISPLAY_HEIGHT; y++) {
                if (table && table[y] !== v)
                    continue;
                out.set(one.subarray(y * DISPLAY_WIDTH, (y + 1) * DISPLAY_WIDTH), y * DISPLAY_WIDTH);
            }
        }
        this.composed = out;
        return out;
    }
    private tickEnding(pad: number, events: EventSink): ScreenState {
        const C = this.C;
        const e = this.ending!;
        const k = this.k;
        const s = C.FADE_STEP_TICKS;
        if (this.exitTo !== null) {
            if (!e.blackDone) {
                e.blackDone = true;
                this.model.clearPalette();
            }
            return this.model.state();
        }
        if (k === C["ENDING.MUSIC_TICK"]) {
            events.emit({ type: "Audio.PlayMusic", opcode: C["ENDING.MUSIC_1"][0]! as 5 | 16, value: C["ENDING.MUSIC_1"][1]! });
            events.emit({ type: "Audio.PlayMusic", opcode: C["ENDING.MUSIC_2"][0]! as 5 | 16, value: C["ENDING.MUSIC_2"][1]! });
        }
        const crawlStart = C["ENDING.FIRST_FADE_TICK"] + s * C.FADE_IN_WRITTEN;
        if (k === C["ENDING.PICTURE_TICK"]) {
            this.P = k;
            this.pageIndex = 0;
            this.picture(false, events);
        }
        else if (k > C["ENDING.PICTURE_TICK"] && this.F === null) {
            const d = k - C["ENDING.FIRST_FADE_TICK"];
            if (d >= 0 && d % s === 0 && d / s < C.FADE_IN_WRITTEN) {
                const j = d / s + 1;
                this.writeFade((level) => Math.min(level, j), ["picture", "text"]);
            }
            else if (k === crawlStart) {
                this.nextRead = k + C["ENDING.CRAWL_FIRST_WAIT"];
                this.counter = 0;
            }
            else if (k === crawlStart + (C["ENDING.CRAWL_FIRST_WAIT"] - C.CRAWL_WAIT)) {
                this.model.setVScrollA(0);
                this.scrollWord = 0;
            }
            else if (k === this.nextRead) {
                this.iteration(k, pad, events);
            }
        }
        else if (this.F !== null) {
            const since = k - this.F;
            if (since > 0 && since % s === 0 && since / s < C.FADE_OUT_STEPS) {
                const j = since / s;
                this.writeFade((level) => Math.max(0, level - j), ["picture", "text"]);
            }
            if (since === s * C.FADE_OUT_STEPS + C["ENDING.EXIT_TICK_OFFSET"]) {
                events.emit({ type: "Audio.StopTrack", id: C["ENDING.END_STOP_TRACK_ID"] });
                events.emit({ type: "Flow.Exit", to: C["ENDING.EXIT"] } as unknown as Parameters<EventSink["emit"]>[0]);
                this.exitTo = C["ENDING.EXIT"] as BriefingExitTo;
            }
        }
        this.k = k + 1;
        return this.model.state();
    }
    private tickGameOver(pad: number, events: EventSink): ScreenState {
        const { D, episode, sink } = this.go!;
        const k = this.k;
        if (k === D["GO.MUSIC_FRAME"]) {
            events.emit({ type: "Audio.Request", request: D["GO.MUSIC_REQUEST"] });
            if (sink)
                sink(D["GO.MUSIC_REQUEST"]);
        }
        if (k === D["GO.PICTURE_TICK"]) {
            this.P = k;
            this.pageIndex = 0;
            this.model.setVScrollA(0);
            this.model.setVScrollB(0);
            this.picture(false, events);
        }
        else if (k > D["GO.PICTURE_TICK"]) {
            this.pageRun(k, pad, events);
            if (this.F !== null && this.exitTo === null) {
                this.exitTo = D["GO.EXIT_TO"] as BriefingExitTo;
                events.emit({ type: "Flow.Exit", to: this.exitTo } as unknown as Parameters<EventSink["emit"]>[0]);
                if (episode !== 0)
                    this.notes.push(`episode ${episode}: the GAME OVER art screen (voice request ${D["GO.VOICE_REQUEST"]} x3, wait ${D["GO.ART_WAIT"]}) is code only and left out (ZT-UI-BRIEFING 4.10)`);
            }
        }
        this.k = k + 1;
        return this.model.state();
    }
    private blankFrame(h: TitleHandOver): void {
        const { model, C } = this;
        model.powerOn();
        model.displayEnabled = true;
        for (let i = 0; i < PALETTE_ENTRIES; i++)
            model.setColour(i, 0);
        this.nullSprite();
        model.patterns.set(h.patterns);
        model.resizePlanes(C.BLANK_ROW_LENGTH, C.BLANK_ROW_LENGTH);
        model.planeA.cells.set(h.planeA);
        model.planeB.cells.set(h.planeB);
    }
    private nullSprite(): void {
        const s = this.C.OFFSCREEN_SPRITE;
        this.model.setSprites([{ x: s[0]!, y: s[1]!, w: s[2]!, h: s[3]!, attr: s[4]! }]);
    }
    private get current(): BriefingPage {
        return this.pages[this.pageIndex]!;
    }
    private targetLine(key: string): number[] {
        const line = this.current.picture.palette[Number(key)];
        if (!line)
            throw new Error(`page ${this.current.name}: no palette line ${key}`);
        return line.map((w) => w & this.C.COLOUR_MASK);
    }
    private writeFade(f: (level: number) => number, lines: readonly [
        "picture" | "text",
        ...("picture" | "text")[]
    ]): void {
        const C = this.C;
        for (const which of lines) {
            const key = which === "picture" ? C.PICTURE_PALETTE_LINE : C.TEXT_PALETTE_LINE;
            const words = this.targetLine(key).map((w) => fadeWord(w, f));
            this.model.setLine(Number(key), words);
            const fullWrite = this.ending !== null && this.F !== null && lines.length === 1;
            if (which === "picture" && !fullWrite && this.current.picture.palette[Number(C.PICTURE_PALETTE_LINE_2)]) {
                const words2 = this.targetLine(C.PICTURE_PALETTE_LINE_2).map((w) => fadeWord(w, f));
                this.model.setLine(Number(C.PICTURE_PALETTE_LINE_2), words2);
            }
        }
        if (this.ending !== null && this.ending.leftLine2 !== null && lines.length > 1) {
            this.model.setLine(2, this.ending.leftLine2.map((w) => fadeWord(w & C.COLOUR_MASK, f)));
        }
        const left = this.go?.leftLines ?? null;
        if (left !== null && lines.includes("picture")) {
            for (let l = 0; l < left.length; l++) {
                if (l === Number(C.PICTURE_PALETTE_LINE) || l === Number(C.TEXT_PALETTE_LINE) || this.current.picture.palette[l])
                    continue;
                this.model.setLine(l, left[l]!.map((w) => fadeWord(w & C.COLOUR_MASK, f)));
            }
        }
    }
    private picture(first: boolean, events: EventSink): void {
        const { model, C } = this;
        const page = this.current;
        model.displayEnabled = true;
        model.clearPalette();
        this.nullSprite();
        model.resizePlanes(C.PLANE_W, C.PLANE_H);
        if (first) {
            model.setVScrollA(0);
            model.setVScrollB(0);
        }
        model.planeB.clearLineScroll();
        for (let r = 0; r < C.PICTURE_ROWS; r++) {
            for (let c = 0; c < C.PICTURE_COLUMNS; c++)
                model.writeCellB(c, r, page.picture.entries[r * page.picture.cols + c]!);
        }
        if (C.BLANK_CELL !== 0)
            for (let i = 0; i < model.planeA.cells.length; i++)
                model.planeA.cells[i] = C.BLANK_CELL;
        const hscroll = new Array<number>(SCREEN_LINES);
        for (let y = 0; y < SCREEN_LINES; y++)
            hscroll[y] = y >= C.TEXT_LINES[0]! && y <= C.TEXT_LINES[1]! ? 0 : C.HIDE_SCROLL;
        model.planeA.setLineScroll(hscroll);
        model.load(page.picture.firstSlot, page.picture.tiles);
        model.load(C.TEXT_SLOT, this.assets.font.tiles);
        this.counter = 0;
        this.record = 0;
        this.inSpacer = false;
        this.nextRead = null;
        this.F = null;
        this.endedBy = null;
        this.startDownAtEnd = false;
        if (first && entersGame(this.path)) {
            events.emit({ type: "Audio.StopTrack", id: C.START_STOP_TRACK_ID });
            events.emit({ type: "Audio.PlayMusic", opcode: C.START_MUSIC_1[0]! as 5 | 16, value: C.START_MUSIC_1[1]! });
            events.emit({ type: "Audio.PlayMusic", opcode: C.START_MUSIC_2[0]! as 5 | 16, value: C.START_MUSIC_2[1]! });
        }
    }
    private pageRun(k: number, pad: number, events: EventSink): void {
        const C = this.C;
        const since = k - this.P;
        const s = C.FADE_STEP_TICKS;
        const loopStart = s * C.FADE_IN_STEPS;
        if (since < loopStart) {
            if (since % s === 0) {
                const j = since / s;
                if (j >= 1 && j <= C.FADE_IN_WRITTEN)
                    this.writeFade((level) => Math.min(level, j), ["picture", "text"]);
            }
            return;
        }
        if (since === loopStart) {
            this.counter = 0;
            this.model.setVScrollA(0);
            this.nextRead = k + this.wait();
            return;
        }
        if (k !== this.nextRead)
            return;
        this.iteration(k, pad, events);
    }
    private wait(): number {
        return this.upFlag ? this.C.CRAWL_WAIT_UP : this.C.CRAWL_WAIT;
    }
    private iteration(k: number, pad: number, _events: EventSink): void {
        const C = this.C;
        const p = pad;
        const q = this.prevPad;
        this.upFlag = (p & this.upBit) !== 0;
        const freshStart = (p & this.startBit) !== 0 && (q & this.startBit) === 0;
        this.prevPad = p;
        this.startDownAtEnd = (p & this.startBit) !== 0;
        if (freshStart) {
            this.endPage(k, "start");
            return;
        }
        if ((p & this.pauseMask) !== 0) {
            this.nextRead = k + this.wait();
            return;
        }
        if (this.counter % C.RECORD_COUNTS === 0) {
            if (!this.advanceRecord(k))
                return;
        }
        this.counter += 1;
        this.model.setVScrollA(this.counter);
        this.scrollWord = this.counter;
        this.nextRead = k + this.wait();
    }
    private advanceRecord(k: number): boolean {
        for (;;) {
            const list = this.inSpacer ? this.assets.spacers : this.current.records;
            this.drawRecord(list[this.record]!);
            if (this.record + 1 < list.length) {
                this.record += 1;
                return true;
            }
            if (this.inSpacer) {
                this.endPage(k, "counter");
                return false;
            }
            this.inSpacer = true;
            this.record = 0;
        }
    }
    private drawRecord(rec: string): void {
        const { model, C } = this;
        const r = Math.floor((this.counter % C.ROW_WRAP) / C.ROW_DIV);
        const r1 = (r + 1) % C.PLANE_H;
        const chars = Array.from(rec);
        if (chars.length !== C.RECORD_CHARS)
            throw new Error(`a record of ${chars.length} characters, RECORD_CHARS is ${C.RECORD_CHARS}`);
        chars.forEach((ch, i) => {
            const g = this.assets.font.glyphs.get(ch);
            if (g === undefined)
                throw new Error(`the font ${this.assets.font.name} has no glyph for ${JSON.stringify(ch)}`);
            model.writeCellA(C.TEXT_COL + i, r, g.upper === null ? C.BLANK_CELL : C.TEXT_FLAGS + C.TEXT_SLOT + g.upper);
            model.writeCellA(C.TEXT_COL + i, r1, g.lower === null ? C.BLANK_CELL : C.TEXT_FLAGS + C.TEXT_SLOT + g.lower);
        });
    }
    private endPage(k: number, by: "counter" | "start"): void {
        this.F = k;
        this.endedBy = by;
        this.nextRead = null;
        if (this.go !== null)
            return;
        this.writeFade((level) => level, ["picture"]);
    }
    private fadeOut(k: number, events: EventSink): void {
        const C = this.C;
        const since = k - this.F!;
        const s = C.FADE_STEP_TICKS;
        if (since % s !== 0)
            return;
        const j = since / s;
        if (j < C.FADE_OUT_STEPS) {
            this.writeFade((level) => Math.max(0, level - j), ["picture", "text"]);
            return;
        }
        this.model.clearPalette();
        if (this.endedBy === "counter" && this.pageIndex + 1 < this.pages.length) {
            this.pageIndex += 1;
            this.P = k;
            this.picture(false, events);
            return;
        }
        let to: Exclude<BriefingExitTo, "startup">;
        if (entersGame(this.path)) {
            events.emit({ type: "Audio.StopTrack", id: C.END_STOP_TRACK_ID });
            to = C.EXIT_DONE as typeof to;
        }
        else {
            to = (this.endedBy === "start" || this.startDownAtEnd ? C.EXIT_CANCEL : C.EXIT_DONE) as typeof to;
        }
        this.exitTo = to;
        events.emit({ type: "Flow.Exit", to });
    }
}
export { LINE_ENTRIES };

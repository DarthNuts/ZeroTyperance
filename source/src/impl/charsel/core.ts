import type { EventSink, GameEvent } from "../../domain.js";
import type { ScreenSprite, ScreenState } from "../screen_types.js";
import { composeVdp, type VdpPlane, type VdpSprite } from "../rend/app/vdp_compose.js";
import { DISPLAY_HEIGHT, DISPLAY_WIDTH, LINE_ENTRIES, PALETTE_ENTRIES, PATTERN_BYTES, VideoModel, channelsOf, wordOf, } from "../boot/model.js";
import type { TileBlock } from "../boot/assets.js";
import type { CharselAssets } from "./assets.js";
import type { CharselConstants } from "./constants.js";
export interface CharselDriver {
    (events: EventSink, request: number): void;
}
const SPRITE_OFFSET = 128;
const CHIP_SPRITES_PER_LINE = 20;
const CHIP_SPRITE_PIXELS_PER_LINE = 320;
const WORD_MASK = 0xffff;
export class CharselCore {
    readonly model: VideoModel;
    private f = -1;
    private c = 0;
    private alive: number[] = [];
    private p = 0;
    private s = 0;
    private q = 0;
    private w: number[] = new Array<number>(PALETTE_ENTRIES).fill(0);
    private slideLeft = 0;
    private slideDir = 0;
    private exitFrame = -1;
    private exitCharacter: number | null = null;
    private done = false;
    private spriteWords: Array<{
        x: number;
        y: number;
        w: number;
        h: number;
        attr: number;
    }> = [];
    static readonly unsavedFields: readonly string[] = ["composed"];
    private composed: Uint8Array | null = null;
    constructor(private readonly assets: CharselAssets, private readonly C: CharselConstants, private readonly driver: CharselDriver | null = null) {
        this.model = new VideoModel(this.planeCells(), this.planeCells());
    }
    private planeCells(): number {
        return this.C["LAYOUT.ROW_BYTES"] / 2;
    }
    reset(cursor: number, alive: readonly number[], prevPad = 0): void {
        this.f = -1;
        this.c = cursor;
        this.alive = [...alive];
        this.p = 0;
        this.s = 0;
        this.q = prevPad & 0xff;
        this.slideLeft = 0;
        this.slideDir = 0;
        this.exitFrame = -1;
        this.exitCharacter = null;
        this.done = false;
        this.composed = null;
        this.spriteWords = [];
        this.model.powerOn();
    }
    get frame(): number {
        return this.f;
    }
    get cursor(): number {
        return this.c;
    }
    get exit(): {
        character: number;
    } | null {
        return this.exitCharacter === null ? null : { character: this.exitCharacter };
    }
    get finished(): boolean {
        return this.done;
    }
    get cram(): readonly number[] {
        return Array.from(this.model.cram);
    }
    get display(): 0 | 1 {
        return this.model.displayEnabled ? 1 : 0;
    }
    tick(pad: number, events: EventSink): ScreenState {
        if (this.done)
            return this.model.state();
        const C = this.C;
        this.f += 1;
        const f = this.f;
        this.composed = null;
        if (f === 0)
            this.setUp();
        const fadeInEnd = C["FADE.SETUP_FRAMES"] + C["FADE.STEPS_WRITTEN"] * C["FADE.STEP_FRAMES"];
        if (this.exitFrame >= 0) {
            this.fadeOut(f - this.exitFrame);
        }
        else if (this.slideLeft > 0) {
            this.slideStep();
        }
        else if (f > fadeInEnd) {
            this.pass(pad, events);
        }
        if (f >= C["FADE.SETUP_FRAMES"] && f < fadeInEnd)
            this.fadeIn(f);
        return this.model.state();
    }
    indices(): Uint8Array {
        if (this.composed)
            return this.composed;
        const m = this.model;
        const vs = this.s & this.C["SPRITE.Y_MASK"];
        const tile = (slot: number): Uint8Array => m.pattern(slot);
        const plane = (cells: Uint16Array): VdpPlane => ({
            cols: this.planeCells(), rows: this.planeCells(), words: cells, hscroll: 0, vscroll: vs, tile,
        });
        const sprites: VdpSprite[] = this.spriteWords.map((e) => ({
            xWord: e.x, yWord: e.y, wCells: e.w, hCells: e.h, attr: e.attr, tile,
        }));
        this.composed = composeVdp({
            width: DISPLAY_WIDTH,
            height: DISPLAY_HEIGHT,
            planeA: plane(m.planeA.cells),
            planeB: plane(m.planeB.cells),
            overlayB: null,
            sprites,
            maxSpritesPerLine: CHIP_SPRITES_PER_LINE,
            maxSpritePixelsPerLine: CHIP_SPRITE_PIXELS_PER_LINE,
        });
        return this.composed;
    }
    private setUp(): void {
        const a = this.assets;
        const m = this.model;
        m.powerOn();
        const card0 = a.cards[0]!;
        this.w = new Array<number>(PALETTE_ENTRIES).fill(0);
        for (let line = 0; line < card0.paletteLines.length; line++) {
            for (let e = 0; e < LINE_ENTRIES; e++) {
                const ch = channelsOf(card0.paletteLines[line]![e] ?? 0);
                this.w[line * LINE_ENTRIES + e] = wordOf(ch.r, ch.g, ch.b);
            }
        }
        for (const card of a.cards)
            m.load(card.firstSlot, card.tiles);
        m.load(a.fontSlot, a.font.tiles);
        m.load(a.bankSlot, a.bank);
        for (const list of a.tileLists) {
            for (let i = 0; i < list.entries.length; i++) {
                const t = list.entries[i]!;
                const one: TileBlock = {
                    name: a.pool.name,
                    count: 1,
                    patterns: a.pool.patterns.subarray(t * PATTERN_BYTES, (t + 1) * PATTERN_BYTES),
                };
                m.load(list.firstSlot + i, one);
            }
        }
        m.load(a.tileSlot, a.tile);
        this.p = 0;
        this.s = 0;
        this.writeSprites();
        const pageRows = this.C["LAYOUT.PAGE_ROWS"];
        this.drawText(a.separator, this.C["TEXT.SEPARATOR.ROW"], this.C["TEXT.SEPARATOR.COL"]);
        this.drawText(a.separator, this.C["TEXT.SEPARATOR.ROW"] + pageRows, this.C["TEXT.SEPARATOR.COL"]);
        this.drawCard(this.c, 0);
        if (this.alive[this.c] !== this.C["ALIVE.ENTRY_OK"])
            this.drawOverlay(0);
        const rec = a.dossiers[this.c]!;
        let end = this.C["TEXT.NAME_ROW.ENTRY_OFFSET"];
        while (end < rec.length && rec[end] !== 0)
            end++;
        this.drawText(bytesToString(rec, this.C["TEXT.NAME_ROW.ENTRY_OFFSET"], end), this.C["TEXT.NAME_ROW.ROW"], this.C["TEXT.NAME_ROW.COL"]);
    }
    private drawText(str: string, row: number, col: number): void {
        const a = this.assets;
        const lower = this.C["TEXT.LOWER_ROW"];
        for (let i = 0; i < str.length; i++) {
            const g = a.font.glyphs.get(str[i]!);
            const up = g?.upper ?? null;
            const lo = g?.lower ?? null;
            this.model.writeCellB(col + i, row, up === null ? 0 : a.fontFlags + a.fontSlot + up);
            this.model.writeCellB(col + i, row + lower, lo === null ? 0 : a.fontFlags + a.fontSlot + lo);
        }
    }
    private drawCard(k: number, p: number): void {
        const C = this.C;
        const card = this.assets.cards[k]!;
        const shift = p * C["LAYOUT.PAGE_ROWS"];
        for (let r = 0; r < card.rows; r++) {
            for (let cc = 0; cc < card.cols; cc++) {
                this.model.writeCellB(card.origin[1] + cc, card.origin[0] + r + shift, card.entries[r * card.cols + cc]!);
            }
        }
        const rec = this.assets.dossiers[k]!;
        const lines: string[] = [];
        let start = 0;
        for (let i = 0; i < rec.length; i++) {
            if (rec[i] === 0) {
                lines.push(bytesToString(rec, start, i));
                start = i + 1;
            }
        }
        for (let i = 0; i < C["TEXT.INFO.LINES"]; i++) {
            this.drawText(lines[i] ?? "", C["TEXT.INFO.ROW"] + shift + i * C["TEXT.LINE_STEP_ROWS"], C["TEXT.INFO.COL"]);
        }
        for (let i = 0; i < C["TEXT.BIO.LINES"]; i++) {
            this.drawText(lines[C["TEXT.INFO.LINES"] + i] ?? "", C["TEXT.BIO.ROW"] + shift + i * C["TEXT.LINE_STEP_ROWS"], C["TEXT.BIO.COL"]);
        }
    }
    private drawOverlay(p: number): void {
        const ov = this.assets.overlay;
        const shift = p * this.C["LAYOUT.OVERLAY_PAGE_ROWS"];
        for (let r = 0; r < ov.rows; r++) {
            for (let cc = 0; cc < ov.cols; cc++)
                this.model.writeCellA(cc, r + shift, ov.entries[r * ov.cols + cc]!);
        }
    }
    private writeSprites(): void {
        const C = this.C;
        const mask = C["SPRITE.Y_MASK"];
        this.spriteWords = C["SPRITE.ENTRIES"].map((e) => ({
            x: e.x,
            y: (e.y_base + (C["SPRITE.Y_SCROLL_BASE"] - (this.s & mask))) & mask,
            w: e.width_cells,
            h: e.height_cells,
            attr: e.attr,
        }));
        const list: ScreenSprite[] = this.spriteWords.map((e) => ({
            x: e.x - SPRITE_OFFSET, y: e.y - SPRITE_OFFSET, w: e.w, h: e.h, attr: e.attr,
        }));
        this.model.setSprites(list);
    }
    private setPalette(level: (target: number, i: number) => number): void {
        for (let i = 0; i < PALETTE_ENTRIES; i++) {
            const t = channelsOf(this.w[i]!);
            this.model.setColour(i, wordOf(level(t.r, i), level(t.g, i), level(t.b, i)));
        }
    }
    private fadeIn(f: number): void {
        const C = this.C;
        const j = Math.floor((f - C["FADE.SETUP_FRAMES"]) / C["FADE.STEP_FRAMES"]) + 1;
        this.setPalette((t) => Math.min(t, j));
    }
    private fadeOut(d: number): void {
        const C = this.C;
        const step = C["FADE.STEP_FRAMES"];
        if (d < step) {
            for (let i = 0; i < LINE_ENTRIES; i++) {
                const t = channelsOf(this.w[i]!);
                this.model.setColour(i, wordOf(t.r, t.g, t.b));
            }
            return;
        }
        const j = Math.floor(d / step);
        if (j <= C["FADE.STEPS_WRITTEN"]) {
            this.setPalette((t) => Math.max(0, t - j));
            return;
        }
        this.model.clearPalette();
        this.done = true;
    }
    private request(events: EventSink, request: number): void {
        events.emit({ type: "Audio.Request", request } as GameEvent);
        if (this.driver)
            this.driver(events, request);
    }
    private pass(pad: number, events: EventSink): void {
        const C = this.C;
        const fresh = pad & ~this.q & 0xff;
        this.q = pad & 0xff;
        if ((fresh >> C["PAD.UP"]) & 1) {
            this.request(events, C["SOUND.MOVE"]);
            this.c += 1;
            if (this.c >= C["CURSOR.COUNT"])
                this.c = C["CURSOR.UP_WRAP_TO"];
            this.cardChange(1);
        }
        else if ((fresh >> C["PAD.DOWN"]) & 1) {
            this.request(events, C["SOUND.MOVE"]);
            this.c -= 1;
            if (this.c < 0)
                this.c = C["CURSOR.DOWN_WRAP_TO"];
            this.cardChange(-1);
        }
        else if (C["PAD.CONFIRM_BITS"].some((b) => (fresh >> b) & 1)) {
            if (this.alive[this.c] === C["ALIVE.ENTRY_OK"]) {
                this.request(events, C["SOUND.CONFIRM"]);
                events.emit({ type: "Flow.Exit", to: "level", character: this.c } as unknown as GameEvent);
                this.exitFrame = this.f;
                this.exitCharacter = this.c;
                this.fadeOut(0);
            }
            else {
                this.request(events, C["SOUND.DEAD"]);
            }
        }
    }
    private cardChange(d: number): void {
        this.p = 1 - this.p;
        this.drawCard(this.c, this.p);
        if (this.alive[this.c] !== this.C["ALIVE.ENTRY_OK"])
            this.drawOverlay(this.p);
        this.slideLeft = this.C["SCROLL.FRAMES"];
        this.slideDir = d;
    }
    private slideStep(): void {
        const C = this.C;
        this.s = (this.s + this.slideDir * C["SCROLL.STEP"]) & C["SCROLL.MASK"] & WORD_MASK;
        const v = this.s & C["SPRITE.Y_MASK"];
        this.model.setVScrollA(v);
        this.model.setVScrollB(v);
        this.writeSprites();
        this.slideLeft -= 1;
        if (this.slideLeft === 0) {
            const rows = C["LAYOUT.OVERLAY_PAGE_ROWS"];
            const cols = this.planeCells();
            const first = (1 - this.p) * rows;
            for (let r = first; r < first + rows; r++) {
                for (let cc = 0; cc < cols; cc++)
                    this.model.writeCellA(cc, r, 0);
            }
        }
    }
}
function bytesToString(b: Uint8Array, from: number, to: number): string {
    let out = "";
    for (let i = from; i < to; i++)
        out += String.fromCharCode(b[i]!);
    return out;
}

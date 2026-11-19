import type { EventSink, GameEvent } from "../../domain.js";
import type { ScreenSprite } from "../screen_types.js";
import { composeVdp, type VdpPlane, type VdpSprite } from "../rend/app/vdp_compose.js";
import { DISPLAY_HEIGHT, DISPLAY_WIDTH, LINE_ENTRIES, TILE_PIXELS, VideoModel } from "../boot/model.js";
import type { PasswordAssets } from "./assets.js";
import type { PasswordConstants } from "./constants.js";
import type { PasswordDecoder, PasswordRecord, PasswordResult, PasswordScreen } from "./types.js";
export type PasswordDriver = (events: EventSink, request: number) => void;
const SPRITE_OFFSET = 128;
const CHIP_SPRITES_PER_LINE = 20;
const CHIP_SPRITE_PIXELS_PER_LINE = 320;
const TEXT_ROWS = 2;
const SPRITE_CELLS = 1;
const PAD_MASK = 0xff;
type Dir = "LEFT" | "RIGHT" | "UP" | "DOWN";
const DIR_ORDER: readonly Dir[] = ["LEFT", "RIGHT", "UP", "DOWN"];
export class PasswordCore implements PasswordScreen {
    readonly model: VideoModel;
    private f = -1;
    private row = 0;
    private col = 0;
    private buf: string[] = [];
    private n = 0;
    private q = 0;
    private k: Record<Dir, number> = { LEFT: 0, RIGHT: 0, UP: 0, DOWN: 0 };
    private errorFrame = -1;
    private storedPw = "";
    private amountsBefore: readonly number[] = [0, 0, 0, 0, 0];
    private exitResult: PasswordResult | null = null;
    private armed = false;
    private cellHist: Array<{
        row: number;
        col: number;
    }> = [];
    private entryCell = { row: 0, col: 0 };
    static readonly unsavedFields: readonly string[] = ["composed"];
    private composed: Uint8Array | null = null;
    constructor(private readonly assets: PasswordAssets, private readonly C: PasswordConstants, private readonly decoder: PasswordDecoder, private readonly driver: PasswordDriver | null = null) {
        this.model = new VideoModel(this.planeCells(), this.planeCells());
    }
    private planeCells(): number {
        return this.C["LAYOUT.ROW_BYTES"] / 2;
    }
    private blankChar(): string {
        return String.fromCharCode(this.C["BUFFER.BLANK"]);
    }
    private get buttonRow(): number {
        return this.C["GRID.ROWS"] - 1;
    }
    enter(stored: string, amountsBefore: readonly number[] = [0, 0, 0, 0, 0]): void {
        const C = this.C;
        this.f = -1;
        this.row = C["CURSOR.START_ROW"];
        this.col = C["CURSOR.START_COL"];
        this.entryCell = { row: this.row, col: this.col };
        this.buf = [...stored];
        this.n = stored[0] === this.blankChar() ? 0 : C["BUFFER.LEN"];
        this.q = 0;
        this.k = { LEFT: 0, RIGHT: 0, UP: 0, DOWN: 0 };
        this.errorFrame = -1;
        this.storedPw = stored;
        this.amountsBefore = amountsBefore;
        this.exitResult = null;
        this.cellHist = [];
        this.composed = null;
        this.armed = true;
        this.model.powerOn();
    }
    get frame(): number {
        return this.f;
    }
    get exit(): PasswordResult | null {
        return this.exitResult;
    }
    get display(): 0 | 1 {
        return this.model.displayEnabled ? 1 : 0;
    }
    get cram(): readonly number[] {
        return Array.from(this.model.cram);
    }
    get cursorCell(): {
        row: number;
        col: number;
    } {
        return { row: this.row, col: this.col };
    }
    get inError(): boolean {
        return this.errorFrame >= 0;
    }
    get buffer(): string {
        return this.buf.join("");
    }
    tick(pad: number, events: EventSink): void {
        if (!this.armed)
            throw new Error("PasswordCore.tick before enter()");
        if (this.exitResult !== null)
            return;
        const C = this.C;
        this.f += 1;
        const f = this.f;
        this.composed = null;
        pad &= PAD_MASK;
        if (f === 0) {
            this.setUp();
            this.q = pad;
        }
        else if (this.errorFrame >= 0 && f - this.errorFrame < C["ERROR.FRAMES"]) {
        }
        else {
            if (this.errorFrame >= 0) {
                this.errorFrame = -1;
                this.drawBuffer();
            }
            this.pass(pad, events);
        }
        this.cellHist[f] = { row: this.row, col: this.col };
        this.writeSprites();
    }
    indices(): Uint8Array {
        if (this.composed)
            return this.composed;
        const m = this.model;
        const tile = (slot: number): Uint8Array => m.pattern(slot);
        const plane = (cells: Uint16Array): VdpPlane => ({
            cols: this.planeCells(), rows: this.planeCells(), words: cells, hscroll: 0, vscroll: 0, tile,
        });
        const sprites: VdpSprite[] = m.sprites.map((e) => ({
            xWord: e.x + SPRITE_OFFSET, yWord: e.y + SPRITE_OFFSET, wCells: e.w, hCells: e.h, attr: e.attr, tile,
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
        const C = this.C;
        const m = this.model;
        m.powerOn();
        m.setLine(0, a.line0);
        m.setLine(1, new Array<number>(LINE_ENTRIES).fill(0));
        m.setLine(C["PALETTE.LINE"], a.line2);
        m.setLine(3, a.line3);
        m.load(C["FONT.TILE_SLOT"], a.font.tiles);
        m.load(C["CORNER.TILE_SLOT"], a.corner);
        this.drawText(a.heading, C["TEXT.HEADER_ADDR"]);
        for (let r = 0; r < this.buttonRow; r++) {
            this.drawText(a.rows[r]!, C["TEXT.GRID_ADDR"] + r * TEXT_ROWS * C["LAYOUT.ROW_BYTES"]);
        }
        this.drawText(a.buttons, C["TEXT.GRID_ADDR"] + this.buttonRow * TEXT_ROWS * C["LAYOUT.ROW_BYTES"]);
        this.drawBuffer();
    }
    private textRow(addr: number): number {
        return (addr - this.C["LAYOUT.PLANE_B"]) / this.C["LAYOUT.ROW_BYTES"];
    }
    private drawText(str: string, addr: number): void {
        const C = this.C;
        const row = this.textRow(addr);
        const col0 = C["TEXT.CENTRE_CELLS"] - Math.floor(str.length / 2);
        for (let i = 0; i < str.length; i++) {
            const g = this.assets.font.glyphs.get(str[i]!);
            const up = g?.upper ?? null;
            const lo = g?.lower ?? null;
            this.model.writeCellB(col0 + i, row, up === null ? 0 : C["FONT.FLAGS"] + C["FONT.TILE_SLOT"] + up);
            this.model.writeCellB(col0 + i, row + TEXT_ROWS - 1, lo === null ? 0 : C["FONT.FLAGS"] + C["FONT.TILE_SLOT"] + lo);
        }
    }
    private drawBuffer(): void {
        const row = this.textRow(this.C["TEXT.BUFFER_ADDR"]);
        for (let c = 0; c < this.planeCells(); c++) {
            for (let r = 0; r < TEXT_ROWS; r++)
                this.model.writeCellB(c, row + r, 0);
        }
        this.drawText(this.errorFrame >= 0 ? this.assets.errorText : this.buf.join(""), this.C["TEXT.BUFFER_ADDR"]);
    }
    private writeSprites(): void {
        const C = this.C;
        const src = this.f - C["SPRITE.LAG_FRAMES"];
        const cell = src < 0 ? this.entryCell : this.cellHist[src]!;
        const cellPx = TEXT_ROWS * TILE_PIXELS;
        const yTop = C["SPRITE.Y0"] + cellPx * cell.row;
        const yBot = yTop + C["SPRITE.BOX"][1]!;
        let xl: number;
        let xr: number;
        if (cell.row < this.buttonRow) {
            xl = C["SPRITE.X0"] + cellPx * cell.col;
            xr = xl + C["SPRITE.BOX"][0]!;
        }
        else {
            [xl, xr] = C["SPRITE.BUTTON_X"][cell.col]!;
        }
        const pos: Array<[
            number,
            number
        ]> = [[xl, yTop], [xr, yTop], [xl, yBot], [xr, yBot]];
        const list: ScreenSprite[] = [];
        for (let i = 0; i < C["SPRITE.COUNT"]; i++) {
            list.push({ x: pos[i]![0] - SPRITE_OFFSET, y: pos[i]![1] - SPRITE_OFFSET, w: SPRITE_CELLS, h: SPRITE_CELLS, attr: C["SPRITE.ATTRS"][i]! });
        }
        this.model.setSprites(list);
    }
    private request(events: EventSink, request: number): void {
        events.emit({ type: "Audio.Request", request } as GameEvent);
        if (this.driver)
            this.driver(events, request);
    }
    private pass(pad: number, events: EventSink): void {
        const C = this.C;
        const q = this.q;
        for (const d of DIR_ORDER) {
            const bit = 1 << C[`PAD.${d}`];
            let move = false;
            if ((pad & bit) === 0) {
                this.k[d] = 0;
            }
            else if ((q & bit) === 0) {
                this.k[d] = C["REPEAT.FIRST_HELD"] + 1;
                move = true;
            }
            else {
                this.k[d] -= 1;
                if (this.k[d] === 1) {
                    this.k[d] = C["REPEAT.NEXT_HELD"] + 1;
                    move = true;
                }
            }
            if (move) {
                this.moveCursor(d);
                this.request(events, C["SOUND.MOVE"]);
            }
        }
        const mask = C["PAD.SELECT_MASK"];
        this.q = pad;
        if ((pad & mask & ~q) !== 0)
            this.select(events);
    }
    private moveCursor(d: Dir): void {
        const C = this.C;
        const cols = C["GRID.COLS"];
        const rows = C["GRID.ROWS"];
        const wrapCol = (c: number): number => c & (cols - 1);
        if (d === "LEFT") {
            if (this.row === this.buttonRow)
                this.col = C["ROW8.LEFT_REMAP"][this.col]!;
            this.col = wrapCol(this.col - 1);
        }
        else if (d === "RIGHT") {
            if (this.row === this.buttonRow)
                this.col = C["ROW8.RIGHT_REMAP"][this.col]!;
            this.col = wrapCol(this.col + 1);
        }
        else if (d === "UP") {
            this.row = this.row === 0 ? rows - 1 : this.row - 1;
        }
        else {
            this.row = this.row === rows - 1 ? 0 : this.row + 1;
        }
    }
    private select(events: EventSink): void {
        const C = this.C;
        const cell = this.assets.cells[this.row]![this.col]!;
        if ([...cell].length === 1) {
            if (this.n < C["BUFFER.LEN"]) {
                this.buf[this.n] = cell;
                this.n += 1;
                this.request(events, C["SOUND.EDIT"]);
                this.drawBuffer();
            }
            return;
        }
        const names = this.assets.buttons.split(" ");
        const which = names.indexOf(cell);
        if (which === 0) {
            if (this.n > 0) {
                this.n -= 1;
                this.buf[this.n] = this.blankChar();
                this.request(events, C["SOUND.EDIT"]);
                this.drawBuffer();
            }
        }
        else if (which === 1) {
            this.finish(events, this.storedPw, false, null);
        }
        else if (which === 2) {
            this.done(events);
        }
    }
    private done(events: EventSink): void {
        const C = this.C;
        if (this.n === 0) {
            this.finish(events, this.blankChar().repeat(C["BUFFER.LEN"]), false, null);
            return;
        }
        const record = this.n === C["BUFFER.LEN"] ? this.decoder(this.buf.join(""), this.amountsBefore) : null;
        if (record === null) {
            this.errorFrame = this.f;
            this.drawBuffer();
            return;
        }
        this.finish(events, this.buf.join(""), true, record);
    }
    private finish(events: EventSink, stored: string, accepted: boolean, record: PasswordRecord | null): void {
        events.emit({ type: "Flow.Exit", to: "options", password: stored } as unknown as GameEvent);
        this.exitResult = { stored, accepted, record };
    }
}

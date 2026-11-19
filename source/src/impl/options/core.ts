import type { EventSink } from "../../domain.js";
import type { ScreenSprite, ScreenState } from "../screen_types.js";
import { DISPLAY_BACKDROP, DISPLAY_HEIGHT, DISPLAY_WIDTH, PALETTE_ENTRIES, PATTERN_BYTES, SLOT_COUNT, VideoModel, } from "../boot/model.js";
import { padBit } from "../title/loop.js";
import type { PasswordResult, PasswordScreen } from "../password/types.js";
import type { OptionsAssets } from "./assets.js";
import type { OptionsConstants } from "./constants.js";
import { drawString } from "./text.js";
export type OptionsExitTo = "title" | "password";
export interface TitleHandOver {
    planeA: Uint16Array;
    planeB: Uint16Array;
    patterns: Uint8Array;
    pad: number;
}
export class SoundChannels {
    next = 0;
    readonly notes: number[];
    constructor(readonly C: OptionsConstants) {
        this.notes = C.SFX_CHANNELS.map(() => C.CHANNEL_NOTE_INITIAL);
    }
    reset(): void {
        this.next = 0;
        this.notes.fill(this.C.CHANNEL_NOTE_INITIAL);
    }
    effect(events: EventSink, id: number, note: number): void {
        const C = this.C;
        const i = this.next;
        const channel = C.SFX_CHANNELS[i]!;
        events.emit({ type: "Audio.ChannelCtl", opcode: C.CHANNEL_CTL_OPCODE as 0 | 1, on: C.CHANNEL_CTL_ON, channel, value: this.notes[i]! });
        events.emit({ type: "Audio.PlaySfx", channel, id, note });
        this.notes[i] = note;
        this.next = (i + 1) % C.SFX_CHANNELS.length;
    }
    beep(events: EventSink): void {
        this.effect(events, this.C.BEEP_SFX_ID, this.C.BEEP_NOTE);
    }
}
export class OptionsCore {
    readonly model: VideoModel;
    readonly sound: SoundChannels;
    private handOver: TitleHandOver | null = null;
    private k = 0;
    private itemValue: number;
    private upCounter = 0;
    private downCounter = 0;
    private leftCounter = 0;
    private rightCounter = 0;
    private prevPad = 0;
    private playersValue: number;
    private musicValue: number;
    private voiceValue: number;
    private soundTest_: number;
    private exitTo: OptionsExitTo | null = null;
    private name_: string;
    private password: PasswordScreen | null = null;
    private inPassword = false;
    private redrawLeft = 0;
    private lastPasswordResult: PasswordResult | null = null;
    private returnFrames = 0;
    private readonly upBit = padBit("up");
    private readonly downBit = padBit("down");
    private readonly leftBit: number;
    private readonly rightBit: number;
    private readonly confirmMask: number;
    private readonly exitBit: number;
    constructor(readonly assets: OptionsAssets, readonly C: OptionsConstants, sound?: SoundChannels) {
        this.model = new VideoModel(C.PLANE_W, C.PLANE_W);
        this.sound = sound ?? new SoundChannels(C);
        this.confirmMask = C.CONFIRM_BUTTONS.reduce((mask, name) => mask | padBit(name), 0);
        this.exitBit = padBit(C.EXIT_BUTTON);
        this.leftBit = padBit(C.TEST_DEC_BUTTON);
        this.rightBit = padBit(C.TEST_INC_BUTTON);
        if (C.DISPLAY[0] !== DISPLAY_WIDTH || C.DISPLAY[1] !== DISPLAY_HEIGHT || C.DISPLAY[2] !== DISPLAY_BACKDROP) {
            throw new Error(`OPTIONS.DISPLAY ${JSON.stringify(C.DISPLAY)} is not the video model's display`);
        }
        this.itemValue = C.ITEM_START;
        this.playersValue = C.PLAYERS_DEFAULT;
        this.musicValue = C.MUSIC_DEFAULT;
        this.voiceValue = C.VOICE_DEFAULT;
        this.soundTest_ = C.TEST_DEFAULT;
        this.name_ = C.NAME_DEFAULT;
    }
    attachPassword(screen: PasswordScreen | null, returnFrames: number): void {
        this.password = screen;
        this.returnFrames = returnFrames;
    }
    reset(): void {
        this.handOver = null;
        this.model.powerOn();
        this.k = 0;
        this.name_ = this.C.NAME_DEFAULT;
        this.inPassword = false;
        this.redrawLeft = 0;
        this.lastPasswordResult = null;
        this.itemValue = this.C.ITEM_START;
        this.upCounter = 0;
        this.downCounter = 0;
        this.leftCounter = 0;
        this.rightCounter = 0;
        this.prevPad = 0;
        this.playersValue = this.C.PLAYERS_DEFAULT;
        this.musicValue = this.C.MUSIC_DEFAULT;
        this.voiceValue = this.C.VOICE_DEFAULT;
        this.soundTest_ = this.C.TEST_DEFAULT;
        this.sound.reset();
        this.exitTo = null;
    }
    enter(handOver: TitleHandOver): void {
        const C = this.C;
        const cells = C.PLANE_W * C.PLANE_W;
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
        this.prevPad = handOver.pad;
        this.k = C.BLANK_OFFSET;
    }
    get tickIndex(): number {
        return this.k;
    }
    get item(): number {
        return this.itemValue;
    }
    get players(): number {
        return this.playersValue;
    }
    get music(): number {
        return this.musicValue;
    }
    get voice(): number {
        return this.voiceValue;
    }
    get soundTest(): number {
        return this.soundTest_;
    }
    get exit(): OptionsExitTo | null {
        return this.exitTo;
    }
    get name(): string {
        return this.name_;
    }
    setStoredPassword(name: string): void {
        this.name_ = name;
    }
    get showingPassword(): boolean {
        return this.inPassword;
    }
    get passwordScreen(): PasswordScreen | null {
        return this.password;
    }
    get passwordResult(): PasswordResult | null {
        return this.lastPasswordResult;
    }
    returnFromPassword(password: string, padAtX: number, returnFrames: number = this.returnFrames): void {
        const C = this.C;
        this.name_ = password;
        this.itemValue = C.ITEM_EXIT;
        this.inPassword = false;
        this.picture();
        this.prevPad = padAtX;
        this.redrawLeft = Math.max(0, returnFrames - 1);
        if (this.k < C.LOOP_OFFSET)
            this.k = C.LOOP_OFFSET;
    }
    get finished(): boolean {
        return this.exit !== null;
    }
    tick(pad: number, events: EventSink): ScreenState {
        if (this.exitTo !== null)
            return this.model.state();
        const C = this.C;
        const k = this.k;
        if (this.inPassword && this.password !== null) {
            this.password.tick(pad, events);
            const result = this.password.exit;
            if (result !== null) {
                this.lastPasswordResult = result;
                this.returnFromPassword(result.stored, pad);
            }
            this.k = k + 1;
            return this.model.state();
        }
        if (this.handOver === null && k < C.LOOP_OFFSET)
            throw new Error("OptionsCore.tick before enter()");
        if (k === C.BLANK_OFFSET)
            this.blankFrame(this.handOver!);
        else if (k === C.PICTURE_OFFSET)
            this.picture();
        else if (k >= C.LOOP_OFFSET) {
            if (this.redrawLeft > 0)
                this.redrawLeft -= 1;
            else
                this.step(pad, events);
        }
        else
            throw new Error(`OptionsCore.tick: no behaviour for tick E + ${k}`);
        this.k = k + 1;
        return this.model.state();
    }
    private blankFrame(h: TitleHandOver): void {
        const { model, C } = this;
        model.powerOn();
        model.displayEnabled = true;
        for (let i = 0; i < PALETTE_ENTRIES; i++)
            model.setColour(i, C.BLANK_CRAM);
        model.setSprites([{ x: C.OFFSCREEN_SPRITE[0]!, y: C.OFFSCREEN_SPRITE[1]!, w: C.OFFSCREEN_SPRITE[2]!, h: C.OFFSCREEN_SPRITE[3]!, attr: C.OFFSCREEN_SPRITE[4]! }]);
        model.patterns.set(h.patterns);
        model.resizePlanes(C.PLANE_W, C.PLANE_W);
        model.planeA.cells.set(h.planeA);
        model.planeB.cells.set(h.planeB);
    }
    private picture(): void {
        const { model, assets, C } = this;
        model.displayEnabled = true;
        model.clearPalette();
        model.setLine(0, assets.line0);
        model.setLine(3, assets.line3);
        model.resizePlanes(C.PLANE_W, C.PLANE_W);
        for (let r = 0; r < C.PLANE_W; r++) {
            for (let c = 0; c < C.PLANE_W; c++) {
                model.writeCellA(c, r, C.BLANK_CELL);
                model.writeCellB(c, r, C.BLANK_CELL);
            }
        }
        model.load(C.TEXT_SLOT, assets.font.tiles);
        model.load(C.CURSOR_SLOT, assets.cursor);
        for (let i = 0; i < C.ITEM_COUNT; i++)
            this.text(C.LABEL_ROWS[i]!, C.LABEL_COL, this.string(C.LABEL_STRINGS[i]!));
        drawString(model, assets.font, C, C.NAME_POS[0]!, C.NAME_POS[1]!, this.name_);
        this.drawPlayers();
        this.drawMusic();
        this.drawVoice();
        this.drawTestNumber();
        this.cursor();
    }
    private drawTestNumber(): void {
        const C = this.C;
        const digits = this.string(C.TEST_DIGITS);
        const radix = digits.length;
        this.text(C.TEST_POS[0]!, C.TEST_POS[1]!, digits[Math.floor(this.soundTest_ / radix)]! + digits[this.soundTest_ % radix]!);
    }
    private string(id: string): string {
        const s = this.assets.strings.get(id);
        if (s === undefined)
            throw new Error(`options screen: string ${id} is not in the assets`);
        return s;
    }
    private text(row: number, col: number, s: string): void {
        drawString(this.model, this.assets.font, this.C, row, col, s);
    }
    private drawPlayers(): void {
        const C = this.C;
        this.text(C.PLAYERS_POS[0]!, C.PLAYERS_POS[1]!, this.string(C.PLAYERS_STRINGS[this.playersValue]!));
    }
    private drawMusic(): void {
        const C = this.C;
        this.text(C.MUSIC_POS[0]!, C.MUSIC_POS[1]!, this.string(C.SWITCH_STRINGS[this.musicValue]!));
    }
    private drawVoice(): void {
        const C = this.C;
        this.text(C.VOICE_POS[0]!, C.VOICE_POS[1]!, this.string(C.SWITCH_STRINGS[this.voiceValue]!));
    }
    private cursor(): void {
        const C = this.C;
        const y = C.CURSOR_Y + C.CURSOR_STEP * this.itemValue + (this.itemValue === C.ITEM_EXIT ? C.CURSOR_EXIT_SKIP : 0);
        const sprite: ScreenSprite = { x: C.CURSOR_X, y, w: C.CURSOR_SIZE[0]!, h: C.CURSOR_SIZE[1]!, attr: C.CURSOR_FLAGS + C.CURSOR_SLOT };
        this.model.setSprites([sprite]);
    }
    private move(d: number, events: EventSink): void {
        const n = this.C.ITEM_COUNT;
        this.sound.beep(events);
        this.itemValue = (((this.itemValue + d) % n) + n) % n;
        this.cursor();
    }
    private titleMusic(events: EventSink): void {
        const C = this.C;
        events.emit({ type: "Audio.PlayMusic", opcode: C.MUSIC_1_OPCODE as 5 | 16, value: C.MUSIC_1_VALUE });
        events.emit({ type: "Audio.PlayMusic", opcode: C.MUSIC_2_OPCODE as 5 | 16, value: C.MUSIC_2_VALUE });
    }
    private finish(to: OptionsExitTo, events: EventSink): void {
        this.exitTo = to;
        events.emit({ type: "Flow.Exit", to });
    }
    private confirm(events: EventSink): void {
        const C = this.C;
        switch (this.itemValue) {
            case C.ITEM_PASSWORD:
                this.sound.beep(events);
                if (this.password !== null) {
                    this.password.enter(this.name_);
                    this.inPassword = true;
                }
                else {
                    this.finish(C.EXIT_PASSWORD as OptionsExitTo, events);
                }
                break;
            case C.ITEM_PLAYERS:
                this.sound.beep(events);
                this.playersValue = (this.playersValue + 1) % C.PLAYERS_STRINGS.length;
                this.drawPlayers();
                break;
            case C.ITEM_MUSIC: {
                this.sound.beep(events);
                if (this.musicValue !== 0)
                    events.emit({ type: "Audio.Stop" });
                else
                    this.titleMusic(events);
                this.musicValue = (this.musicValue + 1) % C.SWITCH_STRINGS.length;
                this.drawMusic();
                break;
            }
            case C.ITEM_VOICE:
                this.sound.beep(events);
                this.voiceValue = (this.voiceValue + 1) % C.SWITCH_STRINGS.length;
                this.drawVoice();
                break;
            case C.ITEM_TEST:
                this.soundTestConfirm(events);
                break;
            case C.ITEM_EXIT:
                this.leave(events);
                break;
        }
    }
    private soundTestConfirm(events: EventSink): void {
        const C = this.C;
        if (C.TEST_STOPS_FIRST)
            events.emit({ type: "Audio.Stop" });
        const row = this.assets.soundTable.rows[this.soundTest_];
        if (row === undefined)
            throw new Error(`Sound Test: the sound command table has no row ${this.soundTest_}`);
        if (row.mode === C.TEST_MODE_MUSIC) {
            events.emit({ type: "Audio.PlayMusic", opcode: C.TEST_MUSIC_VAR_OPCODE as 5 | 16, value: row.var });
            events.emit({ type: "Audio.PlayMusic", opcode: C.TEST_MUSIC_CMD_OPCODE as 5 | 16, value: row.cmd });
        }
        else if (row.mode === C.TEST_MODE_SFX) {
            this.sound.effect(events, row.cmd, row.var);
        }
        else if (C.TEST_MODES_VOICE.includes(row.mode)) {
            events.emit({ type: "Audio.PlayVoice", channel: C.TEST_VOICE_CHANNEL, id: row.cmd, param: row.var });
        }
        else {
            throw new Error(`Sound Test: row ${this.soundTest_} has mode ${row.mode}, which 4.9.3 does not define`);
        }
    }
    private stepNumber(d: number, events: EventSink): void {
        const C = this.C;
        this.sound.beep(events);
        let n = this.soundTest_ + d;
        if (n > C.TEST_MAX)
            n = C.TEST_MIN;
        else if (n < C.TEST_MIN)
            n = C.TEST_MAX;
        this.soundTest_ = n;
        this.drawTestNumber();
    }
    private repeatRule(p: number, bit: number, isFresh: boolean, counter: number): {
        counter: number;
        step: boolean;
    } {
        const C = this.C;
        if ((p & bit) === 0)
            return { counter: 0, step: false };
        if (isFresh)
            return { counter, step: true };
        if (counter <= 0)
            return { counter: C.REPEAT_FIRST, step: false };
        const next = counter - 1;
        if (next === 0)
            return { counter: C.REPEAT_NEXT, step: true };
        return { counter: next, step: false };
    }
    private leave(events: EventSink): void {
        events.emit({ type: "Audio.Stop" });
        if (this.musicValue !== 0)
            this.titleMusic(events);
        this.finish(this.C.EXIT_TITLE as OptionsExitTo, events);
    }
    private step(pad: number, events: EventSink): void {
        const C = this.C;
        const p = pad;
        const q = this.prevPad;
        this.prevPad = p;
        const fresh = (bit: number): boolean => (p & bit) !== 0 && (q & bit) === 0;
        if (p & this.upBit) {
            if (fresh(this.upBit)) {
                this.move(-1, events);
                return;
            }
            if (this.upCounter <= 0) {
                this.upCounter = C.REPEAT_FIRST;
            }
            else {
                this.upCounter -= 1;
                if (this.upCounter === 0) {
                    this.upCounter = C.REPEAT_NEXT;
                    this.move(-1, events);
                    return;
                }
            }
        }
        else {
            this.upCounter = 0;
        }
        if (p & this.downBit) {
            if (fresh(this.downBit)) {
                this.move(1, events);
                return;
            }
            if (this.downCounter <= 0) {
                this.downCounter = C.REPEAT_FIRST;
            }
            else {
                this.downCounter -= 1;
                if (this.downCounter === 0) {
                    this.downCounter = C.REPEAT_NEXT;
                    this.move(1, events);
                    return;
                }
            }
        }
        else {
            this.downCounter = 0;
        }
        if ((p & ~q & this.confirmMask) !== 0) {
            this.confirm(events);
            return;
        }
        if (this.itemValue === C.ITEM_TEST) {
            const left = this.repeatRule(p, this.leftBit, fresh(this.leftBit), this.leftCounter);
            this.leftCounter = left.counter;
            if (left.step) {
                this.stepNumber(-1, events);
                return;
            }
            const right = this.repeatRule(p, this.rightBit, fresh(this.rightBit), this.rightCounter);
            this.rightCounter = right.counter;
            if (right.step) {
                this.stepNumber(1, events);
                return;
            }
        }
        else {
            this.rightCounter = 0;
        }
        if (fresh(this.exitBit) && this.itemValue === C.ITEM_EXIT) {
            this.leave(events);
        }
    }
}

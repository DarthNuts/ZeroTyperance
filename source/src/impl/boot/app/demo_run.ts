import type { LevelStartInput } from "../../start/types.js";
import { levelStart } from "../../tick/level_start.js";
import { inSeat, tickIteration, tickIterationClose, tickIterationOpen, tickStart } from "../../tick/core.js";
import type { InterludeFrame, InterludeInputs, IterationInputs, IterationOpening, PauseClosing } from "../../tick/core.js";
import type { PauseScreen } from "../../pause/core.js";
import type { World } from "../../../world.js";
import type { SnapHiddenLine } from "../../tick/snap_types.js";
import type { SoundEvent } from "../../tick/sound.js";
import type { DisplayWrites, IterationResult, TickEnv, TickState } from "../../tick/core.js";
import { CONTROLLER_MODE } from "../../tick/constants.js";
import type { HudConstants } from "../../hud/constants.js";
import type { HudAssets } from "../../hud/assets.js";
import { hudIteration, hudLevelEntry, hudMessageClear, hudMessagePop, hudPicture, hudRedrawCards, hudRedrawCounter, hudRedrawHealth, hudTile } from "../../hud/core.js";
import type { FloorClasses, HudEntity, HudInputs, HudState } from "../../hud/core.js";
import { SPRITE_X_MASK, SPRITE_Y_MASK, TILE_SIZE } from "../../hud/words.js";
import type { HandConstants } from "../../hand/constants.js";
import { handIteration, handRecordStart, handStart } from "../../hand/core.js";
import { glowViewOf, type GlowView } from "../../hand/glow.js";
import type { HandAssets, HandInputs, HandSprite, HandState } from "../../hand/types.js";
import { skyLayer } from "../../rend/sky/core.js";
import { GRID_SIDE } from "../../soldier/common.js";
import { composeScreen } from "../../rend/app/screen_compose.js";
import type { ComposeSprite, ComposedScreen, ComposeView } from "../../rend/app/screen_compose.js";
import type { ViewRecord } from "../../rend/core.js";
import { vscrollOfFloor } from "../../rend/sky/core.js";
import { sniperBankTile } from "../../sniper/core.js";
import type { SniperSprite } from "../../sniper/core.js";
import { cityBuildingLayer, cityStrips, cityValues } from "../../rend/sky/city.js";
import type { CityBuildingLayer, CityStrip, CityValues } from "../../rend/sky/city.js";
import { composeVdp, SPRITE_INFO_PRESENT, SPRITE_INFO_PRIORITY, SPRITE_INFO_TILE_MASK } from "../../rend/app/vdp_compose.js";
import { SPRITE_GROUP, spriteGroupOf } from "../../rend/hd/framing.js";
import type { SpriteGroups } from "../../rend/hd/framing.js";
import type { VdpOverlay, VdpPlane, VdpSprite } from "../../rend/app/vdp_compose.js";
import { slotsWindowCells } from "../../modern/hud.js";
export const DEFAULT_VBLANKS = 5;
export const PAD_START = 0x80;
const CRAM_LINE = 16;
const CRAM_WORDS = 64;
const VIEW_LINE = 0;
const MASK_X_WORDS: readonly number[] = [1, 0];
const MASK_W = 1;
const MASK_H = 4;
const VDP_SPRITES_PER_LINE = 20;
const VDP_SPRITE_PIXELS_PER_LINE = 320;
const TILE_INDEX_MASK = 0x7ff;
const CITY_Z = 0;
const CITY_EPISODE = 1;
export function levelCram(viewCram: readonly number[] | null, hudLine: readonly number[], handLine: readonly number[] | null, flashWord: number | null, HC: HudConstants, HAND: HandConstants, collision: (what: string, entry: number) => void = () => undefined): number[] {
    const cram: number[] = new Array<number>(CRAM_WORDS).fill(0);
    if (viewCram !== null)
        for (let i = 0; i < CRAM_WORDS; i++)
            cram[i] = viewCram[i] ?? 0;
    const put = (line: number, words: readonly number[], what: string): void => {
        for (let i = 0; i < CRAM_LINE; i++) {
            const at = line * CRAM_LINE + i;
            const w = words[i] ?? 0;
            if (cram[at] !== 0 && cram[at] !== w)
                collision(what, at);
            cram[at] = w;
        }
    };
    put(HC.RECORD.PALETTE_LINE, hudLine, "the status display's line");
    if (handLine !== null)
        put(HAND.PALETTE_LINE, handLine, "the hand's line");
    if (flashWord !== null)
        cram[HC.FLASH.ENTRY] = flashWord & HC.RECORD.COLOUR_MASK;
    return cram;
}
export interface DemoRunDeps {
    readonly env: TickEnv;
    readonly HC: HudConstants;
    readonly hudAssets: HudAssets;
    readonly HAND: HandConstants;
    readonly handAssets: HandAssets;
}
export function demoLevelStartInput(episode: number, character: number, frame: number, seed: number): LevelStartInput {
    return {
        kind: "demo",
        episode,
        character,
        controller_mode: 1,
        seed: (seed >>> 0).toString(16).toUpperCase().padStart(8, "0"),
        frame: frame & 0xffff,
        setup_blanks: 0,
        carried: {
            phase: 0,
            bob_acc: 0,
            sky_tile_counter: 0,
            intro_camera: { angle: 65344, distance: 693 },
            hp: 100,
            team_alive: { ishii: true, ramos: true, wolf: true, haile: true, gjoerup: true },
            options: { sound: { music: true, sfx: true, pcm_voice: true, voice_announce: true, value: 15 } },
            tile_pass: { cursor: 0, g1: { counter: 0, offset: 0, phase: 0 }, g2: { counter: 0, offset: 0, phase: 0 }, g3: { counter: 0, offset: 0, phase: 0 } },
            sniper_gates: { gate_1: 0, gate_2: 0, gate_3: 0 },
            items: [],
        },
    };
}
export interface RecordStartInput {
    readonly world: World;
    readonly hidden: SnapHiddenLine;
    readonly prev: number;
    readonly earlierFloors?: ReadonlyMap<number, readonly number[]> | undefined;
}
export interface PausedOpening {
    readonly tick: Extract<IterationOpening, {
        kind: "paused";
    }>;
    readonly inputs: IterationInputs;
    readonly phaseBefore: number;
    readonly consoleByte: number;
}
function runFloor(st: TickState): FloorClasses {
    return {
        side: GRID_SIDE,
        classAt: (x: number, y: number): number => {
            if (x < 0 || y < 0 || x >= GRID_SIDE || y >= GRID_SIDE)
                throw new Error(`floor cell (${x}, ${y}) is outside the ${GRID_SIDE} x ${GRID_SIDE} grid`);
            const blocks = st.scannerBlocks ?? st.blocks;
            return st.env.classOfBlock[blocks[y * GRID_SIDE + x]!] ?? -1;
        },
    };
}
export class DemoRun {
    readonly state: TickState;
    readonly startEvents: readonly SoundEvent[];
    readonly startMusic: readonly SoundEvent[];
    readonly startCreation: readonly SoundEvent[];
    readonly deps: DemoRunDeps;
    k = 0;
    readonly notes: string[] = [];
    private hud: HudState;
    private hud1: HudState | null = null;
    private reveal1: number[] = [];
    private flashWord1: number | null = null;
    private shownSeat: [
        {
            hp: number;
            cards: number[];
        },
        {
            hp: number;
            cards: number[];
        }
    ] = [{ hp: -1, cards: [] }, { hp: -1, cards: [] }];
    private readonly floor: FloorClasses;
    private viewSeat: [
        {
            x: number;
            y: number;
        } | null,
        {
            x: number;
            y: number;
        } | null
    ] = [null, null];
    private bobSeat: [
        number,
        number
    ] = [0, 0];
    private readonly vblanks: readonly number[];
    private readonly guards: ReadonlyArray<ReadonlyArray<readonly [
        number,
        number
    ]> | null>;
    private prevByte: number;
    private reveal: number[];
    private flashWord: number | null = null;
    private handState: HandState = handStart();
    private handPrev: HandInputs | null;
    private handShown: {
        list: readonly HandSprite[];
        window: readonly Uint8Array[] | null;
    } = { list: [], window: null };
    private hand1: {
        state: HandState;
        prev: HandInputs | null;
        shown: {
            list: readonly HandSprite[];
            window: readonly Uint8Array[] | null;
        };
    } | null = null;
    private composed: ComposedScreen | null = null;
    private blankBoundary = false;
    private opened: PausedOpening | null = null;
    private shownPicture: [
        ViewRecord | null,
        ViewRecord | null
    ] = [null, null];
    private cityBuilt: [
        CityStrip[],
        CityStrip[]
    ] = [[], []];
    private cityShown: [
        CityStrip[],
        CityStrip[]
    ] = [[], []];
    private cityValBuilt: [
        CityValues | null,
        CityValues | null
    ] = [null, null];
    private cityValShown: [
        CityValues | null,
        CityValues | null
    ] = [null, null];
    private sniperBuilt: [
        SniperSprite[],
        SniperSprite[]
    ] = [[], []];
    private sniperShown: [
        SniperSprite[],
        SniperSprite[]
    ] = [[], []];
    private liveSeat(): 0 | 1 {
        return this.state.seats?.live === 1 ? 1 : 0;
    }
    private glowView(k: 0 | 1): GlowView {
        const pic = this.lastPictureOf(k);
        return glowViewOf(pic === null ? null : pic.view, pic === null ? null : pic.depth, this.deps.env.R);
    }
    private lastPictureOf(k: 0 | 1): ViewRecord | null {
        const seats = this.state.seats;
        if (seats === undefined || seats.live === k)
            return this.state.lastPicture;
        return seats.data.lastPicture;
    }
    constructor(deps: DemoRunDeps, input: LevelStartInput | {
        readonly record: RecordStartInput;
    }, vblanks: readonly number[], guards: ReadonlyArray<ReadonlyArray<readonly [
        number,
        number
    ]> | null> = [], previousPad = 0) {
        this.deps = deps;
        this.prevByte = previousPad;
        this.vblanks = vblanks;
        this.guards = guards;
        if ("record" in input) {
            const r = input.record;
            this.prevByte = r.prev;
            this.state = tickStart(deps.env, r.world, r.hidden, r.prev, [], null, r.earlierFloors);
            this.startEvents = [];
            this.startMusic = [];
            this.startCreation = [];
        }
        else {
            const ls = levelStart(deps.env, input, previousPad);
            this.state = ls.state;
            this.startEvents = [...ls.events];
            this.startMusic = [...ls.music];
            this.startCreation = [...ls.creation];
        }
        const st = this.state;
        this.floor = Object.freeze(runFloor(st));
        const inputs0 = this.inputsOf(st.world.core.phase);
        this.hud = hudLevelEntry(inputs0, this.floor, deps.hudAssets, deps.HC);
        this.reveal = inputs0.reveal.map(() => 0);
        this.shownSeat[0] = this.drawnOf(inputs0);
        this.seat1Entry();
        this.shownPicture[0] = st.lastPicture;
        this.handPrev = st.weapon === null ? null : this.handLine(0, 0, 0);
        if ("record" in input && this.handPrev !== null) {
            try {
                handRecordStart(this.handState, this.handPrev, deps.handAssets, deps.HAND, this.glowView(0));
            }
            catch (err) {
                this.note(`the hand: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        if (st.weapon === null)
            this.note("the hand: the record's weapon is outside the weapon spec's model (state.weapon is null): no hand is drawn");
    }
    rebuildAfterLoad(): void {
        Object.assign(this.floor, runFloor(this.state));
    }
    seat1Entry(): void {
        const st = this.state;
        if (st.seats === undefined) {
            this.hud1 = null;
            return;
        }
        const inputs1 = inSeat(st, 1, () => this.inputsOf(st.world.core.phase));
        this.hud1 = hudLevelEntry(inputs1, this.floor, this.deps.hudAssets, this.deps.HC);
        this.reveal1 = inputs1.reveal.map(() => 0);
        this.flashWord1 = null;
        this.shownSeat[1] = this.drawnOf(inputs1);
        this.shownPicture[1] = this.lastPictureOf(1);
        this.cityBuilt[1] = [];
        this.cityShown[1] = [];
        this.cityValBuilt[1] = null;
        this.cityValShown[1] = null;
        this.sniperBuilt[1] = [];
        this.sniperShown[1] = [];
        this.hand1 = { state: handStart(), prev: inSeat(st, 1, () => (st.weapon === null ? null : this.handLine(0, 0, 0))), shown: { list: [], window: null } };
    }
    private shownHandList(): {
        list: readonly HandSprite[];
        window: readonly Uint8Array[] | null;
    } {
        return this.state.seats?.live === 1 && this.hand1 !== null ? this.hand1.shown : this.handShown;
    }
    private drawnOf(inputs: HudInputs): {
        hp: number;
        cards: number[];
    } {
        return { hp: inputs.hp, cards: inputs.inventory.map((s) => s.item) };
    }
    seatDisplay(k: 0 | 1): {
        readonly hp: number;
        readonly cards: readonly number[];
    } {
        return this.shownSeat[k];
    }
    seatView(k: 0 | 1): {
        readonly hud: HudState;
        readonly view: {
            readonly x: number;
            readonly y: number;
        } | null;
        readonly bobAngle: number;
        readonly hand: readonly HandSprite[];
        readonly flash: number | null;
    } {
        const hud = k === 1 && this.hud1 !== null ? this.hud1 : this.hud;
        const hand = k === 1 && this.hand1 !== null ? this.hand1.shown.list : this.handShown.list;
        return { hud, view: this.viewSeat[k], bobAngle: this.bobSeat[k], hand, flash: k === 1 && this.hud1 !== null ? this.flashWord1 : this.flashWord };
    }
    private shownHud(): HudState {
        return this.state.seats?.live === 1 && this.hud1 !== null ? this.hud1 : this.hud;
    }
    private shownFlash(): number | null {
        return this.state.seats?.live === 1 && this.hud1 !== null ? this.flashWord1 : this.flashWord;
    }
    vblanksOf(k: number): number {
        return this.vblanks[k] ?? DEFAULT_VBLANKS;
    }
    private note(text: string): void {
        if (!this.notes.includes(text))
            this.notes.push(text);
    }
    planeBWords(): number[][] {
        return this.shownPlaneB(hudPicture(this.shownHud(), this.deps.hudAssets, this.deps.HC).b.cells).map((r) => [...r]);
    }
    hudPlaneBWords(): number[][] {
        return hudPicture(this.shownHud(), this.deps.hudAssets, this.deps.HC).b.cells.map((r) => [...r]);
    }
    private shownPlaneB(cells: readonly (readonly number[])[]): readonly (readonly number[])[] {
        if (this.state.modern?.selection !== "slots" || this.state.weapon === null)
            return cells;
        const ring0 = this.state.weapon.ring[0];
        return ring0 === undefined ? cells : slotsWindowCells(cells, ring0, this.deps.HC);
    }
    private inputsOf(phase: number, bobAngle: number = 0): HudInputs {
        const { world, env } = this.state;
        const n = this.deps.HC.CARD.X_WORDS.length;
        const slots: Array<{
            item: number;
            amount: number;
        }> = Array.from({ length: n }, () => ({ item: 0, amount: 0 }));
        for (const row of world.inventory)
            if (row.slot >= 0 && row.slot < n)
                slots[row.slot] = { item: row.item.value, amount: row.amount };
        const ring = this.state.weapon !== null ? this.state.weapon.ring : slots.map((_, i) => i);
        const units = env.M.ANGLE.UNITS;
        const angle = (((world.player.angle + bobAngle) % units) + units) % units;
        const entities: HudEntity[] = world.entities
            .filter((e) => e.floor === this.state.floorNumber)
            .map((e) => ({ flags: e.flags.value, floor: e.floor, x: e.pos.x, y: e.pos.y }));
        return {
            phase,
            floor: this.state.floorNumber,
            pos: { x: world.player.pos.x, y: world.player.pos.y },
            view: { x: env.view.sin256[angle] ?? 0, y: env.view.neg_cos256[angle] ?? 0 },
            hp: world.player.hp,
            character: world.player.character.value,
            inventory: slots,
            passive: { bio_scanner: world.player.passive.bio_scanner },
            enemies_remaining: world.floor.enemies_remaining,
            ring,
            ...(this.state.modern?.selection === "slots" ? { slots: true } : {}),
            reveal: ring.map(() => 0),
            entities,
        };
    }
    pictureShown(): ViewRecord | null {
        return this.shownPicture[this.liveSeat()];
    }
    private handLine(tick: number, bobAngle: number, bobEye: number): HandInputs {
        const w = this.state.weapon!;
        return { tick, current: w.current, pending: w.pending, lowering: w.lowering, anim: w.anim, variant: w.variant, bob_angle: bobAngle, bob_eye: bobEye };
    }
    step(consoleByte: number, over: {
        readonly prev?: number;
        readonly guards?: ReadonlyArray<readonly [
            number,
            number
        ]>;
        readonly interlude?: InterludeInputs;
    } = {}): IterationResult {
        const { state } = this;
        const phaseBefore = state.world.core.phase;
        const inputs = this.prepare(consoleByte, over);
        const res = tickIteration(state, { ...inputs, ...(over.interlude ? { interlude: over.interlude } : {}) });
        return this.finish(res, phaseBefore, consoleByte);
    }
    private prepare(consoleByte: number, over: {
        readonly prev?: number;
        readonly guards?: ReadonlyArray<readonly [
            number,
            number
        ]>;
    }): IterationInputs {
        const { deps, state } = this;
        const guards = over.guards ?? this.guards[this.k] ?? undefined;
        if (over.prev !== undefined)
            this.prevByte = over.prev;
        for (const s of [0, 1] as const) {
            if (s === 1 && state.seats === undefined)
                break;
            this.shownPicture[s] = this.lastPictureOf(s);
            this.cityShown[s] = this.cityBuilt[s];
            this.cityValShown[s] = this.cityValBuilt[s];
            this.sniperShown[s] = this.sniperBuilt[s];
        }
        const mask = state.hidden.controller.mode === CONTROLLER_MODE.PAD ? 0xff : PAD_START;
        return { pad: consoleByte & mask, flashFall: deps.HC.FLASH.FALL, prev: this.prevByte & mask, vblanks: this.vblanksOf(this.k), ...(guards ? { guards } : {}) };
    }
    stepOpen(consoleByte: number, over: {
        readonly prev?: number;
        readonly guards?: ReadonlyArray<readonly [
            number,
            number
        ]>;
        readonly floorEntries?: readonly string[];
        readonly carriedEntry?: string;
    } = {}): {
        readonly kind: "done";
        readonly result: IterationResult;
    } | {
        readonly kind: "paused";
        readonly screen: PauseScreen;
        readonly opening: PausedOpening;
    } {
        const { state } = this;
        const phaseBefore = state.world.core.phase;
        const inputs = this.prepare(consoleByte, over);
        const op = tickIterationOpen(state, inputs, over.floorEntries ?? [], over.carriedEntry ?? "", this.cram());
        if (op.kind === "done")
            return { kind: "done", result: this.finish(op.result, phaseBefore, consoleByte) };
        const opening: PausedOpening = { tick: op, inputs, phaseBefore, consoleByte };
        this.opened = opening;
        return { kind: "paused", screen: op.screen, opening };
    }
    stepClose(closing: PauseClosing, frames: readonly InterludeFrame[]): IterationResult {
        const o = this.opened;
        if (o === null)
            throw new Error("stepClose without a paused stepOpen");
        this.opened = null;
        const res = tickIterationClose(this.state, o.inputs, o.tick, closing, frames);
        return this.finish(res, o.phaseBefore, o.consoleByte);
    }
    restartDisplay(flashEntry: number | null = null): void {
        const { deps, state } = this;
        const inputs0 = this.inputsOf(state.world.core.phase);
        this.hud = hudLevelEntry(inputs0, this.floor, deps.hudAssets, deps.HC);
        this.reveal = inputs0.reveal.map(() => 0);
        this.shownSeat[0] = this.drawnOf(inputs0);
        this.shownPicture[0] = state.lastPicture;
        this.cityBuilt[0] = [];
        this.cityShown[0] = [];
        this.cityValBuilt[0] = null;
        this.cityValShown[0] = null;
        this.sniperBuilt[0] = [];
        this.sniperShown[0] = [];
        this.handState = handStart();
        this.handShown = { list: [], window: null };
        this.handPrev = state.weapon === null ? null : this.handLine(0, 0, 0);
        this.flashWord = flashEntry;
        this.composed = null;
        this.blankBoundary = false;
    }
    private finish(res: IterationResult, phaseBefore: number, consoleByte: number): IterationResult {
        const { deps, state } = this;
        this.prevByte = consoleByte;
        this.blankBoundary = res.interlude !== null && res.interlude.kind === "pause";
        const k = this.k;
        this.k++;
        if (res.interlude !== null && res.interlude.kind === "select" && res.interlude.closed) {
            this.restartDisplay(res.display.flashEntry);
            return res;
        }
        this.handShown = { list: this.handState.list, window: this.handState.window };
        this.cityBuilt[0] = this.cityOf(res.bob ?? null);
        this.cityValBuilt[0] = this.cityValuesOf(res.bob ?? null);
        this.sniperBuilt[0] = [...state.sniperSprites];
        const inputs = this.inputsOf(phaseBefore, res.bob === null || res.bob === undefined ? 0 : res.bob.angle);
        this.reveal = this.displayStep(this.hud, res.display, inputs, this.reveal, 0);
        this.viewSeat[0] = inputs.view;
        this.bobSeat[0] = res.bob === null || res.bob === undefined ? 0 : res.bob.angle;
        this.flashWord = res.display.flashEntry;
        const seats = state.seats;
        const glow0 = this.glowView(0);
        if (seats !== undefined && this.hud1 !== null && !seats.out[1]) {
            const glow1 = this.glowView(1);
            const hud1 = this.hud1;
            const bob1 = res.bob1 ?? null;
            inSeat(state, 1, () => {
                const inputs1 = this.inputsOf(phaseBefore, bob1 === null ? 0 : bob1.angle);
                this.reveal1 = this.displayStep(hud1, state.display, inputs1, this.reveal1, 1);
                this.viewSeat[1] = inputs1.view;
                this.bobSeat[1] = bob1 === null ? 0 : bob1.angle;
                this.flashWord1 = state.display.flashEntry;
                this.cityBuilt[1] = this.cityOf(bob1);
                this.cityValBuilt[1] = this.cityValuesOf(bob1);
                this.sniperBuilt[1] = [...state.sniperSprites];
                const h1 = this.hand1;
                if (h1 !== null) {
                    h1.shown = { list: h1.state.list, window: h1.state.window };
                    if (state.weapon !== null && h1.prev !== null) {
                        const line = this.handLine(k + 1, bob1 === null ? 0 : bob1.angle, bob1 === null ? 0 : bob1.eye);
                        try {
                            handIteration(h1.state, line, h1.prev, deps.handAssets, deps.HAND, glow1);
                        }
                        catch (err) {
                            h1.state.list = [];
                            this.note(`seat 1's hand: ${err instanceof Error ? err.message : String(err)}`);
                        }
                        h1.prev = line;
                    }
                }
            });
        }
        if (state.weapon !== null && this.handPrev !== null) {
            const bob = res.bob ?? null;
            const line = this.handLine(k + 1, bob === null ? 0 : bob.angle, bob === null ? 0 : bob.eye);
            try {
                handIteration(this.handState, line, this.handPrev, deps.handAssets, deps.HAND, glow0);
            }
            catch (err) {
                this.handState.list = [];
                this.note(`the hand: ${err instanceof Error ? err.message : String(err)}`);
            }
            this.handPrev = line;
        }
        this.composed = null;
        return res;
    }
    private cityValuesOf(bob: {
        readonly angle: number;
    } | null): CityValues | null {
        const { deps, state } = this;
        if (state.world.level.episode.value !== CITY_EPISODE || deps.env.sky === null)
            return null;
        const units = deps.env.M.ANGLE.UNITS;
        const angle = (((state.world.player.angle + (bob === null ? 0 : bob.angle)) % units) + units) % units;
        return cityValues(angle, state.world.player.pos.y, state.floorNumber, CITY_Z, deps.env.sky.C);
    }
    cityValuesShown(): CityValues | null {
        return this.cityValShown[this.liveSeat()];
    }
    cityBuildingFar(far: {
        readonly cols: number;
        readonly rows: number;
        readonly indices: Uint8Array;
    }, viewX0: number, viewY0: number): CityBuildingLayer | null {
        const v = this.cityValuesShown();
        const sky = this.deps.env.sky;
        if (v === null || sky === null)
            return null;
        return cityBuildingLayer(v, far, viewX0, viewY0, (i) => this.cityBankTile(i), sky.C);
    }
    cityBankTile(i: number): Uint8Array | undefined {
        const { env } = this.deps;
        const bank = env.sky?.assets.cityBankTiles ?? null;
        if (bank === null || env.sky === null)
            return undefined;
        const t = i - (env.sky.C["CITY.TILE_BASE"] & TILE_INDEX_MASK);
        const n = TILE_SIZE * TILE_SIZE / 2;
        return t < 0 || (t + 1) * n > bank.length ? undefined : bank.subarray(t * n, (t + 1) * n);
    }
    private cityOf(bob: {
        readonly angle: number;
    } | null): CityStrip[] {
        const { deps, state } = this;
        if (state.world.level.episode.value !== CITY_EPISODE || deps.env.sky === null)
            return [];
        const units = deps.env.M.ANGLE.UNITS;
        const angle = (((state.world.player.angle + (bob === null ? 0 : bob.angle)) % units) + units) % units;
        return cityStrips(angle, state.world.player.pos.y, state.floorNumber, CITY_Z, deps.env.sky.C);
    }
    private displayStep(hud: HudState, dsp: DisplayWrites, inputs: HudInputs, reveal: number[], k: 0 | 1): number[] {
        const { deps } = this;
        const HC = deps.HC;
        if (dsp.message !== null) {
            if (dsp.message.kind === "pop")
                hudMessagePop(hud, dsp.message.rows, HC);
            else
                hudMessageClear(hud, HC);
        }
        if (dsp.recount)
            hudRedrawCounter(hud, inputs, deps.hudAssets, HC);
        if (dsp.cardsChanged.length > 0) {
            hudRedrawCards(hud, inputs, deps.hudAssets, HC);
            this.shownSeat[k] = { ...this.shownSeat[k], cards: this.drawnOf(inputs).cards };
        }
        if (dsp.hpRedraw) {
            hudRedrawHealth(hud, inputs, deps.hudAssets, HC);
            this.shownSeat[k] = { ...this.shownSeat[k], hp: inputs.hp };
        }
        const next = [...reveal];
        for (const slot of dsp.revealAdds)
            next[slot] = HC.CARD.REVEAL_START;
        hudIteration(hud, { ...inputs, reveal: [...next] }, null, this.floor, deps.hudAssets, HC);
        return next.map((v) => (v !== 0 ? Math.max(0, v - HC.CARD.REVEAL_FALL) : 0));
    }
    spriteList(): ComposeSprite[] {
        const { HC, HAND } = this.deps;
        const hudTiles = (i: number): Uint8Array | undefined => hudTile(this.shownHud(), i);
        const out: ComposeSprite[] = [];
        for (const s of hudPicture(this.shownHud(), this.deps.hudAssets, HC).sprites) {
            out.push({ x: s.x, y: s.y, w: s.w, h: s.h, attr: s.attr, xWord: s.x + HC.SPRITE_ORIGIN, tile: hudTiles });
        }
        for (const yWord of HC.MASK.Y_WORDS) {
            for (const xWord of MASK_X_WORDS) {
                out.push({ x: xWord - HC.SPRITE_ORIGIN, y: yWord - HC.SPRITE_ORIGIN, w: MASK_W, h: MASK_H, attr: HC.MASK.ATTR, xWord, tile: hudTiles });
            }
        }
        const shownHand = this.shownHandList();
        const win = shownHand.window;
        const handTiles = (i: number): Uint8Array | undefined => (i >= HAND.FIRST_TILE && i < HAND.FIRST_TILE + HAND.WINDOW_TILES ? (win === null ? undefined : win[i - HAND.FIRST_TILE]) : hudTiles(i));
        for (const s of shownHand.list) {
            const xWord = s.xWord & HAND.SPRITE_X_MASK;
            out.push({ x: xWord - HAND.SPRITE_ORIGIN, y: (s.yWord & HAND.SPRITE_Y_MASK) - HAND.SPRITE_ORIGIN, w: s.w, h: s.h, attr: s.attr, xWord, tile: handTiles });
        }
        return out;
    }
    cram(): number[] {
        const { HC, HAND, handAssets } = this.deps;
        const pic = this.state.lastPicture;
        return levelCram(pic !== null ? pic.cram : null, hudPicture(this.shownHud(), this.deps.hudAssets, HC).cram.slice(HC.RECORD.PALETTE_LINE * CRAM_LINE), this.state.world.player.passive.night_vision !== this.state.env.LIGHT.ABSENT ? null : handAssets.cramWords.map((w) => w & HAND.COLOUR_MASK), this.shownFlash(), HC, HAND, (what, at) => this.note(`palette collision: ${what} overwrites a non-zero word of the view's colour ram at entry ${at}`));
    }
    screen(): ComposedScreen {
        const { env, HC } = this.deps;
        const st = this.state;
        const pic = st.lastPicture;
        const R = env.R;
        let view: ComposeView | null = null;
        if (pic !== null && pic.view !== null) {
            view = {
                x0: HC.RECORD.VIEW_RECT_COL_FIRST * TILE_SIZE,
                y0: HC.RECORD.VIEW_RECT_ROW_FIRST * TILE_SIZE,
                columns: R.COLUMNS,
                rows: R.VIEW_ROWS,
                bytes: pic.view,
                columnGroup: R.COLUMN_GROUP,
                tileColumnBytes: R.TILE_COLUMN_BYTES,
                rowStride: R.ROW_STRIDE,
                viewLine: VIEW_LINE,
                sky: st.sky !== null && env.sky !== null ? skyLayer(st.sky, st.floorNumber, env.sky.assets, env.sky.C) : null,
            };
        }
        const hudPic = hudPicture(this.shownHud(), this.deps.hudAssets, HC);
        this.composed = composeScreen({
            width: HC.RECORD.DISPLAY_W,
            height: HC.RECORD.DISPLAY_H,
            cram: this.cram(),
            planeB: { cells: this.shownPlaneB(hudPic.b.cells) as number[][], tile: (i) => hudTile(this.shownHud(), i) },
            view,
            sprites: this.spriteList(),
        }, this.composed ?? undefined);
        return this.composed;
    }
    liveScreen(): ComposedScreen {
        const v = this.vdpScreen();
        return { width: this.deps.HC.RECORD.DISPLAY_W, height: this.deps.HC.RECORD.DISPLAY_H, indices: v.indices, cram: v.cram };
    }
    vdpSpriteWords(): Array<{
        index: number;
        x: number;
        y: number;
        w: number;
        h: number;
        attr: number;
    }> {
        return this.vdpSprites().map((s, index) => ({ index, x: (s.xWord & SPRITE_X_MASK) - this.deps.HC.SPRITE_ORIGIN, y: (s.yWord & SPRITE_Y_MASK) - this.deps.HC.SPRITE_ORIGIN, w: s.wCells, h: s.hCells, attr: s.attr }));
    }
    private viewOverlay(opaque: number | null): VdpOverlay | null {
        const { env, HC } = this.deps;
        const pic = this.shownPicture[this.liveSeat()];
        if (pic === null || pic.view === null)
            return null;
        const R = env.R;
        const width = R.COLUMNS * 2;
        const indices = new Uint8Array(width * R.VIEW_ROWS);
        for (let c = 0; c < R.COLUMNS; c++) {
            const vbase = Math.floor(c / R.COLUMN_GROUP) * R.TILE_COLUMN_BYTES + (c % R.COLUMN_GROUP);
            for (let r = 0; r < R.VIEW_ROWS; r++) {
                const b = pic.view[vbase + r * R.ROW_STRIDE] ?? 0;
                const hi = (b >> 4) & 15;
                const lo = b & 15;
                indices[r * width + c * 2] = hi === 0 ? 0 : opaque ?? VIEW_LINE * CRAM_LINE + hi;
                indices[r * width + c * 2 + 1] = lo === 0 ? 0 : opaque ?? VIEW_LINE * CRAM_LINE + lo;
            }
        }
        return { x0: HC.RECORD.VIEW_RECT_COL_FIRST * TILE_SIZE, y0: HC.RECORD.VIEW_RECT_ROW_FIRST * TILE_SIZE, width, height: R.VIEW_ROWS, indices };
    }
    screenSkyScroll(): number | null {
        const sky = this.state.sky;
        if (sky === null || this.deps.env.sky === null)
            return null;
        return sky.pending.hscroll ?? sky.hscroll;
    }
    vdpScreen(): {
        indices: Uint8Array;
        cram: number[];
    } {
        const { env, HC, HAND } = this.deps;
        const st = this.state;
        const W = HC.RECORD.DISPLAY_W;
        const H = HC.RECORD.DISPLAY_H;
        let planeA: VdpPlane | null = null;
        const sky = st.sky;
        if (sky !== null && env.sky !== null) {
            const SC = env.sky.C;
            const assets = env.sky.assets;
            const words = new Uint16Array(SC.PLANE_COLUMNS * SC.PLANE_ROWS).fill(SC.BLANK_WORD);
            words.set(sky.plane, 0);
            for (const col of sky.pending.columns)
                for (let r = 0; r < SC.PANORAMA_ROWS; r++)
                    words[r * SC.PLANE_COLUMNS + col.planeColumn] = col.words[r]!;
            const tileBytes = TILE_SIZE * TILE_SIZE / 2;
            const tiles = sky.tiles;
            const blankTile = SC.BLANK_WORD & TILE_INDEX_MASK;
            planeA = {
                cols: SC.PLANE_COLUMNS,
                rows: SC.PLANE_ROWS,
                words,
                hscroll: sky.pending.hscroll ?? sky.hscroll,
                vscroll: vscrollOfFloor(st.floorNumber, SC),
                tile: (i) => {
                    if (i === blankTile)
                        return undefined;
                    const t = i - assets.tileBase;
                    return t < 0 || t >= assets.tileCount ? undefined : tiles.subarray(t * tileBytes, (t + 1) * tileBytes);
                },
            };
        }
        const hudPic = hudPicture(this.shownHud(), this.deps.hudAssets, HC);
        const bCells = this.shownPlaneB(hudPic.b.cells);
        const cols = bCells[0]?.length ?? 0;
        const rows = bCells.length;
        const bWords = new Uint16Array(cols * rows);
        for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++)
                bWords[r * cols + c] = bCells[r]![c] ?? 0;
        const planeB: VdpPlane = { cols, rows, words: bWords, hscroll: 0, vscroll: 0, tile: (i) => hudTile(this.shownHud(), i) };
        const overlayB = this.viewOverlay(null);
        const sprites = this.vdpSprites();
        if (this.blankBoundary)
            return { indices: new Uint8Array(W * H), cram: this.cram() };
        const indices = composeVdp({ width: W, height: H, planeA, planeB, overlayB, sprites, maxSpritesPerLine: VDP_SPRITES_PER_LINE, maxSpritePixelsPerLine: VDP_SPRITE_PIXELS_PER_LINE });
        return { indices, cram: this.cram() };
    }
    vdpSpriteGroups(glowTiles: readonly [
        number,
        number
    ], opts: {
        readonly noStrips?: boolean;
        readonly sniperTiles?: readonly [
            number,
            number
        ];
    } = {}): SpriteGroups {
        const W = this.deps.HC.RECORD.DISPLAY_W;
        const H = this.deps.HC.RECORD.DISPLAY_H;
        const group = new Uint8Array(W * H);
        if (this.blankBoundary)
            return { width: W, height: H, indices: new Uint8Array(W * H), group };
        const spriteInfo = new Uint16Array(W * H);
        const indices = composeVdp({ width: W, height: H, planeA: null, planeB: null, overlayB: null, sprites: this.vdpSprites(), maxSpritesPerLine: VDP_SPRITES_PER_LINE, maxSpritePixelsPerLine: VDP_SPRITE_PIXELS_PER_LINE, spriteInfo });
        for (let i = 0; i < spriteInfo.length; i++) {
            const v = spriteInfo[i]!;
            if ((v & SPRITE_INFO_PRESENT) !== 0)
                group[i] = spriteGroupOf(v & SPRITE_INFO_TILE_MASK, (v & SPRITE_INFO_PRIORITY) !== 0, glowTiles, opts.sniperTiles);
        }
        const farWhole = composeVdp({ width: W, height: H, planeA: null, planeB: null, overlayB: null, sprites: this.vdpSprites(opts.noStrips === true), maxSpritesPerLine: VDP_SPRITES_PER_LINE, maxSpritePixelsPerLine: VDP_SPRITE_PIXELS_PER_LINE, skipSpritePixel: (prio, tile) => spriteGroupOf(tile, prio, glowTiles) !== SPRITE_GROUP.FAR });
        return { width: W, height: H, indices, group, farWhole };
    }
    private vdpSprites(noStrips = false): VdpSprite[] {
        const { env, HC, HAND } = this.deps;
        const hudTiles = (i: number): Uint8Array | undefined => hudTile(this.shownHud(), i);
        const sprites: VdpSprite[] = [];
        for (const s of this.shownHud().displayedSprites)
            sprites.push({ xWord: s.xWord, yWord: s.yWord, wCells: s.w, hCells: s.h, attr: s.attr, tile: hudTiles });
        for (const yWord of HC.MASK.Y_WORDS)
            for (const xWord of MASK_X_WORDS)
                sprites.push({ xWord, yWord, wCells: MASK_W, hCells: MASK_H, attr: HC.MASK.ATTR, tile: hudTiles });
        const shownHand = this.shownHandList();
        const win = shownHand.window;
        const handTiles = (i: number): Uint8Array | undefined => (i >= HAND.FIRST_TILE && i < HAND.FIRST_TILE + HAND.WINDOW_TILES ? (win === null ? undefined : win[i - HAND.FIRST_TILE]) : hudTiles(i));
        for (const s of shownHand.list)
            sprites.push({ xWord: s.xWord, yWord: s.yWord, wCells: s.w, hCells: s.h, attr: s.attr, tile: handTiles });
        const sniperBank = this.deps.hudAssets.sniperBankTiles;
        const sniperTiles = (i: number): Uint8Array | undefined => {
            const t = sniperBankTile(i, env.sniper);
            const n = TILE_SIZE * TILE_SIZE / 2;
            return t < 0 || (t + 1) * n > sniperBank.length ? undefined : sniperBank.subarray(t * n, (t + 1) * n);
        };
        for (const s of this.sniperShown[this.liveSeat()])
            sprites.push({ xWord: s.xWord, yWord: s.yWord, wCells: s.wCells, hCells: s.hCells, attr: s.tileWord, tile: sniperTiles });
        const bank = env.sky?.assets.cityBankTiles ?? null;
        const bankBase = env.sky === null ? 0 : env.sky.C["CITY.TILE_BASE"] & TILE_INDEX_MASK;
        const bankTiles = (i: number): Uint8Array | undefined => {
            if (bank === null)
                return undefined;
            const t = i - bankBase;
            const n = TILE_SIZE * TILE_SIZE / 2;
            return t < 0 || (t + 1) * n > bank.length ? undefined : bank.subarray(t * n, (t + 1) * n);
        };
        if (!noStrips)
            for (const s of this.cityShown[this.liveSeat()])
                sprites.push({ xWord: s.xWord, yWord: s.yWord, wCells: s.wCells, hCells: s.hCells, attr: s.tileWord, tile: bankTiles });
        return sprites;
    }
}

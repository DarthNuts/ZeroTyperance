import type { HudConstants } from "./constants.js";
import type { HudAssets } from "./assets.js";
import { CELL_CORNER_MASK, CELL_SHIFT, LOW_BYTE_MASK, SPRITE_X_MASK, SPRITE_Y_MASK, TILE_BYTES, TILE_MASK, TILE_ROW_BYTES, asr, cellOf, readLong, rotr32, s16, splitDigits, u16, writeLong, writeWord, } from "./words.js";
export interface HudEntity {
    readonly flags: number;
    readonly floor: number;
    readonly x: number;
    readonly y: number;
}
export interface HudInventorySlot {
    readonly item: number;
    readonly amount: number;
}
export interface HudInputs {
    readonly phase: number;
    readonly floor: number;
    readonly pos: {
        readonly x: number;
        readonly y: number;
    };
    readonly view: {
        readonly x: number;
        readonly y: number;
    };
    readonly hp: number;
    readonly character: number;
    readonly inventory: readonly HudInventorySlot[];
    readonly passive: {
        readonly bio_scanner: number;
    };
    readonly enemies_remaining: number;
    readonly ring: readonly number[];
    readonly slots?: boolean;
    readonly reveal: readonly number[];
    readonly entities: readonly HudEntity[];
}
export interface FloorClasses {
    readonly side: number;
    classAt(x: number, y: number): number;
}
export interface HudPlaneView {
    ox: number;
    oy: number;
    fx: number;
    fy: number;
    cells: number[][];
}
export interface HudRecordSprite {
    x: number;
    y: number;
    w: number;
    h: number;
    attr: number;
}
export interface HudPicture {
    display: {
        enabled: boolean;
        width: number;
        height: number;
        backdrop: number;
    };
    cram: number[];
    a: HudPlaneView;
    b: HudPlaneView;
    sprites: HudRecordSprite[];
}
export interface HudSprite {
    readonly xWord: number;
    readonly yWord: number;
    readonly w: number;
    readonly h: number;
    readonly attr: number;
}
type CellWrite = readonly [
    row: number,
    col: number,
    word: number
];
export interface HudState {
    readonly cells: number[][];
    readonly tiles: Map<number, Uint8Array>;
    cameraCell: {
        x: number;
        y: number;
    };
    readonly removedMarkers: Set<number>;
    chainSeen: number;
    readonly pendingGrid: CellWrite[][];
    readonly pendingSprites: HudSprite[][];
    displayedSprites: HudSprite[];
    readonly character: number;
}
function tileSlice(bank: Uint8Array, i: number): Uint8Array {
    const o = i * TILE_BYTES;
    if (o + TILE_BYTES > bank.length)
        throw new Error(`tile ${i} is past the end of a ${bank.length / TILE_BYTES}-tile bank`);
    return bank.slice(o, o + TILE_BYTES);
}
function writeBank(state: HudState, first: number, bank: Uint8Array, count: number = bank.length / TILE_BYTES): void {
    for (let i = 0; i < count; i++)
        state.tiles.set(first + i, tileSlice(bank, i));
}
export function clampAxis(v: number, C: HudConstants): number {
    const w = u16(v);
    if (w < C.SCAN.CLAMP_MIN)
        return C.SCAN.CLAMP_MIN + (w & LOW_BYTE_MASK);
    if (w >= C.SCAN.CLAMP_MAX)
        return C.SCAN.CLAMP_MAX + (w & LOW_BYTE_MASK);
    return w;
}
function windowOrigin(cx: number, cy: number, C: HudConstants): {
    wx: number;
    wy: number;
} {
    return { wx: cellOf(cx) - C.SCAN.WINDOW_BEFORE, wy: cellOf(cy) - C.SCAN.WINDOW_BEFORE };
}
function markerKey(x: number, y: number, floor: FloorClasses): number {
    return y * floor.side + x;
}
function isMarkerClass(cls: number, C: HudConstants): boolean {
    return C.SCAN.MARKER_CLASSES.some(([lo, hi]) => cls >= lo && cls <= hi);
}
export function blinkWord(phase: number, C: HudConstants): number {
    const w = C.SCAN.BLINK_WORDS[phase & C.SCAN.BLINK_MASK];
    if (w === undefined)
        throw new Error(`no blink word for phase bits ${phase & C.SCAN.BLINK_MASK}`);
    return w;
}
function noteChain(state: HudState, chain: readonly HudEntity[], floor: FloorClasses): void {
    for (let i = state.chainSeen; i < chain.length; i++) {
        const e = chain[i]!;
        state.removedMarkers.add(markerKey(cellOf(u16(e.x)), cellOf(u16(e.y)), floor));
    }
    if (chain.length > state.chainSeen)
        state.chainSeen = chain.length;
}
function drawFrame(state: HudState, assets: HudAssets, C: HudConstants): void {
    if (assets.frameNameTable.length !== C.FRAME.ROWS || assets.frameNameTable.some((r) => r.length !== C.FRAME.COLS)) {
        throw new Error(`the frame's name table is not ${C.FRAME.COLS} x ${C.FRAME.ROWS}`);
    }
    for (let r = 0; r < C.FRAME.ROWS; r++)
        for (let c = 0; c < C.FRAME.COLS; c++)
            state.cells[r]![c] = assets.frameNameTable[r]![c]!;
    writeBank(state, C.FRAME.ART_TILE, assets.frameTiles);
}
function drawIdCard(state: HudState, assets: HudAssets, C: HudConstants): void {
    const card = assets.idCards.find((k) => k.character === state.character);
    if (!card)
        throw new Error(`no ID card art of character ${state.character}`);
    if (card.nameTable.length !== C.IDCARD.ROWS || card.nameTable.some((r) => r.length !== C.IDCARD.COLS)) {
        throw new Error(`the ID card's name table is not ${C.IDCARD.COLS} x ${C.IDCARD.ROWS}`);
    }
    for (let r = 0; r < C.IDCARD.ROWS; r++)
        for (let c = 0; c < C.IDCARD.COLS; c++)
            state.cells[C.IDCARD.ROW + r]![C.IDCARD.COL + c] = card.nameTable[r]![c]!;
    writeBank(state, C.IDCARD.ART_TILE, card.tiles);
}
function drawFontAndCounter(state: HudState, inputs: HudInputs, assets: HudAssets, C: HudConstants): void {
    state.tiles.set(assets.solidTile, new Uint8Array(TILE_BYTES).fill((1 << TILE_ROW_BYTES * 2) - 1));
    writeBank(state, assets.fontFirstTile, assets.fontTiles);
    hudRedrawCounter(state, inputs, assets, C);
}
export function hudRedrawCounter(state: HudState, inputs: HudInputs, _assets: HudAssets, C: HudConstants): void {
    const { tens, ones } = splitDigits(inputs.enemies_remaining, C.COUNTER.RADIX);
    state.cells[C.COUNTER.ROW]![C.COUNTER.COL] = C.COUNTER.DIGIT_WORD_BASE + tens;
    state.cells[C.COUNTER.ROW]![C.COUNTER.COL + 1] = C.COUNTER.DIGIT_WORD_BASE + ones;
}
function messageWord(ch: string, C: HudConstants): number {
    if (ch >= "A" && ch <= "Z")
        return C.MSG.LETTER_WORD_BASE + (ch.charCodeAt(0) - 65);
    if (ch >= "0" && ch <= "9")
        return C.COUNTER.DIGIT_WORD_BASE + (ch.charCodeAt(0) - 48);
    return C.MSG.PUNCT_WORDS[ch] ?? C.MSG.BLANK_WORD;
}
export function hudMessagePop(state: HudState, rows: readonly string[], C: HudConstants): void {
    for (let r = 0; r < C.MSG.ROWS; r++) {
        const text = rows[r] ?? "";
        for (let c = 0; c < C.MSG.COLS; c++) {
            state.cells[C.MSG.ROW + r]![C.MSG.COL + c] = c < text.length ? messageWord(text[c]!, C) : C.MSG.BLANK_WORD;
        }
    }
}
export function hudMessageClear(state: HudState, C: HudConstants): void {
    hudMessagePop(state, [], C);
}
function drawHealthPair(state: HudState, inputs: HudInputs, assets: HudAssets, C: HudConstants): void {
    const hp = Math.max(0, Math.min(C.HEALTH.CAP, inputs.hp));
    const pct = Math.floor(Math.max(hp * C.HEALTH.SCALE - 1, 0) / C.HEALTH.DIVISOR);
    const { tens, ones } = splitDigits(pct, C.COUNTER.RADIX);
    const band = C.HEALTH.BAND_ABOVE.findIndex((t) => pct > t);
    const colour = C.HEALTH.BAND_COLOUR_LONG[band < 0 ? C.HEALTH.BAND_ABOVE.length : band];
    if (colour === undefined)
        throw new Error("HUD.HEALTH.BAND_COLOUR_LONG has no entry for the band");
    const odd = rotr32(colour, C.HEALTH.ROTATE_BITS);
    [tens, ones].forEach((digit, k) => {
        const glyph = tileSlice(assets.healthDigitTiles, digit);
        const out = new Uint8Array(TILE_BYTES);
        for (let row = 0; row < TILE_BYTES / TILE_ROW_BYTES; row++) {
            const o = row * TILE_ROW_BYTES;
            writeLong(out, o, (readLong(glyph, o) | (row % 2 === 0 ? colour : odd)) >>> 0);
        }
        state.tiles.set(C.HEALTH.TILE_FIRST + k, out);
    });
}
function drawCardTiles(state: HudState, inputs: HudInputs, assets: HudAssets, C: HudConstants): void {
    const cardBytes = C.CARD.TILES * TILE_BYTES;
    const rowStride = C.CARD.DIGIT_BYTES / C.CARD.DIGIT_ROWS;
    const half = rowStride / 2;
    for (let s = 0; s < C.CARD.X_WORDS.length; s++) {
        const slot = inputs.inventory[s];
        if (!slot)
            throw new Error(`inventory has no slot ${s}`);
        const bytes = new Uint8Array(cardBytes);
        if (slot.item !== 0) {
            const art = assets.cardArt[slot.item - 1];
            if (!art || art.length !== cardBytes)
                throw new Error(`no ${cardBytes}-byte card art of item ${slot.item}`);
            bytes.set(art);
            const n = ((u16(slot.amount - 1) >> CELL_SHIFT) + 1) & C.CARD.DIGIT_MASK;
            const { tens, ones } = splitDigits(n, C.CARD.DIGIT_RADIX);
            const glyph = (d: number): readonly number[] => assets.ammoDigits[d] ?? [];
            const tensRows = (): readonly number[] => {
                if (tens === 0)
                    return [];
                if (tens < C.CARD.DIGIT_RADIX)
                    return glyph(tens);
                const rows = C.CARD.OVERFLOW_TENS[tens - C.CARD.DIGIT_RADIX];
                if (!rows)
                    throw new Error(`HUD.CARD.OVERFLOW_TENS has no rows for a tens digit of ${tens}`);
                return rows;
            };
            const tensWords = tensRows();
            for (let r = 0; r < C.CARD.DIGIT_ROWS; r++) {
                const o = C.CARD.DIGIT_BYTE_OFFSET + r * rowStride;
                writeWord(bytes, o, tensWords[r] ?? 0);
                writeWord(bytes, o + half, glyph(ones)[r] ?? 0);
            }
        }
        writeBank(state, C.CARD.FIRST_TILE + C.CARD.TILES * s, bytes);
    }
}
export function hudRedrawCards(state: HudState, inputs: HudInputs, assets: HudAssets, C: HudConstants): void {
    drawCardTiles(state, inputs, assets, C);
}
export function hudRedrawHealth(state: HudState, inputs: HudInputs, assets: HudAssets, C: HudConstants): void {
    drawHealthPair(state, inputs, assets, C);
}
function gridWrites(cx: number, cy: number, floor: FloorClasses, assets: HudAssets, C: HudConstants): CellWrite[] {
    const { wx, wy } = windowOrigin(cx, cy, C);
    const out: CellWrite[] = [];
    for (let r = 0; r < C.SCAN.ROWS; r++) {
        for (let c = 0; c < C.SCAN.COLS; c++) {
            const cls = floor.classAt(wx + c, wy + r);
            const display = assets.classDisplayTable[cls];
            if (display === undefined)
                throw new Error(`the class -> display table has no entry for class ${cls}`);
            out.push([C.SCAN.CELL_ROW + r, C.SCAN.CELL_COL + c, C.SCAN.BASE_WORD + display]);
        }
    }
    return out;
}
function applyWrites(state: HudState, writes: readonly CellWrite[]): void {
    for (const [r, c, w] of writes)
        state.cells[r]![c] = w;
}
function queueGrid(state: HudState, writes: CellWrite[], C: HudConstants): void {
    state.pendingGrid.push(writes);
    while (state.pendingGrid.length > C.LAG.GRID_TICKS - 1)
        applyWrites(state, state.pendingGrid.shift()!);
}
function queueSprites(state: HudState, list: HudSprite[], C: HudConstants): void {
    state.pendingSprites.push(list);
    while (state.pendingSprites.length > C.LAG.SPRITE_TICKS - 1)
        state.displayedSprites = state.pendingSprites.shift()!;
}
export function hudLevelEntry(inputs: HudInputs, floor: FloorClasses, assets: HudAssets, C: HudConstants): HudState {
    const character = inputs.character > C.IDCARD.CHARACTER_MAX ? 0 : inputs.character;
    const state: HudState = {
        cells: Array.from({ length: C.FRAME.ROWS }, () => new Array<number>(C.FRAME.COLS).fill(0)),
        tiles: new Map(),
        cameraCell: { x: cellOf(u16(inputs.pos.x)), y: cellOf(u16(inputs.pos.y)) },
        removedMarkers: new Set(),
        chainSeen: 0,
        pendingGrid: [],
        pendingSprites: Array.from({ length: Math.max(0, C.LAG.SPRITE_TICKS - 1) }, () => []),
        displayedSprites: [],
        character,
    };
    drawFrame(state, assets, C);
    drawIdCard(state, assets, C);
    drawFontAndCounter(state, inputs, assets, C);
    drawHealthPair(state, inputs, assets, C);
    drawCardTiles(state, inputs, assets, C);
    writeBank(state, C.SCAN.BASE_WORD & TILE_MASK, assets.scannerTiles);
    noteChain(state, inputs.entities, floor);
    applyWrites(state, gridWrites(clampAxis(inputs.pos.x, C), clampAxis(inputs.pos.y, C), floor, assets, C));
    return state;
}
function scannerSprites(phase: number, inputs: HudInputs, chain: readonly HudEntity[], bio: boolean, state: HudState, floor: FloorClasses, C: HudConstants): HudSprite[] {
    const icon = blinkWord(phase, C);
    const px = u16(inputs.pos.x);
    const py = u16(inputs.pos.y);
    const cx = clampAxis(px, C);
    const cy = clampAxis(py, C);
    const list: HudSprite[] = [];
    if (bio) {
        const { wx, wy } = windowOrigin(cx, cy, C);
        for (let r = 0; r < C.SCAN.ROWS; r++) {
            for (let c = 0; c < C.SCAN.COLS; c++) {
                const cls = floor.classAt(wx + c, wy + r);
                if (!isMarkerClass(cls, C) || state.removedMarkers.has(markerKey(wx + c, wy + r, floor)))
                    continue;
                list.push({ xWord: C.SCAN.MARKER_X_START + C.SCAN.MARKER_STEP * c, yWord: C.SCAN.MARKER_Y_START + C.SCAN.MARKER_STEP * r, w: 1, h: 1, attr: icon + C.SCAN.TILE_STEP });
            }
        }
    }
    const yWord = asr(s16(py - (cy & CELL_CORNER_MASK)), C.SCAN.SHIFT) + C.SCAN.PLAYER_Y_OFFSET;
    const xWord = asr(s16(px - (cx & CELL_CORNER_MASK)), C.SCAN.SHIFT) + C.SCAN.PLAYER_X_OFFSET;
    list.push({ xWord, yWord, w: 1, h: 1, attr: icon });
    if ((phase & C.SCAN.COMPASS_PHASE_MASK) !== 0) {
        const vx = s16(inputs.view.x);
        const vy = s16(inputs.view.y);
        C.SCAN.COMPASS_SHIFTS.forEach((shift, i) => {
            let a = asr(vx, shift);
            let b = asr(vy, shift);
            if (C.SCAN.COMPASS_HALF[i] === 1) {
                a += asr(a, 1);
                b += asr(b, 1);
            }
            list.push({ xWord: xWord + a, yWord: yWord + b, w: 1, h: 1, attr: C.SCAN.COMPASS_WORD });
        });
    }
    const R = C.SCAN.ENEMY_RANGE;
    const xl = (cx & CELL_CORNER_MASK) - R;
    const yl = (cy & CELL_CORNER_MASK) - R;
    for (const e of chain) {
        if ((e.flags & C.SCAN.ENEMY_ALIVE_FLAG) === 0 || e.floor !== inputs.floor)
            continue;
        const ex = s16(e.x);
        const ey = s16(e.y);
        if (ex < xl || ex >= xl + 2 * R || ey < yl || ey >= yl + 2 * R)
            continue;
        list.push({ xWord: asr(ex - xl, C.SCAN.SHIFT) + C.SCAN.ENEMY_X_OFFSET, yWord: asr(ey - yl, C.SCAN.SHIFT) + C.SCAN.ENEMY_Y_OFFSET, w: 1, h: 1, attr: icon + C.SCAN.TILE_STEP });
    }
    return list;
}
export function cardSprites(inputs: HudInputs, C: HudConstants): HudSprite[] {
    const list: HudSprite[] = [];
    C.CARD.RING_WALK.forEach((offset, k) => {
        const slot = inputs.slots === true ? k : inputs.ring[offset];
        if (slot === undefined)
            throw new Error(`the ring has no entry ${offset}`);
        const reveal = inputs.reveal[slot];
        if (reveal === undefined)
            throw new Error(`reveal has no entry for slot ${slot}`);
        if (C.CARD.HIDDEN_STATES.includes(reveal))
            return;
        const x = C.CARD.X_WORDS[k];
        if (x === undefined)
            throw new Error(`HUD.CARD.X_WORDS has no entry ${k}`);
        list.push({ xWord: x, yWord: C.CARD.Y_WORD, w: C.CARD.W, h: C.CARD.H, attr: C.CARD.ATTR_BASE + C.CARD.TILES * slot });
    });
    return list;
}
export function hudIteration(state: HudState, inputs: HudInputs, nextChain: readonly HudEntity[] | null, floor: FloorClasses, assets: HudAssets, C: HudConstants): void {
    const phase = u16(inputs.phase + C.PHASE_ADVANCE);
    const chain = nextChain ?? inputs.entities;
    noteChain(state, chain, floor);
    const bio = inputs.passive.bio_scanner >= 0;
    const cell = { x: cellOf(u16(inputs.pos.x)), y: cellOf(u16(inputs.pos.y)) };
    state.cameraCell = cell;
    queueGrid(state, gridWrites(clampAxis(inputs.pos.x, C), clampAxis(inputs.pos.y, C), floor, assets, C), C);
    const list = scannerSprites(phase, inputs, chain, bio, state, floor, C);
    list.push(...cardSprites(inputs, C));
    queueSprites(state, list, C);
}
export function hudTile(state: HudState, index: number): Uint8Array {
    return state.tiles.get(index) ?? new Uint8Array(TILE_BYTES);
}
function keptSprite(s: HudSprite, C: HudConstants): boolean {
    const t = s.attr & TILE_MASK;
    return (t >= C.RECORD.BLIP_TILE_FIRST && t <= C.RECORD.BLIP_TILE_LAST) || (t >= C.RECORD.CARD_TILE_FIRST && t <= C.RECORD.CARD_TILE_LAST);
}
export function hudPicture(state: HudState, assets: HudAssets, C: HudConstants): HudPicture {
    const rows = C.RECORD.VIEW_ROWS;
    const cols = C.RECORD.VIEW_COLS;
    const blank = (): number[][] => Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
    const b = blank();
    for (let r = 0; r < Math.min(rows, C.FRAME.ROWS); r++) {
        for (let c = 0; c < Math.min(cols, C.FRAME.COLS); c++) {
            const inRect = r >= C.RECORD.VIEW_RECT_ROW_FIRST && r <= C.RECORD.VIEW_RECT_ROW_LAST && c >= C.RECORD.VIEW_RECT_COL_FIRST && c <= C.RECORD.VIEW_RECT_COL_LAST;
            b[r]![c] = inRect ? 0 : state.cells[r]![c]!;
        }
    }
    const line = assets.paletteLine.length;
    const cram = new Array<number>(line * C.RECORD.PALETTE_LINE).fill(0);
    for (const w of assets.paletteLine)
        cram.push(w & C.RECORD.COLOUR_MASK);
    const sprites: HudRecordSprite[] = state.displayedSprites
        .filter((s) => keptSprite(s, C))
        .map((s) => ({ x: (s.xWord & SPRITE_X_MASK) - C.SPRITE_ORIGIN, y: (s.yWord & SPRITE_Y_MASK) - C.SPRITE_ORIGIN, w: s.w, h: s.h, attr: s.attr }));
    return {
        display: { enabled: true, width: C.RECORD.DISPLAY_W, height: C.RECORD.DISPLAY_H, backdrop: C.RECORD.BACKDROP },
        cram,
        a: { ox: 0, oy: 0, fx: 0, fy: 0, cells: blank() },
        b: { ox: 0, oy: 0, fx: 0, fy: 0, cells: b },
        sprites,
    };
}

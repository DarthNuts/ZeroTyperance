import { composeVdp } from "../rend/app/vdp_compose.js";
import type { VdpPlane, VdpSprite } from "../rend/app/vdp_compose.js";
import type { PauseConstants } from "./constants.js";
import type { PauseAssets, PauseInputs, SlotTileSource } from "./types.js";
export const SCREEN_WIDTH = 320;
export const SCREEN_HEIGHT = 224;
const TILE_PX = 8;
const PLANE_B_COLUMNS = 64;
const PLANE_B_ROWS = 32;
const SPRITE_ORIGIN = 128;
const CRAM_WORDS = 64;
const CRAM_LINE = 16;
const CHIP_SPRITES_PER_LINE = 20;
const CHIP_SPRITE_PIXELS_PER_LINE = 320;
const BLANK_CODE_LIMIT = 0x30;
const ASCII_DIGIT_0 = 0x30;
const ASCII_LETTER_A = 0x41;
const WORD_MASK = 0xffff;
export interface PauseStatic {
    readonly cram: readonly number[];
    readonly planeB: Uint16Array;
    readonly tile: SlotTileSource;
    readonly markerX: number;
    readonly markerY: number;
}
function s16(v: number): number {
    return ((v & WORD_MASK) << 16) >> 16;
}
export function pausePalette(inputs: PauseInputs, assets: PauseAssets, C: PauseConstants): number[] {
    const cram = Array.from({ length: CRAM_WORDS }, (_, i) => inputs.gameCram[i] ?? 0);
    for (let i = 0; i < CRAM_LINE; i++)
        cram[C.PALETTE.TEXT_LINE * CRAM_LINE + i] = assets.captionCram[i] ?? 0;
    cram[C.PALETTE.CLEARED_INDEX] = C.PALETTE.CLEARED_VALUE;
    return cram;
}
export function buildPlanTiles(inputs: PauseInputs, assets: PauseAssets, C: PauseConstants): Uint8Array[] {
    const glyphPx = C.MAP.CELL_PX;
    const cellsPerTile = TILE_PX / glyphPx;
    const side = C.MAP.CELLS;
    const lookOfCell = (cx: number, cy: number): number => {
        const v = inputs.cells[side * cy + cx] ?? 0;
        const cls = inputs.classOfBlock[v] ?? 0;
        return assets.classToLook[cls] ?? 0;
    };
    const tiles: Uint8Array[] = [];
    for (let ty = 0; ty < C.MAP.BLOCK_TILES; ty++) {
        for (let tx = 0; tx < C.MAP.BLOCK_TILES; tx++) {
            const t = new Uint8Array(32);
            for (let py = 0; py < TILE_PX; py++) {
                for (let px = 0; px < TILE_PX; px++) {
                    const look = lookOfCell(cellsPerTile * tx + Math.floor(px / glyphPx), cellsPerTile * ty + Math.floor(py / glyphPx));
                    const c = assets.looks[look]?.[py % glyphPx]?.[px % glyphPx] ?? 0;
                    const o = py * 4 + (px >> 1);
                    t[o] = (px & 1) === 0 ? (t[o]! | (c << 4)) : (t[o]! | c);
                }
            }
            tiles.push(t);
        }
    }
    return tiles;
}
export function labelCellWord(ch: number, assets: PauseAssets): number {
    if (ch < BLANK_CODE_LIMIT)
        return assets.labelWord.blank;
    if (ch < ASCII_LETTER_A)
        return assets.labelWord.digit + (ch - ASCII_DIGIT_0);
    return assets.labelWord.letter + (ch - ASCII_LETTER_A);
}
export function buildStatic(inputs: PauseInputs, assets: PauseAssets, C: PauseConstants): PauseStatic {
    const planTiles = buildPlanTiles(inputs, assets, C);
    const planFirstSlot = assets.planFirstSlot;
    const tile: SlotTileSource = (slot) => {
        const k = slot - planFirstSlot;
        if (k >= 0 && k < planTiles.length)
            return planTiles[k];
        return assets.tiles(slot);
    };
    const planeB = new Uint16Array(PLANE_B_COLUMNS * PLANE_B_ROWS);
    for (let ty = 0; ty < C.MAP.BLOCK_TILES; ty++) {
        for (let tx = 0; tx < C.MAP.BLOCK_TILES; tx++) {
            planeB[(C.MAP.TILE_ROW + ty) * PLANE_B_COLUMNS + C.MAP.TILE_COLUMN + tx] = (assets.planFirstWord + C.MAP.BLOCK_TILES * ty + tx) & WORD_MASK;
        }
    }
    const text = assets.labels[(inputs.episode << 4) + inputs.playerFloor] ?? "";
    for (let i = 0; i < C.LABEL.LENGTH; i++) {
        const ch = i < text.length ? text.charCodeAt(i) : 0x20;
        planeB[C.LABEL.ROW * PLANE_B_COLUMNS + C.LABEL.COLUMN + i] = labelCellWord(ch, assets) & WORD_MASK;
    }
    return {
        cram: pausePalette(inputs, assets, C),
        planeB,
        tile,
        markerX: (s16(inputs.pos.x) >> C.MARKER.POSITION_SHIFT) + C.MARKER.X_ADD,
        markerY: (s16(inputs.pos.y) >> C.MARKER.POSITION_SHIFT) + C.MARKER.Y_ADD,
    };
}
function entryText(f: number, inputs: PauseInputs, assets: PauseAssets, C: PauseConstants): string {
    if (f === inputs.countedFloor)
        return inputs.countdown !== 0 ? assets.status.secured : assets.status.notSecured;
    const e = inputs.entries[f] ?? "";
    return e === "" ? "" : e + " ".repeat(C.CAPTION.ENTRY_PAD);
}
function rowText(f: number, inputs: PauseInputs, assets: PauseAssets, C: PauseConstants): string {
    return (assets.levelNames[(inputs.episode << 4) + f] ?? "") + entryText(f, inputs, assets, C);
}
export function captionTexts(b: number, inputs: PauseInputs, assets: PauseAssets, C: PauseConstants): [
    string,
    string,
    string
] {
    let previous = "";
    if (b - 1 >= C.BROWSE.LOWEST)
        previous = rowText(b - 1, inputs, assets, C);
    else if (b === C.BROWSE.LOWEST && inputs.carried !== "") {
        const title = inputs.episode === 1 ? assets.carryTitles.episode1 : assets.carryTitles.other;
        previous = title + inputs.carried + " ".repeat(C.CAPTION.ENTRY_PAD);
    }
    const current = rowText(b, inputs, assets, C);
    const next = b + 1 <= inputs.countedFloor ? rowText(b + 1, inputs, assets, C) : "";
    return [previous, current, next];
}
export function planeAWords(b: number, inputs: PauseInputs, assets: PauseAssets, C: PauseConstants): Uint16Array {
    const cols = C.SCREEN.COLUMNS;
    const rows = C.SCREEN.ROWS;
    const w = new Uint16Array(cols * rows);
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            w[r * cols + c] = (assets.backdrop[r]?.[c] ?? 0) & WORD_MASK;
    const texts = captionTexts(b, inputs, assets, C);
    const planeRows = [C.CAPTION.ROW.PREVIOUS, C.CAPTION.ROW.CURRENT, C.CAPTION.ROW.NEXT];
    texts.forEach((text, k) => {
        const row = planeRows[k]!;
        for (let r = row; r < row + C.CAPTION.ROWS_CLEARED && r < rows; r++)
            for (let c = 0; c < cols; c++)
                w[r * cols + c] = assets.clearWord & WORD_MASK;
        if (text === "")
            return;
        const start = C.CAPTION.CENTRE_COLUMN - Math.floor(text.length / 2);
        for (let i = 0; i < text.length; i++) {
            const col = start + i;
            if (col < 0 || col >= cols)
                continue;
            const g = assets.writer.get(text.charCodeAt(i)) ?? { upper: 0, lower: 0 };
            w[row * cols + col] = g.upper & WORD_MASK;
            if (row + 1 < rows)
                w[(row + 1) * cols + col] = g.lower & WORD_MASK;
        }
    });
    return w;
}
export function composePause(st: PauseStatic, planeA: Uint16Array, markerVisible: boolean, inputs: PauseInputs, assets: PauseAssets, C: PauseConstants): Uint8Array {
    const a: VdpPlane = { cols: C.SCREEN.COLUMNS, rows: C.SCREEN.ROWS, words: planeA, hscroll: 0, vscroll: 0, tile: st.tile };
    const b: VdpPlane = { cols: PLANE_B_COLUMNS, rows: PLANE_B_ROWS, words: st.planeB, hscroll: 0, vscroll: -C.MAP.SCROLL_DOWN, tile: st.tile };
    const sprites: VdpSprite[] = markerVisible
        ? [{ xWord: st.markerX + SPRITE_ORIGIN, yWord: st.markerY + SPRITE_ORIGIN, wCells: 1, hCells: 1, attr: assets.marker.attr, tile: st.tile }]
        : [];
    void inputs;
    return composeVdp({
        width: SCREEN_WIDTH, height: SCREEN_HEIGHT, planeA: a, planeB: b, overlayB: null, sprites,
        maxSpritesPerLine: CHIP_SPRITES_PER_LINE, maxSpritePixelsPerLine: CHIP_SPRITE_PIXELS_PER_LINE,
    });
}

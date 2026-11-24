import { asr, s16, u16 } from "../arith.js";
import type { SpriteConstants } from "./constants.js";
import { rasterize } from "./raster.js";
import type { Shading } from "./raster.js";
import type { Art, Bank, FrameRecord, SpriteRect, Surface } from "./types.js";
export interface FrameCell {
    readonly slot: number;
    readonly art: Art;
    readonly mirrored: boolean;
    readonly rect: SpriteRect;
}
export function frameCells(bank: Bank, frame: FrameRecord, S: number, sx: number, sy: number, SC: SpriteConstants, note: (s: string) => void): FrameCell[] {
    const ws = s16(asr(frame.wNum * u16(S), SC.COMPOSITE_WIDTH_SHIFT));
    const hs = s16(asr(frame.hNum * u16(S), SC.COMPOSITE_HEIGHT_SHIFT));
    const xadj = s16(frame.cols * ws);
    const yadj = s16(frame.rows * hs);
    let x0 = sx;
    let y0 = sy;
    if (frame.xmode === SC.ALIGN_CENTRE)
        x0 = s16(x0 - asr(xadj, 1));
    else if (frame.xmode !== SC.ALIGN_NONE)
        x0 = s16(x0 - xadj);
    if (frame.ymode === SC.ALIGN_CENTRE)
        y0 = s16(y0 - asr(yadj, 1));
    else if (frame.ymode !== SC.ALIGN_NONE)
        y0 = s16(y0 - yadj);
    const out: FrameCell[] = [];
    for (let r = 0; r < frame.rows; r++) {
        for (let c = 0; c < frame.cols; c++) {
            const i = r * frame.cols + c;
            const slot = frame.slots[i];
            if (slot === undefined) {
                note(`frame of bank ${bank.name}: cell ${i} has no slot`);
                continue;
            }
            const art = bank.cellArt(slot);
            if (art === null) {
                note(`frame of bank ${bank.name}: pool slot ${slot} is past the pool; the cell is not drawn`);
                continue;
            }
            const mirrored = (frame.flips[i] ?? 0) !== 0;
            out.push({ slot, art, mirrored, rect: { h: hs, w: ws, left: s16(x0 + c * ws), top: s16(y0 + r * hs) } });
        }
    }
    return out;
}
export function drawFrame(surface: Surface, bank: Bank, frame: FrameRecord, S: number, sx: number, sy: number, table: Uint8Array | null, tableMirrored: Uint8Array | null, SC: SpriteConstants, note: (s: string) => void, beam?: Shading): void {
    for (const c of frameCells(bank, frame, S, sx, sy, SC, note)) {
        rasterize(surface, c.art, c.mirrored, c.rect, S, c.mirrored ? tableMirrored : table, SC, beam === undefined ? null : c.mirrored ? beam.mirrored : beam.table);
    }
}

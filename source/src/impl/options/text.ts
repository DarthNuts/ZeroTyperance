import type { VideoModel } from "../boot/model.js";
import type { TextFont } from "./assets.js";
import type { OptionsConstants } from "./constants.js";
export function drawString(model: VideoModel, font: TextFont, C: OptionsConstants, row: number, col: number, s: string): void {
    const plane = model.planeA;
    const chars = Array.from(s);
    if (row < 0 || row + 1 >= plane.height || col < 0 || col + chars.length > plane.width) {
        throw new Error(`drawString: ${JSON.stringify(s)} at (${row}, ${col}) leaves the ${plane.width} x ${plane.height} plane`);
    }
    chars.forEach((ch, i) => {
        const glyph = font.glyphs.get(ch);
        if (glyph === undefined)
            throw new Error(`drawString: the font ${font.name} has no glyph for ${JSON.stringify(ch)} (in ${JSON.stringify(s)})`);
        const upper = glyph.upper === null ? C.BLANK_CELL : C.TEXT_FLAGS + C.TEXT_SLOT + glyph.upper;
        const lower = glyph.lower === null ? C.BLANK_CELL : C.TEXT_FLAGS + C.TEXT_SLOT + glyph.lower;
        model.writeCellA(col + i, row, upper);
        model.writeCellA(col + i, row + 1, lower);
    });
}

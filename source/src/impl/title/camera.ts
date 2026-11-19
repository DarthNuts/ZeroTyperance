import { LINE_ENTRIES, SCREEN_LINES, SCROLL_MASK } from "../boot/model.js";
import type { TitleConstants } from "./constants.js";
export interface Counter {
    value: number;
    index: number;
}
export function newCounter(): Counter {
    return { value: 0, index: 0 };
}
export function advanceCounter(c: Counter, sequence: readonly number[]): void {
    c.value -= 1;
    if (c.value < 0) {
        c.value = sequence[Math.min(c.index, sequence.length - 1)]! - 1;
        c.index += 1;
    }
}
export function rampIndex(c: number, C: TitleConstants): number {
    return C.RAMP_TOP - Math.min(Math.abs(Math.min(c, C.RAMP_CAP) - C.RAMP_CENTRE), C.RAMP_TOP);
}
export function line1Buffer(cx: number, cy: number, C: TitleConstants): number[] {
    const buffer = new Array<number>(LINE_ENTRIES).fill(0);
    for (const c of [cx, cy]) {
        if (c < 0 || c >= C.PAL1_LIMIT)
            continue;
        const row = C.PAL1_SELECT[c]!;
        for (let s = 0; s < row.length; s++) {
            const g = row[s]!;
            if (g === 0)
                continue;
            const group = C.PAL1_GROUPS[g - 1]!;
            const first = LINE_ENTRIES - group.length * (s + 1);
            for (let i = 0; i < group.length; i++)
                buffer[first + i] = group[i]!;
        }
    }
    return buffer;
}
function shearScroll(k: number, counter: number, bit0: number, C: TitleConstants): number {
    const shear = Math.min(counter, C.SHEAR_CAP) - C.SHEAR_CENTRE;
    const sum = C.SHEAR_BASE - k * shear;
    return (((sum >> C.SHEAR_SHIFT) & ~1) | bit0) & SCROLL_MASK;
}
export function scrollTable(m: number, cx: number, cy: number, C: TitleConstants): {
    a: number[];
    b: number[];
} {
    const a: number[] = [];
    const b: number[] = [];
    const flat = -C.SCROLL_STEP * m & SCROLL_MASK;
    for (let line = 0; line < C.FLAT_LINES; line++) {
        a.push(flat);
        b.push(flat);
    }
    for (let k = 1; k <= C.SHEAR_LINES; k++) {
        a.push(shearScroll(k, cx, C.SHEAR_BIT_A, C));
        b.push(shearScroll(k, cy, C.SHEAR_BIT_B, C));
    }
    if (a.length !== SCREEN_LINES)
        throw new Error(`scroll table has ${a.length} lines, the picture has ${SCREEN_LINES}`);
    return { a, b };
}

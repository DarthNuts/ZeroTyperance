import type { HdArea } from "./column.js";
import type { HdConstants } from "./constants.js";
export type HdResolution = "native" | "half" | "quarter" | "original";
const DIVISOR: Readonly<Record<Exclude<HdResolution, "original">, number>> = { native: 1, half: 2, quarter: 4 };
export function hdAreaFor(resolution: HdResolution, width: number, height: number, bar: boolean, original: {
    rows: number;
    barCols: number;
}): HdArea {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (resolution === "original") {
        const rows = original.rows;
        const cols = bar ? original.barCols : Math.max(1, Math.round((rows * w) / h));
        return { cols, rows, width: w, height: h, bar };
    }
    const d = DIVISOR[resolution];
    return { cols: Math.max(1, Math.round(w / d)), rows: Math.max(1, Math.round(h / d)), width: w, height: h, bar };
}
export function cpuAreaFor(area: HdArea, C: HdConstants): HdArea {
    if (area.cols <= C.CPU.MAX_COLUMNS)
        return area;
    const k = C.CPU.MAX_COLUMNS / area.cols;
    return { ...area, cols: C.CPU.MAX_COLUMNS, rows: Math.max(1, Math.round(area.rows * k)) };
}

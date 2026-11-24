export const LOWER_MARK = "‹";
export const RAISE_MARK = "›";
export interface NumberRow {
    value: number;
    min: number;
    max: number;
    step: number;
    show?: (v: number) => string;
}
export type NumberPart = "lower" | "raise" | "label";
export const canLower = (r: NumberRow): boolean => r.value > r.min;
export const canRaise = (r: NumberRow): boolean => r.value < r.max;
export const lowered = (r: NumberRow): number => Math.max(r.min, r.value - r.step);
export const raised = (r: NumberRow): number => Math.min(r.max, r.value + r.step);
export function numberKey(r: NumberRow, delta: -1 | 1, chosen: boolean): number | null {
    const v = chosen || delta > 0 ? raised(r) : lowered(r);
    return v === r.value ? null : v;
}
export function numberClick(r: NumberRow, part: NumberPart): number | null {
    if (part === "lower")
        return canLower(r) ? lowered(r) : null;
    if (part === "raise")
        return canRaise(r) ? raised(r) : null;
    return null;
}
export function numberCells(r: NumberRow): {
    lower: string;
    value: string;
    raise: string;
    lowerDim: boolean;
    raiseDim: boolean;
} {
    return { lower: LOWER_MARK, value: r.show ? r.show(r.value) : String(r.value), raise: RAISE_MARK, lowerDim: !canLower(r), raiseDim: !canRaise(r) };
}

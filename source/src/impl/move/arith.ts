const WORD = 0x10000;
const WORD_MASK = 0xffff;
const SIGN = 0x8000;
export function s16(v: number): number {
    const w = v & WORD_MASK;
    return w >= SIGN ? w - WORD : w;
}
export function u16(v: number): number {
    return v & WORD_MASK;
}
export function mod(a: number, m: number): number {
    const r = a % m;
    return r < 0 ? r + m : r;
}
export function asr(v: number, k: number): number {
    return v >> k;
}
export function stepToward(d: number, k: number): number {
    if (d === 0)
        return 0;
    const mag = Math.abs(d);
    const step = Math.ceil(mag / 2 ** k);
    return d > 0 ? step : -step;
}
export function approach(v: number, t: number, k: number): number {
    return v + stepToward(t - v, k);
}
export function cellOf(coord: number, cell: number): number {
    return Math.floor(coord / cell);
}
export function fractionOf(coord: number, cell: number): number {
    return mod(coord, cell);
}

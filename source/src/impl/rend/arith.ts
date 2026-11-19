export function s16(v: number): number {
    return ((v & 0xffff) << 16) >> 16;
}
export function u16(v: number): number {
    return v & 0xffff;
}
export function s32(v: number): number {
    return v | 0;
}
export function asr(v: number, bits: number): number {
    return (v | 0) >> bits;
}
export function tdiv(a: number, b: number): number {
    return Math.trunc(a / b);
}
const S16_MIN = -32768;
const S16_MAX = 32767;
export function divs(n: number, d: number): number | null {
    const dd = s16(d);
    if (dd === 0)
        return null;
    const q = tdiv(s32(n), dd);
    return q < S16_MIN || q > S16_MAX ? null : q;
}
export function mod(a: number, m: number): number {
    const r = a % m;
    return r < 0 ? r + m : r;
}

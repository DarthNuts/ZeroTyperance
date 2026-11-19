import { decodeModernInput, encodeModernInput } from "../modern/canonical.js";
import type { ModernInput } from "../modern/canonical.js";
import type { SelectionMode } from "../modern/select.js";
import type { TurnCapSetting } from "../modern/seat.js";
export type SeatScheme = {
    readonly scheme: "original";
} | {
    readonly scheme: "modern";
    readonly turnCap: TurnCapSetting;
    readonly selection: SelectionMode;
};
export const ORIGINAL_SCHEME: SeatScheme = Object.freeze({ scheme: "original" as const });
const BYTE = 8;
const BYTE_MASK = 0xff;
const ORIGINAL_SHIFT = 3 * BYTE;
export function packModernPad(i: ModernInput, originalByte = 0): number {
    const [b0, b1, b2] = encodeModernInput(i);
    return ((b0 | (b1 << BYTE) | (b2 << (2 * BYTE)) | ((originalByte & BYTE_MASK) << ORIGINAL_SHIFT)) >>> 0);
}
export function originalByteOfPad(p: number): number {
    return (p >>> ORIGINAL_SHIFT) & BYTE_MASK;
}
export function unpackModernPad(p: number): ModernInput {
    return decodeModernInput([p & BYTE_MASK, (p >> BYTE) & BYTE_MASK, (p >> (2 * BYTE)) & BYTE_MASK]);
}
export function schemeOf(v: unknown): SeatScheme {
    const o = v as {
        scheme?: unknown;
        turnCap?: unknown;
        selection?: unknown;
    } | null | undefined;
    if (o && o.scheme === "modern" && (o.turnCap === "original" || o.turnCap === "fast") && (o.selection === "carousel" || o.selection === "slots")) {
        return { scheme: "modern", turnCap: o.turnCap, selection: o.selection };
    }
    return ORIGINAL_SCHEME;
}

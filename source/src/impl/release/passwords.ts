import { decodePassword, episodeOfLevelByte, floorOfLevelByte } from "../password/codec.js";
import type { PasswordCodecTables } from "../password/codec.js";
import type { PasswordRow } from "./quickstart.js";
export const PASSWORD_LENGTH = 9;
export interface ExtraCode {
    readonly code: string;
    readonly episode: number;
    readonly floor: number;
}
export function loadExtraCodes(json: unknown, rows: readonly PasswordRow[]): ExtraCode[] {
    const root = json as {
        data?: {
            named?: unknown;
        };
        named?: unknown;
    } | null;
    const list = root?.data?.named ?? root?.named;
    if (!Array.isArray(list))
        return [];
    const known = new Set(rows.map((r) => r.code));
    return list
        .map((r: Record<string, unknown>) => ({ code: String(r.code), episode: Number(r.episode), floor: Number(r.floor) }))
        .filter((r) => !known.has(r.code));
}
export function normalizeEntry(text: string): string {
    let out = "";
    for (const ch of text)
        out += ch === "0" ? "O" : ch === "1" || ch === "I" || ch === "l" ? "i" : ch;
    return out;
}
export interface PasswordTarget {
    readonly episode: number;
    readonly floor: number;
    readonly levelByte: number;
}
export function checkPassword(tables: PasswordCodecTables, code: string): PasswordTarget | null {
    if ([...code].length !== PASSWORD_LENGTH)
        return null;
    for (const ch of code)
        if (!tables.alphabet.includes(ch) && !tables.literals.some((l) => l.code === code))
            return null;
    const rec = decodePassword(tables, code, [0, 0, 0, 0, 0]);
    if (rec === null)
        return null;
    return { episode: episodeOfLevelByte(rec.level_byte), floor: floorOfLevelByte(rec.level_byte), levelByte: rec.level_byte };
}
export function slotOfLevel(rows: readonly PasswordRow[], episode: number, floor: number): number {
    return rows.findIndex((r) => r.episode === episode && r.floor === floor);
}
export function readSlots(saved: unknown, slots: number, check: ((code: string) => PasswordTarget | null) | null): string[] {
    const list = Array.isArray(saved) ? saved : [];
    return Array.from({ length: slots }, (_, i) => {
        const v = list[i];
        if (typeof v !== "string" || [...v].length !== PASSWORD_LENGTH)
            return "";
        if (check !== null && check(v) === null)
            return "";
        return v;
    });
}
export function storeInSlot(slots: readonly string[], rows: readonly PasswordRow[], code: string, target: PasswordTarget): {
    slots: string[];
    slot: number;
} | null {
    const slot = slotOfLevel(rows, target.episode, target.floor);
    if (slot < 0 || slot >= slots.length)
        return null;
    const out = [...slots];
    out[slot] = code;
    return { slots: out, slot };
}
export function clearSlot(slots: readonly string[], slot: number): string[] {
    const out = [...slots];
    if (slot >= 0 && slot < out.length)
        out[slot] = "";
    return out;
}

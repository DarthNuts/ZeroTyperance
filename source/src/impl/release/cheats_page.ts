import type { CheatRules, DrainSelector } from "../tick/cheats.js";
import type { Settings } from "./settings.js";
export function cheatRulesOf(s: Settings): CheatRules {
    return { c1: s.cheats.c1, c2: s.cheats.c2, c3: s.cheats.c3, c4: s.cheats.c4, c5: s.cheats.c5, c6: s.cheats.c6, fix990: s.game.fix_990 };
}
export const SELECTOR_CHOICES: readonly DrainSelector[] = ["off", "none", "half", "double"];
export type CheatKey = "c1" | "c2" | "c3" | "c4" | "c5" | "c6" | "fix990";
export interface CheatRow {
    readonly key: CheatKey;
    readonly label: string;
    readonly kind: "switch" | "selector";
}
export const CHEAT_ROWS: readonly CheatRow[] = [
    { key: "c1", label: "C1 Unlimited ammunition", kind: "switch" },
    { key: "c2", label: "C2 Full refill", kind: "switch" },
    { key: "c3", label: "C3 Floors secured", kind: "switch" },
    { key: "c4", label: "C4 No damage", kind: "switch" },
    { key: "c5", label: "C5 Vest drain", kind: "selector" },
    { key: "c6", label: "C6 Scanner drain", kind: "selector" },
    { key: "fix990", label: "F1 Fix 990 (cap on written amounts)", kind: "switch" },
];
export function cheatValue(s: Settings, key: CheatKey): string {
    const r = cheatRulesOf(s);
    const v = r[key];
    return typeof v === "boolean" ? (v ? "on" : "off") : v;
}
export function stepCheat(s: Settings, key: CheatKey, delta: -1 | 1): Settings {
    switch (key) {
        case "c1":
        case "c2":
        case "c3":
        case "c4":
            return { ...s, cheats: { ...s.cheats, [key]: !s.cheats[key] } };
        case "c5":
        case "c6": {
            const at = SELECTOR_CHOICES.indexOf(s.cheats[key]);
            const next = SELECTOR_CHOICES[(at + delta + SELECTOR_CHOICES.length) % SELECTOR_CHOICES.length]!;
            return { ...s, cheats: { ...s.cheats, [key]: next } };
        }
        case "fix990":
            return { ...s, game: { ...s.game, fix_990: !s.game.fix_990 } };
    }
}

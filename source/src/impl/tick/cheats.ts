export type DrainSelector = "off" | "none" | "half" | "double";
export interface CheatRules {
    c1: boolean;
    c2: boolean;
    c3: boolean;
    c4: boolean;
    c5: DrainSelector;
    c6: DrainSelector;
    fix990: boolean;
}
export const NO_CHEATS: Readonly<CheatRules> = Object.freeze({ c1: false, c2: false, c3: false, c4: false, c5: "off", c6: "off", fix990: false });
let current: Readonly<CheatRules> = NO_CHEATS;
export function cheatRules(): Readonly<CheatRules> {
    return current;
}
export function setCheatRules(r: Readonly<CheatRules> | null | undefined): void {
    current = r ?? NO_CHEATS;
}
export function drainAmount(base: number, sel: DrainSelector): number {
    switch (sel) {
        case "none": return 0;
        case "half": return base / 2;
        case "double": return base * 2;
        default: return base;
    }
}

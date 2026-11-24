import type { Action, KeyBindings, PadBindings } from "./input.js";
import type { ModernAction, ModernBindings } from "./modern_input.js";
export type InputScheme = "original" | "modern";
export type InputRowKind = "controls" | "binding" | "defaults" | "modern_binding" | "modern_defaults" | "touch" | "mouse" | "mouse_sensitivity" | "modern_sensitivity" | "modern_accel" | "modern_decel" | "modern_smoothing" | "turn_cap" | "selection" | "crouch_toggle" | "turn_backlog" | "raw_mouse";
export const turnBacklogText = (v: "steps6" | "unlimited"): string => (v === "steps6" ? "6 steps" : "No limit");
export interface InputRowDesc {
    kind: InputRowKind;
    action?: string;
    label: string;
}
export interface InputRowsSpec {
    scheme: InputScheme;
    actions: readonly string[];
    hotkeys: readonly string[];
    modernActions: readonly string[];
    labels: Readonly<Record<string, string>>;
    modernLabels: Readonly<Record<string, string>>;
}
export const ORIGINAL_PREFIX = "Original: ";
export function inputRowLayout(s: InputRowsSpec): InputRowDesc[] {
    const controls: InputRowDesc = { kind: "controls", label: "Controls" };
    const touch: InputRowDesc = { kind: "touch", label: "Touch controls" };
    const bind = (a: string, prefix = ""): InputRowDesc => ({ kind: "binding", action: a, label: prefix + s.labels[a]! });
    if (s.scheme === "original") {
        return [
            controls,
            ...s.actions.map((a) => bind(a)),
            { kind: "defaults", label: "Defaults" },
            touch,
            { kind: "mouse", label: "Mouse" },
            { kind: "mouse_sensitivity", label: "Mouse sensitivity" },
            { kind: "raw_mouse", label: "Raw mouse" },
        ];
    }
    const pageKeys = s.actions.filter((a) => s.hotkeys.includes(a));
    const original = s.actions.filter((a) => !s.hotkeys.includes(a));
    return [
        controls,
        ...s.modernActions.map((a): InputRowDesc => ({ kind: "modern_binding", action: a, label: s.modernLabels[a]! })),
        { kind: "modern_defaults", label: "Defaults" },
        ...pageKeys.map((a) => bind(a)),
        ...original.map((a) => bind(a, ORIGINAL_PREFIX)),
        { kind: "defaults", label: "Original and page key defaults" },
        { kind: "modern_sensitivity", label: "Mouse sensitivity" },
        { kind: "modern_accel", label: "Mouse acceleration" },
        { kind: "modern_decel", label: "Mouse deceleration" },
        { kind: "modern_smoothing", label: "Mouse smoothing" },
        { kind: "raw_mouse", label: "Raw mouse" },
        { kind: "turn_cap", label: "Turn cap" },
        { kind: "turn_backlog", label: "Turn backlog" },
        { kind: "selection", label: "Selection" },
        { kind: "crouch_toggle", label: "Crouch toggle" },
        touch,
    ];
}
export const CLEAR_KEY_CODES: readonly string[] = ["Delete", "Backspace"];
export const isClearKey = (code: string): boolean => CLEAR_KEY_CODES.includes(code);
export const MENU_CLEAR_REFUSED = "The menu key cannot be cleared; bind it to another key.";
export type ClearPart = "key" | "pad";
export interface ClearResult {
    keys: KeyBindings;
    pad: PadBindings;
    note: string | null;
    changed: boolean;
}
export function clearBinding(keys: KeyBindings, pad: PadBindings, action: Action, part: ClearPart): ClearResult {
    if (action === "menu")
        return { keys, pad, note: MENU_CLEAR_REFUSED, changed: false };
    if (part === "pad") {
        if (pad[action] === null)
            return { keys, pad, note: null, changed: false };
        return { keys, pad: { ...pad, [action]: null }, note: null, changed: true };
    }
    if (keys[action] === null)
        return { keys, pad, note: null, changed: false };
    return { keys: { ...keys, [action]: null }, pad, note: null, changed: true };
}
export function clearModernBinding(b: ModernBindings, action: ModernAction): {
    bindings: ModernBindings;
    changed: boolean;
} {
    if (b[action].length === 0)
        return { bindings: b, changed: false };
    return { bindings: { ...b, [action]: [] }, changed: true };
}

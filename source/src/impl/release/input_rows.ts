export type InputScheme = "original" | "modern";
export type InputRowKind = "controls" | "binding" | "defaults" | "modern_binding" | "modern_defaults" | "touch" | "mouse" | "mouse_sensitivity" | "modern_sensitivity" | "modern_accel" | "modern_decel" | "modern_smoothing" | "turn_cap" | "selection" | "crouch_toggle";
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
        { kind: "turn_cap", label: "Turn cap" },
        { kind: "selection", label: "Selection" },
        { kind: "crouch_toggle", label: "Crouch toggle" },
        touch,
    ];
}

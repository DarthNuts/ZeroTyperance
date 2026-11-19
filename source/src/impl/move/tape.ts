import type { MoveConstants } from "./constants.js";
export interface Pad {
    readonly up: boolean;
    readonly down: boolean;
    readonly left: boolean;
    readonly right: boolean;
    readonly a: boolean;
    readonly b: boolean;
    readonly c: boolean;
}
export const PAD_NONE: Pad = Object.freeze({ up: false, down: false, left: false, right: false, a: false, b: false, c: false });
const STEP_BUTTONS = ["up", "down", "left", "right", "a", "b", "c"] as const;
type StepButton = (typeof STEP_BUTTONS)[number];
export interface TapeSegment {
    readonly buttons: readonly string[];
    readonly from: number;
    readonly to: number;
}
export interface ScriptTape {
    readonly segments: readonly TapeSegment[];
}
export function scriptTapeFrom(tape: unknown): ScriptTape {
    const t = tape as {
        format?: unknown;
        input?: {
            kind?: unknown;
            segments?: unknown;
        };
    } | null;
    if (!t || typeof t !== "object")
        throw new Error("tape: not an object");
    if (t.input?.kind !== "script")
        throw new Error(`tape: input.kind ${String(t.input?.kind)}, the step is driven by a script tape`);
    if (!Array.isArray(t.input.segments))
        throw new Error("tape: input.segments is not a list");
    const segments: TapeSegment[] = (t.input.segments as Array<{
        buttons?: unknown;
        from?: unknown;
        to?: unknown;
    }>).map((s) => {
        if (!Array.isArray(s.buttons) || !s.buttons.every((b) => typeof b === "string"))
            throw new Error("tape: a segment's buttons is not a list of names");
        if (!Number.isInteger(s.from) || !Number.isInteger(s.to))
            throw new Error("tape: a segment's from / to is not an integer");
        return Object.freeze({ buttons: Object.freeze([...(s.buttons as string[])]), from: s.from as number, to: s.to as number });
    });
    return Object.freeze({ segments: Object.freeze(segments) });
}
export function padAtFrame(tape: ScriptTape, frame: number): Pad {
    const held = new Set<string>();
    for (const s of tape.segments)
        if (s.from <= frame && frame < s.to)
            for (const b of s.buttons)
                held.add(b);
    return padOf((b) => held.has(b));
}
export function padOfTick(tape: ScriptTape, tick: number): Pad {
    return padAtFrame(tape, tick + 1);
}
function padOf(has: (b: StepButton) => boolean): Pad {
    return Object.freeze({ up: has("up"), down: has("down"), left: has("left"), right: has("right"), a: has("a"), b: has("b"), c: has("c") });
}
export interface DemoInputs {
    readonly inputBits: readonly string[];
    readonly demos: ReadonlyArray<{
        readonly episode: number;
        readonly inputs: readonly number[];
    }>;
}
export function demoInputsFrom(doc: unknown): DemoInputs {
    const d = doc as {
        name?: unknown;
        data?: {
            input_bits?: unknown;
            demos?: unknown;
        };
    } | null;
    if (!d || typeof d !== "object" || d.name !== "demo_inputs")
        throw new Error("demo_inputs.json: not the demo_inputs data fact");
    const bits = d.data?.input_bits;
    if (!Array.isArray(bits) || !bits.every((b) => typeof b === "string"))
        throw new Error("demo_inputs.json: input_bits is not a list of names");
    if (!Array.isArray(d.data?.demos))
        throw new Error("demo_inputs.json: demos is not a list");
    const demos = (d.data!.demos as Array<{
        episode?: unknown;
        inputs?: unknown;
    }>).map((m) => {
        if (!Number.isInteger(m.episode) || !Array.isArray(m.inputs) || !m.inputs.every((b) => Number.isInteger(b)))
            throw new Error("demo_inputs.json: a demo without episode / inputs");
        return Object.freeze({ episode: m.episode as number, inputs: Object.freeze([...(m.inputs as number[])]) });
    });
    return Object.freeze({ inputBits: Object.freeze([...(bits as string[])]), demos: Object.freeze(demos) });
}
export function padOfByte(byte: number, inputs: DemoInputs): Pad {
    return padOf((b) => {
        const bit = inputs.inputBits.indexOf(b);
        return bit >= 0 && ((byte >> bit) & 1) === 1;
    });
}
export function padOfDemoTick(demo: {
    readonly inputs: readonly number[];
}, inputs: DemoInputs, tick: number, C: MoveConstants): Pad {
    const i = tick - C.FIRST_STEP_TICK;
    if (i < 0 || i >= demo.inputs.length)
        return PAD_NONE;
    return padOfByte(demo.inputs[i]!, inputs);
}

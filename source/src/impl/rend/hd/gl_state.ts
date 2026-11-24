import { FLAG_LIFT, FLAG_RAMP, FLAG_STAIR } from "./mesh.js";
export type GlDepthFunc = "LEQUAL" | "EQUAL";
export interface GlFacePass {
    readonly extent: "all" | "fill";
    readonly depthFunc: GlDepthFunc;
    readonly depthWrite: boolean;
    readonly colour: boolean;
}
export interface GlDrawState {
    readonly passes: readonly GlFacePass[];
    readonly stairFill: "word" | "always";
    readonly stripDepthFunc: GlDepthFunc;
}
export const GL_DRAW_STATE: GlDrawState = Object.freeze({
    passes: Object.freeze([
        Object.freeze({ extent: "all", depthFunc: "LEQUAL", depthWrite: true, colour: false }),
        Object.freeze({ extent: "all", depthFunc: "EQUAL", depthWrite: false, colour: true }),
    ]) as readonly GlFacePass[],
    stairFill: "word",
    stripDepthFunc: "LEQUAL",
}) as GlDrawState;
export const GL_DRAW_STATE_D27: GlDrawState = Object.freeze({
    passes: Object.freeze([Object.freeze({ extent: "fill", depthFunc: "LEQUAL", depthWrite: true, colour: true })]) as readonly GlFacePass[],
    stairFill: "always",
    stripDepthFunc: "LEQUAL",
}) as GlDrawState;
export function glDrawState(params: {
    readonly stairOwner?: boolean;
}): GlDrawState {
    return params.stairOwner === false ? GL_DRAW_STATE_D27 : GL_DRAW_STATE;
}
export function quadFullHeight(pass: GlFacePass, flags: number): boolean {
    return pass.extent === "all" || (flags & (FLAG_RAMP | FLAG_STAIR)) !== 0;
}
export function outsideRows(state: GlDrawState, flags: number): "fill" | "rampRule" | "discard" {
    const lift = (flags & FLAG_LIFT) !== 0;
    const ramp = (flags & FLAG_RAMP) !== 0;
    const stair = (flags & FLAG_STAIR) !== 0;
    if (stair && !lift && (state.stairFill === "always" || ramp))
        return "fill";
    if (ramp && !lift)
        return "rampRule";
    return "discard";
}
export function outsideRowsGlsl(): string {
    return `    if (stair && !lift && (uStairWord < 0.5 || ramp)) { outColor = vec4(uFill, 1.0); return; } // 4.4a draft 28: a stair face's fill (with a ramp word; gl_state.ts outsideRows)
    if (ramp && !lift) { outColor = vec4(ownRows(0) ? uFill : bg(), 1.0); return; } // 4.4a: the ramp rule (a negative case's stairs); 4.4b: no fill on a lift-class face
    discard;`;
}
export function quadExtentGlsl(fullHeight: number): string {
    return `float z = (uStrip == 1 || uFull > 0.5 || ramp || stairF) ? (aEZ.y > 0.5 ? ${fullHeight}.0 : -${fullHeight}.0) : (aEZ.y > 0.5 ? uCell : 0.0);`;
}

import { Externals, freezeGraph, readGraph, thawGraph, writeGraph } from "../../release/savestate.js";
import type { FreezeMemo, FrozenGraph, GraphData } from "../../release/savestate.js";
import type { LcgRng } from "../../../rng.js";
import type { NewGameSession } from "./newgame.js";
import { STATE_CLASSES } from "./state_classes.js";
export interface StateKit {
    readonly tickKit: unknown;
    readonly charselAssets: unknown;
    readonly charselC: unknown;
}
export interface CoreState {
    readonly session: NewGameSession;
    readonly rng: LcgRng;
    readonly blank: number;
}
const REBUILT: ReadonlySet<string> = new Set(["driver", "classAt"]);
const EXTERNALS = new WeakMap<object, {
    readonly a: unknown;
    readonly c: unknown;
    readonly e: Externals;
}>();
export function externalsOf(k: StateKit): Externals {
    const key = k.tickKit as object;
    const hit = typeof key === "object" && key !== null ? EXTERNALS.get(key) : undefined;
    if (hit !== undefined && hit.a === k.charselAssets && hit.c === k.charselC)
        return hit.e;
    const e = new Externals({ tickKit: k.tickKit, charselAssets: k.charselAssets, charselC: k.charselC }, STATE_CLASSES, REBUILT);
    if (typeof key === "object" && key !== null)
        EXTERNALS.set(key, { a: k.charselAssets, c: k.charselC, e });
    return e;
}
export function canSave(session: NewGameSession | null): boolean {
    return session !== null && session.stage === "play" && session.tas === null && session.run !== null;
}
export function saveCore(state: CoreState, k: StateKit): string {
    return JSON.stringify(writeGraph(state, externalsOf(k)));
}
export function loadCore(text: string, k: StateKit): CoreState {
    const data = JSON.parse(text) as GraphData;
    const out = readGraph(data, externalsOf(k)) as CoreState;
    if (!out || typeof out !== "object" || !out.session || !out.rng || typeof out.blank !== "number")
        throw new Error("not a state of a running level");
    out.session.rebuildAfterLoad();
    return out;
}
export function freezeCore(state: CoreState, k: StateKit, memo: FreezeMemo): FrozenGraph {
    return freezeGraph(state, externalsOf(k), memo);
}
export function thawCore(g: FrozenGraph, k: StateKit, memo?: FreezeMemo): CoreState {
    const out = thawGraph(g, externalsOf(k), memo) as CoreState;
    if (!out || typeof out !== "object" || !out.session || !out.rng || typeof out.blank !== "number")
        throw new Error("not a state of a running level");
    out.session.rebuildAfterLoad();
    return out;
}

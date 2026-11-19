import { weaponOfItem } from "../weapon/core.js";
import { levelStartWorld } from "../start/level_start.js";
import type { LevelStartInput } from "../start/types.js";
import { firstPicture, request, tickStart } from "./core.js";
import type { TickEnv, TickState } from "./core.js";
import type { SoundEvent } from "./sound.js";
const PREVIOUS_PAD_AT_START = 0;
export interface LevelStartResult {
    readonly state: TickState;
    readonly events: readonly SoundEvent[];
    readonly music: readonly SoundEvent[];
    readonly creation: readonly SoundEvent[];
    readonly notes: readonly string[];
}
export function levelStart(env: TickEnv, input: LevelStartInput, previousPad: number = PREVIOUS_PAD_AT_START): LevelStartResult {
    const start = levelStartWorld(input, { mapsDoc: env.mapsDoc, classOfBlock: env.classOfBlock }, env.start, (item) => weaponOfItem(item, env.W));
    const notes: string[] = [...start.notes];
    const state = tickStart(env, start.world, start.hidden, previousPad, notes, null, start.earlierFloors);
    state.player.lastFootstepPhase = null;
    for (const ev of start.events)
        if (ev.type === "Audio.Music")
            request(state, ev.id);
    let music: SoundEvent[] = [];
    if (input.kind === "new_game" || input.kind === "password") {
        music = [...state.events];
        state.events.length = 0;
    }
    firstPicture(state, notes);
    let creation: SoundEvent[] = [];
    if (input.kind === "new_game" || input.kind === "password") {
        creation = [...state.events];
        state.events.length = 0;
    }
    return { state, events: [...state.events], music, creation, notes };
}
export function levelStartState(env: TickEnv, input: LevelStartInput, previousPad: number = PREVIOUS_PAD_AT_START): TickState {
    return levelStart(env, input, previousPad).state;
}

import { LcgRng } from "../../../rng.js";
import { PAD_BIT } from "../../tick/constants.js";
import { RealCore } from "../../net/real_core.js";
import { NewGameSession } from "./newgame.js";
import type { NewGameStart } from "./newgame.js";
import type { AttractKit } from "./tick_kit.js";
import { saveCore } from "./state.js";
import type { StateKit } from "./state.js";
import type { CharselAssets } from "../../charsel/assets.js";
import type { CharselConstants } from "../../charsel/constants.js";
import type { SeatRules } from "../../tick/seats.js";
export const COOP_START_TICKS = 20000;
export interface CoopStartKit {
    readonly tickKit: AttractKit;
    readonly charselAssets: CharselAssets;
    readonly charselC: CharselConstants;
}
export function startSessionFor(k: CoopStartKit, start: NewGameStart, seed: number, character: number): {
    session: NewGameSession;
    rng: LcgRng;
    blank: number;
} | null {
    const rng = new LcgRng(seed >>> 0, k.tickKit.lcg);
    const session = new NewGameSession(k.tickKit, k.charselAssets, k.charselC, rng, start);
    const sink = { emit: (): void => undefined } as never;
    let blank = 0;
    for (let i = 0; i < COOP_START_TICKS && session.stage !== "play"; i++) {
        let pad = 0;
        if (session.stage === "select") {
            const press = (i & 1) === 1;
            if (session.charsel.cursor !== character)
                pad = press ? 1 << PAD_BIT.UP : 0;
            else
                pad = press ? 1 << PAD_BIT.START : 0;
        }
        session.tick(pad, sink, blank++);
    }
    if (session.stage !== "play")
        return null;
    return { session, rng, blank };
}
export function coopStartCore(k: CoopStartKit, start: NewGameStart, seed: number, characters: readonly [
    number,
    number
], offsetX: number, rules?: SeatRules): RealCore | null {
    const sk: StateKit = { tickKit: k.tickKit, charselAssets: k.charselAssets, charselC: k.charselC };
    const a = startSessionFor(k, start, seed, characters[0]);
    if (a === null)
        return null;
    let seat1Start: string | undefined;
    if (characters[1] !== characters[0]) {
        const b = startSessionFor(k, start, seed, characters[1]);
        if (b === null)
            return null;
        seat1Start = saveCore(b, sk);
    }
    return new RealCore(sk, saveCore(a, sk), { offsetX, ...(seat1Start !== undefined ? { seat1Start } : {}), ...(rules !== undefined ? { rules } : {}) });
}

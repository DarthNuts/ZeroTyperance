import type { Rng } from "../../rng.js";
import type { SoldierConstants } from "../rend/sprite/constants.js";
import type { AiInputs, Ctx, SoldierBody, SoldierEvent } from "./common.js";
import { OutsideSpecError, moveIndex, targetOf } from "./common.js";
import { walkHome } from "./walk.js";
import { waitingPath } from "./wait.js";
import { attackPath } from "./attack.js";
import { corpseCall, hurtCall } from "./kill.js";
export interface CallResult {
    readonly removed: boolean;
}
export function soldierCall(e: SoldierBody, inputs: AiInputs, rng: Rng, emit: (ev: SoldierEvent) => void, C: SoldierConstants): CallResult {
    if (e.target === "unknown")
        throw new OutsideSpecError("hidden.target is `unknown` (link play): not specified (4.12)");
    e.timer = 0;
    const ctx: Ctx = {
        e,
        inputs,
        rng,
        emit,
        C,
        start: { x: e.pos.x, y: e.pos.y },
        startIndex: moveIndex(e.pos.x, e.pos.y),
        target: targetOf(inputs),
        removed: false,
    };
    if (e.form === "corpse") {
        corpseCall(ctx);
        return { removed: ctx.removed };
    }
    if (e.state === C.HURT_STATE) {
        hurtCall(ctx);
        return { removed: ctx.removed };
    }
    walkHome(ctx);
    if (e.state !== C.ATTACK_STATE) {
        const entersAttack = waitingPath(ctx);
        if (ctx.removed)
            return { removed: true };
        if (entersAttack)
            attackPath(ctx);
    }
    else {
        if (e.target !== "player")
            throw new OutsideSpecError(`hidden.target is ${e.target} in the attack state, which never retargets: not specified (4.12)`);
        attackPath(ctx);
    }
    return { removed: ctx.removed };
}

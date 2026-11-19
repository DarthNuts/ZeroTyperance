import type { Entity } from "../../domain.js";
import type { HiddenState } from "./common.js";
export function hiddenOf(e: Entity): HiddenState {
    if (!e.hidden) {
        throw new Error(`entity slot ${e.slot} of type ${e.type} carries no hidden section (world.schema.json requires it for enemy.rec3)`);
    }
    if (typeof e.hidden.bite_cooldown !== "number") {
        throw new Error(`entity slot ${e.slot} of type ${e.type} carries no bite_cooldown (world.schema.json requires it for enemy.rec3; the soldier's group has none)`);
    }
    return e.hidden as HiddenState;
}

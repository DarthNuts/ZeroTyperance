import type { Entity, EntityAi, EventSink, Rng, WorldView } from "../../domain.js";
import { VECTORS } from "./constants.js";
import type { HydConstants } from "./constants.js";
import { bits, draw } from "./arith.js";
import type { Ctx } from "./common.js";
import { hiddenOf } from "./hidden.js";
import { ceilingTick, floorTick } from "./chase.js";
import { airTick } from "./air.js";
import { wallTick } from "./wall.js";
import { corpseTick } from "./corpse.js";
import { damageEntry } from "./damage.js";
export { damageEntry };
export { corpseDamage, corpseTick } from "./corpse.js";
export type { DamageCall } from "./damage.js";
export const LIVE_HANDLERS: readonly string[] = [VECTORS.live.aiFirst, VECTORS.live.ai];
export const CORPSE_HANDLER: string = VECTORS.corpse.ai;
export function isWallState(state: number, C: HydConstants): boolean {
    return state >= C.STATE_N_EAST && state <= C.STATE_W_SOUTH;
}
function requireOwnFloor(view: WorldView, e: Entity): void {
    if (view.map.floor !== e.floor) {
        throw new Error(`the view's grid is of floor ${view.map.floor}, the crab lives on floor ${e.floor}: every cell lookup is on the crab's own floor (2.1, 7.6)`);
    }
}
export function crabAi(C: HydConstants, markerBlock: (episode: number, cls: number) => number, handlers: readonly string[] = [...LIVE_HANDLERS, CORPSE_HANDLER]): EntityAi {
    return {
        handlers,
        aiTick(view: WorldView, self: Entity, rng: Rng, events: EventSink): Entity | null {
            const isCorpse = self.vec.ai === CORPSE_HANDLER;
            if (!isCorpse && !LIVE_HANDLERS.includes(self.vec.ai))
                return structuredClone(self);
            const e = structuredClone(self);
            const h = hiddenOf(e);
            if (!isCorpse) {
                if (e.vec.ai === VECTORS.live.aiFirst) {
                    e.vec.ai = VECTORS.live.ai;
                    e.state = bits(draw(rng), 0, C.COIN_MASK);
                }
                e.timer = 0;
                if (h.bite_cooldown !== 0)
                    h.bite_cooldown -= 1;
            }
            requireOwnFloor(view, e);
            const ctx: Ctx = {
                view, e, h, rng, events, C, markerBlock,
                start: { x: e.pos.x, y: e.pos.y },
                removed: false,
                outside: [],
            };
            if (isCorpse)
                corpseTick(ctx);
            else if (e.state === C.STATE_FLOOR)
                floorTick(ctx);
            else if (e.state === C.STATE_CEILING)
                ceilingTick(ctx);
            else if (e.state === C.STATE_AIR)
                airTick(ctx);
            else if (isWallState(e.state, C))
                wallTick(ctx);
            if (ctx.removed)
                return null;
            return e;
        },
    };
}

import type { Entity } from "../../world.js";
import { clamp, draw, octDist, s16, sar, u16, u8 } from "../hydaca/arith.js";
import type { CellSource } from "../soldier/common.js";
import type { TickState } from "./core.js";
import { applySoldierEvents } from "./core.js";
import { corpseCall, corpseEntry, endCall, guarded, kindCall, kindDeath, liveDamage, moveBy, watch } from "./kinds_common.js";
export const IMP_TYPE = "enemy.rec2";
export function isImp(e: Entity): boolean {
    return e.type === IMP_TYPE;
}
export function impPass(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    if (!e.hidden)
        throw new Error(`entity slot ${e.slot}: an Imp without its hidden group (ZT-ENT-IMP 2)`);
    guarded(state, e, notes, () => impCall(state, e, cells, notes));
}
function impCall(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    const I = state.env.IMP;
    const h = e.hidden!;
    const p = state.world.player;
    const { ctx, events } = kindCall(state, e, cells, I);
    const toPlayer = (): number => octDist(s16(e.pos.x - p.pos.x), s16(e.pos.y - p.pos.y));
    const plan = (): void => {
        if (e.hp < 0) {
            if (e.floor === state.world.level.sub_id)
                events.push({ type: "Audio.Request", request: I.DEATH_SOUND });
            kindDeath(state, e, I.CORPSE_FLAG_MASK, null, events, notes);
            return;
        }
        const r1 = draw(state.rng);
        const r2 = draw(state.rng);
        e.counter = u8(sar(s16(toPlayer()), I.PLAN_COUNTER_SHIFT) + ((r1 >> 16) & I.PLAN_COUNTER_MASK));
        e.state = I.STATE_WANDER;
        const s = r2 >> I.PLAN_HOME_SHIFT;
        h.waypoint.x = u16((s & I.PLAN_HOME_MASK) - I.PLAN_HOME_BIAS + p.pos.x);
        h.waypoint.y = u16(((s >> 16) & I.PLAN_HOME_MASK) - I.PLAN_HOME_BIAS + p.pos.y);
    };
    const walk = (): void => {
        const axis = (home: number, pos: number): number => clamp(sar(s16(home - pos), I.WALK_SHIFT), -I.WALK_LIMIT, I.WALK_LIMIT);
        e.vel.x = axis(h.waypoint.x, e.pos.x);
        e.vel.y = axis(h.waypoint.y, e.pos.y);
        moveBy(ctx, e.vel.x, e.vel.y);
    };
    const armed = (): void => {
        e.counter = u8(e.counter - 1);
        if (e.counter === 0)
            plan();
        else if (e.counter === I.BITE_COUNTER) {
            if (toPlayer() < I.BITE_RANGE) {
                events.push({ type: "Combat.Hit", target: "player", impulse: I.BITE_IMPULSE, dx: s16(e.pos.x - p.pos.x), dy: s16(e.pos.y - p.pos.y) });
                events.push({ type: "Audio.Request", request: I.BITE_SOUND });
            }
        }
    };
    if (e.form === "corpse") {
        corpseCall(state, e, ctx, cells, I, notes);
        applySoldierEvents(state, e, events, notes);
        return;
    }
    if (e.state === I.STATE_PAIN) {
        if (octDist(s16(e.vel.x), s16(e.vel.y)) >= I.PAIN_STOP_SPEED) {
            moveBy(ctx, e.vel.x, e.vel.y);
            e.vel.x = sar(e.vel.x, I.PAIN_VEL_SHIFT);
            e.vel.y = sar(e.vel.y, I.PAIN_VEL_SHIFT);
        }
        else
            plan();
    }
    else {
        walk();
        if (e.state === I.STATE_WANDER) {
            e.counter = u8(e.counter - 1);
            if (e.counter !== 0)
                watch(ctx, e, I.MARKER_CLASS);
            else {
                e.state = I.STATE_ARMED;
                e.counter = I.ARMED_COUNTER;
                armed();
            }
        }
        else
            armed();
    }
    endCall(state, e, ctx, events, notes);
}
export function impDamage(state: TickState, e: Entity, d: number, dx: number, dy: number, mark: number, particles: boolean): void {
    const I = state.env.IMP;
    if (e.form === "corpse")
        corpseEntry(state, e, d, dx, dy, I, true);
    else
        liveDamage(state, e, d, dx, dy, mark, I.STATE_PAIN, I, true, particles);
}

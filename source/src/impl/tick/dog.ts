import type { Entity } from "../../world.js";
import { clamp, draw, octDist, s16, sar, u16, u8 } from "../hydaca/arith.js";
import type { CellSource } from "../soldier/common.js";
import { moveIndex } from "../soldier/common.js";
import type { TickState } from "./core.js";
import { applySoldierEvents, request } from "./core.js";
import { corpseCall, corpseEntry, endCall, guarded, kindCall, kindDeath, liveDamage, moveBy, watch } from "./kinds_common.js";
export const DOG_TYPE = "enemy.rec6";
export function isDog(e: Entity): boolean {
    return e.type === DOG_TYPE;
}
export function dogPass(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    if (!e.hidden)
        throw new Error(`entity slot ${e.slot}: a dog without its hidden group (ZT-ENT-DOG 2)`);
    guarded(state, e, notes, () => dogCall(state, e, cells, notes));
}
function dogCall(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    const D = state.env.DOG;
    const h = e.hidden!;
    const p = state.world.player;
    const { ctx, events } = kindCall(state, e, cells, D);
    const toPlayer = (): number => octDist(s16(e.pos.x - p.pos.x), s16(e.pos.y - p.pos.y));
    const settle = (): void => {
        if (e.hp < 0) {
            if (e.floor === state.world.level.sub_id)
                events.push({ type: "Audio.Request", request: D.DEATH_SOUND });
            kindDeath(state, e, D.CORPSE_FLAG_MASK, D.CORPSE_STATE, events, notes);
            return;
        }
        const s = draw(state.rng) >> D.HOME_SHIFT;
        h.waypoint.x = u16((s & D.HOME_MASK) - D.HOME_BIAS + e.pos.x);
        h.waypoint.y = u16(((s >> 16) & D.HOME_MASK) - D.HOME_BIAS + e.pos.y);
        e.state = D.STATE_APPROACH;
    };
    const biteTest = (): void => {
        e.state = D.RETREAT_STATE;
        const origin = h.origin!;
        h.waypoint.x = origin.x;
        h.waypoint.y = origin.y;
        let d = toPlayer();
        const cls = cells.classOf(cells.block(moveIndex(p.pos.x, p.pos.y), state.world.level.sub_id));
        if (cls >= D.DIAG_FIRST && cls <= D.DIAG_LAST)
            d = d >> 1;
        if (d >= D.BITE_RANGE)
            return;
        applySoldierEvents(state, e, [{ type: "Combat.Hit", target: "player", impulse: D.BITE_IMPULSE, dx: sar(s16(origin.x - p.pos.x), 1), dy: sar(s16(origin.y - p.pos.y), 1) }], notes);
        p.knockback.x = s16(p.knockback.x * (1 << D.BITE_KNOCKBACK_SHIFT));
        p.knockback.y = s16(p.knockback.y * (1 << D.BITE_KNOCKBACK_SHIFT));
        state.player.knockbackX = p.knockback.x;
        state.player.knockbackY = p.knockback.y;
        request(state, D.BITE_SOUND);
    };
    const walk = (vx: number, vy: number): boolean => {
        e.vel.x = vx;
        e.vel.y = vy;
        return moveBy(ctx, vx, vy) <= D.ARRIVE_DIST;
    };
    const axis = (home: number, pos: number, shift: number, limit: number): number => clamp(sar(s16(home - pos), shift), -limit, limit);
    if (e.form === "corpse") {
        corpseCall(state, e, ctx, cells, D, notes);
        applySoldierEvents(state, e, events, notes);
        return;
    }
    if (e.state === D.PAIN_STATE) {
        e.counter = 0;
        if (octDist(s16(e.vel.x), s16(e.vel.y)) >= D.PAIN_STOP_SPEED) {
            moveBy(ctx, e.vel.x, e.vel.y);
            e.vel.x = sar(e.vel.x, D.PAIN_VEL_SHIFT);
            e.vel.y = sar(e.vel.y, D.PAIN_VEL_SHIFT);
        }
        else
            settle();
    }
    else if (e.state === D.CHARGE_STATE) {
        e.counter = u8(e.counter - 1);
        if (e.counter === 0)
            biteTest();
        else {
            if ((e.counter & D.CHARGE_REFRESH_MASK) === 0) {
                h.waypoint.x = p.pos.x;
                h.waypoint.y = p.pos.y;
            }
            const arrived = walk(axis(h.waypoint.x, e.pos.x, D.CHARGE_SHIFT, D.CHARGE_LIMIT), axis(h.waypoint.y, e.pos.y, D.CHARGE_SHIFT, D.CHARGE_LIMIT));
            if (arrived)
                biteTest();
            else
                watch(ctx, e, D.MARKER_CLASS);
        }
    }
    else if (e.state === D.RETREAT_STATE) {
        const arrived = walk(axis(h.waypoint.x, e.pos.x, D.RETREAT_SHIFT_X, D.CHARGE_LIMIT), axis(h.waypoint.y, e.pos.y, D.RETREAT_SHIFT_Y, D.CHARGE_LIMIT));
        e.counter = D.RETREAT_COUNTER;
        if (arrived)
            settle();
        else
            watch(ctx, e, D.MARKER_CLASS);
    }
    else if (e.counter === 0 && toPlayer() < D.TRIGGER_RANGE) {
        e.state = D.CHARGE_STATE;
        e.counter = u8((toPlayer() >> D.CHARGE_DIST_SHIFT) + D.CHARGE_ADD);
        h.origin = { x: e.pos.x, y: e.pos.y };
        h.waypoint.x = p.pos.x;
        h.waypoint.y = p.pos.y;
    }
    else {
        if (e.counter !== 0)
            e.counter = u8(e.counter - 1);
        const arrived = walk(axis(h.waypoint.x, e.pos.x, D.WALK_SHIFT, D.WALK_LIMIT), axis(h.waypoint.y, e.pos.y, D.WALK_SHIFT, D.WALK_LIMIT));
        if (arrived)
            settle();
        else
            watch(ctx, e, D.MARKER_CLASS);
    }
    endCall(state, e, ctx, events, notes);
}
export function dogDamage(state: TickState, e: Entity, d: number, dx: number, dy: number, mark: number, particles: boolean): void {
    const D = state.env.DOG;
    if (e.form === "corpse")
        corpseEntry(state, e, d, dx, dy, D, false);
    else
        liveDamage(state, e, d, dx, dy, mark, D.PAIN_STATE, D, true, particles);
}

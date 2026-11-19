import { armExitCountdown } from "./core.js";
import type { Entity } from "../../world.js";
import { doorOpener } from "../door/core.js";
import { clamp, draw, octDist, s16, sar, u16, u8 } from "../hydaca/arith.js";
import type { CellSource } from "../soldier/common.js";
import { moveIndex } from "../soldier/common.js";
import { hitRoll } from "../soldier/attack.js";
import { shotLineClear } from "../soldier/los.js";
import { moveWith } from "../soldier/walk.js";
import { defeatedCall, foldBack, walkerDamage } from "./boss.js";
import type { TickState } from "./core.js";
import { becomeCorpse, corpseEntry, endCall, guarded, kindCall, losContext, moveBy, refreshCallWindow, walkerNumbers } from "./kinds_common.js";
export const BOSS3_TYPE = "enemy.rec8";
const HOME_Y_SHIFT = 16;
const STATE_APPROACH = 0;
export function isBoss3(e: Entity): boolean {
    return e.type === BOSS3_TYPE;
}
export function boss3Pass(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    if (!e.hidden)
        throw new Error(`entity slot ${e.slot}: a Boss 3 without its hidden group (ZT-ENT-BOSS3 2)`);
    guarded(state, e, notes, () => boss3Call(state, e, cells, notes));
}
function boss3Call(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    const B = state.env.BOSS3;
    const h = e.hidden!;
    const { ctx, events } = kindCall(state, e, cells, walkerNumbers(state.env.ES, B));
    const t = ctx.target;
    const p = state.world.player;
    const toTarget = (): number => octDist(s16(e.pos.x - t.x), s16(e.pos.y - t.y));
    const defeat = (): void => {
        armExitCountdown(state, B.EXIT_START);
        becomeCorpse(state, e, B.CORPSE_FLAG_MASK);
        e.state = B.CORPSE_STATE;
        events.push({ type: "Floor.Recount" });
        if (e.floor === state.world.level.sub_id)
            events.push({ type: "Audio.Request", request: B.DEFEAT_SOUND });
    };
    const settle = (): void => {
        if (e.hp < 0) {
            if (h.second_life === 0 || h.second_life === undefined) {
                e.state = B.TRANSFORM_STATE;
                e.counter = B.TRANSFORM_COUNTER;
            }
            else
                defeat();
            return;
        }
        e.state = STATE_APPROACH;
        const s = draw(state.rng) >> B.HOME_SHIFT;
        h.waypoint.x = u16((s & B.HOME_MASK) - B.HOME_BIAS + p.pos.x);
        h.waypoint.y = u16(((s >> HOME_Y_SHIFT) & B.HOME_MASK) - B.HOME_BIAS + p.pos.y);
    };
    const endAttack = (): void => {
        const R = draw(state.rng);
        e.counter = u8((toTarget() >> B.HEADING_DIST_SHIFT) + ((R >>> B.HEADING_RAND_SHIFT) & B.HEADING_RAND_MASK));
        settle();
    };
    const shot = (): void => {
        if (!shotLineClear(losContext(ctx, B.LOS_PROBE), e.pos.x, e.pos.y)) {
            endAttack();
            return;
        }
        if (!hitRoll(ctx)) {
            events.push({ type: "Audio.Request", request: B.SHOT_SOUND });
            return;
        }
        if (toTarget() >= B.SHOT_RANGE)
            return;
        events.push({ type: "Combat.Hit", target: "player", impulse: B.SHOT_IMPULSE, dx: s16(e.pos.x - p.pos.x), dy: s16(e.pos.y - p.pos.y) });
        events.push({ type: "Audio.Request", request: B.SHOT_SOUND });
    };
    const shotLine = (): void => {
        e.counter = u8(e.counter - 1);
        if (e.counter === 0)
            endAttack();
        else if (e.counter <= B.SHOT_COUNTER_HIGH && e.counter >= B.SHOT_COUNTER_LOW)
            shot();
    };
    const blowLine = (): void => {
        e.counter = u8(e.counter - 1);
        if (e.counter === 0)
            endAttack();
        else if (e.counter === B.PUNCH_COUNTER && toTarget() < B.PUNCH_RANGE) {
            events.push({ type: "Combat.Hit", target: "player", impulse: B.PUNCH_IMPULSE, dx: s16(e.pos.x - p.pos.x), dy: s16(e.pos.y - p.pos.y) });
            events.push({ type: "Audio.Request", request: B.PUNCH_SOUND });
        }
    };
    if (e.state === B.CORPSE_STATE) {
        const K = { CORPSE_STAMP_RANGE: B.CORPSE_STAMP_RANGE, CORPSE_CLASS: B.CORPSE_CLASS, CORPSE_STAMP_ORDER: state.env.BOSS.CORPSE_STAMP_ORDER };
        if (defeatedCall(state, e, ctx, cells, K, notes))
            ctx.removed = true;
    }
    else if (e.state === B.PAIN_STATE) {
        e.counter = B.PAIN_COUNTER;
        if (octDist(s16(e.vel.x), s16(e.vel.y)) >= B.PAIN_STOP_SPEED) {
            moveWith(ctx, e.vel.x, e.vel.y);
            e.vel.x = sar(e.vel.x, B.PAIN_VEL_SHIFT);
            e.vel.y = sar(e.vel.y, B.PAIN_VEL_SHIFT);
        }
        else
            settle();
    }
    else if (e.state === B.TRANSFORM_STATE) {
        e.counter = u8(e.counter - 1);
        if (e.counter === 0) {
            e.hp = B.SECOND_HP;
            h.second_life = 1;
            settle();
        }
    }
    else {
        const axis = (home: number, pos: number): number => clamp(sar(s16(home - pos), B.WALK_SHIFT), -B.WALK_LIMIT, B.WALK_LIMIT);
        const vx = axis(h.waypoint.x, e.pos.x);
        const vy = axis(h.waypoint.y, e.pos.y);
        e.vel.x = vx;
        e.vel.y = vy;
        const px = u16(e.pos.x + B.PROBE_STEPS * vx);
        const py = u16(e.pos.y + B.PROBE_STEPS * vy);
        const cls = cells.classOf(cells.block(moveIndex(px, py), e.floor));
        if (B.DOOR_CLASSES_A.includes(cls) || B.DOOR_CLASSES_B.includes(cls)) {
            doorOpener(state.doors, px, py, state.floorNumber, state.env.D);
            refreshCallWindow(ctx, cells, e);
            e.pos.x = px;
            e.pos.y = py;
            events.push({ type: "Audio.Request", request: B.DOOR_SOUND });
        }
        const disp = moveBy(ctx, vx - sar(vx, B.MOVE_SLOW_SHIFT), vy - sar(vy, B.MOVE_SLOW_SHIFT));
        if (e.state === B.SHOT_STATE)
            shotLine();
        else if (e.state === STATE_APPROACH) {
            e.counter = u8(e.counter - 1);
            if (e.counter !== 0 && disp >= B.ARRIVE_DIST) {
                if ((u8(state.world.core.phase + e.tag) & state.env.ES.AI.RETARGET_MASK) === 0) {
                    if (e.floor === state.world.level.sub_id)
                        h.target = "player";
                    else {
                        h.target = "none";
                        ctx.removed = foldBack(state, e, cells, events, B.MARKER_CLASS);
                    }
                }
            }
            else {
                const R = draw(state.rng);
                if ((R & B.CHOICE_SHOT_BIT) !== 0 && s16(e.hp) < B.SHOT_HP_BELOW)
                    e.state = B.SHOT_STATE;
                else
                    e.state = ((R >>> B.CHOICE_PUNCH_SHIFT) & 1) !== 0 ? B.PUNCH_STATES[0]! : B.PUNCH_STATES[1]!;
                e.counter = B.ATTACK_COUNTER;
                if (e.state === B.SHOT_STATE)
                    shotLine();
                else
                    blowLine();
            }
        }
        else
            blowLine();
    }
    endCall(state, e, ctx, events, notes);
}
export function boss3Damage(state: TickState, e: Entity, d: number, dx: number, dy: number, particles = true): void {
    const B = state.env.BOSS3;
    if (e.form === "corpse")
        corpseEntry(state, e, d, dx, dy, { DMG_BASE: B.DMG_BASE, CORPSE_VEL_SHIFT: B.CORPSE_VEL_SHIFT }, false);
    else
        walkerDamage(state, e, d, dx, dy, { EXPOSED_MIN_COUNTER: B.EXPOSED_MIN_COUNTER, DMG_BASE: B.DMG_BASE, DMG_VEL_SHIFT: B.DMG_VEL_SHIFT, BURST_LOSS: B.DMG_BASE, BURST_CALLS: particles ? B.BURST_CALLS : 0 }, B.PAIN_STATE);
}

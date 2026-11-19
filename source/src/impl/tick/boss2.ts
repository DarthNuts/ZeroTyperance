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
import { becomeCorpse, corpseEntry, endCall, guarded, kindCall, losContext, refreshCallWindow, walkerNumbers } from "./kinds_common.js";
export const BOSS2_TYPE = "enemy.rec9";
const STATE_WINDUP = 1;
const STATE_PAIN = 2;
const STATE_DEFEATED = 3;
export function isBoss2(e: Entity): boolean {
    return e.type === BOSS2_TYPE;
}
export function boss2Pass(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    if (!e.hidden)
        throw new Error(`entity slot ${e.slot}: a Boss 2 without its hidden group (ZT-ENT-BOSS2 2)`);
    guarded(state, e, notes, () => boss2Call(state, e, cells, notes));
}
function boss2Call(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    const B = state.env.BOSS2;
    const h = e.hidden!;
    const { ctx, events } = kindCall(state, e, cells, walkerNumbers(state.env.ES, B));
    const t = ctx.target;
    const blockC = (): void => {
        if (e.hp < 0) {
            armExitCountdown(state, B.EXIT_START);
            becomeCorpse(state, e, B.CORPSE_FLAG_MASK);
            e.state = STATE_DEFEATED;
            events.push({ type: "Floor.Recount" });
            events.push({ type: "Audio.Request", request: B.DEFEAT_SOUND });
            return;
        }
        e.state = 0;
        const s = draw(state.rng) >> B.HOME_SHIFT;
        h.waypoint.x = u16((s & B.HOME_MASK) - B.HOME_BIAS + t.x - t.vx);
        h.waypoint.y = u16(((s >> B.HOME_Y_SHIFT) & B.HOME_MASK) - B.HOME_BIAS + t.y - t.vy);
    };
    const blockB = (): void => {
        const R = draw(state.rng);
        e.counter = u8((octDist(s16(e.pos.x - t.x), s16(e.pos.y - t.y)) >> B.HEADING_DIST_SHIFT) + ((R >>> B.HEADING_RAND_SHIFT) & B.HEADING_RAND_MASK));
        blockC();
    };
    const strike = (): void => {
        if (!shotLineClear(losContext(ctx, B.LOS_PROBE), e.pos.x, e.pos.y)) {
            blockB();
            return;
        }
        if (!hitRoll(ctx)) {
            events.push({ type: "Audio.Request", request: B.ATTACK_SOUND });
            return;
        }
        if (octDist(s16(e.pos.x - t.x), s16(e.pos.y - t.y)) >= B.ATTACK_RANGE)
            return;
        events.push({ type: "Combat.Hit", target: "player", impulse: B.ATTACK_IMPULSE, dx: s16(e.pos.x - t.x), dy: s16(e.pos.y - t.y) });
        events.push({ type: "Audio.Request", request: B.ATTACK_SOUND });
    };
    const windupLine = (): void => {
        e.counter = u8(e.counter - 1);
        if (e.counter === 0)
            blockB();
        else if (e.counter <= B.ATTACK_COUNTER_HIGH && e.counter >= B.ATTACK_COUNTER_LOW)
            strike();
    };
    if (e.state === STATE_DEFEATED) {
        if (defeatedCall(state, e, ctx, cells, B, notes))
            ctx.removed = true;
    }
    else if (e.state === STATE_PAIN) {
        e.counter = B.PAIN_COUNTER;
        if (octDist(s16(e.vel.x), s16(e.vel.y)) >= B.PAIN_STOP_SPEED) {
            moveWith(ctx, e.vel.x, e.vel.y);
            e.vel.x = sar(e.vel.x, B.PAIN_VEL_SHIFT);
            e.vel.y = sar(e.vel.y, B.PAIN_VEL_SHIFT);
        }
        else
            blockC();
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
        moveWith(ctx, vx - sar(vx, B.MOVE_SLOW_SHIFT), vy - sar(vy, B.MOVE_SLOW_SHIFT));
        if (e.state === STATE_WINDUP)
            windupLine();
        else {
            e.counter = u8(e.counter - 1);
            if (e.counter !== 0) {
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
                e.state = STATE_WINDUP;
                e.counter = B.WINDUP_COUNTER;
                windupLine();
            }
        }
    }
    endCall(state, e, ctx, events, notes);
}
export function boss2Damage(state: TickState, e: Entity, d: number, dx: number, dy: number): void {
    const B = state.env.BOSS2;
    if (e.form === "corpse")
        corpseEntry(state, e, d, dx, dy, { DMG_BASE: B.DMG_BASE, CORPSE_VEL_SHIFT: state.env.BOSS3.CORPSE_VEL_SHIFT }, false);
    else
        walkerDamage(state, e, d, dx, dy, B, STATE_PAIN);
}

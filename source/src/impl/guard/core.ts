import type { Rng } from "../../rng.js";
import type { SoldierConstants } from "../rend/sprite/constants.js";
import { bits, clamp, divTrunc, draw, octDist, s16, sar, u16, u8 } from "../hydaca/arith.js";
import { GRID_SIDE, OutsideSpecError, blockAt, classAt, combatHitPlayer, mapWrite, moveIndex, soundRequest, targetOf } from "../soldier/common.js";
import type { AiInputs, Ctx, SoldierBody, SoldierEvent, Target } from "../soldier/common.js";
import { moveWith } from "../soldier/walk.js";
import { shotLineClear } from "../soldier/los.js";
import { retargetAndRangeTest } from "../soldier/wait.js";
import type { GuardConstants } from "./constants.js";
export interface GuardBody extends SoldierBody {
    damageForm: "live" | "corpse";
    readonly markerClass: number;
    readonly corpseClass: number;
}
export interface GuardCallResult {
    readonly removed: boolean;
}
type Emit = (ev: SoldierEvent) => void;
function sound(emit: Emit, request: number): void {
    emit({ type: "Audio.Request", request });
}
function reroll(b: GuardBody, t: Target, rng: Rng, G: GuardConstants): void {
    const R1 = draw(rng);
    b.counter = u8(bits(R1, G.REROLL_COUNTER_SHIFT, G.REROLL_COUNTER_MASK) + (octDist(s16(b.pos.x - t.x), s16(b.pos.y - t.y)) >> G.REROLL_DISTANCE_SHIFT));
    b.state = G.WALK_STATE;
    const R2 = draw(rng);
    b.home.x = u16(t.x + t.vx + bits(R2, G.WAYPOINT_SHIFTS[0], G.WAYPOINT_SPREAD) - G.WAYPOINT_BIAS);
    b.home.y = u16(t.y + t.vy + bits(R2, G.WAYPOINT_SHIFTS[1], G.WAYPOINT_SPREAD) - G.WAYPOINT_BIAS);
}
function alert(g: GuardBody, t: Target, peers: readonly GuardBody[], rng: Rng, emit: Emit, G: GuardConstants): void {
    for (const p of peers) {
        if (p === g)
            continue;
        if (p.form !== "live" || p.state >= G.WANDER_STATE_LIMIT)
            continue;
        if (octDist(s16(p.pos.x - g.pos.x), s16(p.pos.y - g.pos.y)) <= G.ALERT_RANGE)
            reroll(p, t, rng, G);
    }
    sound(emit, G.ALERT_SOUND);
}
function death(e: GuardBody, emit: Emit, G: GuardConstants): void {
    sound(emit, G.DEATH_SOUND);
    e.flags = e.flags & G.CORPSE_FLAG_MASK;
    e.form = "corpse";
    e.timer = 0;
    e.vel.x = 0;
    e.vel.y = 0;
    e.state = G.CORPSE_STATE;
    emit({ type: "Floor.Recount" });
}
function decision(e: GuardBody, t: Target, rng: Rng, emit: Emit, G: GuardConstants): void {
    if (s16(e.hp) < 0)
        death(e, emit, G);
    else
        reroll(e, t, rng, G);
}
function wander(ctx: Ctx, e: GuardBody, peers: readonly GuardBody[], ES: SoldierConstants, G: GuardConstants): void {
    const n = e.state;
    const head = G.HEADING[n];
    if (head === undefined)
        throw new OutsideSpecError(`guard state ${n} is not a wander state (4.2)`);
    const [sx, sy] = head;
    const t = ctx.target;
    if (octDist(s16(e.pos.x - t.x), s16(e.pos.y - t.y)) <= G.NEAR) {
        alert(e, t, peers, ctx.rng, ctx.emit, G);
        reroll(e, t, ctx.rng, G);
        return;
    }
    if ((e.pos.x & 0xff) === G.CELL_CENTRE && (e.pos.y & 0xff) === G.CELL_CENTRE) {
        const idx = moveIndex(u16(e.pos.x + G.PROBE_CELLS * sx), u16(e.pos.y + G.PROBE_CELLS * sy));
        if (ES.AI.MOVE_BLOCKED_CLASSES.includes(classAt(ctx, idx, e.floor))) {
            e.state = (n + 1) & G.HEADING_MASK;
            return;
        }
    }
    e.pos.x = u16(e.pos.x + sx);
    e.pos.y = u16(e.pos.y + sy);
    e.vel.x = G.VEL_SCALE * sx;
    e.vel.y = G.VEL_SCALE * sy;
    const px = u16(e.pos.x + G.LOOK_CELLS * sx);
    const py = u16(e.pos.y + G.LOOK_CELLS * sy);
    if (octDist(s16(px - t.x), s16(py - t.y)) <= G.LOOK && shotLineClear(ctx, e.pos.x, e.pos.y)) {
        alert(e, t, peers, ctx.rng, ctx.emit, G);
        reroll(e, t, ctx.rng, G);
    }
    retargetAndRangeTest(ctx, e.markerClass);
}
function walk(ctx: Ctx, e: GuardBody, G: GuardConstants): void {
    const t = ctx.target;
    const bx = e.pos.x;
    const by = e.pos.y;
    const stepX = clamp(sar(s16(e.home.x - e.pos.x), G.WALK_SHIFT), -G.WALK_LIMIT, G.WALK_LIMIT);
    const stepY = clamp(sar(s16(e.home.y - e.pos.y), G.WALK_SHIFT), -G.WALK_LIMIT, G.WALK_LIMIT);
    moveWith(ctx, stepX, stepY);
    const ax = s16(e.pos.x - bx);
    const ay = s16(e.pos.y - by);
    e.vel.x = G.VEL_SCALE * ax;
    e.vel.y = G.VEL_SCALE * ay;
    if (e.state === G.WALK_STATE) {
        const c = u8(e.counter - 1);
        if (octDist(ax, ay) <= G.ARRIVE || c === 0) {
            e.state = G.STAND_STATE;
            e.counter = G.STAND_COUNTER;
            stand(ctx, e, G);
            return;
        }
        e.counter = c;
        const dx = s16(e.pos.x - t.x);
        const dy = s16(e.pos.y - t.y);
        if (octDist(dx, dy) <= G.REACH) {
            combatHitPlayer(ctx, dx, dy, G.STRIKE_IMPULSE);
            sound(ctx.emit, G.STRIKE_SOUND);
        }
        retargetAndRangeTest(ctx, e.markerClass);
        return;
    }
    stand(ctx, e, G);
}
function stand(ctx: Ctx, e: GuardBody, G: GuardConstants): void {
    const t = ctx.target;
    e.counter = u8(e.counter - 1);
    if (e.counter === 0) {
        decision(e, t, ctx.rng, ctx.emit, G);
        return;
    }
    if (e.counter === G.SHOT_COUNTER) {
        if (!shotLineClear(ctx, e.pos.x, e.pos.y)) {
            decision(e, t, ctx.rng, ctx.emit, G);
            return;
        }
        const eye = s16(ctx.inputs.player.eyeOffset);
        const mode = ctx.inputs.cells.renderMode(ctx.inputs.playerFloor);
        let threshold: number | null;
        if (eye >= 0)
            threshold = mode === G.NO_ROLL_MODE ? null : G.SHOT_ROLL;
        else
            threshold = mode === G.NO_ROLL_MODE ? G.SHOT_ROLL_AIR_MODE0 : G.SHOT_ROLL_AIR;
        if (threshold !== null) {
            const R = draw(ctx.rng);
            if (bits(R, G.ROLL_SHIFT, G.ROLL_MASK) >= threshold) {
                sound(ctx.emit, G.SHOT_SOUND);
                return;
            }
        }
        const dx = s16(e.pos.x - t.x);
        const dy = s16(e.pos.y - t.y);
        const d = u16(G.SHOT_SCALE * octDist(dx, dy));
        if (d >= G.SHOT_RANGE)
            return;
        combatHitPlayer(ctx, dx, dy, d);
        sound(ctx.emit, G.SHOT_SOUND);
        return;
    }
    if (G.CUE_COUNTERS.includes(e.counter))
        sound(ctx.emit, G.SHOT_SOUND);
    retargetAndRangeTest(ctx, e.markerClass);
}
function pain(ctx: Ctx, e: GuardBody, G: GuardConstants): void {
    e.counter = u8(e.counter - 1);
    if (e.counter === 0) {
        decision(e, ctx.target, ctx.rng, ctx.emit, G);
        return;
    }
    moveWith(ctx, s16(e.vel.x), s16(e.vel.y));
    e.vel.x = sar(s16(e.vel.x), G.PAIN_SHIFT);
    e.vel.y = sar(s16(e.vel.y), G.PAIN_SHIFT);
}
function corpse(ctx: Ctx, e: GuardBody, ES: SoldierConstants, G: GuardConstants): void {
    const K = ES.CORPSE;
    e.vel.x = Math.trunc(e.vel.x / 2);
    e.vel.y = Math.trunc(e.vel.y / 2);
    if (e.vel.x !== 0 || e.vel.y !== 0)
        moveWith(ctx, e.vel.x, e.vel.y);
    const d = octDist(s16(e.pos.x - ctx.target.x), s16(e.pos.y - ctx.target.y));
    if (d >= K.LOOT_RANGE) {
        if ((u8(ctx.inputs.phase + e.tag) & K.RELOOK_MASK) === 0)
            e.target = e.floor === ctx.inputs.playerFloor ? "player" : "none";
        if (e.target === "none" || d >= K.STAMP_RANGE) {
            const col = u16(e.pos.x) >>> 8;
            const row = u16(e.pos.y) >>> 8;
            for (const [ox, oy] of ES.AI.FOLD_ORDER) {
                if (blockAt(ctx, (row + oy!) * GRID_SIDE + col + ox!, e.floor) === 0) {
                    mapWrite(ctx, e.floor, col + ox!, row + oy!, ctx.inputs.cells.markerBlock(e.corpseClass));
                    break;
                }
            }
            ctx.removed = true;
        }
        return;
    }
    if (e.state !== G.CORPSE_STATE || e.target !== "player")
        return;
    const R = draw(ctx.rng);
    const rounds = G.LOOT_ROUND_BASE + bits(R, G.LOOT_ROUND_SHIFT, G.LOOT_ROUND_MASK);
    if (ctx.inputs.loot === undefined)
        throw new OutsideSpecError("the corpse's loot needs the inventory (ZT-ENT-GUARD 4.9): not modelled by the caller");
    if (!ctx.inputs.loot(G.LOOT_ITEM, rounds * G.LOOT_AMOUNT_UNIT))
        return;
    e.state = G.LOOT_STATE;
    if (e.floor === ctx.inputs.playerFloor)
        soundRequest(ctx, G.LOOT_SOUND);
}
export function guardCall(e: GuardBody, inputs: AiInputs, peers: readonly GuardBody[], rng: Rng, emit: (ev: SoldierEvent) => void, ES: SoldierConstants, G: GuardConstants): GuardCallResult {
    if (e.target === "unknown")
        throw new OutsideSpecError("hidden.target is `unknown` (link play): not specified (ZT-ENT-GUARD 4.1)");
    e.timer = 0;
    const ctx: Ctx = {
        e,
        inputs,
        rng,
        emit,
        C: ES,
        start: { x: e.pos.x, y: e.pos.y },
        startIndex: moveIndex(e.pos.x, e.pos.y),
        target: targetOf(inputs),
        removed: false,
    };
    if (e.form === "corpse") {
        corpse(ctx, e, ES, G);
        return { removed: ctx.removed };
    }
    if (e.state === G.PAIN_STATE)
        pain(ctx, e, G);
    else if (e.state < G.WALK_STATE)
        wander(ctx, e, peers, ES, G);
    else if (e.state === G.WALK_STATE || e.state === G.STAND_STATE)
        walk(ctx, e, G);
    else
        throw new OutsideSpecError(`guard state ${e.state} in a live call is not specified (ZT-ENT-GUARD 4.1)`);
    return { removed: ctx.removed };
}
function unitAway(relx: number, rely: number, G: GuardConstants): {
    qx: number;
    qy: number;
} {
    const ux = s16(-relx);
    const uy = s16(-rely);
    const n = s16(octDist(ux, uy));
    if (n + 1 === 0)
        return { qx: s16(ux << G.UNIT_SHIFT), qy: s16(uy << G.UNIT_SHIFT) };
    return { qx: s16(divTrunc(ux * (1 << G.UNIT_SHIFT), n + 1)), qy: s16(divTrunc(uy * (1 << G.UNIT_SHIFT), n + 1)) };
}
export function corpseDamage(e: SoldierBody, impulse: number, relx: number, rely: number, G: GuardConstants): void {
    const { qx, qy } = unitAway(relx, rely, G);
    const loss = G.DAMAGE_BASE - impulse;
    e.vel.x = 0;
    e.vel.y = 0;
    if (loss < 0)
        return;
    const v = sar(loss, G.CORPSE_LOSS_SHIFT);
    e.vel.x = s16(sar(qx * v, G.VELOCITY_SHIFT));
    e.vel.y = s16(sar(qy * v, G.VELOCITY_SHIFT));
    e.counter = u8(e.counter + 1);
}
export function guardDamage(e: GuardBody, impulse: number, relx: number, rely: number, inputs: AiInputs, peers: readonly GuardBody[], rng: Rng, emit: (ev: SoldierEvent) => void, ES: SoldierConstants, G: GuardConstants): void {
    void ES;
    if (e.damageForm === "corpse") {
        corpseDamage(e, impulse, relx, rely, G);
        return;
    }
    const { qx, qy } = unitAway(relx, rely, G);
    const loss = G.DAMAGE_BASE - impulse;
    e.state = G.PAIN_STATE;
    e.counter = G.PAIN_COUNTER;
    e.vel.x = 0;
    e.vel.y = 0;
    if (loss < 0)
        return;
    let notLethal = true;
    if (s16(e.hp) >= 0) {
        e.hp = s16(e.hp - loss);
        if (e.hp < 0)
            notLethal = false;
    }
    let v: number;
    if (notLethal) {
        alert(e, targetOf(inputs), peers, rng, emit, G);
        v = G.PAIN_PUSH;
    }
    else {
        e.damageForm = "corpse";
        v = sar(loss, G.LETHAL_LOSS_SHIFT);
    }
    e.vel.x = s16(sar(qx * v, G.VELOCITY_SHIFT));
    e.vel.y = s16(sar(qy * v, G.VELOCITY_SHIFT));
}

import type { Entity, EntityTypeName, VectorName } from "../../world.js";
import { doorOpener } from "../door/core.js";
import { clamp, draw, octDist, s16, sar, u16, u8 } from "../hydaca/arith.js";
import type { SoldierConstants } from "../rend/sprite/constants.js";
import type { CellSource, Ctx, SoldierEvent } from "../soldier/common.js";
import { moveIndex } from "../soldier/common.js";
import { shotLineClear } from "../soldier/los.js";
import type { TickState } from "./core.js";
import { applySoldierEvents, guardedRequest, insertBySlot, lootInto, lowestFreeSlot, mapWrite, removeEntity, request } from "./core.js";
import { GRID_SIDE, RAY } from "./constants.js";
import { corpseCall, corpseEntry, endCall, guarded, halve, kindCall, kindDeath, liveDamage, moveBy, setFlags, watch } from "./kinds_common.js";
import { blockedAt, grenadeToBlast } from "./mine.js";
const LOOT_LASER_BIT = 16;
const LOOT_LASER_ITEM = 10;
const LOOT_LASER_ROUNDS = 2;
const LOOT_GRENADE_ITEM = 7;
const LOOT_GRENADE_ROUNDS = 1;
const LOOT_ROUND_SHIFT = 16;
const CHANGED_SECONDARY = "enemy.rec7.mp_secondary" as VectorName;
export const SF_TYPE = "enemy.rec7";
export const SERGEANT_TYPE = "enemy.rec0";
const GRENADE_AI = "grenade.thrown.ai";
const GRENADE_VECTORS = {
    damage: "mine.placed.damage" as VectorName,
    draw: "grenade.thrown.draw" as VectorName,
    ai: GRENADE_AI as VectorName,
    death: "remove" as VectorName,
    secondary: "none" as VectorName,
};
const GRENADE_TYPE = "unknown" as EntityTypeName;
const DOOR_CLASSES: readonly number[] = [6, 7];
export function isSfKind(e: Entity): boolean {
    return e.type === SF_TYPE || e.type === SERGEANT_TYPE;
}
export function isGrenade(e: Entity): boolean {
    return e.vec.ai === GRENADE_AI;
}
export function sfPass(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    if (!e.hidden)
        throw new Error(`entity slot ${e.slot}: an SF or a Sergeant without its hidden group (ZT-ENT-SF 2)`);
    guarded(state, e, notes, () => sfCall(state, e, cells, notes));
}
function sfCall(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    const F = state.env.SF;
    const S = state.env.SERGEANT;
    const h = e.hidden!;
    const p = state.world.player;
    const { ctx, events } = kindCall(state, e, cells, F);
    const t = ctx.target;
    const sgt = e.type === SERGEANT_TYPE;
    const onPlayerFloor = (): boolean => e.floor === state.world.level.sub_id;
    const toTarget = (): number => octDist(s16(e.pos.x - t.x), s16(e.pos.y - t.y));
    if (e.form === "corpse") {
        const K = { CORPSE_STAMP_RANGE: F.CORPSE_STAMP_RANGE, CORPSE_CLASS: e.cell_class.dead, CORPSE_RETARGET_MASK: state.env.DOG.CORPSE_RETARGET_MASK, CORPSE_STAMP_ORDER: state.env.DOG.CORPSE_STAMP_ORDER };
        corpseCall(state, e, ctx, cells, K, notes);
        applySoldierEvents(state, e, events, notes);
        if (state.world.entities.includes(e) && e.state === F.STATE_CORPSE && h.target === "player" && octDist(s16(e.pos.x - p.pos.x), s16(e.pos.y - p.pos.y)) < F.CORPSE_LOOT_RANGE) {
            const R = draw(state.rng);
            const laser = (R & LOOT_LASER_BIT) !== 0;
            const rounds = (laser ? LOOT_LASER_ROUNDS : LOOT_GRENADE_ROUNDS) + ((R >> LOOT_ROUND_SHIFT) & 1);
            if (lootInto(state, laser ? LOOT_LASER_ITEM : LOOT_GRENADE_ITEM, rounds * state.env.ES.CORPSE.LOOT_AMOUNT_UNIT)) {
                e.state = F.STATE_LOOTED;
                if (onPlayerFloor())
                    request(state, state.env.ES.CORPSE.LOOT_SOUND);
            }
        }
        return;
    }
    const plan = (): void => {
        if (e.hp < 0) {
            if (onPlayerFloor())
                events.push({ type: "Audio.Request", request: sgt ? S.DEATH_SOUND : F.DEATH_SOUND });
            kindDeath(state, e, F.CORPSE_FLAG_MASK, F.STATE_CORPSE, events, notes);
            return;
        }
        const d = toTarget();
        if (!sgt && d >= F.PLAN_FAR_RANGE) {
            h.waypoint.x = t.x;
            h.waypoint.y = t.y;
            e.counter = F.PLAN_FAR_COUNTER;
            e.state = F.STATE_WAIT;
            return;
        }
        const a = draw(state.rng);
        const b = draw(state.rng);
        e.counter = u8((d >> F.PLAN_DIST_SHIFT) + ((a >> 16) & (sgt ? S.PLAN_COUNTER_MASK : F.PLAN_COUNTER_MASK)));
        e.state = F.STATE_WAIT;
        const s = b >> F.PLAN_HOME_SHIFT;
        const ox = (s & F.PLAN_HOME_MASK) - F.PLAN_HOME_BIAS;
        const oy = ((s >> 16) & F.PLAN_HOME_MASK) - F.PLAN_HOME_BIAS;
        const odd = (e.tag & 1) !== 0;
        if (sgt) {
            const vx = sar(t.vx, 1);
            const vy = sar(t.vy, 1);
            h.waypoint.x = u16((odd ? t.x + vy : t.x - vy) + ox);
            h.waypoint.y = u16((odd ? t.y - vx : t.y + vx) + oy);
        }
        else {
            const hx = sar(t.vx, 1);
            const hy = sar(t.vy, 1);
            h.waypoint.x = u16((odd ? t.x + t.vy : t.x - t.vy) + hx + ox);
            h.waypoint.y = u16((odd ? t.y - t.vx : t.y + t.vx) + hy + oy);
        }
    };
    const walk = (): void => {
        const axis = (home: number, pos: number): number => clamp(sar(s16(home - pos), F.WALK_SHIFT), -F.WALK_LIMIT, F.WALK_LIMIT);
        const vx = axis(h.waypoint.x, e.pos.x);
        const vy = axis(h.waypoint.y, e.pos.y);
        e.vel.x = vx;
        e.vel.y = vy;
        const nx = u16(e.pos.x + vx);
        const ny = u16(e.pos.y + vy);
        const cls = cells.classOf(cells.block(moveIndex(nx, ny), e.floor));
        if (DOOR_CLASSES.includes(cls)) {
            doorOpener(state.doors, nx, ny, state.floorNumber, state.env.D);
            events.push({ type: "Audio.Request", request: state.env.BOSS.DOOR_SOUND });
        }
        moveBy(ctx, vx, vy);
    };
    const hitRoll = (): boolean => {
        const A = state.env.ES.AI;
        const eye = s16(p.eye_offset);
        const mode = cells.renderMode(state.world.level.sub_id);
        if (eye >= 0 && mode === A.NO_ROLL_MODE)
            return true;
        const threshold = eye >= 0 ? F.THRESH_GROUND : mode === A.NO_ROLL_MODE ? F.THRESH_AIR_MODE0 : F.THRESH_AIR;
        const R = draw(state.rng);
        return ((R >>> F.ROLL_SHIFT) & F.ROLL_MASK) < threshold;
    };
    const lineClear = (): boolean => shotLineClear(ctx, e.pos.x, e.pos.y);
    const cues = (): void => {
        if (!onPlayerFloor())
            return;
        events.push({ type: "Audio.Request", request: F.SOUND_A });
        events.push({ type: "Audio.Request", request: F.SOUND_B });
    };
    const shot = (): void => {
        if (!lineClear()) {
            plan();
            return;
        }
        if (hitRoll()) {
            const d = toTarget();
            if (d >= F.HIT_RANGE)
                return;
            events.push({ type: "Combat.Hit", target: "player", impulse: d, dx: s16(e.pos.x - t.x), dy: s16(e.pos.y - t.y) });
        }
        cues();
    };
    const attack = (): void => {
        e.counter = u8(e.counter - 1);
        if (e.counter === 0)
            plan();
        else if (e.counter === F.SHOT_COUNTER)
            shot();
        else if (e.counter === F.CUE_COUNTER_A || e.counter === F.CUE_COUNTER_B)
            cues();
    };
    const windup = (): void => {
        e.counter = u8(e.counter - 1);
        if (e.counter === 0)
            plan();
        else if (e.counter === F.THROW_COUNTER)
            throwGrenade(state, e, t, events);
    };
    if (e.state === F.STATE_HURT) {
        if (octDist(s16(e.vel.x), s16(e.vel.y)) >= F.HURT_STOP_SPEED) {
            moveBy(ctx, e.vel.x, e.vel.y);
            e.vel.x = sar(e.vel.x, F.HURT_VEL_SHIFT);
            e.vel.y = sar(e.vel.y, F.HURT_VEL_SHIFT);
        }
        else
            plan();
        endCall(state, e, ctx, events, notes);
        return;
    }
    if (sgt && e.state === S.CHANGE_STATE) {
        e.counter = u8(e.counter + 1);
        if (e.counter === S.CHANGE_CALLS) {
            const row = state.env.kinds.get(F.MARKER_CLASS);
            if (!row)
                throw new Error("enemy_descriptors.json has no row for the SF's marker class (ZT-ENT-SERGEANT 4.5)");
            e.type = SF_TYPE as Entity["type"];
            e.art = row.art as Entity["art"];
            e.cell_class = { alive: S.CHANGE_ALIVE_CLASS, dead: S.CHANGE_DEAD_CLASS };
            e.vec.ai = row.vectors.ai as VectorName;
            e.vec.draw = row.vectors.draw as VectorName;
            e.state = F.STATE_WAIT;
            e.vec.secondary = CHANGED_SECONDARY;
            delete h.change_timer;
        }
        endCall(state, e, ctx, events, notes);
        return;
    }
    if (sgt) {
        let timer = h.change_timer ?? 0;
        if (timer === 0) {
            const R = draw(state.rng);
            timer = S.LUNGE_TIMER_BASE + ((((R & 0xffff) >> S.LUNGE_TIMER_SHIFT)) & S.LUNGE_TIMER_MASK);
            h.change_timer = timer;
        }
        else {
            timer = u8(timer - 1);
            h.change_timer = timer;
            if (timer === 0) {
                e.state = S.CHANGE_STATE;
                h.waypoint.x = u16(e.pos.x + sar(s16(h.waypoint.x - e.pos.x), S.CHANGE_HOME_SHIFT));
                h.waypoint.y = u16(e.pos.y + sar(s16(h.waypoint.y - e.pos.y), S.CHANGE_HOME_SHIFT));
                e.counter = 1;
                endCall(state, e, ctx, events, notes);
                return;
            }
        }
    }
    walk();
    if (e.state === F.STATE_ATTACK)
        attack();
    else if (e.state === F.STATE_WINDUP)
        windup();
    else {
        e.counter = u8(e.counter - 1);
        if (e.counter !== 0)
            watch(ctx, e, F.MARKER_CLASS);
        else {
            e.state = F.STATE_ATTACK;
            e.counter = F.ATTACK_COUNTER;
            const R = draw(state.rng);
            if (((R >> 16) & (sgt ? S.ATTACK_ODDS_MASK : F.ATTACK_ODDS_MASK)) === 0 && toTarget() >= F.THROW_MIN_RANGE && lineClear()) {
                e.state = F.STATE_WINDUP;
                windup();
            }
            else
                attack();
        }
    }
    endCall(state, e, ctx, events, notes);
}
function throwGrenade(state: TickState, e: Entity, t: {
    readonly x: number;
    readonly y: number;
}, events: SoldierEvent[]): void {
    const F = state.env.SF;
    events.push({ type: "Audio.Request", request: F.THROW_SOUND });
    const slot = lowestFreeSlot(state.world);
    if (slot === null)
        return;
    const left = state.residue.get(slot);
    const vx = sar(s16(t.x - e.pos.x), F.GRENADE_SPEED_SHIFT);
    const vy = sar(s16(t.y - e.pos.y), F.GRENADE_SPEED_SHIFT);
    const g: Entity = {
        slot,
        type: GRENADE_TYPE,
        type_alias: null,
        form: "unknown",
        flags: { value: 0, in_use: false, on_floor: false, alive: false, link_mirror: false },
        vec: { ...GRENADE_VECTORS },
        timer: 0,
        pos: { x: u16(e.pos.x + sar(vx, 1)), y: u16(e.pos.y + sar(vy, 1)), z: F.GRENADE_START_Z },
        prev: { x: left?.prev.x ?? 0, y: left?.prev.y ?? 0 },
        vel: { x: vx, y: vy, z: F.GRENADE_START_VZ },
        floor: e.floor,
        state: F.GRENADE_LIFE,
        counter: left?.counter ?? 0,
        hp: left?.hp ?? 0,
        anim: left?.anim ?? 0,
        tag: slot + state.env.ES.TAG_OFFSET,
        art: left?.art ?? "none",
        cell_class: { alive: left?.cell_class.alive ?? 0, dead: left?.cell_class.dead ?? 0 },
    };
    setFlags(g, F.GRENADE_FLAGS);
    insertBySlot(state.world, g);
}
function explode(state: TickState, g: Entity, notes: string[]): void {
    const { env } = state;
    const F = env.SF;
    const col = u16(g.pos.x) >> env.R.CELL_SHIFT;
    const row = u16(g.pos.y) >> env.R.CELL_SHIFT;
    for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
            const cx = col + ox;
            const cy = row + oy;
            if (cx < 0 || cy < 0 || cx >= GRID_SIDE || cy >= GRID_SIDE)
                continue;
            const cls = env.classOfBlock[state.blocks[cy * GRID_SIDE + cx]!] ?? -1;
            const up = RAY.TILE_STEP_UP.find((pair) => pair[0] === cls);
            if (up === undefined)
                continue;
            const block = env.classOfBlock.findIndex((c) => c === up[1]);
            if (block < 0) {
                notes.push(`grenade: the level has no block of class ${up[1]} (ZT-ENT-SF 4.12 step 4): the wall is not stepped up`);
                continue;
            }
            mapWrite(state, g.floor, cx, cy, block, notes);
            guardedRequest(state, env.W.REQ_TILE_RAY);
        }
    }
    if (g.floor === state.floorNumber)
        request(state, F.GRENADE_BLAST_SOUND);
    grenadeToBlast(state, g, F.GRENADE_BLAST_FLAG_MASK);
}
export function grenadePass(state: TickState, e: Entity, _cells: CellSource, notes: string[]): void {
    const F = state.env.SF;
    e.timer = 0;
    const v = e.vel;
    if (v.x !== 0 || v.y !== 0) {
        const nx = u16(e.pos.x + v.x);
        const ny = u16(e.pos.y + v.y);
        if (!blockedAt(state, nx, ny)) {
            e.pos.x = nx;
            e.pos.y = ny;
        }
        else {
            const cx = u16(e.pos.x + v.x) >> state.env.R.CELL_SHIFT;
            const cy = u16(e.pos.y + v.y) >> state.env.R.CELL_SHIFT;
            const block = cx < 32 && cy < 32 ? state.blocks[cy * 32 + cx]! : -1;
            const absorb = RAY.ABSORB[state.world.level.episode.value];
            if (absorb !== undefined && absorb.includes(block)) {
                removeEntity(state, e);
                return;
            }
            request(state, F.GRENADE_BOUNCE_SOUND);
            const xFree = !blockedAt(state, nx, e.pos.y);
            const yFree = !blockedAt(state, e.pos.x, ny);
            const both = xFree === yFree;
            if (both || !xFree)
                v.x = sar(-v.x, 1);
            if (both || !yFree)
                v.y = sar(-v.y, 1);
            e.pos.x = u16(e.pos.x + v.x);
            e.pos.y = u16(e.pos.y + v.y);
        }
    }
    e.pos.z = s16(e.pos.z + v.z);
    if (e.pos.z > F.GRENADE_FLOOR_Z)
        v.z = s16(v.z - F.GRENADE_GRAVITY);
    else {
        e.pos.z = F.GRENADE_FLOOR_Z;
        if (v.z !== 0) {
            const b = sar(s16(-(v.z - F.GRENADE_GRAVITY)), F.GRENADE_BOUNCE_SHIFT);
            v.z = b < F.GRENADE_BOUNCE_MIN ? 0 : b;
            request(state, F.GRENADE_BOUNCE_SOUND);
        }
        v.x = halve(v.x);
        v.y = halve(v.y);
    }
    e.state = u8(e.state - 1);
    if (e.state !== 0)
        return;
    explode(state, e, notes);
}
export function sfDamage(state: TickState, e: Entity, d: number, dx: number, dy: number, mark: number, particles: boolean): void {
    const F = state.env.SF;
    const S = state.env.SERGEANT;
    if (e.form === "corpse") {
        corpseEntry(state, e, d, dx, dy, F, true);
        return;
    }
    const sgtRow = state.env.kinds.get(S.MARKER_CLASS);
    const sergeantEntry = sgtRow !== undefined && e.vec.damage === sgtRow.vectors.damage;
    if (!sergeantEntry) {
        liveDamage(state, e, d, dx, dy, mark, F.STATE_HURT, F, true, particles);
        return;
    }
    const loss = liveDamage(state, e, d, dx, dy, mark, F.STATE_HURT, F, false, particles);
    if (loss !== null && e.hp >= 0 && e.type === SERGEANT_TYPE && e.hidden)
        e.hidden.change_timer = S.HURT_TIMER;
}
export function grenadeHit(state: TickState, e: Entity, impulse: number, notes: string[]): void {
    if (!isGrenade(e))
        return;
    if (u16(impulse) < state.env.SF.GRENADE_SHOT_LIMIT)
        explode(state, e, notes);
}

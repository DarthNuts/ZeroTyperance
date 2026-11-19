import type { Entity, VectorName } from "../../world.js";
import { doorOpener } from "../door/core.js";
import { clamp, divTrunc, draw, octDist, s16, sar, u16, u8 } from "../hydaca/arith.js";
import type { SoldierConstants } from "../rend/sprite/constants.js";
import type { AiInputs, CellSource, Ctx, SoldierBody, SoldierEvent } from "../soldier/common.js";
import { GRID_SIDE, OutsideSpecError, WINDOW_RADIUS, moveIndex, targetOf } from "../soldier/common.js";
import { burstCount, particleOf } from "../soldier/damage.js";
import { shotLineClear } from "../soldier/los.js";
import { moveWith } from "../soldier/walk.js";
import { FLAG_ALIVE, FLAG_IN_USE, FLAG_ON_FLOOR } from "./constants.js";
import { wallClassBlocks } from "./flame.js";
import type { TickState } from "./core.js";
import { applySoldierEvents, seatBodies, insertBySlot, lowestFreeSlot, liveParticles, mapWrite, particleEntity, removeEntity, armExitCountdown } from "./core.js";
export const BOSS_TYPE = "enemy.rec5";
export const BOSS_ALIAS = "boss";
export const SHOT_AI = "projectile.shot.ai";
const CORPSE_VECTORS = {
    ai: "enemy.rec5.corpse.ai" as VectorName,
    draw: "enemy.rec5.corpse.draw" as VectorName,
    damage: "enemy.rec5.corpse.damage" as VectorName,
    death: "enemy.corpse_death.b" as VectorName,
};
const SHOT_VECTORS = {
    damage: "none" as VectorName,
    draw: "projectile.shot.draw" as VectorName,
    ai: SHOT_AI as VectorName,
    death: "remove" as VectorName,
    secondary: "none" as VectorName,
};
const BOSS_PAIN_STATE = 2;
const SHOT_FLAGS = 1;
export function isBoss(e: Entity): boolean {
    return e.type === BOSS_TYPE;
}
export function isShot(e: Entity): boolean {
    return e.vec.ai === SHOT_AI;
}
const bossMoveConstants = new WeakMap<SoldierConstants, SoldierConstants>();
function moveConstantsOf(state: TickState): SoldierConstants {
    const ES = state.env.ES;
    let C = bossMoveConstants.get(ES);
    if (!C) {
        const B = state.env.BOSS;
        C = { ...ES, AI: { ...ES.AI, PUSH_LOW: B.PUSH_LOW, PUSH_HIGH: B.PUSH_HIGH, MAGNET_LIMIT: B.MAGNET_LIMIT, MAGNET_SHIFT: B.MAGNET_SHIFT } } as SoldierConstants;
        bossMoveConstants.set(ES, C);
    }
    return C;
}
const bossLosConstants = new WeakMap<SoldierConstants, SoldierConstants>();
function losConstantsOf(state: TickState): SoldierConstants {
    const ES = state.env.ES;
    let C = bossLosConstants.get(ES);
    if (!C) {
        C = { ...ES, AI: { ...ES.AI, PROBE_OFFSET: state.env.BOSS.LOS_PROBE } } as SoldierConstants;
        bossLosConstants.set(ES, C);
    }
    return C;
}
export function windowOf(cells: CellSource, e: Entity): (number | null)[] {
    const own = moveIndex(e.pos.x, e.pos.y);
    const out: (number | null)[] = [];
    for (let dy = -WINDOW_RADIUS; dy <= WINDOW_RADIUS; dy++) {
        for (let dx = -WINDOW_RADIUS; dx <= WINDOW_RADIUS; dx++) {
            try {
                out.push(cells.block(own + dy * GRID_SIDE + dx, e.floor));
            }
            catch (err) {
                if (err instanceof OutsideSpecError)
                    out.push(null);
                else
                    throw err;
            }
        }
    }
    return out;
}
export function ctxOf(state: TickState, e: Entity, cells: CellSource, C: SoldierConstants, events: SoldierEvent[]): Ctx {
    const h = e.hidden!;
    const p = state.world.player;
    const inputs: AiInputs = {
        player: { x: p.pos.x, y: p.pos.y, angle: p.angle, eyeOffset: p.eye_offset },
        playerFloor: state.world.level.sub_id,
        phase: state.world.core.phase,
        view: state.env.view,
        cells,
        ...seatBodies(state, e.floor),
    };
    const body: SoldierBody = {
        pos: e.pos,
        vel: e.vel,
        state: e.state,
        counter: e.counter,
        timer: e.timer,
        hp: e.hp,
        flags: e.flags.value,
        form: e.form === "corpse" ? "corpse" : "live",
        hitMark: 0,
        floor: e.floor,
        tag: e.tag,
        home: h.waypoint,
        target: h.target === "none" ? "none" : "player",
        cellsAround: h.cells_around,
    };
    return {
        e: body,
        inputs,
        rng: state.rng,
        emit: (ev) => events.push(ev),
        C,
        start: { x: e.pos.x, y: e.pos.y },
        startIndex: moveIndex(e.pos.x, e.pos.y),
        target: targetOf(inputs),
        removed: false,
    };
}
export function bossPass(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    if (!e.hidden)
        throw new Error(`entity slot ${e.slot}: a boss without its hidden group (ZT-ENT-BOSS 2)`);
    try {
        bossCall(state, e, cells, notes);
    }
    catch (err) {
        if (!(err instanceof OutsideSpecError))
            throw err;
        const key = `${e.slot}:${err.message}`;
        if (!state.notedKinds.has(key)) {
            state.notedKinds.add(key);
            notes.push(`entity slot ${e.slot}: ${err.message}: the call is not run`);
        }
    }
}
function bossCall(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    const B = state.env.BOSS;
    const h = e.hidden!;
    h.cells_around = windowOf(cells, e);
    e.timer = 0;
    const events: SoldierEvent[] = [];
    const bossCtx = ctxOf(state, e, cells, moveConstantsOf(state), events);
    const t = bossCtx.target;
    let removed = false;
    const blockC = (): void => {
        if (e.hp < 0) {
            defeat(state, e, events);
            return;
        }
        e.state = 0;
        const R = draw(state.rng);
        const s = R >> B.HOME_SHIFT;
        const mask = B.HOME_MASK;
        h.waypoint.x = u16(((s & mask) - B.HOME_BIAS) + t.x - t.vx);
        h.waypoint.y = u16((((s >> B.HOME_Y_SHIFT) & mask) - B.HOME_BIAS) + t.y - t.vy);
    };
    const blockB = (): void => {
        const R = draw(state.rng);
        const r = (R >>> B.HEADING_RAND_SHIFT) & B.HEADING_RAND_MASK;
        e.counter = u8((octDist(s16(e.pos.x - t.x), s16(e.pos.y - t.y)) >> B.HEADING_DIST_SHIFT) + r);
        blockC();
    };
    if (e.state === 3) {
        removed = defeatedCall(state, e, bossCtx, cells, B, notes);
    }
    else if (e.state === 2) {
        e.counter = B.PAIN_COUNTER;
        if (octDist(s16(e.vel.x), s16(e.vel.y)) >= B.PAIN_STOP_SPEED) {
            moveWith(bossCtx, e.vel.x, e.vel.y);
            e.vel.x = sar(e.vel.x, B.PAIN_VEL_SHIFT);
            e.vel.y = sar(e.vel.y, B.PAIN_VEL_SHIFT);
        }
        else {
            blockC();
        }
    }
    else {
        const A = state.env.ES.AI;
        const axis = (home: number, pos: number): number => clamp(sar(s16(home - pos), B.WALK_SHIFT), -B.WALK_LIMIT, B.WALK_LIMIT);
        const vx = axis(h.waypoint.x, e.pos.x);
        const vy = axis(h.waypoint.y, e.pos.y);
        e.vel.x = vx;
        e.vel.y = vy;
        const px = u16(e.pos.x + B.PROBE_STEPS * vx);
        const py = u16(e.pos.y + B.PROBE_STEPS * vy);
        const cls = cells.classOf(cells.block(moveIndex(px, py), e.floor));
        if (cls !== 0 && (B.DOOR_CLASSES_A.includes(cls) || B.DOOR_CLASSES_B.includes(cls))) {
            doorOpener(state.doors, px, py, state.floorNumber, state.env.D);
            e.pos.x = px;
            e.pos.y = py;
            events.push({ type: "Audio.Request", request: B.DOOR_SOUND });
        }
        moveWith(bossCtx, vx - sar(vx, B.MOVE_SLOW_SHIFT), vy - sar(vy, B.MOVE_SLOW_SHIFT));
        let toLine = false;
        if (e.state === 0) {
            e.counter = u8(e.counter - 1);
            if (e.counter !== 0) {
                if ((u8(state.world.core.phase + e.tag) & A.RETARGET_MASK) === 0) {
                    if (e.floor === state.world.level.sub_id)
                        h.target = "player";
                    else {
                        h.target = "none";
                        removed = foldBack(state, e, cells, events, B.MARKER_CLASS);
                    }
                }
            }
            else {
                e.state = 1;
                e.counter = B.WINDUP_COUNTER;
                toLine = true;
            }
        }
        else
            toLine = true;
        if (toLine && !removed) {
            e.counter = u8(e.counter - 1);
            if (e.counter === 0)
                blockB();
            else if (e.counter === B.SHOT_COUNTER) {
                if (!shotLineClear({ ...bossCtx, C: losConstantsOf(state), target: t } as Ctx, e.pos.x, e.pos.y))
                    blockB();
                else
                    fireShot(state, e, t, events);
            }
        }
    }
    if (removed)
        removeEntity(state, e);
    applySoldierEvents(state, e, events, notes, false);
}
export function foldBack(state: TickState, e: Entity, cells: CellSource, events: SoldierEvent[], markerClass: number): boolean {
    const own = moveIndex(e.pos.x, e.pos.y);
    const col = u16(e.pos.x) >>> 8;
    const row = u16(e.pos.y) >>> 8;
    for (const [ox, oy] of state.env.ES.AI.FOLD_ORDER) {
        if (cells.block(own + oy! * GRID_SIDE + ox!, e.floor) === 0) {
            events.push({ type: "Map.Write", floor: e.floor, x: col + ox!, y: row + oy!, block: cells.markerBlock(markerClass) });
            return true;
        }
    }
    events.push({ type: "Floor.Recount" });
    return true;
}
function fireShot(state: TickState, e: Entity, t: {
    x: number;
    y: number;
}, events: SoldierEvent[]): void {
    const B = state.env.BOSS;
    const slot = lowestFreeSlot(state.world);
    if (slot === null)
        return;
    const R = draw(state.rng);
    const vz = ((R >>> B.SHOT_VZ_SHIFT) & B.SHOT_VZ_MASK) - B.SHOT_VZ_BIAS;
    const dx = s16(t.x - e.pos.x);
    const dy = s16(t.y - e.pos.y);
    const m = s16((octDist(dx, dy) >>> B.SHOT_STEP_SHIFT) + 1);
    const vx = s16(divTrunc(dx, m));
    const vy = s16(divTrunc(dy, m));
    const left = state.residue.get(slot);
    insertBySlot(state.world, {
        slot,
        type: "unknown",
        type_alias: null,
        form: "unknown",
        flags: { value: SHOT_FLAGS, in_use: true, on_floor: false, alive: false, link_mirror: false },
        vec: { ...SHOT_VECTORS },
        timer: 0,
        pos: { x: u16(e.pos.x + sar(vx, B.SHOT_START_HALF_SHIFT)), y: u16(e.pos.y + sar(vy, B.SHOT_START_HALF_SHIFT)), z: B.SHOT_START_Z },
        prev: { x: left?.prev.x ?? 0, y: left?.prev.y ?? 0 },
        vel: { x: vx, y: vy, z: vz },
        floor: e.floor,
        state: 0,
        counter: left ? left.counter : 0,
        hp: left ? left.hp : 0,
        anim: left ? left.anim : 0,
        tag: slot + state.env.ES.TAG_OFFSET,
        art: left ? left.art : "none",
        cell_class: left ? { alive: left.cell_class.alive, dead: left.cell_class.dead } : { alive: 0, dead: 0 },
    });
    events.push({ type: "Audio.Request", request: B.SHOT_SOUND });
}
function defeat(state: TickState, e: Entity, events: SoldierEvent[]): void {
    const B = state.env.BOSS;
    armExitCountdown(state, B.EXIT_START);
    e.flags.value = e.flags.value & B.CORPSE_FLAG_MASK;
    e.flags.in_use = (e.flags.value & FLAG_IN_USE) !== 0;
    e.flags.on_floor = (e.flags.value & FLAG_ON_FLOOR) !== 0;
    e.flags.alive = (e.flags.value & FLAG_ALIVE) !== 0;
    e.form = "corpse";
    e.vec.ai = CORPSE_VECTORS.ai;
    e.vec.draw = CORPSE_VECTORS.draw;
    e.vec.damage = CORPSE_VECTORS.damage;
    e.vec.death = CORPSE_VECTORS.death;
    e.timer = 0;
    e.vel.x = 0;
    e.vel.y = 0;
    e.state = 3;
    events.push({ type: "Floor.Recount" });
    events.push({ type: "Audio.Request", request: B.DEFEAT_SOUND });
}
function halve(v: number): number {
    return Math.trunc(v / 2);
}
export function defeatedCall(state: TickState, e: Entity, ctx: Ctx, cells: CellSource, B: {
    readonly CORPSE_STAMP_RANGE: number;
    readonly CORPSE_CLASS: number;
    readonly CORPSE_STAMP_ORDER: ReadonlyArray<readonly [
        number,
        number
    ]>;
}, _notes: string[]): boolean {
    const h = e.hidden!;
    e.vel.x = halve(e.vel.x);
    e.vel.y = halve(e.vel.y);
    if (e.vel.x !== 0 || e.vel.y !== 0)
        moveWith({ ...ctx, C: state.env.ES }, e.vel.x, e.vel.y);
    const p = state.world.player;
    const d = octDist(s16(e.pos.x - p.pos.x), s16(e.pos.y - p.pos.y));
    if ((u8(state.world.core.phase + e.tag) & 3) === 0)
        h.target = e.floor === state.world.level.sub_id ? "player" : "none";
    if (!(d >= B.CORPSE_STAMP_RANGE))
        return false;
    const own = moveIndex(e.pos.x, e.pos.y);
    const col = u16(e.pos.x) >>> 8;
    const row = u16(e.pos.y) >>> 8;
    for (const [ox, oy] of B.CORPSE_STAMP_ORDER) {
        let block: number;
        try {
            block = cells.block(own + oy * GRID_SIDE + ox, e.floor);
        }
        catch (err) {
            if (err instanceof OutsideSpecError)
                continue;
            throw err;
        }
        if (block === 0) {
            mapWrite(state, e.floor, col + ox, row + oy, cells.markerBlock(B.CORPSE_CLASS), _notes);
            return true;
        }
    }
    return false;
}
export function shotPass(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    const B = state.env.BOSS;
    const p = state.world.player;
    e.timer = 0;
    e.pos.z = clamp(e.pos.z + e.vel.z, -B.SHOT_Z_LIMIT, B.SHOT_Z_LIMIT);
    const nx = u16(e.pos.x + e.vel.x);
    const ny = u16(e.pos.y + e.vel.y);
    let cls: number;
    try {
        cls = cells.classOf(cells.block(moveIndex(nx, ny), e.floor));
    }
    catch (err) {
        if (!(err instanceof OutsideSpecError))
            throw err;
        const key = `${e.slot}:${err.message}`;
        if (!state.notedKinds.has(key)) {
            state.notedKinds.add(key);
            notes.push(`entity slot ${e.slot}: ${err.message}: the shot's call is not run`);
        }
        return;
    }
    if (wallClassBlocks(state, cls, nx, ny)) {
        removeEntity(state, e);
        return;
    }
    e.pos.x = nx;
    e.pos.y = ny;
    const dx = s16(e.pos.x - p.pos.x);
    const dy = s16(e.pos.y - p.pos.y);
    if (octDist(s16(p.pos.x - e.pos.x), s16(p.pos.y - e.pos.y)) > B.SHOT_HIT_RANGE)
        return;
    const z = e.pos.z;
    const eye = p.eye_offset;
    const hits = Math.abs(z) <= B.SHOT_HIT_Z || (z > B.SHOT_HIT_Z && eye >= 0) || (z < -B.SHOT_HIT_Z && eye <= 0);
    if (!hits)
        return;
    removeEntity(state, e);
    applySoldierEvents(state, e, [
        { type: "Combat.Hit", target: "player", impulse: B.SHOT_IMPULSE, dx, dy },
        { type: "Audio.Request", request: B.SHOT_HIT_SOUND },
    ], notes);
}
export function bossDamage(state: TickState, e: Entity, impulse: number, dx: number, dy: number, _mark: number, _notes: string[]): void {
    walkerDamage(state, e, impulse, dx, dy, state.env.BOSS, BOSS_PAIN_STATE);
}
export interface WalkerDamage {
    readonly EXPOSED_MIN_COUNTER: number;
    readonly DMG_BASE: number;
    readonly DMG_VEL_SHIFT: number;
    readonly BURST_LOSS: number;
    readonly BURST_CALLS: number;
}
export function walkerDamage(state: TickState, e: Entity, impulse: number, dx: number, dy: number, B: WalkerDamage, painState: number): void {
    const ES = state.env.ES;
    if (!(e.state === 0 && e.counter >= B.EXPOSED_MIN_COUNTER))
        return;
    e.state = painState;
    e.counter = 0;
    e.vel.x = 0;
    e.vel.y = 0;
    const ax = s16(-dx);
    const ay = s16(-dy);
    const n = u16(octDist(ax, ay) + 1);
    let qx = s16(ax * (1 << ES.DMG.UNIT_SHIFT));
    let qy = s16(ay * (1 << ES.DMG.UNIT_SHIFT));
    if (n !== 0) {
        qx = s16(divTrunc(ax * (1 << ES.DMG.UNIT_SHIFT), n));
        qy = s16(divTrunc(ay * (1 << ES.DMG.UNIT_SHIFT), n));
    }
    const loss = s16(B.DMG_BASE - impulse);
    if (loss < 0)
        return;
    if (e.hp >= 0) {
        e.hp = s16(e.hp - loss);
        if (e.hp < 0) {
            const burst = { loss: B.BURST_LOSS, qx, qy };
            for (let k = 0; k < B.BURST_CALLS; k++) {
                const count = burstCount(B.BURST_LOSS, ES);
                for (let i = 0; i < count; i++) {
                    if (liveParticles(state) >= ES.BURST.LIVE_MAX)
                        break;
                    const slot = lowestFreeSlot(state.world);
                    if (slot === null)
                        break;
                    const R = draw(state.rng);
                    const init = particleOf({ x: e.pos.x, y: e.pos.y }, burst, R, ES);
                    insertBySlot(state.world, particleEntity(state, slot, init.pos, init.vel, init.state));
                }
            }
        }
    }
    const v = s16(sar(loss, B.DMG_VEL_SHIFT));
    e.vel.x = s16(sar(qx * v, ES.DMG.UNIT_SHIFT));
    e.vel.y = s16(sar(qy * v, ES.DMG.UNIT_SHIFT));
}

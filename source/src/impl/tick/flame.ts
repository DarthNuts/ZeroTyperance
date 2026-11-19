import type { Entity } from "../../world.js";
import type { CellSource } from "../soldier/common.js";
import { OutsideSpecError, losIndex } from "../soldier/common.js";
import { shotTarget } from "../soldier/damage.js";
import { divTrunc, draw, octDist, s16, sar, u16, u8 } from "../hydaca/arith.js";
import { SPECIAL_CORPSE, VECTORS as HYD_VECTORS } from "../hydaca/constants.js";
import { playerHit } from "../player_hit/core.js";
import { eachAliveSeat, partnerBody } from "./friendly.js";
import { areaHit } from "./area_damage.js";
import { isKindRecord } from "./kinds.js";
import { FLAG_ALIVE, FLAG_IN_USE, GRID_SIDE } from "./constants.js";
import { drainHitMessages, hitPlayerOf, insertBySlot, liveParticles, lowestFreeSlot, mapWrite, particleEntity, recount, removeEntity, request, writeHitPlayer, } from "./core.js";
import type { TickState } from "./core.js";
import type { FlameMem } from "./kept.js";
export const FLAME_STREAM_AI = "flame.stream.ai";
export const FLAME_STREAM_AI_IN_WALL = "flame.stream.ai_in_wall";
export const FLAME_GROUND_AI = "flame.ground.ai";
export const FLAME_GROUND_DRAW = "flame.ground.draw";
export const FLAME_STREAM_DRAW = "projectile.rocket.draw";
export const GIB_AI = "enemy.gib.ai";
const FLAME_MARK = 1;
const VIEW_QUARTER_SHIFT = 2;
const SPREAD_MASK = 31;
const SPREAD_BIAS = 16;
const RETARGET_MASK = 3;
const LOW_MAX = 255;
const CELL_SHIFT = 8;
const FUSE_ADD = 1;
const WALL_FREE = 0;
const WALL_DIAG_FIRST = 2;
const WALL_DIAG_LAST = 5;
export function isFlameRecord(e: Entity): boolean {
    return e.vec.ai === FLAME_STREAM_AI || e.vec.ai === FLAME_STREAM_AI_IN_WALL || e.vec.ai === FLAME_GROUND_AI;
}
export function isGib(e: Entity): boolean {
    return e.vec.ai === GIB_AI;
}
function flameMemOf(state: TickState, e: Entity): FlameMem | undefined {
    const m = state.kept.flames.get(e.slot);
    return m !== undefined && m.tag === e.tag && m.x === e.pos.x && m.y === e.pos.y ? m : undefined;
}
export function groundFlameMade(state: TickState, e: Entity): void {
    state.kept.flames.set(e.slot, { age: 0, tag: e.tag, x: e.pos.x, y: e.pos.y });
}
export function groundFlamesFromRecord(state: TickState, entities: readonly Entity[], ages: readonly {
    slot: number;
    age: number;
}[] | undefined, notes: string[]): void {
    for (const a of ages ?? []) {
        const e = entities.find((x) => x.slot === a.slot);
        if (e === undefined || e.vec.ai !== FLAME_GROUND_AI) {
            notes.push(`hidden flames lists slot ${a.slot}, which holds no ground flame in the record: ignored`);
            continue;
        }
        state.kept.flames.set(e.slot, { age: a.age, tag: e.tag, x: e.pos.x, y: e.pos.y });
    }
}
export function groundFlamesHidden(state: TickState, entities: readonly Entity[]): {
    slot: number;
    age: number;
}[] {
    const out: {
        slot: number;
        age: number;
    }[] = [];
    for (const e of entities) {
        if (e.vec.ai !== FLAME_GROUND_AI)
            continue;
        const m = flameMemOf(state, e);
        if (m !== undefined)
            out.push({ slot: e.slot, age: m.age });
    }
    return out;
}
export function flameAgeOf(state: TickState, slot: number): number | null {
    const e = state.world.entities.find((x) => x.slot === slot);
    if (e === undefined || e.vec.ai !== FLAME_GROUND_AI)
        return null;
    const m = flameMemOf(state, e);
    return m === undefined ? null : m.age;
}
function blockAtPoint(cells: CellSource, x: number, y: number, floor: number): number | null {
    const col = u16(x) >>> CELL_SHIFT;
    const row = u16(y) >>> CELL_SHIFT;
    if (col >= GRID_SIDE || row >= GRID_SIDE)
        return null;
    try {
        return cells.block(col + row * GRID_SIDE, floor);
    }
    catch (err) {
        if (err instanceof OutsideSpecError)
            return null;
        throw err;
    }
}
function wallBlocked(state: TickState, cells: CellSource, x: number, y: number, floor: number): boolean {
    const block = blockAtPoint(cells, x, y, floor);
    if (block === null)
        return true;
    return wallClassBlocks(state, cells.classOf(block), x, y);
}
export function wallClassBlocks(state: TickState, cls: number, x: number, y: number): boolean {
    const F = state.env.FLAME;
    const value = F.WALL_TABLE[cls] ?? WALL_FREE;
    if (value === WALL_FREE)
        return false;
    if (value >= WALL_DIAG_FIRST && value <= WALL_DIAG_LAST) {
        const xl = u16(x) & LOW_MAX;
        const yl = u16(y) & LOW_MAX;
        switch (value) {
            case 2: return xl > yl;
            case 3: return xl > LOW_MAX - yl;
            case 4: return xl < yl;
            default: return xl < LOW_MAX - yl;
        }
    }
    return true;
}
function lineClear(state: TickState, cells: CellSource, floor: number, ax: number, ay: number, bx: number, by: number): boolean {
    const A = state.env.ES.AI;
    const n = octDist(s16(bx - ax), s16(by - ay)) >>> A.LOS_STEP_SHIFT;
    if (n < A.LOS_MIN_STEPS)
        return true;
    const sx = divTrunc(s16(bx - ax), n);
    const sy = divTrunc(s16(by - ay), n);
    for (let k = 1; k <= n - 1; k++) {
        const qx = u16(ax + k * sx);
        const qy = u16(ay + k * sy);
        let block: number;
        try {
            block = cells.block(losIndex(qx, qy), floor);
        }
        catch (err) {
            if (err instanceof OutsideSpecError)
                continue;
            throw err;
        }
        const value = A.LOS_CLASS_VALUES.get(cells.classOf(block)) ?? 0;
        const xf = qx & LOW_MAX;
        const yf = qy & LOW_MAX;
        let blocked: boolean;
        switch (value) {
            case 1:
            case 6:
            case 7:
                blocked = true;
                break;
            case 2:
                blocked = xf > yf;
                break;
            case 3:
                blocked = xf + yf > LOW_MAX;
                break;
            case 4:
                blocked = xf < yf;
                break;
            case 5:
                blocked = xf + yf < LOW_MAX;
                break;
            default: blocked = false;
        }
        if (blocked)
            return false;
    }
    return true;
}
export function flamePass(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    e.timer = 0;
    if (e.vec.ai === FLAME_STREAM_AI || e.vec.ai === FLAME_STREAM_AI_IN_WALL)
        streamTurn(state, e, cells, notes);
    else if (e.vec.ai === FLAME_GROUND_AI)
        groundTurn(state, e);
    else if (isGib(e))
        pileTurn(state, e, cells, notes);
}
function streamTurn(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    const F = state.env.FLAME;
    e.state = u8(e.state - 1);
    if (e.state === 0) {
        burst(state, e, cells, notes);
        return;
    }
    e.pos.z = s16(e.pos.z - e.vel.z);
    e.vel.z = s16(e.vel.z + 1);
    if (e.pos.z < F.Z_BURST) {
        burst(state, e, cells, notes);
        return;
    }
    const nx = u16(e.pos.x + e.vel.x);
    const ny = u16(e.pos.y + e.vel.y);
    if (wallBlocked(state, cells, nx, ny, e.floor)) {
        burst(state, e, cells, notes);
        return;
    }
    e.pos.x = nx;
    e.pos.y = ny;
}
function burst(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    const { world, env } = state;
    const F = env.FLAME;
    const ES = env.ES;
    const victimMask = ES.HIT.FLAG_MASKS.eye_zero | ES.HIT.FLAG_MASKS.eye_positive | ES.HIT.FLAG_MASKS.eye_negative;
    for (const v of [...world.entities]) {
        if (v === e || (v.flags.value & victimMask) === 0 || v.floor !== e.floor)
            continue;
        const dx = s16(e.pos.x - v.pos.x);
        const dy = s16(e.pos.y - v.pos.y);
        const d = octDist(dx, dy);
        if (d > F.RANGE_MAX)
            continue;
        if (!lineClear(state, cells, e.floor, v.pos.x, v.pos.y, e.pos.x, e.pos.y))
            continue;
        victimHit(state, v, d, dx, dy, FLAME_MARK, notes);
    }
    eachAliveSeat(state, () => { if (e.floor === state.world.level.sub_id)
        burnPlayer(state, e, cells); });
    if (world.level.sub_id === F.SOUND_FLOOR)
        request(state, F.SOUND_BURST);
    e.pos.z = F.FLAME_Z;
    e.vec.ai = FLAME_GROUND_AI as Entity["vec"]["ai"];
    e.vec.draw = FLAME_GROUND_DRAW as Entity["vec"]["draw"];
    state.kept.flames.set(e.slot, { age: 0, tag: e.tag, x: e.pos.x, y: e.pos.y });
}
function victimHit(state: TickState, v: Entity, d: number, dx: number, dy: number, mark: number, notes: string[]): void {
    const ES = state.env.ES;
    const isSoldierLive = v.type === "enemy.rec1" && v.vec.damage === ES.SPAWN_VECTORS.damage;
    const isCrabKind = v.type === "enemy.rec3";
    if (isSoldierLive && v.hp < 0) {
    }
    else {
        areaHit(state, v, d, dx, dy, mark, false, notes);
    }
    const at = state.world.entities.find((x) => x.slot === v.slot);
    if (at !== undefined && (isSoldierLive || isCrabKind || at.type === "enemy.rec1" || isGib(at) || at.type === "enemy.gib" || isKindRecord(at))) {
        at.vel.x = 0;
        at.vel.y = 0;
    }
}
function burnPlayer(state: TickState, e: Entity, cells: CellSource): void {
    const { world, env } = state;
    const F = env.FLAME;
    const p = world.player;
    const dx = s16(e.pos.x - p.pos.x);
    const dy = s16(e.pos.y - p.pos.y);
    const d = octDist(dx, dy);
    if (d >= F.BURN_RANGE)
        return;
    if (!lineClear(state, cells, e.floor, p.pos.x, p.pos.y, e.pos.x, e.pos.y))
        return;
    const h = hitPlayerOf(state);
    const suit = p.passive.fire_proof_suit;
    if (suit >= 0) {
        h.inventory[suit]!.amount = Math.max(0, h.inventory[suit]!.amount - env.W.AMMO_STEP);
        writeHitPlayer(state, h);
        return;
    }
    const vest = h.vestSlot;
    h.vestSlot = -1;
    playerHit(h, state.hit, { impulse: 0, dx, dy }, env.H);
    h.vestSlot = vest;
    writeHitPlayer(state, h);
    drainHitMessages(state);
}
function groundTurn(state: TickState, e: Entity): void {
    let m = flameMemOf(state, e);
    if (m === undefined) {
        m = { age: 0, tag: e.tag, x: e.pos.x, y: e.pos.y };
        state.kept.flames.set(e.slot, m);
        return;
    }
    m.age += 1;
    if (m.age >= state.env.FLAME.FLAME_LIFE) {
        state.kept.flames.delete(e.slot);
        removeEntity(state, e);
    }
}
function pileTurn(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    const { world, env } = state;
    const F = env.FLAME;
    let m = state.kept.piles.get(e.slot);
    if (m === undefined || m.tag !== e.tag || m.x !== e.pos.x || m.y !== e.pos.y) {
        m = { tag: e.tag, x: e.pos.x, y: e.pos.y, target: e.floor === world.level.sub_id ? "player" : "none" };
        state.kept.piles.set(e.slot, m);
    }
    else if (((world.core.phase + e.tag) & RETARGET_MASK) === 0) {
        m.target = e.floor === world.level.sub_id ? "player" : "none";
    }
    const far = m.target === "none" || octDist(s16(e.pos.x - world.player.pos.x), s16(e.pos.y - world.player.pos.y)) >= F.FOLD_DIST;
    if (!far)
        return;
    const col = u16(e.pos.x) >>> CELL_SHIFT;
    const row = u16(e.pos.y) >>> CELL_SHIFT;
    for (const [ox, oy] of F.FOLD_ORDER) {
        const x = col + ox;
        const y = row + oy;
        if (x < 0 || y < 0 || x >= GRID_SIDE || y >= GRID_SIDE)
            continue;
        let block: number;
        try {
            block = cells.block(x + y * GRID_SIDE, e.floor);
        }
        catch (err) {
            if (err instanceof OutsideSpecError)
                continue;
            throw err;
        }
        if (block !== 0)
            continue;
        mapWrite(state, e.floor, x, y, F.PILE_BLOCK, notes);
        break;
    }
    state.kept.piles.delete(e.slot);
    removeEntity(state, e);
}
export function soldierGibDeath(state: TickState, e: Entity, notes: string[]): void {
    const { env } = state;
    const ES = env.ES;
    e.type = SPECIAL_CORPSE.type;
    e.type_alias = null;
    delete e.hidden;
    e.form = "corpse";
    e.vec.ai = HYD_VECTORS.special.ai;
    e.vec.damage = HYD_VECTORS.special.damage;
    e.vec.draw = HYD_VECTORS.special.draw;
    e.vec.death = HYD_VECTORS.special.death;
    e.art = SPECIAL_CORPSE.art;
    e.cell_class.dead = env.HYD.SPECIAL_CORPSE_CLASS;
    e.flags.value = e.flags.value & ES.CORPSE_FLAG_MASK;
    e.flags.alive = (e.flags.value & FLAG_ALIVE) !== 0;
    e.flags.in_use = (e.flags.value & FLAG_IN_USE) !== 0;
    e.vel.x = 0;
    e.vel.y = 0;
    recount(state, notes, `entity slot ${e.slot}: the gib death`);
}
export interface FlameCreateInputs {
    readonly bobbedAngle: number;
    readonly angle: number;
    readonly eyeOffset: number;
    readonly bobEye: number;
    readonly pic?: {
        readonly cx: number;
        readonly cy: number;
        readonly gateScale: number;
    };
    readonly bobAngle?: number;
}
function aimTarget(state: TickState, inputs: FlameCreateInputs): {
    pos: Entity["pos"];
    vel: Entity["vel"];
} | null {
    const { world, env } = state;
    const p = world.player;
    const angle = inputs.angle;
    const camera = inputs.pic !== undefined ? { cx: inputs.pic.cx, cy: inputs.pic.cy } : { cx: env.view.sin256[angle]!, cy: env.view.neg_cos256[angle]! };
    const candidates = world.entities.map((c) => ({ flags: c.flags.value, floor: c.floor, pos: { x: c.pos.x, y: c.pos.y } }));
    const partner = partnerBody(state);
    if (partner !== null)
        candidates.push({ flags: partner.flags, floor: partner.floor, pos: partner.pos });
    const index = shotTarget(candidates, {
        weapon: env.FLAME.ITEM,
        cone: env.FLAME.AIM_CONE,
        repeat: false,
        character: p.character.value,
        eyeOffset: inputs.eyeOffset,
        playerFloor: world.level.sub_id,
        player: { x: p.pos.x, y: p.pos.y },
        camera,
        aimColumn: env.R.COLUMN_CENTRE + (inputs.bobAngle ?? 0),
        gateScale: inputs.pic?.gateScale ?? 0,
    }, env.ES);
    if (index === null)
        return null;
    if (partner !== null && index === world.entities.length)
        return { pos: { x: partner.pos.x, y: partner.pos.y, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
    return world.entities[index]!;
}
export function flameStreamsCreate(state: TickState, count: number, inputs: FlameCreateInputs, notes: string[]): void {
    const { world, env } = state;
    const F = env.FLAME;
    const p = world.player;
    for (let i = 0; i < count; i++) {
        const slot = lowestFreeSlot(world);
        if (slot === null) {
            notes.push("flame stream: the pool is full (ZT-WORLD-FLAME 4.2): not made");
            return;
        }
        const vx = sar(env.view.sin256[inputs.angle]!, VIEW_QUARTER_SHIFT);
        const vy = sar(env.view.neg_cos256[inputs.angle]!, VIEW_QUARTER_SHIFT);
        const R = draw(state.rng);
        const spreadX = ((R >>> F.SPREAD_X_SHIFT) & SPREAD_MASK) - SPREAD_BIAS;
        const spreadY = ((R >>> F.SPREAD_Y_SHIFT) & SPREAD_MASK) - SPREAD_BIAS;
        const e = particleEntity(state, slot, { x: u16(p.pos.x + vx), y: u16(p.pos.y + vy), z: s16(inputs.eyeOffset - F.SPAWN_Z_BELOW_EYE) }, { x: s16(vx + spreadX), y: s16(vy + spreadY), z: F.VZ_START }, F.FUSE_NONE);
        const target = aimTarget(state, inputs);
        if (target !== null) {
            const tx = s16(target.pos.x + F.FUSE_LEAD * target.vel.x - p.pos.x);
            const ty = s16(target.pos.y + F.FUSE_LEAD * target.vel.y - p.pos.y);
            e.state = u8((octDist(tx, ty) >>> F.FUSE_SHIFT) + FUSE_ADD);
        }
        e.vec.ai = FLAME_STREAM_AI as Entity["vec"]["ai"];
        e.vec.draw = FLAME_STREAM_DRAW as Entity["vec"]["draw"];
        e.vec.damage = "none";
        e.vec.death = "remove";
        e.vec.secondary = "none";
        e.timer = 0;
        insertBySlot(world, e);
    }
}

import type { Entity, VectorName } from "../../world.js";
import { divTrunc, draw, octDist, s16, sar, u16, u8 } from "../hydaca/arith.js";
import type { SoldierConstants } from "../rend/sprite/constants.js";
import type { CellSource, Ctx, SoldierEvent } from "../soldier/common.js";
import { GRID_SIDE, OutsideSpecError, moveIndex } from "../soldier/common.js";
import { particleOf } from "../soldier/damage.js";
import { moveWith } from "../soldier/walk.js";
import { retargetAndRangeTest } from "../soldier/wait.js";
import { ctxOf, windowOf } from "./boss.js";
import { FLAG_ALIVE, FLAG_IN_USE, FLAG_ON_FLOOR } from "./constants.js";
import { soldierGibDeath } from "./flame.js";
import type { TickState } from "./core.js";
import { applySoldierEvents, insertBySlot, liveParticles, lowestFreeSlot, mapWrite, particleEntity, removeEntity, request } from "./core.js";
export interface KindMoveNumbers {
    readonly PUSH_LOW: number;
    readonly PUSH_HIGH: number;
    readonly MAGNET_LIMIT: number;
    readonly MAGNET_SHIFT: number;
    readonly RETARGET_MASK: number;
    readonly FOLD_RANGE: number;
}
const moveConstants = new WeakMap<KindMoveNumbers, WeakMap<SoldierConstants, SoldierConstants>>();
export function kindConstants(ES: SoldierConstants, K: KindMoveNumbers): SoldierConstants {
    let byEs = moveConstants.get(K);
    if (!byEs)
        moveConstants.set(K, (byEs = new WeakMap()));
    let C = byEs.get(ES);
    if (!C) {
        C = { ...ES, AI: { ...ES.AI, PUSH_LOW: K.PUSH_LOW, PUSH_HIGH: K.PUSH_HIGH, MAGNET_LIMIT: K.MAGNET_LIMIT, MAGNET_SHIFT: K.MAGNET_SHIFT, RETARGET_MASK: K.RETARGET_MASK, FOLD_RANGE: K.FOLD_RANGE } } as SoldierConstants;
        byEs.set(ES, C);
    }
    return C;
}
const walkerRows = new WeakMap<object, KindMoveNumbers>();
export function walkerNumbers(ES: SoldierConstants, K: Pick<KindMoveNumbers, "PUSH_LOW" | "PUSH_HIGH" | "MAGNET_LIMIT" | "MAGNET_SHIFT">): KindMoveNumbers {
    let row = walkerRows.get(K);
    if (!row)
        walkerRows.set(K, (row = { PUSH_LOW: K.PUSH_LOW, PUSH_HIGH: K.PUSH_HIGH, MAGNET_LIMIT: K.MAGNET_LIMIT, MAGNET_SHIFT: K.MAGNET_SHIFT, RETARGET_MASK: ES.AI.RETARGET_MASK, FOLD_RANGE: ES.AI.FOLD_RANGE }));
    return row;
}
const losRows = new WeakMap<SoldierConstants, Map<number, SoldierConstants>>();
export function losContext(ctx: Ctx, probe: number): Ctx {
    let byProbe = losRows.get(ctx.C);
    if (!byProbe)
        losRows.set(ctx.C, (byProbe = new Map()));
    let C = byProbe.get(probe);
    if (!C) {
        C = { ...ctx.C, AI: { ...ctx.C.AI, PROBE_OFFSET: probe } } as SoldierConstants;
        byProbe.set(probe, C);
    }
    return { ...ctx, C };
}
export function refreshCallWindow(ctx: Ctx, cells: CellSource, e: Entity): void {
    (ctx.e as {
        cellsAround: readonly (number | null)[];
    }).cellsAround = windowOf(cells, e);
}
export function kindCall(state: TickState, e: Entity, cells: CellSource, K: KindMoveNumbers): {
    ctx: Ctx;
    events: SoldierEvent[];
} {
    e.hidden!.cells_around = windowOf(cells, e);
    e.timer = 0;
    const events: SoldierEvent[] = [];
    return { ctx: ctxOf(state, e, cells, kindConstants(state.env.ES, K), events), events };
}
export function moveBy(ctx: Ctx, vx: number, vy: number): number {
    const p = ctx.e.pos;
    const x0 = p.x;
    const y0 = p.y;
    moveWith(ctx, vx, vy);
    return octDist(s16(p.x - x0), s16(p.y - y0));
}
export function watch(ctx: Ctx, e: Entity, markerClass: number): boolean {
    retargetAndRangeTest(ctx, markerClass);
    e.hidden!.target = ctx.e.target;
    return ctx.removed;
}
export function endCall(state: TickState, e: Entity, ctx: Ctx, events: readonly SoldierEvent[], notes: string[]): void {
    if (ctx.removed)
        removeEntity(state, e);
    applySoldierEvents(state, e, events, notes, ctx.removed);
}
export function guarded(state: TickState, e: Entity, notes: string[], run: () => void): void {
    try {
        run();
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
export function setFlags(e: Entity, value: number): void {
    e.flags.value = value;
    e.flags.in_use = (value & FLAG_IN_USE) !== 0;
    e.flags.on_floor = (value & FLAG_ON_FLOOR) !== 0;
    e.flags.alive = (value & FLAG_ALIVE) !== 0;
}
export function kindDeath(state: TickState, e: Entity, flagMask: number, corpseState: number | null, events: SoldierEvent[], notes: string[]): void {
    if (e.hidden!.hit_mark !== 0) {
        soldierGibDeath(state, e, notes);
        return;
    }
    becomeCorpse(state, e, flagMask);
    if (corpseState !== null)
        e.state = corpseState;
    events.push({ type: "Floor.Recount" });
}
export function becomeCorpse(state: TickState, e: Entity, flagMask: number): void {
    const row = [...state.env.kinds.values()].find((k) => k.type === e.type);
    if (!row || row.corpseVectors === null)
        throw new Error(`entity slot ${e.slot}: enemy_descriptors.json has no corpse vectors of ${e.type}`);
    setFlags(e, e.flags.value & flagMask);
    e.form = "corpse";
    e.vec.ai = row.corpseVectors.ai as VectorName;
    e.vec.draw = row.corpseVectors.draw as VectorName;
    e.vec.damage = row.corpseVectors.damage as VectorName;
    e.vec.death = row.corpseVectors.death as VectorName;
    e.timer = 0;
    e.vel.x = 0;
    e.vel.y = 0;
}
export interface KindDamage {
    readonly DMG_BASE: number;
    readonly DMG_VEL_SHIFT: number;
    readonly BURST_LOSS: number;
    readonly BURST_COUNT_SHIFT: number;
    readonly BURST_COUNT_ADD: number;
}
function unitOf(state: TickState, relx: number, rely: number): {
    qx: number;
    qy: number;
} {
    const shift = state.env.ES.DMG.UNIT_SHIFT;
    const ux = s16(-relx);
    const uy = s16(-rely);
    const n = s16(octDist(ux, uy));
    if (n + 1 === 0)
        return { qx: s16(ux * (1 << shift)), qy: s16(uy * (1 << shift)) };
    return { qx: s16(divTrunc(ux * (1 << shift), n + 1)), qy: s16(divTrunc(uy * (1 << shift), n + 1)) };
}
export function liveDamage(state: TickState, e: Entity, d: number, relx: number, rely: number, mark: number, hurtState: number, K: KindDamage, signGate: boolean, particles: boolean): number | null {
    const ES = state.env.ES;
    e.state = hurtState;
    e.counter = 0;
    e.vel.x = 0;
    e.vel.y = 0;
    const { qx, qy } = unitOf(state, relx, rely);
    const loss = s16(K.DMG_BASE - d);
    if (loss < 0)
        return null;
    if (!signGate || e.hp >= 0) {
        e.hp = s16(e.hp - loss);
        if (e.hp < 0 && loss >= K.BURST_LOSS) {
            if (particles) {
                const n = sar(loss - K.BURST_LOSS, K.BURST_COUNT_SHIFT) + K.BURST_COUNT_ADD;
                for (let i = 0; i < n; i++) {
                    if (liveParticles(state) >= ES.BURST.LIVE_MAX)
                        break;
                    const slot = lowestFreeSlot(state.world);
                    if (slot === null)
                        break;
                    const R = draw(state.rng);
                    const init = particleOf({ x: e.pos.x, y: e.pos.y }, { loss, qx, qy }, R, ES);
                    insertBySlot(state.world, particleEntity(state, slot, init.pos, init.vel, init.state));
                }
            }
            e.hidden!.hit_mark = mark;
        }
    }
    const v = s16(sar(loss, K.DMG_VEL_SHIFT));
    e.vel.x = s16(sar(qx * v, ES.DMG.VELOCITY_SHIFT));
    e.vel.y = s16(sar(qy * v, ES.DMG.VELOCITY_SHIFT));
    return loss;
}
export function corpseEntry(state: TickState, e: Entity, d: number, relx: number, rely: number, K: {
    readonly DMG_BASE: number;
    readonly CORPSE_VEL_SHIFT: number;
}, addCounter: boolean): void {
    e.vel.x = 0;
    e.vel.y = 0;
    const { qx, qy } = unitOf(state, relx, rely);
    const loss = s16(K.DMG_BASE - d);
    if (loss < 0)
        return;
    const v = s16(sar(loss, K.CORPSE_VEL_SHIFT));
    e.vel.x = s16(sar(qx * v, state.env.ES.DMG.VELOCITY_SHIFT));
    e.vel.y = s16(sar(qy * v, state.env.ES.DMG.VELOCITY_SHIFT));
    if (addCounter)
        e.counter = u8(e.counter + 1);
}
export function halve(v: number): number {
    return Math.trunc(v / 2);
}
export interface KindCorpse {
    readonly CORPSE_STAMP_RANGE: number;
    readonly CORPSE_CLASS: number;
    readonly CORPSE_RETARGET_MASK: number;
    readonly CORPSE_STAMP_ORDER: ReadonlyArray<readonly [
        number,
        number
    ]>;
}
export function stampAndFree(state: TickState, e: Entity, cells: CellSource, K: Pick<KindCorpse, "CORPSE_CLASS" | "CORPSE_STAMP_ORDER">, notes: string[]): void {
    const own = moveIndex(e.pos.x, e.pos.y);
    const col = u16(e.pos.x) >>> 8;
    const row = u16(e.pos.y) >>> 8;
    for (const [ox, oy] of K.CORPSE_STAMP_ORDER) {
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
            mapWrite(state, e.floor, col + ox, row + oy, cells.markerBlock(K.CORPSE_CLASS), notes);
            break;
        }
    }
    removeEntity(state, e);
}
export function corpseCall(state: TickState, e: Entity, ctx: Ctx, cells: CellSource, K: KindCorpse, notes: string[]): void {
    const h = e.hidden!;
    const p = state.world.player;
    e.vel.x = halve(e.vel.x);
    e.vel.y = halve(e.vel.y);
    if (e.vel.x !== 0 || e.vel.y !== 0)
        moveWith(ctx, e.vel.x, e.vel.y);
    if ((u8(state.world.core.phase + e.tag) & K.CORPSE_RETARGET_MASK) === 0)
        h.target = e.floor === state.world.level.sub_id ? "player" : "none";
    if (h.target === "none" || octDist(s16(e.pos.x - p.pos.x), s16(e.pos.y - p.pos.y)) >= K.CORPSE_STAMP_RANGE) {
        stampAndFree(state, e, cells, K, notes);
        return;
    }
    doorClamp(state, e, cells);
}
function doorClamp(state: TickState, e: Entity, cells: CellSource): void {
    const { DOG, BOSS } = state.env;
    const cls = cells.classOf(cells.block(moveIndex(e.pos.x, e.pos.y), e.floor));
    const low = DOG.CORPSE_DOOR_CLAMP_LOW;
    const high = DOG.CORPSE_DOOR_CLAMP_HIGH;
    const clamp = (v: number): number | null => {
        const f = v & 0xff;
        if (f < low)
            return (v & ~0xff) | low;
        if (f > high)
            return (v & ~0xff) | high;
        return null;
    };
    let moved = false;
    if (BOSS.DOOR_CLASSES_A.includes(cls)) {
        const y = clamp(e.pos.y);
        if (y !== null) {
            e.pos.y = y;
            moved = true;
        }
    }
    else if (BOSS.DOOR_CLASSES_B.includes(cls)) {
        const x = clamp(e.pos.x);
        if (x !== null) {
            e.pos.x = x;
            moved = true;
        }
    }
    if (moved && e.floor === state.world.level.sub_id)
        request(state, DOG.CORPSE_DOOR_SOUND);
}

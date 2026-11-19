import type { Entity, EntityTypeName, VectorName } from "../../world.js";
import { FLAG_ALIVE, FLAG_IN_USE, FLAG_ON_FLOOR, GRID_SIDE, RAY } from "./constants.js";
import { divTrunc, octDist, s16, u16 } from "../hydaca/arith.js";
import { playerHit } from "../player_hit/core.js";
import { aliveSeats, eachAliveSeat } from "./friendly.js";
import type { CellSource } from "../soldier/common.js";
import type { EntityRecord } from "../rend/sprite/types.js";
import { SOLDIER_KIND } from "../rend/sprite/types.js";
import type { EnemyKind } from "../rend/sprite/kinds.js";
import { areaHit } from "./area_damage.js";
import { isLiveCamera, popCamera } from "./camera.js";
import { cellSourceOf, drainHitMessages, entityOfSpawn, hitPlayerOf, insertBySlot, lowestFreeSlot, mapWrite, removeEntity, request, writeHitPlayer } from "./core.js";
import type { TickState } from "./core.js";
import type { Kept, KeptMem, PlacedState } from "./kept.js";
export const MINE_PLACED_AI = "mine.placed.ai";
export const MINE_BLAST_AI = "mine.blast.ai";
const MINE_PLACED_DAMAGE = "mine.placed.damage";
const MINE_PLACED_DRAW = "mine.placed.draw";
const MINE_BLAST_DRAW = "mine.blast.draw";
const MINE_TYPE = "unknown" as EntityTypeName;
const MINE_FORM = "unknown" as Entity["form"];
const NO_DAMAGE = "none" as VectorName;
const REMOVE_DEATH = "remove" as VectorName;
const CLEARED_BLOCK = 0;
const LOS_SHIFT = 6;
const BLAST_FLAGS = FLAG_IN_USE;
export function isMineRecord(e: Entity): boolean {
    return e.vec.ai === MINE_PLACED_AI || e.vec.ai === MINE_BLAST_AI;
}
export function isPlacedMine(e: Entity): boolean {
    return e.vec.ai === MINE_PLACED_AI;
}
type Slot = "placed" | "blasts";
function sig(e: Entity): string {
    return `${e.pos.x},${e.pos.y},${e.floor}`;
}
function mapOf<K extends Slot>(which: K, state: TickState): KeptMem[K] {
    return state.kept[which];
}
function recall<K extends Slot>(which: K, state: TickState, e: Entity): (KeptMem[K] extends Map<number, Kept<infer T>> ? T : never) | undefined {
    const k = (mapOf(which, state) as Map<number, Kept<unknown>>).get(e.slot);
    return k !== undefined && k.at === sig(e) ? (k.v as never) : undefined;
}
function keep<K extends Slot>(which: K, state: TickState, e: Entity, v: KeptMem[K] extends Map<number, Kept<infer T>> ? T : never): void {
    (mapOf(which, state) as Map<number, Kept<unknown>>).set(e.slot, { at: sig(e), v });
}
export function blastAgeOf(state: TickState, slot: number): number | null {
    const e = state.world.entities.find((x) => x.slot === slot);
    if (!e)
        return null;
    const age = recall("blasts", state, e);
    return age === undefined ? null : age;
}
export function blockedAt(state: TickState, x: number, y: number, floor: number = state.floorNumber): boolean {
    const { env } = state;
    const ux = u16(x);
    const uy = u16(y);
    const cx = ux >> env.R.CELL_SHIFT;
    const cy = uy >> env.R.CELL_SHIFT;
    if (cx >= GRID_SIDE || cy >= GRID_SIDE)
        return true;
    const cls = env.classOfBlock[floor === state.floorNumber ? state.blocks[cy * GRID_SIDE + cx]! : cellSourceOf(state).block(cy * GRID_SIDE + cx, floor)] ?? -1;
    const value = env.FLAME.WALL_TABLE[cls];
    if (value === undefined)
        return true;
    const xl = ux & RAY.FRACTION_MASK;
    const yl = uy & RAY.FRACTION_MASK;
    switch (value) {
        case 0:
            return false;
        case 2:
            return xl > yl;
        case 3:
            return !(xl <= RAY.FRACTION_MASK - yl);
        case 4:
            return !(xl >= yl);
        case 5:
            return !(xl >= RAY.FRACTION_MASK - yl);
        default:
            return true;
    }
}
function lineClear(state: TickState, bx: number, by: number, tx: number, ty: number, floor: number = state.floorNumber): boolean {
    const dx = s16(tx - bx);
    const dy = s16(ty - by);
    const n = octDist(dx, dy) >> LOS_SHIFT;
    if (n <= 1)
        return true;
    const sx = divTrunc(dx, n);
    const sy = divTrunc(dy, n);
    for (let k = 1; k <= n - 1; k++)
        if (blockedAt(state, bx + k * sx, by + k * sy, floor))
            return false;
    return true;
}
export function minePass(state: TickState, e: Entity, _cells: CellSource, notes: string[]): void {
    if (e.vec.ai === MINE_BLAST_AI)
        blastTurn(state, e, notes);
    else
        placedTurn(state, e, notes);
}
function playersOf(state: TickState): Array<{
    k: 0 | 1;
    player: TickState["world"]["player"];
    floor: number;
}> {
    const seats = state.seats;
    if (seats === undefined)
        return [{ k: 0, player: state.world.player, floor: state.floorNumber }];
    return aliveSeats(state).map((k) => (seats.live === k ? { k, player: state.world.player, floor: state.floorNumber } : { k, player: seats.data.player, floor: seats.data.floorNumber }));
}
function placedTurn(state: TickState, e: Entity, notes: string[]): void {
    const { world, env } = state;
    const M = env.MINE;
    e.timer = 0;
    let ps = recall("placed", state, e);
    if (!ps)
        keep("placed", state, e, (ps = { target: null, calls: 0 }));
    const bodies = playersOf(state);
    if (ps.calls % M.RETARGET_PERIOD === 0) {
        let best: Entity | null = null;
        let bestD = 0;
        for (const o of world.entities) {
            if ((o.flags.value & M.TARGET_FLAG) === 0 || o.floor !== e.floor)
                continue;
            const d = octDist(s16(e.pos.x - o.pos.x), s16(e.pos.y - o.pos.y));
            if (best === null || d < bestD) {
                best = o;
                bestD = d;
            }
        }
        let target: PlacedState["target"] = best === null ? null : best.slot;
        for (const b of bodies) {
            if (b.floor !== e.floor)
                continue;
            const dp = octDist(s16(e.pos.x - b.player.pos.x), s16(e.pos.y - b.player.pos.y));
            if (target === null || dp < bestD) {
                target = b.k === 0 ? "player" : "player1";
                bestD = dp;
            }
        }
        if (target === null) {
            mapOf("placed", state).delete(e.slot);
            removeEntity(state, e);
            return;
        }
        ps.target = target;
    }
    ps.calls += 1;
    let tx: number;
    let ty: number;
    if (ps.target === "player" || ps.target === "player1") {
        const body = bodies.find((b) => b.k === (ps!.target === "player" ? 0 : 1));
        if (body === undefined)
            return;
        const player = body.player;
        if (player.character.value === M.HAILE_CHARACTER)
            return;
        tx = player.pos.x;
        ty = player.pos.y;
    }
    else {
        const slot = ps.target!;
        const o = world.entities.find((x) => x.slot === slot);
        if (o) {
            tx = o.pos.x;
            ty = o.pos.y;
        }
        else {
            const r = state.residue.get(slot);
            if (!r)
                return;
            tx = r.pos.x;
            ty = r.pos.y;
        }
    }
    if (octDist(s16(e.pos.x - tx), s16(e.pos.y - ty)) < M.PROX_RANGE)
        convert(state, e, notes);
}
function convert(state: TickState, e: Entity, _notes: string[]): void {
    e.flags = { value: BLAST_FLAGS, in_use: (BLAST_FLAGS & FLAG_IN_USE) !== 0, on_floor: (BLAST_FLAGS & FLAG_ON_FLOOR) !== 0, alive: (BLAST_FLAGS & FLAG_ALIVE) !== 0, link_mirror: false };
    e.timer = 0;
    e.vec = { ...e.vec, ai: MINE_BLAST_AI as VectorName, draw: MINE_BLAST_DRAW as VectorName, damage: NO_DAMAGE };
    mapOf("placed", state).delete(e.slot);
    keep("blasts", state, e, 0);
    if (e.floor === state.floorNumber)
        request(state, state.env.MINE.SOUND_BLAST);
}
export function grenadeToBlast(state: TickState, e: Entity, flagMask: number): void {
    const value = u16(e.flags.value & flagMask);
    e.flags = { value, in_use: (value & FLAG_IN_USE) !== 0, on_floor: (value & FLAG_ON_FLOOR) !== 0, alive: (value & FLAG_ALIVE) !== 0, link_mirror: false };
    e.timer = 0;
    e.vec = { ...e.vec, ai: MINE_BLAST_AI as VectorName, draw: MINE_BLAST_DRAW as VectorName, damage: NO_DAMAGE };
    keep("blasts", state, e, 0);
}
export function rocketToBlast(state: TickState, e: Entity, flagMask: number): void {
    grenadeToBlast(state, e, flagMask);
    e.type = MINE_TYPE;
    e.form = MINE_FORM;
}
export function inWallBlast(state: TickState, e: Entity, flags: number): void {
    e.flags = { value: flags, in_use: (flags & FLAG_IN_USE) !== 0, on_floor: (flags & FLAG_ON_FLOOR) !== 0, alive: (flags & FLAG_ALIVE) !== 0, link_mirror: (flags & state.env.ES.LINK_MIRROR_BIT) !== 0 };
    e.type = MINE_TYPE;
    e.form = MINE_FORM;
    e.timer = 0;
    e.vec = { ...e.vec, ai: MINE_BLAST_AI as VectorName, draw: MINE_BLAST_DRAW as VectorName, damage: NO_DAMAGE, secondary: "unknown" };
    keep("blasts", state, e, state.env.SPR.BLAST_WALL_AGE);
}
export function mineHit(state: TickState, e: Entity, impulse: number, notes: string[]): void {
    if (!isPlacedMine(e))
        return;
    if (u16(impulse) < state.env.MINE.SHOT_IMPULSE)
        convert(state, e, notes);
}
function blastTurn(state: TickState, e: Entity, notes: string[]): void {
    const M = state.env.MINE;
    e.timer = 0;
    const age = (recall("blasts", state, e) ?? 0) + 1;
    keep("blasts", state, e, age);
    if (age === M.SWEEP_AGE)
        sweep(state, e, notes);
    if (age >= M.BLAST_LIFE) {
        mapOf("blasts", state).delete(e.slot);
        const at = state.world.entities.indexOf(e);
        if (at >= 0)
            removeEntity(state, state.world.entities[at]!);
    }
}
function wakeScan(state: TickState, blast: Entity, notes: string[]): void {
    const { world, env } = state;
    const M = env.MINE;
    const shift = env.R.CELL_SHIFT;
    const player = world.player;
    const bx = blast.pos.x;
    const by = blast.pos.y;
    const side = 2 * M.SPAWN_RADIUS + 1;
    const pcx = u16(player.pos.x) >> shift;
    const pcy = u16(player.pos.y) >> shift;
    const bcx = u16(bx) >> shift;
    const bcy = u16(by) >> shift;
    rows: for (let k = 0; k < side; k++) {
        const prow = pcy - M.SPAWN_RADIUS + k;
        if (prow < 0)
            continue;
        if (prow >= GRID_SIDE)
            break rows;
        for (let j = 0; j < side; j++) {
            const pcol = pcx - M.SPAWN_RADIUS + j;
            if (pcol < 0 || pcol >= GRID_SIDE)
                continue;
            const cy = bcy - M.SPAWN_RADIUS + k;
            const cx = bcx - M.SPAWN_RADIUS + j;
            if (cx < 0 || cy < 0 || cx >= GRID_SIDE || cy >= GRID_SIDE)
                continue;
            const cls = env.classOfBlock[cellSourceOf(state).block(cy * GRID_SIDE + cx, blast.floor)] ?? -1;
            if (!M.MARKER_CLASSES.includes(cls))
                continue;
            wake(state, cx, cy, cls, blast.floor, notes);
        }
    }
}
function sweep(state: TickState, blast: Entity, notes: string[]): void {
    const { world, env } = state;
    const M = env.MINE;
    const bx = blast.pos.x;
    const by = blast.pos.y;
    const shift = env.R.CELL_SHIFT;
    const player = world.player;
    if (state.seats === undefined)
        wakeScan(state, blast, notes);
    else
        eachAliveSeat(state, () => { if (state.floorNumber === blast.floor)
            wakeScan(state, blast, notes); });
    const slots = world.entities.map((o) => o.slot);
    for (const slot of slots) {
        const v = world.entities.find((o) => o.slot === slot);
        if (!v || v === blast || v.floor !== blast.floor)
            continue;
        if (!lineClear(state, bx, by, v.pos.x, v.pos.y, blast.floor))
            continue;
        const d = octDist(s16(v.pos.x - bx), s16(v.pos.y - by));
        if (isLiveCamera(v)) {
            if (d < env.CAMERA.POP_RANGE)
                popCamera(state, v);
            continue;
        }
        if (d >= M.SWEEP_RANGE)
            continue;
        areaHit(state, v, d, s16(bx - v.pos.x), s16(by - v.pos.y), d <= M.MARK_RANGE ? 1 : 0, true, notes);
    }
    eachAliveSeat(state, () => {
        const player = state.world.player;
        if (state.floorNumber === blast.floor && lineClear(state, bx, by, player.pos.x, player.pos.y)) {
            let d = octDist(s16(bx - player.pos.x), s16(by - player.pos.y));
            if (player.character.value === M.HAILE_CHARACTER)
                d = u16(d * 2);
            if (d < M.SWEEP_RANGE) {
                const h = hitPlayerOf(state);
                playerHit(h, state.hit, { impulse: d, dx: s16(bx - player.pos.x), dy: s16(by - player.pos.y) }, env.H);
                writeHitPlayer(state, h);
                drainHitMessages(state);
            }
        }
    });
}
function wake(state: TickState, cx: number, cy: number, cls: number, floor: number, notes: string[]): void {
    const { world, env } = state;
    const M = env.MINE;
    const ES = env.ES;
    let kind: EnemyKind | null = null;
    if (cls !== ES.MARKER_CLASS) {
        kind = env.kinds.get(cls) ?? null;
        if (kind === null) {
            notes.push(`mine sweep: marker of class ${cls} at (${cx}, ${cy}): no kind of that class is known (ZT-ENT-SOLDIER 4.1a): the cell is ignored`);
            return;
        }
    }
    const slot = lowestFreeSlot(world);
    if (slot === null) {
        notes.push(`mine sweep: the pool is full at the marker (${cx}, ${cy}): no enemy is made`);
        return;
    }
    mapWrite(state, floor, cx, cy, CLEARED_BLOCK, notes);
    const type = kind === null ? SOLDIER_KIND : kind.type;
    const art = kind === null && ((cx ^ cy) & ES.ALT_ART_PARITY_MASK) !== 0 ? "alt" : "main";
    const home = { x: world.player.pos.x, y: world.player.pos.y };
    const left = state.residue.get(slot);
    const r: EntityRecord = {
        kind: type,
        slot,
        tag: slot + ES.TAG_OFFSET,
        form: "live",
        art,
        flags: kind === null ? ES.SPAWN_FLAGS : kind.flags,
        vec: kind === null ? { ...ES.SPAWN_VECTORS } : { ...kind.vectors },
        timer: ES.SPAWN_TIMER,
        pos: { x: cx * (1 << env.R.CELL_SHIFT) + M.CELL_CENTER, y: cy * (1 << env.R.CELL_SHIFT) + M.CELL_CENTER },
        z: kind === null ? ES.SPAWN_Z : kind.z,
        vel: left ? { x: left.vel.x, y: left.vel.y } : { x: 0, y: 0 },
        state: ES.SPAWN_STATE,
        counter: ES.SPAWN_COUNTER,
        hp: M.SPAWN_HP[type] ?? (kind === null ? ES.SPAWN_HP : kind.hp),
        anim: left ? left.anim : 0,
        floor,
        home,
        target: "player",
    };
    if (kind !== null)
        r.kindRow = kind;
    insertBySlot(world, entityOfSpawn(r, state));
    request(state, kind === null ? ES.SPAWN_SOUND : kind.sound);
}
export interface MinePlaceInputs {
    readonly bobbedAngle: number;
    readonly angle: number;
    readonly eyeOffset: number;
    readonly bobEye: number;
}
export function placeMine(state: TickState, inputs: MinePlaceInputs, notes: string[]): void {
    const { world, env } = state;
    const M = env.MINE;
    const vx = env.view.sin256[inputs.bobbedAngle]! >> M.AHEAD_SHIFT;
    const vy = env.view.neg_cos256[inputs.bobbedAngle]! >> M.AHEAD_SHIFT;
    let x = world.player.pos.x;
    let y = world.player.pos.y;
    for (let i = 0; i < M.AHEAD_STEPS; i++) {
        const nx = u16(x + vx);
        const ny = u16(y + vy);
        if (blockedAt(state, nx, ny))
            break;
        x = nx;
        y = ny;
    }
    const slot = lowestFreeSlot(world);
    if (slot === null) {
        notes.push("weapon block: the pool is full, no mine is put down (ZT-WORLD-MINE 4.1)");
        return;
    }
    const left = state.residue.get(slot) ?? { prev: { x: 0, y: 0 }, vel: { x: 0, y: 0, z: 0 }, state: 0, counter: 0, hp: 0, anim: 0, art: "none" as Entity["art"], cell_class: { alive: 0, dead: 0 } };
    const flags = M.FLAGS_PLACED;
    const e: Entity = {
        slot,
        type: MINE_TYPE,
        type_alias: null,
        form: MINE_FORM,
        flags: { value: flags, in_use: (flags & FLAG_IN_USE) !== 0, on_floor: (flags & FLAG_ON_FLOOR) !== 0, alive: (flags & FLAG_ALIVE) !== 0, link_mirror: false },
        vec: { damage: MINE_PLACED_DAMAGE as VectorName, draw: MINE_PLACED_DRAW as VectorName, ai: MINE_PLACED_AI as VectorName, death: REMOVE_DEATH, secondary: "none" },
        timer: M.ARM_TIMER,
        pos: { x, y, z: M.Z - inputs.bobEye },
        prev: { x: left.prev.x, y: left.prev.y },
        vel: { x: left.vel.x, y: left.vel.y, z: left.vel.z },
        floor: world.level.sub_id,
        state: left.state,
        counter: left.counter,
        hp: left.hp,
        anim: left.anim,
        tag: slot + env.ES.TAG_OFFSET,
        art: left.art,
        cell_class: { alive: left.cell_class.alive, dead: left.cell_class.dead },
    };
    insertBySlot(world, e);
    keep("placed", state, e, { target: null, calls: 0 });
    mapOf("blasts", state).delete(slot);
}

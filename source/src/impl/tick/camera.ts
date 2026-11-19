import type { Entity, EntityTypeName, VectorName } from "../../world.js";
import { CAMERA_ENTRY_TYPE } from "../door/core.js";
import { octDist, s16, u16, u8 } from "../hydaca/arith.js";
import type { EntityRecord } from "../rend/sprite/types.js";
import { SOLDIER_KIND } from "../rend/sprite/types.js";
import type { CellSource, Ctx } from "../soldier/common.js";
import { shotLineClear } from "../soldier/los.js";
import { FLAG_ALIVE, FLAG_IN_USE, FLAG_ON_FLOOR, GRID_SIDE } from "./constants.js";
import type { TickState } from "./core.js";
import { aliveSeats } from "./friendly.js";
import { entityOfSpawn, insertBySlot, lowestFreeSlot, mapWrite, removeEntity, request } from "./core.js";
export const CAMERA_AI = "camera.ai";
export const CAMERA_POP_AI = "camera.pop.ai";
const CAMERA_POP_DRAW = "camera.pop.draw";
const NONE = "none" as VectorName;
const CLEARED_BLOCK = 0;
const STATE_WATCH = 0;
const STATE_ALARM = 1;
const STATE_DONE = 2;
export function isCameraRecord(e: Entity): boolean {
    return e.vec.ai === CAMERA_AI || e.vec.ai === CAMERA_POP_AI;
}
export function isLiveCamera(e: Entity): boolean {
    return e.vec.ai === CAMERA_AI;
}
function flagsOf(value: number): Entity["flags"] {
    return { value, in_use: (value & FLAG_IN_USE) !== 0, on_floor: (value & FLAG_ON_FLOOR) !== 0, alive: (value & FLAG_ALIVE) !== 0, link_mirror: false };
}
export function cameraEntityOf(r: EntityRecord, state: TickState): Entity {
    const left = state.residue.get(r.slot);
    return {
        slot: r.slot,
        type: "unknown" as EntityTypeName,
        type_alias: null,
        form: "unknown" as Entity["form"],
        flags: flagsOf(r.flags),
        vec: { damage: r.vec.damage as VectorName, draw: r.vec.draw as VectorName, ai: r.vec.ai as VectorName, death: r.vec.death as VectorName, secondary: NONE as Entity["vec"]["secondary"] },
        timer: r.timer,
        pos: { x: r.pos.x, y: r.pos.y, z: r.z },
        prev: left ? { x: left.prev.x, y: left.prev.y } : { x: 0, y: 0 },
        vel: { x: r.vel.x, y: r.vel.y, z: left ? left.vel.z : 0 },
        floor: r.floor,
        state: r.state,
        counter: r.counter,
        hp: r.hp,
        anim: r.anim,
        tag: r.tag,
        art: (left ? left.art : "none") as Entity["art"],
        cell_class: left ? { alive: left.cell_class.alive, dead: left.cell_class.dead } : { alive: 0, dead: 0 },
    };
}
export function cameraPass(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    if (e.vec.ai === CAMERA_POP_AI) {
        popCall(state, e);
        return;
    }
    const { world, env } = state;
    const C = env.CAMERA;
    e.timer = 0;
    if (e.state === STATE_ALARM) {
        alarmCall(state, e, notes);
        return;
    }
    const bodies = state.seats === undefined ? [{ player: world.player, onFloor: e.floor === state.floorNumber }] : seatBodies(state, e);
    const cand = bodies.filter((b) => b.onFloor).map((b) => ({ player: b.player, d: octDist(s16(e.pos.x - b.player.pos.x), s16(e.pos.y - b.player.pos.y)) }));
    if (cand.length === 0 || !cand.some((c) => c.d <= C.LOSE_RANGE)) {
        removal(state, e, notes);
        return;
    }
    if (e.state !== STATE_WATCH)
        return;
    for (const c of cand) {
        const char4 = c.player.character.value === C.CHAR_SLOT;
        if (c.d > C.LOSE_RANGE || c.d > (char4 ? C.DETECT_RANGE_CHAR4 : C.DETECT_RANGE))
            continue;
        if (!sees(state, e, cells, c.player.pos))
            continue;
        e.state = STATE_ALARM;
        e.counter = char4 ? C.ALARM_COUNTER_CHAR4 : C.ALARM_COUNTER;
        return;
    }
}
function seatBodies(state: TickState, e: Entity): Array<{
    player: TickState["world"]["player"];
    onFloor: boolean;
}> {
    const seats = state.seats!;
    return aliveSeats(state).map((k) => (seats.live === k ? { player: state.world.player, onFloor: e.floor === state.floorNumber } : { player: seats.data.player, onFloor: e.floor === seats.data.floorNumber }));
}
function sees(state: TickState, e: Entity, cells: CellSource, p: {
    x: number;
    y: number;
}): boolean {
    const ctx = { C: state.env.ES, e: { floor: e.floor }, target: { x: p.x, y: p.y }, inputs: { cells }, startIndex: Number.MAX_SAFE_INTEGER } as unknown as Ctx;
    return shotLineClear(ctx, e.pos.x, e.pos.y);
}
function alarmCall(state: TickState, e: Entity, notes: string[]): void {
    const C = state.env.CAMERA;
    e.counter = u8(e.counter - 1);
    if (e.counter === 0) {
        e.state = STATE_DONE;
        enemyScan(state, e, notes);
        doorScan(state, e, notes);
        return;
    }
    if ((e.counter & C.BEEP_MASK) === 0 && e.floor === state.floorNumber)
        request(state, C.BEEP_SOUND);
}
function* windowCells(state: TickState, e: Entity): Generator<readonly [
    number,
    number
]> {
    const H = state.env.CAMERA.SCAN_HALF;
    const shift = state.env.R.CELL_SHIFT;
    const cx = u16(e.pos.x) >> shift;
    const cy = u16(e.pos.y) >> shift;
    for (let y = cy - H; y <= cy + H; y++) {
        if (y < 0 || y >= GRID_SIDE)
            continue;
        for (let x = cx - H; x <= cx + H; x++) {
            if (x < 0 || x >= GRID_SIDE)
                continue;
            yield [x, y];
        }
    }
}
function enemyScan(state: TickState, e: Entity, notes: string[]): void {
    const { world, env } = state;
    const C = env.CAMERA;
    const ES = env.ES;
    for (const [x, y] of windowCells(state, e)) {
        const cls = env.classOfBlock[state.blocks[y * GRID_SIDE + x]!] ?? -1;
        if (C.ENEMY_TABLE[String(cls)] === undefined)
            continue;
        mapWrite(state, e.floor, x, y, CLEARED_BLOCK, notes);
        const kind = cls === ES.MARKER_CLASS ? null : (env.kinds.get(cls) ?? null);
        if (cls !== ES.MARKER_CLASS && kind === null) {
            notes.push(`camera scan: marker of class ${cls} at (${x}, ${y}): no kind of that class is known (ZT-ENT-SOLDIER 4.1a): no enemy is made`);
            continue;
        }
        const slot = lowestFreeSlot(world);
        if (slot === null)
            continue;
        const type = kind === null ? SOLDIER_KIND : kind.type;
        const left = state.residue.get(slot);
        const r: EntityRecord = {
            kind: type,
            slot,
            tag: slot + ES.TAG_OFFSET,
            form: "live",
            art: kind === null && ((x ^ y) & ES.ALT_ART_PARITY_MASK) !== 0 ? "alt" : "main",
            flags: kind === null ? ES.SPAWN_FLAGS : kind.flags,
            vec: kind === null ? { ...ES.SPAWN_VECTORS } : { ...kind.vectors },
            timer: ES.SPAWN_TIMER,
            pos: { x: x * (1 << env.R.CELL_SHIFT) + env.SPR.CENTRE, y: y * (1 << env.R.CELL_SHIFT) + env.SPR.CENTRE },
            z: kind === null ? ES.SPAWN_Z : kind.z,
            vel: left ? { x: left.vel.x, y: left.vel.y } : { x: 0, y: 0 },
            state: ES.SPAWN_STATE,
            counter: C.SPAWN_COUNTER,
            hp: kind === null ? ES.SPAWN_HP : kind.hp,
            anim: left ? left.anim : 0,
            floor: e.floor,
            home: { x: world.player.pos.x, y: world.player.pos.y },
            target: "player",
        };
        if (kind !== null)
            r.kindRow = kind;
        insertBySlot(world, entityOfSpawn(r, state));
        request(state, kind === null ? ES.SPAWN_SOUND : kind.sound);
    }
}
function doorScan(state: TickState, e: Entity, notes: string[]): void {
    const { env } = state;
    const C = env.CAMERA;
    const D = env.D;
    for (const [x, y] of windowCells(state, e)) {
        const cls = env.classOfBlock[state.blocks[y * GRID_SIDE + x]!] ?? -1;
        const horizontal = C.DOOR_HORIZONTAL.includes(cls);
        if (!horizontal && !C.DOOR_VERTICAL.includes(cls))
            continue;
        if (state.doors.queue.length >= D.QUEUE_SIZE)
            continue;
        mapWrite(state, e.floor, x, y, horizontal ? C.OPEN_BLOCK_HORIZONTAL : C.OPEN_BLOCK_VERTICAL, notes);
        state.doors.queue.push({ cell: [x, y], floor: e.floor, timer: D.OPEN_TIMER, restoreBlock: CLEARED_BLOCK, type: CAMERA_ENTRY_TYPE, playerIn: false, entityIn: false });
    }
    request(state, C.DOOR_SOUND);
    request(state, C.ALERT_SOUND);
}
function removal(state: TickState, e: Entity, notes: string[]): void {
    const shift = state.env.R.CELL_SHIFT;
    if (e.floor === state.floorNumber)
        mapWrite(state, e.floor, u16(e.pos.x) >> shift, u16(e.pos.y) >> shift, state.env.CAMERA.CELL_RESTORE_BLOCK, notes);
    else
        notes.push(`camera slot ${e.slot} on floor ${e.floor}: its removal's Map.Write is on a floor the running map does not hold`);
    removeEntity(state, e);
}
export function popCamera(state: TickState, e: Entity): void {
    const C = state.env.CAMERA;
    e.flags = flagsOf(e.flags.value & C.POP_FLAGS_MASK);
    e.vec = { ...e.vec, ai: CAMERA_POP_AI as VectorName, draw: CAMERA_POP_DRAW as VectorName, damage: NONE, death: NONE };
    e.pos.z = C.POP_Z;
    e.vel.z = 0;
    e.counter = 0;
    request(state, C.POP_SOUND);
}
function popCall(state: TickState, e: Entity): void {
    const C = state.env.CAMERA;
    const k = e.counter + 1;
    e.counter = k;
    e.pos.z = Math.max(s16(e.pos.z - e.vel.z), C.POP_Z_MIN);
    e.vel.z = k;
    if (k >= C.POP_LIFE)
        removeEntity(state, e);
}

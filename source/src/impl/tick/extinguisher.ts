import type { Entity, EntityTypeName, VectorName } from "../../world.js";
import { octDist, s16, sar, u16 } from "../hydaca/arith.js";
import { playerHit } from "../player_hit/core.js";
import { FLAG_ALIVE, FLAG_IN_USE, FLAG_ON_FLOOR, GRID_SIDE } from "./constants.js";
import type { TickState } from "./core.js";
import { drainHitMessages, hitPlayerOf, insertBySlot, lowestFreeSlot, mapWrite, request, writeHitPlayer } from "./core.js";
import { FLAME_GROUND_AI, groundFlameMade } from "./flame.js";
const FLAME_GROUND_DRAW = "flame.ground.draw";
const CLEARED_BLOCK = 0;
const FLAME_FLAGS = FLAG_IN_USE;
export const EXT_AIM_CONE = 8;
function classAt(state: TickState, cx: number, cy: number): number {
    if (cx < 0 || cy < 0 || cx >= GRID_SIDE || cy >= GRID_SIDE)
        return -1;
    return state.env.classOfBlock[state.blocks[cy * GRID_SIDE + cx]!] ?? -1;
}
export function extinguisherCell(state: TickState, angle: number, notes: string[]): void {
    const { world, env } = state;
    const E = env.EXT;
    const shift = env.R.CELL_SHIFT;
    const p = world.player.pos;
    let cx = u16(p.x) >> shift;
    let cy = u16(p.y) >> shift;
    if (classAt(state, cx, cy) !== E.FLAME_CLASS) {
        cx = u16(p.x + sar(env.view.sin256[angle]!, E.REACH_SHIFT)) >> shift;
        cy = u16(p.y + sar(env.view.neg_cos256[angle]!, E.REACH_SHIFT)) >> shift;
        if (classAt(state, cx, cy) !== E.FLAME_CLASS)
            return;
    }
    mapWrite(state, world.level.sub_id, cx, cy, CLEARED_BLOCK, notes);
    const slot = lowestFreeSlot(world);
    if (slot === null)
        return;
    const left = state.residue.get(slot);
    const e: Entity = {
        slot,
        type: "unknown" as EntityTypeName,
        type_alias: null,
        form: "unknown" as Entity["form"],
        flags: { value: FLAME_FLAGS, in_use: (FLAME_FLAGS & FLAG_IN_USE) !== 0, on_floor: (FLAME_FLAGS & FLAG_ON_FLOOR) !== 0, alive: (FLAME_FLAGS & FLAG_ALIVE) !== 0, link_mirror: false },
        vec: { damage: "none" as VectorName, draw: FLAME_GROUND_DRAW as VectorName, ai: FLAME_GROUND_AI as VectorName, death: "remove" as VectorName, secondary: "none" },
        timer: 0,
        pos: { x: cx * (1 << shift) + E.CELL_CENTER, y: cy * (1 << shift) + E.CELL_CENTER, z: E.FLAME_Z },
        prev: left ? { x: left.prev.x, y: left.prev.y } : { x: 0, y: 0 },
        vel: { x: 0, y: 0, z: 0 },
        floor: world.level.sub_id,
        state: left ? left.state : 0,
        counter: left ? left.counter : 0,
        hp: left ? left.hp : 0,
        anim: left ? left.anim : 0,
        tag: slot + env.ES.TAG_OFFSET,
        art: (left ? left.art : "none") as Entity["art"],
        cell_class: left ? { alive: left.cell_class.alive, dead: left.cell_class.dead } : { alive: 0, dead: 0 },
    };
    insertBySlot(world, e);
    groundFlameMade(state, e);
}
export function burningCell(state: TickState, cx: number, cy: number, bobEye: number, notes: string[]): void {
    const { world, env } = state;
    const E = env.EXT;
    const p = world.player;
    const side = 1 << env.R.CELL_SHIFT;
    const dx = s16(cx * side + E.CELL_CENTER - p.pos.x);
    const dy = s16(cy * side + E.CELL_CENTER - p.pos.y);
    const h = hitPlayerOf(state);
    const suit = p.passive.fire_proof_suit;
    if (suit >= 0) {
        const slot = h.inventory[suit]!;
        if ((slot.amount & 0xffff) <= E.SUIT_DRAIN) {
            slot.item = 0;
            slot.amount = 0;
            h.usedSlots -= 1;
            p.passive.fire_proof_suit = h.inventory.findIndex((s) => s.item === E.SUIT_ITEM);
            notes.push(`step 16: the fire proof suit is used up (ZT-WORLD-EXTINGUISHER 4.6): passive.fire_proof_suit ${p.passive.fire_proof_suit}`);
        }
        else
            slot.amount -= E.SUIT_DRAIN;
        writeHitPlayer(state, h);
        return;
    }
    const vest = h.vestSlot;
    const burn = { ...h, vestSlot: -1, eyeOffset: s16(h.eyeOffset + bobEye) };
    playerHit(burn, state.hit, { impulse: octDist(dx, dy), dx, dy }, env.H);
    burn.vestSlot = vest;
    writeHitPlayer(state, burn);
    drainHitMessages(state);
    request(state, E.BURN_SOUND);
}

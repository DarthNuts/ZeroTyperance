import type { Entity } from "../../world.js";
import { draw, u16 } from "../hydaca/arith.js";
import { corpseDamage as crabCorpseDamage, damageEntry as crabDamageEntry } from "../hydaca/core.js";
import { VECTORS as HYD_VECTORS } from "../hydaca/constants.js";
import { GUARD_KIND } from "../rend/sprite/types.js";
import { bodyOf, writeBody } from "../soldier/body.js";
import { burstCount, damageEntry, particleOf } from "../soldier/damage.js";
import { fistsMagnitude, fistsOffset, fistsTarget } from "../weapon/fists.js";
import { hurtSeat, partnerBody } from "./friendly.js";
import { insertBySlot, isCrab, liveParticles, lowestFreeSlot, particleEntity } from "./core.js";
import { isKindRecord, kindDamage } from "./kinds.js";
import type { TickState } from "./core.js";
export interface FistsInputs {
    readonly x: number;
    readonly y: number;
    readonly angle: number;
    readonly eyeOffset: number;
    readonly variant: number;
}
export function fistsHit(state: TickState, inputs: FistsInputs, notes: string[]): boolean {
    const { world, env } = state;
    const W = env.W;
    const ES = env.ES;
    const vx = env.view.sin256[inputs.angle]!;
    const vy = env.view.neg_cos256[inputs.angle]!;
    const character = world.player.character.value;
    const candidates = world.entities.map((e) => ({ flags: e.flags.value, floor: e.floor, pos: { x: e.pos.x, y: e.pos.y } }));
    const partner = partnerBody(state);
    if (partner !== null)
        candidates.push({ flags: partner.flags, floor: partner.floor, pos: partner.pos });
    const index = fistsTarget(candidates, { x: inputs.x, y: inputs.y, vx, vy, eyeOffset: inputs.eyeOffset, playerFloor: world.level.sub_id, character }, W);
    if (index === null)
        return false;
    if (partner !== null && index === world.entities.length) {
        const rel = fistsOffset({ x: inputs.x, y: inputs.y, vx, vy, variant: inputs.variant }, partner.pos, W);
        hurtSeat(state, partner.k, { impulse: fistsMagnitude(character, W), dx: rel.x, dy: rel.y });
        return true;
    }
    const target = world.entities[index]!;
    const d = fistsMagnitude(character, W);
    const rel = fistsOffset({ x: inputs.x, y: inputs.y, vx, vy, variant: inputs.variant }, target.pos, W);
    if (isCrab(target)) {
        const hit = { impulse: d, rel: { x: rel.x, y: rel.y }, mark: 0 };
        let after: Entity;
        if (target.vec.damage === HYD_VECTORS.live.damage)
            after = crabDamageEntry(target, hit, env.HYD);
        else if (target.vec.damage === HYD_VECTORS.corpse.damage)
            after = crabCorpseDamage(target, hit, env.HYD);
        else {
            notes.push(`fists: the crab of slot ${target.slot} has the damage entry ${target.vec.damage}, which no text specifies: not applied`);
            return true;
        }
        world.entities[index] = after;
        return true;
    }
    if (isKindRecord(target)) {
        kindDamage(state, target, d, rel.x, rel.y, 0, true, notes);
        return true;
    }
    if (target.type === GUARD_KIND) {
        notes.push(`fists: the target of slot ${target.slot} is a guard: its damage entry through the fists is not wired (ZT-ENT-GUARD 4.7 gives the shot's only); not applied`);
        return true;
    }
    if (target.type !== "enemy.rec1") {
        notes.push(`fists: the target of slot ${target.slot} is of the kind ${target.type}: its damage entry (${target.vec.damage}) is outside every spec; not applied`);
        return true;
    }
    if (target.vec.damage !== ES.SPAWN_VECTORS.damage) {
        notes.push(`fists: the soldier of slot ${target.slot} has the damage entry ${target.vec.damage}, which no text specifies (ZT-ENT-SOLDIER 4.15 is the live entry's): not applied`);
        return true;
    }
    const body = bodyOf(target);
    const burst = damageEntry(body, d, u16(rel.x), u16(rel.y), 0, ES);
    writeBody(target, body);
    if (burst === null)
        return true;
    const n = burstCount(burst.loss, ES);
    for (let i = 0; i < n; i++) {
        if (liveParticles(state) >= ES.BURST.LIVE_MAX)
            break;
        const slot = lowestFreeSlot(world);
        if (slot === null)
            break;
        const R = draw(state.rng);
        const init = particleOf({ x: target.pos.x, y: target.pos.y }, burst, R, ES);
        insertBySlot(world, particleEntity(state, slot, init.pos, init.vel, init.state));
    }
    return true;
}

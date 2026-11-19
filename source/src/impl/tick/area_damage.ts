import type { Entity } from "../../world.js";
import { s16, u16 } from "../hydaca/arith.js";
import { corpseDamage as crabCorpseDamage, damageEntry as crabDamageEntry } from "../hydaca/core.js";
import { VECTORS as HYD_VECTORS } from "../hydaca/constants.js";
import { bodyOf, writeBody } from "../soldier/body.js";
import { damageEntry } from "../soldier/damage.js";
import { GUARD } from "../guard/constants.js";
import { corpseDamage as guardCorpseDamage } from "../guard/core.js";
import { bossDamage, isBoss } from "./boss.js";
import { isCameraRecord } from "./camera.js";
import { isOrdnanceRecord, rocketHit } from "./ordnance.js";
import { isKindRecord, kindDamage } from "./kinds.js";
import { isPlacedMine, mineHit } from "./mine.js";
import { isGib } from "./flame.js";
import { burstParticles, guardHit, isCrab, isGuard } from "./core.js";
import type { TickState } from "./core.js";
export function areaHit(state: TickState, victim: Entity, impulse: number, dx: number, dy: number, mark: number, particles: boolean, notes: string[]): void {
    if (particles) {
        victimEntry(state, victim, impulse, dx, dy, mark, particles, notes);
        return;
    }
    const saved = state.liveParticlesRaised;
    state.liveParticlesRaised = state.env.ES.BURST.LIVE_MAX;
    try {
        victimEntry(state, victim, impulse, dx, dy, mark, particles, notes);
    }
    finally {
        if (saved === undefined)
            delete state.liveParticlesRaised;
        else
            state.liveParticlesRaised = saved;
    }
}
function victimEntry(state: TickState, victim: Entity, impulse: number, dx: number, dy: number, mark: number, particles: boolean, notes: string[]): void {
    const { world, env } = state;
    const ES = env.ES;
    const at = world.entities.indexOf(victim);
    if (at < 0)
        throw new Error(`areaHit: the victim of slot ${victim.slot} is not in the chain`);
    if (isCameraRecord(victim))
        return;
    if (isOrdnanceRecord(victim)) {
        rocketHit(state, victim, impulse);
        return;
    }
    if (isCrab(victim)) {
        const hit = { impulse, rel: { x: s16(dx), y: s16(dy) }, mark };
        if (victim.vec.damage === HYD_VECTORS.live.damage)
            world.entities[at] = crabDamageEntry(victim, hit, env.HYD);
        else if (victim.vec.damage === HYD_VECTORS.corpse.damage) {
            world.entities[at] = crabCorpseDamage(victim, hit, env.HYD);
        }
        else
            notes.push(`area hit: the crab of slot ${victim.slot} has the damage entry ${victim.vec.damage}, which no text specifies: not applied`);
        return;
    }
    if (isGib(victim)) {
        victim.counter = (victim.counter + 1) & 0xff;
        return;
    }
    if (isBoss(victim)) {
        bossDamage(state, victim, impulse, s16(dx), s16(dy), mark, notes);
        return;
    }
    if (isKindRecord(victim)) {
        kindDamage(state, victim, impulse, s16(dx), s16(dy), mark, particles, notes);
        return;
    }
    if (isPlacedMine(victim)) {
        mineHit(state, victim, impulse, notes);
        return;
    }
    if (isGuard(victim)) {
        guardHit(state, victim, impulse, u16(dx), u16(dy), notes);
        return;
    }
    if (victim.type !== "enemy.rec1")
        return;
    if (victim.vec.damage === ES.CORPSE_VECTORS.damage) {
        const body = bodyOf(victim);
        guardCorpseDamage(body, impulse, u16(dx), u16(dy), GUARD);
        writeBody(victim, body);
        return;
    }
    if (victim.vec.damage !== ES.SPAWN_VECTORS.damage) {
        notes.push(`area hit: the soldier of slot ${victim.slot} has the damage entry ${victim.vec.damage}, which no text specifies: not applied`);
        return;
    }
    const body = bodyOf(victim);
    const burst = damageEntry(body, impulse, u16(dx), u16(dy), mark, ES);
    writeBody(victim, body);
    if (burst !== null && particles)
        burstParticles(state, victim.pos, burst);
}

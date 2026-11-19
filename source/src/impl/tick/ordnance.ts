import type { Entity, EntityTypeName, VectorName } from "../../world.js";
import { octDist, s16, sar, u16, u8 } from "../hydaca/arith.js";
import { playerHit } from "../player_hit/core.js";
import { shotTarget } from "../soldier/damage.js";
import { FLAG_ALIVE, FLAG_IN_USE, FLAG_ON_FLOOR, GRID_SIDE, RAY } from "./constants.js";
import type { TickState } from "./core.js";
import { drainHitMessages, guardedRequest, hitPlayerOf, insertBySlot, lowestFreeSlot, mapWrite, removeEntity, request, writeHitPlayer } from "./core.js";
import { eachAliveSeat, partnerBody, twoSeatsPlay } from "./friendly.js";
import { endAnnouncement } from "../pickup/core.js";
import { blockedAt, inWallBlast, rocketToBlast } from "./mine.js";
import { sniperFlashArm } from "../sniper/core.js";
export const ROCKET_AI = "projectile.rocket.ai";
const ROCKET_DRAW = "projectile.rocket.draw";
const GRENADE_AI = "grenade.thrown.ai";
const GRENADE_DRAW = "grenade.thrown.draw";
export const IN_WALL_AI = "grenade.thrown.ai_alt";
const MINE_DAMAGE = "mine.placed.damage";
const HAILE_GRENADE_SHIFT = 1;
const FUSE_LEAD = 4;
export function isOrdnanceRecord(e: Entity): boolean {
    return e.vec.ai === ROCKET_AI || e.vec.ai === IN_WALL_AI;
}
function flagsOf(value: number): Entity["flags"] {
    return { value, in_use: (value & FLAG_IN_USE) !== 0, on_floor: (value & FLAG_ON_FLOOR) !== 0, alive: (value & FLAG_ALIVE) !== 0, link_mirror: false };
}
export interface OrdnanceMakeInputs {
    readonly angle: number;
    readonly bobAngle: number;
    readonly bobEye: number;
    readonly pic: {
        readonly cx: number;
        readonly cy: number;
        readonly gateScale: number;
    };
}
function makeTarget(state: TickState, inputs: OrdnanceMakeInputs, cone: number, weapon: number): {
    pos: Entity["pos"];
    vel: Entity["vel"];
    partner?: true;
} | null {
    const { world, env } = state;
    const p = world.player;
    const candidates = world.entities.map((c) => ({ flags: c.flags.value, floor: c.floor, pos: { x: c.pos.x, y: c.pos.y } }));
    const partner = partnerBody(state);
    if (partner !== null)
        candidates.push({ flags: partner.flags, floor: partner.floor, pos: partner.pos });
    const index = shotTarget(candidates, { weapon, cone, repeat: false, character: p.character.value, eyeOffset: p.eye_offset, playerFloor: world.level.sub_id, player: { x: p.pos.x, y: p.pos.y }, camera: { cx: inputs.pic.cx, cy: inputs.pic.cy }, aimColumn: env.R.COLUMN_CENTRE + inputs.bobAngle, gateScale: inputs.pic.gateScale }, env.ES);
    if (index === null)
        return null;
    if (partner !== null && index === world.entities.length) {
        const k = state.seats!.data.player.knockback;
        return { pos: { x: partner.pos.x, y: partner.pos.y, z: 0 }, vel: { x: k.x, y: k.y, z: 0 }, partner: true };
    }
    return world.entities[index]!;
}
function rewritePartner(state: TickState, v: Entity["vel"]): void {
    const d = state.seats!.data;
    d.player.knockback.x = v.x;
    d.player.knockback.y = v.y;
    d.move.knockbackX = v.x;
    d.move.knockbackY = v.y;
}
function leadDistance(state: TickState, t: {
    pos: Entity["pos"];
    vel: Entity["vel"];
}): number {
    const p = state.world.player.pos;
    return octDist(s16(t.pos.x + FUSE_LEAD * t.vel.x - p.x), s16(t.pos.y + FUSE_LEAD * t.vel.y - p.y));
}
function playerInWall(state: TickState): boolean {
    const { world, env } = state;
    const shift = env.R.CELL_SHIFT;
    const cx = u16(world.player.pos.x) >> shift;
    const cy = u16(world.player.pos.y) >> shift;
    if (cx >= GRID_SIDE || cy >= GRID_SIDE)
        return false;
    return env.ORDNANCE.IN_WALL_CLASSES.includes(env.classOfBlock[state.blocks[cy * GRID_SIDE + cx]!] ?? -1);
}
function record(state: TickState, slot: number, ai: string, draw: string, typed: boolean, pos: {
    x: number;
    y: number;
    z: number;
}, vel: {
    x: number;
    y: number;
    z: number;
}, life: number): Entity {
    const { env } = state;
    const left = state.residue.get(slot);
    return {
        slot,
        type: (typed ? "projectile.rocket" : "unknown") as EntityTypeName,
        type_alias: null,
        form: (typed ? "live" : "unknown") as Entity["form"],
        flags: flagsOf(env.ORDNANCE.FLAGS),
        vec: { damage: MINE_DAMAGE as VectorName, draw: draw as VectorName, ai: ai as VectorName, death: "remove" as VectorName, secondary: "none" },
        timer: 0,
        pos,
        prev: left ? { x: left.prev.x, y: left.prev.y } : { x: 0, y: 0 },
        vel,
        floor: state.world.level.sub_id,
        state: life,
        counter: left ? left.counter : 0,
        hp: left ? left.hp : 0,
        anim: left ? left.anim : 0,
        tag: slot + env.ES.TAG_OFFSET,
        art: (left ? left.art : "none") as Entity["art"],
        cell_class: left ? { alive: left.cell_class.alive, dead: left.cell_class.dead } : { alive: 0, dead: 0 },
    };
}
function eyeLine(state: TickState, inputs: OrdnanceMakeInputs): number {
    return s16(state.world.player.eye_offset + inputs.bobEye - state.hidden.lift.slide);
}
export function makeRocket(state: TickState, inputs: OrdnanceMakeInputs, notes: string[]): void {
    const { world, env } = state;
    const O = env.ORDNANCE;
    const slot = lowestFreeSlot(world);
    if (slot === null) {
        notes.push("weapon block: the pool is full, no rocket is made (ZT-WORLD-ORDNANCE 4.1)");
        return;
    }
    const vx = env.view.sin256[inputs.angle]!;
    const vy = env.view.neg_cos256[inputs.angle]!;
    const p = world.player.pos;
    const target = makeTarget(state, inputs, O.CONE, O.ITEM);
    const life = target === null ? O.STATE_NO_TARGET : u8((leadDistance(state, target) >> O.FUSE_SHIFT) + O.FUSE_ADD);
    const inWall = playerInWall(state);
    insertBySlot(world, record(state, slot, inWall ? IN_WALL_AI : ROCKET_AI, ROCKET_DRAW, !inWall, { x: u16(p.x + sar(vx, O.START_SHIFT)), y: u16(p.y + sar(vy, O.START_SHIFT)), z: s16(eyeLine(state, inputs) - O.Z_DROP) }, { x: sar(vx, O.SPEED_SHIFT), y: sar(vy, O.SPEED_SHIFT), z: state.residue.get(slot)?.vel.z ?? 0 }, life));
}
export function makeGrenade(state: TickState, inputs: OrdnanceMakeInputs, notes: string[]): void {
    const { world, env } = state;
    const O = env.ORDNANCE;
    const slot = lowestFreeSlot(world);
    if (slot === null) {
        notes.push("weapon block: the pool is full, no grenade is made (ZT-WORLD-ORDNANCE 4.6)");
        return;
    }
    const p = world.player;
    let vx = sar(env.view.sin256[inputs.angle]!, O.GRENADE_SPEED_SHIFT);
    let vy = sar(env.view.neg_cos256[inputs.angle]!, O.GRENADE_SPEED_SHIFT);
    let fuse = O.GRENADE_STATE_NO_TARGET;
    const target = makeTarget(state, inputs, O.GRENADE_CONE, O.GRENADE_ITEM);
    if (target !== null) {
        const d = leadDistance(state, target);
        fuse = u8((d >> O.GRENADE_FUSE_SHIFT) + O.GRENADE_FUSE_ADD);
        target.vel.x = s16(Math.floor((d * target.vel.x) / (1 << O.GRENADE_TARGET_VEL_SHIFT)));
        target.vel.y = s16(Math.floor((d * target.vel.y) / (1 << O.GRENADE_TARGET_VEL_SHIFT)));
        if (target.partner === true)
            rewritePartner(state, target.vel);
    }
    const position = { x: u16(p.pos.x + vx), y: u16(p.pos.y + vy), z: s16(eyeLine(state, inputs) - O.GRENADE_Z_DROP) };
    if (p.character.value === env.MINE.HAILE_CHARACTER) {
        vx = s16(vx << HAILE_GRENADE_SHIFT);
        vy = s16(vy << HAILE_GRENADE_SHIFT);
        fuse = (fuse + 1) >> HAILE_GRENADE_SHIFT;
    }
    insertBySlot(world, record(state, slot, playerInWall(state) ? IN_WALL_AI : GRENADE_AI, GRENADE_DRAW, false, position, { x: vx, y: vy, z: O.GRENADE_VZ }, fuse));
}
function cellClassOf(state: TickState, e: Entity): number {
    const shift = state.env.R.CELL_SHIFT;
    const cx = u16(e.pos.x) >> shift;
    const cy = u16(e.pos.y) >> shift;
    return cx < GRID_SIDE && cy < GRID_SIDE ? state.env.classOfBlock[state.blocks[cy * GRID_SIDE + cx]!] ?? -1 : -1;
}
export function ordnancePass(state: TickState, e: Entity, notes: string[]): void {
    if (e.vec.ai === IN_WALL_AI) {
        inWallCall(state, e);
        return;
    }
    e.timer = 0;
    const { env } = state;
    const O = env.ORDNANCE;
    e.state = u8(e.state - 1);
    const nx = u16(e.pos.x + e.vel.x);
    const ny = u16(e.pos.y + e.vel.y);
    const blocked = blockedAt(state, nx, ny);
    if (e.state !== 0 && !blocked) {
        e.pos.x = nx;
        e.pos.y = ny;
        return;
    }
    if (nx >= O.SNIPER_X_MIN) {
        const own = cellClassOf(state, e);
        if (own === env.sniper.CLASS_EXPOSED || (own === env.sniper.CLASS_COVER && s16(e.pos.z) > 0)) {
            if (state.seats === undefined)
                sniperFlashArm(state.hidden.sniper, env.sniper);
            else {
                eachAliveSeat(state, () => { if (state.floorNumber === e.floor)
                    sniperFlashArm(state.hidden.sniper, env.sniper); });
            }
            removeEntity(state, e);
            return;
        }
    }
    if (blocked) {
        const cx = nx >> env.R.CELL_SHIFT;
        const cy = ny >> env.R.CELL_SHIFT;
        if (cx < GRID_SIDE && cy < GRID_SIDE) {
            const block = state.blocks[cy * GRID_SIDE + cx]!;
            const cls = env.classOfBlock[block] ?? -1;
            const absorb = RAY.ABSORB[state.world.level.episode.value];
            if (absorb !== undefined && absorb.includes(block)) {
                removeEntity(state, e);
                return;
            }
            const up = RAY.TILE_STEP_UP.find((pair) => pair[0] === cls);
            const stepped = up === undefined ? -1 : env.classOfBlock.findIndex((c) => c === up[1]);
            if (stepped >= 0) {
                mapWrite(state, e.floor, cx, cy, stepped, notes);
                guardedRequest(state, env.W.REQ_TILE_RAY);
            }
        }
    }
    e.vel.x = 0;
    e.vel.y = 0;
    request(state, O.SOUND_IMPACT);
    rocketToBlast(state, e, O.BLAST_FLAG_MASK);
}
export function rocketHit(state: TickState, e: Entity, impulse: number): void {
    const O = state.env.ORDNANCE;
    if (u16(impulse) >= O.SHOT_IMPULSE)
        return;
    if (e.vec.ai === IN_WALL_AI) {
        inWallCall(state, e);
        return;
    }
    if (e.floor === state.floorNumber)
        request(state, state.env.MINE.SOUND_BLAST);
    rocketToBlast(state, e, O.BLAST_FLAG_MASK);
}
function inWallCall(state: TickState, e: Entity): void {
    const { env } = state;
    const O = env.ORDNANCE;
    e.timer = 0;
    if (env.P.GUARD.ENDS_ANNOUNCEMENT !== 0)
        endAnnouncement(state.message);
    request(state, O.INWALL_REQUEST);
    inWallBlast(state, e, O.INWALL_FLAGS);
    const anyFloor = twoSeatsPlay(state);
    eachAliveSeat(state, () => {
        if (!anyFloor && e.floor !== state.floorNumber)
            return;
        const p = state.world.player;
        const h = hitPlayerOf(state);
        playerHit(h, state.hit, { impulse: octDist(s16(e.pos.x - p.pos.x), s16(e.pos.y - p.pos.y)), dx: 0, dy: 0 }, env.H);
        writeHitPlayer(state, h);
        drainHitMessages(state);
    });
}

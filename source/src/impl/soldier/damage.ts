import type { SoldierConstants } from "../rend/sprite/constants.js";
import { abs16, divTrunc, octDist, s16, s32, sar, u16 } from "../hydaca/arith.js";
import type { SoldierBody } from "./common.js";
export interface ShotCandidate {
    readonly flags: number;
    readonly floor: number;
    readonly pos: {
        readonly x: number;
        readonly y: number;
    };
}
export interface ShotInputs {
    readonly weapon: number;
    readonly repeat: boolean;
    readonly character: number;
    readonly eyeOffset: number;
    readonly playerFloor: number;
    readonly player: {
        readonly x: number;
        readonly y: number;
    };
    readonly camera: {
        readonly cx: number;
        readonly cy: number;
    };
    readonly aimColumn: number;
    readonly gateScale: number;
    readonly cone?: number;
}
export function shotTarget(records: readonly ShotCandidate[], inputs: ShotInputs, C: SoldierConstants): number | null {
    const hit = C.HIT;
    const cone = hit.CONES[String(inputs.weapon)];
    if (cone === undefined && inputs.cone === undefined) {
        throw new Error(`ZT-ENT-SOLDIER 4.14: weapon ${inputs.weapon} has no cone in HIT.CONES (melee swings and the extinguisher have their own picker: not specified for the window)`);
    }
    let k = inputs.cone ?? (cone!.characters.includes(inputs.character) ? cone!.alt : cone!.default);
    if (inputs.cone === undefined && inputs.repeat && inputs.character === 0 && cone!.repeat_character_0 !== undefined)
        k = cone!.repeat_character_0;
    const eye = s16(inputs.eyeOffset);
    const mask = eye === 0 ? hit.FLAG_MASKS.eye_zero : eye > 0 ? hit.FLAG_MASKS.eye_positive : hit.FLAG_MASKS.eye_negative;
    const { cx, cy } = inputs.camera;
    let best = u16(inputs.gateScale);
    let target: number | null = null;
    for (let i = 0; i < records.length; i++) {
        const r = records[i]!;
        if ((r.flags & mask) === 0)
            continue;
        if (r.floor !== inputs.playerFloor)
            continue;
        const rx = s16(r.pos.x - inputs.player.x);
        const ry = s16(r.pos.y - inputs.player.y);
        const F = s32(rx * cx + ry * cy) >> hit.DEPTH_SHIFT;
        if (F < hit.MIN_DEPTH)
            continue;
        const S = u16(divTrunc(hit.SCALE_NUMERATOR, F));
        if (!(S > best))
            continue;
        const cross = s32(ry * cx - rx * cy);
        const lat = u16(abs16(divTrunc(cross, F)) + hit.LATERAL_BIAS - inputs.aimColumn);
        if (lat > u16(sar(S, hit.CONE_SHIFT) + k))
            continue;
        best = S;
        target = i;
    }
    return target;
}
export function shotMagnitude(o: number, inputs: Pick<ShotInputs, "weapon" | "repeat" | "character">, C: SoldierConstants): number | null {
    const m = C.HIT.MAGNITUDES;
    const key = String(inputs.weapon);
    let rule = m[key];
    if (rule === undefined) {
        const melee = m["melee"];
        if (melee !== undefined && melee.weapon_ids !== undefined && melee.weapon_ids.includes(inputs.weapon))
            rule = melee;
    }
    if (rule === undefined)
        throw new Error(`ZT-ENT-SOLDIER 4.14: weapon ${inputs.weapon} has no magnitude rule in HIT.MAGNITUDES`);
    if (rule.max_octagon_exclusive !== undefined && o >= rule.max_octagon_exclusive)
        return null;
    let d: number;
    if (rule.kind === "square") {
        d = sar(s16((Math.imul(o, o) >>> C.HIT.SQUARE_SHIFT) & 0xffff), C.HIT.SQUARE_EXTRA_SHIFT);
    }
    else if (rule.kind === "linear") {
        d = sar(o, rule.shift ?? 0);
    }
    else {
        d = rule.by_character?.[String(inputs.character)] ?? rule.value ?? 0;
    }
    const halved = (rule.halved_for ?? []).includes(inputs.character) || (inputs.repeat && (rule.repeat_halved_for ?? []).includes(inputs.character));
    if (halved)
        d = sar(d, 1);
    if (d >= C.HIT.MAGNITUDE_GATE)
        return null;
    return d;
}
export interface BurstRequest {
    readonly loss: number;
    readonly qx: number;
    readonly qy: number;
}
export function damageEntry(e: SoldierBody, d: number, relx: number, rely: number, areaMark: number, C: SoldierConstants): BurstRequest | null {
    e.state = C.HURT_STATE;
    e.counter = 0;
    e.vel.x = 0;
    e.vel.y = 0;
    const ux = s16(-relx);
    const uy = s16(-rely);
    const n = s16(octDist(ux, uy));
    let qx: number;
    let qy: number;
    if (n + 1 === 0) {
        qx = s16(ux << C.DMG.UNIT_SHIFT);
        qy = s16(uy << C.DMG.UNIT_SHIFT);
    }
    else {
        qx = s16(divTrunc(ux * (1 << C.DMG.UNIT_SHIFT), n + 1));
        qy = s16(divTrunc(uy * (1 << C.DMG.UNIT_SHIFT), n + 1));
    }
    const loss = s16(C.DMG.FULL - d);
    if (loss < 0)
        return null;
    let burst: BurstRequest | null = null;
    if (e.hp >= 0) {
        e.hp = s16(e.hp - loss);
        if (e.hp < 0 && loss >= C.DMG.BURST_LOSS) {
            burst = { loss, qx, qy };
            e.hitMark = areaMark;
        }
    }
    const v = s16(sar(loss, C.DMG.LOSS_SHIFT));
    e.vel.x = s16(sar(qx * v, C.DMG.VELOCITY_SHIFT));
    e.vel.y = s16(sar(qy * v, C.DMG.VELOCITY_SHIFT));
    return burst;
}
export function burstCount(loss: number, C: SoldierConstants): number {
    return sar(loss - C.DMG.BURST_LOSS, C.BURST.COUNT_SHIFT) + C.BURST.COUNT_ADD;
}
export interface ParticleInit {
    readonly pos: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
    };
    readonly vel: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
    };
    readonly state: number;
}
export function particleOf(soldier: {
    readonly x: number;
    readonly y: number;
}, burst: BurstRequest, R: number, C: SoldierConstants): ParticleInit {
    const out = { x: soldier.x, y: soldier.y, vx: 0, vy: 0, vz: 0, pz: 0 };
    for (const f of C.BURST.DRAW) {
        const base = ((R >>> f.shift) & f.mask) - f.bias;
        const v = base + (f.add_to === "unit.x" ? burst.qx : f.add_to === "unit.y" ? burst.qy : 0);
        if (f.field === "vel.x")
            out.vx = s16(v);
        else if (f.field === "vel.y")
            out.vy = s16(v);
        else if (f.field === "vel.z")
            out.vz = s16(v);
        else
            out.pz = s16(v);
    }
    return { pos: { x: out.x, y: out.y, z: out.pz }, vel: { x: out.vx, y: out.vy, z: out.vz }, state: 0 };
}

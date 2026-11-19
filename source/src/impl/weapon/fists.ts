import { octDist, s16, u16 } from "../hydaca/arith.js";
import { CHARACTER_BY_INDEX } from "../start/constants.js";
import type { WeaponConstants } from "./constants.js";
const CH_RAMOS = CHARACTER_BY_INDEX.indexOf("ramos");
const CH_GJOERUP = CHARACTER_BY_INDEX.indexOf("gjoerup");
export interface FistCandidate {
    readonly flags: number;
    readonly floor: number;
    readonly pos: {
        readonly x: number;
        readonly y: number;
    };
}
export interface FistSearchInputs {
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly eyeOffset: number;
    readonly playerFloor: number;
    readonly character: number;
}
export function fistsMask(eyeOffset: number, C: WeaponConstants): number {
    if (eyeOffset === 0)
        return C.FISTS_MASK_STAND;
    return eyeOffset > 0 ? C.FISTS_MASK_AIR : C.FISTS_MASK_CROUCH;
}
export function fistsTarget(list: readonly FistCandidate[], inp: FistSearchInputs, C: WeaponConstants): number | null {
    const mask = fistsMask(inp.eyeOffset, C);
    let best = 65535;
    let found: number | null = null;
    for (let i = 0; i < list.length; i++) {
        const c = list[i]!;
        if ((c.flags & mask) !== mask || c.floor !== inp.playerFloor)
            continue;
        const dist = octDist(s16(c.pos.x - inp.x), s16(c.pos.y - inp.y));
        if (dist < best) {
            best = dist;
            found = i;
        }
    }
    if (found === null)
        return null;
    const c = list[found]!;
    const dx = s16(c.pos.x - inp.x);
    const dy = s16(c.pos.y - inp.y);
    const F = (dx * inp.vx + dy * inp.vy) >> C.FISTS_DEPTH_SHIFT;
    if (F < C.FISTS_MIN_DEPTH)
        return null;
    if (F === C.FISTS_MIN_DEPTH)
        return null;
    const S = Math.floor(65536 / F) & 0xffff;
    const reach = inp.character === CH_RAMOS ? C.FISTS_REACH_CH3 : C.FISTS_REACH;
    if (!(S > reach))
        return null;
    const latAbs = u16(Math.abs(Math.trunc((dy * inp.vx - dx * inp.vy) / F)));
    if (latAbs > S >> C.FISTS_SIDE_SHIFT)
        return null;
    return found;
}
export function fistsMagnitude(character: number, C: WeaponConstants): number {
    if (character === CH_RAMOS)
        return C.FISTS_MAG_CH3;
    if (character === CH_GJOERUP)
        return C.FISTS_MAG_CH4;
    return C.FISTS_MAG;
}
export function fistsOffset(inp: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    variant: number;
}, target: {
    x: number;
    y: number;
}, C: WeaponConstants): {
    x: number;
    y: number;
} {
    const px = inp.variant & 1 ? -inp.vy : inp.vy;
    const py = inp.variant & 1 ? inp.vx : -inp.vx;
    const hx = s16(inp.x + (s16(px) >> C.FISTS_PERP_SHIFT));
    const hy = s16(inp.y + (s16(py) >> C.FISTS_PERP_SHIFT));
    return { x: s16(hx - target.x), y: s16(hy - target.y) };
}

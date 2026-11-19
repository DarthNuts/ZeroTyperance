import type { EntityRecord } from "../rend/sprite/types.js";
import { partnerRecord } from "../rend/sprite/partner.js";
import type { PartnerConstants } from "../rend/sprite/partner.js";
import type { TickState } from "./core.js";
export const PARTNER_KIND = "coop.partner";
export const PARTNER_DRAW = "coop.partner.draw";
export const PARTNER_SLOT = -1;
export type PartnerPoolRecord = EntityRecord & {
    readonly choice: NonNullable<EntityRecord["choice"]>;
};
export function partnerPoolRecord(state: TickState, C: PartnerConstants | undefined): PartnerPoolRecord | null {
    const seats = state.seats;
    if (seats === undefined || C === undefined)
        return null;
    const other: 0 | 1 = seats.live === 0 ? 1 : 0;
    const f = seats.data;
    const L = state.env.L;
    const riding = f.lift.state === L.STATE.UP ? 1 : f.lift.state === L.STATE.DOWN ? -1 : 0;
    const out = seats.out[other];
    const w = f.weapon;
    const rec = partnerRecord({
        x: f.player.pos.x,
        y: f.player.pos.y,
        angle: f.player.angle,
        forwardSpeed: f.move.forward,
        knockbackX: f.move.knockbackX,
        knockbackY: f.move.knockbackY,
        eyeOffset: f.player.eye_offset,
        height: f.lift.slide,
        liftTransit: riding,
        deathCounter: out ? 1 : f.deathCounter,
        weaponIsFists: w !== null && w.current === state.env.W.W_FISTS,
        fireFrame: w === null ? 0 : w.anim,
        counterByte: out ? 1 : f.deathCounter & 0xff,
    }, C, state.env.view);
    if (rec.bank === null || rec.bankState === null || rec.frame === null)
        return null;
    return {
        kind: PARTNER_KIND,
        slot: PARTNER_SLOT,
        tag: 0,
        form: "live",
        art: "main",
        flags: rec.flags,
        vec: { damage: PARTNER_DRAW, draw: PARTNER_DRAW, ai: PARTNER_DRAW, death: PARTNER_DRAW } as unknown as EntityRecord["vec"],
        timer: 0,
        pos: { x: rec.x, y: rec.y },
        z: rec.z,
        vel: { x: rec.vx, y: rec.vy },
        state: rec.bankState,
        counter: 0,
        hp: 0,
        anim: state.partnerAnim ?? 0,
        floor: f.floorNumber,
        choice: { bank: rec.bank, state: rec.bankState, d2: rec.frame },
    };
}

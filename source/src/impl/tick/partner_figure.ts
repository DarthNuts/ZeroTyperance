import type { EntityRecord } from "../rend/sprite/types.js";
import { partnerRecord } from "../rend/sprite/partner.js";
import type { PartnerConstants } from "../rend/sprite/partner.js";
import type { TickState } from "./core.js";
export const PARTNER_KIND = "coop.partner";
export const PARTNER_DRAW = "coop.partner.draw";
export const PARTNER_SLOT = -1;
export const PARTNER_SHARED_RIDE = { on: true };
export const PARTNER_RIDE_47 = { on: false };
export const PARTNER_PICTURE_HOOK: {
    cb: ((viewer: 0 | 1, rec: PartnerPoolRecord | null, state: TickState) => void) | null;
} = { cb: null };
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
    const own = state.hidden.lift;
    const shift = state.env.R.CELL_SHIFT;
    const vp = state.world.player.pos;
    const ownRiding = own.state === L.STATE.UP || own.state === L.STATE.DOWN;
    const sameCell = vp.x >> shift === f.player.pos.x >> shift && vp.y >> shift === f.player.pos.y >> shift;
    const joining = !ownRiding && state.floorNumber === f.floorNumber;
    const sameRide = PARTNER_SHARED_RIDE.on && riding !== 0 && sameCell && (PARTNER_RIDE_47.on
        ? own.state === f.lift.state && own.slide === f.lift.slide && state.floorNumber === f.floorNumber
        : ownRiding || joining);
    const shared = sameRide && !PARTNER_RIDE_47.on;
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
        height: shared ? own.slide : f.lift.slide,
        liftTransit: riding,
        sameRide,
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
        floor: shared ? state.world.level.sub_id : f.floorNumber,
        choice: { bank: rec.bank, state: rec.bankState, d2: rec.frame },
    };
}

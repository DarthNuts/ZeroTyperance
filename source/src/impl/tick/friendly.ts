import type { TickState } from "./core.js";
import { drainHitMessages, hitPlayerOf, inSeat, writeHitPlayer } from "./core.js";
import type { HitCall } from "../player_hit/core.js";
import { playerHit } from "../player_hit/core.js";
export function aliveSeats(state: TickState): Array<0 | 1> {
    const seats = state.seats;
    if (seats === undefined)
        return [0];
    return ([0, 1] as const).filter((k) => !seats.out[k]);
}
export function twoSeatsPlay(state: TickState): boolean {
    const seats = state.seats;
    return seats !== undefined && !seats.out[0] && !seats.out[1];
}
export function eachAliveSeat(state: TickState, fn: (k: 0 | 1) => void): void {
    if (state.seats === undefined) {
        fn(0);
        return;
    }
    for (const k of aliveSeats(state))
        inSeat(state, k, () => fn(k));
}
export interface PartnerBody {
    readonly k: 0 | 1;
    readonly pos: {
        readonly x: number;
        readonly y: number;
    };
    readonly floor: number;
    readonly flags: number;
}
export function partnerBody(state: TickState): PartnerBody | null {
    const seats = state.seats;
    if (seats === undefined || !twoSeatsPlay(state))
        return null;
    const k: 0 | 1 = seats.live === 0 ? 1 : 0;
    const d = seats.data;
    const ES = state.env.ES;
    const eye = d.player.eye_offset;
    return { k, pos: { x: d.player.pos.x, y: d.player.pos.y }, floor: d.floorNumber, flags: eye < 0 ? ES.SPAWN_FLAGS & ES.CORPSE_FLAG_MASK : ES.SPAWN_FLAGS };
}
export function hurtSeat(state: TickState, k: 0 | 1, call: HitCall): void {
    inSeat(state, k, () => {
        const h = hitPlayerOf(state);
        playerHit(h, state.hit, call, state.env.H);
        writeHitPlayer(state, h);
        drainHitMessages(state);
    });
}

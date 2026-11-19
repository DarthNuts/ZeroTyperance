import type { TickState } from "../tick/core.js";
import { modernPadByte, modernSeatOf } from "./seat.js";
import type { ModernDescriptor } from "./seat.js";
export function setModern(state: TickState, seat: 0 | 1, d: ModernDescriptor | null): void {
    if (d !== null && state.env.MODERN === undefined)
        throw new Error("setModern: the environment has no MODERN constants (player_modern)");
    const seats = state.seats;
    if (seat === 1 && seats === undefined)
        throw new Error("setModern: seat 1 needs a two-seat world");
    const holder = seat === 0 ? (seats === undefined || seats.live === 0 ? state : seats.data) : seats!.live === 1 ? state : seats!.data;
    if (d === null)
        delete holder.modern;
    else
        holder.modern = modernSeatOf(holder.modern, d);
}
export function modernOfSeat(state: TickState, seat: 0 | 1): TickState["modern"] {
    const seats = state.seats;
    if (seat === 0)
        return seats === undefined || seats.live === 0 ? state.modern : seats.data.modern;
    return seats === undefined ? undefined : seats.live === 1 ? state.modern : seats.data.modern;
}
export { modernPadByte };

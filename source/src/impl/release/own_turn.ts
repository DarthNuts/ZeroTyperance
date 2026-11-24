import type { NetCore } from "../net/core.js";
import { unpackModernPad } from "../net/scheme.js";
import type { TickState } from "../tick/core.js";
export function predictedTurn(o: {
    readonly played: boolean;
    readonly stored: number;
    readonly pending: number;
    readonly delay: number;
    readonly mouseTurnMax: number;
}): number {
    if (!o.played)
        return 0;
    const bound = (Math.max(0, o.delay) + 2) * o.mouseTurnMax;
    const v = Math.max(-bound, Math.min(bound, o.stored + o.pending));
    return v === 0 ? 0 : v;
}
export interface StoredPads {
    readonly local: ReadonlyMap<number, number>;
}
export function storedTurnsAfter(p: StoredPads, after: number | null): {
    sum: number;
    turns: {
        turn: number;
        at: number;
    }[];
} {
    const turns: {
        turn: number;
        at: number;
    }[] = [];
    let sum = 0;
    if (after === null)
        return { sum, turns };
    for (let t = after + 1; p.local.has(t); t++) {
        const turn = unpackModernPad(p.local.get(t)!).mouse_turn;
        if (turn !== 0)
            turns.push({ turn, at: t });
        sum += turn;
    }
    return { sum, turns };
}
export class OwnStepsSinceSnapshot {
    private sum_ = 0;
    ran(turn: number): void { this.sum_ += turn; }
    snapshot(): void { this.sum_ = 0; }
    clear(): void { this.sum_ = 0; }
    get sum(): number { return this.sum_; }
}
interface PlaySession {
    readonly stage?: unknown;
    readonly run?: {
        state: TickState;
    } | null;
    seatPicture?(seat: 0 | 1): unknown;
    readonly choosingSeat?: 0 | 1 | null;
}
export function coopSeatPlays(page: {
    readonly phase: string;
    readonly core: NetCore | null;
}, seat: 0 | 1, menuOpen: boolean): boolean {
    if (menuOpen || page.phase !== "running" || page.core === null)
        return false;
    const session = (page.core as unknown as {
        state?: {
            session?: PlaySession;
        };
    }).state?.session;
    const st = session?.run?.state;
    if (!session || !st || session.stage !== "play")
        return false;
    const seats = st.seats;
    if (seats !== undefined && (seats.pause[0] === true || seats.pause[1] === true || seats.out[seat] === true))
        return false;
    if ((session.seatPicture?.(seat) ?? null) !== null || session.choosingSeat === seat)
        return false;
    const hp = seats === undefined || seat === 0 ? st.world.player.hp : seats.data.player.hp;
    return hp > 0;
}

export interface FlameMem {
    age: number;
    tag: number;
    x: number;
    y: number;
}
export interface PileMem {
    tag: number;
    x: number;
    y: number;
    target: "player" | "none";
}
export interface PlacedState {
    target: number | "player" | "player1" | null;
    calls: number;
}
export interface Kept<T> {
    at: string;
    v: T;
}
export interface KeptMem {
    readonly flames: Map<number, FlameMem>;
    readonly piles: Map<number, PileMem>;
    readonly placed: Map<number, Kept<PlacedState>>;
    readonly blasts: Map<number, Kept<number>>;
}
export function keptStart(): KeptMem {
    return { flames: new Map(), piles: new Map(), placed: new Map(), blasts: new Map() };
}

import type { EventSink } from "../../domain.js";
export interface PasswordRecord {
    readonly alive: readonly number[];
    readonly items: readonly number[];
    readonly amounts: readonly number[];
    readonly max_health: number;
    readonly level_byte: number;
}
export type PasswordDecoder = (code: string, amountsBefore: readonly number[]) => PasswordRecord | null;
export interface PasswordResult {
    readonly stored: string;
    readonly accepted: boolean;
    readonly record: PasswordRecord | null;
}
export interface PasswordScreen {
    enter(stored: string, amountsBefore?: readonly number[]): void;
    tick(pad: number, events: EventSink): void;
    readonly exit: PasswordResult | null;
    readonly frame: number;
    readonly display: 0 | 1;
    readonly cram: readonly number[];
    indices(): Uint8Array;
}

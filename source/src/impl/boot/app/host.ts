import type { AudioEngine } from "./audio.js";
import type { CheatRules } from "../../tick/cheats.js";
import type { ModernDescriptor } from "../../modern/seat.js";
import type { NetCore } from "../../net/core.js";
import type { SeatRules } from "../../tick/seats.js";
import type { CoopScreens } from "../../release/coop_page.js";
export type CoopStartPoint = {
    readonly kind: "episode";
    readonly episode: number;
} | {
    readonly kind: "password";
    readonly code: string;
};
export interface QuickGrid {
    readonly cells: readonly (readonly string[])[];
    readonly cols: number;
    readonly rows: number;
    readonly leftRemap: readonly number[];
    readonly rightRemap: readonly number[];
}
export type QuickView = {
    readonly screen: "other";
} | {
    readonly screen: "title";
    readonly cursor: "none" | "start" | "options";
    readonly ended: boolean;
} | {
    readonly screen: "options";
    readonly atPassword: boolean;
    readonly atExit: boolean;
    readonly ended: boolean;
    readonly accepted: boolean | null;
} | {
    readonly screen: "password";
    readonly row: number;
    readonly col: number;
    readonly buffer: string;
    readonly blank: string;
    readonly error: boolean;
    readonly ended: boolean;
    readonly grid: QuickGrid;
};
export interface HostApi {
    pause(): void;
    resume(): void;
    powerOnWithPassword(code: string, skipIntro: boolean): boolean;
    passwordNow(): {
        readonly code: string;
        readonly episode: number;
        readonly floor: number;
    } | null;
    setModern(desc: ModernDescriptor | null): void;
    coopCore(point: CoopStartPoint, seed: number, offsetX: number, characters: readonly [
        number,
        number
    ], rules?: SeatRules): NetCore | null;
    coopSounds(json: readonly string[]): void;
    coopScreens(prefill: () => string | null): CoopScreens | null;
    coopScreenEvents(events: readonly unknown[]): void;
    skipToTitle(): void;
    readonly engine: AudioEngine;
    saveState(): {
        readonly state: string;
        readonly episode: number;
        readonly floor: number;
    } | null;
    loadState(state: string): boolean;
}
export interface AppHost {
    pad?: () => number;
    pace?: {
        start(nowMs: number): void;
        poll(nowMs: number): number;
    } | null;
    modern?: () => ModernDescriptor | null;
    cheats?: () => CheatRules;
    api?: HostApi;
}
export function getHost(): AppHost | undefined {
    return (globalThis as {
        __ztHost?: AppHost;
    }).__ztHost;
}

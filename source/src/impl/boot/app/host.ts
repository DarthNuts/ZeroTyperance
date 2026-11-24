import type { AudioEngine } from "./audio.js";
import type { IntroMode } from "./intro_gate.js";
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
export interface HostMoment {
    readonly place: {
        readonly episode: number;
        readonly floor: number;
        readonly cell: readonly [
            number,
            number
        ];
        readonly position: {
            readonly x: number;
            readonly y: number;
        };
        readonly eye_offset: number;
        readonly slide: number;
    };
    readonly view: {
        readonly snapshots: readonly [
            object,
            object
        ];
        readonly alpha: number;
        readonly camera: {
            readonly x: number;
            readonly y: number;
            readonly angle: number;
        };
    } | null;
    readonly hdCanvases: readonly HTMLCanvasElement[];
    readonly frame: HTMLCanvasElement;
}
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
    coopHd?(core: unknown, seat: 0 | 1, screen: {
        readonly cram: readonly number[];
        readonly indices?: Uint8Array;
    }): void;
    coopHdHide?(): void;
    coopSounds(json: readonly string[]): void;
    coopAudio(session: {
        readonly seat: 0 | 1;
        readonly voices: number;
    } | null): void;
    coopScreens(prefill: () => string | null): CoopScreens | null;
    coopScreenEvents(events: readonly unknown[]): void;
    skipToTitle(): void;
    readonly engine: AudioEngine;
    saveState(): {
        readonly state: string;
        readonly episode: number;
        readonly floor: number;
    } | null;
    momentNow?(): HostMoment | null;
    loadState(state: string): boolean;
}
export interface HostHd {
    readonly renderer: "original" | "custom";
    readonly layout: "corners" | "bar";
    readonly resolution: "native" | "half" | "quarter" | "original";
    readonly smooth_motion: boolean;
    readonly loot?: boolean;
    readonly hand_size?: number | "normal" | "double";
    readonly frame_limit?: "display" | 60 | 30;
    readonly params: {
        readonly fov: "auto" | number;
        readonly smooth: boolean;
        readonly filter: "sharp" | "smooth";
    };
}
export interface AppHost {
    hd?: () => HostHd;
    modernTurn?: (newestSessionStep: number | null, onePlayerPlays: boolean) => number | null;
    stepMs?: (paced: boolean) => number;
    paceMs?: (pace: {
        readonly num: number;
        readonly den: number;
    }) => number;
    pad?: () => number;
    pace?: {
        start(nowMs: number): void;
        poll(nowMs: number): number;
    } | null;
    modern?: () => ModernDescriptor | null;
    intro?: () => IntroMode;
    cheats?: () => CheatRules;
    api?: HostApi;
}
export function getHost(): AppHost | undefined {
    return (globalThis as {
        __ztHost?: AppHost;
    }).__ztHost;
}

import type { CameraConstants } from "../../camera/constants.js";
import type { SoldierConstants, SpriteConstants, VectorNames } from "./constants.js";
import type { EnemyKind } from "./kinds.js";
import type { HydConstants } from "../../hydaca/constants.js";
export type Art = Uint8Array;
export interface FrameRecord {
    readonly cols: number;
    readonly rows: number;
    readonly slots: readonly number[];
    readonly flips: readonly number[];
    readonly wNum: number;
    readonly hNum: number;
    readonly xmode: number;
    readonly ymode: number;
}
export interface BankView {
    readonly direction: number;
    readonly K: number;
    readonly frames: readonly FrameRecord[];
}
export interface BankState {
    readonly viewMode: number;
    readonly views: readonly BankView[];
}
export interface Bank {
    readonly name: string;
    readonly states: readonly BankState[];
    cellArt(slot: number): Art | null;
}
export interface ItemGeometry {
    readonly height: string;
    readonly width: string;
    readonly top: string;
    readonly left: string;
    readonly order: readonly string[];
}
export interface ItemArt {
    readonly slot: number;
    readonly role: string;
}
export interface ItemEntry {
    readonly cls: number;
    readonly arts: readonly ItemArt[];
    readonly geometries: readonly ItemGeometry[];
}
export interface CompositeEntry {
    readonly cls: number;
    readonly bank: string;
    readonly state: number;
    readonly frame: number;
}
export interface SpriteAssets {
    itemArt(slot: number): Art | null;
    item(cls: number): ItemEntry | null;
    composite(cls: number): CompositeEntry | null;
    drawsNothing(cls: number): boolean;
    bank(name: string): Bank | null;
    readonly animLut: ReadonlyArray<readonly number[]>;
    shadeTable(name: string, mirrored: boolean): Uint8Array | null;
    shadeArray(name: string): readonly string[] | null;
    arrayOfMode(mode: number): string | null;
    artId?(art: Art): ArtRef | null;
}
export interface ArtRef {
    readonly bank: string | null;
    readonly slot: number;
}
export interface SpriteObserver {
    entity(e: {
        readonly slot: number;
        readonly x: number;
        readonly y: number;
        readonly z: number;
        readonly S: number;
        readonly sx: number;
        readonly sy: number;
        readonly loot?: 0 | 1 | 2 | 3;
        readonly corpse?: boolean;
    }): void;
    part(art: Art, mirrored: boolean, rect: SpriteRect): void;
    end(): void;
    corpseFrame(cell: readonly [
        number,
        number
    ], frame: number): void;
}
export interface Surface {
    readonly columns: number;
    readonly rows: number;
    readonly bytes: Uint8Array;
    readonly depth: readonly number[];
    readonly beam?: {
        readonly first: number;
        readonly count: number;
    } | null;
}
export interface SpriteRect {
    readonly h: number;
    readonly w: number;
    readonly left: number;
    readonly top: number;
}
export interface ItemRecord {
    readonly cls: number;
    readonly S: number;
    readonly column: number;
    readonly cell: readonly [
        number,
        number
    ];
}
export interface StampedCell {
    readonly cell: readonly [
        number,
        number
    ];
    readonly cls: number;
}
export type EntityForm = "live" | "corpse";
export type EntityArt = "main" | "alt";
export interface EntityRecord {
    kind: string;
    slot: number;
    tag: number;
    form: EntityForm;
    art: EntityArt;
    flags: number;
    vec: VectorNames;
    timer: number;
    pos: {
        x: number;
        y: number;
    };
    z: number;
    vel: {
        x: number;
        y: number;
    };
    state: number;
    counter: number;
    hp: number;
    anim: number;
    velZ?: number;
    floor: number;
    home?: {
        x: number;
        y: number;
    };
    target?: "player" | "none" | "unknown";
    kindRow?: EnemyKind;
    age?: number;
    choice?: {
        readonly bank: string;
        readonly state: number;
        readonly d2: number;
    };
}
export interface EntityPool {
    records: EntityRecord[];
    occupied?: ReadonlySet<number>;
    residue?: (slot: number) => {
        readonly vel: {
            readonly x: number;
            readonly y: number;
        };
        readonly anim: number;
    } | undefined;
}
export const SOLDIER_KIND = "enemy.rec1";
export const GUARD_KIND = "enemy.rec4";
export type SpriteEvent = {
    readonly type: "Map.Write";
    readonly floor: number;
    readonly x: number;
    readonly y: number;
    readonly block: number;
} | {
    readonly type: "Audio.Request";
    readonly request: number;
};
export interface SpawnResult {
    readonly record: EntityRecord;
    readonly events: readonly SpriteEvent[];
}
export interface Camera {
    readonly cx: number;
    readonly cy: number;
    readonly VX: number;
    readonly VY: number;
    readonly cellx: number;
    readonly celly: number;
}
export interface SpriteContext {
    readonly camera?: {
        readonly C: CameraConstants;
        readonly playerX: number;
        readonly playerY: number;
    };
    readonly SC: SpriteConstants;
    readonly ES: SoldierConstants;
    readonly assets: SpriteAssets;
    readonly phase: number | null;
    readonly cells: readonly StampedCell[];
    readonly pool: EntityPool;
    readonly playerFloor: number;
    readonly kinds?: ReadonlyMap<number, EnemyKind>;
    readonly draw?: () => number;
    readonly hyd?: HydConstants;
    readonly player?: {
        readonly x: number;
        readonly y: number;
    };
    observer?: SpriteObserver;
}
export interface PassInputs {
    readonly ctx: SpriteContext;
    readonly surface: Surface;
    readonly camera: Camera;
    readonly mode: number;
    readonly eye: number;
    readonly items: readonly ItemRecord[];
    readonly note: (s: string) => void;
    readonly nightVision?: boolean;
}
export function octagon(dx: number, dy: number): number {
    const ax = Math.abs(dx) & 0xffff;
    const ay = Math.abs(dy) & 0xffff;
    const sum = (Math.max(ax, ay) + ax + ay) & 0xffff;
    return (((sum << 16) >> 16) >> 1) & 0xffff;
}

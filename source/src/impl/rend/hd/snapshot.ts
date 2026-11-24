import { asr, mod, s16, u16 } from "../arith.js";
import type { RendConstants } from "../constants.js";
import type { DoorView, FloorMap, LightView, Pose } from "../core.js";
import { FACE_HIGH_X, FACE_HIGH_Y, FACE_LOW_X, FACE_LOW_Y, rampWordFor } from "../core.js";
import type { Face } from "../core.js";
import type { FloorDoc } from "../floor_map.js";
import { METATEXTURE_SLOTS } from "../floor_map.js";
import type { TrigTable } from "../trig.js";
import type { HydConstants } from "../../hydaca/constants.js";
import type { SpriteConstants } from "../sprite/constants.js";
import { cellParts } from "../sprite/parts.js";
import { itemRow as itemRowOf, projectCell } from "../sprite/project.js";
import type { ArtRef, Camera, SpriteAssets, SpriteObserver } from "../sprite/types.js";
export interface SnapshotRamp {
    readonly cell: readonly [
        number,
        number
    ];
    readonly face: Face;
    readonly hi: number;
    readonly lo: number;
}
export interface SnapshotStrips {
    readonly shown: boolean;
    readonly A: number;
    readonly y: number;
    readonly floor: number;
    readonly z: number;
}
export interface SnapshotPart {
    readonly art: ArtRef;
    readonly mirrored: boolean;
    readonly rect: {
        readonly left: number;
        readonly top: number;
        readonly w: number;
        readonly h: number;
    };
    readonly own?: {
        readonly art: Uint8Array;
        readonly line: number;
        readonly fitTo?: ReadonlyArray<{
            readonly w: number;
            readonly h: number;
        }>;
    };
}
export interface SnapshotEntity {
    readonly slot: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly S: number;
    readonly sx: number;
    readonly sy: number;
    readonly loot: 0 | 1 | 2 | 3;
    readonly corpse?: boolean;
    readonly parts: SnapshotPart[];
}
export interface SnapshotCell {
    readonly cell: readonly [
        number,
        number
    ];
    readonly cls: number;
    readonly S: number;
    readonly sx: number;
    readonly sy: number;
    readonly parts: SnapshotPart[];
    readonly at?: {
        readonly x: number;
        readonly y: number;
        readonly h: number;
    };
}
export interface ViewSnapshot {
    readonly step: number;
    readonly seat: 0 | 1;
    readonly floor_key: {
        readonly episode: number;
        readonly floor: number;
    };
    readonly mode: number;
    readonly cam: {
        readonly x: number;
        readonly y: number;
        readonly angle: number;
        readonly eye_walls: number;
        readonly eye_lanes: number;
        readonly slide: number;
    };
    readonly view_distance: number;
    readonly box: {
        readonly cell: readonly [
            number,
            number
        ];
        readonly xl: number;
        readonly xr: number;
        readonly yb: number;
        readonly yt: number;
    };
    readonly map: {
        readonly side: number;
        readonly block: Uint16Array;
        readonly cls: Uint16Array;
    };
    readonly metatex: Uint16Array;
    readonly doors: readonly DoorView[];
    readonly ramps: readonly SnapshotRamp[];
    readonly lit: boolean;
    readonly night: boolean;
    readonly beam_first: number | null;
    readonly sky: {
        readonly class: string | null;
        readonly vs: number | null;
        readonly strips: SnapshotStrips | null;
    };
    readonly entities: SnapshotEntity[];
    readonly cells: SnapshotCell[];
}
export interface SnapshotInputs {
    readonly step: number;
    readonly seat: 0 | 1;
    readonly pose: Pose;
    readonly floor: FloorMap & {
        readonly doc: FloorDoc;
    };
    readonly doors: readonly DoorView[];
    readonly overlay: ReadonlyArray<{
        readonly cell: readonly [
            number,
            number
        ];
        readonly cls: number;
    }>;
    readonly light: LightView | null;
    readonly sky: {
        readonly class: string | null;
        readonly vs: number | null;
        readonly strips: SnapshotStrips | null;
    };
}
const METATEX_DEFS_MIN = 256;
const FACES: readonly Face[] = [FACE_LOW_Y, FACE_HIGH_Y, FACE_LOW_X, FACE_HIGH_X];
export function recordSnapshot(inp: SnapshotInputs, C: RendConstants, trig: TrigTable): ViewSnapshot {
    const { pose, floor } = inp;
    const doc = floor.doc;
    const angle = mod(pose.angle, C.ANGLES);
    const m = floor.mode > C.MODE_MAX ? 0 : floor.mode;
    const VX = trig.sin256[angle]!;
    const VY = trig.neg_cos256[angle]!;
    const x = u16(pose.x - asr(VX, C.CAMERA_BACK_SHIFT));
    const y = u16(pose.y - asr(VY, C.CAMERA_BACK_SHIFT));
    const cellx = asr(s16(x), C.CELL_SHIFT);
    const celly = asr(s16(y), C.CELL_SHIFT);
    const D = inp.light !== null ? inp.light.viewDistance : C.VIEW_DISTANCE_BY_MODE[m]!;
    const last = C.MAP_SIDE - 1;
    const box = { cell: [cellx, celly] as const, xl: Math.max(-cellx, -D), xr: Math.min(last - cellx, D), yb: Math.max(-celly, -D), yt: Math.min(last - celly, D) };
    const eye = s16(pose.eye ?? 0);
    const slide = s16(pose.liftHeight ?? 0);
    const side = doc.side;
    const block = new Uint16Array(side * side);
    const cls = new Uint16Array(side * side);
    const doorSet = new Set(inp.doors.map((d) => `${d.cell[0]},${d.cell[1]}`));
    const overlay = new Map(inp.overlay.map((c) => [`${c.cell[0]},${c.cell[1]}`, c.cls]));
    const DR = C.DOOR;
    for (let cy = 0; cy < side; cy++) {
        for (let cx = 0; cx < side; cx++) {
            const i = cy * side + cx;
            block[i] = doc.blocks[i]!;
            let k = doc.classes[i]!;
            const key = `${cx},${cy}`;
            const stamped = overlay.get(key);
            if (stamped !== undefined)
                k = stamped;
            else if (doorSet.has(key))
                k = k === DR.CLASS_CLOSED_X ? DR.CLASS_PANE_X : k === DR.CLASS_CLOSED_Y ? DR.CLASS_PANE_Y : k;
            cls[i] = k;
        }
    }
    const defs = Math.max(METATEX_DEFS_MIN, doc.metatextures.length);
    const metatex = new Uint16Array(defs * METATEXTURE_SLOTS);
    doc.metatextures.forEach((def, w) => def.forEach((t, s) => { if (s < METATEXTURE_SLOTS)
        metatex[w * METATEXTURE_SLOTS + s] = t; }));
    const ramps: SnapshotRamp[] = [];
    for (let dy = box.yb; dy <= box.yt; dy++) {
        for (let dx = box.xl; dx <= box.xr; dx++) {
            const k = cls[(celly + dy) * side + (cellx + dx)]!;
            if (!C.RAMP.HIT_CLASSES.includes(k))
                continue;
            for (const face of FACES) {
                const w = rampWordFor(C, k, face, dx, dy, slide);
                if (w !== null)
                    ramps.push({ cell: [cellx + dx, celly + dy], face, hi: w.hi, lo: w.lo });
            }
        }
    }
    return {
        step: inp.step,
        seat: inp.seat,
        floor_key: { episode: doc.episode, floor: doc.floor },
        mode: m,
        cam: { x, y, angle, eye_walls: s16(eye - slide), eye_lanes: eye, slide },
        view_distance: D,
        box,
        map: { side, block, cls },
        metatex,
        doors: inp.doors.map((d) => ({ cell: [d.cell[0], d.cell[1]] as const, timer: d.timer })),
        ramps,
        lit: inp.light?.beamFirst != null,
        night: inp.light?.night === true,
        beam_first: inp.light?.beamFirst ?? null,
        sky: inp.sky,
        entities: [],
        cells: [],
    };
}
export function snapshotObserver(snap: ViewSnapshot, assets: SpriteAssets): SpriteObserver & {
    readonly frames: Map<string, number>;
} {
    let current: SnapshotEntity | null = null;
    const frames = new Map<string, number>();
    return {
        frames,
        entity(e) {
            const entity: SnapshotEntity = { slot: e.slot, x: e.x, y: e.y, z: e.z, S: e.S, sx: e.sx, sy: e.sy, loot: e.loot ?? 0, ...(e.corpse === true ? { corpse: true } : {}), parts: [] };
            snap.entities.push(entity);
            current = entity;
        },
        part(art, mirrored, rect) {
            if (current === null)
                return;
            current.parts.push({ art: assets.artId?.(art) ?? { bank: null, slot: -1 }, mirrored, rect: { left: rect.left, top: rect.top, w: rect.w, h: rect.h } });
        },
        end() {
            current = null;
        },
        corpseFrame(cell, frame) {
            frames.set(`${cell[0]},${cell[1]}`, frame);
        },
    };
}
export interface FinishInputs {
    readonly SC: SpriteConstants;
    readonly assets: SpriteAssets & {
        readonly nightArray?: string | null;
    };
    readonly phase: number | null;
    readonly hyd?: HydConstants;
    readonly cleared: ReadonlyArray<readonly [
        number,
        number
    ]>;
    readonly frames: ReadonlyMap<string, number>;
}
export function finishSnapshot(snap: ViewSnapshot, inp: FinishInputs, C: RendConstants, trig: TrigTable): void {
    const { SC, assets } = inp;
    const side = snap.map.side;
    const clearedKeys = new Set(inp.cleared.map((c) => `${c[0]},${c[1]}`));
    const VX = trig.sin256[snap.cam.angle]!;
    const VY = trig.neg_cos256[snap.cam.angle]!;
    const [cellx, celly] = snap.box.cell;
    const cam: Camera = { cx: snap.cam.x, cy: snap.cam.y, VX, VY, cellx, celly };
    const env = { SC, assets, phase: inp.phase, ...(inp.hyd !== undefined ? { hyd: inp.hyd } : {}), mode: snap.mode, night: snap.night, eye: snap.cam.eye_walls };
    snap.cells.length = 0;
    for (let dy = snap.box.yb; dy <= snap.box.yt; dy++) {
        for (let dx = snap.box.xl; dx <= snap.box.xr; dx++) {
            const x = cellx + dx;
            const y = celly + dy;
            if (x < 0 || y < 0 || x >= side || y >= side)
                continue;
            const cls = clearedKeys.has(`${x},${y}`) ? C.CLASS_OPEN : snap.map.cls[y * side + x]!;
            if (!SC.ITEM_CLASSES.includes(cls) && !SC.MARKER_CLASSES.includes(cls))
                continue;
            const p = projectCell(u16(x * (1 << C.CELL_SHIFT) + SC.CENTRE), u16(y * (1 << C.CELL_SHIFT) + SC.CENTRE), cam, SC, () => { });
            if (p === null)
                continue;
            const sy = itemRowOf(p.S, snap.cam.eye_walls, SC);
            const parts = cellParts(cls, p.S, p.column, env, inp.frames.get(`${x},${y}`) ?? 1);
            snap.cells.push({ cell: [x, y], cls, S: p.S, sx: p.column, sy, parts });
        }
    }
}
export class SnapshotKeeper {
    private readonly bySeat: [
        ViewSnapshot[],
        ViewSnapshot[]
    ] = [[], []];
    constructor(private readonly kept: number) { }
    pushRestored(s: ViewSnapshot): ViewSnapshot | null {
        const list = this.bySeat[s.seat];
        const first = list[0];
        if (first !== undefined && first.floor_key.episode === s.floor_key.episode && first.floor_key.floor === s.floor_key.floor && s.step < first.step)
            return null;
        const old = list.find((o) => o.step === s.step) ?? null;
        this.push(s);
        return old;
    }
    push(s: ViewSnapshot): boolean {
        const list = this.bySeat[s.seat];
        const at = list.findIndex((o) => o.step === s.step);
        if (at >= 0)
            list.splice(at, list.length - at);
        list.push(s);
        while (list.length > this.kept)
            list.shift();
        return at >= 0;
    }
    pushAfterRestore(s: ViewSnapshot): boolean {
        const list = this.bySeat[s.seat];
        const first = list[0];
        const last = list[list.length - 1];
        const keeps = first !== undefined && last !== undefined && first.floor_key.episode === s.floor_key.episode && first.floor_key.floor === s.floor_key.floor && s.step >= first.step && s.step <= last.step;
        if (!keeps)
            list.length = 0;
        return this.push(s);
    }
    newest(seat: 0 | 1): ViewSnapshot | null {
        const l = this.bySeat[seat];
        return l.length ? l[l.length - 1]! : null;
    }
    kept_(seat: 0 | 1): readonly ViewSnapshot[] {
        return this.bySeat[seat];
    }
    at(seat: 0 | 1, step: number): ViewSnapshot | null {
        return this.bySeat[seat].find((s) => s.step === step) ?? null;
    }
    dropOlder(): void {
        for (const l of this.bySeat)
            while (l.length > 1)
                l.shift();
    }
    clear(): void {
        this.bySeat[0].length = 0;
        this.bySeat[1].length = 0;
    }
}
export type SnapshotSink = (inputs: SnapshotInputs, state: object) => ViewSnapshot | void;
const SINKS = new WeakMap<object, SnapshotSink>();
let DEFAULT_SINK: SnapshotSink | null = null;
export function attachSnapshotSink(state: object, sink: SnapshotSink | null): void {
    if (sink === null)
        SINKS.delete(state);
    else
        SINKS.set(state, sink);
}
export const TEST_ONLY_SINK = { atPictureOnly: false };
export function moveSnapshotSink(from: object | null | undefined, to: object | null | undefined): void {
    if (!from || !to || from === to || TEST_ONLY_SINK.atPictureOnly)
        return;
    const s = SINKS.get(from);
    if (s === undefined)
        return;
    SINKS.delete(from);
    SINKS.set(to, s);
}
export function setDefaultSnapshotSink(sink: SnapshotSink | null): void {
    DEFAULT_SINK = sink;
}
export function snapshotSinkOf(state: object): SnapshotSink | null {
    return SINKS.get(state) ?? DEFAULT_SINK;
}
export function serializeSnapshot(s: ViewSnapshot): string {
    return JSON.stringify(s, (_k, v: unknown) => (v instanceof Uint16Array ? Array.from(v) : v));
}

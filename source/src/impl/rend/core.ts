import { asr, divs, mod, s16, s32, tdiv, u16 } from "./arith.js";
import type { RendAssets } from "./assets.js";
import type { RendConstants } from "./constants.js";
import { DIAG_FACE_KEYS, FACE_KEYS, NIGHT_KEEPS_OWN_ART_MODE, REND_EYE } from "./constants.js";
import type { RampWord } from "./constants.js";
import type { TrigTable } from "./trig.js";
import { octagon } from "./sprite/types.js";
import type { Camera, EntityRecord, ItemRecord, SpriteContext, SpriteEvent } from "./sprite/types.js";
import type { EnemyKind } from "./sprite/kinds.js";
import { projectCell } from "./sprite/project.js";
import { soldierSpawn } from "./sprite/soldier.js";
import { cameraSpawn } from "./sprite/camera.js";
import { spritePass } from "./sprite/entity.js";
import { rebuildLanes, shearedColumn } from "./shear.js";
export interface Pose {
    readonly x: number;
    readonly y: number;
    readonly angle: number;
    readonly eye?: number;
    readonly liftHeight?: number;
}
export interface LightView {
    readonly viewDistance: number;
    readonly beamFirst: number | null;
    readonly night?: boolean;
}
export interface FloorMap {
    readonly mode: number;
    readonly episode: number;
    classAt(x: number, y: number): number | null;
    faceWord(x: number, y: number, word: number): number | null;
    textureOfSlot(word: number, slot: number): number | null;
}
export interface DoorView {
    readonly cell: readonly [
        number,
        number
    ];
    readonly timer: number;
}
export const FACE_LOW_Y = 0;
export const FACE_HIGH_Y = 1;
export const FACE_LOW_X = 2;
export const FACE_HIGH_X = 3;
export const FACE_NAMES = ["low_y", "high_y", "low_x", "high_x"] as const;
export type Face = 0 | 1 | 2 | 3;
export const FACE_DOOR = 4;
export const FACE_HYPOTENUSE = 5;
interface Picture {
    readonly face: number;
    readonly cell: readonly [
        number,
        number
    ];
    readonly word: number | null;
    readonly slotBase: number;
}
export interface ViewRecord {
    readonly depth: number[];
    readonly face: number[];
    readonly cell: Array<readonly [
        number,
        number
    ] | null>;
    readonly word: Array<number | null>;
    readonly notes: string[];
    readonly view: Uint8Array | null;
    readonly cram: number[] | null;
    readonly items: readonly ItemRecord[];
    readonly events: readonly SpriteEvent[];
    readonly spawned: readonly EntityRecord[];
}
export type ColumnObserver = (column: number, wrapped: boolean) => void;
export const REND_OBSERVE: {
    column: ColumnObserver | null;
} = { column: null };
interface WriteResult {
    readonly drawn: boolean;
    readonly hr: number;
}
interface TextureRange {
    tL: number;
    tR: number;
}
interface Corner {
    wx: number;
    wy: number;
    F: number;
    S: number;
    column: number | null;
    depth: number | null;
}
interface StoredCorner {
    wx: number;
    wy: number;
    F: number;
    S: number;
    column: number | null;
    depth: number | null;
}
interface SegmentEntry {
    readonly p1: readonly [
        number,
        number
    ];
    readonly p2: readonly [
        number,
        number
    ];
    readonly kind: "live" | "constant";
}
function s8(v: number): number {
    return ((v & 255) ^ 128) - 128;
}
class Frame {
    readonly depth: number[];
    readonly face: number[];
    readonly cell: Array<readonly [
        number,
        number
    ] | null>;
    readonly word: Array<number | null>;
    readonly notes: string[] = [];
    readonly pictures: Uint8Array | null;
    private readonly m: number;
    private eye = 0;
    private seen = 0;
    private slide = 0;
    private ramp: RampWord | null = null;
    private readonly segments: SegmentEntry[] = [];
    private lanes: Uint8Array | null = null;
    private lastHit: {
        x: number;
        y: number;
    } | null = null;
    private right: StoredCorner | null = null;
    private readonly doorList = new Map<string, number>();
    private readonly doorsDrawn = new Set<string>();
    private readonly faceState = { hl: 0, dl: 0, hr: 0, dr: 0, tL: 0, tR: 0 };
    private cameraFaceHr: number | null = null;
    private readonly overlay = new Map<string, number>();
    readonly items: ItemRecord[] = [];
    private readonly recorded = new Set<string>();
    private doorFlag = false;
    readonly events: SpriteEvent[] = [];
    readonly spawned: EntityRecord[] = [];
    private cx = 0;
    private cy = 0;
    private cellx = 0;
    private celly = 0;
    private fx = 0;
    private fy = 0;
    private ifx = 0;
    private ify = 0;
    private VX = 0;
    private VY = 0;
    private xl = 0;
    private xr = 0;
    private yb = 0;
    private yt = 0;
    constructor(private readonly C: RendConstants, private readonly trig: TrigTable, private readonly floor: FloorMap, private readonly assets: RendAssets | null, doors: readonly DoorView[], private readonly sprites: SpriteContext | null, private readonly light: LightView | null = null) {
        for (const d of doors)
            this.doorList.set(doorKey(d.cell[0], d.cell[1]), d.timer);
        if (sprites)
            for (const c of sprites.cells)
                this.overlay.set(doorKey(c.cell[0], c.cell[1]), c.cls);
        this.depth = new Array<number>(C.COLUMNS).fill(0);
        this.face = new Array<number>(C.COLUMNS).fill(-1);
        this.cell = new Array<readonly [
            number,
            number
        ] | null>(C.COLUMNS).fill(null);
        this.word = new Array<number | null>(C.COLUMNS).fill(null);
        this.pictures = assets ? new Uint8Array(C.COLUMNS * C.VIEW_ROWS) : null;
        this.m = floor.mode > C.MODE_MAX ? 0 : floor.mode;
    }
    render(pose: Pose): void {
        const C = this.C;
        REND_OBSERVE.column?.(-1, false);
        const a = mod(pose.angle, C.ANGLES);
        this.eye = s16(pose.eye ?? 0);
        this.slide = s16(pose.liftHeight ?? 0);
        this.seen = s16(this.eye - this.slide);
        if (this.seen !== this.eye) {
            this.note(`lift height ${pose.liftHeight}: walls and sprites see the eye ${this.seen} (E ${this.eye} - z); 4.12.6 / 4.12.7 state the shear and the lane rebuild for |E| <= 25 (the range of the game) and the text leaves the slide's range -64 .. 64 open${Math.abs(this.seen) > 25 ? "; drawn with the same arithmetic outside it" : ""}`);
        }
        const night = this.light?.night === true;
        const art = (night && this.m !== NIGHT_KEEPS_OWN_ART_MODE ? this.assets?.nightLaneArt : this.assets?.laneArt(this.m)) ?? null;
        this.lanes = art ? rebuildLanes(art, this.eye, C) : null;
        this.camera(pose, a);
        let k = C.RAY_STEP_BY_MODE[this.m]!;
        const camClass = this.pictureClass(this.cellx, this.celly);
        if (camClass !== null && camClass >= C.DOOR.CAMERA_CLASS_MIN) {
            if (!this.isDoorClass(camClass))
                this.look(0, 0, 0, camClass);
            if (this.isDoorClass(camClass))
                this.drawDoor(this.cellx, this.celly, 0, 0);
            k = C.DOOR.CAMERA_RAY_STEP_BY_MODE[this.m]!;
        }
        for (let r = 0; r <= C.RAY_LAST; r += k) {
            const ar = mod(C.COLUMN_ANGLES[r]! + a, C.ANGLES);
            this.doorFlag = false;
            this.ramp = null;
            if (REND_TRACE.on)
                REND_TRACE.lines.push(`ray ${r} angle ${ar} (camera (${this.cx}, ${this.cy}) cell (${this.cellx}, ${this.celly}) f (${this.fx}, ${this.fy}) box x ${this.xl} .. ${this.xr} y ${this.yb} .. ${this.yt} mode ${this.m})`);
            if (ar % C.QUARTER === 0)
                this.straightWalk(ar);
            else {
                const moved = this.diagonalWalk(ar, r);
                if (moved !== null)
                    r = moved;
            }
        }
        this.fillUnclaimed();
        for (const e of this.segments) {
            const side = 1 << C.CELL_SHIFT;
            const lx = u16(side * (this.cellx + e.p1[0]));
            const ly = u16(side * (this.celly + e.p1[1]));
            const rx = u16(side * (this.cellx + e.p2[0]));
            const ry = u16(side * (this.celly + e.p2[1]));
            if (this.projectSegment(lx, ly, rx, ry))
                this.writeStrip(e.kind);
        }
        if (this.sprites && this.pictures) {
            spritePass({
                ctx: this.sprites,
                surface: { columns: C.COLUMNS, rows: C.VIEW_ROWS, bytes: this.pictures, depth: this.depth, beam: this.light?.beamFirst != null ? { first: this.light.beamFirst, count: C.LIGHT.BEAM_COLUMNS } : null },
                camera: this.cameraOf(),
                mode: this.m,
                eye: this.seen,
                nightVision: this.light?.night === true,
                items: this.items,
                note: (s) => this.note(s),
            });
        }
    }
    private cameraOf(): Camera {
        return { cx: this.cx, cy: this.cy, VX: this.VX, VY: this.VY, cellx: this.cellx, celly: this.celly };
    }
    private look(dx: number, dy: number, my: number, cls: number | null): {
        kind: "open" | "door" | "hit" | null;
        bent: number | null;
    } {
        const D = this.C.DOOR;
        if (cls === D.CLASS_CLOSED_X || cls === D.CLASS_CLOSED_Y)
            this.doorFlag = true;
        if (cls !== null)
            this.registerSegment(dx, dy, cls);
        const sp = this.sprites;
        if (sp && cls !== null) {
            if (sp.SC.ITEM_CLASSES.includes(cls)) {
                this.recordCell(dx, dy, my, cls);
                return { kind: "open", bent: null };
            }
            if (sp.camera && cls === sp.camera.C.MARKER_CLASS) {
                this.cameraCell(dx, dy, my);
                return { kind: "open", bent: null };
            }
            if (sp.SC.MARKER_CLASSES.includes(cls)) {
                const r = this.marker(dx, dy, my, cls);
                return { kind: "open", bent: r !== null && r.bends ? s16(r.record.pos.y) : null };
            }
        }
        return { kind: this.lookKind(cls), bent: null };
    }
    private registerSegment(dx: number, dy: number, cls: number): void {
        const rule = this.C.RAMP.SEGMENT_RULES.get(cls);
        if (!rule)
            return;
        const o = rule.axis === "dx" ? dx : dy;
        if (rule.when === "positive" ? !(o > 0) : !(o < 0))
            return;
        const p1: [
            number,
            number
        ] = [dx + rule.p1[0], dy + rule.p1[1]];
        const p2: [
            number,
            number
        ] = [dx + rule.p2[0], dy + rule.p2[1]];
        if (this.segments.some((e) => e.p1[0] === p1[0] && e.p1[1] === p1[1] && e.p2[0] === p2[0] && e.p2[1] === p2[1]))
            return;
        this.segments.push({ p1, p2, kind: rule.kind });
    }
    private centreOf(dx: number, my: number): {
        wx: number;
        wy: number;
    } {
        const SC = this.sprites!.SC;
        const side = 1 << this.C.CELL_SHIFT;
        return { wx: u16((this.cellx + dx) * side + SC.CENTRE), wy: u16((this.celly + my) * side + SC.CENTRE) };
    }
    private recordCell(dx: number, dy: number, my: number, cls: number): void {
        const SC = this.sprites!.SC;
        const x = this.cellx + dx;
        const y = this.celly + dy;
        const key = doorKey(x, y);
        if (this.items.length >= SC.LIST_MAX || this.recorded.has(key))
            return;
        const { wx, wy } = this.centreOf(dx, my);
        const p = projectCell(wx, wy, this.cameraOf(), SC, (s) => this.note(`cell (${x}, ${y}): ${s}`));
        if (REND_TRACE.on)
            REND_TRACE.lines.push(`item cell (${x}, ${y}) class ${cls} offset (${dx}, ${dy}) my ${my}: ${p === null ? "not recorded (F below DEPTH_MIN)" : `recorded S ${p.S} column ${p.column} F ${p.F}`}`);
        if (p === null)
            return;
        this.items.push({ cls, S: p.S, column: p.column, cell: [x, y] });
        this.recorded.add(key);
    }
    private marker(dx: number, dy: number, my: number, cls: number): {
        record: {
            pos: {
                x: number;
                y: number;
            };
        };
        bends: boolean;
    } | null {
        if (this.doorFlag)
            return null;
        const sp = this.sprites!;
        const { wx, wy } = this.centreOf(dx, my);
        const d = octagon(s16(wx - this.cx), s16(wy - this.cy));
        if (d >= sp.SC.MARKER_DISTANCE) {
            this.recordCell(dx, dy, my, cls);
            return null;
        }
        const x = this.cellx + dx;
        const y = this.celly + dy;
        let kind: EnemyKind | null = null;
        if (cls !== sp.ES.MARKER_CLASS) {
            kind = sp.kinds?.get(cls) ?? null;
            if (kind === null) {
                this.note(`marker of class ${cls} at (${x}, ${y}) nearer than MARKER_DISTANCE (${d}): no kind of that class is known here (ZT-ENT-SOLDIER 4.1a needs enemy_descriptors.json); the cell is ignored`);
                return null;
            }
        }
        const r = soldierSpawn(x, y, { x: wx, y: wy }, sp.playerFloor, this.cameraOf(), sp.pool, sp.ES, sp.SC, kind);
        for (const e of r.events) {
            if (e.type === "Map.Write")
                this.overlay.set(doorKey(e.x, e.y), this.C.CLASS_OPEN);
            this.events.push(e);
        }
        this.spawned.push(r.record);
        const soldierArt = sp.kinds?.get(sp.ES.MARKER_CLASS)?.art ?? null;
        const bends = kind === null || (soldierArt !== null && kind.art === soldierArt);
        return { record: r.record, bends };
    }
    private cameraCell(dx: number, dy: number, my: number): void {
        if (this.doorFlag)
            return;
        const sp = this.sprites!;
        const cam = sp.camera!;
        const { wx, wy } = this.centreOf(dx, my);
        if (octagon(s16(wx - cam.playerX), s16(wy - cam.playerY)) >= cam.C.CREATE_RANGE)
            return;
        const x = this.cellx + dx;
        const y = this.celly + dy;
        const r = cameraSpawn(x, y, { x: wx, y: wy }, sp.playerFloor, sp.pool, sp.ES, cam.C);
        if (r === null)
            return;
        this.overlay.set(doorKey(x, y), this.C.CLASS_OPEN);
        this.events.push(r.event);
        this.spawned.push(r.record);
    }
    private camera(pose: Pose, a: number): void {
        const C = this.C;
        this.VX = this.trig.sin256[a]!;
        this.VY = this.trig.neg_cos256[a]!;
        this.cx = u16(pose.x - asr(this.VX, C.CAMERA_BACK_SHIFT));
        this.cy = u16(pose.y - asr(this.VY, C.CAMERA_BACK_SHIFT));
        this.cellx = asr(s16(this.cx), C.CELL_SHIFT);
        this.celly = asr(s16(this.cy), C.CELL_SHIFT);
        this.fx = this.cx & C.FRAC_MASK;
        this.fy = this.cy & C.FRAC_MASK;
        this.ifx = C.FRAC_MASK - this.fx;
        this.ify = C.FRAC_MASK - this.fy;
        const D = this.light !== null ? this.light.viewDistance : C.VIEW_DISTANCE_BY_MODE[this.m]!;
        const last = C.MAP_SIDE - 1;
        this.xl = Math.max(-this.cellx, -D);
        this.xr = Math.min(last - this.cellx, D);
        this.yb = Math.max(-this.celly, -D);
        this.yt = Math.min(last - this.celly, D);
        const camClass = this.pictureClass(this.cellx, this.celly);
        const DR = C.DOOR;
        const paneUnderCamera = (camClass === DR.CLASS_PANE_X || camClass === DR.CLASS_PANE_Y) && this.doorList.has(doorKey(this.cellx, this.celly));
        const outsideTable = camClass === null || camClass === C.CLASS_WALL || (camClass >= C.CLASS_SOLID_FIRST && camClass <= C.CLASS_SOLID_LAST) || C.RAMP.HIT_CLASSES.includes(camClass);
        if (camClass !== C.CLASS_OPEN && !paneUnderCamera && outsideTable) {
            this.notes.push(`camera cell (${this.cellx}, ${this.celly}) has class ${camClass === null ? "none (outside the map)" : camClass}, a class the walk's table leaves outside (wall, ramp, translucent): outside the draft (4.2, 4.16.7)`);
        }
    }
    private isDiagClass(cls: number | null): cls is number {
        return cls !== null && this.C.DIAG.HYPOTENUSE.has(cls);
    }
    private cameraDiagonal(test: (cls: number) => boolean): boolean {
        this.cameraFaceHr = null;
        const cls = this.pictureClass(this.cellx, this.celly);
        if (!this.isDiagClass(cls) || !test(cls))
            return false;
        const x = this.cellx;
        const y = this.celly;
        if (this.lastHit && this.lastHit.x === x && this.lastHit.y === y)
            return true;
        this.lastHit = { x, y };
        const w = this.drawHypotenuse(x, y, cls, 0);
        this.cameraFaceHr = w.drawn ? w.hr : null;
        return true;
    }
    private pictureClass(x: number, y: number): number | null {
        const cls = this.floor.classAt(x, y);
        if (cls === null)
            return null;
        const stamped = this.overlay.get(doorKey(x, y));
        if (stamped !== undefined)
            return stamped;
        if (!this.doorList.has(doorKey(x, y)))
            return cls;
        const D = this.C.DOOR;
        if (cls === D.CLASS_CLOSED_X)
            return D.CLASS_PANE_X;
        if (cls === D.CLASS_CLOSED_Y)
            return D.CLASS_PANE_Y;
        return cls;
    }
    private classAtOffset(dx: number, dy: number): number | null {
        return this.pictureClass(this.cellx + dx, this.celly + dy);
    }
    private isDoorClass(cls: number | null): boolean {
        const D = this.C.DOOR;
        return cls === D.CLASS_CLOSED_X || cls === D.CLASS_CLOSED_Y || cls === D.CLASS_PANE_X || cls === D.CLASS_PANE_Y;
    }
    private lookKind(cls: number | null): "open" | "door" | "hit" | null {
        const C = this.C;
        if (cls === C.CLASS_OPEN)
            return "open";
        if (this.isDoorClass(cls))
            return "door";
        if (cls === C.CLASS_WALL)
            return "hit";
        if (cls !== null && cls >= C.CLASS_SOLID_FIRST && cls <= C.CLASS_SOLID_LAST)
            return "hit";
        if (this.isDiagClass(cls))
            return "hit";
        if (cls !== null && C.RAMP.HIT_CLASSES.includes(cls))
            return "hit";
        if (cls === null)
            return null;
        return cls >= 6 ? "open" : null;
    }
    private outsideScope(dx: number, dy: number, cls: number | null, ar: number): void {
        const x = this.cellx + dx;
        const y = this.celly + dy;
        this.notes.push(`ray at angle ${ar} met cell (${x}, ${y}) of class ${cls === null ? "none (outside the map)" : cls}: outside D1a, the ray ends`);
    }
    private straightWalk(ar: number): void {
        const C = this.C;
        const quarter = ar / C.QUARTER;
        const sx = quarter === 1 ? 1 : quarter === 3 ? -1 : 0;
        const sy = quarter === 0 ? -1 : quarter === 2 ? 1 : 0;
        const face: Face = quarter === 0 ? FACE_HIGH_Y : quarter === 1 ? FACE_LOW_X : quarter === 2 ? FACE_LOW_Y : FACE_HIGH_X;
        const camClasses = C.DIAG.CAMERA_STRAIGHT.get(ar) ?? [];
        if (this.cameraDiagonal((cls) => camClasses.includes(cls)))
            return;
        let dx = 0;
        let dy = 0;
        let my = 0;
        for (;;) {
            dx += sx;
            dy += sy;
            my += sy;
            if (dx < this.xl || dx > this.xr || my < this.yb || my > this.yt)
                return;
            const cls = this.classAtOffset(dx, dy);
            const lk = this.look(dx, dy, my, cls);
            const kind = lk.kind;
            if (lk.bent !== null)
                my = lk.bent;
            if (kind === null)
                return this.outsideScope(dx, dy, cls, ar);
            if (kind === "door")
                this.drawDoor(this.cellx + dx, this.celly + dy, dx, dy);
            if (kind !== "hit")
                continue;
            const x = this.cellx + dx;
            const y = this.celly + dy;
            if (this.lastHit && this.lastHit.x === x && this.lastHit.y === y)
                return;
            this.lastHit = { x, y };
            this.drawHitFace(x, y, face, my, cls);
            return;
        }
    }
    private diagonalWalk(ar: number, r: number): number | null {
        const C = this.C;
        const q = Math.floor(ar / C.QUARTER);
        const sx = q === 0 || q === 1 ? 1 : -1;
        const sy = q === 1 || q === 2 ? 1 : -1;
        const [xs, ys] = C.DDA_STEPS[ar]!;
        const bound = C.FRAC_MASK;
        const carryShift = C.CELL_SHIFT;
        let xdx = sx;
        let xdy = 0;
        let xmy = 0;
        const FA = sx === 1 ? this.ifx : this.fx;
        const GA = sy === -1 ? this.ify : this.fy;
        let A = asr(FA * xs, carryShift) + GA;
        let ydx = 0;
        let ydy = sy;
        let ymy = sy;
        const FB = sy === -1 ? this.fy : this.ify;
        const GB = sx === 1 ? this.fx : this.ifx;
        let B = asr(FB * ys, carryShift) + GB;
        const camTest = C.DIAG.CAMERA_DIAGONAL[q]!;
        if (this.cameraDiagonal((cls) => cls === camTest.always || (A <= bound && cls === camTest.a_le_255) || (B <= bound && cls === camTest.b_le_255))) {
            const hr = this.cameraFaceHr;
            return hr !== null && hr > r ? hr : null;
        }
        if (A > bound) {
            const c = asr(A, carryShift);
            A &= bound;
            xdy += sy * c;
            xmy += sy * c;
        }
        if (B > bound) {
            const c = asr(B, carryShift);
            B &= bound;
            ydx += sx * c;
        }
        for (;;) {
            const useX = sx * xdx < sx * ydx || (sx * xdx === sx * ydx && sy * xmy < sy * ymy);
            const dx = useX ? xdx : ydx;
            const dy = useX ? xdy : ydy;
            const my = useX ? xmy : ymy;
            if ((sx === 1 && dx > this.xr) || (sx === -1 && dx < this.xl) || (sy === 1 && my > this.yt) || (sy === -1 && my < this.yb))
                return null;
            const cls = this.classAtOffset(dx, dy);
            const lk = this.look(dx, dy, my, cls);
            let kind = lk.kind;
            if (lk.bent !== null) {
                if (useX)
                    xmy = lk.bent;
                else
                    ymy = lk.bent;
            }
            if (kind === null) {
                this.outsideScope(dx, dy, cls, ar);
                return null;
            }
            if (kind === "hit" && this.isDiagClass(cls)) {
                const passed = useX ? cls === C.DIAG.PASS_X[q] && u16(A + xs) > bound : cls === C.DIAG.PASS_Y[q] && u16(B + ys) > bound;
                if (passed)
                    kind = "open";
            }
            if (kind !== "hit") {
                if (kind === "door")
                    this.drawDoor(this.cellx + dx, this.celly + dy, dx, dy);
                if (useX) {
                    xdx += sx;
                    A += xs;
                    if (A > bound) {
                        const c = asr(A, carryShift);
                        A &= bound;
                        xdy += sy * c;
                        xmy += sy * c;
                    }
                }
                else {
                    ydy += sy;
                    ymy += sy;
                    B += ys;
                    if (B > bound) {
                        const c = asr(B, carryShift);
                        B &= bound;
                        ydx += sx * c;
                    }
                }
                continue;
            }
            const x = this.cellx + dx;
            const y = this.celly + dy;
            if (this.lastHit && this.lastHit.x === x && this.lastHit.y === y)
                return null;
            this.lastHit = { x, y };
            const first: Face = useX ? (sx === 1 ? FACE_LOW_X : FACE_HIGH_X) : sy === 1 ? FACE_LOW_Y : FACE_HIGH_Y;
            this.drawHitFace(x, y, first, my, cls);
            let second: Face | null = null;
            let nx = 0;
            let ny = 0;
            let solid: readonly number[] = [];
            if (q === 0 && useX) {
                second = FACE_HIGH_Y;
                ny = 1;
                solid = C.SOLID_NEIGHBOURS_NE;
            }
            else if (q === 1 && !useX) {
                second = FACE_LOW_X;
                nx = -1;
                solid = C.SOLID_NEIGHBOURS_SE;
            }
            else if (q === 2 && useX) {
                second = FACE_LOW_Y;
                ny = -1;
                solid = C.SOLID_NEIGHBOURS_SW;
            }
            else if (q === 3 && !useX) {
                second = FACE_HIGH_X;
                nx = 1;
                solid = C.SOLID_NEIGHBOURS_NW;
            }
            if (second !== null) {
                const ncls = this.floor.classAt(x + nx, y + ny);
                if (ncls === null || !solid.includes(ncls))
                    this.drawHitFace(x, y, second, my, cls);
            }
            return null;
        }
    }
    private drawHitFace(cellX: number, cellY: number, face: Face, my: number, cls: number | null): void {
        if (this.isDiagClass(cls) && this.C.DIAG.BY_FACE[DIAG_FACE_KEYS[diagFaceKeyIndex(face)]!].includes(cls)) {
            this.drawHypotenuse(cellX, cellY, cls, my);
            return;
        }
        this.ramp = cls === null ? null : this.rampWordOf(cls, face, cellX - this.cellx, cellY - this.celly);
        if (REND_TRACE.on && this.ramp)
            REND_TRACE.lines.push(`ramp word of class ${cls} cell (${cellX}, ${cellY}) offset (${cellX - this.cellx}, ${cellY - this.celly}) S ${this.slide}: hi ${this.ramp.hi} lo ${this.ramp.lo}`);
        this.drawFace(cellX, cellY, face, my);
    }
    private rampWordOf(cls: number, face: Face, dx: number, dy: number): RampWord | null {
        return rampWordFor(this.C, cls, face, dx, dy, this.slide);
    }
    private cornerWords(cellX: number, my: number): {
        X: number;
        Y: number;
    } {
        const side = 1 << this.C.CELL_SHIFT;
        return { X: u16(side * cellX), Y: u16(side * (this.celly + my)) };
    }
    private drawFace(cellX: number, cellY: number, face: Face, my: number = cellY - this.celly): void {
        const C = this.C;
        const side = 1 << C.CELL_SHIFT;
        const { X, Y } = this.cornerWords(cellX, my);
        let lx: number, ly: number, rx: number, ry: number;
        switch (face) {
            case FACE_LOW_Y:
                lx = u16(X + side);
                ly = Y;
                rx = X;
                ry = Y;
                break;
            case FACE_HIGH_Y:
                lx = X;
                ly = u16(Y + side);
                rx = u16(X + side);
                ry = u16(Y + side);
                break;
            case FACE_LOW_X:
                lx = X;
                ly = Y;
                rx = X;
                ry = u16(Y + side);
                break;
            default:
                lx = u16(X + side);
                ly = u16(Y + side);
                rx = u16(X + side);
                ry = Y;
                break;
        }
        const picture: Picture = { face, cell: [cellX, cellY], word: this.floor.faceWord(cellX, cellY, C.FACE_WORD[FACE_KEYS[faceKeyIndex(face)]!]), slotBase: 0 };
        const ok = this.projectSegment(lx, ly, rx, ry);
        if (REND_TRACE.on) {
            const st = this.faceState;
            REND_TRACE.lines.push(`face ${face} of cell (${cellX}, ${cellY}) my ${my}: corners L (${lx}, ${ly}) R (${rx}, ${ry}) -> ${ok ? `columns ${st.hl} .. ${st.hr}, depths ${st.dl} .. ${st.dr}, t ${st.tL} .. ${st.tR}` : "abandoned"}`);
        }
        if (ok)
            this.write(picture);
    }
    private drawHypotenuse(cellX: number, cellY: number, cls: number, my: number): WriteResult {
        const H = this.C.DIAG.HYPOTENUSE.get(cls)!;
        const { X, Y } = this.cornerWords(cellX, my);
        const lx = u16(X + H.left[0]);
        const ly = u16(Y + H.left[1]);
        const rx = u16(X + H.right[0]);
        const ry = u16(Y + H.right[1]);
        const picture: Picture = { face: FACE_HYPOTENUSE, cell: [cellX, cellY], word: this.floor.faceWord(cellX, cellY, H.face_word), slotBase: 0 };
        const ok = this.projectSegment(lx, ly, rx, ry);
        if (REND_TRACE.on) {
            const st = this.faceState;
            REND_TRACE.lines.push(`hypotenuse of cell (${cellX}, ${cellY}) class ${cls} my ${my}: corners L (${lx}, ${ly}) R (${rx}, ${ry}) -> ${ok ? `columns ${st.hl} .. ${st.hr}, depths ${st.dl} .. ${st.dr}, t ${st.tL} .. ${st.tR}` : "abandoned"}`);
        }
        if (!ok)
            return { drawn: false, hr: 0 };
        return this.write(picture);
    }
    private projectSegment(lx: number, ly: number, rx: number, ry: number): boolean {
        let left: Corner;
        let copied = false;
        const stored = this.right;
        if (stored && stored.wx === u16(lx) && stored.wy === u16(ly)) {
            left = { wx: stored.wx, wy: stored.wy, F: stored.F, S: stored.S, column: stored.column, depth: stored.depth };
            copied = true;
        }
        else {
            left = this.corner(lx, ly);
        }
        const right = this.corner(rx, ry);
        return this.project(left, copied, right);
    }
    private drawDoor(cellX: number, cellY: number, dx: number, dy: number): void {
        const key = doorKey(cellX, cellY);
        if (this.doorsDrawn.has(key))
            return;
        this.doorsDrawn.add(key);
        const C = this.C;
        const D = C.DOOR;
        const cls = this.pictureClass(cellX, cellY);
        const alongX = cls === D.CLASS_CLOSED_X || cls === D.CLASS_PANE_X;
        const queued = cls === D.CLASS_PANE_X || cls === D.CLASS_PANE_Y;
        const near = alongX ? (dy !== 0 ? dy < 0 : this.fy >= D.FRAC_TIE) : dx !== 0 ? dx < 0 : this.fx >= D.FRAC_TIE;
        const side = 1 << C.CELL_SHIFT;
        const X = side * cellX;
        const Y = side * cellY;
        const base = alongX ? X : Y;
        const cell: readonly [
            number,
            number
        ] = [cellX, cellY];
        if (!queued) {
            this.drawPane(alongX, near, X, Y, base, base + D.CELL, { face: FACE_DOOR, cell, word: D.TEX_DEF, slotBase: 0 }, false);
            return;
        }
        const t = this.doorList.get(key);
        if (t === undefined) {
            this.note(`door cell (${cellX}, ${cellY}) has the pane class ${cls} but no entry in the view's door list: not specified (4.16.2); nothing drawn`);
            return;
        }
        if (t === D.TIMER_MAX)
            return;
        const firstA = alongX === near;
        const H = D.HALF;
        const listA: Picture = { face: FACE_DOOR, cell, word: D.TEX_DEF, slotBase: 0 };
        const listB: Picture = { face: FACE_DOOR, cell, word: D.TEX_DEF, slotBase: D.TEX_WORD_B };
        this.drawPane(alongX, near, X, Y, base - t, base - t + H, firstA ? listA : listB, true);
        this.drawPane(alongX, near, X, Y, base + H + t, base + 2 * H + t, firstA ? listB : listA, true);
    }
    private drawPane(alongX: boolean, near: boolean, X: number, Y: number, lo: number, hi: number, picture: Picture, half: boolean): void {
        const D = this.C.DOOR;
        const leftIsLo = alongX === near;
        const l = leftIsLo ? lo : hi;
        const r = leftIsLo ? hi : lo;
        const completed = alongX ? this.projectSegment(l, Y + D.CENTRE, r, Y + D.CENTRE) : this.projectSegment(X + D.CENTRE, l, X + D.CENTRE, r);
        if (!half) {
            if (completed)
                this.write(picture);
            return;
        }
        this.faceState.tL = asr(this.faceState.tL, D.TC_SHIFT);
        this.faceState.tR = asr(this.faceState.tR, D.TC_SHIFT);
        if (!completed)
            this.note(`door cell (${picture.cell[0]}, ${picture.cell[1]}): a half-pane's projection was abandoned; it is written with the numbers the last face left (4.16.9, not pinned)`);
        this.write(picture);
    }
    private corner(wx: number, wy: number): Corner {
        const dx = s16(u16(wx - this.cx));
        const dy = s16(u16(wy - this.cy));
        const F = s32(dx * this.VX + dy * this.VY);
        const S = s32(dy * this.VX - dx * this.VY);
        return { wx: u16(wx), wy: u16(wy), F, S, column: null, depth: null };
    }
    private own(c: Corner): boolean {
        const C = this.C;
        const den = s16(asr(c.F, C.SIN_SHIFT));
        const q = divs(c.S, den);
        const d = divs(C.STEP_NUMERATOR, den);
        if (q === null || d === null)
            return false;
        c.column = s16(q + C.COLUMN_CENTRE);
        c.depth = d;
        return true;
    }
    private depthAt(L: Corner, R: Corner, t: number): number | null {
        const C = this.C;
        const Fc = asr(L.F + asr(s16(asr(R.F - L.F, 3)) * t, 5), C.SIN_SHIFT);
        return divs(C.STEP_NUMERATOR, Fc);
    }
    private project(L: Corner, copied: boolean, R: Corner): boolean {
        const C = this.C;
        const st = this.faceState;
        const leftOut = -L.S >= L.F;
        const rightOut = R.S >= R.F;
        const keepRight = !rightOut;
        const store = (): false => {
            if (keepRight)
                this.right = { wx: R.wx, wy: R.wy, F: R.F, S: R.S, column: R.column ?? this.right?.column ?? null, depth: R.depth ?? this.right?.depth ?? null };
            else
                this.right = null;
            return false;
        };
        st.tL = 0;
        st.tR = C.TC_FULL;
        if (leftOut) {
            st.hl = 0;
            const tl = divs(L.F + L.S, s16(asr(L.F + L.S - (R.F + R.S), C.CELL_SHIFT)));
            if (tl === null)
                return store();
            const d = this.depthAt(L, R, tl);
            if (d === null)
                return store();
            st.dl = d;
            st.tL = tl;
        }
        else {
            if (!copied || L.column === null || L.depth === null) {
                if (!this.own(L))
                    return store();
            }
            st.hl = L.column!;
            st.dl = L.depth!;
        }
        if (rightOut) {
            const tr = divs(L.F - L.S, s16(asr(L.F - L.S - (R.F - R.S), C.CELL_SHIFT)));
            if (tr === null)
                return store();
            const d = this.depthAt(L, R, tr);
            if (d === null)
                return store();
            st.hr = C.LAST_COLUMN;
            st.dr = d;
            st.tR = tr;
        }
        else {
            if (!this.own(R))
                return store();
            st.hr = R.column!;
            st.dr = R.depth!;
        }
        store();
        return true;
    }
    private write(picture: Picture): WriteResult {
        const C = this.C;
        let { hl, hr } = this.faceState;
        const { dl, dr } = this.faceState;
        const range: TextureRange = { tL: this.faceState.tL, tR: this.faceState.tR };
        const none: WriteResult = { drawn: false, hr: 0 };
        if (dl < 0 || dr < 0 || hr < 0)
            return none;
        if (hl < 0)
            hl = 0;
        if (hl >= C.HEIGHT_LIMIT)
            return none;
        if (hr >= C.HEIGHT_LIMIT)
            hr = C.LAST_COLUMN;
        const n = hr - hl + 1;
        if (n <= 0)
            return none;
        const scale = 1 << C.CELL_SHIFT;
        const dividend = s32((dr - dl) * scale);
        const q = divs(dividend, n);
        const delta = q === null ? s16(dividend) : q;
        let acc = s32(dl * scale);
        const ramp = this.ramp;
        let rAcc = 0;
        let rDelta = 0;
        if (ramp) {
            const { hi, lo } = ramp;
            const wl = s16((lo - hi) * range.tL + hi * 256);
            const wr = s16((hi - lo) * (C.TC_FULL - range.tR) + lo * 256);
            const seed = asr(wl * dl, 8);
            const rightV = asr(wr * dr, 8);
            const rd = s32(rightV - seed);
            const rq = divs(rd, n);
            rDelta = rq === null ? s16(rd) : rq;
            rAcc = s16(seed);
        }
        const tex = this.pictures ? new TexturePosition(C, range, n) : null;
        for (let k = 0; k < n; k++) {
            const col = hl + k;
            const candidate = u16(asr(acc, C.CELL_SHIFT));
            tex?.step();
            if (ramp)
                rAcc = s16(rAcc + rDelta);
            if (candidate >= u16(this.depth[col]!)) {
                this.depth[col] = candidate;
                this.face[col] = picture.face;
                this.cell[col] = picture.cell;
                this.word[col] = picture.word;
                REND_OBSERVE.column?.(col, q === null);
                if (tex)
                    this.drawColumn(col, candidate, picture.word, picture.slotBase, tex.pair, tex.column, ramp ? rAcc : null);
            }
            acc = s32(acc + delta);
        }
        return { drawn: true, hr };
    }
    private writeStrip(kind: "live" | "constant"): void {
        const C = this.C;
        let { hl, hr } = this.faceState;
        const { dl, dr } = this.faceState;
        if (dl < 0 || dr < 0 || hr < 0)
            return;
        if (hl < 0)
            hl = 0;
        if (hl >= C.HEIGHT_LIMIT)
            return;
        if (hr >= C.HEIGHT_LIMIT)
            hr = C.LAST_COLUMN;
        const n = hr - hl + 1;
        if (n <= 0)
            return;
        const scale = 1 << C.CELL_SHIFT;
        const dividend = s32((dr - dl) * scale);
        const q = divs(dividend, n);
        const delta = q === null ? s16(dividend) : q;
        let acc = s32(dl * scale);
        const rows = C.VIEW_ROWS;
        for (let k = 0; k < n; k++) {
            const col = hl + k;
            const c = u16(asr(acc, C.CELL_SHIFT));
            acc = s32(acc + delta);
            if (!this.pictures || c < u16(this.depth[col]!))
                continue;
            const h = s16(c);
            const half = asr(s16(rows - h), 1);
            const sh = asr(h * this.seen, REND_EYE.SHEAR_SHIFT);
            const top = s16(half + sh);
            const bottom = s16(half - sh);
            const out = this.pictures.subarray(col * rows, (col + 1) * rows);
            const lane = (r: number): number => (kind === "live" ? this.laneByte(col, r) : C.RAMP.FILL_BYTE);
            if (top > 0)
                for (let r = 0; r < Math.min(top, rows); r++)
                    out[r] = lane(r);
            if (bottom > 0)
                for (let r = rows - Math.min(bottom, rows); r < rows; r++)
                    out[r] = lane(r);
        }
    }
    private laneByte(col: number, r: number): number {
        const lane = this.lanes;
        if (!lane)
            return 0;
        return lane[(col & 1 ? 0 : this.C.VIEW_ROWS) + r]!;
    }
    private inBeam(col: number): boolean {
        const first = this.light?.beamFirst ?? null;
        return first !== null && col >= first && col < first + this.C.LIGHT.BEAM_COLUMNS;
    }
    private lutOfHeight(col: number, h: number): Uint8Array | null {
        const C = this.C;
        if (this.inBeam(col))
            return null;
        if (this.light?.night === true)
            return null;
        const set = C.WALL_LUT_SET_BY_MODE[this.m]!;
        const band = C.SHADE_BAND_BY_HEIGHT[h / 2] ?? 0;
        if (set === 0 || band === 0)
            return null;
        const lut = this.assets!.lut(set, band);
        if (!lut)
            this.note(`column ${col}: no wall shading LUT of set ${set}, band ${band}; the column is drawn plain`);
        return lut;
    }
    private textureColumn(t: number | null, column: number): Uint8Array | null {
        const C = this.C;
        const A = this.assets!;
        if (t === null || t < 0 || t >= A.textureCount)
            return null;
        const base = (t * C.TEX_COLUMNS + column) * C.TEX_SIZE;
        return A.textures.subarray(base, base + C.TEX_SIZE);
    }
    private drawColumn(col: number, c: number, word: number | null, slotBase: number, pair: number, column: number, rampAcc: number | null = null): void {
        const C = this.C;
        const rows = C.VIEW_ROWS;
        const out = this.pictures!.subarray(col * rows, (col + 1) * rows);
        const upperSlot = slotBase + 2 * pair;
        const upperT = word === null ? null : this.floor.textureOfSlot(word, upperSlot);
        const lowerT = word === null ? null : this.floor.textureOfSlot(word, upperSlot + 1);
        const upper = this.textureColumn(upperT, column);
        const lower = this.textureColumn(lowerT, column);
        if (!upper || !lower) {
            this.note(`column ${col}: face word ${word === null ? "none" : word}, texture pair ${pair} (slots ${upperSlot}, ${upperSlot + 1} = textures ${upperT}, ${lowerT}): no such texture; the column is drawn as lane rows (4.11 leaves it open)`);
            for (let r = 0; r < rows; r++)
                out[r] = this.laneByte(col, r);
            return;
        }
        if (rampAcc !== null) {
            const sRamp = s16(asr(s32(s16(c) * this.seen + rampAcc), REND_EYE.SHEAR_SHIFT));
            shearedColumn(out, c, this.seen, upper, lower, () => C.RAMP.FILL_BYTE, (h) => this.lutOfHeight(col, h), C, sRamp);
            return;
        }
        if (this.seen !== 0) {
            shearedColumn(out, c, this.seen, upper, lower, (r) => this.laneByte(col, r), (h) => this.lutOfHeight(col, h), C);
            return;
        }
        if (c <= C.SMALL_HEIGHT_MAX) {
            const h = c & ~1;
            const hr = h / 2;
            const nf = (rows - h) / 2;
            for (let r = 0; r < nf; r++)
                out[r] = this.laneByte(col, r);
            for (let i = 0; i < hr; i++) {
                const idx = Math.floor(((2 * i + 1) * C.TEX_SIZE) / h);
                out[nf + i] = upper[idx]!;
                out[nf + hr + i] = lower[idx]!;
            }
            for (let r = rows - nf; r < rows; r++)
                out[r] = this.laneByte(col, r);
            const lut = this.lutOfHeight(col, h);
            if (lut)
                for (let r = nf; r < nf + h; r++)
                    out[r] = lut[out[r]!]!;
            return;
        }
        const half = C.BIG_HALF_ROWS;
        const last = C.TEX_SIZE - 1;
        const sc = s16(c);
        if (sc < 0)
            this.note(`column ${col}: big-wall candidate ${c} is 32768 or more: the accumulator is negative and the texture is read past its rows (4.12.2 leaves it open; the read is clamped to the last row)`);
        let a = sc;
        let j = 0;
        for (let i = 0; i < half; i++) {
            const jj = Math.min(j, last);
            out[half - 1 - i] = upper[last - jj]!;
            out[half + i] = lower[jj]!;
            a = s16(a - C.BIG_STEP);
            if (a < 0) {
                j++;
                a = s16(a + sc);
            }
        }
    }
    private fillUnclaimed(): void {
        if (!this.pictures)
            return;
        const rows = this.C.VIEW_ROWS;
        for (let col = 0; col < this.C.COLUMNS; col++) {
            if (this.depth[col] !== 0)
                continue;
            for (let r = 0; r < rows; r++)
                this.pictures[col * rows + r] = this.laneByte(col, r);
        }
    }
    packView(): Uint8Array | null {
        if (!this.pictures)
            return null;
        const C = this.C;
        const out = new Uint8Array(C.VIEW_BYTES);
        for (let col = 0; col < C.COLUMNS; col++) {
            const group = Math.floor(col / C.COLUMN_GROUP) * C.TILE_COLUMN_BYTES + (col % C.COLUMN_GROUP);
            for (let r = 0; r < C.VIEW_ROWS; r++)
                out[group + r * C.ROW_STRIDE] = this.pictures[col * C.VIEW_ROWS + r]!;
        }
        return out;
    }
    private note(s: string): void {
        if (this.notes.length < 64)
            this.notes.push(s);
    }
}
function doorKey(x: number, y: number): string {
    return `${x},${y}`;
}
function faceKeyIndex(face: Face): number {
    const key = FACE_NAMES[face];
    return FACE_KEYS.indexOf(key);
}
function diagFaceKeyIndex(face: Face): number {
    const key = FACE_NAMES[face].replace("_", "-");
    return DIAG_FACE_KEYS.indexOf(key as (typeof DIAG_FACE_KEYS)[number]);
}
class TexturePosition {
    private acc = 0;
    private carry = 0;
    private o = 0;
    pair = 0;
    private readonly d: number;
    private readonly scale: number;
    private readonly bytesPerColumn: number;
    private readonly carryPerColumn: number;
    constructor(C: RendConstants, range: TextureRange, n: number) {
        this.scale = 1 << C.TC_SHIFT;
        this.bytesPerColumn = C.TEX_SIZE;
        this.carryPerColumn = C.TEX_COLUMNS;
        this.d = tdiv(s16((range.tR - range.tL) * this.scale), n);
        this.acc = u16(range.tL * this.scale);
    }
    get column(): number {
        return Math.floor(this.o / this.bytesPerColumn);
    }
    step(): void {
        this.acc = u16(this.acc + this.d);
        if (this.acc >= 256) {
            const b = s16(this.acc) >> 8;
            this.acc &= 255;
            this.o = this.o + this.bytesPerColumn * b;
            this.carry = u16(this.carry + this.carryPerColumn * b);
            if (this.carry >= 256) {
                this.pair = this.pair + (this.carry >> 8);
                this.carry &= 255;
                this.o = 2 * this.carry;
            }
        }
    }
}
export function rampWordFor(C: RendConstants, cls: number, face: Face, dx: number, dy: number, slide: number): RampWord | null {
    const R = C.RAMP;
    if (!R.HIT_CLASSES.includes(cls))
        return null;
    const idx = face === FACE_LOW_Y ? R.FACE_INDEX.low_y : face === FACE_HIGH_Y ? R.FACE_INDEX.high_y : face === FACE_HIGH_X ? R.FACE_INDEX.high_x : R.FACE_INDEX.low_x;
    let w: RampWord;
    if (cls === R.LIFT_CLASS) {
        const b = s8((slide & 255) | 1);
        w = { hi: b, lo: b };
    }
    else {
        const arms = R.ARMS.get(cls);
        if (!arms)
            return null;
        let words;
        if (slide > 0)
            words = arms.pos;
        else if (slide < 0)
            words = arms.neg;
        else if (Array.isArray(arms.zero))
            words = arms.zero;
        else {
            const z = arms.zero as {
                axis: "dx" | "dy";
                then: typeof arms.pos;
                else: typeof arms.pos;
            };
            words = (z.axis === "dx" ? dx : dy) < 0 ? z.then : z.else;
        }
        w = (words as readonly RampWord[])[idx]!;
    }
    return w.hi === 0 && w.lo === 0 ? null : w;
}
export const REND_TRACE: {
    on: boolean;
    lines: string[];
} = { on: false, lines: [] };
export function renderView(pose: Pose, floor: FloorMap, C: RendConstants, trig: TrigTable, assets: RendAssets | null = null, doors: readonly DoorView[] = [], sprites: SpriteContext | null = null, light: LightView | null = null): ViewRecord {
    const f = new Frame(C, trig, floor, assets, doors, sprites, light);
    f.render(pose);
    return { depth: f.depth, face: f.face, cell: f.cell, word: f.word, notes: f.notes, view: f.packView(), cram: assets ? assets.cramOf(floor.episode, light?.night === true) : null, items: f.items, events: f.events, spawned: f.spawned };
}
export function depthWord(v: number): number {
    return u16(v);
}
export { tdiv };

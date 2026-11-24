/// <reference lib="dom" />
import { floorDocFrom } from "../../rend/floor_map.js";
import { hdAreaFor, cpuAreaFor } from "../../rend/hd/area.js";
import { SPRITE_GROUP, farLayerOf, farSkyShift, groupLayer } from "../../rend/hd/framing.js";
import type { FarLayer } from "../../rend/hd/framing.js";
import type { HdResolution } from "../../rend/hd/area.js";
import { hdDefaults, hdProjection, renderColumns, skyPlaneFrom } from "../../rend/hd/column.js";
import type { HdArea, HdParams, HdStatics, SkyPlane } from "../../rend/hd/column.js";
import { HAND_DOUBLE, composeCornersOverlay, handScaleOf } from "../../rend/hd/corners.js";
import { FrameLimiter } from "../../rend/hd/frame_limit.js";
import { frameGeometry } from "../../rend/hd/framing.js";
import { colourRgb } from "./render.js";
import { hdConstantsFrom } from "../../rend/hd/constants.js";
import type { HdConstants } from "../../rend/hd/constants.js";
import { skyExtensionFrom } from "../../rend/hd/skygen.js";
import type { SkyExtension } from "../../rend/hd/skygen.js";
import { viewConstantsFrom } from "../../rend/hd/view_constants.js";
import { SnapshotKeeper, attachSnapshotSink, recordSnapshot } from "../../rend/hd/snapshot.js";
import { baseSnapshot, planHdFrame } from "../../rend/hd/frame_plan.js";
import { smoothAlpha } from "../../rend/hd/blend.js";
import { CameraEase } from "../../rend/hd/smooth.js";
import { CoopKeep } from "../../rend/hd/coop_keep.js";
import { runningStep } from "../../net/core.js";
import { frameClock, motionObserver, turnCarry } from "./pace_loop.js";
import { LootTracker, lootClassOf, withLoot } from "../../rend/hd/loot.js";
import type { LootClasses } from "../../rend/hd/loot.js";
import { GUARD } from "../../guard/constants.js";
import type { HostHd } from "./host.js";
import type { ViewSnapshot } from "../../rend/hd/snapshot.js";
import { HdGl } from "../../rend/hd/webgl.js";
import type { BillboardEnv, MarkerMode } from "../../rend/hd/billboard.js";
import { inSeat } from "../../tick/core.js";
import type { TickEnv, TickState } from "../../tick/core.js";
import type { NewGameSession, IndexedPicture } from "./newgame.js";
export type HdPath = "gl" | "cpu" | "both";
export interface HdSwitch {
    readonly path: HdPath;
    readonly resolution: HdResolution;
}
export interface HdViewOptions {
    readonly layout: "corners" | "bar";
    readonly resolution: HdResolution;
    readonly params: HdParams;
    readonly smoothMotion: boolean;
    readonly loot?: boolean;
    readonly markers?: MarkerMode;
    readonly handSize?: number | "normal" | "double";
    readonly frameLimit?: "display" | 60 | 30;
}
const FRAME_PX_PER_COLUMN = 2;
const STORAGE_KEY = "zt.hd";
const STORAGE_RES_KEY = "zt.hdres";
const RESOLUTIONS: readonly HdResolution[] = ["native", "half", "quarter", "original"];
function pathOf(v: string | null): HdPath | null | undefined {
    if (v === null)
        return undefined;
    if (v === "" || v === "gl")
        return "gl";
    if (v === "cpu" || v === "both")
        return v;
    return null;
}
export function hdSwitchFrom(search: string, stored: {
    hd: string | null;
    res: string | null;
}): HdSwitch | null {
    const q = new URLSearchParams(search);
    let path = pathOf(q.has("hd") ? q.get("hd") : null);
    let res = q.get("hdres");
    if (path === undefined) {
        path = pathOf(stored.hd);
        res = res ?? stored.res;
    }
    if (!path)
        return null;
    const resolution = RESOLUTIONS.find((r) => r === res) ?? "native";
    return { path, resolution };
}
export function hdSwitchOfPage(): HdSwitch | null {
    let hd: string | null = null;
    let res: string | null = null;
    try {
        hd = localStorage.getItem(STORAGE_KEY);
        res = localStorage.getItem(STORAGE_RES_KEY);
    }
    catch {
    }
    return hdSwitchFrom(location.search, { hd, res });
}
export interface HdFeed {
    stepMs(): number;
    paceMs?(pace: {
        readonly num: number;
        readonly den: number;
    }): number;
    modernTurn(newestSessionStep: number | null): number | null;
    playing?(): boolean;
}
interface FrameCtx {
    readonly seat: 0 | 1;
    readonly own: boolean;
    readonly coop: boolean;
    readonly st: HdStatics;
    readonly screen: {
        palette: readonly number[];
        backdrop: number;
        far: FarLayer;
        skyPlane?: SkyPlane;
    };
    readonly params: HdParams;
    readonly area: HdArea;
    readonly wantGl: boolean;
    readonly wantCpu: boolean;
    readonly both: boolean;
    readonly at: {
        left: number;
        top: number;
        w: number;
        h: number;
    };
    readonly bb: BillboardEnv;
    readonly R: TickEnv["R"];
}
export function hdWanted(sw: HdSwitch | null, rows: HostHd | null): boolean {
    return sw !== null || (rows !== null && rows.renderer === "custom");
}
export function hdDrive(overlay: {
    off(): void;
    setOptions(o: HdViewOptions): void;
}, sw: HdSwitch | null, rows: HostHd | null, C: HdConstants): boolean {
    if (!hdWanted(sw, rows)) {
        overlay.off();
        return false;
    }
    if (rows !== null)
        overlay.setOptions(viewOptionsOf(rows, C));
    return true;
}
export function viewOptionsOf(rows: HostHd & {
    readonly markers?: MarkerMode;
}, C: HdConstants): HdViewOptions {
    return { layout: rows.layout, resolution: rows.resolution, params: { ...rows.params, vertical: hdDefaults(C).vertical }, smoothMotion: rows.smooth_motion, loot: rows.loot ?? true, markers: rows.markers ?? "show", handSize: rows.hand_size ?? HAND_DOUBLE, frameLimit: rows.frame_limit ?? "display" };
}
export function hdCanvasCss(kind: "gl" | "cpu" | "sprites"): string {
    return `position:fixed;pointer-events:none;z-index:${kind === "sprites" ? 6 : 5};display:none;image-rendering:pixelated`;
}
interface FloorStatics {
    readonly env: TickEnv;
    readonly key: string;
    readonly statics: HdStatics;
}
export class HdOverlay {
    private readonly C: HdConstants;
    private skyExt: {
        readonly assets: object;
        readonly ext: SkyExtension | null;
    } | null = null;
    private readonly keeper: SnapshotKeeper;
    private state: TickState | null = null;
    private glCanvas: HTMLCanvasElement | null = null;
    private cpuCanvas: HTMLCanvasElement | null = null;
    private spriteCanvas: HTMLCanvasElement | null = null;
    private gl: HdGl | null = null;
    private cpuCtx: CanvasRenderingContext2D | null = null;
    private spriteCtx: CanvasRenderingContext2D | null = null;
    private floorStatics: FloorStatics | null = null;
    private tilesCopy: Uint8Array | null = null;
    private plane: SkyPlane | undefined;
    private failed = false;
    private readonly lootBySeat: [
        LootTracker | null,
        LootTracker | null
    ] = [null, null];
    private lootClass: LootClasses | null = null;
    private laserPicture: {
        readonly art: Uint8Array;
        readonly line: number;
    } | null = null;
    setLaserPicture(p: {
        readonly art: Uint8Array;
        readonly line: number;
    } | null): void {
        this.laserPicture = p;
        if (this.lootClass !== null)
            this.lootClass = { ...this.lootClass, laserPicture: p };
    }
    private bbEnv: BillboardEnv | null = null;
    lastPath: HdPath | "none" = "none";
    constructor(private readonly screen: HTMLCanvasElement, private readonly sw: HdSwitch | null, hdData: unknown, viewData: unknown, private readonly viewX0: number, private readonly viewY0: number) {
        this.C = hdConstantsFrom(hdData);
        this.keeper = new SnapshotKeeper(viewConstantsFrom(viewData).KEPT);
        this.keep = new CoopKeep(this.keeper, {
            ownSeat: () => this.frameCtx?.seat ?? 0,
            dueMs: () => this.dueTimeOfStep(),
            runningStep: () => runningStep(),
            ownSnapshot: (step) => { try {
                turnCarry.hook?.(step);
            }
            catch { } },
            replaced: () => { this.ease?.replaced(); },
        });
    }
    private readonly keep: CoopKeep;
    private options: HdViewOptions | null = null;
    setOptions(o: HdViewOptions): void {
        this.options = o;
    }
    get smoothMotion(): boolean {
        return this.options?.smoothMotion ?? false;
    }
    private attach(state: TickState, env: TickEnv): void {
        if (state === this.state)
            return;
        const restored = this.state !== null && this.coopSeen && (this.keeper.newest(0) !== null || this.keeper.newest(1) !== null);
        if (this.state)
            attachSnapshotSink(this.state, null);
        this.state = state;
        this.floorStatics = null;
        if (restored && this.coopSeen) {
            this.keep.replacedAtPicture(state);
        }
        else {
            this.keep.reset(state);
            this.lootBySeat[0]?.reset();
            this.lootBySeat[1]?.reset();
            this.ease = new CameraEase(this.C, env.R.ANGLES);
            this.easeFloor = "";
        }
        const byClass = [...env.items.byClass].map(([cls, it]) => [cls, it.id] as const);
        this.lootClass = { handgun: lootClassOf(env.ES.CORPSE.LOOT_ITEM, byClass), laser: lootClassOf(GUARD.LOOT_ITEM, byClass), grenade: lootClassOf(env.ORDNANCE.GRENADE_ITEM, byClass), laserPicture: this.laserPicture };
        this.lootBySeat[0] ??= new LootTracker(this.C, env.R, env.view);
        this.lootBySeat[1] ??= new LootTracker(this.C, env.R, env.view);
        attachSnapshotSink(state, (inp, st) => {
            const s = recordSnapshot(inp, env.R, env.view);
            if (st !== this.state) {
                this.state = st as TickState;
                this.floorStatics = null;
            }
            this.keep.pass(s, st);
            this.boundaryMs = this.keep.boundaryMs;
            try {
                motionObserver()?.snapshot({ arrivedAtMs: this.boundaryMs, iteration: s.step, camAngle: s.cam.angle });
            }
            catch { }
            return s;
        });
    }
    private lastDueMs = 0;
    private dueTimeOfStep(): number {
        const fc = frameClock();
        if (fc === null)
            return performance.now();
        if (fc.dueMs !== null) {
            this.lastDueMs = fc.dueMs;
            return fc.dueMs;
        }
        const c = this.frameCtx;
        const stepMs = this.feed === null ? 0 : c !== null && c.coop && this.sessionPace !== null && this.feed.paceMs ? this.feed.paceMs(this.sessionPace) : this.feed.stepMs();
        const line = this.lastDueMs + stepMs;
        const due = this.lastDueMs > 0 && stepMs > 0 && Math.abs(fc.nowMs - line) <= stepMs / 2 ? line : fc.nowMs;
        this.lastDueMs = due;
        return due;
    }
    private ease: CameraEase | null = null;
    private coopSeen = false;
    private sessionPace: {
        readonly num: number;
        readonly den: number;
    } | null = null;
    setSessionPace(p: {
        readonly num: number;
        readonly den: number;
    } | null): void {
        this.sessionPace = p;
    }
    hide(): void {
        this.stopLoop();
        this.frameCtx = null;
        if (this.glCanvas)
            this.glCanvas.style.display = "none";
        if (this.cpuCanvas)
            this.cpuCanvas.style.display = "none";
        if (this.spriteCanvas)
            this.spriteCanvas.style.display = "none";
        this.screen.style.visibility = "";
        this.lastPath = "none";
    }
    private staticsFor(env: TickEnv, snap: ViewSnapshot): HdStatics | null {
        if (!env.rendAssets)
            return null;
        const key = `${snap.floor_key.episode}:${snap.floor_key.floor}`;
        if (this.floorStatics && this.floorStatics.env === env && this.floorStatics.key === key)
            return this.floorStatics.statics;
        const floor = floorDocFrom(env.mapsDoc, snap.floor_key.floor, env.R.MAP_SIDE);
        let sky: HdStatics["sky"] = null;
        if (env.sky) {
            const plane = skyPlaneFrom(env.sky.assets, env.sky.C);
            if (!this.skyExt || this.skyExt.assets !== env.sky.assets)
                this.skyExt = { assets: env.sky.assets, ext: skyExtensionFrom(plane, env.sky.C, env.sky.assets.class, this.C) };
            sky = { C: env.sky.C, plane, ext: this.skyExt.ext };
        }
        const statics: HdStatics = { floor, assets: env.rendAssets, R: env.R, sky, lift: env.L.CLASS };
        this.floorStatics = { env, key, statics };
        this.tilesCopy = null;
        return statics;
    }
    private planeOf(env: TickEnv, st: HdStatics, state: TickState): SkyPlane | undefined {
        const tiles = state.sky?.tiles;
        if (!tiles || !env.sky || !st.sky)
            return undefined;
        const t = tiles as Uint8Array;
        let same = this.tilesCopy !== null && this.tilesCopy.length === t.length;
        if (same)
            for (let i = 0; i < t.length; i++)
                if (this.tilesCopy![i] !== t[i]) {
                    same = false;
                    break;
                }
        if (!same) {
            this.tilesCopy = t.slice();
            this.plane = skyPlaneFrom(env.sky.assets, env.sky.C, this.tilesCopy);
        }
        return this.plane;
    }
    private canvasFor(kind: "gl" | "cpu" | "sprites"): HTMLCanvasElement {
        const have = kind === "gl" ? this.glCanvas : kind === "cpu" ? this.cpuCanvas : this.spriteCanvas;
        if (have)
            return have;
        const c = document.createElement("canvas");
        c.style.cssText = hdCanvasCss(kind);
        (this.screen.parentElement ?? document.body).appendChild(c);
        if (kind === "gl")
            this.glCanvas = c;
        else if (kind === "cpu")
            this.cpuCanvas = c;
        else
            this.spriteCanvas = c;
        return c;
    }
    private spriteLayers(run: NonNullable<NewGameSession["run"]>, seat: 0 | 1): {
        far: FarLayer;
        hand: FarLayer;
        glow: FarLayer;
        shot: FarLayer;
    } {
        const city = inSeat(run.state, seat, () => run.cityValuesShown()) !== null;
        const g = inSeat(run.state, seat, () => run.vdpSpriteGroups(this.C.SPR.GLOW_TILES, { noStrips: city, sniperTiles: this.C.SPR.SNIPER_TILES }));
        const cols = FRAME_PX_PER_COLUMN * this.viewCols;
        const rows = this.viewRows;
        const cut = (grp: (typeof SPRITE_GROUP)[keyof typeof SPRITE_GROUP]): FarLayer => groupLayer(g, grp, this.viewX0, this.viewY0, cols, rows);
        const own = farLayerOf(g, this.viewX0, this.viewY0, cols, rows);
        const far = city ? (inSeat(run.state, seat, () => run.cityBuildingFar(own, this.viewX0, this.viewY0)) ?? own) : own;
        return { far, hand: cut(SPRITE_GROUP.HAND), glow: cut(SPRITE_GROUP.GLOW), shot: cut(SPRITE_GROUP.SHOT) };
    }
    private drawSprites(layers: {
        hand: FarLayer;
        glow: FarLayer;
        shot: FarLayer;
    }, cram: readonly number[], at: {
        left: number;
        top: number;
        w: number;
        h: number;
    }): void {
        const cols = FRAME_PX_PER_COLUMN * this.viewCols;
        const rows = this.viewRows;
        const rgb = cram.map(colourRgb);
        const px = new Uint8ClampedArray(cols * rows * 4);
        let any = false;
        for (const layer of [layers.shot, layers.glow, layers.hand]) {
            for (let i = 0; i < cols * rows; i++) {
                const idx = layer.indices[i] ?? 0;
                if (idx === 0)
                    continue;
                const c = rgb[idx] ?? [0, 0, 0];
                px[i * 4] = c[0];
                px[i * 4 + 1] = c[1];
                px[i * 4 + 2] = c[2];
                px[i * 4 + 3] = 255;
                any = true;
            }
        }
        const c = this.canvasFor("sprites");
        if (!any) {
            c.style.display = "none";
            return;
        }
        if (c.width !== cols || c.height !== rows) {
            c.width = cols;
            c.height = rows;
        }
        this.spriteCtx ??= c.getContext("2d");
        this.spriteCtx!.putImageData(new ImageData(px, cols, rows), 0, 0);
        c.style.left = `${at.left}px`;
        c.style.top = `${at.top}px`;
        c.style.width = `${at.w}px`;
        c.style.height = `${at.h}px`;
        c.style.display = "block";
    }
    private place(): {
        left: number;
        top: number;
        w: number;
        h: number;
        devW: number;
        devH: number;
    } | null {
        const s = this.screen;
        const r = s.getBoundingClientRect();
        const innerW = r.width - 2 * s.clientLeft;
        const innerH = r.height - 2 * s.clientTop;
        if (innerW <= 0 || innerH <= 0 || s.width === 0)
            return null;
        const kx = innerW / s.width;
        const ky = innerH / s.height;
        const rows = this.viewRows;
        const w = FRAME_PX_PER_COLUMN * this.viewCols * kx;
        const h = rows * ky;
        const dpr = window.devicePixelRatio || 1;
        return { left: r.left + s.clientLeft + this.viewX0 * kx, top: r.top + s.clientTop + this.viewY0 * ky, w, h, devW: Math.max(1, Math.round(w * dpr)), devH: Math.max(1, Math.round(h * dpr)) };
    }
    private viewCols = 128;
    private viewRows = 80;
    paint(pic: IndexedPicture, session: NewGameSession | null): void {
        if (!session || !session.run || (session.stage !== "play" && session.stage !== "ended") || pic.display !== 1 || pic.indices === null)
            return this.hide();
        this.coopSeen = false;
        this.sessionPace = null;
        this.paintSeat(pic.cram, session, 0, pic);
    }
    private stagePlace(): {
        left: number;
        top: number;
        w: number;
        h: number;
        devW: number;
        devH: number;
    } | null {
        const p = this.screen.parentElement;
        const r = p ? p.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        if (r.width <= 0 || r.height <= 0)
            return null;
        const dpr = window.devicePixelRatio || 1;
        return { left: r.left, top: r.top, w: r.width, h: r.height, devW: Math.max(1, Math.round(r.width * dpr)), devH: Math.max(1, Math.round(r.height * dpr)) };
    }
    private drawCorners(layers: {
        hand: FarLayer;
        glow: FarLayer;
        shot: FarLayer;
    }, cram: readonly number[], pic: {
        indices: Uint8Array;
        nothing?: number;
    }, width: number, params: HdParams, at: {
        left: number;
        top: number;
        w: number;
        h: number;
        devW: number;
        devH: number;
    }, projArea: HdArea, R: {
        COLUMNS: number;
        VIEW_ROWS: number;
        COLUMN_CENTRE: number;
    }, shotShift: number): void {
        const o = composeCornersOverlay({
            W: at.devW,
            H: at.devH,
            C: this.C,
            projection: hdProjection(params, projArea, this.C),
            geometry: frameGeometry(R),
            viewRows: R.VIEW_ROWS,
            screen: { indices: pic.indices, width, palette: cram, ...(pic.nothing !== undefined ? { nothing: pic.nothing } : {}) },
            glow: layers.glow,
            hand: layers.hand,
            shot: layers.shot,
            shotShift,
            filter: params.filter,
            handScale: handScaleOf(this.options?.handSize),
        });
        const c = this.canvasFor("sprites");
        if (c.width !== at.devW || c.height !== at.devH) {
            c.width = at.devW;
            c.height = at.devH;
        }
        this.spriteCtx ??= c.getContext("2d");
        this.spriteCtx!.putImageData(new ImageData(new Uint8ClampedArray(o.rgba), at.devW, at.devH), 0, 0);
        c.style.left = `${at.left}px`;
        c.style.top = `${at.top}px`;
        c.style.width = `${at.w}px`;
        c.style.height = `${at.h}px`;
        c.style.display = "block";
    }
    paintSeat(cram: readonly number[], session: NewGameSession | null, seat: 0 | 1, pic?: {
        readonly indices: Uint8Array | null;
        readonly nothing?: number;
    }, o: {
        own?: boolean;
        coop?: boolean;
    } = {}): void {
        if (this.failed)
            return;
        try {
            const run = session?.run ?? null;
            if (!session || !run)
                return this.hide();
            const env = run.deps.env;
            if (o.coop === true)
                this.coopSeen = true;
            this.attach(run.state, env);
            const base = baseSnapshot(this.keeper.kept_(seat));
            if (base === null)
                return this.hide();
            const st = this.staticsFor(env, base.n);
            if (!st)
                return this.hide();
            this.viewCols = env.R.COLUMNS;
            this.viewRows = env.R.VIEW_ROWS;
            const corners = (this.options?.layout ?? "bar") === "corners";
            const at = corners ? this.stagePlace() : this.place();
            if (!at)
                return this.hide();
            const planeFn = this.planeOf(env, st, run.state);
            const layers = this.spriteLayers(run, seat);
            const farHs = inSeat(run.state, seat, () => run.screenSkyScroll()) ?? undefined;
            const screen = { palette: cram, backdrop: 0, far: layers.far, ...(farHs !== undefined ? { farHs } : {}), ...(planeFn ? { skyPlane: planeFn } : {}) };
            const params = this.options?.params ?? hdDefaults(this.C);
            const orig = { rows: env.R.VIEW_ROWS, barCols: env.R.COLUMNS * FRAME_PX_PER_COLUMN };
            const resolution = this.sw?.resolution ?? this.options?.resolution ?? "native";
            const pathChoice: HdPath = this.sw?.path ?? "gl";
            const area: HdArea = hdAreaFor(resolution, at.devW, at.devH, !corners, orig);
            const wantGl = (pathChoice === "gl" || pathChoice === "both") && HdGl.available();
            const wantCpu = pathChoice === "cpu" || pathChoice === "both" || !wantGl;
            const both = pathChoice === "both" && wantGl;
            if (this.bbEnv?.assets !== env.spriteAssets || this.bbEnv.R !== env.R || this.bbEnv.SC !== env.SPR)
                this.bbEnv = { R: env.R, SC: env.SPR, assets: env.spriteAssets };
            const smooth = this.smoothMotion && this.feed !== null;
            this.frameCtx = { seat, own: o.own ?? seat === 0, coop: o.coop === true, st, screen, params, area, wantGl, wantCpu, both, at, bb: this.bbEnv, R: env.R };
            if (!smooth || this.raf === 0)
                this.drawFrame(performance.now(), false);
            if (smooth)
                this.startLoop();
            else
                this.stopLoop();
            if (corners) {
                const shown = pic?.indices ? { indices: pic.indices, ...(pic.nothing !== undefined ? { nothing: pic.nothing } : {}) } : { indices: inSeat(run.state, seat, () => run.liveScreen().indices) };
                const full: HdArea = { cols: at.devW, rows: at.devH, width: at.devW, height: at.devH, bar: false };
                const shotShift = st.sky ? farSkyShift(st.sky.C, base.n.cam.angle, farHs ?? null) : 0;
                this.drawCorners(layers, cram, shown, run.deps.HC.RECORD.DISPLAY_W, params, at, full, env.R, shotShift);
                this.screen.style.visibility = "hidden";
            }
            else {
                this.screen.style.visibility = "";
                this.drawSprites(layers, cram, at);
            }
            this.lastPath = both ? "both" : wantGl ? "gl" : "cpu";
        }
        catch (e) {
            this.failed = true;
            this.hide();
            console.warn(`HD overlay stopped: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    setFeed(f: HdFeed | null): void {
        this.feed = f;
    }
    private feed: HdFeed | null = null;
    private frameCtx: FrameCtx | null = null;
    private raf = 0;
    private boundaryMs = 0;
    private easeFloor = "";
    private startLoop(): void {
        if (this.raf !== 0 || typeof requestAnimationFrame !== "function")
            return;
        const tick = (now: number): void => {
            this.raf = 0;
            if (!this.frameCtx || this.failed || !this.smoothMotion)
                return;
            this.raf = requestAnimationFrame(tick);
            if (!this.limiter.frame(now, this.options?.frameLimit ?? "display"))
                return;
            try {
                this.drawFrame(now, true);
            }
            catch (e) {
                this.failed = true;
                this.hide();
                console.warn(`HD overlay stopped: ${e instanceof Error ? e.message : String(e)}`);
            }
        };
        this.raf = requestAnimationFrame(tick);
    }
    private readonly limiter = new FrameLimiter();
    private stopLoop(): void {
        if (this.raf !== 0 && typeof cancelAnimationFrame === "function")
            cancelAnimationFrame(this.raf);
        this.raf = 0;
    }
    private drawFrame(nowMs: number, easeStep: boolean): void {
        const c = this.frameCtx;
        if (!c)
            return;
        const kept = this.keeper.kept_(c.seat);
        const newest = kept[kept.length - 1];
        if (newest === undefined)
            return this.hide();
        const floor = `${newest.floor_key.episode}:${newest.floor_key.floor}`;
        if (floor !== this.easeFloor) {
            this.easeFloor = floor;
            this.ease?.reset();
        }
        const smooth = this.smoothMotion && this.feed !== null;
        const stepMs = smooth ? (c.coop && this.sessionPace !== null && this.feed!.paceMs ? this.feed!.paceMs(this.sessionPace) : this.feed!.stepMs()) : 0;
        const planned = planHdFrame({
            kept,
            nowMs,
            boundaryMs: this.boundaryMs,
            stepMs,
            smoothMotion: smooth,
            modernPending: smooth && c.own ? this.feed!.modernTurn(this.keep.sessionStepOf(newest)) : null,
            ease: smooth && c.coop && easeStep ? this.ease : null,
        }, this.C, c.R);
        if (planned === null)
            return this.hide();
        const b = baseSnapshot(kept);
        if (b !== null) {
            const alpha = !smooth || b.nPrev === null ? 1 : Math.min(1, Math.max(0, smoothAlpha(nowMs, this.boundaryMs, stepMs)));
            this.lastDrawn = { prev: b.nPrev ?? b.n, n: b.n, alpha, camera: { x: planned.cam.x, y: planned.cam.y, angle: planned.cam.angle }, nowMs, seat: c.seat };
        }
        const watch = motionObserver();
        const drawT0 = watch !== null ? performance.now() : 0;
        const snap = c.bb !== null ? withLoot(planned, this.lootBySeat[c.seat]?.cells(planned, c.bb, this.options?.loot === false ? null : this.lootClass, undefined, nowMs) ?? []) : planned;
        const bbm: BillboardEnv | null = c.bb !== null ? { ...c.bb, markers: this.options?.markers ?? "show" } : null;
        const place = (cv: HTMLCanvasElement, clip: string): void => {
            cv.style.left = `${c.at.left}px`;
            cv.style.top = `${c.at.top}px`;
            cv.style.width = `${c.at.w}px`;
            cv.style.height = `${c.at.h}px`;
            cv.style.clipPath = clip;
            cv.style.display = "block";
        };
        if (c.wantGl) {
            const cv = this.canvasFor("gl");
            this.gl ??= new HdGl(cv, this.C);
            this.gl.setBillboards(bbm);
            this.gl.draw(snap, c.st, c.screen, c.params, c.area);
            place(cv, c.both ? "inset(0 50% 0 0)" : "none");
        }
        else if (this.glCanvas)
            this.glCanvas.style.display = "none";
        if (c.wantCpu) {
            const cpuArea = cpuAreaFor(c.area, this.C);
            const pict = renderColumns(snap, c.st, c.screen, c.params, cpuArea, this.C, bbm ?? undefined);
            const cv = this.canvasFor("cpu");
            if (cv.width !== pict.cols || cv.height !== pict.rows) {
                cv.width = pict.cols;
                cv.height = pict.rows;
            }
            this.cpuCtx ??= cv.getContext("2d");
            this.cpuCtx!.putImageData(new ImageData(new Uint8ClampedArray(pict.rgba), pict.cols, pict.rows), 0, 0);
            place(cv, c.both ? "inset(0 0 0 50%)" : "none");
        }
        else if (this.cpuCanvas)
            this.cpuCanvas.style.display = "none";
        if (watch !== null)
            this.reportFrame(watch, nowMs, planned, kept, smooth, c, performance.now() - drawT0);
    }
    private whereOfWorld(): {
        episode: number;
        floor: number;
        cellX: number;
        cellY: number;
    } | Record<string, never> {
        const st = this.state;
        const c = this.frameCtx;
        if (st === null || c === null)
            return {};
        return inSeat(st, c.seat, () => {
            const w = st.world;
            const shift = c.R.CELL_SHIFT;
            return { episode: w.level.episode.value, floor: w.level.sub_id, cellX: Math.floor(w.player.pos.x / (1 << shift)), cellY: Math.floor(w.player.pos.y / (1 << shift)) };
        });
    }
    private reportFrame(watch: NonNullable<ReturnType<typeof motionObserver>>, nowMs: number, planned: ViewSnapshot, kept: readonly ViewSnapshot[], smooth: boolean, c: {
        wantGl: boolean;
        both: boolean;
        own: boolean;
        coop: boolean;
    }, drawMs: number): void {
        try {
            const b = baseSnapshot(kept);
            if (b === null)
                return;
            const alpha = smooth ? smoothAlpha(nowMs, this.boundaryMs, this.feed!.stepMs()) : 1;
            watch.hdFrame({
                frameTimeMs: nowMs, blendAlpha: alpha, blendSnapshotIteration: b.n.step, blendPrevSnapshotIteration: b.nPrev?.step ?? null,
                newestSnapshotIteration: b.newest.step, newestSnapshotCamAngle: b.newest.cam.angle,
                modernTurnAdded: smooth && c.own ? this.feed!.modernTurn(this.keep.sessionStepOf(b.newest)) : null,
                mouseTurnsView: c.own && (c.coop || (this.feed?.playing?.() ?? true)),
                ...(c.coop ? { coop: { snapshotsRecorded: this.keep.recorded - this.reportedRecorded, kept: kept.length, easeActive: this.ease?.active ?? false } } : {}),
                drawnCamX: planned.cam.x, drawnCamY: planned.cam.y, drawnCamAngle: planned.cam.angle,
                drawHdMs: drawMs, pathDrawn: c.both ? "both" : c.wantGl ? "gl" : "cpu", smoothMotion: smooth,
                ...this.whereOfWorld(),
            });
            this.reportedRecorded = this.keep.recorded;
        }
        catch { }
    }
    private reportedRecorded = 0;
    private lastDrawn: {
        prev: ViewSnapshot;
        n: ViewSnapshot;
        alpha: number;
        camera: {
            x: number;
            y: number;
            angle: number;
        };
        nowMs: number;
        seat: 0 | 1;
    } | null = null;
    moment(): {
        state: TickState;
        seat: 0 | 1;
        view: {
            snapshots: readonly [
                ViewSnapshot,
                ViewSnapshot
            ];
            alpha: number;
            camera: {
                x: number;
                y: number;
                angle: number;
            };
        };
        canvases: HTMLCanvasElement[];
    } | null {
        const d = this.lastDrawn;
        if (d === null || this.state === null || this.frameCtx === null || this.lastPath === "none")
            return null;
        try {
            this.drawFrame(d.nowMs, false);
        }
        catch { }
        const canvases = [this.glCanvas, this.cpuCanvas, this.spriteCanvas].filter((cv): cv is HTMLCanvasElement => cv !== null && cv !== undefined && cv.style.display !== "none");
        return { state: this.state, seat: d.seat, view: { snapshots: [d.prev, d.n], alpha: d.alpha, camera: d.camera }, canvases };
    }
    off(): void {
        this.lastDrawn = null;
        this.hide();
        if (this.state)
            attachSnapshotSink(this.state, null);
        this.state = null;
        this.keeper.clear();
    }
}

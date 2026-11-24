import { mod, s16, u16 } from "../arith.js";
import type { RendConstants } from "../constants.js";
import { cellParts } from "../sprite/parts.js";
import { itemRow, projectCell } from "../sprite/project.js";
import type { Camera } from "../sprite/types.js";
import type { TrigTable } from "../trig.js";
import { artOf } from "./billboard.js";
import type { BillboardEnv } from "./billboard.js";
import type { HdConstants } from "./constants.js";
import type { SnapshotCell, ViewSnapshot } from "./snapshot.js";
interface LootState {
    readonly dx: number;
    readonly dy: number;
    f: number;
    restAt: number | null;
}
export interface LootClasses {
    readonly handgun: number | null;
    readonly laser: number | null;
    readonly grenade: number | null;
    readonly laserPicture?: {
        readonly art: Uint8Array;
        readonly line: number;
    } | null;
}
export const CHIP_TILE_PX = 8;
const LINE_SHIFT = 13;
const LINE_MASK = 3;
export function inventoryPicture(cardArt: readonly Uint8Array[], item: number, card: {
    readonly W: number;
    readonly H: number;
    readonly ATTR_BASE: number;
}, artCols: number, artRows: number): {
    art: Uint8Array;
    line: number;
} | null {
    const bytes = cardArt[item - 1];
    if (bytes === undefined)
        return null;
    return { art: gunRows(cardToArt(bytes, { cols: card.W, rows: card.H, tilePx: CHIP_TILE_PX }, artCols, artRows), artCols, artRows), line: (card.ATTR_BASE >> LINE_SHIFT) & LINE_MASK };
}
export function gunRows(art: Uint8Array, artCols: number, artRows: number): Uint8Array {
    const rowEmpty = (y: number): boolean => {
        for (let c = 0; c < artCols; c++)
            if (art[c * artRows + y] !== 0)
                return false;
        return true;
    };
    const out = new Uint8Array(art.length);
    let first = -1;
    for (let y = 0; y < artRows && first < 0; y++)
        if (rowEmpty(y))
            first = y;
    if (first < 0)
        return out;
    let last = -1;
    for (let y = artRows - 1; y > first && last < 0; y--)
        if (!rowEmpty(y))
            last = y;
    if (last < 0)
        return out;
    const down = artRows - 1 - last;
    for (let c = 0; c < artCols; c++)
        for (let y = first + 1; y <= last; y++)
            out[c * artRows + y + down] = art[c * artRows + y]!;
    return out;
}
export interface CardLayout {
    readonly cols: number;
    readonly rows: number;
    readonly tilePx: number;
}
export function cardToArt(card: Uint8Array, L: CardLayout, artCols: number, artRows: number): Uint8Array {
    const out = new Uint8Array(artCols * artRows);
    const tileBytes = (L.tilePx * L.tilePx) / 2;
    const rowBytes = L.tilePx / 2;
    const w = L.cols * L.tilePx;
    const h = L.rows * L.tilePx;
    for (let py = 0; py < Math.min(h, artRows); py++)
        for (let px = 0; px < Math.min(w, 2 * artCols); px += 2) {
            const n = Math.floor(px / L.tilePx) * L.rows + Math.floor(py / L.tilePx);
            out[(px >> 1) * artRows + py] = card[n * tileBytes + (py % L.tilePx) * rowBytes + ((px % L.tilePx) >> 1)] ?? 0;
        }
    return out;
}
export function lootPictureClass(code: number, classes: LootClasses, restMs: number | null, C: HdConstants): number | null {
    if (code === 1)
        return classes.handgun;
    if (code === 2)
        return classes.laser;
    if (code !== 3)
        return null;
    if (restMs === null || restMs < 0)
        return classes.laser;
    return Math.floor(restMs / C.LOOT.ALT_MS) % 2 === 0 ? classes.laser : classes.grenade;
}
export function lootClassOf(item: number, byClass: Iterable<readonly [
    number,
    number
]>): number | null {
    let best: number | null = null;
    for (const [cls, id] of byClass)
        if (id === item && (best === null || cls < best))
            best = cls;
    return best;
}
export function tossPoint(from: {
    x: number;
    y: number;
}, rest: {
    x: number;
    y: number;
}, f: number, C: HdConstants): {
    x: number;
    y: number;
    h: number;
} {
    const t = Math.min(1, f / C.LOOT.DROP_FRAMES);
    return { x: from.x + (rest.x - from.x) * t, y: from.y + (rest.y - from.y) * t, h: C.LOOT.TOSS_Z * (1 - t) + 4 * C.LOOT.TOSS_PEAK * t * (1 - t) };
}
export type NoLoot = (slot: number) => boolean;
export class LootTracker {
    private readonly items = new Map<number, LootState>();
    private prev: Map<number, number> | null = null;
    private lastStep: number | null = null;
    private lastFloor = "";
    constructor(private readonly C: HdConstants, private readonly R: RendConstants, private readonly trig: TrigTable) { }
    reset(): void {
        this.items.clear();
        this.prev = null;
        this.lastStep = null;
    }
    slots(): number[] {
        return [...this.items.keys()];
    }
    private observe(snap: ViewSnapshot, noLoot: NoLoot): void {
        const lootOf = (e: {
            slot: number;
            loot?: 0 | 1 | 2 | 3;
        }): number => (noLoot(e.slot) ? 0 : (e.loot ?? 0));
        const floor = `${snap.floor_key.episode}:${snap.floor_key.floor}`;
        if (floor !== this.lastFloor) {
            this.reset();
            this.lastFloor = floor;
        }
        const cur = new Map<number, number>();
        for (const e of snap.entities)
            if (!cur.has(e.slot))
                cur.set(e.slot, lootOf(e));
        for (const slot of [...this.items.keys()])
            if ((cur.get(slot) ?? 0) === 0)
                this.items.delete(slot);
        for (const e of snap.entities) {
            if (lootOf(e) === 0 || this.items.has(e.slot))
                continue;
            const died = this.prev !== null && this.prev.get(e.slot) === 0;
            const dx = e.x - snap.cam.x;
            const dy = e.y - snap.cam.y;
            const d = Math.hypot(dx, dy);
            this.items.set(e.slot, { dx: d > 0 ? dx / d : 0, dy: d > 0 ? dy / d : 0, f: died ? 0 : this.C.LOOT.DROP_FRAMES, restAt: null });
        }
        this.prev = cur;
        this.lastStep = snap.step;
    }
    cells(snap: ViewSnapshot, B: BillboardEnv, lootClass: number | LootClasses | null, noLoot: NoLoot = () => false, nowMs = 0): SnapshotCell[] {
        const classes: LootClasses | null = lootClass === null ? null : typeof lootClass === "number" ? { handgun: lootClass, laser: null, grenade: null } : lootClass;
        if (this.lastStep === null || snap.step !== this.lastStep || `${snap.floor_key.episode}:${snap.floor_key.floor}` !== this.lastFloor)
            this.observe(snap, noLoot);
        const out: SnapshotCell[] = [];
        const { SC } = B;
        const R = this.R;
        const angle = mod(Math.round(snap.cam.angle), R.ANGLES);
        const cam: Camera = { cx: snap.cam.x, cy: snap.cam.y, VX: this.trig.sin256[angle]!, VY: this.trig.neg_cos256[angle]!, cellx: snap.box.cell[0], celly: snap.box.cell[1] };
        for (const e of snap.entities) {
            const st = this.items.get(e.slot);
            const code = e.loot ?? 0;
            if (st === undefined || code === 0 || noLoot(e.slot))
                continue;
            const from = { x: e.x, y: e.y };
            const rest = { x: e.x + st.dx * this.C.LOOT.TOSS_UNITS, y: e.y + st.dy * this.C.LOOT.TOSS_UNITS };
            const at = tossPoint(from, rest, st.f, this.C);
            if (st.f >= this.C.LOOT.DROP_FRAMES && st.restAt === null)
                st.restAt = nowMs;
            const cls = classes === null ? null : lootPictureClass(code, classes, st.restAt === null ? null : nowMs - st.restAt, this.C);
            if (st.f < this.C.LOOT.DROP_FRAMES)
                st.f++;
            if (cls === null)
                continue;
            const p = projectCell(u16(Math.round(at.x)), u16(Math.round(at.y)), cam, SC, () => { });
            if (p === null)
                continue;
            const env = { SC, assets: B.assets, phase: snap.step, mode: snap.mode, night: snap.night, eye: snap.cam.eye_walls };
            let parts = cellParts(cls, p.S, p.column, env, 1);
            if (classes !== null && cls === classes.laser) {
                const pic = classes.laserPicture ?? null;
                const fitTo = TEST_ONLY_LOOT_FIT.on ? [classes.handgun, classes.grenade].flatMap((k) => (k === null ? [] : [visibleBox(cellParts(k, p.S, p.column, env, 1), B, SC)])).filter((b): b is {
                    w: number;
                    h: number;
                } => b !== null) : [];
                parts = pic === null ? [] : parts.slice(0, 1).map((q) => ({ ...q, mirrored: false, own: fitTo.length > 0 ? { ...pic, fitTo } : pic }));
            }
            if (parts.length === 0)
                continue;
            out.push({
                cell: [Math.floor(at.x / (1 << R.CELL_SHIFT)), Math.floor(at.y / (1 << R.CELL_SHIFT))],
                cls,
                S: p.S,
                sx: p.column,
                sy: s16(itemRow(p.S, snap.cam.eye_walls, SC)),
                parts,
                at,
            });
        }
        return out;
    }
}
export const TEST_ONLY_LOOT_FIT = { on: true };
export function visibleBox(parts: readonly SnapshotCell["parts"][number][], B: BillboardEnv, SC: BillboardEnv["SC"]): {
    w: number;
    h: number;
} | null {
    const texW = SC.ART_COLUMNS * 2;
    const texH = SC.ART_ROWS;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const part of parts) {
        const art = artOf(part, B.assets);
        if (art === null)
            continue;
        let px0 = texW, py0 = texH, px1 = 0, py1 = 0;
        for (let c = 0; c < SC.ART_COLUMNS; c++)
            for (let y = 0; y < texH; y++) {
                const b = art[c * texH + y] ?? 0;
                if (b === 0)
                    continue;
                const xa = 2 * c, xb = 2 * c + 2;
                if (xa < px0)
                    px0 = xa;
                if (xb > px1)
                    px1 = xb;
                if (y < py0)
                    py0 = y;
                if (y + 1 > py1)
                    py1 = y + 1;
            }
        if (px1 <= px0 || py1 <= py0)
            continue;
        const r = part.rect;
        const ux = r.w / texW, uy = r.h / texH;
        const left = part.mirrored ? r.left + (texW - px1) * ux : r.left + px0 * ux;
        x0 = Math.min(x0, left);
        x1 = Math.max(x1, left + (px1 - px0) * ux);
        y0 = Math.min(y0, r.top + py0 * uy);
        y1 = Math.max(y1, r.top + py1 * uy);
    }
    return x1 > x0 && y1 > y0 ? { w: x1 - x0, h: y1 - y0 } : null;
}
export function withLoot(snap: ViewSnapshot, loot: readonly SnapshotCell[]): ViewSnapshot {
    return loot.length === 0 ? snap : { ...snap, cells: [...snap.cells, ...loot] };
}

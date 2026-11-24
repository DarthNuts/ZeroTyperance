import type { SpriteConstants } from "../sprite/constants.js";
import type { Art } from "../sprite/types.js";
import { artOf, billboardOrder, billboardRects, ownShade, shadeHdOf, shadeOf } from "./billboard.js";
import type { BillboardEnv, BillboardView, PartRect } from "./billboard.js";
import type { HdParams } from "./column.js";
import type { HdConstants } from "./constants.js";
import type { ViewSnapshot } from "./snapshot.js";
export const OWN_LINE_BASE = 2;
export const BB_INSTANCE_FLOATS = 12;
const TABLE_BYTES = 256;
export function billboardDepth(F: number, near: number, far: number): number {
    return (far + near - (2 * far * near) / F) / (far - near);
}
export class ArtAtlas {
    readonly keys = new Map<string, number>();
    readonly arts: Art[] = [];
    version = 0;
    constructor(readonly SC: Pick<SpriteConstants, "ART_COLUMNS" | "ART_ROWS">) { }
    indexOf(bank: string | null, slot: number, art: Art): number {
        const key = `${bank ?? ""}:${slot}`;
        let i = this.keys.get(key);
        if (i === undefined) {
            i = this.arts.length;
            this.keys.set(key, i);
            this.arts.push(art);
            this.version++;
        }
        return i;
    }
    pack(): {
        width: number;
        height: number;
        data: Uint8Array;
    } {
        const W = this.SC.ART_COLUMNS;
        const H = this.SC.ART_ROWS;
        const n = Math.max(1, this.arts.length);
        const data = new Uint8Array(W * H * n);
        this.arts.forEach((art, k) => {
            for (let c = 0; c < W; c++)
                for (let y = 0; y < H; y++)
                    data[(k * H + y) * W + c] = art[c * H + y] ?? 0;
        });
        return { width: W, height: H * n, data };
    }
}
export class TableSet {
    readonly rows = new Map<Uint8Array, number>();
    readonly tables: Uint8Array[] = [];
    version = 0;
    rowOf(t: Uint8Array): number {
        let r = this.rows.get(t);
        if (r === undefined) {
            r = this.tables.length;
            this.rows.set(t, r);
            this.tables.push(t);
            this.version++;
        }
        return r;
    }
    pack(): {
        width: number;
        height: number;
        data: Uint8Array;
    } {
        const n = Math.max(1, this.tables.length);
        const data = new Uint8Array(TABLE_BYTES * n);
        this.tables.forEach((t, r) => data.set(t.subarray(0, TABLE_BYTES), r * TABLE_BYTES));
        return { width: TABLE_BYTES, height: n, data };
    }
}
export interface BillboardInstance {
    readonly rect: PartRect;
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
    readonly F: number;
    readonly art: number;
    readonly mirrored: boolean;
    readonly rowLo: number;
    readonly rowHi: number;
    readonly w: number;
    readonly beamRow: number;
    readonly floor: boolean;
    readonly visible: boolean;
}
export function buildBillboardInstances(snap: ViewSnapshot, B: BillboardEnv, view: BillboardView, C: HdConstants, params: HdParams, atlas: ArtAtlas, tables: TableSet): BillboardInstance[] {
    const { SC, R } = B;
    const rects = billboardRects(snap, B, view, C);
    const order = billboardOrder(rects);
    const out: BillboardInstance[] = [];
    for (const id of order) {
        const pr = rects[id]!;
        const art = artOf(pr.part, B.assets);
        if (art === null)
            continue;
        const shade = pr.part.own !== undefined ? ownShade(B, pr.part.mirrored) : shadeOf(snap, B, shadeHdOf(pr.F, R, SC), pr.part.mirrored, params.smooth);
        if (shade === null)
            continue;
        out.push({
            rect: pr,
            x0: pr.x0,
            y0: pr.y0,
            x1: pr.x1,
            y1: pr.y1,
            F: pr.drawF,
            art: atlas.indexOf(pr.part.art.bank, pr.part.art.slot, art),
            mirrored: pr.part.mirrored,
            rowLo: tables.rowOf(shade.lo),
            rowHi: tables.rowOf(shade.hi),
            w: shade.w,
            beamRow: shade.beam === null ? -1 : tables.rowOf(shade.beam),
            floor: pr.role === "F",
            visible: pr.x1 - pr.x0 > 0 && pr.y1 - pr.y0 > 0,
        });
    }
    return out;
}
export function packInstances(list: readonly BillboardInstance[], colW: number, rowH: number): {
    data: Float32Array;
    count: number;
    floorCount: number;
} {
    const vis = list.filter((i) => i.visible);
    const floorCount = vis.filter((i) => i.floor).length;
    const data = new Float32Array(vis.length * BB_INSTANCE_FLOATS);
    vis.forEach((b, k) => {
        const o = k * BB_INSTANCE_FLOATS;
        data[o] = b.x0 / colW;
        data[o + 1] = b.y0 / rowH;
        data[o + 2] = b.x1 / colW;
        data[o + 3] = b.y1 / rowH;
        data[o + 4] = b.F;
        data[o + 5] = b.art;
        data[o + 6] = b.mirrored ? 1 : 0;
        data[o + 7] = b.beamRow;
        data[o + 8] = b.rowLo;
        data[o + 9] = b.rowHi;
        data[o + 10] = b.w;
        data[o + 11] = b.rect.part.own !== undefined ? OWN_LINE_BASE + b.rect.part.own.line : b.rect.shadow ? 1 : 0;
    });
    return { data, count: vis.length, floorCount };
}

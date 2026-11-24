import { blendSnapshots } from "../blend.js";
import { withCamera } from "../smooth.js";
import { hdDefaults, renderColumns } from "../column.js";
import type { HdArea, HdParams, HdScreen, HdStatics } from "../column.js";
import type { HdConstants } from "../constants.js";
import type { SnapshotCell, SnapshotEntity, ViewSnapshot } from "../snapshot.js";
import type { BillboardEnv, MarkerMode } from "../billboard.js";
import { LootTracker, withLoot } from "../loot.js";
import type { LootClasses } from "../loot.js";
import type { TrigTable } from "../../trig.js";
export interface ProbeView {
    readonly snapshots: readonly [
        unknown,
        unknown
    ];
    readonly alpha: number;
    readonly camera?: {
        readonly x: number;
        readonly y: number;
        readonly angle: number;
    };
}
export interface ProbeSettings {
    readonly hd: {
        readonly layout: "corners" | "bar";
        readonly params: {
            readonly fov: "auto" | number;
            readonly smooth: boolean;
            readonly filter: "sharp" | "smooth";
        };
        readonly loot?: boolean;
        readonly markers?: MarkerMode;
    };
}
export interface ProbeInput {
    readonly view: ProbeView;
    readonly settings: ProbeSettings;
}
type JsonPart = {
    own?: {
        art: ArrayLike<number>;
        line: number;
    };
};
const partFromJson = <P extends JsonPart>(q: P): P => (q.own ? { ...q, own: { art: Uint8Array.from(q.own.art), line: q.own.line } } : q);
const partToJson = <P extends JsonPart>(q: P): P => (q.own ? { ...q, own: { art: Array.from(q.own.art), line: q.own.line } } : q);
export function snapshotFromJson(o: unknown): ViewSnapshot {
    const s = o as ViewSnapshot & {
        map: {
            side: number;
            block: ArrayLike<number>;
            cls: ArrayLike<number>;
        };
        metatex: ArrayLike<number>;
    };
    if (!s || typeof s !== "object" || !s.map || !s.cam || !s.box)
        throw new Error("probe: not a view snapshot");
    const cells = (s.cells ?? []).map((c: SnapshotCell) => ({ ...c, parts: c.parts.map(partFromJson) }));
    const entities = (s.entities ?? []).map((e: SnapshotEntity) => ({ ...e, parts: e.parts.map(partFromJson) }));
    return { ...s, map: { side: s.map.side, block: Uint16Array.from(s.map.block), cls: Uint16Array.from(s.map.cls) }, metatex: Uint16Array.from(s.metatex), entities, cells };
}
export function snapshotToJson(s: ViewSnapshot): object {
    return {
        ...s, map: { side: s.map.side, block: Array.from(s.map.block), cls: Array.from(s.map.cls) }, metatex: Array.from(s.metatex),
        cells: s.cells.map((c) => ({ ...c, parts: c.parts.map(partToJson) })), entities: s.entities.map((e) => ({ ...e, parts: e.parts.map(partToJson) })),
    };
}
export interface ProbeBillboards {
    readonly bb: BillboardEnv;
    readonly trig: TrigTable;
    readonly loot: LootClasses | null;
}
export function probeBillboards(snap: ViewSnapshot, settings: ProbeSettings, b: ProbeBillboards, C: HdConstants, R: HdStatics["R"]): {
    snap: ViewSnapshot;
    bb: BillboardEnv;
} {
    const tracker = new LootTracker(C, R, b.trig);
    const loot = tracker.cells(snap, b.bb, settings.hd.loot === false ? null : b.loot, undefined, 0);
    return { snap: withLoot(snap, loot), bb: { ...b.bb, markers: settings.hd.markers ?? "show" } };
}
export function probeSnapshot(view: ProbeView, C: HdConstants, R: HdStatics["R"]): ViewSnapshot {
    if (!Array.isArray(view.snapshots) || view.snapshots.length !== 2)
        throw new Error("probe: `view.snapshots` must hold two snapshots");
    if (typeof view.alpha !== "number" || !(view.alpha >= 0 && view.alpha <= 1))
        throw new Error("probe: `view.alpha` must lie in 0 .. 1");
    const prev = snapshotFromJson(view.snapshots[0]);
    const next = snapshotFromJson(view.snapshots[1]);
    const s = view.alpha >= 1 ? next : blendSnapshots(next, prev, view.alpha, C, R as never);
    return view.camera === undefined ? s : withCamera(s, view.camera);
}
export function probeParams(settings: ProbeSettings, C: HdConstants): HdParams {
    const h = settings.hd;
    return { ...hdDefaults(C), fov: h.params.fov, smooth: h.params.smooth, filter: h.params.filter };
}
export function probeArea(cols: number, rows: number, settings: ProbeSettings): HdArea {
    if (!(Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0))
        throw new Error("probe: the area's size must be two positive integers");
    return { cols, rows, width: cols, height: rows, bar: settings.hd.layout === "bar" };
}
export function probeScreen(snap: ViewSnapshot, st: HdStatics): HdScreen {
    return { palette: st.assets.cramOf(snap.floor_key.episode, snap.night), backdrop: 0 };
}
export function probeColumns(input: ProbeInput, st: HdStatics, C: HdConstants, cols: number, rows: number, billboards?: ProbeBillboards): {
    snap: ViewSnapshot;
    rgba: Uint8ClampedArray;
    params: HdParams;
    area: HdArea;
    screen: HdScreen;
    bb: BillboardEnv | null;
} {
    const drawn = probeSnapshot(input.view, C, st.R);
    const withBb = billboards ? probeBillboards(drawn, input.settings, billboards, C, st.R) : null;
    const snap = withBb?.snap ?? drawn;
    const bb = withBb?.bb ?? null;
    const params = probeParams(input.settings, C);
    const area = probeArea(cols, rows, input.settings);
    const screen = probeScreen(snap, st);
    return { snap, rgba: renderColumns(snap, st, screen, params, area, C, bb ?? undefined).rgba, params, area, screen, bb };
}
export function differingPixels(a: ArrayLike<number>, b: ArrayLike<number>): number {
    if (a.length !== b.length)
        throw new Error("probe: pictures of different sizes");
    let n = 0;
    for (let i = 0; i < a.length; i += 4)
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2])
            n++;
    return n;
}

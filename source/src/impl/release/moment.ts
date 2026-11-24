export interface MomentCamera {
    readonly x: number;
    readonly y: number;
    readonly angle: number;
}
export interface MomentPlace {
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
    readonly camera: MomentCamera | null;
    readonly eye_offset: number;
    readonly slide: number;
}
export interface MomentView {
    readonly snapshots: readonly [
        object,
        object
    ];
    readonly alpha: number;
    readonly camera: MomentCamera;
}
export interface MomentPage {
    readonly version: string;
    readonly pageTimeMs: number;
    readonly areaCss: {
        readonly w: number;
        readonly h: number;
    };
    readonly areaDevice: {
        readonly w: number;
        readonly h: number;
    };
    readonly devicePixelRatio: number;
    readonly webgl2: boolean;
}
export interface MomentFile {
    readonly format: "zt-moment/1";
    readonly page: MomentPage;
    readonly settings: {
        readonly video: unknown;
        readonly speed: unknown;
        readonly scheme: string;
        readonly hd: unknown;
    };
    readonly place: MomentPlace;
    readonly view: MomentView | null;
    readonly pictures: {
        readonly shown: "custom" | "original";
        readonly custom: string | null;
        readonly original: string;
    };
}
export const MOMENT_FORMAT = "zt-moment/1";
export const NO_LEVEL_NOTICE = "No level running";
export function momentFileName(place: Pick<MomentPlace, "episode" | "floor">, pageTimeMs: number): string {
    return `zt-moment-e${place.episode}-f${place.floor}-${Math.round(pageTimeMs)}.json`;
}
export const savedNotice = (name: string): string => `Saved ${name}`;
export function buildMoment(p: {
    page: MomentPage;
    settings: MomentFile["settings"];
    place: MomentPlace;
    view: MomentView | null;
    pictures: MomentFile["pictures"];
}): MomentFile {
    return { format: MOMENT_FORMAT, page: p.page, settings: p.settings, place: p.place, view: p.view, pictures: p.pictures };
}
export function checkMoment(o: unknown): string[] {
    const bad: string[] = [];
    const f = o as Partial<MomentFile> | null;
    if (!f || typeof f !== "object")
        return ["not an object"];
    for (const k of ["page", "settings", "place", "pictures"] as const)
        if (!f[k] || typeof f[k] !== "object")
            bad.push(`no ${k}`);
    if (!("view" in f))
        bad.push("no view");
    const pic = f.pictures;
    const png = (s: unknown): boolean => typeof s === "string" && s.startsWith("data:image/png;base64,");
    if (pic && !png(pic.original))
        bad.push("no Original picture");
    if (pic?.shown === "custom") {
        if (!png(pic.custom))
            bad.push("no Custom picture");
        const v = f.view;
        if (!v || typeof v !== "object")
            bad.push("Custom shown without a view");
        else {
            if (!Array.isArray(v.snapshots) || v.snapshots.length !== 2 || v.snapshots.some((s) => !s || typeof s !== "object"))
                bad.push("the view does not hold two snapshots");
            if (typeof v.alpha !== "number" || !(v.alpha >= 0 && v.alpha <= 1))
                bad.push("the view's alpha is not in 0 .. 1");
        }
    }
    const pl = f.place;
    if (pl && (typeof pl.episode !== "number" || typeof pl.floor !== "number" || !Array.isArray(pl.cell)))
        bad.push("the place has no episode, floor or cell");
    return bad;
}

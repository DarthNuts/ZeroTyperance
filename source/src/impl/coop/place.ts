import { octDist, s16 } from "../hydaca/arith.js";
export interface PlaceConstants {
    readonly refDist: number;
    readonly fadeStart: number;
    readonly far: number;
    readonly panMaxPercent: number;
    readonly rearGainPercent: number;
}
export interface Place {
    readonly d: number;
    readonly lx: number;
    readonly fw: number;
}
export function placeConstantsFrom(doc: unknown): PlaceConstants {
    const list = (doc as {
        constants?: {
            id: string;
            value: unknown;
        }[];
    }).constants ?? [];
    const get = (id: string): number => {
        const v = list.find((c) => c.id === id)?.value;
        if (typeof v !== "number")
            throw new Error(`coop.json: no ${id}`);
        return v;
    };
    return {
        refDist: get("COOP.SOUND.REF_DIST"),
        fadeStart: get("COOP.SOUND.FADE_START"),
        far: get("COOP.SOUND.FAR"),
        panMaxPercent: get("COOP.SOUND.PAN_MAX_PERCENT"),
        rearGainPercent: get("COOP.SOUND.REAR_GAIN_PERCENT"),
    };
}
let registry: PlaceConstants | null = null;
export function setPlaceConstants(c: PlaceConstants | null): void {
    registry = c;
}
export function getPlaceConstants(): PlaceConstants | null {
    return registry;
}
export function placeOf(sx: number, sy: number, px: number, py: number, e0: number, e2: number, c: PlaceConstants): Place | null {
    const dx = s16(sx - px);
    const dy = s16(sy - py);
    const d = octDist(dx, dy);
    if (d >= c.far)
        return null;
    return { d, lx: (dx * -e2 + dy * e0) >> 8, fw: (dx * e0 + dy * e2) >> 8 };
}
export function placedGainPan(place: Place | undefined | null, c: PlaceConstants | null): {
    gain: number;
    pan: number;
} {
    if (place === undefined || place === null || c === null)
        return { gain: 1, pan: 0 };
    const { d, lx, fw } = place;
    const a = d <= c.refDist ? 1 : c.refDist / d;
    const f = d <= c.fadeStart ? 1 : Math.max(0, (c.far - d) / (c.far - c.fadeStart));
    const r = 1 - (1 - c.rearGainPercent / 100) * (Math.max(0, -fw) / Math.max(d, 1));
    const p = (lx / Math.max(d, 1)) * (c.panMaxPercent / 100) * Math.min(1, d / c.refDist);
    return { gain: a * f * r, pan: Math.max(-1, Math.min(1, p)) };
}
export function placeFrom(v: unknown): Place | undefined {
    if (typeof v !== "object" || v === null)
        return undefined;
    const { d, lx, fw } = v as Record<string, unknown>;
    return typeof d === "number" && typeof lx === "number" && typeof fw === "number" ? { d, lx, fw } : undefined;
}

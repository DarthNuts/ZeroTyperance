import type { HydConstants } from "../../hydaca/constants.js";
import type { SpriteConstants } from "./constants.js";
import { frameCells } from "./frame.js";
import { evalGeometry } from "./items.js";
import { itemRow } from "./project.js";
import { shadingOf } from "./raster.js";
import type { ArtRef, SpriteAssets, SpriteRect } from "./types.js";
export interface PartOut {
    readonly art: ArtRef;
    readonly mirrored: boolean;
    readonly rect: SpriteRect;
}
export interface CellPartsEnv {
    readonly SC: SpriteConstants;
    readonly assets: SpriteAssets & {
        readonly nightArray?: string | null;
    };
    readonly phase: number | null;
    readonly hyd?: HydConstants;
    readonly mode: number;
    readonly night: boolean;
    readonly eye: number;
}
const NOTE = (_s: string): void => { };
export function cellParts(cls: number, S: number, sx: number, env: CellPartsEnv, corpseFrame: number): PartOut[] {
    const { SC, assets } = env;
    if (SC.NOT_SPECIFIED_CLASSES.includes(cls))
        return [];
    if (shadingOf(S, env.mode, assets, SC, NOTE, env.night).table === null)
        return [];
    const sy = itemRow(S, env.eye, SC);
    const comp = assets.composite(cls);
    if (comp !== null) {
        let stateNo = comp.state;
        let frameNo = comp.frame;
        const hyd = env.hyd;
        if (hyd !== undefined && cls === hyd.CORPSE_CLASS) {
            stateNo = hyd.CORPSE_ART_STATE;
            frameNo = corpseFrame;
        }
        const bank = assets.bank(comp.bank);
        const frame = bank?.states[stateNo]?.views[SC.COMPOSITE_VIEW]?.frames[frameNo];
        if (bank === null || frame === undefined)
            return [];
        return frameCells(bank, frame, S, sx, sy, SC, NOTE)
            .filter((c) => c.rect.h > 0 && c.rect.w > 0)
            .map((c) => ({ art: { bank: bank.name, slot: c.slot }, mirrored: c.mirrored, rect: c.rect }));
    }
    const entry = assets.item(cls);
    if (entry === null)
        return [];
    const flips = SC.FLIP_CLASSES.includes(cls);
    const blinks = SC.BLINK_CLASSES.includes(cls);
    const phase = (flips || blinks) && env.phase !== null ? env.phase : 0;
    const mirrored = flips && (phase & SC.FLIP_PHASE_BIT) !== 0;
    const indices = blinks ? [(phase & SC.BLINK_PHASE_BIT) !== 0 ? 1 : 0] : entry.arts.map((_, i) => i);
    const out: PartOut[] = [];
    for (const i of indices) {
        const a = entry.arts[i] ?? entry.arts[0];
        const g = entry.geometries[i] ?? entry.geometries[0];
        if (a === undefined || g === undefined)
            continue;
        if (assets.itemArt(a.slot) === null)
            continue;
        const rect = evalGeometry(g, S, sx, sy, SC, env.eye);
        if (rect.h > 0 && rect.w > 0)
            out.push({ art: { bank: null, slot: a.slot }, mirrored, rect });
    }
    return out;
}

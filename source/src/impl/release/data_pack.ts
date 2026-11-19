import type { TickFixtures } from "../boot/app/tick_bundle.js";
import { RELEASE_BUILD } from "./build_mode.js";
export const DATA_PACK_FORMAT = "zt-release-data/1";
export const RELEASE_PACK_FORMAT = `${DATA_PACK_FORMAT}+release`;
export const PAGE_PACK_FORMAT: string = RELEASE_BUILD ? RELEASE_PACK_FORMAT : DATA_PACK_FORMAT;
export const PACK_FIXTURE_TABLES: readonly string[] = [
    "character_loadouts.json", "demo_inputs.json", "enemy_descriptors.json", "items.json", "lcg.json", "password_codec.json",
    "password_floors.json", "sound_table.json", "trig_table.json",
];
export interface DataPack {
    readonly format: string;
    readonly files: Readonly<Record<string, unknown>>;
    readonly tick: TickFixtures;
}
export function dataPackFrom(doc: unknown, format: string = PAGE_PACK_FORMAT): DataPack {
    const d = doc as Partial<DataPack> | null;
    if (!d || d.format !== format || typeof d.files !== "object" || d.files === null || typeof d.tick !== "object" || d.tick === null) {
        throw new Error(`the data pack: not a ${format} document`);
    }
    return d as DataPack;
}
export function bareName(key: string): string {
    const base = key.slice(key.lastIndexOf("/") + 1);
    return base.endsWith(".json") ? base.slice(0, -5) : base;
}
export function packDoc(pack: DataPack, name: string): unknown {
    if (Object.prototype.hasOwnProperty.call(pack.files, name))
        return pack.files[name];
    for (const [k, v] of Object.entries(pack.files))
        if (bareName(k) === name)
            return v;
    return undefined;
}

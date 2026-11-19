import type { VectorNames } from "./constants.js";
const ENEMY_DESCRIPTORS_FORMAT = "zt-data/1";
const ENEMY_DESCRIPTORS_NAME = "enemy_descriptors";
const IN_USE_BIT = 1;
export interface EnemyKind {
    readonly type: string;
    readonly markerClass: number;
    readonly flags: number;
    readonly vectors: VectorNames;
    readonly hp: number;
    readonly z: number;
    readonly corpseClass: number;
    readonly sound: number;
    readonly art: string;
    readonly corpseVectors: VectorNames | null;
}
interface DescriptorRow {
    type?: unknown;
    corpse?: {
        vectors?: {
            ai?: unknown;
            draw?: unknown;
            damage?: unknown;
            death?: unknown;
        };
    };
    live?: {
        spawn_marker_class?: unknown;
        flags?: unknown;
        hp?: unknown;
        z?: unknown;
        corpse_tile_class?: unknown;
        spawn_sound_id?: unknown;
        vectors?: {
            ai?: unknown;
            draw?: unknown;
            damage?: unknown;
            death?: unknown;
        };
    };
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
export function enemyKindsFrom(doc: unknown): ReadonlyMap<number, EnemyKind> {
    const file = "enemy_descriptors.json";
    const d = doc as {
        format?: unknown;
        name?: unknown;
        data?: {
            types?: unknown;
        };
    } | null;
    if (!d || typeof d !== "object")
        throw new Error(`${file}: not an object`);
    if (d.format !== ENEMY_DESCRIPTORS_FORMAT)
        throw new Error(`${file}: format ${String(d.format)}, expected ${ENEMY_DESCRIPTORS_FORMAT}`);
    if (d.name !== ENEMY_DESCRIPTORS_NAME)
        throw new Error(`${file}: name ${String(d.name)}, expected ${ENEMY_DESCRIPTORS_NAME}`);
    const types = d.data?.types;
    if (!Array.isArray(types))
        throw new Error(`${file}: no data.types list`);
    const out = new Map<number, EnemyKind>();
    for (const row of types as DescriptorRow[]) {
        const l = row.live;
        if (typeof row.type !== "string" || !l)
            throw new Error(`${file}: a row without type or live record`);
        const v = l.vectors;
        if (!isInt(l.spawn_marker_class) || !isInt(l.flags) || !isInt(l.hp) || !isInt(l.z) || !isInt(l.corpse_tile_class) || !isInt(l.spawn_sound_id)) {
            throw new Error(`${file}: the live record of ${row.type} lacks an integer member (spawn_marker_class, flags, hp, z, corpse_tile_class, spawn_sound_id)`);
        }
        if (!v || typeof v.ai !== "string" || typeof v.draw !== "string" || typeof v.damage !== "string" || typeof v.death !== "string") {
            throw new Error(`${file}: the live record of ${row.type} lacks the four vector names`);
        }
        if (out.has(l.spawn_marker_class))
            throw new Error(`${file}: two rows share the marker class ${l.spawn_marker_class}`);
        const cv = row.corpse?.vectors;
        const corpseVectors = cv && typeof cv.ai === "string" && typeof cv.draw === "string" && typeof cv.damage === "string" && typeof cv.death === "string" ? Object.freeze({ ai: cv.ai, draw: cv.draw, damage: cv.damage, death: cv.death }) : null;
        out.set(l.spawn_marker_class, Object.freeze({
            type: row.type,
            markerClass: l.spawn_marker_class,
            flags: l.flags | IN_USE_BIT,
            vectors: Object.freeze({ ai: v.ai, draw: v.draw, damage: v.damage, death: v.death }),
            hp: l.hp,
            z: l.z,
            corpseClass: l.corpse_tile_class,
            sound: l.spawn_sound_id,
            art: `${row.type}.art`,
            corpseVectors,
        }));
    }
    return out;
}

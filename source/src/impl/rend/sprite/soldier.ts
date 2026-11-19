import type { SoldierConstants, SpriteConstants } from "./constants.js";
import { SOLDIER_KIND } from "./types.js";
import type { Camera, EntityPool, EntityRecord, SpawnResult, SpriteEvent } from "./types.js";
import type { EnemyKind } from "./kinds.js";
export function soldierSpawn(cellX: number, cellY: number, centre: {
    x: number;
    y: number;
}, floor: number, cam: Camera, pool: EntityPool, ES: SoldierConstants, SC: SpriteConstants, kind: EnemyKind | null = null): SpawnResult {
    let slot = 0;
    let at = 0;
    for (;;) {
        if (at < pool.records.length && pool.records[at].slot === slot) {
            slot++;
            at++;
        }
        else if (pool.occupied?.has(slot)) {
            slot++;
        }
        else
            break;
    }
    const art = kind === null && ((cellX ^ cellY) & ES.ALT_ART_PARITY_MASK) !== 0 ? "alt" : "main";
    const left = pool.residue?.(slot);
    const record: EntityRecord = {
        kind: kind === null ? SOLDIER_KIND : kind.type,
        slot,
        tag: slot + ES.TAG_OFFSET,
        form: "live",
        art,
        flags: kind === null ? ES.SPAWN_FLAGS : kind.flags,
        vec: kind === null ? { ...ES.SPAWN_VECTORS } : { ...kind.vectors },
        timer: ES.SPAWN_TIMER,
        pos: { x: centre.x, y: centre.y },
        z: kind === null ? ES.SPAWN_Z : kind.z,
        vel: left ? { x: left.vel.x, y: left.vel.y } : { x: 0, y: 0 },
        state: ES.SPAWN_STATE,
        counter: ES.SPAWN_COUNTER,
        hp: kind === null ? ES.SPAWN_HP : kind.hp,
        anim: left ? left.anim : 0,
        floor,
        home: { x: cam.cx, y: cam.cy },
        target: "player",
    };
    if (kind !== null)
        record.kindRow = kind;
    pool.records.splice(at, 0, record);
    const events: SpriteEvent[] = [
        { type: "Map.Write", floor, x: cellX, y: cellY, block: 0 },
        { type: "Audio.Request", request: kind === null ? ES.SPAWN_SOUND : kind.sound },
    ];
    return { record, events };
}
export interface DrawChoice {
    readonly bank: string;
    readonly state: number;
    readonly d2: number;
}
const AUTOMATIC = -1;
export function soldierDraw(rec: EntityRecord, phase: number | null, ES: SoldierConstants): DrawChoice {
    const bank = rec.art === "alt" ? ES.ART_ALT : ES.ART_MAIN;
    if (rec.vec.draw === ES.CORPSE_VECTORS.draw) {
        const base = rec.art === "main" ? ES.CORPSE_FRAMES[((phase ?? 0) + rec.tag) & ES.CORPSE_FRAME_MASK] : 0;
        const d2 = base + ((rec.counter & ES.CORPSE_COUNTER_BIT) !== 0 ? 1 : 0);
        return { bank, state: ES.CORPSE_POSE, d2 };
    }
    let state = ES.POSE_STAND;
    if (rec.state === ES.HURT_STATE)
        state = rec.hp < ES.HIT_HP_LIMIT ? ES.POSE_HIT : ES.POSE_HURT;
    else if (rec.state === ES.ATTACK_STATE)
        state = ES.ATTACK_POSES.get(rec.counter) ?? ES.ATTACK_POSE_OTHER;
    return { bank, state, d2: AUTOMATIC };
}
export function soldierCorpseForm(rec: EntityRecord, ES: SoldierConstants): void {
    rec.vec = { ...ES.CORPSE_VECTORS };
    rec.flags &= ES.CORPSE_FLAG_MASK;
    rec.state = ES.CORPSE_STATE;
    rec.vel = { x: 0, y: 0 };
    rec.form = "corpse";
}

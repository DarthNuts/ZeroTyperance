import type { Entity } from "../../domain.js";
import type { HydacaHidden, VectorName } from "../../world.js";
import type { SoldierBody } from "./common.js";
export interface CorpseVectors {
    readonly damage: string;
    readonly draw: string;
    readonly ai: string;
    readonly death: string;
}
let corpseVectors: CorpseVectors | null = null;
export function setCorpseVectors(v: CorpseVectors): void {
    corpseVectors = v;
}
export function soldierHidden(e: Entity): HydacaHidden {
    if (!e.hidden)
        throw new Error(`entity slot ${e.slot} of type ${e.type} carries no hidden group (world.schema.json requires it for enemy.rec1)`);
    if (e.hidden.bite_cooldown !== undefined)
        throw new Error(`entity slot ${e.slot} of type ${e.type} carries a bite_cooldown, which the soldier's hidden group has not (2.5)`);
    return e.hidden;
}
export function bodyOf(e: Entity): SoldierBody {
    const h = soldierHidden(e);
    return {
        pos: { x: e.pos.x, y: e.pos.y },
        vel: { x: e.vel.x, y: e.vel.y },
        state: e.state,
        counter: e.counter,
        timer: e.timer,
        hp: e.hp,
        flags: e.flags.value,
        form: e.form === "corpse" ? "corpse" : "live",
        hitMark: h.hit_mark,
        floor: e.floor,
        tag: e.tag,
        home: { x: h.waypoint.x, y: h.waypoint.y },
        target: h.target,
        cellsAround: h.cells_around,
    };
}
export function writeBody(e: Entity, b: SoldierBody): void {
    const h = soldierHidden(e);
    e.pos.x = b.pos.x;
    e.pos.y = b.pos.y;
    e.vel.x = b.vel.x;
    e.vel.y = b.vel.y;
    e.state = b.state;
    e.counter = b.counter;
    e.timer = b.timer;
    h.waypoint.x = b.home.x;
    h.waypoint.y = b.home.y;
    h.target = b.target;
    h.hit_mark = b.hitMark;
    e.hp = b.hp;
    e.flags.value = b.flags;
    e.flags.in_use = (b.flags & 1) !== 0;
    e.flags.on_floor = (b.flags & 4) !== 0;
    e.flags.alive = (b.flags & 16) !== 0;
    if (b.form === "corpse" && e.form !== "corpse") {
        const V = corpseVectors;
        if (V === null)
            throw new Error("writeBody: the corpse vectors are not registered (call setCorpseVectors with CORPSE_VECTORS of ent_soldier.json)");
        e.form = "corpse";
        e.vec.damage = V.damage as VectorName;
        e.vec.draw = V.draw as VectorName;
        e.vec.ai = V.ai as VectorName;
        e.vec.death = V.death as VectorName;
    }
}

import type { Entity } from "../../world.js";
import type { CellSource } from "../soldier/common.js";
import type { TickState } from "./core.js";
import { boss2Damage, boss2Pass, BOSS2_TYPE, isBoss2 } from "./boss2.js";
import { boss3Damage, boss3Pass, BOSS3_TYPE, isBoss3 } from "./boss3.js";
import { DOG_TYPE, dogDamage, dogPass, isDog } from "./dog.js";
import { IMP_TYPE, impDamage, impPass, isImp } from "./imp.js";
import { SERGEANT_TYPE, SF_TYPE, grenadeHit, grenadePass, isGrenade, isSfKind, sfDamage, sfPass } from "./sf.js";
export { isGrenade };
export function isDrawnKind(e: Entity): boolean {
    return (isDog(e) || isImp(e) || isSfKind(e) || isBoss2(e) || isBoss3(e)) && e.hidden !== undefined;
}
export function isKindRecord(e: Entity): boolean {
    return isDrawnKind(e) || isGrenade(e);
}
export function kindPass(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    if (isDog(e))
        dogPass(state, e, cells, notes);
    else if (isImp(e))
        impPass(state, e, cells, notes);
    else if (isGrenade(e))
        grenadePass(state, e, cells, notes);
    else if (isBoss2(e))
        boss2Pass(state, e, cells, notes);
    else if (isBoss3(e))
        boss3Pass(state, e, cells, notes);
    else
        sfPass(state, e, cells, notes);
}
export function kindDamage(state: TickState, e: Entity, d: number, dx: number, dy: number, mark: number, particles: boolean, notes: string[]): void {
    if (isDog(e))
        dogDamage(state, e, d, dx, dy, mark, particles);
    else if (isImp(e))
        impDamage(state, e, d, dx, dy, mark, particles);
    else if (isGrenade(e))
        grenadeHit(state, e, d, notes);
    else if (isBoss2(e))
        boss2Damage(state, e, d, dx, dy);
    else if (isBoss3(e))
        boss3Damage(state, e, d, dx, dy, particles);
    else
        sfDamage(state, e, d, dx, dy, mark, particles);
}
export function kindSpawnHidden(type: string, home: {
    readonly x: number;
    readonly y: number;
} | undefined): NonNullable<Entity["hidden"]> | null {
    if (type !== DOG_TYPE && type !== IMP_TYPE && type !== SF_TYPE && type !== SERGEANT_TYPE && type !== BOSS2_TYPE && type !== BOSS3_TYPE)
        return null;
    if (!home)
        throw new Error(`the creation of a ${type} carries no home point (its text's 4.1: the home point = V)`);
    const h: NonNullable<Entity["hidden"]> = { waypoint: { x: home.x, y: home.y }, hit_mark: 0, target: "player", cells_around: [] };
    if (type === DOG_TYPE)
        h.origin = { x: 0, y: 0 };
    if (type === SERGEANT_TYPE)
        h.change_timer = 0;
    if (type === BOSS3_TYPE)
        h.second_life = 0;
    return h;
}

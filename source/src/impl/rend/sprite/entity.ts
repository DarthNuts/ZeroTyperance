import { s16, s32, u16 } from "../arith.js";
import type { SoldierConstants, SpriteConstants } from "./constants.js";
import { drawFrame } from "./frame.js";
import { drawItemRecord } from "./items.js";
import { entityRow, projectEntity } from "./project.js";
import { beamShadingOf, shadingOf } from "./raster.js";
import { soldierDraw } from "./soldier.js";
import type { DrawChoice } from "./soldier.js";
import { guardDraw } from "./guard.js";
import { GUARD } from "../../guard/constants.js";
import { GUARD_KIND, SOLDIER_KIND, octagon } from "./types.js";
import { HYDACA_KIND, crabDraw } from "./hydaca.js";
import { IMPACT_DRAW_VECTOR, PARTICLE_DRAW_VECTOR } from "./constants.js";
import { FLAME_GROUND_DRAW_VECTOR, GIB_DRAW_VECTOR, drawFlameStream, drawGroundFlame, gibDraw, isFlameStream } from "./flame.js";
import { BOSS_KIND, SHOT_DRAW_VECTOR, bossDraw, drawShot } from "./boss.js";
import { CAMERA_DRAW_VECTOR, CAMERA_POP_DRAW_VECTOR, drawCamera, drawCameraPop } from "./camera.js";
import { MINE_BLAST_DRAW_VECTOR, MINE_PLACED_DRAW_VECTOR, drawBlast, drawMine } from "./mine.js";
import { GRENADE_DRAW_VECTOR, drawGrenade, kindDraw } from "./kind_poses.js";
import { drawImpact, drawParticle } from "./particle.js";
import type { BankState, EntityRecord, PassInputs } from "./types.js";
interface Kept {
    readonly rec: EntityRecord;
    readonly S: number;
    readonly column: number;
}
export class EntityHeap<T> {
    private readonly a: Array<{
        readonly key: number;
        readonly value: T;
    }> = [];
    get size(): number {
        return this.a.length;
    }
    insert(key: number, value: T): void {
        const a = this.a;
        const entry = { key: s16(key), value };
        let i = a.length;
        a.push(entry);
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (!(entry.key < a[p].key))
                break;
            a[i] = a[p];
            i = p;
        }
        a[i] = entry;
    }
    peekKey(): number | undefined {
        return this.a.length === 0 ? undefined : this.a[0].key;
    }
    extract(): T | undefined {
        const a = this.a;
        if (a.length === 0)
            return undefined;
        const root = a[0];
        const last = a.pop()!;
        const n = a.length;
        if (n > 0) {
            let i = 0;
            for (;;) {
                const l = 2 * i + 1;
                if (l >= n)
                    break;
                const r = l + 1;
                const c = r < n && a[r].key < a[l].key ? r : l;
                if (last.key <= a[c].key)
                    break;
                a[i] = a[c];
                i = c;
            }
            a[i] = last;
        }
        return root.value;
    }
}
export function heapOrder(scales: readonly number[]): number[] {
    const h = new EntityHeap<number>();
    scales.forEach((s, i) => h.insert(s, i));
    const out: number[] = [];
    for (let v = h.extract(); v !== undefined; v = h.extract())
        out.push(v);
    return out;
}
export function divsLow(a: number, b: number): number {
    const d = s16(b);
    if (d === 0)
        throw new Error("divs_low: a zero divisor (4.12.1: refused)");
    const q = Math.trunc(s32(a) / d);
    return q >= -32768 && q <= 32767 ? q : s16(a);
}
export interface Angle {
    readonly dot: number;
    readonly cross: number;
    readonly speed: number;
    readonly d3: number;
}
export function angleMeasure(rx: number, ry: number, vx: number, vy: number, SC: SpriteConstants): Angle {
    const dot = s32(rx * vx + ry * vy);
    const cross = s32(ry * vx - rx * vy);
    const dist = octagon(rx, ry) + SC.ENTITY_ANGLE_BIAS;
    const speed = octagon(vx, vy);
    const q1 = divsLow(dot, dist);
    const d3 = divsLow(s32(q1 << SC.ENTITY_ANGLE_SHIFT), speed + SC.ENTITY_ANGLE_BIAS);
    return { dot, cross, speed, d3 };
}
export function viewOf(viewMode: number, a: Angle, SC: SpriteConstants): number {
    const { dot, cross, d3 } = a;
    const pair = (first: number): number => (cross < 0 ? first : first + 1);
    if (viewMode === SC.ENTITY_MODE_SINGLE)
        return 0;
    if (viewMode === SC.ENTITY_MODE_PAIR)
        return dot < 0 ? 0 : 1;
    if (viewMode === SC.ENTITY_MODE_FOUR) {
        if (d3 >= SC.ENTITY_VIEW4_BACK)
            return 1;
        if (d3 <= SC.ENTITY_VIEW4_FRONT)
            return 0;
        return pair(2);
    }
    if (viewMode === SC.ENTITY_MODE_SIX) {
        if (d3 >= SC.ENTITY_VIEW6_BACK)
            return 1;
        if (d3 <= SC.ENTITY_VIEW6_FRONT)
            return 0;
        return d3 >= SC.ENTITY_VIEW6_SIDE_LOW ? pair(2) : pair(4);
    }
    if (d3 >= SC.ENTITY_VIEW8_BACK)
        return 1;
    if (d3 <= SC.ENTITY_VIEW8_FRONT)
        return 0;
    if (d3 < SC.ENTITY_VIEW8_SIDE_LOW)
        return pair(4);
    if (d3 <= SC.ENTITY_VIEW8_SIDE_HIGH)
        return pair(2);
    return pair(6);
}
export function frameOf(K: number, d2: number, speed: number, anim: number, animLut: ReadonlyArray<readonly number[]>, SC: SpriteConstants): {
    frame: number;
    anim: number;
} | null {
    if (d2 >= 0)
        return { frame: d2 <= K ? d2 : 0, anim };
    if (K === 0)
        return { frame: 0, anim };
    if (speed < SC.ENTITY_WALK_MIN_SPEED)
        return { frame: 0, anim };
    const next = u16(anim + speed);
    const row = animLut[K - 1];
    if (row === undefined)
        return null;
    const frame = row[(next >> SC.ENTITY_WALK_COLUMN_SHIFT) & SC.ENTITY_WALK_COLUMN_MASK];
    return frame === undefined ? null : { frame, anim: next };
}
const hydNoted = new WeakSet<object>();
function drawChoiceOf(rec: EntityRecord, phase: number | null, ES: SoldierConstants, inputs: PassInputs): DrawChoice | null {
    if (rec.choice !== undefined)
        return rec.choice;
    if (rec.kind === SOLDIER_KIND)
        return soldierDraw(rec, phase, ES);
    if (rec.kind === HYDACA_KIND) {
        const { ctx, camera, note } = inputs;
        if (ctx.hyd === undefined) {
            if (!hydNoted.has(note)) {
                hydNoted.add(note);
                note("the crab's records need the crab's constants (ZT-ENT-HYD 4.13); nothing drawn");
            }
            return null;
        }
        return crabDraw(rec, camera, ctx.hyd, ctx.draw, note);
    }
    if (rec.kind === GUARD_KIND)
        return guardDraw(rec, GUARD);
    if (rec.vec.draw === GIB_DRAW_VECTOR)
        return gibDraw(rec, phase, inputs);
    if (rec.kind === BOSS_KIND)
        return bossDraw(rec, inputs);
    return kindDraw(rec, inputs);
}
function keptEntities(inputs: PassInputs): Kept[] {
    const { ctx, camera } = inputs;
    const SC = ctx.SC;
    const out: Kept[] = [];
    for (const rec of ctx.pool.records) {
        if (rec.floor !== ctx.playerFloor)
            continue;
        if (octagon(s16(rec.pos.x - camera.cx), s16(rec.pos.y - camera.cy)) > SC.ENTITY_DISTANCE_MAX)
            continue;
        const p = projectEntity(rec.pos.x, rec.pos.y, camera, SC);
        if (p === null)
            continue;
        out.push({ rec, S: p.S, column: p.column });
    }
    return out;
}
function drawEntity(k: Kept, inputs: PassInputs): void {
    const { ctx, camera, surface, mode, note } = inputs;
    const { SC, ES, assets } = ctx;
    const rec = k.rec;
    if (rec.vec.draw === PARTICLE_DRAW_VECTOR) {
        drawParticle(rec, k.S, k.column, inputs);
        return;
    }
    if (rec.vec.draw === IMPACT_DRAW_VECTOR) {
        drawImpact(rec, k.S, k.column, inputs);
        return;
    }
    if (isFlameStream(rec)) {
        drawFlameStream(rec, k.S, k.column, inputs);
        return;
    }
    if (rec.vec.draw === FLAME_GROUND_DRAW_VECTOR) {
        drawGroundFlame(rec, k.S, k.column, inputs);
        return;
    }
    if (rec.vec.draw === SHOT_DRAW_VECTOR) {
        drawShot(rec, k.S, k.column, inputs);
        return;
    }
    if (rec.vec.draw === GRENADE_DRAW_VECTOR) {
        drawGrenade(rec, k.S, k.column, inputs);
        return;
    }
    if (rec.vec.draw === CAMERA_DRAW_VECTOR) {
        drawCamera(rec, k.S, k.column, inputs);
        return;
    }
    if (rec.vec.draw === CAMERA_POP_DRAW_VECTOR) {
        drawCameraPop(rec, k.S, k.column, inputs);
        return;
    }
    if (rec.vec.draw === MINE_PLACED_DRAW_VECTOR) {
        drawMine(rec, k.S, k.column, inputs);
        return;
    }
    if (rec.vec.draw === MINE_BLAST_DRAW_VECTOR) {
        drawBlast(rec, k.S, k.column, inputs);
        return;
    }
    if (rec.kind === SOLDIER_KIND && rec.form === "corpse" && rec.vec.draw !== ES.CORPSE_VECTORS.draw) {
        note(`entity slot ${rec.slot}: form corpse with the draw vector ${rec.vec.draw}: the draw vector decides (ZT-ENT-SOLDIER 2.2)`);
    }
    if (rec.kind === SOLDIER_KIND && ctx.phase === null && rec.vec.draw === ES.CORPSE_VECTORS.draw && rec.art === "main") {
        note(`entity slot ${rec.slot}: a main-art corpse needs the animation counter phase (ZT-ENT-SOLDIER 4.4); 0 used`);
    }
    const choice = drawChoiceOf(rec, ctx.phase, ES, inputs);
    if (choice === null) {
        note(`entity slot ${rec.slot}: kind ${rec.kind} has no draw routine here; skipped`);
        return;
    }
    const bank = assets.bank(choice.bank);
    if (bank === null) {
        note(`entity slot ${rec.slot}: bank ${choice.bank} is not in the assets; skipped`);
        return;
    }
    if (choice.state >= bank.states.length)
        return;
    const state: BankState = bank.states[choice.state];
    const S = k.S;
    let viewNumber = 0;
    let speed = 0;
    try {
        const rx = s16(rec.pos.x - camera.cx);
        const ry = s16(rec.pos.y - camera.cy);
        if (state.viewMode === SC.ENTITY_MODE_SINGLE) {
            speed = octagon(rec.vel.x, rec.vel.y);
        }
        else {
            const a = angleMeasure(rx, ry, rec.vel.x, rec.vel.y, SC);
            speed = a.speed;
            viewNumber = viewOf(state.viewMode, a, SC);
        }
    }
    catch (e) {
        note(`entity slot ${rec.slot}: ${(e as Error).message}; skipped`);
        return;
    }
    const view = state.views[viewNumber];
    if (view === undefined) {
        note(`entity slot ${rec.slot}: bank ${choice.bank} state ${choice.state} has no view ${viewNumber}; skipped`);
        return;
    }
    const f = frameOf(view.K, choice.d2, speed, rec.anim, assets.animLut, SC);
    if (f === null) {
        note(`entity slot ${rec.slot}: the walk table has no row ${view.K - 1} or no such column; skipped`);
        return;
    }
    rec.anim = f.anim;
    const frame = view.frames[f.frame];
    if (frame === undefined) {
        note(`entity slot ${rec.slot}: view ${viewNumber} of bank ${choice.bank} state ${choice.state} has no frame ${f.frame}; skipped`);
        return;
    }
    const sy = entityRow(S, rec.z, inputs.eye, SC);
    const shading = shadingOf(S, mode, assets, SC, note, inputs.nightVision === true);
    drawFrame(surface, bank, frame, S, k.column, sy, shading.table, shading.mirrored, SC, note, beamShadingOf(surface, assets, SC, note));
}
export function spritePass(inputs: PassInputs): void {
    const heap = new EntityHeap<Kept>();
    for (const k of keptEntities(inputs))
        heap.insert(k.S, k);
    const items = inputs.items;
    let i = items.length - 1;
    for (;;) {
        const nextKey = heap.peekKey();
        if (i < 0 && nextKey === undefined)
            break;
        if (nextKey !== undefined && (i < 0 || nextKey < s16(items[i].S))) {
            drawEntity(heap.extract()!, inputs);
        }
        else {
            drawItemRecord(items[i], inputs);
            i--;
        }
    }
}

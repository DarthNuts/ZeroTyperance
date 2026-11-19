import type { SniperConstants } from "./constants.js";
import { s16, u16, sar } from "../hydaca/arith.js";
export interface SniperState {
    active: boolean;
    fire: boolean;
    flash: number;
    aimed: boolean;
    anchorX: number;
    turnWord: number;
    offset: number;
    attacksLeft: number;
    tick: number;
    xLatch: number;
}
export interface SniperGates {
    readonly gate_1: number;
    readonly gate_2: number;
    readonly gate_3: number;
}
const GATE_ACTIVE = 255;
const GATE_FIRE = 1;
const SPRITE_X_MASK = 0x1ff;
const TILE_INDEX_MASK = 2047;
export function sniperStart(gates: SniperGates, angle: number, C: SniperConstants): SniperState {
    if (gates.gate_1 !== 0 || gates.gate_2 !== 0 || gates.gate_3 !== 0) {
        throw new Error(`snipers gates (${gates.gate_1}, ${gates.gate_2}, ${gates.gate_3}): a running attack's tick, offset and latch are not in the record (ZT-WORLD-SNIPER section 2)`);
    }
    return { active: false, fire: false, flash: 0, aimed: false, anchorX: C.FLASH_X, turnWord: turnWord(angle, C), offset: 0, attacksLeft: C.ATTACKS_START, tick: 0, xLatch: 0 };
}
export function sniperGates(s: SniperState): {
    gate_1: number;
    gate_2: number;
    gate_3: number;
} {
    return { gate_1: s.active ? GATE_ACTIVE : 0, gate_2: s.fire ? GATE_FIRE : 0, gate_3: s.flash };
}
export function sniperTriggerClass(cls: number, C: SniperConstants): boolean {
    return cls === C.CLASS_COVER || cls === C.CLASS_EXPOSED;
}
export function sniperTrigger(s: SniperState, cls: number, draw: () => number, C: SniperConstants): boolean {
    if (!sniperTriggerClass(cls, C))
        return false;
    if (s.active || s.attacksLeft <= 0)
        return false;
    s.active = true;
    s.tick = 0;
    s.fire = false;
    const seed = draw() >>> 0;
    s.offset = (seed >>> C.RAND_SHIFT) & C.RAND_MASK;
    return true;
}
export interface SniperIteration {
    readonly tick: number;
    readonly requests: number[];
    readonly hits: Array<{
        impulse: number;
        dx: number;
        dy: number;
    }>;
    readonly checks: Array<{
        cls: number;
        hit: boolean;
        covered: boolean;
    }>;
    readonly streak: {
        d1: number;
        d2: number;
    } | null;
    readonly ended: boolean;
}
export function sniperSequencer(s: SniperState, cls: number, eye: number, draw: () => number, C: SniperConstants): SniperIteration | null {
    if (!s.active)
        return null;
    s.tick = u16(s.tick + 1);
    const t = s.aimed ? C.FLASH_AIMED_TICK + 1 : s.tick;
    const out: SniperIteration = { tick: s.tick, requests: [], hits: [], checks: [], streak: null, ended: false };
    if (t === C.TICK_FIRE_ON)
        s.fire = true;
    if (t >= C.TICK_SOUND_FIRST && t <= C.TICK_SOUND_LAST)
        out.requests.push(C.SOUND_A, C.SOUND_B);
    if (t === C.TICK_CHECK_1 || t === C.TICK_CHECK_2)
        hitCheck(s, cls, eye, out, C);
    if (t === C.TICK_FIRE_OFF)
        s.fire = false;
    if (t === C.TICK_END_SHOT) {
        s.active = false;
        s.fire = false;
        s.attacksLeft -= 1;
        return { ...out, ended: true };
    }
    if (t === C.TICK_END) {
        s.active = false;
        s.tick = 0;
        s.fire = false;
        return { ...out, tick: 0, ended: true };
    }
    if (s.fire) {
        const seed = draw() >>> 0;
        const d1 = (seed >>> C.STREAK_D1_SHIFT) & C.STREAK_D1_MASK;
        const d2 = (seed >>> C.STREAK_D2_SHIFT) & C.STREAK_D2_MASK;
        return { ...out, streak: { d1, d2 } };
    }
    return out;
}
export function sniperBulletTest(s: SniperState, floor: number, cls: number, eye: number, a: number, C: SniperConstants): boolean {
    if (floor !== C.BULLET_FLOOR || !s.active)
        return false;
    if (!(cls === C.CLASS_EXPOSED || (cls === C.CLASS_COVER && s16(eye) >= C.BULLET_EYE_MIN)))
        return false;
    if (Math.abs(s16(2 * a + C.BULLET_AIM_OFFSET - s.xLatch)) > C.BULLET_AIM_WINDOW)
        return false;
    s.tick = C.SHOT_SET_TICK;
    return true;
}
function hitCheck(s: SniperState, cls: number, eye: number, out: SniperIteration, C: SniperConstants): void {
    let hit = false;
    let covered = false;
    if (cls === C.CLASS_EXPOSED)
        hit = true;
    else if (cls === C.CLASS_COVER) {
        covered = s16(eye) <= C.COVER_EYE;
        hit = !covered;
    }
    out.checks.push({ cls, hit, covered });
    if (hit)
        out.hits.push({ impulse: C.IMPULSE, dx: C.HIT_DX, dy: C.HIT_DY });
}
export interface SniperSprite {
    readonly xWord: number;
    readonly yWord: number;
    readonly wCells: number;
    readonly hCells: number;
    readonly tileWord: number;
    readonly kind: "shot" | "flash" | "figure";
}
export function sniperAzimuth(angle: number, y: number, C: SniperConstants): number {
    return u16(C.AZ_BASE - 2 * angle - sar(s16(y), C.AZ_Y_SHIFT)) & C.AZ_MASK;
}
export function sniperFigure(s: SniperState, angle: number, y: number, C: SniperConstants): SniperSprite | null {
    const d = sniperAzimuth(angle, y, C);
    if (d < 1 || d >= C.AZ_END)
        return null;
    if (!s.active) {
        s.xLatch = 0;
        return null;
    }
    s.xLatch = u16(d + C.FIGURE_X_OFFSET + s.offset);
    const tile = C.FIGURE_TILES[s.tick >> 1];
    if (tile === undefined)
        return null;
    return { xWord: s.xLatch & SPRITE_X_MASK, yWord: C.FIGURE_Y, wCells: 1, hCells: 1, tileWord: tile, kind: "figure" };
}
function turnWord(angle: number, C: SniperConstants): number {
    return -2 * angle & C.AZ_MASK;
}
export function sniperFlashTurn(s: SniperState, angle: number, C: SniperConstants): void {
    const w = turnWord(angle, C);
    const half = (C.AZ_MASK + 1) >> 1;
    const d = ((s.turnWord - w + half) & C.AZ_MASK) - half;
    s.turnWord = w;
    s.anchorX = u16(s.anchorX - (d >> 1) * C.FLASH_TURN_STEP);
}
export function sniperFlashArm(s: SniperState, C: SniperConstants): void {
    s.anchorX = C.FLASH_X;
    s.aimed = s.active && Math.abs(s16(s.xLatch - C.ROCKET_AIM_X)) < C.ROCKET_AIM_WINDOW;
    s.flash = s.aimed ? C.FLASH_FRAMES_AIMED : C.FLASH_FRAMES_UNAIMED;
}
function flashSprite(c: number, anchorX: number, C: SniperConstants): SniperSprite {
    const [dY, size, tile, dX] = C.FLASH_FRAMES[c & 7]!;
    return { xWord: (anchorX + dX!) & SPRITE_X_MASK, yWord: C.FLASH_Y + dY!, wCells: (size! >> 10) + 1, hCells: ((size! >> 8) & 3) + 1, tileWord: tile!, kind: "flash" };
}
export function sniperFlashStep(s: SniperState, C: SniperConstants): {
    readonly sprite: SniperSprite | null;
    readonly blast: boolean;
} {
    if (s.flash === 0)
        return { sprite: null, blast: false };
    if (s.aimed) {
        s.anchorX = u16(sar(s16(3 * s.anchorX + s.xLatch), 2));
        s.tick = C.FLASH_AIMED_TICK;
    }
    s.flash -= 1;
    const sprite = flashSprite(s.flash, s.anchorX, C);
    if (!s.aimed || s.flash !== C.FLASH_BLAST_COUNT)
        return { sprite, blast: false };
    s.attacksLeft = C.SHOT_ATTACKS_LEFT;
    s.tick = C.SHOT_SET_TICK;
    s.aimed = false;
    return { sprite, blast: true };
}
export function sniperLane(angleWord: number, C: SniperConstants): 1 | 2 | 3 | 4 {
    const a9 = u16(angleWord) & C.STREAK_ANGLE_MASK;
    if (a9 < C.STREAK_LANE_1_END || a9 >= C.STREAK_LANE_4_END)
        return 1;
    if (a9 < C.STREAK_LANE_2_END)
        return 2;
    if (a9 < C.STREAK_LANE_3_END)
        return 3;
    return 4;
}
export function sniperShotSprite(s: SniperState, streak: {
    d1: number;
    d2: number;
}, angleWord: number, angle: number, y: number, C: SniperConstants): SniperSprite {
    const lane = sniperLane(angleWord, C);
    const yWord = u16(streak.d1 + C.STREAK_Y_BASE);
    const xWord = u16(streak.d2 + C.STREAK_X_BASE);
    if (lane === 1 || lane === 3) {
        let tile = C.STREAK_TILE;
        if (streak.d1 < C.STREAK_D1_LOW)
            tile += C.STREAK_LOW_ADD;
        if (streak.d1 >= C.STREAK_D1_HIGH)
            tile += C.STREAK_HIGH_ADD;
        if (lane === 1)
            tile |= C.FLIP_H;
        const w = (C.STREAK_SIZE_WORD >> 10) + 1;
        const h = ((C.STREAK_SIZE_WORD >> 8) & 3) + 1;
        return { xWord, yWord, wCells: w, hCells: h, tileWord: u16(tile), kind: "shot" };
    }
    const base = lane === 2 ? C.AIM_BASE_A : C.AIM_BASE_B;
    const c = u16(base - 2 * angle - sar(s16(y), C.AZ_Y_SHIFT) + s.offset) & C.AZ_MASK;
    let tile = C.AIM_TILE + (yWord & 3);
    if (yWord >= C.AIM_ALT_Y_FIRST && yWord <= C.AIM_ALT_Y_LAST)
        tile = C.AIM_TILE_ALT;
    if (Math.abs(s16(xWord) - s16(c)) <= C.AIM_IMPACT_RANGE)
        tile = C.AIM_IMPACT_TILE;
    if (s16(yWord) <= C.AIM_VFLIP_Y)
        tile |= C.FLIP_V;
    if (s16(xWord) <= s16(c))
        tile |= C.FLIP_H;
    if (lane === 4)
        tile ^= C.AIM_FLIP_XOR;
    return { xWord, yWord, wCells: 1, hCells: 1, tileWord: u16(tile), kind: "shot" };
}
export function sniperBankTile(tileWord: number, C: SniperConstants): number {
    return (tileWord & TILE_INDEX_MASK) - (C.FIGURE_TILES[0]! & TILE_INDEX_MASK);
}

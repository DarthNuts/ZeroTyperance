import type { HitConstants } from "./constants.js";
import { cheatRules, drainAmount } from "../tick/cheats.js";
import { s16, u16, sar, octDist, divTrunc, mul16 } from "../hydaca/arith.js";
export interface HitPlayer {
    hp: number;
    knockbackX: number;
    knockbackY: number;
    jumpTimer: number;
    zVel: number;
    crouchCountdown: number;
    readonly eyeOffset: number;
    readonly character: number;
    vestSlot: number;
    readonly inventory: Array<{
        item: number;
        amount: number;
    }>;
    usedSlots: number;
    readonly deathCounter: number;
}
export interface HitHidden {
    flash: number;
    lastHp: number;
    messages: number[];
}
export interface HitCall {
    readonly impulse: number;
    readonly dx: number;
    readonly dy: number;
}
export function playerHit(p: HitPlayer, hidden: HitHidden, call: HitCall, C: HitConstants): void {
    if (p.deathCounter !== 0)
        return;
    const eye = s16(p.eyeOffset);
    let d = u16(call.impulse);
    if (eye > 0)
        d = d - sar(d, C.EYE_ABOVE_SHIFT);
    else if (eye < 0)
        d = d + sar(d, C.EYE_BELOW_SHIFT);
    if (d >= C.RANGE_LIMIT)
        return;
    const b = sar(d, C.BUCKET_SHIFT);
    const vest = s16(p.vestSlot) >= 0;
    let index: number;
    if (!vest) {
        let loss = C.LOSS_BASE - b;
        if (p.character === C.CHARACTER_QUARTER)
            loss = loss - sar(loss, C.QUARTER_SHIFT);
        else if (p.character === C.CHARACTER_HALF)
            loss = sar(loss, C.HALF_SHIFT);
        hidden.lastHp = p.hp;
        if (!cheatRules().c4)
            p.hp = s16(p.hp - loss);
        index = (((C.LOSS_BASE - loss) % C.TABLE_SIZE) + C.TABLE_SIZE) % C.TABLE_SIZE;
        const level = C.FLASH_BASE - sar(index, C.FLASH_SHIFT);
        if (u16(level) > u16(hidden.flash))
            hidden.flash = level;
    }
    else {
        index = b;
    }
    const seed = C.TABLE.JUMP_SEED[index]!;
    const m = C.TABLE.MUL[index]!;
    if (p.jumpTimer === 0 && eye === C.HOP_EYE)
        p.jumpTimer = seed;
    const div = s16(octDist(call.dx, call.dy) + 1);
    let kx = s16(divTrunc(mul16(call.dx, m), div));
    let ky = s16(divTrunc(mul16(call.dy, m), div));
    while (octDist(kx, ky) > C.KNOCK_LIMIT) {
        kx = sar(kx, C.KNOCK_HALVE_SHIFT);
        ky = sar(ky, C.KNOCK_HALVE_SHIFT);
    }
    p.knockbackX = kx;
    p.knockbackY = ky;
    if (seed >= C.Z_KICK_MIN_SEED) {
        p.zVel = C.Z_KICK_VEL;
        p.crouchCountdown = C.Z_KICK_COUNTDOWN;
    }
    const before = u16(hidden.lastHp);
    const after = u16(p.hp);
    let msg = -1;
    if (before > C.BANNER_HIGH) {
        if (after <= C.BANNER_HIGH)
            msg = 0;
    }
    else if (before > C.BANNER_LOW) {
        if (after <= C.BANNER_LOW)
            msg = 1;
    }
    if (msg >= 0 && hidden.messages.length < 16)
        hidden.messages.push(msg);
    if (vest) {
        const s = s16(p.vestSlot);
        const slot = p.inventory[s]!;
        if (slot.amount <= C.VEST_USED_UP) {
            slot.item = 0;
            slot.amount = 0;
            let next = -1;
            for (let i = 0; i < p.inventory.length; i++) {
                if (p.inventory[i]!.item === C.VEST_ITEM) {
                    next = i;
                    break;
                }
            }
            p.vestSlot = next;
            p.usedSlots -= 1;
        }
        else {
            slot.amount -= drainAmount(C.VEST_DRAIN, cheatRules().c5);
        }
    }
    else {
        if (p.hp < 0)
            p.hp = 0;
        else if (p.hp > C.HP_MAX)
            p.hp = C.HP_MAX;
    }
}

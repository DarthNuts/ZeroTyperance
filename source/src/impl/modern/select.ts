import type { Pad } from "../move/tape.js";
import { weaponOfItem } from "../weapon/core.js";
import { soundOfRequest } from "../weapon/constants.js";
import type { WeaponRequest, WeaponState } from "../weapon/core.js";
import type { WeaponConstants } from "../weapon/constants.js";
import type { ModernInput, ModernSelect } from "./canonical.js";
export type SelectionMode = "carousel" | "slots";
export function modernWeaponPad(i: ModernInput): Pad {
    return { up: i.move > 0, down: i.move < 0, left: i.strafe < 0, right: i.strafe > 0, a: false, b: i.fire !== 0, c: false };
}
export function weaponSelect(w: WeaponState, select: ModernSelect, mode: SelectionMode, C: WeaponConstants): WeaponRequest | null {
    if (select === "none")
        return null;
    if (select === "next" || select === "prev") {
        const pressTurnsShift = C.RING_RIGHT === 0;
        if ((select === "next") === pressTurnsShift)
            w.ring.push(w.ring.shift() as number);
        else
            w.ring.unshift(w.ring.pop() as number);
    }
    else {
        if (mode !== "slots")
            return null;
        const s = select - 1;
        const slot = w.inventory[s];
        if (s < 0 || s >= C.RING_SIZE || slot === undefined || slot.item === 0 || w.ring[0] === s)
            return null;
        for (let i = 0; i < C.RING_SIZE; i++)
            w.ring[i] = (s + i) % C.RING_SIZE;
    }
    w.pending = weaponOfItem(w.inventory[w.ring[0]!]!.item, C);
    const sound = soundOfRequest(C.REQ_SWITCH, C);
    return { request: sound.request, event: sound.event, id: sound.id, value: sound.value };
}

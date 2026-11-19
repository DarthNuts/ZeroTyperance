import { PAD_BIT } from "../tick/constants.js";
import type { ModernInput } from "./canonical.js";
import { MODERN_IDLE } from "./canonical.js";
import type { SelectionMode } from "./select.js";
export type TurnCapSetting = "original" | "fast";
export interface ModernDescriptor {
    readonly scheme: "modern";
    readonly turnCap: TurnCapSetting;
    readonly selection: SelectionMode;
    readonly input: ModernInput;
}
export interface ModernSeat {
    turnCap: TurnCapSetting;
    selection: SelectionMode;
    input: ModernInput;
    prev: ModernInput;
    skyWhole: boolean;
}
export function modernSeatOf(old: ModernSeat | undefined, d: ModernDescriptor): ModernSeat {
    return { turnCap: d.turnCap, selection: d.selection, input: d.input, prev: old?.prev ?? MODERN_IDLE, skyWhole: old?.skyWhole ?? false };
}
export function modernPadByte(i: ModernInput): number {
    const side = i.strafe !== 0 ? i.strafe : i.turn;
    return ((i.move > 0 ? 1 << PAD_BIT.UP : 0) | (i.move < 0 ? 1 << PAD_BIT.DOWN : 0) |
        (side < 0 ? 1 << PAD_BIT.LEFT : 0) | (side > 0 ? 1 << PAD_BIT.RIGHT : 0) |
        (i.fire ? 1 << PAD_BIT.B : 0) | (i.jump || i.crouch ? 1 << PAD_BIT.A : 0) | (i.start ? 1 << PAD_BIT.START : 0));
}

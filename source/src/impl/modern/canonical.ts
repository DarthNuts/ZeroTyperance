export type ModernSelect = "none" | "next" | "prev" | 1 | 2 | 3 | 4 | 5;
export interface ModernInput {
    readonly move: -1 | 0 | 1;
    readonly strafe: -1 | 0 | 1;
    readonly turn: -1 | 0 | 1;
    readonly mouse_turn: number;
    readonly jump: 0 | 1;
    readonly crouch: 0 | 1;
    readonly fire: 0 | 1;
    readonly start: 0 | 1;
    readonly select: ModernSelect;
}
export const MODERN_IDLE: ModernInput = Object.freeze({ move: 0, strafe: 0, turn: 0, mouse_turn: 0, jump: 0, crouch: 0, fire: 0, start: 0, select: "none" });
const B0 = Object.freeze({ FORWARD: 0, BACK: 1, STRAFE_LEFT: 2, STRAFE_RIGHT: 3, TURN_LEFT: 4, TURN_RIGHT: 5, JUMP: 6, CROUCH: 7 });
const B1 = Object.freeze({ FIRE: 0, START: 1, SELECT_SHIFT: 4 });
const SELECT_NEXT = 1;
const SELECT_PREV = 2;
const SELECT_SLOT_BASE = 3;
const SLOT_MAX = 5;
function selectCode(s: ModernSelect): number {
    if (s === "none")
        return 0;
    if (s === "next")
        return SELECT_NEXT;
    if (s === "prev")
        return SELECT_PREV;
    return SELECT_SLOT_BASE + s - 1;
}
function selectOfCode(c: number): ModernSelect {
    if (c === 0)
        return "none";
    if (c === SELECT_NEXT)
        return "next";
    if (c === SELECT_PREV)
        return "prev";
    const k = c - SELECT_SLOT_BASE + 1;
    if (k < 1 || k > SLOT_MAX)
        throw new Error(`modern input: select code ${c} is not 0 .. ${SELECT_SLOT_BASE + SLOT_MAX - 1}`);
    return k as ModernSelect;
}
export function encodeModernInput(i: ModernInput): [
    number,
    number,
    number
] {
    if (!Number.isInteger(i.mouse_turn) || i.mouse_turn < -128 || i.mouse_turn > 127)
        throw new Error(`modern input: mouse_turn ${i.mouse_turn} does not fit a signed byte`);
    const b0 = (i.move > 0 ? 1 << B0.FORWARD : 0) | (i.move < 0 ? 1 << B0.BACK : 0) |
        (i.strafe < 0 ? 1 << B0.STRAFE_LEFT : 0) | (i.strafe > 0 ? 1 << B0.STRAFE_RIGHT : 0) |
        (i.turn < 0 ? 1 << B0.TURN_LEFT : 0) | (i.turn > 0 ? 1 << B0.TURN_RIGHT : 0) |
        (i.jump ? 1 << B0.JUMP : 0) | (i.crouch ? 1 << B0.CROUCH : 0);
    const b1 = (i.fire ? 1 << B1.FIRE : 0) | (i.start ? 1 << B1.START : 0) | (selectCode(i.select) << B1.SELECT_SHIFT);
    return [b0, b1, i.mouse_turn & 0xff];
}
export function decodeModernInput(bytes: ArrayLike<number>): ModernInput {
    if (bytes.length !== 3)
        throw new Error(`modern input: ${bytes.length} bytes, expected 3`);
    const b0 = bytes[0]! & 0xff;
    const b1 = bytes[1]! & 0xff;
    const bit = (b: number, n: number): number => (b >> n) & 1;
    const axis = (neg: number, pos: number): -1 | 0 | 1 => (bit(b0, pos) - bit(b0, neg)) as -1 | 0 | 1;
    const m = bytes[2]! & 0xff;
    return {
        move: axis(B0.BACK, B0.FORWARD),
        strafe: axis(B0.STRAFE_LEFT, B0.STRAFE_RIGHT),
        turn: axis(B0.TURN_LEFT, B0.TURN_RIGHT),
        mouse_turn: m >= 0x80 ? m - 0x100 : m,
        jump: bit(b0, B0.JUMP) as 0 | 1,
        crouch: bit(b0, B0.CROUCH) as 0 | 1,
        fire: bit(b1, B1.FIRE) as 0 | 1,
        start: bit(b1, B1.START) as 0 | 1,
        select: selectOfCode(b1 >> B1.SELECT_SHIFT),
    };
}

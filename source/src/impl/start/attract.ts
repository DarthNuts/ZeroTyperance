import { draw } from "../hydaca/arith.js";
import type { Rng } from "../../rng.js";
import { ATTRACT, PICK_MASK, PICK_SHIFT } from "./constants.js";
export function attractPick(rng: Rng): number {
    const seed = draw(rng) >>> 0;
    return Math.floor(((seed >>> PICK_SHIFT) & PICK_MASK) / ATTRACT.PICK_DIVISOR);
}
export function attractCharacter(rng: Rng): number {
    const seed = draw(rng) >>> 0;
    return (seed & ATTRACT.CHARACTER_BIT) !== 0 ? ATTRACT.CHARACTER_SET : ATTRACT.CHARACTER_CLEAR;
}

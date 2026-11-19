import { s16, sar, u16, u8 } from "../hydaca/arith.js";
import { FRACTION_MAX } from "./common.js";
import type { SoldierConstants } from "../rend/sprite/constants.js";
export interface ParticleBody {
    pos: {
        x: number;
        y: number;
        z: number;
    };
    vel: {
        x: number;
        y: number;
        z: number;
    };
    state: number;
    counter: number;
    timer: number;
    readonly tag: number;
    readonly floor: number;
    secondary?: string;
}
export interface ParticleInputs {
    readonly phase: number;
    readonly live: number;
    readonly classAt: (x: number, y: number) => number;
}
export interface ParticleResult {
    readonly removed: boolean;
}
export function particleCall(p: ParticleBody, inputs: ParticleInputs, C: SoldierConstants): ParticleResult {
    const B = C.BURST;
    p.timer = 0;
    const fall = (): void => {
        if (p.pos.z === B.FLOOR_Z)
            return;
        p.pos.z = s16(p.pos.z + p.vel.z);
        if (p.pos.z > B.FLOOR_Z) {
            p.vel.z = s16(p.vel.z - B.GRAVITY);
        }
        else {
            p.pos.z = B.FLOOR_Z;
            p.vel.x = 0;
            p.vel.y = 0;
            p.state = 2;
            p.secondary = B.LANDING_SECONDARY.get(2) ?? p.secondary;
            p.counter = 0;
        }
    };
    if (p.state === 0) {
        if (p.vel.x === 0 && p.vel.y === 0) {
            fall();
            return { removed: false };
        }
        let fx = p.pos.x << B.FRACTION_SHIFT;
        let fy = p.pos.y << B.FRACTION_SHIFT;
        for (let i = 0; i < B.SUBSTEPS; i++) {
            const nx = fx + p.vel.x;
            const ny = fy + p.vel.y;
            const qx = u16(sar(nx, B.FRACTION_SHIFT));
            const qy = u16(sar(ny, B.FRACTION_SHIFT));
            let value = B.CELL_VALUE_TABLE.get(inputs.classAt(qx, qy)) ?? 0;
            const xf = qx & FRACTION_MAX;
            const yf = qy & FRACTION_MAX;
            if (value === 2)
                value = xf > yf ? 1 : 0;
            else if (value === 3)
                value = xf + yf > FRACTION_MAX ? 1 : 0;
            else if (value === 4)
                value = xf < yf ? 1 : 0;
            else if (value === 5)
                value = xf + yf < FRACTION_MAX ? 1 : 0;
            if (value === 0) {
                fx = nx;
                fy = ny;
                continue;
            }
            if (value >= B.KILL_CLASS)
                return { removed: true };
            p.pos.x = u16(sar(fx, B.FRACTION_SHIFT));
            p.pos.y = u16(sar(fy, B.FRACTION_SHIFT));
            p.vel.x = 0;
            p.vel.y = 0;
            p.vel.z = 0;
            p.state = 1;
            p.secondary = B.LANDING_SECONDARY.get(1) ?? p.secondary;
            p.counter = 0;
            return { removed: false };
        }
        p.pos.x = u16(sar(fx, B.FRACTION_SHIFT));
        p.pos.y = u16(sar(fy, B.FRACTION_SHIFT));
        p.vel.x = s16(p.vel.x - sar(p.vel.x, B.DRAG_SHIFT));
        p.vel.y = s16(p.vel.y - sar(p.vel.y, B.DRAG_SHIFT));
        fall();
        return { removed: false };
    }
    if (p.state === 1 || p.state === 2) {
        if ((u8(inputs.phase + p.tag) & B.DECAY_PHASE_MASK) === 0 && p.pos.z > B.DECAY_Z_FLOOR)
            p.pos.z -= 1;
        const sum = p.counter + sar(inputs.live + 1, B.ANIM_RATE_SHIFT);
        p.counter = u8(sum);
        if (sum > 255)
            return { removed: true };
    }
    return { removed: false };
}

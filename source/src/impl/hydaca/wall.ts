import type { HydConstants } from "./constants.js";
import type { Ctx } from "./common.js";
import { setFlagBits } from "./common.js";
import { classAtPos, s16, u16 } from "./arith.js";
import { newLeg, retargetStep } from "./leg.js";
import { moveWithCollision, pushOffAndMagnet } from "./move.js";
interface Dir {
    readonly x: -1 | 0 | 1;
    readonly y: -1 | 0 | 1;
}
interface WallRow {
    readonly probe: Dir;
    readonly run: Dir;
    readonly push: Dir;
}
const NORTH: Dir = { x: 0, y: -1 };
const SOUTH: Dir = { x: 0, y: 1 };
const EAST: Dir = { x: 1, y: 0 };
const WEST: Dir = { x: -1, y: 0 };
function wallRow(C: HydConstants, state: number): WallRow {
    switch (state) {
        case C.STATE_N_EAST: return { probe: NORTH, run: EAST, push: SOUTH };
        case C.STATE_N_WEST: return { probe: NORTH, run: WEST, push: SOUTH };
        case C.STATE_S_EAST: return { probe: SOUTH, run: EAST, push: NORTH };
        case C.STATE_S_WEST: return { probe: SOUTH, run: WEST, push: NORTH };
        case C.STATE_E_NORTH: return { probe: EAST, run: NORTH, push: WEST };
        case C.STATE_E_SOUTH: return { probe: EAST, run: SOUTH, push: WEST };
        case C.STATE_W_NORTH: return { probe: WEST, run: NORTH, push: EAST };
        case C.STATE_W_SOUTH: return { probe: WEST, run: SOUTH, push: EAST };
        default:
            throw new Error(`wallTick: state ${state} is not a wall state (${C.STATE_N_EAST}..${C.STATE_W_SOUTH})`);
    }
}
export function wallTick(ctx: Ctx): void {
    const { e, C } = ctx;
    const row = wallRow(C, e.state);
    const px = u16(ctx.start.x + row.probe.x * C.PROBE_REACH);
    const py = u16(ctx.start.y + row.probe.y * C.PROBE_REACH);
    if (classAtPos(ctx.view.map, px, py, C.ROW_STRIDE) !== C.GRAB_CLASS) {
        e.state = C.STATE_AIR;
        e.vel.x = s16(row.push.x * C.FALL_PUSH);
        e.vel.y = s16(row.push.y * C.FALL_PUSH);
        e.vel.z = 0;
        return;
    }
    moveWithCollision(ctx, row.run.x * C.WALL_RUN_SPEED, row.run.y * C.WALL_RUN_SPEED);
    setFlagBits(ctx, C.FLAG_MOVING_BITS);
    if (e.vel.z < 0) {
        e.pos.z = s16(e.pos.z + e.vel.z);
        if (e.pos.z > C.Z_FLOOR) {
            pushOffAndMagnet(ctx);
            retargetStep(ctx);
            return;
        }
        e.pos.z = C.Z_FLOOR;
        e.state = C.STATE_FLOOR;
        e.counter = 0;
        newLeg(ctx);
        return;
    }
    e.pos.z = s16(e.pos.z + e.vel.z);
    if (e.pos.z < C.Z_CEILING) {
        pushOffAndMagnet(ctx);
        retargetStep(ctx);
        return;
    }
    e.pos.z = C.Z_CEILING;
    e.state = C.STATE_CEILING;
    e.counter = 0;
    newLeg(ctx);
}

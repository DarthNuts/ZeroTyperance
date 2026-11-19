import type { HydConstants } from "./constants.js";
import { bits, clamp, classAtPos, draw, octDistBetween, s16, sar, u16, u8 } from "./arith.js";
import { clearFlagBits, combatHitPlayer, setFlagBits, soundRequest, targetPos } from "./common.js";
import type { Ctx } from "./common.js";
import { newLeg, retargetStep } from "./leg.js";
import { moveWithCollision } from "./move.js";
interface ProbeWindow {
    readonly side: "west" | "east" | "north" | "south";
    readonly contains: (fx: number, fy: number) => boolean;
    readonly dirX: number;
    readonly dirY: number;
    readonly along: "x" | "y";
    readonly stateAhead: number;
    readonly stateElse: number;
}
const windowsCache = new WeakMap<object, readonly ProbeWindow[]>();
function probeWindowsOf(C: HydConstants): readonly ProbeWindow[] {
    let w = windowsCache.get(C);
    if (!w) {
        w = buildWindows(C);
        windowsCache.set(C, w);
    }
    return w;
}
function buildWindows(C: HydConstants): readonly ProbeWindow[] {
    const inSpan = (v: number): boolean => v >= C.PROBE_SPAN_LOW && v <= C.PROBE_SPAN_HIGH;
    return [
        {
            side: "west",
            contains: (fx, fy) => fx <= C.PROBE_EDGE_LOW && inSpan(fy),
            dirX: -1,
            dirY: 0,
            along: "y",
            stateAhead: C.STATE_W_SOUTH,
            stateElse: C.STATE_W_NORTH,
        },
        {
            side: "east",
            contains: (fx, fy) => fx >= C.PROBE_EDGE_HIGH && inSpan(fy),
            dirX: 1,
            dirY: 0,
            along: "y",
            stateAhead: C.STATE_E_SOUTH,
            stateElse: C.STATE_E_NORTH,
        },
        {
            side: "north",
            contains: (fx, fy) => fy <= C.PROBE_EDGE_LOW && inSpan(fx),
            dirX: 0,
            dirY: -1,
            along: "x",
            stateAhead: C.STATE_N_EAST,
            stateElse: C.STATE_N_WEST,
        },
        {
            side: "south",
            contains: (fx, fy) => fy >= C.PROBE_EDGE_HIGH && inSpan(fx),
            dirX: 0,
            dirY: 1,
            along: "x",
            stateAhead: C.STATE_S_EAST,
            stateElse: C.STATE_S_WEST,
        },
    ];
}
function probeStep(ctx: Ctx): boolean {
    const C = ctx.C;
    const { e, h } = ctx;
    const fx = ctx.start.x % C.TILE;
    const fy = ctx.start.y % C.TILE;
    const win = probeWindowsOf(ctx.C).find((w) => w.contains(fx, fy));
    if (win === undefined)
        return false;
    const px = u16(ctx.start.x + win.dirX * C.PROBE_REACH);
    const py = u16(ctx.start.y + win.dirY * C.PROBE_REACH);
    if (classAtPos(ctx.view.map, px, py, C.ROW_STRIDE) !== C.GRAB_CLASS)
        return false;
    const R = draw(ctx.rng);
    if ((R & C.GRAB_MASK) !== 0)
        return false;
    const crab = win.along === "x" ? ctx.start.x : ctx.start.y;
    const wp = win.along === "x" ? h.waypoint.x : h.waypoint.y;
    e.state = s16(wp) > s16(crab) ? win.stateAhead : win.stateElse;
    const m = bits(R, C.CRAWL_SHIFT, C.CRAWL_MASK) + C.CRAWL_BASE;
    e.vel.z = e.pos.z >= 0 ? -m : m;
    return true;
}
function biteStep(ctx: Ctx): void {
    const C = ctx.C;
    const { e, h } = ctx;
    const t = targetPos(ctx);
    let d = octDistBetween(e.pos.x, e.pos.y, t.x, t.y);
    const targetClass = classAtPos(ctx.view.map, t.x, t.y, C.ROW_STRIDE);
    if (targetClass >= C.DIAGONAL_CLASS_MIN && targetClass <= C.DIAGONAL_CLASS_MAX)
        d >>>= 1;
    if (d > C.BITE_RANGE)
        return;
    const eye = ctx.view.player.eye_offset;
    let allowed: boolean;
    if (e.pos.z === C.Z_CEILING) {
        if (eye < 0) {
            e.state = C.STATE_AIR;
            e.vel.x = 0;
            e.vel.y = 0;
            e.vel.z = 0;
            return;
        }
        allowed = true;
    }
    else if (e.pos.z === C.Z_FLOOR) {
        allowed = !(eye > 0);
    }
    else {
        allowed = false;
    }
    if (allowed && h.bite_cooldown === 0) {
        h.bite_cooldown = C.BITE_COOLDOWN;
        soundRequest(ctx, C.BITE_SOUND);
        const relX = s16(e.pos.x - t.x);
        const relY = s16(e.pos.y - t.y);
        combatHitPlayer(ctx, C.BITE_IMPULSE, relX, relY);
    }
}
function chaseBody(ctx: Ctx): void {
    const C = ctx.C;
    const { e, h } = ctx;
    if (probeStep(ctx))
        return;
    const mvx = clamp(sar(s16(h.waypoint.x - e.pos.x), C.CHASE_SHIFT), -C.SPEED_MAX, C.SPEED_MAX);
    const mvy = clamp(sar(s16(h.waypoint.y - e.pos.y), C.CHASE_SHIFT), -C.SPEED_MAX, C.SPEED_MAX);
    moveWithCollision(ctx, mvx, mvy);
    biteStep(ctx);
    e.counter = u8(e.counter - 1);
    if (e.counter === 0) {
        newLeg(ctx);
    }
    else if (retargetStep(ctx)) {
        return;
    }
}
export function floorTick(ctx: Ctx): void {
    const C = ctx.C;
    const { e } = ctx;
    e.pos.z = C.Z_FLOOR;
    clearFlagBits(ctx, C.FLAG_FLOOR_BIT);
    setFlagBits(ctx, C.FLAG_FAR_BIT);
    const t = targetPos(ctx);
    if (octDistBetween(ctx.start.x, ctx.start.y, t.x, t.y) <= C.CLOSE_RANGE) {
        clearFlagBits(ctx, C.FLAG_FAR_BIT | C.FLAG_FLOOR_BIT);
    }
    chaseBody(ctx);
}
export function ceilingTick(ctx: Ctx): void {
    const C = ctx.C;
    const { e } = ctx;
    e.pos.z = C.Z_CEILING;
    clearFlagBits(ctx, C.FLAG_CEILING_BIT);
    setFlagBits(ctx, C.FLAG_FAR_BIT);
    const t = targetPos(ctx);
    if (octDistBetween(ctx.start.x, ctx.start.y, t.x, t.y) <= C.CLOSE_RANGE) {
        clearFlagBits(ctx, C.FLAG_FAR_BIT | C.FLAG_CEILING_BIT);
    }
    const R = draw(ctx.rng);
    if ((R & C.CEILING_DROP_MASK) === 0) {
        e.state = C.STATE_AIR;
        e.vel.x = 0;
        e.vel.y = 0;
        e.vel.z = 0;
        return;
    }
    chaseBody(ctx);
}

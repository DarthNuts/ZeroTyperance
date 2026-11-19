import { drawPose } from "../../hydaca/draw.js";
import type { HydConstants } from "../../hydaca/constants.js";
import type { DrawChoice } from "./soldier.js";
import type { Camera, EntityRecord } from "./types.js";
export const HYDACA_KIND = "enemy.rec3";
export function crabDraw(rec: EntityRecord, camera: Camera, hyd: HydConstants, draw: (() => number) | undefined, note: (s: string) => void): DrawChoice {
    const bank = rec.kindRow?.art ?? `${rec.kind}.art`;
    if (rec.form === "corpse") {
        let R = 0;
        if (draw === undefined)
            note(`entity slot ${rec.slot}: a crab corpse's picture needs the generator (ZT-ENT-HYD 4.15); R = 0 used`);
        else
            R = draw();
        const d2 = ((R & hyd.CORPSE_FRAME_MASK) !== 0 ? 1 : 0) + (rec.state === hyd.STATE_AIR ? 2 : 0) + ((rec.counter & 1) !== 0 ? 4 : 0);
        return { bank, state: hyd.CORPSE_ART_STATE, d2 };
    }
    const p = drawPose({ state: rec.state, pos: { x: rec.pos.x, y: rec.pos.y, z: rec.z }, vel: { z: rec.velZ ?? 0 }, hp: rec.hp }, { pos: { x: camera.cx, y: camera.cy } }, hyd);
    return { bank, state: p.pose, d2: p.variant };
}

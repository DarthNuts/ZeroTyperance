import type { HydConstants } from "./constants.js";
import { abs16, s16 } from "./arith.js";
export interface PoseSelf {
    state: number;
    pos: {
        x: number;
        y: number;
        z: number;
    };
    vel: {
        z: number;
    };
    hp: number;
}
export interface PoseCamera {
    pos: {
        x: number;
        y: number;
    };
}
export interface Pose {
    pose: number;
    variant: number;
}
type WallStateId = "STATE_N_EAST" | "STATE_N_WEST" | "STATE_S_EAST" | "STATE_S_WEST" | "STATE_E_NORTH" | "STATE_E_SOUTH" | "STATE_W_NORTH" | "STATE_W_SOUTH";
type Axis = "x" | "y";
type WallPoseId = "POSE_WALL_FRONT_A" | "POSE_WALL_FRONT_B" | "POSE_WALL_SIDE_A1" | "POSE_WALL_SIDE_A2" | "POSE_WALL_SIDE_B1" | "POSE_WALL_SIDE_B2";
interface WallRow {
    face: Axis;
    side: Axis;
    sense: "le" | "ge";
    poseIfTest: WallPoseId;
    otherwiseCmp: "gt" | "lt";
    poseIfCmp: WallPoseId;
    poseElse: WallPoseId;
}
const WALL_TABLE: Readonly<Record<WallStateId, WallRow>> = {
    STATE_N_EAST: { face: "y", side: "x", sense: "le", poseIfTest: "POSE_WALL_FRONT_A", otherwiseCmp: "gt", poseIfCmp: "POSE_WALL_SIDE_A1", poseElse: "POSE_WALL_SIDE_A2" },
    STATE_N_WEST: { face: "y", side: "x", sense: "le", poseIfTest: "POSE_WALL_FRONT_B", otherwiseCmp: "gt", poseIfCmp: "POSE_WALL_SIDE_B2", poseElse: "POSE_WALL_SIDE_B1" },
    STATE_S_EAST: { face: "y", side: "x", sense: "ge", poseIfTest: "POSE_WALL_FRONT_B", otherwiseCmp: "gt", poseIfCmp: "POSE_WALL_SIDE_B1", poseElse: "POSE_WALL_SIDE_B2" },
    STATE_S_WEST: { face: "y", side: "x", sense: "ge", poseIfTest: "POSE_WALL_FRONT_A", otherwiseCmp: "lt", poseIfCmp: "POSE_WALL_SIDE_A1", poseElse: "POSE_WALL_SIDE_A2" },
    STATE_E_NORTH: { face: "x", side: "y", sense: "ge", poseIfTest: "POSE_WALL_FRONT_B", otherwiseCmp: "lt", poseIfCmp: "POSE_WALL_SIDE_B1", poseElse: "POSE_WALL_SIDE_B2" },
    STATE_E_SOUTH: { face: "x", side: "y", sense: "ge", poseIfTest: "POSE_WALL_FRONT_A", otherwiseCmp: "gt", poseIfCmp: "POSE_WALL_SIDE_A1", poseElse: "POSE_WALL_SIDE_A2" },
    STATE_W_NORTH: { face: "x", side: "y", sense: "le", poseIfTest: "POSE_WALL_FRONT_A", otherwiseCmp: "lt", poseIfCmp: "POSE_WALL_SIDE_A1", poseElse: "POSE_WALL_SIDE_A2" },
    STATE_W_SOUTH: { face: "x", side: "y", sense: "le", poseIfTest: "POSE_WALL_FRONT_B", otherwiseCmp: "gt", poseIfCmp: "POSE_WALL_SIDE_B1", poseElse: "POSE_WALL_SIDE_B2" },
};
const WALL_STATE_IDS = Object.keys(WALL_TABLE) as WallStateId[];
const WALL_POSE_IDS: readonly WallPoseId[] = [
    "POSE_WALL_FRONT_A", "POSE_WALL_FRONT_B",
    "POSE_WALL_SIDE_A1", "POSE_WALL_SIDE_A2", "POSE_WALL_SIDE_B1", "POSE_WALL_SIDE_B2",
];
function assertWallPosesKnown(C: HydConstants): void {
    const known = new Set<number>(C.WALL_POSES);
    for (const id of WALL_POSE_IDS) {
        if (!known.has(C[id])) {
            throw new Error(`draw.ts: HYD.${id} = ${C[id]} is not in HYD.WALL_POSES [${C.WALL_POSES.join(", ")}]`);
        }
    }
}
const validated = new WeakSet<object>();
function wallRowOf(state: number, C: HydConstants): WallRow | undefined {
    for (const id of WALL_STATE_IDS) {
        if (C[id] === state)
            return WALL_TABLE[id];
    }
    return undefined;
}
function wallPose(row: WallRow, self: PoseSelf, player: PoseCamera, C: HydConstants): number {
    const cFace = s16(self.pos[row.face]);
    const pFace = s16(player.pos[row.face]);
    const cSide = s16(self.pos[row.side]);
    const pSide = s16(player.pos[row.side]);
    const a = abs16(cSide - pSide);
    let holds: boolean;
    if (row.sense === "le") {
        holds = cFace <= pFace && s16(a + cFace) < pFace;
    }
    else {
        holds = cFace >= pFace && s16(cFace - a) > pFace;
    }
    if (holds)
        return C[row.poseIfTest];
    const lateral = row.otherwiseCmp === "gt" ? cSide > pSide : cSide < pSide;
    return C[lateral ? row.poseIfCmp : row.poseElse];
}
export function drawPose(self: PoseSelf, player: PoseCamera, C: HydConstants): Pose {
    if (!validated.has(C)) {
        assertWallPosesKnown(C);
        validated.add(C);
    }
    const state = self.state;
    if (state === C.STATE_FLOOR)
        return { pose: C.POSE_FLOOR, variant: C.VARIANT_CYCLE };
    if (state === C.STATE_CEILING)
        return { pose: C.POSE_CEILING, variant: C.VARIANT_CYCLE };
    const row = wallRowOf(state, C);
    if (row !== undefined)
        return { pose: wallPose(row, self, player, C), variant: C.VARIANT_CYCLE };
    if (s16(self.vel.z) > 0)
        return { pose: C.POSE_HOP, variant: C.VARIANT_B };
    if (s16(self.hp) < 0) {
        return { pose: C.POSE_DYING, variant: s16(self.pos.z) > C.DYING_Z_SPLIT ? C.VARIANT_A : C.VARIANT_B };
    }
    return { pose: C.POSE_TUMBLE, variant: C.VARIANT_A };
}

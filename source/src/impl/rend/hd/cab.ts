import { rampWordFor } from "../core.js";
import type { Face } from "../core.js";
import type { RendConstants } from "../constants.js";
import type { ViewSnapshot } from "./snapshot.js";
export interface HdLiftClasses {
    readonly ARRIVE: readonly number[];
    readonly UP: readonly number[];
    readonly DOWN: readonly number[];
    readonly BOTH: readonly number[];
}
export interface CabWall {
    readonly cell: readonly [
        number,
        number
    ];
    readonly face: Face;
}
export interface Cab {
    readonly cx: number;
    readonly cy: number;
    readonly walls: readonly CabWall[];
    readonly arrive: readonly [
        number,
        number
    ] | null;
    readonly entrance: readonly [
        number,
        number,
        number,
        number
    ] | null;
}
export interface CabScene {
    readonly cabs: readonly Cab[];
    readonly riding: Cab | null;
    readonly b: number;
    readonly shift: number;
    readonly inside: boolean;
    shiftOf(cell: readonly [
        number,
        number
    ], face: Face): number;
    readonly liftClasses: ReadonlySet<number>;
}
const DIRS: ReadonlyArray<readonly [
    number,
    number
]> = [[0, -1], [0, 1], [-1, 0], [1, 0]];
export function cabSceneOf(snap: ViewSnapshot, R: RendConstants, lift: HdLiftClasses, faceOfNeighbour: (dx: number, dy: number) => Face, edgeOf: (dx: number, dy: number, X: number, Y: number, S: number) => readonly [
    number,
    number,
    number,
    number
], perE: number): CabScene {
    const m = snap.map;
    const side = m.side;
    const S = 1 << R.CELL_SHIFT;
    const cabClasses = new Set<number>([...lift.UP, ...lift.DOWN, ...lift.BOTH]);
    const arriveClasses = new Set<number>(lift.ARRIVE);
    const liftClasses = new Set<number>([...cabClasses, ...arriveClasses]);
    const clsAt = (x: number, y: number): number | null => (x < 0 || y < 0 || x >= side || y >= side ? null : m.cls[y * side + x]!);
    const cabs: Cab[] = [];
    for (let cy = 0; cy < side; cy++) {
        for (let cx = 0; cx < side; cx++) {
            if (!cabClasses.has(m.cls[cy * side + cx]!))
                continue;
            const walls: CabWall[] = [];
            let arrive: [
                number,
                number
            ] | null = null;
            let entrance: readonly [
                number,
                number,
                number,
                number
            ] | null = null;
            for (const [dx, dy] of DIRS) {
                const n = clsAt(cx + dx, cy + dy);
                if (n === null)
                    continue;
                if (n === R.RAMP.LIFT_CLASS)
                    walls.push({ cell: [cx + dx, cy + dy], face: faceOfNeighbour(dx, dy) });
                else if (arriveClasses.has(n) && arrive === null) {
                    arrive = [cx + dx, cy + dy];
                    entrance = edgeOf(dx, dy, S * cx, S * cy, S);
                }
            }
            cabs.push({ cx, cy, walls, arrive, entrance });
        }
    }
    const camCx = Math.floor(snap.cam.x / S);
    const camCy = Math.floor(snap.cam.y / S);
    const rampOf = new Map<string, number>();
    for (const r of snap.ramps)
        rampOf.set(`${r.cell[0]},${r.cell[1]},${r.face}`, r.hi);
    let riding: Cab | null = null;
    let b = 1;
    for (const c of cabs) {
        const inSquare = c.cx === camCx && c.cy === camCy;
        const inArrive = c.arrive !== null && c.arrive[0] === camCx && c.arrive[1] === camCy;
        if (!inSquare && !inArrive)
            continue;
        let bc: number | null = null;
        for (const w of c.walls) {
            const v = rampOf.get(`${w.cell[0]},${w.cell[1]},${w.face}`);
            if (v !== undefined) {
                bc = v;
                break;
            }
        }
        if (bc === null)
            bc = rampWordFor(R, R.RAMP.LIFT_CLASS, c.walls[0]?.face ?? (0 as Face), 0, 0, Math.round(snap.cam.slide))?.hi ?? 1;
        if (bc !== 1) {
            riding = c;
            b = bc;
        }
        break;
    }
    const shift = riding === null ? 0 : perE * (b - 1);
    const ridingWalls = new Set<string>(riding === null ? [] : riding.walls.map((w) => `${w.cell[0]},${w.cell[1]},${w.face}`));
    const inside = riding !== null && riding.cx === camCx && riding.cy === camCy;
    return {
        cabs, riding, b, shift, inside, liftClasses,
        shiftOf: (cell, face) => (ridingWalls.has(`${cell[0]},${cell[1]},${face}`) ? shift : 0),
    };
}
export function cabFloorZ(scene: CabScene, cab: Cab): number {
    return cab === scene.riding ? -scene.shift : 0;
}
export function rideLaneRow(rawR: number, horizon: number, hl: number, hw: number, cell: number): number | null {
    if (rawR >= horizon) {
        if (hw <= 0)
            return null;
        return horizon + ((rawR - horizon) * hl) / hw;
    }
    if (hw >= cell)
        return null;
    return horizon + ((rawR - horizon) * (cell - hl)) / (cell - hw);
}

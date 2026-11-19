export type SnapCell = readonly [
    number,
    number
] | null;
export interface SnapDoorEntry {
    readonly cell: SnapCell;
    readonly timer: number;
    readonly restore_block: number;
    readonly box_x: number;
    readonly box_y: number;
    readonly type: number;
}
export interface SnapFreeSlot {
    readonly slot: number;
    readonly anim: number;
    readonly art: string;
    readonly cell_class: {
        readonly alive: number;
        readonly dead: number;
    };
    readonly counter: number;
    readonly hp: number;
    readonly pos: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
    };
    readonly prev: {
        readonly x: number;
        readonly y: number;
    };
    readonly state: number;
    readonly vel: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
    };
}
export interface SnapController {
    readonly countdown: number;
    readonly mode: number;
    readonly tape_offset: number;
}
export interface SnapTileGroup {
    readonly counter: number;
    readonly offset: number;
    readonly phase: number;
}
export interface SnapTiles {
    readonly cursor: number;
    readonly g1: SnapTileGroup;
    readonly g2: SnapTileGroup;
    readonly g3: SnapTileGroup;
}
export interface SnapSnipers {
    readonly gate_1: number;
    readonly gate_2: number;
    readonly gate_3: number;
}
export interface SnapGuard {
    readonly slot: number;
    readonly waypoint: {
        readonly x: number;
        readonly y: number;
    };
    readonly target: "none" | "player" | "entity";
}
export interface SnapHiddenLine {
    readonly tick: number;
    readonly controller: SnapController;
    readonly core: {
        readonly delay_timer: number;
        readonly exit_countdown: number;
        readonly transition_flag: number;
    };
    readonly door_queue: readonly SnapDoorEntry[];
    readonly floor: {
        readonly counted_floor: number;
        readonly counted_markers: number;
    };
    readonly guards: readonly SnapGuard[];
    readonly flames?: readonly {
        readonly slot: number;
        readonly age: number;
    }[];
    readonly snipers: SnapSnipers;
    readonly tiles: SnapTiles;
    readonly hud: {
        readonly camera_cell: SnapCell;
        readonly camera_cell_prev: SnapCell;
    };
    readonly map: {
        readonly cells: readonly string[];
    };
    readonly player: {
        readonly crouch_countdown: number;
        readonly death_counter: number;
        readonly turn_vel: number;
    };
    readonly pool: {
        readonly free: readonly SnapFreeSlot[];
    };
    readonly render: {
        readonly lane_eye_prev: number;
    };
    readonly sky: {
        readonly column_index: number;
        readonly scroll_prev: number;
        readonly sub_pixel: number;
        readonly tile_counter: number;
    };
    readonly weapon: {
        readonly anim: number;
        readonly lowering: number;
        readonly ring: readonly number[];
        readonly variant: number;
    };
}

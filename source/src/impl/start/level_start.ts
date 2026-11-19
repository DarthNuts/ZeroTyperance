import type { CharacterName, EpisodeName, ItemName, Named, World, WeaponName } from "../../world.js";
import { CHARACTER_NAMES, EPISODE_NAMES, ITEM_NAMES, WEAPON_NAMES } from "../../world.js";
import { cheatRules } from "../tick/cheats.js";
import type { SnapHiddenLine, SnapTiles } from "../tick/snap_types.js";
import { CELL_SIZE, CHARACTER_BY_INDEX, DEMO_COUNT, EPISODE_BY_INDEX, GRID_SIDE, HEX_PER_BLOCK, PASSIVE_ABSENT, RING, ROUND, START, WEAPON_FISTS, WEAPON_NONE, } from "./constants.js";
import type { LevelStartInput, StartData, StartEvent, StartMaps, StartWorld } from "./types.js";
const PASSIVE_NAMES = ["bio_scanner", "bullet_proof_vest", "fire_proof_suit", "flash_light", "night_vision"] as const;
type PassiveName = (typeof PASSIVE_NAMES)[number];
const MOD16 = 0x10000;
function s16(v: number): number {
    const u = ((v % MOD16) + MOD16) % MOD16;
    return u >= MOD16 / 2 ? u - MOD16 : u;
}
function floorLayout(mapsDoc: unknown, floor: number): number[] {
    const d = mapsDoc as {
        floors?: Array<{
            index?: unknown;
            grid?: unknown;
        }>;
    } | null;
    const f = d?.floors?.find((x) => x.index === floor);
    if (!f || !Array.isArray(f.grid) || f.grid.length !== GRID_SIDE)
        throw new Error(`level start: the maps document has no 32-row grid of floor ${floor}`);
    const out: number[] = [];
    for (const row of f.grid as unknown[]) {
        if (!Array.isArray(row) || row.length !== GRID_SIDE)
            throw new Error(`level start: a grid row of floor ${floor} is not 32 block numbers`);
        for (const b of row) {
            if (typeof b !== "number" || !Number.isInteger(b))
                throw new Error("level start: a grid cell is not an integer");
            out.push(b);
        }
    }
    return out;
}
function hexRows(blocks: readonly number[]): string[] {
    const rows: string[] = [];
    for (let r = 0; r < GRID_SIDE; r++) {
        rows.push(blocks.slice(r * GRID_SIDE, (r + 1) * GRID_SIDE).map((b) => b.toString(16).padStart(HEX_PER_BLOCK, "0")).join(""));
    }
    return rows;
}
function itemName(data: StartData, id: number): ItemName {
    if (id === 0)
        return "empty";
    const n = data.items.get(id)?.name;
    return (ITEM_NAMES as readonly string[]).includes(n ?? "") ? (n as ItemName) : "unknown";
}
function weaponName(data: StartData, w: number): WeaponName {
    if (w === WEAPON_FISTS)
        return "fists";
    if (w === WEAPON_NONE)
        return "none";
    const n = data.items.get(w)?.name;
    return (WEAPON_NAMES as readonly string[]).includes(n ?? "") ? (n as WeaponName) : "unknown";
}
export function earlierFloorsOf(maps: StartMaps, floor: number, notes: string[]): Map<number, readonly number[]> {
    const out = new Map<number, readonly number[]>();
    const classOf = (b: number): number => maps.classOfBlock[b] ?? -1;
    const replacement = new Map<number, number>();
    for (const [from, to] of START.REWRITE) {
        let first = maps.classOfBlock.findIndex((c) => c === to);
        if (first < 0)
            first = 0;
        replacement.set(from, first);
    }
    for (let f = 0; f < floor; f++) {
        const cells = floorLayout(maps.mapsDoc, f).map((b) => replacement.get(classOf(b)) ?? b);
        out.set(f, cells);
        const left = cells.filter((b) => replacement.has(classOf(b))).length;
        if (left > 0)
            notes.push(`4.1a invariant FAILED: floor ${f} keeps ${left} cells of a replaced class`);
    }
    return out;
}
export function levelStartWorld(input: LevelStartInput, maps: StartMaps, data: StartData, weaponOfItem?: (item: number) => number): StartWorld {
    const notes: string[] = [];
    const episode = input.episode;
    const slotCount = RING.length;
    const password = input.kind === "password";
    const floor = password ? (input.floor ?? 0) : 0;
    const levelByte = password && input.level_byte !== undefined ? input.level_byte : 16 * episode;
    const blocks = floorLayout(maps.mapsDoc, floor);
    const classOf = (b: number): number => maps.classOfBlock[b] ?? -1;
    const earlierFloors = password ? earlierFloorsOf(maps, floor, notes) : new Map<number, readonly number[]>();
    let counted = 0;
    for (const b of blocks)
        if (START.COUNTED_CLASSES.includes(classOf(b)))
            counted++;
    const enemies = Math.min(counted, START.COUNT_CAP);
    let startIndex = blocks.findIndex((b) => classOf(b) === START.CLASS_START);
    if (startIndex < 0)
        startIndex = START.NO_START_CELL;
    const col = startIndex % GRID_SIDE;
    const row = Math.floor(startIndex / GRID_SIDE);
    const pos = { x: CELL_SIZE * col + START.CELL_CENTRE, y: CELL_SIZE * row + START.CELL_CENTRE };
    const itemIds: number[] = new Array<number>(slotCount).fill(0);
    const amounts: number[] = new Array<number>(slotCount).fill(0);
    const passive: Record<PassiveName, number> = {
        bio_scanner: PASSIVE_ABSENT, bullet_proof_vest: PASSIVE_ABSENT, fire_proof_suit: PASSIVE_ABSENT, flash_light: PASSIVE_ABSENT, night_vision: PASSIVE_ABSENT,
    };
    const weaponOf = (item: number): number => {
        if (item === 0)
            return WEAPON_FISTS;
        if (weaponOfItem)
            return weaponOfItem(item);
        const n = data.items.get(item)?.name;
        return (PASSIVE_NAMES as readonly string[]).includes(n ?? "") ? WEAPON_FISTS : item;
    };
    let pending = WEAPON_FISTS;
    const add = (item: number, amount: number): void => {
        const rec = data.items.get(item);
        if (!rec)
            throw new Error(`level start: item ${item} is not in items.json`);
        const capAmount = rec.cap * ROUND;
        let slot = itemIds.indexOf(item);
        if (slot >= 0) {
            amounts[slot] = Math.min(amounts[slot]! + amount, capAmount);
        }
        else {
            slot = itemIds.indexOf(0);
            if (slot < 0)
                return;
            itemIds[slot] = item;
            amounts[slot] = cheatRules().fix990 ? Math.min(amount, capAmount) : amount;
            const pname = rec.name as PassiveName;
            if ((PASSIVE_NAMES as readonly string[]).includes(pname) && passive[pname] === PASSIVE_ABSENT)
                passive[pname] = slot;
        }
        pending = weaponOf(itemIds[RING[0]!]!);
    };
    for (const c of input.carried.items) {
        const rec = data.items.get(c.item);
        if (!rec)
            throw new Error(`level start: carried item ${c.item} is not in items.json`);
        add(c.item, c.rounds === 0 ? rec.defaultGrant * ROUND : c.rounds * ROUND);
    }
    const loadout = data.loadouts[input.character];
    if (!loadout)
        throw new Error(`level start: no loadout row of character ${input.character}`);
    if (!(episode === START.SKIP_LOADOUT_EPISODE && floor === START.SKIP_LOADOUT_FLOOR))
        for (const l of loadout)
            add(l.item, l.amount);
    let seed: number;
    let tapeOffset = 0;
    if (input.controller_mode === 1) {
        const demo = data.demos.find((d) => d.episode === episode) ?? data.demos[episode];
        if (!demo)
            throw new Error(`level start: no demo block of episode ${episode}`);
        seed = demo.seed >>> 0;
        tapeOffset = START.READER_DEMO;
    }
    else {
        seed = parseInt(input.seed, 16) >>> 0;
    }
    const epName = EPISODE_BY_INDEX[episode] ?? "unknown";
    const episodeName = ((EPISODE_NAMES as readonly string[]).includes(epName) ? epName : "unknown") as EpisodeName;
    const chName = CHARACTER_BY_INDEX[input.character] ?? "unknown";
    const charName = ((CHARACTER_NAMES as readonly string[]).includes(chName) ? chName : "unknown") as CharacterName;
    const named = <N>(value: number, name: N): Named<N> => ({ value, name });
    const world: World = {
        schema: "world/1",
        core: { frame: input.frame, rng: { seed }, phase: input.carried.phase },
        options: structuredClone(input.carried.options) as World["options"],
        level: { episode: named(episode, episodeName), sub_id: floor, byte: levelByte },
        map: { floor },
        player: {
            pos,
            angle: 0,
            hp: input.carried.hp,
            eye_offset: 0,
            z_vel: 0,
            jump_timer: 0,
            knockback: { x: 0, y: 0 },
            speed: { forward: 0, side: 0 },
            bob_acc: input.carried.bob_acc,
            character: named(input.character, charName),
            weapon: { current: named(WEAPON_NONE, "none" as WeaponName), pending: named(pending, weaponName(data, pending)) },
            passive: { ...passive },
        },
        team: { alive: { ...input.carried.team_alive } as World["team"]["alive"] },
        floor: { secured: false, secured_phase: 0, enemies_remaining: enemies },
        intro: { camera: { angle: input.carried.intro_camera.angle, distance: input.carried.intro_camera.distance } },
        message: { voice_timer: s16(-input.setup_blanks) },
        link: { role: named(0, "single" as const), health: 0 },
        entity_pool: { count: 0, head_slot: null, walked: 0, chain: "ok" },
        entities: [],
        inventory: itemIds.map((id, slot) => ({ slot, item: named(id, itemName(data, id)), amount: amounts[slot]! })),
    };
    const hidden: SnapHiddenLine & {
        controller: {
            countdown: number;
            mode: number;
            tape_offset: number;
        };
        core: {
            delay_timer: number;
            exit_countdown: number;
            transition_flag: number;
        };
    } = {
        tick: 0,
        controller: { countdown: DEMO_COUNT, mode: input.controller_mode, tape_offset: tapeOffset },
        core: { delay_timer: 0, exit_countdown: 0, transition_flag: 0 },
        door_queue: [],
        floor: { counted_floor: floor, counted_markers: counted },
        guards: [],
        snipers: { ...input.carried.sniper_gates },
        tiles: structuredClone(input.carried.tile_pass) as SnapTiles,
        hud: { camera_cell: [col, row], camera_cell_prev: [col, row] },
        map: { cells: hexRows(blocks) },
        player: { crouch_countdown: 0, death_counter: 0, turn_vel: 0 },
        pool: { free: [] },
        render: { lane_eye_prev: 0 },
        sky: { column_index: 0, scroll_prev: 0, sub_pixel: 0, tile_counter: input.carried.sky_tile_counter },
        weapon: { anim: 0, lowering: START.LOWERING, ring: [...RING], variant: 0 },
    };
    const events: StartEvent[] = [{ type: "Audio.Music", id: episode }];
    notes.push("4.2: an empty slot's amount: written 0 (power-on reading); for next_episode the amounts of slots not re-filled are not given, 0 taken");
    notes.push("4.7 (draft 3): a carried item's add is min(old + given, cap * 256); a placed item keeps the given amount; no empty slot: dropped");
    if (password)
        notes.push("4.1 / 4.1a (draft 3): password game - start floor, level byte from the record; earlier floors rewritten (not in any record: model only)");
    notes.push("4.7: weapon names: a weapon's name is its item's record name (weapon numbers are item numbers), 0 'fists', 255 'none'");
    notes.push("4.9 / 2: world fields the text does not mention take the reset row: player.angle/speed/z_vel/jump_timer/eye_offset/knockback 0, entity_pool empty, link.role single");
    notes.push("4.1: the character and episode names come from the world schema's enumerations by index (episode 0 spaceship, 1 highrise, 2 basement; characters in the data file's order)");
    if (!weaponOfItem)
        notes.push("4.7: no weaponOfItem table given: a non-passive item's weapon has the item's id");
    return { world, hidden, events, notes, earlierFloors };
}

import type { LcgParams } from "../../rng.js";
import { LcgRng } from "../../rng.js";
import type { Entity, EntityTypeName, ItemName, VectorName, WeaponName, World } from "../../world.js";
import type { MoveConstants } from "../move/constants.js";
import { floorKindsOf } from "../move/floor_kinds.js";
import { moveStart, moveStep } from "../move/core.js";
import type { MoveState, ViewTable } from "../move/core.js";
import type { Pad } from "../move/tape.js";
import type { DoorConstants } from "../door/constants.js";
import { doorOpener, doorStart, doorWalker } from "../door/core.js";
import type { DoorState } from "../door/core.js";
import type { WeaponConstants } from "../weapon/constants.js";
import { padByte, weaponFloorOf, weaponPressC, weaponTick } from "../weapon/core.js";
import type { WeaponRequest } from "../weapon/core.js";
import { cheatRules } from "./cheats.js";
import type { ModernConstants } from "../modern/constants.js";
import type { ModernSeat } from "../modern/seat.js";
import { turnCapOf } from "../modern/move.js";
import { modernWeaponPad, weaponSelect } from "../modern/select.js";
import { isVoiceMessage, requestOfEffect, soundDriverLevelStart, soundRequest } from "./sound.js";
import type { SoundDriver, SoundEvent, SoundGates, SoundTable } from "./sound.js";
import type { WeaponState } from "../weapon/core.js";
import type { RendConstants } from "../rend/constants.js";
import type { RendAssets } from "../rend/assets.js";
import type { TrigTable } from "../rend/trig.js";
import { renderView } from "../rend/core.js";
import type { FloorMap, LightView } from "../rend/core.js";
import { floorDocFrom, floorMapFrom } from "../rend/floor_map.js";
import { animWallsClone, animWallsDefinitions, animWallsStart, animWallsStep, animatedDefinitions, floorSignWrite } from "./anim_walls.js";
import type { AnimWallState } from "./anim_walls.js";
import type { SoldierConstants, SpriteConstants } from "../rend/sprite/constants.js";
import { IMPACT_DRAW_VECTOR, PARTICLE_DRAW_VECTOR } from "../rend/sprite/constants.js";
import type { EntityPool, EntityRecord, SpriteAssets, SpriteContext } from "../rend/sprite/types.js";
import type { SkyConstants } from "../rend/sky/constants.js";
import { scrollOfAngle, skyRedrawWhole, skyStart, skyTick, vscrollOfFloor } from "../rend/sky/core.js";
import { finishSnapshot, snapshotObserver, snapshotSinkOf } from "../rend/hd/snapshot.js";
import { timedPart } from "../rend/hd/step_parts.js";
const SNAPSHOT_CITY_CLASS = "city";
import { twinkleCopy } from "../rend/sky/city.js";
import type { SkyAssets, SkyState } from "../rend/sky/core.js";
import { bodyOf, writeBody } from "../soldier/body.js";
import { soldierCall } from "../soldier/core.js";
import type { CellSource, SoldierEvent } from "../soldier/common.js";
import { moveIndex, OutsideSpecError } from "../soldier/common.js";
import { burstCount, damageEntry, particleOf, shotMagnitude, shotTarget } from "../soldier/damage.js";
import { particleCall } from "../soldier/particle.js";
import type { HitConstants } from "../player_hit/constants.js";
import { playerHit } from "../player_hit/core.js";
import type { HitHidden, HitPlayer } from "../player_hit/core.js";
import type { SniperConstants } from "../sniper/constants.js";
import { sniperBulletTest, sniperFigure, sniperFlashStep, sniperFlashTurn, sniperGates, sniperSequencer, sniperShotSprite, sniperStart, sniperTrigger } from "../sniper/core.js";
import type { SniperSprite, SniperState } from "../sniper/core.js";
import type { ItemsData, PickupConstants } from "../pickup/constants.js";
import { textOf, type MessageText } from "../pickup/constants.js";
import { PICKUP_TEXT, ammoLowMessage, endAnnouncement, floorMessageStep, healthMessage, itemMessage, messageStart, pickupAt, queueMessage } from "../pickup/core.js";
import type { PassiveRules } from "../pickup/core.js";
import type { LiftConstants } from "../lift/constants.js";
import { eyeOf, liftArrive, liftCellKind, liftEnter, liftStart, liftWalk, stairRoutine, switchText } from "../lift/core.js";
import type { LiftState } from "../lift/core.js";
import { weaponOfItem } from "../weapon/core.js";
import type { MessageState } from "../pickup/core.js";
import { draw, octDist } from "../hydaca/arith.js";
import { getPlaceConstants, placeOf } from "../coop/place.js";
import type { Place } from "../coop/place.js";
import { crabAi, corpseDamage as crabCorpseDamage, damageEntry as crabDamageEntry } from "../hydaca/core.js";
import { VECTORS as HYD_VECTORS } from "../hydaca/constants.js";
import type { HydConstants } from "../hydaca/constants.js";
import type { FlameConstants } from "../flame/constants.js";
import type { Boss2Constants, Boss3Constants, BossConstants } from "../boss/constants.js";
import type { MineConstants } from "../mine/constants.js";
import type { EntityAi, MapView, WorldView } from "../../domain.js";
import { CONTROLLER_MODE, FLAG_ALIVE, FLAG_IN_USE, FLAG_ON_FLOOR, FLOOR_CELLS, FLOOR_COUNT, GRID_SIDE, HEX_PER_BLOCK, PAD_BIT, RAY, TICK, TIMER_BITS, WINDOW_RADIUS, WINDOW_SIDE } from "./constants.js";
import type { EnemyKind } from "../rend/sprite/kinds.js";
import { GUARD_KIND } from "../rend/sprite/types.js";
import type { GuardConstants } from "./guard.js";
import { FLAME_GROUND_AI, flameAgeOf, flamePass, groundFlamesFromRecord, groundFlamesHidden, flameStreamsCreate, isFlameRecord, isGib, soldierGibDeath } from "./flame.js";
import { BOSS_ALIAS, BOSS_TYPE, bossDamage, bossPass, isBoss, isShot, shotPass } from "./boss.js";
import { isDrawnKind, isGrenade, isKindRecord, kindDamage, kindPass, kindSpawnHidden } from "./kinds.js";
import type { DogConstants, ImpConstants, SergeantConstants, SfConstants } from "../kinds/constants.js";
import { blastAgeOf, isMineRecord, minePass, placeMine } from "./mine.js";
import type { CameraConstants } from "../camera/constants.js";
import type { OrdnanceConstants } from "../ordnance/constants.js";
import type { ExtinguisherConstants } from "../extinguisher/constants.js";
import { CAMERA_AI, cameraEntityOf, cameraPass, isCameraRecord, popCamera } from "./camera.js";
import { isOrdnanceRecord, makeGrenade, makeRocket, ordnancePass, rocketHit } from "./ordnance.js";
import { EXT_AIM_CONE, burningCell, extinguisherCell } from "./extinguisher.js";
import type { HeldWeapons } from "../weapon/core.js";
import { fistsHit } from "./fists.js";
import type { LightConstants } from "./light.js";
import { swapSeat } from "./seats.js";
import { hurtSeat, partnerBody } from "./friendly.js";
import type { Seats } from "./seats.js";
import type { SnapFreeSlot, SnapGuard, SnapHiddenLine } from "./snap_types.js";
import { tilePass, tilePassStart } from "./tiles.js";
import type { TilePassState } from "./tiles.js";
import { GUARD } from "../guard/constants.js";
import { corpseDamage, guardCall, guardDamage } from "../guard/core.js";
import type { GuardBody } from "../guard/core.js";
import type { StartData } from "../start/types.js";
import type { ViewRecord } from "../rend/core.js";
import type { PauseConstants } from "../pause/constants.js";
import type { PauseAssets, PauseFrameRecord, PauseInputs } from "../pause/types.js";
import { pauseFrame, pauseFrameRecord, pauseOpen } from "../pause/core.js";
import type { PauseScreen } from "../pause/core.js";
import type { DeathConstants } from "../death/constants.js";
import { deathFlashAfter, deathFlashStep, deathTest } from "../death/constants.js";
import { carriedOf, markerCell, restartCell, restartItems } from "../death/core.js";
import { CharselCore } from "../charsel/core.js";
import type { CharselAssets } from "../charsel/assets.js";
import type { CharselConstants } from "../charsel/constants.js";
import { BriefingCore } from "../briefing/core.js";
import type { BriefingAssets } from "../briefing/assets.js";
import type { BriefingConstants } from "../briefing/constants.js";
import { encodePassword } from "../password/codec.js";
import type { PasswordCodecTables } from "../password/codec.js";
import { CHARACTER_BY_INDEX, RING, ROUND, START, START_SCREEN, WEAPON_NONE } from "../start/constants.js";
import { LevelStartScreen } from "../start/screen.js";
import type { EventSink, GameEvent } from "../../domain.js";
import { keptStart } from "./kept.js";
import type { KeptMem } from "./kept.js";
import { partnerPoolRecord, PARTNER_PICTURE_HOOK } from "./partner_figure.js";
import { PARTNER_PREFIX } from "../rend/sprite/partner.js";
import type { PartnerConstants } from "../rend/sprite/partner.js";
export class RefusedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RefusedError";
    }
}
export interface TickEnv {
    readonly M: MoveConstants;
    readonly view: ViewTable & TrigTable;
    readonly D: DoorConstants;
    readonly W: WeaponConstants;
    readonly R: RendConstants;
    readonly SPR: SpriteConstants;
    readonly ES: SoldierConstants;
    readonly spriteAssets: SpriteAssets;
    readonly rendAssets: RendAssets | null;
    readonly lcg: LcgParams;
    readonly sky: {
        readonly C: SkyConstants;
        readonly assets: SkyAssets;
    } | null;
    readonly mapsDoc: unknown;
    readonly classOfBlock: readonly number[];
    readonly levelCells: CellSource;
    readonly H: HitConstants;
    readonly itemCaps: ReadonlyMap<number, number>;
    readonly itemNames: ReadonlyMap<number, ItemName>;
    readonly P: PickupConstants;
    readonly items: ItemsData;
    readonly texts: ReadonlyMap<string, readonly string[]> | null;
    readonly L: LiftConstants;
    readonly G: GuardConstants;
    readonly LIGHT: LightConstants;
    readonly HYD: HydConstants;
    readonly FLAME: FlameConstants;
    readonly PARTNER?: PartnerConstants;
    readonly BOSS: BossConstants;
    readonly BOSS2: Boss2Constants;
    readonly BOSS3: Boss3Constants;
    readonly DOG: DogConstants;
    readonly IMP: ImpConstants;
    readonly SF: SfConstants;
    readonly SERGEANT: SergeantConstants;
    readonly MINE: MineConstants;
    readonly CAMERA: CameraConstants;
    readonly ORDNANCE: OrdnanceConstants;
    readonly EXT: ExtinguisherConstants;
    readonly start: StartData;
    readonly kinds: ReadonlyMap<number, EnemyKind>;
    readonly sounds: SoundTable;
    readonly pause: {
        readonly C: PauseConstants;
        readonly assets: PauseAssets;
    } | null;
    readonly death: DeathConstants;
    readonly sniper: SniperConstants;
    readonly charsel: {
        readonly C: CharselConstants;
        readonly assets: CharselAssets;
    } | null;
    readonly briefing: {
        readonly C: BriefingConstants;
        readonly assets: BriefingAssets;
    } | null;
    readonly passwordCodec?: PasswordCodecTables | null;
    readonly MODERN?: ModernConstants;
}
export interface PauseInterludeInputs {
    readonly kind: "pause";
    readonly pads: readonly number[];
    readonly entryBlanks: number;
    readonly exitBlanks: number;
    readonly floorEntries: readonly string[];
    readonly carriedEntry: string;
    readonly gameCram?: readonly number[];
}
export interface RestartPace {
    readonly offFirst: number;
    readonly onFrame: number;
}
export interface SelectInterludeInputs {
    readonly kind: "select";
    readonly pads: readonly number[];
    readonly entryBlanks: number;
    readonly exitBlanks: number;
    readonly restartSeed: number | null;
    readonly deathCellMark: number | null;
    readonly levelPalette?: (viewCram: readonly number[]) => readonly number[];
    readonly restartPace?: RestartPace;
}
export interface GameOverInterludeInputs {
    readonly kind: "game_over";
    readonly pads: readonly number[];
    readonly entryBlanks: number;
    readonly exitBlanks: number;
}
export type InterludeInputs = PauseInterludeInputs | SelectInterludeInputs | GameOverInterludeInputs;
export interface InterludeFrameRecord {
    readonly display: 0 | 1;
    readonly cram: readonly number[];
    readonly indices: Uint8Array | null;
}
export interface InterludeFrame {
    readonly frame: number;
    readonly record: InterludeFrameRecord | PauseFrameRecord;
    readonly events: readonly SoundEvent[];
}
export interface InterludeResult {
    readonly kind: "pause" | "select" | "game_over";
    readonly frames: readonly InterludeFrame[];
    readonly closed: boolean;
    readonly endFrame?: number;
}
export interface Residue {
    readonly pos: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
    };
    readonly prev: {
        readonly x: number;
        readonly y: number;
    };
    readonly vel: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
    };
    readonly state: number;
    readonly counter: number;
    readonly hp: number;
    readonly anim: number;
    readonly art: Entity["art"];
    readonly cell_class: {
        readonly alive: number;
        readonly dead: number;
    };
    readonly origin?: {
        readonly x: number;
        readonly y: number;
    };
}
function residueOf(e: Entity): Residue {
    return {
        pos: { x: e.pos.x, y: e.pos.y, z: e.pos.z },
        prev: { x: e.prev.x, y: e.prev.y },
        vel: { x: e.vel.x, y: e.vel.y, z: e.vel.z },
        state: e.state,
        counter: e.counter,
        hp: e.hp,
        anim: e.anim,
        art: e.art,
        cell_class: { alive: e.cell_class.alive, dead: e.cell_class.dead },
        ...(e.hidden?.origin ? { origin: { x: e.hidden.origin.x, y: e.hidden.origin.y } } : {}),
    };
}
export function guardHit(state: TickState, target: Entity, impulse: number, relx: number, rely: number, notes: string[]): void {
    const events: SoldierEvent[] = [];
    let gb: GuardBody;
    let peers: Array<{
        e: Entity;
        b: GuardBody;
    }>;
    try {
        gb = guardBodyOf(state, target);
        peers = guardPeers(state, target);
        guardDamage(gb, impulse, relx, rely, guardInputs(state, cellSourceOf(state)), peers.map((q) => q.b), state.rng, (ev) => events.push(ev), state.env.ES, GUARD);
    }
    catch (err) {
        if (!(err instanceof OutsideSpecError))
            throw err;
        notes.push(`guard slot ${target.slot}: ${err.message}: the damage entry is not applied`);
        return;
    }
    writeGuardBody(state, target, gb);
    for (const q of peers)
        writeGuardBody(state, q.e, q.b);
    applySoldierEvents(state, target, events, notes);
}
const LEVEL_BYTE_FLOOR_MASK = 0x0f;
const ZERO_RESIDUE: Residue = Object.freeze({ pos: { x: 0, y: 0, z: 0 }, prev: { x: 0, y: 0 }, vel: { x: 0, y: 0, z: 0 }, state: 0, counter: 0, hp: 0, anim: 0, art: "none" as Entity["art"], cell_class: { alive: 0, dead: 0 } });
function isZeroResidue(r: Residue): boolean {
    return r.pos.x === 0 && r.pos.y === 0 && r.pos.z === 0 && r.prev.x === 0 && r.prev.y === 0 && r.vel.x === 0 && r.vel.y === 0 && r.vel.z === 0 && r.state === 0 && r.counter === 0 && r.hp === 0 && r.anim === 0 && r.art === "none" && r.cell_class.alive === 0 && r.cell_class.dead === 0;
}
const BURST_TEXT = Object.freeze({
    TYPE: "unknown" as EntityTypeName,
    FORM: "unknown" as Entity["form"],
    STATE: 0,
    POOL_SLOTS: 64,
});
export interface TickController {
    mode: number;
    countdown: number;
    tapeOffset: number;
}
export interface TickHidden {
    paletteWrittenAtPickup?: boolean;
    exitCountdown: number;
    delayTimer: number;
    deathCounter: number;
    deathFlash: number;
    transitionFlag: number;
    controller: TickController;
    countedFloor: number;
    countedMarkers: number;
    tiles: TilePassState;
    sniper: SniperState;
    guards: Map<number, GuardHidden>;
    cameraCell: {
        x: number;
        y: number;
    };
    pickupStanding: boolean;
    laneEyePrev: number;
    lift: LiftState;
    viewDistance: number;
    beamFirst: number;
}
function floorViewDistance(env: TickEnv, floor: number): number {
    const mode = env.levelCells.renderMode(floor);
    return env.R.VIEW_DISTANCE_BY_MODE[mode > env.R.MODE_MAX ? 0 : mode]!;
}
function lightCarried(passive: {
    readonly flash_light: number;
    readonly night_vision: number;
}, LIGHT: LightConstants): boolean {
    return passive.flash_light !== LIGHT.ABSENT && passive.night_vision === LIGHT.ABSENT;
}
function nightCarried(passive: {
    readonly night_vision: number;
}, LIGHT: LightConstants): boolean {
    return passive.night_vision !== LIGHT.ABSENT;
}
function carriedViewDistance(env: TickEnv, passive: {
    readonly flash_light: number;
    readonly night_vision: number;
}, floor: number): number {
    if (nightCarried(passive, env.LIGHT))
        return env.R.NIGHT.VIEW_DISTANCE;
    return lightCarried(passive, env.LIGHT) ? env.R.LIGHT.VIEW_DISTANCE : floorViewDistance(env, floor);
}
function applyFloorConfiguration(state: TickState): void {
    const { env } = state;
    state.hidden.viewDistance = carriedViewDistance(env, state.world.player.passive, state.floorNumber);
}
function installPalette(state: TickState, night: boolean): void {
    const assets = state.env.rendAssets;
    if (assets === null || state.lastPicture === null)
        return;
    state.lastPicture = { ...state.lastPicture, cram: assets.cramOf(state.world.level.episode.value, night) };
}
function beamFirstOf(env: TickEnv, bobAngle: number): number {
    return env.R.LIGHT.BEAM_FIRST + env.R.LIGHT.BEAM_SWAY * bobAngle;
}
export interface GuardHidden {
    waypoint: {
        x: number;
        y: number;
    };
    target: SnapGuard["target"];
}
export interface TickState {
    readonly env: TickEnv;
    readonly world: World;
    liveParticlesRaised?: number;
    readonly blocks: number[];
    scannerBlocks?: number[];
    floorNumber: number;
    readonly player: MoveState;
    readonly weapon: WeaponState | null;
    readonly doors: DoorState;
    readonly sky: SkyState | null;
    readonly hidden: TickHidden;
    readonly rng: LcgRng;
    readonly notedKinds: Set<string>;
    readonly hit: HitHidden;
    display: DisplayWrites;
    readonly residue: Map<number, Residue>;
    readonly message: MessageState;
    sniperSprites: SniperSprite[];
    lastPicture: ViewRecord | null;
    lastPictureAngle?: number;
    lastPictureEye?: number;
    partnerAnim?: number;
    readonly sound: SoundDriver;
    readonly events: SoundEvent[];
    guardPairs: {
        readonly pairs: ReadonlyArray<readonly [
            number,
            number
        ]>;
        next: number;
        notes: string[];
    } | null;
    readonly animWalls: AnimWallState;
    readonly earlierFloors: Map<number, readonly number[]>;
    readonly floorEntries: string[];
    readonly kept: KeptMem;
    seats?: Seats;
    modern?: ModernSeat;
}
export interface TickCarry {
    readonly message: MessageState;
    readonly sound: SoundDriver;
    readonly animWalls?: AnimWallState;
    readonly lift?: LiftState;
    readonly sniper?: SniperState;
    readonly residue?: ReadonlyMap<number, Residue>;
    readonly footstepPhase?: number | null;
    readonly paletteWrittenAtPickup?: boolean;
    readonly floorEntries?: readonly string[];
    readonly kept?: KeptMem;
}
export interface IterationInputs {
    readonly pad: number;
    readonly prev: number;
    readonly vblanks: number;
    readonly flashFall?: number;
    readonly guards?: ReadonlyArray<readonly [
        number,
        number
    ]>;
    readonly interlude?: InterludeInputs;
}
export interface DisplayWrites {
    recount: boolean;
    hpRedraw: boolean;
    cardsChanged: number[];
    revealAdds: number[];
    flashEntry: number | null;
    message: {
        kind: "pop";
        rows: string[];
    } | {
        kind: "clear";
    } | null;
    floorSwitch: number | null;
}
function noDisplay(): DisplayWrites {
    return { recount: false, hpRedraw: false, cardsChanged: [], revealAdds: [], flashEntry: null, message: null, floorSwitch: null };
}
export interface IterationResult {
    readonly display: DisplayWrites;
    readonly notes: readonly string[];
    readonly draws: number;
    readonly pad: number;
    readonly ended: boolean;
    readonly bob?: {
        readonly angle: number;
        readonly eye: number;
    } | null;
    readonly bob1?: {
        readonly angle: number;
        readonly eye: number;
    } | null;
    readonly events: readonly SoundEvent[];
    readonly interlude: InterludeResult | null;
}
function u16(v: number): number {
    return v & 0xffff;
}
function s16(v: number): number {
    return (v << 16) >> 16;
}
function s8(v: number): number {
    return (v << (32 - TIMER_BITS)) >> (32 - TIMER_BITS);
}
export function padOfByte(byte: number): Pad {
    const bit = (b: number): boolean => ((byte >> b) & 1) !== 0;
    return { up: bit(PAD_BIT.UP), down: bit(PAD_BIT.DOWN), left: bit(PAD_BIT.LEFT), right: bit(PAD_BIT.RIGHT), a: bit(PAD_BIT.A), b: bit(PAD_BIT.B), c: bit(PAD_BIT.C) };
}
export function blocksOfHex(rows: readonly string[]): number[] {
    if (rows.length !== GRID_SIDE)
        throw new Error(`hidden map: ${rows.length} rows, expected ${GRID_SIDE}`);
    const out: number[] = [];
    for (const row of rows) {
        if (row.length !== GRID_SIDE * HEX_PER_BLOCK)
            throw new Error(`hidden map: a row of ${row.length} digits, expected ${GRID_SIDE * HEX_PER_BLOCK}`);
        for (let c = 0; c < GRID_SIDE; c++)
            out.push(parseInt(row.slice(c * HEX_PER_BLOCK, (c + 1) * HEX_PER_BLOCK), 16));
    }
    return out;
}
export function hexOfBlocks(blocks: readonly number[]): string[] {
    const rows: string[] = [];
    for (let r = 0; r < GRID_SIDE; r++)
        rows.push(blocks.slice(r * GRID_SIDE, (r + 1) * GRID_SIDE).map((b) => b.toString(16).padStart(HEX_PER_BLOCK, "0")).join(""));
    return rows;
}
export function cellSourceOf(state: TickState): CellSource {
    const env = state.env;
    return {
        block(flatIndex: number, floor: number): number {
            const global = floor * FLOOR_CELLS + flatIndex;
            if (global < 0 || global >= FLOOR_COUNT * FLOOR_CELLS)
                throw new OutsideSpecError(`cell ${flatIndex} of floor ${floor} lies outside the floors' storage`);
            const f = Math.floor(global / FLOOR_CELLS);
            const i = global - f * FLOOR_CELLS;
            if (f === state.floorNumber)
                return state.blocks[i]!;
            const rewritten = state.earlierFloors.get(f);
            if (rewritten !== undefined)
                return rewritten[i]!;
            return env.levelCells.block(i, f);
        },
        classOf: (block) => env.levelCells.classOf(block),
        renderMode: (floor) => env.levelCells.renderMode(floor),
        markerBlock: (cls) => env.levelCells.markerBlock(cls),
    };
}
function windowAround(state: TickState, e: Entity): (number | null)[] {
    const cells = cellSourceOf(state);
    const own = moveIndex(e.pos.x, e.pos.y);
    const out: (number | null)[] = [];
    for (let dy = -WINDOW_RADIUS; dy <= WINDOW_RADIUS; dy++) {
        for (let dx = -WINDOW_RADIUS; dx <= WINDOW_RADIUS; dx++) {
            const i = own + dy * GRID_SIDE + dx;
            try {
                out.push(cells.block(i, e.floor));
            }
            catch (err) {
                if (err instanceof OutsideSpecError)
                    out.push(null);
                else
                    throw err;
            }
        }
    }
    if (out.length !== WINDOW_SIDE * WINDOW_SIDE)
        throw new Error("the window is not 5 x 5");
    return out;
}
function classesOf(state: TickState): number[] {
    return state.blocks.map((b) => state.env.classOfBlock[b] ?? -1);
}
const WEAPON_NAME_IDS = ["NONE", "W_FISTS", "W_MINE", "W_HANDGUN", "W_LASER", "W_SHOTGUN", "W_PULSE"] as const;
const WEAPON_NAMES_OF_ID: Record<(typeof WEAPON_NAME_IDS)[number], WeaponName> = {
    NONE: "none", W_FISTS: "fists", W_MINE: "mine", W_HANDGUN: "handgun", W_LASER: "laser_aimed_gun", W_SHOTGUN: "shotgun", W_PULSE: "pulse_laser",
};
function weaponNameOf(value: number, before: {
    value: number;
    name: WeaponName;
}, W: WeaponConstants, items: ReadonlyMap<number, ItemName>): WeaponName {
    for (const id of WEAPON_NAME_IDS)
        if (W[id] === value)
            return WEAPON_NAMES_OF_ID[id];
    if (before.value === value)
        return before.name;
    return (items.get(value) ?? "unknown") as WeaponName;
}
function weaponStateOf(world: World, hidden: SnapHiddenLine, prevPad: number, W: WeaponConstants, LIGHT: LightConstants, notes: string[]): WeaponState | null {
    const inventory = world.inventory.map((s) => ({ item: s.item.value, amount: s.amount }));
    for (const s of inventory) {
        if (W.DRAIN_ITEMS_UNMODELLED.includes(s.item) && s.item !== LIGHT.ITEM && s.item !== LIGHT.NIGHT_VISION_ITEM) {
            notes.push(`the inventory holds item ${s.item}, whose drain is not modelled (ZT-PLAYER-WEAPON 4.9): the weapon block is not run`);
            return null;
        }
    }
    return {
        current: world.player.weapon.current.value,
        pending: world.player.weapon.pending.value,
        lowering: hidden.weapon.lowering,
        anim: hidden.weapon.anim,
        variant: hidden.weapon.variant,
        slots: inventory.filter((s) => s.item !== 0).length,
        ring: [...hidden.weapon.ring],
        inventory,
        bEdge: false,
        cEdge: false,
        prevPad: padByte(padOfByte(prevPad), W),
        scannerSlot: world.player.passive.bio_scanner === LIGHT.ABSENT ? -1 : world.player.passive.bio_scanner,
    };
}
function recordBobAngle(env: TickEnv, p: {
    readonly speed: {
        readonly forward: number;
        readonly side: number;
    };
    readonly bob_acc: number;
}): number {
    if (Math.abs(p.speed.forward) + Math.abs(p.speed.side) < env.M.BOB.MIN_SPEED)
        return 0;
    const table = env.R.SNAP.BOB_TABLE;
    const n = table.length;
    return table[(((p.bob_acc >> env.M.BOB.INDEX_SHIFT) % n) + n) % n]![1];
}
export function tickStart(env: TickEnv, record: World, hidden: SnapHiddenLine, prevPad: number, notes: string[], carry: TickCarry | null = null, earlierFloors: ReadonlyMap<number, readonly number[]> = new Map()): TickState {
    const world = structuredClone(record);
    refuseRecord(world, hidden, carry);
    const floorNumber = world.level.sub_id;
    const blocks = blocksOfHex(hidden.map.cells);
    const p = world.player;
    const player = moveStart(p.pos.x, p.pos.y, p.character.value, env.M);
    player.angle = p.angle;
    player.forward = p.speed.forward;
    player.side = p.speed.side;
    player.eyeOffset = p.eye_offset;
    player.jumpTimer = p.jump_timer;
    player.zVel = p.z_vel;
    player.bobAcc = p.bob_acc;
    player.knockbackX = p.knockback.x;
    player.knockbackY = p.knockback.y;
    player.turnVel = hidden.player.turn_vel;
    player.crouchCountdown = hidden.player.crouch_countdown;
    player.lastFootstepPhase = carry && carry.footstepPhase !== undefined ? carry.footstepPhase : world.core.phase === 0 ? null : Math.floor(p.bob_acc / env.M.FOOTSTEP.PERIOD) & 1;
    const prev = padOfByte(prevPad);
    player.prevA = prev.a;
    player.prevUp = prev.up;
    const doors = doorStart({ width: GRID_SIDE, cellSize: env.M.POS.CELL, blocks, classOfBlock: env.classOfBlock });
    for (const e of hidden.door_queue) {
        if (e.cell === null) {
            notes.push("hidden door_queue: an entry pointing at no cell of this floor is outside ZT-WORLD-DOOR; left out");
            continue;
        }
        doors.queue.push({ cell: [e.cell[0], e.cell[1]], floor: floorNumber, timer: e.timer, restoreBlock: e.restore_block, type: e.type, playerIn: false, entityIn: false });
    }
    let sky: SkyState | null = null;
    if (env.sky) {
        sky = skyStart(env.sky.assets, env.sky.C);
        sky.prevScroll = scrollOfAngle(p.angle, env.sky.C);
        sky.accumulator = hidden.sky.tile_counter;
        sky.columnOffset = hidden.sky.column_index;
    }
    const state: TickState = {
        env,
        world,
        blocks,
        floorNumber,
        player,
        weapon: weaponStateOf(world, hidden, prevPad, env.W, env.LIGHT, notes),
        doors,
        sky,
        hidden: {
            paletteWrittenAtPickup: carry?.paletteWrittenAtPickup === true,
            exitCountdown: hidden.core.exit_countdown,
            delayTimer: hidden.core.delay_timer,
            deathCounter: hidden.player.death_counter,
            deathFlash: hidden.player.death_counter >= 1 ? deathFlashAfter(hidden.player.death_counter - 1, env.death) : 0,
            transitionFlag: hidden.core.transition_flag,
            controller: { mode: hidden.controller.mode, countdown: hidden.controller.countdown, tapeOffset: hidden.controller.tape_offset },
            countedFloor: hidden.floor.counted_floor,
            countedMarkers: hidden.floor.counted_markers,
            tiles: tilePassStart(hidden.tiles),
            sniper: carry?.sniper ? { ...carry.sniper } : sniperStart(hidden.snipers, record.player.angle, env.sniper),
            guards: new Map<number, GuardHidden>(),
            cameraCell: hidden.hud.camera_cell ? { x: hidden.hud.camera_cell[0], y: hidden.hud.camera_cell[1] } : { x: u16(p.pos.x) >> env.R.CELL_SHIFT, y: u16(p.pos.y) >> env.R.CELL_SHIFT },
            pickupStanding: false,
            laneEyePrev: hidden.render?.lane_eye_prev ?? 0,
            lift: carry?.lift ? { ...carry.lift } : liftStart(),
            viewDistance: carriedViewDistance(env, p.passive, floorNumber),
            beamFirst: beamFirstOf(env, recordBobAngle(env, p)),
        },
        rng: new LcgRng(world.core.rng.seed, env.lcg),
        notedKinds: new Set<string>(),
        hit: { flash: 0, lastHp: p.hp, messages: [] },
        display: noDisplay(),
        residue: new Map<number, Residue>(),
        message: carry ? structuredClone(carry.message) : messageStart(),
        sniperSprites: [],
        lastPicture: null,
        guardPairs: null,
        sound: carry ? structuredClone(carry.sound) : soundDriverLevelStart(),
        events: [],
        animWalls: carry?.animWalls ? animWallsClone(carry.animWalls) : animWallsStart(env.mapsDoc),
        earlierFloors: new Map(Array.from(earlierFloors, ([f, cells]) => [f, [...cells]] as const)),
        floorEntries: Array.from({ length: FLOOR_COUNT }, (_, f) => carry?.floorEntries?.[f] ?? ""),
        kept: carry?.kept ?? keptStart(),
    };
    floorSignWrite(state.animWalls, state.floorNumber, env.L.SIGN);
    const inChain = new Set(world.entities.map((e) => e.slot));
    for (const f of hidden.pool.free) {
        if (inChain.has(f.slot)) {
            notes.push(`hidden pool.free lists slot ${f.slot}, which is in the entity chain of the record: ignored`);
            continue;
        }
        state.residue.set(f.slot, { pos: { ...f.pos }, prev: { ...f.prev }, vel: { ...f.vel }, state: f.state, counter: f.counter, hp: f.hp, anim: f.anim, art: f.art as Entity["art"], cell_class: { ...f.cell_class } });
    }
    if (carry?.residue)
        for (const [slot, r] of carry.residue)
            if (r.origin)
                state.residue.set(slot, { ...(state.residue.get(slot) ?? ZERO_RESIDUE), origin: r.origin });
    for (const g of hidden.guards) {
        if (!inChain.has(g.slot)) {
            notes.push(`hidden guards lists slot ${g.slot}, which is not in the entity chain of the record: ignored`);
            continue;
        }
        state.hidden.guards.set(g.slot, { waypoint: { x: g.waypoint.x, y: g.waypoint.y }, target: g.target });
    }
    groundFlamesFromRecord(state, world.entities, hidden.flames, notes);
    return state;
}
function refuseRecord(world: World, hidden: SnapHiddenLine, carry: TickCarry | null): void {
    if (world.link.role.value !== 0)
        throw new RefusedError(`link.role ${world.link.role.value}: two-player link play is out of scope`);
    if (hidden.controller.mode === CONTROLLER_MODE.RECORDER)
        throw new RefusedError("controller.mode 2 (the developers' recorder) is reached by no path of the game: refused");
    if (hidden.core.transition_flag !== 0)
        throw new RefusedError(`core.transition_flag ${hidden.core.transition_flag}: a set flag ends the loop in the iteration that sets it, so no record holds it (section 2)`);
    for (const [name, gate] of Object.entries(hidden.snipers)) {
        if (gate !== TICK.SNIPER_GATE_IDLE && !carry?.sniper)
            throw new RefusedError(`snipers.${name} is ${gate}: a running sniper attack's tick, offset, latch and anchor are not in the record (ZT-WORLD-SNIPER section 2): refused`);
    }
}
function poolRecordOf(e: Entity, ES: SoldierConstants, guard: GuardHidden | null = null): EntityRecord {
    const h = e.hidden ?? (guard ? { waypoint: guard.waypoint, target: guard.target === "entity" ? "unknown" : guard.target } : null);
    return {
        kind: e.type,
        slot: e.slot,
        tag: e.tag,
        form: e.form === "corpse" ? "corpse" : "live",
        art: e.art === ES.ART_ALT ? "alt" : "main",
        flags: e.flags.value,
        vec: { damage: e.vec.damage, draw: e.vec.draw, ai: e.vec.ai, death: e.vec.death },
        timer: e.timer,
        pos: { x: e.pos.x, y: e.pos.y },
        z: e.pos.z,
        vel: { x: e.vel.x, y: e.vel.y },
        state: e.state,
        counter: e.counter,
        hp: e.hp,
        anim: e.anim,
        velZ: e.vel.z,
        floor: e.floor,
        ...(h ? { home: { x: h.waypoint.x, y: h.waypoint.y }, target: h.target } : {}),
    };
}
export function isCrab(e: Entity): boolean {
    return e.type === CRAB_TYPE;
}
const CRAB_TYPE: EntityTypeName = "enemy.rec3";
const CRAB_ALIAS = "hydaca";
export function entityOfSpawn(r: EntityRecord, state: TickState): Entity {
    const ES = state.env.ES;
    const flags = r.flags;
    const kind = r.kindRow ?? null;
    const left = state.residue.get(r.slot) ?? ZERO_RESIDUE;
    const e: Entity = {
        slot: r.slot,
        type: r.kind as EntityTypeName,
        type_alias: null,
        form: "live",
        flags: { value: flags, in_use: (flags & FLAG_IN_USE) !== 0, on_floor: (flags & FLAG_ON_FLOOR) !== 0, alive: (flags & FLAG_ALIVE) !== 0, link_mirror: (flags & ES.LINK_MIRROR_BIT) !== 0 },
        vec: { damage: r.vec.damage as VectorName, draw: r.vec.draw as VectorName, ai: r.vec.ai as VectorName, death: r.vec.death as VectorName, secondary: ES.SPAWN_SECONDARY_VECTOR as Entity["vec"]["secondary"] },
        timer: r.timer,
        pos: { x: r.pos.x, y: r.pos.y, z: r.z },
        prev: { x: left.prev.x, y: left.prev.y },
        vel: { x: r.vel.x, y: r.vel.y, z: left.vel.z },
        floor: r.floor,
        state: r.state,
        counter: r.counter,
        hp: r.hp,
        anim: r.anim,
        tag: r.tag,
        art: (kind ? kind.art : r.art === "alt" ? ES.ART_ALT : ES.ART_MAIN) as Entity["art"],
        cell_class: kind ? { alive: kind.markerClass, dead: kind.corpseClass } : { alive: ES.MARKER_CLASS, dead: ES.CORPSE_CELL_CLASS },
    };
    if (!kind)
        e.hidden = { waypoint: { x: r.home!.x, y: r.home!.y }, hit_mark: 0, target: r.target ?? "player", cells_around: [] };
    if (kind && kind.type === CRAB_TYPE) {
        if (!r.home)
            throw new Error(`the creation of slot ${r.slot} carries no home point (ZT-ENT-HYD 4.14 step 3: the waypoint = V)`);
        e.type_alias = CRAB_ALIAS as Entity["type_alias"];
        e.hidden = { waypoint: { x: r.home.x, y: r.home.y }, bite_cooldown: state.env.HYD.COOLDOWN_SPAWN, hit_mark: 0, target: "player", cells_around: [] };
    }
    if (kind && kind.type === BOSS_TYPE) {
        if (!r.home)
            throw new Error(`the creation of slot ${r.slot} carries no home point (ZT-ENT-BOSS 4.1: the home point = V)`);
        e.type_alias = BOSS_ALIAS as Entity["type_alias"];
        e.hidden = { waypoint: { x: r.home.x, y: r.home.y }, hit_mark: 0, target: "player", cells_around: [] };
    }
    if (kind) {
        const h = kindSpawnHidden(kind.type, r.home);
        if (h !== null && h.origin && left.origin)
            h.origin = { x: left.origin.x, y: left.origin.y };
        if (h !== null)
            e.hidden = h;
    }
    if (kind && kind.type === GUARD_KIND) {
        if (!r.home)
            throw new Error(`the creation of slot ${r.slot} carries no home point (ZT-ENT-SOLDIER 4.1 step 3: the view point V)`);
        state.hidden.guards.set(r.slot, { waypoint: { x: r.home.x, y: r.home.y }, target: "player" });
    }
    return e;
}
interface PictureFloorLeft {
    readonly floor: number;
    readonly blocks: readonly number[];
    readonly viewDistance: number;
}
function pictureFloorOf(state: TickState, left: PictureFloorLeft | null = null): ReturnType<typeof floorMapFrom> {
    const doc = state.env.mapsDoc as {
        floors?: Array<{
            index?: unknown;
            grid?: unknown;
        }>;
    };
    const floor = left?.floor ?? state.floorNumber;
    const blocks = left?.blocks ?? state.blocks;
    const rows: number[][] = [];
    for (let r = 0; r < GRID_SIDE; r++)
        rows.push(blocks.slice(r * GRID_SIDE, (r + 1) * GRID_SIDE));
    const running = { ...(state.env.mapsDoc as object), floors: (doc.floors ?? []).map((f) => (f.index === floor ? { ...f, grid: rows } : f)), metatextures: animWallsDefinitions(state.animWalls) };
    return floorMapFrom(floorDocFrom(running, floor, state.env.R.MAP_SIDE));
}
export function mapWrite(state: TickState, floor: number, x: number, y: number, block: number, notes: string[]): void {
    if (x < 0 || y < 0 || x >= GRID_SIDE || y >= GRID_SIDE)
        throw new Error(`Map.Write at (${x}, ${y}) outside the grid`);
    const i = y * GRID_SIDE + x;
    if (floor === state.floorNumber) {
        state.blocks[i] = block;
        return;
    }
    const resident = state.earlierFloors.get(floor) ?? blocksOfFloor(state, floor);
    const isMarker = (b: number): number => (TICK.COUNTED_CLASSES.includes(state.env.classOfBlock[b] ?? -1) ? 1 : 0);
    if (floor === state.hidden.countedFloor)
        state.hidden.countedMarkers += isMarker(block) - isMarker(resident[i]!);
    const next = resident.slice();
    next[i] = block;
    state.earlierFloors.set(floor, next);
    notes.push(`Map.Write on floor ${floor}, not the running floor ${state.floorNumber}: written into that floor's resident map (ZT-WORLD-LIFT 4.4 item 2)`);
}
export function insertBySlot(world: World, e: Entity): void {
    let at = 0;
    while (at < world.entities.length && world.entities[at]!.slot < e.slot)
        at++;
    world.entities.splice(at, 0, e);
}
export function removeEntity(state: TickState, e: Entity): void {
    state.world.entities.splice(state.world.entities.indexOf(e), 1);
    state.residue.set(e.slot, residueOf(e));
}
function isParticle(e: Entity, ES: SoldierConstants): boolean {
    return e.vec.ai === ES.BURST.VECTORS.ai;
}
export function liveParticles(state: TickState): number {
    if (state.liveParticlesRaised !== undefined)
        return state.liveParticlesRaised;
    return state.world.entities.filter((e) => isParticle(e, state.env.ES)).length;
}
export function hitPlayerOf(state: TickState): HitPlayer {
    const p = state.world.player;
    const w = state.weapon;
    const inventory = state.world.inventory.map((s) => ({ item: s.item.value, amount: s.amount }));
    return {
        hp: p.hp,
        knockbackX: p.knockback.x,
        knockbackY: p.knockback.y,
        jumpTimer: p.jump_timer,
        zVel: p.z_vel,
        crouchCountdown: state.player.crouchCountdown,
        eyeOffset: p.eye_offset,
        character: p.character.value,
        vestSlot: p.passive.bullet_proof_vest,
        inventory,
        usedSlots: w ? w.slots : inventory.filter((s) => s.item !== 0).length,
        deathCounter: state.hidden.deathCounter,
    };
}
export function writeHitPlayer(state: TickState, h: HitPlayer): void {
    const p = state.world.player;
    const mp = state.player;
    if (h.hp !== p.hp)
        state.display.hpRedraw = true;
    p.hp = h.hp;
    p.knockback.x = h.knockbackX;
    p.knockback.y = h.knockbackY;
    p.jump_timer = h.jumpTimer;
    p.z_vel = h.zVel;
    mp.knockbackX = h.knockbackX;
    mp.knockbackY = h.knockbackY;
    mp.jumpTimer = h.jumpTimer;
    mp.zVel = h.zVel;
    mp.crouchCountdown = h.crouchCountdown;
    p.passive.bullet_proof_vest = h.vestSlot;
    writeInventory(state, h.inventory, h.usedSlots);
}
export function seatBodies(state: TickState, floor: number): {
    bodies?: {
        at: Array<{
            x: number;
            y: number;
        }>;
        limit: number;
    };
} {
    const seats = state.seats;
    if (seats === undefined || seats.rules === undefined)
        return {};
    const at: Array<{
        x: number;
        y: number;
    }> = [];
    for (const k of [0, 1] as const) {
        if (seats.out[k])
            continue;
        const mine = seats.live === k;
        const f = mine ? state.floorNumber : seats.data.floorNumber;
        const pos = mine ? state.world.player.pos : seats.data.player.pos;
        if (f === floor)
            at.push({ x: pos.x, y: pos.y });
    }
    return { bodies: { at, limit: seats.rules.bodyRadius } };
}
function writeInventory(state: TickState, inventory: ReadonlyArray<{
    item: number;
    amount: number;
}>, usedSlots: number): void {
    state.world.inventory.forEach((row, i) => {
        const s = inventory[i]!;
        row.amount = s.amount;
        if (s.item !== row.item.value)
            row.item = { value: s.item, name: s.item === 0 ? "empty" : (state.env.itemNames.get(s.item) ?? "unknown") };
    });
    const w = state.weapon;
    if (w) {
        w.inventory.forEach((s, i) => {
            s.item = inventory[i]!.item;
            s.amount = inventory[i]!.amount;
        });
        w.slots = usedSlots;
    }
}
function addNamesPending(state: TickState): void {
    const w = state.weapon;
    if (w === null)
        return;
    w.pending = weaponOfItem(w.inventory[w.ring[0]!]!.item, state.env.W);
}
export function lootInto(state: TickState, item: number, amount: number): boolean {
    return lootAdd(state, item, amount);
}
function lootAdd(state: TickState, item: number, amount: number): boolean {
    const inventory = state.world.inventory.map((s) => ({ item: s.item.value, amount: s.amount }));
    let slot = inventory.findIndex((s) => s.item === item);
    let sum = amount;
    if (slot >= 0) {
        const cap = state.env.itemCaps.get(item);
        if (cap === undefined)
            throw new OutsideSpecError(`the cap of item ${item} is in no data file: the loot's refusal (4.17 step 3) cannot be decided`);
        const capAmount = cap * state.env.ES.CORPSE.LOOT_AMOUNT_UNIT;
        if (inventory[slot]!.amount === capAmount)
            return false;
        sum = Math.min(inventory[slot]!.amount + amount, capAmount);
    }
    else {
        slot = inventory.findIndex((s) => s.item === 0);
        if (slot < 0)
            return false;
    }
    const filled = inventory[slot]!.item === 0;
    inventory[slot]!.item = item;
    inventory[slot]!.amount = sum;
    state.display.revealAdds.push(slot);
    writeInventory(state, inventory, inventory.filter((s) => s.item !== 0).length);
    if (filled)
        addNamesPending(state);
    queueMessage(state.message, itemMessage(item, state.env.P, state.env.items), state.env.P);
    return true;
}
export function drainHitMessages(state: TickState): void {
    for (const index of state.hit.messages)
        queueMessage(state.message, healthMessage(index, state.env.P), state.env.P);
    state.hit.messages.length = 0;
}
export function request(state: TickState, n: number): boolean {
    const o = state.world.options.sound;
    let announcing: boolean | null = null;
    let delayTimer = state.hidden.delayTimer;
    const g = state.guardPairs;
    if (g !== null) {
        const pair = g.pairs[g.next];
        g.next += 1;
        if (pair === undefined) {
            g.notes.push(`request ${n} is the ${g.next}th of the iteration but pads.jsonl gives ${g.pairs.length} guard pair(s): the model's own guards (delay timer ${delayTimer}, announcement ${state.message.announcing !== null ? 1 : 0}) are read (4.2)`);
        }
        else {
            delayTimer = pair[0];
            announcing = pair[1] !== 0;
        }
    }
    const gates = (msg: MessageState): SoundGates => ({ musicOn: o.music, sfxOn: o.sfx, voiceOn: o.pcm_voice, announcing: announcing ?? msg.announcing !== null, delayTimer });
    const seats = state.seats;
    if (seats === undefined)
        return soundRequest(state.sound, state.env.sounds, n, gates(state.message), (e) => state.events.push(e));
    let accepted = false;
    const s = soundSources.get(state);
    const src = s === undefined ? `p${seats.live}` : typeof s === "object" && s.key !== undefined ? s.key : undefined;
    const voice = isVoiceMessage(state.env.sounds, n);
    for (const { k, place: heardAt } of hearers(state, seats)) {
        const live = seats.live === k;
        if (voice && s === undefined && !live)
            continue;
        const place = voice ? undefined : heardAt;
        const driver = k === 0 ? state.sound : (seats.sound1 ??= structuredClone(state.sound));
        const ok = soundRequest(driver, state.env.sounds, n, gates(live ? state.message : seats.data.message), (e) => state.events.push({ ...e, seat: k, ...(place !== undefined ? { place } : {}), ...(src !== undefined ? { src } : {}) }));
        if (live)
            accepted = ok;
    }
    return accepted;
}
export function armExitCountdown(state: TickState, value: number): void {
    const seats = state.seats;
    if (seats === undefined) {
        state.hidden.exitCountdown = value;
        return;
    }
    if (state.hidden.exitCountdown !== 0)
        return;
    state.hidden.exitCountdown = seats.rules?.exitCountdown ?? value;
}
const soundSources = new WeakMap<TickState, SoundSource>();
export type SoundSource = number | "world" | "own" | {
    readonly floor: number;
    readonly at?: () => {
        readonly x: number;
        readonly y: number;
    };
    readonly key?: string;
};
export function withSoundSource<T>(state: TickState, source: SoundSource | null, fn: () => T): T {
    const before = soundSources.get(state);
    if (source === null)
        soundSources.delete(state);
    else
        soundSources.set(state, source);
    try {
        return fn();
    }
    finally {
        if (before === undefined)
            soundSources.delete(state);
        else
            soundSources.set(state, before);
    }
}
function doorCentre(env: TickEnv, cell: readonly [
    number,
    number
]): {
    x: number;
    y: number;
} {
    const c = env.M.POS.CELL;
    return { x: cell[0] * c + (c >> 1), y: cell[1] * c + (c >> 1) };
}
export function worldRequest(state: TickState, n: number): boolean {
    return withSoundSource(state, "world", () => request(state, n));
}
function hearers(state: TickState, seats: Seats): Array<{
    readonly k: 0 | 1;
    readonly place?: Place;
}> {
    const src = soundSources.get(state);
    const plain = (...ks: Array<0 | 1>): Array<{
        readonly k: 0 | 1;
    }> => ks.map((k) => ({ k }));
    if (src === "own")
        return plain(seats.live);
    if (seats.out[0] && seats.out[1])
        return plain(0, 1);
    if (seats.out[1])
        return plain(0);
    const floorOf = (k: 0 | 1): number => (seats.live === k ? state.floorNumber : seats.data.floorNumber);
    const alive = ([0, 1] as const).filter((k) => !seats.out[k]);
    if (src === "world")
        return plain(...alive);
    const consts = seats.rules?.sound ?? getPlaceConstants();
    const placing = consts !== null && !seats.out[0] && !seats.out[1];
    const playerOf = (k: 0 | 1): Seats["data"]["player"] => (seats.live === k ? state.world.player : seats.data.player);
    const view = state.env.view;
    const placeFor = (k: 0 | 1, x: number, y: number): Place | null => {
        const pl = playerOf(k);
        const a = pl.angle % view.sin256.length;
        return placeOf(x, y, pl.pos.x, pl.pos.y, view.sin256[a]!, view.neg_cos256[a]!, consts!);
    };
    if (src !== undefined) {
        const floor = typeof src === "number" ? src : src.floor;
        const at = typeof src === "number" ? undefined : src.at?.();
        const out: Array<{
            readonly k: 0 | 1;
            readonly place?: Place;
        }> = [];
        for (const k of alive) {
            if (floorOf(k) !== floor)
                continue;
            if (placing && at !== undefined) {
                const place = placeFor(k, at.x, at.y);
                if (place !== null)
                    out.push({ k, place });
            }
            else
                out.push({ k });
        }
        return out;
    }
    if (seats.out[seats.live])
        return [];
    const liveSeat = seats.live;
    const out: Array<{
        readonly k: 0 | 1;
        readonly place?: Place;
    }> = [];
    for (const k of alive) {
        if (k === liveSeat)
            out.push({ k });
        else if (floorOf(k) === floorOf(liveSeat)) {
            if (placing && src === undefined) {
                const at = playerOf(liveSeat).pos;
                const place = placeFor(k, at.x, at.y);
                if (place !== null)
                    out.push({ k, place });
            }
            else
                out.push({ k });
        }
    }
    return out;
}
function seatEvent(state: TickState, ev: SoundEvent): void {
    const seats = state.seats;
    state.events.push(seats === undefined ? ev : { ...ev, seat: seats.out[1] ? 0 : seats.live });
}
export type CoopEvent = {
    readonly type: "Seat.Out";
    readonly seat: 0 | 1;
    readonly reason: "dead" | "lost";
} | {
    readonly type: "Seat.Switch";
    readonly seat: 0 | 1;
    readonly character: number;
} | {
    readonly type: "Coop.Pause";
    readonly seat: 0 | 1;
    readonly on: boolean;
};
export function coopEvent(state: TickState, ev: CoopEvent): void {
    if (state.seats === undefined)
        return;
    state.events.push(ev as unknown as SoundEvent);
}
export function guardedRequest(state: TickState, n: number): void {
    const hold = state.env.G.HOLD_BY_REQUEST.get(n);
    if (hold === undefined) {
        request(state, n);
        return;
    }
    if (state.env.P.GUARD.ENDS_ANNOUNCEMENT !== 0)
        endAnnouncement(state.message);
    state.hidden.delayTimer = 0;
    request(state, n);
    state.hidden.delayTimer = state.hidden.paletteWrittenAtPickup === true ? hold - 1 : hold;
}
export function applySoldierEvents(state: TickState, e: Entity, events: readonly SoldierEvent[], notes: string[], removed = false): void {
    for (const ev of events) {
        if (ev.type === "Map.Write")
            mapWrite(state, ev.floor, ev.x, ev.y, ev.block, notes);
        else if (ev.type === "Audio.Request")
            request(state, ev.request);
        else if (ev.type === "Combat.Hit") {
            const h = hitPlayerOf(state);
            playerHit(h, state.hit, { impulse: ev.impulse, dx: ev.dx, dy: ev.dy }, state.env.H);
            writeHitPlayer(state, h);
            drainHitMessages(state);
        }
        else if (ev.type === "Floor.Recount") {
            if (removed)
                notes.push(`entity slot ${e.slot}: Floor.Recount of a fold back without an empty cell: the enemy count is not run (ZT-GAME-TICK 4.1a names deaths only; roof_sniper record 27)`);
            else
                recount(state, notes, `entity slot ${e.slot}: Floor.Recount`);
        }
    }
}
function soldierPass(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    const { world, env } = state;
    if (!e.hidden)
        throw new Error(`entity slot ${e.slot}: no hidden group`);
    e.hidden.cells_around = windowAround(state, e);
    const body = bodyOf(e);
    const p = world.player;
    const inputs = {
        player: { x: p.pos.x, y: p.pos.y, angle: p.angle, eyeOffset: p.eye_offset },
        playerFloor: world.level.sub_id,
        phase: world.core.phase,
        view: env.view,
        cells,
        loot: (item: number, amount: number) => lootInto(state, item, amount),
        ...seatBodies(state, e.floor),
    };
    const events: SoldierEvent[] = [];
    let r;
    try {
        r = soldierCall(body, inputs, state.rng, (ev) => events.push(ev), env.ES);
    }
    catch (err) {
        if (!(err instanceof OutsideSpecError))
            throw err;
        const key = `${e.slot}:${err.message}`;
        if (!state.notedKinds.has(key)) {
            state.notedKinds.add(key);
            notes.push(`entity slot ${e.slot}: ${err.message}: the call is not run`);
        }
        return;
    }
    writeBody(e, body);
    if (body.gibbed === true)
        soldierGibDeath(state, e, notes);
    if (r.removed)
        removeEntity(state, e);
    applySoldierEvents(state, e, events, notes, r.removed);
}
export function isGuard(e: Entity): boolean {
    return e.type === GUARD_KIND;
}
function guardKind(state: TickState): EnemyKind {
    for (const k of state.env.kinds.values())
        if (k.type === GUARD_KIND)
            return k;
    throw new Error("enemy_descriptors.json has no rec4 row (ZT-ENT-GUARD section 6)");
}
function guardBodyOf(state: TickState, e: Entity): GuardBody {
    const g = state.hidden.guards.get(e.slot);
    if (!g)
        throw new OutsideSpecError(`guard slot ${e.slot}: no hidden waypoint / target (hidden guards[] lists every guard of the chain)`);
    const kind = guardKind(state);
    return {
        pos: { x: e.pos.x, y: e.pos.y },
        vel: { x: e.vel.x, y: e.vel.y },
        state: e.state,
        counter: e.counter,
        timer: e.timer,
        hp: e.hp,
        flags: e.flags.value,
        form: e.vec.ai === kind.corpseVectors?.ai ? "corpse" : "live",
        hitMark: 0,
        floor: e.floor,
        tag: e.tag,
        home: { x: g.waypoint.x, y: g.waypoint.y },
        target: g.target === "entity" ? "unknown" : g.target,
        cellsAround: windowAround(state, e),
        damageForm: e.vec.damage === kind.corpseVectors?.damage ? "corpse" : "live",
        markerClass: e.cell_class.alive,
        corpseClass: e.cell_class.dead,
    };
}
function writeGuardBody(state: TickState, e: Entity, b: GuardBody): void {
    const kind = guardKind(state);
    e.pos.x = b.pos.x;
    e.pos.y = b.pos.y;
    e.vel.x = b.vel.x;
    e.vel.y = b.vel.y;
    e.state = b.state;
    e.counter = b.counter;
    e.timer = b.timer;
    e.hp = b.hp;
    e.flags.value = b.flags;
    e.flags.in_use = (b.flags & FLAG_IN_USE) !== 0;
    e.flags.on_floor = (b.flags & FLAG_ON_FLOOR) !== 0;
    e.flags.alive = (b.flags & FLAG_ALIVE) !== 0;
    state.hidden.guards.set(e.slot, { waypoint: { x: b.home.x, y: b.home.y }, target: b.target === "unknown" ? "entity" : b.target });
    const V = kind.corpseVectors;
    if (V === null) {
        if (b.damageForm === "corpse" || b.form === "corpse")
            throw new OutsideSpecError("the rec4 row of enemy_descriptors.json has no corpse vectors (ZT-ENT-GUARD 4.7 step 5, 4.8)");
        return;
    }
    if (b.damageForm === "corpse")
        e.vec.damage = V.damage as VectorName;
    if (b.form === "corpse" && e.form !== "corpse") {
        e.form = "corpse";
        e.vec.ai = V.ai as VectorName;
        e.vec.draw = V.draw as VectorName;
        e.vec.damage = V.damage as VectorName;
        e.vec.death = V.death as VectorName;
    }
}
function guardPeers(state: TickState, self: Entity): Array<{
    e: Entity;
    b: GuardBody;
}> {
    const out: Array<{
        e: Entity;
        b: GuardBody;
    }> = [];
    for (const o of state.world.entities) {
        if (o === self || !isGuard(o))
            continue;
        out.push({ e: o, b: guardBodyOf(state, o) });
    }
    return out;
}
function guardInputs(state: TickState, cells: CellSource) {
    const p = state.world.player;
    return {
        player: { x: p.pos.x, y: p.pos.y, angle: p.angle, eyeOffset: p.eye_offset },
        playerFloor: state.world.level.sub_id,
        phase: state.world.core.phase,
        view: state.env.view,
        cells,
        loot: (item: number, amount: number) => lootInto(state, item, amount),
    };
}
function guardPass(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    let body: GuardBody;
    let peers: Array<{
        e: Entity;
        b: GuardBody;
    }>;
    const events: SoldierEvent[] = [];
    let r;
    try {
        body = guardBodyOf(state, e);
        peers = guardPeers(state, e);
        r = guardCall(body, guardInputs(state, cells), peers.map((p) => p.b), state.rng, (ev) => events.push(ev), state.env.ES, GUARD);
    }
    catch (err) {
        if (!(err instanceof OutsideSpecError))
            throw err;
        const key = `${e.slot}:${err.message}`;
        if (!state.notedKinds.has(key)) {
            state.notedKinds.add(key);
            notes.push(`guard slot ${e.slot}: ${err.message}: the call is not run`);
        }
        return;
    }
    writeGuardBody(state, e, body);
    for (const p of peers)
        writeGuardBody(state, p.e, p.b);
    if (r.removed)
        removeEntity(state, e);
    applySoldierEvents(state, e, events, notes, r.removed);
}
const crabAis = new WeakMap<TickEnv, EntityAi>();
function crabAiOf(env: TickEnv): EntityAi {
    let ai = crabAis.get(env);
    if (!ai) {
        ai = crabAi(env.HYD, (_episode, cls) => env.levelCells.markerBlock(cls));
        crabAis.set(env, ai);
    }
    return ai;
}
function mapViewOf(cells: CellSource, floor: number): MapView {
    const cellAt = (x: number, y: number) => {
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= GRID_SIDE || y >= GRID_SIDE)
            throw new RangeError(`cellAt(${x}, ${y}): outside the ${GRID_SIDE}x${GRID_SIDE} grid`);
        const block = cells.block(y * GRID_SIDE + x, floor);
        return { block, cls: cells.classOf(block) };
    };
    return {
        floor,
        width: GRID_SIDE,
        height: GRID_SIDE,
        cellAt,
        cellAtPos: (x, y) => cellAt(Math.floor(x / 256), Math.floor(y / 256)),
        category: () => { throw new Error("MapView.category: the tick's map view carries no tile categories (the crab's AI reads classes only)"); },
    };
}
function crabPass(state: TickState, e: Entity, cells: CellSource, notes: string[]): void {
    const { world } = state;
    if (!e.hidden)
        throw new Error(`entity slot ${e.slot}: a crab without its hidden group (ZT-ENT-HYD 2.2)`);
    e.hidden.cells_around = windowAround(state, e);
    const view: WorldView = { map: mapViewOf(cells, e.floor), player: world.player, core: world.core, level: world.level, entities: world.entities };
    const events: SoldierEvent[] = [];
    const sink: EventSink = { emit: (ev: GameEvent) => events.push(ev as unknown as SoldierEvent) };
    const after = crabAiOf(state.env).aiTick(view, e, state.rng, sink);
    const at = world.entities.indexOf(e);
    if (after === null)
        removeEntity(state, e);
    else
        world.entities[at] = after;
    applySoldierEvents(state, after ?? e, events, notes, after === null);
}
function particlePass(state: TickState, e: Entity, cells: CellSource): void {
    const classAt = (x: number, y: number): number => cells.classOf(cells.block(moveIndex(x, y), e.floor));
    const p = { pos: e.pos, vel: e.vel, state: e.state, counter: e.counter, timer: e.timer, tag: e.tag, floor: e.floor, secondary: e.vec.secondary as string };
    const r = particleCall(p, { phase: state.world.core.phase, live: liveParticles(state), classAt }, state.env.ES);
    e.state = p.state;
    e.counter = p.counter;
    e.timer = p.timer;
    e.vec.secondary = p.secondary as Entity["vec"]["secondary"];
    if (r.removed)
        removeEntity(state, e);
}
function countedMarkers(state: TickState): number {
    if (state.hidden.countedFloor !== state.floorNumber)
        return state.hidden.countedMarkers;
    let n = 0;
    for (const b of state.blocks)
        if (TICK.COUNTED_CLASSES.includes(state.env.classOfBlock[b] ?? -1))
            n++;
    return n;
}
export function enemyCount(state: TickState): number {
    const { world } = state;
    let n = countedMarkers(state);
    for (const e of world.entities) {
        if (e.floor !== state.hidden.countedFloor)
            continue;
        if ((e.flags.value & (FLAG_ON_FLOOR | FLAG_ALIVE)) === (FLAG_ON_FLOOR | FLAG_ALIVE))
            n++;
    }
    return Math.min(n, TICK.COUNT_CAP);
}
export function recount(state: TickState, notes: string[], why: string): void {
    const floor = state.world.floor;
    if (floor.secured_phase !== 0)
        return;
    floor.enemies_remaining = enemyCount(state);
    state.display.recount = true;
    if (floor.enemies_remaining === 0 || cheatRules().c3) {
        floor.secured = true;
        const P = state.env.P;
        queueChain(state, P.FLOW_MSG.ZERO.ID, P.FLOW_MSG.ZERO.VOICE);
        floor.secured_phase = P.CHAIN.START;
        notes.push(`${why}: the enemy count is 0: ZERO ENEMIES REMAINING queued, the secured countdown starts (ZT-WORLD-PICKUP 4.5)`);
    }
}
function chainCountdown(state: TickState): void {
    const floor = state.world.floor;
    if (floor.secured_phase === 0)
        return;
    const P = state.env.P;
    const before = floor.secured_phase;
    floor.secured_phase = before - 1;
    if (before === P.CHAIN.PROCEED_AT)
        queueChain(state, P.FLOW_MSG.PROCEED.ID, P.FLOW_MSG.PROCEED.VOICE);
    if (floor.secured_phase === 0) {
        queueChain(state, P.FLOW_MSG.SECURED.ID, P.FLOW_MSG.SECURED.VOICE);
        floor.secured_phase = P.CHAIN.START;
    }
}
const chainTexts = new WeakSet<MessageText>();
function queueChain(state: TickState, id: Parameters<typeof textOf>[0], voice: Parameters<typeof textOf>[1]): void {
    const P = state.env.P;
    const seats = state.seats;
    if (seats === undefined) {
        queueMessage(state.message, textOf(id, voice, state.env.texts), P);
        return;
    }
    for (const k of [0, 1] as const) {
        if (seats.out[k] && !(k === 0 && seats.out[1]))
            continue;
        const text = textOf(id, voice, state.env.texts);
        chainTexts.add(text);
        queueMessage(seats.live === k ? state.message : seats.data.message, text, P);
    }
}
function messageVoice(state: TickState, n: number): void {
    const a = state.message.announcing;
    const from = state.events.length;
    if (state.seats !== undefined && a !== null && chainTexts.has(a))
        withSoundSource(state, "own", () => request(state, n));
    else
        request(state, n);
    if (a === null)
        return;
    const phrase = { key: a.voice.map((e) => e[1]).join(","), first: state.message.voiceEntry === 0 };
    for (let i = from; i < state.events.length; i++) {
        const e = state.events[i]!;
        if (e.type === "Audio.PlayVoice")
            state.events[i] = { ...e, phrase };
    }
}
function markersOfFloor(state: TickState, floor: number): number {
    const cells = cellSourceOf(state);
    let n = 0;
    for (let i = 0; i < FLOOR_CELLS; i++)
        if (TICK.COUNTED_CLASSES.includes(state.env.classOfBlock[cells.block(i, floor)] ?? -1))
            n++;
    return n;
}
function blocksOfFloor(state: TickState, floor: number): number[] {
    const cells = cellSourceOf(state);
    const out: number[] = [];
    for (let i = 0; i < FLOOR_CELLS; i++)
        out.push(cells.block(i, floor));
    return out;
}
function floorSwitch(state: TickState, direction: "up" | "down", newFloor: number, notes: string[]): void {
    const { world, env } = state;
    if (newFloor < 0 || newFloor >= FLOOR_COUNT)
        throw new RefusedError(`the floor switch leaves the episode's floors (${newFloor})`);
    const leftMarkers = state.hidden.countedFloor === state.floorNumber ? countedMarkers(state) : null;
    const t = switchText(world.level.episode.value, direction, newFloor, env.L);
    queueMessage(state.message, textOf(t.id, t.voice, env.texts), env.P);
    const parked = state.blocks.slice();
    const next = blocksOfFloor(state, newFloor);
    state.earlierFloors.set(state.floorNumber, parked);
    state.earlierFloors.delete(newFloor);
    state.blocks.splice(0, state.blocks.length, ...next);
    state.floorNumber = newFloor;
    world.level.sub_id = newFloor;
    world.map.floor = newFloor;
    state.display.floorSwitch = newFloor;
    floorSignWrite(state.animWalls, newFloor, env.L.SIGN);
    applyFloorConfiguration(state);
    const floor = world.floor;
    if (floor.secured_phase !== 0) {
        const committed = state.hidden.countedFloor;
        state.hidden.countedFloor += 1;
        state.hidden.countedMarkers = markersOfFloor(state, state.hidden.countedFloor);
        floor.secured_phase = 0;
        floor.secured = false;
        world.level.byte = (world.level.byte & ~LEVEL_BYTE_FLOOR_MASK) | (committed & LEVEL_BYTE_FLOOR_MASK);
        if (env.passwordCodec) {
            const inv = world.inventory;
            state.floorEntries[committed] = encodePassword(env.passwordCodec, {
                alive: CHARACTER_BY_INDEX.map((nm) => (world.team.alive[nm] ? 1 : 0)),
                items: inv.map((slot) => slot.item.value),
                amounts: inv.map((slot) => Math.floor(slot.amount / ROUND)),
                levelByte: 16 * world.level.episode.value + state.hidden.countedFloor,
            });
        }
        notes.push(`floor switch: the counted floor is committed (${state.hidden.countedFloor - 1} -> ${state.hidden.countedFloor}); its statistics are not a record; its entry is ${JSON.stringify(state.floorEntries[committed])} (ZT-WORLD-LIFT 4.4 item 3)`);
    }
    else if (state.hidden.countedFloor !== state.floorNumber) {
        if (leftMarkers !== null)
            state.hidden.countedMarkers = leftMarkers;
    }
    recount(state, notes, "floor switch: the recount");
}
function pictureCall(state: TickState, angle: number, notes: string[]): PictureFloorLeft | null {
    const { env, world } = state;
    const lift = state.hidden.lift;
    const L = env.L;
    const eye = eyeOf(world.player.pos.x, world.player.pos.y, env.view.sin256[angle]!, env.view.neg_cos256[angle]!, L);
    if (eye.cellX < 0 || eye.cellY < 0 || eye.cellX >= GRID_SIDE || eye.cellY >= GRID_SIDE)
        return null;
    const cls = env.classOfBlock[state.blocks[eye.cellY * GRID_SIDE + eye.cellX]!] ?? -1;
    if (cls < L.CALL.CLASS_MIN)
        return null;
    const s = stairRoutine(lift, cls, eye, state.floorNumber, L);
    if (s.kind === "switch") {
        notes.push(`crest of class ${cls} at the eye cell (${eye.cellX}, ${eye.cellY}), fraction (${eye.fx}, ${eye.fy}): the floor switches ${s.direction} (ZT-WORLD-LIFT 4.10)`);
        floorSwitch(state, s.direction, s.newFloor, notes);
    }
    if (lift.state !== L.STATE.UP && lift.state !== L.STATE.DOWN)
        return null;
    const r = liftWalk(lift, liftCellKind(cls, L), state.floorNumber, L);
    if (r.kind !== "switch")
        return null;
    const left: PictureFloorLeft = { floor: state.floorNumber, blocks: state.blocks.slice(), viewDistance: state.hidden.viewDistance };
    floorSwitch(state, r.direction, r.newFloor, notes);
    notes.push(`lift walker's floor switch: the picture of this iteration reads the map of floor ${left.floor} (the floor left)`);
    return left;
}
function liftTileAction(state: TickState, cls: number, notes: string[]): void {
    const { world, env } = state;
    const L = env.L;
    const kind = liftCellKind(cls, L);
    if (kind === "arrive") {
        if (liftArrive(state.hidden.lift, L)) {
            seatEvent(state, { type: "Audio.StopTrack", id: L.MUSIC });
            request(state, world.level.episode.value);
            notes.push("arrival cell: the lift music is stopped and the episode's track requested again (ZT-WORLD-LIFT 4.5; no recorded run pins the commands)");
        }
        return;
    }
    const r = liftEnter(state.hidden.lift, kind, world.floor.secured_phase, state.hidden.countedFloor, state.floorNumber, L);
    if (r === null)
        return;
    if (r.notSecured)
        queueMessage(state.message, textOf(env.P.FLOW_MSG.NOT_SECURED.ID, env.P.FLOW_MSG.NOT_SECURED.VOICE, env.texts), env.P);
    if (r.sound && state.seats !== undefined) {
        const k = state.seats.live;
        const cab = state.seats.cab ?? [null, null];
        cab[k] = { floor: state.floorNumber, x: world.player.pos.x >> env.R.CELL_SHIFT, y: world.player.pos.y >> env.R.CELL_SHIFT };
        state.seats.cab = cab;
        (state.seats.cabNew ??= []).push(k);
    }
    if (r.music) {
        seatEvent(state, { type: "Audio.StopTrack", id: world.level.episode.value });
        request(state, L.MUSIC);
    }
    if (r.sound)
        request(state, L.SOUND);
}
export const COOP_ONE_CAB = { on: true };
function liftStartEffects(state: TickState): void {
    const L = state.env.L;
    const lift = state.hidden.lift;
    if (!lift.music) {
        lift.music = true;
        seatEvent(state, { type: "Audio.StopTrack", id: state.world.level.episode.value });
        request(state, L.MUSIC);
    }
    request(state, L.SOUND);
}
function cabJoin(state: TickState, notes: string[]): void {
    const seats = state.seats;
    if (seats === undefined)
        return;
    const fresh = seats.cabNew ?? [];
    delete seats.cabNew;
    const cab = seats.cab;
    if (cab === undefined)
        return;
    const L = state.env.L;
    const shift = state.env.R.CELL_SHIFT;
    const live = (k: 0 | 1): boolean => k === seats.live;
    const liftOf = (k: 0 | 1): LiftState => (live(k) ? state.hidden.lift : seats.data.lift);
    const floorOf = (k: 0 | 1): number => (live(k) ? state.floorNumber : seats.data.floorNumber);
    const posOf = (k: 0 | 1): {
        x: number;
        y: number;
    } => (live(k) ? state.world.player.pos : seats.data.player.pos);
    const riding = (k: 0 | 1): boolean => { const s = liftOf(k).state; return s === L.STATE.UP || s === L.STATE.DOWN; };
    for (const k of [0, 1] as const)
        if (cab[k] !== null && (!riding(k) || floorOf(k) !== cab[k]!.floor))
            cab[k] = null;
    const order: Array<0 | 1> = [0, 1];
    order.sort((a, b) => Number(fresh.includes(a)) - Number(fresh.includes(b)));
    for (const a of order) {
        const from = cab[a];
        const b: 0 | 1 = a === 0 ? 1 : 0;
        if (from === null || seats.out[b] || seats.out[a])
            continue;
        if (floorOf(b) !== from.floor)
            continue;
        const pb = posOf(b);
        if (pb.x >> shift !== from.x || pb.y >> shift !== from.y)
            continue;
        const la = liftOf(a);
        const lb = liftOf(b);
        if (!riding(b)) {
            inSeat(state, b, () => liftStartEffects(state));
            lb.state = la.state;
            lb.slide = la.slide;
            cab[b] = { ...from };
            notes.push(`ZT-COOP 4.9 item 8: seat ${b} standing in the cab (${from.x}, ${from.y}) rides with seat ${a} (lift state ${la.state}, slide ${la.slide})`);
        }
        else if (fresh.includes(b) && cab[b] !== null && cab[b]!.x === from.x && cab[b]!.y === from.y && (lb.state !== la.state || lb.slide !== la.slide)) {
            lb.state = la.state;
            lb.slide = la.slide;
            notes.push(`ZT-COOP 4.9 item 8: seat ${b} entered the cab (${from.x}, ${from.y}) during seat ${a}'s ride: it joins (lift state ${la.state}, slide ${la.slide})`);
        }
        break;
    }
}
function entityPass(state: TickState, notes: string[]): void {
    const { world, env } = state;
    const cells = cellSourceOf(state);
    const count = world.entities.length;
    const atStart = new Set(world.entities);
    let lastSlot = -1;
    for (let walked = 0; walked < count; walked++) {
        const e = world.entities.find((x) => x.slot > lastSlot && !(isShot(x) && !atStart.has(x)));
        if (e === undefined)
            break;
        lastSlot = e.slot;
        e.prev.x = e.pos.x;
        e.prev.y = e.pos.y;
        if ((e.pos.x > TICK.REMOVE_POSITION_MAX || e.pos.y > TICK.REMOVE_POSITION_MAX || e.floor > TICK.REMOVE_FLOOR_MAX) && (e.flags.value & TICK.KEEP_FLAG) === 0) {
            removeEntity(state, e);
            continue;
        }
        e.timer = s8(e.timer - TICK.TIMER_STEP);
        if (e.timer >= TICK.TIMER_RUN_BELOW)
            continue;
        const ai = (): void => {
            if (isCameraRecord(e)) {
                cameraPass(state, e, cells, notes);
            }
            else if (isOrdnanceRecord(e)) {
                ordnancePass(state, e, notes);
            }
            else if (e.type === "enemy.rec1" && (e.vec.ai === env.ES.SPAWN_VECTORS.ai || e.vec.ai === env.ES.CORPSE_VECTORS.ai)) {
                soldierPass(state, e, cells, notes);
            }
            else if (isGuard(e)) {
                guardPass(state, e, cells, notes);
            }
            else if (isCrab(e)) {
                crabPass(state, e, cells, notes);
            }
            else if (isParticle(e, env.ES)) {
                particlePass(state, e, cells);
            }
            else if (isImpact(e)) {
                impactPass(state, e);
            }
            else if (isBoss(e)) {
                bossPass(state, e, cells, notes);
            }
            else if (isShot(e)) {
                shotPass(state, e, cells, notes);
            }
            else if (isKindRecord(e)) {
                kindPass(state, e, cells, notes);
            }
            else if (isFlameRecord(e) || isGib(e)) {
                flamePass(state, e, cells, notes);
            }
            else if (isMineRecord(e)) {
                minePass(state, e, cells, notes);
            }
            else {
                const key = `${e.slot}:${e.type}/${e.vec.ai}`;
                if (!state.notedKinds.has(key)) {
                    state.notedKinds.add(key);
                    notes.push(`entity slot ${e.slot}: the kind ${e.type} (handler ${e.vec.ai}) is outside every spec (4.1 step 12): its AI is not run`);
                }
            }
        };
        if (state.seats === undefined)
            ai();
        else
            inSeat(state, pickSeat(state, e), () => withSoundSource(state, { floor: e.floor, at: () => e.pos, key: `e${e.slot}` }, ai));
    }
}
interface PictureForShot {
    readonly cx: number;
    readonly cy: number;
    readonly gateScale: number;
}
function snapshotSky(state: TickState, angle: number): {
    class: string | null;
    vs: number | null;
    strips: {
        shown: boolean;
        A: number;
        y: number;
        floor: number;
        z: number;
    } | null;
} {
    const sky = state.env.sky;
    if (sky === null)
        return { class: null, vs: null, strips: null };
    const cls = sky.C.CLASS_BY_EPISODE[String(state.world.level.episode.value)] ?? null;
    const s = state.hidden.sniper;
    const gatesIdle = !s.active && !s.fire && s.flash === TICK.SNIPER_GATE_IDLE;
    const strips = cls === SNAPSHOT_CITY_CLASS ? { shown: gatesIdle, A: angle, y: state.world.player.pos.y, floor: state.floorNumber, z: 0 } : null;
    return { class: cls, vs: vscrollOfFloor(state.floorNumber, sky.C), strips };
}
export function firstPicture(state: TickState, notes: string[]): void {
    picture(state, state.world.player.angle, state.world.player.eye_offset, notes);
}
export function animatedColumns(state: TickState, pic: ViewRecord | null = state.lastPicture): Set<number> {
    const out = new Set<number>();
    if (pic === null)
        return out;
    const defs = animatedDefinitions(state.animWalls);
    if (defs.size === 0)
        return out;
    for (let c = 0; c < pic.word.length; c++) {
        const word = pic.word[c];
        if (word !== null && word !== undefined && defs.has(word))
            out.add(c);
    }
    return out;
}
export function redrawPicture(state: TickState, notes: string[], o: {
    readonly partner?: boolean;
} = {}): void {
    picture(state, state.lastPictureAngle ?? state.world.player.angle, state.lastPictureEye ?? state.world.player.eye_offset, notes, null, o.partner ?? true);
}
function picture(state: TickState, angle: number, eye: number, notes: string[], left: PictureFloorLeft | null = null, withPartner = true): PictureForShot {
    const { world, env } = state;
    const occupied = new Set<number>();
    const pool: EntityPool = { records: [], occupied, residue: (slot) => state.residue.get(slot) };
    const byRecord = new Map<EntityRecord, Entity>();
    for (const e of world.entities) {
        const guard = isGuard(e) ? state.hidden.guards.get(e.slot) ?? null : null;
        const pictured = e.vec.draw === PARTICLE_DRAW_VECTOR || e.vec.draw === IMPACT_DRAW_VECTOR;
        const drawn = pictured || isFlameRecord(e) || isGib(e) || isBoss(e) || isShot(e) || isMineRecord(e) || isDrawnKind(e) || isGrenade(e) || isCameraRecord(e) || isOrdnanceRecord(e);
        if (!((e.type === "enemy.rec1" && e.hidden) || guard || drawn || (isCrab(e) && e.hidden))) {
            occupied.add(e.slot);
            continue;
        }
        const r = poolRecordOf(e, env.ES, guard);
        if (e.vec.ai === FLAME_GROUND_AI)
            r.age = flameAgeOf(state, e.slot) ?? 0;
        else if (isMineRecord(e))
            r.age = blastAgeOf(state, e.slot) ?? 0;
        pool.records.push(r);
        byRecord.set(r, e);
    }
    const puppet = withPartner ? partnerPoolRecord(state, env.PARTNER) : null;
    if (puppet !== null)
        pool.records.push(puppet);
    if (withPartner && state.seats !== undefined)
        PARTNER_PICTURE_HOOK.cb?.(state.seats.live, puppet, state);
    const ctx: SpriteContext = { SC: env.SPR, ES: env.ES, assets: env.spriteAssets, phase: world.core.phase, cells: [], pool, playerFloor: world.level.sub_id, kinds: env.kinds, camera: { C: env.CAMERA, playerX: world.player.pos.x, playerY: world.player.pos.y }, draw: () => draw(state.rng), hyd: env.HYD, player: { x: world.player.pos.x, y: world.player.pos.y } };
    state.hidden.laneEyePrev = s16(eye);
    const light: LightView = { viewDistance: left?.viewDistance ?? state.hidden.viewDistance, beamFirst: lightCarried(world.player.passive, env.LIGHT) ? state.hidden.beamFirst : null, night: nightCarried(world.player.passive, env.LIGHT) };
    const pose = { x: world.player.pos.x, y: world.player.pos.y, angle, eye, liftHeight: state.hidden.lift.slide };
    const floorMap = pictureFloorOf(state, left);
    const doorViews = state.doors.queue.map((d) => ({ cell: d.cell, timer: d.timer }));
    const sink = snapshotSinkOf(state);
    const snap = sink !== null ? timedPart("snapshotMs", () => sink({ step: world.core.phase, seat: state.seats?.live ?? 0, pose, floor: floorMap, doors: doorViews, overlay: ctx.cells, light, sky: snapshotSky(state, angle) }, state) ?? null) : null;
    const observer = snap !== null ? snapshotObserver(snap, env.spriteAssets) : null;
    if (observer !== null)
        ctx.observer = observer;
    const rec = timedPart("pictureMs", () => renderView(pose, floorMap, env.R, env.view, env.rendAssets, doorViews, ctx, light));
    if (snap !== null && observer !== null) {
        timedPart("snapshotMs", () => finishSnapshot(snap, { SC: env.SPR, assets: env.spriteAssets, phase: world.core.phase, hyd: env.HYD, cleared: rec.events.filter((e) => e.type === "Map.Write").map((e) => [e.x, e.y] as const), frames: observer.frames }, env.R, env.view));
    }
    state.lastPicture = rec;
    state.lastPictureAngle = angle;
    state.lastPictureEye = eye;
    for (const n of rec.notes)
        notes.push(`picture: ${n}`);
    for (const ev of rec.events) {
        if (ev.type === "Map.Write")
            mapWrite(state, ev.floor, ev.x, ev.y, ev.block, notes);
        else if (ev.type === "Audio.Request")
            request(state, ev.request);
    }
    for (const [r, e] of byRecord)
        e.anim = r.anim;
    if (puppet !== null)
        state.partnerAnim = puppet.anim;
    for (const r of rec.spawned)
        insertBySlot(world, r.vec.ai === CAMERA_AI ? cameraEntityOf(r, state) : entityOfSpawn(r, state));
    return { cx: env.view.sin256[angle]!, cy: env.view.neg_cos256[angle]!, gateScale: rec.depth[env.ES.HIT.GATE_COLUMN] ?? 0 };
}
function playerShot(state: TickState, weapon: number, repeat: boolean, bobAngle: number, bobEye: number, pic: PictureForShot, notes: string[], cone?: number): void {
    const { world, env } = state;
    const ES = env.ES;
    const p = world.player;
    const aimColumn = env.R.COLUMN_CENTRE + bobAngle * (weapon === env.W.W_LASER ? 2 : 1);
    const inputs = {
        weapon,
        repeat,
        character: p.character.value,
        eyeOffset: s16(p.eye_offset + bobEye),
        playerFloor: world.level.sub_id,
        player: { x: p.pos.x, y: p.pos.y },
        camera: { cx: pic.cx, cy: pic.cy },
        aimColumn,
        gateScale: pic.gateScale,
        ...(cone !== undefined ? { cone } : {}),
    };
    const candidates = world.entities.map((e) => ({ flags: e.flags.value, floor: e.floor, pos: { x: e.pos.x, y: e.pos.y } }));
    const partner = partnerBody(state);
    if (partner !== null)
        candidates.push({ flags: partner.flags, floor: partner.floor, pos: partner.pos });
    const index = shotTarget(candidates, inputs, ES);
    if (partner !== null && index === world.entities.length) {
        const d = shotMagnitude(octDist(s16(partner.pos.x - p.pos.x), s16(partner.pos.y - p.pos.y)), inputs, ES);
        if (d !== null)
            hurtSeat(state, partner.k, { impulse: d, dx: s16(p.pos.x - partner.pos.x), dy: s16(p.pos.y - partner.pos.y) });
        return;
    }
    if (index === null && cone !== undefined)
        return;
    if (index === null) {
        wallRay(state, ((p.angle + bobAngle) % env.M.ANGLE.UNITS + env.M.ANGLE.UNITS) % env.M.ANGLE.UNITS, s16(p.eye_offset + bobEye), notes);
        return;
    }
    const target = world.entities[index]!;
    if (isCrab(target)) {
        const rx = s16(target.pos.x - p.pos.x);
        const ry = s16(target.pos.y - p.pos.y);
        const d = shotMagnitude(octDist(rx, ry), inputs, ES);
        if (d === null)
            return;
        const hit = { impulse: d, rel: { x: s16(p.pos.x - target.pos.x), y: s16(p.pos.y - target.pos.y) }, mark: 0 };
        let after: Entity;
        if (target.vec.damage === HYD_VECTORS.live.damage)
            after = crabDamageEntry(target, hit, env.HYD);
        else if (target.vec.damage === HYD_VECTORS.corpse.damage)
            after = crabCorpseDamage(target, hit, env.HYD);
        else {
            notes.push(`shot: the crab of slot ${target.slot} has the damage entry ${target.vec.damage}, which no text specifies (ZT-ENT-HYD 4.12 is the live entry's, 4.15 the corpse's): not applied`);
            return;
        }
        world.entities[index] = after;
        return;
    }
    if (isCameraRecord(target)) {
        if (shotMagnitude(octDist(s16(target.pos.x - p.pos.x), s16(target.pos.y - p.pos.y)), inputs, ES) !== null)
            popCamera(state, target);
        return;
    }
    if (isOrdnanceRecord(target)) {
        const d = shotMagnitude(octDist(s16(target.pos.x - p.pos.x), s16(target.pos.y - p.pos.y)), inputs, ES);
        if (d !== null)
            rocketHit(state, target, d);
        return;
    }
    if (isBoss(target)) {
        const rx = s16(target.pos.x - p.pos.x);
        const ry = s16(target.pos.y - p.pos.y);
        const d = shotMagnitude(octDist(rx, ry), inputs, ES);
        if (d === null)
            return;
        bossDamage(state, target, d, s16(p.pos.x - target.pos.x), s16(p.pos.y - target.pos.y), 0, notes);
        return;
    }
    if (isKindRecord(target)) {
        const d = shotMagnitude(octDist(s16(target.pos.x - p.pos.x), s16(target.pos.y - p.pos.y)), inputs, ES);
        if (d === null)
            return;
        kindDamage(state, target, d, s16(p.pos.x - target.pos.x), s16(p.pos.y - target.pos.y), 0, true, notes);
        return;
    }
    if (target.type !== "enemy.rec1" && !isGuard(target)) {
        notes.push(`shot: the target of slot ${target.slot} is of the kind ${target.type}: its damage entry (${target.vec.damage}) is outside every spec; not applied`);
        return;
    }
    const rx = s16(target.pos.x - p.pos.x);
    const ry = s16(target.pos.y - p.pos.y);
    const d = shotMagnitude(octDist(rx, ry), inputs, ES);
    if (d === null)
        return;
    if (isGuard(target)) {
        guardHit(state, target, d, u16(p.pos.x - target.pos.x), u16(p.pos.y - target.pos.y), notes);
        return;
    }
    if (target.vec.damage === ES.CORPSE_VECTORS.damage) {
        const body = bodyOf(target);
        corpseDamage(body, d, u16(p.pos.x - target.pos.x), u16(p.pos.y - target.pos.y), GUARD);
        writeBody(target, body);
        return;
    }
    if (target.vec.damage !== ES.SPAWN_VECTORS.damage) {
        notes.push(`shot: the soldier of slot ${target.slot} has the damage entry ${target.vec.damage}, which no text specifies (ZT-ENT-SOLDIER 4.15 is the live entry's, 4.15a the corpse's): not applied`);
        return;
    }
    const body = bodyOf(target);
    const burst = damageEntry(body, d, u16(p.pos.x - target.pos.x), u16(p.pos.y - target.pos.y), 0, ES);
    writeBody(target, body);
    if (burst === null)
        return;
    burstParticles(state, target.pos, burst);
}
export function burstParticles(state: TickState, at: {
    readonly x: number;
    readonly y: number;
}, burst: NonNullable<ReturnType<typeof damageEntry>>): void {
    const { world, env } = state;
    const ES = env.ES;
    const n = burstCount(burst.loss, ES);
    for (let i = 0; i < n; i++) {
        if (liveParticles(state) >= ES.BURST.LIVE_MAX)
            break;
        const slot = lowestFreeSlot(world);
        if (slot === null)
            break;
        const R = draw(state.rng);
        const init = particleOf({ x: at.x, y: at.y }, burst, R, ES);
        insertBySlot(world, particleEntity(state, slot, init.pos, init.vel, init.state));
    }
}
export function lowestFreeSlot(world: World): number | null {
    const used = new Set(world.entities.map((e) => e.slot));
    let slot = 0;
    while (slot < BURST_TEXT.POOL_SLOTS && used.has(slot))
        slot++;
    return slot >= BURST_TEXT.POOL_SLOTS ? null : slot;
}
function rayBlocked(state: TickState, x: number, y: number): boolean {
    const cx = x >> state.env.R.CELL_SHIFT;
    const cy = y >> state.env.R.CELL_SHIFT;
    if (cx < 0 || cy < 0 || cx >= GRID_SIDE || cy >= GRID_SIDE)
        return true;
    const cls = state.env.classOfBlock[state.blocks[cy * GRID_SIDE + cx]!] ?? -1;
    if (RAY.SOLID_CLASSES.includes(cls) || RAY.DOOR_CLASSES.includes(cls))
        return true;
    const xf = x & RAY.FRACTION_MASK;
    const yf = y & RAY.FRACTION_MASK;
    if (cls === RAY.DIAGONAL_XF_GT_YF)
        return xf > yf;
    if (cls === RAY.DIAGONAL_XF_GT_255_MINUS_YF)
        return xf > RAY.FRACTION_MASK - yf;
    if (cls === RAY.DIAGONAL_XF_LT_YF)
        return xf < yf;
    if (cls === RAY.DIAGONAL_XF_LT_255_MINUS_YF)
        return xf < RAY.FRACTION_MASK - yf;
    return false;
}
export function wallRay(state: TickState, angle: number, eye: number, notes: string[]): void {
    wallRayOnly(state, angle, eye, notes);
    tileProbe(state, angle, notes);
}
function tileProbe(state: TickState, angle: number, notes: string[]): void {
    const { world, env } = state;
    const p = world.player;
    const vx = env.view.sin256[angle]! >> RAY.TILE_VECTOR_SHIFT;
    const vy = env.view.neg_cos256[angle]! >> RAY.TILE_VECTOR_SHIFT;
    let x = p.pos.x;
    let y = p.pos.y;
    for (let step = 0; step < RAY.TILE_STEPS; step++) {
        x += vx;
        y += vy;
        if (!rayBlocked(state, x, y))
            continue;
        const cx = x >> env.R.CELL_SHIFT;
        const cy = y >> env.R.CELL_SHIFT;
        if (cx < 0 || cy < 0 || cx >= GRID_SIDE || cy >= GRID_SIDE)
            return;
        const cls = env.classOfBlock[state.blocks[cy * GRID_SIDE + cx]!] ?? -1;
        const up = RAY.TILE_STEP_UP.find((pair) => pair[0] === cls);
        if (up === undefined)
            return;
        const block = env.classOfBlock.findIndex((c) => c === up[1]);
        if (block < 0) {
            notes.push(`tile probe: the level has no block of class ${up[1]} (4.12a step 5): not applied`);
            return;
        }
        mapWrite(state, world.level.sub_id, cx, cy, block, notes);
        if (!env.G.HOLD_BY_REQUEST.has(env.W.REQ_TILE_RAY))
            throw new RefusedError(`tile probe: no hold for the request ${env.W.REQ_TILE_RAY} (4.4a)`);
        guardedRequest(state, env.W.REQ_TILE_RAY);
        return;
    }
}
function wallRayOnly(state: TickState, angle: number, eye: number, notes: string[]): void {
    const { world, env } = state;
    const p = world.player;
    const episode = world.level.episode.value;
    const camAngle = state.lastPictureAngle ?? p.angle;
    const camX = u16(p.pos.x - (env.view.sin256[camAngle]! >> env.R.CAMERA_BACK_SHIFT));
    const camY = u16(p.pos.y - (env.view.neg_cos256[camAngle]! >> env.R.CAMERA_BACK_SHIFT));
    const camCx = s16(camX) >> env.R.CELL_SHIFT;
    const camCy = s16(camY) >> env.R.CELL_SHIFT;
    if (camCx >= 0 && camCy >= 0 && camCx < GRID_SIDE && camCy < GRID_SIDE) {
        const camClass = env.classOfBlock[state.blocks[camCy * GRID_SIDE + camCx]!] ?? -1;
        if (RAY.SKIP_CLASSES.includes(camClass))
            return;
    }
    const vx = env.view.sin256[angle]!;
    const vy = env.view.neg_cos256[angle]!;
    let ax = p.pos.x << RAY.POSITION_SHIFT;
    let ay = p.pos.y << RAY.POSITION_SHIFT;
    let lastX = p.pos.x;
    let lastY = p.pos.y;
    for (let step = 0; step < RAY.STEPS; step++) {
        ax += vx;
        ay += vy;
        const x = ax >> RAY.POSITION_SHIFT;
        const y = ay >> RAY.POSITION_SHIFT;
        if (!rayBlocked(state, x, y)) {
            lastX = x;
            lastY = y;
            continue;
        }
        const cx = x >> env.R.CELL_SHIFT;
        const cy = y >> env.R.CELL_SHIFT;
        const block = cx >= 0 && cy >= 0 && cx < GRID_SIDE && cy < GRID_SIDE ? state.blocks[cy * GRID_SIDE + cx]! : -1;
        const absorb = RAY.ABSORB[episode];
        const absorbEye = RAY.ABSORB_EYE_NOT_NEGATIVE[episode];
        if (absorb === undefined || absorbEye === undefined)
            throw new RefusedError(`wall ray: no absorbing block list of episode ${episode} (ZT-PLAYER-WEAPON 4.12a names episodes 0 .. 2)`);
        if (absorb.includes(block) || (eye >= 0 && absorbEye.includes(block)))
            return;
        const slot = lowestFreeSlot(world);
        if (slot === null) {
            notes.push("wall ray: the pool is full, no impact is created (4.12a step 3)");
            return;
        }
        insertBySlot(world, impactEntity(state, slot, lastX, lastY, eye));
        return;
    }
}
function impactEntity(state: TickState, slot: number, x: number, y: number, eye: number): Entity {
    const ES = state.env.ES;
    const left = state.residue.get(slot) ?? ZERO_RESIDUE;
    const flags = RAY.FLAGS;
    const V = RAY.VECTORS;
    return {
        slot,
        type: BURST_TEXT.TYPE,
        type_alias: null,
        form: BURST_TEXT.FORM,
        flags: { value: flags, in_use: (flags & FLAG_IN_USE) !== 0, on_floor: (flags & FLAG_ON_FLOOR) !== 0, alive: (flags & FLAG_ALIVE) !== 0, link_mirror: (flags & ES.LINK_MIRROR_BIT) !== 0 },
        vec: { damage: V.damage as VectorName, draw: V.draw as VectorName, ai: V.ai as VectorName, death: V.death as VectorName, secondary: V.secondary as Entity["vec"]["secondary"] },
        timer: RAY.TIMER,
        pos: { x, y, z: s16(eye - RAY.Z_WORD) },
        prev: { x: left.prev.x, y: left.prev.y },
        vel: { x: left.vel.x, y: left.vel.y, z: left.vel.z },
        floor: state.world.level.sub_id,
        state: RAY.STATE,
        counter: left.counter,
        hp: left.hp,
        anim: left.anim,
        tag: slot + ES.TAG_OFFSET,
        art: left.art,
        cell_class: { alive: left.cell_class.alive, dead: left.cell_class.dead },
    };
}
function impactPass(state: TickState, e: Entity): void {
    e.timer = RAY.TIMER;
    const next = e.state - RAY.STATE_STEP;
    if (next < 0) {
        e.state = next & ((1 << RAY.STATE_BITS) - 1);
        removeEntity(state, e);
        return;
    }
    e.state = next;
    e.pos.z = s16(e.pos.z + RAY.Z_STEP);
}
function isImpact(e: Entity): boolean {
    return e.vec.ai === RAY.VECTORS.ai;
}
export function particleEntity(state: TickState, slot: number, pos: {
    x: number;
    y: number;
    z: number;
}, vel: {
    x: number;
    y: number;
    z: number;
}, st: number): Entity {
    const ES = state.env.ES;
    const V = ES.BURST.VECTORS;
    const left = state.residue.get(slot) ?? ZERO_RESIDUE;
    const flags = ES.BURST.FLAGS;
    return {
        slot,
        type: BURST_TEXT.TYPE,
        type_alias: null,
        form: BURST_TEXT.FORM,
        flags: { value: flags, in_use: (flags & FLAG_IN_USE) !== 0, on_floor: (flags & FLAG_ON_FLOOR) !== 0, alive: (flags & FLAG_ALIVE) !== 0, link_mirror: (flags & ES.LINK_MIRROR_BIT) !== 0 },
        vec: { damage: V.damage as VectorName, draw: V.draw as VectorName, ai: V.ai as VectorName, death: V.death as VectorName, secondary: "none" },
        timer: 0,
        pos: { x: pos.x, y: pos.y, z: pos.z },
        prev: { x: left.prev.x, y: left.prev.y },
        vel: { x: vel.x, y: vel.y, z: vel.z },
        floor: state.world.level.sub_id,
        state: st,
        counter: left.counter,
        hp: left.hp,
        anim: left.anim,
        tag: slot + ES.TAG_OFFSET,
        art: left.art,
        cell_class: { alive: left.cell_class.alive, dead: left.cell_class.dead },
    };
}
function weaponPressOfC(state: TickState, pad: number): void {
    const w = state.weapon;
    if (w === null || state.hidden.deathCounter !== 0)
        return;
    const r = state.modern !== undefined ? weaponSelect(w, state.modern.input.select, state.modern.selection, state.env.W) : weaponPressC(w, padOfByte(pad), state.env.W);
    if (r !== null)
        guardedRequest(state, r.request);
}
function heldWeaponsOf(env: TickEnv): HeldWeapons {
    const O = env.ORDNANCE;
    return { ROCKET: O.ITEM, REQ_ROCKET: O.REQUEST, GRENADE: O.GRENADE_ITEM, REQ_GRENADE: O.GRENADE_REQUEST, GRENADE_THROW_FRAME: O.GRENADE_THROW_FRAME, GRENADE_ANIM_END: O.GRENADE_ANIM_BUSY + 2, EXTINGUISHER: env.EXT.ITEM, REQ_EXTINGUISHER: env.EXT.SOUND };
}
function weaponBlock(state: TickState, pad: number, angle: number, bobAngle: number, bobEye: number, pic: PictureForShot, notes: string[]): void {
    const { world, env } = state;
    const w = state.weapon;
    if (w === null)
        return;
    const wpad = state.modern !== undefined ? modernWeaponPad(state.modern.input) : padOfByte(pad);
    w.scannerSlot = world.player.passive.bio_scanner === env.LIGHT.ABSENT ? -1 : world.player.passive.bio_scanner;
    const trial = structuredClone(w);
    const inHand = w.current;
    let requests: WeaponRequest[];
    try {
        const pose = { x: world.player.pos.x, y: world.player.pos.y, angle, episode: world.level.episode.value, eyeOffset: world.player.eye_offset + bobEye };
        const targetHit = (variant: number): boolean => fistsHit(state, { x: pose.x, y: pose.y, angle, eyeOffset: pose.eyeOffset, variant }, notes);
        requests = weaponTick(trial, wpad, pose, weaponFloorOf(state.blocks, env.classOfBlock, GRID_SIDE), env.view, world.core.phase, env.W, state.hidden.deathCounter !== 0, true, targetHit, env.FLAME, heldWeaponsOf(env));
    }
    catch (err) {
        notes.push(`weapon block: ${err instanceof Error ? err.message : String(err)}; the block's writes of this iteration are not modelled`);
        w.prevPad = padByte(wpad, env.W);
        return;
    }
    Object.assign(w, trial);
    if (w.ammoLow === true)
        queueMessage(state.message, ammoLowMessage(env.P), env.P);
    if (w.scannerRemoved === true) {
        world.player.passive.bio_scanner = w.scannerSlot >= 0 ? w.scannerSlot : env.LIGHT.ABSENT;
        notes.push(`weapon block: the bio scanner's drain removed it (ZT-PLAYER-WEAPON 4.9): passive.bio_scanner ${world.player.passive.bio_scanner}`);
    }
    const gunRequests = [env.W.REQ_HANDGUN, env.W.REQ_SHOTGUN, env.W.REQ_LASER, env.W.REQ_PULSE];
    let shots = 0;
    for (const r of requests) {
        guardedRequest(state, r.request);
        if (!gunRequests.includes(r.request))
            continue;
        const first = shots === 0 && w.bEdge;
        shots++;
        if (inHand === env.W.W_PULSE && !first) {
            notes.push("weapon block: a pulse laser's later frame requests again (ZT-PLAYER-WEAPON 4.6); whether it hits a soldier is not said (ZT-ENT-SOLDIER 4.14): not applied");
            continue;
        }
        sniperBullet(state, inHand, bobAngle, notes);
        playerShot(state, inHand, !first, bobAngle, bobEye, pic, notes);
    }
    if (requests.some((r) => r.request === env.W.REQ_MINE))
        placeMine(state, { bobbedAngle: angle, angle: world.player.angle, eyeOffset: world.player.eye_offset, bobEye }, notes);
    const made = { angle, bobAngle, bobEye, pic };
    if (inHand === env.ORDNANCE.ITEM && requests.some((r) => r.request === env.ORDNANCE.REQUEST)) {
        sniperBullet(state, inHand, bobAngle, notes);
        makeRocket(state, made, notes);
    }
    if (w.grenadeThrown === true) {
        sniperBullet(state, inHand, bobAngle, notes);
        makeGrenade(state, made, notes);
    }
    if (inHand === env.EXT.ITEM && requests.some((r) => r.request === env.EXT.SOUND)) {
        sniperBullet(state, inHand, bobAngle, notes);
        playerShot(state, inHand, false, bobAngle, bobEye, pic, notes, EXT_AIM_CONE);
        extinguisherCell(state, angle, notes);
    }
    const flameStreams = (w as unknown as {
        flameStreams?: number;
    }).flameStreams ?? 0;
    for (let i = 0; i < flameStreams; i++)
        sniperBullet(state, inHand, bobAngle, notes);
    if (flameStreams > 0)
        flameStreamsCreate(state, flameStreams, { bobbedAngle: angle, angle: world.player.angle, eyeOffset: world.player.eye_offset, bobEye, pic, bobAngle }, notes);
    const pw = world.player.weapon;
    pw.current = { value: w.current, name: weaponNameOf(w.current, pw.current, env.W, env.itemNames) };
    pw.pending = { value: w.pending, name: weaponNameOf(w.pending, pw.pending, env.W, env.itemNames) };
    world.inventory.forEach((row, i) => {
        const s = w.inventory[i]!;
        row.amount = s.amount;
        if (s.item !== row.item.value)
            row.item = { value: s.item, name: s.item === 0 ? "empty" : ("unknown" as ItemName) };
    });
}
function tileAction(state: TickState, notes: string[], entered: boolean): void {
    const { world, env } = state;
    const p = world.player;
    const cx = p.pos.x >> env.R.CELL_SHIFT;
    const cy = p.pos.y >> env.R.CELL_SHIFT;
    if (cx < 0 || cy < 0 || cx >= GRID_SIDE || cy >= GRID_SIDE)
        return;
    const cls = env.classOfBlock[state.blocks[cy * GRID_SIDE + cx]!] ?? -1;
    if (entered && world.level.episode.value === env.sniper.EPISODE) {
        const sn = state.hidden.sniper;
        if (sniperTrigger(sn, cls, () => state.rng.next(), env.sniper))
            notes.push(`step 16: the sniper trigger (class ${cls}): an attack armed, offset ${sn.offset} (ZT-WORLD-SNIPER 4.2)`);
    }
    const inventory = world.inventory.map((s) => ({ item: s.item.value, amount: s.amount }));
    const passive: Record<string, number> = { ...p.passive };
    const pp = { hp: p.hp, character: p.character.value, inventory, passive };
    const rules: PassiveRules = {
        passiveNameOf: (id) => {
            const name = env.itemNames.get(id);
            return name !== undefined && name in passive ? name : null;
        },
        light: { ITEM: env.LIGHT.ITEM, GRANT: env.LIGHT.GRANT, CAP: env.LIGHT.CAP },
    };
    const r = pickupAt(cls, pp, state.message, env.P, env.items, rules);
    state.hidden.pickupStanding = r.refused;
    if (!r.cleared) {
        if (entered)
            liftTileAction(state, cls, notes);
        return;
    }
    mapWrite(state, state.floorNumber, cx, cy, PICKUP_TEXT.CLEARED_BLOCK, notes);
    if (pp.hp !== p.hp)
        state.display.hpRedraw = true;
    p.hp = pp.hp;
    let filled = false;
    inventory.forEach((s, i) => {
        const old = world.inventory[i]!;
        if (s.item !== old.item.value || s.amount > old.amount)
            state.display.revealAdds.push(old.slot);
        if (s.item !== 0 && old.item.value === 0)
            filled = true;
    });
    writeInventory(state, inventory, inventory.filter((s) => s.item !== 0).length);
    const lightBefore = p.passive.flash_light;
    const nightBefore = p.passive.night_vision;
    for (const k of Object.keys(p.passive) as Array<keyof typeof p.passive>)
        p.passive[k] = passive[k]!;
    if (lightBefore === env.LIGHT.ABSENT && p.passive.flash_light !== env.LIGHT.ABSENT)
        state.hidden.viewDistance = env.R.LIGHT.VIEW_DISTANCE;
    if (nightBefore === env.LIGHT.ABSENT && p.passive.night_vision !== env.LIGHT.ABSENT) {
        state.hidden.viewDistance = env.R.NIGHT.VIEW_DISTANCE;
        installPalette(state, true);
        state.hidden.paletteWrittenAtPickup = true;
        notes.push(`step 16: a new night vision (slot ${p.passive.night_vision}): the green palette and the view distance ${state.hidden.viewDistance} installed at once (ZT-PLAYER-WEAPON 4.9b, ZT-REND-WALL 4.23)`);
    }
    if (filled)
        addNamesPending(state);
    for (const ev of r.events)
        request(state, ev.request);
}
function flashLightDrain(state: TickState, notes: string[]): void {
    const { world, env } = state;
    const LIGHT = env.LIGHT;
    const p = world.player;
    if (!lightCarried(p.passive, LIGHT))
        return;
    if (((world.core.phase + LIGHT.DRAIN_PHASE) & LIGHT.DRAIN_MASK) !== 0)
        return;
    const slotIndex = p.passive.flash_light;
    const inventory = world.inventory.map((s) => ({ item: s.item.value, amount: s.amount }));
    const slot = inventory[slotIndex];
    if (slot === undefined)
        throw new RefusedError(`player.passive.flash_light ${slotIndex} names no inventory slot`);
    if (slot.item !== LIGHT.ITEM)
        notes.push(`step 20: the slot ${slotIndex} player.passive.flash_light names holds item ${slot.item}, not the flash light (4.9a): drained as the slot it names`);
    const used = state.weapon ? state.weapon.slots : inventory.filter((s) => s.item !== 0).length;
    if (u16(slot.amount) <= LIGHT.DRAIN_STEP) {
        const found = slot.amount;
        slot.item = 0;
        slot.amount = 0;
        p.passive.flash_light = LIGHT.ABSENT;
        writeInventory(state, inventory, used - 1);
        applyFloorConfiguration(state);
        notes.push(`step 20: the flash light's drain found ${found}, at most ${LIGHT.DRAIN_STEP}: removed (slot ${slotIndex} emptied, the used count ${used} -> ${used - 1}, the view distance ${state.hidden.viewDistance})`);
        return;
    }
    slot.amount -= LIGHT.DRAIN_STEP;
    writeInventory(state, inventory, used);
}
function nightVisionDrain(state: TickState, notes: string[]): void {
    const { world, env } = state;
    const LIGHT = env.LIGHT;
    const p = world.player;
    if (!nightCarried(p.passive, LIGHT))
        return;
    if (((world.core.phase + LIGHT.NIGHT_VISION_PHASE) & LIGHT.DRAIN_MASK) !== 0)
        return;
    const slotIndex = p.passive.night_vision;
    const inventory = world.inventory.map((s) => ({ item: s.item.value, amount: s.amount }));
    const slot = inventory[slotIndex];
    if (slot === undefined)
        throw new RefusedError(`player.passive.night_vision ${slotIndex} names no inventory slot`);
    if (slot.item !== LIGHT.NIGHT_VISION_ITEM)
        notes.push(`step 20: the slot ${slotIndex} player.passive.night_vision names holds item ${slot.item}, not night vision (4.9b): drained as the slot it names`);
    const used = state.weapon ? state.weapon.slots : inventory.filter((s) => s.item !== 0).length;
    if (u16(slot.amount) <= LIGHT.DRAIN_STEP) {
        const found = slot.amount;
        slot.item = 0;
        slot.amount = 0;
        writeInventory(state, inventory, used - 1);
        const again = inventory.findIndex((s) => s.item === LIGHT.NIGHT_VISION_ITEM);
        p.passive.night_vision = again < 0 ? LIGHT.ABSENT : again;
        if (again < 0) {
            installPalette(state, false);
            applyFloorConfiguration(state);
        }
        notes.push(`step 20: night vision's drain found ${found}, at most ${LIGHT.DRAIN_STEP}: removed (slot ${slotIndex} emptied, the used count ${used} -> ${used - 1}, passive.night_vision ${p.passive.night_vision}, the view distance ${state.hidden.viewDistance})`);
        return;
    }
    slot.amount -= LIGHT.DRAIN_STEP;
    writeInventory(state, inventory, used);
}
function scannerCall(state: TickState, notes: string[], bobEye: number): void {
    const { env } = state;
    const p = state.world.player;
    const cell = { x: u16(p.pos.x) >> env.R.CELL_SHIFT, y: u16(p.pos.y) >> env.R.CELL_SHIFT };
    const remembered = state.hidden.cameraCell;
    const entered = cell.x !== remembered.x || cell.y !== remembered.y;
    if (entered)
        state.hidden.pickupStanding = false;
    if (!entered && !state.hidden.pickupStanding)
        return;
    state.hidden.cameraCell = cell;
    if (entered && (env.classOfBlock[state.blocks[cell.y * GRID_SIDE + cell.x]!] ?? -1) === env.EXT.FLAME_CLASS)
        burningCell(state, cell.x, cell.y, bobEye, notes);
    tileAction(state, notes, entered);
}
function controllerPoll(state: TickState, consoleByte: number, notes: string[]): number {
    const c = state.hidden.controller;
    if (c.mode === CONTROLLER_MODE.PAD)
        return consoleByte;
    if (c.mode !== CONTROLLER_MODE.PLAYBACK && c.mode !== CONTROLLER_MODE.ENDED_BY_START)
        throw new RefusedError(`controller.mode ${c.mode}: refused (3.1a)`);
    c.countdown = u16(c.countdown - 1);
    if (c.countdown === 0)
        state.hidden.transitionFlag = 1;
    if (c.mode === CONTROLLER_MODE.PLAYBACK) {
        if (((consoleByte >> PAD_BIT.START) & 1) !== 0) {
            state.hidden.transitionFlag = 1;
            c.mode = CONTROLLER_MODE.ENDED_BY_START;
            notes.push("step 6: Start is held in demo playback: the transition flag is set and the mode becomes 3 (3.1a)");
        }
        const demo = state.env.start.demos[state.world.level.episode.value];
        if (!demo)
            throw new RefusedError(`demo playback: no demo block of episode ${state.world.level.episode.value}`);
        const index = c.tapeOffset - TICK.DEMO_SEED_BYTES;
        const byte = demo.inputs[index];
        if (byte === undefined)
            throw new RefusedError(`demo playback: the reader at offset ${c.tapeOffset} is past the demo's ${demo.inputs.length} input bytes (3.1a)`);
        c.tapeOffset += 1;
        return byte;
    }
    c.tapeOffset += 1;
    return consoleByte;
}
export interface IterationPrologue {
    readonly pad: number;
    readonly mode: number;
    readonly blanksBeforeReload: number;
    readonly blanksBeforeReload1?: number;
    readonly notes: string[];
    readonly drawsBefore: number;
    readonly invBefore: readonly string[];
    readonly invBefore1?: readonly string[];
    readonly blanksTaken: number;
    readonly freshStart: boolean;
    readonly frozen?: boolean;
}
export interface PauseClosing {
    readonly exitBlanks: number;
    readonly vblanks?: number;
}
export type IterationOpening = {
    readonly kind: "done";
    readonly result: IterationResult;
} | {
    readonly kind: "paused";
    readonly screen: PauseScreen;
    readonly prologue: IterationPrologue;
};
export function tickIteration(state: TickState, inputs: IterationInputs): IterationResult {
    const pro = tickIterationPrologue(state, inputs);
    if (!pro.freshStart)
        return tickIterationEpilogue(state, inputs, pro, null, null);
    const il = inputs.interlude;
    if (il === undefined || il.kind !== "pause") {
        state.guardPairs = null;
        throw new RefusedError("a fresh press of Start (the pause screen, ZT-UI-PAUSE) without the interlude's frames: refused");
    }
    const screen = pauseScreenOpen(state, il.floorEntries, il.carriedEntry, il.gameCram ?? null);
    const frames: InterludeFrame[] = [];
    let closed = false;
    for (let i = 0; i < il.pads.length && !closed; i++) {
        const from = i === 0 ? 0 : state.events.length;
        const record = pauseFrameRecord(screen);
        const r = pauseFrame(screen, il.pads[i]!);
        for (const n of r.requests)
            request(state, n);
        if (r.closed) {
            closed = true;
            pauseResume(state);
        }
        frames.push({ frame: i, record, events: state.events.slice(from) });
    }
    if (!closed)
        pro.notes.push(`the pause screen's ${il.pads.length} frame(s) ran out without a fresh Start: the screen was not closed (ZT-UI-PAUSE 4.10)`);
    return tickIterationEpilogue(state, inputs, pro, { exitBlanks: il.exitBlanks }, { kind: "pause", frames, closed });
}
export function tickIterationOpen(state: TickState, inputs: IterationInputs, floorEntries: readonly string[], carriedEntry: string, gameCram: readonly number[] | null): IterationOpening {
    const pro = tickIterationPrologue(state, inputs);
    if (!pro.freshStart)
        return { kind: "done", result: tickIterationEpilogue(state, inputs, pro, null, null) };
    return { kind: "paused", screen: pauseScreenOpen(state, floorEntries, carriedEntry, gameCram), prologue: pro };
}
export function pauseRequests(state: TickState, requests: readonly number[]): void {
    for (const n of requests)
        request(state, n);
}
export function pauseResume(state: TickState): void {
    seatEvent(state, { type: "Audio.Resume" });
}
export function tickIterationClose(state: TickState, inputs: IterationInputs, opening: Extract<IterationOpening, {
    kind: "paused";
}>, closing: PauseClosing, frames: readonly InterludeFrame[]): IterationResult {
    return tickIterationEpilogue(state, inputs, opening.prologue, closing, { kind: "pause", frames, closed: true });
}
function pauseScreenOpen(state: TickState, floorEntries: readonly string[], carriedEntry: string, gameCram: readonly number[] | null): PauseScreen {
    const { env } = state;
    if (env.pause === null)
        throw new RefusedError("a fresh press of Start (the pause screen, ZT-UI-PAUSE): the environment has no pause assets (run the extractor's `pause` command)");
    seatEvent(state, { type: "Audio.Pause" });
    return pauseOpen(pauseInputsOf(state, floorEntries, carriedEntry, gameCram), env.pause.assets, env.pause.C);
}
export function seatPauseScreen(state: TickState, k: 0 | 1, floorEntries: readonly string[], carriedEntry: string): {
    screen: PauseScreen;
    driver: SoundDriver;
} | null {
    const pause = state.env.pause;
    if (pause === null)
        return null;
    const driver = structuredClone(k === 1 && state.seats !== undefined && state.seats.live !== 1 ? state.seats.sound1 ?? state.sound : state.sound);
    return inSeat(state, k, () => {
        const notes = state.guardPairs?.notes.length;
        const screen = pauseOpen(pauseInputsOf(state, floorEntries, carriedEntry, null), pause.assets, pause.C);
        if (notes !== undefined)
            state.guardPairs!.notes.length = notes;
        return { screen, driver };
    });
}
export function seatPauseRequests(state: TickState, driver: SoundDriver, requests: readonly number[], emit: (e: SoundEvent) => void): void {
    const o = state.world.options.sound;
    for (const n of requests)
        soundRequest(driver, state.env.sounds, n, { musicOn: o.music, sfxOn: o.sfx, voiceOn: o.pcm_voice, announcing: false, delayTimer: state.hidden.delayTimer }, emit);
}
function pauseInputsOf(state: TickState, floorEntries: readonly string[], carriedEntry: string, gameCram: readonly number[] | null): PauseInputs {
    const { world, env } = state;
    const cram = gameCram ?? state.lastPicture?.cram ?? null;
    const inputs: PauseInputs = {
        episode: world.level.episode.value,
        playerFloor: state.floorNumber,
        countedFloor: state.hidden.countedFloor,
        countdown: world.floor.secured_phase,
        pos: { x: s16(world.player.pos.x), y: s16(world.player.pos.y) },
        frame: world.core.frame,
        sfxOn: world.options.sound.sfx,
        cells: state.blocks,
        classOfBlock: env.classOfBlock,
        gameCram: cram === null ? new Array<number>(64).fill(0) : Array.from({ length: 64 }, (_, i) => cram[i] ?? 0),
        entries: Array.from({ length: Math.max(floorEntries.length, state.floorEntries.length) }, (_, f) => (state.floorEntries[f] ? state.floorEntries[f]! : floorEntries[f] ?? "")),
        carried: carriedEntry,
    };
    if (cram === null)
        state.guardPairs?.notes.push("the pause screen's set-up found no palette of the game's picture: lines 0, 1 and 3 are 0 (ZT-UI-PAUSE 4.3)");
    return inputs;
}
export const MISSING_PARTNER_TEXT = `a two-seat world's tick environment has no partner constants (PARTNER: ${PARTNER_PREFIX}* and REND.SPRITE.ENTITY_DISTANCE_MAX of rend_sprite.json, ZT-COOP 4.17)`;
export class MissingPartnerError extends Error {
    constructor() { super(MISSING_PARTNER_TEXT); this.name = "MissingPartnerError"; }
}
export function tickIterationPrologue(state: TickState, inputs: IterationInputs): IterationPrologue {
    if (state.seats !== undefined && state.env.PARTNER === undefined)
        throw new MissingPartnerError();
    const notes: string[] = [];
    state.display = noDisplay();
    if (state.seats !== undefined)
        state.seats.data.display = noDisplay();
    const invBefore = state.world.inventory.map((s) => `${s.item.value}:${s.amount}`);
    const invBefore1 = state.seats?.data.inventory.map((s) => `${s.item.value}:${s.amount}`);
    const drawsBefore = state.rng.count;
    state.events.length = 0;
    if (state.seats?.pending !== undefined)
        for (const ev of state.seats.pending.splice(0))
            coopEvent(state, ev);
    state.guardPairs = inputs.guards === undefined ? null : { pairs: inputs.guards, next: 0, notes };
    try {
        const pro = tickPrologueBody(state, inputs, notes, drawsBefore, invBefore);
        return invBefore1 === undefined ? pro : { ...pro, invBefore1 };
    }
    catch (err) {
        state.guardPairs = null;
        throw err;
    }
}
export function tickIterationEpilogue(state: TickState, inputs: IterationInputs, pro: IterationPrologue, pause: PauseClosing | null, interlude: InterludeResult | null): IterationResult {
    try {
        const res = tickEpilogueBody(state, inputs, pro, pause, interlude);
        state.world.inventory.forEach((s, i) => {
            if (`${s.item.value}:${s.amount}` !== pro.invBefore[i])
                state.display.cardsChanged.push(s.slot);
        });
        const seats = state.seats;
        if (seats !== undefined && pro.invBefore1 !== undefined) {
            seats.data.inventory.forEach((s, i) => {
                if (`${s.item.value}:${s.amount}` !== pro.invBefore1![i])
                    seats.data.display.cardsChanged.push(s.slot);
            });
        }
        return res;
    }
    finally {
        if (state.guardPairs !== null && state.guardPairs.next < state.guardPairs.pairs.length)
            pro.notes.push(`pads.jsonl gives ${state.guardPairs.pairs.length} guard pair(s) for the iteration but its steps made ${state.guardPairs.next} request(s) (4.2)`);
        state.guardPairs = null;
    }
}
function tickPrologueBody(state: TickState, inputs: IterationInputs, notes: string[], drawsBefore: number, invBefore: readonly string[]): IterationPrologue {
    const { world, env } = state;
    if (state.seats !== undefined && seatsFrozen(state, inputs)) {
        const s = state.seats;
        const mode = state.hidden.controller.mode;
        const fresh0 = !s.out[0] && !s.pause[0] && mode === CONTROLLER_MODE.PAD && ((inputs.pad >> PAD_BIT.START) & 1) !== 0 && ((inputs.prev >> PAD_BIT.START) & 1) === 0;
        return { pad: inputs.pad, mode, blanksBeforeReload: 0, notes, drawsBefore, invBefore, blanksTaken: inputs.vblanks, freshStart: fresh0, frozen: true };
    }
    sniperFlashTurn(state.hidden.sniper, world.player.angle, env.sniper);
    if (world.floor.secured_phase === 0 && world.core.phase % TICK.RECOUNT_PERIOD === 0) {
        recount(state, notes, `step 1: the enemy recount (phase ${world.core.phase})`);
    }
    if (world.level.episode.value === TICK.TILES.EPISODE) {
        const sel = tilePass(state.hidden.tiles, state.rng);
        const skyAssets = env.sky?.assets;
        if (state.sky && skyAssets && skyAssets.twinkleFrames && skyAssets.twinklePattern && env.sky) {
            twinkleCopy(state.sky.tiles, skyAssets.tileBase, sel.index, sel.group.counter, sel.group.offset, sel.group.phase, skyAssets.twinkleFrames, skyAssets.twinklePattern, TICK.TILES.PAIRS, env.sky.C);
        }
    }
    chainCountdown(state);
    const msgBefore = { counter: state.message.displayCounter, next: state.message.queue[0] };
    const n = inputs.vblanks;
    const timerBefore = s16(world.message.voice_timer);
    const firstGuard = state.guardPairs?.pairs[0];
    const afterPaletteWrite = state.hidden.paletteWrittenAtPickup === true;
    state.hidden.paletteWrittenAtPickup = false;
    const bCandidate = state.hidden.delayTimer !== 0 && firstGuard !== undefined ? Math.max(0, Math.min(n, state.hidden.delayTimer - firstGuard[0])) : afterPaletteWrite && n > 0 ? 1 : 0;
    let reloadRequests = 0;
    const afterStep = s16(floorMessageStep(state.message, s16(timerBefore - bCandidate), world.options.sound.voice_announce, env.P, (ev) => {
        reloadRequests++;
        messageVoice(state, ev.request);
    }));
    const blanksBeforeReload = reloadRequests > 0 ? bCandidate : 0;
    world.message.voice_timer = reloadRequests > 0 ? afterStep : timerBefore;
    if (blanksBeforeReload !== 0)
        notes.push(`step 3: ${blanksBeforeReload} blank(s) fell before the reload of message.voice_timer (the delay timer ${state.hidden.delayTimer} at the boundary, the request's guard ${firstGuard?.[0] ?? "not given: a live run"}): the reload takes ${n - blanksBeforeReload}`);
    if (msgBefore.counter === 0 && msgBefore.next !== undefined)
        state.display.message = { kind: "pop", rows: [...msgBefore.next.rows] };
    else if (msgBefore.counter !== 0 && state.message.displayCounter === 0)
        state.display.message = { kind: "clear" };
    skyStep(state);
    if (inputs.flashFall !== undefined && state.hit.flash !== 0) {
        state.hit.flash = Math.max(0, state.hit.flash - inputs.flashFall);
        state.display.flashEntry = state.hit.flash;
    }
    if (state.hidden.deathCounter !== 0) {
        const D = env.death;
        state.hidden.deathFlash = deathFlashStep(state.hidden.deathFlash, D);
        state.display.flashEntry = state.hidden.deathFlash & D["FLASH.CRAM_MASK"];
    }
    const blanksBeforeReload1 = state.seats !== undefined && !state.seats.out[1] ? seat1Prologue(state, bCandidate, inputs) : 0;
    state.hidden.delayTimer = Math.max(0, state.hidden.delayTimer - n);
    const mode = state.hidden.controller.mode;
    const pad = controllerPoll(state, inputs.pad, notes);
    world.core.phase = u16(world.core.phase + TICK.PHASE_ADVANCE);
    animWallsStep(state.animWalls);
    if (state.seats !== undefined)
        animWallsStep(state.seats.data.animWalls);
    const startNow = ((pad >> PAD_BIT.START) & 1) !== 0;
    const startBefore = ((inputs.prev >> PAD_BIT.START) & 1) !== 0;
    const freshStart = startNow && !startBefore && mode === CONTROLLER_MODE.PAD;
    return { pad, mode, blanksBeforeReload, blanksBeforeReload1, notes, drawsBefore, invBefore, blanksTaken: n, freshStart };
}
function residentFloor(state: TickState, floor: number): void {
    if (state.floorNumber === floor)
        return;
    const parked = state.blocks.slice();
    const next = blocksOfFloor(state, floor);
    state.earlierFloors.set(state.floorNumber, parked);
    state.earlierFloors.delete(floor);
    state.blocks.splice(0, state.blocks.length, ...next);
    state.floorNumber = floor;
}
export function inSeat<T>(state: TickState, k: 0 | 1, fn: () => T): T {
    const seats = state.seats;
    if (seats === undefined || seats.live === k)
        return fn();
    const resident = (floor: number): void => residentFloor(state, floor);
    swapSeat(state, seats, resident);
    try {
        return fn();
    }
    finally {
        swapSeat(state, seats, resident);
    }
}
function pickSeat(state: TickState, e: Entity): 0 | 1 {
    const seats = state.seats!;
    if (seats.out[0])
        return 1;
    if (seats.out[1] || seats.data.floorNumber !== e.floor)
        return 0;
    if (state.floorNumber !== e.floor)
        return 1;
    const p0 = state.world.player.pos;
    const p1 = seats.data.player.pos;
    return octDist(s16(e.pos.x - p1.x), s16(e.pos.y - p1.y)) < octDist(s16(e.pos.x - p0.x), s16(e.pos.y - p0.y)) ? 1 : 0;
}
function seatsFrozen(state: TickState, _inputs: IterationInputs): boolean {
    seat1PauseEdge(state);
    const s = state.seats!;
    return s.pause[0] || s.pause[1];
}
export function seat1PauseEdge(state: TickState): void {
    const s = state.seats!;
    const edge = !s.out[1] && ((s.pad1 >> PAD_BIT.START) & 1) !== 0 && ((s.prev1 >> PAD_BIT.START) & 1) === 0;
    s.prev1 = s.pad1;
    if (edge) {
        s.pause[1] = !s.pause[1];
        coopEvent(state, { type: "Coop.Pause", seat: 1, on: s.pause[1] });
    }
}
function seat1Prologue(state: TickState, bCandidate: number, inputs: IterationInputs): number {
    const { env } = state;
    const seats = state.seats!;
    const timerBefore1 = s16(seats.voiceTimer1 ?? state.world.message.voice_timer);
    let reloads1 = 0;
    inSeat(state, 1, () => {
        const msgBefore = { counter: state.message.displayCounter, next: state.message.queue[0] };
        const after1 = floorMessageStep(state.message, s16(timerBefore1 - bCandidate), state.world.options.sound.voice_announce, env.P, (ev) => { reloads1++; messageVoice(state, ev.request); });
        seats.voiceTimer1 = reloads1 > 0 ? s16(after1) : timerBefore1;
        if (msgBefore.counter === 0 && msgBefore.next !== undefined)
            state.display.message = { kind: "pop", rows: [...msgBefore.next.rows] };
        else if (msgBefore.counter !== 0 && state.message.displayCounter === 0)
            state.display.message = { kind: "clear" };
        skyStep(state);
        if (inputs.flashFall !== undefined && state.hit.flash !== 0) {
            state.hit.flash = Math.max(0, state.hit.flash - inputs.flashFall);
            state.display.flashEntry = state.hit.flash;
        }
        if (state.hidden.deathCounter !== 0) {
            state.hidden.deathFlash = deathFlashStep(state.hidden.deathFlash, env.death);
            state.display.flashEntry = state.hidden.deathFlash & env.death["FLASH.CRAM_MASK"];
        }
    });
    return reloads1 > 0 ? bCandidate : 0;
}
function seat1End(state: TickState, notes: string[]): void {
    const { env } = state;
    const D = env.death;
    if (!deathTest(state.world.player.hp, D))
        return;
    if (state.hidden.deathCounter === 0) {
        state.hidden.deathCounter = D.COUNTER_START;
        state.hidden.deathFlash = D["FLASH.START"];
    }
    else {
        state.hidden.deathCounter += 1;
    }
    if (state.hidden.deathCounter >= D.COUNTER_LIMIT) {
        const seats = state.seats!;
        if (seats.handOver1 === true)
            return;
        const alive = deathStrikeOff(state);
        if (alive.some((a) => a !== 0)) {
            seats.handOver1 = true;
            notes.push("T4: seat 1 reached the hand-over: its character switch follows (ZT-COOP 4.13 item 2; the world holds until it returns)");
        }
        else {
            seats.out[1] = true;
            seats.pause[1] = false;
            coopEvent(state, { type: "Seat.Out", seat: 1, reason: "dead" });
            notes.push("T4: seat 1's last character died: it leaves the play (ZT-COOP 4.13 item 4)");
        }
    }
}
export function loseSeat(state: TickState, k: 0 | 1): void {
    const s = state.seats;
    if (s === undefined)
        return;
    s.out[k] = true;
    s.pause[k] = false;
    if (k === 1)
        s.handOver1 = false;
    (s.pending ??= []).push({ type: "Seat.Out", seat: k, reason: "lost" });
    const lost = s.lost ?? [false, false];
    lost[k] = true;
    s.lost = lost;
    const body = state.env.death.COUNTER_LIMIT - 1;
    if (s.live === k)
        state.hidden.deathCounter = body;
    else
        s.data.deathCounter = body;
}
export function seatOut(state: TickState, seat: 1): void {
    const s = state.seats;
    if (s === undefined)
        return;
    s.out[seat] = true;
    s.pause[seat] = false;
}
type MoveStepResult = ReturnType<typeof moveStep>;
function modernOf(state: TickState): ModernConstants {
    const MD = state.env.MODERN;
    if (MD === undefined)
        throw new Error("a Modern seat needs the environment's MODERN constants (player_modern)");
    return MD;
}
function skyStep(state: TickState): void {
    if (!state.sky || !state.env.sky)
        return;
    const m = state.modern;
    if (m !== undefined && m.skyWhole) {
        m.skyWhole = false;
        skyRedrawWhole(state.sky, state.world.player.angle, state.env.sky.assets, state.env.sky.C);
    }
    else
        skyTick(state.sky, state.world.player.angle, state.env.sky.assets, state.env.sky.C);
}
function playerStep(state: TickState, pad: number, _notes: string[]): MoveStepResult {
    const { world, env } = state;
    const dying = state.hidden.deathCounter !== 0;
    weaponPressOfC(state, pad);
    const kinds = floorKindsOf(classesOf(state), env.M);
    const m = state.modern;
    const MD = m !== undefined ? modernOf(state) : null;
    const hook = m !== undefined && MD !== null ? { input: m.input, prev: m.prev, cap: turnCapOf(m.turnCap, MD), MD } : null;
    const step = moveStep(state.player, padOfByte(pad), kinds, env.view, env.M, dying, hook);
    if (m !== undefined && MD !== null) {
        m.prev = m.input;
        if (step.angleDelta !== undefined && Math.abs(step.angleDelta) > MD.TURN_CAP_ORIGINAL)
            m.skyWhole = true;
    }
    const p = world.player;
    const mp = state.player;
    p.pos.x = mp.x;
    p.pos.y = mp.y;
    p.angle = mp.angle;
    p.speed.forward = mp.forward;
    p.speed.side = mp.side;
    p.eye_offset = mp.eyeOffset;
    p.jump_timer = mp.jumpTimer;
    p.z_vel = mp.zVel;
    p.bob_acc = mp.bobAcc;
    p.knockback.x = mp.knockbackX;
    p.knockback.y = mp.knockbackY;
    const opened = doorOpener(state.doors, p.pos.x, p.pos.y, state.floorNumber, env.D);
    if (opened !== null)
        withSoundSource(state, { floor: state.floorNumber, at: () => doorCentre(env, state.doors.queue[state.doors.queue.length - 1]!.cell), key: `c${state.doors.queue[state.doors.queue.length - 1]!.cell.join(",")}` }, () => request(state, requestOfEffect(env.sounds, opened.id, opened.note)));
    return step;
}
function viewStage(state: TickState, pad: number, step: MoveStepResult, notes: string[]): {
    bobAngle: number;
    bobEye: number;
} {
    const { world, env } = state;
    const p = world.player;
    if (step.footstep !== null)
        request(state, requestOfEffect(env.sounds, step.footstep.id, step.footstep.note));
    const bobAngle = step.bob === null ? 0 : step.bob.angle;
    const bobEye = step.bob === null ? 0 : step.bob.eye;
    const bobbedAngle = ((p.angle + bobAngle) % env.M.ANGLE.UNITS + env.M.ANGLE.UNITS) % env.M.ANGLE.UNITS;
    const left = pictureCall(state, bobbedAngle, notes);
    const pic = picture(state, bobbedAngle, p.eye_offset + bobEye, notes, left);
    scannerCall(state, notes, bobEye);
    state.scannerBlocks = state.blocks.slice();
    weaponBlock(state, pad, bobbedAngle, bobAngle, bobEye, pic, notes);
    sniperPresent(state, bobbedAngle, bobEye, notes);
    return { bobAngle, bobEye };
}
function drainStage(state: TickState, bobAngle: number, notes: string[]): void {
    const { world, env } = state;
    flashLightDrain(state, notes);
    nightVisionDrain(state, notes);
    if (lightCarried(world.player.passive, env.LIGHT))
        state.hidden.beamFirst = beamFirstOf(env, bobAngle);
}
function tickEpilogueBody(state: TickState, inputs: IterationInputs, pro: IterationPrologue, pause: PauseClosing | null, interlude: InterludeResult | null): IterationResult {
    const { world, env } = state;
    const { pad, notes, drawsBefore, blanksBeforeReload } = pro;
    if (pro.frozen === true)
        return { notes, draws: 0, pad, ended: false, bob: null, events: [...state.events], display: state.display, interlude };
    const n = pause?.vblanks ?? inputs.vblanks;
    if (n > pro.blanksTaken)
        state.hidden.delayTimer = Math.max(0, state.hidden.delayTimer - (n - pro.blanksTaken));
    if (pause !== null) {
        applyFloorConfiguration(state);
        installPalette(state, nightCarried(world.player.passive, env.LIGHT));
    }
    const seats = state.seats;
    const in0 = seats === undefined || !seats.out[0];
    const step = in0 ? playerStep(state, pad, notes) : null;
    const p = world.player;
    const two = seats !== undefined && !seats.out[1];
    const step1 = two ? inSeat(state, 1, () => playerStep(state, seats!.pad1 & 0xff, notes)) : null;
    entityPass(state, notes);
    const view0 = step !== null ? viewStage(state, pad, step, notes) : null;
    const view1 = two ? inSeat(state, 1, () => viewStage(state, seats!.pad1 & 0xff, step1!, notes)) : null;
    if (seats !== undefined && COOP_ONE_CAB.on)
        cabJoin(state, notes);
    const bobAngle = view0?.bobAngle ?? 0;
    const alive = world.entities.filter((e) => (e.flags.value & FLAG_ALIVE) !== 0);
    const other = two && in0 ? seats!.data.player.pos : null;
    const walkerPos = in0 ? p.pos : seats!.data.player.pos;
    const queued = [...state.doors.queue];
    const closed = doorWalker(state.doors, walkerPos.x, walkerPos.y, (entry) => {
        const x0 = entry.cell[0] * env.M.POS.CELL;
        const y0 = entry.cell[1] * env.M.POS.CELL;
        const inBox = (x: number, y: number): boolean => x >= x0 && x <= x0 + env.D.BOX - 1 && y >= y0 && y <= y0 + env.D.BOX - 1;
        return alive.some((e) => inBox(e.pos.x, e.pos.y)) || (other !== null && inBox(other.x, other.y));
    }, env.D);
    const removed = queued.filter((q) => !state.doors.queue.includes(q));
    closed.forEach((s, i) => withSoundSource(state, { floor: removed[i]?.floor ?? state.floorNumber, ...(removed[i] !== undefined ? { at: () => doorCentre(env, removed[i]!.cell), key: `c${removed[i]!.cell.join(",")}` } : {}) }, () => request(state, requestOfEffect(env.sounds, s.id, s.note))));
    if (in0)
        drainStage(state, bobAngle, notes);
    if (two)
        inSeat(state, 1, () => drainStage(state, view1!.bobAngle, notes));
    if (state.hidden.exitCountdown !== 0) {
        state.hidden.exitCountdown -= 1;
        if (state.hidden.exitCountdown === 0) {
            state.hidden.transitionFlag = 1;
            notes.push("T2: the exit countdown reached 0: the transition flag is set; what follows the loop is the level end (out of scope)");
        }
    }
    world.core.frame = u16(world.core.frame + TICK.BLANK.FRAME * n);
    world.message.voice_timer = s16(world.message.voice_timer + TICK.BLANK.VOICE * (n - blanksBeforeReload));
    if (state.seats !== undefined && state.seats.voiceTimer1 !== undefined)
        state.seats.voiceTimer1 = s16(state.seats.voiceTimer1 + TICK.BLANK.VOICE * (n - (pro.blanksBeforeReload1 ?? 0)));
    if (pause === null)
        world.link.health = u16(world.link.health + TICK.BLANK.LINK * n);
    else {
        const C = env.pause!.C;
        world.link.health = u16(TICK.BLANK.LINK * Math.max(0, pause.exitBlanks - C.EXIT.BLANKS_BEFORE_CLEAR));
    }
    world.core.rng.seed = state.rng.state;
    if (state.hidden.transitionFlag !== 0) {
        state.hidden.transitionFlag = 0;
        return { notes, draws: state.rng.count - drawsBefore, pad, ended: true, bob: step?.bob ?? null, ...(step1 !== null ? { bob1: step1.bob } : {}), events: [...state.events], display: state.display, interlude };
    }
    const D = env.death;
    if (in0 && deathTest(p.hp, D)) {
        if (state.hidden.deathCounter === 0) {
            state.hidden.deathCounter = D.COUNTER_START;
            state.hidden.deathFlash = D["FLASH.START"];
        }
        else {
            state.hidden.deathCounter += 1;
        }
        if (state.hidden.deathCounter >= D.COUNTER_LIMIT) {
            let h: HandOverResult | undefined;
            let refused: unknown;
            try {
                h = deathHandOver(state, inputs, pro, n, notes);
            }
            catch (err) {
                refused = err;
            }
            if (seats !== undefined && CHARACTER_BY_INDEX.every((nm) => !world.team.alive[nm]))
                coopEvent(state, { type: "Seat.Out", seat: 0, reason: "dead" });
            if (two)
                inSeat(state, 1, () => seat1End(state, notes));
            if (refused !== undefined)
                throw refused;
            if (h === undefined)
                throw new Error("unreachable");
            return { notes, draws: state.rng.count - drawsBefore, pad, ended: h.ended, bob: step?.bob ?? null, ...(step1 !== null ? { bob1: step1.bob } : {}), events: [...state.events], display: state.display, interlude: h.interlude };
        }
    }
    if (two)
        inSeat(state, 1, () => seat1End(state, notes));
    return { notes, draws: state.rng.count - drawsBefore, pad, ended: false, bob: step?.bob ?? null, ...(step1 !== null ? { bob1: step1.bob } : {}), events: [...state.events], display: state.display, interlude };
}
function sniperBullet(state: TickState, weapon: number, bobAngle: number, notes: string[]): void {
    const { world, env } = state;
    const C = env.sniper;
    if (world.level.episode.value !== C.EPISODE)
        return;
    const cell = state.hidden.cameraCell;
    const inside = cell.x >= 0 && cell.y >= 0 && cell.x < GRID_SIDE && cell.y < GRID_SIDE;
    const cls = inside ? env.classOfBlock[state.blocks[cell.y * GRID_SIDE + cell.x]!] ?? -1 : -1;
    const a = C.AIM_COLUMN_BASE + bobAngle * (weapon === env.W.W_LASER ? 2 : 1);
    if (sniperBulletTest(state.hidden.sniper, world.level.sub_id, cls, world.player.eye_offset, a, C))
        notes.push(`step 17: a shot at the sniper (aim column ${a}): the attack ends in four iterations (ZT-WORLD-SNIPER 4.10)`);
}
function sniperPresent(state: TickState, angle: number, bobEye: number, notes: string[]): void {
    const { world, env } = state;
    state.sniperSprites = [];
    if (world.level.episode.value !== env.sniper.EPISODE)
        return;
    const C = env.sniper;
    const sn = state.hidden.sniper;
    const p = world.player;
    const cell = state.hidden.cameraCell;
    const inside = cell.x >= 0 && cell.y >= 0 && cell.x < GRID_SIDE && cell.y < GRID_SIDE;
    const cls = inside ? env.classOfBlock[state.blocks[cell.y * GRID_SIDE + cell.x]!] ?? -1 : -1;
    const eye = s16(p.eye_offset + bobEye);
    const it = sniperSequencer(sn, cls, eye, () => state.rng.next(), C);
    if (it !== null) {
        for (const r of it.requests)
            request(state, r);
        for (const c of it.checks)
            notes.push(`step 17: sniper tick ${it.tick}: hit check on class ${c.cls} (eye ${eye}): ${c.hit ? "hit" : c.covered ? "covered" : "no trigger class"} (ZT-WORLD-SNIPER 4.6)`);
        for (const hit of it.hits) {
            const h: HitPlayer = { ...hitPlayerOf(state), eyeOffset: eye };
            playerHit(h, state.hit, hit, env.H);
            writeHitPlayer(state, h);
            drainHitMessages(state);
        }
        if (it.ended)
            notes.push("step 17: the sniper attack ended (ZT-WORLD-SNIPER 4.7)");
        if (it.streak !== null)
            state.sniperSprites.push(sniperShotSprite(sn, it.streak, p.angle, angle, p.pos.y, C));
    }
    const flash = sniperFlashStep(sn, C);
    if (flash.sprite !== null)
        state.sniperSprites.push(flash.sprite);
    if (flash.blast)
        request(state, C.SOUND_BLAST);
    const figure = sniperFigure(sn, angle, p.pos.y, C);
    if (figure !== null)
        state.sniperSprites.push(figure);
}
interface HandOverResult {
    readonly ended: boolean;
    readonly interlude: InterludeResult;
}
function deathHandOver(state: TickState, inputs: IterationInputs, pro: IterationPrologue, n: number, notes: string[]): HandOverResult {
    const { world, env } = state;
    const D = env.death;
    const il = inputs.interlude;
    if (world.entities.length > 0)
        notes.push(`the hand-over's entity flag write (ZT-GAME-DEATH 4.4 item 1, 9.3) is in no record: not modelled for the ${world.entities.length} entities of the chain`);
    const alive = deathStrikeOff(state);
    if (alive.every((a) => a === 0)) {
        if (il === undefined || il.kind !== "game_over")
            throw new RefusedError("the last member died (ZT-GAME-DEATH 4.7, the game over): a recorded run must give the game_over interlude's frames; a live run drives them with deathGameOverOpen()");
        const screen = deathGameOverOpen(state);
        const frames: InterludeFrame[] = [];
        let closed = false;
        let endFrame = -1;
        for (let i = 0; i < il.pads.length && !closed; i++) {
            const from = i === 0 ? 0 : state.events.length;
            deathGameOverFrame(state, screen, il.pads[i]!);
            frames.push({ frame: i, record: { display: screen.display, cram: screen.cram, indices: screen.indices() }, events: state.events.slice(from) });
            if (screen.finished) {
                closed = true;
                endFrame = i;
            }
        }
        if (!closed)
            notes.push(`the game over's ${il.pads.length} frame(s) ran out before the crawl's exit (ZT-GAME-DEATH 4.7)`);
        return { ended: true, interlude: { kind: "game_over", frames, closed, endFrame } };
    }
    if (il === undefined || il.kind !== "select")
        throw new RefusedError("a death with members left (ZT-GAME-DEATH 4.4, the select): a recorded run must give the select interlude's frames; a live run drives them with deathSelectOpen()");
    const sel = deathSelectOpen(state);
    const frames: InterludeFrame[] = [];
    let closed = false;
    let endFrame = -1;
    let pace: LevelStartScreen | null = null;
    let paceFirst = 0;
    for (let i = 0; i < il.pads.length; i++) {
        const from = i === 0 ? 0 : state.events.length;
        if (!closed) {
            deathSelectFrame(state, sel.screen, il.pads[i]!);
            if (sel.screen.finished) {
                closed = true;
                endFrame = i;
                deathRestart(state, sel.carried, sel.screen.exit!.character, { restartSeed: il.restartSeed, deathCellMark: il.deathCellMark, blanksAfter: n - (il.entryBlanks + i) }, notes);
                const target = il.levelPalette ? il.levelPalette(state.lastPicture?.cram ?? []) : (state.lastPicture?.cram ?? []);
                const rp = il.restartPace ?? { offFirst: START_SCREEN_OFF_FIRST, onFrame: START_SCREEN_FADE_START };
                pace = new LevelStartScreen({ indices: new Uint8Array(0), cram: target }, { a: rp.offFirst, tf: rp.onFrame, tl: rp.onFrame - 1 });
                paceFirst = i;
                frames.push({ frame: i, record: { display: sel.screen.display, cram: sel.screen.cram, indices: sel.screen.indices() }, events: state.events.slice(from) });
                continue;
            }
            frames.push({ frame: i, record: { display: sel.screen.display, cram: sel.screen.cram, indices: sel.screen.indices() }, events: state.events.slice(from) });
        }
        else {
            const t = i - paceFirst;
            const f = pace!.frame(Math.min(t, pace!.frames - 1));
            const lit = t === (il.restartPace ?? { onFrame: START_SCREEN_FADE_START }).onFrame;
            frames.push({ frame: i, record: { display: lit ? 1 : f.display, cram: lit ? new Array<number>(f.cram.length).fill(0) : f.cram, indices: null }, events: state.events.slice(from) });
        }
    }
    if (!closed)
        notes.push(`the select's ${il.pads.length} frame(s) ran out before a living card was confirmed (ZT-GAME-DEATH 4.4): no restart`);
    void pro;
    return { ended: false, interlude: { kind: "select", frames, closed, endFrame } };
}
const START_SCREEN_OFF_FIRST = START_SCREEN.OFF_FIRST;
const START_SCREEN_FADE_START = START_SCREEN.FADE_START;
function deathStrikeOff(state: TickState): number[] {
    const { world, env } = state;
    const D = env.death;
    seatEvent(state, { type: "Audio.StopTrack", id: world.level.episode.value });
    const dead = world.player.character.value;
    const name = CHARACTER_BY_INDEX[dead];
    if (name !== undefined)
        world.team.alive[name] = D["HANDOVER.ALIVE_AFTER"] !== 0;
    return CHARACTER_BY_INDEX.map((nm) => (world.team.alive[nm] ? 1 : 0));
}
export interface DeathSelect {
    readonly screen: CharselCore;
    readonly carried: ReturnType<typeof carriedOf>;
}
export function deathSelectOpen(state: TickState): DeathSelect {
    const { world, env } = state;
    const D = env.death;
    if (env.charsel === null)
        throw new RefusedError("the hand-over's character select (ZT-UI-CHARSEL): the environment has no select assets");
    const alive = CHARACTER_BY_INDEX.map((nm) => (world.team.alive[nm] ? 1 : 0));
    const carried = carriedOf(world.inventory.map((s) => ({ item: s.item.value, amount: s.amount })), ROUND, D);
    const screen = new CharselCore(env.charsel.assets, env.charsel.C);
    const dead = world.player.character.value;
    const cursor = D["HANDOVER.CURSOR"] === 0 ? dead : Math.max(0, alive.findIndex((a) => a !== 0));
    screen.reset(cursor, alive);
    return { screen, carried };
}
export function deathSelectFrame(state: TickState, screen: CharselCore, pad: number): void {
    const sink: EventSink = {
        emit: (e: GameEvent) => {
            const ev = e as unknown as {
                type: string;
                request?: number;
            };
            if (ev.type === "Audio.Request" && typeof ev.request === "number")
                request(state, ev.request);
            else
                seatEvent(state, ev as unknown as SoundEvent);
        },
    };
    screen.tick(pad, sink);
}
export interface RestartInputs {
    readonly restartSeed: number | null;
    readonly deathCellMark: number | null;
    readonly blanksAfter: number;
}
export function deathRestart(state: TickState, carried: ReturnType<typeof carriedOf>, character: number, inputs: RestartInputs, notes: string[]): void {
    const { world, env } = state;
    const D = env.death;
    request(state, world.level.episode.value);
    if (inputs.restartSeed !== null)
        world.core.rng.seed = inputs.restartSeed >>> 0;
    else {
        world.core.rng.seed = state.rng.state;
        notes.push("the restart's reseed reads the video chip's counter (ZT-GAME-DEATH 4.5 item 2): a live run keeps the generator's state");
    }
    world.player.hp = D["RESTART.HP"];
    const deathCell = { x: u16(world.player.pos.x) >> env.R.CELL_SHIFT, y: u16(world.player.pos.y) >> env.R.CELL_SHIFT };
    const mark = markerCell(state.blocks, GRID_SIDE, deathCell, D);
    if (mark !== null && inputs.deathCellMark !== null)
        state.blocks[mark] = inputs.deathCellMark;
    else if (mark !== null)
        notes.push("the restart's marker byte (ZT-GAME-DEATH 4.5 item 4, DEATH.MARKER.BYTE_FIELD) is a value of the level no text gives: no marker written");
    const cell = restartCell(state.blocks, (b) => env.classOfBlock[b] ?? -1, D);
    const col = cell % GRID_SIDE;
    const row = Math.floor(cell / GRID_SIDE);
    const p = world.player;
    p.pos.x = col * env.M.POS.CELL + START.CELL_CENTRE;
    p.pos.y = row * env.M.POS.CELL + START.CELL_CENTRE;
    p.angle = 0;
    p.eye_offset = 0;
    p.z_vel = 0;
    p.jump_timer = 0;
    p.speed.forward = 0;
    p.speed.side = 0;
    p.knockback.x = 0;
    p.knockback.y = 0;
    p.bob_acc = 0;
    state.hidden.deathCounter = 0;
    state.hidden.deathFlash = 0;
    state.display.flashEntry = 0;
    state.hidden.delayTimer = 0;
    const chName = CHARACTER_BY_INDEX[character] ?? "unknown";
    p.character = { value: character, name: chName as unknown as typeof p.character.name };
    const loadout = env.start.loadouts[character] ?? [];
    const items = restartItems({
        carried,
        loadout,
        itemOf: (id) => env.start.items.get(id),
        isPassive: (id) => PASSIVE_ITEM_NAMES.includes((env.itemNames.get(id) ?? "") as (typeof PASSIVE_ITEM_NAMES)[number]),
        slotCount: RING.length,
        round: ROUND,
        episode: world.level.episode.value,
        floor: state.floorNumber,
    }, D);
    for (let s = 0; s < RING.length; s++) {
        const id = items.items[s]!;
        world.inventory[s] = { slot: s, item: { value: id, name: id === 0 ? "empty" : (env.itemNames.get(id) ?? "unknown") }, amount: items.amounts[s]! };
    }
    for (const nm of PASSIVE_ITEM_NAMES)
        p.passive[nm] = PASSIVE_ABSENT_SLOT;
    for (const [id, slot] of items.passiveSlot) {
        const nm = env.itemNames.get(id);
        if (nm !== undefined && (PASSIVE_ITEM_NAMES as readonly string[]).includes(nm))
            p.passive[nm as (typeof PASSIVE_ITEM_NAMES)[number]] = slot;
    }
    const pending = weaponOfItem(items.items[RING[0]!]!, env.W);
    p.weapon.current = { value: WEAPON_NONE, name: "none" };
    p.weapon.pending = { value: pending, name: weaponNameOf(pending, p.weapon.pending, env.W, env.itemNames) };
    world.link.health = 0;
    world.message.voice_timer = s16(TICK.BLANK.VOICE * Math.max(0, inputs.blanksAfter - D["RESTART.CLEAR_DELAY"]));
    const h = tickHidden(state) as SnapHiddenLine;
    const hidden: SnapHiddenLine = {
        ...h,
        tick: 0,
        core: { delay_timer: 0, exit_countdown: state.hidden.exitCountdown, transition_flag: 0 },
        player: { crouch_countdown: 0, death_counter: 0, turn_vel: 0 },
        weapon: { anim: 0, lowering: START.LOWERING, ring: [...RING], variant: 0 },
        render: { lane_eye_prev: 0 },
        hud: { camera_cell: [col, row], camera_cell_prev: [col, row] },
        sky: { column_index: state.sky?.columnOffset ?? 0, scroll_prev: 0, sub_pixel: 0, tile_counter: state.sky?.accumulator ?? 0 },
    };
    const fresh = tickStart(env, world, hidden, 0, notes, { message: messageStart(), sound: state.sound, animWalls: state.animWalls, lift: state.hidden.lift, sniper: state.hidden.sniper, kept: state.kept }, state.earlierFloors);
    fresh.player.lastFootstepPhase = null;
    const target = state as unknown as Record<string, unknown>;
    const source = fresh as unknown as Record<string, unknown>;
    for (const k of ["world", "blocks", "floorNumber", "player", "weapon", "doors", "sky", "hidden", "rng", "hit", "residue", "message", "animWalls", "earlierFloors"])
        target[k] = source[k];
    state.lastPicture = null;
    delete state.scannerBlocks;
    applyFloorConfiguration(state);
    firstPicture(state, notes);
}
export function seatRestart(state: TickState, carried: ReturnType<typeof carriedOf>, character: number, notes: string[]): void {
    const { world, env } = state;
    const D = env.death;
    request(state, world.level.episode.value);
    notes.push("ZT-COOP 4.13 item 3: a seat's restart in a two-seat session does not reseed the generator");
    world.player.hp = D["RESTART.HP"];
    const cell = restartCell(state.blocks, (b) => env.classOfBlock[b] ?? -1, D);
    const col = cell % GRID_SIDE;
    const row = Math.floor(cell / GRID_SIDE);
    const p = world.player;
    p.pos.x = col * env.M.POS.CELL + START.CELL_CENTRE;
    p.pos.y = row * env.M.POS.CELL + START.CELL_CENTRE;
    p.angle = 0;
    p.eye_offset = 0;
    p.z_vel = 0;
    p.jump_timer = 0;
    p.speed.forward = 0;
    p.speed.side = 0;
    p.knockback.x = 0;
    p.knockback.y = 0;
    p.bob_acc = 0;
    state.hidden.deathCounter = 0;
    state.hidden.deathFlash = 0;
    state.display.flashEntry = 0;
    const chName = CHARACTER_BY_INDEX[character] ?? "unknown";
    p.character = { value: character, name: chName as unknown as typeof p.character.name };
    const items = restartItems({
        carried,
        loadout: env.start.loadouts[character] ?? [],
        itemOf: (id) => env.start.items.get(id),
        isPassive: (id) => PASSIVE_ITEM_NAMES.includes((env.itemNames.get(id) ?? "") as (typeof PASSIVE_ITEM_NAMES)[number]),
        slotCount: RING.length,
        round: ROUND,
        episode: world.level.episode.value,
        floor: state.floorNumber,
    }, D);
    for (let s = 0; s < RING.length; s++) {
        const id = items.items[s]!;
        world.inventory[s] = { slot: s, item: { value: id, name: id === 0 ? "empty" : (env.itemNames.get(id) ?? "unknown") }, amount: items.amounts[s]! };
    }
    for (const nm of PASSIVE_ITEM_NAMES)
        p.passive[nm] = PASSIVE_ABSENT_SLOT;
    for (const [id, slot] of items.passiveSlot) {
        const nm = env.itemNames.get(id);
        if (nm !== undefined && (PASSIVE_ITEM_NAMES as readonly string[]).includes(nm))
            p.passive[nm as (typeof PASSIVE_ITEM_NAMES)[number]] = slot;
    }
    const pending = weaponOfItem(items.items[RING[0]!]!, env.W);
    p.weapon.current = { value: WEAPON_NONE, name: "none" };
    p.weapon.pending = { value: pending, name: weaponNameOf(pending, p.weapon.pending, env.W, env.itemNames) };
    const h = tickHidden(state) as SnapHiddenLine;
    const hidden: SnapHiddenLine = {
        ...h,
        tick: 0,
        core: { delay_timer: state.hidden.delayTimer, exit_countdown: state.hidden.exitCountdown, transition_flag: 0 },
        player: { crouch_countdown: 0, death_counter: 0, turn_vel: 0 },
        weapon: { anim: 0, lowering: START.LOWERING, ring: [...RING], variant: 0 },
        render: { lane_eye_prev: 0 },
        hud: { camera_cell: [col, row], camera_cell_prev: [col, row] },
        sky: { column_index: state.sky?.columnOffset ?? 0, scroll_prev: 0, sub_pixel: 0, tile_counter: state.sky?.accumulator ?? 0 },
    };
    const floors = new Map([...state.earlierFloors].map(([f, b]) => [f, b.slice()] as const));
    const fresh = tickStart(env, structuredClone(world), hidden, 0, notes, { message: messageStart(), sound: structuredClone(state.sound), animWalls: state.animWalls, lift: state.hidden.lift, sniper: state.hidden.sniper, kept: state.kept }, floors);
    fresh.player.lastFootstepPhase = null;
    const mut = state as {
        -readonly [K in keyof TickState]: TickState[K];
    };
    mut.player = fresh.player;
    mut.weapon = fresh.weapon;
    mut.hit = fresh.hit;
    mut.message = fresh.message;
    state.hidden.cameraCell = fresh.hidden.cameraCell;
    state.hidden.pickupStanding = fresh.hidden.pickupStanding;
    state.hidden.laneEyePrev = fresh.hidden.laneEyePrev;
    state.lastPicture = null;
    delete state.scannerBlocks;
    firstPicture(state, notes);
}
const PASSIVE_ITEM_NAMES = ["bio_scanner", "bullet_proof_vest", "fire_proof_suit", "flash_light", "night_vision"] as const;
const PASSIVE_ABSENT_SLOT = -1;
export function deathGameOverOpen(state: TickState): BriefingCore {
    const { world, env } = state;
    if (env.briefing === null)
        throw new RefusedError("the game over's screen (ZT-UI-BRIEFING 4.10): the environment has no briefing assets");
    const screen = new BriefingCore(env.briefing.assets, env.briefing.C);
    const left = env.charsel?.assets.cards[0]?.paletteLines;
    screen.enterGameOver(world.level.episode.value, env.death, undefined, left);
    return screen;
}
export function deathGameOverFrame(state: TickState, screen: BriefingCore, pad: number): void {
    const sink: EventSink = {
        emit: (e: GameEvent) => {
            const ev = e as unknown as {
                type: string;
                request?: number;
            };
            if (ev.type === "Audio.Request" && typeof ev.request === "number")
                request(state, ev.request);
            else
                seatEvent(state, ev as unknown as SoundEvent);
        },
    };
    screen.tick(pad, sink);
}
export function tickRecord(state: TickState): World {
    const world = structuredClone(state.world);
    for (const e of world.entities)
        if (e.hidden)
            e.hidden.cells_around = windowAround(state, e);
    const n = world.entities.length;
    world.entity_pool = { count: n, head_slot: n === 0 ? null : world.entities[0]!.slot, walked: n, chain: "ok" };
    return world;
}
export function tickHidden(state: TickState): Partial<SnapHiddenLine> {
    return {
        controller: { countdown: state.hidden.controller.countdown, mode: state.hidden.controller.mode, tape_offset: state.hidden.controller.tapeOffset },
        core: { delay_timer: state.hidden.delayTimer, exit_countdown: state.hidden.exitCountdown, transition_flag: state.hidden.transitionFlag },
        floor: { counted_floor: state.hidden.countedFloor, counted_markers: countedMarkers(state) },
        door_queue: state.doors.queue.map((e) => ({ cell: [e.cell[0], e.cell[1]] as const, timer: e.timer, restore_block: e.restoreBlock, box_x: e.cell[0] * state.env.M.POS.CELL, box_y: e.cell[1] * state.env.M.POS.CELL, type: e.type })),
        map: { cells: hexOfBlocks(state.blocks) },
        player: { crouch_countdown: state.player.crouchCountdown, death_counter: state.hidden.deathCounter, turn_vel: state.player.turnVel },
        weapon: state.weapon ? { anim: state.weapon.anim, lowering: state.weapon.lowering, ring: [...state.weapon.ring], variant: state.weapon.variant } : undefined,
        pool: { free: poolFree(state) },
        tiles: tilePassStart(state.hidden.tiles),
        snipers: sniperGates(state.hidden.sniper),
        guards: guardsHidden(state),
        flames: groundFlamesHidden(state, state.world.entities),
        render: { lane_eye_prev: state.hidden.laneEyePrev },
        hud: { camera_cell: [state.hidden.cameraCell.x, state.hidden.cameraCell.y], camera_cell_prev: [state.hidden.cameraCell.x, state.hidden.cameraCell.y] },
    };
}
function guardsHidden(state: TickState): SnapGuard[] {
    const out: SnapGuard[] = [];
    for (const e of state.world.entities) {
        if (!isGuard(e))
            continue;
        const g = state.hidden.guards.get(e.slot);
        if (!g)
            continue;
        out.push({ slot: e.slot, waypoint: { x: g.waypoint.x, y: g.waypoint.y }, target: g.target });
    }
    return out;
}
function poolFree(state: TickState): SnapFreeSlot[] {
    const inChain = new Set(state.world.entities.map((e) => e.slot));
    const out: SnapFreeSlot[] = [];
    for (const slot of [...state.residue.keys()].sort((a, b) => a - b)) {
        if (inChain.has(slot))
            continue;
        const r = state.residue.get(slot)!;
        if (isZeroResidue(r))
            continue;
        out.push({ slot, anim: r.anim, art: r.art, cell_class: { ...r.cell_class }, counter: r.counter, hp: r.hp, pos: { ...r.pos }, prev: { ...r.prev }, state: r.state, vel: { ...r.vel } });
    }
    return out;
}

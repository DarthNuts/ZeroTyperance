import type { World } from "../../world.js";
import type { MoveState } from "../move/core.js";
import type { WeaponState } from "../weapon/core.js";
import type { HitHidden } from "../player_hit/core.js";
import type { MessageState } from "../pickup/core.js";
import type { SkyState } from "../rend/sky/core.js";
import type { AnimWallState } from "./anim_walls.js";
import type { LiftState } from "../lift/core.js";
import type { SniperSprite, SniperState } from "../sniper/core.js";
import type { ViewRecord } from "../rend/core.js";
import type { DisplayWrites, TickState } from "./core.js";
import type { ModernSeat } from "../modern/seat.js";
import type { SoundDriver } from "./sound.js";
import type { PlaceConstants } from "../coop/place.js";
export interface SeatFields {
    player: World["player"];
    inventory: World["inventory"];
    team: World["team"];
    move: MoveState;
    weapon: WeaponState | null;
    hit: HitHidden;
    message: MessageState;
    sky: SkyState | null;
    animWalls: AnimWallState;
    floorNumber: number;
    deathCounter: number;
    deathFlash: number;
    cameraCell: {
        x: number;
        y: number;
    };
    pickupStanding: boolean;
    laneEyePrev: number;
    lift: LiftState;
    viewDistance: number;
    beamFirst: number;
    sniper: SniperState;
    lastPicture: ViewRecord | null;
    lastPictureAngle: number | undefined;
    lastPictureEye: number | undefined;
    partnerAnim?: number;
    sniperSprites: SniperSprite[];
    scannerBlocks: number[] | undefined;
    display: DisplayWrites;
    modern?: ModernSeat;
}
export interface SeatRules {
    readonly bodyRadius: number;
    readonly exitCountdown?: number;
    readonly sound?: PlaceConstants;
}
export interface CabStart {
    floor: number;
    x: number;
    y: number;
}
export interface Seats {
    live: 0 | 1;
    data: SeatFields;
    out: [
        boolean,
        boolean
    ];
    pause: [
        boolean,
        boolean
    ];
    pad1: number;
    prev1: number;
    rules?: SeatRules;
    voiceTimer1?: number;
    sound1?: SoundDriver;
    offsetX?: number;
    handOver1?: boolean;
    lost?: [
        boolean,
        boolean
    ];
    cab?: [
        CabStart | null,
        CabStart | null
    ];
    cabNew?: Array<0 | 1>;
    pending?: Array<{
        readonly type: "Seat.Out";
        readonly seat: 0 | 1;
        readonly reason: "dead" | "lost";
    }>;
}
type Mut = {
    -readonly [K in keyof TickState]: TickState[K];
};
function readFields(state: TickState): SeatFields {
    const s = state as Mut;
    return {
        player: s.world.player,
        inventory: s.world.inventory,
        team: s.world.team,
        move: s.player,
        weapon: s.weapon,
        hit: s.hit,
        message: s.message,
        sky: s.sky,
        animWalls: s.animWalls,
        floorNumber: s.floorNumber,
        deathCounter: s.hidden.deathCounter,
        deathFlash: s.hidden.deathFlash,
        cameraCell: s.hidden.cameraCell,
        pickupStanding: s.hidden.pickupStanding,
        laneEyePrev: s.hidden.laneEyePrev,
        lift: s.hidden.lift,
        viewDistance: s.hidden.viewDistance,
        beamFirst: s.hidden.beamFirst,
        sniper: s.hidden.sniper,
        lastPicture: s.lastPicture,
        lastPictureAngle: s.lastPictureAngle,
        lastPictureEye: s.lastPictureEye,
        ...(s.partnerAnim !== undefined ? { partnerAnim: s.partnerAnim } : {}),
        sniperSprites: s.sniperSprites,
        scannerBlocks: s.scannerBlocks,
        display: s.display,
        ...(s.modern !== undefined ? { modern: s.modern } : {}),
    };
}
function writeFields(state: TickState, f: SeatFields, resident: (floor: number) => void): void {
    const s = state as Mut;
    s.world.player = f.player;
    s.world.inventory = f.inventory;
    s.world.team = f.team;
    s.player = f.move;
    s.weapon = f.weapon;
    s.hit = f.hit;
    s.message = f.message;
    s.sky = f.sky;
    s.animWalls = f.animWalls;
    s.hidden.deathCounter = f.deathCounter;
    s.hidden.deathFlash = f.deathFlash;
    s.hidden.cameraCell = f.cameraCell;
    s.hidden.pickupStanding = f.pickupStanding;
    s.hidden.laneEyePrev = f.laneEyePrev;
    s.hidden.lift = f.lift;
    s.hidden.viewDistance = f.viewDistance;
    s.hidden.beamFirst = f.beamFirst;
    s.hidden.sniper = f.sniper;
    s.lastPicture = f.lastPicture;
    if (f.lastPictureAngle === undefined)
        delete s.lastPictureAngle;
    else
        s.lastPictureAngle = f.lastPictureAngle;
    if (f.lastPictureEye === undefined)
        delete s.lastPictureEye;
    else
        s.lastPictureEye = f.lastPictureEye;
    if (f.partnerAnim === undefined)
        delete s.partnerAnim;
    else
        s.partnerAnim = f.partnerAnim;
    s.sniperSprites = f.sniperSprites;
    if (f.scannerBlocks === undefined)
        delete s.scannerBlocks;
    else
        s.scannerBlocks = f.scannerBlocks;
    s.display = f.display;
    if (f.modern === undefined)
        delete s.modern;
    else
        s.modern = f.modern;
    resident(f.floorNumber);
    s.floorNumber = f.floorNumber;
    s.world.level.sub_id = f.floorNumber;
    s.world.map.floor = f.floorNumber;
}
export function swapSeat(state: TickState, seats: Seats, resident: (floor: number) => void): void {
    const mine = readFields(state);
    writeFields(state, seats.data, resident);
    seats.data = mine;
    seats.live = seats.live === 0 ? 1 : 0;
}
export function addSecondSeat(state: TickState, offsetX: number, character?: TickState, rules?: SeatRules): Seats {
    const copy = structuredClone(readFields(state));
    if (character !== undefined) {
        const c = readFields(character);
        copy.inventory = structuredClone(c.inventory);
        copy.player.character = structuredClone(c.player.character);
        copy.player.passive = structuredClone(c.player.passive);
        copy.player.weapon = structuredClone(c.player.weapon);
        copy.move = structuredClone(c.move);
        copy.weapon = structuredClone(c.weapon);
        copy.display = structuredClone(c.display);
        copy.team = structuredClone(c.team);
        copy.player.hp = c.player.hp;
    }
    copy.lastPicture = state.lastPicture;
    if (character === undefined)
        copy.display = structuredClone(state.display);
    copy.player.pos.x -= offsetX;
    copy.move.x -= offsetX;
    const p0 = state.world.player;
    p0.pos.x += offsetX;
    state.player.x += offsetX;
    return { live: 0, data: copy, out: [false, false], pause: [false, false], pad1: 0, prev1: 0, sound1: structuredClone(state.sound), offsetX, ...(rules !== undefined ? { rules: { bodyRadius: rules.bodyRadius, ...(rules.exitCountdown !== undefined ? { exitCountdown: rules.exitCountdown } : {}) } } : {}) };
}

import { cheatRules, drainAmount } from "../tick/cheats.js";
import { soundOfRequest } from "./constants.js";
import type { WeaponConstants } from "./constants.js";
import type { Pad } from "../move/tape.js";
import type { ViewTable } from "../move/core.js";
import type { FlameConstants } from "../flame/constants.js";
export interface WeaponSlot {
    item: number;
    amount: number;
}
export interface WeaponFloor {
    readonly width: number;
    readonly blocks: readonly number[];
    readonly classOfBlock: readonly number[];
}
export interface WeaponPose {
    readonly x: number;
    readonly y: number;
    readonly angle: number;
    readonly episode: number;
    readonly eyeOffset: number;
}
export interface WeaponRequest {
    readonly request: number;
    readonly event?: "Audio.PlaySfx" | "Audio.PlayVoice";
    readonly id?: number;
    readonly value?: number;
}
export interface WeaponState {
    current: number;
    pending: number;
    lowering: number;
    anim: number;
    variant: number;
    slots: number;
    ring: number[];
    inventory: WeaponSlot[];
    bEdge: boolean;
    cEdge: boolean;
    prevPad: number;
    scannerSlot: number;
    ammoLow?: boolean;
    scannerRemoved?: boolean;
    flameStreams?: number;
    grenadeThrown?: boolean;
}
export interface WeaponRecord {
    readonly tick: number;
    readonly current: number;
    readonly pending: number;
    readonly lowering: number;
    readonly anim: number;
    readonly variant: number;
    readonly slots: number;
    readonly ring: readonly number[];
    readonly b_edge: boolean;
    readonly c_edge: boolean;
}
export function padByte(pad: Pad, C: WeaponConstants): number {
    return (pad.up ? C.PAD_UP : 0) | (pad.down ? C.PAD_DOWN : 0) | (pad.left ? C.PAD_LEFT : 0) | (pad.right ? C.PAD_RIGHT : 0) | (pad.b ? C.PAD_B : 0) | (pad.c ? C.PAD_C : 0) | (pad.a ? C.PAD_A : 0);
}
export interface HeldWeapons {
    readonly ROCKET: number;
    readonly REQ_ROCKET: number;
    readonly GRENADE: number;
    readonly REQ_GRENADE: number;
    readonly GRENADE_THROW_FRAME: number;
    readonly GRENADE_ANIM_END: number;
    readonly EXTINGUISHER: number;
    readonly REQ_EXTINGUISHER: number;
}
export function weaponOfItem(item: number, C: WeaponConstants): number {
    const w = C.ITEM_WEAPON[item];
    if (w === undefined)
        throw new Error(`weapon: item ${item} is outside WEAPON.ITEM_WEAPON`);
    return w;
}
export function weaponFloorOf(blocks: readonly number[], classOfBlock: readonly number[], width: number): WeaponFloor {
    if (blocks.length !== width * width)
        throw new Error(`weapon floor: ${blocks.length} cells, expected ${width} x ${width}`);
    return { width, blocks, classOfBlock };
}
export function weaponStart(inventory: readonly WeaponSlot[], C: WeaponConstants): WeaponState {
    const slots = inventory.map((s) => ({ item: s.item, amount: s.amount }));
    for (let i = 0; i < slots.length; i++) {
        if (C.DRAIN_ITEMS_UNMODELLED.includes(slots[i].item))
            throw new Error(`weapon: slot ${i} holds item ${slots[i].item}, whose drain is not modelled (spec 4.9)`);
    }
    const ring: number[] = [];
    for (let i = 0; i < C.RING_SIZE; i++)
        ring.push(i);
    const first = slots[0] ? slots[0].item : 0;
    return {
        current: C.NONE,
        pending: weaponOfItem(first, C),
        lowering: C.LOWER_MAX,
        anim: 0,
        variant: 0,
        slots: slots.filter((s) => s.item !== 0).length,
        ring,
        inventory: slots,
        bEdge: false,
        cEdge: false,
        prevPad: 0,
        scannerSlot: slots.findIndex((s) => s.item === C.SCANNER_ITEM),
    };
}
function s16(v: number): number {
    return (v << 16) >> 16;
}
function emptySlot(state: WeaponState, slot: number, C: WeaponConstants): void {
    const s = state.inventory[slot];
    s.item = 0;
    s.amount = 0;
    state.slots = (state.slots - 1) & C.SLOTS_MASK;
}
function ammoStep(state: WeaponState, C: WeaponConstants): void {
    const slot = state.ring[0];
    const s = state.inventory[slot];
    if (s.amount <= C.LAST_ROUND) {
        emptySlot(state, slot, C);
        state.pending = C.W_FISTS;
    }
    else {
        s.amount -= cheatRules().c1 ? 0 : C.AMMO_STEP;
        if (s.amount >= C.AMMO_LOW_FROM && s.amount < C.AMMO_LOW_TO)
            state.ammoLow = true;
    }
}
function wallProbe(pose: WeaponPose, floor: WeaponFloor, view: ViewTable, C: WeaponConstants): boolean {
    const x = s16(pose.x);
    const y = s16(pose.y);
    const px = s16(x + (view.sin256[pose.angle] >> C.FISTS_REACH_SHIFT));
    const py = s16(y + (view.neg_cos256[pose.angle] >> C.FISTS_REACH_SHIFT));
    const column = Math.floor(px / C.WALL_CELL);
    const row = Math.floor(py / C.WALL_CELL);
    const index = column + row * C.WALL_MAP_WIDTH;
    if (index < 0 || index >= C.WALL_MAP_WIDTH * C.WALL_MAP_WIDTH)
        return false;
    const block = floor.blocks[index];
    if (block === undefined)
        return false;
    const cls = floor.classOfBlock[block] ?? -1;
    const fx = ((px % C.WALL_CELL) + C.WALL_CELL) % C.WALL_CELL;
    const fy = ((py % C.WALL_CELL) + C.WALL_CELL) % C.WALL_CELL;
    const c = C.WALL_CELL - 1;
    const strict = C.WALL_DIAGONAL_STRICT === 1;
    let blocked = C.WALL_SOLID_CLASSES.includes(cls) || C.WALL_DOOR_CLASSES.includes(cls);
    if (!blocked) {
        const d = C.WALL_DIAGONALS.find((e) => e.class === cls);
        if (d) {
            switch (d.blocked) {
                case "ne":
                    blocked = strict ? fx > fy : fx >= fy;
                    break;
                case "se":
                    blocked = strict ? fx > c - fy : fx >= c - fy;
                    break;
                case "sw":
                    blocked = strict ? fx < fy : fx <= fy;
                    break;
                case "nw":
                    blocked = strict ? fx < c - fy : fx <= c - fy;
                    break;
            }
        }
    }
    return blocked && !silentBlock(block, pose.episode, pose.eyeOffset, C);
}
export function silentBlock(block: number, episode: number, eyeOffset: number, C: WeaponConstants): boolean {
    if (episode === C.SILENT_EPISODE)
        return C.SILENT_BLOCKS.includes(block);
    if (episode === HIGHRISE_EPISODE)
        return C.SILENT_BLOCKS_HIGHRISE.includes(block) || (eyeOffset >= 0 && C.SILENT_BLOCKS_HIGHRISE_STANDING.includes(block));
    return false;
}
const HIGHRISE_EPISODE = 1;
function cEdgeOf(byte: number, prev: number, C: WeaponConstants): boolean {
    return C.EDGE_ONLY === 1 ? (byte & C.PAD_C) !== 0 && (prev & C.PAD_C) === 0 : (byte & C.PAD_C) !== 0;
}
export function weaponPressC(state: WeaponState, pad: Pad, C: WeaponConstants): WeaponRequest | null {
    const byte = padByte(pad, C);
    if (!cEdgeOf(byte, state.prevPad, C))
        return null;
    const s = soundOfRequest(C.REQ_SWITCH, C);
    if (C.RING_RIGHT === 0)
        state.ring.push(state.ring.shift() as number);
    else
        state.ring.unshift(state.ring.pop() as number);
    state.pending = weaponOfItem(state.inventory[state.ring[0]].item, C);
    return { request: s.request, event: s.event, id: s.id, value: s.value };
}
export function weaponTick(state: WeaponState, pad: Pad, pose: WeaponPose, floor: WeaponFloor, view: ViewTable, phase: number, C: WeaponConstants, exitCountdown = false, pressOfCDone = false, targetHit: ((variant: number) => boolean) | null = null, F: FlameConstants | null = null, H: HeldWeapons | null = null): WeaponRequest[] {
    const requests: WeaponRequest[] = [];
    const request = (r: number): void => {
        const s = C.SOUNDS.find((e) => e.request === r);
        if (s)
            requests.push({ request: s.request, event: s.event, id: s.id, value: s.value });
        else
            requests.push({ request: r });
    };
    const byte = padByte(pad, C);
    const prev = state.prevPad;
    const edgeC = cEdgeOf(byte, prev, C);
    const edgeB = C.EDGE_ONLY === 1 ? (byte & C.PAD_B) !== 0 && (prev & C.PAD_B) === 0 : (byte & C.PAD_B) !== 0;
    state.bEdge = edgeB;
    state.cEdge = edgeC;
    state.ammoLow = false;
    state.scannerRemoved = false;
    state.flameStreams = 0;
    state.grenadeThrown = false;
    if (!exitCountdown) {
        if (edgeC && !pressOfCDone) {
            const r = weaponPressC(state, pad, C);
            if (r !== null)
                requests.push(r);
        }
        if (edgeB) {
            const gates = state.current < C.NEGATIVE_FROM &&
                (C.PENDING_GATE === 0 || state.pending === C.NONE || state.pending === state.current) &&
                (C.FIRE_NEEDS_RAISED === 0 || state.lowering === 0);
            if (gates) {
                const w = state.current;
                if (w === C.W_FISTS) {
                    if (C.FISTS_NEED_IDLE === 0 || state.anim === 0) {
                        request(C.REQ_FISTS);
                        state.anim = C.ANIM_FIRE;
                        state.variant = C.FISTS_VARIANT + ((byte & C.PAD_UP) !== 0 ? C.FISTS_UP : 0) + ((byte & C.PAD_DOWN) !== 0 ? C.FISTS_DOWN : 0) + ((byte & C.PAD_RIGHT) !== 0 ? C.FISTS_RIGHT : 0);
                    }
                }
                else if (w === C.W_MINE) {
                    request(C.REQ_MINE);
                    ammoStep(state, C);
                }
                else if (w === C.W_HANDGUN) {
                    request(C.REQ_HANDGUN);
                    state.anim = C.ANIM_FIRE;
                    ammoStep(state, C);
                }
                else if (w === C.W_LASER) {
                    request(C.REQ_LASER);
                    state.anim = C.ANIM_FIRE;
                    ammoStep(state, C);
                }
                else if (w === C.W_SHOTGUN) {
                    request(C.REQ_SHOTGUN);
                    state.anim = C.ANIM_FIRE;
                    ammoStep(state, C);
                }
                else if (w === C.W_PULSE) {
                    request(C.REQ_PULSE);
                    state.anim = C.ANIM_FIRE;
                    ammoStep(state, C);
                }
                else if (F !== null && w === F.ITEM) {
                    if (state.anim === 0) {
                        const known = C.SOUNDS.find((e) => e.request === F.SOUND_PRESS);
                        requests.push(known ? { request: known.request, event: known.event, id: known.id, value: known.value } : { request: F.SOUND_PRESS, event: "Audio.PlayVoice", id: 0, value: 0 });
                        state.anim = F.FRAME_PRESS;
                        ammoStep(state, C);
                    }
                }
                else if (H !== null && (w === H.ROCKET || w === H.GRENADE || w === H.EXTINGUISHER)) {
                    if (state.anim === 0) {
                        request(w === H.ROCKET ? H.REQ_ROCKET : w === H.GRENADE ? H.REQ_GRENADE : H.REQ_EXTINGUISHER);
                        state.anim = C.ANIM_FIRE;
                        ammoStep(state, C);
                    }
                }
                else {
                    throw new Error(`weapon: the weapon ${w} in hand fires, which is not modelled (spec 4.12 / 9.7)`);
                }
            }
        }
    }
    let swapped = false;
    if (state.anim === 0 && state.pending < C.NEGATIVE_FROM) {
        if (state.pending === state.current) {
            state.pending = C.NONE;
        }
        else {
            state.lowering += C.LOWER_STEP;
            if (state.lowering >= C.LOWER_MAX) {
                state.lowering = C.LOWER_MAX;
                const old = state.pending;
                state.pending = C.NONE;
                state.current = old > C.WEAPON_MAX ? C.W_FISTS : old;
                swapped = true;
            }
        }
    }
    else if (state.pending === C.NONE && state.lowering !== 0) {
        state.lowering -= C.LOWER_STEP;
    }
    if (!swapped) {
        const w = state.current;
        if (w === C.W_MINE) {
        }
        else if (H !== null && w === H.GRENADE) {
            if (state.anim !== 0) {
                state.anim++;
                if (state.anim === H.GRENADE_THROW_FRAME)
                    state.grenadeThrown = true;
                if (state.anim === H.GRENADE_ANIM_END)
                    state.anim = 0;
            }
        }
        else if (w === C.W_HANDGUN || w === C.W_SHOTGUN || w === C.W_PULSE || (H !== null && (w === H.ROCKET || w === H.EXTINGUISHER))) {
            if (state.anim !== 0) {
                state.anim++;
                if (state.anim === C.ANIM_END)
                    state.anim = 0;
            }
            if (w === C.W_PULSE && state.anim >= 1 && state.anim <= C.PULSE_BURST_MAX)
                request(C.REQ_PULSE);
        }
        else if (w === C.W_LASER) {
            if (state.anim !== 0) {
                state.anim++;
                let ended = false;
                if (state.anim <= C.LASER_HOLD_MAX && (byte & C.PAD_B) !== 0) {
                    request(C.REQ_LASER);
                    const slot = state.ring[0];
                    if (state.inventory[slot].amount <= C.LASER_REMOVE) {
                        emptySlot(state, slot, C);
                        state.pending = C.W_FISTS;
                        ended = true;
                    }
                    else {
                        if (state.anim === C.LASER_WRAP)
                            state.anim = C.ANIM_FIRE;
                        state.inventory[slot].amount -= C.LASER_STEP;
                    }
                }
                if (!ended && state.anim === C.ANIM_END)
                    state.anim = 0;
            }
        }
        else if (F !== null && w === F.ITEM) {
            if (state.anim === F.FRAME_PRESS || state.anim === F.FRAME_PRESS + 1) {
                state.flameStreams = 1;
                state.anim++;
            }
            else if (state.anim === F.FRAME_PRESS + 2) {
                state.flameStreams = 1;
                if ((byte & C.PAD_B) !== 0) {
                    const slot = state.ring[0];
                    if (state.inventory[slot].amount <= F.HOLD_COST) {
                        emptySlot(state, slot, C);
                        state.pending = C.W_FISTS;
                        state.anim = F.FRAME_PRESS + 3;
                    }
                    else
                        state.inventory[slot].amount -= F.HOLD_COST;
                }
                else
                    state.anim = F.FRAME_PRESS + 3;
            }
            else if (state.anim === F.FRAME_PRESS + 3) {
                state.anim = 0;
            }
        }
        else if (w === C.W_FISTS) {
            const d = state.anim;
            if (d !== 0) {
                state.anim++;
                let ends = false;
                if (state.variant < C.FISTS_LONG_BELOW) {
                    if (d === 1)
                        ends = true;
                    else if (d === C.FISTS_LONG_END) {
                        state.anim = 0;
                        ends = true;
                    }
                }
                else if (state.anim === C.FISTS_SHORT_END) {
                    state.anim = 0;
                }
                if (!ends && state.anim === C.FISTS_HIT_FRAME) {
                    if (targetHit !== null && targetHit(state.variant))
                        request(state.variant < C.FISTS_LONG_BELOW ? C.REQ_FISTS_HIT_LONG : C.REQ_FISTS_HIT_SHORT);
                    else if (wallProbe(pose, floor, view, C))
                        request(C.REQ_WALL);
                }
            }
        }
    }
    if (state.scannerSlot >= 0 && ((phase + C.SCANNER_DRAIN_PHASE) & C.SCANNER_DRAIN_MASK) === 0) {
        const s = state.inventory[state.scannerSlot];
        if ((s.amount & 0xffff) <= C.SCANNER_STEP) {
            emptySlot(state, state.scannerSlot, C);
            state.scannerSlot = state.inventory.findIndex((x) => x.item === C.SCANNER_ITEM);
            state.scannerRemoved = true;
        }
        else
            s.amount -= drainAmount(C.SCANNER_STEP, cheatRules().c6);
    }
    state.prevPad = byte;
    return requests;
}
export function applyPoke(state: WeaponState, slot: number, item: number, amount: number): void {
    const s = state.inventory[slot];
    if (!s)
        throw new Error(`weapon: poke of slot ${slot}, the inventory has ${state.inventory.length} slots`);
    s.item = item;
    s.amount = amount;
}
export function weaponRecord(state: Readonly<WeaponState>, tick: number): WeaponRecord {
    return {
        tick,
        current: state.current,
        pending: state.pending,
        lowering: state.lowering,
        anim: state.anim,
        variant: state.variant,
        slots: state.slots,
        ring: [...state.ring],
        b_edge: state.bEdge,
        c_edge: state.cEdge,
    };
}

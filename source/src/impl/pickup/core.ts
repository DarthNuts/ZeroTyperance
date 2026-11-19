import { cheatRules } from "../tick/cheats.js";
import type { ItemsData, MessageText, PickupConstants, VoiceEntry } from "./constants.js";
export const PICKUP_TEXT = Object.freeze({
    ROUND: 256,
    CLEARED_BLOCK: 0,
    HP_MIN: 0,
});
export interface MessageState {
    queue: MessageText[];
    displayCounter: number;
    announcing: MessageText | null;
    voiceEntry: number;
}
export function messageStart(): MessageState {
    return { queue: [], displayCounter: 0, announcing: null, voiceEntry: 0 };
}
export type PickupEvent = {
    readonly type: "Audio.Request";
    readonly request: number;
};
export function endAnnouncement(ms: MessageState): void {
    ms.announcing = null;
    ms.voiceEntry = 0;
}
export function queueMessage(ms: MessageState, text: MessageText, P: PickupConstants): void {
    if (ms.queue.length >= P.QUEUE_SIZE)
        return;
    ms.queue.push(text);
}
export function floorMessageStep(ms: MessageState, voiceTimer: number, voiceOn: boolean, P: PickupConstants, emit: (ev: PickupEvent) => void): number {
    let timer = voiceTimer;
    if (ms.announcing !== null && timer < 0) {
        const next = ms.voiceEntry + 1;
        const entry: VoiceEntry | undefined = ms.announcing.voice[next];
        if (entry === undefined) {
            ms.announcing = null;
            ms.voiceEntry = 0;
        }
        else {
            ms.voiceEntry = next;
            timer = entry[0];
            emit({ type: "Audio.Request", request: entry[1] });
        }
    }
    if (ms.displayCounter === 0 && ms.queue.length > 0) {
        const text = ms.queue.shift()!;
        ms.displayCounter = P.DISPLAY.RELOAD;
        if (voiceOn && ms.announcing === null) {
            const first: VoiceEntry | undefined = text.voice[0];
            if (first !== undefined) {
                ms.announcing = text;
                ms.voiceEntry = 0;
                timer = first[0];
                emit({ type: "Audio.Request", request: first[1] });
            }
        }
    }
    else {
        ms.displayCounter = Math.max(0, ms.displayCounter - (ms.queue.length + P.DISPLAY.STEP_BASE));
    }
    return timer;
}
export interface PickupPlayer {
    hp: number;
    readonly character: number;
    readonly inventory: Array<{
        item: number;
        amount: number;
    }>;
    readonly passive?: Record<string, number>;
}
export interface PassiveRules {
    readonly passiveNameOf: (itemId: number) => string | null;
    readonly light: {
        readonly ITEM: number;
        readonly GRANT: number;
        readonly CAP: number;
    } | null;
}
export interface PickupResult {
    readonly cleared: boolean;
    readonly refused: boolean;
    readonly events: readonly PickupEvent[];
}
const NO_PICKUP: PickupResult = Object.freeze({ cleared: false, refused: false, events: [] });
const REFUSED: PickupResult = Object.freeze({ cleared: false, refused: true, events: [] });
export function pickupAt(cls: number, p: PickupPlayer, ms: MessageState, P: PickupConstants, items: ItemsData, rules: PassiveRules | null = null): PickupResult {
    const isItemClass = items.byClass.has(cls);
    if (!isItemClass && cls !== P.MEDIPACK.CLASS)
        return NO_PICKUP;
    if (cls <= P.CLASS_LOW_LIMIT || cls > P.CLASS_HIGH_LIMIT)
        return NO_PICKUP;
    const events: PickupEvent[] = [];
    if (cls === P.MEDIPACK.CLASS) {
        if (p.hp === P.HP_MAX)
            return REFUSED;
        events.push({ type: "Audio.Request", request: P.MEDIPACK.SOUND });
        queueMessage(ms, { rows: P.MSG.MEDIPACK.TEXT, voice: P.MSG.MEDIPACK.VOICE! }, P);
        p.hp += p.character === P.MEDIPACK.CHAR2 ? P.MEDIPACK.HEAL_CHAR2 : P.MEDIPACK.HEAL;
        if (p.hp > P.HP_MAX)
            p.hp = P.HP_MAX;
        if (p.hp < PICKUP_TEXT.HP_MIN)
            p.hp = PICKUP_TEXT.HP_MIN;
        return { cleared: true, refused: false, events };
    }
    const item = items.byClass.get(cls)!;
    const expectedId = cls - P.CLASS_ITEM_BASE;
    if (item.id !== expectedId && expectedId >= 1 && expectedId <= 12)
        throw new Error(`items.json: class ${cls} names item ${item.id}, the spec's class - ${P.CLASS_ITEM_BASE} gives ${expectedId}`);
    let slot = p.inventory.findIndex((s) => s.item === item.id);
    if (slot >= 0) {
        if (p.inventory[slot]!.amount === item.cap * PICKUP_TEXT.ROUND)
            return REFUSED;
    }
    else {
        if (p.inventory.filter((s) => s.item !== 0).length >= P.SLOTS)
            return REFUSED;
        slot = p.inventory.findIndex((s) => s.item === 0);
        if (slot < 0)
            return REFUSED;
    }
    const isNew = p.inventory[slot]!.item === 0;
    p.inventory[slot]!.item = item.id;
    const light = rules?.light ?? null;
    const full = cheatRules().c2;
    if (light !== null && item.id === light.ITEM)
        p.inventory[slot]!.amount = full ? light.CAP : Math.min(p.inventory[slot]!.amount + light.GRANT, light.CAP);
    else {
        const sum = p.inventory[slot]!.amount + item.defaultGrant * PICKUP_TEXT.ROUND;
        const capAmount = item.cap * PICKUP_TEXT.ROUND;
        p.inventory[slot]!.amount = full ? capAmount : !isNew && P.ADD.CLAMP_TO_CAP !== 0 ? Math.min(sum, capAmount) : sum;
    }
    if (isNew && p.passive !== undefined && rules !== null) {
        const pname = rules.passiveNameOf(item.id);
        if (pname !== null && pname in p.passive)
            p.passive[pname] = slot;
    }
    events.push({ type: "Audio.Request", request: P.ITEM_SOUND });
    queueMessage(ms, itemMessage(item.id, P, items), P);
    return { cleared: true, refused: false, events };
}
export function itemMessage(itemId: number, P: PickupConstants, items: ItemsData): MessageText {
    const item = items.byId.get(itemId);
    if (item === undefined)
        throw new Error(`items.json: no item ${itemId}`);
    const stored = items.messages?.get(itemId);
    if (stored !== undefined)
        return { rows: stored, voice: item.voice };
    if (itemId === P.LOOT_ITEM)
        return { rows: P.MSG.HANDGUN.TEXT, voice: item.voice };
    throw new Error(`item ${itemId} (${item.name}): no stored pickup message (strings/pickup_messages.json was not loaded; ZT-WORLD-PICKUP 4.2 step 5)`);
}
export function ammoLowMessage(P: PickupConstants): MessageText {
    return { rows: P.MSG.AMMO_LOW.TEXT, voice: P.MSG.AMMO_LOW.VOICE! };
}
export function healthMessage(index: number, P: PickupConstants): MessageText {
    const m = index === 0 ? P.MSG.HEALTH_LOW : P.MSG.HEALTH_CRITICAL;
    return { rows: m.TEXT, voice: m.VOICE! };
}

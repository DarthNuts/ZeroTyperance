import type { DeathConstants } from "./constants.js";
export interface CarriedItem {
    readonly item: number;
    readonly rounds: number;
}
export function carriedOf(inventory: ReadonlyArray<{
    readonly item: number;
    readonly amount: number;
}>, round: number, C: DeathConstants): CarriedItem[] {
    if (C["HANDOVER.CARRY"] === 0)
        return [];
    const out: CarriedItem[] = [];
    for (const s of inventory) {
        if (s.item === 0)
            continue;
        out.push({ item: s.item, rounds: Math.floor(s.amount / round) });
    }
    return out;
}
export function markerCell(blocks: readonly number[], side: number, cell: {
    readonly x: number;
    readonly y: number;
}, C: DeathConstants): number | null {
    for (const [dx, dy] of C["MARKER.ORDER"]) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (x < 0 || y < 0 || x >= side || y >= side)
            continue;
        const i = y * side + x;
        if (blocks[i] === 0)
            return i;
    }
    return null;
}
export function restartCell(blocks: readonly number[], classOf: (block: number) => number, C: DeathConstants): number {
    const i = blocks.findIndex((b) => classOf(b) === C["RESTART.START_CLASS"]);
    return i < 0 ? C["RESTART.NO_START_CELL"] : i;
}
export interface RestartItemsInput {
    readonly carried: readonly CarriedItem[];
    readonly loadout: ReadonlyArray<{
        readonly item: number;
        readonly amount: number;
    }>;
    readonly itemOf: (item: number) => {
        readonly cap: number;
        readonly defaultGrant: number;
    } | undefined;
    readonly isPassive: (item: number) => boolean;
    readonly slotCount: number;
    readonly round: number;
    readonly episode: number;
    readonly floor: number;
}
export function restartItems(input: RestartItemsInput, C: DeathConstants): {
    items: number[];
    amounts: number[];
    passiveSlot: Map<number, number>;
} {
    const items: number[] = new Array<number>(input.slotCount).fill(0);
    const amounts: number[] = new Array<number>(input.slotCount).fill(0);
    const passiveSlot = new Map<number, number>();
    const add = (item: number, amount: number): void => {
        const rec = input.itemOf(item);
        if (!rec)
            throw new Error(`restart: item ${item} is not in items.json`);
        const capAmount = rec.cap * input.round;
        let slot = items.indexOf(item);
        if (slot >= 0) {
            amounts[slot] = Math.min(amounts[slot]! + amount, capAmount);
        }
        else {
            slot = items.indexOf(0);
            if (slot < 0)
                return;
            items[slot] = item;
            amounts[slot] = amount;
            if (input.isPassive(item) && !passiveSlot.has(item))
                passiveSlot.set(item, slot);
        }
    };
    for (const c of input.carried) {
        const rec = input.itemOf(c.item);
        if (!rec)
            throw new Error(`restart: carried item ${c.item} is not in items.json`);
        add(c.item, c.rounds === 0 ? rec.defaultGrant * input.round : c.rounds * input.round);
    }
    if (!(input.episode === C["RESTART.SKIP_LOADOUT_EPISODE"] && input.floor === C["RESTART.SKIP_LOADOUT_FLOOR"])) {
        for (const l of input.loadout)
            add(l.item, l.amount);
    }
    return { items, amounts, passiveSlot };
}

import { encodePassword } from "../../password/codec.js";
import type { PasswordCodecTables } from "../../password/codec.js";
import { CHARACTER_BY_INDEX, ROUND } from "../../start/constants.js";
import type { TickState } from "../../tick/core.js";
export function passwordOfRunningState(state: TickState, codec: PasswordCodecTables | null | undefined): string | null {
    if (!codec)
        return null;
    const w = state.world;
    const inv = w.inventory;
    return encodePassword(codec, {
        alive: CHARACTER_BY_INDEX.map((nm) => (w.team.alive[nm] ? 1 : 0)),
        items: inv.map((slot) => slot.item.value),
        amounts: inv.map((slot) => Math.floor(slot.amount / ROUND)),
        levelByte: 16 * w.level.episode.value + state.floorNumber,
    });
}

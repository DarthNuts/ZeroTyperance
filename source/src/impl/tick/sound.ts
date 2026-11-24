import type { Place } from "../coop/place.js";
import { parseSoundTable } from "../options/sound_table.js";
import type { SoundRow, SoundTable } from "../options/sound_table.js";
export type { SoundRow, SoundTable };
export const SOUND_TABLE_NAME = "sound_table";
export const AUDIO = Object.freeze({
    MODE_MUSIC: 0,
    MODE_EFFECT: 1,
    MODE_VOICE: 2,
    MODE_VOICE_UNGATED: 3,
    MUSIC_VAR_OPCODE: 5,
    MUSIC_CMD_OPCODE: 16,
    EFFECT_CHANNELS: [13, 14] as readonly number[],
    VOICE_CHANNEL: 15,
    STOP_OPCODE: 1,
    LEVEL_START_REMEMBERED: 0,
});
export function soundTableFrom(doc: unknown): SoundTable {
    return parseSoundTable(doc, SOUND_TABLE_NAME);
}
export type SoundEvent = SoundEventBody & {
    readonly seat?: SoundSeat;
    readonly place?: Place;
    readonly phrase?: {
        readonly key: string;
        readonly first: boolean;
    };
};
type SoundEventBody = {
    readonly type: "Audio.Request";
    readonly request: number;
    readonly outcome: {
        readonly accepted: boolean;
    };
} | {
    readonly type: "Audio.PlayMusic";
    readonly opcode: number;
    readonly value: number;
} | {
    readonly type: "Audio.StopTrack";
    readonly id: number;
} | {
    readonly type: "Audio.PlaySfx";
    readonly channel: number;
    readonly id: number;
    readonly note: number;
} | {
    readonly type: "Audio.PlayVoice";
    readonly channel: number;
    readonly id: number;
    readonly param: number;
} | {
    readonly type: "Audio.ChannelCtl";
    readonly opcode: number;
    readonly on: boolean;
    readonly channel: number;
    readonly value: number;
} | {
    readonly type: "Audio.Pause";
} | {
    readonly type: "Audio.Resume";
};
export type SoundSeat = 0 | 1 | "both";
export function heardBy(e: {
    readonly seat?: unknown;
}, k: 0 | 1): boolean {
    return e.seat === undefined || e.seat === "both" || e.seat === k;
}
export function seatSounds<T extends {
    readonly seat?: unknown;
}>(events: readonly T[], k: 0 | 1): T[] {
    return events.filter((e) => heardBy(e, k));
}
export interface SoundDriver {
    turn: number;
    remembered: (number | null)[];
}
export function soundDriverPowerOn(): SoundDriver {
    return { turn: 0, remembered: AUDIO.EFFECT_CHANNELS.map(() => null) };
}
export function soundDriverLevelStart(): SoundDriver {
    return { turn: 0, remembered: AUDIO.EFFECT_CHANNELS.map(() => AUDIO.LEVEL_START_REMEMBERED) };
}
export interface SoundGates {
    readonly musicOn: boolean;
    readonly sfxOn: boolean;
    readonly voiceOn: boolean;
    readonly announcing: boolean;
    readonly delayTimer: number;
}
export function soundRequest(driver: SoundDriver, table: SoundTable, n: number, gates: SoundGates, emit: (e: SoundEvent) => void): boolean {
    const row = table.rows[n];
    if (row === undefined)
        throw new Error(`sound request ${n}: the sound command table has ${table.rows.length} rows`);
    const accepted = acceptedBy(row, gates);
    emit({ type: "Audio.Request", request: n, outcome: { accepted } });
    if (!accepted)
        return false;
    switch (row.mode) {
        case AUDIO.MODE_MUSIC:
            emit({ type: "Audio.PlayMusic", opcode: AUDIO.MUSIC_VAR_OPCODE, value: row.var });
            emit({ type: "Audio.PlayMusic", opcode: AUDIO.MUSIC_CMD_OPCODE, value: row.cmd });
            return true;
        case AUDIO.MODE_EFFECT: {
            const channel = AUDIO.EFFECT_CHANNELS[driver.turn]!;
            const before = driver.remembered[driver.turn];
            if (before !== null && before !== undefined)
                emit({ type: "Audio.ChannelCtl", opcode: AUDIO.STOP_OPCODE, on: false, channel, value: before });
            emit({ type: "Audio.PlaySfx", channel, id: row.cmd, note: row.var });
            driver.remembered[driver.turn] = row.var;
            driver.turn = (driver.turn + 1) % AUDIO.EFFECT_CHANNELS.length;
            return true;
        }
        case AUDIO.MODE_VOICE:
        case AUDIO.MODE_VOICE_UNGATED:
            emit({ type: "Audio.PlayVoice", channel: AUDIO.VOICE_CHANNEL, id: row.cmd, param: row.var });
            return true;
        default:
            throw new Error(`sound request ${n}: the row's mode ${row.mode} is none of ZT-AUDIO 2a's four`);
    }
}
export function isVoiceMessage(table: SoundTable, n: number): boolean {
    const row = table.rows[n];
    return row !== undefined && row.mode === AUDIO.MODE_VOICE_UNGATED;
}
function acceptedBy(row: SoundRow, g: SoundGates): boolean {
    switch (row.mode) {
        case AUDIO.MODE_MUSIC:
            return g.musicOn;
        case AUDIO.MODE_EFFECT:
            return g.sfxOn;
        case AUDIO.MODE_VOICE:
            return g.voiceOn && !g.announcing && g.delayTimer === 0;
        case AUDIO.MODE_VOICE_UNGATED:
            return g.delayTimer === 0;
        default:
            return false;
    }
}
export function requestOfEffect(table: SoundTable, id: number, note: number): number {
    const found: number[] = [];
    table.rows.forEach((r, i) => {
        if (r.mode === AUDIO.MODE_EFFECT && r.cmd === id && r.var === note)
            found.push(i);
    });
    if (found.length !== 1)
        throw new Error(`the sound command table has ${found.length} effect rows with id ${id} and note ${note}; one request is expected`);
    return found[0]!;
}
export interface ComparedSounds {
    readonly requests: readonly number[];
    readonly plays: readonly string[];
    readonly controls: readonly string[];
}
export function comparedSounds(events: ReadonlyArray<{
    readonly type: string;
    readonly [k: string]: unknown;
}>): ComparedSounds {
    const requests: number[] = [];
    const plays: string[] = [];
    const controls: string[] = [];
    for (const e of events) {
        if (e.type === "Audio.Request")
            requests.push(Number(e.request));
        else if (e.type === "Audio.PlayMusic" || e.type === "Audio.PlaySfx" || e.type === "Audio.PlayVoice") {
            const keys = Object.keys(e).filter((k) => k !== "channel" && k !== "tick" && k !== "outcome" && k !== "phrase").sort();
            plays.push("{" + keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(e[k])}`).join(",") + "}");
        }
        else if (e.type === "Audio.Pause" || e.type === "Audio.Resume")
            controls.push(e.type);
    }
    plays.sort();
    return { requests, plays, controls };
}

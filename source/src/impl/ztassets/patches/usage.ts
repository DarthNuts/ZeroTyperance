import type { RomFile } from "../core.js";
import { soundTable } from "../cmd/music.js";
import * as D from "../music/driver.js";
import * as IR from "../music/ir.js";
type Dict = Record<string, any>;
interface Blank {
    midi_notes: Set<number>;
    driver_notes: Set<number>;
    tracks: Set<number>;
    sound_ids: Set<number>;
    notes: number;
    ungated: number;
    longest_frames: number;
}
const blank = (): Blank => ({ midi_notes: new Set(), driver_notes: new Set(), tracks: new Set(), sound_ids: new Set(), notes: 0, ungated: 0, longest_frames: 0 });
const sorted = (s: Set<number>): number[] => [...s].sort((a, b) => a - b);
export interface Usage {
    midi_notes: number[];
    driver_notes: number[];
    tracks: number[];
    sound_ids: number[];
    notes: number;
    ungated: number;
    longest_frames: number | null;
}
export function instrumentUsage(rom: RomFile, records: Array<[
    number,
    number,
    Uint8Array
]>, patchTable: Array<[
    number,
    number | null,
    boolean
]>, carriers: number[]): Map<number, Usage> {
    const docs = new Map<number, Dict>();
    const types = new Map<number, number>();
    for (const [i, off, rec] of records) {
        docs.set(i, IR.decodeInstrument(i, off, rec, patchTable, carriers));
        types.set(i, rec[0]!);
    }
    const macroDocs = IR.macros(rom);
    const table = soundTable(rom);
    const byTrack = new Map<number, IR.SoundEntry[]>();
    for (const e of table) {
        if (e.mode === 0) {
            let l = byTrack.get(e.cmd);
            if (!l)
                byTrack.set(e.cmd, (l = []));
            l.push(e);
        }
    }
    const use = new Map<number, Blank>();
    const get = (i: number): Blank => {
        let u = use.get(i);
        if (!u)
            use.set(i, (u = blank()));
        return u;
    };
    for (const [i] of records)
        use.set(i, blank());
    for (const [tid, header, chans] of IR.tracks(rom)) {
        const ids = byTrack.get(tid) ?? [];
        const [bpm, src]: [
            number | null,
            string
        ] = ids.length ? [ids[0]!.var, "sound_table"] : [null, "driver_default"];
        const doc = IR.buildTrack(rom, tid, header, chans, types, bpm, src, ids.map((e) => e.id), docs, macroDocs);
        for (const ch of doc.channels as Dict[]) {
            const pending = new Map<unknown, Array<[
                number,
                number
            ]>>();
            for (const e of ch.events as Dict[]) {
                if (e.type === "note_on" && !e.muted && e.instrument !== undefined && e.instrument !== null) {
                    const u = get(e.instrument);
                    u.notes += 1;
                    u.tracks.add(tid);
                    u.driver_notes.add(e.note);
                    if ("midi_note" in e)
                        u.midi_notes.add(e.midi_note);
                    if (e.gate) {
                        let l = pending.get(e.offset);
                        if (!l)
                            pending.set(e.offset, (l = []));
                        l.push([e.tick, e.instrument]);
                    }
                    else
                        u.ungated += 1;
                }
                else if (e.type === "note_off" && (pending.get(e.offset)?.length ?? 0) > 0) {
                    const [tick, inst] = pending.get(e.offset)!.shift()!;
                    const u = use.get(inst)!;
                    u.longest_frames = Math.max(u.longest_frames, e.tick - tick);
                }
            }
        }
    }
    for (const e of table) {
        if (e.mode === 1) {
            const u = get(e.cmd);
            u.notes += 1;
            u.ungated += 1;
            u.sound_ids.add(e.id);
            u.driver_notes.add(e.var);
            if ([0, 2, 3].includes(types.get(e.cmd) as number))
                u.midi_notes.add(D.midiNote(e.var));
        }
        else if (e.mode === 2 || e.mode === 3) {
            const u = get(D.BOOT_PCM_INSTRUMENT);
            u.notes += 1;
            u.ungated += 1;
            u.sound_ids.add(e.id);
            u.driver_notes.add(e.cmd);
        }
    }
    const out = new Map<number, Usage>();
    for (const [i, u] of use) {
        out.set(i, {
            midi_notes: sorted(u.midi_notes), driver_notes: sorted(u.driver_notes), tracks: sorted(u.tracks), sound_ids: sorted(u.sound_ids),
            notes: u.notes, ungated: u.ungated, longest_frames: u.longest_frames || null,
        });
    }
    return out;
}

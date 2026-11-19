import { sha256Hex } from "../../boot/sha256.js";
import { canonicalJson, type Command, type Context } from "../core.js";
import * as D from "../music/driver.js";
import * as M from "../music/midi.js";
import { music } from "./music.js";
const META_FORMAT = "ztassets-midi-meta/1";
const INDEX_FORMAT = "ztassets-midi-index/1";
const OUT = "midi";
const PPQ = 24;
const VELOCITY = 100;
const SFX_TAIL_TICKS = 24;
const PITCH_BEND_RANGE = 12;
const MUSIC_CHANNELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16];
const PCM_CHANNEL = 11;
const SFX_CHANNELS: Record<string, number> = { fm: 1, psg: 2, psg_noise: 3, pcm: PCM_CHANNEL };
const MIN_RATE = 7;
const MAPPED_EVENTS = new Set(["note_on", "note_off", "instrument", "volume", "pitch_offset", "tempo"]);
const USEC_NUMERATOR = Math.floor((PPQ * 256 * 1000000) / 60);
export class MidiError extends Error {
}
type Dict = Record<string, any>;
export function usecPerQuarter(rate: unknown): number {
    if (typeof rate !== "number" || !Number.isInteger(rate) || rate < MIN_RATE) {
        throw new MidiError(`tempo rate ${rate} cannot be written as a MIDI tempo (the driver needs a rate of at least ${MIN_RATE} to tick slowly enough to fit 24 bits)`);
    }
    return Math.floor((USEC_NUMERATOR + Math.floor(rate / 2)) / rate);
}
export function volumeController(attenuation: number): number {
    const a = attenuation >= 128 ? attenuation - 256 : attenuation;
    return Math.max(0, Math.min(127, 127 - a));
}
export function pitchBendValue(fine: number, coarse: number): number {
    let raw = (coarse << 8) | fine;
    if (raw >= 0x8000)
        raw -= 0x10000;
    const span = PITCH_BEND_RANGE * 256;
    return Math.max(0, Math.min(16383, 8192 + Math.floor((raw * 8192 * 2 + span) / (2 * span))));
}
function assignChannels(doc: Dict): Array<[
    number,
    number
]> {
    const free = [...MUSIC_CHANNELS];
    const out: Array<[
        number,
        number
    ]> = [];
    let usedPcm = false;
    (doc.channels as Dict[]).forEach((ch, lane) => {
        if (ch.clock !== "tempo")
            throw new MidiError(`lane ${lane} (IR channel ${ch.index}) is clocked by the 60 Hz frame, not by the tempo tick: it has no position on the MIDI tick grid`);
        let number: number;
        if (doc.kind === "sfx") {
            if (!(ch.kind in SFX_CHANNELS))
                throw new MidiError(`sound effect lane of kind '${ch.kind}' has no channel assignment`);
            number = SFX_CHANNELS[ch.kind]!;
        }
        else if (ch.kind === "pcm") {
            if (usedPcm)
                throw new MidiError(`two PCM lanes would share MIDI channel ${PCM_CHANNEL}`);
            usedPcm = true;
            number = PCM_CHANNEL;
        }
        else {
            if (!free.length)
                throw new MidiError(`more than ${MUSIC_CHANNELS.length} lanes: no MIDI channel left`);
            number = free.shift()!;
        }
        out.push([lane, number - 1]);
    });
    return out;
}
type Item = [
    number,
    number,
    number,
    M.Ev
];
interface Note {
    idx: number;
    tick: number;
    gate: number;
    midi: number;
    release: number | null;
    open_ended?: boolean;
    intended?: number;
    paired?: number;
}
interface LaneData {
    items: Item[];
    notes: Note[];
    counts: Record<string, number>;
    unmapped: Record<string, number>;
    instruments: Map<number, string>;
}
const bump = (o: Record<string, number>, k: string): void => { o[k] = (o[k] ?? 0) + 1; };
function laneItems(lane: number, ch: Dict, channel: number): LaneData {
    const events = ch.events as Dict[];
    const items: Item[] = [];
    const notes: Note[] = [];
    const counts: Record<string, number> = {};
    const unmapped: Record<string, number> = {};
    const irOffs = new Map<string, number>(), derivedOffs = new Map<string, number>();
    const inc = (m: Map<string, number>, k: string): void => { m.set(k, (m.get(k) ?? 0) + 1); };
    if (events.some((e) => e.type === "pitch_offset")) {
        [[101, 0], [100, 0], [6, PITCH_BEND_RANGE], [38, 0], [101, 127], [100, 127]].forEach(([ctrl, val], k) => {
            items.push([0, -1, -20 + k, M.evControl(0, channel, ctrl!, val!)]);
        });
    }
    items.push([0, -1, -10, M.evControl(0, channel, 7, 127)]);
    const instruments = new Map<number, string>();
    events.forEach((e, idx) => {
        const typ = e.type as string, t = e.seq_tick as number | null;
        if (t === null || t === undefined)
            throw new MidiError(`lane ${lane}: ${typ} event at ROM offset ${e.offset} has no tempo-tick position`);
        if (!MAPPED_EVENTS.has(typ)) {
            bump(unmapped, typ);
            return;
        }
        if (typ === "note_on") {
            const midi = "midi_note" in e ? e.midi_note : e.note + D.MIDI_NOTE_OFFSET;
            if (!(midi >= 0 && midi <= 127))
                throw new MidiError(`lane ${lane}: note ${e.note} at tick ${t} is MIDI note ${midi}`);
            if (e.gate)
                inc(derivedOffs, `${t + e.gate}/${e.note}`);
            if (e.muted) {
                bump(counts, "muted_notes_skipped");
                return;
            }
            items.push([t, 1, idx, M.evNoteOn(t, channel, midi, VELOCITY)]);
            if (e.gate)
                items.push([t + e.gate, 0, idx, M.evNoteOff(t + e.gate, channel, midi)]);
            notes.push({ idx, tick: t, gate: e.gate, midi, release: null });
        }
        else if (typ === "note_off") {
            inc(irOffs, `${t}/${e.note}`);
        }
        else if (typ === "instrument") {
            if (!(e.instrument >= 0 && e.instrument <= 127))
                throw new MidiError(`lane ${lane}: instrument ${e.instrument} is not a MIDI program`);
            items.push([t, 1, idx, M.evProgram(t, channel, e.instrument)]);
            instruments.set(e.instrument, e.instrument_type);
            bump(counts, "program_changes");
        }
        else if (typ === "volume") {
            items.push([t, 1, idx, M.evControl(t, channel, 7, volumeController(e.attenuation))]);
            bump(counts, "volume_changes");
        }
        else if (typ === "pitch_offset") {
            items.push([t, 1, idx, M.evPitchBend(t, channel, pitchBendValue(e.fine, e.coarse))]);
            bump(counts, "pitch_bends");
        }
        else {
            bump(counts, "tempo_events");
        }
    });
    const same = irOffs.size === derivedOffs.size && [...irOffs].every(([k, v]) => derivedOffs.get(k) === v);
    if (!same) {
        const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);
        throw new MidiError(`lane ${lane}: the IR's note-off events do not match the note gates (${sum(irOffs)} vs ${sum(derivedOffs)} key-offs)`);
    }
    const onsets = [...new Set(notes.map((n) => n.tick))].sort((a, b) => a - b);
    for (const n of notes) {
        n.release = n.gate ? n.tick + n.gate : null;
        if (!n.gate) {
            let i = 0;
            while (i < onsets.length && onsets[i]! <= n.tick)
                i++;
            n.release = i < onsets.length ? onsets[i]! : null;
            n.open_ended = true;
        }
    }
    return { items, notes, counts, unmapped, instruments };
}
function finishLane(lane: number, channel: number, data: LaneData, endTick: number): [
    M.Ev[],
    Dict[]
] {
    const items = [...data.items];
    const byIdx = new Map(data.notes.map((n) => [n.idx, n]));
    for (const n of data.notes) {
        n.intended = n.release === null ? endTick : n.release;
        if (n.open_ended)
            items.push([n.intended, 0, n.idx, M.evNoteOff(n.intended, channel, n.midi)]);
    }
    items.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    const sounding = new Map<number, Note[]>();
    const overlaps: Dict[] = [];
    for (const [tick, , idx, ev] of items) {
        if (ev.type === "note_on") {
            let q = sounding.get(ev.note);
            if (!q)
                sounding.set(ev.note, (q = []));
            q.push(byIdx.get(idx)!);
        }
        else if (ev.type === "note_off") {
            sounding.get(ev.note)!.shift()!.paired = tick;
        }
    }
    for (const n of data.notes) {
        if (n.paired !== n.intended) {
            overlaps.push({ lane, midi_note: n.midi, tick: n.tick, ir_duration: n.intended! - n.tick, smf_duration: n.paired! - n.tick });
        }
    }
    return [items.map((it) => it[3]), overlaps];
}
function tempoList(doc: Dict): Dict[] {
    const changes = doc.tempo_changes as Dict[];
    if (!changes.length)
        return [{ tick: 0, bpm: 120, rate: D.DEFAULT_RATE, source: "driver_default" }];
    return changes.map((c) => {
        if (c.seq_tick === null || c.seq_tick === undefined)
            throw new MidiError(`tempo change at ROM offset ${c.offset} has no tempo-tick position`);
        return { tick: c.seq_tick, bpm: c.bpm, rate: c.rate, source: c.source };
    });
}
export function buildMidi(doc: Dict, irSha256: string, irRel: string, midRel: string): [
    Uint8Array,
    Dict
] {
    const channels = assignChannels(doc);
    const docChannels = doc.channels as Dict[];
    const lanes = channels.map(([lane, midiCh], i) => laneItems(lane, docChannels[i]!, midiCh));
    const tempo = tempoList(doc);
    for (const t of tempo)
        t.usec_per_quarter = usecPerQuarter(t.rate);
    if ((doc.tempo_changes as Dict[]).length) {
        const nOps = lanes.reduce((s, d) => s + (d.counts.tempo_events ?? 0), 0);
        if (nOps !== tempo.length - 1)
            throw new MidiError(`the lanes run ${nOps} tempo events, the IR's tempo list holds ${tempo.length - 1}`);
    }
    const loop = doc.loop as Dict | null;
    if (loop !== null && (loop.start_seq_tick === null || loop.end_seq_tick === null))
        throw new MidiError("the track loop has no tempo-tick bounds");
    let end = doc.duration.seq_ticks as number;
    for (const d of lanes) {
        for (const it of d.items)
            end = Math.max(end, it[0]);
        for (const n of d.notes) {
            end = Math.max(end, n.tick + n.gate, n.release === null ? n.tick + 1 : n.release);
            if (doc.kind === "sfx")
                end = Math.max(end, n.tick + SFX_TAIL_TICKS);
        }
    }
    end = Math.max(end, ...tempo.map((t) => t.tick as number), ...(loop ? [loop.end_seq_tick as number] : []));
    const conductor: M.Ev[] = [M.evText(0, M.META_TRACK_NAME, `${doc.kind} ${(doc.id as number).toString(16).toUpperCase().padStart(2, "0")}`)];
    const condItems: Item[] = [];
    tempo.forEach((t, k) => condItems.push([t.tick, 1, k, M.evTempo(t.tick, t.usec_per_quarter)]));
    let markers = 0;
    if (loop !== null) {
        condItems.push([loop.end_seq_tick, 2, 0, M.evText(loop.end_seq_tick, M.META_MARKER, "loopEnd")]);
        condItems.push([loop.start_seq_tick, 3, 0, M.evText(loop.start_seq_tick, M.META_MARKER, "loopStart")]);
        markers = 2;
    }
    condItems.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    conductor.push(...condItems.map((it) => it[3]), M.evEnd(end));
    const tracks: M.Ev[][] = [conductor];
    const overlaps: Dict[] = [];
    const unmapped: Record<string, number> = {};
    const cmap: Dict[] = [];
    const totals: Record<string, number> = { notes: 0, open_ended_notes: 0, program_changes: 0, volume_changes: 0, pitch_bends: 0, muted_notes_skipped: 0 };
    const used = new Map<number, string>();
    channels.forEach(([lane, midiCh], i) => {
        const ch = docChannels[i]!, d = lanes[i]!;
        const [evs, ov] = finishLane(lane, midiCh, d, end);
        overlaps.push(...ov);
        for (const [k, v] of Object.entries(d.unmapped))
            unmapped[k] = (unmapped[k] ?? 0) + v;
        for (const [k, v] of d.instruments)
            used.set(k, v);
        const nOpen = d.notes.filter((n) => n.open_ended).length;
        const row: Dict = {
            lane, ir_channel: ch.index, midi_channel: midiCh + 1, smf_track: lane + 1, kind: ch.kind, notes: d.notes.length,
            open_ended_notes: nOpen, program_changes: d.counts.program_changes ?? 0,
            volume_changes: d.counts.volume_changes ?? 0, pitch_bends: d.counts.pitch_bends ?? 0,
        };
        cmap.push(row);
        for (const key of ["notes", "open_ended_notes", "program_changes", "volume_changes", "pitch_bends"])
            totals[key]! += row[key];
        totals.muted_notes_skipped! += d.counts.muted_notes_skipped ?? 0;
        tracks.push([M.evText(0, M.META_TRACK_NAME, `lane ${lane} ${ch.kind}`), ...evs, M.evEnd(end)]);
    });
    const data = M.writeSmf(tracks, PPQ);
    const back = M.readSmf(data);
    if (!M.eventsEqual(back.tracks, tracks) || back.ppq !== PPQ || back.format !== 1)
        throw new MidiError("the file read back from the written bytes differs from the events written");
    back.tracks.slice(1).forEach((track, i) => {
        if (M.noteScheduleCount(track) !== cmap[i]!.notes)
            throw new MidiError(`lane ${cmap[i]!.lane}: the notes read back differ in number`);
    });
    const sortedUnmapped: Dict = {};
    for (const k of Object.keys(unmapped).sort())
        sortedUnmapped[k] = unmapped[k];
    const meta: Dict = {
        format: META_FORMAT, id: doc.id, kind: doc.kind, file: midRel,
        source: { ir: irRel, ir_sha256: irSha256, rom_offset: doc.rom_offset },
        smf: { format: 1, ppq: PPQ, tracks: tracks.length, bytes: data.length, end_tick: end },
        velocity: VELOCITY,
        tempo,
        loop: loop === null ? null : { start_tick: loop.start_seq_tick, end_tick: loop.end_seq_tick, start_frame: loop.start_tick, end_frame: loop.end_tick },
        duration: { seq_ticks: doc.duration.seq_ticks, frames: doc.duration.frames },
        channel_map: cmap,
        instruments: [...used.keys()].sort((a, b) => a - b).map((i) => ({ index: i, type: used.get(i) })),
        event_counts: {
            notes: totals.notes, open_ended_notes: totals.open_ended_notes, program_changes: totals.program_changes,
            volume_changes: totals.volume_changes, pitch_bends: totals.pitch_bends, tempo_events: tempo.length,
            markers, midi_events: tracks.reduce((s, t) => s + t.length, 0),
        },
        muted_notes_skipped: totals.muted_notes_skipped,
        same_key_overlaps: overlaps,
        unmapped_events: sortedUnmapped,
    };
    if (doc.kind === "music") {
        meta.sound_ids = [...doc.sound_ids];
    }
    else {
        meta.sound_table = doc.sound_table instanceof Map ? Object.fromEntries(doc.sound_table) : { ...doc.sound_table };
        const on = (docChannels[0]!.events as Dict[]).find((e) => e.type === "note_on")!;
        if ("sample" in on) {
            const hdr = (doc.pcm_samples ?? {})[String(on.sample)] ?? {};
            meta.pcm = { sample: on.sample, rate_override: on.rate_override, rate_code: hdr.rate_code ?? null, length: hdr.length ?? null };
        }
    }
    return [data, meta];
}
export const midi: Command = {
    name: "midi",
    async run(ctx: Context, options: Record<string, unknown>): Promise<void> {
        let want: Set<number> | null = null;
        if (options.tracks) {
            want = new Set(String(options.tracks).split(",").filter((x) => x.trim()).map((x) => Number(x.trim())));
        }
        const docs = new Map<string, Dict>();
        const cap = {
            rom: ctx.rom,
            say: (_t?: string): void => { },
            writeJson: (rel: string, obj: unknown): void => { docs.set(rel, obj as Dict); },
        } as unknown as Context;
        await music.run(cap, { no_sfx: false, tracks: null });
        const pick = (kind: string): Array<[
            number,
            string,
            Dict
        ]> => [...docs].filter(([rel, d]) => rel.endsWith(".ir.json") && d.kind === kind).map(([rel, d]): [
            number,
            string,
            Dict
        ] => [d.id, rel, d]).sort((a, b) => a[0] - b[0]);
        let tracks = pick("music");
        let sfx = pick("sfx");
        if (want !== null) {
            const have = new Set(tracks.map((t) => t[0]));
            const bad = [...want].filter((x) => !have.has(x)).sort((a, b) => a - b);
            if (bad.length)
                throw new Error(`no such track(s): [${bad.join(", ")}]`);
            tracks = tracks.filter((t) => want!.has(t[0]));
        }
        if (options.no_sfx)
            sfx = [];
        const indexTracks: Dict[] = [], indexSfx: Dict[] = [];
        const midiAll = [...tracks, ...sfx];
        let midiNo = 0;
        for (const [tid, irRel, doc] of midiAll) {
            ctx.progress(midiNo++, midiAll.length, `file ${midiNo} of ${midiAll.length}`);
            const sha = sha256Hex(canonicalJson(doc));
            const stem = doc.kind === "music" ? `${OUT}/${String(tid).padStart(2, "0")}` : `${OUT}/sfx/${tid.toString(16).padStart(2, "0")}`;
            const [data, meta] = buildMidi(doc, sha, irRel, stem + ".mid");
            const a = doc.kind === "music" ? { track: tid } : { sound_id: tid };
            ctx.writeBytes(stem + ".mid", data, a);
            ctx.writeJson(stem + ".json", meta, a);
            const row: Dict = {
                id: tid, file: stem + ".mid", meta: stem + ".json", notes: meta.event_counts.notes, end_tick: meta.smf.end_tick,
                midi_channels: (meta.channel_map as Dict[]).map((c) => c.midi_channel),
            };
            if (doc.kind === "music") {
                row.sound_ids = meta.sound_ids;
                row.lanes = meta.channel_map.length;
                row.looping = meta.loop !== null;
                indexTracks.push(row);
            }
            else {
                row.kind = docChannelsKind(doc);
                row.sound_table = meta.sound_table;
                indexSfx.push(row);
            }
            ctx.say(`midi: ${doc.kind} ${tid.toString(16).toUpperCase().padStart(2, "0")}: ${row.notes} notes, ${meta.channel_map.length} lane(s), ${data.length} bytes`);
        }
        const sortedSfx: Dict = {};
        for (const k of Object.keys(SFX_CHANNELS).sort())
            sortedSfx[k] = SFX_CHANNELS[k];
        ctx.writeJson(OUT + "/index.json", {
            format: INDEX_FORMAT, ppq: PPQ, smf_format: 1, velocity: VELOCITY,
            usec_per_quarter: "round(102400000 / rate); rate = (bpm * 436) >> 8 per 60 Hz frame",
            channel_policy: {
                music_lanes: [...MUSIC_CHANNELS], pcm: PCM_CHANNEL, sound_effects: sortedSfx,
                reserved: [10], note: "1-based channel numbers; 10 (General MIDI percussion) is never used",
            },
            tracks: indexTracks, sounds: indexSfx,
        });
    },
};
function docChannelsKind(doc: Dict): string {
    return (doc.channels as Dict[])[0]!.kind;
}

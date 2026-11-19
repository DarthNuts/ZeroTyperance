import type { RomFile } from "../core.js";
import { PyFloat } from "../core.js";
import * as D from "./driver.js";
import { ParseError, Track, framesForTicks, type Event } from "./parser.js";
export const IR_FORMAT = "zt-music-ir/1";
export const MAX_LOOP_TICKS = 1000000;
export const CONTROL_FLOW = new Set(["loop_start", "loop_end", "jump", "status_branch", "nop"]);
export const OFFSET_TO_OP: Record<number, number> = { 0: 1, 4: 3, 8: 2, 12: 4 };
type Dict = Record<string, unknown>;
export function hx(v: number): string {
    return "0x" + v.toString(16).toUpperCase().padStart(6, "0");
}
export function le16(rom: RomFile, off: number): number {
    return rom.u8(off) | (rom.u8(off + 1) << 8);
}
export function s16(v: number): number {
    return v & 0x8000 ? v - 0x10000 : v;
}
const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export function tableOffsets(rom: RomFile, base: number): number[] {
    const first = le16(rom, base);
    if (first === 0 || first & 1)
        throw new ParseError("bank offset table does not start with an even size", base);
    return Array.from({ length: first >> 1 }, (_, i) => le16(rom, base + 2 * i));
}
export function tracks(rom: RomFile): Array<[
    number,
    number,
    number[]
]> {
    const out: Array<[
        number,
        number,
        number[]
    ]> = [];
    tableOffsets(rom, D.BANK_TRACKS).forEach((rel, t) => {
        const h = D.BANK_TRACKS + rel;
        const n = rom.u8(h);
        if (!(n >= 1 && n <= D.MAX_CHANNELS))
            throw new ParseError(`track ${t} header claims ${n} channels`, h);
        out.push([t, h, Array.from({ length: n }, (_, k) => D.BANK_TRACKS + le16(rom, h + 1 + 2 * k))]);
    });
    return out;
}
export function instrumentRecords(rom: RomFile): Array<[
    number,
    number,
    Uint8Array
]> {
    return tableOffsets(rom, D.BANK_INSTRUMENTS).map((rel, i): [
        number,
        number,
        Uint8Array
    ] => {
        const off = D.BANK_INSTRUMENTS + rel;
        return [i, off, rom.bytesAt(off, D.INSTRUMENT_BYTES)];
    });
}
export function decodeInstrument(i: number, off: number, rec: Uint8Array, patchTable: Array<[
    number,
    number | null,
    boolean
]>, carriers: number[]): Dict {
    const t = rec[0]!;
    const doc: Dict = { index: i, rom_offset: hx(off), raw: toHex(rec), type: D.INSTRUMENT_TYPES[t] ?? "unknown" };
    if (t === 0) {
        const regs = patchTable.map(([reg, idx]) => [reg, idx === null ? 0 : rec[idx]!]);
        const alg = rec[3]! & 7;
        const ops: Dict[] = [];
        const shift: Record<number, number> = { 0: 0, 8: 1, 4: 2, 12: 3 };
        for (const [baseIdx, roff] of [[5, 0], [11, 4], [17, 8], [23, 12]] as const) {
            const [dtmul, tl, rsar, amd1, d2, slrr] = [rec[baseIdx]!, rec[baseIdx + 1]!, rec[baseIdx + 2]!, rec[baseIdx + 3]!, rec[baseIdx + 4]!, rec[baseIdx + 5]!];
            ops.push({
                op: OFFSET_TO_OP[roff], register_offset: roff,
                dt: (dtmul >> 4) & 7, mul: dtmul & 15, tl: tl & 0x7f,
                rs: rsar >> 6, ar: rsar & 31, am: amd1 >> 7, d1r: amd1 & 31,
                d2r: d2 & 31, d1l: slrr >> 4, rr: slrr & 15, ssg_eg: 0,
                carrier: ((carriers[alg]! >> shift[roff]!) & 1) === 1,
            });
        }
        ops.sort((a, b) => (a.op as number) - (b.op as number));
        Object.assign(doc, {
            lfo: rec[1], lfo_written: (rec[1]! & 8) !== 0, mode: rec[2],
            ch3_special: (rec[2]! & 0x40) !== 0,
            algorithm: alg, feedback: (rec[3]! >> 3) & 7,
            pan_left: (rec[4]! & 0x80) !== 0, pan_right: (rec[4]! & 0x40) !== 0,
            ams: (rec[4]! >> 4) & 3, fms: rec[4]! & 7,
            operators: ops,
            ch3_frequencies: [0, 1, 2, 3].map((k) => (rec[29 + 2 * k]! << 8) | rec[30 + 2 * k]!),
            key_on_mask: rec[37]! & 15,
            registers: regs,
            attenuation_scaled_tl: patchTable.filter(([, , c]) => c).map(([reg]) => reg),
        });
    }
    else if (t === 1) {
        Object.assign(doc, { rate_override: rec[1], rate_override_active: rec[1] !== 4 });
    }
    else if (t === 2 || t === 3) {
        Object.assign(doc, {
            noise_control: rec[1], attack_step: rec[2],
            sustain_attenuation: rec[3]! & 15, peak_attenuation: rec[4]! & 15,
            decay_step: rec[5], release_step: rec[6],
            noise_from_tone3: t === 3 && (rec[1]! & 3) === 3,
        });
    }
    return doc;
}
export function macros(rom: RomFile): Dict[] {
    const out: Dict[] = [];
    tableOffsets(rom, D.BANK_MACROS).forEach((rel, m) => {
        const off = D.BANK_MACROS + rel;
        let o = off + 2;
        const segs: Dict[] = [];
        for (;;) {
            const n = rom.u8(o);
            if (n === 0)
                break;
            const d = s16(le16(rom, o + 1));
            segs.push({ ticks: n, delta_raw: d, delta_semitones: new PyFloat(d / 256.0) });
            o += 3;
            if (o - off > D.MACRO_COPY_BYTES)
                throw new ParseError(`pitch macro ${m} runs past the ${D.MACRO_COPY_BYTES} bytes the driver copies`, off);
        }
        const init = s16(le16(rom, off));
        out.push({ index: m, rom_offset: hx(off), bytes: o + 1 - off, initial_raw: init, initial_semitones: new PyFloat(init / 256.0), segments: segs });
    });
    return out;
}
export function pcmHeaders(rom: RomFile): Dict[] {
    const first = rom.u8(D.BANK_PCM + 1) | (rom.u8(D.BANK_PCM + 2) << 8) | (rom.u8(D.BANK_PCM + 3) << 16);
    if (first % D.PCM_HEADER_BYTES)
        throw new ParseError("first PCM header's data offset is not a whole number of headers", D.BANK_PCM);
    const out: Dict[] = [];
    for (let i = 0; i < Math.floor(first / D.PCM_HEADER_BYTES); i++) {
        const off = D.BANK_PCM + i * D.PCM_HEADER_BYTES;
        const h = rom.bytesAt(off, D.PCM_HEADER_BYTES);
        const data = D.BANK_PCM + (h[1]! | (h[2]! << 8) | (h[3]! << 16)) + (h[4]! | (h[5]! << 8));
        const length = h[6]! | (h[7]! << 8);
        out.push({ index: i, rom_offset: hx(off), raw: toHex(h), flags: h[0], rate_code: h[0]! & 15, data_offset: hx(data), length, present: length !== 0 });
    }
    return out;
}
export function bankTiling(_rom: RomFile, trackList: Array<[
    number,
    number,
    number[]
]>, channelSpans: Map<string, [
    number,
    number
]> | Array<[
    [
        number,
        number
    ],
    [
        number,
        number
    ]
]>): Dict {
    const iv: Array<[
        number,
        number,
        string
    ]> = [[D.BANK_TRACKS, D.BANK_TRACKS + 2 * trackList.length, "offset_table"]];
    for (const [t, h, chans] of trackList)
        iv.push([h, h + 1 + 2 * chans.length, `header ${t}`]);
    const spans: Array<[
        [
            number,
            number
        ],
        [
            number,
            number
        ]
    ]> = channelSpans instanceof Map
        ? [...channelSpans.entries()].map(([k, v]): [
            [
                number,
                number
            ],
            [
                number,
                number
            ]
        ] => { const [t, c] = k.split(",").map(Number) as [
            number,
            number
        ]; return [[t, c], v]; })
        : channelSpans;
    spans.sort((x, y) => x[0][0] - y[0][0] || x[0][1] - y[0][1]);
    for (const [[t, k], [a, b]] of spans)
        iv.push([a, b, `track ${t} channel ${k}`]);
    iv.sort((x, y) => x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0));
    const gaps: string[][] = [], overlaps: string[][] = [];
    let pos = D.BANK_TRACKS;
    for (const [a, b, what] of iv) {
        if (a > pos)
            gaps.push([hx(pos), hx(a)]);
        else if (a < pos)
            overlaps.push([hx(a), hx(pos), what]);
        pos = Math.max(pos, b);
    }
    if (pos < D.MUSIC_DATA_END)
        gaps.push([hx(pos), hx(D.MUSIC_DATA_END)]);
    return {
        start: hx(D.BANK_TRACKS), end: hx(pos), expected_end: hx(D.MUSIC_DATA_END),
        intervals: iv.length, gaps, overlaps,
        tiled: gaps.length === 0 && overlaps.length === 0 && pos === D.MUSIC_DATA_END,
    };
}
function gcd(a: number, b: number): number {
    while (b)
        [a, b] = [b, a % b];
    return a;
}
export function lcm(a: number, b: number): number {
    return (a * b) / gcd(a, b);
}
import type { Channel } from "./parser.js";
export type LoopInfo = [
    boolean,
    number,
    number,
    number
];
const eq = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
export function minimalLoop(ch: Channel): LoopInfo {
    const [[f0, s0, i0], [f1, s1, i1]] = [ch.loop!.start, ch.loop!.end];
    const useSeq = s0 !== null && s1 !== null;
    const period = useSeq ? s1! - s0! : f1 - f0;
    const start = useSeq ? s0! : f0;
    const at = (e: Event): number => (useSeq ? e.seq! : e.frame);
    const sorted = (d: Dict): Array<[
        string,
        unknown
    ]> => Object.entries(d).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    const sound: Array<[
        number,
        Event
    ]> = [];
    ch.events.forEach((e, k) => { if (!CONTROL_FLOW.has(e.type))
        sound.push([k, e]); });
    const pre: Array<[
        number,
        string,
        number | null
    ]> = sound.filter(([k]) => k < i1)
        .map(([k, e]) => [at(e), JSON.stringify([e.type, sorted(e.data), e.offset]), k]);
    const body = pre.filter((x) => (x[2] as number) >= i0);
    const timeline: Array<[
        number,
        string,
        number | null
    ]> = [
        ...pre,
        ...body.map(([t, key]): [
            number,
            string,
            null
        ] => [t + period, key, null]),
        ...body.map(([t, key]): [
            number,
            string,
            null
        ] => [t + 2 * period, key, null]),
    ];
    const ticks = new Map<number, Array<[
        string,
        number | null
    ]>>();
    for (const [t, key, k] of timeline) {
        let l = ticks.get(t);
        if (!l)
            ticks.set(t, (l = []));
        l.push([key, k]);
    }
    const keys = (t: number): string[] => (ticks.get(t) ?? []).map((x) => x[0]);
    let s = start + period;
    while (s > 0 && eq(keys(s - 1), keys(s - 1 + period)))
        s -= 1;
    let b = s;
    if (s > 0) {
        const cur = keys(s - 1), nxt = keys(s - 1 + period);
        if (nxt.length < cur.length && eq(cur.slice(cur.length - nxt.length), nxt))
            b = s - 1;
    }
    let boundary = 0;
    if (b < s) {
        const here = ticks.get(b) ?? [];
        const inLoop = here.slice(here.length - keys(b + period).length);
        boundary = inLoop.length ? (inLoop[0]![1] as number) : ch.events.length;
    }
    return [useSeq, b, period, boundary];
}
export function eventDoc(e: Event): Dict {
    const d: Dict = { tick: e.frame, seq_tick: e.seq, type: e.type, offset: hx(e.offset) };
    Object.assign(d, e.data);
    return d;
}
export function buildTrack(rom: RomFile, tid: number, header: number, chanOffsets: number[], instTypes: Map<number, number>, initialBpm: number | null, bpmSource: string, soundIds: number[], instDocs: Map<number, Dict>, macroDocs: Dict[]): Dict {
    const read = (o: number): number => rom.u8(o);
    const instType = (i: number): number => instTypes.get(i) ?? -1;
    const probe = new Track(read, tid, chanOffsets, D.MUSIC_DATA_END, instType, initialBpm);
    probe.run(null, 2000000, true);
    const loops = new Map<number, LoopInfo>();
    for (const ch of probe.channels)
        if (ch.loop !== null)
            loops.set(ch.index, minimalLoop(ch));
    const seqLoops = [...loops.values()].filter((v) => v[0]);
    let loopSeq: [
        number,
        number
    ] | null = null;
    let horizon: number | null = null;
    if (seqLoops.length) {
        const start = Math.max(...seqLoops.map((v) => v[1]));
        let period = 1;
        for (const v of seqLoops) {
            period = lcm(period, v[2]);
            if (period > MAX_LOOP_TICKS)
                throw new ParseError(`track ${tid}: channel loop periods have no common repeat within ${MAX_LOOP_TICKS} ticks`, header);
        }
        horizon = start + period;
        loopSeq = [start, horizon];
    }
    const tr = new Track(read, tid, chanOffsets, D.MUSIC_DATA_END, instType, initialBpm);
    tr.run(horizon);
    const tempoPoints = tr.tempo.map((t): [
        number,
        number
    ] => [t[1]!, t[3]]);
    const initialRate = initialBpm !== null ? D.tempoRate(initialBpm) : D.DEFAULT_RATE;
    let maxSeq = (horizon || 0) + 1;
    for (const ch of tr.channels) {
        for (const e of ch.events) {
            if (e.seq !== null)
                maxSeq = Math.max(maxSeq, e.seq + 1 + (e.type === "note_on" ? ((e.data.gate as number | undefined) ?? 0) : 0));
        }
    }
    const frameOf = framesForTicks(tempoPoints, maxSeq + 1, initialRate);
    for (const ch of tr.channels) {
        for (const e of ch.events) {
            if (e.seq !== null && frameOf[e.seq] !== e.frame)
                throw new ParseError(`track ${tid}: frame model disagrees with the executor at tick ${e.seq}`, e.offset);
        }
    }
    const channels: Dict[] = [];
    const warnings: string[] = [];
    let unknown = 0, totalBytes = 0;
    const usedInst = new Set<number>(), usedMacros = new Set<number>();
    tr.channels.forEach((ch, ci) => {
        const pch = probe.channels[ci]!;
        const evs: Array<[
            number,
            number,
            number,
            Dict
        ]> = [];
        const lp = loops.get(ch.index);
        const prefixCut = lp && lp[0] && loopSeq && lp[1] === loopSeq[0] ? lp[3] : null;
        for (const e of ch.events) {
            const doc = eventDoc(e);
            if (prefixCut !== null && e.seq === loopSeq![0] && e.order < prefixCut)
                doc.loop_prefix = true;
            evs.push([e.seq !== null ? e.seq : e.frame, 1, e.order, doc]);
            if (e.type === "note_on") {
                if (e.data.instrument != null)
                    usedInst.add(e.data.instrument as number);
                const g = (e.data.gate as number | undefined) ?? 0;
                if (g) {
                    let sOff: number | null, fOff: number;
                    if (e.seq !== null) {
                        sOff = e.seq + g;
                        fOff = frameOf[sOff]!;
                    }
                    else {
                        sOff = null;
                        fOff = e.frame + g;
                    }
                    const off: Dict = { tick: fOff, seq_tick: sOff, type: "note_off", offset: hx(e.offset), note: e.data.note };
                    if ("midi_note" in e.data)
                        off.midi_note = e.data.midi_note;
                    if ("sample" in e.data)
                        off.sample = e.data.sample;
                    evs.push([sOff !== null ? sOff : fOff, 0, e.order, off]);
                }
            }
            else if (e.type === "instrument") {
                usedInst.add(e.data.instrument as number);
            }
            else if (e.type === "pitch_macro") {
                usedMacros.add(e.data.macro as number);
            }
        }
        evs.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
        const events = evs.map((t) => t[3]);
        const kinds = [...new Set(events.filter((e) => e.type === "note_on").map((e) => e.instrument_type as string))].sort();
        const kind = kinds.length === 1 ? kinds[0]! : (kinds.length === 0 ? "none" : "mixed");
        const instChanges = events.filter((e) => e.type === "instrument").map((e) => ({
            tick: e.tick, seq_tick: e.seq_tick, instrument: e.instrument, instrument_type: e.instrument_type,
        }));
        let cloop: Dict | null = null;
        const li = loops.get(ch.index);
        if (li) {
            const [useSeq, st, per] = li;
            if (useSeq)
                cloop = { start_seq_tick: st, end_seq_tick: st + per, start_tick: frameOf[st], end_tick: frameOf[st + per] };
            else
                cloop = { start_seq_tick: null, end_seq_tick: null, start_tick: st, end_tick: st + per };
        }
        const span = ch.span;
        const nbytes = span[1] - span[0];
        totalBytes += nbytes;
        const unk = new Set([...pch.stray, ...ch.stray]).size;
        unknown += unk;
        for (const w of [...new Set([...ch.warnings, ...pch.warnings])].sort())
            warnings.push(`channel ${ch.index}: ${w}`);
        let end: Dict | null = null;
        if (ch.ended !== null)
            end = { tick: ch.ended[0], seq_tick: ch.ended[1] };
        channels.push({
            index: ch.index, kind, clock: ch.frameClock ? "frame" : "tempo",
            rom_offset: hx(span[0]), bytes: nbytes, unknown_bytes: unk,
            notes: events.filter((e) => e.type === "note_on").length,
            instrument_changes: instChanges, loop: cloop, end, events,
        });
    });
    const tempoChanges: Dict[] = [{ tick: 0, seq_tick: 0, bpm: initialBpm !== null ? initialBpm : 120, rate: initialRate, source: bpmSource, channel: null, offset: null }];
    for (const [frame, seq, bpm, rate, chi, off] of tr.tempo) {
        tempoChanges.push({ tick: frame, seq_tick: seq, bpm, rate, source: "opcode", channel: chi, offset: hx(off) });
    }
    let loop: Dict | null;
    let duration: Dict;
    if (loopSeq) {
        loop = { start_seq_tick: loopSeq[0], end_seq_tick: loopSeq[1], start_tick: frameOf[loopSeq[0]], end_tick: frameOf[loopSeq[1]] };
        duration = { seq_ticks: loopSeq[1], frames: frameOf[loopSeq[1]] };
    }
    else {
        loop = null;
        let lastF = 0, lastS = 0;
        for (const c of channels) {
            for (const e of c.events as Dict[]) {
                lastF = Math.max(lastF, e.tick as number);
                if (e.seq_tick !== null)
                    lastS = Math.max(lastS, e.seq_tick as number);
            }
        }
        duration = { seq_ticks: lastS, frames: lastF };
    }
    const headerBytes = 1 + 2 * chanOffsets.length;
    const instruments: Dict = {};
    for (const i of [...usedInst].sort((a, b) => a - b))
        if (instDocs.has(i))
            instruments[String(i)] = instDocs.get(i);
    const macroOut: Dict = {};
    for (const m of [...usedMacros].sort((a, b) => a - b))
        if (m < macroDocs.length)
            macroOut[String(m)] = macroDocs[m];
    return {
        format: IR_FORMAT, id: tid, kind: "music",
        rom_offset: hx(header), bytes: headerBytes + totalBytes,
        header: { rom_offset: hx(header), bytes: headerBytes, channels: chanOffsets.length },
        sound_ids: soundIds,
        tick: { unit: "frame", hz: 60, seq_unit: "tempo_tick", ppq: 24, frame_model: "tick 0 at frame 0, tempo accumulator fraction 0 after it" },
        tempo_changes: tempoChanges, loop, duration,
        channels,
        instruments, macros: macroOut,
        unknown_bytes: unknown, warnings,
    };
}
export interface SoundEntry {
    id: number;
    mode: number;
    cmd: number;
    var: number;
}
export function buildSfx(entry: SoundEntry, instRecords: Array<[
    number,
    number,
    Uint8Array
]>, instDocs: Map<number, Dict>, pcmDocs: Dict[]): Dict {
    const { id: sid, mode, cmd, var: v } = entry;
    const events: Dict[] = [];
    const instruments: Dict = {}, samples: Dict = {};
    let inst: number, note: number, chan: number, rate: number | null, romOff: number, nbytes = 0, rec: Uint8Array, off: number;
    if (mode === 1) {
        if (cmd >= instRecords.length)
            throw new ParseError(`sound ${sid} uses instrument ${cmd}, the bank has ${instRecords.length}`, D.SOUND_TABLE + 3 * sid);
        [, off, rec] = instRecords[cmd]!;
        inst = cmd;
        note = v;
        chan = D.SFX_CHANNELS[0];
        rate = null;
        romOff = off;
        nbytes = D.INSTRUMENT_BYTES;
    }
    else {
        [, off, rec] = instRecords[D.BOOT_PCM_INSTRUMENT]!;
        inst = D.BOOT_PCM_INSTRUMENT;
        note = cmd;
        chan = D.PCM_CHANNEL;
        rate = v;
        romOff = 0;
    }
    const itype = D.INSTRUMENT_TYPES[rec[0]!] ?? "unknown";
    instruments[String(inst)] = instDocs.get(inst);
    const tableOff = D.SOUND_TABLE + 3 * sid;
    events.push({ tick: 0, seq_tick: 0, type: "instrument", offset: hx(off), instrument: inst, instrument_type: itype });
    const on: Dict = { tick: 0, seq_tick: 0, type: "note_on", offset: hx(tableOff), note, gate: 0, instrument: inst, instrument_type: itype };
    const pcmIndex = (((note - D.PCM_NOTE_BASE) % D.NOTE_LIMIT) + D.NOTE_LIMIT) % D.NOTE_LIMIT;
    if (itype === "pcm") {
        if (rate !== null)
            events.push({ tick: 0, seq_tick: 0, type: "pcm_rate", offset: hx(tableOff), value: rate });
        on.sample = pcmIndex;
        on.rate_override = rate;
        if (pcmIndex < pcmDocs.length)
            samples[String(pcmIndex)] = pcmDocs[pcmIndex];
    }
    else {
        on.midi_note = D.midiNote(note);
    }
    events.push(on);
    if (mode !== 1) {
        romOff = D.BANK_PCM + pcmIndex * D.PCM_HEADER_BYTES;
        nbytes = D.PCM_HEADER_BYTES;
    }
    return {
        format: IR_FORMAT, id: sid, kind: "sfx", rom_offset: hx(romOff), bytes: nbytes,
        sound_table: { mode, cmd, var: v, rom_offset: hx(tableOff) },
        tick: { unit: "frame", hz: 60, seq_unit: "tempo_tick", ppq: 24, frame_model: "one note at frame 0" },
        tempo_changes: [], loop: null, duration: { seq_ticks: 0, frames: 0 },
        channels: [{
                index: chan, kind: itype, clock: "tempo", rom_offset: hx(romOff),
                bytes: nbytes, unknown_bytes: 0, notes: 1,
                alternate_index: mode === 1 ? D.SFX_CHANNELS[1] : null,
                instrument_changes: [{ tick: 0, seq_tick: 0, instrument: inst, instrument_type: itype }],
                loop: null, end: null, events,
            }],
        instruments, macros: {}, pcm_samples: samples,
        unknown_bytes: 0, warnings: [],
    };
}

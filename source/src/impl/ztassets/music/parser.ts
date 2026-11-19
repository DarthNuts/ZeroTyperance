import * as D from "./driver.js";
import { PyFloat } from "../core.js";
export class ParseError extends Error {
    readonly offset: number;
    constructor(msg: string, offset: number) {
        super(`${msg} (at ROM offset 0x${offset.toString(16).toUpperCase().padStart(6, "0")})`);
        this.offset = offset;
    }
}
export interface Cmd {
    readonly offset: number;
    readonly size: number;
    readonly kind: string;
    readonly op: number;
    readonly args: number[];
    readonly value: number | null;
}
export type Reader = (off: number) => number;
export const BANK_MASK = 0xff << 16;
export const ADDR24_MASK = (1 << 24) - 1;
function vlqClass(b: number): string | null {
    if (b >= 0xc0)
        return "delta";
    if (b >= 0x80)
        return "gate";
    return null;
}
export function decodeAt(read: Reader, off: number, limit: number): Cmd {
    const byte = (o: number): number => {
        if (o >= limit)
            throw new ParseError(`stream runs past its data end 0x${limit.toString(16).toUpperCase().padStart(6, "0")} (truncated?)`, o);
        return read(o);
    };
    const b = byte(off);
    const cls = vlqClass(b);
    if (cls) {
        let v = b & 0x3f, o = off + 1;
        for (;;) {
            if (o >= limit)
                throw new ParseError(`${cls} value runs past its data end 0x${limit.toString(16).toUpperCase().padStart(6, "0")} (truncated?)`, o);
            const n = read(o);
            if (vlqClass(n) !== cls)
                break;
            v = (((v << 6) | (n & 0x3f)) & 0xffff);
            o += 1;
        }
        return { offset: off, size: o - off, kind: cls, op: b, args: [], value: v };
    }
    if (b < D.NOTE_LIMIT)
        return { offset: off, size: 1, kind: "note", op: b, args: [], value: b };
    if (D.isNop(b))
        return { offset: off, size: 1, kind: "nop", op: b, args: [], value: null };
    const nargs = D.OPCODES[b]![1];
    const args: number[] = [];
    for (let i = 0; i < nargs; i++)
        args.push(byte(off + 1 + i));
    return { offset: off, size: 1 + nargs, kind: "op", op: b, args, value: null };
}
export function s16of(lo: number, hi: number): number {
    const v = lo | (hi << 8);
    return v & 0x8000 ? v - 0x10000 : v;
}
export function decodeStream(read: Reader, start: number, limit: number): Cmd[] {
    const out: Cmd[] = [];
    let off = start;
    for (;;) {
        const c = decodeAt(read, off, limit);
        out.push(c);
        off += c.size;
        if (c.kind === "op" && c.op === 0x60)
            return out;
        if (c.kind === "op" && c.op === 0x6f && s16of(c.args[0]!, c.args[1]!) < 0)
            return out;
        if (out.length > 1 << 20)
            throw new ParseError("stream has no end command within 1M commands", start);
    }
}
export interface Event {
    frame: number;
    seq: number | null;
    type: string;
    data: Record<string, unknown>;
    offset: number;
    order: number;
}
export type LoopPoint = [
    number,
    number | null,
    number
];
export class Channel {
    ptr: number;
    delta: number | null = null;
    gate: number | null = null;
    instrument: number | null = null;
    attenuation = 0;
    mute = false;
    retrigger = false;
    rotate = false;
    frameClock = false;
    priority = 0;
    macro = 0;
    pitch: [
        number,
        number
    ] = [0, 0];
    pcmRate: number | null = null;
    slots: number[][] = Array.from({ length: D.LOOP_SLOTS }, () => [0, 0]);
    countdown = 1;
    done = false;
    ended: [
        number,
        number | null
    ] | null = null;
    events: Event[] = [];
    warnings: string[] = [];
    seen = new Map<string, LoopPoint>();
    loop: {
        start: LoopPoint;
        end: LoopPoint;
    } | null = null;
    stray = new Set<number>();
    readsStatus = false;
    constructor(readonly index: number, readonly start: number, readonly cmds: Map<number, Cmd>, readonly span: [
        number,
        number
    ]) {
        this.ptr = start;
    }
    state(status: Map<number, number>): string {
        let st: unknown = null;
        if (this.readsStatus)
            st = [...status.entries()].sort((a, b) => a[0] - b[0]);
        return JSON.stringify([this.ptr, this.slots, this.delta, this.gate, this.instrument, this.attenuation, this.mute, this.retrigger,
            this.rotate, this.frameClock, this.priority, this.macro, this.pitch, this.pcmRate, st]);
    }
}
const hex6 = (n: number): string => n.toString(16).toUpperCase().padStart(6, "0");
export class Track {
    readonly read: Reader;
    readonly trackId: number;
    readonly limit: number;
    readonly instType: (i: number) => number;
    rate: number;
    bpm: number;
    tempo: Array<[
        number,
        number | null,
        number,
        number,
        number,
        number
    ]> = [];
    status = new Map<number, number>();
    channels: Channel[] = [];
    frame = 0;
    seq = -1;
    acc = 0;
    constructor(read: Reader, trackId: number, chanOffsets: number[], limit: number, instType: (i: number) => number, initialBpm: number | null) {
        this.read = read;
        this.trackId = trackId;
        this.limit = limit;
        this.instType = instType;
        this.rate = initialBpm !== null ? D.tempoRate(initialBpm) : D.DEFAULT_RATE;
        this.bpm = initialBpm !== null ? initialBpm : 120;
        chanOffsets.forEach((start, k) => {
            const cmds = decodeStream(read, start, limit);
            const last = cmds[cmds.length - 1]!;
            const ch = new Channel(k, start, new Map(cmds.map((c) => [c.offset, c])), [start, last.offset + last.size]);
            ch.readsStatus = cmds.some((c) => c.kind === "op" && c.op === 0x71);
            this.channels.push(ch);
        });
    }
    private emit(ch: Channel, typ: string, offset: number, data: Record<string, unknown> = {}): void {
        ch.events.push({ frame: this.frame, seq: ch.frameClock ? null : this.seq, type: typ, data, offset, order: ch.events.length });
    }
    private wait(ch: Channel, offset: number): boolean {
        if (ch.delta === null) {
            ch.warnings.push(`0x${hex6(offset)} waits before any delta was set (stale driver state)`);
            return false;
        }
        if (ch.delta === 0)
            return false;
        ch.countdown = ch.delta;
        return true;
    }
    private fetch(ch: Channel): Cmd {
        let c = ch.cmds.get(ch.ptr);
        if (c === undefined) {
            c = decodeAt(this.read, ch.ptr, this.limit);
            for (let o = c.offset; o < c.offset + c.size; o++)
                ch.stray.add(o);
        }
        return c;
    }
    private step(ch: Channel, detect: boolean): boolean {
        if (detect) {
            const st = ch.state(this.status);
            const hit = ch.seen.get(st);
            if (hit !== undefined) {
                ch.loop = { start: hit, end: [this.frame, this.seq, ch.events.length] };
                ch.done = true;
                return true;
            }
            ch.seen.set(st, [this.frame, this.seq, ch.events.length]);
        }
        const c = this.fetch(ch);
        const off = c.offset;
        ch.ptr = off + c.size;
        if (c.kind === "delta") {
            ch.delta = c.value;
            return false;
        }
        if (c.kind === "gate") {
            ch.gate = c.value;
            return false;
        }
        if (c.kind === "nop") {
            this.emit(ch, "nop", off, { opcode: c.op });
            return false;
        }
        if (c.kind === "note") {
            let itype: number | null;
            if (ch.instrument === null) {
                ch.warnings.push(`0x${hex6(off)} note before any instrument (stale driver state)`);
                itype = null;
            }
            else {
                itype = this.instType(ch.instrument);
            }
            if (ch.gate === null)
                ch.warnings.push(`0x${hex6(off)} note before any gate (stale driver state)`);
            const data: Record<string, unknown> = {
                note: c.value, gate: ch.gate || 0, instrument: ch.instrument,
                instrument_type: (itype === null ? undefined : D.INSTRUMENT_TYPES[itype]) ?? "unknown",
            };
            if (itype === 1) {
                data.sample = (((c.value! - D.PCM_NOTE_BASE) % D.NOTE_LIMIT) + D.NOTE_LIMIT) % D.NOTE_LIMIT;
                data.rate_override = ch.pcmRate;
            }
            else {
                data.midi_note = D.midiNote(c.value!);
            }
            if (ch.mute)
                data.muted = true;
            this.emit(ch, "note_on", off, data);
            return this.wait(ch, off);
        }
        const op = c.op, a = c.args;
        if (op === 0x60) {
            this.emit(ch, "end", off);
            ch.done = true;
            ch.ended = [this.frame, this.seq];
            return true;
        }
        if (op === 0x61) {
            ch.instrument = a[0]!;
            ch.pcmRate = null;
            const t = this.instType(a[0]!);
            this.emit(ch, "instrument", off, { instrument: a[0], instrument_type: D.INSTRUMENT_TYPES[t] ?? "unknown" });
        }
        else if (op === 0x62) {
            ch.macro = a[0]!;
            this.emit(ch, "pitch_macro", off, { macro: a[0], started: !ch.retrigger });
        }
        else if (op === 0x63) {
        }
        else if (op === 0x64) {
            let placed = false;
            for (const s of ch.slots) {
                if (s[0] === 0) {
                    s[0] = a[0]!;
                    s[1] = ch.ptr & 0xffff;
                    placed = true;
                    break;
                }
            }
            if (!placed)
                throw new ParseError(`loop stack overflow (more than ${D.LOOP_SLOTS} open loops)`, off);
            if (a[0] === 0)
                throw new ParseError("loop start with count 0", off);
            this.emit(ch, "loop_start", off, { count: a[0] });
            return false;
        }
        else if (op === 0x65) {
            let s: number[] | null = null;
            for (let i = ch.slots.length - 1; i >= 0; i--) {
                if (ch.slots[i]![0] !== 0) {
                    s = ch.slots[i]!;
                    break;
                }
            }
            if (s === null)
                throw new ParseError("loop end without an open loop", off);
            if (s[0] !== D.INFINITE_LOOP) {
                s[0] = s[0]! - 1;
                if (s[0] === 0) {
                    this.emit(ch, "loop_end", off, { repeat: false });
                    return false;
                }
            }
            let target = (ch.ptr & BANK_MASK) | s[1]!;
            if (s[1]! >= (ch.ptr & 0xffff))
                target -= 0x10000;
            this.emit(ch, "loop_end", off, { repeat: true, infinite: s[0] === D.INFINITE_LOOP });
            ch.ptr = target;
            return false;
        }
        else if (op === 0x66) {
            ch.retrigger = a[0] !== 0;
            this.emit(ch, "retrigger_flag", off, { on: ch.retrigger });
        }
        else if (op === 0x67) {
            ch.rotate = a[0] !== 0;
            this.emit(ch, "voice_rotate_flag", off, { on: ch.rotate });
        }
        else if (op === 0x68) {
            const bpm = (a[0]! + D.TEMPO_OPCODE_BIAS) & 0xff;
            this.bpm = bpm;
            this.rate = D.tempoRate(bpm);
            this.tempo.push([this.frame, this.seq, bpm, this.rate, ch.index, off]);
            this.emit(ch, "tempo", off, { bpm, rate: this.rate });
        }
        else if (op === 0x69) {
            const tgt = a[0]! & 0x0f, mute = !(a[0]! & 0x10);
            for (const o of this.channels)
                if (o.index === tgt && o.ended === null)
                    o.mute = mute;
            this.emit(ch, "mute_channel", off, { channel: tgt, mute });
        }
        else if (op === 0x6a) {
            ch.priority = a[0]!;
            this.emit(ch, "priority", off, { value: a[0] });
        }
        else if (op === 0x6b) {
            this.emit(ch, "start_track", off, { track: a[0] });
        }
        else if (op === 0x6c) {
            ch.pitch = [a[0]!, a[1]!];
            this.emit(ch, "pitch_offset", off, { fine: a[0], coarse: a[1], semitones: new PyFloat(s16of(a[0]!, a[1]!) / 256.0) });
        }
        else if (op === 0x6d) {
            ch.frameClock = true;
            this.emit(ch, "frame_clock", off);
        }
        else if (op === 0x6e) {
            if (ch.instrument !== null && this.instType(ch.instrument) === 1)
                ch.pcmRate = a[0]!;
            this.emit(ch, "pcm_rate", off, { value: a[0] });
        }
        else if (op === 0x6f) {
            const disp = s16of(a[0]!, a[1]!);
            ch.ptr = (ch.ptr + disp) & ADDR24_MASK;
            this.emit(ch, "jump", off, { displacement: disp, target: "0x" + hex6(ch.ptr) });
            return false;
        }
        else if (op === 0x70) {
            this.status.set(a[0]!, a[1]!);
            this.emit(ch, "status_set", off, { index: a[0], value: a[1] });
        }
        else if (op === 0x71) {
            const [idx, test, v, skip] = a as [
                number,
                number,
                number,
                number
            ];
            const s = this.status.get(idx) ?? 0;
            let taken: boolean;
            switch (test) {
                case 1:
                    taken = v === s;
                    break;
                case 2:
                    taken = v >= s;
                    break;
                case 3:
                    taken = v > s;
                    break;
                case 4:
                    taken = v <= s;
                    break;
                case 5:
                    taken = v < s;
                    break;
                default: taken = v !== s;
            }
            if (taken)
                ch.ptr += skip;
            this.emit(ch, "status_branch", off, { index: idx, test: D.BRANCH_TESTS[test] ?? "v != s", value: v, skip, taken });
            return false;
        }
        else if (op === 0x72) {
            const [sub, arg] = a as [
                number,
                number
            ];
            const name = D.CONTROL_SUBS[sub] ?? "none";
            if (sub === 5) {
                ch.attenuation = arg;
                this.emit(ch, "volume", off, { attenuation: arg });
            }
            else if (sub === 4) {
                this.emit(ch, "global_volume", off, { attenuation: arg });
            }
            else {
                this.emit(ch, "control", off, { sub, name, arg });
            }
        }
        return this.wait(ch, off);
    }
    private runChannel(ch: Channel, detect: boolean): void {
        let guard = 0;
        while (!this.step(ch, detect)) {
            guard += 1;
            if (guard > 100000)
                throw new ParseError(`channel ${ch.index} runs 100000 commands in one tick without waiting`, ch.ptr);
        }
    }
    private pass(frameTick: boolean, tempoTick: boolean, detect: boolean): void {
        if (tempoTick)
            this.seq += 1;
        for (const ch of this.channels) {
            if (ch.done)
                continue;
            if (!(ch.frameClock ? frameTick : tempoTick))
                continue;
            ch.countdown -= 1;
            if (ch.countdown === 0)
                this.runChannel(ch, detect);
        }
    }
    run(untilSeq: number | null = null, maxFrames = 2000000, detect = false): void {
        this.acc = 256;
        for (;;) {
            let framePending = true, tempo = 0;
            while (this.acc >= 256) {
                this.acc -= 256;
                tempo += 1;
            }
            while (framePending || tempo) {
                if (untilSeq !== null && tempo && this.seq + 1 >= untilSeq)
                    return;
                this.pass(framePending, tempo > 0, detect);
                framePending = false;
                tempo = Math.max(0, tempo - 1);
            }
            if (this.channels.every((c) => c.done))
                return;
            this.frame += 1;
            if (this.frame > maxFrames) {
                const live = this.channels.filter((c) => !c.done).map((c) => c.index);
                throw new ParseError(`track ${this.trackId}: channels [${live.join(", ")}] neither end nor loop within ${maxFrames} frames`, this.channels[live[0]!]!.ptr);
            }
            this.acc += this.rate;
        }
    }
}
export function framesForTicks(tempoPoints: Array<[
    number,
    number
]>, nTicks: number, initialRate: number, phase = 0): number[] {
    const changes = new Map<number, number>();
    for (const [seq, rate] of tempoPoints)
        changes.set(seq, rate);
    const out: number[] = new Array(Math.max(nTicks, 0)).fill(0);
    if (nTicks <= 0)
        return out;
    let rate = changes.get(0) ?? initialRate;
    let acc = phase, frame = 0, k = 1;
    while (k < nTicks) {
        frame += 1;
        acc += rate;
        while (acc >= 256 && k < nTicks) {
            acc -= 256;
            out[k] = frame;
            const ch = changes.get(k);
            if (ch !== undefined)
                rate = ch;
            k += 1;
        }
        if (frame > 50000000)
            throw new RangeError("tempo rate 0 never advances");
    }
    return out;
}

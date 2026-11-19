export type Ev = Record<string, any>;
export const META_TEXT = 0x01;
export const META_TRACK_NAME = 0x03;
export const META_MARKER = 0x06;
export const META_END_OF_TRACK = 0x2f;
export const META_TEMPO = 0x51;
export const MAX_TEMPO = (1 << 24) - 1;
export const MAX_DELTA = (1 << 28) - 1;
export const MAX_TRACKS = 0xffff;
const CHANNEL_STATUS: Record<string, number> = { note_off: 0x80, note_on: 0x90, poly_pressure: 0xa0, control: 0xb0, program: 0xc0, channel_pressure: 0xd0, pitch_bend: 0xe0 };
const STATUS_TYPE: Record<number, string> = {};
for (const [k, v] of Object.entries(CHANNEL_STATUS))
    STATUS_TYPE[v] = k;
const DATA_BYTES: Record<number, number> = { 0x80: 2, 0x90: 2, 0xa0: 2, 0xb0: 2, 0xc0: 1, 0xd0: 1, 0xe0: 2 };
const FIELDS: Record<string, string[]> = {
    note_off: ["note", "velocity"], note_on: ["note", "velocity"], poly_pressure: ["note", "pressure"],
    control: ["controller", "value"], program: ["program"], channel_pressure: ["pressure"],
};
export class SmfError extends Error {
    constructor(msg: string, readonly offset?: number) {
        super(offset === undefined ? msg : `${msg} (at byte offset ${offset})`);
    }
}
export const evNoteOn = (tick: number, channel: number, note: number, velocity: number): Ev => ({ tick, type: "note_on", channel, note, velocity });
export const evNoteOff = (tick: number, channel: number, note: number, velocity = 0): Ev => ({ tick, type: "note_off", channel, note, velocity });
export const evControl = (tick: number, channel: number, controller: number, value: number): Ev => ({ tick, type: "control", channel, controller, value });
export const evProgram = (tick: number, channel: number, program: number): Ev => ({ tick, type: "program", channel, program });
export const evPitchBend = (tick: number, channel: number, value: number): Ev => ({ tick, type: "pitch_bend", channel, value });
export const evMeta = (tick: number, meta: number, data: Uint8Array = new Uint8Array(0)): Ev => ({ tick, type: "meta", meta, data: Uint8Array.from(data) });
export function evText(tick: number, meta: number, text: string): Ev {
    const b = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c > 255)
            throw new Error("latin-1 encode error");
        b[i] = c;
    }
    return evMeta(tick, meta, b);
}
export function evTempo(tick: number, usec: number): Ev {
    if (!(usec >= 1 && usec <= MAX_TEMPO))
        throw new Error(`tempo ${usec} microseconds per quarter note is outside 1..${MAX_TEMPO}`);
    return evMeta(tick, META_TEMPO, Uint8Array.of((usec >> 16) & 255, (usec >> 8) & 255, usec & 255));
}
export const evEnd = (tick: number): Ev => evMeta(tick, META_END_OF_TRACK);
export function vlq(n: number): number[] {
    if (!Number.isInteger(n) || n < 0 || n > MAX_DELTA)
        throw new Error(`variable-length value ${n} is outside 0..${MAX_DELTA}`);
    const out = [n & 0x7f];
    n = Math.floor(n / 128);
    while (n) {
        out.push(0x80 | (n & 0x7f));
        n = Math.floor(n / 128);
    }
    return out.reverse();
}
function byteOf(ev: Ev, key: string, hi = 127): number {
    const v = ev[key];
    if (!Number.isInteger(v) || v < 0 || v > hi)
        throw new Error(`${ev.type} event: ${key}=${v} must be an integer in 0..${hi}`);
    return v;
}
function encodeEvent(ev: Ev, running: number | null): [
    number[],
    number | null
] {
    const typ = ev.type as string;
    if (typ in CHANNEL_STATUS) {
        const status = CHANNEL_STATUS[typ]! | byteOf(ev, "channel", 15);
        let data: number[];
        if (typ === "pitch_bend") {
            const v = byteOf(ev, "value", 16383);
            data = [v & 0x7f, v >> 7];
        }
        else
            data = FIELDS[typ]!.map((f) => byteOf(ev, f));
        return [status === running ? data : [status, ...data], status];
    }
    if (typ === "meta") {
        const data: Uint8Array = ev.data ?? new Uint8Array(0);
        return [[0xff, byteOf(ev, "meta"), ...vlq(data.length), ...data], null];
    }
    if (typ === "sysex") {
        const status = ev.status ?? 0xf0;
        if (status !== 0xf0 && status !== 0xf7)
            throw new Error(`sysex status must be 0xF0 or 0xF7, got ${status}`);
        const data: Uint8Array = ev.data ?? new Uint8Array(0);
        return [[status, ...vlq(data.length), ...data], null];
    }
    throw new Error(`unknown event type ${typ}`);
}
function encodeTrack(events: Ev[], index: number, runningStatus: boolean): number[] {
    const out: number[] = [];
    let last = 0, running: number | null = null;
    events.forEach((ev, k) => {
        const tick = ev.tick;
        if (!Number.isInteger(tick) || tick < last)
            throw new Error(`track ${index}, event ${k}: tick ${tick} after tick ${last} (ticks must be integers that do not decrease)`);
        const isEnd = ev.type === "meta" && ev.meta === META_END_OF_TRACK;
        if (isEnd && k !== events.length - 1)
            throw new Error(`track ${index}: End of Track at event ${k} is not the last event`);
        let body: number[];
        [body, running] = encodeEvent(ev, runningStatus ? running : null);
        out.push(...vlq(tick - last), ...body);
        last = tick;
    });
    const le = events[events.length - 1];
    if (!events.length || !(le!.type === "meta" && le!.meta === META_END_OF_TRACK))
        out.push(0, 0xff, META_END_OF_TRACK, 0);
    return out;
}
function u32(n: number): number[] { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
function u16(n: number): number[] { return [(n >> 8) & 255, n & 255]; }
export function writeSmf(tracksIn: Ev[][], ppq = 24, fmt = 1, runningStatus = true): Uint8Array {
    const tracks = [...tracksIn];
    if (!Number.isInteger(ppq) || ppq < 1 || ppq > 0x7fff)
        throw new Error(`ppq must be an integer in 1..32767, got ${ppq}`);
    if (![0, 1, 2].includes(fmt))
        throw new Error(`SMF format must be 0, 1 or 2, got ${fmt}`);
    if (tracks.length < 1 || tracks.length > MAX_TRACKS || (fmt === 0 && tracks.length !== 1))
        throw new Error(`a format ${fmt} file cannot hold ${tracks.length} track(s)`);
    const out: number[] = [0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(fmt), ...u16(tracks.length), ...u16(ppq)];
    tracks.forEach((events, n) => {
        const body = encodeTrack(events, n, runningStatus);
        out.push(0x4d, 0x54, 0x72, 0x6b, ...u32(body.length));
        for (let i = 0; i < body.length; i++)
            out.push(body[i]!);
    });
    return Uint8Array.from(out);
}
function readVlq(data: Uint8Array, pos: number, end: number, what: string): [
    number,
    number
] {
    let value = 0;
    for (let i = 0; i < 4; i++) {
        if (pos >= end)
            throw new SmfError(`truncated ${what}: the variable-length value runs past the end of the chunk`, pos);
        const b = data[pos]!;
        pos++;
        value = value * 128 + (b & 0x7f);
        if (!(b & 0x80))
            return [value, pos];
    }
    throw new SmfError(`${what}: variable-length value longer than four bytes`, pos);
}
const hex2 = (b: number): string => b.toString(16).toUpperCase().padStart(2, "0");
function decodeTrack(data: Uint8Array, start: number, end: number, index: number): Ev[] {
    const events: Ev[] = [];
    let pos = start, tick = 0, running: number | null = null;
    while (pos < end) {
        let delta: number;
        [delta, pos] = readVlq(data, pos, end, `track ${index} delta time`);
        tick += delta;
        if (pos >= end)
            throw new SmfError(`track ${index}: delta time at the end of the chunk with no event after it`, pos);
        const first = data[pos]!;
        let status: number;
        if (first & 0x80) {
            status = first;
            pos++;
        }
        else if (running === null)
            throw new SmfError(`track ${index}: data byte 0x${hex2(first)} where a status byte is required (no running status)`, pos);
        else
            status = running;
        if (status < 0xf0) {
            const n = DATA_BYTES[status & 0xf0]!;
            if (pos + n > end)
                throw new SmfError(`track ${index}: channel message cut off by the end of its chunk`, pos);
            const vals = Array.from(data.subarray(pos, pos + n));
            vals.forEach((b, off) => { if (b & 0x80)
                throw new SmfError(`track ${index}: data byte 0x${hex2(b)} has its high bit set`, pos + off); });
            const kind = STATUS_TYPE[status & 0xf0]!;
            const ev: Ev = { tick, type: kind, channel: status & 0x0f };
            if (kind === "pitch_bend")
                ev.value = vals[0]! | (vals[1]! << 7);
            else
                FIELDS[kind]!.forEach((f, i) => { ev[f] = vals[i]; });
            events.push(ev);
            pos += n;
            running = status;
        }
        else if (status === 0xff) {
            if (pos >= end)
                throw new SmfError(`track ${index}: meta event with no type byte`, pos);
            const meta = data[pos]!;
            const [length, p2] = readVlq(data, pos + 1, end, `track ${index} meta length`);
            if (p2 + length > end)
                throw new SmfError(`track ${index}: meta event 0x${hex2(meta)} claims ${length} bytes, ${end - p2} remain in the chunk`, pos);
            if (meta & 0x80)
                throw new SmfError(`track ${index}: meta type 0x${hex2(meta)} has its high bit set`, pos);
            events.push({ tick, type: "meta", meta, data: Uint8Array.from(data.subarray(p2, p2 + length)) });
            pos = p2 + length;
            running = null;
            if (meta === META_END_OF_TRACK) {
                if (length)
                    throw new SmfError(`track ${index}: End of Track with ${length} data bytes`, pos);
                if (pos !== end)
                    throw new SmfError(`track ${index}: ${end - pos} byte(s) after the End of Track event`, pos);
                return events;
            }
        }
        else if (status === 0xf0 || status === 0xf7) {
            const [length, p2] = readVlq(data, pos, end, `track ${index} sysex length`);
            if (p2 + length > end)
                throw new SmfError(`track ${index}: system-exclusive event claims ${length} bytes, ${end - p2} remain in the chunk`, pos);
            events.push({ tick, type: "sysex", status, data: Uint8Array.from(data.subarray(p2, p2 + length)) });
            pos = p2 + length;
            running = null;
        }
        else
            throw new SmfError(`track ${index}: status byte 0x${hex2(status)} is not valid in a file`, pos - 1);
    }
    throw new SmfError(`track ${index} has no End of Track event (the file is truncated or damaged)`, end);
}
export interface Smf {
    format: number;
    ntrks: number;
    division: number;
    ppq: number;
    tracks: Ev[][];
    bytes: number;
}
export function readSmf(data: Uint8Array): Smf {
    const n = data.length;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (n < 14)
        throw new SmfError(`not a MIDI file: ${n} byte(s), the header chunk alone is 14`, 0);
    if (String.fromCharCode(data[0]!, data[1]!, data[2]!, data[3]!) !== "MThd")
        throw new SmfError("not a MIDI file: no MThd header chunk", 0);
    const length = dv.getUint32(4);
    if (length < 6)
        throw new SmfError(`header chunk is ${length} bytes, at least 6 are required`, 4);
    if (8 + length > n)
        throw new SmfError(`truncated header chunk: ${length} bytes claimed, ${n - 8} present`, 4);
    const fmt = dv.getUint16(8), ntrks = dv.getUint16(10), division = dv.getUint16(12);
    if (fmt > 2)
        throw new SmfError(`unknown SMF format ${fmt}`, 8);
    if (division & 0x8000)
        throw new SmfError("SMPTE time division is not supported", 12);
    if (division === 0)
        throw new SmfError("time division is 0", 12);
    if (fmt === 0 && ntrks !== 1)
        throw new SmfError(`a format 0 file must hold exactly one track, the header says ${ntrks}`, 10);
    let pos = 8 + length;
    const tracks: Ev[][] = [];
    while (pos < n) {
        if (n - pos < 8)
            throw new SmfError(`${n - pos} stray byte(s) after the last chunk (truncated chunk header)`, pos);
        const ctype = String.fromCharCode(data[pos]!, data[pos + 1]!, data[pos + 2]!, data[pos + 3]!);
        const clen = dv.getUint32(pos + 4);
        if (pos + 8 + clen > n)
            throw new SmfError(`truncated ${ctype} chunk: ${clen} bytes claimed, ${n - pos - 8} present`, pos);
        if (ctype === "MTrk")
            tracks.push(decodeTrack(data, pos + 8, pos + 8 + clen, tracks.length));
        pos += 8 + clen;
    }
    if (tracks.length !== ntrks)
        throw new SmfError(`the header promises ${ntrks} track(s) but the file holds ${tracks.length} (truncated?)`, n);
    return { format: fmt, ntrks, division, ppq: division, tracks, bytes: n };
}
export function noteScheduleCount(events: Ev[]): number {
    const open = new Map<string, number>();
    let count = 0;
    for (const ev of events) {
        const key = `${ev.channel}/${ev.note}`;
        if (ev.type === "note_on" && ev.velocity > 0)
            open.set(key, (open.get(key) ?? 0) + 1);
        else if (ev.type === "note_on" || ev.type === "note_off") {
            const q = open.get(key) ?? 0;
            if (!q)
                throw new SmfError(`note-off for channel ${ev.channel} note ${ev.note} at tick ${ev.tick} with no note sounding`);
            open.set(key, q - 1);
            count++;
        }
    }
    let hanging = 0;
    for (const q of open.values())
        hanging += q;
    if (hanging)
        throw new SmfError(`${hanging} note(s) never released`);
    return count;
}
export function eventsEqual(a: Ev[][], b: Ev[][]): boolean {
    const norm = (v: unknown): string => {
        if (v instanceof Uint8Array)
            return "b" + Array.from(v).join(",");
        if (v && typeof v === "object")
            return "{" + Object.keys(v).sort().map((k) => k + ":" + norm((v as any)[k])).join(";") + "}";
        return String(v);
    };
    return a.length === b.length && a.every((t, i) => t.length === b[i]!.length && t.every((e, j) => norm(e) === norm(b[i]![j])));
}

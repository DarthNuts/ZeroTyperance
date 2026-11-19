import type { Command, Context, RomFile } from "../core.js";
import * as D from "../music/driver.js";
import * as IR from "../music/ir.js";
import { ParseError } from "../music/parser.js";
const INDEX_FORMAT = "ztassets-music-index/1";
const OUT = "music";
type Dict = Record<string, unknown>;
export function soundTable(rom: RomFile): IR.SoundEntry[] {
    const entries: IR.SoundEntry[] = [];
    for (let i = 0; i < D.SOUND_TABLE_ENTRIES; i++) {
        const b = rom.bytesAt(D.SOUND_TABLE + 3 * i, 3);
        if (b[0]! > 3)
            throw new ParseError(`sound table entry ${i} has mode ${b[0]}`, D.SOUND_TABLE + 3 * i);
        entries.push({ id: i, mode: b[0]!, cmd: b[1]!, var: b[2]! });
    }
    const end = D.SOUND_TABLE + 3 * D.SOUND_TABLE_ENTRIES;
    if (rom.u8(end) <= 3)
        throw new ParseError(`sound table does not end after ${D.SOUND_TABLE_ENTRIES} entries`, end);
    return entries;
}
const hex = (v: number, w: number): string => v.toString(16).toUpperCase().padStart(w, "0");
export const music: Command = {
    name: "music",
    run(ctx: Context, options: Record<string, unknown>): void {
        const rom = ctx.rom;
        const noSfx = Boolean(options.no_sfx);
        const signatures = D.verify(rom);
        const patchTable = D.fmPatchTable(rom);
        const carriers = D.fmCarrierTable(rom);
        const fnums = D.fmFnumTable(rom), periods = D.psgPeriodTable(rom);
        const records = IR.instrumentRecords(rom);
        const instDocs = new Map<number, Dict>();
        const instTypes = new Map<number, number>();
        for (const [i, off, rec] of records) {
            instDocs.set(i, IR.decodeInstrument(i, off, rec, patchTable, carriers));
            instTypes.set(i, rec[0]!);
        }
        const macroDocs = IR.macros(rom);
        const pcmDocs = IR.pcmHeaders(rom);
        const trackList = IR.tracks(rom);
        const table = soundTable(rom);
        let want: Set<number> | null = null;
        if (options.tracks) {
            want = new Set(String(options.tracks).split(",").filter((x) => x.trim()).map((x) => Number(x.trim())));
            const have = new Set(trackList.map((t) => t[0]));
            const bad = [...want].filter((t) => !have.has(t)).sort((a, b) => a - b);
            if (bad.length)
                throw new Error(`no such track(s): [${bad.join(", ")}]`);
        }
        const byTrack = new Map<number, IR.SoundEntry[]>();
        for (const e of table) {
            if (e.mode === 0) {
                let l = byTrack.get(e.cmd);
                if (!l)
                    byTrack.set(e.cmd, (l = []));
                l.push(e);
            }
        }
        const trackRows: Dict[] = [];
        const spans: Array<[
            [
                number,
                number
            ],
            [
                number,
                number
            ]
        ]> = [];
        for (const [tid, header, chans] of trackList) {
            const ids = byTrack.get(tid) ?? [];
            const bpms = [...new Set(ids.map((e) => e.var))].sort((a, b) => a - b);
            let bpm: number | null, src: string;
            if (ids.length) {
                bpm = ids[0]!.var;
                src = "sound_table";
            }
            else {
                bpm = null;
                src = "driver_default";
            }
            const doc = IR.buildTrack(rom, tid, header, chans, instTypes, bpm, src, ids.map((e) => e.id), instDocs, macroDocs);
            const dchans = doc.channels as Dict[];
            for (const c of dchans) {
                const a = parseInt(c.rom_offset as string, 16);
                spans.push([[tid, c.index as number], [a, a + (c.bytes as number)]]);
            }
            const rel = `${OUT}/${String(tid).padStart(2, "0")}.ir.json`;
            const written = want === null || want.has(tid);
            if (written)
                ctx.writeJson(rel, doc, { track: tid });
            const tempoChanges = doc.tempo_changes as Dict[];
            const notes = dchans.reduce((n, c) => n + (c.notes as number), 0);
            trackRows.push({
                id: tid, file: written ? rel : null,
                header: doc.header, sound_ids: doc.sound_ids, sound_table_bpms: bpms,
                initial_bpm: tempoChanges[0]!.bpm,
                initial_bpm_source: src,
                tempo_changes: tempoChanges.length - 1,
                loop: doc.loop, duration: doc.duration,
                notes,
                channel_kinds: dchans.map((c) => c.kind),
                bytes: doc.bytes, unknown_bytes: doc.unknown_bytes,
                warnings: (doc.warnings as string[]).length,
            });
            const lp = doc.loop as Dict | null;
            ctx.say(`music: track ${tid}: ${chans.length} channels, ${notes} notes, ` +
                (lp ? `loop ${lp.start_tick}..${lp.end_tick} frames` : `ends at frame ${(doc.duration as Dict).frames}`));
        }
        const sfxRows: Dict[] = [];
        for (const e of table) {
            if (e.mode === 0)
                continue;
            const rel = `${OUT}/sfx/${hex(e.id, 2).toLowerCase()}.ir.json`;
            const doc = IR.buildSfx(e, records, instDocs, pcmDocs);
            if (!noSfx)
                ctx.writeJson(rel, doc, { sound_id: e.id });
            const ch = (doc.channels as Dict[])[0]!;
            const on = (ch.events as Dict[]).find((x) => x.type === "note_on")!;
            sfxRows.push({
                id: e.id, mode: e.mode, cmd: e.cmd, var: e.var,
                file: noSfx ? null : rel, kind: ch.kind,
                channel: ch.index, instrument: on.instrument,
                note: on.note, sample: "sample" in on ? on.sample : null,
            });
        }
        if (!noSfx)
            ctx.say(`music: ${sfxRows.length} sound effects / voices`);
        const tiling = IR.bankTiling(rom, trackList, spans);
        const opcodes: Dict = {}, ring: Dict = {};
        for (const k of Object.keys(D.OPCODES).map(Number)) {
            const v = D.OPCODES[k]!;
            opcodes[hex(k, 2)] = { name: v[0], operands: v[1], waits: v[2], z80: "0x" + hex(v[3], 4) };
        }
        for (const k of Object.keys(D.RING_OPCODES).map(Number)) {
            const v = D.RING_OPCODES[k]!;
            ring[hex(k, 2)] = { name: v[0], operands: v[1], z80: "0x" + hex(v[2], 4) };
        }
        const index: Dict = {
            format: INDEX_FORMAT,
            driver: {
                rom_offset: IR.hx(D.DRIVER_ROM), bytes: D.DRIVER_SIZE,
                signatures,
                fm_fnum_table: fnums, psg_period_table: periods,
                fm_carrier_masks: carriers,
                fm_patch_writes: patchTable.map(([r, i, c]) => [r, i, c]),
            },
            banks: {
                instruments: { rom_offset: IR.hx(D.BANK_INSTRUMENTS), count: records.length, end: IR.hx(D.INSTRUMENT_BANK_END) },
                macros: { rom_offset: IR.hx(D.BANK_MACROS), count: macroDocs.length },
                tracks: { rom_offset: IR.hx(D.BANK_TRACKS), count: trackList.length, end: IR.hx(D.MUSIC_DATA_END) },
                pcm_headers: { rom_offset: IR.hx(D.BANK_PCM), count: pcmDocs.length },
            },
            track_bank_tiling: tiling,
            tracks: trackRows,
            sounds: sfxRows,
            music_sound_ids: table.filter((e) => e.mode === 0).map((e) => ({ id: e.id, track: e.cmd, bpm: e.var })),
            opcodes,
            ring_opcodes: ring,
        };
        if (!tiling.tiled) {
            throw new ParseError(`the track bank is not tiled by its streams: gaps ${JSON.stringify(tiling.gaps)} overlaps ${JSON.stringify(tiling.overlaps)}`, D.BANK_TRACKS);
        }
        ctx.writeJson(OUT + "/index.json", index);
        ctx.writeJson(OUT + "/instruments.json", {
            format: "ztassets-music-instruments/1",
            instruments: [...instDocs.keys()].sort((a, b) => a - b).map((i) => instDocs.get(i)),
        });
        ctx.writeJson(OUT + "/pcm_headers.json", { format: "ztassets-music-pcm-headers/1", headers: pcmDocs });
        ctx.writeJson(OUT + "/macros.json", { format: "ztassets-music-macros/1", macros: macroDocs });
    },
};

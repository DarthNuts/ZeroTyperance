import { PyFloat, type Command, type Context } from "../core.js";
import * as D from "../music/driver.js";
import * as B from "../patches/bank.js";
import * as F from "../patches/formats.js";
import { instrumentUsage, type Usage } from "../patches/usage.js";
import { PATCHES_RENDERER_COMPILE, PATCHES_RENDERER_SOURCE } from "../reference_notes.js";
type Dict = Record<string, any>;
const INDEX_FORMAT = "ztassets-patches-index/1";
const OUT = "patches";
const WAV_RATE = 53267;
const NATIVE_RATE = 53693175 / 7.0 / 144.0;
const GRID_STEP = 3;
const MAX_RELEASE_S = 4.0;
const RECORD_LAYOUT = [
    { bytes: "0", use: "type: 0 FM, 1 PCM, 2 PSG tone, 3 PSG noise (dispatch Z80 0x1208)" },
    { bytes: "1", use: "FM: LFO byte, reg 22 only when bit 3 is set; PSG: noise control; PCM: rate code" },
    { bytes: "2", use: "FM: mode, reg 27 = byte | 0x05 on FM channel 3 (bit 6 = CH3 special); PSG: attack step" },
    { bytes: "3", use: "FM: reg B0 (FB bits 3-5, ALG bits 0-2); PSG: sustain level (low nibble)" },
    { bytes: "4", use: "FM: reg B4 (L bit 7, R bit 6, AMS bits 4-5, FMS bits 0-2); PSG: peak level (low nibble)" },
    { bytes: "5-10", use: "FM operator S1 (register offset +0): regs 30 40 50 60 70 80; PSG 5/6: decay/release step" },
    { bytes: "11-16", use: "FM operator S3 (register offset +4): regs 34 44 54 64 74 84" },
    { bytes: "17-22", use: "FM operator S2 (register offset +8): regs 38 48 58 68 78 88" },
    { bytes: "23-28", use: "FM operator S4 (register offset +C): regs 3C 4C 5C 6C 7C 8C" },
    { bytes: "29-36", use: "FM CH3 special-mode frequencies for A6/A2 AC/A8 AD/A9 AE/AA (only with mode bit 6)" },
    { bytes: "37", use: "FM key-on operator mask (low nibble -> reg 28 bits 4-7)" },
    { bytes: "38", use: "never read" },
];
const CONVENTIONS = {
    operator_order: "operators[] and TFI/DMP files are in register order: offset +0, +4, +8, +C " +
        "= datasheet S1, S3, S2, S4 (DefleMask labels them OP1..OP4); 'slot' is the " +
        "datasheet number; OPM lines M1 C1 M2 C2 are S1 S2 S3 S4",
    detune: "DT is the register value 0..7 (bit 2 = minus); TFI/DMP store 3 + signed detune",
    ssg_eg: "the record has no SSG-EG byte: the driver writes 0 to 90-9F at every key-on",
    key_on_mask: "bit n-1 = operator Sn; operators outside the mask are never keyed and stay silent",
    attenuation: "carrier TL' = TL + (((7F - TL) * 2 * a) >> 8), a = global + channel attenuation; " +
        "registers[] are for a = 0",
    when_written: "the whole patch is rewritten at every FM key-on (Z80 0x1431); opcode 61 only " +
        "copies the record into the channel",
};
const usageDoc = (u: Usage): Dict => ({
    midi_notes: u.midi_notes, driver_notes: u.driver_notes, tracks: u.tracks, sound_ids: u.sound_ids,
    notes: u.notes, ungated_notes: u.ungated, longest_note_frames: u.longest_frames,
});
export const patches: Command = {
    name: "patches",
    run(ctx: Context, options: Record<string, unknown>): void {
        const rom = ctx.rom;
        const evidence = B.verify(rom);
        const bank = B.decodeBank(rom);
        const { docs, table } = bank;
        const use = instrumentUsage(rom, bank.records, D.fmPatchTable(rom), bank.carriers);
        const fnums = D.fmFnumTable(rom);
        const sfzNote = options.no_sfz ? "skipped: --no-sfz" : "skipped: C compiler 'gcc' not found";
        const rows: Dict[] = [];
        const opm: Array<[
            number,
            string,
            Dict,
            number[]
        ]> = [];
        const ids = [...docs.keys()].sort((a, b) => a - b);
        const nn = (i: number): string => String(i).padStart(2, "0");
        for (const i of ids) {
            const doc = docs.get(i)!;
            const u = use.get(i)!;
            doc.usage = usageDoc(u);
            const files: Dict = { json: `${OUT}/${nn(i)}.json` };
            const row: Dict = {
                index: i, type: doc.type, rom_offset: doc.rom_offset, file: files.json, used: u.notes > 0,
                midi_notes: u.midi_notes, tracks: u.tracks, sound_ids: u.sound_ids,
            };
            if (doc.type === "fm") {
                files.tfi = `${OUT}/${nn(i)}.tfi`;
                files.dmp = `${OUT}/${nn(i)}.dmp`;
                files.opm = OUT + "/bank.opm";
                files.sfz = null;
                const p = doc.params;
                ctx.writeBytes(files.tfi, F.tfiBytes(p), { index: i });
                ctx.writeBytes(files.dmp, F.dmpBytes(p), { index: i });
                opm.push([i, `zt_inst_${nn(i)}`, p, doc.key_on_slots]);
                doc.lossy = F.lossyFields(p, doc.key_on_mask);
                Object.assign(row, { tfi: files.tfi, dmp: files.dmp, sfz: files.sfz, lossy: doc.lossy, key_on_mask: doc.key_on_mask });
            }
            doc.files = files;
            ctx.writeJson(files.json, doc, { index: i });
            rows.push(row);
        }
        ctx.writeBytes(OUT + "/bank.opm", new TextEncoder().encode(F.opmBankText(opm)), { patches: opm.length });
        ctx.say(`patches: SFZ ${sfzNote}`);
        const types: Record<string, number> = {};
        for (const d of docs.values())
            types[d.type] = (types[d.type] ?? 0) + 1;
        const carrierBitOf: Record<string, number> = {};
        for (const k of Object.keys(bank.carrier_bits).map(Number).sort((a, b) => a - b))
            carrierBitOf[String(k)] = bank.carrier_bits[k]!;
        const index = {
            format: INDEX_FORMAT,
            bank: { rom_offset: B.hx(D.BANK_INSTRUMENTS), end: B.hx(D.INSTRUMENT_BANK_END), records: docs.size, record_bytes: B.RECORD_BYTES, types },
            driver: {
                rom_offset: B.hx(D.DRIVER_ROM), bytes: D.DRIVER_SIZE, signatures: evidence,
                patch_write_table: table.map(([r, b, t]) => [r, b, t]),
                carrier_masks: bank.carriers,
                carrier_bit_of_register_offset: carrierBitOf,
                fm_fnum_table: fnums,
            },
            record_layout: RECORD_LAYOUT,
            conventions: CONVENTIONS,
            patches: rows,
            opm: OUT + "/bank.opm",
            sfz: {
                status: sfzNote,
                renderer: {
                    ...(PATCHES_RENDERER_SOURCE !== null ? { source: PATCHES_RENDERER_SOURCE } : {}),
                    core: "Nuked-OPN2 (ym3438.c/.h), YM2612 mode",
                    ...(PATCHES_RENDERER_COMPILE !== null ? { compile: PATCHES_RENDERER_COMPILE } : {}),
                    build_key: null,
                    sample_rate: WAV_RATE, native_rate: new PyFloat(Math.round(NATIVE_RATE * 1000) / 1000),
                    format: "RIFF WAV, PCM 16-bit mono",
                    level: "sum of the 24 core cycles of a native sample minus the silent level, x 40",
                    max_release_s: new PyFloat(MAX_RELEASE_S),
                },
                grid_step: GRID_STEP,
                instruments: [] as Dict[],
            },
        };
        ctx.writeJson(OUT + "/index.json", index, { sfz: sfzNote });
        ctx.say(`patches: ${docs.size} records (${Object.keys(types).sort().map((k) => `${types[k]} ${k}`).join(", ")}), TFI/DMP/OPM for ${opm.length} FM patches`);
    },
};

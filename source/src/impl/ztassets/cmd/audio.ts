import { PyFloat, type Command, type Context, type RomFile } from "../core.js";
import { sha256Hex } from "../../boot/sha256.js";
import { MemDir, runWasi } from "../wasi.js";
import { AUDIO_RENDERER_SOURCE } from "../reference_notes.js";
const FORMAT = "ztassets-audio/1";
const OUT_DIR = "audio";
const DEFAULT_IDS = "00-A1";
const KINDS: Record<number, string> = { 0: "music", 1: "sfx", 2: "voice", 3: "voice" };
const HEX_KEYS = new Set(["number", "cmd", "var"]);
const DEFAULT_SOURCE_SHA256 = "10d0bbdd6f9dcc133732f0b47d92c6512f82d939baff0ceef0ab7b34925c6f33";
const SOUND_TABLE = 0x0c5eb4, SOUND_TABLE_ROW = 3, SOUND_TABLE_LEA_SITE = 0x0c616c, LEA_PC_OPCODE = 0x41fa;
const Z80_RAM_BYTES = 0x2000;
const POINTER_COUNT = 4;
const UPLOAD_SITE = 0x0c5c44, UPLOAD_SRC_OPCODE = 0x41f9, UPLOAD_END_OPCODE = 0x43f9, UPLOAD_DEST_SITE = 0x0c5c56;
const UPLOAD_DEST_WORDS = [0x43f9, 0x00a0, 0x0000];
const HANDSHAKE_SITE = 0x0c5b38, PUSH_IMM_OPCODE = 0x2f3c, CALL_OPCODE = 0x6100;
export class AudioError extends Error {
}
const hex = (n: number, w = 1): string => n.toString(16).toUpperCase().padStart(w, "0");
function locateDriver(rom: RomFile): [
    number,
    number
] {
    if (rom.u16be(UPLOAD_SITE) !== UPLOAD_SRC_OPCODE || rom.u16be(UPLOAD_SITE + 6) !== UPLOAD_END_OPCODE)
        throw new AudioError(`driver upload routine at 0x${hex(UPLOAD_SITE, 6)}: expected two absolute address loads`);
    for (let i = 0; i < 3; i++)
        if (rom.u16be(UPLOAD_DEST_SITE + 2 * i) !== UPLOAD_DEST_WORDS[i])
            throw new AudioError(`driver upload routine at 0x${hex(UPLOAD_DEST_SITE, 6)}: the copy does not target Z80 RAM`);
    const start = rom.u32be(UPLOAD_SITE + 2), end = rom.u32be(UPLOAD_SITE + 8);
    if (!(0 < start && start < end && end <= rom.size) || end - start > Z80_RAM_BYTES)
        throw new AudioError(`driver upload range 0x${hex(start, 6)}..0x${hex(end, 6)} is not a blob that fits Z80 RAM`);
    return [start, end];
}
function bankPointers(rom: RomFile): number[] {
    const pushed: number[] = [];
    for (let k = 0; k < POINTER_COUNT; k++) {
        const site = HANDSHAKE_SITE + 6 * k;
        if (rom.u16be(site) !== PUSH_IMM_OPCODE)
            throw new AudioError(`bank-pointer handshake at 0x${hex(site, 6)}: expected a 32-bit immediate push`);
        pushed.push(rom.u32be(site + 2));
    }
    if (rom.u16be(HANDSHAKE_SITE + 6 * POINTER_COUNT) !== CALL_OPCODE)
        throw new AudioError("bank-pointer handshake: the four pushes are not followed by the call");
    const ptrs = pushed.reverse();
    for (const p of ptrs)
        if (p >= Math.min(rom.size, 1 << 24))
            throw new AudioError(`bank pointer 0x${hex(p)} is outside the ROM`);
    return ptrs;
}
function soundRows(rom: RomFile): Array<[
    number,
    number,
    number
]> {
    if (rom.u16be(SOUND_TABLE_LEA_SITE) !== LEA_PC_OPCODE)
        throw new AudioError(`sound dispatcher at 0x${hex(SOUND_TABLE_LEA_SITE, 6)}: expected the table load`);
    const disp = rom.u16be(SOUND_TABLE_LEA_SITE + 2);
    const target = SOUND_TABLE_LEA_SITE + 2 + (disp & 0x8000 ? disp - 0x10000 : disp);
    if (target !== SOUND_TABLE)
        throw new AudioError(`sound dispatcher loads its table from 0x${hex(target, 6)}, not 0x${hex(SOUND_TABLE, 6)}`);
    const rows: Array<[
        number,
        number,
        number
    ]> = [];
    for (let sid = 0; sid < 256; sid++) {
        const b = rom.bytesAt(SOUND_TABLE + SOUND_TABLE_ROW * sid, SOUND_TABLE_ROW);
        if (b[0]! > 3)
            break;
        rows.push([b[0]!, b[1]!, b[2]!]);
    }
    return rows;
}
function parseIds(text: string, nrows: number): number[] {
    const ids = new Set<number>();
    for (let part of text.split(",")) {
        part = part.trim();
        if (!part)
            continue;
        const dash = part.indexOf("-");
        const lo = dash < 0 ? part : part.slice(0, dash), hi = dash < 0 ? "" : part.slice(dash + 1);
        if (!/^[0-9a-fA-F]+$/.test(lo) || (dash >= 0 && !/^[0-9a-fA-F]+$/.test(hi)))
            throw new AudioError(`bad ids item '${part}' (hex numbers or ranges, e.g. 00-A1)`);
        const a = parseInt(lo, 16), b = dash >= 0 ? parseInt(hi, 16) : a;
        if (a > b || b >= nrows)
            throw new AudioError(`ids item '${part}' is outside the sound table (00..${hex(nrows - 1, 2)})`);
        for (let i = a; i <= b; i++)
            ids.add(i);
    }
    if (!ids.size)
        throw new AudioError("ids selects nothing");
    return [...ids].sort((x, y) => x - y);
}
function pyFloatArg(x: number): string {
    return Number.isInteger(x) ? x.toFixed(1) : String(x);
}
export interface AudioJob {
    readonly start: number;
    readonly end: number;
    readonly ptrs: readonly number[];
    readonly musicSeconds: number;
    readonly rows: ReadonlyArray<readonly [
        number,
        number,
        number
    ]>;
}
export interface SoundResult {
    stat: Record<string, number>;
    wav: Uint8Array;
}
export type RenderAll = (a: {
    wasm: Uint8Array;
    rom: Uint8Array;
    job: AudioJob;
    numbers: readonly number[];
    onDone: () => void;
}) => Promise<Map<number, SoundResult>>;
export async function renderSound(module: WebAssembly.Module, romData: Uint8Array, job: AudioJob, n: number): Promise<SoundResult> {
    const row = job.rows[n]!;
    const name = hex(n, 2);
    const dir = new MemDir();
    dir.put("rom.gen", romData);
    const args = ["render_audio", "--music-seconds", pyFloatArg(job.musicSeconds), "--driver", `${hex(job.start)}:${hex(job.end)}`,
        "--ptrs", job.ptrs.map((p) => hex(p)).join(","), "--table", hex(SOUND_TABLE), "/w/rom.gen", name, `/w/${name}.wav`];
    const r = await runWasi(module, args, dir);
    if (r.exitCode !== 0)
        throw new AudioError(`render_audio ${name}: ${(r.stderr || "exit " + r.exitCode).trim()}`);
    const stat: Record<string, number> = {};
    for (const tok of r.stdout.split(/\s+/)) {
        const eq = tok.indexOf("=");
        if (eq < 0)
            continue;
        const k = tok.slice(0, eq), v = tok.slice(eq + 1);
        if (k === "seconds")
            continue;
        const val = parseInt(v, HEX_KEYS.has(k) ? 16 : 10);
        if (Number.isNaN(val))
            throw new AudioError(`render_audio ${name} printed '${r.stdout}'`);
        stat[k] = val;
    }
    for (const k of ["mode", "cmd", "var", "samples", "active", "capped"])
        if (!(k in stat))
            throw new AudioError(`render_audio ${name} printed no ${k}: '${r.stdout}'`);
    if (stat["mode"] !== row[0] || stat["cmd"] !== row[1] || stat["var"] !== row[2])
        throw new AudioError(`render_audio ${name} read a different table row than the ROM says: '${r.stdout}'`);
    const wav = dir.get(`${name}.wav`);
    if (!wav)
        throw new AudioError(`render_audio ${name} wrote no WAV`);
    return { stat, wav: wav.slice() };
}
export const audio: Command = {
    name: "audio",
    async run(ctx: Context, options: Record<string, unknown>): Promise<void> {
        const musicSeconds = (options["musicSeconds"] as number | undefined) ?? 150;
        const idsText = (options["ids"] as string | undefined) ?? DEFAULT_IDS;
        const srcSha = (options["rendererSourceSha256"] as string | undefined) ?? DEFAULT_SOURCE_SHA256;
        if (!(musicSeconds >= 1 && musicSeconds <= 1000))
            throw new AudioError("musicSeconds must be 1..1000");
        let wasm = options["wasmBytes"] as Uint8Array | undefined;
        if (!wasm && typeof options["loadWasm"] === "function")
            wasm = await (options["loadWasm"] as () => Promise<Uint8Array>)();
        if (!wasm)
            throw new AudioError("audio: options.wasmBytes or options.loadWasm (the render_audio-wasm32.wasm bytes) is required");
        const t0 = Date.now();
        const rom = ctx.rom;
        const [start, end] = locateDriver(rom);
        const ptrs = bankPointers(rom);
        const rows = soundRows(rom);
        const numbers = parseIds(idsText, rows.length);
        const module = await WebAssembly.compile(wasm as BufferSource);
        const job: AudioJob = { start, end, ptrs, musicSeconds, rows };
        let done = 0;
        const onDone = (): void => {
            ctx.progress(++done, numbers.length, `sound ${done} of ${numbers.length}`);
        };
        const renderAll = options["renderAll"] as RenderAll | undefined;
        let results: Map<number, SoundResult>;
        if (renderAll) {
            ctx.progress(0, numbers.length, `sound 0 of ${numbers.length}`);
            results = await renderAll({ wasm, rom: rom.data, job, numbers, onDone });
        }
        else {
            results = new Map();
            for (const n of numbers) {
                await new Promise<void>((r) => setTimeout(r, 0));
                ctx.progress(done, numbers.length, `sound ${done + 1} of ${numbers.length}`);
                results.set(n, await renderSound(module, rom.data, job, n));
                done++;
            }
        }
        const sounds: Record<string, unknown> = {};
        const counts: Record<string, number> = {};
        for (const n of numbers) {
            const { stat, wav } = results.get(n)!;
            const [mode, cmd, vr] = rows[n]!;
            const kind = KINDS[mode]!;
            const rel = `${OUT_DIR}/${hex(n, 2)}.wav`;
            const sha = sha256Hex(wav);
            const recArgs: Record<string, unknown> = { number: hex(n, 2), kind, format: "wav" };
            if (kind === "music")
                recArgs["music_seconds"] = new PyFloat(musicSeconds);
            ctx.writeBytes(rel, wav, recArgs);
            sounds[hex(n, 2)] = {
                kind, mode, cmd: "0x" + hex(cmd, 2), var: "0x" + hex(vr, 2),
                samples: stat["samples"], seconds: new PyFloat(Number((stat["samples"]! / 44100).toFixed(3))),
                capped: !!stat["capped"], silent: stat["active"] === 0 && kind !== "music",
                files: { wav: { path: rel, bytes: wav.length, sha256: sha } },
                sha256: sha,
            };
            counts[kind] = (counts[kind] ?? 0) + 1;
        }
        const doc = {
            format: FORMAT,
            sample_rate_hz: 44100, channels: 2, bits: 16,
            music_seconds: new PyFloat(musicSeconds), music_fade_seconds: 4,
            sfx_voice_rule: "until 1 s of idle output (cap 15 s), trimmed to the audible part + 0.25 s",
            renderer: { ...(AUDIO_RENDERER_SOURCE !== null ? { source: AUDIO_RENDERER_SOURCE } : {}), source_sha256: srcSha, cores: ["vendor/z80", "vendor/ym3438", "vendor/psg"] },
            driver: { rom_offset: "0x" + hex(start, 6), bytes: end - start, bank_pointers: ptrs.map((p) => "0x" + hex(p, 6)), sound_table_rom_offset: "0x" + hex(SOUND_TABLE, 6) },
            encoders: { ffmpeg: null, formats: [], note: "skipped: --no-encode" },
            counts,
            sounds,
        };
        ctx.writeJson(`${OUT_DIR}/manifest.json`, doc, { ids: idsText, music_seconds: new PyFloat(musicSeconds) });
        const kinds = Object.entries(counts).sort().map(([k, c]) => `${c} ${k}`).join(", ");
        ctx.say(`audio: ${numbers.length} sound(s) (${kinds}) rendered with the wasm renderer in ${((Date.now() - t0) / 1000).toFixed(1)} s (WAV only)`);
    },
};

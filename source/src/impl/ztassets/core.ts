import { sha256Hex } from "../boot/sha256.js";
export const EXPECTED_MD5 = "54427136beee5a270232445bbfd0341f";
export const EXPECTED_SIZE = 2 * 1024 * 1024;
export const ZTASSETS_VERSION = "0.1";
export const ASSETS_VERSION = `${ZTASSETS_VERSION}/3`;
export const MANIFEST_NAME = "manifest.json";
export const MANIFEST_FORMAT = "ztassets-manifest/1";
const HEADER_BASE = 0x100;
const CHECKSUM_START = 0x200;
const MD5_S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
export function md5Hex(data: Uint8Array): string {
    const n = data.length;
    const padded = new Uint8Array(((n + 8) >> 6) * 64 + 64);
    padded.set(data);
    padded[n] = 0x80;
    const bits = n * 8;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, bits >>> 0, true);
    dv.setUint32(padded.length - 4, Math.floor(bits / 2 ** 32), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const M = new Uint32Array(16);
    for (let off = 0; off < padded.length; off += 64) {
        for (let i = 0; i < 16; i++)
            M[i] = dv.getUint32(off + i * 4, true);
        let A = a0, B = b0, C = c0, D = d0;
        for (let i = 0; i < 64; i++) {
            let F: number, g: number;
            if (i < 16) {
                F = (B & C) | (~B & D);
                g = i;
            }
            else if (i < 32) {
                F = (D & B) | (~D & C);
                g = (5 * i + 1) & 15;
            }
            else if (i < 48) {
                F = B ^ C ^ D;
                g = (3 * i + 5) & 15;
            }
            else {
                F = C ^ (B | ~D);
                g = (7 * i) & 15;
            }
            F = (F + A + MD5_K[i]! + M[g]!) >>> 0;
            A = D;
            D = C;
            C = B;
            B = (B + ((F << MD5_S[i]!) | (F >>> (32 - MD5_S[i]!)))) >>> 0;
        }
        a0 = (a0 + A) >>> 0;
        b0 = (b0 + B) >>> 0;
        c0 = (c0 + C) >>> 0;
        d0 = (d0 + D) >>> 0;
    }
    const out = new Uint8Array(16);
    const ov = new DataView(out.buffer);
    [a0, b0, c0, d0].forEach((w, i) => ov.setUint32(i * 4, w, true));
    return Array.from(out, (b) => b.toString(16).padStart(2, "0")).join("");
}
export class RomRejected extends Error {
}
export class RomFile {
    readonly md5: string;
    readonly size: number;
    readonly data: Uint8Array;
    constructor(data: Uint8Array) {
        const md5 = md5Hex(data);
        if (data.length !== EXPECTED_SIZE || md5 !== EXPECTED_MD5) {
            throw new RomRejected(`image is ${data.length} bytes with md5 ${md5}; this tool accepts only the ${EXPECTED_SIZE}-byte image with md5 ${EXPECTED_MD5} (an unpatched, good dump)`);
        }
        this.data = data;
        this.md5 = md5;
        this.size = data.length;
    }
    private span(off: number, n: number): void {
        if (off < 0 || n < 0 || off + n > this.size)
            throw new RangeError(`read of ${n} byte(s) at 0x${off.toString(16).toUpperCase()} is outside the ${this.size}-byte ROM`);
    }
    bytesAt(off: number, n: number): Uint8Array {
        this.span(off, n);
        return this.data.subarray(off, off + n);
    }
    u8(off: number): number {
        this.span(off, 1);
        return this.data[off]!;
    }
    u16be(off: number): number {
        this.span(off, 2);
        return (this.data[off]! << 8) | this.data[off + 1]!;
    }
    u32be(off: number): number {
        this.span(off, 4);
        return ((this.data[off]! << 24) >>> 0) + (this.data[off + 1]! << 16) + (this.data[off + 2]! << 8) + this.data[off + 3]!;
    }
    header(): Record<string, unknown> {
        const text = (off: number, n: number): string => {
            let s = Array.from(this.bytesAt(off, n), (b) => String.fromCharCode(b)).join("");
            s = s.replace(/^[ \x00]+/, "").replace(/[ \x00]+$/, "");
            return s;
        };
        const b = HEADER_BASE;
        let sram: Record<string, number> | null = null;
        const ra = this.bytesAt(b + 0xb0, 2);
        if (ra[0] === 0x52 && ra[1] === 0x41)
            sram = { flags: this.u8(b + 0xb2), start: this.u32be(b + 0xb4), end: this.u32be(b + 0xb8) };
        return {
            console_name: text(b + 0x00, 16),
            copyright: text(b + 0x10, 16),
            domestic_title: text(b + 0x20, 48),
            overseas_title: text(b + 0x50, 48),
            serial: text(b + 0x80, 14),
            checksum: this.u16be(b + 0x8e),
            device_support: text(b + 0x90, 16),
            rom_start: this.u32be(b + 0xa0),
            rom_end: this.u32be(b + 0xa4),
            ram_start: this.u32be(b + 0xa8),
            ram_end: this.u32be(b + 0xac),
            sram,
            modem_support: text(b + 0xbc, 12),
            notes: text(b + 0xc8, 40),
            region: text(b + 0xf0, 16),
        };
    }
    checksumComputed(): number {
        let end = Math.min(this.u32be(HEADER_BASE + 0xa4) + 1, this.size);
        end = CHECKSUM_START + ((end - CHECKSUM_START) & ~1);
        let sum = 0;
        for (let i = CHECKSUM_START; i < end; i += 2)
            sum = (sum + ((this.data[i]! << 8) | this.data[i + 1]!)) & 0xffff;
        return sum;
    }
}
export class PyFloat {
    constructor(readonly value: number) { }
}
export function pyFloatRepr(x: number): string {
    if (!Number.isFinite(x))
        throw new Error("canonical JSON: NaN / Infinity not allowed (allow_nan=False)");
    if (x === 0)
        return Object.is(x, -0) ? "-0.0" : "0.0";
    const ax = Math.abs(x);
    if (ax >= 1e16 || ax < 1e-4) {
        const [mant, exp] = x.toExponential().split("e") as [
            string,
            string
        ];
        const e = Number(exp);
        return `${mant}e${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`;
    }
    const s = String(x);
    return s.includes(".") || s.includes("e") ? s : `${s}.0`;
}
function pyString(s: string): string {
    let out = '"';
    for (const ch of s) {
        const c = ch.codePointAt(0)!;
        if (ch === '"')
            out += '\\"';
        else if (ch === "\\")
            out += "\\\\";
        else if (ch === "\n")
            out += "\\n";
        else if (ch === "\r")
            out += "\\r";
        else if (ch === "\t")
            out += "\\t";
        else if (ch === "\b")
            out += "\\b";
        else if (ch === "\f")
            out += "\\f";
        else if (c < 0x20)
            out += "\\u" + c.toString(16).padStart(4, "0");
        else
            out += ch;
    }
    return out + '"';
}
function codePointCompare(a: string, b: string): number {
    const A = Array.from(a), B = Array.from(b);
    for (let i = 0; i < Math.min(A.length, B.length); i++) {
        const d = A[i]!.codePointAt(0)! - B[i]!.codePointAt(0)!;
        if (d !== 0)
            return d;
    }
    return A.length - B.length;
}
function dump(v: unknown, level: number): string {
    if (v === null || v === undefined)
        return "null";
    if (v === true)
        return "true";
    if (v === false)
        return "false";
    if (v instanceof PyFloat)
        return pyFloatRepr(v.value);
    if (typeof v === "number") {
        if (!Number.isInteger(v))
            return pyFloatRepr(v);
        return Object.is(v, -0) ? "0" : String(v);
    }
    if (typeof v === "bigint")
        return v.toString();
    if (typeof v === "string")
        return pyString(v);
    const pad = "  ".repeat(level + 1);
    const end = "  ".repeat(level);
    if (Array.isArray(v)) {
        if (v.length === 0)
            return "[]";
        return "[\n" + v.map((x) => pad + dump(x, level + 1)).join(",\n") + "\n" + end + "]";
    }
    if (v instanceof Map)
        v = Object.fromEntries(v);
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).sort(codePointCompare);
    if (keys.length === 0)
        return "{}";
    return "{\n" + keys.map((k) => pad + pyString(k) + ": " + dump(o[k], level + 1)).join(",\n") + "\n" + end + "}";
}
export function canonicalJson(obj: unknown): Uint8Array {
    return new TextEncoder().encode(dump(obj, 0) + "\n");
}
export interface OutputFile {
    readonly path: string;
    readonly producer: string;
    readonly args: Record<string, unknown>;
    readonly bytes: Uint8Array;
}
export function checkRelpath(p: string): string {
    if (typeof p !== "string" || p === "")
        throw new Error("output path must be a non-empty string");
    if (p.includes("\\") || p.includes("\0") || p.includes(":"))
        throw new Error(`output path ${p}: use '/' separators, no ':' or NUL`);
    if (p.startsWith("/") || p.split("/").some((s) => s === "" || s === "." || s === ".."))
        throw new Error(`output path ${p} must be relative and stay inside the output dir`);
    if (p === MANIFEST_NAME)
        throw new Error(`${p} is reserved for the manifest itself`);
    return p;
}
export class Context {
    readonly files = new Map<string, OutputFile>();
    progress: (done: number, total: number, label?: string) => void = () => { };
    constructor(readonly rom: RomFile, readonly producer: string, readonly say: (line: string) => void = () => { }) { }
    writeBytes(path: string, bytes: Uint8Array, args: Record<string, unknown> = {}): OutputFile {
        checkRelpath(path);
        if (this.files.has(path))
            throw new Error(`output ${path} written twice in one run`);
        const f: OutputFile = { path, producer: this.producer, args: { ...args }, bytes };
        this.files.set(path, f);
        return f;
    }
    writeJson(path: string, obj: unknown, args: Record<string, unknown> = {}): OutputFile {
        return this.writeBytes(path, canonicalJson(obj), args);
    }
    read(path: string): Uint8Array | undefined {
        return this.files.get(path)?.bytes;
    }
}
export interface Command {
    readonly name: string;
    run(ctx: Context, options: Record<string, unknown>): void | Promise<void>;
}
export interface ManifestEntry {
    readonly args: Record<string, unknown>;
    readonly path: string;
    readonly producer: string;
    readonly sha256: string;
    readonly size: number;
}
export function manifestOf(files: Iterable<OutputFile>, romMd5: string): {
    doc: Record<string, unknown>;
    bytes: Uint8Array;
} {
    const list = [...files].sort((a, b) => codePointCompare(a.path, b.path));
    const entries: ManifestEntry[] = list.map((f) => ({ args: f.args, path: f.path, producer: f.producer, sha256: sha256Hex(f.bytes), size: f.bytes.length }));
    const doc = { format: MANIFEST_FORMAT, rom_md5: romMd5, tool_version: ZTASSETS_VERSION, files: entries };
    return { doc, bytes: canonicalJson(doc) };
}
export async function extract(romBytes: Uint8Array, commands: readonly Command[], options: Record<string, Record<string, unknown>> = {}, say?: (line: string) => void): Promise<Map<string, OutputFile>> {
    const rom = new RomFile(romBytes);
    const all = new Map<string, OutputFile>();
    for (const cmd of commands) {
        const ctx = new Context(rom, cmd.name, say);
        for (const [p, f] of all)
            ctx.files.set(p, f);
        const before = new Set(all.keys());
        await cmd.run(ctx, options[cmd.name] ?? {});
        for (const [p, f] of ctx.files)
            if (!before.has(p))
                all.set(p, f);
    }
    return all;
}

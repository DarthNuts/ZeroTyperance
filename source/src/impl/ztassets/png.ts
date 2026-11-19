import { zlibDeflate } from "./deflate.js";
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
export function crc32(data: Uint8Array, crc = 0): number {
    let c = ~crc >>> 0;
    for (let i = 0; i < data.length; i++)
        c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
    return ~c >>> 0;
}
export interface PngImage {
    readonly width: number;
    readonly height: number;
    readonly mode: "P" | "RGB";
    readonly pixels: Uint8Array;
    readonly palette?: ArrayLike<number>;
    readonly bits?: 4 | 8;
    readonly level?: number;
}
function filterRows(raw: Uint8Array, stride: number, height: number, bpp: number, adaptive: boolean): Uint8Array {
    const out = new Uint8Array(height * (stride + 1));
    const prior = new Uint8Array(stride);
    const cand = [new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride)];
    const cost = (v: number) => (v < 128 ? v : 256 - v);
    for (let y = 0; y < height; y++) {
        const row = raw.subarray(y * stride, (y + 1) * stride);
        const o = y * (stride + 1);
        let best: Uint8Array = row;
        let type = 0;
        if (adaptive) {
            let sum = 0;
            for (let i = 0; i < stride; i++)
                sum += cost(row[i]!);
            const up = cand[0]!;
            let s = 0;
            for (let i = 0; i < stride; i++)
                s += cost((up[i] = (row[i]! - prior[i]!) & 0xff));
            if (s < sum) {
                sum = s;
                best = up;
                type = 2;
            }
            const sub = cand[1]!;
            s = 0;
            for (let i = 0; i < stride; i++)
                s += cost((sub[i] = (row[i]! - (i >= bpp ? row[i - bpp]! : 0)) & 0xff));
            if (s < sum) {
                sum = s;
                best = sub;
                type = 1;
            }
            const pa = cand[2]!;
            s = 0;
            for (let i = 0; i < stride; i++) {
                const a = i >= bpp ? row[i - bpp]! : 0;
                const b = prior[i]!;
                const c = i >= bpp ? prior[i - bpp]! : 0;
                const p1 = Math.abs(b - c);
                const p2 = Math.abs(a - c);
                const p3 = Math.abs(a + b - 2 * c);
                const pred = p1 <= p2 && p1 <= p3 ? a : p2 <= p3 ? b : c;
                s += cost((pa[i] = (row[i]! - pred) & 0xff));
            }
            if (s < sum) {
                best = pa;
                type = 4;
            }
        }
        out[o] = type;
        out.set(best, o + 1);
        prior.set(row);
    }
    return out;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
    const c = new Uint8Array(12 + data.length);
    const dv = new DataView(c.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++)
        c[4 + i] = type.charCodeAt(i);
    c.set(data, 8);
    dv.setUint32(8 + data.length, crc32(c.subarray(4, 8 + data.length)));
    return c;
}
export function encodePng(im: PngImage): Uint8Array {
    const { width, height, mode, pixels } = im;
    const bits = mode === "P" ? (im.bits ?? 8) : 8;
    const channels = mode === "RGB" ? 3 : 1;
    if (pixels.length !== width * height * channels)
        throw new Error(`encodePng: ${pixels.length} pixel bytes for ${width}x${height} ${mode}`);
    const stride = mode === "P" && bits === 4 ? (width + 1) >> 1 : width * channels;
    let raw: Uint8Array;
    if (bits === 4) {
        raw = new Uint8Array(stride * height);
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++)
                raw[y * stride + (x >> 1)]! |= (pixels[y * width + x]! & 15) << (x & 1 ? 0 : 4);
    }
    else
        raw = pixels;
    const bpp = Math.max(1, (bits * channels + 7) >> 3);
    const filtered = filterRows(raw, stride, height, bpp, !(mode === "P" && bits === 8));
    const z = zlibDeflate(filtered, im.level ?? 9);
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, width);
    dv.setUint32(4, height);
    ihdr[8] = bits;
    ihdr[9] = mode === "RGB" ? 2 : 3;
    const parts: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr)];
    if (mode === "P") {
        const pal = im.palette ?? [];
        const n = Math.min(Math.floor(pal.length / 3), 1 << bits) * 3;
        parts.push(chunk("PLTE", Uint8Array.from({ length: n }, (_, i) => pal[i]! & 0xff)));
    }
    const block = Math.max(65536, width * 4);
    for (let i = 0; i < z.length; i += block)
        parts.push(chunk("IDAT", z.subarray(i, i + block)));
    parts.push(chunk("IEND", new Uint8Array(0)));
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
}
export interface PngChunk {
    readonly type: string;
    readonly data: Uint8Array;
    readonly offset: number;
}
export function pngChunks(b: Uint8Array): PngChunk[] {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const out: PngChunk[] = [];
    let i = 8;
    while (i + 12 <= b.length) {
        const n = dv.getUint32(i);
        const type = String.fromCharCode(b[i + 4]!, b[i + 5]!, b[i + 6]!, b[i + 7]!);
        out.push({ type, data: b.subarray(i + 8, i + 8 + n), offset: i });
        i += 12 + n;
    }
    return out;
}

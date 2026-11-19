const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export interface IndexedImage {
    width: number;
    height: number;
    bitDepth: number;
    pixels: Uint8Array;
}
function be32(b: Uint8Array, o: number): number {
    return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}
function chunkType(b: Uint8Array, o: number): string {
    return String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);
}
export function decodeIndexedPng(bytes: Uint8Array, inflate: (z: Uint8Array) => Uint8Array): IndexedImage {
    if (bytes.length < 8)
        throw new Error("png: truncated (no signature)");
    for (let i = 0; i < 8; i++)
        if (bytes[i] !== SIGNATURE[i])
            throw new Error("png: bad signature");
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let sawHeader = false;
    let sawEnd = false;
    const idat: Uint8Array[] = [];
    let off = 8;
    while (off < bytes.length) {
        if (off + 12 > bytes.length)
            throw new Error("png: truncated chunk header");
        const len = be32(bytes, off);
        const type = chunkType(bytes, off + 4);
        const dataStart = off + 8;
        if (dataStart + len + 4 > bytes.length)
            throw new Error(`png: truncated ${type} chunk`);
        if (type === "IHDR") {
            if (len !== 13)
                throw new Error(`png: IHDR length ${len}, expected 13`);
            width = be32(bytes, dataStart);
            height = be32(bytes, dataStart + 4);
            bitDepth = bytes[dataStart + 8]!;
            const colourType = bytes[dataStart + 9]!;
            const compression = bytes[dataStart + 10]!;
            const filterMethod = bytes[dataStart + 11]!;
            const interlace = bytes[dataStart + 12]!;
            if (colourType !== 3)
                throw new Error(`png: colour type ${colourType}, only 3 (indexed) is supported`);
            if (bitDepth !== 1 && bitDepth !== 2 && bitDepth !== 4 && bitDepth !== 8)
                throw new Error(`png: bit depth ${bitDepth} is not supported for indexed images`);
            if (compression !== 0)
                throw new Error(`png: compression method ${compression}`);
            if (filterMethod !== 0)
                throw new Error(`png: filter method ${filterMethod}`);
            if (interlace !== 0)
                throw new Error("png: interlaced images are not supported");
            if (width === 0 || height === 0)
                throw new Error("png: empty image");
            sawHeader = true;
        }
        else if (type === "IDAT") {
            if (!sawHeader)
                throw new Error("png: IDAT before IHDR");
            idat.push(bytes.subarray(dataStart, dataStart + len));
        }
        else if (type === "IEND") {
            sawEnd = true;
            break;
        }
        off = dataStart + len + 4;
    }
    if (!sawHeader)
        throw new Error("png: no IHDR");
    if (!sawEnd)
        throw new Error("png: no IEND (truncated)");
    if (idat.length === 0)
        throw new Error("png: no IDAT");
    let total = 0;
    for (const c of idat)
        total += c.length;
    const z = new Uint8Array(total);
    let p = 0;
    for (const c of idat) {
        z.set(c, p);
        p += c.length;
    }
    const raw = inflate(z);
    const stride = Math.ceil((width * bitDepth) / 8);
    if (raw.length < (stride + 1) * height)
        throw new Error(`png: image data holds ${raw.length} bytes, ${(stride + 1) * height} needed`);
    const bpp = 1;
    const lines = new Uint8Array(stride * height);
    for (let y = 0; y < height; y++) {
        const ft = raw[y * (stride + 1)]!;
        const src = y * (stride + 1) + 1;
        const dst = y * stride;
        const prev = dst - stride;
        for (let x = 0; x < stride; x++) {
            const v = raw[src + x]!;
            const a = x >= bpp ? lines[dst + x - bpp]! : 0;
            const b = y > 0 ? lines[prev + x]! : 0;
            const c = y > 0 && x >= bpp ? lines[prev + x - bpp]! : 0;
            let r: number;
            switch (ft) {
                case 0:
                    r = v;
                    break;
                case 1:
                    r = v + a;
                    break;
                case 2:
                    r = v + b;
                    break;
                case 3:
                    r = v + ((a + b) >> 1);
                    break;
                case 4: {
                    const pp = a + b - c;
                    const pa = Math.abs(pp - a);
                    const pb = Math.abs(pp - b);
                    const pc = Math.abs(pp - c);
                    r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
                    break;
                }
                default: throw new Error(`png: unknown scanline filter ${ft} at row ${y}`);
            }
            lines[dst + x] = r & 0xff;
        }
    }
    const pixels = new Uint8Array(width * height);
    const mask = (1 << bitDepth) - 1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (bitDepth === 8) {
                pixels[y * width + x] = lines[y * stride + x]!;
            }
            else {
                const bit = x * bitDepth;
                const byte = lines[y * stride + (bit >> 3)]!;
                const shift = 8 - bitDepth - (bit & 7);
                pixels[y * width + x] = (byte >> shift) & mask;
            }
        }
    }
    return { width, height, bitDepth, pixels };
}

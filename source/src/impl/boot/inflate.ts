interface Huff {
    readonly count: Uint16Array;
    readonly symbol: Uint16Array;
}
function build(lengths: Uint8Array, n: number, off: number): Huff {
    const count = new Uint16Array(16);
    for (let i = 0; i < n; i++)
        count[lengths[off + i]!]!++;
    const offs = new Uint16Array(16);
    for (let l = 1; l < 15; l++)
        offs[l + 1] = offs[l]! + count[l]!;
    const symbol = new Uint16Array(n);
    for (let i = 0; i < n; i++) {
        const l = lengths[off + i]!;
        if (l !== 0)
            symbol[offs[l]!++] = i;
    }
    return { count, symbol };
}
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
let fixed: {
    lit: Huff;
    dist: Huff;
} | null = null;
function fixedTables(): {
    lit: Huff;
    dist: Huff;
} {
    if (fixed === null) {
        const l = new Uint8Array(288);
        for (let i = 0; i < 144; i++)
            l[i] = 8;
        for (let i = 144; i < 256; i++)
            l[i] = 9;
        for (let i = 256; i < 280; i++)
            l[i] = 7;
        for (let i = 280; i < 288; i++)
            l[i] = 8;
        const d = new Uint8Array(30).fill(5);
        fixed = { lit: build(l, 288, 0), dist: build(d, 30, 0) };
    }
    return fixed;
}
export function inflateZlib(src: Uint8Array): Uint8Array {
    if (src.length < 2 || (src[0]! & 15) !== 8)
        throw new Error("inflate: not a zlib stream");
    let pos = 2;
    let bitBuf = 0;
    let bitCnt = 0;
    let out = new Uint8Array(Math.max(1024, src.length * 4));
    let op = 0;
    const bits = (need: number): number => {
        while (bitCnt < need) {
            if (pos >= src.length)
                throw new Error("inflate: unexpected end of data");
            bitBuf |= src[pos++]! << bitCnt;
            bitCnt += 8;
        }
        const v = bitBuf & ((1 << need) - 1);
        bitBuf >>>= need;
        bitCnt -= need;
        return v;
    };
    const decode = (h: Huff): number => {
        let code = 0;
        let first = 0;
        let index = 0;
        for (let len = 1; len <= 15; len++) {
            code |= bits(1);
            const c = h.count[len]!;
            if (code - c < first)
                return h.symbol[index + (code - first)]!;
            index += c;
            first += c;
            first <<= 1;
            code <<= 1;
        }
        throw new Error("inflate: bad code");
    };
    const room = (n: number): void => {
        if (op + n <= out.length)
            return;
        const bigger = new Uint8Array(Math.max(out.length * 2, op + n));
        bigger.set(out.subarray(0, op));
        out = bigger;
    };
    const codes = (lit: Huff, dist: Huff): void => {
        for (;;) {
            let sym = decode(lit);
            if (sym < 256) {
                room(1);
                out[op++] = sym;
            }
            else if (sym === 256) {
                return;
            }
            else {
                sym -= 257;
                if (sym >= 29)
                    throw new Error("inflate: bad length symbol");
                const len = LBASE[sym]! + bits(LEXT[sym]!);
                const ds = decode(dist);
                if (ds >= 30)
                    throw new Error("inflate: bad distance symbol");
                const d = DBASE[ds]! + bits(DEXT[ds]!);
                if (d > op)
                    throw new Error("inflate: distance too far back");
                room(len);
                for (let i = 0; i < len; i++) {
                    out[op] = out[op - d]!;
                    op++;
                }
            }
        }
    };
    let last = 0;
    do {
        last = bits(1);
        const type = bits(2);
        if (type === 0) {
            bitBuf = 0;
            bitCnt = 0;
            if (pos + 4 > src.length)
                throw new Error("inflate: unexpected end of data");
            const len = src[pos]! | (src[pos + 1]! << 8);
            pos += 4;
            if (pos + len > src.length)
                throw new Error("inflate: unexpected end of data");
            room(len);
            out.set(src.subarray(pos, pos + len), op);
            op += len;
            pos += len;
        }
        else if (type === 1) {
            const t = fixedTables();
            codes(t.lit, t.dist);
        }
        else if (type === 2) {
            const nlen = bits(5) + 257;
            const ndist = bits(5) + 1;
            const ncode = bits(4) + 4;
            const lengths = new Uint8Array(320);
            for (let i = 0; i < ncode; i++)
                lengths[CLORDER[i]!] = bits(3);
            const lencode = build(lengths, 19, 0);
            const ll = new Uint8Array(320);
            let i = 0;
            while (i < nlen + ndist) {
                const sym = decode(lencode);
                if (sym < 16)
                    ll[i++] = sym;
                else {
                    let prev = 0;
                    let rep: number;
                    if (sym === 16) {
                        if (i === 0)
                            throw new Error("inflate: repeat with no previous length");
                        prev = ll[i - 1]!;
                        rep = 3 + bits(2);
                    }
                    else if (sym === 17)
                        rep = 3 + bits(3);
                    else
                        rep = 11 + bits(7);
                    if (i + rep > nlen + ndist)
                        throw new Error("inflate: too many lengths");
                    while (rep-- > 0)
                        ll[i++] = prev;
                }
            }
            codes(build(ll, nlen, 0), build(ll, ndist, nlen));
        }
        else
            throw new Error("inflate: bad block type");
    } while (last === 0);
    return out.slice(0, op);
}

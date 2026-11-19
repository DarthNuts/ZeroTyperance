const MIN_MATCH = 3;
const MAX_MATCH = 258;
const MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1;
const TOO_FAR = 4096;
const LENGTH_CODES = 29;
const LITERALS = 256;
const L_CODES = LITERALS + 1 + LENGTH_CODES;
const D_CODES = 30;
const BL_CODES = 19;
const HEAP_SIZE = 2 * L_CODES + 1;
const MAX_BITS = 15;
const MAX_BL_BITS = 7;
const END_BLOCK = 256;
const REP_3_6 = 16;
const REPZ_3_10 = 17;
const REPZ_11_138 = 18;
export const Z_FILTERED = 1;
export const Z_DEFAULT_STRATEGY = 0;
const EXTRA_LBITS = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const EXTRA_DBITS = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const EXTRA_BLBITS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7];
const BL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
const CONFIG: number[][] = [
    [0, 0, 0, 0],
    [4, 4, 8, 4],
    [4, 5, 16, 8],
    [4, 6, 32, 32],
    [4, 4, 16, 16],
    [8, 16, 32, 32],
    [8, 16, 128, 128],
    [8, 32, 128, 256],
    [32, 128, 258, 1024],
    [32, 258, 258, 4096],
];
function biReverse(code: number, len: number): number {
    let res = 0;
    do {
        res |= code & 1;
        code >>>= 1;
        res <<= 1;
    } while (--len > 0);
    return res >>> 1;
}
const baseLength = new Int32Array(LENGTH_CODES);
const lengthCode = new Uint8Array(256);
const baseDist = new Int32Array(D_CODES);
const distCode = new Uint8Array(512);
const staticLCode = new Uint16Array(L_CODES + 2);
const staticLLen = new Uint16Array(L_CODES + 2);
const staticDCode = new Uint16Array(D_CODES);
const staticDLen = new Uint16Array(D_CODES);
function genCodes(code: Uint16Array, len: ArrayLike<number>, maxCode: number, blCount: Uint16Array): void {
    const next = new Uint16Array(MAX_BITS + 1);
    let c = 0;
    for (let bits = 1; bits <= MAX_BITS; bits++) {
        c = (c + blCount[bits - 1]) << 1;
        next[bits] = c;
    }
    for (let n = 0; n <= maxCode; n++) {
        const l = len[n];
        if (l === 0)
            continue;
        code[n] = biReverse(next[l]++, l);
    }
}
(function staticInit() {
    let length = 0;
    let code: number;
    for (code = 0; code < LENGTH_CODES - 1; code++) {
        baseLength[code] = length;
        for (let n = 0; n < 1 << EXTRA_LBITS[code]; n++)
            lengthCode[length++] = code;
    }
    lengthCode[length - 1] = code;
    let dist = 0;
    for (code = 0; code < 16; code++) {
        baseDist[code] = dist;
        for (let n = 0; n < 1 << EXTRA_DBITS[code]; n++)
            distCode[dist++] = code;
    }
    dist >>= 7;
    for (; code < D_CODES; code++) {
        baseDist[code] = dist << 7;
        for (let n = 0; n < 1 << (EXTRA_DBITS[code] - 7); n++)
            distCode[256 + dist++] = code;
    }
    const blCount = new Uint16Array(MAX_BITS + 1);
    let n = 0;
    while (n <= 143) {
        staticLLen[n++] = 8;
        blCount[8]++;
    }
    while (n <= 255) {
        staticLLen[n++] = 9;
        blCount[9]++;
    }
    while (n <= 279) {
        staticLLen[n++] = 7;
        blCount[7]++;
    }
    while (n <= 287) {
        staticLLen[n++] = 8;
        blCount[8]++;
    }
    genCodes(staticLCode, staticLLen, L_CODES + 1, blCount);
    for (n = 0; n < D_CODES; n++) {
        staticDLen[n] = 5;
        staticDCode[n] = biReverse(n, 5);
    }
})();
function dCode(dist: number): number {
    return dist < 256 ? distCode[dist] : distCode[256 + (dist >>> 7)];
}
class Tree {
    fc: Uint16Array;
    dl: Uint16Array;
    constructor(size: number) {
        this.fc = new Uint16Array(size);
        this.dl = new Uint16Array(size);
    }
}
interface StaticDesc {
    sCode: Uint16Array | null;
    sLen: Uint16Array | null;
    extra: number[];
    base: number;
    elems: number;
    maxLength: number;
}
const STATIC_L: StaticDesc = { sCode: staticLCode, sLen: staticLLen, extra: EXTRA_LBITS, base: LITERALS + 1, elems: L_CODES, maxLength: MAX_BITS };
const STATIC_D: StaticDesc = { sCode: staticDCode, sLen: staticDLen, extra: EXTRA_DBITS, base: 0, elems: D_CODES, maxLength: MAX_BITS };
const STATIC_BL: StaticDesc = { sCode: null, sLen: null, extra: EXTRA_BLBITS, base: 0, elems: BL_CODES, maxLength: MAX_BL_BITS };
class Deflater {
    level: number;
    strategy: number;
    goodMatch: number;
    maxLazy: number;
    niceMatch: number;
    maxChain: number;
    wBits = 15;
    wSize = 1 << 15;
    wMask = this.wSize - 1;
    hashBits: number;
    hashSize: number;
    hashMask: number;
    hashShift: number;
    litBufsize: number;
    symEnd: number;
    MAX_DIST = this.wSize - MIN_LOOKAHEAD;
    input: Uint8Array;
    inPos = 0;
    end = 0;
    finishing = false;
    adler = 1;
    window: Uint8Array;
    prev: Uint16Array;
    head: Uint16Array;
    strstart = 0;
    lookahead = 0;
    blockStart = 0;
    matchStart = 0;
    matchLength = MIN_MATCH - 1;
    prevMatch = 0;
    prevLength = MIN_MATCH - 1;
    matchAvailable = false;
    dynL = new Tree(HEAP_SIZE);
    dynD = new Tree(2 * D_CODES + 1);
    blTree = new Tree(2 * BL_CODES + 1);
    lMaxCode = 0;
    dMaxCode = 0;
    blMaxCode = 0;
    blCount = new Uint16Array(MAX_BITS + 1);
    heap = new Int32Array(2 * L_CODES + 1);
    heapLen = 0;
    heapMax = 0;
    depth = new Uint8Array(2 * L_CODES + 1);
    symDist: Uint16Array;
    symLc: Uint8Array;
    symNext = 0;
    optLen = 0;
    staticLen = 0;
    out: Uint8Array;
    outLen = 0;
    biBuf = 0;
    biValid = 0;
    constructor(data: Uint8Array, level: number, memLevel: number, strategy: number) {
        this.input = data;
        this.level = level;
        this.strategy = strategy;
        [this.goodMatch, this.maxLazy, this.niceMatch, this.maxChain] = CONFIG[level];
        this.hashBits = memLevel + 7;
        this.hashSize = 1 << this.hashBits;
        this.hashMask = this.hashSize - 1;
        this.hashShift = Math.floor((this.hashBits + MIN_MATCH - 1) / MIN_MATCH);
        this.litBufsize = 1 << (memLevel + 6);
        this.symEnd = this.litBufsize - 1;
        this.window = new Uint8Array(2 * this.wSize + MAX_MATCH + 8);
        this.prev = new Uint16Array(this.wSize);
        this.head = new Uint16Array(this.hashSize);
        this.symDist = new Uint16Array(this.litBufsize);
        this.symLc = new Uint8Array(this.litBufsize);
        this.out = new Uint8Array(Math.max(64, (data.length >> 1) + 64));
        this.initBlock();
    }
    putByte(b: number): void {
        if (this.outLen >= this.out.length) {
            const n = new Uint8Array(this.out.length * 2);
            n.set(this.out);
            this.out = n;
        }
        this.out[this.outLen++] = b & 0xff;
    }
    sendBits(value: number, length: number): void {
        this.biBuf |= value << this.biValid;
        this.biValid += length;
        while (this.biValid >= 8) {
            this.putByte(this.biBuf & 0xff);
            this.biBuf >>>= 8;
            this.biValid -= 8;
        }
    }
    biWindup(): void {
        if (this.biValid > 0)
            this.putByte(this.biBuf & 0xff);
        this.biBuf = 0;
        this.biValid = 0;
    }
    readBuf(dst: number, size: number): number {
        let len = this.end - this.inPos;
        if (len > size)
            len = size;
        if (len === 0)
            return 0;
        const chunk = this.input.subarray(this.inPos, this.inPos + len);
        this.window.set(chunk, dst);
        this.inPos += len;
        return len;
    }
    slideHash(): void {
        const w = this.wSize;
        const head = this.head;
        for (let i = 0; i < this.hashSize; i++) {
            const m = head[i];
            head[i] = m >= w ? m - w : 0;
        }
        const prev = this.prev;
        for (let i = 0; i < w; i++) {
            const m = prev[i];
            prev[i] = m >= w ? m - w : 0;
        }
    }
    fillWindow(): void {
        const wsize = this.wSize;
        const windowSize = 2 * wsize;
        let more: number;
        do {
            more = windowSize - this.lookahead - this.strstart;
            if (this.strstart >= wsize + this.MAX_DIST) {
                this.window.copyWithin(0, wsize, wsize + wsize - more);
                this.matchStart -= wsize;
                this.strstart -= wsize;
                this.blockStart -= wsize;
                this.slideHash();
                more += wsize;
            }
            if (this.inPos >= this.end)
                break;
            const n = this.readBuf(this.strstart + this.lookahead, more);
            this.lookahead += n;
        } while (this.lookahead < MIN_LOOKAHEAD && this.inPos < this.end);
    }
    hashAt(p: number): number {
        const w = this.window;
        const s = this.hashShift;
        return (((w[p] << (2 * s)) ^ (w[p + 1] << s) ^ w[p + 2]) & this.hashMask);
    }
    insertString(str: number): number {
        const h = this.hashAt(str);
        const mh = this.head[h];
        this.prev[str & this.wMask] = mh;
        this.head[h] = str;
        return mh;
    }
    longestMatch(curMatch: number): number {
        let chain = this.maxChain;
        const w = this.window;
        const scan = this.strstart;
        let bestLen = this.prevLength;
        let nice = this.niceMatch;
        const limit = scan > this.MAX_DIST ? scan - this.MAX_DIST : 0;
        const prev = this.prev;
        const wmask = this.wMask;
        if (this.prevLength >= this.goodMatch)
            chain >>= 2;
        if (nice > this.lookahead)
            nice = this.lookahead;
        let scanEnd1 = w[scan + bestLen - 1];
        let scanEnd = w[scan + bestLen];
        do {
            const m = curMatch;
            if (w[m + bestLen] === scanEnd && w[m + bestLen - 1] === scanEnd1 && w[m] === w[scan] && w[m + 1] === w[scan + 1]) {
                let i = 3;
                while (i < MAX_MATCH && w[scan + i] === w[m + i])
                    i++;
                if (i > bestLen) {
                    this.matchStart = curMatch;
                    bestLen = i;
                    if (i >= nice)
                        break;
                    scanEnd1 = w[scan + bestLen - 1];
                    scanEnd = w[scan + bestLen];
                }
            }
            curMatch = prev[curMatch & wmask];
        } while (curMatch > limit && --chain !== 0);
        return bestLen <= this.lookahead ? bestLen : this.lookahead;
    }
    initBlock(): void {
        this.dynL.fc.fill(0, 0, L_CODES);
        this.dynD.fc.fill(0, 0, D_CODES);
        this.blTree.fc.fill(0, 0, BL_CODES);
        this.dynL.fc[END_BLOCK] = 1;
        this.optLen = 0;
        this.staticLen = 0;
        this.symNext = 0;
    }
    tallyLit(c: number): boolean {
        this.symDist[this.symNext] = 0;
        this.symLc[this.symNext++] = c;
        this.dynL.fc[c]++;
        return this.symNext === this.symEnd;
    }
    tallyDist(distance: number, len: number): boolean {
        this.symDist[this.symNext] = distance;
        this.symLc[this.symNext++] = len;
        distance--;
        this.dynL.fc[lengthCode[len] + LITERALS + 1]++;
        this.dynD.fc[dCode(distance)]++;
        return this.symNext === this.symEnd;
    }
    smaller(t: Tree, n: number, m: number): boolean {
        return t.fc[n] < t.fc[m] || (t.fc[n] === t.fc[m] && this.depth[n] <= this.depth[m]);
    }
    pqdownheap(t: Tree, k: number): void {
        const heap = this.heap;
        const v = heap[k];
        let j = k << 1;
        while (j <= this.heapLen) {
            if (j < this.heapLen && this.smaller(t, heap[j + 1], heap[j]))
                j++;
            if (this.smaller(t, v, heap[j]))
                break;
            heap[k] = heap[j];
            k = j;
            j <<= 1;
        }
        heap[k] = v;
    }
    genBitlen(t: Tree, maxCode: number, sd: StaticDesc): void {
        const heap = this.heap;
        const blCount = this.blCount;
        let overflow = 0;
        const maxLength = sd.maxLength;
        for (let bits = 0; bits <= MAX_BITS; bits++)
            blCount[bits] = 0;
        t.dl[heap[this.heapMax]] = 0;
        let h: number;
        for (h = this.heapMax + 1; h < HEAP_SIZE; h++) {
            const n = heap[h];
            let bits = t.dl[t.dl[n]] + 1;
            if (bits > maxLength) {
                bits = maxLength;
                overflow++;
            }
            t.dl[n] = bits;
            if (n > maxCode)
                continue;
            blCount[bits]++;
            let xbits = 0;
            if (n >= sd.base)
                xbits = sd.extra[n - sd.base];
            const f = t.fc[n];
            this.optLen += f * (bits + xbits);
            if (sd.sLen)
                this.staticLen += f * (sd.sLen[n] + xbits);
        }
        if (overflow === 0)
            return;
        do {
            let bits = maxLength - 1;
            while (blCount[bits] === 0)
                bits--;
            blCount[bits]--;
            blCount[bits + 1] += 2;
            blCount[maxLength]--;
            overflow -= 2;
        } while (overflow > 0);
        for (let bits = maxLength; bits !== 0; bits--) {
            let n = blCount[bits];
            while (n !== 0) {
                const m = heap[--h];
                if (m > maxCode)
                    continue;
                if (t.dl[m] !== bits) {
                    this.optLen += (bits - t.dl[m]) * t.fc[m];
                    t.dl[m] = bits;
                }
                n--;
            }
        }
    }
    buildTree(t: Tree, sd: StaticDesc): number {
        const heap = this.heap;
        const elems = sd.elems;
        let maxCode = -1;
        this.heapLen = 0;
        this.heapMax = HEAP_SIZE;
        for (let n = 0; n < elems; n++) {
            if (t.fc[n] !== 0) {
                heap[++this.heapLen] = maxCode = n;
                this.depth[n] = 0;
            }
            else {
                t.dl[n] = 0;
            }
        }
        while (this.heapLen < 2) {
            const node = (heap[++this.heapLen] = maxCode < 2 ? ++maxCode : 0);
            t.fc[node] = 1;
            this.depth[node] = 0;
            this.optLen--;
            if (sd.sLen)
                this.staticLen -= sd.sLen[node];
        }
        for (let n = this.heapLen >> 1; n >= 1; n--)
            this.pqdownheap(t, n);
        let node = elems;
        do {
            const n = heap[1];
            heap[1] = heap[this.heapLen--];
            this.pqdownheap(t, 1);
            const m = heap[1];
            heap[--this.heapMax] = n;
            heap[--this.heapMax] = m;
            t.fc[node] = t.fc[n] + t.fc[m];
            this.depth[node] = (this.depth[n] >= this.depth[m] ? this.depth[n] : this.depth[m]) + 1;
            t.dl[n] = t.dl[m] = node;
            heap[1] = node++;
            this.pqdownheap(t, 1);
        } while (this.heapLen >= 2);
        heap[--this.heapMax] = heap[1];
        this.genBitlen(t, maxCode, sd);
        genCodes(t.fc, t.dl, maxCode, this.blCount);
        return maxCode;
    }
    scanTree(t: Tree, maxCode: number): void {
        let prevlen = -1;
        let nextlen = t.dl[0];
        let count = 0;
        let maxCount = 7;
        let minCount = 4;
        if (nextlen === 0) {
            maxCount = 138;
            minCount = 3;
        }
        t.dl[maxCode + 1] = 0xffff;
        const bl = this.blTree.fc;
        for (let n = 0; n <= maxCode; n++) {
            const curlen = nextlen;
            nextlen = t.dl[n + 1];
            if (++count < maxCount && curlen === nextlen)
                continue;
            else if (count < minCount)
                bl[curlen] += count;
            else if (curlen !== 0) {
                if (curlen !== prevlen)
                    bl[curlen]++;
                bl[REP_3_6]++;
            }
            else if (count <= 10)
                bl[REPZ_3_10]++;
            else
                bl[REPZ_11_138]++;
            count = 0;
            prevlen = curlen;
            if (nextlen === 0) {
                maxCount = 138;
                minCount = 3;
            }
            else if (curlen === nextlen) {
                maxCount = 6;
                minCount = 3;
            }
            else {
                maxCount = 7;
                minCount = 4;
            }
        }
    }
    sendCode(c: number, t: Tree): void {
        this.sendBits(t.fc[c], t.dl[c]);
    }
    sendTree(t: Tree, maxCode: number): void {
        let prevlen = -1;
        let nextlen = t.dl[0];
        let count = 0;
        let maxCount = 7;
        let minCount = 4;
        const bl = this.blTree;
        if (nextlen === 0) {
            maxCount = 138;
            minCount = 3;
        }
        for (let n = 0; n <= maxCode; n++) {
            const curlen = nextlen;
            nextlen = t.dl[n + 1];
            if (++count < maxCount && curlen === nextlen)
                continue;
            else if (count < minCount) {
                do {
                    this.sendCode(curlen, bl);
                } while (--count !== 0);
            }
            else if (curlen !== 0) {
                if (curlen !== prevlen) {
                    this.sendCode(curlen, bl);
                    count--;
                }
                this.sendCode(REP_3_6, bl);
                this.sendBits(count - 3, 2);
            }
            else if (count <= 10) {
                this.sendCode(REPZ_3_10, bl);
                this.sendBits(count - 3, 3);
            }
            else {
                this.sendCode(REPZ_11_138, bl);
                this.sendBits(count - 11, 7);
            }
            count = 0;
            prevlen = curlen;
            if (nextlen === 0) {
                maxCount = 138;
                minCount = 3;
            }
            else if (curlen === nextlen) {
                maxCount = 6;
                minCount = 3;
            }
            else {
                maxCount = 7;
                minCount = 4;
            }
        }
    }
    buildBlTree(): number {
        this.scanTree(this.dynL, this.lMaxCode);
        this.scanTree(this.dynD, this.dMaxCode);
        this.blMaxCode = this.buildTree(this.blTree, STATIC_BL);
        let maxBlindex: number;
        for (maxBlindex = BL_CODES - 1; maxBlindex >= 3; maxBlindex--) {
            if (this.blTree.dl[BL_ORDER[maxBlindex]] !== 0)
                break;
        }
        this.optLen += 3 * (maxBlindex + 1) + 5 + 5 + 4;
        return maxBlindex;
    }
    sendAllTrees(lcodes: number, dcodes: number, blcodes: number): void {
        this.sendBits(lcodes - 257, 5);
        this.sendBits(dcodes - 1, 5);
        this.sendBits(blcodes - 4, 4);
        for (let rank = 0; rank < blcodes; rank++)
            this.sendBits(this.blTree.dl[BL_ORDER[rank]], 3);
        this.sendTree(this.dynL, lcodes - 1);
        this.sendTree(this.dynD, dcodes - 1);
    }
    compressBlock(lCode: Uint16Array, lLen: Uint16Array, dCodeT: Uint16Array, dLen: Uint16Array): void {
        for (let sx = 0; sx < this.symNext; sx++) {
            let dist = this.symDist[sx];
            let lc = this.symLc[sx];
            if (dist === 0) {
                this.sendBits(lCode[lc], lLen[lc]);
            }
            else {
                let code = lengthCode[lc];
                this.sendBits(lCode[code + LITERALS + 1], lLen[code + LITERALS + 1]);
                let extra = EXTRA_LBITS[code];
                if (extra !== 0) {
                    lc -= baseLength[code];
                    this.sendBits(lc, extra);
                }
                dist--;
                code = dCode(dist);
                this.sendBits(dCodeT[code], dLen[code]);
                extra = EXTRA_DBITS[code];
                if (extra !== 0) {
                    dist -= baseDist[code];
                    this.sendBits(dist, extra);
                }
            }
        }
        this.sendBits(lCode[END_BLOCK], lLen[END_BLOCK]);
    }
    trFlushBlock(bufStart: number, storedLen: number, last: boolean): void {
        let optLenb: number;
        let staticLenb: number;
        let maxBlindex = 0;
        if (this.level > 0) {
            this.lMaxCode = this.buildTree(this.dynL, STATIC_L);
            this.dMaxCode = this.buildTree(this.dynD, STATIC_D);
            maxBlindex = this.buildBlTree();
            optLenb = (this.optLen + 3 + 7) >>> 3;
            staticLenb = (this.staticLen + 3 + 7) >>> 3;
            if (staticLenb <= optLenb)
                optLenb = staticLenb;
        }
        else {
            optLenb = staticLenb = storedLen + 5;
        }
        const lastBit = last ? 1 : 0;
        if (storedLen + 4 <= optLenb && bufStart >= 0) {
            this.sendBits((0 << 1) + lastBit, 3);
            this.biWindup();
            this.putByte(storedLen & 0xff);
            this.putByte((storedLen >>> 8) & 0xff);
            this.putByte(~storedLen & 0xff);
            this.putByte((~storedLen >>> 8) & 0xff);
            for (let i = 0; i < storedLen; i++)
                this.putByte(this.window[bufStart + i]);
        }
        else if (staticLenb === optLenb) {
            this.sendBits((1 << 1) + lastBit, 3);
            this.compressBlock(staticLCode, staticLLen, staticDCode, staticDLen);
        }
        else {
            this.sendBits((2 << 1) + lastBit, 3);
            this.sendAllTrees(this.lMaxCode + 1, this.dMaxCode + 1, maxBlindex + 1);
            this.compressBlock(this.dynL.fc, this.dynL.dl, this.dynD.fc, this.dynD.dl);
        }
        this.initBlock();
        if (last)
            this.biWindup();
    }
    flushBlockOnly(last: boolean): void {
        this.trFlushBlock(this.blockStart >= 0 ? this.blockStart : -1, this.strstart - this.blockStart, last);
        this.blockStart = this.strstart;
    }
    deflateFast(): void {
        for (;;) {
            if (this.lookahead < MIN_LOOKAHEAD) {
                this.fillWindow();
                if (this.lookahead < MIN_LOOKAHEAD && !this.finishing)
                    return;
                if (this.lookahead === 0)
                    break;
            }
            let hashHead = 0;
            if (this.lookahead >= MIN_MATCH)
                hashHead = this.insertString(this.strstart);
            if (hashHead !== 0 && this.strstart - hashHead <= this.MAX_DIST) {
                this.matchLength = this.longestMatch(hashHead);
            }
            let bflush: boolean;
            if (this.matchLength >= MIN_MATCH) {
                bflush = this.tallyDist(this.strstart - this.matchStart, this.matchLength - MIN_MATCH);
                this.lookahead -= this.matchLength;
                if (this.matchLength <= this.maxLazy && this.lookahead >= MIN_MATCH) {
                    this.matchLength--;
                    do {
                        this.strstart++;
                        this.insertString(this.strstart);
                    } while (--this.matchLength !== 0);
                    this.strstart++;
                }
                else {
                    this.strstart += this.matchLength;
                    this.matchLength = 0;
                }
            }
            else {
                bflush = this.tallyLit(this.window[this.strstart]);
                this.lookahead--;
                this.strstart++;
            }
            if (bflush)
                this.flushBlockOnly(false);
        }
        this.flushBlockOnly(true);
    }
    deflateSlow(): void {
        for (;;) {
            if (this.lookahead < MIN_LOOKAHEAD) {
                this.fillWindow();
                if (this.lookahead < MIN_LOOKAHEAD && !this.finishing)
                    return;
                if (this.lookahead === 0)
                    break;
            }
            let hashHead = 0;
            if (this.lookahead >= MIN_MATCH)
                hashHead = this.insertString(this.strstart);
            this.prevLength = this.matchLength;
            this.prevMatch = this.matchStart;
            this.matchLength = MIN_MATCH - 1;
            if (hashHead !== 0 && this.prevLength < this.maxLazy && this.strstart - hashHead <= this.MAX_DIST) {
                this.matchLength = this.longestMatch(hashHead);
                if (this.matchLength <= 5 && (this.strategy === Z_FILTERED ||
                    (this.matchLength === MIN_MATCH && this.strstart - this.matchStart > TOO_FAR))) {
                    this.matchLength = MIN_MATCH - 1;
                }
            }
            if (this.prevLength >= MIN_MATCH && this.matchLength <= this.prevLength) {
                const maxInsert = this.strstart + this.lookahead - MIN_MATCH;
                const bflush = this.tallyDist(this.strstart - 1 - this.prevMatch, this.prevLength - MIN_MATCH);
                this.lookahead -= this.prevLength - 1;
                this.prevLength -= 2;
                do {
                    if (++this.strstart <= maxInsert)
                        this.insertString(this.strstart);
                } while (--this.prevLength !== 0);
                this.matchAvailable = false;
                this.matchLength = MIN_MATCH - 1;
                this.strstart++;
                if (bflush)
                    this.flushBlockOnly(false);
            }
            else if (this.matchAvailable) {
                const bflush = this.tallyLit(this.window[this.strstart - 1]);
                if (bflush)
                    this.flushBlockOnly(false);
                this.strstart++;
                this.lookahead--;
            }
            else {
                this.matchAvailable = true;
                this.strstart++;
                this.lookahead--;
            }
        }
        if (this.matchAvailable) {
            this.tallyLit(this.window[this.strstart - 1]);
            this.matchAvailable = false;
        }
        this.flushBlockOnly(true);
    }
}
export function adler32(data: Uint8Array): number {
    let a = 1;
    let b = 0;
    const n = data.length;
    let i = 0;
    while (i < n) {
        const end = Math.min(i + 5552, n);
        for (; i < end; i++) {
            a += data[i];
            b += a;
        }
        a %= 65521;
        b %= 65521;
    }
    return ((b << 16) | a) >>> 0;
}
export interface DeflateOptions {
    memLevel?: number;
    strategy?: number;
    chunk?: number;
}
export function zlibDeflate(data: Uint8Array, level: number, opts: DeflateOptions = {}): Uint8Array {
    if (level < 1 || level > 9)
        throw new Error("zlibDeflate: level 1..9 only");
    const d = new Deflater(data, level, opts.memLevel ?? 9, opts.strategy ?? Z_FILTERED);
    const run = () => (level <= 3 ? d.deflateFast() : d.deflateSlow());
    const chunk = opts.chunk ?? 0;
    if (chunk > 0) {
        while (d.end < data.length) {
            d.end = Math.min(data.length, d.end + chunk);
            if (d.end < data.length)
                run();
        }
    }
    else
        d.end = data.length;
    d.finishing = true;
    d.end = data.length;
    run();
    const levelFlags = level < 2 ? 0 : level < 6 ? 1 : level === 6 ? 2 : 3;
    let header = (0x78 << 8) | (levelFlags << 6);
    header += 31 - (header % 31);
    const body = d.out.subarray(0, d.outLen);
    const res = new Uint8Array(2 + body.length + 4);
    res[0] = header >> 8;
    res[1] = header & 0xff;
    res.set(body, 2);
    const ad = adler32(data);
    const o = 2 + body.length;
    res[o] = ad >>> 24;
    res[o + 1] = (ad >>> 16) & 0xff;
    res[o + 2] = (ad >>> 8) & 0xff;
    res[o + 3] = ad & 0xff;
    return res;
}

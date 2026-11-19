import type { PasswordDecoder, PasswordRecord } from "./types.js";
const BITS_PER_CHAR = 6;
const CODE_CHARS = 9;
const UNKNOWN_CHAR_VALUE = 45;
const KEY_ROTATE = 7;
const KEY_HALF = 16;
const AMOUNT_SHIFT_1 = 16;
const AMOUNT_SHIFT_2 = 256;
const HEALTH_FACTOR = 100;
const HEALTH_DIVISOR = 128;
const LEVEL_MASK = 63;
const ITEM_SLOTS = 5;
const CHECK_BYTES = 5;
const CHECK_BYTE_BITS = 8;
const CHECK_TAIL_BITS = 6;
export interface PasswordCodecLiteral {
    readonly code: string;
    readonly levelByte: number;
    readonly stores: {
        readonly alive: readonly number[];
        readonly items: readonly number[];
        readonly amounts: readonly number[] | null;
        readonly level_byte: number;
        readonly max_health_raw: number;
    };
}
export interface PasswordCodecField {
    readonly field: string;
    readonly bits: number;
    readonly count: number;
}
export interface PasswordCodecTables {
    readonly cells: readonly (readonly string[])[];
    readonly alphabet: string;
    readonly permutation: readonly number[];
    readonly keyStart: number;
    readonly keyBytes: number;
    readonly bitLayout: readonly PasswordCodecField[];
    readonly amountTable: readonly number[];
    readonly levelValid: readonly number[];
    readonly literals: readonly PasswordCodecLiteral[];
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
function intList(v: unknown, n: number, what: string): number[] {
    if (!Array.isArray(v) || v.length !== n || !v.every(isInt))
        throw new Error(`password_codec.json: ${what} is not a list of ${n} integers`);
    return v as number[];
}
export function passwordCodecFrom(doc: unknown): PasswordCodecTables {
    const d = doc as {
        format?: unknown;
        name?: unknown;
        data?: Record<string, unknown>;
    } | null;
    if (!d || typeof d !== "object")
        throw new Error("password_codec.json: not an object");
    if (d.format !== "zt-data/1")
        throw new Error(`password_codec.json: format ${String(d.format)}, expected zt-data/1`);
    if (d.name !== "password_codec")
        throw new Error(`password_codec.json: name ${String(d.name)}, expected password_codec`);
    const data = d.data;
    if (!data || typeof data !== "object")
        throw new Error("password_codec.json: no data object");
    const cells = data.cells;
    if (!Array.isArray(cells) || cells.length !== 9 || !cells.every((r) => Array.isArray(r) && r.length === 8 && r.every((c) => typeof c === "string"))) {
        throw new Error("password_codec.json: cells is not 9 rows of 8 strings");
    }
    const alphabet = data.alphabet;
    if (typeof alphabet !== "string" || alphabet.length !== 64)
        throw new Error("password_codec.json: alphabet is not a string of 64 characters");
    const permutation = intList(data.permutation, 54, "permutation");
    const key = data.key as {
        start?: unknown;
        bytes?: unknown;
    } | undefined;
    if (!key || !isInt(key.start) || !isInt(key.bytes))
        throw new Error("password_codec.json: key.start / key.bytes missing");
    const layout = data.bit_layout;
    if (!Array.isArray(layout) || layout.length === 0 || !layout.every((f) => f && typeof f.field === "string" && isInt(f.bits) && isInt(f.count))) {
        throw new Error("password_codec.json: bit_layout is malformed");
    }
    const amountTable = intList(data.amount_table, 15, "amount_table");
    const levelValid = intList(data.level_valid, 64, "level_valid");
    const lits = data.literals;
    if (!Array.isArray(lits) || lits.length === 0)
        throw new Error("password_codec.json: literals missing");
    const literals: PasswordCodecLiteral[] = lits.map((l, i) => {
        const s = l?.stores;
        if (!l || typeof l.code !== "string" || !isInt(l.level_byte) || !s)
            throw new Error(`password_codec.json: literals[${i}] is malformed`);
        if (!isInt(s.level_byte) || !isInt(s.max_health_raw))
            throw new Error(`password_codec.json: literals[${i}].stores level_byte / max_health_raw`);
        const amounts = s.amounts === null ? null : intList(s.amounts, ITEM_SLOTS, `literals[${i}].stores.amounts`);
        return {
            code: l.code,
            levelByte: l.level_byte,
            stores: {
                alive: intList(s.alive, ITEM_SLOTS, `literals[${i}].stores.alive`),
                items: intList(s.items, ITEM_SLOTS, `literals[${i}].stores.items`),
                amounts,
                level_byte: s.level_byte,
                max_health_raw: s.max_health_raw,
            },
        };
    });
    return Object.freeze({
        cells: cells as string[][],
        alphabet,
        permutation,
        keyStart: key.start,
        keyBytes: key.bytes,
        bitLayout: layout as PasswordCodecField[],
        amountTable,
        levelValid,
        literals,
    });
}
export function floorOfLevelByte(b: number): number {
    return b & 15;
}
export function episodeOfLevelByte(b: number): number {
    return (b >> 4) & 3;
}
export function decodePassword(tables: PasswordCodecTables, code: string, amountsBefore: readonly number[]): PasswordRecord | null {
    for (const lit of tables.literals) {
        if (code === lit.code) {
            return {
                alive: [...lit.stores.alive],
                items: [...lit.stores.items],
                amounts: [...(lit.stores.amounts ?? amountsBefore)],
                max_health: lit.stores.max_health_raw,
                level_byte: lit.stores.level_byte,
            };
        }
    }
    if (code.length !== CODE_CHARS)
        return null;
    const nBits = BITS_PER_CHAR * CODE_CHARS;
    const nBytes = tables.keyBytes;
    const bytes = new Array<number>(nBytes).fill(0);
    for (let i = 0; i < CODE_CHARS; i++) {
        const p = tables.alphabet.indexOf(code[i]!);
        const v = p < 0 ? UNKNOWN_CHAR_VALUE : p;
        for (let b = 0; b < BITS_PER_CHAR; b++) {
            const j = BITS_PER_CHAR * i + b;
            bytes[j >> 3] = bytes[j >> 3]! | (((v >> b) & 1) << (j & 7));
        }
    }
    let k = tables.keyStart >>> 0;
    for (let n = 0; n < nBytes; n++) {
        bytes[n] = (bytes[n]! ^ (k & 255)) & 255;
        k = ((k >>> KEY_ROTATE) | (k << (32 - KEY_ROTATE))) >>> 0;
        k = ((k << KEY_HALF) | (k >>> KEY_HALF)) >>> 0;
    }
    const d: number[] = [];
    for (let j = 0; j < nBits; j++)
        d.push((bytes[j >> 3]! >> (j & 7)) & 1);
    const s = tables.permutation.map((p) => d[p]!);
    let pos = 0;
    const fields = new Map<string, number[]>();
    for (const f of tables.bitLayout) {
        const vals: number[] = [];
        for (let c = 0; c < f.count; c++) {
            let v = 0;
            for (let b = 0; b < f.bits; b++)
                v |= s[pos + b]! << b;
            pos += f.bits;
            vals.push(v);
        }
        fields.set(f.field, vals);
    }
    const get = (name: string): number[] => {
        const v = fields.get(name);
        if (!v)
            throw new Error(`password_codec.json: bit_layout has no field ${name}`);
        return v;
    };
    const alive = get("alive");
    const mask = get("item_mask")[0]!;
    const amountRaw = get("amount_raw");
    const healthRaw = get("max_health_raw")[0]!;
    const levelRaw = get("level_raw")[0]!;
    const items: number[] = [];
    const maskBits = tables.bitLayout.find((f) => f.field === "item_mask")!.bits;
    for (let i = 0; i < maskBits; i++)
        if ((mask >> i) & 1)
            items.push(i + 1);
    if (items.length > ITEM_SLOTS)
        return null;
    while (items.length < ITEM_SLOTS)
        items.push(0);
    let at = 0;
    const sub = (width: number): number => {
        let v = 0;
        for (let b = 0; b < width; b++)
            v |= s[at + b]! << b;
        at += width;
        return v;
    };
    let sum = 0;
    for (let i = 0; i < CHECK_BYTES; i++)
        sum += sub(CHECK_BYTE_BITS);
    sum += sub(CHECK_TAIL_BITS);
    if ((sum & 255) !== sub(CHECK_BYTE_BITS))
        return null;
    const amounts = items.map((id, i) => Math.floor(Math.floor(((2 * amountRaw[i]! + 1) * tables.amountTable[id]!) / AMOUNT_SHIFT_1) / AMOUNT_SHIFT_2));
    const maxHealth = Math.floor(((2 * healthRaw + 1) * HEALTH_FACTOR) / HEALTH_DIVISOR);
    const levelByte = (levelRaw + 1) & 255;
    if (tables.levelValid[levelByte & LEVEL_MASK] === 0)
        return null;
    return { alive: [...alive], items, amounts, max_health: maxHealth, level_byte: levelByte };
}
export interface PasswordEncodeInput {
    readonly alive: readonly number[];
    readonly items: readonly number[];
    readonly amounts: readonly number[];
    readonly levelByte: number;
}
function layoutField(tables: PasswordCodecTables, name: string): PasswordCodecField {
    const f = tables.bitLayout.find((x) => x.field === name);
    if (!f)
        throw new Error(`password_codec.json: bit_layout has no field ${name}`);
    return f;
}
export function encodePassword(tables: PasswordCodecTables, rec: PasswordEncodeInput): string {
    const alive = layoutField(tables, "alive");
    const maskF = layoutField(tables, "item_mask");
    const amtF = layoutField(tables, "amount_raw");
    const hpF = layoutField(tables, "max_health_raw");
    const lvF = layoutField(tables, "level_raw");
    const slots: Array<{
        id: number;
        amount: number;
    }> = [];
    for (let i = 0; i < rec.items.length; i++)
        if (rec.items[i]! > 0)
            slots.push({ id: rec.items[i]!, amount: rec.amounts[i] ?? 0 });
    slots.sort((a, b) => a.id - b.id);
    if (slots.length > ITEM_SLOTS)
        throw new Error("encodePassword: more than five items");
    let mask = 0;
    for (const s of slots)
        mask |= 1 << (s.id - 1);
    const decoded = (raw: number, id: number): number => Math.floor(Math.floor(((2 * raw + 1) * tables.amountTable[id]!) / AMOUNT_SHIFT_1) / AMOUNT_SHIFT_2);
    const amountRaw: number[] = [];
    for (let i = 0; i < amtF.count; i++) {
        const s = slots[i];
        let raw = 0;
        if (s)
            for (let r = 0; r < 1 << amtF.bits; r++)
                if (decoded(r, s.id) <= s.amount)
                    raw = r;
        amountRaw.push(raw);
    }
    const values: Record<string, number[]> = {
        alive: Array.from({ length: alive.count }, (_, i) => (rec.alive[i] ? 1 : 0)),
        item_mask: [mask],
        amount_raw: amountRaw,
        max_health_raw: [(1 << hpF.bits) - 1],
        level_raw: [(rec.levelByte - 1) & ((1 << lvF.bits) - 1)],
    };
    const s: number[] = [];
    for (const f of tables.bitLayout) {
        const vals = values[f.field];
        if (!vals)
            throw new Error(`encodePassword: no value for the layout field ${f.field}`);
        for (let c = 0; c < f.count; c++)
            for (let b = 0; b < f.bits; b++)
                s.push((vals[c]! >> b) & 1);
    }
    let at = 0;
    const sub = (width: number): number => {
        let v = 0;
        for (let b = 0; b < width; b++)
            v |= (s[at + b] ?? 0) << b;
        at += width;
        return v;
    };
    let sum = 0;
    for (let i = 0; i < CHECK_BYTES; i++)
        sum += sub(CHECK_BYTE_BITS);
    sum += sub(CHECK_TAIL_BITS);
    for (let b = 0; b < CHECK_BYTE_BITS; b++)
        s.push(((sum & 255) >> b) & 1);
    const nBits = BITS_PER_CHAR * CODE_CHARS;
    if (s.length !== nBits)
        throw new Error(`encodePassword: ${s.length} bits, expected ${nBits}`);
    const d = new Array<number>(nBits).fill(0);
    tables.permutation.forEach((p, j) => {
        d[p] = s[j]!;
    });
    const bytes = new Array<number>(tables.keyBytes).fill(0);
    for (let j = 0; j < nBits; j++)
        bytes[j >> 3] = bytes[j >> 3]! | (d[j]! << (j & 7));
    let k = tables.keyStart >>> 0;
    for (let n = 0; n < tables.keyBytes; n++) {
        bytes[n] = (bytes[n]! ^ (k & 255)) & 255;
        k = ((k >>> KEY_ROTATE) | (k << (32 - KEY_ROTATE))) >>> 0;
        k = ((k << KEY_HALF) | (k >>> KEY_HALF)) >>> 0;
    }
    let out = "";
    for (let i = 0; i < CODE_CHARS; i++) {
        let v = 0;
        for (let b = 0; b < BITS_PER_CHAR; b++) {
            const j = BITS_PER_CHAR * i + b;
            v |= ((bytes[j >> 3]! >> (j & 7)) & 1) << b;
        }
        out += tables.alphabet[v]!;
    }
    return out;
}
export function makeDecoder(tables: PasswordCodecTables): PasswordDecoder {
    return (code, amountsBefore) => decodePassword(tables, code, amountsBefore);
}

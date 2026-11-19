import type { RendConstants } from "./constants.js";
export interface TexturePixels {
    readonly width: number;
    readonly height: number;
    readonly pixels: Uint8Array;
}
export interface RendAssets {
    readonly textures: Uint8Array;
    readonly textureCount: number;
    readonly lut: (set: number, band: number) => Uint8Array | null;
    readonly laneArt: (mode: number) => Uint8Array | null;
    readonly cramOf: (episode: number, night?: boolean) => number[];
    readonly nightLaneArt: Uint8Array | null;
}
export interface RendAssetsDoc {
    readonly format: typeof REND_ASSETS_DOC_FORMAT;
    readonly textures_b64: string;
    readonly texture_count: number;
    readonly luts: Readonly<Record<string, readonly number[]>>;
    readonly lane_art: ReadonlyArray<readonly number[] | null>;
    readonly maze_palette_alt: readonly number[];
    readonly maze_palette_default: readonly number[];
    readonly night_lane_art?: readonly number[] | null;
    readonly maze_nightvision_alt?: readonly number[] | null;
    readonly maze_nightvision_default?: readonly number[] | null;
}
export const REND_ASSETS_DOC_FORMAT = "zt-rend-assets/1";
export const PALETTES_FORMAT = "ztassets-palettes/1";
export const TEXTURES_FORMAT = "ztassets-textures/1";
export const MAZE_PALETTE_ALT = "maze_normal_a";
export const MAZE_PALETTE_DEFAULT = "maze_normal_b";
export const NIGHT_PALETTE_ALT = "maze_nightvision_a";
export const NIGHT_PALETTE_DEFAULT = "maze_nightvision_b";
const NIGHT_CMD = "py -3 -m tools.ztassets palettes <image> --out ztassets_out";
const LUT_KIND_WALL = "wall";
interface PalettesDoc {
    format?: unknown;
    palettes?: Array<{
        name?: unknown;
        colors?: Array<{
            index?: unknown;
            bgr333?: unknown;
        }>;
    }>;
    shade_luts?: Array<{
        kind?: unknown;
        set?: unknown;
        band?: unknown;
        map?: unknown;
    }>;
    render_modes?: Array<{
        mode?: unknown;
        floor_ceiling_art?: {
            bytes?: unknown;
        };
    }>;
    night_vision_render?: {
        floor_ceiling_art?: {
            bytes?: unknown;
        };
    };
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
function isByteList(v: unknown, n: number): v is number[] {
    return Array.isArray(v) && v.length === n && v.every((b) => isInt(b) && b >= 0 && b <= 255);
}
function paletteWords(d: PalettesDoc, name: string, lines: number, perLine: number): number[] {
    const p = d.palettes?.find((x) => x.name === name);
    if (!p || !Array.isArray(p.colors))
        throw new Error(`palettes.json: no palette table ${name}`);
    const n = lines * perLine;
    if (p.colors.length !== n)
        throw new Error(`palettes.json: ${name} has ${p.colors.length} entries, expected ${n}`);
    return p.colors.map((c, i) => {
        if (c.index !== i || typeof c.bgr333 !== "string" || !/^0x[0-9A-Fa-f]{1,4}$/.test(c.bgr333))
            throw new Error(`palettes.json: ${name} entry ${i} has no bgr333 word`);
        return parseInt(c.bgr333, 16);
    });
}
function textureColumns(t: number, img: TexturePixels, C: RendConstants, out: Uint8Array, base: number): void {
    const size = C.TEX_SIZE;
    const cols = C.TEX_COLUMNS;
    if (img.width !== cols * 2 || img.height !== size)
        throw new Error(`texture ${t}: ${img.width} x ${img.height} pixels, expected ${cols * 2} x ${size}`);
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < size; r++) {
            const left = img.pixels[r * img.width + 2 * c]!;
            const right = img.pixels[r * img.width + 2 * c + 1]!;
            if (left > 15 || right > 15)
                throw new Error(`texture ${t}: a pixel above 15 at row ${r}`);
            out[base + c * size + r] = (left << 4) | right;
        }
    }
}
export function rendAssetsFrom(palettesDoc: unknown, textures: readonly TexturePixels[], C: RendConstants): RendAssets & {
    readonly doc: RendAssetsDoc;
} {
    const d = palettesDoc as PalettesDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("palettes.json: not an object");
    if (d.format !== PALETTES_FORMAT)
        throw new Error(`palettes.json: format ${String(d.format)}, expected ${PALETTES_FORMAT}`);
    const perTexture = C.TEX_COLUMNS * C.TEX_SIZE;
    const tex = new Uint8Array(textures.length * perTexture);
    textures.forEach((img, t) => textureColumns(t, img, C, tex, t * perTexture));
    if (!Array.isArray(d.shade_luts))
        throw new Error("palettes.json: no shade_luts");
    const luts: Record<string, number[]> = {};
    for (const l of d.shade_luts) {
        if (l.kind !== LUT_KIND_WALL)
            continue;
        if (!isInt(l.set) || !isInt(l.band) || !isByteList(l.map, 256))
            throw new Error("palettes.json: a wall shade LUT without set, band or a 256-byte map");
        luts[`${l.set}:${l.band}`] = l.map;
    }
    for (const set of new Set(C.WALL_LUT_SET_BY_MODE.filter((s) => s !== 0))) {
        for (let band = 1; band <= C.SHADE_BANDS; band++) {
            if (!luts[`${set}:${band}`])
                throw new Error(`palettes.json: no wall shade LUT of set ${set}, band ${band}`);
        }
    }
    if (!Array.isArray(d.render_modes))
        throw new Error("palettes.json: no render_modes");
    const laneBytes = 2 * C.VIEW_ROWS;
    const lanes: Array<number[] | null> = [];
    for (let m = 0; m <= C.MODE_MAX; m++) {
        const rm = d.render_modes.find((x) => x.mode === m);
        const bytes = rm?.floor_ceiling_art?.bytes;
        if (bytes === undefined) {
            lanes.push(null);
            continue;
        }
        if (!isByteList(bytes, laneBytes))
            throw new Error(`palettes.json: render mode ${m}: floor_ceiling_art.bytes is not ${laneBytes} bytes`);
        lanes.push(bytes);
    }
    const lines = 4;
    const perLine = 16;
    const alt = paletteWords(d, MAZE_PALETTE_ALT, lines, perLine);
    const def = paletteWords(d, MAZE_PALETTE_DEFAULT, lines, perLine);
    const nightBytes = d.night_vision_render?.floor_ceiling_art?.bytes;
    if (nightBytes === undefined)
        throw new Error(`palettes.json: no night_vision_render.floor_ceiling_art; run the extractor again: ${NIGHT_CMD}`);
    if (!isByteList(nightBytes, laneBytes))
        throw new Error(`palettes.json: night_vision_render.floor_ceiling_art.bytes is not ${laneBytes} bytes`);
    const nightTable = (name: string): number[] => {
        if (!d.palettes?.some((x) => x.name === name))
            throw new Error(`palettes.json: no palette table ${name}; run the extractor again: ${NIGHT_CMD}`);
        return paletteWords(d, name, lines, perLine);
    };
    const nightAlt = nightTable(NIGHT_PALETTE_ALT);
    const nightDef = nightTable(NIGHT_PALETTE_DEFAULT);
    const doc: RendAssetsDoc = Object.freeze({
        format: REND_ASSETS_DOC_FORMAT,
        textures_b64: bytesToBase64(tex),
        texture_count: textures.length,
        luts: Object.freeze(luts),
        lane_art: Object.freeze(lanes),
        maze_palette_alt: Object.freeze(alt),
        maze_palette_default: Object.freeze(def),
        night_lane_art: Object.freeze(nightBytes),
        maze_nightvision_alt: Object.freeze(nightAlt),
        maze_nightvision_default: Object.freeze(nightDef),
    });
    return Object.freeze({ ...rendAssetsFromDoc(doc, C), doc });
}
export function rendAssetsFromDoc(doc: RendAssetsDoc, C: RendConstants): RendAssets {
    if (doc.format !== REND_ASSETS_DOC_FORMAT)
        throw new Error(`rend assets: format ${String(doc.format)}, expected ${REND_ASSETS_DOC_FORMAT}`);
    const textures = base64ToBytes(doc.textures_b64);
    const perTexture = C.TEX_COLUMNS * C.TEX_SIZE;
    if (textures.length !== doc.texture_count * perTexture)
        throw new Error(`rend assets: ${textures.length} texture bytes for ${doc.texture_count} textures`);
    const luts = new Map<string, Uint8Array>();
    for (const [k, v] of Object.entries(doc.luts))
        luts.set(k, Uint8Array.from(v));
    const lanes = doc.lane_art.map((l) => (l ? Uint8Array.from(l) : null));
    const mask = (w: number): number => w & C.CRAM_MASK;
    const altMasked = doc.maze_palette_alt.map(mask);
    const defMasked = doc.maze_palette_default.map(mask);
    const nightAlt = doc.maze_nightvision_alt ? doc.maze_nightvision_alt.map(mask) : null;
    const nightDef = doc.maze_nightvision_default ? doc.maze_nightvision_default.map(mask) : null;
    return Object.freeze({
        textures,
        textureCount: doc.texture_count,
        lut: (set: number, band: number) => luts.get(`${set}:${band}`) ?? null,
        laneArt: (mode: number) => lanes[mode] ?? null,
        nightLaneArt: doc.night_lane_art ? Uint8Array.from(doc.night_lane_art) : null,
        cramOf: (episode: number, night?: boolean) => {
            if (night === true) {
                const t = episode === C.EPISODE_ALT_PALETTE ? nightAlt : nightDef;
                if (!t)
                    throw new Error(`rend assets: no night vision palette table in this bundle; run the extractor again: ${NIGHT_CMD}`);
                return t.slice();
            }
            return (episode === C.EPISODE_ALT_PALETTE ? altMasked : defMasked).slice();
        },
    });
}
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function bytesToBase64(b: Uint8Array): string {
    let s = "";
    for (let i = 0; i < b.length; i += 3) {
        const n = (b[i]! << 16) | ((i + 1 < b.length ? b[i + 1]! : 0) << 8) | (i + 2 < b.length ? b[i + 2]! : 0);
        s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < b.length ? B64[(n >> 6) & 63]! : "=") + (i + 2 < b.length ? B64[n & 63]! : "=");
    }
    return s;
}
export function base64ToBytes(s: string): Uint8Array {
    const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
    const out: number[] = [];
    for (let i = 0; i < clean.length; i += 4) {
        const q = [0, 1, 2, 3].map((k) => (i + k < clean.length ? B64.indexOf(clean[i + k]!) : -1));
        const n = ((q[0]! & 63) << 18) | ((q[1]! & 63) << 12) | ((q[2]! < 0 ? 0 : q[2]!) << 6) | (q[3]! < 0 ? 0 : q[3]!);
        out.push((n >> 16) & 255);
        if (q[2]! >= 0)
            out.push((n >> 8) & 255);
        if (q[3]! >= 0)
            out.push(n & 255);
    }
    return Uint8Array.from(out);
}

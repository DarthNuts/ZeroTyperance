import type { PlaneSize, ScreenPlane, ScreenPlaneFull, ScreenPlaneView, ScreenSprite, ScreenState } from "../screen_types.js";
import type { TileBlock } from "./assets.js";
import { sha256Hex } from "./sha256.js";
export const TILE_PIXELS = 8;
export const PATTERN_BYTES = 32;
export const PALETTE_LINES = 4;
export const LINE_ENTRIES = 16;
export const PALETTE_ENTRIES = PALETTE_LINES * LINE_ENTRIES;
export const VIEW_ROWS = 29;
export const VIEW_COLS = 41;
export const SCREEN_LINES = 224;
export const SLOT_BITS = 11;
export const SLOT_COUNT = 1 << SLOT_BITS;
export const SLOT_MASK = SLOT_COUNT - 1;
export const VSCROLL_BITS = 10;
export const VSCROLL_MASK = (1 << VSCROLL_BITS) - 1;
export const SCROLL_MASK = VSCROLL_MASK;
export const BLUE_SHIFT = 9;
export const GREEN_SHIFT = 5;
export const RED_SHIFT = 1;
export const CHANNEL_BITS = 3;
const CHANNEL_FIELD = (1 << CHANNEL_BITS) - 1;
export function channelsOf(word: number): {
    r: number;
    g: number;
    b: number;
} {
    return {
        r: (word >> RED_SHIFT) & CHANNEL_FIELD,
        g: (word >> GREEN_SHIFT) & CHANNEL_FIELD,
        b: (word >> BLUE_SHIFT) & CHANNEL_FIELD,
    };
}
export function wordOf(r: number, g: number, b: number): number {
    return (b << BLUE_SHIFT) | (g << GREEN_SHIFT) | (r << RED_SHIFT);
}
export function cleanWord(word: number): number {
    const c = channelsOf(word);
    return wordOf(c.r, c.g, c.b);
}
export const DISPLAY_WIDTH = 320;
export const DISPLAY_HEIGHT = 224;
export const DISPLAY_BACKDROP = 0;
export const SPRITE_X = -128;
export const SPRITE_Y = -128;
export const SPRITE_ATTR = 0;
export function offScreenSprites(): ScreenSprite[] {
    return [{ x: SPRITE_X, y: SPRITE_Y, w: 1, h: 1, attr: SPRITE_ATTR }];
}
export class Plane {
    width: number;
    height: number;
    cells: Uint16Array;
    vscroll = 0;
    lineScroll: Uint16Array | null = null;
    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.cells = new Uint16Array(width * height);
    }
    resize(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.cells = new Uint16Array(width * height);
    }
    clear(): void {
        this.cells.fill(0);
    }
    writeCell(col: number, row: number, entry: number): void {
        this.cells[row * this.width + col] = entry & 0xffff;
    }
    cell(col: number, row: number): number {
        return this.cells[row * this.width + col]!;
    }
    setVScroll(pixels: number): void {
        this.vscroll = pixels & VSCROLL_MASK;
    }
    setLineScroll(values: ArrayLike<number>): void {
        if (values.length !== SCREEN_LINES)
            throw new Error(`line scroll table has ${values.length} entries, expected ${SCREEN_LINES}`);
        const t = new Uint16Array(SCREEN_LINES);
        for (let i = 0; i < SCREEN_LINES; i++)
            t[i] = values[i]! & SCROLL_MASK;
        this.lineScroll = t;
    }
    clearLineScroll(): void {
        this.lineScroll = null;
    }
    get fullForm(): boolean {
        return this.lineScroll !== null;
    }
    get oy(): number {
        return (this.vscroll >> 3) % this.height;
    }
    get fy(): number {
        return this.vscroll & (TILE_PIXELS - 1);
    }
}
export class VideoModel {
    readonly cram = new Uint16Array(PALETTE_ENTRIES);
    planeA: Plane;
    planeB: Plane;
    readonly patterns = new Uint8Array(SLOT_COUNT * PATTERN_BYTES);
    sprites: ScreenSprite[] = offScreenSprites();
    displayEnabled = true;
    private hashDirty = true;
    private hashCache = "";
    constructor(private readonly planeWidth: number, private readonly planeRows: number) {
        this.planeA = new Plane(planeWidth, planeRows);
        this.planeB = new Plane(planeWidth, planeRows);
    }
    powerOn(): void {
        this.cram.fill(0);
        this.planeA = new Plane(this.planeWidth, this.planeRows);
        this.planeB = new Plane(this.planeWidth, this.planeRows);
        this.patterns.fill(0);
        this.sprites = offScreenSprites();
        this.displayEnabled = true;
        this.hashDirty = true;
    }
    setColour(index: number, word: number): void {
        this.cram[index] = cleanWord(word);
    }
    setLine(line: number, words: ArrayLike<number>): void {
        for (let e = 0; e < LINE_ENTRIES; e++)
            this.setColour(line * LINE_ENTRIES + e, words[e] ?? 0);
    }
    clearPalette(): void {
        this.cram.fill(0);
    }
    resizePlanes(width: number, height: number): void {
        this.planeA.resize(width, height);
        this.planeB.resize(width, height);
        this.hashDirty = true;
    }
    writeCellA(col: number, row: number, entry: number): void {
        this.planeA.writeCell(col, row, entry);
        this.hashDirty = true;
    }
    writeCellB(col: number, row: number, entry: number): void {
        this.planeB.writeCell(col, row, entry);
        this.hashDirty = true;
    }
    setVScrollA(pixels: number): void {
        this.planeA.setVScroll(pixels);
        this.hashDirty = true;
    }
    setVScrollB(pixels: number): void {
        this.planeB.setVScroll(pixels);
        this.hashDirty = true;
    }
    setLineScroll(a: ArrayLike<number>, b: ArrayLike<number>): void {
        this.planeA.setLineScroll(a);
        this.planeB.setLineScroll(b);
        this.hashDirty = true;
    }
    clearPlaneA(): void {
        this.planeA.clear();
        this.hashDirty = true;
    }
    clearPlanes(): void {
        this.planeA.clear();
        this.planeB.clear();
        this.hashDirty = true;
    }
    setSprites(list: readonly ScreenSprite[]): void {
        this.sprites = list.length ? list.map((s) => ({ ...s })) : offScreenSprites();
        this.hashDirty = true;
    }
    clearPatterns(): void {
        this.patterns.fill(0);
        this.hashDirty = true;
    }
    load(firstSlot: number, block: TileBlock): void {
        if (firstSlot + block.count > SLOT_COUNT)
            throw new Error(`tile block ${block.name}: slots ${firstSlot}..${firstSlot + block.count - 1} beyond the store`);
        this.patterns.set(block.patterns.subarray(0, block.count * PATTERN_BYTES), firstSlot * PATTERN_BYTES);
        this.hashDirty = true;
    }
    pattern(slot: number): Uint8Array {
        return this.patterns.subarray(slot * PATTERN_BYTES, (slot + 1) * PATTERN_BYTES);
    }
    view(plane: Plane): ScreenPlaneView {
        const ox = 0;
        const oy = plane.oy;
        const cells: number[][] = [];
        for (let r = 0; r < VIEW_ROWS; r++) {
            const y = (oy + r) % plane.height;
            const row: number[] = new Array<number>(VIEW_COLS);
            for (let c = 0; c < VIEW_COLS; c++)
                row[c] = plane.cells[y * plane.width + ((ox + c) % plane.width)]!;
            cells.push(row);
        }
        return { ox, oy, fx: 0, fy: plane.fy, cells };
    }
    full(plane: Plane): ScreenPlaneFull {
        if (!plane.lineScroll)
            throw new Error("the plane has no per-line scroll table");
        const cells: number[][] = [];
        for (let r = 0; r < plane.height; r++)
            cells.push(Array.from(plane.cells.subarray(r * plane.width, (r + 1) * plane.width)));
        return { w: plane.width as PlaneSize, h: plane.height as PlaneSize, hscroll: Array.from(plane.lineScroll), vscroll: plane.vscroll, cells };
    }
    planeState(plane: Plane): ScreenPlane {
        return plane.fullForm ? this.full(plane) : this.view(plane);
    }
    private computeHash(a: ScreenPlane, b: ScreenPlane, sprites: readonly ScreenSprite[]): string {
        if (!this.hashDirty)
            return this.hashCache;
        const used = new Uint8Array(SLOT_COUNT);
        for (const v of [a, b])
            for (const row of v.cells)
                for (const e of row)
                    used[e & SLOT_MASK] = 1;
        for (const s of sprites)
            for (let i = 0; i < s.w * s.h; i++)
                used[((s.attr & SLOT_MASK) + i) & SLOT_MASK] = 1;
        let n = 0;
        for (let s = 0; s < SLOT_COUNT; s++)
            n += used[s]!;
        const bytes = new Uint8Array(n * PATTERN_BYTES);
        let at = 0;
        for (let s = 0; s < SLOT_COUNT; s++) {
            if (!used[s])
                continue;
            bytes.set(this.pattern(s), at);
            at += PATTERN_BYTES;
        }
        this.hashCache = sha256Hex(bytes);
        this.hashDirty = false;
        return this.hashCache;
    }
    state(): ScreenState {
        const a = this.planeState(this.planeA);
        const b = this.planeState(this.planeB);
        const sprites: ScreenSprite[] = this.sprites.map((s) => ({ ...s }));
        return {
            display: { enabled: this.displayEnabled, width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT, backdrop: DISPLAY_BACKDROP },
            cram: Array.from(this.cram),
            a,
            b,
            sprites,
            patterns_sha256: this.computeHash(a, b, sprites),
        };
    }
}

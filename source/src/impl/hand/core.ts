import type { ScreenDisplay } from "../screen_types.js";
import type { GunRow, HandConstants } from "./constants.js";
import type { HandAssets, HandGraphic, HandInputs, HandPicture, HandSprite, HandState } from "./types.js";
import { GLOW, glowSprite, type GlowView } from "./glow.js";
const CRAM_LINE_ENTRIES = 16;
const CRAM_ENTRIES = 64;
const TILE_BYTES = 32;
const WORD_MASK = 0xffff;
const PART_MAIN = "main";
const PART_EFFECT = "effect";
export function handStart(): HandState {
    return { list: [], loaded: null, window: null };
}
function graphicNamed(assets: HandAssets, name: string): HandGraphic {
    const g = assets.graphics.get(name);
    if (!g)
        throw new Error(`hand: no graphic named ${name} in the extractor's output`);
    return g;
}
function load(state: HandState, name: string, assets: HandAssets, C: HandConstants): void {
    const g = graphicNamed(assets, name);
    if (g.tiles.length < C.WINDOW_TILES)
        throw new Error(`hand: graphic ${name} holds ${g.tiles.length} tiles, the window needs ${C.WINDOW_TILES}`);
    state.window = g.tiles.slice(0, C.WINDOW_TILES).map((t) => Uint8Array.from(t));
    state.loaded = name;
}
function partOf(g: HandGraphic, name: string) {
    const p = g.parts.find((x) => x.name === name);
    if (!p)
        throw new Error(`hand: graphic ${g.name} has no ${name} part`);
    return p;
}
export function handIteration(state: HandState, line: HandInputs, prev: HandInputs, assets: HandAssets, C: HandConstants, view: GlowView | null = null): void {
    const list: HandSprite[] = [];
    state.list = list;
    const cur = line.current;
    if (cur !== prev.current) {
        const name = assets.graphicOfWeapon.get(cur);
        if (name === undefined)
            throw new Error(`hand: no graphic for weapon ${cur}`);
        load(state, name, assets, C);
        return;
    }
    if (C.NO_HAND.includes(cur))
        return;
    const f = prev.anim === 0 && line.anim === C.FLASH_FRAME ? C.SHOT_START : prev.anim;
    const a = line.bob_angle;
    const e = line.bob_eye;
    const L = line.lowering;
    const gunName = assets.graphicOfWeapon.get(cur);
    const gun: GunRow | undefined = C.GUNS.find((r) => r.weapon === cur);
    if (gun) {
        if (gunName === undefined)
            throw new Error(`hand: no graphic for weapon ${cur}`);
        const g = graphicNamed(assets, gunName);
        const main = partOf(g, PART_MAIN);
        let recoil = 0;
        if (f !== 0) {
            const r = C.RECOIL[f];
            if (r === undefined)
                throw new Error(`hand: no recoil entry for frame ${f}`);
            recoil = r;
        }
        if (C.THROWN.includes(cur)) {
            if (f !== 0) {
                const s = assets.throwFrames[f - 1];
                if (!s)
                    throw new Error(`hand: no throw frame for the animation value ${f}`);
                list.push({ xWord: s.satX, yWord: s.satY, w: s.w, h: s.h, attr: s.attrWord });
                return;
            }
            const ty = gun.y + C.LOWER_PX * L + C.SWAY_Y * e;
            if ((ty & WORD_MASK) < C.THROW_HIDE_FROM)
                list.push({ xWord: gun.x + C.SWAY_X * a + gun.main_dx, yWord: ty, w: main.w, h: main.h, attr: main.attrWord });
            return;
        }
        const x = gun.x + C.SWAY_X * a + gun.main_dx + (C.RECOIL_SIDEWAYS.includes(cur) ? recoil : 0);
        const y = gun.y + C.LOWER_PX * L + C.SWAY_Y * e + recoil;
        list.push({ xWord: x, yWord: y, w: main.w, h: main.h, attr: main.attrWord });
        if (C.PUFF.includes(cur)) {
            if (line.anim !== 0 && gun.flash_dx !== null && gun.flash_dy !== null) {
                const fx = partOf(g, PART_EFFECT);
                const flip = (line.anim & 1 ? C.PUFF_HFLIP : 0) + (line.anim & 2 ? C.PUFF_VFLIP : 0);
                list.push({ xWord: x + gun.flash_dx, yWord: y + gun.flash_dy + C.PUFF_STEP * line.anim, w: fx.w, h: fx.h, attr: fx.attrWord + flip });
            }
            return;
        }
        if (line.anim === C.FLASH_FRAME && gun.flash_dx !== null && gun.flash_dy !== null) {
            const fx = partOf(g, PART_EFFECT);
            list.push({ xWord: x + gun.flash_dx, yWord: y + gun.flash_dy, w: fx.w, h: fx.h, attr: fx.attrWord });
        }
        if (view !== null && gunName === GLOW.GRAPHIC) {
            const glow = glowSprite(view, a, f, C);
            if (glow !== null)
                list.push(glow);
        }
        return;
    }
    if (C.FISTS.includes(cur)) {
        if (gunName === undefined)
            throw new Error(`hand: no graphic for weapon ${cur}`);
        if (f === 0) {
            const main = partOf(graphicNamed(assets, gunName), PART_MAIN);
            const lx = C.FIST_X + C.SWAY_X * a;
            const ly = C.FIST_Y + C.LOWER_PX * L + C.SWAY_Y * e;
            const ry = C.FIST_Y + C.LOWER_PX * L - C.SWAY_Y * e;
            if (ly < C.FIST_HIDE_FROM)
                list.push({ xWord: lx, yWord: ly, w: main.w, h: main.h, attr: main.attrWord });
            if (ry < C.FIST_HIDE_FROM)
                list.push({ xWord: lx + C.FIST_GAP, yWord: ry, w: main.w, h: main.h, attr: main.attrWord + C.FIST_FLIP });
            return;
        }
        const row = assets.swings.get(line.variant);
        if (!row)
            throw new Error(`hand: no swing row for variant ${line.variant}`);
        const long = line.variant < C.LONG_BELOW;
        let frame: number;
        if (long) {
            if (f === C.KICK_AT) {
                load(state, row.art, assets, C);
                return;
            }
            if (f === C.RESTORE_AT) {
                load(state, gunName, assets, C);
                return;
            }
            frame = f - (C.KICK_AT + 1);
        }
        else {
            frame = f - C.SHOT_START;
        }
        const sprites = row.frames[frame];
        if (!sprites || frame < 0)
            throw new Error(`hand: swing variant ${line.variant} has no picture for frame ${f}`);
        for (const s of sprites)
            list.push({ xWord: s.satX, yWord: s.satY, w: s.w, h: s.h, attr: s.attrWord });
        return;
    }
    throw new Error(`hand: weapon ${cur} has no picture rule`);
}
export function handRecordStart(state: HandState, line: HandInputs, assets: HandAssets, C: HandConstants, view: GlowView | null = null): void {
    const name = assets.graphicOfWeapon.get(line.current);
    if (name === undefined)
        return;
    load(state, name, assets, C);
    if (line.lowering !== 0)
        return;
    const rest: HandInputs = { ...line, bob_angle: 0, bob_eye: 0 };
    const prevAnim = line.anim === 0 || line.anim === C.FLASH_FRAME ? 0 : line.anim - C.SHOT_START;
    if (C.FISTS.includes(line.current) && line.variant < C.LONG_BELOW && prevAnim > C.KICK_AT && prevAnim <= C.RESTORE_AT) {
        const row = assets.swings.get(line.variant);
        if (row)
            load(state, prevAnim === C.RESTORE_AT ? name : row.art, assets, C);
    }
    handIteration(state, rest, { ...rest, anim: prevAnim }, assets, C, view);
}
export function handPicture(state: HandState, assets: HandAssets, C: HandConstants): HandPicture {
    const blank = (): number[][] => Array.from({ length: C.VIEW_ROWS }, () => new Array<number>(C.VIEW_COLS).fill(0));
    const cram = new Array<number>(CRAM_ENTRIES).fill(0);
    for (let i = 0; i < CRAM_LINE_ENTRIES; i++)
        cram[CRAM_LINE_ENTRIES * C.PALETTE_LINE + i] = (assets.cramWords[i] ?? 0) & C.COLOUR_MASK;
    const sprites = state.list
        .filter((s) => {
        const t = s.attr & C.TILE_MASK;
        return t >= C.FIRST_TILE && t < C.FIRST_TILE + C.WINDOW_TILES;
    })
        .map((s) => ({ x: (s.xWord & C.SPRITE_X_MASK) - C.SPRITE_ORIGIN, y: (s.yWord & C.SPRITE_Y_MASK) - C.SPRITE_ORIGIN, w: s.w, h: s.h, attr: s.attr }));
    return {
        display: { enabled: true, width: C.DISPLAY_W as ScreenDisplay["width"], height: C.DISPLAY_H as ScreenDisplay["height"], backdrop: C.BACKDROP },
        cram,
        a: { ox: 0, oy: 0, fx: 0, fy: 0, cells: blank() },
        b: { ox: 0, oy: 0, fx: 0, fy: 0, cells: blank() },
        sprites,
    };
}
export function handTile(state: HandState, index: number, C: HandConstants): Uint8Array {
    if (index >= C.FIRST_TILE && index < C.FIRST_TILE + C.WINDOW_TILES && state.window) {
        const t = state.window[index - C.FIRST_TILE];
        if (t)
            return Uint8Array.from(t);
    }
    return new Uint8Array(TILE_BYTES);
}

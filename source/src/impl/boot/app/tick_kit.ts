/// <reference lib="dom" />
import type { LcgParams } from "../../../rng.js";
import { setCorpseVectors } from "../../soldier/body.js";
import { ITEM_NAMES } from "../../../world.js";
import type { ItemName } from "../../../world.js";
import { TICK_BUNDLE_FORMAT } from "./tick_bundle.js";
import type { LevelStartPace, TickBundle } from "./tick_bundle.js";
import type { DemoRunDeps } from "./demo_run.js";
import { rendConstantsFrom } from "../../rend/constants.js";
import { trigFrom } from "../../rend/trig.js";
import { rendAssetsFromDoc } from "../../rend/assets.js";
import { skyConstantsFrom } from "../../rend/sky/constants.js";
import { skyAssetsFromDoc } from "../../rend/sky/assets.js";
import { skyClassOfEpisode } from "../../rend/sky/core.js";
import { soldierConstantsFrom, spriteConstantsFrom } from "../../rend/sprite/constants.js";
import { partnerConstantsFrom } from "../../rend/sprite/partner.js";
import { enemyKindsFrom } from "../../rend/sprite/kinds.js";
import { hydConstantsFrom } from "../../hydaca/constants.js";
import { flameConstantsFrom } from "../../flame/constants.js";
import { boss2ConstantsFrom, boss3ConstantsFrom, bossConstantsFrom } from "../../boss/constants.js";
import { dogConstantsFrom, impConstantsFrom, sergeantConstantsFrom, sfConstantsFrom } from "../../kinds/constants.js";
import { mineConstantsFrom } from "../../mine/constants.js";
import { cameraConstantsFrom } from "../../camera/constants.js";
import { ordnanceConstantsFrom } from "../../ordnance/constants.js";
import { extinguisherConstantsFrom } from "../../extinguisher/constants.js";
import { spriteAssetsFromDoc } from "../../rend/sprite/assets.js";
import type { ViewRecord } from "../../rend/core.js";
import { moveConstantsFrom } from "../../move/constants.js";
import { doorConstantsFrom } from "../../door/constants.js";
import { weaponConstantsFrom } from "../../weapon/constants.js";
import { hitConstantsFrom } from "../../player_hit/constants.js";
import { itemsDataFrom, messagesFrom, pickupConstantsFrom } from "../../pickup/constants.js";
import { liftConstantsFrom } from "../../lift/constants.js";
import { guardConstantsFrom } from "../../tick/guard.js";
import { lightConstantsFrom } from "../../tick/light.js";
import { startDataFrom } from "../../start/data.js";
import { hudConstantsFrom } from "../../hud/constants.js";
import type { HudConstants } from "../../hud/constants.js";
import { hudAssetsFrom } from "../../hud/assets.js";
import type { HudAssets } from "../../hud/assets.js";
import type { HudBundle } from "../../hud/bundle.js";
import { handConstantsFrom } from "../../hand/constants.js";
import type { HandConstants } from "../../hand/constants.js";
import { handAssetsFromDoc } from "../../hand/assets.js";
import type { HandAssets } from "../../hand/types.js";
import { TILE_SIZE } from "../../hud/words.js";
import { FLOOR_BYTES, FLOOR_COUNT, GRID_SIDE, OutsideSpecError } from "../../soldier/common.js";
import type { CellSource } from "../../soldier/common.js";
import type { TickEnv, TickState } from "../../tick/core.js";
import { pauseConstantsFrom } from "../../pause/constants.js";
import { pauseAssetsFrom } from "../../pause/assets_parse.js";
import { deathConstantsFrom } from "../../death/constants.js";
import { sniperConstantsFrom } from "../../sniper/constants.js";
import { modernConstantsFrom } from "../../modern/constants.js";
import { soundTableFrom } from "../../tick/sound.js";
import type { SoundEvent } from "../../tick/sound.js";
const MAPS_FORMAT = "ztassets-maps/1";
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
function blockClassTableOf(mapsDoc: unknown): number[] {
    const d = mapsDoc as {
        format?: unknown;
        blocks?: Array<{
            index?: unknown;
            props?: unknown;
        }>;
    } | null;
    if (!d || typeof d !== "object" || d.format !== MAPS_FORMAT || !Array.isArray(d.blocks))
        throw new Error("maps document: not a ztassets-maps/1 document with a blocks table");
    const table: number[] = [];
    for (const b of d.blocks) {
        if (!isInt(b.index) || b.index < 0 || !isInt(b.props))
            throw new Error("maps document: a block without index/props");
        while (table.length <= b.index)
            table.push(-1);
        table[b.index] = b.props;
    }
    return table;
}
function cellSourceOf(mapsDoc: unknown): CellSource {
    const doc = mapsDoc as {
        blocks?: Array<{
            index?: unknown;
            props?: unknown;
        }>;
        floors?: Array<{
            grid?: unknown;
        }>;
        meta?: {
            render_mode_by_floor?: unknown;
        };
    };
    if (!Array.isArray(doc.floors) || doc.floors.length !== FLOOR_COUNT)
        throw new Error(`maps document: ${String(doc.floors?.length)} floors, the storage holds ${FLOOR_COUNT}`);
    const storage = new Uint8Array(FLOOR_COUNT * FLOOR_BYTES);
    doc.floors.forEach((fl, f) => {
        const grid = fl.grid;
        if (!Array.isArray(grid) || grid.length !== GRID_SIDE)
            throw new Error(`maps document: floor ${f} has no ${GRID_SIDE}-row grid`);
        grid.forEach((row: unknown, r) => {
            if (!Array.isArray(row) || row.length !== GRID_SIDE)
                throw new Error(`maps document: floor ${f} row ${r} is not ${GRID_SIDE} cells`);
            row.forEach((b: unknown, c) => {
                if (!isInt(b) || b < 0 || b > 255)
                    throw new Error(`maps document: floor ${f} cell (${c}, ${r}) is not a block byte`);
                storage[f * FLOOR_BYTES + r * GRID_SIDE + c] = b;
            });
        });
    });
    if (!Array.isArray(doc.blocks))
        throw new Error("maps document: no blocks table");
    const classes = new Map<number, number>();
    for (const b of doc.blocks) {
        if (!isInt(b.index) || !isInt(b.props))
            throw new Error("maps document: a block without index/props");
        classes.set(b.index, b.props);
    }
    const modes = doc.meta?.render_mode_by_floor;
    if (!Array.isArray(modes) || !modes.every((m) => typeof m === "number"))
        throw new Error("maps document: meta.render_mode_by_floor is not a list of numbers");
    return {
        block(flatIndex: number, floor: number): number {
            const at = floor * FLOOR_BYTES + flatIndex;
            if (!Number.isInteger(at) || at < 0 || at >= storage.length) {
                throw new OutsideSpecError(`cell index ${flatIndex} of floor ${floor} lies outside the ${FLOOR_COUNT} floors' storage (7.4: not reached in play)`);
            }
            return storage[at]!;
        },
        classOf(block: number): number {
            const cls = classes.get(block);
            if (cls === undefined)
                throw new Error(`block ${block} is not in the blocks table`);
            return cls;
        },
        renderMode(floor: number): number {
            return (modes as number[])[floor] ?? 0;
        },
        markerBlock(cls: number): number {
            let lowest: number | null = null;
            for (const [index, props] of classes)
                if (props === cls && (lowest === null || index < lowest))
                    lowest = index;
            return lowest ?? 0;
        },
    };
}
export interface DemoPace {
    readonly name: string;
    readonly kind: "demo" | "new_game" | "password";
    readonly setupBlanks: number;
    readonly episode: number;
    readonly floor: number;
    readonly character: number;
    readonly vblanks: readonly number[];
    readonly guards: ReadonlyArray<ReadonlyArray<readonly [
        number,
        number
    ]> | null>;
    readonly pace: LevelStartPace | null;
}
export interface AttractKit {
    readonly envs: readonly TickEnv[];
    readonly HC: HudConstants;
    readonly hudAssets: HudAssets;
    readonly HAND: HandConstants;
    readonly handAssets: HandAssets;
    readonly demos: readonly DemoPace[];
    readonly lcg: LcgParams;
    readonly hostSeed: number;
    readonly vblanks: readonly number[];
    readonly screenW: number;
    readonly screenH: number;
    readonly viewX0: number;
    readonly viewY0: number;
    readonly notes: readonly string[];
    readonly pauseExit?: {
        readonly entryBlanks: number;
        readonly exitBlanks: number;
    } | null;
    readonly hdData?: unknown;
    readonly viewData?: unknown;
}
export function tickEnvsFrom(b: TickBundle): TickEnv[] {
    const M = moveConstantsFrom(b.data.move);
    const R = rendConstantsFrom(b.data.rend);
    const view = trigFrom(b.data.trig, M.ANGLE.UNITS);
    if (view.sin256.length !== trigFrom(b.data.trig, R.ANGLES).sin256.length)
        throw new Error("the move's view table and the renderer's trig table differ in length");
    const D = doorConstantsFrom(b.data.door);
    const W = weaponConstantsFrom(b.data.weapon);
    const SPR = spriteConstantsFrom(b.data.sprite);
    const ES = soldierConstantsFrom(b.data.soldier);
    const PARTNER = partnerConstantsFrom(b.data.sprite);
    setCorpseVectors(ES.CORPSE_VECTORS);
    const spriteAssets = spriteAssetsFromDoc(b.spriteAssets, SPR);
    const rendAssets = b.rendAssets === null ? null : rendAssetsFromDoc(b.rendAssets, R);
    const SKY = skyConstantsFrom(b.data.sky);
    const G = guardConstantsFrom(b.data.weapon);
    const LIGHT = lightConstantsFrom(b.data.weapon);
    const HYD = hydConstantsFrom(b.data.hydaca);
    const FLAME = flameConstantsFrom(b.data.flame);
    const BOSS = bossConstantsFrom(b.data.boss);
    const MINE = mineConstantsFrom(b.data.mine);
    const H = hitConstantsFrom(b.data.hit);
    const P = pickupConstantsFrom(b.data.pickup);
    const items = itemsDataFrom(b.data.items, b.data.pickupMessages ?? null);
    const texts = b.data.messages ? messagesFrom(b.data.messages) : null;
    const L = liftConstantsFrom(b.data.lift);
    const start = startDataFrom(b.data.loadouts, b.data.items, b.data.demoInputs);
    const kinds = enemyKindsFrom(b.data.enemyDescriptors);
    const sounds = soundTableFrom(b.data.soundTable);
    const itemsDoc = b.data.items as {
        data?: {
            items?: Array<{
                id?: unknown;
                cap?: unknown;
                name?: unknown;
            }>;
        };
    };
    const itemCaps = new Map<number, number>();
    const itemNames = new Map<number, ItemName>();
    for (const it of itemsDoc.data?.items ?? []) {
        if (typeof it.id !== "number")
            continue;
        if (typeof it.cap === "number")
            itemCaps.set(it.id, it.cap);
        const name = typeof it.name === "string" ? it.name.toLowerCase().replace(/ /g, "_") : "";
        if ((ITEM_NAMES as readonly string[]).includes(name))
            itemNames.set(it.id, name as ItemName);
    }
    return b.episodes.map((ep, episode) => {
        const className = skyClassOfEpisode(episode, SKY);
        const sky = className !== null && ep.sky !== null ? { C: SKY, assets: skyAssetsFromDoc(ep.sky, SKY) } : null;
        const env: TickEnv = {
            M,
            view,
            D,
            W,
            R,
            SPR,
            ES,
            spriteAssets,
            rendAssets,
            lcg: b.lcg,
            sky,
            mapsDoc: ep.mapsDoc,
            classOfBlock: blockClassTableOf(ep.mapsDoc),
            levelCells: cellSourceOf(ep.mapsDoc),
            G,
            LIGHT,
            PARTNER,
            HYD,
            FLAME,
            BOSS,
            BOSS2: boss2ConstantsFrom(b.data.boss2),
            BOSS3: boss3ConstantsFrom(b.data.boss3),
            DOG: dogConstantsFrom(b.data.dog),
            IMP: impConstantsFrom(b.data.imp),
            SF: sfConstantsFrom(b.data.sf),
            SERGEANT: sergeantConstantsFrom(b.data.sergeant),
            MINE,
            CAMERA: cameraConstantsFrom(b.data.camera),
            ORDNANCE: ordnanceConstantsFrom(b.data.ordnance),
            EXT: extinguisherConstantsFrom(b.data.extinguisher),
            H,
            itemCaps,
            itemNames,
            texts,
            L,
            P,
            items,
            start,
            kinds,
            sounds,
            pause: b.pauseAssets ? { C: pauseConstantsFrom(b.data.pause), assets: pauseAssetsFrom(b.pauseAssets.pause, b.pauseAssets.tiles) } : null,
            death: deathConstantsFrom(b.data.death),
            sniper: sniperConstantsFrom(b.data.sniper),
            ...(b.data.modern !== undefined ? { MODERN: modernConstantsFrom(b.data.modern) } : {}),
            charsel: null,
            briefing: null,
        };
        return env;
    });
}
export async function loadAttractKit(fetchJson: (url: string) => Promise<unknown>): Promise<AttractKit> {
    const b = (await fetchJson("/tick_bundle.json")) as TickBundle;
    if (b.format !== TICK_BUNDLE_FORMAT)
        throw new Error(`tick bundle format ${String(b.format)}, expected ${TICK_BUNDLE_FORMAT}`);
    const hud = (await fetchJson("/hud_bundle.json")) as HudBundle;
    const HC = hudConstantsFrom(hud.data);
    const envs = tickEnvsFrom(b);
    return {
        envs,
        HC,
        hudAssets: hudAssetsFrom(hud.assets),
        HAND: handConstantsFrom(b.data.weapon),
        handAssets: handAssetsFromDoc(b.handAssets),
        demos: b.demos,
        lcg: b.lcg,
        hostSeed: parseInt(b.hostDefaultSeed, 16) >>> 0,
        vblanks: b.vblanks,
        screenW: HC.RECORD.DISPLAY_W,
        screenH: HC.RECORD.DISPLAY_H,
        viewX0: HC.RECORD.VIEW_RECT_COL_FIRST * TILE_SIZE,
        viewY0: HC.RECORD.VIEW_RECT_ROW_FIRST * TILE_SIZE,
        notes: b.notes,
        pauseExit: b.pauseExit,
        hdData: b.data.hd,
        viewData: b.data.view,
    };
}
export function attachDeathScreens(tickKit: AttractKit, charsel: TickEnv["charsel"], briefing: TickEnv["briefing"]): void {
    for (const env of tickKit.envs)
        if (env)
            Object.assign(env, { charsel, briefing });
}
export function hex8(v: number): string {
    return (v >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

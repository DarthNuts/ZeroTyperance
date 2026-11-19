import { BOOT_BUNDLE_FORMAT } from "../boot/assets.js";
import type { BootBundle } from "../boot/assets.js";
import { serializeAssets } from "../boot/assets_parse.js";
import { loadBootEnvironmentFrom } from "../boot/page_load.js";
import { TITLE_BUNDLE_FORMAT } from "../title/assets.js";
import type { TitleBundle } from "../title/assets.js";
import { serializeTitleAssets } from "../title/assets_parse.js";
import { loadTitleEnvironmentFrom } from "../title/page_load.js";
import { SEGA_BUNDLE_FORMAT } from "../sega/assets.js";
import type { SegaBundle } from "../sega/assets.js";
import { serializeSegaAssets } from "../sega/assets_parse.js";
import { loadSegaEnvironmentFrom } from "../sega/page_load.js";
import { OPTIONS_BUNDLE_FORMAT } from "../options/assets.js";
import type { OptionsBundle } from "../options/assets.js";
import { serializeOptionsAssets } from "../options/assets_parse.js";
import { loadOptionsConstantsFrom, loadOptionsEnvironmentFrom, loadSoundTableFrom } from "../options/page_load.js";
import { serializeSoundTable } from "../options/sound_table.js";
import { BRIEFING_BUNDLE_FORMAT } from "../briefing/assets.js";
import type { BriefingBundle } from "../briefing/assets.js";
import { serializeBriefingAssets } from "../briefing/assets_parse.js";
import { loadBriefingEnvironmentFrom } from "../briefing/page_load.js";
import { CHARSEL_BUNDLE_FORMAT } from "../charsel/assets.js";
import type { CharselBundle } from "../charsel/assets.js";
import { serializeCharselAssets } from "../charsel/assets_parse.js";
import { loadCharselEnvironmentFrom } from "../charsel/page_load.js";
import { PASSWORD_BUNDLE_FORMAT } from "../password/assets.js";
import type { PasswordBundle } from "../password/assets.js";
import { serializePasswordAssets } from "../password/assets_parse.js";
import { loadPasswordEnvironmentFrom } from "../password/page_load.js";
import { REND_BUNDLE_FORMAT } from "../rend/bundle.js";
import type { RendBundle } from "../rend/bundle.js";
import { loadFloorFrom, loadRendAssetsFrom, loadRendEnvironmentFrom, mapsDocumentFrom } from "../rend/page_load.js";
import { loadMoveEnvironmentFrom } from "../move/page_load.js";
import { blockClassTableFrom, loadDoorEnvironmentFrom } from "../door/page_load.js";
import { HUD_BUNDLE_FORMAT } from "../hud/bundle.js";
import type { HudBundle } from "../hud/bundle.js";
import { loadHudAssetsDocFrom, loadHudEnvironmentFrom } from "../hud/page_load.js";
import { skyClassOfEpisode } from "../rend/sky/core.js";
import { loadSkyAssetsFrom, loadSkyEnvironmentFrom } from "../rend/sky/page_load.js";
import { loadSpriteAssetsFrom, loadSpriteEnvironmentFrom } from "../rend/sprite/page_load.js";
import { handAssetsToDoc } from "../hand/assets.js";
import { loadHandAssetsFrom, loadHandEnvironmentFrom } from "../hand/page_load.js";
import { TICK_BUNDLE_FORMAT } from "../boot/app/tick_bundle.js";
import type { TickBundle, TickFixtures } from "../boot/app/tick_bundle.js";
import type { PackSource } from "./pack_source.js";
export const BUNDLE_PATHS = [
    "/bundle.json", "/title_bundle.json", "/sega_bundle.json", "/options_bundle.json", "/briefing_bundle.json", "/charsel_bundle.json",
    "/password_bundle.json", "/rend_bundle.json", "/tick_bundle.json", "/hud_bundle.json",
] as const;
const REND_EPISODE = 0;
const REND_FLOOR = 0;
const REND_START = { x: 1920, y: 2432, angle: 0 } as const;
const EPISODES = 3;
const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));
function lcgOf(src: PackSource): {
    multiplier: number;
    increment: number;
    hostDefault: string | null;
} {
    const d = (src.data("lcg") as {
        data?: {
            multiplier?: unknown;
            increment?: unknown;
            seeding?: {
                host_default_hex?: unknown;
            };
        };
    }).data;
    if (typeof d?.multiplier !== "number" || typeof d.increment !== "number")
        throw new Error("lcg: no data.multiplier / data.increment");
    return { multiplier: d.multiplier, increment: d.increment, hostDefault: typeof d.seeding?.host_default_hex === "string" ? d.seeding.host_default_hex : null };
}
const optionalJson = (src: PackSource, path: string): unknown => {
    const t = src.text(path);
    return t === null ? null : (JSON.parse(t) as unknown);
};
function rendBundle(src: PackSource): RendBundle {
    const { C, dataDoc, trigDoc } = loadRendEnvironmentFrom(src);
    const floor = loadFloorFrom(src, REND_EPISODE, REND_FLOOR, C);
    const assets = loadRendAssetsFrom(src, C);
    const skyEnv = loadSkyEnvironmentFrom(src);
    const skyClass = skyClassOfEpisode(REND_EPISODE, skyEnv.C);
    if (skyClass === null)
        throw new Error(`rend_sky names no sky class for episode ${REND_EPISODE}`);
    const sky = loadSkyAssetsFrom(src, skyClass, skyEnv.C);
    const spriteEnv = loadSpriteEnvironmentFrom(src);
    const spriteAssets = loadSpriteAssetsFrom(src, spriteEnv.SC);
    const handEnv = loadHandEnvironmentFrom(src);
    const lcg = lcgOf(src);
    return {
        format: REND_BUNDLE_FORMAT,
        data: dataDoc,
        trig: trigDoc,
        floor: floor.doc,
        episode: REND_EPISODE,
        floorNumber: REND_FLOOR,
        assets: assets.doc,
        sky: { data: skyEnv.dataDoc, assets: sky.doc },
        move: { data: src.data("move") },
        door: { data: loadDoorEnvironmentFrom(src).dataDoc, blockClasses: blockClassTableFrom(mapsDocumentFrom(src, REND_EPISODE)) },
        weapon: { data: src.data("weapon") },
        sprite: {
            data: spriteEnv.spriteDoc,
            soldier: spriteEnv.soldierDoc,
            assets: spriteAssets.doc,
            soundTable: serializeSoundTable(loadSoundTableFrom(src, loadOptionsConstantsFrom(src))),
        },
        hand: { assets: handAssetsToDoc(loadHandAssetsFrom(src, handEnv.C)) },
        lcg: { multiplier: lcg.multiplier, increment: lcg.increment },
        start: REND_START,
    };
}
function tickBundle(src: PackSource, tick: TickFixtures): TickBundle {
    const notes: string[] = [];
    const rend = loadRendEnvironmentFrom(src);
    const skyEnv = loadSkyEnvironmentFrom(src);
    const spriteEnv = loadSpriteEnvironmentFrom(src);
    let rendAssets: TickBundle["rendAssets"] = null;
    try {
        rendAssets = loadRendAssetsFrom(src, rend.C).doc;
    }
    catch (err) {
        notes.push(`texture / palette assets: ${errText(err)}`);
    }
    const episodes: Array<TickBundle["episodes"][number]> = [];
    for (let e = 0; e < EPISODES; e++) {
        const mapsDoc = mapsDocumentFrom(src, e);
        let sky: TickBundle["episodes"][number]["sky"] = null;
        const className = skyClassOfEpisode(e, skyEnv.C);
        if (className === null)
            notes.push(`episode ${e}: no sky class`);
        else {
            try {
                sky = loadSkyAssetsFrom(src, className, skyEnv.C).doc;
            }
            catch (err) {
                notes.push(`episode ${e} sky: ${errText(err)}`);
            }
        }
        episodes.push({ mapsDoc, sky });
    }
    const lcg = lcgOf(src);
    if (lcg.hostDefault === null)
        throw new Error("lcg: no data.seeding.host_default_hex");
    notes.push(...tick.notes);
    const handEnv = loadHandEnvironmentFrom(src);
    let pauseAssets: TickBundle["pauseAssets"] = null;
    const pause = optionalJson(src, "pause/pause.json");
    const tiles = optionalJson(src, "pause/tiles.json");
    if (pause !== null && tiles !== null)
        pauseAssets = { pause, tiles };
    else
        notes.push("pause/pause.json: not stored (the in-game pause screen is then unavailable)");
    const d = (name: string): unknown => src.data(name);
    return {
        format: TICK_BUNDLE_FORMAT,
        data: {
            move: loadMoveEnvironmentFrom(src).dataDoc,
            door: loadDoorEnvironmentFrom(src).dataDoc,
            weapon: d("weapon"),
            rend: rend.dataDoc,
            trig: rend.trigDoc,
            sprite: spriteEnv.spriteDoc,
            soldier: spriteEnv.soldierDoc,
            sky: skyEnv.dataDoc,
            hit: d("player_hit"),
            pickup: d("pickup"),
            items: d("items"),
            pickupMessages: optionalJson(src, "strings/pickup_messages.json"),
            messages: optionalJson(src, "strings/messages.json"),
            lift: d("lift"),
            loadouts: d("character_loadouts"),
            demoInputs: d("demo_inputs"),
            enemyDescriptors: d("enemy_descriptors"),
            hydaca: d("hydaca"),
            flame: d("flame"),
            boss: d("boss"),
            boss2: d("boss2"),
            boss3: d("boss3"),
            mine: d("mine"),
            camera: d("camera"),
            ordnance: d("ordnance"),
            extinguisher: d("extinguisher"),
            dog: d("dog"),
            imp: d("imp"),
            sf: d("sf"),
            sergeant: d("sergeant"),
            soundTable: d("sound_table"),
            pause: d("pause"),
            death: d("death"),
            sniper: d("sniper"),
            modern: d("player_modern"),
        },
        lcg: { multiplier: lcg.multiplier, increment: lcg.increment },
        hostDefaultSeed: lcg.hostDefault,
        rendAssets,
        spriteAssets: loadSpriteAssetsFrom(src, spriteEnv.SC).doc,
        episodes,
        vblanks: tick.vblanks,
        handAssets: handAssetsToDoc(loadHandAssetsFrom(src, handEnv.C)),
        demos: tick.demos,
        pauseAssets,
        pauseExit: tick.pauseExit,
        notes,
    };
}
export function pageBundle(path: string, src: PackSource, tick: TickFixtures): unknown {
    switch (path) {
        case "/bundle.json": {
            const { assets, C } = loadBootEnvironmentFrom(src);
            return { format: BOOT_BUNDLE_FORMAT, constants: C, assets: serializeAssets(assets) } satisfies BootBundle;
        }
        case "/title_bundle.json": {
            const { assets, C } = loadTitleEnvironmentFrom(src);
            return { format: TITLE_BUNDLE_FORMAT, constants: C, assets: serializeTitleAssets(assets) } satisfies TitleBundle;
        }
        case "/sega_bundle.json": {
            const { assets, C } = loadSegaEnvironmentFrom(src);
            return { format: SEGA_BUNDLE_FORMAT, constants: C, assets: serializeSegaAssets(assets) } satisfies SegaBundle;
        }
        case "/options_bundle.json": {
            const { assets, C } = loadOptionsEnvironmentFrom(src);
            return { format: OPTIONS_BUNDLE_FORMAT, constants: C, assets: serializeOptionsAssets(assets) } satisfies OptionsBundle;
        }
        case "/briefing_bundle.json": {
            const { assets, C } = loadBriefingEnvironmentFrom(src);
            return { format: BRIEFING_BUNDLE_FORMAT, constants: C, assets: serializeBriefingAssets(assets) } satisfies BriefingBundle;
        }
        case "/charsel_bundle.json": {
            const { assets, C } = loadCharselEnvironmentFrom(src);
            return { format: CHARSEL_BUNDLE_FORMAT, constants: C, assets: serializeCharselAssets(assets) } satisfies CharselBundle;
        }
        case "/password_bundle.json": {
            const { assets, C } = loadPasswordEnvironmentFrom(src);
            return { format: PASSWORD_BUNDLE_FORMAT, constants: C, codec: src.data("password_codec"), assets: serializePasswordAssets(assets) } satisfies PasswordBundle;
        }
        case "/rend_bundle.json": return rendBundle(src);
        case "/tick_bundle.json": return tickBundle(src, tick);
        case "/hud_bundle.json": {
            const { C, dataDoc } = loadHudEnvironmentFrom(src);
            return { format: HUD_BUNDLE_FORMAT, data: dataDoc, assets: loadHudAssetsDocFrom(src, C) } satisfies HudBundle;
        }
        default: return undefined;
    }
}

import type { Command } from "../core.js";
import type { RomFile } from "../core.js";
export const TABLES_FORMAT = "zt-rom-tables/1";
export const TABLES_OUT = "tables/tables.json";
type Spec = Record<string, unknown> & {
    t: string;
};
const SPECS: Record<string, Spec> = { "character.loadout.0": { "off": 3992, "t": "loadout" }, "character.loadout.1": { "off": 4000, "t": "loadout" }, "character.loadout.2": { "off": 4008, "t": "loadout" }, "character.loadout.3": { "off": 4016, "t": "loadout" }, "character.loadout.4": { "off": 4024, "t": "loadout" }, "character.name.0": { "len": 5, "off": 813994, "t": "str", "x": "" }, "character.name.1": { "len": 5, "off": 814312, "t": "str", "x": "" }, "character.name.2": { "len": 4, "off": 814541, "t": "str", "x": "" }, "character.name.3": { "len": 5, "off": 814946, "t": "str", "x": "" }, "character.name.4": { "len": 7, "off": 815264, "t": "str", "x": "" }, "demo.0.runs": { "bits": ["up", "down", "left", "right", "b", "c", "a", "start"], "n": 200, "off": 1897276, "t": "runs" }, "demo.0.seed": { "off": 1897272, "t": "hex32" }, "demo.1.runs": { "bits": ["up", "down", "left", "right", "b", "c", "a", "start"], "n": 200, "off": 1897484, "t": "runs" }, "demo.1.seed": { "off": 1897480, "t": "hex32" }, "demo.2.runs": { "bits": ["up", "down", "left", "right", "b", "c", "a", "start"], "n": 200, "off": 1897692, "t": "runs" }, "demo.2.seed": { "off": 1897688, "t": "hex32" }, "demo_inputs.demos.0.inputs": { "enc": "u8", "n": 200, "off": 1897276, "t": "arr" }, "demo_inputs.demos.1.inputs": { "enc": "u8", "n": 200, "off": 1897484, "t": "arr" }, "demo_inputs.demos.2.inputs": { "enc": "u8", "n": 200, "off": 1897692, "t": "arr" }, "enemy.rec0.corpse": { "form": "corpse", "id": "enemy.rec0", "names": { "112268": "enemy.rec0.corpse.draw", "112290": "enemy.rec0.corpse.ai", "112784": "enemy.rec0.corpse.damage", "83028": "enemy.corpse_death.a" }, "off": 44168, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec0.live": { "form": "live", "id": "enemy.rec0", "names": { "110712": "enemy.rec0.ai", "111970": "enemy.rec0.draw", "112676": "enemy.rec0.damage", "84566": "enemy.death.a" }, "off": 43788, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec1.corpse": { "form": "corpse", "id": "enemy.rec1", "names": { "100024": "enemy.rec1.corpse.ai", "100402": "enemy.rec1.corpse.damage", "83028": "enemy.corpse_death.a", "99936": "enemy.rec1.corpse.draw" }, "off": 44194, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec1.live": { "form": "live", "id": "enemy.rec1", "names": { "100296": "enemy.rec1.damage", "84566": "enemy.death.a", "99068": "enemy.rec1.ai", "99692": "enemy.rec1.draw" }, "off": 43826, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec2.corpse": { "form": "corpse", "id": "enemy.rec2", "names": { "101064": "enemy.rec2.corpse.draw", "101072": "enemy.rec2.corpse.ai", "101244": "enemy.rec2.corpse.damage", "83028": "enemy.corpse_death.a" }, "off": 44220, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec2.live": { "form": "live", "id": "enemy.rec2", "names": { "100474": "enemy.rec2.ai", "100966": "enemy.rec2.draw", "101138": "enemy.rec2.damage", "84566": "enemy.death.a" }, "off": 43864, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec3.corpse": { "form": "corpse", "id": "enemy.rec3", "names": { "83028": "enemy.corpse_death.a", "87576": "enemy.rec3.corpse.draw", "87762": "enemy.rec3.corpse.ai", "87820": "enemy.rec3.corpse.damage" }, "off": 44246, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec3.live": { "form": "live", "id": "enemy.rec3", "names": { "84566": "enemy.death.a", "85034": "enemy.rec3.ai", "86942": "enemy.rec3.draw", "87900": "enemy.rec3.damage" }, "off": 43902, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec4.corpse": { "form": "corpse", "id": "enemy.rec4", "names": { "110238": "enemy.rec4.corpse.draw", "110260": "enemy.rec4.corpse.ai", "110640": "enemy.rec4.corpse.damage", "83028": "enemy.corpse_death.a" }, "off": 44272, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec4.live": { "form": "live", "id": "enemy.rec4", "names": { "108842": "enemy.rec4.ai", "109978": "enemy.rec4.draw", "110534": "enemy.rec4.damage", "84566": "enemy.death.a" }, "off": 43940, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec5.corpse": { "form": "corpse", "id": "enemy.rec5", "names": { "103472": "enemy.rec5.corpse.draw", "103484": "enemy.rec5.corpse.ai", "103676": "enemy.rec5.corpse.damage", "83198": "enemy.corpse_death.b" }, "off": 44298, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec5.live": { "form": "live", "id": "enemy.rec5", "names": { "102496": "enemy.rec5.ai", "103368": "enemy.rec5.draw", "103550": "enemy.rec5.damage", "84744": "enemy.death.b" }, "off": 43978, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec6.corpse": { "form": "corpse", "id": "enemy.rec6", "names": { "104780": "enemy.rec6.corpse.draw", "104792": "enemy.rec6.corpse.ai", "104964": "enemy.rec6.corpse.damage", "83028": "enemy.corpse_death.a" }, "off": 44324, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec6.live": { "form": "live", "id": "enemy.rec6", "names": { "103744": "enemy.rec6.ai", "104644": "enemy.rec6.draw", "104858": "enemy.rec6.damage", "84566": "enemy.death.a" }, "off": 44016, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec7.corpse": { "form": "corpse", "id": "enemy.rec7", "names": { "106442": "enemy.rec7.corpse.draw", "106450": "enemy.rec7.corpse.ai", "106956": "enemy.rec7.corpse.damage", "83028": "enemy.corpse_death.a" }, "off": 44350, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec7.live": { "form": "live", "id": "enemy.rec7", "names": { "105032": "enemy.rec7.ai", "106186": "enemy.rec7.draw", "106836": "enemy.rec7.damage", "84566": "enemy.death.a" }, "off": 44054, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec8.corpse": { "form": "corpse", "id": "enemy.rec8", "names": { "108540": "enemy.rec8.corpse.draw", "108552": "enemy.rec8.corpse.ai", "108744": "enemy.rec8.corpse.damage", "83198": "enemy.corpse_death.b" }, "off": 44376, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec8.live": { "form": "live", "id": "enemy.rec8", "names": { "107300": "enemy.rec8.ai", "108322": "enemy.rec8.draw", "108618": "enemy.rec8.damage", "84744": "enemy.death.b" }, "off": 44092, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec9.corpse": { "form": "corpse", "id": "enemy.rec9", "names": { "102224": "enemy.rec9.corpse.draw", "102236": "enemy.rec9.corpse.ai", "102428": "enemy.rec9.corpse.damage", "83198": "enemy.corpse_death.b" }, "off": 44402, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "enemy.rec9.live": { "form": "live", "id": "enemy.rec9", "names": { "101316": "enemy.rec9.ai", "102120": "enemy.rec9.draw", "102302": "enemy.rec9.damage", "84744": "enemy.death.b" }, "off": 44130, "swap_from": 1502296, "swap_to": 1844618, "t": "enemy" }, "ent.soldier.corpse_frames": { "enc": "u8", "n": 16, "off": 100008, "t": "arr" }, "flame.wall_table": { "enc": "u8", "n": 133, "off": 57918, "t": "arr" }, "hand.recoil": { "enc": "u8", "n": 6, "off": 75816, "t": "arr" }, "hud.card.overflow_tens.0": { "enc": "be16", "n": 6, "off": 40846, "t": "arr" }, "hud.card.overflow_tens.1": { "enc": "be16", "n": 6, "off": 40846, "t": "arr" }, "hud.scan.blink_words": { "enc": "be16", "n": 8, "off": 59734, "t": "arr" }, "hyd.wall_poses": { "enc": "u8", "n": 6, "off": 63940, "t": "arr" }, "items.aim_cone.10": { "field": "cone", "idx": 10, "t": "fire", "tbl": 76440 }, "items.aim_cone.12": { "field": "cone", "idx": 12, "t": "fire", "tbl": 76440 }, "items.aim_cone.14": { "field": "cone", "idx": 14, "t": "fire", "tbl": 76440 }, "items.aim_cone.8": { "field": "cone", "idx": 8, "t": "fire", "tbl": 76440 }, "items.cap.1": { "off": 70210, "shr": 8, "t": "u16" }, "items.cap.10": { "off": 70228, "shr": 8, "t": "u16" }, "items.cap.11": { "off": 70230, "shr": 8, "t": "u16" }, "items.cap.12": { "off": 70232, "shr": 8, "t": "u16" }, "items.cap.13": { "off": 70234, "shr": 8, "t": "u16" }, "items.cap.14": { "off": 70236, "shr": 8, "t": "u16" }, "items.cap.2": { "off": 70212, "shr": 8, "t": "u16" }, "items.cap.3": { "off": 70214, "shr": 8, "t": "u16" }, "items.cap.4": { "off": 70216, "shr": 8, "t": "u16" }, "items.cap.5": { "off": 70218, "shr": 8, "t": "u16" }, "items.cap.6": { "off": 70220, "shr": 8, "t": "u16" }, "items.cap.7": { "off": 70222, "shr": 8, "t": "u16" }, "items.cap.8": { "off": 70224, "shr": 8, "t": "u16" }, "items.cap.9": { "off": 70226, "shr": 8, "t": "u16" }, "items.default_grant.1": { "off": 70180, "shr": 8, "t": "u16" }, "items.default_grant.10": { "off": 70198, "shr": 8, "t": "u16" }, "items.default_grant.11": { "off": 70200, "shr": 8, "t": "u16" }, "items.default_grant.12": { "off": 70202, "shr": 8, "t": "u16" }, "items.default_grant.13": { "off": 70204, "shr": 8, "t": "u16" }, "items.default_grant.14": { "off": 70206, "shr": 8, "t": "u16" }, "items.default_grant.2": { "off": 70182, "shr": 8, "t": "u16" }, "items.default_grant.3": { "off": 70184, "shr": 8, "t": "u16" }, "items.default_grant.4": { "off": 70186, "shr": 8, "t": "u16" }, "items.default_grant.5": { "off": 70188, "shr": 8, "t": "u16" }, "items.default_grant.6": { "off": 70190, "shr": 8, "t": "u16" }, "items.default_grant.7": { "off": 70192, "shr": 8, "t": "u16" }, "items.default_grant.8": { "off": 70194, "shr": 8, "t": "u16" }, "items.default_grant.9": { "off": 70196, "shr": 8, "t": "u16" }, "items.fire_sound_id.10": { "field": "sound", "idx": 10, "t": "fire", "tbl": 76440 }, "items.fire_sound_id.12": { "field": "sound", "idx": 12, "t": "fire", "tbl": 76440 }, "items.fire_sound_id.14": { "field": "sound", "idx": 14, "t": "fire", "tbl": 76440 }, "items.fire_sound_id.8": { "field": "sound", "idx": 8, "t": "fire", "tbl": 76440 }, "items.map_class.1": { "base": 24, "compares": [[72378, 72486], [72386, 72480]], "item": 1, "item_t": 72490, "jump": 72418, "medi_t": 72572, "n": 15, "rts_t": 72478, "t": "pickclass" }, "items.map_class.10": { "base": 24, "compares": [[72378, 72486], [72386, 72480]], "item": 10, "item_t": 72490, "jump": 72418, "medi_t": 72572, "n": 15, "rts_t": 72478, "t": "pickclass" }, "items.map_class.11": { "base": 24, "compares": [[72378, 72486], [72386, 72480]], "item": 11, "item_t": 72490, "jump": 72418, "medi_t": 72572, "n": 15, "rts_t": 72478, "t": "pickclass" }, "items.map_class.12": { "base": 24, "compares": [[72378, 72486], [72386, 72480]], "item": 12, "item_t": 72490, "jump": 72418, "medi_t": 72572, "n": 15, "rts_t": 72478, "t": "pickclass" }, "items.map_class.13": { "base": 24, "compares": [[72378, 72486], [72386, 72480]], "item": 13, "item_t": 72490, "jump": 72418, "medi_t": 72572, "n": 15, "rts_t": 72478, "t": "pickclass" }, "items.map_class.14": { "base": 24, "compares": [[72378, 72486], [72386, 72480]], "item": 14, "item_t": 72490, "jump": 72418, "medi_t": 72572, "n": 15, "rts_t": 72478, "t": "pickclass" }, "items.map_class.2": { "base": 24, "compares": [[72378, 72486], [72386, 72480]], "item": 2, "item_t": 72490, "jump": 72418, "medi_t": 72572, "n": 15, "rts_t": 72478, "t": "pickclass" }, "items.map_class.3": { "base": 24, "compares": [[72378, 72486], [72386, 72480]], "item": 3, "item_t": 72490, "jump": 72418, "medi_t": 72572, "n": 15, "rts_t": 72478, "t": "pickclass" }, "items.map_class.4": { "base": 24, "compares": [[72378, 72486], [72386, 72480]], "item": 4, "item_t": 72490, "jump": 72418, "medi_t": 72572, "n": 15, "rts_t": 72478, "t": "pickclass" }, "items.map_class.5": { "base": 24, "compares": [[72378, 72486], [72386, 72480]], "item": 5, "item_t": 72490, "jump": 72418, "medi_t": 72572, "n": 15, "rts_t": 72478, "t": "pickclass" }, "items.map_class.6": { "base": 24, "compares": [[72378, 72486], [72386, 72480]], "item": 6, "item_t": 72490, "jump": 72418, "medi_t": 72572, "n": 15, "rts_t": 72478, "t": "pickclass" }, "items.map_class.7": { "base": 24, "compares": [[72378, 72486], [72386, 72480]], "item": 7, "item_t": 72490, "jump": 72418, "medi_t": 72572, "n": 15, "rts_t": 72478, "t": "pickclass" }, "items.map_class.8": { "base": 24, "compares": [[72378, 72486], [72386, 72480]], "item": 8, "item_t": 72490, "jump": 72418, "medi_t": 72572, "n": 15, "rts_t": 72478, "t": "pickclass" }, "items.map_class.9": { "base": 24, "compares": [[72378, 72486], [72386, 72480]], "item": 9, "item_t": 72490, "jump": 72418, "medi_t": 72572, "n": 15, "rts_t": 72478, "t": "pickclass" }, "items.name.1": { "idx": 1, "t": "pickname", "tbl": 126740 }, "items.name.10": { "idx": 10, "t": "pickname", "tbl": 126740 }, "items.name.11": { "idx": 11, "t": "pickname", "tbl": 126740 }, "items.name.12": { "idx": 12, "t": "pickname", "tbl": 126740 }, "items.name.13": { "idx": 13, "t": "pickname", "tbl": 126740 }, "items.name.14": { "idx": 14, "t": "pickname", "tbl": 126740 }, "items.name.2": { "idx": 2, "t": "pickname", "tbl": 126740 }, "items.name.3": { "idx": 3, "t": "pickname", "tbl": 126740 }, "items.name.4": { "idx": 4, "t": "pickname", "tbl": 126740 }, "items.name.5": { "idx": 5, "t": "pickname", "tbl": 126740 }, "items.name.6": { "idx": 6, "t": "pickname", "tbl": 126740 }, "items.name.7": { "idx": 7, "t": "pickname", "tbl": 126740 }, "items.name.8": { "idx": 8, "t": "pickname", "tbl": 126740 }, "items.name.9": { "idx": 9, "t": "pickname", "tbl": 126740 }, "items.no_effect_classes": { "hi": 39, "lo": 25, "t": "noeffect", "tbl": 58400 }, "items.other.0.map_class": { "base": 24, "compares": [[72378, 72486], [72386, 72480]], "item": 0, "item_t": 72490, "jump": 72418, "medi_t": 72572, "n": 15, "rts_t": 72478, "t": "pickclass" }, "items.other.0.voice": { "off": 124354, "t": "voice" }, "items.other_pickups.0.name": { "len": 8, "off": 124354, "t": "str", "x": "" }, "items.pickup_voice.1": { "idx": 1, "t": "voice", "tbl": 126740 }, "items.pickup_voice.10": { "idx": 10, "t": "voice", "tbl": 126740 }, "items.pickup_voice.11": { "idx": 11, "t": "voice", "tbl": 126740 }, "items.pickup_voice.12": { "idx": 12, "t": "voice", "tbl": 126740 }, "items.pickup_voice.13": { "idx": 13, "t": "voice", "tbl": 126740 }, "items.pickup_voice.14": { "idx": 14, "t": "voice", "tbl": 126740 }, "items.pickup_voice.2": { "idx": 2, "t": "voice", "tbl": 126740 }, "items.pickup_voice.3": { "idx": 3, "t": "voice", "tbl": 126740 }, "items.pickup_voice.4": { "idx": 4, "t": "voice", "tbl": 126740 }, "items.pickup_voice.5": { "idx": 5, "t": "voice", "tbl": 126740 }, "items.pickup_voice.6": { "idx": 6, "t": "voice", "tbl": 126740 }, "items.pickup_voice.7": { "idx": 7, "t": "voice", "tbl": 126740 }, "items.pickup_voice.8": { "idx": 8, "t": "voice", "tbl": 126740 }, "items.pickup_voice.9": { "idx": 9, "t": "voice", "tbl": 126740 }, "level.name.pw.0": { "len": 19, "off": 358058, "t": "str", "x": "" }, "level.name.pw.1": { "len": 19, "off": 358083, "t": "str", "x": "" }, "level.name.pw.10": { "len": 14, "off": 358308, "t": "str", "x": "" }, "level.name.pw.11": { "len": 15, "off": 358333, "t": "str", "x": "" }, "level.name.pw.12": { "len": 15, "off": 358358, "t": "str", "x": "" }, "level.name.pw.13": { "len": 18, "off": 358458, "t": "str", "x": "" }, "level.name.pw.14": { "len": 19, "off": 358483, "t": "str", "x": "" }, "level.name.pw.15": { "len": 19, "off": 358508, "t": "str", "x": "" }, "level.name.pw.16": { "len": 19, "off": 358533, "t": "str", "x": "" }, "level.name.pw.17": { "len": 19, "off": 358558, "t": "str", "x": "" }, "level.name.pw.18": { "len": 19, "off": 358583, "t": "str", "x": "" }, "level.name.pw.19": { "len": 19, "off": 358608, "t": "str", "x": "" }, "level.name.pw.2": { "len": 14, "off": 358108, "t": "str", "x": "" }, "level.name.pw.20": { "len": 19, "off": 358633, "t": "str", "x": "" }, "level.name.pw.21": { "len": 19, "off": 358658, "t": "str", "x": "" }, "level.name.pw.22": { "len": 19, "off": 358683, "t": "str", "x": "" }, "level.name.pw.23": { "len": 19, "off": 358708, "t": "str", "x": "" }, "level.name.pw.24": { "len": 19, "off": 358733, "t": "str", "x": "" }, "level.name.pw.25": { "len": 19, "off": 358758, "t": "str", "x": "" }, "level.name.pw.26": { "len": 19, "off": 358783, "t": "str", "x": "" }, "level.name.pw.27": { "len": 19, "off": 358808, "t": "str", "x": "" }, "level.name.pw.28": { "len": 19, "off": 358833, "t": "str", "x": "" }, "level.name.pw.29": { "len": 20, "off": 358858, "t": "str", "x": "" }, "level.name.pw.3": { "len": 19, "off": 358133, "t": "str", "x": "" }, "level.name.pw.30": { "len": 20, "off": 358883, "t": "str", "x": "" }, "level.name.pw.31": { "len": 20, "off": 358908, "t": "str", "x": "" }, "level.name.pw.32": { "len": 20, "off": 358933, "t": "str", "x": "" }, "level.name.pw.33": { "len": 20, "off": 358958, "t": "str", "x": "" }, "level.name.pw.34": { "len": 20, "off": 358983, "t": "str", "x": "" }, "level.name.pw.35": { "len": 20, "off": 359008, "t": "str", "x": "" }, "level.name.pw.36": { "len": 20, "off": 359033, "t": "str", "x": "" }, "level.name.pw.37": { "len": 20, "off": 359058, "t": "str", "x": "" }, "level.name.pw.38": { "len": 21, "off": 359083, "t": "str", "x": "" }, "level.name.pw.39": { "len": 21, "off": 359108, "t": "str", "x": "" }, "level.name.pw.4": { "len": 19, "off": 358158, "t": "str", "x": "" }, "level.name.pw.40": { "len": 21, "off": 359133, "t": "str", "x": "" }, "level.name.pw.5": { "len": 19, "off": 358183, "t": "str", "x": "" }, "level.name.pw.6": { "len": 19, "off": 358208, "t": "str", "x": "" }, "level.name.pw.7": { "len": 18, "off": 358233, "t": "str", "x": "" }, "level.name.pw.8": { "len": 18, "off": 358258, "t": "str", "x": "" }, "level.name.pw.9": { "len": 18, "off": 358283, "t": "str", "x": "" }, "level.name.unused.0": { "len": 21, "off": 359158, "t": "str", "x": "" }, "level.name.unused.1": { "len": 21, "off": 359183, "t": "str", "x": "" }, "level.name.unused.2": { "len": 21, "off": 359208, "t": "str", "x": "" }, "level.name.unused.3": { "len": 21, "off": 359233, "t": "str", "x": "" }, "lift.sign.digit_tex": { "enc": "be16", "n": 10, "off": 47506, "t": "arr" }, "password.code.1": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 0, "perm": 362026, "t": "pwcode" }, "password.code.10": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 9, "perm": 362026, "t": "pwcode" }, "password.code.11": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 10, "perm": 362026, "t": "pwcode" }, "password.code.12": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 11, "perm": 362026, "t": "pwcode" }, "password.code.13": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 12, "perm": 362026, "t": "pwcode" }, "password.code.14": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 16, "perm": 362026, "t": "pwcode" }, "password.code.15": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 17, "perm": 362026, "t": "pwcode" }, "password.code.16": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 18, "perm": 362026, "t": "pwcode" }, "password.code.17": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 19, "perm": 362026, "t": "pwcode" }, "password.code.18": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 20, "perm": 362026, "t": "pwcode" }, "password.code.19": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 21, "perm": 362026, "t": "pwcode" }, "password.code.2": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 1, "perm": 362026, "t": "pwcode" }, "password.code.20": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 22, "perm": 362026, "t": "pwcode" }, "password.code.21": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 23, "perm": 362026, "t": "pwcode" }, "password.code.22": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 24, "perm": 362026, "t": "pwcode" }, "password.code.23": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 25, "perm": 362026, "t": "pwcode" }, "password.code.24": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 26, "perm": 362026, "t": "pwcode" }, "password.code.25": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 27, "perm": 362026, "t": "pwcode" }, "password.code.26": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 28, "perm": 362026, "t": "pwcode" }, "password.code.27": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 29, "perm": 362026, "t": "pwcode" }, "password.code.28": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 30, "perm": 362026, "t": "pwcode" }, "password.code.29": { "lit": 2, "spans": [[363124, 363208], [363208, 363292], [363292, 363434]], "t": "pwcode" }, "password.code.3": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 2, "perm": 362026, "t": "pwcode" }, "password.code.30": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 32, "perm": 362026, "t": "pwcode" }, "password.code.31": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 33, "perm": 362026, "t": "pwcode" }, "password.code.32": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 34, "perm": 362026, "t": "pwcode" }, "password.code.33": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 35, "perm": 362026, "t": "pwcode" }, "password.code.34": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 36, "perm": 362026, "t": "pwcode" }, "password.code.35": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 37, "perm": 362026, "t": "pwcode" }, "password.code.36": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 38, "perm": 362026, "t": "pwcode" }, "password.code.37": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 39, "perm": 362026, "t": "pwcode" }, "password.code.38": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 40, "perm": 362026, "t": "pwcode" }, "password.code.39": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 41, "perm": 362026, "t": "pwcode" }, "password.code.4": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 3, "perm": 362026, "t": "pwcode" }, "password.code.40": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 42, "perm": 362026, "t": "pwcode" }, "password.code.41": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 43, "perm": 362026, "t": "pwcode" }, "password.code.5": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 4, "perm": 362026, "t": "pwcode" }, "password.code.6": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 5, "perm": 362026, "t": "pwcode" }, "password.code.7": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 6, "perm": 362026, "t": "pwcode" }, "password.code.8": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 7, "perm": 362026, "t": "pwcode" }, "password.code.9": { "alive": [1, 1, 1, 1, 1], "alpha": 361962, "amount_codes": [7, 7, 6, 6, 6], "health_code": 63, "items": [1, 3, 8, 12, 14], "key": 362184, "level": 8, "perm": 362026, "t": "pwcode" }, "password.named.0": { "span": [363124, 363208], "t": "named", "valid": 364312 }, "password.named.1": { "span": [363208, 363292], "t": "named", "valid": 364312 }, "password.named.2": { "span": [363292, 363434], "t": "named", "valid": 364312 }, "password.row8.left_remap": { "enc": "u8", "n": 8, "off": 361842, "t": "arr" }, "password.row8.right_remap": { "enc": "u8", "n": 8, "off": 361850, "t": "arr" }, "password_codec.alphabet": { "len": 64, "off": 361962, "t": "str", "x": "" }, "password_codec.amount_table": { "enc": "be16", "n": 15, "off": 70208, "t": "arr" }, "password_codec.cells[8]": { "items": [[361825, 3, ""], [361825, 3, ""], [361829, 6, ""], [361829, 6, ""], [361829, 6, ""], [361836, 4, ""], [361836, 4, ""], [361836, 4, ""]], "t": "strs" }, "password_codec.level_valid": { "enc": "u8", "n": 64, "off": 364312, "t": "arr" }, "password_codec.permutation": { "enc": "u8", "n": 54, "off": 362026, "t": "arr" }, "pickup.msg.ammo_low.text": { "items": [[124756, 5, ""], [124765, 9, ""], [124682, 3, ""]], "t": "strs" }, "pickup.msg.handgun.text": { "items": [[123966, 7, ""], [123695, 9, ""]], "t": "strs" }, "pickup.msg.health_critical.text": { "items": [[124664, 6, ""], [124673, 9, ""], [124728, 8, ""]], "t": "strs" }, "pickup.msg.health_low.text": { "items": [[124664, 6, ""], [124673, 9, ""], [124682, 3, ""]], "t": "strs" }, "pickup.msg.medipack.text": { "items": [[124354, 8, ""], [123695, 9, ""]], "t": "strs" }, "rend.column_angles": { "enc": "be16s", "n": 129, "off": 37156, "t": "arr" }, "rend.sprite.blast_shifts": { "enc": "u8", "n": 6, "off": 82484, "t": "arr" }, "rend.sprite.pop_shrink": { "enc": "u8", "n": 6, "off": 57918, "t": "arr" }, "sega.tex_order": { "enc": "be16", "n": 8, "off": 356622, "t": "arr" }, "sniper.figure_tiles": { "enc": "be16", "n": 18, "off": 9822, "t": "arr" }, "sound.entries": { "n": 162, "off": 810676, "t": "sound" }, "title.cam_x_sequence": { "enc": "be16", "n": 8, "off": 120196, "t": "arr" }, "title.cam_y_sequence": { "enc": "be16", "n": 7, "off": 120212, "t": "arr" }, "trig.neg_cos256": { "n": 512, "off": 33062, "t": "trig" }, "trig.sin256": { "n": 512, "off": 33060, "t": "trig" }, "weapon.item_weapon": { "enc": "u8", "n": 16, "off": 72732, "t": "arr" } };
export class TablesError extends Error {
}
const ENC: Record<string, [
    number,
    boolean
]> = { u8: [1, false], be16: [2, false], be16s: [2, true], be32: [4, false] };
function read(rom: RomFile, off: number, n: number, what: string): Uint8Array {
    try {
        return rom.bytesAt(off, n);
    }
    catch {
        throw new TablesError(`${what}: ${n} byte(s) at 0x${off.toString(16).toUpperCase()} lie outside the ROM image`);
    }
}
const ascii = (b: Uint8Array): string => {
    let s = "";
    for (const c of b) {
        if (c > 0x7f)
            throw new TablesError("a byte outside ASCII");
        s += String.fromCharCode(c);
    }
    return s;
};
function text(rom: RomFile, off: number, n: number, x: string, what: string): string {
    const s = ascii(read(rom, off, n, what));
    if (x === "cap")
        return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1).toLowerCase();
    if (x === "low")
        return s.toLowerCase();
    if (x)
        throw new TablesError(`${what}: unknown case rule '${x}'`);
    return s;
}
function uOf(b: Uint8Array, signed: boolean): number {
    let v = 0;
    for (const c of b)
        v = v * 256 + c;
    if (signed && b.length > 0 && (b[0]! & 0x80) !== 0)
        v -= 2 ** (8 * b.length);
    return v;
}
const u = (rom: RomFile, off: number, size: number, what: string, signed = false): number => uOf(read(rom, off, size, what), signed);
const pyStrip = (s: string): string => s.replace(/^[ \t\n\r\x0b\x0c\x1c-\x1f]+|[ \t\n\r\x0b\x0c\x1c-\x1f]+$/g, "");
function messageName(raw: Uint8Array): string {
    const lines: string[] = [];
    for (let i = 0; i < 36; i += 9)
        lines.push(pyStrip(ascii(raw.subarray(i, i + 9))));
    let out = "";
    for (const ln of lines) {
        if (ln.startsWith("COLLECTED"))
            break;
        if (ln)
            out = out.endsWith("-") ? out.slice(0, -1) + ln : out ? out + " " + ln : ln;
    }
    return out;
}
const num = (spec: Spec, k: string): number => spec[k] as number;
function msgAddr(rom: RomFile, spec: Spec, tid: string): number {
    if ("off" in spec)
        return num(spec, "off");
    return u(rom, num(spec, "tbl") + 4 * num(spec, "idx"), 4, tid);
}
function voice(rom: RomFile, p: number, tid: string): {
    duration: number;
    sound_id: number;
}[] {
    const pairs: {
        duration: number;
        sound_id: number;
    }[] = [];
    let q = p + 36;
    while (u(rom, q, 2, tid) !== 0xffff) {
        pairs.push({ duration: u(rom, q, 2, tid), sound_id: u(rom, q + 2, 2, tid) });
        q += 4;
        if (pairs.length >= 8)
            throw new TablesError(`${tid}: pickup message does not terminate`);
    }
    return pairs;
}
const hex = (v: number): string => v.toString(16).toUpperCase();
function classMap(rom: RomFile, spec: Spec, tid: string): [
    Map<number, number>,
    number | null
] {
    const special = new Map<number, number>();
    for (const [cmpOff, target] of spec["compares"] as [
        number,
        number
    ][]) {
        if (u(rom, cmpOff + 4, 2, tid) !== 0x6700 || cmpOff + 6 + u(rom, cmpOff + 6, 2, tid) !== target)
            throw new TablesError(`${tid}: special-class branch at 0x${hex(cmpOff)}`);
        if (u(rom, target, 2, tid) !== 0x303c)
            throw new TablesError(`${tid}: special-class id load at 0x${hex(target)}`);
        special.set(u(rom, cmpOff + 3, 1, tid), u(rom, target + 2, 2, tid) >> 2);
    }
    const byClass = new Map<number, number>();
    let medipack: number | null = null;
    for (let idx = 0; idx < num(spec, "n"); idx++) {
        const tgt = u(rom, num(spec, "jump") + 4 * idx, 4, tid);
        if (tgt === num(spec, "item_t"))
            byClass.set(idx + num(spec, "base"), idx);
        else if (tgt === num(spec, "medi_t")) {
            if (medipack !== null)
                throw new TablesError(`${tid}: two medipack classes`);
            medipack = idx + num(spec, "base");
        }
        else if (tgt !== num(spec, "rts_t"))
            throw new TablesError(`${tid}: unexpected jump target for class ${idx + num(spec, "base")}`);
    }
    for (const [k, v] of special)
        byClass.set(k, v);
    return [byClass, medipack];
}
function indexOf(seg: Uint8Array, pat: readonly number[], from = 0): number {
    outer: for (let i = Math.max(0, from); i + pat.length <= seg.length; i++) {
        for (let j = 0; j < pat.length; j++)
            if (seg[i + j] !== pat[j])
                continue outer;
        return i;
    }
    return -1;
}
function fire(rom: RomFile, spec: Spec, tid: string): number {
    const h = u(rom, num(spec, "tbl") + 4 * num(spec, "idx"), 4, tid);
    const seg = read(rom, h, 0x40, tid);
    const d0: number[] = [], d1: number[] = [];
    for (let o = 0; o < 0x3c; o += 2) {
        if (seg[o] === 0x30 && seg[o + 1] === 0x3c)
            d0.push(uOf(seg.subarray(o + 2, o + 4), false));
        if (seg[o] === 0x32 && seg[o + 1] === 0x3c)
            d1.push(uOf(seg.subarray(o + 2, o + 4), false));
    }
    if (!(indexOf(seg, [0x4e, 0xb9, 0x00, 0x00, 0xd7, 0x60]) === 20 && seg[16] === 0x30 && seg[17] === 0x3c && d0.length > 0 && d1.length > 0)) {
        throw new TablesError(`${tid}: fire routine at 0x${hex(h)} has an unexpected shape`);
    }
    return spec["field"] === "sound" ? d0[0]! : d1[0]!;
}
const hx = (v: number): string => "0x" + hex(v).padStart(6, "0");
function vec(rom: RomFile, addrOff: number, names: Record<string, string>, tid: string): string {
    const a = u(rom, addrOff, 4, tid);
    const n = names[String(a)];
    if (n === undefined)
        throw new TablesError(`${tid}: vector 0x${hex(a)} at 0x${hex(addrOff)} has no logical id`);
    return n;
}
function enemy(rom: RomFile, spec: Spec, tid: string): Record<string, unknown> {
    const o = num(spec, "off");
    const names = spec["names"] as Record<string, string>;
    const art = u(rom, o + 0x14, 4, tid);
    const flags = u(rom, o + 0x10, 2, tid);
    const vectors: Record<string, string> = {};
    ["ai", "draw", "damage", "death"].forEach((k, j) => { vectors[k] = vec(rom, o + 4 * j, names, tid); });
    const bits: number[] = [];
    for (let b = 0; b < 16; b++)
        if ((flags >> b) & 1)
            bits.push(b);
    const rec: Record<string, unknown> = {
        record_offset: hx(o),
        vectors,
        flags,
        hp: u(rom, o + 0x12, 2, tid),
        art_offset: hx(art),
        spawn_marker_class: u(rom, o + 0x18, 1, tid),
        corpse_tile_class: u(rom, o + 0x19, 1, tid),
        flag_bits: bits,
    };
    if (spec["form"] === "live") {
        rec["z"] = u(rom, o + 0x1a, 2, tid, true);
        rec["mp"] = { secondary: `${String(spec["id"])}.mp_secondary`, spawn_init: `${String(spec["id"])}.mp_spawn_init` };
        rec["spawn_sound_id"] = u(rom, o + 0x24, 2, tid);
        if (art === spec["swap_from"]) {
            rec["art_swap"] = {
                art_offset: hx(num(spec, "swap_to")),
                when: "the floor index is not 0 and the spawn cell's column and row differ in parity",
                note: "rule read from the spawn routine's code; 'floor index' is the extractor's name for the word the routine tests",
            };
        }
    }
    return rec;
}
function literal(rom: RomFile, a: number, b: number, tid: string): [
    string,
    number
] {
    const seg = read(rom, a, b - a, tid);
    if (!(seg[0] === 0x0c && seg[1] === 0x10 && seg[2] === 0x00))
        throw new TablesError(`${tid}: literal chain at 0x${hex(a)} does not start with a compare`);
    const chars = [seg[3]!];
    let pos = 4;
    for (let k = 1; k < 9; k++) {
        const j = indexOf(seg, [0x0c, 0x28, 0x00], pos);
        if (j < 0 || seg[j + 4] !== 0 || seg[j + 5] !== k)
            throw new TablesError(`${tid}: literal chain at 0x${hex(a)}: compare ${k}`);
        chars.push(seg[j + 3]!);
        pos = j + 6;
    }
    let level: number | null = null;
    for (let i = pos; i + 6 <= seg.length; i++) {
        if (seg[i] === 0x1d && seg[i + 1] === 0x7c && seg[i + 2] === 0x00 && seg[i + 4] === 0xa8 && seg[i + 5] === 0xfc) {
            level = seg[i + 3]!;
            break;
        }
    }
    if (level === null)
        throw new TablesError(`${tid}: literal chain at 0x${hex(a)} stores no level selector`);
    return [chars.map((c) => String.fromCharCode(c)).join(""), level];
}
function pwEncode(rom: RomFile, spec: Spec, tid: string): string {
    const alpha = ascii(read(rom, num(spec, "alpha"), 64, tid));
    const perm = [...read(rom, num(spec, "perm"), 54, tid)];
    const sorted = [...perm].sort((x, y) => x - y);
    if (!sorted.every((v, i) => v === i))
        throw new TablesError(`${tid}: the permutation table is not a permutation`);
    const key = u(rom, num(spec, "key"), 4, tid);
    const bits: number[] = [];
    const put = (v: number, n: number): void => { for (let i = 0; i < n; i++)
        bits.push(Math.floor(v / 2 ** i) & 1); };
    for (const a of spec["alive"] as number[])
        put(a, 1);
    let mask = 0;
    for (const i of spec["items"] as number[])
        mask |= 1 << (i - 1);
    put(mask, 14);
    for (const h of spec["amount_codes"] as number[])
        put(h, 3);
    put(num(spec, "health_code"), 6);
    put((num(spec, "level") - 1) & 63, 6);
    const fields: number[] = [];
    for (let i = 0; i < 5; i++) {
        let s = 0;
        for (let j = 0; j < 8; j++)
            s += bits[8 * i + j]! << j;
        fields.push(s);
    }
    {
        let s = 0;
        for (let j = 0; j < 6; j++)
            s += bits[40 + j]! << j;
        fields.push(s);
    }
    put(fields.reduce((x, y) => x + y, 0) & 0xff, 8);
    const src = new Array<number>(54).fill(0);
    for (let n = 0; n < 54; n++)
        src[perm[n]!] = bits[n]!;
    const raw = new Array<number>(7).fill(0);
    for (let b = 0; b < 54; b++)
        raw[b >> 3] = raw[b >> 3]! | (src[b]! << (b & 7));
    let k = key >>> 0;
    for (let n = 0; n < 7; n++) {
        raw[n] = raw[n]! ^ (k & 0xff);
        k = ((k >>> 7) | (k << 25)) >>> 0;
        k = ((k << 16) | (k >>> 16)) >>> 0;
    }
    const rb: number[] = [];
    for (let n = 0; n < 54; n++)
        rb.push((raw[n >> 3]! >> (n & 7)) & 1);
    let out = "";
    for (let c = 0; c < 9; c++) {
        let s = 0;
        for (let j = 0; j < 6; j++)
            s += rb[6 * c + j]! << j;
        out += alpha[s]!;
    }
    return out;
}
export function decode(rom: RomFile, tid: string, spec: Spec): unknown {
    const t = spec.t;
    switch (t) {
        case "arr": {
            const [size, signed] = ENC[spec["enc"] as string]!;
            const n = num(spec, "n");
            const b = read(rom, num(spec, "off"), n * size, tid);
            const out: number[] = [];
            for (let i = 0; i < n; i++)
                out.push(uOf(b.subarray(i * size, (i + 1) * size), signed));
            return out;
        }
        case "str": return text(rom, num(spec, "off"), num(spec, "len"), spec["x"] as string, tid);
        case "strs": return (spec["items"] as [
            number,
            number,
            string
        ][]).map(([o, n, x]) => text(rom, o, n, x, tid));
        case "loadout": {
            const raw = read(rom, num(spec, "off"), 8, tid);
            const out: {
                item_id: number;
                amount_raw: number;
                amount: number;
            }[] = [];
            for (let i = 0; i < 2; i++) {
                const item = uOf(raw.subarray(4 * i, 4 * i + 2), false);
                const amount = uOf(raw.subarray(4 * i + 2, 4 * i + 4), false);
                if (item === 0)
                    break;
                out.push({ item_id: item, amount_raw: amount, amount: amount >> 8 });
            }
            return out;
        }
        case "sound": {
            const n = num(spec, "n");
            const raw = read(rom, num(spec, "off"), 3 * n, tid);
            const out: {
                id: number;
                mode: number;
                cmd: number;
                var: number;
            }[] = [];
            for (let i = 0; i < n; i++)
                out.push({ id: i, mode: raw[3 * i]!, cmd: raw[3 * i + 1]!, var: raw[3 * i + 2]! });
            return out;
        }
        case "trig": {
            const out: number[] = [];
            for (let i = 0; i < num(spec, "n"); i++)
                out.push(uOf(read(rom, num(spec, "off") + 4 * i, 2, tid), true));
            return out;
        }
        case "hex32": return hex(uOf(read(rom, num(spec, "off"), 4, tid), false)).padStart(8, "0");
        case "runs": {
            const raw = read(rom, num(spec, "off"), num(spec, "n"), tid);
            const names = spec["bits"] as string[];
            const runs: [
                number,
                number
            ][] = [];
            for (const b of raw) {
                const last = runs[runs.length - 1];
                if (last && last[0] === b)
                    last[1]++;
                else
                    runs.push([b, 1]);
            }
            return runs.map(([b, c]) => {
                const buttons: string[] = [];
                for (let j = 0; j < 8; j++)
                    if ((b >> j) & 1)
                        buttons.push(names[j]!);
                return { buttons, ticks: c };
            });
        }
        case "u16": {
            const v = u(rom, num(spec, "off"), 2, tid);
            const shr = num(spec, "shr");
            if (v & ((1 << shr) - 1))
                throw new TablesError(`${tid}: the low byte of the word at 0x${hex(num(spec, "off"))} is not zero`);
            return v >> shr;
        }
        case "pickname": return messageName(read(rom, msgAddr(rom, spec, tid), 36, tid));
        case "voice": return voice(rom, msgAddr(rom, spec, tid), tid);
        case "pickclass": {
            const [byClass, medipack] = classMap(rom, spec, tid);
            if (spec["item"] === 0)
                return medipack;
            const inv = new Map<number, number>();
            for (const [k, v] of byClass)
                inv.set(v, k);
            const r = inv.get(num(spec, "item"));
            if (r === undefined)
                throw new TablesError(`${tid}: no class gives item ${String(spec["item"])}`);
            return r;
        }
        case "noeffect": {
            const trig: number[] = [];
            for (let c = 0; c < 0x83; c++)
                trig.push(u(rom, num(spec, "tbl") + 4 * c, 4, tid));
            const out: number[] = [];
            for (let c = num(spec, "lo"); c < num(spec, "hi"); c++)
                if (trig[c] === trig[0])
                    out.push(c);
            return out;
        }
        case "fire": return fire(rom, spec, tid);
        case "enemy": return enemy(rom, spec, tid);
        case "pwcode": {
            if ("lit" in spec) {
                const [a, b] = (spec["spans"] as Record<string, [
                    number,
                    number
                ]>)[spec["lit"] as string]!;
                return literal(rom, a, b, tid)[0];
            }
            return pwEncode(rom, spec, tid);
        }
        case "named": {
            const [a, b] = spec["span"] as [
                number,
                number
            ];
            const [code, level] = literal(rom, a, b, tid);
            return { code, level_byte: level, episode: (level >> 4) & 3, floor: level & 15, table_accepts: u(rom, num(spec, "valid") + (level & 0x3f), 1, tid) !== 0 };
        }
    }
    throw new TablesError(`${tid}: unknown table type '${t}'`);
}
export const TABLE_IDS: readonly string[] = Object.keys(SPECS).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
export function buildTables(rom: RomFile): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const tid of TABLE_IDS)
        out[tid] = decode(rom, tid, SPECS[tid]!);
    return out;
}
export const tables: Command = {
    name: "tables",
    run(ctx) {
        ctx.say(`tables: ${TABLE_IDS.length} value(s)`);
        ctx.writeJson(TABLES_OUT, { format: TABLES_FORMAT, tables: buildTables(ctx.rom) });
    },
};

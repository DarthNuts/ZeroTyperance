import { isObj, needArr, needInt, needStr } from "../boot/assets_parse.js";
import type { OptionsConstants } from "./constants.js";
export const SOUND_TABLE_FORMAT = "zt-data/1";
export interface SoundRow {
    mode: number;
    cmd: number;
    var: number;
}
export interface SoundTable {
    name: string;
    rows: readonly SoundRow[];
}
export function parseSoundTable(doc: unknown, name: string): SoundTable {
    const where = `sound table ${name}`;
    const format = needStr(doc, "format", where);
    if (format !== SOUND_TABLE_FORMAT)
        throw new Error(`${where}: format ${format}, expected ${SOUND_TABLE_FORMAT}`);
    const docName = needStr(doc, "name", where);
    if (docName !== name)
        throw new Error(`${where}: the document's name is ${docName}`);
    const data = isObj(doc) ? doc.data : undefined;
    if (!isObj(data))
        throw new Error(`${where}: no data object`);
    const rows = needArr(data, "entries", where).map((e, i): SoundRow => {
        const w = `${where} entries[${i}]`;
        if (isObj(e) && e.id !== undefined && e.id !== i)
            throw new Error(`${w}: id ${JSON.stringify(e.id)} is not its row number ${i}`);
        return { mode: needInt(e, "mode", w), cmd: needInt(e, "cmd", w), var: needInt(e, "var", w) };
    });
    return { name, rows: Object.freeze(rows) };
}
export function checkSoundTable(table: SoundTable, C: OptionsConstants): void {
    const where = `sound table ${table.name}`;
    if (table.name !== C.TEST_TABLE)
        throw new Error(`${where}: OPTIONS.TEST_TABLE is ${C.TEST_TABLE}`);
    if (C.TEST_MIN < 0 || C.TEST_MAX < C.TEST_MIN)
        throw new Error(`${where}: the range TEST_MIN..TEST_MAX (${C.TEST_MIN}..${C.TEST_MAX}) is empty`);
    if (table.rows.length <= C.TEST_MAX)
        throw new Error(`${where}: ${table.rows.length} rows, the Sound Test reaches row ${C.TEST_MAX}`);
    for (let n = C.TEST_MIN; n <= C.TEST_MAX; n++) {
        const m = table.rows[n]!.mode;
        if (m !== C.TEST_MODE_MUSIC && m !== C.TEST_MODE_SFX && !C.TEST_MODES_VOICE.includes(m)) {
            throw new Error(`${where}: row ${n} has mode ${m}, which is none of TEST_MODE_MUSIC, TEST_MODE_SFX, TEST_MODES_VOICE`);
        }
    }
    const beep = table.rows[C.BEEP_SOUND_NUMBER];
    if (!beep || beep.mode !== C.TEST_MODE_SFX || beep.cmd !== C.BEEP_SFX_ID || beep.var !== C.BEEP_NOTE) {
        throw new Error(`${where}: row BEEP_SOUND_NUMBER (${C.BEEP_SOUND_NUMBER}) is ${JSON.stringify(beep)}, not the beep (mode TEST_MODE_SFX, cmd BEEP_SFX_ID, var BEEP_NOTE)`);
    }
    const title = table.rows[C.TITLE_MUSIC_NUMBER];
    if (!title || title.mode !== C.TEST_MODE_MUSIC || title.var !== C.MUSIC_1_VALUE || title.cmd !== C.MUSIC_2_VALUE) {
        throw new Error(`${where}: row TITLE_MUSIC_NUMBER (${C.TITLE_MUSIC_NUMBER}) is ${JSON.stringify(title)}, not the title music pair (mode TEST_MODE_MUSIC, var MUSIC_1_VALUE, cmd MUSIC_2_VALUE)`);
    }
}
export function serializeSoundTable(t: SoundTable): unknown {
    return { name: t.name, rows: t.rows.map((r) => ({ mode: r.mode, cmd: r.cmd, var: r.var })) };
}
export function deserializeSoundTable(x: unknown): SoundTable {
    const where = "sound table";
    const name = needStr(x, "name", where);
    const rows = needArr(x, "rows", where).map((r, i) => {
        const w = `${where} rows[${i}]`;
        return { mode: needInt(r, "mode", w), cmd: needInt(r, "cmd", w), var: needInt(r, "var", w) };
    });
    return { name, rows: Object.freeze(rows) };
}

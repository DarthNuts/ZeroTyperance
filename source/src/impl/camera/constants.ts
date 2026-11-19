import { specDataFrom, typedConstants } from "../tick/spec_data.js";
const NUMERIC_IDS = [
    "MARKER_CLASS", "CREATE_RANGE", "HP", "SPAWN_FLAGS", "DETECT_RANGE", "DETECT_RANGE_CHAR4", "CHAR_SLOT", "LOSE_RANGE", "ALARM_COUNTER", "ALARM_COUNTER_CHAR4",
    "BEEP_MASK", "BEEP_SOUND", "ALERT_SOUND", "DOOR_SOUND", "SCAN_HALF", "SPAWN_COUNTER", "CELL_RESTORE_BLOCK", "OPEN_BLOCK_HORIZONTAL", "OPEN_BLOCK_VERTICAL",
    "POP_SOUND", "POP_RANGE", "POP_FLAGS_MASK", "POP_Z", "POP_Z_MIN", "POP_LIFE",
] as const;
const LIST_IDS = ["DOOR_HORIZONTAL", "DOOR_VERTICAL"] as const;
const OTHER_IDS = ["ENEMY_TABLE"] as const;
export type CameraConstants = ReturnType<typeof cameraConstantsFrom>;
export function cameraConstantsFrom(doc: unknown) {
    const where = "camera";
    const t = typedConstants(specDataFrom(doc, "ZT-ENT-CAMERA", "CAMERA.", where), where, NUMERIC_IDS, LIST_IDS, OTHER_IDS);
    const table = t.ENEMY_TABLE as unknown;
    if (!table || typeof table !== "object" || !Object.values(table as object).every((v) => typeof v === "number"))
        throw new Error(`${where}: ENEMY_TABLE is not a table of numbers by class`);
    return { ...t, ENEMY_TABLE: table as Readonly<Record<string, number>> };
}

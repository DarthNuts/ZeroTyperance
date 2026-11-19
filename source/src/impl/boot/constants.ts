const IDS = [
    "TICKS",
    "MUSIC_1_OPCODE", "MUSIC_1_VALUE", "MUSIC_2_OPCODE", "MUSIC_2_VALUE",
    "BANNER_SETUP_TICK", "BANNER_FADE_IN_ITERATIONS", "BANNER_FADE_OUT_ITERATIONS", "BANNER_FADE_STEPS",
    "BANNER_TARGET_WHITE",
    "BLANK_TICK", "VSCROLL_LOGO",
    "LOGO_LOAD_TICK", "LOGO_FIRST_TICK", "LOGO_FRAMES", "LOGO_PERIOD", "LOGO_HOLD", "LOGO_ROW", "LOGO_COL",
    "LOGO_WIDTH", "LOGO_HEIGHT",
    "SLIDESHOW_START_TICK", "VSCROLL_SLIDESHOW_A", "SLIDESHOW_SCENES", "SLOT_EVEN", "SLOT_ODD",
    "PAL_STEP_TICKS", "PAL_STEPS_SHOWN",
    "SCENE0_WAIT", "SCENE_WAIT", "SCENE14_WAIT", "SCENE21_WAIT", "FINAL_HOLD",
    "CHANNEL_MAX",
] as const;
type Id = (typeof IDS)[number];
export type BootConstants = {
    readonly [K in Id]: number;
};
export const BOOT_DATA_FORMAT = "zt-spec-data/1";
export const BOOT_SPEC = "ZT-UI-BOOT";
interface DataConstant {
    id?: unknown;
    value?: unknown;
}
interface DataDoc {
    format?: unknown;
    spec?: unknown;
    constants?: unknown;
}
export function bootConstantsFrom(doc: unknown): BootConstants {
    const d = doc as DataDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("boot.json: not an object");
    if (d.format !== BOOT_DATA_FORMAT)
        throw new Error(`boot.json: format ${String(d.format)}, expected ${BOOT_DATA_FORMAT}`);
    if (d.spec !== BOOT_SPEC)
        throw new Error(`boot.json: spec ${String(d.spec)}, expected ${BOOT_SPEC}`);
    if (!Array.isArray(d.constants))
        throw new Error("boot.json: no constants array");
    const prefix = "BOOT.";
    const values = new Map<string, number>();
    for (const c of d.constants as DataConstant[]) {
        if (typeof c.id !== "string" || !c.id.startsWith(prefix))
            throw new Error(`boot.json: a constant without a BOOT.* id: ${JSON.stringify(c.id)}`);
        if (typeof c.value !== "number" || !Number.isInteger(c.value))
            throw new Error(`boot.json: ${c.id} has no integer value`);
        if (values.has(c.id))
            throw new Error(`boot.json: ${c.id} appears twice`);
        values.set(c.id, c.value);
    }
    const out: Record<string, number> = {};
    for (const id of IDS) {
        const v = values.get(prefix + id);
        if (v === undefined)
            throw new Error(`boot.json: ${prefix}${id} (used by the spec) is missing`);
        out[id] = v;
    }
    for (const id of values.keys()) {
        if (!(IDS as readonly string[]).includes(id.slice(prefix.length)))
            throw new Error(`boot.json: ${id} is not an id this implementation knows; spec and data file disagree`);
    }
    return Object.freeze(out) as BootConstants;
}

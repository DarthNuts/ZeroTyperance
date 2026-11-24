export const APP_DATA_FORMAT = "zt-spec-data/1";
export const APP_SPEC = "ZT-APP-RELEASE";
export const APP_DATA_URL = "release_constants.json";
export const APP_VERSION_ID = "APP.VERSION";
export const UNVERSIONED = "0.0.0-unversioned";
export interface AppConstants {
    readonly title: string;
    readonly notice: string;
    readonly appVersion: string;
    readonly coopServer: string;
    readonly rom: {
        readonly bundled: string;
        readonly bundledNote: string;
    };
    readonly romSize: number;
    readonly assetsDb: string;
    readonly settingsKey: string;
    readonly speed: {
        readonly originalBlanks: number;
        readonly customMin: number;
        readonly customMax: number;
        readonly customDefault: number;
    };
    readonly keys: Readonly<Record<"up" | "down" | "left" | "right" | "a" | "b" | "c" | "start" | "menu" | "fullscreen" | "mute" | "stateSave" | "stateLoad" | "savePassword" | "renderer" | "layout" | "moment" | "motionLog", string>>;
    readonly pad: Readonly<Record<"up" | "down" | "left" | "right" | "a" | "b" | "c" | "start" | "menu", number>> & {
        readonly stickDeadZone: number;
    };
    readonly audio: {
        readonly volumeDefault: number;
        readonly volumeMax: number;
        readonly volumeStep: number;
    };
    readonly state: {
        readonly slots: number;
        readonly format: number;
        readonly db: string;
    };
    readonly pw: {
        readonly slots: number;
        readonly noticeMs: number;
    };
    readonly mouse: {
        readonly sensMin: number;
        readonly sensMax: number;
        readonly sensDefault: number;
        readonly drain: number;
        readonly capBlanks: number;
    };
    readonly modern: {
        readonly keys: Readonly<Record<"forward" | "back" | "strafeLeft" | "strafeRight" | "turnLeft" | "turnRight" | "jump" | "crouch" | "fire" | "nextItem" | "prevItem" | "slot1" | "slot2" | "slot3" | "slot4" | "slot5" | "pause", readonly string[]>>;
        readonly mouse: {
            readonly sensMin: number;
            readonly sensMax: number;
            readonly sensDefault: number;
            readonly smoothMax: number;
        };
    };
    readonly slides: {
        readonly titles: readonly string[];
        readonly texts: readonly string[];
        readonly ms: number;
    };
    readonly touch: {
        readonly default: "auto" | "on" | "off";
        readonly dpadSize: number;
        readonly dpadDeadzone: number;
        readonly buttonSize: number;
        readonly margin: number;
        readonly opacity: number;
    };
}
export const COOP_SERVER_ID = "APP.COOP_SERVER";
export function isCoopServerAddress(v: string): boolean {
    return /^wss?:\/\/[^/?#\s]+(?:[/?#]\S*)?$/i.test(v);
}
function coopServer(v: unknown): string {
    if (typeof v !== "string" || (v !== "" && !isCoopServerAddress(v)))
        throw new Error(`app_release.json: ${COOP_SERVER_ID} is neither empty nor a ws:// / wss:// address`);
    return v;
}
function touchMode(v: string): "auto" | "on" | "off" {
    if (v !== "auto" && v !== "on" && v !== "off")
        throw new Error(`app_release.json: APP.TOUCH.DEFAULT ${v}`);
    return v;
}
interface DataDoc {
    format?: unknown;
    spec?: unknown;
    constants?: unknown;
}
export function appConstantsFrom(doc: unknown): AppConstants {
    const d = doc as DataDoc | null;
    if (!d || typeof d !== "object")
        throw new Error("app_release.json: not an object");
    if (d.format !== APP_DATA_FORMAT)
        throw new Error(`app_release.json: format ${String(d.format)}`);
    if (d.spec !== APP_SPEC)
        throw new Error(`app_release.json: spec ${String(d.spec)}`);
    if (!Array.isArray(d.constants))
        throw new Error("app_release.json: no constants array");
    const byId = new Map<string, unknown>();
    for (const c of d.constants as {
        id?: unknown;
        value?: unknown;
    }[]) {
        if (typeof c.id !== "string" || !c.id.startsWith("APP."))
            throw new Error("app_release.json: a constant without an APP.* id");
        byId.set(c.id, c.value);
    }
    const int = (id: string): number => {
        const v = byId.get(id);
        if (typeof v !== "number" || !Number.isInteger(v))
            throw new Error(`app_release.json: ${id} is not an integer`);
        return v;
    };
    const num = (id: string): number => {
        const v = byId.get(id);
        if (typeof v !== "number" || !Number.isFinite(v))
            throw new Error(`app_release.json: ${id} is not a number`);
        return v;
    };
    const name = (id: string): string => {
        const v = byId.get(id);
        if (typeof v !== "string" || v === "")
            throw new Error(`app_release.json: ${id} is not a name`);
        return v;
    };
    const list = (id: string): readonly string[] => {
        const v = byId.get(id);
        if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== "string" || x === ""))
            throw new Error(`app_release.json: ${id} is not a list of bindings`);
        return Object.freeze([...(v as string[])]);
    };
    return Object.freeze({
        title: name("APP.TITLE"),
        notice: name("APP.NOTICE"),
        appVersion: byId.has(APP_VERSION_ID) ? name(APP_VERSION_ID) : UNVERSIONED,
        coopServer: coopServer(byId.get(COOP_SERVER_ID)),
        rom: Object.freeze({ bundled: name("APP.ROM.BUNDLED"), bundledNote: name("APP.ROM.BUNDLED_NOTE") }),
        romSize: int("APP.ROM.SIZE"),
        assetsDb: name("APP.STORE.ASSETS_DB"),
        settingsKey: name("APP.STORE.SETTINGS_KEY"),
        speed: Object.freeze({
            originalBlanks: int("APP.SPEED.ORIGINAL_BLANKS"),
            customMin: int("APP.SPEED.CUSTOM_MIN"),
            customMax: int("APP.SPEED.CUSTOM_MAX"),
            customDefault: int("APP.SPEED.CUSTOM_DEFAULT"),
        }),
        keys: Object.freeze({
            up: name("APP.KEYS.UP"), down: name("APP.KEYS.DOWN"), left: name("APP.KEYS.LEFT"), right: name("APP.KEYS.RIGHT"),
            a: name("APP.KEYS.A"), b: name("APP.KEYS.B"), c: name("APP.KEYS.C"), start: name("APP.KEYS.START"),
            menu: name("APP.KEYS.MENU"), fullscreen: name("APP.KEYS.FULLSCREEN"), mute: name("APP.KEYS.MUTE"),
            stateSave: name("APP.KEYS.STATE_SAVE"), stateLoad: name("APP.KEYS.STATE_LOAD"), savePassword: name("APP.KEYS.SAVE_PASSWORD"), renderer: name("APP.KEYS.RENDERER"), layout: name("APP.KEYS.LAYOUT"), moment: name("APP.KEYS.MOMENT"), motionLog: name("APP.KEYS.MOTIONLOG"),
        }),
        pw: Object.freeze({ slots: int("APP.PW.SLOTS"), noticeMs: int("APP.PW.NOTICE_MS") }),
        mouse: Object.freeze({
            sensMin: int("APP.MOUSE.SENS_MIN"), sensMax: int("APP.MOUSE.SENS_MAX"), sensDefault: int("APP.MOUSE.SENS_DEFAULT"),
            drain: int("APP.MOUSE.DRAIN"), capBlanks: int("APP.MOUSE.CAP_BLANKS"),
        }),
        state: Object.freeze({ slots: int("APP.STATE.SLOTS"), format: int("APP.STATE.FORMAT"), db: name("APP.STORE.STATES_DB") }),
        pad: Object.freeze({
            up: int("APP.PAD.UP"), down: int("APP.PAD.DOWN"), left: int("APP.PAD.LEFT"), right: int("APP.PAD.RIGHT"),
            a: int("APP.PAD.A"), b: int("APP.PAD.B"), c: int("APP.PAD.C"), start: int("APP.PAD.START"), menu: int("APP.PAD.MENU"),
            stickDeadZone: num("APP.PAD.STICK_DEADZONE"),
        }),
        modern: Object.freeze({
            keys: Object.freeze({
                forward: list("APP.MODERN.KEYS.FORWARD"), back: list("APP.MODERN.KEYS.BACK"),
                strafeLeft: list("APP.MODERN.KEYS.STRAFE_LEFT"), strafeRight: list("APP.MODERN.KEYS.STRAFE_RIGHT"),
                turnLeft: list("APP.MODERN.KEYS.TURN_LEFT"), turnRight: list("APP.MODERN.KEYS.TURN_RIGHT"),
                jump: list("APP.MODERN.KEYS.JUMP"), crouch: list("APP.MODERN.KEYS.CROUCH"), fire: list("APP.MODERN.KEYS.FIRE"),
                nextItem: list("APP.MODERN.KEYS.NEXT_ITEM"), prevItem: list("APP.MODERN.KEYS.PREV_ITEM"),
                slot1: list("APP.MODERN.KEYS.SLOT_1"), slot2: list("APP.MODERN.KEYS.SLOT_2"), slot3: list("APP.MODERN.KEYS.SLOT_3"),
                slot4: list("APP.MODERN.KEYS.SLOT_4"), slot5: list("APP.MODERN.KEYS.SLOT_5"), pause: list("APP.MODERN.KEYS.PAUSE"),
            }),
            mouse: Object.freeze({
                sensMin: int("APP.MODERN.MOUSE.SENS_MIN"), sensMax: int("APP.MODERN.MOUSE.SENS_MAX"),
                sensDefault: int("APP.MODERN.MOUSE.SENS_DEFAULT"), smoothMax: int("APP.MODERN.MOUSE.SMOOTH_MAX"),
            }),
        }),
        touch: Object.freeze({
            default: touchMode(name("APP.TOUCH.DEFAULT")),
            dpadSize: num("APP.TOUCH.DPAD_SIZE"), dpadDeadzone: num("APP.TOUCH.DPAD_DEADZONE"), buttonSize: num("APP.TOUCH.BUTTON_SIZE"),
            margin: num("APP.TOUCH.MARGIN"), opacity: num("APP.TOUCH.OPACITY"),
        }),
        slides: slidesFrom(list("APP.SLIDES.TITLES"), list("APP.SLIDES.TEXTS"), int("APP.SLIDES.MS")),
        audio: Object.freeze({ volumeDefault: int("APP.AUDIO.VOLUME_DEFAULT"), volumeMax: int("APP.AUDIO.VOLUME_MAX"), volumeStep: int("APP.AUDIO.VOLUME_STEP") }),
    });
}
function slidesFrom(titles: readonly string[], texts: readonly string[], ms: number): AppConstants["slides"] {
    if (titles.length !== texts.length)
        throw new Error(`app_release.json: APP.SLIDES.TITLES has ${titles.length} titles, APP.SLIDES.TEXTS ${texts.length} texts`);
    if (ms <= 0)
        throw new Error("app_release.json: APP.SLIDES.MS is not positive");
    return Object.freeze({ titles, texts, ms });
}

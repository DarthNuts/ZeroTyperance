export const GAME_EVENT_TYPES = [
    "Input.State", "Rng.Seed", "Savestate.Save", "Savestate.Restore",
    "View.Present", "Sprites.Submit", "Camera.SetScroll", "Text.Draw", "Screen.Compose",
    "Hud.Update", "Palette.Load", "Palette.Cycle", "Video.SetMode", "Video.Raw",
    "Audio.PlaySfx", "Audio.PlayVoice", "Audio.PlayMusic", "Audio.StopTrack", "Audio.Stop",
    "Audio.Pause", "Audio.Resume", "Audio.ChannelCtl", "Audio.ChannelProtect", "Audio.Raw",
    "Audio.Request", "Combat.Hit", "Floor.Recount", "Map.Write", "Flow.Exit",
] as const;
export type GameEventType = (typeof GAME_EVENT_TYPES)[number];
interface EventBase<T extends GameEventType> {
    tick: number;
    type: T;
    origin?: string;
    outcome?: unknown;
}
export type Via = "dma" | "port";
export interface InputStateEvent extends EventBase<"Input.State"> {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    a: boolean;
    b: boolean;
    c: boolean;
    start: boolean;
    x: boolean;
    y: boolean;
    z: boolean;
    mode: boolean;
}
export interface RngSeedEvent extends EventBase<"Rng.Seed"> {
    hardware: number;
    injected: number;
    hv_reads: number;
}
export interface SavestateEvent extends EventBase<"Savestate.Save" | "Savestate.Restore"> {
}
export interface ViewPresentEvent extends EventBase<"View.Present"> {
    via: Via;
    half: 0 | 1 | null;
    vram_addr: number;
    words: number;
    sha256: string;
}
export interface Sprite {
    x: number;
    y: number;
    w: number;
    h: number;
    link: number;
    tile: number;
    pal: number;
    prio: boolean;
    hflip: boolean;
    vflip: boolean;
}
export interface SpritesSatEvent extends EventBase<"Sprites.Submit"> {
    kind: "sat";
    via: Via;
    first: number;
    count: number;
    entries: Sprite[];
}
export interface SpritesSatPatchEvent extends EventBase<"Sprites.Submit"> {
    kind: "sat";
    via: Via;
    first_word: number;
    words: number;
    sha256: string;
}
export interface SpritesPatternEvent extends EventBase<"Sprites.Submit"> {
    kind: "pattern";
    via: Via;
    tile: number;
    offset: number;
    words: number;
    sha256: string;
}
export interface CameraScrollHEvent extends EventBase<"Camera.SetScroll"> {
    axis: "h";
    via: Via;
    line: number;
    plane: "a" | "b";
    words: number;
    values: number[];
}
export interface CameraScrollVEvent extends EventBase<"Camera.SetScroll"> {
    axis: "v";
    via: Via;
    index: number;
    words: number;
    values: number[];
}
export interface TextDrawEvent extends EventBase<"Text.Draw"> {
    plane: "a" | "b" | "window";
    row: number;
    col: number;
    cells: number[];
}
export interface ScreenPlaneEvent extends EventBase<"Screen.Compose"> {
    region: "plane_a" | "plane_b" | "plane_window";
    via: Via;
    row: number;
    col: number;
    step: number;
    words: number;
    sha256: string;
}
export interface ScreenPatternsEvent extends EventBase<"Screen.Compose"> {
    region: "patterns";
    via: Via;
    tile: number;
    offset: number;
    words: number;
    sha256: string;
}
export interface HudUpdateEvent extends EventBase<"Hud.Update"> {
    via: Via;
    tile: number;
    offset: number;
    words: number;
    sha256: string;
}
export interface PaletteLoadEvent extends EventBase<"Palette.Load"> {
    via: Via;
    first: number;
    count: number;
    colors: number[];
}
export interface PaletteCycleEvent extends EventBase<"Palette.Cycle"> {
    via: Via;
    index: number;
    color: number;
}
export interface VideoSetModeEvent extends EventBase<"Video.SetMode"> {
    reg: number;
    value: number;
}
export interface VideoRawEvent extends EventBase<"Video.Raw"> {
    op: "vram_read" | "dma_fill_copy" | "dma_skipped" | "data_ignored";
    vram_addr?: number;
    words?: number;
    mode?: number;
    target?: string;
    code?: number;
}
export interface AudioPlaySfxEvent extends EventBase<"Audio.PlaySfx"> {
    channel: number;
    id: number;
    note: number;
}
export interface AudioPlayVoiceEvent extends EventBase<"Audio.PlayVoice"> {
    channel: number;
    id: number;
    param: number;
}
export interface AudioPlayMusicEvent extends EventBase<"Audio.PlayMusic"> {
    opcode: 5 | 16;
    value: number;
}
export interface AudioStopTrackEvent extends EventBase<"Audio.StopTrack"> {
    id: number;
}
export interface AudioStopEvent extends EventBase<"Audio.Stop"> {
}
export interface AudioPauseEvent extends EventBase<"Audio.Pause"> {
}
export interface AudioResumeEvent extends EventBase<"Audio.Resume"> {
}
export interface AudioChannelCtlEvent extends EventBase<"Audio.ChannelCtl"> {
    opcode: 0 | 1;
    on: boolean;
    channel: number;
    value: number;
}
export interface AudioChannelProtectEvent extends EventBase<"Audio.ChannelProtect"> {
    on: boolean;
    channel: number;
}
export interface AudioRawEvent extends EventBase<"Audio.Raw"> {
    opcode?: number | null;
    bytes?: number[];
    psg?: number;
    reason: "unmapped_opcode" | "unknown_opcode" | "unpaired" | "incomplete" | "orphan" | "psg_write";
}
export interface AudioRequestEvent extends EventBase<"Audio.Request"> {
    request: number;
    outcome?: {
        accepted: boolean;
    };
}
export interface CombatHitEvent extends EventBase<"Combat.Hit"> {
    target: "player" | "entity";
    slot?: number;
    impulse: number;
    dx: number;
    dy: number;
}
export interface FloorRecountEvent extends EventBase<"Floor.Recount"> {
}
export interface MapWriteEvent extends EventBase<"Map.Write"> {
    floor: number | null;
    x: number | null;
    y: number | null;
    block: number;
}
export const FLOW_EXIT_TARGETS = ["start", "options", "demo", "title", "password", "game"] as const;
export type FlowExitTarget = (typeof FLOW_EXIT_TARGETS)[number];
export interface FlowExitEvent extends EventBase<"Flow.Exit"> {
    to: FlowExitTarget;
}
export type BoundaryEvent = InputStateEvent | RngSeedEvent | SavestateEvent | ViewPresentEvent | SpritesSatEvent | SpritesSatPatchEvent | SpritesPatternEvent | CameraScrollHEvent | CameraScrollVEvent | TextDrawEvent | ScreenPlaneEvent | ScreenPatternsEvent | HudUpdateEvent | PaletteLoadEvent | PaletteCycleEvent | VideoSetModeEvent | VideoRawEvent | AudioPlaySfxEvent | AudioPlayVoiceEvent | AudioPlayMusicEvent | AudioStopTrackEvent | AudioStopEvent | AudioPauseEvent | AudioResumeEvent | AudioChannelCtlEvent | AudioChannelProtectEvent | AudioRawEvent | AudioRequestEvent | CombatHitEvent | FloorRecountEvent | MapWriteEvent | FlowExitEvent;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type GameEvent = DistributiveOmit<BoundaryEvent, "tick"> & {
    tick?: number;
};

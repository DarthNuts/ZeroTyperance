export type SlotTileSource = (slot: number) => Uint8Array | undefined;
export interface PauseAssets {
    readonly backdrop: ReadonlyArray<readonly number[]>;
    readonly captionCram: readonly number[];
    readonly tiles: SlotTileSource;
    readonly classToLook: readonly number[];
    readonly looks: ReadonlyArray<ReadonlyArray<readonly number[]>>;
    readonly planFirstWord: number;
    readonly planFirstSlot: number;
    readonly marker: {
        readonly attr: number;
        readonly tile: Uint8Array;
    };
    readonly labels: readonly string[];
    readonly labelWord: {
        readonly blank: number;
        readonly digit: number;
        readonly letter: number;
    };
    readonly levelNames: readonly string[];
    readonly status: {
        readonly secured: string;
        readonly notSecured: string;
    };
    readonly carryTitles: {
        readonly episode1: string;
        readonly other: string;
    };
    readonly writer: ReadonlyMap<number, {
        readonly upper: number;
        readonly lower: number;
    }>;
    readonly clearWord: number;
}
export interface PauseInputs {
    readonly episode: number;
    readonly playerFloor: number;
    readonly countedFloor: number;
    readonly countdown: number;
    readonly pos: {
        readonly x: number;
        readonly y: number;
    };
    readonly frame: number;
    readonly sfxOn: boolean;
    readonly cells: ArrayLike<number>;
    readonly classOfBlock: readonly number[];
    readonly gameCram: readonly number[];
    readonly entries: readonly string[];
    readonly carried: string;
}
export interface PauseFrameRecord {
    readonly display: 0 | 1;
    readonly cram: readonly number[];
    readonly indices: Uint8Array;
}
export interface PauseFrameResult {
    readonly requests: readonly number[];
    readonly closed: boolean;
}

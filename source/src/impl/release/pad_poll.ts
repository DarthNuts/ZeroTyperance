export interface GamepadLike {
    readonly buttons: ReadonlyArray<{
        readonly pressed: boolean;
    }>;
    readonly axes: readonly number[];
}
export interface PadSink {
    setPad(buttons: readonly boolean[], axes: readonly number[]): void;
    releaseAll(): void;
}
export interface PadPoll {
    read(): {
        readonly buttons: boolean[];
        readonly axes: readonly number[];
    } | null;
    readonly focused: boolean;
}
export function padPoll(src: {
    getGamepads(): ArrayLike<GamepadLike | null | undefined>;
    hasFocus(): boolean;
}, sink: PadSink): PadPoll {
    let focused = true;
    return {
        read() {
            if (!src.hasFocus()) {
                if (focused) {
                    focused = false;
                    sink.releaseAll();
                }
                return null;
            }
            focused = true;
            const gp = Array.from(src.getGamepads()).find((p) => p !== null && p !== undefined);
            if (!gp)
                return null;
            return { buttons: gp.buttons.map((b) => b.pressed), axes: gp.axes };
        },
        get focused() { return focused; },
    };
}

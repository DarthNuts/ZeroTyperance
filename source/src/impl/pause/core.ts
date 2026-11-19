import type { PauseConstants } from "./constants.js";
import { buildStatic, composePause, planeAWords } from "./screen.js";
import type { PauseStatic } from "./screen.js";
import type { PauseAssets, PauseFrameRecord, PauseFrameResult, PauseInputs } from "./types.js";
export interface PauseScreen {
    readonly frame: number;
    readonly browsed: number;
}
export class PauseScreenImpl implements PauseScreen {
    static readonly unsavedFields: readonly string[] = ["cache", "st"];
    frame = 0;
    browsed: number;
    upCount: number | null = null;
    downCount: number | null = null;
    prevPad: number;
    st: PauseStatic | undefined;
    cache: Map<string, Uint8Array> | undefined = new Map<string, Uint8Array>();
    constructor(readonly inputs: PauseInputs, readonly assets: PauseAssets, readonly C: PauseConstants) {
        this.browsed = inputs.countedFloor;
        this.prevPad = 1 << C.PAD.START_BIT;
        this.st = buildStatic(inputs, assets, C);
    }
}
function acts(count: number, C: PauseConstants): boolean {
    if (count === 0 || count === C.BROWSE.REPEAT_FIRST)
        return true;
    return count > C.BROWSE.REPEAT_FIRST && (count - C.BROWSE.REPEAT_FIRST) % C.BROWSE.REPEAT_PERIOD === 0;
}
function markerVisible(s: PauseScreenImpl, i: number): boolean {
    const C = s.C;
    if (i < C.MARKER.FIRST_FRAME)
        return false;
    const counter = s.inputs.frame + C.ENTRY.BLANKS + i - C.MARKER.PHASE_BACK;
    return ((counter >> C.MARKER.BLINK_BIT) & 1) === 1;
}
export function pauseOpen(inputs: PauseInputs, assets: PauseAssets, C: PauseConstants): PauseScreen {
    return new PauseScreenImpl(inputs, assets, C);
}
export function pauseFrameRecord(screen: PauseScreen): PauseFrameRecord {
    const s = screen as PauseScreenImpl;
    const vis = markerVisible(s, s.frame);
    const key = `${s.browsed}:${vis ? 1 : 0}`;
    s.cache ??= new Map<string, Uint8Array>();
    const st = (s.st ??= buildStatic(s.inputs, s.assets, s.C));
    let indices = s.cache.get(key);
    if (indices === undefined) {
        indices = composePause(st, planeAWords(s.browsed, s.inputs, s.assets, s.C), vis, s.inputs, s.assets, s.C);
        s.cache.set(key, indices);
    }
    return { display: 1, cram: st.cram, indices };
}
export function pauseFrame(screen: PauseScreen, pad: number): PauseFrameResult {
    const s = screen as PauseScreenImpl;
    const C = s.C;
    const requests: number[] = [];
    const held = (bit: number): boolean => ((pad >> bit) & 1) === 1;
    const step = (prev: number | null, down: boolean): number | null => (down ? (prev === null ? 0 : prev + 1) : null);
    s.upCount = step(s.upCount, held(C.PAD.UP_BIT));
    s.downCount = step(s.downCount, held(C.PAD.DOWN_BIT));
    if (s.upCount !== null && acts(s.upCount, C) && s.browsed > C.BROWSE.LOWEST) {
        s.browsed -= 1;
        requests.push(C.BROWSE.SOUND_REQUEST);
    }
    if (s.downCount !== null && acts(s.downCount, C) && s.browsed < s.inputs.countedFloor) {
        s.browsed += 1;
        requests.push(C.BROWSE.SOUND_REQUEST);
    }
    const startBit = 1 << C.PAD.START_BIT;
    const closed = (pad & startBit) !== 0 && (s.prevPad & startBit) === 0;
    s.prevPad = pad;
    s.frame += 1;
    return { requests, closed };
}

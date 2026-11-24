import type { SnapshotKeeper, ViewSnapshot } from "./snapshot.js";
export interface CoopKeepHooks {
    ownSeat(): 0 | 1;
    dueMs(): number;
    runningStep(): number | null;
    ownSnapshot(step: number | null): void;
    replaced(): void;
}
export function camDiffers(a: ViewSnapshot, b: ViewSnapshot): boolean {
    return a.cam.x !== b.cam.x || a.cam.y !== b.cam.y || a.cam.angle !== b.cam.angle;
}
export class CoopKeep {
    state: object | null = null;
    afterRestore: [
        boolean,
        boolean
    ] = [false, false];
    private restoring: [
        number | null,
        number | null
    ] = [null, null];
    boundaryMs = 0;
    recorded = 0;
    eases = 0;
    constructor(readonly keeper: SnapshotKeeper, private readonly h: CoopKeepHooks) { }
    private readonly sessionSteps = new WeakMap<ViewSnapshot, number | null>();
    sessionStepOf(s: ViewSnapshot | undefined): number | null { return s === undefined ? null : this.sessionSteps.get(s) ?? null; }
    reset(state: object | null): void {
        this.keeper.clear();
        this.state = state;
        this.afterRestore = [false, false];
        this.restoring = [null, null];
    }
    replacedAtPicture(state: object): void {
        this.state = state;
        this.afterRestore = [true, true];
        this.restoring = [null, null];
    }
    pass(s: ViewSnapshot, state: object): boolean {
        this.recorded++;
        const running = this.h.runningStep();
        this.sessionSteps.set(s, running);
        if (state !== this.state) {
            this.state = state;
            this.afterRestore = [false, false];
            this.restoring = [this.keeper.newest(0)?.step ?? null, this.keeper.newest(1)?.step ?? null];
        }
        const seat = s.seat;
        let replaced: boolean;
        let differs: boolean;
        const top = this.restoring[seat];
        if (top !== null) {
            const old = this.keeper.pushRestored(s);
            replaced = old !== null;
            differs = old !== null && camDiffers(old, s);
            if (s.step > top)
                this.restoring[seat] = null;
        }
        else {
            const old = this.keeper.at(seat, s.step);
            const after = this.afterRestore[seat];
            this.afterRestore[seat] = false;
            replaced = after ? this.keeper.pushAfterRestore(s) : this.keeper.push(s);
            differs = replaced && old !== null && camDiffers(old, s);
        }
        this.boundaryMs = this.h.dueMs();
        if (seat === this.h.ownSeat()) {
            this.h.ownSnapshot(running);
            if (differs) {
                this.eases++;
                this.h.replaced();
            }
        }
        return replaced;
    }
}

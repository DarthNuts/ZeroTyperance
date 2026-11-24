export type IntroMode = "none" | "start" | "skip";
export class IntroGate {
    private armed = false;
    private released = false;
    private masking = false;
    begin(startHeld: boolean): void {
        this.armed = true;
        this.released = !startHeld;
        this.masking = false;
    }
    disarm(): void {
        this.armed = false;
    }
    get isArmed(): boolean { return this.armed; }
    get isMasking(): boolean { return this.masking; }
    sample(mode: IntroMode, startDown: boolean): boolean {
        if (!this.armed)
            return false;
        if (!startDown) {
            this.released = true;
            return false;
        }
        if (mode !== "start" || !this.released)
            return false;
        this.armed = false;
        this.masking = true;
        return true;
    }
    filter(pad: number, startMask: number): number {
        if (!this.masking)
            return pad;
        if ((pad & startMask) === 0) {
            this.masking = false;
            return pad;
        }
        return pad & ~startMask;
    }
}
export interface IntroHooks {
    inBootScreens(): boolean;
    mode(): IntroMode;
    pad(): number;
    startMask: number;
    skipToTitle(): void;
}
export function introStep(gate: IntroGate, h: IntroHooks): boolean {
    if (!gate.isArmed || !h.inBootScreens())
        return false;
    const mode = h.mode();
    if (mode !== "start")
        return false;
    if (!gate.sample(mode, (h.pad() & h.startMask) !== 0))
        return false;
    h.skipToTitle();
    return true;
}

import type { ModernDescriptor } from "../../modern/seat.js";
export interface PacedSession {
    readonly stage: string;
    readonly pendingWait: number;
}
export const tickRunsStep = (s: PacedSession): boolean => s.stage === "play" && s.pendingWait <= 1;
export function modernForTick(s: PacedSession, take: (() => ModernDescriptor | null) | undefined, kept: ModernDescriptor | null): ModernDescriptor | null {
    if (take === undefined || !tickRunsStep(s))
        return kept;
    return take();
}

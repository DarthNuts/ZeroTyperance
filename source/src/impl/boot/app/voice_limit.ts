export type VoiceMode = "classic" | "once" | "once_per_phrase";
export const BLANKS_PER_SECOND = 60;
export interface PhraseTag {
    readonly key: string;
    readonly first: boolean;
}
export const TEST_ONLY_VOICE = { per: "phrase" as "phrase" | "word", clock: "game" as "game" | "wall" };
export class VoiceLimiter {
    private mode: VoiceMode = "classic";
    private intervalBlanks = 10 * BLANKS_PER_SECOND;
    private now = 0;
    private lastAny: number | null = null;
    private readonly lastOf = new Map<string, number>();
    private current: {
        key: string;
        play: boolean;
    } | null = null;
    private readonly wall: () => number;
    constructor(wall: () => number = () => Date.now()) { this.wall = wall; }
    set(mode: VoiceMode, intervalSec: number): void {
        this.mode = mode;
        this.intervalBlanks = intervalSec * BLANKS_PER_SECOND;
    }
    advance(blanks: number): void { if (blanks > 0)
        this.now += blanks; }
    get time(): number { return TEST_ONLY_VOICE.clock === "wall" ? (this.wall() * BLANKS_PER_SECOND) / 1000 : this.now; }
    word(tag: PhraseTag, wordKey?: string): boolean {
        if (TEST_ONLY_VOICE.per === "word")
            return this.decide(wordKey ?? tag.key);
        if (!tag.first) {
            return this.current === null || this.current.key !== tag.key ? true : this.current.play;
        }
        const play = this.decide(tag.key);
        this.current = { key: tag.key, play };
        return play;
    }
    private decide(key: string): boolean {
        const t = this.time;
        if (this.mode === "classic")
            return true;
        if (this.mode === "once") {
            if (this.lastAny !== null && t - this.lastAny < this.intervalBlanks)
                return false;
            this.lastAny = t;
            return true;
        }
        const last = this.lastOf.get(key);
        if (last !== undefined && t - last < this.intervalBlanks)
            return false;
        this.lastOf.set(key, t);
        return true;
    }
}

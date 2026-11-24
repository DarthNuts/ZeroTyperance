export type PageId = "root" | "gameplay" | "password" | "coop" | "states" | "input" | "video" | "sound" | "cheats" | "about";
export type MenuKey = "up" | "down" | "left" | "right" | "choose" | "back";
export interface RowDef {
    readonly page: Exclude<PageId, "root">;
    readonly label: string;
}
export const GAMEPLAY_ROW: RowDef = { page: "gameplay", label: "Gameplay" };
export const ROWS: readonly RowDef[] = [
    { page: "password", label: "Password" },
    { page: "coop", label: "Co-op" },
    { page: "states", label: "States" },
    { page: "input", label: "Input" },
    { page: "video", label: "Video" },
    { page: "sound", label: "Sound" },
    { page: "cheats", label: "Cheats" },
    { page: "about", label: "About" },
];
export type MenuEffect = {
    type: "none";
} | {
    type: "play";
} | {
    type: "resume";
} | {
    type: "save_password";
} | {
    type: "enter";
    page: PageId;
} | {
    type: "leave";
    page: PageId;
} | {
    type: "item";
    page: PageId;
    index: number;
} | {
    type: "adjust";
    page: PageId;
    index: number;
    delta: -1 | 1;
};
export class MenuModel {
    private pageId: PageId = "root";
    private rootCursor = 0;
    private itemCursor = 0;
    private counts: Partial<Record<PageId, number>> = {};
    gameRunning: boolean;
    levelRunning = false;
    constructor(gameRunning = false) {
        this.gameRunning = gameRunning;
    }
    private rootEntries(): ("play" | "save_password" | RowDef)[] {
        return ["play", GAMEPLAY_ROW, ...(this.levelRunning ? ["save_password" as const] : []), ...ROWS];
    }
    get page(): PageId { return this.pageId; }
    get cursor(): number { return this.rootCursor; }
    get item(): number { return this.itemCursor; }
    rootLabels(): string[] {
        return this.rootEntries().map((e) => (e === "play" ? (this.gameRunning ? "Resume" : "Play") : e === "save_password" ? "Save password" : e.label));
    }
    reenter(page: PageId): void { this.pageId = page; this.itemCursor = 0; }
    setItemCount(page: PageId, n: number): void {
        this.counts[page] = Math.max(0, n);
        if (page === this.pageId && this.itemCursor >= n)
            this.itemCursor = Math.max(0, n - 1);
    }
    open(gameRunning: boolean, levelRunning = false): void {
        this.gameRunning = gameRunning;
        this.levelRunning = levelRunning;
        this.pageId = "root";
        this.rootCursor = 0;
        this.itemCursor = 0;
    }
    press(key: MenuKey): MenuEffect {
        return this.pageId === "root" ? this.pressRoot(key) : this.pressPage(key);
    }
    setLevelRunning(on: boolean): void {
        if (on === this.levelRunning)
            return;
        const at = this.rootEntries()[this.rootCursor];
        this.levelRunning = on;
        this.rootCursor = Math.max(0, this.rootEntries().indexOf(at!));
    }
    private pressRoot(key: MenuKey): MenuEffect {
        const entries = this.rootEntries();
        const n = entries.length;
        switch (key) {
            case "up":
                this.rootCursor = (this.rootCursor + n - 1) % n;
                return { type: "none" };
            case "down":
                this.rootCursor = (this.rootCursor + 1) % n;
                return { type: "none" };
            case "left":
            case "right": return { type: "none" };
            case "choose": {
                const e = entries[this.rootCursor]!;
                if (e === "play")
                    return this.gameRunning ? { type: "resume" } : { type: "play" };
                if (e === "save_password")
                    return { type: "save_password" };
                const page = e.page;
                this.pageId = page;
                this.itemCursor = 0;
                return { type: "enter", page };
            }
            case "back": return this.gameRunning ? { type: "resume" } : { type: "none" };
        }
    }
    private pressPage(key: MenuKey): MenuEffect {
        const page = this.pageId;
        const n = this.counts[page] ?? 0;
        switch (key) {
            case "up":
                if (n > 0)
                    this.itemCursor = (this.itemCursor + n - 1) % n;
                return { type: "none" };
            case "down":
                if (n > 0)
                    this.itemCursor = (this.itemCursor + 1) % n;
                return { type: "none" };
            case "left": return n > 0 ? { type: "adjust", page, index: this.itemCursor, delta: -1 } : { type: "none" };
            case "right": return n > 0 ? { type: "adjust", page, index: this.itemCursor, delta: 1 } : { type: "none" };
            case "choose": return n > 0 ? { type: "item", page, index: this.itemCursor } : { type: "none" };
            case "back":
                this.pageId = "root";
                return { type: "leave", page };
        }
    }
}
export function menuKeyOf(action: string): MenuKey | null {
    switch (action) {
        case "up":
        case "down":
        case "left":
        case "right": return action;
        case "start":
        case "a": return "choose";
        case "b":
        case "menu": return "back";
        default: return null;
    }
}

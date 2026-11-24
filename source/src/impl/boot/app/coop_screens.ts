import type { EventSink } from "../../../domain.js";
import type { ScreenState } from "../../screen_types.js";
import { TitleCore } from "../../title/loop.js";
import type { TitleAssets } from "../../title/assets.js";
import type { TitleConstants } from "../../title/constants.js";
import { OptionsCore } from "../../options/core.js";
import type { OptionsAssets } from "../../options/assets.js";
import type { OptionsConstants } from "../../options/constants.js";
import { TitleOptionsChain } from "../../options/chain.js";
import { PasswordCore } from "../../password/core.js";
import type { PasswordAssets } from "../../password/assets.js";
import type { PasswordConstants } from "../../password/constants.js";
import type { PasswordDecoder } from "../../password/types.js";
import { CharselCore } from "../../charsel/core.js";
import type { CharselAssets } from "../../charsel/assets.js";
import type { CharselConstants } from "../../charsel/constants.js";
import { BriefingCore } from "../../briefing/core.js";
import type { BriefingAssets } from "../../briefing/assets.js";
import type { BriefingConstants } from "../../briefing/constants.js";
import type { TitleHandOver } from "../../options/core.js";
import { PATTERN_BYTES, SLOT_COUNT } from "../model.js";
import { colourRgb, renderState } from "./render.js";
import type { Frame } from "./render.js";
import { NEW_GAME_ALIVE, NEW_GAME_CURSOR, NEW_GAME_EPISODE, episodeOfLevelByte, floorOfLevelByte } from "./newgame.js";
import type { CoopScreens, CoopStartPoint, PreScreen, ScreenPicture } from "../../release/coop_page.js";
export interface CoopScreensKit {
    readonly title: {
        readonly assets: TitleAssets;
        readonly C: TitleConstants;
    };
    readonly options: {
        readonly assets: OptionsAssets;
        readonly C: OptionsConstants;
    } | null;
    readonly password: {
        readonly assets: PasswordAssets;
        readonly C: PasswordConstants;
        readonly decoder: PasswordDecoder;
    } | null;
    readonly charsel: {
        readonly assets: CharselAssets;
        readonly C: CharselConstants;
    };
    readonly briefing?: {
        readonly assets: BriefingAssets;
        readonly C: BriefingConstants;
    } | null;
    readonly screenW: number;
    readonly screenH: number;
}
function indexedPicture(display: 0 | 1, cram: readonly number[], indices: Uint8Array | null, w: number, h: number): ScreenPicture {
    const rgba = new Uint8ClampedArray(w * h * 4);
    const rgb = cram.map(colourRgb);
    const back = rgb[0] ?? [0, 0, 0];
    for (let i = 0; i < w * h; i++) {
        const c = display === 1 && indices !== null ? rgb[indices[i]!] ?? back : back;
        rgba[i * 4] = c[0];
        rgba[i * 4 + 1] = c[1];
        rgba[i * 4 + 2] = c[2];
        rgba[i * 4 + 3] = 255;
    }
    return { width: w, height: h, rgba };
}
export class CoopTitleScreen implements PreScreen<CoopStartPoint> {
    result: CoopStartPoint | null = null;
    private readonly title: TitleCore;
    private readonly chain: TitleOptionsChain | null;
    private readonly password: PasswordCore | null;
    private kept: string | null;
    private state: ScreenState | null = null;
    private frame: Frame | undefined;
    handOver: TitleHandOver | null = null;
    constructor(private readonly k: CoopScreensKit, prefill: string | null) {
        this.title = new TitleCore(k.title.assets, k.title.C, { startsRun: true });
        const options = k.options ? new OptionsCore(k.options.assets, k.options.C) : null;
        this.password = k.password && options ? new PasswordCore(k.password.assets, k.password.C, k.password.decoder) : null;
        if (options && this.password && k.password)
            options.attachPassword(this.password, k.password.C["REBUILD.RETURN_FRAMES"]);
        this.chain = options ? new TitleOptionsChain(this.title, options) : null;
        this.kept = prefill !== null && k.password && k.password.decoder(prefill, [0, 0, 0, 0, 0]) !== null ? prefill : null;
        this.restart();
    }
    private restart(): void {
        if (this.chain)
            this.chain.reset();
        else
            this.title.reset();
        if (this.chain && this.kept !== null)
            this.chain.options.setStoredPassword(this.kept);
    }
    tick(pad: number, events: EventSink): void {
        if (this.result !== null)
            return;
        this.state = this.chain ? this.chain.tick(pad, events) : this.title.tick(pad, events);
        const o = this.chain?.options ?? null;
        if (o && this.chain!.phase === "options") {
            const r = o.passwordResult;
            if (r && r.accepted)
                this.kept = r.stored;
            else if (r && this.k.password && [...r.stored].every((ch) => ch.charCodeAt(0) === this.k.password!.C["BUFFER.BLANK"]))
                this.kept = null;
            if (o.exit === "title")
                this.restart();
            return;
        }
        const to = this.title.exit;
        if (to === "start") {
            const m = this.title.model;
            this.handOver = { planeA: Uint16Array.from(m.planeA.cells), planeB: Uint16Array.from(m.planeB.cells), patterns: Uint8Array.from(m.patterns), pad };
            this.result = this.kept !== null ? { kind: "password", code: this.kept } : { kind: "episode", episode: NEW_GAME_EPISODE };
        }
        else if (to === "demo")
            this.restart();
    }
    where(): "title" | "options" | "password" {
        const o = this.chain?.options ?? null;
        if (o && this.chain!.phase === "options")
            return o.showingPassword && this.password ? "password" : "options";
        return "title";
    }
    picture(): ScreenPicture {
        const o = this.chain?.options ?? null;
        if (o && this.chain!.phase === "options" && o.showingPassword && this.password) {
            return indexedPicture(this.password.display, this.password.cram, this.password.indices(), this.k.screenW, this.k.screenH);
        }
        if (this.state === null)
            return indexedPicture(0, [0], null, this.k.screenW, this.k.screenH);
        const model = this.chain && this.chain.shown === "options" ? this.chain.options.model : this.title.model;
        this.frame = renderState(this.state, (slot) => model.pattern(slot), this.frame);
        return { width: this.frame.width, height: this.frame.height, rgba: new Uint8ClampedArray(this.frame.data) };
    }
}
export class CoopSelectScreen implements PreScreen<number> {
    result: number | null = null;
    private readonly core: CharselCore;
    constructor(private readonly k: CoopScreensKit, point: CoopStartPoint) {
        this.core = new CharselCore(k.charsel.assets, k.charsel.C);
        let alive = NEW_GAME_ALIVE;
        if (point.kind === "password" && k.password) {
            const rec = k.password.decoder(point.code, [0, 0, 0, 0, 0]);
            if (rec)
                alive = rec.alive;
        }
        this.core.reset(NEW_GAME_CURSOR, alive);
    }
    get cursor(): number { return this.core.cursor; }
    tick(pad: number, events: EventSink): void {
        if (this.result !== null)
            return;
        this.core.tick(pad, events);
        if (this.core.exit !== null)
            this.result = this.core.exit.character;
    }
    picture(): ScreenPicture {
        return indexedPicture(this.core.display, this.core.cram, this.core.indices(), this.k.screenW, this.k.screenH);
    }
}
export function briefingCaseOf(k: CoopScreensKit, point: CoopStartPoint): "start" | "episode1" | "episode2" | "none" {
    if (point.kind === "episode")
        return point.episode === NEW_GAME_EPISODE ? "start" : "none";
    const rec = k.password ? k.password.decoder(point.code, [0, 0, 0, 0, 0]) : null;
    if (!rec)
        return "start";
    const ep = episodeOfLevelByte(rec.level_byte);
    const floor = floorOfLevelByte(rec.level_byte);
    return floor === 0 && ep === 1 ? "episode1" : floor === 0 && ep === 2 ? "episode2" : "none";
}
export class CoopBriefingScreen implements PreScreen<true> {
    result: true | null = null;
    private readonly core: BriefingCore;
    constructor(k: CoopScreensKit, b: NonNullable<CoopScreensKit["briefing"]>, path: "start" | "episode1" | "episode2", from: TitleHandOver | null) {
        this.core = new BriefingCore(b.assets, b.C);
        const cells = b.C.PLANE_W * b.C.PLANE_H;
        this.core.enter(from ?? { planeA: new Uint16Array(cells), planeB: new Uint16Array(cells), patterns: new Uint8Array(SLOT_COUNT * PATTERN_BYTES), pad: 0 }, path);
        this.k = k;
    }
    private readonly k: CoopScreensKit;
    get padWaits(): boolean { return this.core.padWaits; }
    tick(pad: number, events: EventSink): void {
        if (this.result !== null)
            return;
        this.core.tick(pad, events);
        if (this.core.exit !== null)
            this.result = true;
    }
    picture(): ScreenPicture {
        return indexedPicture(this.core.display, this.core.cram, this.core.indices(), this.k.screenW, this.k.screenH);
    }
}
export function coopScreens(k: CoopScreensKit, prefill: () => string | null): CoopScreens {
    return {
        title: () => new CoopTitleScreen(k, prefill()),
        select: (point) => new CoopSelectScreen(k, point),
        briefing: (point, title) => {
            const path = briefingCaseOf(k, point);
            if (!k.briefing || path === "none")
                return null;
            return new CoopBriefingScreen(k, k.briefing, path, title instanceof CoopTitleScreen ? title.handOver : null);
        },
    };
}

import type { MenuKey } from "./menu.js";
import { VOICE_INTERVAL_MAX, VOICE_INTERVAL_MIN, isClassicSmooth, withRendererChoice } from "./settings.js";
import type { HdLayout, Renderer, Settings, VoiceMode } from "./settings.js";
export type WizardStep = "picture" | "hud" | "controls" | "voice";
export type Scheme = "original" | "modern";
export interface WizardValues {
    renderer: Renderer;
    layout: HdLayout;
    scheme: Scheme;
    classicSmooth: boolean;
    voiceMode: VoiceMode;
    voiceInterval: number;
}
export interface WizardChoice {
    readonly id: string;
    readonly label: string;
    readonly text: string;
    readonly dim: boolean;
}
export type WizardEffect = {
    type: "none";
} | {
    type: "change";
} | {
    type: "step";
} | {
    type: "close";
} | {
    type: "finish";
};
export const WIZARD_NO_WEBGL2_NOTE = "Custom needs WebGL2: this browser shows Original";
const TITLES: Readonly<Record<WizardStep, string>> = { picture: "Picture", hud: "HUD", controls: "Controls", voice: "Voice" };
const CHOICES: Readonly<Record<WizardStep, readonly {
    id: string;
    label: string;
    text: string;
}[]>> = {
    picture: [
        { id: "custom", label: "Custom", text: "the same world at your screen's resolution" },
        { id: "classic_smooth", label: "Classic smooth", text: "the console's framing and size with smooth motion" },
        { id: "original", label: "Original", text: "the console's picture" },
    ],
    hud: [
        { id: "corners", label: "Corners", text: "the view fills the screen, the HUD's pieces in its corners" },
        { id: "bar", label: "Bar", text: "the console's status bar under the view" },
    ],
    controls: [
        { id: "modern", label: "Modern", text: "mouse turning and separate keys" },
        { id: "original", label: "Original", text: "the controller's button combinations" },
    ],
    voice: [
        { id: "once_per_phrase", label: "Once per X seconds per phrase", text: "the same announcement at most once in the interval" },
        { id: "once", label: "Once per X seconds", text: "one announcement at most in the interval" },
        { id: "classic", label: "Classic", text: "every announcement as the game makes it" },
    ],
};
export const VOICE_INTERVAL_LABEL = "Voice interval, sec";
export class SetupWizard {
    private stepNow: WizardStep = "picture";
    private cur: WizardValues;
    private cursorNow = 0;
    readonly initial: WizardValues;
    readonly initialHd: Settings["video"]["hd"];
    constructor(s: Settings, readonly webgl2: boolean) {
        this.initialHd = { ...s.video.hd };
        this.initial = { renderer: s.video.renderer, classicSmooth: isClassicSmooth(s), layout: s.video.hd.layout, scheme: s.input.scheme, voiceMode: s.audio.voice_mode, voiceInterval: s.audio.voice_interval };
        this.cur = { ...this.initial, renderer: webgl2 ? s.video.renderer : "original" };
        this.syncCursor();
    }
    get step(): WizardStep { return this.stepNow; }
    apply(s: Settings): Settings { return withWizardValues({ ...s, video: { ...s.video, hd: { ...this.initialHd } } }, this.cur); }
    get values(): WizardValues { return { ...this.cur }; }
    get cursor(): number { return this.cursorNow; }
    get title(): string { return TITLES[this.stepNow]; }
    steps(): WizardStep[] { return this.cur.renderer === "custom" && !this.cur.classicSmooth ? ["picture", "hud", "controls", "voice"] : ["picture", "controls", "voice"]; }
    get intervalRow(): number | null { return this.stepNow === "voice" && this.cur.voiceMode !== "classic" ? this.cur.voiceInterval : null; }
    interval(delta: number): WizardEffect {
        if (this.intervalRow === null)
            return { type: "none" };
        const v = Math.min(VOICE_INTERVAL_MAX, Math.max(VOICE_INTERVAL_MIN, this.cur.voiceInterval + delta));
        if (v === this.cur.voiceInterval)
            return { type: "none" };
        this.cur = { ...this.cur, voiceInterval: v };
        return { type: "change" };
    }
    get stepNumber(): number { return this.steps().indexOf(this.stepNow) + 1; }
    get note(): string { return this.stepNow === "picture" && !this.webgl2 ? WIZARD_NO_WEBGL2_NOTE : ""; }
    private valueOf(step: WizardStep): string {
        return step === "picture" ? (this.cur.renderer === "custom" && this.cur.classicSmooth ? "classic_smooth" : this.cur.renderer) : step === "hud" ? this.cur.layout : step === "voice" ? this.cur.voiceMode : this.cur.scheme;
    }
    choices(): WizardChoice[] {
        return CHOICES[this.stepNow].map((c) => ({ ...c, dim: this.stepNow === "picture" && (c.id === "custom" || c.id === "classic_smooth") && !this.webgl2 }));
    }
    private syncCursor(): void {
        const at = CHOICES[this.stepNow].findIndex((c) => c.id === this.valueOf(this.stepNow));
        this.cursorNow = Math.max(0, at);
    }
    select(index: number): WizardEffect {
        const c = this.choices()[index];
        if (!c || c.dim)
            return { type: "none" };
        this.cursorNow = index;
        if (c.id === this.valueOf(this.stepNow))
            return { type: "none" };
        if (this.stepNow === "picture")
            this.cur = { ...this.cur, renderer: c.id === "original" ? "original" : "custom", classicSmooth: c.id === "classic_smooth", layout: c.id === "classic_smooth" ? "bar" : this.cur.classicSmooth ? this.initial.layout : this.cur.layout };
        else if (this.stepNow === "hud")
            this.cur = { ...this.cur, layout: c.id as HdLayout };
        else if (this.stepNow === "voice")
            this.cur = { ...this.cur, voiceMode: c.id as VoiceMode };
        else
            this.cur = { ...this.cur, scheme: c.id as Scheme };
        return { type: "change" };
    }
    press(key: MenuKey): WizardEffect {
        switch (key) {
            case "up":
            case "down": {
                const list = this.choices();
                const dir = key === "down" ? 1 : list.length - 1;
                for (let k = 1; k <= list.length; k++) {
                    const i = (this.cursorNow + dir * k) % list.length;
                    if (!list[i]!.dim)
                        return this.select(i);
                }
                return { type: "none" };
            }
            case "left":
            case "right": return this.interval(key === "right" ? 1 : -1);
            case "choose": {
                const order = this.steps();
                const at = order.indexOf(this.stepNow);
                if (at === order.length - 1)
                    return { type: "finish" };
                this.stepNow = order[at + 1]!;
                this.syncCursor();
                return { type: "step" };
            }
            case "back": {
                const order = this.steps();
                const at = order.indexOf(this.stepNow);
                if (at <= 0)
                    return { type: "close" };
                this.stepNow = order[at - 1]!;
                this.syncCursor();
                return { type: "step" };
            }
        }
    }
}
export function withWizardValues(s: Settings, v: WizardValues): Settings {
    if (v.renderer === "custom" && (v.classicSmooth || isClassicSmooth(s))) {
        const r = withRendererChoice(s, v.classicSmooth ? "classic_smooth" : "custom");
        return { ...r, video: { ...r.video, hd: { ...r.video.hd, layout: v.classicSmooth ? r.video.hd.layout : v.layout } }, input: { ...s.input, scheme: v.scheme }, audio: { ...s.audio, voice_mode: v.voiceMode, voice_interval: v.voiceInterval } };
    }
    return { ...s, video: { ...s.video, renderer: v.renderer, hd: { ...s.video.hd, layout: v.layout } }, input: { ...s.input, scheme: v.scheme }, audio: { ...s.audio, voice_mode: v.voiceMode, voice_interval: v.voiceInterval } };
}
export function finishWizard(s: Settings, v: WizardValues): Settings {
    const w = withWizardValues(s, v);
    return { ...w, setup: { done: true } };
}
export function closeWizard(s: Settings, initial: WizardValues, initialHd?: Settings["video"]["hd"]): Settings {
    const w = withWizardValues(s, initial);
    return { ...w, ...(initialHd !== undefined ? { video: { ...w.video, hd: { ...initialHd } } } : {}), setup: { done: true } };
}

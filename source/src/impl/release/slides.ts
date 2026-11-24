/// <reference lib="dom" />
export class SlideShow {
    private base = 0;
    private startedAt = 0;
    constructor(readonly count: number, readonly ms: number) {
        if (!(count >= 1) || !(ms > 0))
            throw new Error("a slideshow needs at least one slide and a positive time");
    }
    start(now: number): void { this.base = 0; this.startedAt = now; }
    at(now: number): number {
        const passed = Math.max(0, Math.floor((now - this.startedAt) / this.ms));
        return (this.base + passed) % this.count;
    }
    show(i: number, now: number): number {
        this.base = ((Math.trunc(i) % this.count) + this.count) % this.count;
        this.startedAt = now;
        return this.base;
    }
    next(now: number): number { return this.show(this.at(now) + 1, now); }
    prev(now: number): number { return this.show(this.at(now) - 1, now); }
}
const BACK = "#181818", FORE = "#ddd", ACCENT = "#fc6", LINE = "#666";
const PIC_W = 160, PIC_H = 90;
export interface PictureContext {
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
    fillRect(x: number, y: number, w: number, h: number): void;
    strokeRect(x: number, y: number, w: number, h: number): void;
    beginPath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    arc(x: number, y: number, r: number, a0: number, a1: number): void;
    fill(): void;
    stroke(): void;
}
export function drawSlidePicture(g: PictureContext, i: number, w: number = PIC_W, h: number = PIC_H): void {
    g.fillStyle = BACK;
    g.fillRect(0, 0, w, h);
    g.lineWidth = 2;
    g.strokeStyle = LINE;
    const circle = (x: number, y: number, r: number, fill: boolean): void => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); if (fill)
        g.fill();
    else
        g.stroke(); };
    const line = (x0: number, y0: number, x1: number, y1: number): void => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
    switch (((Math.trunc(i) % 6) + 6) % 6) {
        case 0: {
            g.strokeRect(8, 14, w - 16, h - 28);
            g.fillStyle = LINE;
            g.fillRect(9, h / 2, w - 18, h / 2 - 15);
            g.fillStyle = ACCENT;
            circle(w * 0.7, h * 0.38, 9, true);
            break;
        }
        case 1: {
            g.strokeRect(w / 2 - 14, 20, 28, 46);
            line(w / 2, 20, w / 2, 40);
            g.strokeStyle = ACCENT;
            circle(w / 2, 43, 36, false);
            g.fillStyle = FORE;
            g.fillRect(w / 2 - 2, 26, 4, 8);
            break;
        }
        case 2: {
            g.strokeStyle = ACCENT;
            line(w * 0.3, h / 2, w * 0.7, h / 2);
            g.fillStyle = FORE;
            circle(w * 0.3, h / 2, 14, true);
            circle(w * 0.7, h / 2, 14, true);
            break;
        }
        case 3: {
            for (let k = 0; k < 10; k++) {
                const x = 8 + k * ((w - 16) / 10);
                g.strokeStyle = LINE;
                g.strokeRect(x, 30, 10, 30);
                g.fillStyle = k % 2 === 0 ? ACCENT : FORE;
                g.fillRect(x + 1, k % 2 === 0 ? 31 : 46, 8, 13);
            }
            break;
        }
        case 4: {
            for (let k = 0; k < 6; k++) {
                const x = 12 + k * 24;
                g.strokeStyle = LINE;
                g.strokeRect(x, 30, 20, 30);
                g.fillStyle = k % 3 === 0 ? ACCENT : FORE;
                g.fillRect(x + 7, 41, 6, 8);
            }
            break;
        }
        default: {
            g.strokeStyle = FORE;
            g.strokeRect(w / 2 - 24, 12, 48, 66);
            g.fillStyle = LINE;
            g.fillRect(w / 2 - 16, 12, 32, 16);
            g.strokeStyle = ACCENT;
            line(w / 2, 36, w / 2, 62);
            line(w / 2 - 8, 54, w / 2, 62);
            line(w / 2 + 8, 54, w / 2, 62);
            break;
        }
    }
}
export interface SlideEnv {
    now(): number;
    setInterval(fn: () => void, ms: number): unknown;
    clearInterval(handle: unknown): void;
    keys?: {
        addEventListener(type: "keydown", fn: (e: {
            key: string;
        }) => void): void;
        removeEventListener(type: "keydown", fn: (e: {
            key: string;
        }) => void): void;
    };
}
export function pageSlideEnv(): SlideEnv {
    return {
        now: () => Date.now(),
        setInterval: (fn, ms) => setInterval(fn, ms),
        clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
        keys: typeof window !== "undefined" ? (window as unknown as SlideEnv["keys"]) : undefined,
    };
}
export interface SlideContent {
    readonly titles: readonly string[];
    readonly texts: readonly string[];
    readonly ms: number;
}
const WATCH_MS = 250;
export interface MountedSlideshow {
    current(): number;
    show(i: number): void;
    next(): void;
    prev(): void;
    stop(): void;
}
export function mountSlideshow(box: HTMLElement, content: SlideContent, env: SlideEnv = pageSlideEnv()): MountedSlideshow {
    const n = Math.min(content.titles.length, content.texts.length);
    const doc = box.ownerDocument;
    const model = new SlideShow(n, content.ms);
    model.start(env.now());
    box.textContent = "";
    const title = doc.createElement("h2");
    const text = doc.createElement("p");
    const canvas = doc.createElement("canvas");
    canvas.width = PIC_W;
    canvas.height = PIC_H;
    const dots = doc.createElement("div");
    const buttons: HTMLElement[] = [];
    let shown = -1;
    const paint = (i: number): void => {
        if (i === shown)
            return;
        shown = i;
        title.textContent = content.titles[i]!;
        text.textContent = content.texts[i]!;
        const g = canvas.getContext?.("2d");
        if (g)
            drawSlidePicture(g as unknown as PictureContext, i);
        buttons.forEach((b, k) => {
            b.setAttribute("aria-current", k === i ? "true" : "false");
            b.style.background = k === i ? ACCENT : LINE;
        });
    };
    for (let k = 0; k < n; k++) {
        const b = doc.createElement("button");
        b.setAttribute("aria-label", `slide ${k + 1} of ${n}`);
        b.style.width = "12px";
        b.style.height = "12px";
        b.style.padding = "0";
        b.style.margin = "0 4px";
        b.style.border = "0";
        b.style.borderRadius = "6px";
        b.addEventListener("click", () => { paint(model.show(k, env.now())); });
        buttons.push(b);
        dots.appendChild(b);
    }
    box.appendChild(title);
    box.appendChild(canvas);
    box.appendChild(text);
    box.appendChild(dots);
    paint(model.at(env.now()));
    const handle = env.setInterval(() => { paint(model.at(env.now())); }, WATCH_MS);
    const onKey = (e: {
        key: string;
    }): void => {
        if (e.key === "ArrowLeft")
            paint(model.prev(env.now()));
        else if (e.key === "ArrowRight")
            paint(model.next(env.now()));
    };
    env.keys?.addEventListener("keydown", onKey);
    let stopped = false;
    return {
        current: () => model.at(env.now()),
        show: (i) => { paint(model.show(i, env.now())); },
        next: () => { paint(model.next(env.now())); },
        prev: () => { paint(model.prev(env.now())); },
        stop: () => {
            if (stopped)
                return;
            stopped = true;
            env.clearInterval(handle);
            env.keys?.removeEventListener("keydown", onKey);
            box.textContent = "";
        },
    };
}

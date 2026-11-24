/// <reference lib="dom" />
interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
function rectOf(cv: HTMLCanvasElement): Rect | null {
    const r = cv.getBoundingClientRect?.();
    if (!r || !(r.width > 0) || !(r.height > 0))
        return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
}
const shownOnPage = (cv: HTMLCanvasElement): boolean => {
    try {
        return getComputedStyle(cv).visibility !== "hidden" && cv.style.display !== "none";
    }
    catch {
        return cv.style.visibility !== "hidden" && cv.style.display !== "none";
    }
};
export function momentPictures(frame: HTMLCanvasElement, hd: readonly HTMLCanvasElement[], dpr: number): {
    css: {
        w: number;
        h: number;
    };
    device: {
        w: number;
        h: number;
    };
    original: string;
    custom: string | null;
} {
    const rects = [frame, ...hd].map(rectOf);
    const all = rects.filter((r): r is Rect => r !== null);
    const area: Rect = all.length === 0 ? { x: 0, y: 0, w: frame.width, h: frame.height } : (() => {
        const x0 = Math.min(...all.map((r) => r.x)), y0 = Math.min(...all.map((r) => r.y));
        const x1 = Math.max(...all.map((r) => r.x + r.w)), y1 = Math.max(...all.map((r) => r.y + r.h));
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    })();
    const W = Math.max(1, Math.round(area.w * dpr)), H = Math.max(1, Math.round(area.h * dpr));
    const draw = (list: ReadonlyArray<readonly [
        HTMLCanvasElement,
        Rect | null
    ]>): string => {
        const out = document.createElement("canvas");
        out.width = W;
        out.height = H;
        const ctx = out.getContext("2d");
        if (ctx) {
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, W, H);
            for (const [cv, r] of list) {
                const at = r ?? area;
                try {
                    ctx.drawImage(cv, (at.x - area.x) * dpr, (at.y - area.y) * dpr, at.w * dpr, at.h * dpr);
                }
                catch { }
            }
        }
        return out.toDataURL("image/png");
    };
    const original = draw([[frame, rects[0] ?? null]]);
    const custom = hd.length === 0 ? null : draw([...(shownOnPage(frame) ? [[frame, rects[0] ?? null] as const] : []), ...hd.map((cv, i) => [cv, rects[i + 1] ?? null] as const)]);
    return { css: { w: area.w, h: area.h }, device: { w: W, h: H }, original, custom };
}
export function downloadText(name: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

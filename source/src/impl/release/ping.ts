export function medianMs(trips: readonly number[], window: number): number | null {
    const v = trips.slice(Math.max(0, trips.length - window)).sort((a, b) => a - b);
    if (v.length === 0)
        return null;
    const mid = v.length >> 1;
    const m = v.length % 2 === 1 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
    return Math.round(m);
}
export function pingText(median: number | null, path: "direct" | "relay"): string {
    return `ping ${median === null ? "-" : String(median)} ms \u00b7 ${path}`;
}
export interface PingPlate {
    set(text: string | null): void;
    readonly element: HTMLElement;
}
export function mountPing(parent: HTMLElement): PingPlate {
    const el = parent.ownerDocument.createElement("div");
    el.className = "zt-ping";
    el.setAttribute("style", "position:absolute;top:6px;right:6px;z-index:7;pointer-events:none;padding:2px 8px;border-radius:4px;" +
        "background:rgba(0,0,0,0.6);color:#e8e8e8;font:12px/1.4 system-ui,sans-serif;white-space:nowrap;");
    el.hidden = true;
    el.style.display = "none";
    parent.appendChild(el);
    return {
        element: el,
        set(text: string | null): void {
            if (text === null) {
                el.hidden = true;
                el.style.display = "none";
                el.textContent = "";
                return;
            }
            el.hidden = false;
            el.style.display = "";
            if (el.textContent !== text)
                el.textContent = text;
        },
    };
}
export interface IntervalEnv {
    setInterval(fn: () => void, ms: number): unknown;
    clearInterval(h: unknown): void;
}
export function pingRefresher(get: () => string | null, plate: Pick<PingPlate, "set">, env: IntervalEnv, everyMs: number): {
    stop(): void;
} {
    plate.set(get());
    const h = env.setInterval(() => plate.set(get()), everyMs);
    return { stop(): void { env.clearInterval(h); plate.set(null); } };
}

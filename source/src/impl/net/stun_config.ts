import type { NetConstants } from "./constants.js";
export interface IceServer {
    readonly urls: string[];
}
export function serverHostPort(url: string): {
    host: string;
    port: number;
} | null {
    const m = /^(wss?|https?):\/\/(?:[^/?#@]*@)?(\[[^\]]+\]|[^/?#:]+)(?::(\d+))?(?:[/?#]|$)/i.exec(url.trim());
    if (!m)
        return null;
    const secure = /^(wss|https)$/i.test(m[1]!);
    const port = m[3] !== undefined ? Number(m[3]) : secure ? 443 : 80;
    return { host: m[2]!, port };
}
export function iceServers(c: NetConstants, settings: {
    readonly server: string;
    readonly stun?: readonly string[];
}): IceServer[] {
    const listed = (settings.stun ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
    if (listed.length > 0)
        return [{ urls: listed }];
    if (c.stunDefault.length > 0)
        return [{ urls: [...c.stunDefault] }];
    const hp = serverHostPort(settings.server);
    if (!hp)
        return [];
    return [{ urls: [`stun:${hp.host}:${hp.port}`] }];
}

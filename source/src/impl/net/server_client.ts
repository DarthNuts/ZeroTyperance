import type { NetConstants } from "./constants.js";
import type { ChannelName, Transport } from "./transport.js";
export interface WsLike {
    send(text: string): void;
    close(): void;
    onopen: ((ev?: unknown) => void) | null;
    onmessage: ((ev: {
        data: unknown;
    }) => void) | null;
    onclose: ((ev?: unknown) => void) | null;
    onerror: ((ev?: unknown) => void) | null;
}
export type ServerErrorReason = "proto" | "no_room" | "room_full" | "wrong_code" | "bad_message" | "too_big" | "rate" | "server_full";
export type PeerLeftReason = "leave" | "closed" | "timeout";
export const REFUSAL_TEXT: Readonly<Record<ServerErrorReason, string>> = {
    no_room: "no such room",
    room_full: "the room is full",
    wrong_code: "wrong code for this room",
    proto: "another version of the co-op protocol",
    server_full: "the server is busy",
    bad_message: "the server did not understand the page",
    too_big: "a message was too big",
    rate: "too many messages",
};
export function refusalText(reason: string): string {
    return (REFUSAL_TEXT as Record<string, string>)[reason] ?? `the server refused (${reason})`;
}
export class ServerRefusal extends Error {
    constructor(readonly reason: string) { super(refusalText(reason)); this.name = "ServerRefusal"; }
}
export function normalizeServer(text: string, c: NetConstants): string {
    const page = /^http(s?):\/\/([^/?#]*)/i.exec(text.trim());
    if (page !== null)
        return `ws${page[1]!.toLowerCase()}://${page[2]}${c.serverPath}`;
    const t = text.trim();
    if (t === "")
        return "";
    const withScheme = /^wss?:\/\//i.test(t) ? t : `ws://${t}`;
    const m = /^(wss?:\/\/)([^/]*)(\/.*)?$/i.exec(withScheme)!;
    const path = m[3] === undefined || m[3] === "/" ? c.serverPath : m[3];
    return `${m[1]!.toLowerCase()}${m[2]}${path}`;
}
export function pageServer(page: {
    readonly protocol: string;
    readonly host: string;
}, c: NetConstants): string {
    return `${page.protocol === "https:" ? "wss" : "ws"}://${page.host}${c.serverPath}`;
}
export function serverInUse(setting: string, page: {
    readonly protocol: string;
    readonly host: string;
} | null, c: NetConstants): string {
    const s = normalizeServer(setting, c);
    return s !== "" ? s : page !== null ? pageServer(page, c) : "";
}
export const HTTPS_WS_TEXT = "an https page cannot reach a ws:// server: open the page from the host's address";
export function blockedByHttps(page: {
    readonly protocol: string;
} | null, url: string): boolean {
    return page !== null && page.protocol === "https:" && /^ws:\/\//i.test(url);
}
export class Unreachable extends Error {
    constructor(readonly url: string) { super(`cannot reach the co-op server (${url})`); this.name = "Unreachable"; }
}
export interface RoomInfo {
    readonly id: string;
    readonly name: string;
    readonly where: string;
    readonly age_s: number;
}
export const DEFAULT_ROOM_NAME = "Zero Tolerance";
export function cleanRoomName(name: unknown, c: NetConstants): string {
    if (typeof name !== "string")
        return DEFAULT_ROOM_NAME;
    const kept = Array.from(name.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim()).slice(0, c.roomNameMax).join("").trimEnd();
    return kept === "" ? DEFAULT_ROOM_NAME : kept;
}
export function askInfo(url: string, openSocket: (url: string) => WsLike): Promise<string | null> {
    return new Promise<string | null>((resolve, reject) => {
        const ws = openSocket(url);
        let isOpen = false;
        let done = false;
        const finish = (v: string | null): void => { if (done)
            return; done = true; try {
            ws.close();
        }
        catch { } resolve(v); };
        ws.onopen = () => { isOpen = true; ws.send(JSON.stringify({ t: "info" })); };
        ws.onerror = () => { };
        ws.onclose = () => { if (done)
            return; if (!isOpen) {
            done = true;
            reject(new Unreachable(url));
        }
        else
            finish(null); };
        ws.onmessage = (ev) => {
            if (typeof ev.data !== "string")
                return;
            let m: {
                t?: unknown;
                computer?: unknown;
            };
            try {
                m = JSON.parse(ev.data) as typeof m;
            }
            catch {
                return;
            }
            if (m.t === "info")
                finish(typeof m.computer === "string" ? m.computer : "");
            else if (m.t === "error")
                finish(null);
        };
    });
}
export class RoomLister {
    private ws: WsLike | null = null;
    private opened: Promise<void> | null = null;
    private waiting: {
        resolve(v: RoomInfo[] | null): void;
        reject(e: Error): void;
    }[] = [];
    unsupported = false;
    constructor(private readonly url: string, private readonly openSocket: (url: string) => WsLike, private readonly proto: number) { }
    ask(): Promise<RoomInfo[] | null> {
        if (this.unsupported)
            return Promise.resolve(null);
        if (this.ws === null)
            this.connect();
        return this.opened!.then(() => new Promise<RoomInfo[] | null>((resolve, reject) => {
            this.waiting.push({ resolve, reject });
            this.ws!.send(JSON.stringify({ t: "rooms", proto: this.proto }));
        }));
    }
    close(): void {
        const ws = this.ws;
        this.ws = null;
        this.opened = null;
        for (const w of this.waiting.splice(0))
            w.resolve([]);
        try {
            ws?.close();
        }
        catch { }
    }
    private connect(): void {
        const ws = this.openSocket(this.url);
        this.ws = ws;
        let isOpen = false;
        this.opened = new Promise<void>((resolve, reject) => {
            ws.onopen = () => { isOpen = true; resolve(); };
            ws.onerror = () => { };
            ws.onclose = () => {
                if (ws !== this.ws)
                    return;
                this.ws = null;
                this.opened = null;
                if (!isOpen)
                    reject(new Unreachable(this.url));
                for (const w of this.waiting.splice(0))
                    w.reject(new Unreachable(this.url));
            };
        });
        this.opened.catch(() => undefined);
        ws.onmessage = (ev) => {
            if (ws !== this.ws || typeof ev.data !== "string")
                return;
            let m: {
                t?: unknown;
                rooms?: unknown;
                reason?: unknown;
            };
            try {
                m = JSON.parse(ev.data) as typeof m;
            }
            catch {
                return;
            }
            if (m.t === "rooms" && Array.isArray(m.rooms)) {
                const list = (m.rooms as {
                    id?: unknown;
                    name?: unknown;
                    where?: unknown;
                    age_s?: unknown;
                }[]).filter((r) => r && typeof r.id === "string")
                    .map((r): RoomInfo => ({ id: r.id as string, name: typeof r.name === "string" ? r.name : DEFAULT_ROOM_NAME, where: typeof r.where === "string" ? r.where : "", age_s: typeof r.age_s === "number" ? r.age_s : 0 }));
                this.waiting.shift()?.resolve(list);
            }
            else if (m.t === "error" && (m.reason === "bad_message" || m.reason === "proto")) {
                this.unsupported = true;
                this.ws = null;
                this.opened = null;
                for (const w of this.waiting.splice(0))
                    w.resolve(null);
                try {
                    ws.close();
                }
                catch { }
            }
        };
    }
}
export function utf8Length(s: string): number {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        const u = s.charCodeAt(i);
        if (u < 0x80)
            n += 1;
        else if (u < 0x800)
            n += 2;
        else if (u >= 0xd800 && u <= 0xdbff && i + 1 < s.length) {
            n += 4;
            i++;
        }
        else
            n += 3;
    }
    return n;
}
export type ClientState = "connecting" | "open" | "hosting" | "joining" | "in_room" | "closed";
export interface ServerClientOptions {
    readonly consts: NetConstants;
    readonly socket: WsLike;
    readonly clock?: () => number;
    readonly onPeer?: () => void;
    readonly onPeerLeft?: (reason: PeerLeftReason) => void;
    readonly onError?: (reason: string, text: string) => void;
    readonly onClose?: () => void;
    readonly openSocket?: () => WsLike;
}
interface Pending {
    resolve(v: {
        code: string;
        seat: 0 | 1;
    }): void;
    reject(e: Error): void;
    kind: "host" | "join";
}
export class ServerClient {
    state: ClientState = "connecting";
    seat: 0 | 1 | null = null;
    code: string | null = null;
    roomName: string | null = null;
    roomId: string | null = null;
    urls: string[] = [];
    peerPresent = false;
    peerLeftReason: PeerLeftReason | null = null;
    lastError: string | null = null;
    oversize = 0;
    rateQueued = 0;
    private readonly c: NetConstants;
    private ws: WsLike;
    private readonly clock: () => number;
    private pending: Pending | null = null;
    private readonly signals: unknown[] = [];
    private signalListener: ((data: unknown) => void) | null = null;
    private readonly relayIn: string[] = [];
    private relayArrival: (() => void) | null = null;
    private readonly outQueue: string[] = [];
    private readonly sentAt: number[] = [];
    private openWaiters: {
        resolve(): void;
        reject(e: Error): void;
    }[] = [];
    constructor(private readonly o: ServerClientOptions) {
        this.c = o.consts;
        this.ws = o.socket;
        this.clock = o.clock ?? Date.now;
        this.wire(this.ws);
    }
    private wire(ws: WsLike): void {
        ws.onopen = () => { if (ws !== this.ws)
            return; if (this.state === "connecting")
            this.state = "open"; for (const w of this.openWaiters.splice(0))
            w.resolve(); };
        ws.onmessage = (ev) => { if (ws === this.ws && typeof ev.data === "string")
            this.onFrame(ev.data); };
        ws.onerror = () => { };
        ws.onclose = () => { if (ws === this.ws)
            this.closed(); };
    }
    private reopen(): Promise<void> {
        this.ws = this.o.openSocket!();
        this.state = "connecting";
        this.seat = null;
        this.code = null;
        this.roomName = null;
        this.roomId = null;
        this.peerPresent = false;
        this.peerLeftReason = null;
        this.lastError = null;
        this.pending = null;
        this.outQueue.length = 0;
        this.wire(this.ws);
        return this.whenOpen();
    }
    whenOpen(): Promise<void> {
        if (this.state === "closed")
            return Promise.reject(new Error("the co-op server could not be reached"));
        if (this.state !== "connecting")
            return Promise.resolve();
        return new Promise((resolve, reject) => { this.openWaiters.push({ resolve, reject }); });
    }
    host(name?: string): Promise<{
        code: string;
        seat: 0;
    }> {
        return this.begin("host", { t: "host", proto: this.c.serverProtocol, ...(name !== undefined ? { name } : {}) }) as Promise<{
            code: string;
            seat: 0;
        }>;
    }
    join(code: string, room?: string): Promise<{
        code: string;
        seat: 1;
    }> {
        return this.begin("join", { t: "join", proto: this.c.serverProtocol, code, ...(room !== undefined ? { room } : {}) }) as Promise<{
            code: string;
            seat: 1;
        }>;
    }
    private begin(kind: "host" | "join", m: object): Promise<{
        code: string;
        seat: 0 | 1;
    }> {
        if (this.state === "closed" && this.o.openSocket)
            return this.reopen().then(() => this.begin(kind, m));
        if (this.state === "closed")
            return Promise.reject(this.lastError ? new ServerRefusal(this.lastError) : new Error("the co-op server could not be reached"));
        if (this.state !== "open")
            return Promise.reject(new Error("already in a room"));
        this.state = kind === "host" ? "hosting" : "joining";
        return new Promise((resolve, reject) => {
            this.pending = { resolve, reject, kind };
            this.sendNow(JSON.stringify(m));
        });
    }
    sendSignal(data: unknown): void { this.sendFrame(JSON.stringify({ t: "signal", data })); }
    onSignal(cb: ((data: unknown) => void) | null): void {
        this.signalListener = cb;
        if (cb)
            for (const d of this.signals.splice(0))
                cb(d);
    }
    sendRelay(ch: "r" | "u", data: string): void { this.sendFrame(JSON.stringify({ t: "relay", ch, data })); }
    relayTransport(): Transport & {
        close(): void;
    } {
        const self = this;
        return {
            get onArrival() { return self.relayArrival; },
            set onArrival(f) { self.relayArrival = f; },
            send: (channel: ChannelName, text: string) => this.sendRelay(channel === "reliable" ? "r" : "u", text),
            receive: () => { this.pump(); return this.relayIn.splice(0); },
            close: () => this.leave(),
        };
    }
    leave(): void {
        if (this.state === "closed")
            return;
        this.sendNow(JSON.stringify({ t: "leave" }));
        this.state = "closed";
        this.ws.close();
    }
    pump(): void {
        while (this.outQueue.length > 0 && this.rateOk())
            this.sendNow(this.outQueue.shift()!);
    }
    private rateOk(): boolean {
        const now = this.clock();
        while (this.sentAt.length > 0 && now - this.sentAt[0]! >= 1000)
            this.sentAt.shift();
        return this.sentAt.length < this.c.serverRate - 1;
    }
    private sendFrame(text: string): void {
        if (this.state === "closed")
            return;
        if (utf8Length(text) > this.c.serverFrameMax) {
            this.oversize++;
            return;
        }
        if (this.outQueue.length === 0 && this.rateOk()) {
            this.sendNow(text);
            return;
        }
        this.rateQueued++;
        this.outQueue.push(text);
        this.pump();
    }
    private sendNow(text: string): void {
        if (utf8Length(text) > this.c.serverFrameMax) {
            this.oversize++;
            return;
        }
        this.sentAt.push(this.clock());
        this.ws.send(text);
    }
    private onFrame(text: string): void {
        let m: {
            t?: unknown;
            [k: string]: unknown;
        };
        try {
            m = JSON.parse(text) as typeof m;
        }
        catch {
            return;
        }
        if (typeof m !== "object" || m === null || typeof m.t !== "string")
            return;
        switch (m.t) {
            case "room":
                if (this.pending?.kind === "host") {
                    this.code = String(m.code);
                    this.roomName = typeof m.name === "string" ? m.name : null;
                    this.roomId = typeof m.id === "string" ? m.id : null;
                    this.urls = Array.isArray(m.urls) ? (m.urls as unknown[]).filter((u): u is string => typeof u === "string") : [];
                    this.seat = 0;
                    this.state = "in_room";
                    this.settle(null, { code: this.code, seat: 0 });
                }
                break;
            case "joined":
                if (this.pending?.kind === "join") {
                    this.code = String(m.code);
                    this.roomName = typeof m.name === "string" ? m.name : null;
                    this.seat = 1;
                    this.peerPresent = true;
                    this.state = "in_room";
                    this.settle(null, { code: this.code, seat: 1 });
                }
                break;
            case "peer":
                this.peerPresent = true;
                this.peerLeftReason = null;
                this.o.onPeer?.();
                break;
            case "peer_left": {
                const r = (m.reason === "leave" || m.reason === "closed" || m.reason === "timeout" ? m.reason : "closed") as PeerLeftReason;
                this.peerPresent = false;
                this.peerLeftReason = r;
                this.o.onPeerLeft?.(r);
                if (this.seat === 1)
                    this.endSocket();
                break;
            }
            case "signal":
                if (this.signalListener)
                    this.signalListener(m.data);
                else
                    this.signals.push(m.data);
                break;
            case "relay":
                if (typeof m.data === "string") {
                    this.relayIn.push(m.data);
                    this.relayArrival?.();
                }
                break;
            case "error": {
                const reason = String(m.reason);
                this.lastError = reason;
                const text = refusalText(reason);
                this.o.onError?.(reason, text);
                if (this.pending && reason !== "rate")
                    this.settle(new ServerRefusal(reason));
                if (reason !== "rate")
                    this.endSocket();
                break;
            }
            default: break;
        }
    }
    private settle(err: Error | null, v?: {
        code: string;
        seat: 0 | 1;
    }): void {
        const p = this.pending;
        this.pending = null;
        if (!p)
            return;
        if (err) {
            if (this.state === "hosting" || this.state === "joining")
                this.state = "open";
            p.reject(err);
        }
        else
            p.resolve(v!);
    }
    private endSocket(): void {
        if (this.state === "closed")
            return;
        this.state = "closed";
        try {
            this.ws.close();
        }
        catch { }
        for (const w of this.openWaiters.splice(0))
            w.reject(new Error("the co-op server closed the connection"));
        this.o.onClose?.();
    }
    private closed(): void {
        if (this.state === "closed")
            return;
        const wasConnecting = this.state === "connecting";
        this.state = "closed";
        if (this.pending)
            this.settle(new ServerRefusal(this.lastError ?? "closed"));
        for (const w of this.openWaiters.splice(0))
            w.reject(new Error(wasConnecting ? "the co-op server could not be reached" : "the co-op server closed the connection"));
        this.o.onClose?.();
    }
}

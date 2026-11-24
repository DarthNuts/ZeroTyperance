import { CoopPage } from "./coop_page.js";
import type { CoopScreens } from "./coop_page.js";
import { startCoopLive } from "./coop_live.js";
import type { CoopLive, CoopLiveOptions } from "./coop_live.js";
import type { AppConstants } from "./constants.js";
import { stepPace } from "./scheduler.js";
import type { Settings } from "./settings.js";
import type { NetConstants } from "../net/constants.js";
import type { NetCore, StepPace } from "../net/core.js";
import type { SeatScheme } from "../net/scheme.js";
import { roomCode } from "../net/rollback.js";
import type { HostScreen, StartOptions } from "../net/rollback.js";
import { broadcastTransport } from "../net/transport.js";
import type { Transport } from "../net/transport.js";
import { DEFAULT_ROOM_NAME, HTTPS_WS_TEXT, RoomLister, ServerClient, ServerRefusal, Unreachable, askInfo, blockedByHttps, normalizeServer, serverInUse } from "../net/server_client.js";
import type { RoomInfo, WsLike } from "../net/server_client.js";
import { openSessionTransport } from "../net/webrtc_transport.js";
import { iceServers } from "../net/stun_config.js";
import { PASSWORD_LENGTH, normalizeEntry } from "./passwords.js";
import type { ExtraCode, PasswordTarget } from "./passwords.js";
import type { PasswordRow } from "./quickstart.js";
export interface Item {
    label: string;
    value: string;
    group?: string;
    cells?: {
        id: "saved" | "default";
        text: string;
    }[];
}
export const CHARACTER_NAMES: readonly string[] = Object.freeze(["Ishii", "Haile", "Wolf", "Ramos", "Gjoerup"]);
export type Closable = Transport & {
    close(): void;
};
export interface Connector {
    host(name?: string): Promise<{
        code: string;
        id?: string;
        name?: string;
        urls?: readonly string[];
        peer: Promise<Closable>;
        cancel(): void;
    }>;
    join(code: string, room?: string): Promise<Closable>;
    info?(): Promise<string | null>;
    rooms?(): Promise<readonly RoomInfo[] | null>;
    closeRooms?(): void;
    readonly server?: string;
}
export interface ReachLimit {
    readonly ms: number;
    readonly timers: Timers;
}
export interface Timers {
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(h: unknown): void;
}
const REAL_TIMERS: Timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const LOBBY_ASK_MS = 250;
const LOBBY_ASKS = 8;
type LobbyMsg = {
    t: "join";
    id: string;
} | {
    t: "welcome";
    id: string;
} | {
    t: "full";
    id: string;
};
export function localConnector(c: NetConstants, rand: () => number, timers: Timers = REAL_TIMERS, BC: typeof BroadcastChannel = BroadcastChannel): Connector {
    const lobbyName = (code: string): string => `zt-lobby-${code}`;
    return {
        host: async (name) => {
            const code = roomCode(c, rand);
            const lobby = new BC(lobbyName(code));
            let guest: string | null = null;
            let tp: Closable | null = null;
            let resolvePeer!: (t: Closable) => void;
            const peer = new Promise<Closable>((r) => { resolvePeer = r; });
            lobby.onmessage = (ev: MessageEvent) => {
                const m = ev.data as LobbyMsg;
                if (!m || m.t !== "join")
                    return;
                if (guest !== null && guest !== m.id) {
                    lobby.postMessage({ t: "full", id: m.id } satisfies LobbyMsg);
                    return;
                }
                if (tp === null) {
                    guest = m.id;
                    tp = broadcastTransport(code, 0);
                    resolvePeer(tp);
                }
                lobby.postMessage({ t: "welcome", id: m.id } satisfies LobbyMsg);
            };
            return { code, name: name ?? DEFAULT_ROOM_NAME, peer, cancel: () => { lobby.close(); } };
        },
        join: (codeText) => new Promise<Closable>((resolve, reject) => {
            const code = codeText.trim().toUpperCase();
            const tp = broadcastTransport(code, 1);
            const lobby = new BC(lobbyName(code));
            const id = String(Math.floor(rand() * 1e9)) + String(Math.floor(rand() * 1e9));
            let asks = 0;
            let timer: unknown = null;
            const done = (): void => { if (timer !== null)
                timers.clearTimeout(timer); lobby.close(); };
            lobby.onmessage = (ev: MessageEvent) => {
                const m = ev.data as LobbyMsg;
                if (!m || m.id !== id)
                    return;
                if (m.t === "welcome") {
                    done();
                    resolve(tp);
                }
                else if (m.t === "full") {
                    done();
                    tp.close();
                    reject(new Error("the room is full"));
                }
            };
            const ask = (): void => {
                if (asks >= LOBBY_ASKS) {
                    done();
                    tp.close();
                    reject(new Error("no such room"));
                    return;
                }
                asks++;
                lobby.postMessage({ t: "join", id } satisfies LobbyMsg);
                timer = timers.setTimeout(ask, LOBBY_ASK_MS);
            };
            ask();
        }),
    };
}
export function onlineConnector(url: string, settings: Settings, c: NetConstants, Socket: new (url: string) => WsLike = WebSocket as unknown as new (url: string) => WsLike, limit?: ReachLimit): Connector {
    const ice = iceServers(c, { server: url, stun: settings.net.stun }) as RTCIceServer[];
    const reach = (client: ServerClient, ws: WsLike): Promise<void> => new Promise<void>((resolve, reject) => {
        let h: unknown = null;
        let settled = false;
        const done = (ok: boolean): void => {
            if (settled)
                return;
            settled = true;
            if (h !== null)
                limit!.timers.clearTimeout(h);
            if (ok)
                resolve();
            else
                reject(new Unreachable(url));
        };
        if (limit)
            h = limit.timers.setTimeout(() => { h = null; done(false); try {
                ws.close();
            }
            catch { } }, limit.ms);
        client.whenOpen().then(() => done(true), () => done(false));
    });
    let lister: RoomLister | null = null;
    return {
        server: url,
        host: async (name) => {
            let arrived!: () => void;
            const peerHere = new Promise<void>((r) => { arrived = r; });
            let onPeer: (() => void) | undefined;
            const ws = new Socket(url);
            const client = new ServerClient({ consts: c, socket: ws, openSocket: () => new Socket(url), onPeer: () => { onPeer?.(); } });
            onPeer = arrived;
            await reach(client, ws);
            const { code } = await client.host(name);
            const peer = peerHere.then(() => openSessionTransport(client, 0, ice, { consts: c })).then((s) => Object.assign(s.transport, { path: s.kind }));
            return { code, id: client.roomId ?? "", name: client.roomName ?? name, urls: [...client.urls], peer, cancel: () => client.leave() };
        },
        join: async (code, room) => {
            const ws = new Socket(url);
            const client = new ServerClient({ consts: c, socket: ws, openSocket: () => new Socket(url) });
            await reach(client, ws);
            await client.join(code.trim(), room);
            const s = await openSessionTransport(client, 1, ice, { consts: c });
            return Object.assign(s.transport, { path: s.kind });
        },
        rooms: () => { lister ??= new RoomLister(url, (u) => new Socket(u), c.serverProtocol); return lister.ask(); },
        info: () => new Promise<string | null>((resolve, reject) => {
            let h: unknown = null;
            let done = false;
            let sock: WsLike | null = null;
            if (limit)
                h = limit.timers.setTimeout(() => { h = null; if (done)
                    return; done = true; try {
                    sock?.close();
                }
                catch { } reject(new Unreachable(url)); }, limit.ms);
            askInfo(url, (u) => (sock = new Socket(u))).then((v) => { if (done)
                return; done = true; if (h !== null)
                limit!.timers.clearTimeout(h); resolve(v); }, (e: unknown) => { if (done)
                return; done = true; if (h !== null)
                limit!.timers.clearTimeout(h); reject(e as Error); });
        }),
        closeRooms: () => { lister?.close(); lister = null; },
    };
}
export function failureWords(err: unknown): string {
    if (err instanceof ServerRefusal)
        return err.message;
    return err instanceof Error ? err.message : String(err);
}
export function roomRow(r: RoomInfo): Item {
    return { label: r.name, value: `${r.where !== "" ? `on ${r.where}, ` : ""}waiting ${r.age_s} s` };
}
export function hostUrlsLine(urls: readonly string[]): string { return `or your partner opens ${urls.join("  ")}`; }
export const CODE_ENTRY_TEXT = "Type the room code the host tells you";
export const NO_ROOM_TEXT = "no open game on this network";
export function normalizeCode(text: string): string {
    return text.toUpperCase().replace(/[\s-]+/g, "");
}
export interface PasswordChoiceDeps {
    rows(): readonly PasswordRow[] | null;
    extras(): readonly ExtraCode[];
    saved(): readonly string[];
    check(code: string): PasswordTarget | null;
    levelName(t: {
        readonly episode: number;
        readonly floor: number;
    }): string;
    store?(code: string, t: PasswordTarget): boolean;
    load?(): Promise<void>;
}
export interface HostStart {
    readonly code: string;
    readonly name: string;
}
export interface CoopPageDeps {
    readonly passwordChoice?: PasswordChoiceDeps;
    readonly net: NetConstants;
    readonly app: AppConstants;
    readonly getSettings: () => Settings;
    readonly hello: {
        readonly version: string;
        readonly md5: string;
    };
    readonly connector: (server: string, reach?: ReachLimit) => Connector;
    readonly page?: {
        readonly protocol: string;
        readonly host: string;
    } | null;
    readonly saveServer?: (server: string) => void;
    readonly timers?: Timers;
    readonly makeCore: (start: StartOptions) => NetCore;
    readonly scheme?: () => SeatScheme;
    readonly screens: CoopScreens;
    readonly onScreenEvents?: (events: readonly unknown[]) => void;
    readonly sessionAudio?: (seat: 0 | 1 | null) => void;
    readonly characterNames: readonly string[];
    readonly live: Omit<CoopLiveOptions, "makePage" | "consts" | "speed" | "onEnd" | "onLine" | "onStatus" | "onStarted">;
    readonly requestRender: () => void;
    readonly onSessionStart: (live: CoopLive) => void;
    readonly onSessionEnd?: (reason: string, lost: boolean) => void;
    readonly onGameOver?: () => void;
    readonly onSessionDropped?: () => void;
    readonly onLine?: (line: string) => void;
    readonly onConfirmed?: (seat: 0 | 1, step: number, saved: string) => void;
    readonly rand: () => number;
    readonly seed: () => number;
}
export type Phase = "idle" | "connecting" | "open" | "session" | "over";
export function hostScreenLine(screen: HostScreen | null): string {
    switch (screen) {
        case null: return "Connecting to the host";
        case "title": return "The host is in the title menu";
        case "options": return "The host is in the options";
        case "password": return "The host is entering a password";
        case "starting": return "The host is starting the game";
    }
}
export const SPINNER_TURN_MS = 1000;
export interface WaitingScreen {
    readonly heading: string;
    readonly line: string;
    readonly angle: number;
    readonly row: string;
}
export interface CoopPageController {
    items(): Item[];
    adjust(index: number, delta: -1 | 1, chosen: boolean): void;
    renderExtra(panel: HTMLElement): void;
    readonly phase: Phase;
    readonly inSession: boolean;
    setCode(text: string): void;
    joinCode(): void;
    setServer(text: string): void;
    server(): string;
    readonly joinPage: boolean;
    rooms(): readonly RoomInfo[] | null;
    back(): boolean;
    setRoomName(text: string): void;
    readonly roomName: string;
    readonly hostStart: HostStart | null;
    setFreeEntry(text: string | null): void;
    playFreeEntry(): boolean;
    pickCell(index: number, id: "saved" | "default"): void;
    readonly view: "main" | "name" | "join" | "entry" | "password";
    readonly shownName: string;
    readonly roomId: string;
    readonly hostUrls: string;
    readonly code: string;
    status(): string;
    waitingScreen(nowMs: number): WaitingScreen | null;
    live(): CoopLive | null;
    leave(): void;
    quit(): void;
}
export function pacedCore(app: AppConstants, core: NetCore, start: StartOptions): NetCore {
    core.setPace?.(speedPace(app, start.options["speed"]));
    return core;
}
export function speedPace(app: AppConstants, speed: unknown): StepPace {
    const sp = speed as {
        mode?: unknown;
        custom_steps?: unknown;
    } | undefined;
    const mode = sp?.mode === "custom" ? "custom" : "original";
    return stepPace(app, mode, typeof sp?.custom_steps === "number" ? sp.custom_steps : app.speed.customDefault);
}
export const HOST_ROW = 0, JOIN_ROW = 1, SERVER_ROW = 2;
export const DEFAULT_FALLBACK_TEXT = "then this page's own server";
export function defaultServerText(coopServer: string): string { return `${coopServer} ${DEFAULT_FALLBACK_TEXT}`; }
export function serverHostText(url: string): string {
    const m = /^wss?:\/\/(?:[^/?#@]*@)?([^/?#]+)/i.exec(url);
    return m ? m[1]! : "";
}
interface ListSource {
    readonly url: string;
    readonly conn: Connector;
    rooms: readonly RoomInfo[] | null;
    unlisted: boolean;
    unreached: boolean;
}
export function createCoopPage(deps: CoopPageDeps): CoopPageController {
    let role: "host" | "join" | null = null;
    let phase: Phase = "idle";
    let view: "main" | "name" | "join" | "entry" | "password" = "main";
    let hostStart: HostStart | null = null;
    let pwCell: ("saved" | "default")[] = [];
    let freeEntry: string | null = null;
    const pc = deps.passwordChoice;
    function chooseStart(code: string | null): boolean {
        if (code === null)
            hostStart = null;
        else {
            const t = pc?.check(code) ?? null;
            if (t === null)
                return false;
            hostStart = { code, name: pc!.levelName(t) };
        }
        view = "name";
        freeEntry = null;
        note = "";
        deps.requestRender();
        return true;
    }
    function openChooser(): void {
        view = "password";
        pwCell = [];
        freeEntry = null;
        note = "";
        if (pc?.rows() === null && pc.load)
            void pc.load().then(() => deps.requestRender(), () => deps.requestRender());
        deps.requestRender();
    }
    let roomName = DEFAULT_ROOM_NAME;
    let nameTyped = false;
    let infoToken = 0;
    let shownName = "";
    let roomId = "";
    let entry: {
        readonly id: string;
        readonly name: string;
        readonly url: string | undefined;
    } | null = null;
    let rooms: readonly RoomInfo[] | null = null;
    let roomServer = new Map<string, string>();
    let unlisted = false;
    let sources: ListSource[] = [];
    let listTimer: unknown = null;
    let listToken = 0;
    let hostUrls: readonly string[] = [];
    const timers = deps.timers ?? REAL_TIMERS;
    const pageLoc = (): {
        protocol: string;
        host: string;
    } | null => {
        if (deps.page !== undefined)
            return deps.page;
        const g = (globalThis as {
            location?: {
                protocol: string;
                host: string;
            };
        }).location;
        return g ? { protocol: g.protocol, host: g.host } : null;
    };
    const ownOrTyped = (): string => serverInUse(deps.getSettings().net.server, pageLoc(), deps.net);
    const defaultOn = (): boolean => deps.app.coopServer !== "" && normalizeServer(deps.getSettings().net.server, deps.net) === "";
    const servers = (): string[] => {
        if (!defaultOn())
            return [ownOrTyped()];
        const own = ownOrTyped();
        return own === "" || own === deps.app.coopServer ? [deps.app.coopServer] : [deps.app.coopServer, own];
    };
    const inUse = (): string => servers()[0]!;
    const connectorFor = (url: string): Connector => defaultOn() && url === deps.app.coopServer ? deps.connector(url, { ms: deps.net.serverReachMs, timers }) : deps.connector(url);
    let via = "";
    let code = "";
    let note = "";
    let liveH: CoopLive | null = null;
    let transportH: Closable | null = null;
    let cancelRoom: (() => void) | null = null;
    let token = 0;
    let selfLeft = false;
    const coop = (): CoopPage | null => liveH?.coop ?? null;
    const name = (i: number): string => deps.characterNames[i] ?? CHARACTER_NAMES[i] ?? "partner";
    function status(): string {
        const cp = coop();
        const through = serverHostText(via);
        if (cp)
            return through !== "" ? `${cp.statusLine} (through ${through})` : cp.statusLine;
        return note;
    }
    function fail(err: unknown): void {
        note = err instanceof Unreachable ? err.message : `refused: ${failureWords(err)}`;
        phase = "idle";
        role = null;
        cancelRoom?.();
        cancelRoom = null;
        deps.requestRender();
    }
    function begin(transport: Closable, seat: 0 | 1, hostCode: string): void {
        const s = deps.getSettings();
        code = hostCode;
        transportH = transport;
        closeJoinPage();
        let shownTold = false;
        deps.sessionAudio?.(seat);
        const tellShown = (): void => {
            if (!shownTold && liveH && phase === "open") {
                shownTold = true;
                phase = "session";
                deps.onSessionStart(liveH);
                deps.requestRender();
            }
        };
        liveH = startCoopLive({
            ...deps.live,
            drawScreen: (pic) => { tellShown(); deps.live.drawScreen?.(pic); },
            consts: deps.app,
            path: () => (transport as {
                path?: "direct" | "relay";
            }).path ?? "direct",
            speed: { mode: s.speed.mode, custom_steps: s.speed.custom_steps },
            characterName: name,
            makePage: (hooks) => {
                const cp = new CoopPage({
                    consts: deps.net, hello: deps.hello, clock: hooks.clock, transport, seat, makeCore: (start) => pacedCore(deps.app, deps.makeCore(start), start), ...(deps.scheme ? { scheme: deps.scheme() } : {}),
                    onDraw: hooks.onDraw, onEffect: hooks.onEffect, onAudio: hooks.onAudio,
                    screens: deps.screens,
                    screenPace: (start) => speedPace(deps.app, start ? start.options["speed"] : deps.getSettings().speed),
                    startWith: () => ({ settings: deps.getSettings(), seed: deps.seed() }),
                    ...(deps.onScreenEvents ? { onScreenEvents: deps.onScreenEvents } : {}),
                    ...(deps.onConfirmed ? { onConfirmed: (step: number, saved: string) => deps.onConfirmed!(seat, step, saved) } : {}),
                });
                cp.code = hostCode;
                return cp;
            },
            onLine: (l) => { deps.onLine?.(l); },
            onStatus: () => {
                const cp = coop();
                if (cp && cp.screenPicture() !== null)
                    tellShown();
                deps.requestRender();
            },
            onStarted: () => { tellShown(); deps.requestRender(); },
            onEnd: (reason) => { phase = "over"; deps.onSessionEnd?.(reason, !selfLeft && liveH !== null && liveH.coop.page.partnerLost); deps.requestRender(); },
            ...(deps.onGameOver ? { onGameOver: deps.onGameOver } : {}),
        });
        phase = "open";
        note = "";
        deps.requestRender();
    }
    async function open(as: "host" | "join", only?: string, listedId?: string): Promise<void> {
        if (phase !== "idle")
            return;
        if (as === "join" && code === "") {
            note = "type the room code into the Join row";
            deps.requestRender();
            return;
        }
        const tries = (only !== undefined ? [only] : servers()).filter((u) => !blockedByHttps(pageLoc(), u));
        if (tries.length === 0) {
            note = HTTPS_WS_TEXT;
            deps.requestRender();
            return;
        }
        const mine = ++token;
        roomId = "";
        shownName = as === "join" && entry !== null && listedId === entry.id ? entry.name : "";
        role = as;
        phase = "connecting";
        note = "connecting";
        hostUrls = [];
        via = "";
        deps.requestRender();
        const unreached: string[] = [];
        let refusal: unknown = null;
        try {
            for (const url of tries) {
                const conn = only !== undefined ? deps.connector(url) : connectorFor(url);
                if (as === "host") {
                    let h: Awaited<ReturnType<Connector["host"]>>;
                    try {
                        h = await conn.host(roomName);
                    }
                    catch (err) {
                        if (mine !== token)
                            return;
                        if (err instanceof Unreachable) {
                            unreached.push(url);
                            continue;
                        }
                        throw err;
                    }
                    if (mine !== token) {
                        h.cancel();
                        return;
                    }
                    via = conn.server ?? "";
                    code = h.code;
                    shownName = h.name ?? roomName;
                    roomId = h.id ?? "";
                    hostUrls = h.urls ?? [];
                    note = "waiting for the partner";
                    cancelRoom = h.cancel;
                    deps.requestRender();
                    const tp = await h.peer;
                    if (mine !== token) {
                        tp.close();
                        return;
                    }
                    begin(tp, 0, h.code);
                    return;
                }
                let tp: Closable;
                try {
                    tp = await conn.join(code, listedId);
                }
                catch (err) {
                    if (mine !== token)
                        return;
                    if (err instanceof Unreachable) {
                        unreached.push(url);
                        continue;
                    }
                    if (err instanceof ServerRefusal && err.reason === "no_room") {
                        refusal = err;
                        continue;
                    }
                    throw err;
                }
                if (mine !== token) {
                    tp.close();
                    return;
                }
                via = conn.server ?? "";
                begin(tp, 1, code);
                return;
            }
            throw refusal ?? new Unreachable(unreached.join(", "));
        }
        catch (err) {
            if (mine !== token)
                return;
            fail(err);
            if (err === refusal && defaultOn() && unreached.includes(deps.app.coopServer)) {
                note = `${note} (cannot reach ${deps.app.coopServer})`;
                deps.requestRender();
            }
        }
    }
    function merge(): void {
        const seen = new Map<string, string>();
        const out: RoomInfo[] = [];
        let any = false;
        for (const s of sources) {
            if (s.rooms === null)
                continue;
            any = true;
            for (const r of s.rooms) {
                const k = r.id;
                if (seen.has(k))
                    continue;
                seen.set(k, s.url);
                out.push(r);
            }
        }
        rooms = any ? out : null;
        roomServer = seen;
        unlisted = sources.length > 0 && sources.every((s) => s.unlisted);
    }
    function listLine(): string {
        if (sources.length < 2)
            return "";
        if (sources.every((x) => x.unreached))
            return new Unreachable(sources.map((x) => x.url).join(", ")).message;
        const dflt = defaultOn() ? sources.find((x) => x.url === deps.app.coopServer) : undefined;
        return dflt !== undefined && dflt.unreached ? new Unreachable(dflt.url).message : "";
    }
    function poll(): void {
        listTimer = null;
        if (view !== "join" && view !== "entry")
            return;
        const mine = listToken;
        if (phase === "idle") {
            for (const s of sources) {
                if (s.unlisted || !s.conn.rooms)
                    continue;
                s.conn.rooms().then((list) => {
                    if (mine !== listToken)
                        return;
                    s.unreached = false;
                    if (list === null) {
                        s.unlisted = true;
                        s.rooms = null;
                    }
                    else {
                        s.rooms = list;
                    }
                    merge();
                    const line = listLine();
                    if (line !== "" && phase === "idle" && (note === "" || note.startsWith("cannot reach")))
                        note = line;
                    else if (line === "" && note.startsWith("cannot reach"))
                        note = "";
                    deps.requestRender();
                }, (err: unknown) => {
                    if (mine !== listToken)
                        return;
                    s.unreached = true;
                    s.rooms = null;
                    merge();
                    if (phase === "idle") {
                        if (sources.length === 1)
                            note = failureWords(err);
                        else if (sources.every((x) => x.unreached))
                            note = listLine();
                        else {
                            const line = listLine();
                            if (line !== "" && (note === "" || note.startsWith("cannot reach")))
                                note = line;
                        }
                    }
                    deps.requestRender();
                });
            }
        }
        listTimer = timers.setTimeout(poll, deps.net.roomListMs);
    }
    function openNamePage(): void {
        view = "name";
        hostStart = null;
        roomName = DEFAULT_ROOM_NAME;
        nameTyped = false;
        note = "";
        const mine = ++infoToken;
        const urls = servers().filter((u) => !blockedByHttps(pageLoc(), u));
        deps.requestRender();
        const ask = (i: number): void => {
            if (i >= urls.length || mine !== infoToken)
                return;
            const conn = connectorFor(urls[i]!);
            if (!conn.info)
                return;
            conn.info().then((computer) => {
                if (mine !== infoToken || view !== "name" || nameTyped || phase !== "idle")
                    return;
                roomName = computer !== null && computer !== "" ? computer : DEFAULT_ROOM_NAME;
                deps.requestRender();
            }, () => { ask(i + 1); });
        };
        ask(0);
    }
    function openJoinPage(): void {
        closeJoinPage();
        view = "join";
        rooms = null;
        roomServer = new Map();
        unlisted = false;
        note = "";
        const urls = servers().filter((u) => !blockedByHttps(pageLoc(), u));
        if (urls.length === 0) {
            note = HTTPS_WS_TEXT;
            deps.requestRender();
            return;
        }
        sources = urls.map((url) => ({ url, conn: deps.connector(url), rooms: null, unlisted: false, unreached: false }));
        deps.requestRender();
        poll();
    }
    function closeJoinPage(): void {
        listToken++;
        if (listTimer !== null)
            timers.clearTimeout(listTimer);
        listTimer = null;
        for (const s of sources)
            s.conn.closeRooms?.();
        sources = [];
        view = "main";
        entry = null;
    }
    function keepServer(text: string): void {
        deps.saveServer?.(normalizeServer(text, deps.net));
        note = "";
        deps.requestRender();
    }
    function leave(): void {
        token++;
        cancelRoom?.();
        cancelRoom = null;
        if (liveH) {
            if (phase === "session") {
                selfLeft = true;
                liveH.leave();
            }
            else {
                liveH.stop();
                liveH = null;
                deps.sessionAudio?.(null);
            }
        }
        if (phase !== "session") {
            phase = "idle";
            note = "";
            role = null;
        }
        deps.requestRender();
    }
    function quit(): void {
        token++;
        closeJoinPage();
        cancelRoom?.();
        cancelRoom = null;
        if (liveH) {
            liveH.leave();
            liveH.stop();
            liveH = null;
            deps.sessionAudio?.(null);
        }
        transportH?.close();
        transportH = null;
        phase = "idle";
        role = null;
        note = "";
    }
    const idle = (): boolean => phase === "idle";
    const inGame = (): boolean => phase === "session" || (phase === "over" && liveH !== null && liveH.coop.page.core !== null);
    let serverText: string | null = null;
    const busyLabel = (): string => (phase === "session" || phase === "over" ? "Leave" : "Cancel");
    return {
        get phase() { return phase; },
        get inSession() { return phase === "session" || (phase === "over" && liveH !== null && liveH.coop.page.core !== null); },
        get code() { return code; },
        get hostUrls() { return hostUrls.length > 0 ? hostUrlsLine(hostUrls) : ""; },
        status,
        waitingScreen(nowMs: number): WaitingScreen | null {
            if (role !== "join" || (phase !== "connecting" && phase !== "open"))
                return null;
            const cp = coop();
            const turn = ((nowMs % SPINNER_TURN_MS) + SPINNER_TURN_MS) % SPINNER_TURN_MS;
            return { heading: "Waiting for the host", line: hostScreenLine(cp ? cp.hostScreen : null), angle: (turn * 360) / SPINNER_TURN_MS, row: busyLabel() };
        },
        setCode(text: string): void { if (idle())
            code = normalizeCode(text); },
        joinCode: () => { if (view === "entry" && entry !== null)
            void open("join", entry.url, entry.id);
        else
            void open("join"); },
        setServer: (text) => { if (idle()) {
            serverText = null;
            keepServer(text);
        } },
        server: inUse,
        get joinPage() { return view === "join"; },
        rooms: () => rooms,
        back(): boolean {
            if (!idle() || view === "main")
                return false;
            if (view === "password") {
                view = "name";
                freeEntry = null;
            }
            else if (view === "name") {
                view = "main";
                infoToken++;
            }
            else if (view === "entry") {
                view = "join";
                entry = null;
                code = "";
            }
            else
                closeJoinPage();
            note = "";
            deps.requestRender();
            return true;
        },
        setRoomName(text: string): void { if (idle() && view === "name") {
            roomName = text;
            nameTyped = true;
        } },
        get roomName() { return roomName; },
        get hostStart() { return hostStart; },
        setFreeEntry(text: string | null): void { if (view === "password") {
            freeEntry = text === null ? null : normalizeEntry(text);
            deps.requestRender();
        } },
        playFreeEntry(): boolean { return view === "password" && freeEntry !== null && chooseStart(freeEntry); },
        pickCell(index: number, id: "saved" | "default"): void { if (view === "password" && index >= 1) {
            pwCell[index - 1] = id;
            deps.requestRender();
        } },
        get view() { return view; },
        get shownName() { return shownName; },
        get roomId() { return roomId; },
        live: () => liveH,
        leave,
        quit,
        items(): Item[] {
            if (!idle() && role !== null) {
                const room = { label: busyLabel(), value: shownName !== "" ? `room ${shownName}` : code === "" ? "(opening the room)" : `room ${code}` };
                return inGame() ? [room, { label: "Host a game", value: "ends this game" }, { label: "Join a game", value: "ends this game" }] : [room];
            }
            if (view === "name")
                return [{ label: "Room name", value: roomName }, { label: "Password", value: hostStart === null ? "New game" : `${hostStart.code}  ${hostStart.name}` }, { label: "Open room", value: "" }];
            if (view === "password") {
                const rows = pc?.rows() ?? null;
                const slots = pc?.saved() ?? [];
                const out: Item[] = [{ label: "New game", value: "" }];
                if (rows === null)
                    return [...out, { label: "Loading the list...", value: "" }];
                rows.forEach((r, i) => {
                    const saved = `Saved ${slots[i] || "-"}`, def = `Default ${r.code}`;
                    const sv = (pwCell[i] ?? "default") === "saved";
                    out.push({ label: r.name, value: sv ? `[${saved}]  ${def}` : `${saved}  [${def}]`, group: `Episode ${r.episode + 1}`, cells: [{ id: "saved" as const, text: sv ? `[${saved}]` : saved }, { id: "default" as const, text: sv ? def : `[${def}]` }] } as Item);
                });
                for (const x of pc!.extras())
                    out.push({ label: `${x.code} (${pc!.levelName(x)})`, value: x.code, group: "Extra codes" } as Item);
                out.push({ label: "Free entry...", value: freeEntry ?? "" });
                return out;
            }
            if (view === "entry")
                return [{ label: "Room code", value: code || "(type the room code)" }];
            if (view === "join") {
                const rows: Item[] = rooms === null ? [] : rooms.length === 0 ? [{ label: NO_ROOM_TEXT, value: "" }] : rooms.map(roomRow);
                rows.push({ label: "Room code", value: code || "(type the room code)" });
                return rows;
            }
            return [
                { label: "Host a game", value: "" },
                { label: "Join a game", value: "" },
                { label: "Server", value: defaultOn() ? defaultServerText(deps.app.coopServer) : inUse() || "(the page's own server)" },
            ];
        },
        adjust(index: number, _delta: -1 | 1, chosen: boolean): void {
            if (!chosen)
                return;
            if (!idle()) {
                if (index === 0)
                    leave();
                else if (inGame() && (index === 1 || index === 2)) {
                    quit();
                    deps.onSessionDropped?.();
                    deps.requestRender();
                    if (index === 1)
                        openNamePage();
                    else
                        openJoinPage();
                }
                return;
            }
            if (view === "name") {
                if (index === 0 || index === 2)
                    void open("host");
                else if (index === 1 && pc !== undefined)
                    openChooser();
                return;
            }
            if (view === "password") {
                if (index === 0) {
                    if (chosen)
                        chooseStart(null);
                    return;
                }
                const rows = pc?.rows() ?? null;
                if (rows === null)
                    return;
                const i = index - 1;
                if (i < rows.length) {
                    if (!chosen) {
                        pwCell[i] = (pwCell[i] ?? "default") === "saved" ? "default" : "saved";
                        deps.requestRender();
                        return;
                    }
                    const code = (pwCell[i] ?? "default") === "saved" ? pc!.saved()[i] ?? "" : rows[i]!.code;
                    if (code !== "")
                        chooseStart(code);
                }
                else if (i < rows.length + pc!.extras().length) {
                    if (chosen)
                        chooseStart(pc!.extras()[i - rows.length]!.code);
                }
                else if (chosen) {
                    freeEntry = freeEntry === null ? "" : null;
                    deps.requestRender();
                }
                return;
            }
            if (view === "entry") {
                if (index === 0 && entry !== null)
                    void open("join", entry.url, entry.id);
                return;
            }
            if (view === "join") {
                const listed = rooms ?? [];
                if (index < listed.length) {
                    const r = listed[index]!;
                    entry = { id: r.id, name: r.name, url: roomServer.get(r.id) };
                    view = "entry";
                    code = "";
                    note = "";
                    deps.requestRender();
                }
                else if (index === (rooms === null ? 0 : Math.max(1, listed.length)))
                    void open("join");
                return;
            }
            if (index === HOST_ROW)
                openNamePage();
            else if (index === JOIN_ROW)
                openJoinPage();
            else if (index === SERVER_ROW) {
                const t = serverText ?? deps.getSettings().net.server;
                serverText = null;
                keepServer(t);
            }
        },
        renderExtra(panel: HTMLElement): void {
            if (role === "host" && code !== "" && (phase === "connecting" || phase === "open")) {
                if (shownName !== "") {
                    const nm = document.createElement("div");
                    nm.style.cssText = "font:bold 22px sans-serif;margin:12px 0 0";
                    nm.textContent = shownName;
                    panel.appendChild(nm);
                }
                const big = document.createElement("div");
                big.style.cssText = "font:bold 48px monospace;letter-spacing:.2em;margin:12px 0 4px";
                big.textContent = code;
                panel.appendChild(big);
                const tell = document.createElement("div");
                tell.className = "zt-note";
                tell.textContent = "tell it to your partner";
                panel.appendChild(tell);
                if (hostUrls.length > 0) {
                    const urls = document.createElement("div");
                    urls.className = "zt-note";
                    urls.textContent = hostUrlsLine(hostUrls);
                    panel.appendChild(urls);
                }
            }
            if (idle() && view === "main") {
                const input = document.createElement("input");
                input.type = "text";
                input.value = serverText ?? deps.getSettings().net.server;
                input.size = 40;
                input.placeholder = `co-op server (empty: ${deps.app.coopServer !== "" ? defaultServerText(deps.app.coopServer) : serverInUse("", pageLoc(), deps.net) || "the page's own"})`;
                input.spellcheck = false;
                input.autocomplete = "off";
                input.addEventListener("input", () => { serverText = input.value; });
                input.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Enter") {
                    serverText = null;
                    keepServer(input.value);
                } });
                panel.appendChild(input);
            }
            if (idle() && view === "name") {
                const input = document.createElement("input");
                input.type = "text";
                input.value = roomName;
                input.maxLength = deps.net.roomNameMax;
                input.size = deps.net.roomNameMax + 2;
                input.placeholder = "room name";
                input.spellcheck = false;
                input.autocomplete = "off";
                input.addEventListener("input", () => { roomName = input.value; nameTyped = true; });
                input.addEventListener("keydown", (ev) => { if (ev.key === "Escape")
                    return; ev.stopPropagation(); if (ev.key === "Enter") {
                    roomName = input.value;
                    void open("host");
                } });
                panel.appendChild(input);
                setTimeout(() => { input.focus(); if (!nameTyped)
                    input.select(); }, 0);
            }
            if (idle() && view === "password" && freeEntry !== null && pc !== undefined) {
                const input = document.createElement("input");
                input.type = "text";
                input.maxLength = PASSWORD_LENGTH;
                input.value = freeEntry;
                input.size = 14;
                input.spellcheck = false;
                input.autocomplete = "off";
                const verdict = document.createElement("div");
                verdict.className = "zt-note";
                const play = document.createElement("button");
                play.textContent = "Play";
                const saveBtn = document.createElement("button");
                saveBtn.textContent = "Save";
                const judge = (): PasswordTarget | null => {
                    const t = pc.check(freeEntry ?? "");
                    verdict.textContent = t ? `Accepted: ${pc.levelName(t)}` : "The game refuses this password.";
                    play.disabled = saveBtn.disabled = t === null;
                    return t;
                };
                input.addEventListener("input", () => { const n = normalizeEntry(input.value); if (n !== input.value)
                    input.value = n; freeEntry = n; judge(); });
                input.addEventListener("keydown", (ev) => { if (ev.key === "Escape")
                    return; ev.stopPropagation(); if (ev.key === "Enter" && judge())
                    chooseStart(freeEntry ?? ""); });
                play.addEventListener("click", () => { if (judge())
                    chooseStart(freeEntry ?? ""); });
                saveBtn.addEventListener("click", () => {
                    const t = judge();
                    if (t && pc.store) {
                        note = pc.store(freeEntry ?? "", t) ? `Saved for ${pc.levelName(t)}.` : "No level row for this password.";
                        deps.requestRender();
                    }
                });
                panel.append(input, play, saveBtn, verdict);
                judge();
                setTimeout(() => input.focus(), 0);
            }
            if (idle() && view === "entry" && entry !== null) {
                const nm = document.createElement("div");
                nm.style.cssText = "font:bold 22px sans-serif;margin:12px 0 0";
                nm.textContent = entry.name;
                const line = document.createElement("div");
                line.className = "zt-note";
                line.textContent = CODE_ENTRY_TEXT;
                const input = document.createElement("input");
                input.type = "text";
                input.value = code;
                input.size = deps.net.roomCodeLen + 4;
                input.placeholder = "room code";
                input.spellcheck = false;
                input.autocomplete = "off";
                const target = entry;
                input.addEventListener("input", () => { code = normalizeCode(input.value); });
                input.addEventListener("keydown", (ev) => { if (ev.key === "Escape")
                    return; ev.stopPropagation(); if (ev.key === "Enter") {
                    code = normalizeCode(input.value);
                    void open("join", target.url, target.id);
                } });
                panel.append(nm, line, input);
                setTimeout(() => input.focus(), 0);
            }
            if (idle() && view === "join") {
                const input = document.createElement("input");
                input.type = "text";
                input.value = code;
                input.size = deps.net.roomCodeLen + 4;
                input.placeholder = "room code";
                input.spellcheck = false;
                input.autocomplete = "off";
                input.addEventListener("input", () => { code = normalizeCode(input.value); });
                input.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Enter") {
                    code = normalizeCode(input.value);
                    void open("join");
                } });
                panel.appendChild(input);
            }
            const line = document.createElement("div");
            line.className = "zt-note";
            line.textContent = status();
            panel.appendChild(line);
        },
    };
}

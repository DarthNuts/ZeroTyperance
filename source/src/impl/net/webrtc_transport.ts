/// <reference lib="dom" />
import type { NetConstants } from "./constants.js";
import type { ServerClient } from "./server_client.js";
import type { ChannelName, Transport } from "./transport.js";
export interface SessionTransport {
    readonly transport: Transport & {
        close(): void;
    };
    readonly kind: "direct" | "relay";
}
export interface OpenOptions {
    readonly consts: NetConstants;
    readonly PeerConnection?: new (cfg: RTCConfiguration) => RTCPeerConnection;
    readonly setTimeout?: (fn: () => void, ms: number) => unknown;
    readonly clearTimeout?: (h: unknown) => void;
}
type Sig = {
    k: "offer" | "answer";
    sdp: RTCSessionDescriptionInit;
} | {
    k: "cand";
    cand: RTCIceCandidateInit | null;
} | {
    k: "open";
} | {
    k: "relay";
};
export class PathAgreement {
    private localOpen = false;
    private peerOpen = false;
    private relay = false;
    localOpened(): void { this.localOpen = true; }
    localRelay(): void { this.relay = true; }
    peerReported(k: "open" | "relay"): void { if (k === "relay")
        this.relay = true;
    else
        this.peerOpen = true; }
    decision(): "direct" | "relay" | null {
        if (this.relay)
            return "relay";
        return this.localOpen && this.peerOpen ? "direct" : null;
    }
}
export function openSessionTransport(client: ServerClient, seat: 0 | 1, iceServers: RTCIceServer[], opts: OpenOptions): Promise<SessionTransport> {
    const PC = opts.PeerConnection ?? (globalThis as unknown as {
        RTCPeerConnection?: new (cfg: RTCConfiguration) => RTCPeerConnection;
    }).RTCPeerConnection;
    const setT = opts.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
    const clearT = opts.clearTimeout ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
    return new Promise<SessionTransport>((resolve) => {
        let done = false;
        let pc: RTCPeerConnection | null = null;
        let timer: unknown = null;
        const agree = new PathAgreement();
        let chain: Promise<void> = Promise.resolve();
        const inbox: string[] = [];
        const chans: {
            r?: RTCDataChannel;
            u?: RTCDataChannel;
        } = {};
        const finishRelay = (tellPeer: boolean): void => {
            if (done)
                return;
            done = true;
            if (timer !== null)
                clearT(timer);
            if (tellPeer)
                client.sendSignal({ k: "relay" } satisfies Sig);
            try {
                pc?.close();
            }
            catch { }
            client.onSignal(null);
            resolve({ transport: client.relayTransport(), kind: "relay" });
        };
        const finishDirect = (): void => {
            if (done)
                return;
            done = true;
            if (timer !== null)
                clearT(timer);
            client.onSignal(null);
            const t: Transport & {
                close(): void;
            } = {
                send(channel: ChannelName, text: string): void {
                    const dc = channel === "reliable" ? chans.r : chans.u;
                    if (dc && dc.readyState === "open")
                        dc.send(text);
                },
                receive: () => inbox.splice(0),
                close(): void { try {
                    pc?.close();
                }
                catch { } client.leave(); },
            };
            resolve({ transport: t, kind: "direct" });
        };
        const check = (): void => { if (agree.decision() === "direct")
            finishDirect(); };
        timer = setT(() => { agree.localRelay(); finishRelay(true); }, opts.consts.connectTimeoutMs);
        if (!PC) {
            finishRelay(true);
            return;
        }
        try {
            pc = new PC({ iceServers });
        }
        catch {
            finishRelay(true);
            return;
        }
        const conn = pc;
        const wire = (name: "r" | "u", dc: RTCDataChannel): void => {
            chans[name] = dc;
            dc.onmessage = (ev: MessageEvent) => { if (typeof ev.data === "string")
                inbox.push(ev.data); };
            dc.onopen = () => {
                if (chans.r?.readyState === "open" && chans.u?.readyState === "open" && agree.decision() === null) {
                    agree.localOpened();
                    client.sendSignal({ k: "open" } satisfies Sig);
                    check();
                }
            };
        };
        wire("r", conn.createDataChannel("r", { negotiated: true, id: 0, ordered: true }));
        wire("u", conn.createDataChannel("u", { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 }));
        conn.onicecandidate = (ev: RTCPeerConnectionIceEvent) => { if (!done)
            client.sendSignal({ k: "cand", cand: ev.candidate ? ev.candidate.toJSON() : null } satisfies Sig); };
        conn.onconnectionstatechange = () => { if (conn.connectionState === "failed")
            finishRelay(true); };
        client.onSignal((data) => {
            if (done)
                return;
            const s = data as Sig | null;
            if (!s || typeof s !== "object")
                return;
            chain = chain.then(async () => {
                if (done)
                    return;
                try {
                    if (s.k === "offer") {
                        await conn.setRemoteDescription(s.sdp);
                        const ans = await conn.createAnswer();
                        await conn.setLocalDescription(ans);
                        client.sendSignal({ k: "answer", sdp: ans } satisfies Sig);
                    }
                    else if (s.k === "answer") {
                        await conn.setRemoteDescription(s.sdp);
                    }
                    else if (s.k === "cand") {
                        if (s.cand)
                            await conn.addIceCandidate(s.cand);
                    }
                    else if (s.k === "open") {
                        agree.peerReported("open");
                        check();
                    }
                    else if (s.k === "relay") {
                        agree.peerReported("relay");
                        finishRelay(false);
                    }
                }
                catch {
                    finishRelay(true);
                }
            });
        });
        if (seat === 0) {
            void (async () => {
                try {
                    const offer = await conn.createOffer();
                    await conn.setLocalDescription(offer);
                    client.sendSignal({ k: "offer", sdp: offer } satisfies Sig);
                }
                catch {
                    finishRelay(true);
                }
            })();
        }
    });
}

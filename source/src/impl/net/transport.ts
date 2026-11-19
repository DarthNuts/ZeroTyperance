export type ChannelName = "reliable" | "unreliable";
export interface Transport {
    send(channel: ChannelName, text: string): void;
    receive(): string[];
}
export function localPair(): [
    Transport,
    Transport
] {
    const boxes: [
        string[],
        string[]
    ] = [[], []];
    const end = (me: 0 | 1): Transport => ({
        send: (_channel, text) => { boxes[1 - me]!.push(text); },
        receive: () => boxes[me].splice(0),
    });
    return [end(0), end(1)];
}
export function broadcastTransport(room: string, seat: 0 | 1): Transport & {
    close(): void;
} {
    const bc = new BroadcastChannel(`zt-net-${room}`);
    const inbox: string[] = [];
    bc.onmessage = (ev: MessageEvent) => {
        const m = ev.data as {
            from: number;
            text: string;
        };
        if (m && m.from !== seat && typeof m.text === "string")
            inbox.push(m.text);
    };
    return {
        send: (channel, text) => bc.postMessage({ from: seat, channel, text }),
        receive: () => inbox.splice(0),
        close: () => bc.close(),
    };
}

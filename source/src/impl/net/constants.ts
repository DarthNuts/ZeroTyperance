export interface LinkProfile {
    readonly latency_ms: number;
    readonly jitter_ms: number;
    readonly loss: number;
    readonly burst_enter: number;
    readonly burst_exit: number;
    readonly burst_loss: number;
    readonly reorder: number;
    readonly duplicate: number;
    readonly bandwidth_kbit: number | null;
    readonly queue_ms: number | null;
}
export type ProfileName = "lan" | "good_wifi" | "bad_wifi" | "mobile_tether" | "transatlantic" | "hell";
export interface NetConstants {
    readonly protocol: number;
    readonly delayDefault: number;
    readonly delayMax: number;
    readonly maxPrediction: number;
    readonly redundancy: number;
    readonly digestEvery: number;
    readonly digest: string;
    readonly waitNoticeMs: number;
    readonly syncAhead: number;
    readonly syncWindow: number;
    readonly syncSkipEvery: number;
    readonly lateEffectMax: number;
    readonly lagWindow: number;
    readonly echoEveryMs: number;
    readonly echoWindow: number;
    readonly echoLateMs: number;
    readonly timeoutMs: number;
    readonly waitEveryMs: number;
    readonly connectTimeoutMs: number;
    readonly roomCodeLen: number;
    readonly roomCodeAlphabet: string;
    readonly stunDefault: readonly string[];
    readonly syncWindowMs: number;
    readonly serverProtocol: number;
    readonly serverPath: string;
    readonly serverFrameMax: number;
    readonly serverRate: number;
    readonly roomListMs: number;
    readonly serverReachMs: number;
    readonly roomListMax: number;
    readonly roomNameMax: number;
    readonly gateSeeds: number;
    readonly gateSteps: number;
    readonly healSteps: number;
    readonly healQuietSteps: number;
    readonly profiles: Readonly<Record<ProfileName, LinkProfile>>;
}
export interface Doc {
    readonly constants: readonly {
        readonly id: string;
        readonly value: unknown;
    }[];
}
export function netConstantsFrom(doc: Doc): NetConstants {
    const m = new Map(doc.constants.map((c) => [c.id, c.value]));
    const get = <T>(id: string): T => {
        if (!m.has(id))
            throw new Error(`net_rollback.json: no ${id}`);
        return m.get(id) as T;
    };
    const profiles = {} as Record<ProfileName, LinkProfile>;
    for (const name of ["lan", "good_wifi", "bad_wifi", "mobile_tether", "transatlantic", "hell"] as const)
        profiles[name] = get<LinkProfile>(`NET.PROFILE.${name.toUpperCase()}`);
    return {
        protocol: get("NET.PROTOCOL"),
        delayDefault: get("NET.INPUT_DELAY_DEFAULT"),
        delayMax: get("NET.INPUT_DELAY_MAX"),
        maxPrediction: get("NET.MAX_PREDICTION"),
        redundancy: get("NET.INPUT_REDUNDANCY"),
        digestEvery: get("NET.DIGEST_EVERY"),
        digest: get("NET.DIGEST"),
        waitNoticeMs: get("NET.WAIT_NOTICE_MS"),
        syncAhead: get("NET.SYNC_AHEAD"),
        syncWindow: get("NET.SYNC_WINDOW"),
        syncSkipEvery: get("NET.SYNC_SKIP_EVERY"),
        syncWindowMs: get("NET.SYNC_WINDOW_MS"),
        serverProtocol: get("NET.SERVER_PROTOCOL"),
        serverPath: get("NET.SERVER_PATH"),
        serverFrameMax: get("NET.SERVER_FRAME_MAX"),
        serverRate: get("NET.SERVER_RATE"),
        roomListMs: get("NET.ROOM_LIST_MS"),
        serverReachMs: get("NET.SERVER_REACH_MS"),
        roomListMax: get("NET.ROOM_LIST_MAX"),
        roomNameMax: get("NET.ROOM_NAME_MAX"),
        lateEffectMax: get("NET.LATE_EFFECT_MAX"),
        lagWindow: get("NET.LAG_WINDOW"),
        echoEveryMs: get("NET.ECHO_EVERY_MS"),
        echoWindow: get("NET.ECHO_WINDOW"),
        echoLateMs: get("NET.ECHO_LATE_MS"),
        timeoutMs: get("NET.TIMEOUT_MS"),
        waitEveryMs: get("NET.WAIT_EVERY_MS"),
        connectTimeoutMs: get("NET.CONNECT_TIMEOUT_MS"),
        roomCodeLen: get("NET.ROOM_CODE_LEN"),
        roomCodeAlphabet: get("NET.ROOM_CODE_ALPHABET"),
        stunDefault: get("NET.STUN_DEFAULT"),
        gateSeeds: get("NET.GATE_SEEDS"),
        gateSteps: get("NET.GATE_STEPS"),
        healSteps: get("NET.HEAL_STEPS"),
        healQuietSteps: get("NET.HEAL_QUIET_STEPS"),
        profiles,
    };
}

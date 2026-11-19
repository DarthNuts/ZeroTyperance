/// <reference lib="dom" />
const MANIFEST_URL = "/audio/manifest.json";
const MANIFEST_FORMAT = "ztassets-audio/1";
const MUSIC_CHANNEL = "music";
const PLAY_MUSIC_VAR_OPCODE = 5;
const PLAY_MUSIC_CMD_OPCODE = 16;
type Kind = "music" | "sfx" | "voice";
interface ManifestEntry {
    kind: Kind;
    mode: number;
    cmd: string | number;
    var: string | number;
    files: Partial<Record<"wav" | "ogg" | "mp3", {
        path: string;
    }>>;
    seconds?: number;
}
interface AudioManifest {
    format: string;
    sounds: Record<string, ManifestEntry>;
}
export interface AudioRequest {
    type: string;
    opcode?: unknown;
    value?: unknown;
    channel?: unknown;
    id?: unknown;
    note?: unknown;
    param?: unknown;
    on?: unknown;
}
export function soundName(soundNumber: number): string {
    return soundNumber.toString(16).toUpperCase().padStart(2, "0");
}
function byteOf(v: unknown): number | null {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 255 ? n : null;
}
function key(kind: Kind, cmd: number, varByte: number): string {
    return `${kind}:${cmd}:${varByte}`;
}
export class AudioEngine {
    private manifest: AudioManifest | null = null;
    private readonly index = new Map<string, string>();
    private context: AudioContext | null = null;
    private master: GainNode | null = null;
    private level = 1;
    setLevel(level: number): void {
        this.level = Math.min(1, Math.max(0, level));
        if (this.master)
            this.master.gain.value = this.level;
    }
    private readonly decoded = new Map<string, Promise<AudioBuffer | null>>();
    private readonly playing = new Map<string, AudioBufferSourceNode>();
    private readonly serial = new Map<string, number>();
    private pendingMusicVar: number | null = null;
    lastNote = "";
    onNote: ((note: string) => void) | null = null;
    onPlay: ((text: string) => void) | null = null;
    async load(): Promise<void> {
        try {
            const res = await fetch(MANIFEST_URL);
            if (!res.ok)
                throw new Error(`${MANIFEST_URL}: HTTP ${res.status}`);
            const m = (await res.json()) as AudioManifest;
            if (m.format !== MANIFEST_FORMAT || typeof m.sounds !== "object" || m.sounds === null) {
                throw new Error(`${MANIFEST_URL}: format ${String(m.format)}, expected ${MANIFEST_FORMAT}`);
            }
            this.index.clear();
            for (const [name, e] of Object.entries(m.sounds)) {
                const cmd = byteOf(e.cmd);
                const v = byteOf(e.var);
                if (cmd === null || v === null || (e.kind !== "music" && e.kind !== "sfx" && e.kind !== "voice"))
                    continue;
                const k = key(e.kind, cmd, v);
                if (!this.index.has(k))
                    this.index.set(k, name);
            }
            this.manifest = m;
            this.note("");
        }
        catch (err) {
            this.note(`sound not available (${err instanceof Error ? err.message : String(err)}); run the extractor's audio command`);
        }
    }
    get loaded(): boolean {
        return this.manifest !== null;
    }
    get count(): number {
        return this.manifest ? Object.keys(this.manifest.sounds).length : 0;
    }
    private note(text: string): void {
        if (text === this.lastNote)
            return;
        this.lastNote = text;
        if (this.onNote)
            this.onNote(text);
    }
    private played(text: string): void {
        if (this.onPlay)
            this.onPlay(text);
    }
    private audio(): AudioContext | null {
        if (this.context)
            return this.context;
        const w = window as unknown as {
            AudioContext?: typeof AudioContext;
            webkitAudioContext?: typeof AudioContext;
        };
        const Ctor = w.AudioContext ?? w.webkitAudioContext;
        if (!Ctor) {
            this.note("sound: this browser has no Web Audio");
            return null;
        }
        try {
            this.context = new Ctor();
        }
        catch (err) {
            this.note(`sound: no audio context (${err instanceof Error ? err.message : String(err)})`);
            return null;
        }
        return this.context;
    }
    private output(ctx: AudioContext): AudioNode {
        if (this.master === null) {
            this.master = ctx.createGain();
            this.master.gain.value = this.level;
            this.master.connect(ctx.destination);
        }
        return this.master;
    }
    resume(): void {
        const ctx = this.audio();
        if (ctx && ctx.state === "suspended")
            ctx.resume().catch(() => undefined);
    }
    private fileUrl(name: string): string | null {
        const files = this.manifest?.sounds[name]?.files;
        const f = files?.ogg ?? files?.wav;
        return f ? `/${f.path}` : null;
    }
    private buffer(name: string): Promise<AudioBuffer | null> {
        const cached = this.decoded.get(name);
        if (cached)
            return cached;
        const p = (async (): Promise<AudioBuffer | null> => {
            const url = this.fileUrl(name);
            const ctx = this.audio();
            if (!url || !ctx)
                return null;
            const res = await fetch(url);
            if (!res.ok)
                throw new Error(`${url}: HTTP ${res.status}`);
            return ctx.decodeAudioData(await res.arrayBuffer());
        })();
        this.decoded.set(name, p);
        return p;
    }
    private lookup(kind: Kind, cmd: unknown, varByte: unknown, what: string): string | null {
        if (!this.manifest) {
            this.note(`sound: not loaded yet, ${what} not played`);
            return null;
        }
        const c = byteOf(cmd);
        const v = byteOf(varByte);
        const name = c !== null && v !== null ? this.index.get(key(kind, c, v)) : undefined;
        if (name === undefined) {
            this.note(`sound: no ${kind} entry for ${what}; nothing played`);
            return null;
        }
        return name;
    }
    prefetchMusic(varByte: number, cmd: number): void {
        const name = this.manifest ? this.index.get(key("music", cmd, varByte)) : undefined;
        if (name !== undefined)
            this.buffer(name).catch(() => undefined);
    }
    private stopChannel(channel: string): void {
        this.serial.set(channel, (this.serial.get(channel) ?? 0) + 1);
        if (channel === MUSIC_CHANNEL)
            this.music = null;
        const src = this.playing.get(channel);
        if (!src)
            return;
        this.playing.delete(channel);
        try {
            src.stop();
        }
        catch {
        }
    }
    stopAll(): void {
        for (const ch of [...this.playing.keys(), MUSIC_CHANNEL])
            this.stopChannel(ch);
        this.pendingMusicVar = null;
        this.music = null;
        this.pausedMusic = null;
    }
    private music: {
        name: string;
        startedAt: number | null;
    } | null = null;
    private paused = false;
    private pausedMusic: {
        name: string;
        offset: number;
    } | null = null;
    pause(): void {
        if (this.paused)
            return;
        this.paused = true;
        const ctx = this.context;
        const m = this.music;
        if (m !== null) {
            let offset = 0;
            if (m.startedAt !== null && ctx) {
                const buf = this.playing.get(MUSIC_CHANNEL)?.buffer;
                const elapsed = Math.max(0, ctx.currentTime - m.startedAt);
                offset = buf && buf.duration > 0 ? elapsed % buf.duration : 0;
            }
            this.pausedMusic = { name: m.name, offset };
        }
        for (const ch of [...this.playing.keys(), MUSIC_CHANNEL])
            this.stopChannel(ch);
        this.music = null;
        this.pendingMusicVar = null;
    }
    unpause(): void {
        if (!this.paused)
            return;
        this.paused = false;
        const p = this.pausedMusic;
        this.pausedMusic = null;
        if (p !== null)
            this.play(MUSIC_CHANNEL, p.name, true, `music resumed (${p.name})`, p.offset);
    }
    private play(channel: string, name: string, loop: boolean, what: string, offset = 0): void {
        if (this.paused && channel === MUSIC_CHANNEL) {
            this.pausedMusic = { name, offset: 0 };
            this.music = null;
            return;
        }
        this.stopChannel(channel);
        const ctx = this.audio();
        if (!ctx)
            return;
        this.resume();
        const my = this.serial.get(channel)!;
        if (channel === MUSIC_CHANNEL)
            this.music = { name, startedAt: null };
        this.played(`sound: ${what} -> ${name}${loop ? " (music, loops)" : ""}`);
        this.buffer(name)
            .then((buffer) => {
            if (buffer === null || my !== this.serial.get(channel))
                return;
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.loop = loop;
            src.connect(this.output(ctx));
            src.onended = () => {
                if (this.playing.get(channel) === src)
                    this.playing.delete(channel);
            };
            src.start(0, buffer.duration > 0 ? offset % buffer.duration : 0);
            if (channel === MUSIC_CHANNEL && this.music !== null)
                this.music.startedAt = ctx.currentTime - (buffer.duration > 0 ? offset % buffer.duration : 0);
            this.playing.set(channel, src);
            this.note(ctx.state === "suspended" ? `sound: ${name} queued; press a key or click to let the browser play` : "");
        })
            .catch((err: unknown) => {
            this.note(`sound: ${name} failed (${err instanceof Error ? err.message : String(err)})`);
        });
    }
    request(e: AudioRequest): void {
        switch (e.type) {
            case "Audio.PlayMusic": {
                const opcode = byteOf(e.opcode);
                if (opcode === PLAY_MUSIC_VAR_OPCODE) {
                    this.pendingMusicVar = byteOf(e.value);
                }
                else if (opcode === PLAY_MUSIC_CMD_OPCODE) {
                    const v = this.pendingMusicVar;
                    this.pendingMusicVar = null;
                    if (v === null) {
                        this.note(`sound: PlayMusic {16, ${String(e.value)}} without a PlayMusic {5, var} in the tick; nothing played`);
                        return;
                    }
                    const what = `music var ${v} cmd ${String(e.value)}`;
                    const name = this.lookup("music", e.value, v, what);
                    if (name !== null)
                        this.play(MUSIC_CHANNEL, name, true, what);
                }
                else {
                    this.note(`sound: PlayMusic opcode ${String(e.opcode)} is not part of a pair; ignored`);
                }
                return;
            }
            case "Audio.PlaySfx": {
                const what = `sfx id ${String(e.id)} note ${String(e.note)} on channel ${String(e.channel)}`;
                const name = this.lookup("sfx", e.id, e.note, what);
                if (name !== null)
                    this.play(String(e.channel), name, false, what);
                return;
            }
            case "Audio.PlayVoice": {
                const what = `voice id ${String(e.id)} param ${String(e.param)} on channel ${String(e.channel)}`;
                const name = this.lookup("voice", e.id, e.param, what);
                if (name !== null)
                    this.play(String(e.channel), name, false, what);
                return;
            }
            case "Audio.ChannelCtl":
                if (e.on === false)
                    this.stopChannel(String(e.channel));
                return;
            case "Audio.Stop":
                this.stopAll();
                return;
            case "Audio.StopTrack":
                this.stopChannel(MUSIC_CHANNEL);
                this.pausedMusic = null;
                return;
            default:
                return;
        }
    }
    endTick(): void {
        this.pendingMusicVar = null;
    }
}

/// <reference lib="dom" />
import type { MotionCoopRecord, MotionHdRecord, MotionLoopRecord, MotionObserver, MotionSnapshotRecord, MotionTickRecord } from "../boot/app/pace_loop.js";
const COOP_MERGE_MS = 6;
export const MOTION_LOG = Object.freeze({
    WINDOW_MS: 60000,
    SUMMARY_EVERY_MS: 10000,
    SLOW_FRAME_MS: 25,
    MOUSE_DIRECTION_HOLD_MS: 200,
    ANGLES: 512,
    FORMAT: "zt-motionlog/2",
    QUERY: "motionlog",
    STALL_MS: 50,
    AGAINST_MOUSE_MS: 200,
    LEAP_UNITS: 32,
    CLIP_BEFORE_MS: 3000,
    CLIP_AFTER_MS: 1000,
    MAX_CLIPS: 20,
    NOTICE_EVERY_MS: 1000,
});
export const MOTION_LOG_TEST = { rule329: false };
export type JumpKind = "stall" | "against" | "leap";
export interface MotionJump {
    readonly frameTimeMs: number;
    readonly kinds: JumpKind[];
}
export interface MotionClip {
    startMs: number;
    endMs: number;
    readonly jumps: MotionJump[];
    readonly frames: MotionFrameRecord[];
    readonly steps: MotionStepRecord[];
}
export const caughtNotice = (clips: number): string => `Motion log: jump caught (${clips})`;
export const NO_JUMPS_NOTICE = "Motion log: no jumps caught";
export const motionSavedNotice = (name: string): string => `Saved ${name}`;
export interface MotionStepRecord {
    readonly iteration: number | null;
    readonly startMs: number;
    readonly endMs: number;
    readonly durationMs: number;
    readonly controllerByte: number | null;
    readonly mouseTurnAfterCap: number | null;
    readonly beganInFrameTimeMs: number;
    readonly worldStepMs: number | null;
    readonly originalPictureMs: number | null;
    readonly hdSnapshotMs: number | null;
    readonly restMs: number | null;
    readonly pageThreadMs: number | null;
}
export interface MotionCoopFields {
    stepsLive: number;
    stepsRerun: number;
    saveMs: number;
    restoreMs: number;
    stepsMs: number;
    snapshotsRecorded: number | null;
    kept: number | null;
    easeActive: boolean | null;
    turnsSent: {
        turn: number;
        at: number | null;
    }[];
}
export interface MotionFrameRecord {
    readonly frameTimeMs: number;
    sincePreviousFrameMs: number | null;
    loopFrameMs: number | null;
    loopKind: "paced" | "free" | null;
    ticksRun: number;
    pictureTickMs: number | null;
    drawHdMs: number | null;
    rendererDrawn: "custom" | "original";
    pathDrawn: "gl" | "cpu" | "both" | null;
    smoothMotion: boolean | null;
    drawnCamX: number | null;
    drawnCamY: number | null;
    drawnCamAngle: number | null;
    drawnAngleStepSincePreviousFrame: number | null;
    blendAlpha: number | null;
    blendSnapshotIteration: number | null;
    blendPrevSnapshotIteration: number | null;
    newestSnapshotIteration: number | null;
    newestSnapshotCamAngle: number | null;
    modernTurnAdded: number | null;
    mouseTurnsView: boolean | null;
    episode: number | null;
    floor: number | null;
    cellX: number | null;
    cellY: number | null;
    mouseCountX: number;
    mouseCountY: number;
    mouseEventCount: number;
    stepsBegun: {
        iteration: number | null;
        controllerByte: number | null;
        mouseTurnAfterCap: number | null;
    }[];
    stepWorkMs: number | null;
    stepWorldMs: number | null;
    stepOriginalPictureMs: number | null;
    stepHdSnapshotMs: number | null;
    stepRestMs: number | null;
    stepPageThreadMs: number | null;
    coop: MotionCoopFields | null;
    moment?: true;
}
export interface MotionSummary {
    readonly frameCount: number;
    readonly framesSlowerThanLimit: number;
    readonly largestFrameIntervalMs: number;
    readonly angleStepsAgainstMouseDirection: number;
    readonly largestAngleStepPerFrame: number;
    readonly largestStepWorkMs: number;
    readonly largestPageThreadMs: number;
}
export interface MotionLogOptions {
    now(): number;
    settings(): Record<string, unknown>;
    renderer(): "custom" | "original";
    notice?(text: string): void;
}
const wrapTurn = (d: number): number => {
    const a = MOTION_LOG.ANGLES;
    const m = ((d % a) + a) % a;
    return m > a / 2 ? m - a : m;
};
export class MotionLog implements MotionObserver {
    private frames: MotionFrameRecord[] = [];
    private steps: MotionStepRecord[] = [];
    private mouseX = 0;
    private mouseY = 0;
    private mouseEvents = 0;
    private lastMouseDirection = 0;
    private lastMouseDirectionAtMs = -Infinity;
    private scratchByte: number | null = null;
    private scratchTurn: number | null = null;
    private scratchIteration: number | null = null;
    private previousDrawn: MotionFrameRecord | null = null;
    private clips: MotionClip[] = [];
    private lastNoticeMs = -Infinity;
    constructor(private readonly o: MotionLogOptions) { }
    private jump(r: MotionFrameRecord, kind: JumpKind): void {
        const t = r.frameTimeMs;
        const last = this.clips[this.clips.length - 1];
        const listed = last?.jumps.find((j) => j.frameTimeMs === t);
        if (listed) {
            if (!listed.kinds.includes(kind))
                listed.kinds.push(kind);
            return;
        }
        const startMs = t - MOTION_LOG.CLIP_BEFORE_MS;
        const endMs = t + MOTION_LOG.CLIP_AFTER_MS;
        if (last && startMs <= last.endMs) {
            last.endMs = Math.max(last.endMs, endMs);
            const lastFrame = last.frames[last.frames.length - 1]?.frameTimeMs ?? -Infinity;
            for (const f of this.frames)
                if (f.frameTimeMs > lastFrame)
                    last.frames.push(f);
            const lastStep = last.steps[last.steps.length - 1]?.startMs ?? -Infinity;
            for (const s of this.steps)
                if (s.startMs > lastStep)
                    last.steps.push(s);
            last.jumps.push({ frameTimeMs: t, kinds: [kind] });
        }
        else {
            this.clips.push({
                startMs, endMs, jumps: [{ frameTimeMs: t, kinds: [kind] }],
                frames: this.frames.filter((f) => f.frameTimeMs >= startMs), steps: this.steps.filter((s) => s.endMs >= startMs),
            });
            if (this.clips.length > MOTION_LOG.MAX_CLIPS)
                this.clips.shift();
        }
        if (this.o.notice && t - this.lastNoticeMs >= MOTION_LOG.NOTICE_EVERY_MS) {
            this.lastNoticeMs = t;
            this.o.notice(caughtNotice(this.clips.length));
        }
    }
    private intoOpenClip(f: MotionFrameRecord | null, s: MotionStepRecord | null): void {
        const last = this.clips[this.clips.length - 1];
        if (!last)
            return;
        if (f && f.frameTimeMs <= last.endMs)
            last.frames.push(f);
        if (s && s.startMs <= last.endMs)
            last.steps.push(s);
    }
    private againstMouse(r: MotionFrameRecord): boolean {
        const a = r.drawnAngleStepSincePreviousFrame;
        if (a === null || a === 0)
            return false;
        if (r.mouseTurnsView !== true && !MOTION_LOG_TEST.rule329)
            return false;
        let dir = 0;
        for (let i = this.frames.length - 1; i >= 0; i--) {
            const f = this.frames[i]!;
            if (r.frameTimeMs - f.frameTimeMs > MOTION_LOG.AGAINST_MOUSE_MS)
                break;
            if (f.mouseCountX === 0)
                continue;
            const s = Math.sign(f.mouseCountX);
            if (dir === 0)
                dir = s;
            else if (s !== dir)
                return false;
        }
        return dir !== 0 && Math.sign(a) === -dir;
    }
    get clipRecords(): readonly MotionClip[] { return this.clips; }
    noteMouse(movementX: number, movementY: number): void {
        if (Number.isFinite(movementX))
            this.mouseX += movementX;
        if (Number.isFinite(movementY))
            this.mouseY += movementY;
        this.mouseEvents++;
        if (movementX !== 0 && Number.isFinite(movementX)) {
            this.lastMouseDirection = Math.sign(movementX);
            this.lastMouseDirectionAtMs = this.o.now();
        }
    }
    noteMoment(): void {
        const f = this.recordFor(this.frames[this.frames.length - 1]?.frameTimeMs ?? this.o.now());
        f.moment = true;
    }
    noteControllerByte(v: number): void { this.scratchByte = v; }
    noteModernMouseTurn(turn: number): void { this.scratchTurn = turn; }
    private recordFor(frameTimeMs: number): MotionFrameRecord {
        for (let i = this.frames.length - 1; i >= 0 && i >= this.frames.length - 3; i--) {
            if (Math.abs(this.frames[i]!.frameTimeMs - frameTimeMs) < 1e-3)
                return this.frames[i]!;
        }
        const prev = this.frames[this.frames.length - 1] ?? null;
        const r: MotionFrameRecord = {
            frameTimeMs, sincePreviousFrameMs: prev === null ? null : frameTimeMs - prev.frameTimeMs, loopFrameMs: null, loopKind: null, ticksRun: 0,
            pictureTickMs: null, drawHdMs: null, rendererDrawn: this.o.renderer(), pathDrawn: null, smoothMotion: null,
            drawnCamX: null, drawnCamY: null, drawnCamAngle: null, drawnAngleStepSincePreviousFrame: null, blendAlpha: null,
            blendSnapshotIteration: null, blendPrevSnapshotIteration: null, newestSnapshotIteration: null, newestSnapshotCamAngle: null,
            modernTurnAdded: null, mouseTurnsView: null, episode: null, floor: null, cellX: null, cellY: null, mouseCountX: this.mouseX, mouseCountY: this.mouseY, mouseEventCount: this.mouseEvents, stepsBegun: [],
            stepWorkMs: null, stepWorldMs: null, stepOriginalPictureMs: null, stepHdSnapshotMs: null, stepRestMs: null, stepPageThreadMs: null, coop: null,
        };
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseEvents = 0;
        this.frames.push(r);
        this.trim(frameTimeMs);
        this.intoOpenClip(r, null);
        if (r.sincePreviousFrameMs !== null && r.sincePreviousFrameMs > MOTION_LOG.STALL_MS)
            this.jump(r, "stall");
        return r;
    }
    private trim(nowMs: number): void {
        const cut = nowMs - MOTION_LOG.WINDOW_MS;
        let i = 0;
        while (i < this.frames.length && this.frames[i]!.frameTimeMs < cut)
            i++;
        if (i > 0)
            this.frames = this.frames.slice(i);
        let j = 0;
        while (j < this.steps.length && this.steps[j]!.endMs < cut)
            j++;
        if (j > 0)
            this.steps = this.steps.slice(j);
    }
    loopFrame(r: MotionLoopRecord): void {
        const f = this.recordFor(r.frameTimeMs);
        f.loopFrameMs = r.loopFrameMs;
        f.loopKind = r.kind;
        f.ticksRun = r.ticksRun;
    }
    tick(r: MotionTickRecord): void {
        const f = this.recordFor(r.frameTimeMs);
        if (r.pictureBuilt)
            f.pictureTickMs = r.endMs - r.startMs;
        if (r.worldStep) {
            const step: MotionStepRecord = {
                iteration: this.scratchIteration, startMs: r.startMs, endMs: r.endMs, durationMs: r.endMs - r.startMs,
                controllerByte: this.scratchByte, mouseTurnAfterCap: this.scratchTurn, beganInFrameTimeMs: r.frameTimeMs,
                worldStepMs: r.parts?.worldMs ?? null, originalPictureMs: r.parts?.pictureMs ?? null, hdSnapshotMs: r.parts?.snapshotMs ?? null, restMs: r.parts?.restMs ?? null,
                pageThreadMs: r.pageThreadMs ?? null,
            };
            const add = (a: number | null, b: number | undefined): number | null => (b === undefined ? a : (a ?? 0) + b);
            f.stepWorkMs = add(f.stepWorkMs, r.endMs - r.startMs);
            f.stepWorldMs = add(f.stepWorldMs, r.parts?.worldMs);
            f.stepOriginalPictureMs = add(f.stepOriginalPictureMs, r.parts?.pictureMs);
            f.stepHdSnapshotMs = add(f.stepHdSnapshotMs, r.parts?.snapshotMs);
            f.stepRestMs = add(f.stepRestMs, r.parts?.restMs);
            f.stepPageThreadMs = add(f.stepPageThreadMs, r.pageThreadMs ?? r.endMs - r.startMs);
            this.steps.push(step);
            this.intoOpenClip(null, step);
            f.stepsBegun.push({ iteration: step.iteration, controllerByte: step.controllerByte, mouseTurnAfterCap: step.mouseTurnAfterCap });
        }
        this.scratchByte = null;
        this.scratchTurn = null;
        this.scratchIteration = null;
    }
    snapshot(r: MotionSnapshotRecord): void { this.scratchIteration = r.iteration; }
    coopFrame(r: MotionCoopRecord): void {
        const last = this.frames[this.frames.length - 1];
        const f = last !== undefined && last.coop === null && last.drawHdMs !== null && Math.abs(r.frameTimeMs - last.frameTimeMs) < COOP_MERGE_MS ? last : this.recordFor(r.frameTimeMs);
        this.coopMergeOpen = f;
        if (r.episode !== undefined) {
            f.episode = r.episode;
            f.floor = r.floor ?? null;
            f.cellX = r.cellX ?? null;
            f.cellY = r.cellY ?? null;
        }
        const c = this.coopOf(f);
        c.stepsLive += r.stepsLive;
        c.stepsRerun += r.stepsRerun;
        c.saveMs += r.saveMs;
        c.restoreMs += r.restoreMs;
        c.stepsMs += r.stepsMs;
        c.turnsSent = r.turnsSent.map((t) => ({ turn: t.turn, at: t.at }));
    }
    private coopMergeOpen: MotionFrameRecord | null = null;
    private coopOf(f: MotionFrameRecord): MotionCoopFields {
        return (f.coop ??= { stepsLive: 0, stepsRerun: 0, saveMs: 0, restoreMs: 0, stepsMs: 0, snapshotsRecorded: null, kept: null, easeActive: null, turnsSent: [] });
    }
    hdFrame(r: MotionHdRecord): void {
        const open = this.coopMergeOpen;
        this.coopMergeOpen = null;
        const f = open !== null && open.drawHdMs === null && open === this.frames[this.frames.length - 1] && Math.abs(r.frameTimeMs - open.frameTimeMs) < COOP_MERGE_MS ? open : this.recordFor(r.frameTimeMs);
        f.drawHdMs = r.drawHdMs;
        f.rendererDrawn = "custom";
        f.pathDrawn = r.pathDrawn;
        f.smoothMotion = r.smoothMotion;
        f.drawnCamX = r.drawnCamX;
        f.drawnCamY = r.drawnCamY;
        f.drawnCamAngle = r.drawnCamAngle;
        f.blendAlpha = r.blendAlpha;
        f.blendSnapshotIteration = r.blendSnapshotIteration;
        f.blendPrevSnapshotIteration = r.blendPrevSnapshotIteration;
        f.newestSnapshotIteration = r.newestSnapshotIteration;
        f.newestSnapshotCamAngle = r.newestSnapshotCamAngle;
        f.modernTurnAdded = r.modernTurnAdded;
        if (r.coop !== undefined) {
            const c = this.coopOf(f);
            c.snapshotsRecorded = r.coop.snapshotsRecorded;
            c.kept = r.coop.kept;
            c.easeActive = r.coop.easeActive;
        }
        f.mouseTurnsView = r.mouseTurnsView ?? r.modernTurnAdded !== null;
        if (f.coop === null || f.episode === null) {
            f.episode = r.episode ?? null;
            f.floor = r.floor ?? null;
            f.cellX = r.cellX ?? null;
            f.cellY = r.cellY ?? null;
        }
        f.drawnAngleStepSincePreviousFrame = this.previousDrawn?.drawnCamAngle != null ? wrapTurn(r.drawnCamAngle - this.previousDrawn.drawnCamAngle) : null;
        this.previousDrawn = f;
        if (this.againstMouse(f))
            this.jump(f, "against");
        const i = this.frames.lastIndexOf(f);
        const p = i > 0 ? this.frames[i - 1]! : null;
        if (p && p.drawnCamX !== null && p.drawnCamY !== null && Math.hypot(r.drawnCamX - p.drawnCamX, r.drawnCamY - p.drawnCamY) > MOTION_LOG.LEAP_UNITS)
            this.jump(f, "leap");
    }
    get frameRecords(): readonly MotionFrameRecord[] { return this.frames; }
    get stepRecords(): readonly MotionStepRecord[] { return this.steps; }
    summary(fromMs: number): MotionSummary {
        let frameCount = 0, slow = 0, largestInterval = 0, against = 0, largestStep = 0, largestWork = 0, largestPage = 0;
        let dir = 0;
        let dirAt = -Infinity;
        for (const f of this.frames) {
            if (f.mouseCountX !== 0) {
                dir = Math.sign(f.mouseCountX);
                dirAt = f.frameTimeMs;
            }
            if (f.frameTimeMs < fromMs)
                continue;
            frameCount++;
            const iv = f.sincePreviousFrameMs;
            if (iv !== null) {
                if (iv > MOTION_LOG.SLOW_FRAME_MS)
                    slow++;
                if (iv > largestInterval)
                    largestInterval = iv;
            }
            if (f.stepWorkMs !== null && f.stepWorkMs > largestWork)
                largestWork = f.stepWorkMs;
            if (f.stepPageThreadMs !== null && f.stepPageThreadMs > largestPage)
                largestPage = f.stepPageThreadMs;
            const a = f.drawnAngleStepSincePreviousFrame;
            if (a !== null) {
                if (Math.abs(a) > largestStep)
                    largestStep = Math.abs(a);
                if (a !== 0 && dir !== 0 && f.frameTimeMs - dirAt <= MOTION_LOG.MOUSE_DIRECTION_HOLD_MS && Math.sign(a) !== dir)
                    against++;
            }
        }
        return { frameCount, framesSlowerThanLimit: slow, largestFrameIntervalMs: largestInterval, angleStepsAgainstMouseDirection: against, largestAngleStepPerFrame: largestStep, largestStepWorkMs: largestWork, largestPageThreadMs: largestPage };
    }
    summaryLine(nowMs: number): string {
        const s = this.summary(nowMs - MOTION_LOG.SUMMARY_EVERY_MS);
        return `[motionlog] last ${MOTION_LOG.SUMMARY_EVERY_MS / 1000} s: frames=${s.frameCount}, framesSlowerThan${MOTION_LOG.SLOW_FRAME_MS}Ms=${s.framesSlowerThanLimit}, ` +
            `largestFrameIntervalMs=${s.largestFrameIntervalMs.toFixed(1)}, angleStepsAgainstMouseDirection=${s.angleStepsAgainstMouseDirection}, ` +
            `largestAngleStepPerFrame=${s.largestAngleStepPerFrame.toFixed(2)}, largestStepWorkMs=${s.largestStepWorkMs.toFixed(1)}, largestPageThreadMs=${s.largestPageThreadMs.toFixed(1)}`;
    }
    toJson(): string {
        const savedAtPageTimeMs = this.o.now();
        return JSON.stringify({
            format: MOTION_LOG.FORMAT,
            savedAtPageTimeMs,
            windowMs: MOTION_LOG.WINDOW_MS,
            detector: {
                stallMs: MOTION_LOG.STALL_MS, againstMouseMs: MOTION_LOG.AGAINST_MOUSE_MS, leapUnits: MOTION_LOG.LEAP_UNITS,
                clipBeforeMs: MOTION_LOG.CLIP_BEFORE_MS, clipAfterMs: MOTION_LOG.CLIP_AFTER_MS, maxClips: MOTION_LOG.MAX_CLIPS,
            },
            notes: {
                stall: `a frame whose time since the previous frame is more than ${MOTION_LOG.STALL_MS} ms`,
                against: `a frame whose drawn angle step is not 0 and has the opposite sign of every non-zero mouse x count of the ${MOTION_LOG.AGAINST_MOUSE_MS} ms before it (all of them one sign)`,
                leap: `a frame whose drawn camera position moved more than ${MOTION_LOG.LEAP_UNITS} units since the previous frame`,
                timesAreMsSincePageStart: true,
                angleUnitsPerTurn: MOTION_LOG.ANGLES,
                drawnAngleStepSincePreviousFrame: "short way round, positive = the direction a positive mouse count turns",
                pictureTickMs: "the picture-building tick: the Original's picture plus the world's step when the frame ran one",
                stepParts: "a step's work split into the world's step, the Original's picture, the snapshot for HD and the rest (ms); pageThreadMs: the part the page's thread spent",
                angleStepsAgainstMouseDirection: `a frame whose angle step has the sign opposite to the last mouse count within ${MOTION_LOG.MOUSE_DIRECTION_HOLD_MS} ms`,
            },
            settings: this.o.settings(),
            clips: this.clips.map((c) => ({ startMs: c.startMs, endMs: c.endMs, complete: savedAtPageTimeMs >= c.endMs, jumps: c.jumps, frames: c.frames, steps: c.steps })),
        });
    }
}
export function motionClipsFile(log: MotionLog, now: number): {
    name: string;
    text: string;
} | null {
    if (log.clipRecords.length === 0)
        return null;
    return { name: `zt-motionlog-${Math.round(now)}.json`, text: log.toJson() };
}
export interface MotionLogDeps extends MotionLogOptions {
    search: string;
    window: {
        addEventListener(t: string, f: (e: never) => void): void;
        removeEventListener(t: string, f: (e: never) => void): void;
    };
    setInterval(f: () => void, ms: number): unknown;
    clearInterval(h: unknown): void;
    log(line: string): void;
    download(fileName: string, text: string): void;
    mouseLocked(): boolean;
    host: {
        __ztMotion?: MotionObserver;
    };
}
export const motionLogRequested = (search: string): boolean => new URLSearchParams(search).has(MOTION_LOG.QUERY);
export interface InstalledMotionLog {
    readonly log: MotionLog;
    save(): string;
    uninstall(): void;
}
export function motionLogKey(inst: InstalledMotionLog | null, saveKey: string, e: {
    code: string;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey?: boolean;
    repeat?: boolean;
    preventDefault(): void;
}, notice: (text: string) => void): boolean {
    if (inst === null || e.code !== saveKey || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey === true)
        return false;
    e.preventDefault();
    if (e.repeat !== true)
        notice(inst.save());
    return true;
}
export function installMotionLog(d: MotionLogDeps): InstalledMotionLog | null {
    if (!motionLogRequested(d.search))
        return null;
    const log = new MotionLog(d);
    d.host.__ztMotion = log;
    const onMove = (e: {
        movementX?: number;
        movementY?: number;
    }): void => { if (d.mouseLocked())
        log.noteMouse(e.movementX ?? 0, e.movementY ?? 0); };
    d.window.addEventListener("mousemove", onMove as never);
    const timer = d.setInterval(() => d.log(log.summaryLine(d.now())), MOTION_LOG.SUMMARY_EVERY_MS);
    return {
        log,
        save(): string {
            const f = motionClipsFile(log, d.now());
            if (f === null)
                return NO_JUMPS_NOTICE;
            d.download(f.name, f.text);
            return motionSavedNotice(f.name);
        },
        uninstall(): void {
            d.window.removeEventListener("mousemove", onMove as never);
            d.clearInterval(timer);
            if (d.host.__ztMotion === log)
                delete d.host.__ztMotion;
        },
    };
}
export function installMotionLogInBrowser(o: {
    settings(): Record<string, unknown>;
    renderer(): "custom" | "original";
    mouseLocked(): boolean;
    notice(text: string): void;
}): InstalledMotionLog | null {
    return installMotionLog({
        search: location.search, now: () => performance.now(), settings: o.settings, renderer: o.renderer, mouseLocked: o.mouseLocked, notice: o.notice,
        window: window as unknown as MotionLogDeps["window"], setInterval: (f, ms) => setInterval(f, ms), clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
        log: (line) => console.log(line),
        download: (name, text) => {
            const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 0);
        },
        host: globalThis as {
            __ztMotion?: MotionObserver;
        },
    });
}

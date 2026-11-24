/// <reference lib="dom" />
import { ASSETS_VERSION, EXPECTED_MD5 } from "../ztassets/core.js";
import type { OutputFile } from "../ztassets/core.js";
import { APP_DATA_URL, appConstantsFrom } from "./constants.js";
import type { AppConstants } from "./constants.js";
import { ExtractionCancelled, checkRom, extractAndStore, firstStart, otherVersionStored } from "./flow.js";
import { runStorageAction } from "./storage_actions.js";
import type { StorageAction } from "./storage_actions.js";
import { stateStorage } from "./states.js";
import type { Extraction, Progress } from "./flow.js";
import { AudioRelayHost } from "./audio_relay.js";
import { progressText, progressValue } from "./runner.js";
import type { AssetStore } from "./store.js";
import { IdbAssetStore } from "./store_idb.js";
import { MemoryAssetStore } from "./store_memory.js";
import { GameViewGuard, guardedActions } from "./leaving.js";
import { PICK_OWN_NOTE, takeBundledRom } from "./bundled_rom.js";
import { fetchDataPack } from "./bundles_page.js";
import { DATA_PACK_FILE } from "./site_names.js";
import { closePagePack, openPagePack } from "./page_pack.js";
import { mountSlideshow } from "./slides.js";
const WORKER_FILE = "dist/impl/release/worker.js";
const AUDIO_WORKER_FILE = "dist/impl/release/audio_worker.js";
const APP_MODULE = "./app.js";
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const pageBase = (): string => new URL(".", document.baseURI).href;
const workerRun: Extraction = (bytes, onProgress, signal) => new Promise<OutputFile[]>((resolve, reject) => {
    const worker = new Worker(new URL(WORKER_FILE, pageBase()), { type: "module" });
    const audio = new AudioRelayHost(() => new Worker(new URL(AUDIO_WORKER_FILE, pageBase()), { type: "module" }) as never, (m, t) => worker.postMessage(m, t));
    const stop = (): void => { audio.terminateAll(); worker.terminate(); reject(new ExtractionCancelled()); };
    if (signal)
        signal.addEventListener("abort", stop, { once: true });
    worker.onmessage = (e: MessageEvent) => {
        if (audio.handle(e.data as {
            type?: string;
        }))
            return;
        const m = e.data as {
            type: string;
            message?: string;
            files?: {
                path: string;
                producer: string;
                args: Record<string, unknown>;
                bytes: ArrayBuffer;
            }[];
        } & Progress;
        if (m.type === "progress")
            onProgress({ command: m.command, index: m.index, total: m.total, sub: m.sub, subTotal: m.subTotal, detail: m.detail });
        else if (m.type === "done") {
            audio.terminateAll();
            worker.terminate();
            resolve(m.files!.map((f) => ({ path: f.path, producer: f.producer, args: f.args, bytes: new Uint8Array(f.bytes) })));
        }
        else if (m.type === "error") {
            audio.terminateAll();
            worker.terminate();
            reject(new Error(m.message));
        }
        else if (m.type === "cancelled") {
            audio.terminateAll();
            worker.terminate();
            reject(new ExtractionCancelled());
        }
    };
    worker.onerror = (e) => { audio.terminateAll(); worker.terminate(); reject(new Error(e.message || "the worker failed")); };
    const copy = bytes.slice();
    worker.postMessage({ type: "run", rom: copy.buffer, base: pageBase(), audioRelay: true }, [copy.buffer]);
});
function settingsStorage(): Storage | undefined {
    try {
        const s = window.localStorage;
        const probe = "\u0000probe";
        s.setItem(probe, "1");
        s.removeItem(probe);
        return s;
    }
    catch {
        return undefined;
    }
}
interface AppModule {
    mountRelease(container: HTMLElement, deps: {
        consts: AppConstants;
        store: AssetStore;
        md5: string;
        version: string;
        storage: Storage | undefined;
        onReextract(): void;
        onForget(): Promise<void>;
        onResetSettings(): Promise<void>;
        onClearAssets(): Promise<void>;
        guard: GameViewGuard;
    }): Promise<() => void>;
}
async function main(): Promise<void> {
    const consts: AppConstants = appConstantsFrom(await (await fetch(new URL(APP_DATA_URL, pageBase()))).json());
    document.title = consts.title;
    $("heading").textContent = consts.title;
    $("notice").textContent = consts.notice;
    $("version").textContent = `version ${consts.appVersion}`;
    let store: AssetStore;
    try {
        store = new IdbAssetStore(consts.assetsDb);
        await store.isComplete(ASSETS_VERSION);
    }
    catch {
        store = new MemoryAssetStore();
        $("memnote").hidden = false;
    }
    let abort: AbortController | undefined;
    let tablesStale = false;
    const show = async (screen: "rom" | "run" | "menu"): Promise<void> => {
        $("romscreen").hidden = screen !== "rom";
        $("runscreen").hidden = screen !== "run";
        $("menuscreen").hidden = screen !== "menu";
        const link = document.getElementById("debuglink");
        if (link)
            link.hidden = screen === "menu";
        $("version").hidden = screen !== "rom";
        if (screen === "rom")
            $("oldnote").hidden = !(tablesStale || (await otherVersionStored(store)));
        if (screen === "menu")
            await mountMenu();
    };
    const say = (msg: string): void => { $("refusal").textContent = msg; };
    const guard = new GameViewGuard();
    let unmount: (() => void) | null = null;
    const actions = guardedActions<Uint8Array>(guard, {
        reextract: () => { say(""); void offerBundled().then(async (taken) => { if (!taken) {
            await show("rom");
            $<HTMLInputElement>("file").click();
        } }); },
        forget: async () => { await storageAction("forget"); },
        rom: (bytes) => start(bytes),
        close: () => undefined,
    });
    async function storageAction(a: StorageAction): Promise<void> {
        await runStorageAction(a, { consts, settings: settingsStorage(), assets: store, states: stateStorage(consts) });
        say("");
        if (a === "reset") {
            await show("menu");
            return;
        }
        closePagePack();
        tablesStale = false;
        await show("rom");
    }
    const resetSettings = async (): Promise<void> => { guard.leave("leave"); await storageAction("reset"); };
    const clearAssets = async (): Promise<void> => { guard.leave("forget"); await storageAction("clear"); };
    addEventListener("pagehide", () => actions.close());
    $("expected").textContent = `${consts.romSize} bytes, md5 ${EXPECTED_MD5}`;
    async function mountMenu(): Promise<void> {
        const md5 = await store.completeMd5(ASSETS_VERSION);
        const box = $("app");
        if (unmount !== null) {
            unmount();
            unmount = null;
        }
        box.textContent = "";
        if (md5 === undefined) {
            await show("rom");
            return;
        }
        closePagePack();
        try {
            const opened = await openPagePack(() => fetchDataPack(new URL(DATA_PACK_FILE, document.baseURI)), store, md5, ASSETS_VERSION);
            if (!opened.ok) {
                tablesStale = true;
                await show("rom");
                return;
            }
            tablesStale = false;
        }
        catch (err) {
            box.textContent = `The data pack failed to load: ${err instanceof Error ? err.message : String(err)}`;
            return;
        }
        let app: AppModule;
        try {
            app = (await import(APP_MODULE)) as AppModule;
        }
        catch (err) {
            box.textContent = `The menu failed to load: ${err instanceof Error ? err.message : String(err)}`;
            return;
        }
        unmount = await app.mountRelease(box, {
            consts, store, md5, version: ASSETS_VERSION, storage: settingsStorage(),
            onReextract: actions.reextract,
            onForget: actions.forget,
            onResetSettings: resetSettings,
            onClearAssets: clearAssets,
            guard,
        });
    }
    function progressPainter(): {
        report: (p: Progress) => void;
        stop: () => void;
    } {
        $("cmdname").textContent = "starting";
        $("cmdindex").textContent = "";
        $<HTMLProgressElement>("bar").value = 0;
        let last: Progress | undefined, lastAt = Date.now();
        const paint = (): void => {
            if (!last)
                return;
            const p = last, secs = Math.floor((Date.now() - lastAt) / 1000);
            $("cmdname").textContent = p.command;
            $("cmdindex").textContent = progressText(p) + (secs >= 1 ? ` (${secs} s)` : "");
            $<HTMLProgressElement>("bar").max = p.total;
            const creep = p.sub === undefined ? 0.9 * (1 - 1 / (1 + (Date.now() - lastAt) / 5000)) : 0;
            $<HTMLProgressElement>("bar").value = progressValue(p) + creep;
        };
        const timer = setInterval(paint, 500);
        const slides = mountSlideshow($("slides"), consts.slides);
        return { report: (p) => { last = p; lastAt = Date.now(); paint(); }, stop: () => { clearInterval(timer); slides.stop(); } };
    }
    let bundledDeclined = false;
    async function offerBundled(): Promise<boolean> {
        if (bundledDeclined)
            return false;
        say("");
        $("picknote").hidden = true;
        abort = new AbortController();
        const note = $("runnote");
        note.textContent = consts.rom.bundledNote;
        note.hidden = false;
        await show("run");
        const painter = progressPainter();
        $("cmdname").textContent = "the bundled ROM";
        const out = await takeBundledRom({
            url: new URL(consts.rom.bundled, pageBase()).href, fetch: (u, i) => fetch(u, i), store, extraction: workerRun,
            verify: (b) => checkRom(b, consts.romSize), onProgress: painter.report, signal: abort.signal,
        }).finally(() => { painter.stop(); note.hidden = true; });
        if (out.kind === "none") {
            await show("rom");
            return false;
        }
        if (out.kind === "stored") {
            await show("menu");
            return true;
        }
        if (out.kind === "cancelled") {
            bundledDeclined = true;
            $("picknote").textContent = PICK_OWN_NOTE;
            $("picknote").hidden = false;
            say("Cancelled; nothing was stored.");
        }
        else
            say(out.kind === "refused" ? `Refused: ${out.reason}` : `Extraction failed: ${out.message}`);
        await show("rom");
        return true;
    }
    async function start(bytes: Uint8Array): Promise<void> {
        say("");
        $("picknote").hidden = true;
        const check = checkRom(bytes, consts.romSize);
        if (!check.ok) {
            say(`Refused: ${check.reason}`);
            await show("rom");
            return;
        }
        abort = new AbortController();
        await show("run");
        try {
            const painter = progressPainter();
            try {
                await extractAndStore(bytes, store, workerRun, painter.report, abort.signal, (b) => checkRom(b, consts.romSize));
            }
            finally {
                painter.stop();
            }
            await show("menu");
        }
        catch (err) {
            say(err instanceof ExtractionCancelled ? "Cancelled; nothing was stored." : `Extraction failed: ${err instanceof Error ? err.message : String(err)}`);
            await show("rom");
        }
    }
    async function pick(file: File | undefined): Promise<Uint8Array | undefined> {
        if (!file)
            return undefined;
        return new Uint8Array(await file.arrayBuffer());
    }
    $<HTMLInputElement>("file").addEventListener("change", async (e) => {
        const input = e.target as HTMLInputElement;
        const bytes = await pick(input.files?.[0]);
        input.value = "";
        if (bytes)
            await actions.rom(bytes);
    });
    const drop = $("drop");
    drop.addEventListener("dragover", (e) => { e.preventDefault(); });
    drop.addEventListener("drop", async (e) => {
        e.preventDefault();
        const bytes = await pick(e.dataTransfer?.files[0]);
        if (bytes)
            await actions.rom(bytes);
    });
    $("cancel").addEventListener("click", () => abort?.abort());
    if ((await firstStart(store)) === "menu")
        await show("menu");
    else if (!(await offerBundled()))
        await show("rom");
}
main().catch((err) => { document.body.textContent = `The page failed to start: ${err instanceof Error ? err.message : String(err)}`; });

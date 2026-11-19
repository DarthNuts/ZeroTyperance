import { ASSETS_VERSION, EXPECTED_MD5, MANIFEST_NAME, manifestOf, md5Hex } from "../ztassets/core.js";
import type { OutputFile } from "../ztassets/core.js";
import type { AssetStore } from "./store.js";
import type { Progress } from "./runner.js";
export type { Progress } from "./runner.js";
export type RomCheck = {
    ok: true;
    md5: string;
} | {
    ok: false;
    reason: string;
};
export type RomVerifier = (bytes: Uint8Array) => RomCheck;
export async function otherVersionStored(store: AssetStore, version: string = ASSETS_VERSION): Promise<boolean> {
    try {
        return await store.hasOtherVersion(version);
    }
    catch {
        return false;
    }
}
export async function firstStart(store: AssetStore, version: string = ASSETS_VERSION): Promise<"rom" | "menu"> {
    try {
        return (await store.isComplete(version)) ? "menu" : "rom";
    }
    catch {
        return "rom";
    }
}
export function checkRom(bytes: Uint8Array, romSize: number, acceptedMd5: string = EXPECTED_MD5): RomCheck {
    if (bytes.length !== romSize)
        return { ok: false, reason: `wrong size: the file is ${bytes.length} bytes, the image has ${romSize} bytes` };
    const md5 = md5Hex(bytes);
    if (md5 !== acceptedMd5)
        return { ok: false, reason: `wrong md5: the file's md5 is ${md5}, the accepted image's is ${acceptedMd5}` };
    return { ok: true, md5 };
}
export type Extraction = (bytes: Uint8Array, onProgress: (p: Progress) => void, signal?: AbortSignal) => Promise<OutputFile[]>;
export class ExtractionRefused extends Error {
}
export class ExtractionCancelled extends Error {
    constructor() { super("extraction cancelled"); }
}
export async function extractAndStore(bytes: Uint8Array, store: AssetStore, run: Extraction, onProgress: (p: Progress) => void, signal: AbortSignal | undefined, verify: RomVerifier, version: string = ASSETS_VERSION): Promise<string> {
    const check = verify(bytes);
    if (!check.ok)
        throw new ExtractionRefused(check.reason);
    if (signal?.aborted)
        throw new ExtractionCancelled();
    const outputs = await run(bytes, onProgress, signal);
    if (signal?.aborted)
        throw new ExtractionCancelled();
    const manifest = manifestOf(outputs, check.md5);
    const files = [...outputs.map((f) => ({ path: f.path, bytes: f.bytes })), { path: MANIFEST_NAME, bytes: manifest.bytes }];
    await store.put(check.md5, version, files);
    if (signal?.aborted)
        throw new ExtractionCancelled();
    await store.markComplete(check.md5, version);
    await store.dropOtherVersions(version);
    return check.md5;
}
export async function forget(store: AssetStore): Promise<void> {
    await store.forget();
}

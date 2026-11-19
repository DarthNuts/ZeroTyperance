import type { Command, OutputFile, RomFile } from "../ztassets/core.js";
import { Context } from "../ztassets/core.js";
import type { RenderAll } from "../ztassets/cmd/audio.js";
export interface Progress {
    readonly command: string;
    readonly index: number;
    readonly total: number;
    readonly sub?: number;
    readonly subTotal?: number;
    readonly detail?: string;
}
export function progressText(p: Progress): string {
    return `${p.index} / ${p.total}` + (p.detail ? ` — ${p.detail}` : p.sub !== undefined && p.subTotal ? ` — ${p.sub} of ${p.subTotal}` : "");
}
export function progressValue(p: Progress): number {
    return p.index - 1 + (p.sub !== undefined && p.subTotal ? Math.min(1, p.sub / p.subTotal) : 0);
}
export class Cancelled extends Error {
    constructor() { super("cancelled"); }
}
export interface CancelFlag {
    readonly aborted: boolean;
}
export const RENDERER_FILE = "render_audio-wasm32.wasm";
export type FileLoader = (name: string) => Promise<Uint8Array>;
export function commandOptions(load: FileLoader, renderAll?: RenderAll): Record<string, Record<string, unknown>> {
    return { audio: { loadWasm: () => load(RENDERER_FILE), ...(renderAll ? { renderAll } : {}) } };
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
export async function runCommands(rom: RomFile, commands: readonly Command[], onProgress: (p: Progress) => void, cancel?: CancelFlag, options: Readonly<Record<string, Record<string, unknown>>> = {}): Promise<OutputFile[]> {
    const all = new Map<string, OutputFile>();
    for (let i = 0; i < commands.length; i++) {
        await tick();
        if (cancel?.aborted)
            throw new Cancelled();
        const cmd = commands[i]!;
        onProgress({ command: cmd.name, index: i + 1, total: commands.length });
        await tick();
        if (cancel?.aborted)
            throw new Cancelled();
        const ctx = new Context(rom, cmd.name);
        ctx.progress = (done, subTotal, detail) => {
            if (cancel?.aborted)
                throw new Cancelled();
            onProgress({ command: cmd.name, index: i + 1, total: commands.length, sub: done, subTotal, ...(detail !== undefined ? { detail } : {}) });
        };
        for (const [p, f] of all)
            ctx.files.set(p, f);
        const before = new Set(all.keys());
        await cmd.run(ctx, options[cmd.name] ?? {});
        for (const [p, f] of ctx.files)
            if (!before.has(p))
                all.set(p, f);
    }
    if (cancel?.aborted)
        throw new Cancelled();
    return [...all.values()];
}

import type { Command } from "../core.js";
export const info: Command = {
    name: "info",
    run(ctx) {
        const rom = ctx.rom;
        const hdr = rom.header();
        const computed = rom.checksumComputed();
        ctx.writeJson("info.json", {
            md5: rom.md5,
            size: rom.size,
            header: hdr,
            checksum: { stored: hdr["checksum"], computed, ok: hdr["checksum"] === computed },
        });
    },
};

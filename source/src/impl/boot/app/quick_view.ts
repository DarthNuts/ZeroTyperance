import type { TitleFlowChain } from "../../briefing/chain.js";
import type { PasswordCore } from "../../password/core.js";
import type { TitleCore } from "../../title/loop.js";
import type { QuickGrid, QuickView } from "./host.js";
export interface QuickParts {
    readonly chain: TitleFlowChain | null;
    readonly title: TitleCore | null;
    readonly password: PasswordCore | null;
    readonly grid: QuickGrid | null;
    readonly blank: number;
}
export function quickViewOf(p: QuickParts): QuickView {
    const { chain, title } = p;
    if (!title || !chain?.options)
        return { screen: "other" };
    const o = chain.options;
    if (chain.phase === "title") {
        const c = title.cursor;
        return { screen: "title", cursor: c === title.C.CURSOR_START ? "start" : c === title.C.CURSOR_OPTIONS ? "options" : "none", ended: title.finished };
    }
    if (chain.phase !== "options")
        return { screen: "other" };
    if (o.showingPassword && p.password && p.grid) {
        const w = p.password;
        return { screen: "password", row: w.cursorCell.row, col: w.cursorCell.col, buffer: w.buffer, blank: String.fromCharCode(p.blank), error: w.inError, ended: w.exit !== null, grid: p.grid };
    }
    return { screen: "options", atPassword: o.item === o.C.ITEM_PASSWORD, atExit: o.item === o.C.ITEM_EXIT, ended: o.finished, accepted: o.passwordResult ? o.passwordResult.accepted : null };
}

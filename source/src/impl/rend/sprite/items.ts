import { asr, s16 } from "../arith.js";
import type { SpriteConstants } from "./constants.js";
import { drawFrame } from "./frame.js";
import { itemRow } from "./project.js";
import { beamShadingOf, rasterize, shadingOf } from "./raster.js";
import type { ItemGeometry, ItemRecord, PassInputs, SpriteRect } from "./types.js";
type Token = {
    readonly k: "num";
    readonly v: number;
} | {
    readonly k: "name";
    readonly v: string;
} | {
    readonly k: "op";
    readonly v: string;
};
function tokenize(src: string): Token[] {
    const out: Token[] = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === " " || c === "\t") {
            i++;
        }
        else if (c >= "0" && c <= "9") {
            let j = i;
            while (j < src.length && src[j] >= "0" && src[j] <= "9")
                j++;
            out.push({ k: "num", v: Number(src.slice(i, j)) });
            i = j;
        }
        else if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_") {
            let j = i;
            while (j < src.length && /[A-Za-z0-9_]/.test(src[j]))
                j++;
            out.push({ k: "name", v: src.slice(i, j) });
            i = j;
        }
        else if (c === ">" && src[i + 1] === ">") {
            out.push({ k: "op", v: ">>" });
            i += 2;
        }
        else if (c === "+" || c === "-" || c === "*" || c === "(" || c === ")") {
            out.push({ k: "op", v: c });
            i++;
        }
        else {
            throw new Error(`geometry "${src}": unexpected character "${c}"`);
        }
    }
    return out;
}
export function evalGeometryExpr(src: string, names: Readonly<Record<string, number>>): number {
    const toks = tokenize(src);
    let pos = 0;
    const peekOp = (v: string): boolean => {
        const t = toks[pos];
        return t !== undefined && t.k === "op" && t.v === v;
    };
    const shift = (): number => {
        let a = add();
        while (peekOp(">>")) {
            pos++;
            a = asr(a, add() & 31);
        }
        return a;
    };
    const add = (): number => {
        let a = mul();
        for (;;) {
            if (peekOp("+")) {
                pos++;
                a = (a + mul()) | 0;
            }
            else if (peekOp("-")) {
                pos++;
                a = (a - mul()) | 0;
            }
            else
                return a;
        }
    };
    const mul = (): number => {
        let a = unary();
        while (peekOp("*")) {
            pos++;
            a = Math.imul(a, unary());
        }
        return a;
    };
    const unary = (): number => {
        if (peekOp("-")) {
            pos++;
            return -unary() | 0;
        }
        return primary();
    };
    const primary = (): number => {
        const t = toks[pos++];
        if (t === undefined)
            throw new Error(`geometry "${src}": unexpected end`);
        if (t.k === "num")
            return t.v | 0;
        if (t.k === "name") {
            const v = names[t.v];
            if (v === undefined)
                throw new Error(`geometry "${src}": name "${t.v}" is not defined here`);
            return v;
        }
        if (t.v === "(") {
            const a = shift();
            if (!peekOp(")"))
                throw new Error(`geometry "${src}": missing ")"`);
            pos++;
            return a;
        }
        throw new Error(`geometry "${src}": unexpected "${t.v}"`);
    };
    const r = shift();
    if (pos !== toks.length)
        throw new Error(`geometry "${src}": trailing input`);
    return s16(r);
}
export function evalGeometry(g: ItemGeometry, S: number, sx: number, sy: number, SC: SpriteConstants, eye: number = SC.ASSUMED_EYE): SpriteRect {
    const names: Record<string, number> = { S, sx, sy, eye, z: SC.ASSUMED_HEIGHT };
    const order = g.order.length > 0 ? g.order : ["height", "width"];
    for (const which of order) {
        if (which !== "height" && which !== "width")
            throw new Error(`geometry order: unknown member "${which}"`);
        names[which] = evalGeometryExpr(g[which], names);
    }
    for (const which of ["height", "width"] as const) {
        if (names[which] === undefined)
            names[which] = evalGeometryExpr(g[which], names);
    }
    const top = evalGeometryExpr(g.top, names);
    names.top = top;
    const left = evalGeometryExpr(g.left, names);
    return { h: names.height, w: names.width, left, top };
}
export function drawItemRecord(rec: ItemRecord, inputs: PassInputs): void {
    const { ctx, surface, mode, note } = inputs;
    const { SC, assets } = ctx;
    const cls = rec.cls;
    if (SC.NOT_SPECIFIED_CLASSES.includes(cls)) {
        note(`item class ${cls} at cell (${rec.cell[0]}, ${rec.cell[1]}) is not specified by the draft; nothing drawn`);
        return;
    }
    const sx = rec.column;
    const sy = itemRow(rec.S, inputs.eye, SC);
    const comp = assets.composite(cls);
    if (comp !== null) {
        let stateNo = comp.state;
        let frameNo = comp.frame;
        const hyd = ctx.hyd;
        if (hyd !== undefined && cls === hyd.CORPSE_CLASS) {
            stateNo = hyd.CORPSE_ART_STATE;
            let R = 0;
            if (ctx.draw === undefined)
                note(`composite class ${cls}: the crab corpse cell needs the generator (ZT-ENT-HYD 4.15); R = 0 used`);
            else
                R = ctx.draw();
            frameNo = (R & hyd.CORPSE_CELL_FRAME_MASK) !== 0 ? 1 : 0;
        }
        const bank = assets.bank(comp.bank);
        const state = bank?.states[stateNo];
        const view = state?.views[SC.COMPOSITE_VIEW];
        const frame = view?.frames[frameNo];
        if (bank === null || state === undefined || view === undefined || frame === undefined) {
            note(`composite class ${cls}: bank ${comp.bank} state ${stateNo} view ${SC.COMPOSITE_VIEW} frame ${frameNo} is missing; nothing drawn`);
            return;
        }
        const sh = shadingOf(rec.S, mode, assets, SC, note, inputs.nightVision === true);
        if (sh.table === null)
            return;
        drawFrame(surface, bank, frame, rec.S, sx, sy, sh.table, sh.mirrored, SC, note, beamShadingOf(surface, assets, SC, note));
        return;
    }
    const entry = assets.item(cls);
    if (entry === null) {
        if (!assets.drawsNothing(cls))
            note(`item class ${cls} at cell (${rec.cell[0]}, ${rec.cell[1]}) is unknown to the extractor; nothing drawn`);
        return;
    }
    const flips = SC.FLIP_CLASSES.includes(cls);
    const blinks = SC.BLINK_CLASSES.includes(cls);
    let phase = 0;
    if (flips || blinks) {
        if (ctx.phase === null)
            note(`item class ${cls}: the picture needs the animation counter (4.8); counter 0 used`);
        else
            phase = ctx.phase;
    }
    const mirrored = flips && (phase & SC.FLIP_PHASE_BIT) !== 0;
    let indices: number[];
    if (blinks)
        indices = [(phase & SC.BLINK_PHASE_BIT) !== 0 ? 1 : 0];
    else
        indices = entry.arts.map((_, i) => i);
    const sh = shadingOf(rec.S, mode, assets, SC, note, inputs.nightVision === true);
    if (sh.table === null)
        return;
    const table = mirrored ? sh.mirrored : sh.table;
    const beamSh = beamShadingOf(surface, assets, SC, note);
    const beamTable = mirrored ? beamSh.mirrored : beamSh.table;
    for (const i of indices) {
        const a = entry.arts[i] ?? entry.arts[0];
        const g = entry.geometries[i] ?? entry.geometries[0];
        if (a === undefined || g === undefined) {
            note(`item class ${cls}: art ${i} or its geometry is missing; nothing drawn`);
            continue;
        }
        const art = assets.itemArt(a.slot);
        if (art === null) {
            note(`item class ${cls}: art slot ${a.slot} is missing; nothing drawn`);
            continue;
        }
        rasterize(surface, art, mirrored, evalGeometry(g, rec.S, sx, sy, SC, inputs.eye), rec.S, table, SC, beamTable);
    }
}

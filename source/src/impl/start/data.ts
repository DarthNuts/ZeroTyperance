import type { DemoBlock, LoadoutEntry, StartData } from "./types.js";
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
function loadoutsOf(doc: unknown): LoadoutEntry[][] {
    const d = doc as {
        data?: {
            characters?: Array<{
                index?: unknown;
                loadout?: unknown;
            }>;
        };
    } | null;
    const rows = d?.data?.characters;
    if (!Array.isArray(rows))
        throw new Error("character_loadouts.json: no data.characters array");
    const out: LoadoutEntry[][] = [];
    for (const r of rows) {
        if (!isInt(r.index))
            throw new Error("character_loadouts.json: a character without an integer index");
        if (!Array.isArray(r.loadout))
            throw new Error(`character_loadouts.json: character ${r.index} without a loadout list`);
        out[r.index] = (r.loadout as Array<{
            item_id?: unknown;
            amount_raw?: unknown;
        }>).map((e) => {
            if (!isInt(e.item_id) || !isInt(e.amount_raw))
                throw new Error(`character_loadouts.json: character ${r.index}: an entry without integer item_id / amount_raw`);
            return Object.freeze({ item: e.item_id, amount: e.amount_raw });
        });
    }
    for (let i = 0; i < out.length; i++)
        if (out[i] === undefined)
            throw new Error(`character_loadouts.json: no row of character ${i}`);
    return out;
}
function itemsOf(doc: unknown): Map<number, {
    name: string;
    cap: number;
    defaultGrant: number;
}> {
    const d = doc as {
        data?: {
            items?: Array<{
                id?: unknown;
                name?: unknown;
                cap?: unknown;
                default_grant?: unknown;
            }>;
        };
    } | null;
    const items = d?.data?.items;
    if (!Array.isArray(items))
        throw new Error("items.json: no data.items array");
    const out = new Map<number, {
        name: string;
        cap: number;
        defaultGrant: number;
    }>();
    for (const it of items) {
        if (!isInt(it.id) || !isInt(it.cap) || !isInt(it.default_grant) || typeof it.name !== "string")
            throw new Error("items.json: an item without integer id / cap / default_grant or a string name");
        out.set(it.id, Object.freeze({ name: it.name.toLowerCase().replace(/ /g, "_"), cap: it.cap, defaultGrant: it.default_grant }));
    }
    return out;
}
function demosOf(doc: unknown): {
    demos: DemoBlock[];
    bytesPerDemo: number;
} {
    const d = doc as {
        data?: {
            bytes_per_demo?: unknown;
            demos?: Array<{
                episode?: unknown;
                seed_hex?: unknown;
                inputs?: unknown;
            }>;
        };
    } | null;
    const demos = d?.data?.demos;
    const n = d?.data?.bytes_per_demo;
    if (!Array.isArray(demos) || !isInt(n))
        throw new Error("demo_inputs.json: no data.demos array or data.bytes_per_demo");
    const out: DemoBlock[] = [];
    for (const b of demos) {
        if (!isInt(b.episode) || typeof b.seed_hex !== "string" || !/^[0-9A-Fa-f]{8}$/.test(b.seed_hex) || !Array.isArray(b.inputs))
            throw new Error("demo_inputs.json: a demo without integer episode, 8-digit seed_hex or inputs list");
        if (b.inputs.length !== n || !b.inputs.every(isInt))
            throw new Error(`demo_inputs.json: episode ${b.episode}: ${b.inputs.length} input bytes, expected ${n}`);
        out[b.episode] = Object.freeze({ episode: b.episode, seed: parseInt(b.seed_hex, 16) >>> 0, inputs: Object.freeze([...(b.inputs as number[])]) });
    }
    for (let i = 0; i < out.length; i++)
        if (out[i] === undefined)
            throw new Error(`demo_inputs.json: no demo of episode ${i}`);
    return { demos: out, bytesPerDemo: n };
}
export function startDataFrom(loadoutsDoc: unknown, itemsDoc: unknown, demoInputsDoc: unknown): StartData {
    const { demos, bytesPerDemo } = demosOf(demoInputsDoc);
    return Object.freeze({ loadouts: loadoutsOf(loadoutsDoc), items: itemsOf(itemsDoc), demos, bytesPerDemo });
}

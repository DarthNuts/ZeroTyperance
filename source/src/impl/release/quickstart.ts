export interface PasswordRow {
    readonly episode: number;
    readonly floor: number;
    readonly name: string;
    readonly code: string;
}
export function loadPasswords(json: unknown): PasswordRow[] {
    const root = json as {
        data?: {
            passwords?: unknown;
        };
        passwords?: unknown;
    } | null;
    const list = root?.data?.passwords ?? root?.passwords;
    if (!Array.isArray(list))
        throw new Error("password_floors.json: no `passwords` list");
    return list.map((r: Record<string, unknown>) => ({ episode: Number(r.episode), floor: Number(r.floor), name: String(r.name), code: String(r.code) }));
}
export function groupByEpisode(rows: readonly PasswordRow[]): {
    episode: number;
    rows: PasswordRow[];
}[] {
    const out: {
        episode: number;
        rows: PasswordRow[];
    }[] = [];
    for (const r of rows) {
        let g = out[out.length - 1];
        if (!g || g.episode !== r.episode) {
            g = { episode: r.episode, rows: [] };
            out.push(g);
        }
        g.rows.push(r);
    }
    return out;
}
export function loadAlphabet(json: unknown): string {
    const root = json as {
        data?: {
            alphabet?: unknown;
        };
        alphabet?: unknown;
    } | null;
    const a = root?.data?.alphabet ?? root?.alphabet;
    return typeof a === "string" ? a : "";
}
export function freeEntryProblem(text: string, length: number, alphabet: string): string | null {
    if ([...text].length !== length)
        return `The password has ${length} characters.`;
    if (alphabet !== "")
        for (const ch of text)
            if (!alphabet.includes(ch))
                return `"${ch}" is not a character of the password alphabet.`;
    return null;
}

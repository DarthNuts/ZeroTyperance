export const GUARD_PREFIX = "GUARD.";
export interface GuardConstants {
    readonly HOLD_SHORT: number;
    readonly HOLD_LONG: number;
    readonly HOLD_BY_REQUEST: ReadonlyMap<number, number>;
}
function isInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v);
}
export function guardConstantsFrom(doc: unknown): GuardConstants {
    const d = doc as {
        guard_constants?: unknown;
    } | null;
    if (!d || typeof d !== "object" || !Array.isArray(d.guard_constants))
        throw new Error("weapon.json: no guard_constants table (ZT-PLAYER-WEAPON 4.4a)");
    const values = new Map<string, unknown>();
    for (const c of d.guard_constants as Array<{
        id?: unknown;
        value?: unknown;
    }>) {
        if (typeof c.id !== "string" || !c.id.startsWith(GUARD_PREFIX))
            throw new Error(`weapon.json: guard constant id ${String(c.id)} is not a GUARD.* id`);
        const id = c.id.slice(GUARD_PREFIX.length);
        if (values.has(id))
            throw new Error(`weapon.json: guard constant ${c.id} is doubled`);
        values.set(id, c.value);
    }
    const short = values.get("HOLD_SHORT");
    const long = values.get("HOLD_LONG");
    if (!isInt(short) || !isInt(long))
        throw new Error("weapon.json: GUARD.HOLD_SHORT / GUARD.HOLD_LONG missing or not integers");
    const table = values.get("HOLD_BY_REQUEST");
    if (!Array.isArray(table))
        throw new Error("weapon.json: GUARD.HOLD_BY_REQUEST missing or not a list");
    const byRequest = new Map<number, number>();
    for (const e of table as Array<{
        request?: unknown;
        hold?: unknown;
    }>) {
        if (!isInt(e.request) || !isInt(e.hold))
            throw new Error("weapon.json: a GUARD.HOLD_BY_REQUEST entry without integer request / hold");
        if (e.hold !== short && e.hold !== long)
            throw new Error(`weapon.json: GUARD.HOLD_BY_REQUEST request ${e.request} holds ${e.hold}, neither HOLD_SHORT nor HOLD_LONG`);
        if (byRequest.has(e.request))
            throw new Error(`weapon.json: GUARD.HOLD_BY_REQUEST request ${e.request} is doubled`);
        byRequest.set(e.request, e.hold);
    }
    for (const id of values.keys())
        if (!["HOLD_SHORT", "HOLD_LONG", "HOLD_BY_REQUEST"].includes(id))
            throw new Error(`weapon.json: unknown guard constant ${GUARD_PREFIX}${id}`);
    return Object.freeze({ HOLD_SHORT: short, HOLD_LONG: long, HOLD_BY_REQUEST: byRequest });
}

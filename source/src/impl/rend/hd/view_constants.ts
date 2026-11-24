export interface ViewConstants {
    readonly KEPT: number;
}
export function viewConstantsFrom(doc: unknown): ViewConstants {
    const d = doc as {
        format?: unknown;
        spec?: unknown;
        constants?: unknown;
    } | null;
    if (!d || typeof d !== "object")
        throw new Error("rend_view.json: not an object");
    if (d.spec !== "ZT-REND-VIEW")
        throw new Error(`rend_view.json: spec ${String(d.spec)}, expected ZT-REND-VIEW`);
    if (!Array.isArray(d.constants))
        throw new Error("rend_view.json: no constants array");
    const kept = (d.constants as Array<{
        id?: unknown;
        value?: unknown;
    }>).find((c) => c.id === "VIEW.KEPT");
    if (!kept || typeof kept.value !== "number" || !Number.isInteger(kept.value) || kept.value < 1)
        throw new Error("rend_view.json: VIEW.KEPT is missing or not a positive integer");
    return Object.freeze({ KEPT: kept.value });
}

export type BriefingExitAction = "title" | "demo" | "new_game" | "password_game" | "end";
export function briefingExitAction(to: string, path: string | null, has: {
    readonly pick: boolean;
    readonly demoKit: boolean;
    readonly charsel: boolean;
    readonly storedRecord: boolean;
}): BriefingExitAction {
    if (to === "title")
        return "title";
    if (to !== "game")
        return "end";
    if (path === "demo")
        return has.pick && has.demoKit ? "demo" : "end";
    if (path === "start")
        return has.demoKit && has.charsel ? "new_game" : "end";
    if (path === "episode1" || path === "episode2")
        return has.demoKit && has.charsel && has.storedRecord ? "password_game" : "end";
    return "end";
}

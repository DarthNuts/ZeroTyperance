import type { AppConstants } from "./constants.js";
import type { AssetStore } from "./store.js";
import type { StateStorage } from "./states.js";
export const HD_SWITCH_KEYS: readonly string[] = ["zt.hd", "zt.hdres"];
export type StorageAction = "reset" | "clear" | "forget";
export const ABOUT_ROWS: readonly {
    id: "reextract" | StorageAction;
    label: string;
    deletes: string;
}[] = [
    { id: "reextract", label: "Re-extract", deletes: "" },
    { id: "reset", label: "Reset settings", deletes: "deletes every stored setting (the co-op server address included); the assets and the save states stay" },
    { id: "clear", label: "Clear extracted data", deletes: "deletes the extracted assets; the settings and the save states stay" },
    { id: "forget", label: "Forget", deletes: "deletes everything this page stores: the assets, every setting and the save states" },
];
export function pageStorageKeys(c: AppConstants): string[] {
    return [c.settingsKey, ...HD_SWITCH_KEYS];
}
export interface RemovableStorage {
    removeItem(k: string): void;
}
export function removeSettings(s: RemovableStorage | undefined, c: AppConstants): void {
    if (!s || typeof s.removeItem !== "function")
        return;
    for (const k of pageStorageKeys(c)) {
        try {
            s.removeItem(k);
        }
        catch { }
    }
}
export interface StorageTargets {
    readonly consts: AppConstants;
    readonly settings: RemovableStorage | undefined;
    readonly assets: AssetStore;
    readonly states: StateStorage;
}
export async function runStorageAction(a: StorageAction, t: StorageTargets): Promise<void> {
    if (a === "reset" || a === "forget")
        removeSettings(t.settings, t.consts);
    if (a === "clear" || a === "forget")
        await t.assets.forget();
    if (a === "forget")
        await t.states.clear();
}
export class StorageQuestion {
    choice: "no" | "yes" = "no";
    constructor(readonly action: StorageAction) { }
    press(key: "left" | "right" | "choose" | "back"): "yes" | "no" | null {
        if (key === "left" || key === "right") {
            this.choice = this.choice === "no" ? "yes" : "no";
            return null;
        }
        if (key === "back")
            return "no";
        return this.choice;
    }
}

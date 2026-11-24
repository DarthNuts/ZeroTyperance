/// <reference lib="dom" />
import type { AppConstants } from "./constants.js";
export interface StateLevel {
    readonly episode: number;
    readonly floor: number;
    readonly name: string;
}
export interface StateRecord {
    readonly format: number;
    readonly md5: string;
    readonly level: StateLevel;
    readonly savedAt: number;
    readonly state: string;
}
export interface StateStorage {
    get(slot: number): Promise<StateRecord | undefined>;
    put(slot: number, rec: StateRecord): Promise<void>;
    clear(): Promise<void>;
}
export class MemoryStateStorage implements StateStorage {
    private readonly m = new Map<number, StateRecord>();
    async get(slot: number): Promise<StateRecord | undefined> { return this.m.get(slot); }
    async put(slot: number, rec: StateRecord): Promise<void> { this.m.set(slot, rec); }
    async clear(): Promise<void> { this.m.clear(); }
}
const SLOTS = "slots";
export class IdbStateStorage implements StateStorage {
    private dbp: Promise<IDBDatabase> | undefined;
    constructor(private readonly name: string) { }
    private db(): Promise<IDBDatabase> {
        this.dbp ??= new Promise((res, rej) => {
            const req = indexedDB.open(this.name, 1);
            req.onupgradeneeded = () => { req.result.createObjectStore(SLOTS); };
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
        return this.dbp;
    }
    async get(slot: number): Promise<StateRecord | undefined> {
        const db = await this.db();
        const req = db.transaction(SLOTS).objectStore(SLOTS).get(String(slot));
        return new Promise((res, rej) => { req.onsuccess = () => res(req.result as StateRecord | undefined); req.onerror = () => rej(req.error); });
    }
    async put(slot: number, rec: StateRecord): Promise<void> {
        const db = await this.db();
        const tx = db.transaction(SLOTS, "readwrite");
        tx.objectStore(SLOTS).put(rec, String(slot));
        await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error ?? new Error("transaction aborted")); });
    }
    async clear(): Promise<void> {
        const db = await this.db();
        const tx = db.transaction(SLOTS, "readwrite");
        tx.objectStore(SLOTS).clear();
        await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error ?? new Error("transaction aborted")); });
    }
}
export function stateStorage(c: AppConstants): StateStorage {
    return typeof indexedDB !== "undefined" ? new IdbStateStorage(c.state.db) : new MemoryStateStorage();
}
export type SlotStatus = "empty" | "unusable" | "usable";
export function slotStatus(rec: StateRecord | undefined, c: AppConstants, md5: string): SlotStatus {
    if (!rec)
        return "empty";
    return rec.format === c.state.format && rec.md5 === md5 && typeof rec.state === "string" ? "usable" : "unusable";
}
export function slotLabel(slot: number, rec: StateRecord | undefined, c: AppConstants, md5: string): string {
    const st = slotStatus(rec, c, md5);
    if (st !== "usable")
        return `${slot}  ${st}`;
    return `${slot}  ${rec!.level.name}  ${new Date(rec!.savedAt).toLocaleString()}`;
}
export function slotNumbers(c: AppConstants): number[] {
    return Array.from({ length: c.state.slots }, (_, i) => i + 1);
}

export type LeavePath = "leave" | "reextract" | "forget" | "rom" | "close";
export class GameViewGuard {
    private readonly exits = new Set<(path: LeavePath) => void>();
    add(exit: (path: LeavePath) => void): () => void {
        this.exits.add(exit);
        return () => { this.exits.delete(exit); };
    }
    leave(path: LeavePath): void {
        for (const exit of [...this.exits])
            exit(path);
    }
}
export interface PageActions<R> {
    reextract(): void;
    forget(): Promise<void>;
    rom(bytes: R): Promise<void>;
    close(): void;
}
export function guardedActions<R>(guard: GameViewGuard, actions: PageActions<R>): PageActions<R> {
    return {
        reextract: () => { guard.leave("reextract"); actions.reextract(); },
        forget: async () => { guard.leave("forget"); await actions.forget(); },
        rom: async (bytes) => { guard.leave("rom"); await actions.rom(bytes); },
        close: () => { guard.leave("close"); actions.close(); },
    };
}

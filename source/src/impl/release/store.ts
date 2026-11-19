export interface StoredFile {
    readonly path: string;
    readonly bytes: Uint8Array;
}
export interface AssetStore {
    put(md5: string, version: string, files: readonly StoredFile[]): Promise<void>;
    markComplete(md5: string, version: string): Promise<void>;
    isComplete(version: string, md5?: string): Promise<boolean>;
    completeMd5(version: string, md5?: string): Promise<string | undefined>;
    get(md5: string, version: string, path: string): Promise<Uint8Array | undefined>;
    list(md5: string, version: string): Promise<string[]>;
    getMany(md5: string, version: string, paths: readonly string[], onProgress?: (done: number, total: number) => void): Promise<(Uint8Array | undefined)[]>;
    hasOtherVersion(version: string): Promise<boolean>;
    dropOtherVersions(version: string): Promise<void>;
    forget(): Promise<void>;
}
export function recordKey(md5: string, version: string, path: string): string {
    return `${md5}\u0000${version}\u0000${path}`;
}
export function markKey(md5: string, version: string): string {
    return `${md5}\u0000${version}`;
}

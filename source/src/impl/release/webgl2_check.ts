export interface Webgl2Canvas {
    getContext(id: string): unknown;
}
export function hasWebgl2(makeCanvas: () => Webgl2Canvas): boolean {
    try {
        return makeCanvas().getContext("webgl2") != null;
    }
    catch {
        return false;
    }
}

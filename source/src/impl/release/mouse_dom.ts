/// <reference lib="dom" />
import { MOUSE_BUTTON } from "./mouse.js";
import type { OriginalMouse } from "./mouse.js";
export interface MouseAttachment {
    poll(nowMs: number): number;
    release(): void;
    readonly locked: boolean;
    detach(): void;
}
export function attachMouse(target: HTMLElement, mouse: OriginalMouse, active: () => boolean, onEscape: () => void): MouseAttachment {
    const doc = target.ownerDocument;
    let locked = false;
    let wantRelease = false;
    const onClick = (): void => {
        if (!mouse.enabled || !active() || doc.pointerLockElement === target)
            return;
        void Promise.resolve(target.requestPointerLock()).catch(() => undefined);
    };
    const onLockChange = (): void => {
        if (doc.pointerLockElement === target) {
            locked = true;
            target.style.cursor = "none";
            return;
        }
        const wasLocked = locked;
        locked = false;
        target.style.cursor = "";
        mouse.reset();
        if (wasLocked && !wantRelease && active())
            onEscape();
        wantRelease = false;
    };
    const onMove = (e: MouseEvent): void => { if (locked)
        mouse.move(e.movementX); };
    const onDown = (e: MouseEvent): void => {
        if (!locked || (e.button !== MOUSE_BUTTON.LEFT && e.button !== MOUSE_BUTTON.RIGHT))
            return;
        mouse.button(e.button, true);
        e.preventDefault();
    };
    const onUp = (e: MouseEvent): void => { mouse.button(e.button, false); };
    const onContext = (e: Event): void => { if (locked)
        e.preventDefault(); };
    target.addEventListener("click", onClick);
    doc.addEventListener("pointerlockchange", onLockChange);
    doc.addEventListener("mousemove", onMove);
    doc.addEventListener("mousedown", onDown);
    doc.addEventListener("mouseup", onUp);
    doc.addEventListener("contextmenu", onContext);
    const release = (): void => {
        if (doc.pointerLockElement === target) {
            wantRelease = true;
            doc.exitPointerLock();
        }
        locked = false;
        target.style.cursor = "";
        mouse.reset();
    };
    return {
        poll(nowMs: number): number {
            if (!locked)
                return 0;
            if (!mouse.enabled || !active()) {
                release();
                return 0;
            }
            mouse.advance(nowMs);
            return mouse.bits();
        },
        release,
        get locked() { return locked; },
        detach(): void {
            release();
            target.removeEventListener("click", onClick);
            doc.removeEventListener("pointerlockchange", onLockChange);
            doc.removeEventListener("mousemove", onMove);
            doc.removeEventListener("mousedown", onDown);
            doc.removeEventListener("mouseup", onUp);
            doc.removeEventListener("contextmenu", onContext);
        },
    };
}

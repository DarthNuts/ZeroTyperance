const ERRNO_SUCCESS = 0, ERRNO_BADF = 8, ERRNO_EXIST = 20, ERRNO_INVAL = 28, ERRNO_NOENT = 44, ERRNO_NOTDIR = 54, ERRNO_SPIPE = 70;
const OFLAGS_CREAT = 1, OFLAGS_DIRECTORY = 2, OFLAGS_EXCL = 4, OFLAGS_TRUNC = 8;
class MemFile {
    data: Uint8Array;
    size: number;
    constructor(data: Uint8Array = new Uint8Array(0), size = data.length) {
        this.data = data;
        this.size = size;
    }
    ensure(n: number): void {
        if (n <= this.data.length)
            return;
        let cap = Math.max(1 << 16, this.data.length);
        while (cap < n)
            cap *= 2;
        const d = new Uint8Array(cap);
        d.set(this.data.subarray(0, this.size));
        this.data = d;
    }
}
interface Handle {
    file: MemFile;
    pos: number;
}
export class ProcExit extends Error {
    constructor(readonly code: number) { super(`proc_exit(${code})`); }
}
export interface WasiResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}
export class MemDir {
    readonly files = new Map<string, MemFile>();
    put(name: string, bytes: Uint8Array): void { this.files.set(name, new MemFile(bytes)); }
    get(name: string): Uint8Array | undefined {
        const f = this.files.get(name);
        return f ? f.data.subarray(0, f.size) : undefined;
    }
}
export async function runWasi(module: WebAssembly.Module, args: string[], dir: MemDir, preopenName = "/w"): Promise<WasiResult> {
    const enc = new TextEncoder(), dec = new TextDecoder();
    const argBytes = args.map((a) => enc.encode(a + "\0"));
    const preBytes = enc.encode(preopenName);
    const handles = new Map<number, Handle>();
    let nextFd = 4;
    let out = "", err = "";
    let mem!: WebAssembly.Memory;
    const dv = () => new DataView(mem.buffer);
    const u8 = () => new Uint8Array(mem.buffer);
    const imports = {
        args_sizes_get(argcPtr: number, bufSizePtr: number): number {
            const v = dv();
            v.setUint32(argcPtr, args.length, true);
            v.setUint32(bufSizePtr, argBytes.reduce((s, b) => s + b.length, 0), true);
            return ERRNO_SUCCESS;
        },
        args_get(argvPtr: number, bufPtr: number): number {
            const v = dv(), m = u8();
            let p = bufPtr;
            argBytes.forEach((b, i) => {
                v.setUint32(argvPtr + 4 * i, p, true);
                m.set(b, p);
                p += b.length;
            });
            return ERRNO_SUCCESS;
        },
        fd_prestat_get(fd: number, ptr: number): number {
            if (fd !== 3)
                return ERRNO_BADF;
            const v = dv();
            v.setUint8(ptr, 0);
            v.setUint32(ptr + 4, preBytes.length, true);
            return ERRNO_SUCCESS;
        },
        fd_prestat_dir_name(fd: number, ptr: number, len: number): number {
            if (fd !== 3)
                return ERRNO_BADF;
            u8().set(preBytes.subarray(0, len), ptr);
            return ERRNO_SUCCESS;
        },
        fd_fdstat_get(fd: number, ptr: number): number {
            let type: number;
            if (fd >= 0 && fd <= 2)
                type = 2;
            else if (fd === 3)
                type = 3;
            else if (handles.has(fd))
                type = 4;
            else
                return ERRNO_BADF;
            new Uint8Array(mem.buffer, ptr, 24).fill(0);
            const v = dv();
            v.setUint8(ptr, type);
            v.setBigUint64(ptr + 8, 0xffffffffffffffffn, true);
            v.setBigUint64(ptr + 16, 0xffffffffffffffffn, true);
            return ERRNO_SUCCESS;
        },
        fd_fdstat_set_flags(fd: number): number {
            return fd <= 3 || handles.has(fd) ? ERRNO_SUCCESS : ERRNO_BADF;
        },
        path_open(dirfd: number, _dirflags: number, pathPtr: number, pathLen: number, oflags: number, _rb: bigint, _ri: bigint, _fdflags: number, fdPtr: number): number {
            if (dirfd !== 3)
                return ERRNO_BADF;
            if (oflags & OFLAGS_DIRECTORY)
                return ERRNO_NOTDIR;
            const name = dec.decode(new Uint8Array(mem.buffer, pathPtr, pathLen)).replace(/^(\.\/)+/, "");
            let f = dir.files.get(name);
            if (f) {
                if ((oflags & OFLAGS_CREAT) && (oflags & OFLAGS_EXCL))
                    return ERRNO_EXIST;
                if (oflags & OFLAGS_TRUNC) {
                    f = new MemFile();
                    dir.files.set(name, f);
                }
            }
            else {
                if (!(oflags & OFLAGS_CREAT))
                    return ERRNO_NOENT;
                f = new MemFile();
                dir.files.set(name, f);
            }
            const fd = nextFd++;
            handles.set(fd, { file: f, pos: 0 });
            dv().setUint32(fdPtr, fd, true);
            return ERRNO_SUCCESS;
        },
        fd_close(fd: number): number {
            return handles.delete(fd) || fd <= 3 ? ERRNO_SUCCESS : ERRNO_BADF;
        },
        fd_read(fd: number, iovs: number, iovsLen: number, nreadPtr: number): number {
            const h = handles.get(fd);
            if (!h) {
                dv().setUint32(nreadPtr, 0, true);
                return fd <= 2 ? ERRNO_SUCCESS : ERRNO_BADF;
            }
            const v = dv(), m = u8();
            let total = 0;
            for (let i = 0; i < iovsLen; i++) {
                const base = v.getUint32(iovs + 8 * i, true), len = v.getUint32(iovs + 8 * i + 4, true);
                const n = Math.min(len, h.file.size - h.pos);
                if (n <= 0)
                    break;
                m.set(h.file.data.subarray(h.pos, h.pos + n), base);
                h.pos += n;
                total += n;
                if (n < len)
                    break;
            }
            v.setUint32(nreadPtr, total, true);
            return ERRNO_SUCCESS;
        },
        fd_write(fd: number, iovs: number, iovsLen: number, nwrittenPtr: number): number {
            const v = dv(), m = u8();
            const h = handles.get(fd);
            if (!h && fd !== 1 && fd !== 2)
                return ERRNO_BADF;
            let total = 0;
            for (let i = 0; i < iovsLen; i++) {
                const base = v.getUint32(iovs + 8 * i, true), len = v.getUint32(iovs + 8 * i + 4, true);
                const chunk = m.subarray(base, base + len);
                if (h) {
                    h.file.ensure(h.pos + len);
                    h.file.data.set(chunk, h.pos);
                    h.pos += len;
                    if (h.pos > h.file.size)
                        h.file.size = h.pos;
                }
                else if (fd === 1)
                    out += dec.decode(chunk, { stream: true });
                else
                    err += dec.decode(chunk, { stream: true });
                total += len;
            }
            v.setUint32(nwrittenPtr, total, true);
            return ERRNO_SUCCESS;
        },
        fd_seek(fd: number, offset: bigint, whence: number, newPtr: number): number {
            const h = handles.get(fd);
            if (!h)
                return fd <= 2 ? ERRNO_SPIPE : ERRNO_BADF;
            const off = Number(offset);
            const base = whence === 0 ? 0 : whence === 1 ? h.pos : whence === 2 ? h.file.size : -1;
            if (base < 0 || base + off < 0)
                return ERRNO_INVAL;
            h.pos = base + off;
            dv().setBigUint64(newPtr, BigInt(h.pos), true);
            return ERRNO_SUCCESS;
        },
        proc_exit(code: number): never {
            throw new ProcExit(code);
        },
    };
    const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: imports });
    mem = instance.exports["memory"] as WebAssembly.Memory;
    let exitCode = 0;
    try {
        (instance.exports["_start"] as () => void)();
    }
    catch (e) {
        if (e instanceof ProcExit)
            exitCode = e.code;
        else
            throw e;
    }
    return { exitCode, stdout: out, stderr: err };
}

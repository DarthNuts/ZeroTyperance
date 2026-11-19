// unzip1.mjs ZIP MEMBER OUT : writes one member of a zip archive (stored or deflated) to OUT. The Linux / macOS installer
// uses it to take the ROM image out of its download without needing an unzip program. Node built-ins only.
import fs from 'node:fs';
import zlib from 'node:zlib';

const [zipPath, member, outPath] = process.argv.slice(2);
if (!zipPath || !member || !outPath) { console.error('usage: node unzip1.mjs ZIP MEMBER OUT'); process.exit(2); }
const z = fs.readFileSync(zipPath);
const fail = (m) => { console.error(`unzip1: ${m}`); process.exit(1); };

// the end of central directory record: the last 0x06054b50 within the final 64 KB + 22 bytes
let eocd = -1;
for (let i = z.length - 22; i >= Math.max(0, z.length - 22 - 65535); i--) {
  if (z.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) fail('not a zip archive');
const count = z.readUInt16LE(eocd + 10);
let p = z.readUInt32LE(eocd + 16);
for (let n = 0; n < count; n++) {
  if (z.readUInt32LE(p) !== 0x02014b50) fail('bad central directory');
  const method = z.readUInt16LE(p + 10);
  const csize = z.readUInt32LE(p + 20);
  const usize = z.readUInt32LE(p + 24);
  const nlen = z.readUInt16LE(p + 28), xlen = z.readUInt16LE(p + 30), clen = z.readUInt16LE(p + 32);
  const local = z.readUInt32LE(p + 42);
  const name = z.subarray(p + 46, p + 46 + nlen).toString('latin1');
  p += 46 + nlen + xlen + clen;
  if (name !== member) continue;
  if (z.readUInt32LE(local) !== 0x04034b50) fail('bad local header');
  const data = local + 30 + z.readUInt16LE(local + 26) + z.readUInt16LE(local + 28);
  const raw = z.subarray(data, data + csize);
  const out = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : fail(`compression method ${method}`);
  if (out.length !== usize) fail('size mismatch');
  fs.writeFileSync(outPath, out);
  process.exit(0);
}
fail(`no member ${member}`);

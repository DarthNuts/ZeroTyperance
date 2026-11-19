// fetch_rom.mjs : puts the Zero Tolerance ROM image into rom/Zerotole.bin next to this file (the setup program and the
// first start run it). The image is the original, made royalty-free for distribution by its copyright owner, Randel Reiss
// (technopop.net); it is downloaded from there (the archive.org copy as the fallback), never from this project.
//   exit 0  the image is there (kept as it was, or downloaded and checked against its pinned SHA-256)
//   exit 3  no URL gave a matching image: the page asks for one
// ZT_ROM_URLS (space separated) replaces the URL list. Node built-ins only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROM_ZIP_SHA = '5d8f7f96dcab8ed7679ae0d92959b784517c541821f903e95f671308505b8e01';
const ROM_SHA = '02e98d4dbf68c2279bf1471bfc7df4d6b8dc864435582beea92d2915febd0eeb';
const URLS = process.env.ZT_ROM_URLS ? process.env.ZT_ROM_URLS.split(/\s+/).filter(Boolean) : 'http://www.technopop.net/images/zerotole.zip https://web.archive.org/web/20180310132236id_/http://www.technopop.net/images/zerotole.zip'.split(' ');
const ROM_DIR = path.join(HERE, 'rom');
const ROM = path.join(ROM_DIR, 'Zerotole.bin');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

if (fs.existsSync(ROM)) { console.log('the ROM image is already installed'); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zt-rom-'));
const cleanup = () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } };
let got = false;
for (const url of URLS) {
  console.log(`downloading the Zero Tolerance ROM image from ${url}`);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const zip = Buffer.from(await res.arrayBuffer());
    if (sha(zip) !== ROM_ZIP_SHA) throw new Error('the download does not match its pinned SHA-256');
    const zf = path.join(tmp, 'rom.zip'), out = path.join(tmp, 'Zerotole.bin');
    fs.writeFileSync(zf, zip);
    const r = spawnSync(process.execPath, [path.join(HERE, 'unzip1.mjs'), zf, 'Zerotole.bin', out], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('the image could not be taken out of the archive');
    if (sha(fs.readFileSync(out)) !== ROM_SHA) throw new Error('the image does not match its pinned SHA-256');
    fs.mkdirSync(ROM_DIR, { recursive: true });
    const part = ROM + '.part';
    fs.copyFileSync(out, part);
    fs.renameSync(part, ROM);
    got = true;
    break;
  } catch (e) {
    console.log(`that copy failed: ${e && e.message ? e.message : e}`);
  }
}
cleanup();
if (got) { console.log('ROM image installed (royalty-free for distribution by its copyright owner, Randel Reiss: technopop.net)'); process.exit(0); }
console.log('no ROM image could be downloaded: the page will ask you for one');
process.exit(3);

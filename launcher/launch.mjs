// ZeroTyperance launcher: serves the game page and the co-op server on one port, then opens the browser.
//   zerotyperance [--port N] [--no-open] [--version] [--help]
// A second start while one runs only opens the browser. The page keeps the extracted assets in the browser's
// storage for http://localhost:PORT, so keep the same port between runs (the default is 8802).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from './server/server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, 'app');
const ROM = path.join(HERE, 'rom', 'Zerotole.bin'); // the installer's download of the royalty-free ROM image, if any
const VERSION = fs.readFileSync(path.join(HERE, 'VERSION'), 'utf8').trim();
const DEFAULT_PORT = 8802;

const USAGE = `ZeroTyperance ${VERSION}
usage: zerotyperance [--port N] [--no-open] [--version]
  --port N    serve on port N (default ${DEFAULT_PORT}); the browser keeps your assets per port
  --no-open   do not open the browser
Close this window (or press Ctrl+C) to stop the game server.`;

function parseArgs(av) {
  const o = { port: DEFAULT_PORT, open: true };
  for (let i = 0; i < av.length; i++) {
    const a = av[i];
    if (a === '--port' && i + 1 < av.length) {
      o.port = Number(av[++i]);
      if (!Number.isInteger(o.port) || o.port < 1 || o.port > 65535) throw new Error(`bad port ${av[i]}`);
    } else if (a === '--no-open') o.open = false;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

// What answers on the port: { state: 'ours', version } (a running ZeroTyperance), { state: 'other' }, { state: 'free' }.
function probe(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/version.json', timeout: 1500 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { if (body.length < 4096) body += d; });
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          resolve(j.name === 'ZeroTyperance' ? { state: 'ours', version: String(j.version) } : { state: 'other' });
        } catch { resolve({ state: 'other' }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ state: 'other' }); });
    req.on('error', (e) => resolve({ state: e.code === 'ECONNREFUSED' ? 'free' : 'other' }));
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['explorer.exe', [url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try {
    const p = spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' });
    p.on('error', () => console.log(`open ${url} in your browser`));
    p.unref();
  } catch {
    console.log(`open ${url} in your browser`);
  }
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`zerotyperance: ${e.message}\n\n${USAGE}`); process.exit(2); }
  if (o.version) { console.log(VERSION); return; }
  if (o.help) { console.log(USAGE); return; }
  const url = `http://localhost:${o.port}/`;
  const found = await probe(o.port);
  if (found.state === 'ours' && found.version !== VERSION) {
    console.error(`zerotyperance: ZeroTyperance ${found.version} still runs on port ${o.port}: close its window, then start ${VERSION} again`);
    process.exit(1);
  }
  if (found.state === 'ours') {
    console.log(`ZeroTyperance already runs on port ${o.port}: ${url}`);
    if (o.open) openBrowser(url);
    return;
  }
  if (found.state === 'other') {
    console.error(`zerotyperance: port ${o.port} is used by another program; start with --port N`);
    process.exit(1);
  }
  let s;
  try {
    s = await startServer({ site: APP, port: o.port, ...(fs.existsSync(ROM) ? { rom: ROM } : {}) });
  } catch (e) {
    console.error(`zerotyperance: the server did not start: ${e.message}`);
    process.exit(1);
  }
  console.log(`ZeroTyperance ${VERSION} on ${url}`);
  if (!fs.existsSync(ROM)) console.log('No bundled ROM image: the page asks you for one.');
  console.log('Co-op on your network: the other player opens this computer\'s address with the same port (the Co-op page lists it).');
  console.log('Close this window (or press Ctrl+C) to stop the game server.');
  const stop = async () => { try { await s.close(); } finally { process.exit(0); } };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  if (o.open) openBrowser(url);
}

main();

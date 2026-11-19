// zt-coop server, protocol version 1: the page files, room signalling, a relay and STUN on one port, plus LAN room
// announcements. Node >= 18, node: built-ins only.
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOM_CODE_LEN = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_FRAME = 1024 * 1024;
export const SERVER_PATH = '/coop';
export const ROM_PATH = '/rom.bin'; // the page's APP.ROM.BUNDLED, relative to a page served at /
export const ROOM_LIST_MAX = 16;
export const LAN_PORT = 47811;
export const LAN_ANNOUNCE_MS = 1000;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
// host-only virtual adapters (Hyper-V / WSL, Docker, VMware, VirtualBox, Linux bridges): no partner reaches the
// computer through them, so they give no `urls` and get no LAN announcement
const VIRTUAL_IF = /^(vEthernet|docker|br-|virbr|veth|vmnet|VMware|VirtualBox)/i;

// ---------------------------------------------------------------- pure helpers

export function generateRoomCode(len = ROOM_CODE_LEN, randomInt = crypto.randomInt) {
  let s = '';
  for (let i = 0; i < len; i++) s += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return s;
}

export function ipv6ToBytes(addr) {
  let a = addr.split('%')[0];
  if (a.includes('.')) {
    const i = a.lastIndexOf(':');
    const v = a.slice(i + 1).split('.').map(Number);
    a = a.slice(0, i + 1) + ((v[0] << 8) | v[1]).toString(16) + ':' + ((v[2] << 8) | v[3]).toString(16);
  }
  const dbl = a.includes('::');
  const [h, t] = a.split('::');
  const hs = h ? h.split(':') : [];
  const ts = dbl && t ? t.split(':') : [];
  const fill = dbl ? 8 - hs.length - ts.length : 0;
  const g = [...hs, ...Array(Math.max(fill, 0)).fill('0'), ...ts];
  if (g.length !== 8) throw new Error('bad IPv6 address');
  const b = Buffer.alloc(16);
  g.forEach((x, i) => b.writeUInt16BE(parseInt(x, 16) & 0xffff, i * 2));
  return b;
}

export function bytesToIPv6(b) {
  const g = [];
  for (let i = 0; i < 16; i += 2) g.push(b.readUInt16BE(i).toString(16));
  return g.join(':');
}

// "::ffff:1.2.3.4" -> "1.2.3.4"
export function normalizeIp(addr) {
  if (!addr) return '';
  const a = addr.split('%')[0];
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(a);
  return m ? m[1] : a;
}

// log-safe prefix: IPv4 /24, IPv6 /48
export function ipPrefix(addr) {
  const a = normalizeIp(addr);
  if (net.isIPv4(a)) { const p = a.split('.'); return `${p[0]}.${p[1]}.${p[2]}.0/24`; }
  if (net.isIPv6(a)) {
    const b = ipv6ToBytes(a);
    return `${b.readUInt16BE(0).toString(16)}:${b.readUInt16BE(2).toString(16)}:${b.readUInt16BE(4).toString(16)}::/48`;
  }
  return 'unknown';
}

// private = IPv4 10/8, 172.16/12, 192.168/16, 127/8; IPv6 fc00::/7, fe80::/10, ::1
// The bundled ROM image goes to askers on this computer or its local network only: a host whose port is forwarded to
// the internet does not hand it to anyone who finds the port (the page of such an asker sees no bundled ROM: a 404).
export function romServedTo(addr) { return isPrivateIp(addr); }

export function isPrivateIp(addr) {
  const a = normalizeIp(addr);
  if (net.isIPv4(a)) {
    const [p, q] = a.split('.').map(Number);
    return p === 10 || p === 127 || (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 168);
  }
  if (net.isIPv6(a)) {
    const b = ipv6ToBytes(a);
    if (b.subarray(0, 15).every((x) => x === 0) && b[15] === 1) return true;
    return (b[0] & 0xfe) === 0xfc || (b[0] === 0xfe && (b[1] & 0xc0) === 0x80);
  }
  return false;
}

// the same address, or both private and the same IPv4 /24 or IPv6 /64
export function sameNetwork(x, y) {
  const a = normalizeIp(x), b = normalizeIp(y);
  if (!a || !b) return false;
  if (a === b) return true;
  if (!isPrivateIp(a) || !isPrivateIp(b)) return false;
  if (net.isIPv4(a) && net.isIPv4(b)) return a.split('.').slice(0, 3).join('.') === b.split('.').slice(0, 3).join('.');
  if (net.isIPv6(a) && net.isIPv6(b)) return ipv6ToBytes(a).subarray(0, 8).equals(ipv6ToBytes(b).subarray(0, 8));
  return false;
}

export const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

export class ProtoError extends Error {
  constructor(code, msg, tooBig = false) { super(msg); this.code = code; this.tooBig = tooBig; }
}

export function encodeFrame(opcode, payload = Buffer.alloc(0), { fin = true, mask = false } = {}) {
  if (!Buffer.isBuffer(payload)) payload = Buffer.from(payload);
  const n = payload.length;
  let head;
  if (n < 126) { head = Buffer.alloc(2); head[1] = n; }
  else if (n < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  head[0] = (fin ? 0x80 : 0) | (opcode & 0x0f);
  if (!mask) return Buffer.concat([head, payload]);
  const key = mask === true ? crypto.randomBytes(4) : mask;
  head[1] |= 0x80;
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) out[i] = payload[i] ^ key[i & 3];
  return Buffer.concat([head, key, out]);
}

// Incremental RFC 6455 frame decoder. push(chunk) -> array of {fin, opcode, payload}
export class FrameParser {
  constructor({ maxPayload = MAX_FRAME, requireMask = false } = {}) {
    this.buf = Buffer.alloc(0); this.max = maxPayload; this.requireMask = requireMask;
  }
  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const out = [];
    for (;;) {
      const b = this.buf;
      if (b.length < 2) break;
      const fin = !!(b[0] & 0x80), rsv = b[0] & 0x70, opcode = b[0] & 0x0f;
      const masked = !!(b[1] & 0x80);
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) break; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (b.length < 10) break;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(this.max)) throw new ProtoError(1009, 'frame too big', true);
        len = Number(big); off = 10;
      }
      if (rsv) throw new ProtoError(1002, 'reserved bits set');
      if (!(opcode <= 2 || (opcode >= 8 && opcode <= 10))) throw new ProtoError(1002, 'bad opcode');
      if (opcode >= 8 && (len > 125 || !fin)) throw new ProtoError(1002, 'bad control frame');
      if (len > this.max) throw new ProtoError(1009, 'frame too big', true);
      if (this.requireMask && !masked) throw new ProtoError(1002, 'unmasked client frame');
      const total = off + (masked ? 4 : 0) + len;
      if (b.length < total) break;
      let payload = b.subarray(off + (masked ? 4 : 0), total);
      if (masked) {
        const key = b.subarray(off, off + 4);
        const p = Buffer.alloc(len);
        for (let i = 0; i < len; i++) p[i] = payload[i] ^ key[i & 3];
        payload = p;
      } else payload = Buffer.from(payload);
      out.push({ fin, opcode, payload });
      this.buf = b.subarray(total);
    }
    return out;
  }
}

// STUN (RFC 5389), Binding only
const STUN_COOKIE = 0x2112a442;
export function buildBindingRequest(tid = crypto.randomBytes(12)) {
  const m = Buffer.alloc(20);
  m.writeUInt16BE(0x0001, 0); m.writeUInt16BE(0, 2); m.writeUInt32BE(STUN_COOKIE, 4); tid.copy(m, 8);
  return m;
}
// returns {tid} or null when buf is not a Binding Request
export function parseBindingRequest(buf) {
  if (buf.length < 20 || (buf[0] & 0xc0) !== 0) return null;
  if (buf.readUInt16BE(0) !== 0x0001 || buf.readUInt32BE(4) !== STUN_COOKIE) return null;
  const l = buf.readUInt16BE(2);
  if ((l & 3) !== 0 || 20 + l > buf.length) return null;
  return { tid: Buffer.from(buf.subarray(8, 20)) };
}
export function buildBindingResponse(tid, address, port) {
  const a = normalizeIp(address);
  const v4 = net.isIPv4(a);
  const addrBytes = v4 ? Buffer.from(a.split('.').map(Number)) : ipv6ToBytes(a);
  const x = Buffer.alloc(addrBytes.length);
  const mk = Buffer.alloc(16); mk.writeUInt32BE(STUN_COOKIE, 0); tid.copy(mk, 4);
  for (let i = 0; i < x.length; i++) x[i] = addrBytes[i] ^ mk[i];
  const attrLen = 4 + x.length;
  const m = Buffer.alloc(20 + 4 + attrLen);
  m.writeUInt16BE(0x0101, 0); m.writeUInt16BE(4 + attrLen, 2); m.writeUInt32BE(STUN_COOKIE, 4); tid.copy(m, 8);
  m.writeUInt16BE(0x0020, 20); m.writeUInt16BE(attrLen, 22);
  m[24] = 0; m[25] = v4 ? 1 : 2; m.writeUInt16BE((port ^ (STUN_COOKIE >>> 16)) & 0xffff, 26);
  x.copy(m, 28);
  return m;
}
// returns {tid, family: 4|6, address, port} or null
export function parseBindingResponse(buf) {
  if (buf.length < 20 || buf.readUInt16BE(0) !== 0x0101 || buf.readUInt32BE(4) !== STUN_COOKIE) return null;
  const tid = Buffer.from(buf.subarray(8, 20));
  const end = Math.min(buf.length, 20 + buf.readUInt16BE(2));
  const mk = Buffer.alloc(16); mk.writeUInt32BE(STUN_COOKIE, 0); tid.copy(mk, 4);
  for (let o = 20; o + 4 <= end;) {
    const type = buf.readUInt16BE(o), l = buf.readUInt16BE(o + 2);
    if (type === 0x0020 && o + 4 + l <= end) {
      const fam = buf[o + 5], port = buf.readUInt16BE(o + 6) ^ (STUN_COOKIE >>> 16);
      const n = fam === 1 ? 4 : 16;
      const x = Buffer.alloc(n);
      for (let i = 0; i < n; i++) x[i] = buf[o + 8 + i] ^ mk[i];
      return { tid, family: fam === 1 ? 4 : 6, address: fam === 1 ? [...x].join('.') : bytesToIPv6(x), port };
    }
    o += 4 + ((l + 3) & ~3);
  }
  return null;
}

export function loadConfig(env = process.env) {
  const int = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10));
  const cfg = {
    port: int(env.ZT_COOP_PORT, 47810),
    stunPort: env.ZT_COOP_STUN_PORT === undefined || env.ZT_COOP_STUN_PORT === '' ? 'same' : parseInt(env.ZT_COOP_STUN_PORT, 10),
    bind: env.ZT_COOP_BIND || null,
    tlsCert: env.ZT_COOP_TLS_CERT || null,
    tlsKey: env.ZT_COOP_TLS_KEY || null,
    origins: (env.ZT_COOP_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    maxRooms: int(env.ZT_COOP_MAX_ROOMS, 500),
    maxPerIp: int(env.ZT_COOP_MAX_PER_IP, 8),
    site: env.ZT_COOP_SITE || null,
    rom: env.ZT_COOP_ROM || null, // a player's own program: the bundled ROM image, served at ROM_PATH
    lan: env.ZT_COOP_LAN !== '0',
    list: env.ZT_COOP_LIST === 'all' || env.ZT_COOP_LIST === 'network' ? env.ZT_COOP_LIST : null,
    lanPort: int(env.ZT_COOP_LAN_PORT, LAN_PORT),
    lanTargets: env.ZT_COOP_LAN_TARGETS ? env.ZT_COOP_LAN_TARGETS.split(',').map((x) => x.trim()).filter(Boolean) : null,
  };
  for (const k of ['port', 'maxRooms', 'maxPerIp', 'lanPort']) if (!Number.isInteger(cfg[k]) || cfg[k] < 0) throw new Error(`bad ${k}`);
  if (cfg.stunPort !== 'same' && !Number.isInteger(cfg.stunPort)) throw new Error('bad ZT_COOP_STUN_PORT');
  return cfg;
}

// ---------------------------------------------------------------- the server

export async function startServer(userCfg = {}, opts = {}) {
  const cfg = { ...loadConfig({}), ...userCfg };
  const log = opts.log || ((s) => console.log(s));
  const handshakeMs = opts.handshakeTimeoutMs ?? 10000;
  const pingMs = opts.pingMs ?? 20000;
  const deadMs = opts.deadMs ?? 60000;
  const idleRoomMs = opts.idleRoomMs ?? 30 * 60 * 1000;
  const listAll = (cfg.list || (cfg.site ? 'all' : 'network')) === 'all'; // a player's own program (a site) lists every open room
  const listAllPublic = cfg.list === 'all'; // only an explicit ZT_COOP_LIST=all lists every room to public askers too
  const lanMs = opts.lanAnnounceMs ?? LAN_ANNOUNCE_MS;
  const testBreak = opts.testBreak || ''; // test-only: 'mask' accepts unmasked frames, 'relay' drops relay forwarding, 'lan' ignores announcements, 'bridge' drops bridged frames
  const useTls = !!(cfg.tlsCert && cfg.tlsKey);
  if (!!cfg.tlsCert !== !!cfg.tlsKey) throw new Error('set both ZT_COOP_TLS_CERT and ZT_COOP_TLS_KEY, or neither');

  const rooms = new Map();
  const conns = new Set();
  const perIp = new Map();
  const emit = (ev, code, ip, extra = '') =>
    log(`${new Date().toISOString()} ${ev} ${code || '-'} ${ipPrefix(ip)}${extra ? ' ' + extra : ''}`);

  // ---- websocket output
  const sendFrame = (c, buf) => {
    if (c.sock.destroyed || c.sock.writableEnded) return;
    c.sock.write(buf);
    if (c.sock.writableLength > 32 * 1024 * 1024) c.sock.destroy();
  };
  const send = (c, obj) => sendFrame(c, encodeFrame(1, Buffer.from(JSON.stringify(obj))));
  const closeConn = (c, code = 1000, reason = '') => {
    if (c.closing) return;
    c.closing = true;
    const r = Buffer.from(reason);
    const p = Buffer.alloc(2 + r.length); p.writeUInt16BE(code, 0); r.copy(p, 2);
    if (!c.sock.destroyed && !c.sock.writableEnded) { c.sock.write(encodeFrame(8, p)); c.sock.end(); }
    // keep reading (discarding) until the peer closes: avoids an RST eating the close frame
    const t = setTimeout(() => c.sock.destroy(), 2000); t.unref();
    c.sock.once('close', () => clearTimeout(t));
  };
  const fail = (c, reason, code = 1000) => {
    send(c, { t: 'error', reason });
    emit('error', c.room && c.room.code, c.ip, `reason=${reason}`);
    closeConn(c, code, reason);
  };

  // ---- rooms
  const armIdle = (room) => {
    clearTimeout(room.idle);
    if (room.seats[1]) return;
    room.idle = setTimeout(() => { const s0 = room.seats[0]; if (s0) { closeConn(s0, 1001, 'idle'); leaveRoom(s0, 'closed'); } }, idleRoomMs);
    room.idle.unref();
  };
  function leaveRoom(c, peerReason) {
    const room = c.room;
    if (!room) return;
    c.room = null;
    if (c.seat === 0) {
      clearTimeout(room.idle);
      rooms.delete(room.code);
      const p = room.seats[1];
      if (p) { p.room = null; send(p, { t: 'peer_left', reason: peerReason }); closeConn(p, 1000, 'room closed'); }
      room.seats[0] = room.seats[1] = null;
      emit('room_close', room.code, c.ip);
    } else {
      room.seats[1] = null;
      const p = room.seats[0];
      if (p) send(p, { t: 'peer_left', reason: peerReason });
      emit('leave', room.code, c.ip);
      armIdle(room);
    }
  }

  const ownUrls = () => {
    const out = [];
    for (const [name, list] of Object.entries(os.networkInterfaces())) {
      if (VIRTUAL_IF.test(name)) continue;
      for (const i of list || []) if (!i.internal && (i.family === 'IPv4' || i.family === 4)) out.push(`${useTls ? 'https' : 'http'}://${i.address}:${port}/`);
    }
    return out;
  };

  // ---- LAN: other servers' announcements (id -> {at, address, name, port, rooms})
  const lanSeen = new Map();
  const lanServers = () => {
    const now = Date.now();
    for (const [id, v] of lanSeen) if (now - v.at > 3 * LAN_ANNOUNCE_MS) lanSeen.delete(id);
    return [...lanSeen.values()];
  };
  const lanFind = (code) => {
    for (const v of lanServers()) if (v.rooms.some((r) => r.code.toUpperCase() === code)) return v;
    return null;
  };
  // A player's own program lists every open room, and the rooms its LAN announces, to askers on a private network
  // (the LAN, this computer) only; an asker from a public address (a port-forwarded host reached over the internet)
  // sees the same-network rooms only, so it cannot read the host's room codes off the list: it types the code.
  const roomList = (c) => {
    const now = Date.now();
    const asker = opts.askerIp || c.ip; // opts.askerIp: test hook, inert unset
    const local = isPrivateIp(asker);
    const own = [...rooms.values()]
      .filter((r) => !r.seats[1] && r.seats[0] && ((listAll && (local || listAllPublic)) || sameNetwork(r.seats[0].ip, asker)))
      .sort((x, y) => y.created - x.created)
      .map((r) => ({ code: r.code, where: '', age_s: Math.floor((now - r.created) / 1000) }));
    const far = [];
    if (local) {
      for (const v of lanServers()) {
        for (const r of v.rooms) far.push({ code: r.code, where: v.name || v.address, age_s: r.age_s + Math.floor((now - v.at) / 1000) });
      }
    }
    return own.concat(far).slice(0, ROOM_LIST_MAX);
  };

  // ---- a join across servers: a WebSocket client to the other server, frames forwarded unchanged
  function dropBridge(c) {
    const b = c.bridge;
    if (!b || b.dead) return;
    b.dead = true;
    try {
      if (b.ready && !b.sock.destroyed) { b.sock.write(encodeFrame(8, Buffer.from([0x03, 0xe8]), { mask: true })); b.sock.end(); }
      const t = setTimeout(() => b.sock.destroy(), 1000); t.unref();
      b.sock.once('close', () => clearTimeout(t));
    } catch {}
    if (!b.ready) try { b.sock.destroy(); } catch {}
  }
  function openBridge(c, text, ann) {
    const b = { sock: null, ready: false, dead: false, queue: [text], frag: [], parser: new FrameParser({ maxPayload: MAX_FRAME }) };
    c.bridge = b;
    const key = crypto.randomBytes(16).toString('base64');
    const s = net.connect({ host: ann.address, port: ann.port });
    b.sock = s;
    s.on('error', () => {});
    let head = Buffer.alloc(0);
    const giveUp = () => {
      clearTimeout(timer);
      if (b.dead) return;
      b.dead = true;
      try { s.destroy(); } catch {}
      if (!b.ready) fail(c, 'no_room'); else closeConn(c, 1000, 'peer closed');
    };
    const timer = setTimeout(giveUp, 5000);
    timer.unref();
    const onFrames = (frames) => {
      for (const f of frames) {
        if (f.opcode === 9) { s.write(encodeFrame(10, f.payload, { mask: true })); continue; }
        if (f.opcode === 10) continue;
        if (f.opcode === 8) { b.dead = true; s.destroy(); closeConn(c, 1000, 'peer closed'); return; }
        if (f.opcode === 2) continue;
        b.frag.push(f.payload);
        if (!f.fin) continue;
        const whole = Buffer.concat(b.frag); b.frag = [];
        if (testBreak === 'bridge') continue;
        sendFrame(c, encodeFrame(1, whole));
      }
    };
    s.on('connect', () => {
      s.setNoDelay(true);
      s.write(`GET ${SERVER_PATH} HTTP/1.1\r\nHost: ${ann.address}:${ann.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    s.on('data', (d) => {
      if (b.dead) return;
      try {
        if (!b.ready) {
          head = Buffer.concat([head, d]);
          const i = head.indexOf('\r\n\r\n');
          if (i < 0) { if (head.length > 8192) giveUp(); return; }
          const lines = head.subarray(0, i).toString().split('\r\n');
          const acc = /sec-websocket-accept:\s*(\S+)/i.exec(lines.join('\n'));
          const want = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
          if (parseInt(lines[0].split(' ')[1], 10) !== 101 || !acc || acc[1] !== want) return giveUp();
          clearTimeout(timer);
          b.ready = true;
          d = head.subarray(i + 4);
          for (const q of b.queue.splice(0)) s.write(encodeFrame(1, Buffer.from(q), { mask: true }));
          if (!d.length) return;
        }
        onFrames(b.parser.push(d));
      } catch { giveUp(); }
    });
    s.on('close', giveUp);
  }

  function handle(c, text) {
    if (c.bridge) { // a page joined across servers: everything goes to the other server unchanged
      const b = c.bridge;
      if (b.dead || testBreak === 'bridge') return;
      if (b.ready) b.sock.write(encodeFrame(1, Buffer.from(text), { mask: true })); else b.queue.push(text);
      return;
    }
    let o;
    try { o = JSON.parse(text); } catch { return fail(c, 'bad_message'); }
    if (!o || typeof o !== 'object' || Array.isArray(o) || typeof o.t !== 'string') return fail(c, 'bad_message');
    switch (o.t) {
      case 'host': {
        if (c.room || c.dead) return fail(c, 'bad_message');
        if (o.proto === undefined) return fail(c, 'bad_message');
        if (o.proto !== 1) return fail(c, 'proto');
        if (rooms.size >= cfg.maxRooms) return fail(c, 'server_full');
        let code;
        do code = generateRoomCode(); while (rooms.has(code));
        const room = { code, seats: [c, null], idle: null, created: Date.now() };
        rooms.set(code, room); c.room = room; c.seat = 0;
        armIdle(room);
        const ans = { t: 'room', code, seat: 0 };
        if (cfg.site) ans.urls = ownUrls(); // a player's own program names the addresses a partner opens
        send(c, ans);
        emit('room_open', code, c.ip);
        return;
      }
      case 'join': {
        if (c.room || c.dead) return fail(c, 'bad_message');
        if (o.proto === undefined || typeof o.code !== 'string') return fail(c, 'bad_message');
        if (o.proto !== 1) return fail(c, 'proto');
        const room = rooms.get(o.code.toUpperCase());
        if (!room) {
          const ann = cfg.lan && testBreak !== 'lan' ? lanFind(o.code.toUpperCase()) : null;
          if (!ann) return fail(c, 'no_room');
          emit('bridge', o.code.toUpperCase(), c.ip);
          return openBridge(c, text, ann);
        }
        if (room.seats[1]) return fail(c, 'room_full');
        room.seats[1] = c; c.room = room; c.seat = 1;
        clearTimeout(room.idle);
        send(c, { t: 'joined', code: room.code, seat: 1 });
        send(room.seats[0], { t: 'peer', seat: 1 });
        emit('join', room.code, c.ip);
        return;
      }
      case 'signal':
      case 'relay': {
        if (!c.room) return fail(c, 'bad_message');
        let out;
        if (o.t === 'signal') {
          if (!('data' in o)) return fail(c, 'bad_message');
          out = { t: 'signal', data: o.data };
        } else {
          if ((o.ch !== 'r' && o.ch !== 'u') || typeof o.data !== 'string') return fail(c, 'bad_message');
          if (o.data.length > MAX_FRAME) return fail(c, 'too_big', 1009);
          if (testBreak === 'relay') return;
          out = { t: 'relay', ch: o.ch, data: o.data };
        }
        const p = c.room.seats[1 - c.seat];
        if (p) send(p, out); // no peer yet: dropped
        return;
      }
      case 'rooms':
        send(c, { t: 'rooms', rooms: roomList(c) });
        return;
      case 'leave':
        leaveRoom(c, 'leave');
        return closeConn(c, 1000, 'leave');
      default:
        return fail(c, 'bad_message');
    }
  }

  // ---- connection lifecycle
  function onFrames(c, frames) {
    for (const f of frames) {
      if (c.closing) return;
      c.lastSeen = Date.now();
      if (f.opcode === 9) { sendFrame(c, encodeFrame(10, f.payload)); continue; }
      if (f.opcode === 10) continue;
      if (f.opcode === 8) {
        const code = f.payload.length >= 2 ? f.payload.readUInt16BE(0) : 1000;
        leaveRoom(c, 'closed'); dropBridge(c);
        return closeConn(c, f.payload.length === 1 ? 1002 : code === 1005 ? 1000 : code);
      }
      if (f.opcode === 0) {
        if (!c.frag) throw new ProtoError(1002, 'unexpected continuation');
      } else if (c.frag) throw new ProtoError(1002, 'new data frame inside a fragmented message');
      else if (f.opcode === 2) return fail(c, 'bad_message'); // binary frames are not part of the protocol
      else c.frag = { parts: [], size: 0 };
      c.frag.parts.push(f.payload); c.frag.size += f.payload.length;
      if (c.frag.size > MAX_FRAME) throw new ProtoError(1009, 'message too big', true);
      if (!f.fin) continue;
      const whole = Buffer.concat(c.frag.parts); c.frag = null;
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(whole); }
      catch { return closeConn(c, 1007, 'bad utf-8'); }
      const now = Date.now();
      if (now - c.winStart >= 1000) { c.winStart = now; c.winCount = 0; c.winWarned = false; }
      if (++c.winCount > 300) {
        if (!c.winWarned) { c.winWarned = true; send(c, { t: 'error', reason: 'rate' }); emit('error', c.room && c.room.code, c.ip, 'reason=rate'); }
        continue;
      }
      handle(c, text);
    }
  }

  function onUpgrade(req, sock, head) {
    clearTimeout(sock._hs);
    sock.setTimeout(0); sock.setNoDelay(true);
    sock.on('error', () => {});
    const u = (req.url || '').split('?')[0];
    const deny = (status, text, extra = '') => {
      sock.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n${extra}\r\n`);
    };
    if (u !== SERVER_PATH) return deny(404, 'Not Found');
    const key = req.headers['sec-websocket-key'];
    if (req.method !== 'GET' || String(req.headers.upgrade).toLowerCase() !== 'websocket' || !key ||
        Buffer.from(key, 'base64').length !== 16) return deny(400, 'Bad Request');
    if (req.headers['sec-websocket-version'] !== '13') return deny(426, 'Upgrade Required', 'Sec-WebSocket-Version: 13\r\n');
    const origin = req.headers.origin;
    if (cfg.origins.length && origin !== undefined && !cfg.origins.includes(origin)) return deny(403, 'Forbidden');
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);

    const ip = normalizeIp(sock.remoteAddress);
    const c = {
      sock, ip, room: null, seat: null, closing: false, frag: null, lastSeen: Date.now(),
      winStart: Date.now(), winCount: 0, winWarned: false,
      parser: new FrameParser({ maxPayload: MAX_FRAME, requireMask: testBreak !== 'mask' }),
    };
    conns.add(c);
    const n = (perIp.get(ip) || 0) + 1; perIp.set(ip, n);
    sock.on('close', () => {
      conns.delete(c);
      const k = (perIp.get(ip) || 1) - 1; if (k) perIp.set(ip, k); else perIp.delete(ip);
      leaveRoom(c, 'closed'); dropBridge(c);
    });
    const onData = (chunk) => {
      if (c.closing) return; // discard
      try { onFrames(c, c.parser.push(chunk)); }
      catch (e) {
        if (!(e instanceof ProtoError)) throw e;
        if (e.tooBig) fail(c, 'too_big', 1009);
        else { leaveRoom(c, 'closed'); dropBridge(c); closeConn(c, e.code, e.message); }
      }
    };
    sock.on('data', onData);
    sock.on('end', () => { leaveRoom(c, 'closed'); dropBridge(c); if (!c.closing) closeConn(c); });
    if (n > cfg.maxPerIp) { fail(c, 'server_full', 1013); return; }
    if (head && head.length) onData(head);
  }

  const romFile = cfg.rom ? path.resolve(cfg.rom) : null;
  if (romFile && !fs.statSync(romFile).isFile()) throw new Error('rom is not a file');
  let siteRoot = null;
  if (cfg.site) {
    siteRoot = fs.realpathSync(path.resolve(cfg.site));
    if (!fs.statSync(siteRoot).isDirectory()) throw new Error('site is not a directory');
  }
  const onRequest = (req, res) => {
    // the handshake timer only guards a connection that never sends a request; a download may take longer (a slow
    // link, a slow client): from here Node's own keep-alive and request timeouts apply
    clearTimeout(req.socket._hs);
    const u = (req.url || '').split('?')[0];
    const send_ = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(body), Connection: 'close' });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (u === '/health' && (req.method === 'GET' || req.method === 'HEAD')) return send_(200, 'ok');
    if (u === ROM_PATH && romFile && (req.method === 'GET' || req.method === 'HEAD') && romServedTo(req.socket.remoteAddress)) {
      try {
        const st = fs.statSync(romFile);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
        if (req.method === 'HEAD') return res.end();
        const rs = fs.createReadStream(romFile);
        rs.on('error', () => res.destroy());
        return rs.pipe(res);
      } catch { return send_(404, 'not found'); }
    }
    if (u === SERVER_PATH) return send_(426, 'websocket required');
    if (!siteRoot) return send_(404, 'not found');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send_(405, 'method not allowed');
    let rel;
    try { rel = decodeURIComponent(u); } catch { return send_(400, 'bad request'); }
    if (rel.includes('\0')) return send_(400, 'bad request');
    const inside = (f) => f === siteRoot || f.startsWith(siteRoot + path.sep);
    let file = path.resolve(siteRoot, '.' + (rel.startsWith('/') ? rel : '/' + rel));
    if (!inside(file)) return send_(403, 'forbidden');
    try {
      let st = fs.statSync(file);
      if (st.isDirectory()) { file = path.join(file, 'index.html'); st = fs.statSync(file); }
      if (!st.isFile()) return send_(404, 'not found');
      if (!inside(fs.realpathSync(file))) return send_(403, 'forbidden');
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': st.size, 'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') return res.end();
      const rs = fs.createReadStream(file);
      rs.on('error', () => res.destroy());
      rs.pipe(res);
    } catch { send_(404, 'not found'); }
  };

  const readTls = () => ({ cert: fs.readFileSync(cfg.tlsCert), key: fs.readFileSync(cfg.tlsKey) });
  const server = useTls ? https.createServer(readTls(), onRequest) : http.createServer(onRequest);
  server.on('upgrade', onUpgrade);
  server.on('clientError', (e, s) => s.destroy());
  server.on('tlsClientError', () => {});
  server.on('connection', (s) => {
    s.on('error', () => {});
    s._hs = setTimeout(() => s.destroy(), handshakeMs);
    s.once('close', () => clearTimeout(s._hs));
  });
  const reloadTls = () => {
    if (!useTls) return false;
    try { server.setSecureContext(readTls()); log(`${new Date().toISOString()} tls_reload ok`); return true; }
    catch (e) { log(`${new Date().toISOString()} tls_reload failed (${e.code || e.message}); keeping the old certificate`); return false; }
  };

  const listen = (host) => new Promise((res, rej) => {
    const onErr = (e) => rej(e);
    server.once('error', onErr);
    server.listen({ port: cfg.port, host }, () => { server.off('error', onErr); res(); });
  });
  let bindUsed;
  if (cfg.bind) { await listen(cfg.bind); bindUsed = cfg.bind; }
  else {
    try { await listen('::'); bindUsed = '::'; } catch { await listen('0.0.0.0'); bindUsed = '0.0.0.0'; }
  }
  const port = server.address().port;

  // ---- STUN
  const udps = [];
  let stunPort = 0;
  if (cfg.stunPort !== 0) {
    stunPort = cfg.stunPort === 'same' ? port : cfg.stunPort;
    const mk = (type, addr) => new Promise((res) => {
      const s = dgram.createSocket({ type, ipv6Only: false });
      s.on('error', () => { try { s.close(); } catch {} res(null); });
      s.on('message', (msg, rinfo) => {
        const r = parseBindingRequest(msg);
        if (r) s.send(buildBindingResponse(r.tid, rinfo.address, rinfo.port), rinfo.port, rinfo.address, () => {});
      });
      s.bind({ port: stunPort, address: addr }, () => { stunPort = s.address().port; res(s); });
    });
    const addrs = bindUsed === '::' ? [['udp6', '::']] : [[net.isIPv6(bindUsed) ? 'udp6' : 'udp4', bindUsed]];
    for (const [t, a] of addrs) { const s = await mk(t, a); if (s) udps.push(s); }
    if (bindUsed === '::' && !udps.length) { const s = await mk('udp4', '0.0.0.0'); if (s) udps.push(s); }
    if (!udps.length) stunPort = 0;
  }

  // ---- LAN announcements
  let lanSock = null, lanTimer = null, lanId = '';
  if (cfg.lan) {
    lanId = crypto.randomBytes(8).toString('hex');
    const targets = () => {
      if (cfg.lanTargets) {
        return cfg.lanTargets.map((t) => {
          const m = /^(.*?)(?::(\d+))?$/.exec(t);
          return { address: m[1], port: m[2] ? parseInt(m[2], 10) : cfg.lanPort };
        });
      }
      const out = [];
      for (const [name, list] of Object.entries(os.networkInterfaces())) {
        if (VIRTUAL_IF.test(name)) continue;
        for (const i of list || []) {
          if (i.internal || (i.family !== 'IPv4' && i.family !== 4)) continue;
          const a = i.address.split('.').map(Number), m = i.netmask.split('.').map(Number);
          out.push({ address: a.map((x, k) => (x | (~m[k] & 255))).join('.'), port: cfg.lanPort });
        }
      }
      return out;
    };
    const announce = () => {
      const now = Date.now();
      const body = Buffer.from(JSON.stringify({
        t: 'zt-coop', proto: 1, id: lanId, name: os.hostname(), port,
        rooms: [...rooms.values()].filter((r) => !r.seats[1]).map((r) => ({ code: r.code, age_s: Math.floor((now - r.created) / 1000) })),
      }));
      for (const t of targets()) { try { lanSock.send(body, t.port, t.address, () => {}); } catch {} }
    };
    try {
      lanSock = await new Promise((res, rej) => {
        const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        s.once('error', rej);
        s.on('message', (msg, rinfo) => {
          if (testBreak === 'lan') return;
          let o;
          try { o = JSON.parse(msg.toString()); } catch { return; }
          if (!o || o.t !== 'zt-coop' || typeof o.id !== 'string' || o.id === lanId) return;
          if (!Number.isInteger(o.port) || o.port < 1 || o.port > 65535 || !Array.isArray(o.rooms)) return;
          const rs = o.rooms.filter((r) => r && typeof r.code === 'string' && r.code.length <= 16)
            .map((r) => ({ code: r.code, age_s: Number.isFinite(r.age_s) ? Math.max(0, Math.floor(r.age_s)) : 0 })).slice(0, ROOM_LIST_MAX);
          lanSeen.set(o.id, { at: Date.now(), address: normalizeIp(rinfo.address), name: typeof o.name === 'string' ? o.name.slice(0, 64) : '', port: o.port, rooms: rs });
        });
        s.bind({ port: cfg.lanPort, address: '0.0.0.0' }, () => { s.off('error', rej); s.on('error', () => {}); try { s.setBroadcast(true); } catch {} res(s); });
      });
      announce();
      lanTimer = setInterval(announce, lanMs);
      lanTimer.unref();
    } catch (e) { log(`${new Date().toISOString()} lan_off (${e.code || e.message})`); lanSock = null; }
  }

  // ---- liveness
  const tick = setInterval(() => {
    const now = Date.now();
    for (const c of conns) {
      if (c.closing) continue;
      if (now - c.lastSeen >= deadMs) { leaveRoom(c, 'timeout'); closeConn(c, 1001, 'timeout'); }
      else sendFrame(c, encodeFrame(9));
    }
  }, pingMs);
  tick.unref();

  const close = () => new Promise((res) => {
    clearInterval(tick); clearInterval(lanTimer);
    for (const c of conns) dropBridge(c);
    if (lanSock) try { lanSock.close(); } catch {}
    for (const c of [...conns]) { leaveRoom(c, 'closed'); closeConn(c, 1001, 'going away'); }
    for (const s of udps) try { s.close(); } catch {}
    const t = setTimeout(() => { for (const c of conns) c.sock.destroy(); res(); }, 500);
    server.close(() => { clearTimeout(t); res(); });
    server.closeAllConnections?.();
  });

  return { port, stunPort, lan: !!lanSock, lanId, lanSeen, tls: useTls, bind: bindUsed, rooms, conns, server, reloadTls, close, config: cfg };
}

// ---------------------------------------------------------------- main

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  let cfg;
  try {
    cfg = loadConfig();
    const av = process.argv.slice(2);
    for (let i = 0; i < av.length; i++) {
      if (av[i] === '--site' && av[i + 1]) cfg.site = av[++i];
      else if (av[i] === '--port' && av[i + 1]) { cfg.port = parseInt(av[++i], 10); if (!Number.isInteger(cfg.port) || cfg.port < 0) throw new Error('bad --port'); }
      else throw new Error(`unknown argument ${av[i]}`);
    }
  } catch (e) { console.error(`config: ${e.message}`); process.exit(2); }
  startServer(cfg).then((s) => {
    console.log(`${new Date().toISOString()} listening ${s.tls ? 'wss' : 'ws'} tcp/${s.port} on ${s.bind}, stun udp/${s.stunPort || 'off'}`);
    process.on('SIGHUP', () => s.reloadTls());
    const stop = async () => { await s.close(); process.exit(0); };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  }).catch((e) => { console.error(`start failed: ${e.message}`); process.exit(1); });
}

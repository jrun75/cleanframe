#!/usr/bin/env node
/* CleanFrame upload relay. Runs on a Mac on the same Wi-Fi as the TV.
   The TV asks for a one time code and shows it as a QR code. The iPhone opens the
   upload page, prepares the photo, and posts it here. The TV then downloads its
   own copy, so wallpapers keep working when this Mac is asleep.
   No dependencies: run with `node relay/server.js`. */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 4796;
const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app');
const PHONE = path.join(__dirname, 'phone');
const DATA = process.env.CLEANFRAME_DATA || path.join(__dirname, 'data');
const SESSION_MS = 15 * 60 * 1000;
const MAX_BODY = 40 * 1024 * 1024;
const KINDS = ['photo', 'thumb', 'panel', 'study-soft', 'field-clear', 'field-blur', 'field-frost'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const sessions = new Map();
fs.mkdirSync(DATA, { recursive: true });

function lanAddress() {
  if (process.env.CLEANFRAME_HOST) return process.env.CLEANFRAME_HOST;
  const nets = os.networkInterfaces();
  const order = ['en0', 'en1', 'eth0', 'wlan0'].concat(Object.keys(nets));
  for (const name of order) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}
const PUBLIC = 'http://' + lanAddress() + ':' + PORT;

function newCode() {
  let code;
  do {
    code = Array.from(crypto.randomBytes(6), b => ALPHABET[b % ALPHABET.length]).join('');
  } while (sessions.has(code));
  return code;
}
function sweep() {
  const now = Date.now();
  for (const [code, s] of sessions) if (now - s.created > SESSION_MS * 2) sessions.delete(code);
}
setInterval(sweep, 60 * 1000).unref();

function session(code) {
  const s = sessions.get(String(code || '').toUpperCase());
  if (!s) return null;
  if (s.state !== 'ready' && Date.now() - s.created > SESSION_MS) s.state = 'expired';
  return s;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

function send(res, status, body, type, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': type || 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' }, extra || {}));
  res.end(body);
}
function json(res, status, value) { send(res, status, JSON.stringify(value)); }
function file(res, base, rel) {
  const target = path.resolve(base, '.' + path.posix.normalize('/' + rel));
  if (!target.startsWith(base + path.sep) && target !== base) return send(res, 403, 'Forbidden', 'text/plain');
  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(target).pipe(res);
  });
}
function body(req) {
  return new Promise((done, fail) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { fail(new Error('Photo is too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { done(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { fail(new Error('Unreadable upload')); } });
    req.on('error', fail);
  });
}
function wallpaperInfo(id) {
  const meta = JSON.parse(fs.readFileSync(path.join(DATA, id, 'meta.json'), 'utf8'));
  const files = {};
  KINDS.forEach(k => { files[k] = '/api/wallpapers/' + id + '/' + k + '.jpg'; });
  return Object.assign(meta, { files });
}

async function api(req, res, parts) {
  // POST /api/sessions
  if (parts.length === 1 && parts[0] === 'sessions' && req.method === 'POST') {
    sweep();
    const code = newCode();
    sessions.set(code, { code, created: Date.now(), state: 'waiting', wallpaper: null });
    return json(res, 200, { code, url: PUBLIC + '/u/' + code, expiresIn: SESSION_MS });
  }
  // /api/sessions/:code[/state|/upload]
  if (parts[0] === 'sessions' && parts[1]) {
    const s = session(parts[1]);
    if (!s) return json(res, 404, { error: 'This code is not valid. Choose Upload on the TV again.' });
    if (parts.length === 2 && req.method === 'GET') {
      return json(res, 200, { state: s.state, wallpaper: s.wallpaper ? wallpaperInfo(s.wallpaper) : null });
    }
    if (s.state === 'expired') return json(res, 410, { error: 'This code expired. Choose Upload on the TV again.' });
    if (parts[2] === 'state' && req.method === 'POST') {
      const next = (await body(req)).state;
      if (['connected', 'receiving'].includes(next) && s.state !== 'ready') s.state = next;
      return json(res, 200, { state: s.state });
    }
    if (parts[2] === 'upload' && req.method === 'POST') {
      if (s.state === 'ready') return json(res, 409, { error: 'This code was already used. Choose Upload on the TV again.' });
      const upload = await body(req);
      const id = 'u' + Date.now().toString(36);
      const dir = path.join(DATA, id);
      fs.mkdirSync(dir, { recursive: true });
      for (const k of KINDS) {
        const value = upload.files && upload.files[k];
        if (typeof value !== 'string') return json(res, 400, { error: 'The upload was missing an image.' });
        fs.writeFileSync(path.join(dir, k + '.jpg'), Buffer.from(value.replace(/^data:[^,]*,/, ''), 'base64'));
      }
      const name = String(upload.name || 'My photo').trim().slice(0, 40) || 'My photo';
      fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ id, name, meta: upload.meta || {}, created: new Date().toISOString() }, null, 2));
      s.state = 'ready'; s.wallpaper = id;
      console.log('Received "' + name + '" for code ' + s.code);
      return json(res, 200, { ok: true, id });
    }
  }
  // GET /api/wallpapers/:id/:kind.jpg
  if (parts[0] === 'wallpapers' && parts.length === 3 && req.method === 'GET' && /^u[a-z0-9]+$/.test(parts[1])) {
    return file(res, path.join(DATA, parts[1]), parts[2]);
  }
  return json(res, 404, { error: 'Unknown request' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  const p = decodeURIComponent(url.pathname);
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (p.startsWith('/api/')) {
    return api(req, res, p.slice(5).split('/').filter(Boolean)).catch(err => json(res, 400, { error: err.message }));
  }
  if (p === '/' || p === '/tv') { res.writeHead(302, { Location: '/tv/' }); return res.end(); }
  if (p === '/tv/assets/relay.js') return send(res, 200, 'window.CleanFrameRelay = location.origin;\n', TYPES['.js']);
  if (p.startsWith('/tv/')) return file(res, APP, p.slice(4) || 'index.html');
  if (/^\/u\/[A-Za-z0-9]{6}$/.test(p)) return file(res, PHONE, 'index.html');
  if (p.startsWith('/phone/')) return file(res, PHONE, p.slice(7));
  if (p === '/prep.js') return file(res, path.join(APP, 'assets'), 'wallprep.js');
  if (p === '/manrope.woff2') return file(res, path.join(APP, 'assets'), 'manrope.woff2');
  send(res, 404, 'Not found', 'text/plain');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('CleanFrame upload relay is running.');
  console.log('  Browser preview of the TV app: ' + PUBLIC + '/tv/');
  console.log('  Relay address for the TV build: ' + PUBLIC);
  console.log('  Photos are kept in ' + DATA);
});

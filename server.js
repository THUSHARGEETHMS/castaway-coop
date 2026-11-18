'use strict';
/* Castaway Co-op server
   - Express serves the client, Socket.IO handles realtime
   - One "room" = one island. Joined with a code (+ optional password).
   - Room state is saved to DATA_DIR/<CODE>.json so progress resumes on rejoin. */
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const W = require('./public/js/world.js');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TEST = process.env.CASTAWAY_TEST === '1';
fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true }, maxHttpBufferSize: 1e5 });

const NM = path.join(__dirname, 'node_modules', 'three');
app.use('/vendor/three/build', express.static(path.join(NM, 'build')));
app.use('/vendor/three/addons', express.static(path.join(NM, 'examples', 'jsm')));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

/* ------------------------------------------------------------------ helpers */
const rooms = new Map();
const CODE_RE = /^ISLE-\d{4,6}$/;
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const cleanName = (s) => String(s || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 14);
const roomFile = (code) => path.join(DATA_DIR, code + '.json');

function hashPw(pw, salt) { return crypto.scryptSync(pw, salt, 32).toString('hex'); }
function makePw(pw) {
  if (!pw) return null;
  const salt = crypto.randomBytes(8).toString('hex');
  return { salt, hash: hashPw(pw, salt) };
}
function checkPw(room, pw) {
  if (!room.pw) return true;
  const a = Buffer.from(hashPw(String(pw || '').slice(0, 64), room.pw.salt), 'hex');
  const b = Buffer.from(room.pw.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const fails = new Map(); // ip -> {n, until}
function blocked(ip) { const f = fails.get(ip); return f && f.until > Date.now(); }
function recordFail(ip) {
  const f = fails.get(ip) || { n: 0, until: 0 };
  if (++f.n >= 8) { f.until = Date.now() + 60000; f.n = 0; }
  fails.set(ip, f);
}

/* -------------------------------------------------------------- persistence */
function saveRoom(room) {
  try {
    room.updatedAt = Date.now();
    const f = roomFile(room.code), tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(room, (k, v) => (k.startsWith('_') ? undefined : v)));
    fs.renameSync(tmp, f);
    room._lastSave = Date.now();
  } catch (e) { console.error('save failed', room.code, e.message); }
}

function initPlayerRuntime(p) {
  Object.assign(p, { _sid: null, _lastMove: 0, _cd: 0, _fishAt: 0, _fishX: 0, _fishZ: 0, _sleeping: false, _sprint: false, _mv: 0, _actAt: 0, _posMsg: 0, _hurtMsg: 0 });
}
function hydrate(room) {
  room._world = W.create(room.seed);
  room._online = new Map();
  room._animals = [];
  room._aid = 100000;
  room._lastSave = Date.now();
  room._t05 = 0; room._tAnimal = 0; room._emptyAt = Date.now();
  for (const p of Object.values(room.players)) initPlayerRuntime(p);
  return room;
}

function genResources(room) {
  const w = room._world, rnd = W.mulberry32(room.seed ^ 0x5bd1e995);
  const out = []; let id = 1;
  const taken = [{ x: w.spawn.x, z: w.spawn.z, r: 6 }, { x: w.pond.x, z: w.pond.z, r: w.pond.r + 2.5 }];
  function place(type, count, hmin, hmax, gap, radius) {
    let n = 0, tries = 0;
    while (n < count && tries++ < count * 80) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 58;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, h = w.height(x, z);
      if (h < hmin || h > hmax) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + gap)) continue;
      taken.push({ x, z, r: radius });
      out.push({ id: id++, t: type, x: r2(x), z: r2(z), hp: W.RES[type].hp, alive: true, respawnAt: 0 });
      n++;
    }
  }
  place('palm', 55, 0.6, 3.2, 2.2, 0.5);
  place('rock', 34, 0.4, 5.5, 2.0, 1.0);
  place('bush', 28, 1.0, 4.2, 1.6, 0.6);
  place('grass', 50, 0.7, 4.5, 1.0, 0.3);
  room.nextId = id + 1;
  return out;
}

function newRoom(code, password) {
  const room = {
    v: 1, code, pw: makePw(password), seed: crypto.randomInt(1, 2 ** 30),
    createdAt: Date.now(), updatedAt: Date.now(),
    clock: 0, tod: 8, day: 1, won: null, nextId: 1,
    players: {}, resources: [], structures: [], chest: {},
  };
  hydrate(room);
  room.resources = genResources(room);
  rooms.set(code, room);
  saveRoom(room);
  return room;
}

function getRoom(code) {
  let room = rooms.get(code);
  if (room) return room;
  const f = roomFile(code);
  if (!fs.existsSync(f)) return null;
  try { room = hydrate(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch (e) { console.error('load failed', code, e.message); return null; }
  rooms.set(code, room);
  return room;
}

function newCode() {
  for (const digits of [4, 4, 4, 6]) {
    for (let i = 0; i < 25; i++) {
      const c = 'ISLE-' + String(crypto.randomInt(0, 10 ** digits)).padStart(digits, '0');
      if (!rooms.has(c) && !fs.existsSync(roomFile(c))) return c;
    }
  }
  return 'ISLE-' + crypto.randomInt(100000, 999999);
}

// housekeeping: drop room files untouched for 90 days
for (const f of fs.readdirSync(DATA_DIR)) {
  try {
    const fp = path.join(DATA_DIR, f);
    if (f.endsWith('.json') && Date.now() - fs.statSync(fp).mtimeMs > 90 * 864e5) fs.unlinkSync(fp);
  } catch (_) { /* ignore */ }
}

/* ------------------------------------------------------------ inventory etc */
const give = (p, item, n) => { p.inv[item] = (p.inv[item] || 0) + n; };
const canAfford = (inv, cost) => Object.entries(cost).every(([k, v]) => (inv[k] || 0) >= v);
const pay = (inv, cost) => { for (const [k, v] of Object.entries(cost)) inv[k] -= v; };
const costText = (cost) => Object.entries(cost).map(([k, v]) => `${v} ${W.ITEMS[k].name.toLowerCase()}`).join(', ');
const toast = (p, t, k) => { if (p._sid) io.to(p._sid).emit('toast', { t, k: k || 'info' }); };
const emitRoom = (room, ev, data) => io.to(room.code).emit(ev, data);

function newPlayer(room, name) {
  const used = Object.values(room.players).map((q) => q.color);
  const color = [0, 1, 2, 3].find((c) => !used.includes(c)) ?? 0;
  const sp = room._world.spawn, n = Object.keys(room.players).length;
  const p = {
    id: 'p' + (n + 1), name, color,
    x: sp.x + (n ? 1.6 : -1.6), z: sp.z + 1.0, ry: 0,
    hp: 100, hunger: 85, thirst: 85, energy: 100, warmth: 90,
    inv: { wood: 0, stone: 0, fiber: 0 }, tools: { axe: false, spear: false, rod: false },
    lastSeen: Date.now(),
  };
  initPlayerRuntime(p);
  room.players[p.id] = p;
  return p;
}

const rosterOf = (room) => Object.fromEntries(Object.values(room.players).map((p) =>
  [p.id, { name: p.name, color: p.color, online: !!p._sid }]));
const meOf = (p) => ({
  hp: r1(p.hp), hunger: r1(p.hunger), thirst: r1(p.thirst), energy: r1(p.energy), warmth: r1(p.warmth),
  inv: p.inv, tools: p.tools, sleeping: !!p._sleeping, fishing: !!p._fishAt,
});
const sendMe = (p) => { if (p._sid) io.to(p._sid).emit('me', meOf(p)); };
const structOut = (s) => ({ id: s.id, type: s.type, x: s.x, z: s.z, ry: s.ry, lit: s.type === 'campfire' ? s.fuel > 0 : undefined, by: s.by });

function buildInit(room, p) {
  return {
    code: room.code, you: p.id, seed: room.seed, tod: room.tod, day: room.day, won: room.won,
    roster: rosterOf(room),
    players: Object.values(room.players).map((q) => [q.id, r2(q.x), r2(q.z), r2(q.ry)]),
    resources: room.resources.map((r) => [r.id, r.t, r.x, r.z, r.hp, r.alive ? 1 : 0]),
    structures: room.structures.map(structOut),
    animals: room._animals.map((a) => [a.id, a.type, r2(a.x), r2(a.z), r2(a.ry)]),
    chest: room.chest, me: meOf(p),
  };
}

/* ------------------------------------------------------------------ attach */
function attach(socket, room, p, isNew) {
  p._sid = socket.id; p.lastSeen = Date.now();
  room._online.set(socket.id, p.id);
  socket.join(room.code);
  socket.data.code = room.code; socket.data.pid = p.id;
  socket.emit('init', buildInit(room, p));
  emitRoom(room, 'roster', rosterOf(room));
  socket.to(room.code).emit('toast', { t: `${p.name} ${isNew ? 'joined the island' : 'is back'}`, k: 'good' });
  saveRoom(room);
}
function detach(socket) {
  const room = rooms.get(socket.data.code); if (!room) return;
  const p = room.players[socket.data.pid];
  room._online.delete(socket.id);
  if (p && p._sid === socket.id) { p._sid = null; p._sleeping = false; p._fishAt = 0; p.lastSeen = Date.now(); }
  if (!room._online.size) room._emptyAt = Date.now();
  saveRoom(room);
  emitRoom(room, 'roster', rosterOf(room));
  if (p) emitRoom(room, 'toast', { t: `${p.name} left`, k: 'info' });
}
function ctx(socket) {
  const room = rooms.get(socket.data.code); if (!room) return null;
  const p = room.players[socket.data.pid]; if (!p || p._sid !== socket.id) return null;
  return { room, p };
}
const clientIp = (s) => String(s.handshake.headers['x-forwarded-for'] || s.handshake.address || '').split(',')[0].trim();

/* ---------------------------------------------------------------- sockets */
io.on('connection', (socket) => {
  let evCount = 0;
  const rl = setInterval(() => { evCount = 0; }, 1000);
  socket.use((_pkt, next) => { if (++evCount > 120) { socket.disconnect(true); return; } next(); });

  socket.on('create', (d, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    if (socket.data.code) return ack({ ok: false, error: 'Already in a room' });
    const name = cleanName(d && d.name);
    if (!name) return ack({ ok: false, error: 'Enter your name first' });
    const pw = d && d.password ? String(d.password).slice(0, 32) : '';
    const room = newRoom(newCode(), pw);
    const p = newPlayer(room, name);
    attach(socket, room, p, true);
    ack({ ok: true, code: room.code, hasPassword: !!room.pw });
  });

  socket.on('join', (d, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    const ip = clientIp(socket);
    if (socket.data.code) return ack({ ok: false, error: 'Already in a room' });
    if (blocked(ip)) return ack({ ok: false, error: 'Too many wrong attempts. Wait a minute and try again.' });
    const code = String(d && d.code || '').trim().toUpperCase().replace(/\s+/g, '');
    const fullCode = /^\d{4,6}$/.test(code) ? 'ISLE-' + code : code;
    const name = cleanName(d && d.name);
    if (!name) return ack({ ok: false, error: 'Enter your name first' });
    if (!CODE_RE.test(fullCode)) { recordFail(ip); return ack({ ok: false, error: 'Invalid island code (looks like ISLE-4821)' }); }
    const room = getRoom(fullCode);
    if (!room) { recordFail(ip); return ack({ ok: false, error: 'Island not found. Check the code.' }); }
    if (!checkPw(room, d && d.password)) { recordFail(ip); return ack({ ok: false, error: room.pw && !(d && d.password) ? 'This island needs a password' : 'Wrong password' }); }
    fails.delete(ip);
    const existing = Object.values(room.players).find((q) => q.name.toLowerCase() === name.toLowerCase());
    let p, isNew = false;
    if (existing) {
      if (existing._sid) return ack({ ok: false, error: `${existing.name} is already online on this island` });
      p = existing;
    } else if (Object.keys(room.players).length >= W.MAX_PLAYERS) {
      const names = Object.values(room.players).map((q) => q.name).join(' or ');
      return ack({ ok: false, error: `Island is full. To continue your game, join with your original name (${names}).` });
    } else { p = newPlayer(room, name); isNew = true; }
    attach(socket, room, p, isNew);
    ack({ ok: true, code: room.code, hasPassword: !!room.pw, resumed: !isNew });
  });

  socket.on('move', (d) => {
    const c = ctx(socket); if (!c || !d) return;
    const { room, p } = c, now = Date.now();
    if (p._sleeping) return;
    const x = num(d.x, NaN), z = num(d.z, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const dt = clamp((now - p._lastMove) / 1000, 0.02, 1);
    p._lastMove = now;
    const w = room._world;
    const maxd = (d.sp ? 8 : 5.4) * dt * 1.7 + 0.7;
    if (Math.hypot(x - p.x, z - p.z) > maxd || !w.walkable(x, z)) {
      if (now - p._posMsg > 200) { p._posMsg = now; socket.emit('pos', { x: p.x, z: p.z }); }
      return;
    }
    if (p._fishAt && Math.hypot(x - p._fishX, z - p._fishZ) > 0.8) { p._fishAt = 0; toast(p, 'You stopped fishing'); sendMe(p); }
    p.x = x; p.z = z; p.ry = num(d.ry, p.ry); p._mv = d.mv ? 1 : 0; p._sprint = !!d.sp && !!d.mv;
  });

  socket.on('use', (d) => {
    const c = ctx(socket); if (!c || !d) return;
    const { room, p } = c, now = Date.now();
    if (p._sleeping || now - p._cd < 400) return;
    const w = room._world;

    if (d.kind === 'res') {
      const r = room.resources.find((q) => q.id === d.id);
      if (!r || !r.alive || dist(p, r) > 4.2) return;
      p._cd = now; p._actAt = now;
      const axe = p.tools.axe;
      r.hp -= r.t === 'palm' ? (axe ? 3 : 1) : r.t === 'rock' ? (axe ? 2 : 1) : 1;
      if (r.hp <= 0) {
        r.hp = 0; r.alive = false; r.respawnAt = room.clock + W.RES[r.t].respawn;
        const got = [];
        const add = (item, n) => { give(p, item, n); got.push(`+${n} ${W.ITEMS[item].name}`); };
        if (r.t === 'palm') { add('wood', axe ? 3 : 2); if (Math.random() < 0.4) add('coconut', 1); }
        else if (r.t === 'rock') add('stone', axe ? 3 : 2);
        else if (r.t === 'bush') { add('berry', 2 + (Math.random() < 0.5 ? 1 : 0)); add('fiber', 1); }
        else add('fiber', 1);
        toast(p, got.join('  '), 'good'); sendMe(p);
      }
      emitRoom(room, 'res', { id: r.id, hp: r.hp, alive: r.alive, hit: true });
    } else if (d.kind === 'animal') {
      const a = room._animals.find((q) => q.id === d.id);
      if (!a || dist(p, a) > (p.tools.spear ? 4.6 : 3.4)) return;
      p._cd = now; p._actAt = now;
      a.hp -= p.tools.spear ? 4 : p.tools.axe ? 2 : 1;
      a.hit = 0.25;
      if (a.type === 'boar') a.agro = true;
      if (a.hp <= 0) {
        room._animals.splice(room._animals.indexOf(a), 1);
        const n = W.ANIMALS[a.type].meat; give(p, 'rawMeat', n);
        toast(p, `+${n} Raw meat`, 'good'); sendMe(p);
      }
    } else if (d.kind === 'pond') {
      if (!w.nearPond(p.x, p.z, 2.6)) return;
      p._cd = now + 400; p._actAt = now;
      p.thirst = Math.min(100, p.thirst + 28);
      toast(p, 'You drink fresh water 💧', 'good'); sendMe(p);
    } else if (d.kind === 'struct') {
      const s = room.structures.find((q) => q.id === d.id);
      if (!s || dist(p, s) > 4.2) return;
      p._cd = now;
      if (s.type === 'campfire') {
        const raw = ['rawMeat', 'rawFish'].find((k) => (p.inv[k] || 0) > 0);
        if (s.fuel <= 0) {
          if ((p.inv.wood || 0) < 1) return toast(p, 'Fire is out. You need wood to light it', 'warn');
          p.inv.wood--; s.fuel = 90; emitRoom(room, 'struct', structOut(s)); toast(p, 'You light the fire 🔥', 'good');
        } else if (raw) {
          p.inv[raw]--; give(p, W.RAW_TO_COOKED[raw], 1);
          toast(p, `Cooked ${W.ITEMS[raw].name.toLowerCase()} → ${W.ITEMS[W.RAW_TO_COOKED[raw]].name.toLowerCase()}`, 'good');
        } else if ((p.inv.wood || 0) > 0 && s.fuel < 200) {
          p.inv.wood--; s.fuel += 90; toast(p, 'Added wood to the fire', 'good');
        } else toast(p, s.fuel >= 200 ? 'The fire is burning strongly' : 'Nothing to cook. Need raw meat or fish', 'info');
        sendMe(p);
      } else if (s.type === 'storage') {
        socket.emit('chest', { open: true, chest: room.chest });
      } else if (s.type === 'hut') {
        if (!(W.isNight(room.tod))) return toast(p, 'You can only sleep at night 🌙', 'info');
        p._sleeping = true; p._fishAt = 0;
        toast(p, 'You fall asleep. When everyone sleeps, the night passes quickly 💤'); sendMe(p);
      } else if (s.type === 'raft') toast(p, 'Your raft is ready. Freedom is near ⛵', 'good');
    }
  });

  socket.on('fish', () => {
    const c = ctx(socket); if (!c) return;
    const { room, p } = c, now = Date.now(), w = room._world;
    if (p._sleeping || p._fishAt) return;
    if (!p.tools.rod) return toast(p, 'Craft a fishing rod first 🎣', 'warn');
    const fx = p.x + Math.sin(p.ry) * 3.5, fz = p.z + Math.cos(p.ry) * 3.5;
    if (w.height(fx, fz) > -0.2) return toast(p, 'Face the sea to fish 🌊', 'warn');
    p._fishAt = now + 3000 + Math.random() * 4500; p._fishX = p.x; p._fishZ = p.z; p._actAt = now;
    toast(p, 'You cast your line… stay still 🎣'); sendMe(p);
  });

  socket.on('eat', (d) => {
    const c = ctx(socket); if (!c || !d) return;
    const { p } = c, f = W.FOOD[d.item];
    if (!f || (p.inv[d.item] || 0) < 1 || p._sleeping) return;
    p.inv[d.item]--;
    p.hunger = Math.min(100, p.hunger + f.hunger); p.thirst = Math.min(100, p.thirst + f.thirst);
    p.hp = clamp(p.hp + f.hp, 1, 100);
    toast(p, `Ate ${W.ITEMS[d.item].name.toLowerCase()}`, f.hp < 0 ? 'warn' : 'good'); sendMe(p);
  });

  socket.on('craft', (d) => {
    const c = ctx(socket); if (!c || !d) return;
    const { p } = c, t = W.TOOLS[d.tool];
    if (!t || p.tools[d.tool]) return;
    if (!canAfford(p.inv, t.cost)) return toast(p, `Need ${costText(t.cost)}`, 'warn');
    pay(p.inv, t.cost); p.tools[d.tool] = true;
    toast(p, `Crafted ${t.name} ${t.icon}`, 'good'); sendMe(p);
  });

  socket.on('build', (d) => {
    const c = ctx(socket); if (!c || !d) return;
    const { room, p } = c, def = W.BUILDS[d.type], w = room._world;
    if (!def || p._sleeping) return;
    const x = num(d.x, NaN), z = num(d.z, NaN), ry = num(d.ry, 0);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (room.structures.length >= 90) return toast(p, 'Too many structures on the island', 'warn');
    if (Math.hypot(x - p.x, z - p.z) > 10) return toast(p, 'Too far away to build there', 'warn');
    const h = w.height(x, z);
    if (def.shore) { if (h > 0.9 || h < -0.5) return toast(p, 'Build the raft right on the shoreline', 'warn'); }
    else if (h < 0.35 || w.nearPond(x, z, 0.8)) return toast(p, 'Too close to the water', 'warn');
    if (room.structures.some((s) => Math.hypot(s.x - x, s.z - z) < (W.BUILDS[s.type].r + def.r) * 0.9)) return toast(p, 'Something is in the way', 'warn');
    if (room.resources.some((r) => r.alive && r.t !== 'grass' && Math.hypot(r.x - x, r.z - z) < def.r + W.RES[r.t].r + 0.2)) return toast(p, 'A plant or rock is in the way', 'warn');
    if (!canAfford(p.inv, def.cost)) return toast(p, `Need ${costText(def.cost)}`, 'warn');
    pay(p.inv, def.cost);
    const s = { id: room.nextId++, type: d.type, x: r2(x), z: r2(z), ry: r2(ry), by: p.id };
    if (d.type === 'campfire') s.fuel = 120;
    room.structures.push(s);
    emitRoom(room, 'struct', structOut(s));
    emitRoom(room, 'toast', { t: `${p.name} built a ${def.name.toLowerCase()} ${def.icon}`, k: 'good' });
    sendMe(p);
    if (d.type === 'raft' && !room.won) { room.won = 'raft'; emitRoom(room, 'win', { how: 'raft' }); }
    saveRoom(room);
  });

  socket.on('stash', (d) => {
    const c = ctx(socket); if (!c || !d) return;
    const { room, p } = c;
    if (!W.ITEMS[d.item] || !room.structures.some((s) => s.type === 'storage' && dist(p, s) < 5)) return;
    const q = clamp(Math.floor(num(d.qty, 1)), 1, 999);
    const from = d.dir === 'put' ? p.inv : room.chest, to = d.dir === 'put' ? room.chest : p.inv;
    const n = Math.min(q, from[d.item] || 0); if (!n) return;
    from[d.item] -= n; to[d.item] = (to[d.item] || 0) + n;
    emitRoom(room, 'chest', { chest: room.chest }); sendMe(p);
  });

  socket.on('wake', () => { const c = ctx(socket); if (c && c.p._sleeping) { c.p._sleeping = false; sendMe(c.p); } });

  socket.on('chat', (d) => {
    const c = ctx(socket); if (!c || !d) return;
    const text = String(d.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 140);
    if (text) emitRoom(c.room, 'chat', { from: c.p.name, color: c.p.color, text });
  });

  if (TEST) {
    socket.on('debugTp', (d) => { const c = ctx(socket); if (c) { c.p.x = d.x; c.p.z = d.z; } });
    socket.on('debugGive', (d) => { const c = ctx(socket); if (c) { give(c.p, d.item, d.n); sendMe(c.p); } });
    socket.on('debugTime', (d) => { const c = ctx(socket); if (c) c.room.tod = d.tod; });
    socket.on('debugStat', (d) => { const c = ctx(socket); if (c) Object.assign(c.p, d); });
  }

  socket.on('disconnect', () => { clearInterval(rl); detach(socket); });
});

/* --------------------------------------------------------- simulation loop */
function spawnAnimal(room, type, near) {
  const w = room._world, players = [...room._online.values()].map((id) => room.players[id]);
  for (let i = 0; i < 30; i++) {
    let x, z;
    if (type === 'wolf' && near) {
      const ang = Math.random() * 6.283, d = 30 + Math.random() * 10;
      x = near.x + Math.cos(ang) * d; z = near.z + Math.sin(ang) * d;
    } else {
      const ang = Math.random() * 6.283, d = Math.sqrt(Math.random()) * 52;
      x = Math.cos(ang) * d; z = Math.sin(ang) * d;
    }
    const h = w.height(x, z);
    if (h < 0.8 || h > 5 || w.nearPond(x, z, 3)) continue;
    if (type !== 'wolf' && players.some((p) => Math.hypot(p.x - x, p.z - z) < 14)) continue;
    room._animals.push({ id: room._aid++, type, x, z, ry: Math.random() * 6.283, hp: W.ANIMALS[type].hp,
      tx: x, tz: z, idle: 0, wt: 0, cd: 0, agro: false, mv: 0, hit: 0 });
    return;
  }
}

function hurt(room, p, dmg, msg) {
  p.hp -= dmg; p._sleeping = false;
  if (p._sid) {
    io.to(p._sid).emit('hurt', { dmg });
    if (Date.now() - p._hurtMsg > 1500) { p._hurtMsg = Date.now(); toast(p, msg, 'bad'); }
  }
}

function updateAnimals(room, dt, players, fires, night) {
  const w = room._world;
  // population management
  room._tAnimal += dt;
  if (room._tAnimal > 8) {
    room._tAnimal = 0;
    const cnt = (t) => room._animals.filter((a) => a.type === t).length;
    if (cnt('deer') < 7) spawnAnimal(room, 'deer');
    if (cnt('boar') < 3) spawnAnimal(room, 'boar');
    const wantWolves = night ? players.length * 2 : 0;
    if (cnt('wolf') < wantWolves) spawnAnimal(room, 'wolf', players[Math.floor(Math.random() * players.length)]);
    if (!night) room._animals = room._animals.filter((a) => a.type !== 'wolf');
  }
  for (const a of room._animals) {
    let np = null, nd = 1e9;
    for (const p of players) { const d = dist(a, p); if (d < nd) { nd = d; np = p; } }
    let dx = 0, dz = 0, sp = 0;
    a.cd = Math.max(0, a.cd - dt); a.hit = Math.max(0, a.hit - dt);
    const nf = (a.type !== 'deer') ? fires.find((f) => Math.hypot(a.x - f.x, a.z - f.z) < f.r) : null;
    if (nf) {                                  // scared of fire / shelter
      dx = a.x - nf.x; dz = a.z - nf.z; sp = 5.5;
    } else if (a.type === 'deer' && np && nd < 9) {
      dx = a.x - np.x; dz = a.z - np.z; sp = 5.4;
    } else if (a.type === 'boar' && np && nd < (a.agro ? 14 : 6)) {
      a.agro = true; dx = np.x - a.x; dz = np.z - a.z; sp = 4.4;
      if (nd < 1.8 && a.cd <= 0) { a.cd = 1.3; hurt(room, np, 9, 'A boar charges you! 🐗'); }
    } else if (a.type === 'wolf' && np && nd < 32) {
      dx = np.x - a.x; dz = np.z - a.z; sp = 5.6;
      if (nd < 1.9 && a.cd <= 0) { a.cd = 1.1; hurt(room, np, 11, 'A wolf bites you! 🐺'); }
    } else {
      a.agro = false;
      if (a.idle > 0) a.idle -= dt;
      else {
        a.wt -= dt;
        if (a.wt <= 0 || Math.hypot(a.tx - a.x, a.tz - a.z) < 0.6) {
          const ang = Math.random() * 6.283, d = 3 + Math.random() * 6;
          a.tx = a.x + Math.cos(ang) * d; a.tz = a.z + Math.sin(ang) * d; a.wt = 8;
          if (Math.random() < 0.4) a.idle = 2 + Math.random() * 4;
        }
        dx = a.tx - a.x; dz = a.tz - a.z; sp = a.type === 'wolf' ? 2 : 1.4;
      }
    }
    const len = Math.hypot(dx, dz);
    if (len > 0.001 && sp > 0 && !(sp > 4 && a.type === 'wolf' && nd < 1.4)) {
      const nx = a.x + (dx / len) * sp * dt, nz = a.z + (dz / len) * sp * dt;
      const h = w.height(nx, nz);
      const blockedBy = room.structures.some((s) => Math.hypot(nx - s.x, nz - s.z) < W.BUILDS[s.type].r + 0.5);
      if (h > 0.25 && !w.nearPond(nx, nz, 0.4) && !blockedBy) { a.x = nx; a.z = nz; a.ry = Math.atan2(dx, dz); a.mv = 1; }
      else { a.mv = 0; a.wt = 0; }
    } else a.mv = 0;
  }
}

function survive(room, p, dt, drainDt, night) {
  const warm = room.structures.some((s) => (s.type === 'campfire' && s.fuel > 0 && Math.hypot(p.x - s.x, p.z - s.z) < 7)
    || (s.type === 'hut' && Math.hypot(p.x - s.x, p.z - s.z) < 6));
  p.hunger = Math.max(0, p.hunger - 0.22 * drainDt);
  p.thirst = Math.max(0, p.thirst - 0.30 * drainDt);
  if (p._sleeping) p.energy = Math.min(100, p.energy + (room._allSleeping ? 30 : 6) * dt);
  else p.energy = Math.max(0, p.energy - (0.16 + (p._sprint ? 0.9 : 0)) * dt);
  if (warm) p.warmth = Math.min(100, p.warmth + 3 * dt);
  else if (night) p.warmth = Math.max(0, p.warmth - 1.2 * drainDt);
  else p.warmth = Math.min(100, p.warmth + 0.8 * dt);

  let hpDelta = 0;
  if (p.hunger <= 0 || p.thirst <= 0 || p.warmth <= 0 || p.energy <= 0) hpDelta -= 1.0;
  else if (p.warmth < 20) hpDelta -= 0.5;
  else if (p.hunger > 40 && p.thirst > 40 && p.warmth > 40) hpDelta += p._sleeping ? 1.5 : 0.5;
  p.hp = Math.min(100, p.hp + hpDelta * dt);

  if (p.hp <= 0) {                            // pass out → wake up at the crash site
    const sp = room._world.spawn;
    p.x = sp.x; p.z = sp.z; p.hp = 50; p.hunger = Math.max(p.hunger, 40); p.thirst = Math.max(p.thirst, 40);
    p.warmth = 60; p.energy = Math.max(p.energy, 50); p._sleeping = false; p._fishAt = 0;
    toast(p, 'You collapsed and woke up at the crash site 😵', 'bad');
    if (p._sid) io.to(p._sid).emit('pos', { x: p.x, z: p.z, respawn: true });
  }
}

function tickRoom(room, dt, now) {
  const players = [...room._online.values()].map((id) => room.players[id]);
  if (!players.length) return;
  room.clock += dt;
  room._allSleeping = players.every((p) => p._sleeping);
  const speed = room._allSleeping ? 20 : 1;

  // time of day
  room.tod += dt * speed * 24 / W.DAY_LEN;
  if (room.tod >= 24) {
    room.tod -= 24; room.day++;
    emitRoom(room, 'toast', { t: `Day ${room.day} begins ☀️`, k: 'info' });
    if (room.day > W.WIN_DAY && !room.won) { room.won = 'survived'; emitRoom(room, 'win', { how: 'survived' }); }
  }
  const night = W.isNight(room.tod);
  if (room.tod >= 6 && room.tod < 19) {
    for (const p of players) if (p._sleeping) { p._sleeping = false; toast(p, 'Good morning! ☀️', 'good'); sendMe(p); }
  }

  // fires
  for (const s of room.structures) {
    if (s.type === 'campfire' && s.fuel > 0) {
      s.fuel -= dt;
      if (s.fuel <= 0) { s.fuel = 0; emitRoom(room, 'struct', structOut(s)); emitRoom(room, 'toast', { t: 'A campfire burned out 🪵', k: 'warn' }); }
    }
  }
  const fires = room.structures.filter((s) => (s.type === 'campfire' && s.fuel > 0) || s.type === 'hut')
    .map((s) => ({ x: s.x, z: s.z, r: s.type === 'hut' ? 5.5 : 7.5 }));

  // resources respawn
  for (const r of room.resources) {
    if (!r.alive && r.respawnAt <= room.clock) {
      r.alive = true; r.hp = W.RES[r.t].hp; emitRoom(room, 'res', { id: r.id, hp: r.hp, alive: true });
    }
  }

  // players
  for (const p of players) {
    survive(room, p, dt, dt * (room._allSleeping ? 8 : 1), night);
    if (p._fishAt && now >= p._fishAt) {
      p._fishAt = 0;
      if (Math.random() < 0.75) { const n = Math.random() < 0.15 ? 2 : 1; give(p, 'rawFish', n); toast(p, `You caught ${n} fish! 🐟`, 'good'); }
      else toast(p, 'Nothing bit this time', 'info');
      sendMe(p);
    }
  }
  updateAnimals(room, dt, players, fires, night);

  // network
  emitRoom(room, 'snap', {
    tod: r2(room.tod), day: room.day,
    p: players.map((p) => [p.id, r2(p.x), r2(p.z), r2(p.ry), p._mv, (p._sleeping ? 1 : 0) | (p._fishAt ? 2 : 0) | (now - p._actAt < 350 ? 4 : 0)]),
    a: room._animals.map((a) => [a.id, a.type, r2(a.x), r2(a.z), r2(a.ry), a.mv, a.hit > 0 ? 1 : 0]),
  });
  room._t05 += dt;
  if (room._t05 >= 0.5) { room._t05 = 0; players.forEach(sendMe); }
  if (now - room._lastSave > 15000) saveRoom(room);
}

let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
  for (const room of rooms.values()) tickRoom(room, dt, now);
}, 100);

setInterval(() => {            // free memory of rooms nobody is in
  for (const [code, room] of rooms) {
    if (!room._online.size && Date.now() - room._emptyAt > 300000) { saveRoom(room); rooms.delete(code); }
  }
}, 60000);

function shutdown() {
  for (const room of rooms.values()) saveRoom(room);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (require.main === module) {
  server.listen(PORT, () => console.log(`Castaway Co-op running on http://localhost:${PORT}  (saves: ${DATA_DIR})`));
}
module.exports = { server, rooms };

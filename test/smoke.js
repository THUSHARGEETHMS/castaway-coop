// End-to-end socket test: rooms, passwords, 2-player cap, gameplay, save + resume.
// Run:  npm test   (starts its own server on a temp port + temp data dir)
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { io } = require('socket.io-client');

const PORT = 3900 + Math.floor(Math.random() * 90);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'castaway-'));
const URL = `http://localhost:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.state = { toasts: [], me: null, init: null, structs: [], res: {} };
  s.on('init', (d) => { s.state.init = d; s.state.me = d.me; });
  s.on('me', (m) => { s.state.me = m; });
  s.on('toast', (t) => s.state.toasts.push(t.t));
  s.on('struct', (d) => s.state.structs.push(d));
  s.on('res', (d) => { s.state.res[d.id] = d; });
  s.on('win', (d) => { s.state.win = d; });
  s.on('chat', (d) => { s.state.chat = d; });
  s.on('chest', (d) => { s.state.chest = d; });
  s.on('pos', (d) => { s.state.pos = d; });
  s.on('snap', (d) => { s.state.snap = d; });
  s.emitA = (ev, d) => new Promise((r) => s.emit(ev, d, r));
  return new Promise((r) => s.on('connect', () => r(s)));
}

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, DATA_DIR: DATA, CASTAWAY_TEST: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((r) => srv.stdout.on('data', (d) => String(d).includes('running') && r()));

  console.log('Rooms & passwords');
  const a = await client();
  let r = await a.emitA('create', { name: 'Alex', password: 'palm123' });
  ok(r.ok && /^ISLE-\d{4}$/.test(r.code), `create returns code (${r.code})`);
  const code = r.code;
  await sleep(150);
  ok(a.state.init && a.state.init.you === 'p1', 'creator gets init state');

  const b = await client();
  r = await b.emitA('join', { name: 'Sam', code, password: 'wrong' });
  ok(!r.ok && /password/i.test(r.error), 'wrong password rejected');
  r = await b.emitA('join', { name: 'Sam', code: 'ISLE-0000-x', password: 'palm123' });
  ok(!r.ok, 'bad code rejected');
  r = await b.emitA('join', { name: 'Sam', code, password: 'palm123' });
  ok(r.ok && !r.resumed, 'second player joins with code + password');
  await sleep(150);
  ok(b.state.init.world === undefined && b.state.init.seed === a.state.init.seed, 'both players share the same island seed');

  const c = await client();
  r = await c.emitA('join', { name: 'Third', code, password: 'palm123' });
  ok(!r.ok && /full/i.test(r.error), 'third player rejected (2-player island)');
  r = await c.emitA('join', { name: 'alex', code, password: 'palm123' });
  ok(!r.ok && /already online/i.test(r.error), 'cannot steal an online player slot');
  c.close();

  console.log('Gameplay');
  const init = a.state.init;
  const palm = init.resources.find((x) => x[1] === 'palm');
  a.emit('debugTp', { x: palm[2] - 1.5, z: palm[3] });
  await sleep(150);
  for (let i = 0; i < 8; i++) { a.emit('use', { kind: 'res', id: palm[0] }); await sleep(450); }
  ok((a.state.me.inv.wood || 0) >= 2, `chopping a palm gives wood (${a.state.me.inv.wood})`);
  ok(a.state.res[palm[0]] && a.state.res[palm[0]].alive === false, 'palm is depleted and broadcast to partner');
  await sleep(100);
  ok(b.state.res[palm[0]] && b.state.res[palm[0]].alive === false, 'partner sees the palm removed');

  a.emit('debugGive', { item: 'wood', n: 40 }); a.emit('debugGive', { item: 'stone', n: 10 }); a.emit('debugGive', { item: 'fiber', n: 20 });
  await sleep(150);
  a.emit('craft', { tool: 'rod' }); a.emit('craft', { tool: 'axe' }); await sleep(150);
  ok(a.state.me.tools.rod && a.state.me.tools.axe, 'crafted fishing rod and axe');

  const sp = init.players.find((p) => p[0] === 'p1');
  const spot = { x: sp[1] + 3, z: sp[2] + 3 };
  // find a legal build spot on land near the player using the shared world code
  const W = require('../public/js/world.js'), w = W.create(init.seed);
  // find a free land spot near (cx,cz) (clear of plants/rocks/other buildings) and build there
  async function buildNear(type, cx, cz) {
    const rr = { campfire: 1.6, storage: 1.8, hut: 3.2 }[type];
    for (let d = 0; d < 14; d += 1) for (let t = 0; t < 6.28; t += 0.5) {
      const x = cx + Math.cos(t) * d, z = cz + Math.sin(t) * d;
      if (w.height(x, z) < 0.8 || w.nearPond(x, z, 2)) continue;
      if (init.resources.some((r) => Math.hypot(r[2] - x, r[3] - z) < rr + 1.2)) continue;
      if (a.state.structs.some((s) => Math.hypot(s.x - x, s.z - z) < rr + 2.5)) continue;
      const before = a.state.structs.length;
      a.emit('debugTp', { x: x + 2.5, z }); await sleep(150);
      a.emit('build', { type, x, z, ry: 0 }); await sleep(250);
      if (a.state.structs.length > before) return a.state.structs[a.state.structs.length - 1];
    }
    return null;
  }
  const bx = sp[1], bz = sp[2];
  await buildNear('campfire', bx, bz);
  await buildNear('storage', bx, bz);
  await sleep(150);
  ok(a.state.structs.some((s) => s.type === 'campfire'), 'campfire built');
  ok(b.state.structs.some((s) => s.type === 'campfire'), 'partner sees the campfire');
  { const f0 = a.state.structs.find((q) => q.type === 'campfire'); a.emit('debugTp', { x: f0.x + 2, z: f0.z }); await sleep(150); a.emit('build', { type: 'campfire', x: f0.x + 0.3, z: f0.z, ry: 0 }); await sleep(200); }
  ok(a.state.toasts.some((t) => /in the way/i.test(t)), 'overlapping build rejected');
  a.emit('build', { type: 'hut', x: a.state.structs[0].x + 500, z: bz, ry: 0 }); await sleep(150);
  ok(a.state.toasts.some((t) => /too far/i.test(t)), 'far-away build rejected');

  a.emit('debugGive', { item: 'rawMeat', n: 2 }); await sleep(100);
  const fire = a.state.structs.find((s) => s.type === 'campfire');
  a.emit('debugTp', { x: fire.x + 1.5, z: fire.z }); await sleep(150);
  a.emit('use', { kind: 'struct', id: fire.id }); await sleep(450);
  ok((a.state.me.inv.cookedMeat || 0) === 1, 'cooked meat on the campfire');
  a.emit('eat', { item: 'cookedMeat' }); await sleep(150);
  ok((a.state.me.inv.cookedMeat || 0) === 0, 'ate the cooked meat');

  const chest = a.state.structs.find((s) => s.type === 'storage');
  a.emit('debugTp', { x: chest.x + 1.5, z: chest.z }); await sleep(150);
  a.emit('stash', { item: 'wood', dir: 'put', qty: 5 }); await sleep(200);
  ok(a.state.chest && a.state.chest.chest.wood === 5, 'items stored in shared chest');
  b.emit('chat', { text: 'hello' }); await sleep(120);
  ok(a.state.chat && a.state.chat.text === 'hello', 'chat delivered');

  const tele = { x: 80, z: 80 };
  a.emit('move', { x: tele.x, z: tele.z, ry: 0, mv: 1 }); await sleep(250);
  ok(a.state.pos && Math.abs(a.state.pos.x - tele.x) > 10, 'teleport/speed-hack movement is rejected');

  console.log('Fishing, sleeping, wolves');
  {
    // fishing: stand on the beach facing the sea
    const ux = sp[1] / Math.hypot(sp[1], sp[2]), uz = sp[2] / Math.hypot(sp[1], sp[2]);
    let k = 0; while (k < 20 && (w.height(sp[1] + ux * k + ux * 3.5, sp[2] + uz * k + uz * 3.5) > -0.25) && w.walkable(sp[1] + ux * (k + 0.5), sp[2] + uz * (k + 0.5))) k += 0.5;
    const fx = sp[1] + ux * k, fz = sp[2] + uz * k, ry = Math.atan2(ux, uz);
    a.emit('debugTime', { tod: 9 });
    a.emit('debugTp', { x: fx, z: fz }); await sleep(200);
    a.emit('move', { x: fx, z: fz, ry, mv: 0 }); await sleep(120);
    a.state.toasts.length = 0;
    a.emit('fish'); await sleep(200);
    ok(a.state.toasts.some((t) => /cast your line/i.test(t)) && a.state.me.fishing, 'casting a line near the sea starts fishing');
    await sleep(8000);
    ok(a.state.toasts.some((t) => /caught|nothing bit/i.test(t)) && !a.state.me.fishing, 'fishing resolves (catch or no bite)');

    // sleeping through the night in a hut
    a.state.toasts.length = 0;
    const hut = await buildNear('hut', fx - ux * 6, fz - uz * 6);
    ok(!!hut, 'shelter hut built');
    a.emit('debugTime', { tod: 10 }); await sleep(100);
    a.emit('use', { kind: 'struct', id: hut.id }); await sleep(250);
    ok(a.state.toasts.some((t) => /only sleep at night/i.test(t)), 'cannot sleep during the day');
    a.emit('debugTime', { tod: 21 }); await sleep(600);
    a.emit('debugStat', { energy: 20 });
    a.emit('use', { kind: 'struct', id: hut.id }); await sleep(250);
    ok(a.state.me.sleeping, 'player falls asleep in the hut at night');
    b.emit('debugTp', { x: hut.x + 2.5, z: hut.z }); await sleep(200);
    b.emit('use', { kind: 'struct', id: hut.id }); await sleep(300);
    await sleep(5000);
    ok(!a.state.me.sleeping && a.state.snap.tod >= 6 && a.state.snap.tod < 12, `time fast-forwards to morning when all online players sleep (tod ${a.state.snap.tod})`);
    ok(a.state.me.energy > 90, `energy restored by sleep (${a.state.me.energy})`);

    // wolves roam at night, are gone by day
    a.emit('debugTime', { tod: 22 }); await sleep(10500);
    ok(a.state.snap.a.some((x) => x[1] === 'wolf'), 'wolves appear at night');
    ok(a.state.snap.a.some((x) => x[1] === 'deer'), 'deer roam the island');
    a.emit('debugTime', { tod: 8 }); await sleep(9500);
    ok(!a.state.snap.a.some((x) => x[1] === 'wolf'), 'wolves leave at dawn');
    a.emit('debugStat', { hp: 100, hunger: 90, thirst: 90, warmth: 90 }); await sleep(200);
  }

  console.log('Night & survival');
  a.emit('debugTime', { tod: 22 }); await sleep(100);
  a.emit('debugStat', { hunger: 5 }); await sleep(600);
  ok(a.state.me.hunger < 6, 'hunger stat is simulated on the server');

  console.log('Save & resume');
  const wood = a.state.me.inv.wood, nStruct = a.state.structs.length;
  const pre = JSON.stringify(a.state.me.tools);
  a.close(); b.close();
  await sleep(500);
  ok(fs.existsSync(path.join(DATA, code + '.json')), 'room saved to disk');
  srv.kill('SIGTERM'); await sleep(400);               // full server restart
  const srv2 = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, DATA_DIR: DATA, CASTAWAY_TEST: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv2.stdout.on('data', (d) => String(d).includes('running') && r()));
  const a2 = await client();
  r = await a2.emitA('join', { name: 'ALEX', code: code.replace('ISLE-', ''), password: 'palm123' });
  ok(r.ok && r.resumed, 'rejoin after server restart resumes the same player (code without prefix, any case)');
  await sleep(200);
  const i2 = a2.state.init;
  ok(i2.seed === init.seed, 'same island after restart');
  ok(i2.me.inv.wood === wood, `inventory restored (wood ${i2.me.inv.wood})`);
  ok(JSON.stringify(i2.me.tools) === pre, 'tools restored');
  ok(i2.structures.length === nStruct, `buildings restored (${i2.structures.length})`);
  ok(i2.chest.wood === 5, 'chest contents restored');
  ok(i2.resources.find((x) => x[0] === palm[0])[5] === 0, 'chopped palm is still chopped');
  ok(i2.me.hunger < 7, 'survival stats restored');
  r = await (await client()).emitA('join', { name: 'Sam', code, password: 'palm123' });
  ok(r.ok && r.resumed, 'partner can also resume with their original name');

  console.log(`\n${pass} passed, ${fail} failed`);
  srv2.kill('SIGTERM');
  fs.rmSync(DATA, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

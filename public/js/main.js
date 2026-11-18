import * as THREE from 'three';
import * as Mo from './models.js';

const W = window.World;
const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const SHIRTS = [0xe4572e, 0x2e86e4, 0x3fb950, 0xd29922];
const CSS_COL = ['#ff7a59', '#58a6ff', '#56d364', '#e3b341'];
const save = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } };
const load = (k) => { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ================================================================ renderer */
const canvas = $('view');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
} catch (e) {
  $('lobbyErr').textContent = 'Your browser could not start 3D graphics (WebGL). Try Chrome, Edge, Firefox or Safari.';
  throw e;
}
renderer.shadowMap.enabled = !isTouch;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd0f0);
scene.fog = new THREE.Fog(0x8fd0f0, 55, 220);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
const hemi = new THREE.HemisphereLight(0xffffff, 0x6b8c5a, 0.75);
const sun = new THREE.DirectionalLight(0xfff2d0, 1);
scene.add(hemi, sun, sun.target);
if (!isTouch) {
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 220 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
}
const fireLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xff9a4a, 0, 20, 1.6); scene.add(l); return l; });

const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1b0, fog: false }));
const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false }));
scene.add(sunMesh, moonMesh);
const stars = (() => {
  const n = 500, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * Math.PI * 2, v = Math.acos(Math.random() * 0.95 + 0.05), r = 420;
    a[i * 3] = Math.cos(u) * Math.sin(v) * r; a[i * 3 + 1] = Math.cos(v) * r; a[i * 3 + 2] = Math.sin(u) * Math.sin(v) * r;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(p); return p;
})();

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.5 : 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1 ? 72 : 58;        // wider vertical FOV on portrait phones
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

/* ============================================================ day / night */
const KF = [[0, 0x070b1f, .32], [5, 0x1a2142, .34], [6.3, 0xf0a070, .55], [8, 0x8fd0f0, .78], [16.5, 0x8fd0f0, .78],
  [18.3, 0xf27c4b, .55], [19.8, 0x1a2142, .34], [24, 0x070b1f, .32]].map(([t, c, a]) => ({ t, c: new THREE.Color(c), a }));
const _sky = new THREE.Color(), _c2 = new THREE.Color();
let tod = 8, day = 1;
function applyTime() {
  let amb = .6;
  for (let i = 0; i < KF.length - 1; i++) {
    const a = KF[i], b = KF[i + 1];
    if (tod >= a.t && tod <= b.t) { const k = (tod - a.t) / (b.t - a.t); _sky.copy(a.c).lerp(b.c, k); amb = lerp(a.a, b.a, k); break; }
  }
  const el = ((tod - 6) / 12) * Math.PI, se = Math.sin(el);
  const dark = 1 - clamp((se + 0.15) * 4, 0, 1);
  scene.background.copy(_sky); scene.fog.color.copy(_sky);
  scene.fog.near = lerp(55, 22, dark); scene.fog.far = lerp(230, 120, dark);
  hemi.intensity = amb; hemi.color.copy(_sky).lerp(_c2.set(0xffffff), 0.5);
  const sd = new THREE.Vector3(Math.cos(el) * 0.7, se, 0.45).normalize();
  const tgt = sun.target.position;
  if (se > 0) { sun.position.copy(tgt).addScaledVector(sd, 90); sun.intensity = clamp(se * 3, 0, 1) * 1.05; sun.color.set(0xffe9c0).lerp(_c2.set(0xffffff), clamp(se, 0, 1)); }
  else { sun.position.copy(tgt).addScaledVector(sd, -90); sun.intensity = clamp(-se * 3, 0, 1) * 0.42; sun.color.set(0x8fa8ff); }
  sunMesh.position.copy(camera.position).addScaledVector(sd, 380); sunMesh.visible = se > -0.05;
  moonMesh.position.copy(camera.position).addScaledVector(sd, -380); moonMesh.visible = se < 0.05;
  stars.position.copy(camera.position); stars.material.opacity = dark;
  const h = Math.floor(tod), m = Math.floor((tod - h) * 60);
  $('clockText').textContent = `Day ${day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  $('clockIcon').textContent = W.isNight(tod) ? '🌙' : (tod < 7.5 || tod > 17.5) ? '🌅' : '☀️';
}

/* ================================================================== world */
let world = null, worldGroup = null, sea = null, seaTex = null, miniBase = null;
const dyn = new THREE.Group(); scene.add(dyn);

function terrainColor(h, x, z, c) {
  if (h < -0.15) c.set(0x6a9a96).lerp(_c2.set(0x23506a), clamp(-h / 5, 0, 1));
  else if (h < 0.9) c.set(0xcdbb8a).lerp(_c2.set(0xe6d7a6), clamp(h / 0.5, 0, 1));
  else if (h < 2.0) c.set(0xe6d7a6).lerp(_c2.set(0x86b84f), (h - 0.9) / 1.1);
  else if (h < 4.2) c.set(0x86b84f).lerp(_c2.set(0x4f8a3a), (h - 2) / 2.2);
  else c.set(0x4f8a3a).lerp(_c2.set(0x8d8b80), clamp((h - 4.2) / 1.0, 0, 1));
  if (world.pondDist(x, z) < world.pond.r + 1.4) c.lerp(_c2.set(0xa89a72), 0.6);
  c.offsetHSL(0, 0, (W.noise(x * 0.5, z * 0.5, world.seed + 3) - 0.5) * 0.09);
}

function buildWorld(seed) {
  if (worldGroup) { scene.remove(worldGroup); worldGroup.traverse((o) => { if (o.geometry && o.geometry !== Mo.geos[o.name]) o.geometry.dispose(); }); }
  world = W.create(seed);
  worldGroup = new THREE.Group(); scene.add(worldGroup);

  const SEG = 200, geo = new THREE.PlaneGeometry(200, 200, SEG, SEG); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = world.height(x, z);
    pos.setY(i, h); terrainColor(h, x, z, c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.receiveShadow = true; worldGroup.add(terrain);

  // sea with scrolling ripple texture
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 6 + Math.random() * 22;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, 'rgba(150,190,215,.55)'); gr.addColorStop(1, 'rgba(150,190,215,0)');
      g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  seaTex = new THREE.CanvasTexture(cv); seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping; seaTex.repeat.set(110, 110); seaTex.colorSpace = THREE.SRGBColorSpace;
  sea = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x2b9ac8, map: seaTex, transparent: true, opacity: 0.8 }));
  sea.position.y = -0.02; worldGroup.add(sea);

  const pond = new THREE.Mesh(new THREE.CircleGeometry(world.pond.r + 1.1, 36).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x3fb3d6, transparent: true, opacity: 0.88 }));
  pond.position.set(world.pond.x, world.pond.level, world.pond.z); worldGroup.add(pond);

  const wreck = new THREE.Mesh(Mo.geos.wreck, Mo.vcMat);
  wreck.position.set(world.spawn.x - Math.sign(world.spawn.x) * 0.5, Math.max(world.height(world.spawn.x, world.spawn.z), 0) - 0.05, world.spawn.z + 2.5);
  wreck.name = 'wreck'; wreck.castShadow = true; worldGroup.add(wreck);

  // minimap base
  miniBase = document.createElement('canvas'); miniBase.width = miniBase.height = 128;
  const mg = miniBase.getContext('2d'), img = mg.createImageData(128, 128);
  for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
    const x = i - 64, z = j - 64, h = world.height(x, z);
    let hex;
    if (world.pondDist(x, z) < world.pond.r) hex = 0x3fb3d6;
    else if (h < -0.4) hex = 0x1d6490; else if (h < 0) hex = 0x3a9cc4; else if (h < 0.9) hex = 0xe6d7a6;
    else if (h < 4.2) hex = 0x6fae48; else hex = 0x8d8b80;
    const k = (j * 128 + i) * 4; img.data[k] = hex >> 16; img.data[k + 1] = (hex >> 8) & 255; img.data[k + 2] = hex & 255; img.data[k + 3] = 255;
  }
  mg.putImageData(img, 0, 0);
}

/* ================================================================ entities */
const res = new Map(), structs = new Map(), animals = new Map(), players = new Map();
const labels = $('labels');
let myId = null, roster = {}, me = null, chestData = {}, meState = null, won = null;
const ghostMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.6 });
const ring = Mo.makeRing(1); ring.visible = false; scene.add(ring);

function clearDyn() {
  for (const m of [res, structs, animals, players]) m.clear();
  while (dyn.children.length) dyn.remove(dyn.children[0]);
  labels.innerHTML = '';
}
const gy = (x, z) => world.height(x, z);

function addRes([id, t, x, z, hp, alive]) {
  let r = res.get(id);
  if (!r) {
    const mesh = new THREE.Mesh(Mo.geos[t], Mo.vcMat);
    const s = (0.85 + ((id * 37) % 30) / 100) * (t === 'palm' ? 1.1 : 1);
    mesh.position.set(x, gy(x, z), z); mesh.rotation.y = ((id * 97) % 628) / 100; mesh.scale.setScalar(s);
    mesh.castShadow = t !== 'grass';
    dyn.add(mesh);
    r = { id, t, x, z, s, mesh, shake: 0, pop: 1 }; res.set(id, r);
  }
  r.hp = hp; r.alive = !!alive; r.mesh.visible = r.alive;
}
function addStruct(d) {
  let s = structs.get(d.id);
  if (!s) {
    const mesh = new THREE.Mesh(Mo.geos[d.type], Mo.vcMat);
    mesh.position.set(d.x, d.type === 'raft' ? Math.max(gy(d.x, d.z), -0.1) : gy(d.x, d.z), d.z);
    mesh.rotation.y = d.ry || 0; mesh.castShadow = true;
    if (d.type === 'campfire') { const f = Mo.makeFlame(); mesh.add(f); mesh.userData.flame = f; }
    dyn.add(mesh);
    s = { id: d.id, type: d.type, x: d.x, z: d.z, mesh }; structs.set(d.id, s);
  }
  s.lit = d.lit;
  if (s.mesh.userData.flame) s.mesh.userData.flame.visible = !!d.lit;
  return s;
}
function ensureAnimal(id, type, x, z, ry) {
  let a = animals.get(id);
  if (!a) {
    const mesh = new THREE.Mesh(Mo.geos[type], Mo.vcMat); mesh.castShadow = true; mesh.rotation.order = 'YXZ';
    mesh.position.set(x, gy(x, z), z); dyn.add(mesh);
    a = { id, type, x, z, ry, tx: x, tz: z, tr: ry, mv: 0, mesh, ph: Math.random() * 6 }; animals.set(id, a);
  }
  return a;
}
function ensurePlayer(id, x, z, ry) {
  let p = players.get(id);
  if (!p) {
    const info = roster[id] || { name: '?', color: 0 };
    const model = Mo.makePlayer(SHIRTS[info.color % 4]);
    model.group.rotation.order = 'YXZ'; dyn.add(model.group);
    const bobber = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30 })); bobber.visible = false; model.group.add(bobber);
    const label = document.createElement('div'); label.className = 'nl'; label.textContent = info.name; label.style.color = CSS_COL[info.color % 4];
    if (id !== myId) labels.appendChild(label);
    p = { id, x, z, ry, tx: x, tz: z, tr: ry, mv: 0, flags: 0, model, bobber, label, isMe: id === myId, y: gy(x, z) };
    players.set(id, p);
  }
  return p;
}

/* ================================================================= network */
const socket = io({ transports: ['websocket', 'polling'] });
let session = null;

function showErr(t) { $('lobbyErr').textContent = t || ''; }
function doCreate() {
  const name = $('inName').value.trim(); if (!name) return showErr('Enter your name first');
  const password = $('inPwCreate').value; showErr('');
  socket.emit('create', { name, password }, (r) => {
    if (!r.ok) return showErr(r.error);
    session = { code: r.code, name, password, mode: 'join' }; save('cc_name', name); save('cc_code', r.code);
  });
}
function doJoin(auto) {
  const name = $('inName').value.trim(); if (!name) return showErr('Enter your name first');
  const code = $('inCode').value.trim(), password = $('inPwJoin').value; if (!auto) showErr('');
  socket.emit('join', { name, code, password }, (r) => {
    if (!r.ok) return showErr(r.error);
    session = { code: r.code, name, password, mode: 'join' }; save('cc_name', name); save('cc_code', r.code);
  });
}
$('btnCreate').onclick = doCreate; $('btnJoin').onclick = () => doJoin(false);
$('tabCreate').onclick = () => { $('tabCreate').classList.add('on'); $('tabJoin').classList.remove('on'); $('paneCreate').hidden = false; $('paneJoin').hidden = true; showErr(''); };
$('tabJoin').onclick = () => { $('tabJoin').classList.add('on'); $('tabCreate').classList.remove('on'); $('paneCreate').hidden = true; $('paneJoin').hidden = false; showErr(''); };
$('inCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
for (const id of ['inName', 'inPwCreate']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') ($('paneCreate').hidden ? doJoin(false) : doCreate()); });
for (const id of ['inCode', 'inPwJoin']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(false); });
$('inName').value = load('cc_name'); $('inCode').value = load('cc_code');
{
  const q = new URLSearchParams(location.search).get('room');
  if (q) { $('inCode').value = q.toUpperCase(); $('tabJoin').click(); }
}

function rejoin(n) {
  if (!session || !socket.connected) return;
  socket.emit('join', { name: session.name, code: session.code, password: session.password }, (r) => {
    if (!r.ok && n < 8) setTimeout(() => rejoin(n + 1), 3000);   // old connection may linger a few seconds
  });
}
socket.on('connect', () => { $('conn').hidden = true; rejoin(0); });
socket.on('disconnect', () => { if (session) $('conn').hidden = false; });

socket.on('init', (d) => {
  myId = d.you; roster = d.roster;
  if (!world || world.seed !== d.seed) buildWorld(d.seed);
  clearDyn();
  d.resources.forEach(addRes); d.structures.forEach(addStruct);
  d.animals.forEach(([id, t, x, z, ry]) => ensureAnimal(id, t, x, z, ry));
  d.players.forEach(([id, x, z, ry]) => ensurePlayer(id, x, z, ry));
  me = players.get(myId);
  chestData = d.chest || {}; tod = d.tod; day = d.day; won = d.won;
  applyMe(d.me); renderRoster();
  $('lobby').hidden = true; $('hud').hidden = false; $('codeText').textContent = d.code;
  closePanel(); cancelPlace(); resize();
});
socket.on('roster', (r) => { roster = r; renderRoster(); });
socket.on('snap', (s) => {
  if (!world) return;
  const targetTod = s.tod;
  const diff = angDiffH(tod, targetTod); tod += diff * 0.5; if (tod < 0) tod += 24; if (tod >= 24) tod -= 24;
  day = s.day;
  const seen = new Set();
  for (const [id, x, z, ry, mv, fl] of s.p) {
    const p = ensurePlayer(id, x, z, ry); seen.add(id);
    p.flags = fl;
    if (!p.isMe) { p.tx = x; p.tz = z; p.tr = ry; p.mv = mv; }
  }
  for (const p of players.values()) p.online = seen.has(p.id);
  const ids = new Set();
  for (const [id, t, x, z, ry, mv, hit] of s.a) {
    const a = ensureAnimal(id, t, x, z, ry); ids.add(id);
    a.tx = x; a.tz = z; a.tr = ry; a.mv = mv; if (hit) a.hop = 0.25;
  }
  for (const [id, a] of animals) if (!ids.has(id)) { dyn.remove(a.mesh); animals.delete(id); }
});
const angDiffH = (a, b) => { let d = b - a; if (d > 12) d -= 24; if (d < -12) d += 24; return d; };
socket.on('res', (d) => {
  const r = res.get(d.id); if (!r) return;
  const was = r.alive; r.hp = d.hp; r.alive = d.alive;
  if (d.hit) r.shake = 0.25;
  r.mesh.visible = r.alive || r.shake > 0;
  if (!was && d.alive) { r.pop = 0; r.mesh.visible = true; }
});
socket.on('struct', (d) => {
  addStruct(d);
  if (d.by === myId && placing && placing.type !== 'fence' && placing.type === d.type) cancelPlace();
});
socket.on('me', applyMe);
socket.on('toast', (d) => toast(d.t, d.k));
socket.on('chat', (d) => {
  const el = document.createElement('div');
  el.innerHTML = `<b style="color:${CSS_COL[d.color % 4]}">${esc(d.from)}</b>: ${esc(d.text)}`;
  $('chatlog').appendChild(el); setTimeout(() => el.remove(), 9500);
  while ($('chatlog').children.length > 5) $('chatlog').firstChild.remove();
});
socket.on('pos', (d) => { if (me) { me.x = d.x; me.z = d.z; if (d.respawn) { cam.yaw = 0; } } });
socket.on('hurt', () => { const f = $('hurtFlash'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 60); if (navigator.vibrate) navigator.vibrate(60); });
socket.on('chest', (d) => { chestData = d.chest; if (d.open) openPanel('chest'); else if (panelKind === 'chest') renderPanel(); });
socket.on('win', (d) => {
  won = d.how;
  $('winTitle').textContent = d.how === 'raft' ? '⛵ You escaped the island!' : '🏝️ You survived 30 days!';
  $('winText').textContent = d.how === 'raft' ? 'The raft carries you both over the horizon. Well done, castaways!' : 'Rescue ships spot your fire. Well done, castaways!';
  $('winOv').hidden = false;
});
$('btnWinClose').onclick = () => { $('winOv').hidden = true; };

function renderRoster() {
  $('roster').innerHTML = Object.entries(roster).map(([id, r]) =>
    `<span class="${r.online ? 'on' : 'off'}" style="${id === myId ? 'font-weight:700' : ''}">${esc(r.name)}</span>`).join('');
  for (const p of players.values()) {
    const r = roster[p.id]; if (!r) continue;
    p.label.textContent = r.name; p.label.style.color = CSS_COL[r.color % 4];
  }
}

/* ================================================================= HUD / UI */
function toast(t, k) {
  const el = document.createElement('div'); el.className = 'toast ' + (k || ''); el.textContent = t;
  $('toasts').appendChild(el); setTimeout(() => el.remove(), 3300);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}
function applyMe(m) {
  meState = m;
  for (const k of ['hp', 'hunger', 'thirst', 'energy', 'warmth']) {
    const el = document.querySelector(`.stat[data-k=${k}]`);
    el.querySelector('span').style.width = clamp(m[k], 0, 100) + '%'; el.classList.toggle('low', m[k] < 20);
  }
  $('sleepOv').hidden = !m.sleeping;
  if (panelKind) renderPanel();
}
let panelKind = null;
const hasAll = (cost) => Object.entries(cost).every(([k, v]) => ((meState && meState.inv[k]) || 0) >= v);
const chips = (cost) => Object.entries(cost).map(([k, v]) => `<span class="chip ${((meState.inv[k] || 0) >= v) ? '' : 'no'}">${W.ITEMS[k].icon} ${v}</span>`).join('');
function invSlots(inv, act) {
  const items = Object.entries(inv).filter(([, n]) => n > 0);
  if (!items.length) return '<p style="opacity:.6">Empty</p>';
  return `<div class="grid">${items.map(([k, n]) => `<div class="slot"><div class="ic">${W.ITEMS[k].icon}</div><div class="n">${n} × ${W.ITEMS[k].name}</div>${act(k, n)}</div>`).join('')}</div>`;
}
function renderPanel() {
  if (!panelKind || !meState) return;
  const body = $('panelBody');
  if (panelKind === 'bag') {
    $('panelTitle').textContent = '🎒 Bag';
    const tools = Object.entries(W.TOOLS).filter(([k]) => meState.tools[k]).map(([, t]) => `<span class="chip">${t.icon} ${t.name}</span>`).join('') || '<span style="opacity:.6">No tools yet. Craft some in 🔨</span>';
    body.innerHTML = `<div class="h3">Items</div>${invSlots(meState.inv, (k) => W.FOOD[k] ? `<button class="btn" data-act="eat" data-id="${k}">Eat</button>` : '')}<div class="h3">Tools</div>${tools}`;
  } else if (panelKind === 'make') {
    $('panelTitle').textContent = '🔨 Craft & build';
    body.innerHTML = '<div class="h3">Tools</div>' + Object.entries(W.TOOLS).map(([k, t]) =>
      `<div class="row"><span class="ic">${t.icon}</span><span class="t"><b>${t.name}</b><small>${t.desc}</small>${meState.tools[k] ? '' : chips(t.cost)}</span>` +
      (meState.tools[k] ? '<span>✓ Owned</span>' : `<button class="btn" data-act="craft" data-id="${k}" ${hasAll(t.cost) ? '' : 'disabled'}>Craft</button>`) + '</div>').join('') +
      '<div class="h3">Build</div>' + Object.entries(W.BUILDS).map(([k, b]) =>
      `<div class="row"><span class="ic">${b.icon}</span><span class="t"><b>${b.name}</b><small>${b.desc}</small>${chips(b.cost)}</span><button class="btn" data-act="build" data-id="${k}" ${hasAll(b.cost) ? '' : 'disabled'}>Place</button></div>`).join('');
  } else if (panelKind === 'chest') {
    $('panelTitle').textContent = '📦 Shared chest';
    const acts = (dir) => (k, n) => `<button class="btn" data-act="stash" data-dir="${dir}" data-id="${k}" data-q="1">1</button><button class="btn" data-act="stash" data-dir="${dir}" data-id="${k}" data-q="${n}">All</button>`;
    body.innerHTML = `<div class="cols"><div><div class="h3">Your bag → chest</div>${invSlots(meState.inv, acts('put'))}</div><div><div class="h3">Chest → your bag</div>${invSlots(chestData, acts('take'))}</div></div>`;
  } else if (panelKind === 'menu') {
    $('panelTitle').textContent = '☰ Menu';
    body.innerHTML = `<div class="row"><span class="ic">🏝️</span><span class="t"><b>Island code: ${esc($('codeText').textContent)}</b><small>Share this code (and the password if you set one) with your partner. Progress is saved automatically.</small></span><button class="btn" data-act="copycode">Copy</button></div>
      <div class="row"><span class="ic">🔗</span><span class="t"><b>Invite link</b><small>Opens the join screen with the code filled in.</small></span><button class="btn" data-act="copylink">Copy</button></div>
      <div class="row"><span class="ic">🖥️</span><span class="t"><b>Fullscreen</b></span><button class="btn" data-act="fs">Toggle</button></div>
      <div class="row"><span class="ic">🚪</span><span class="t"><b>Leave island</b><small>Your progress stays saved. Rejoin any time with the same code and name.</small></span><button class="btn" data-act="leave">Leave</button></div>`;
  }
}
function openPanel(kind) { panelKind = kind; $('panel').hidden = false; renderPanel(); }
function closePanel() { panelKind = null; $('panel').hidden = true; }
$('panelClose').onclick = closePanel;
$('panel').addEventListener('pointerdown', (e) => { if (e.target === $('panel')) closePanel(); });
$('panelBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const a = b.dataset.act, id = b.dataset.id;
  if (a === 'eat') socket.emit('eat', { item: id });
  else if (a === 'craft') socket.emit('craft', { tool: id });
  else if (a === 'build') { closePanel(); startPlace(id); }
  else if (a === 'stash') socket.emit('stash', { item: id, dir: b.dataset.dir, qty: +b.dataset.q });
  else if (a === 'copycode') copy($('codeText').textContent);
  else if (a === 'copylink') copy(`${location.origin}/?room=${$('codeText').textContent}`);
  else if (a === 'fs') (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
  else if (a === 'leave') { session = null; location.reload(); }
});
function copy(t) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Copied ' + t, 'good'), () => toast(t)); }
$('btnCode').onclick = () => copy($('codeText').textContent);
$('btnBag').onclick = () => (panelKind === 'bag' ? closePanel() : openPanel('bag'));
$('btnMake').onclick = () => (panelKind === 'make' ? closePanel() : openPanel('make'));
$('btnMenu').onclick = () => (panelKind === 'menu' ? closePanel() : openPanel('menu'));
$('btnChat').onclick = openChat;
$('btnWake').onclick = () => socket.emit('wake');

function openChat() { $('chatForm').hidden = false; $('chatInput').focus(); }
$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault(); const t = $('chatInput').value.trim();
  if (t) socket.emit('chat', { text: t });
  $('chatInput').value = ''; $('chatForm').hidden = true; $('chatInput').blur();
});
const typing = () => document.activeElement && document.activeElement.tagName === 'INPUT';

/* ================================================================ placement */
let placing = null, ghost = null, placeValid = true, placeCool = 0;
function startPlace(type) {
  cancelPlace();
  const def = W.BUILDS[type];
  placing = { type, ry: me ? me.ry : 0, x: 0, z: 0 };
  ghost = new THREE.Mesh(Mo.geos[type], ghostMat.clone()); scene.add(ghost);
  $('placeName').textContent = `${def.icon} ${def.name}`; $('placeBar').hidden = false;
}
function cancelPlace() { placing = null; if (ghost) { scene.remove(ghost); ghost = null; } $('placeBar').hidden = true; }
function confirmPlace() {
  if (!placing || performance.now() < placeCool) return;
  if (!placeValid) return toast('Can’t build there', 'warn');
  placeCool = performance.now() + 300;
  socket.emit('build', { type: placing.type, x: placing.x, z: placing.z, ry: placing.ry });
}
$('plRot').onclick = () => { if (placing) placing.ry += Math.PI / 4; };
$('plOk').onclick = confirmPlace; $('plNo').onclick = cancelPlace;
function updateGhost() {
  if (!placing) return;
  const def = W.BUILDS[placing.type], d = def.shore ? 4.2 : 3.4;
  placing.x = me.x + Math.sin(me.ry) * d; placing.z = me.z + Math.cos(me.ry) * d;
  const h = gy(placing.x, placing.z);
  placeValid = def.shore ? (h < 0.9 && h > -0.5) : (h > 0.35 && !world.nearPond(placing.x, placing.z, 0.8));
  if (placeValid) {
    for (const s of structs.values()) if (Math.hypot(s.x - placing.x, s.z - placing.z) < (W.BUILDS[s.type].r + def.r) * 0.9) { placeValid = false; break; }
  }
  ghost.position.set(placing.x, def.shore ? Math.max(h, -0.1) : h, placing.z); ghost.rotation.y = placing.ry;
  ghost.material.emissive.setHex(placeValid ? 0x0c3a12 : 0x6a1010);
}

/* ================================================================== input */
const keys = {}, cam = { yaw: 0, pitch: 0.55, dist: isTouch ? 10 : 8.5 };
let sprintOn = false, holdAct = false, lastUse = 0;

addEventListener('keydown', (e) => {
  if (typing()) { if (e.key === 'Escape') { $('chatForm').hidden = true; $('chatInput').blur(); } return; }
  if ($('hud').hidden) return;
  keys[e.code] = true;
  if (e.code === 'KeyE' || e.code === 'Space') { holdAct = true; interact(); e.preventDefault(); }
  else if (e.code === 'KeyF') doFish();
  else if (e.code === 'KeyB') $('btnMake').click();
  else if (e.code === 'KeyI') $('btnBag').click();
  else if (e.code === 'KeyR' && placing) placing.ry += Math.PI / 4;
  else if (e.code === 'Enter') { if (placing) confirmPlace(); else { openChat(); e.preventDefault(); } }
  else if (e.code === 'Escape') { if (placing) cancelPlace(); else if (panelKind) closePanel(); else openPanel('menu'); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'KeyE' || e.code === 'Space') holdAct = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; holdAct = false; });

// camera drag / pinch / wheel
const ptrs = new Map(); let pinch0 = 0;
const pdist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
canvas.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId); if (ptrs.size === 2) pinch0 = pdist(); });
canvas.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 1) { cam.yaw -= dx * 0.0065; cam.pitch = clamp(cam.pitch + dy * 0.005, 0.12, 1.3); }
  else if (ptrs.size === 2) { const d = pdist(); cam.dist = clamp(cam.dist * pinch0 / d, 4, 18); pinch0 = d; }
});
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, (e) => ptrs.delete(e.pointerId));
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + e.deltaY * 0.008, 4, 18); e.preventDefault(); }, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// virtual joystick (floating)
const joy = { x: 0, y: 0, id: null, cx: 0, cy: 0 };
{
  const jz = $('joyzone'), jb = $('joybase'), js = $('joystick');
  jz.addEventListener('pointerdown', (e) => {
    if (joy.id !== null) return; joy.id = e.pointerId; jz.setPointerCapture(e.pointerId);
    joy.cx = e.clientX; joy.cy = e.clientY;
    const r = jz.getBoundingClientRect(); jb.style.left = (e.clientX - r.left) + 'px'; jb.style.top = (e.clientY - r.top) + 'px'; jb.classList.add('on');
    e.preventDefault();
  });
  jz.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joy.id) return;
    const R = jb.offsetWidth / 2; let dx = e.clientX - joy.cx, dy = e.clientY - joy.cy; const l = Math.hypot(dx, dy);
    if (l > R) { dx = dx / l * R; dy = dy / l * R; }
    joy.x = dx / R; joy.y = -dy / R; js.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
  const end = (e) => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; jb.classList.remove('on'); js.style.transform = 'translate(-50%,-50%)'; };
  jz.addEventListener('pointerup', end); jz.addEventListener('pointercancel', end);
}
$('btnAct').addEventListener('pointerdown', (e) => { holdAct = true; interact(); e.preventDefault(); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('btnAct').addEventListener(ev, () => { holdAct = false; });
$('btnFish').addEventListener('pointerdown', (e) => { doFish(); e.preventDefault(); });
$('btnSprint').addEventListener('pointerdown', (e) => { sprintOn = !sprintOn; $('btnSprint').classList.toggle('on', sprintOn); e.preventDefault(); });

/* ============================================================== interaction */
const RESL = { palm: ['Chop palm', '🪓', 'Chop'], rock: ['Mine rock', '⛏️', 'Mine'], bush: ['Pick berries', '🫐', 'Pick'], grass: ['Gather fiber', '🌿', 'Gather'] };
let target = null;
const fwd = () => ({ x: Math.sin(me.ry), z: Math.cos(me.ry) });
function canFish() {
  if (!me || !meState || !meState.tools.rod || meState.sleeping || meState.fishing) return false;
  const f = fwd(); return gy(me.x + f.x * 3.5, me.z + f.z * 3.5) < -0.2;
}
function findTarget() {
  let best = null, bd = 1e9;
  const consider = (kind, id, label, icon, short, x, z, rr, reach) => {
    const d = Math.hypot(x - me.x, z - me.z) - rr;
    if (d < reach && d < bd) { bd = d; best = { kind, id, label, icon, short, x, z, rr: Math.max(rr, 0.5) }; }
  };
  for (const r of res.values()) if (r.alive) { const l = RESL[r.t]; consider('res', r.id, l[0], l[1], l[2], r.x, r.z, W.RES[r.t].r, 3.0); }
  for (const a of animals.values()) consider('animal', a.id, 'Hunt ' + W.ANIMALS[a.type].name.toLowerCase(), '⚔️', 'Hit', a.x, a.z, 0.5, meState && meState.tools.spear ? 4.0 : 3.0);
  for (const s of structs.values()) {
    const rr = W.BUILDS[s.type].r;
    if (s.type === 'campfire') consider('struct', s.id, s.lit ? 'Cook / add wood' : 'Light the fire', '🔥', s.lit ? 'Cook' : 'Light', s.x, s.z, rr, 3.0);
    else if (s.type === 'hut') consider('struct', s.id, W.isNight(tod) ? 'Sleep in the hut' : 'Hut (sleep at night)', '😴', 'Sleep', s.x, s.z, rr, 3.2);
    else if (s.type === 'storage') consider('struct', s.id, 'Open chest', '📦', 'Open', s.x, s.z, rr, 3.0);
    else if (s.type === 'raft') consider('struct', s.id, 'Your escape raft', '⛵', 'Raft', s.x, s.z, rr, 3.0);
  }
  const pd = world.pondDist(me.x, me.z) - world.pond.r;
  if (pd < 2.2 && pd < bd) best = { kind: 'pond', id: 0, label: 'Drink water', icon: '💧', short: 'Drink', x: world.pond.x, z: world.pond.z, rr: world.pond.r };
  return best;
}
function interact() {
  if (placing) return confirmPlace();
  if (!me || !meState || meState.sleeping) return;
  lastUse = performance.now();
  if (target) socket.emit('use', { kind: target.kind, id: target.id });
  else if (canFish()) doFish();
  else return;
  me.model.swing = 0.01;
}
function doFish() { if (placing) return; if (!meState || !meState.tools.rod) return toast('Craft a fishing rod first 🎣 (🔨 menu)', 'warn'); socket.emit('fish'); }

/* ================================================================ main loop */
const clock = new THREE.Clock();
let sendT = 0, lastSent = { x: 0, z: 0, ry: 0, mv: 0 }, miniT = 0, targetT = 0;
const PR = 0.35;

function collide(x, z) {
  for (const r of res.values()) {
    if (!r.alive || r.t === 'grass' || r.t === 'bush') continue;
    const rad = (r.t === 'rock' ? 0.85 * r.s : 0.38) + PR, dx = x - r.x, dz = z - r.z, d = Math.hypot(dx, dz);
    if (d < rad && d > 0.0001) { x = r.x + dx / d * rad; z = r.z + dz / d * rad; }
  }
  for (const s of structs.values()) {
    if (s.type === 'raft') continue;
    const rad = (s.type === 'hut' ? 1.25 : W.BUILDS[s.type].r * 0.85) + PR, dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz);
    if (d < rad && d > 0.0001) { x = s.x + dx / d * rad; z = s.z + dz / d * rad; }
  }
  return [x, z];
}

function updateLocal(dt) {
  let ix = 0, iz = 0;
  const lock = !!(meState && meState.sleeping) || typing();
  if (!lock) {
    if (keys.KeyW || keys.ArrowUp) iz += 1; if (keys.KeyS || keys.ArrowDown) iz -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1; if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    ix += joy.x; iz += joy.y;
  }
  const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
  const moving = l > 0.08;
  let sprint = false;
  if (moving) {
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const dx = fx * iz + rx * ix, dz = fz * iz + rz * ix, dl = Math.hypot(dx, dz) || 1;
    sprint = (keys.ShiftLeft || keys.ShiftRight || sprintOn) && meState && meState.energy > 3;
    let sp = (sprint ? 7.2 : 4.6) * Math.min(1, l * 1.1);
    if (gy(me.x, me.z) < -0.1) sp *= 0.65;
    if (meState && meState.energy < 15) sp *= 0.7;
    const nx = me.x + dx / dl * sp * dt, nz = me.z + dz / dl * sp * dt;
    let [cx, cz] = collide(nx, nz);
    if (!world.walkable(cx, cz)) { [cx, cz] = collide(nx, me.z); if (!world.walkable(cx, cz)) { [cx, cz] = collide(me.x, nz); if (!world.walkable(cx, cz)) { cx = me.x; cz = me.z; } } }
    me.x = cx; me.z = cz;
    me.tr = Math.atan2(dx, dz);
  }
  me.ry += angDiff(me.ry, me.tr) * Math.min(1, dt * 14);
  me.mv = moving ? 1 : 0; me.sprint = sprint;
  // network
  sendT += dt;
  const changed = Math.hypot(me.x - lastSent.x, me.z - lastSent.z) > 0.01 || Math.abs(me.ry - lastSent.ry) > 0.05 || me.mv !== lastSent.mv;
  if ((changed && sendT > 0.066) || sendT > 0.5) {
    sendT = 0; lastSent = { x: me.x, z: me.z, ry: me.ry, mv: me.mv };
    socket.volatile.emit('move', { x: +me.x.toFixed(2), z: +me.z.toFixed(2), ry: +me.ry.toFixed(2), mv: me.mv, sp: sprint ? 1 : 0 });
  }
}

function poseModel(p, dt, t) {
  const m = p.model, g = m.group;
  const sleeping = p.isMe ? meState && meState.sleeping : (p.flags & 1);
  const fishing = p.isMe ? meState && meState.fishing : (p.flags & 2);
  const swung = !p.isMe && (p.flags & 4);
  if (swung && m.swing <= 0) m.swing = 0.01;
  const gh = Math.max(gy(p.x, p.z), -0.3);
  p.y = lerp(p.y, gh, Math.min(1, dt * 14));
  g.position.set(p.x, p.y + (sleeping ? 0.3 : 0), p.z);
  g.rotation.y = p.ry; g.rotation.x = sleeping ? -Math.PI / 2 : 0;
  m.phase += dt * (p.mv ? (p.sprint ? 13 : 9) : 0);
  const sw = p.mv ? Math.sin(m.phase) * 0.8 : 0;
  m.legL.rotation.x = sw; m.legR.rotation.x = -sw; m.armL.rotation.x = -sw * 0.8; m.armR.rotation.x = sw * 0.8;
  if (m.swing > 0) { m.swing += dt; const k = m.swing / 0.35; m.armR.rotation.x = -Math.sin(Math.min(k, 1) * Math.PI) * 2.0; if (k >= 1) m.swing = 0; }
  if (fishing) { m.armR.rotation.x = -1.2 + Math.sin(t * 2) * 0.05; }
  m.rod.visible = !!fishing; p.bobber.visible = !!fishing;
  if (fishing) p.bobber.position.set(0, -g.position.y + 0.04 + Math.sin(t * 3) * 0.03, 3.5);
  g.visible = p.isMe ? true : (p.online !== false && !!(roster[p.id] && roster[p.id].online));
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  if (seaTex) { seaTex.offset.x += dt * 0.004; seaTex.offset.y += dt * 0.0025; }
  if (!world || !me || $('hud').hidden) { renderer.render(scene, camera); return; }

  // local-time creep so the sky is smooth between snapshots
  tod += dt * 24 / W.DAY_LEN; if (tod >= 24) tod -= 24;

  updateLocal(dt);
  me.y = lerp(me.y ?? 0, Math.max(gy(me.x, me.z), -0.3), Math.min(1, dt * 14));

  // other players
  for (const p of players.values()) {
    if (!p.isMe) {
      p.x = lerp(p.x, p.tx, Math.min(1, dt * 12)); p.z = lerp(p.z, p.tz, Math.min(1, dt * 12));
      p.ry += angDiff(p.ry, p.tr) * Math.min(1, dt * 12);
    }
    poseModel(p, dt, t);
  }
  // animals
  for (const a of animals.values()) {
    a.x = lerp(a.x, a.tx, Math.min(1, dt * 10)); a.z = lerp(a.z, a.tz, Math.min(1, dt * 10));
    a.ry += angDiff(a.ry, a.tr) * Math.min(1, dt * 10);
    a.ph += dt * (a.mv ? 10 : 1.5);
    let hop = 0; if (a.hop > 0) { a.hop -= dt; hop = Math.sin((a.hop / 0.25) * Math.PI) * 0.3; }
    a.mesh.position.set(a.x, gy(a.x, a.z) + (a.mv ? Math.abs(Math.sin(a.ph)) * 0.08 : 0) + hop, a.z);
    a.mesh.rotation.y = a.ry; a.mesh.rotation.z = a.mv ? Math.sin(a.ph) * 0.05 : 0;
  }
  // resources: shake + pop
  for (const r of res.values()) {
    if (r.shake > 0) {
      r.shake -= dt; const k = Math.max(r.shake, 0) / 0.25;
      r.mesh.rotation.z = Math.sin(t * 70) * 0.08 * k; r.mesh.rotation.x = Math.cos(t * 63) * 0.06 * k;
      if (r.shake <= 0) { r.mesh.rotation.z = r.mesh.rotation.x = 0; r.mesh.visible = r.alive; }
    }
    if (r.pop < 1) { r.pop = Math.min(1, r.pop + dt * 2.5); r.mesh.scale.setScalar(r.s * (0.2 + 0.8 * r.pop)); }
  }
  // campfire flames + lights
  const lit = [];
  for (const s of structs.values()) {
    if (s.type !== 'campfire') continue;
    const f = s.mesh.userData.flame; if (!f) continue;
    if (s.lit) { f.scale.set(1 + Math.sin(t * 17 + s.id) * 0.12, 1 + Math.sin(t * 23 + s.id * 2) * 0.2, 1 + Math.sin(t * 19) * 0.1); lit.push(s); }
  }
  lit.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
  fireLights.forEach((l, i) => {
    const s = lit[i];
    if (!s) { l.intensity = 0; return; }
    l.position.set(s.x, gy(s.x, s.z) + 1.4, s.z); l.intensity = 38 + Math.sin(t * 20 + i) * 6 + Math.sin(t * 7.3) * 4;
  });

  updateGhost();

  // target highlight / prompts
  targetT -= dt;
  if (targetT <= 0 && !placing) {
    targetT = 0.1; target = findTarget();
    const showFish = !target && canFish();
    const label = target ? target.label : showFish ? 'Fish' : '';
    const key = target ? 'E' : 'F';
    $('prompt').innerHTML = label ? `<kbd>${key}</kbd>${esc(label)}` : '';
    $('prompt').classList.toggle('show', !!label);
    $('actLabel').innerHTML = target ? `${target.icon}<span>${target.short}</span>` : showFish ? '🎣<span>Fish</span>' : '✋';
    $('btnFish').hidden = !(meState && meState.tools.rod);
  }
  if (placing) { target = null; $('prompt').classList.remove('show'); }
  if (target && !placing) {
    ring.visible = true; const gh = target.kind === 'pond' ? world.pond.level : gy(target.x, target.z);
    ring.position.set(target.x, gh + 0.08, target.z); ring.scale.setScalar(target.rr + 0.35 + Math.sin(t * 6) * 0.05);
    if (target.kind === 'pond') ring.visible = false;
  } else ring.visible = false;
  if (holdAct && !placing && performance.now() - lastUse > 430 && target) interact();

  // camera
  const cp = Math.cos(cam.pitch), tx = me.x, ty = me.y + 1.5, tz = me.z;
  const cx = tx + Math.sin(cam.yaw) * cp * cam.dist, cz = tz + Math.cos(cam.yaw) * cp * cam.dist;
  const cy = Math.max(ty + Math.sin(cam.pitch) * cam.dist, gy(cx, cz) + 0.8, 0.6);
  camera.position.set(cx, cy, cz); camera.lookAt(tx, ty, tz);
  sun.target.position.set(me.x, 0, me.z);
  applyTime();

  // name labels
  const v = new THREE.Vector3();
  for (const p of players.values()) {
    if (p.isMe) continue;
    v.set(p.x, p.y + 2.2, p.z).project(camera);
    const vis = v.z < 1 && p.model.group.visible;
    p.label.style.display = vis ? 'block' : 'none';
    if (vis) { p.label.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px'; p.label.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px'; }
  }

  miniT -= dt; if (miniT <= 0) { miniT = 0.2; drawMini(); }
  renderer.render(scene, camera);
}

function drawMini() {
  const c = $('minimap'), g = c.getContext('2d'); if (!miniBase) return;
  g.clearRect(0, 0, 128, 128); g.drawImage(miniBase, 0, 0);
  for (const s of structs.values()) { g.fillStyle = s.type === 'campfire' && s.lit ? '#ff9a3c' : '#6b4a2a'; g.fillRect(s.x + 64 - 2, s.z + 64 - 2, 4, 4); }
  for (const a of animals.values()) { g.fillStyle = a.type === 'wolf' ? '#ff3030' : a.type === 'boar' ? '#a05a2a' : '#c9a066'; g.fillRect(a.x + 64 - 1.5, a.z + 64 - 1.5, 3, 3); }
  for (const p of players.values()) {
    if (!p.isMe && !(roster[p.id] && roster[p.id].online)) continue;
    g.fillStyle = CSS_COL[(roster[p.id] ? roster[p.id].color : 0) % 4]; g.strokeStyle = '#fff'; g.lineWidth = p.isMe ? 1.5 : 1;
    g.beginPath(); g.arc(p.x + 64, p.z + 64, p.isMe ? 4 : 3.5, 0, 7); g.fill(); g.stroke();
  }
}

requestAnimationFrame(frame);
window.__castaway = { get me() { return me; }, get world() { return world; }, socket, cam, players, res, structs, animals, get meState() { return meState; } };

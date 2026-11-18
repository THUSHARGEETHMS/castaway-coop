// Low-poly models built from merged, vertex-coloured primitives (1 draw call each).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });

const box = () => new THREE.BoxGeometry(1, 1, 1);
const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, s = 6) => new THREE.ConeGeometry(r, h, s);
const ico = (r) => new THREE.IcosahedronGeometry(r, 0);
const dod = (r) => new THREE.DodecahedronGeometry(r, 0);

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function P(geo, hex, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  let g = geo.clone();
  if (g.index) g = g.toNonIndexed();   // polyhedra are non-indexed; unify so merge works
  _m.compose(_v.set(...p), _q.setFromEuler(_e.set(...r)), _s.set(...s));
  g.applyMatrix4(_m);
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const M = (...parts) => mergeGeometries(parts.flat());

export const geos = {};

// ---------- resources ----------
{
  const parts = [P(cyl(0.16, 0.27, 5, 6), 0x8b6b45, [0, 2.5, 0], [0.04, 0, 0.05])];
  for (let y = 0.6; y < 5; y += 0.9) parts.push(P(cyl(0.29, 0.29, 0.07, 6), 0x6e5234, [0, y, 0]));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(P(box(), i % 2 ? 0x3f9b3a : 0x2c8a34, [Math.cos(a) * 1.2, 4.95, Math.sin(a) * 1.2], [0, -a, -0.35], [2.6, 0.06, 0.8]));
  }
  parts.push(P(sph(0.22), 0x5a3a1e, [0.2, 4.8, 0.1]), P(sph(0.2), 0x5a3a1e, [-0.18, 4.78, -0.12]));
  geos.palm = M(parts);
}
geos.rock = M(P(ico(1), 0x8d8f93, [0, 0.45, 0], [0.3, 0.5, 0.1], [1.1, 0.75, 0.95]),
              P(ico(0.6), 0x777a7e, [0.8, 0.25, 0.3], [0.1, 1.2, 0.4], [1, 0.8, 1]),
              P(ico(0.45), 0x9a9ca0, [-0.6, 0.2, -0.5], [0.5, 0.2, 0.9]));
{
  const parts = [P(sph(0.55), 0x3f8f3f, [0, 0.45, 0], [0, 0, 0], [1, 0.85, 1]), P(sph(0.45), 0x4aa04a, [0.45, 0.35, 0.15]),
                 P(sph(0.42), 0x377f37, [-0.4, 0.35, -0.2])];
  [[0.3, 0.7, 0.35], [-0.2, 0.75, 0.4], [0.55, 0.4, -0.2], [-0.5, 0.5, 0.25], [0.05, 0.9, -0.1], [0.7, 0.5, 0.4]]
    .forEach((p, i) => parts.push(P(sph(0.09, 5, 4), i % 2 ? 0xc7324f : 0x8a3cc8, p)));
  geos.bush = M(parts);
}
{
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9;
    parts.push(P(cone(0.09, 0.75, 4), i % 2 ? 0x8fcf4a : 0x6fb43a, [Math.cos(a) * 0.18, 0.37, Math.sin(a) * 0.18], [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]));
  }
  geos.grass = M(parts);
}

// ---------- structures ----------
geos.hut = M(
  P(box(), 0x8a6a45, [0, 0.05, 0], [0, 0, 0], [3, 0.1, 3.4]),
  P(box(), 0xc9a557, [-0.75, 1.1, 0], [0, 0, 0.95], [2.1, 0.12, 3.5]),
  P(box(), 0xb8913f, [0.75, 1.1, 0], [0, 0, -0.95], [2.1, 0.12, 3.5]),
  P(cyl(0.1, 0.1, 3.7, 6), 0x5a3d22, [0, 1.95, 0], [Math.PI / 2, 0, 0]),
  P(box(), 0x6d4f31, [0, 0.75, -1.68], [0, 0, 0], [2.3, 1.5, 0.1]),
  P(cyl(0.08, 0.08, 1.9, 6), 0x5a3d22, [-1.2, 0.95, 1.68]), P(cyl(0.08, 0.08, 1.9, 6), 0x5a3d22, [1.2, 0.95, 1.68]),
  P(box(), 0xd9c9a0, [0, 0.14, 0.3], [0, 0, 0], [1.3, 0.06, 1.6]));
{
  const parts = [P(cyl(0.45, 0.5, 0.1, 8), 0x3a3028, [0, 0.04, 0]),
                 P(cyl(0.07, 0.07, 1, 5), 0x6b4a2a, [0, 0.18, 0], [0, 0.5, Math.PI / 2]),
                 P(cyl(0.07, 0.07, 1, 5), 0x5a3d22, [0, 0.26, 0], [0, -0.7, Math.PI / 2])];
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; parts.push(P(dod(0.17), 0x8d8f93, [Math.cos(a) * 0.62, 0.14, Math.sin(a) * 0.62])); }
  geos.campfire = M(parts);
}
geos.storage = M(
  P(box(), 0x8a5a2b, [0, 0.28, 0], [0, 0, 0], [1, 0.55, 0.7]), P(box(), 0x7a4d22, [0, 0.66, 0], [0, 0, 0], [1.04, 0.2, 0.74]),
  P(box(), 0x444444, [-0.3, 0.4, 0], [0, 0, 0], [0.08, 0.8, 0.76]), P(box(), 0x444444, [0.3, 0.4, 0], [0, 0, 0], [0.08, 0.8, 0.76]),
  P(box(), 0xd8b04a, [0, 0.55, 0.37], [0, 0, 0], [0.12, 0.16, 0.04]));
geos.fence = M(
  ...[-0.9, 0, 0.9].map((x) => P(cyl(0.07, 0.09, 1.15, 6), 0x7a5a38, [x, 0.57, 0])),
  P(box(), 0x8a6a45, [0, 0.4, 0], [0, 0, 0], [2, 0.1, 0.08]), P(box(), 0x8a6a45, [0, 0.82, 0], [0, 0, 0], [2, 0.1, 0.08]));
{
  const parts = [];
  for (let i = -2; i <= 2; i++) parts.push(P(cyl(0.2, 0.2, 3.8, 7), i % 2 ? 0x9a7448 : 0x8a6a40, [i * 0.45, 0.14, 0], [Math.PI / 2, 0, 0]));
  parts.push(P(box(), 0x6d4f31, [0, 0.4, 0.9], [0, 0, 0], [2.4, 0.08, 0.25]), P(box(), 0x6d4f31, [0, 0.4, -0.9], [0, 0, 0], [2.4, 0.08, 0.25]),
             P(cyl(0.07, 0.08, 3.2, 6), 0x5a3d22, [0, 1.8, -0.3]), P(box(), 0xf3e9d2, [0.85, 2.2, -0.3], [0, 0, 0], [1.6, 1.7, 0.04]));
  geos.raft = M(parts);
}
// shipwreck decor at the crash site
geos.wreck = M(
  P(box(), 0x7a5a38, [0, 0.4, 0], [0.1, 0, 0.35], [3.4, 0.2, 1.2]), P(box(), 0x6d4f31, [-1.3, 0.8, 0.6], [0.2, 0.4, 1.1], [2.2, 0.15, 0.6]),
  P(box(), 0x8a6a45, [1.6, 0.15, 1.8], [0, 0.8, 0.1], [2.2, 0.1, 0.4]), P(box(), 0x8a6a45, [-2.2, 0.15, -1.2], [0, -0.4, 0], [1.8, 0.1, 0.4]),
  P(cyl(0.35, 0.35, 0.8, 8), 0x9a6a3a, [2.4, 0.4, -0.8]), P(box(), 0xe8e0c8, [0.5, 0.12, -2], [0, 0.5, 0.05], [1.2, 0.04, 0.8]));

// ---------- animals ----------
function legs(color, w, h, x, zs, y = 0) { return zs.flatMap((z) => [-x, x].map((px) => P(box(), color, [px, h / 2 + y, z], [0, 0, 0], [w, h, w]))); }
geos.deer = M(
  P(box(), 0xb07a46, [0, 0.95, 0], [0, 0, 0], [0.5, 0.55, 1.1]), P(box(), 0xb07a46, [0, 1.3, 0.6], [0.5, 0, 0], [0.2, 0.55, 0.22]),
  P(box(), 0xc08a54, [0, 1.62, 0.85], [0, 0, 0], [0.24, 0.24, 0.42]), P(box(), 0xf2efe6, [0, 0.9, -0.58], [0, 0, 0], [0.18, 0.2, 0.08]),
  P(cyl(0.02, 0.02, 0.4, 4), 0xd8c8a0, [-0.1, 1.9, 0.75], [0, 0, 0.3]), P(cyl(0.02, 0.02, 0.4, 4), 0xd8c8a0, [0.1, 1.9, 0.75], [0, 0, -0.3]),
  ...legs(0x8a5a2e, 0.1, 0.7, 0.18, [-0.4, 0.4]));
geos.boar = M(
  P(box(), 0x4a3a30, [0, 0.8, 0], [0, 0, 0], [0.75, 0.7, 1.25]), P(box(), 0x3d2f27, [0, 0.8, 0.85], [0, 0, 0], [0.55, 0.55, 0.5]),
  P(box(), 0x8a6a5a, [0, 0.68, 1.18], [0, 0, 0], [0.28, 0.22, 0.25]), P(box(), 0x2a2220, [0, 1.2, -0.05], [0, 0, 0], [0.16, 0.16, 0.95]),
  P(cone(0.05, 0.25, 4), 0xf0ead8, [-0.14, 0.62, 1.22], [0, 0, 0.5]), P(cone(0.05, 0.25, 4), 0xf0ead8, [0.14, 0.62, 1.22], [0, 0, -0.5]),
  ...legs(0x2a2220, 0.14, 0.5, 0.25, [-0.45, 0.45]));
geos.wolf = M(
  P(box(), 0x6c7078, [0, 0.92, 0], [0, 0, 0], [0.45, 0.5, 1.1]), P(box(), 0x5a5e66, [0, 1.12, 0.8], [0, 0, 0], [0.34, 0.32, 0.42]),
  P(box(), 0x4a4e55, [0, 1.04, 1.12], [0, 0, 0], [0.18, 0.16, 0.3]), P(box(), 0xff3030, [-0.1, 1.2, 1.0], [0, 0, 0], [0.05, 0.05, 0.05]),
  P(box(), 0xff3030, [0.1, 1.2, 1.0], [0, 0, 0], [0.05, 0.05, 0.05]), P(cone(0.08, 0.2, 4), 0x4a4e55, [-0.12, 1.4, 0.7]),
  P(cone(0.08, 0.2, 4), 0x4a4e55, [0.12, 1.4, 0.7]), P(box(), 0x5a5e66, [0, 1.0, -0.75], [-0.6, 0, 0], [0.13, 0.13, 0.6]),
  ...legs(0x50545c, 0.11, 0.75, 0.16, [-0.4, 0.4]));

// ---------- player ----------
export function makePlayer(shirtHex) {
  const g = new THREE.Group();
  const mk = (geo) => { const m = new THREE.Mesh(geo, vcMat); m.castShadow = true; return m; };
  const body = mk(M(P(box(), shirtHex, [0, 1.08, 0], [0, 0, 0], [0.52, 0.64, 0.3]), P(sph(0.22), 0xf0c8a0, [0, 1.62, 0]),
                    P(sph(0.235), 0x3a2a1e, [0, 1.7, -0.02], [0, 0, 0], [1, 0.62, 1]), P(box(), 0x3b4a6b, [0, 0.74, 0], [0, 0, 0], [0.5, 0.14, 0.3])));
  const leg = () => { const m = mk(P(box(), 0x3b4a6b, [0, -0.33, 0], [0, 0, 0], [0.18, 0.66, 0.2])); return m; };
  const arm = () => { const m = mk(P(box(), 0xf0c8a0, [0, -0.28, 0], [0, 0, 0], [0.14, 0.58, 0.16])); return m; };
  const legL = leg(), legR = leg(), armL = arm(), armR = arm();
  legL.position.set(-0.14, 0.72, 0); legR.position.set(0.14, 0.72, 0);
  armL.position.set(-0.35, 1.36, 0); armR.position.set(0.35, 1.36, 0);
  const rod = new THREE.Mesh(M(P(cyl(0.025, 0.03, 1.9, 5), 0x7a5a38, [0, -0.3, 0.8], [1.1, 0, 0])), vcMat);
  rod.visible = false; armR.add(rod);
  g.add(body, legL, legR, armL, armR);
  return { group: g, body, legL, legR, armL, armR, rod, phase: 0, swing: 0 };
}

export function makeFlame() {
  const g = new THREE.Group();
  const a = new THREE.Mesh(cone(0.28, 0.85, 6), new THREE.MeshBasicMaterial({ color: 0xff8a1e, transparent: true, opacity: 0.92 }));
  const b = new THREE.Mesh(cone(0.16, 0.6, 6), new THREE.MeshBasicMaterial({ color: 0xffdf70, transparent: true, opacity: 0.95 }));
  a.position.y = 0.55; b.position.y = 0.5; g.add(a, b);
  return g;
}
export const makeRing = (r = 1) => {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 28), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; return m;
};

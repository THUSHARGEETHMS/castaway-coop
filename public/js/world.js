/* Shared by server (require) and browser (window.World).
   Deterministic island terrain + game data tables. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.World = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY_LEN = 180;   // real seconds per in-game day (24h)
  const WIN_DAY = 30;    // survive until this day ends
  const MAX_PLAYERS = 2;

  const ITEMS = {
    wood:       { name: 'Wood',         icon: '🪵' },
    stone:      { name: 'Stone',        icon: '🪨' },
    fiber:      { name: 'Fiber',        icon: '🌿' },
    berry:      { name: 'Berries',      icon: '🫐' },
    coconut:    { name: 'Coconut',      icon: '🥥' },
    rawMeat:    { name: 'Raw meat',     icon: '🥩' },
    cookedMeat: { name: 'Cooked meat',  icon: '🍖' },
    rawFish:    { name: 'Raw fish',     icon: '🐟' },
    cookedFish: { name: 'Cooked fish',  icon: '🍣' },
  };
  // hunger / thirst / hp gained when eaten
  const FOOD = {
    berry:      { hunger: 8,  thirst: 3,  hp: 0 },
    coconut:    { hunger: 6,  thirst: 18, hp: 0 },
    rawMeat:    { hunger: 12, thirst: 0,  hp: -5 },
    cookedMeat: { hunger: 35, thirst: 0,  hp: 6 },
    rawFish:    { hunger: 8,  thirst: 0,  hp: -2 },
    cookedFish: { hunger: 28, thirst: 0,  hp: 4 },
  };
  const RAW_TO_COOKED = { rawMeat: 'cookedMeat', rawFish: 'cookedFish' };

  const TOOLS = {
    axe:   { name: 'Stone axe',    icon: '🪓', cost: { wood: 3, stone: 3 },           desc: 'Chop and mine faster' },
    spear: { name: 'Spear',        icon: '🔱', cost: { wood: 3, stone: 2, fiber: 2 }, desc: 'Hunt with more damage and reach' },
    rod:   { name: 'Fishing rod',  icon: '🎣', cost: { wood: 2, fiber: 3 },           desc: 'Face the sea and press F' },
  };

  const BUILDS = {
    campfire: { name: 'Campfire',  icon: '🔥', cost: { wood: 3, stone: 2 },  r: 0.6, desc: 'Warmth, light, cooking. Scares animals.' },
    hut:      { name: 'Shelter hut', icon: '🛖', cost: { wood: 12, fiber: 6 }, r: 1.6, desc: 'Warm place to sleep at night.' },
    storage:  { name: 'Storage chest', icon: '📦', cost: { wood: 6, fiber: 2 }, r: 0.9, desc: 'Shared stash for both players.' },
    fence:    { name: 'Fence',     icon: '🚧', cost: { wood: 2 },            r: 1.0, desc: 'Blocks wolves and boars.' },
    raft:     { name: 'Escape raft', icon: '⛵', cost: { wood: 20, fiber: 10 }, r: 2.0, shore: true, desc: 'Build on the shoreline to escape the island!' },
  };

  const RES = {
    palm:  { name: 'Palm tree',  hp: 6, r: 0.45, respawn: 150 },
    rock:  { name: 'Rock',       hp: 7, r: 1.0,  respawn: 220 },
    bush:  { name: 'Berry bush', hp: 2, r: 0.6,  respawn: 100 },
    grass: { name: 'Fiber grass', hp: 1, r: 0.3, respawn: 70 },
  };

  const ANIMALS = {
    deer: { name: 'Deer', hp: 6,  meat: 2 },
    boar: { name: 'Boar', hp: 12, meat: 3 },
    wolf: { name: 'Wolf', hp: 16, meat: 2 },
  };

  const isNight = (tod) => tod >= 19.5 || tod < 5.5;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(ix, iz, seed) {
    let n = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1274126177)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967295;
  }
  function noise(x, z, seed) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed);
    const c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function smooth(e0, e1, x) {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  function create(seed) {
    const rnd = mulberry32(seed);
    const ph = [rnd() * 6.2832, rnd() * 6.2832, rnd() * 6.2832];
    const radiusAt = (th) => 50 + 5 * Math.sin(3 * th + ph[0]) + 3 * Math.sin(5 * th + ph[1]) + 2 * Math.sin(8 * th + ph[2]);

    function rawH(x, z) {
      const d = Math.hypot(x, z), R = radiusAt(Math.atan2(z, x)), t = d / R;
      let h;
      if (t <= 1) {
        const k = 1 - t * t, w = Math.min(1, k * 3);
        h = k * 5.2 + (noise(x * 0.06, z * 0.06, seed) * 2 - 1) * 1.4 * w + (noise(x * 0.19, z * 0.19, seed + 7) * 2 - 1) * 0.45 * w;
      } else {
        h = -(t - 1) * 16;
      }
      return Math.max(h, -7);
    }

    const pa = rnd() * Math.PI * 2, pr = 20 + rnd() * 10;
    const pond = { x: Math.cos(pa) * pr, z: Math.sin(pa) * pr, r: 3.4 };
    const hp0 = rawH(pond.x, pond.z);
    pond.level = hp0 - 0.75;

    function height(x, z) {
      let h = rawH(x, z);
      const d = Math.hypot(x - pond.x, z - pond.z);
      if (d < pond.r + 8) {
        h += (hp0 - h) * smooth(pond.r + 7, pond.r + 1, d);
        h -= 1.5 * smooth(pond.r + 1.8, pond.r * 0.5, d);
      }
      return h;
    }
    const pondDist = (x, z) => Math.hypot(x - pond.x, z - pond.z);
    const nearPond = (x, z, range) => pondDist(x, z) < pond.r + range;
    function walkable(x, z) {
      if (Math.abs(x) > 92 || Math.abs(z) > 92) return false;
      if (pondDist(x, z) < pond.r * 0.6) return false;
      return height(x, z) > -0.5;
    }

    const sa = rnd() * Math.PI * 2;
    let r = 80;
    while (r > 0 && height(Math.cos(sa) * r, Math.sin(sa) * r) < 0.7) r -= 0.5;
    const spawn = { x: Math.cos(sa) * r, z: Math.sin(sa) * r };

    return { seed, height, walkable, pond, pondDist, nearPond, spawn, radiusAt };
  }

  return { DAY_LEN, WIN_DAY, MAX_PLAYERS, ITEMS, FOOD, RAW_TO_COOKED, TOOLS, BUILDS, RES, ANIMALS,
           isNight, mulberry32, noise, smooth, create };
});

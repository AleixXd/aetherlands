/* ============================================================
   utils.js — helpers, random, math, noise
   ============================================================ */
const Utils = {
  rand(a, b) { return a + Math.random() * (b - a); },
  irand(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
  chance(p) { return Math.random() < p; },
  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t) { return a + (b - a) * t; },
  damp(a, b, l, dt) { return Utils.lerp(a, b, 1 - Math.exp(-l * dt)); },
  angleDelta(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; },
  dampAngle(a, b, l, dt) { return a + Utils.angleDelta(a, b) * (1 - Math.exp(-l * dt)); },
  map(v, a, b, c, d) { return c + (v - a) * ((d - c) / (b - a)); },
  dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; },
  len(x, y, z) { return Math.sqrt(x * x + y * y + z * z); },
  fmt(n) { return Math.floor(n).toLocaleString("es-ES"); },
  uid() { return (Math.random().toString(36).substr(2, 6) + Date.now().toString(36).substr(-4)); },

  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },

  // Drops weight table as floats summing 1
  roll(table, rnd) {
    let r = (rnd !== undefined ? rnd : Math.random());
    for (const k in table) {
      r -= table[k];
      if (r <= 0) return k;
    }
    return Object.keys(table)[0];
  },

  // deterministic PRNG (mulberry32) for procedural generation
  mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  hash2(x, z) { // integer hash for biome ids
    let h = (x * 374761393 + z * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0);
  },

  // ---------- value noise (bilinear interpolated) ----------
  _makeNoise(seed) {
    const size = 512;
    const grid = new Float32Array(size * size);
    const rng = Utils.mulberry(seed);
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    return function (x, z) {
      const X = x % size; if (X < 0) return 0;
      const Z = z % size; if (Z < 0) return 0;
      const x0 = Math.floor(X), x1 = (x0 + 1) % size;
      const z0 = Math.floor(Z), z1 = (z0 + 1) % size;
      const tx = X - x0, tz = Z - z0;
      const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
      const v00 = grid[z0 * size + x0], v10 = grid[z0 * size + x1];
      const v01 = grid[z1 * size + x0], v11 = grid[z1 * size + x1];
      const a = v00 + (v10 - v00) * sx;
      const b = v01 + (v11 - v01) * sx;
      return a + (b - a) * sz;
    };
  },
  // ---------- shared material factory ----------
  // Shorthands: rough -> roughness, metal -> metalness.
  // Anything else (transparent, opacity, side, emissive,
  // emissiveIntensity, flatShading, wireframe, depthWrite...) passes through.
  mat(color, opts) {
    opts = opts || {};
    const params = { color: color };
    params.roughness = (opts.rough !== undefined) ? opts.rough : 0.85;
    params.metalness = (opts.metal !== undefined) ? opts.metal : 0.0;
    const pass = ["emissive", "emissiveIntensity", "transparent", "opacity", "side",
      "flatShading", "wireframe", "depthWrite", "alphaTest", "map", "color"];
    for (const k of pass) { if (opts[k] !== undefined) params[k] = opts[k]; }
    return new THREE.MeshStandardMaterial(params);
  },
};

// Multi-octave fBm noise builder
function makeFbm(seed, octaves, period) {
  const oct = octaves || 4;
  const layers = [];
  for (let i = 0; i < oct; i++) {
    layers.push({ noise: Utils._makeNoise(seed + i * 101), amp: Math.pow(0.5, i), freq: period * Math.pow(2, i) });
  }
  return function (x, z) {
    let sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      const lay = layers[i];
      sum += lay.noise(x / lay.freq, z / lay.freq) * lay.amp;
      norm += lay.amp;
    }
    return sum / norm;
  };
}
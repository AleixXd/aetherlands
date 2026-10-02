/* ============================================================
   world.js — procedural terrain, biomes, foliage, sky/water,
   lighting and fixed Points Of Interest (POIs).
   ============================================================ */
const World = {
  scene: null,
  terrain: new Map(),
  lastChunkKey: null,
  fbm: null, fbm2: null, fbm3: null,
  water: null, sun: null, hemi: null, moon: null,
  skyDome: null, stars: null, cloudGroup: null,
  timeOfDay: CFG.TIME.START_HOUR,
  roamEnemies: [],

  POIS: {
    town: { id: "town", type: "town", x: 0, z: 0 },
    castle: { id: "castle", type: "castle", x: 0, z: -96, minLevel: CFG.CASTLE.MIN_LEVEL },
    villages: [
      { id: "village_plains",  x: -470,  z: -260,  biome: "plains",   lvl: 6,  name: "Vado Sereno" },
      { id: "village_forest",  x: 960,   z: 700,   biome: "forest",   lvl: 12, name: "El Espinar" },
      { id: "village_desert",  x: -640,  z: 1240,  biome: "desert",   lvl: 16, name: "Velo de Arena" },
      { id: "village_tundra",  x: 320,   z: -1520, biome: "tundra",   lvl: 22, name: "Escarcha Blanca" },
      { id: "village_swamp",   x: -1420, z: -760,  biome: "swamp",    lvl: 28, name: "Los Musgares" },
      { id: "village_volcanic",x: 1980,  z: 720,   biome: "volcanic", lvl: 36, name: "La Cenicera" },
    ],
    bosses: [
      { id: "boss_slimeking", x: -560,  z: 220,  biome: "plains",   boss: "slimeking" },
      { id: "boss_treant",    x: 1080,  z: 980,  biome: "forest",   boss: "treant" },
      { id: "boss_scarabix",  x: -820,  z: 1380, biome: "desert",   boss: "scarabix" },
      { id: "boss_frostbrand",x: 460,   z: -1560,biome: "tundra",   boss: "frostbrand" },
      { id: "boss_bogcreed",  x: -1560, z: -820, biome: "swamp",    boss: "bogcreed" },
      { id: "boss_ashtyrant", x: 2160,  z: 980,  biome: "volcanic", boss: "ashtyrant" },
    ],
    caves: [
      { id: "cave_copper", x: -400,  z: 320,  lvl: 2,  name: "Cueva del Buscador",   ore: "ore_copper", nodes: 8 },
      { id: "cave_iron",   x: 780,   z: 540,  lvl: 8,  name: "Guarida del Barranco", ore: "ore_iron",   nodes: 9 },
      { id: "cave_silver", x: 1860,  z: -860, lvl: 16, name: "Cueva de los Ecos",     ore: "ore_silver", nodes: 10 },
      { id: "cave_aether", x: -1680, z: -1480,lvl: 26, name: "Cueva Umbría",          ore: "ore_aether", nodes: 8 },
      { id: "cave_deep",   x: 2400,  z: 1420, lvl: 34, name: "Cámara de Ceniza",      ore: "ore_aether", nodes: 9 },
    ],
  },

  allPoiBlends() { // [x, z, radius, targetHeight, hardCenter]
    const items = [[0, 0, 420, 2.0, 180], [0, -96, 80, 1.2, 30]];
    for (const v of this.POIS.villages) items.push([v.x, v.z, 150, 1.4, 60]);
    for (const b of this.POIS.bosses) items.push([b.x, b.z, 150, 1.2, 60]);
    for (const c of this.POIS.caves) items.push([c.x, c.z, 110, 1.2, 45]);
    return items;
  },

  init(scene) {
    this.scene = scene;
    this.fbm = makeFbm(20260901, 4, 260);
    this.fbm2 = makeFbm(77701, 3, 140);
    this.fbm3 = makeFbm(991, 2, 60);
    scene.fog = new THREE.FogExp2(0xbfd8a8, 0.0022);
    this.setupSky();
    this.setupLight();
    this.setupWater();
    this.setupClouds();
  },

  _angleDeg(x, z) {
    let a = Math.atan2(x, -z) * 180 / Math.PI;
    if (a < 0) a += 360;
    return a;
  },

  biomeAt(x, z) {
    const r = Math.sqrt(x * x + z * z);
    const a = this._angleDeg(x, z);
    if (r < 720) return BIOMES.plains;
    if (r > 1750 && a > 20 && a < 160) return BIOMES.volcanic;
    if (a < 42 || a > 318) return BIOMES.tundra;
    if (a < 138) return BIOMES.forest;
    if (a < 222) return BIOMES.desert;
    return BIOMES.swamp;
  },

  biomeIdAt(x, z) {
    const b = this.biomeAt(x, z);
    for (const k in BIOMES) if (BIOMES[k] === b) return k;
    return "plains";
  },

  heightAt(x, z) {
    const r = Math.sqrt(x * x + z * z);
    const b = this.biomeAt(x, z);
    const n1 = this.fbm(x * 0.0038, z * 0.0038);
    const n2 = this.fbm2(x * 0.0014, z * 0.0014);
    const n3 = this.fbm3(x * 0.02, z * 0.02);
    let val = n1 * 0.62 + n2 * 0.28 + n3 * 0.10;
    let amp = 22;
    if (b === BIOMES.tundra) amp = 46;
    else if (b === BIOMES.forest) amp = 34;
    else if (b === BIOMES.swamp) amp = 15;
    else if (b === BIOMES.volcanic) amp = 44;
    let h = (val - 0.5) * 2 * amp;

    // flatten around POIs (smooth fade)
    for (const [px, pz, rad, target, hard] of this.allPoiBlends()) {
      const d = Math.sqrt((x - px) * (x - px) + (z - pz) * (z - pz));
      if (d < rad) {
        const soft = Utils.clamp((d - hard) / (rad - hard), 0, 1);
        h = Utils.lerp(target, h, soft * soft * (3 - 2 * soft));
      }
    }
    // swamp lakes
    if (b === BIOMES.swamp && n1 < 0.40 && r > 520) h = Math.min(h, CFG.WORLD.WATER_LEVEL - 1.4);
    // world edge rise
    if (r > 3180) h += Math.pow((r - 3180) / 380, 2) * 20;
    return Utils.clamp(h, CFG.WORLD.MIN_HEIGHT, CFG.WORLD.MAX_HEIGHT);
  },

  /* --------------- scattered roaming spawns per biome --------------- */
  makeRoamSpawns() {
    const out = [];
    const rng = Utils.mulberry(4242);
    for (const biomeId in ENEMY_BIOMES) {
      if (biomeId === "castle" || biomeId === "cave") continue;
      const pool = ENEMY_BIOMES[biomeId];
      const spawnCount = { plains: 26, forest: 40, tundra: 36, desert: 36, swamp: 40, volcanic: 44 }[biomeId] || 30;
      for (let i = 0; i < spawnCount; i++) {
        const ang = rng() * Math.PI * 2;
        const rad = 700 + rng() * 2600;
        let x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
        // re-scatter until biome matches (cheap loop)
        let guard = 12;
        while (this.biomeIdAt(x, z) !== biomeId && guard-- > 0) {
          const a2 = rng() * Math.PI * 2, r2 = 700 + rng() * 2600;
          x = Math.cos(a2) * r2; z = Math.sin(a2) * r2;
        }
        if (guard <= 0) continue;
        const d = Math.sqrt(x * x + z * z);
        let ok = true;
        for (const [px, pz, rad, , hard] of this.allPoiBlends()) {
          if (Math.sqrt((x - px) ** 2 + (z - pz) ** 2) < hard + 30) { ok = false; break; }
        }
        if (!ok || d < 380) continue;
        out.push({ x, z, enemies: pool });
      }
    }
    this.roamEnemies = out;
  },

  /* ---------------------- terrain chunks ---------------------- */
  _chunkKey(cx, cz) { return cx + "," + cz; },

  // empuja a `ent` fuera de árboles/rocas del chunk (mundo exterior)
  solidPush(ent, pr) {
    const S = CFG.WORLD.CHUNK;
    const gx = Math.floor(ent.pos.x / S), gz = Math.floor(ent.pos.z / S);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const c = this.terrain.get(this._chunkKey(gx + i, gz + j));
        if (!c || !c.solids) continue;
        for (const s of c.solids) {
          const dx = ent.pos.x - s.x, dz = ent.pos.z - s.z;
          const rr = s.r + pr;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) {
            const l = Math.sqrt(d2);
            if (l < 0.001) { ent.pos.x = s.x + rr; ent.pos.z = s.z; }
            else { ent.pos.x = s.x + dx / l * rr; ent.pos.z = s.z + dz / l * rr; }
          }
        }
      }
    }
  },

  resetChunks() {
    for (const k of this.terrain.keys()) {
      const c = this.terrain.get(k);
      this._disposeChunk(c);
      this.terrain.delete(k);
    }
    this.lastChunkKey = null;
  },

  updateChunks(px, pz) {
    const half = Math.floor(CFG.WORLD.VIEW_CHUNKS / 2);
    const gx = Math.floor(px / CFG.WORLD.CHUNK);
    const gz = Math.floor(pz / CFG.WORLD.CHUNK);
    // clamp to world bounds
    const maxC = Math.floor(CFG.WORLD.SIZE / 2 / CFG.WORLD.CHUNK);
    const minC = -maxC;
    const need = new Set();
    for (let i = 0; i < CFG.WORLD.VIEW_CHUNKS; i++) {
      for (let j = 0; j < CFG.WORLD.VIEW_CHUNKS; j++) {
        const cx = Utils.clamp(gx + i - half, minC, maxC);
        const cz = Utils.clamp(gz + j - half, minC, maxC);
        need.add(this._chunkKey(cx, cz));
      }
    }
    const key = this._chunkKey(gx, gz);
    if (key === this.lastChunkKey) return;
    this.lastChunkKey = key;
    // rebuild: dispose all, recreate needed
    for (const k of this.terrain.keys()) {
      if (need.has(k)) continue;
      const c = this.terrain.get(k);
      this._disposeChunk(c);
      this.terrain.delete(k);
    }
    for (const k of need) {
      if (this.terrain.has(k)) continue;
      const [cx, cz] = k.split(",").map(Number);
      this.terrain.set(k, this._buildChunk(cx, cz));
    }
  },

  _disposeChunk(c) {
    for (const m of c.meshes) {
      this.scene.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (m.material.map) m.material.map.dispose();
        m.material.dispose();
      }
    }
    if (c.foliage) for (const im of c.foliage) {
      this.scene.remove(im);
      if (im.geometry) im.geometry.dispose();
      if (im.material) im.material.dispose();
    }
    this._rocksDispose(c);
  },

  _rocksDispose(c) { if (c.rocks) { this.scene.remove(c.rocks); if (c.rocks.geometry) c.rocks.geometry.dispose(); if (c.rocks.material) c.rocks.material.dispose(); } },

  _buildChunk(cx, cz) {
    const S = CFG.WORLD.CHUNK, seg = CFG.WORLD.SEG;
    const x0 = cx * S, z0 = cz * S;
    const geo = new THREE.PlaneGeometry(S, S, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const cell = S / seg;
    const biomeTints = {};
    for (let iz = 0; iz <= seg; iz++) {
      for (let ix = 0; ix <= seg; ix++) {
        const idx = iz * (seg + 1) + ix;
        const wx = x0 + ix * cell, wz = z0 + iz * cell;
        const h = this.heightAt(wx, wz);
        pos.setX(idx, wx);
        pos.setY(idx, h);
        pos.setZ(idx, wz);
        // color
        const b = this.biomeAt(wx, wz);
        let c = b.col;
        const sh = Utils.mulberry(ix * 7 + iz * 131 + (cx * 1000 + cz) * 3)();
        const v = 0.82 + sh * 0.36;
        // water blending
        const waterDepth = CFG.WORLD.WATER_LEVEL - h;
        let cr = ((c >> 16) & 255) / 255 * v, cg = ((c >> 8) & 255) / 255 * v, cb = (c & 255) / 255 * v;
        if (waterDepth > 0) {
          const t = Utils.clamp(waterDepth / 1.8, 0, 1);
          cr = cr * (1 - t) + 0.22 * t;
          cg = cg * (1 - t) + 0.34 * t;
          cb = cb * (1 - t) + 0.42 * t;
        }
        // slope shading
        const hN = this.heightAt(wx, wz + 12), hE = this.heightAt(wx + 12, wz);
        const grad = Math.min(1, Math.abs(hN - h) + Math.abs(hE - h));
        const dark = 1 - Math.min(0.22, grad * 0.045);
        col[idx * 3] = Math.min(1, cr * dark);
        col[idx * 3 + 1] = Math.min(1, cg * dark);
        col[idx * 3 + 2] = Math.min(1, cb * dark);
      }
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, metalness: 0, flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.position.set(0, 0, 0);
    this.scene.add(mesh);
    const chunk = { meshes: [mesh], foliage: [], rocks: null, solids: [] };
    this._buildFoliage(chunk, x0, z0, cell);
    return chunk;
  },

  _buildFoliage(chunk, x0, z0, cell) {
    const S = CFG.WORLD.CHUNK;
    const cx = Math.round(x0 / S), cz = Math.round(z0 / S);
    const rng = Utils.mulberry(cx * 911 + cz * 1777 + 12345);
    const rng2 = Utils.mulberry(cx * 3301 + cz * 7013 + 55577);
    const trees = [];
    const rocks = [];
    const grass = [];
    const flowers = [];
    const bushes = [];
    if (!chunk.solids) chunk.solids = [];
    // pre-scan grid for biome per tree cell
    const step = 9; // world units between sample points
    for (let x = x0 + 4; x < x0 + S - 4; x += step) {
      for (let z = z0 + 4; z < z0 + S - 4; z += step) {
        if (rng() > 0.34) continue;
        const b = this.biomeAt(x, z);
        const h = this.heightAt(x, z);
        if (h < CFG.WORLD.WATER_LEVEL + 0.4) continue;
        // inside hard POI centers -> no foliage
        let blocked = false;
        for (const [px, pz, rad, , hard] of this.allPoiBlends()) {
          if (Math.sqrt((x - px) ** 2 + (z - pz) ** 2) < hard + 8) { blocked = true; break; }
        }
        if (blocked) continue;
        const dens = b === BIOMES.forest ? 0.55 : b === BIOMES.swamp ? 0.4 : b === BIOMES.tundra ? 0.35 : 0.16;
        if (rng() > dens) {
          // maybe grass tuft
          if (b === BIOMES.plains || b === BIOMES.swamp) grass.push([x, h, z]);
          const fr = rng2();
          if (b === BIOMES.plains || b === BIOMES.forest) {
            if (fr < 0.30) { const fx = x + (rng2() - 0.5) * 7, fz = z + (rng2() - 0.5) * 7; flowers.push([fx, this.heightAt(fx, fz), fz, rng2()]); }
            else if (fr < 0.42) { const bx = x + (rng2() - 0.5) * 7, bz = z + (rng2() - 0.5) * 7; bushes.push([bx, this.heightAt(bx, bz), bz, 0.55 + rng2() * 0.6]); }
          } else if (b === BIOMES.swamp && fr < 0.16) {
            const bx = x + (rng2() - 0.5) * 7, bz = z + (rng2() - 0.5) * 7; bushes.push([bx, this.heightAt(bx, bz), bz, 0.5 + rng2() * 0.5]);
          } else if (b === BIOMES.volcanic && fr < 0.10) {
            const bx = x + (rng2() - 0.5) * 7, bz = z + (rng2() - 0.5) * 7; bushes.push([bx, this.heightAt(bx, bz), bz, 0.45 + rng2() * 0.4]);
          }
          continue;
        }
        const t = rng();
        if (t < 0.20) rocks.push([x, h, z, 0.6 + rng() * 1.4, rng() * Math.PI]);
        else {
          const kind = b === BIOMES.desert ? "cactus" : b === BIOMES.tundra ? "pine" : b === BIOMES.swamp ? "dead" : b === BIOMES.volcanic ? "cinder" : "tree";
          if (kind === "cinder" && rng() < 0.5) rocks.push([x, h, z, 0.5 + rng() * 1.2, rng() * Math.PI]);
          else trees.push([x, h, z, kind, 0.8 + rng() * 1.1]);
        }
      }
    }
    if (trees.length) {
      const trunk = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.22, 0.34, 3, 6), new THREE.MeshStandardMaterial({ color: 0x6d4c33, roughness: 1 }), trees.length);
      const canopy = new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(1.1, 1), new THREE.MeshStandardMaterial({ color: 0x3f7d32, roughness: 1 }), trees.length);
      trunk.receiveShadow = true; canopy.receiveShadow = true;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      let ti = 0;
      const canopyCol = new THREE.Color();
      for (const [x, h, z, kind, scale] of trees) {
        chunk.solids.push({ x: x, z: z, r: 0.34 * scale + 0.12 });
        const bcol = kind === "pine" ? 0x2d5a40 : kind === "dead" ? 0x4a4a40 : kind === "cinder" ? 0x7a4a2a : kind === "cactus" ? 0x3a7a4a : 0x3f8a3a;
        q.setFromEuler(new THREE.Euler(0, rng() * Math.PI, 0));
        s.set(scale, scale, scale);
        p.set(x, h, z);
        if (kind === "cactus") {
          m4.compose(p, q, s);
          trunk.setMatrixAt(ti, m4);
          const body = new THREE.Matrix4();
          const bodyGeo = new THREE.CylinderGeometry(0.42, 0.5, 3.2, 6);
          // cactus canopy = sphere, reuse canopy mesh with matrix
          p.set(x, h + 1.9 * scale, z);
          s.set(scale * 1.2, scale * 1.2, scale * 1.2);
          m4.compose(p, q, s);
          canopyCol.setHex(0x3a7a4a);
          canopy.setColorAt(ti, canopyCol);
          canopy.setMatrixAt(ti, m4);
          trunk.setColorAt(ti, canopyCol);
          // adjust trunk height/scale for cactus: set scale y taller
          s.set(scale * 0.9, scale * 1.15, scale * 0.9);
          p.set(x, h + 1.6 * scale, z);
          m4.compose(p, q, s);
          trunk.setMatrixAt(ti, m4);
        } else if (kind === "dead") {
          trunk.setColorAt(ti, new THREE.Color(0x4a4a40));
          canopy.setColorAt(ti, new THREE.Color(0x3a3a30));
          s.set(scale, scale, scale);
          p.set(x, h + 1.5 * scale, z);
          m4.compose(p, q, s);
          trunk.setMatrixAt(ti, m4);
          p.set(x, h + 3.0 * scale, z);
          m4.compose(p, q, s);
          canopy.setMatrixAt(ti, m4);
        } else {
          canopyCol.setHex(bcol);
          canopyCol.offsetHSL((rng2() - 0.5) * 0.05, (rng2() - 0.5) * 0.12, (rng2() - 0.5) * 0.09);
          trunk.setColorAt(ti, new THREE.Color(0x6d4c33));
          canopy.setColorAt(ti, canopyCol);
          const trunkH = kind === "pine" ? 1.4 : 2.4;
          p.set(x, h + trunkH * 0.5 * scale, z);
          s.set(scale, trunkH * scale, scale);
          q.setFromEuler(new THREE.Euler(0, rng() * Math.PI, 0));
          m4.compose(p, q, s);
          trunk.setMatrixAt(ti, m4);
          const top = kind === "pine" ? 2.6 : 3.4;
          p.set(x, h + top * scale, z);
          s.set(scale * (kind === "pine" ? 0.8 : 1.35), scale * (kind === "pine" ? 1.6 : 1.15), scale * (kind === "pine" ? 0.8 : 1.35));
          m4.compose(p, q, s);
          canopy.setMatrixAt(ti, m4);
        }
        ti++;
      }
      trunk.instanceMatrix.needsUpdate = true;
      canopy.instanceMatrix.needsUpdate = true;
      trunk.count = ti; canopy.count = ti;
      this.scene.add(trunk); this.scene.add(canopy);
      chunk.foliage.push(trunk, canopy);
    }
    if (rocks.length) {
      const rm = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.8, 0), new THREE.MeshStandardMaterial({ color: 0x888d92, roughness: 1, metalness: 0 }), rocks.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      let ri = 0;
      for (const [x, h, z, sc, rot] of rocks) {
        chunk.solids.push({ x: x, z: z, r: 0.62 * sc });
        q.setFromEuler(new THREE.Euler(rng() * 3.1, rot, rng() * 3.1));
        s.set(sc, sc * 0.7, sc);
        p.set(x, h + sc * 0.3, z);
        m4.compose(p, q, s);
        rm.setMatrixAt(ri++, m4);
      }
      rm.instanceMatrix.needsUpdate = true;
      rm.count = ri;
      rm.receiveShadow = rm.castShadow = true;
      this.scene.add(rm);
      chunk.rocks = rm;
    }
    if (grass.length) {
      const gm = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.8), new THREE.MeshStandardMaterial({ color: 0x5f8f3f, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 1 }), grass.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      let gi = 0;
      for (const [x, h, z] of grass) {
        q.setFromEuler(new THREE.Euler(0, rng() * Math.PI, 0));
        s.set(0.4 + rng() * 0.5, 0.6 + rng() * 0.8, 1);
        p.set(x, h + 0.4, z);
        m4.compose(p, q, s);
        gm.setMatrixAt(gi++, m4);
      }
      gm.instanceMatrix.needsUpdate = true;
      gm.count = gi;
      this.scene.add(gm);
      chunk.foliage.push(gm);
    }
    if (flowers.length) {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const stem = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.025, 0.035, 0.34, 4),
        new THREE.MeshStandardMaterial({ color: 0x4f7f35, roughness: 1 }), flowers.length);
      const head = new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(0.11, 0),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, emissive: 0x111111 }), flowers.length);
      const petal = new THREE.Color();
      const PETALS = [0xe8607a, 0xf0c040, 0xd8d8f0, 0xb070e0, 0xf08a3c];
      let fi = 0;
      for (const [x, h, z, seed] of flowers) {
        const rot = seed * Math.PI * 2;
        q.setFromEuler(new THREE.Euler(0, rot, 0));
        s.set(1, 1, 1);
        p.set(x, h + 0.17, z);
        m4.compose(p, q, s);
        stem.setMatrixAt(fi, m4);
        p.set(x, h + 0.36, z);
        m4.compose(p, q, s);
        head.setMatrixAt(fi, m4);
        petal.setHex(PETALS[Math.floor(seed * 997) % PETALS.length]);
        petal.offsetHSL((rng2() - 0.5) * 0.04, 0, (rng2() - 0.5) * 0.1);
        head.setColorAt(fi, petal);
        fi++;
      }
      stem.instanceMatrix.needsUpdate = true;
      head.instanceMatrix.needsUpdate = true;
      if (head.instanceColor) head.instanceColor.needsUpdate = true;
      stem.count = head.count = fi;
      stem.receiveShadow = head.receiveShadow = true;
      this.scene.add(stem); this.scene.add(head);
      chunk.foliage.push(stem, head);
    }
    if (bushes.length) {
      const bm = new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(0.62, 1),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), bushes.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const bcol = new THREE.Color();
      let bi = 0;
      for (const [x, h, z, sc] of bushes) {
        q.setFromEuler(new THREE.Euler(0, rng2() * Math.PI * 2, 0));
        s.set(sc, sc * 0.78, sc);
        p.set(x, h + sc * 0.4, z);
        m4.compose(p, q, s);
        bm.setMatrixAt(bi, m4);
        bcol.setHex(0x3f7a3c);
        bcol.offsetHSL((rng2() - 0.5) * 0.06, (rng2() - 0.5) * 0.15, (rng2() - 0.5) * 0.1);
        bm.setColorAt(bi, bcol);
        bi++;
      }
      bm.instanceMatrix.needsUpdate = true;
      if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
      bm.count = bi;
      bm.receiveShadow = true;
      this.scene.add(bm);
      chunk.foliage.push(bm);
    }
  },

  /* ---------------------- sky / water / lights ---------------------- */
  setupSky() {
    const geo = new THREE.SphereGeometry(1700, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, fog: false, depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x2c5a9c) },
        bottom: { value: new THREE.Color(0xcfe6ee) },
        time: { value: 0 },
        sunDir: { value: new THREE.Vector3(0.6, 0.7, -0.3) },
        sunTint: { value: new THREE.Color(0xffffff) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bottom;
        uniform vec3 sunDir; uniform vec3 sunTint;
        void main(){
          vec3 d = normalize(vP);
          float h = d.y;
          float t = clamp(h*0.5+0.5, 0.0, 1.0);
          vec3 c = mix(bottom, top, pow(t, 0.75));
          float horizon = exp(-abs(h) * 7.0);
          c += sunTint * horizon * 0.30;
          float sd = max(dot(d, normalize(sunDir)), 0.0);
          c += sunTint * pow(sd, 12.0) * 0.55;
          c += sunTint * pow(sd, 2.0) * 0.06;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.skyDome = new THREE.Mesh(geo, mat);
    this.skyDome.frustumCulled = false;
    this.scene.add(this.skyDome);
    // stars
    const starGeo = new THREE.BufferGeometry();
    const N = 900;
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
      const r = 1500;
      arr[i * 3] = r * Math.sin(ph) * Math.cos(th);
      arr[i * 3 + 1] = Math.abs(r * Math.cos(ph)) + 30;
      arr[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0 });
    this.stars = new THREE.Points(starGeo, starMat);
    this.scene.add(this.stars);
  },

  setupLight() {
    this.hemi = new THREE.HemisphereLight(0xdff1ff, 0x4a5a3a, 0.75);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = 60;
    const scam = this.sun.shadow.camera;
    scam.left = -sc; scam.right = sc;
    scam.top = sc; scam.bottom = -sc;
    scam.near = 1; scam.far = 400;
    scam.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.06;
    this.sun.target.position.set(0, 0, 0);
    this.scene.add(this.sun.target);
    this.scene.add(this.sun);
    this.moon = new THREE.DirectionalLight(0x9db4ff, 0.4);
    this.moon.color.multiplyScalar(0);
    this.moon.target.position.set(0, 0, 0);
    this.scene.add(this.moon.target);
    this.scene.add(this.moon);
  },

  setupWater() {
    const S = CFG.WORLD.SIZE + 400;
    const geo = new THREE.PlaneGeometry(S, S, 80, 80);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true, opacity: 0.86, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          time: { value: 0 },
          uColor: { value: new THREE.Color(0x2f7fbf) },
          uSky: { value: new THREE.Color(0xcfe6ee) },
          uSunDir: { value: new THREE.Vector3(0.6, 0.7, -0.3) },
          uSunCol: { value: new THREE.Color(0xfff2d8) },
          uLight: { value: 1.0 },
        },
      ]),
      vertexShader: `#include <fog_pars_vertex>
        uniform float time; varying vec3 vW; varying float vH;
        void main(){ vec3 p=position; p.z += sin(p.x*0.05+time*0.8)*0.15+cos(p.z*0.05+time*0.6)*0.15;
        vH = 0.5+0.5*sin(p.x*0.1+time)*sin(p.z*0.12+time);
        vW = (modelMatrix * vec4(p,1.0)).xyz;
        vec4 mvPosition = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
      fragmentShader: `#include <fog_pars_fragment>
        uniform float time; uniform vec3 uColor; uniform vec3 uSky;
        uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uLight;
        varying vec3 vW; varying float vH;
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          float dhx = 0.010*cos(vW.x*0.05+time*0.8) + 0.021*cos(vW.x*0.7+time*2.0);
          float dhz = -0.010*sin(vW.z*0.05+time*0.6) - 0.018*sin(vW.z*0.6+time*1.7);
          vec3 N = normalize(vec3(-dhx, 1.0, -dhz));
          float fres = pow(1.0 - clamp(dot(V, N), 0.0, 1.0), 3.0);
          vec3 c = mix(uColor, uSky, fres*0.70);
          c = mix(c, vec3(0.75,0.9,1.0), vH*0.35);
          c += vec3(0.05,0.06,0.07);
          vec3 H = normalize(normalize(uSunDir) + V);
          float nh = max(dot(N, H), 0.0);
          c += uSunCol * pow(nh, 200.0) * 1.6;
          c += uSunCol * pow(nh, 28.0) * 0.14;
          c *= uLight;
          gl_FragColor = vec4(c, 0.84);
          #include <fog_fragment>
        }`,
    });
    this.water = new THREE.Mesh(geo, mat);
    this.water.frustumCulled = false;
    this.water.position.y = CFG.WORLD.WATER_LEVEL;
    this.scene.add(this.water);
  },

  setupClouds() {
    this.cloudGroup = new THREE.Group();
    const cloudGeo = new THREE.SphereGeometry(1, 7, 5);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 24; i++) {
      const cl = new THREE.Group();
      const n = 3 + (i % 4);
      for (let j = 0; j < n; j++) {
        const s = new THREE.Mesh(cloudGeo, cloudMat);
        s.scale.set(12 + (j * 3), 3.5, 8);
        s.position.set(j * 10 - n * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6);
        cl.add(s);
      }
      cl.position.set(Utils.rand(-3000, 3000), Utils.rand(120, 260), Utils.rand(-3000, 3000));
      this.cloudGroup.add(cl);
    }
    this.scene.add(this.cloudGroup);
  },

  /* ---------------------- time & environment update ---------------------- */
  _time: 0,
  _sunDir: new THREE.Vector3(),
  _fogDay: new THREE.Color(),
  _fogC: new THREE.Color(),
  update(dt, px, pz) {
    this._time += dt;
    // day/night: hours cycle
    this.timeOfDay = (CFG.TIME.START_HOUR + this._time / CFG.TIME.DAY_LEN * 24) % 24;
    const t = this.timeOfDay;
    const day = Math.sin((t - 6) / 24 * Math.PI * 2); // 1 at noon
    const daylight = Utils.clamp(day, 0, 1);
    const dusk = Utils.clamp(1 - Math.abs(day) * 3.2, 0, 1) * 0.35;
    const sunI = 0.16 + daylight * 1.15 + dusk * 0.4;
    this.hemi.intensity = 0.22 + daylight * 0.62 + dusk * 0.3;
    // sun follows player so shadows always visible
    this.sun.position.set(px + Math.cos(-0.8) * 150, 175, pz + Math.sin(-0.8) * 150);
    this.sun.target.position.set(px, 0, pz);
    this.sun.intensity = sunI;
    this.sun.color.setRGB(Utils.lerp(0.75, 1.0, daylight), Utils.lerp(0.62, 0.98, daylight), Utils.lerp(0.5, 0.92, daylight));
    this.moon.intensity = 0.5 * (1 - daylight);
    this.moon.color.set(0x9db4ff);
    this.moon.position.set(px - Math.cos(-0.8) * 130, 140, pz - Math.sin(-0.8) * 130);
    this.moon.target.position.set(px, 0, pz);
    // dirección del sol respecto al jugador (compartida por cielo y agua)
    const sunDir = this._sunDir.set(this.sun.position.x - px, this.sun.position.y, this.sun.position.z - pz).normalize();
    // sky colors
    const top = new THREE.Color();
    top.setRGB(
      Utils.lerp(0.022, 0.14, daylight),
      Utils.lerp(0.030, 0.30, daylight),
      Utils.lerp(0.055, 0.55, daylight)
    );
    const bottom = new THREE.Color(
      Utils.lerp(0.026, 0.75, daylight),
      Utils.lerp(0.030, 0.86, daylight),
      Utils.lerp(0.052, 0.90, daylight)
    );
    this.skyDome.position.set(px, 0, pz);
    this.stars.position.set(px, 0, pz);
    const su = this.skyDome.material.uniforms;
    su.top.value.copy(top);
    su.bottom.value.copy(bottom);
    su.sunDir.value.copy(sunDir);
    su.sunTint.value.copy(this.sun.color).multiplyScalar(daylight * 0.45 + dusk * 1.5);
    // niebla cinemática: color y densidad del bioma, interpolados
    const b = this.biomeAt(px, pz);
    const fogDay = this._fogDay.set(b.fog !== undefined ? b.fog : 0xbfd8a8);
    const fogC = this._fogC.setRGB(
      Utils.lerp(fogDay.r * 0.04 + 0.004, fogDay.r, daylight),
      Utils.lerp(fogDay.g * 0.04 + 0.005, fogDay.g, daylight),
      Utils.lerp(fogDay.b * 0.045 + 0.010, fogDay.b, daylight)
    );
    this.scene.fog.color.lerp(fogC, Math.min(1, dt * 2));
    const fogD = (b.fogD !== undefined ? b.fogD : 0.0022) * (1 + (1 - daylight) * 0.15);
    this.scene.fog.density = Utils.lerp(this.scene.fog.density, fogD, Math.min(1, dt * 1.5));
    this.stars.material.opacity = Math.pow(Utils.clamp(1 - daylight * 1.4, 0, 1), 1.5) * 0.9;
    // water
    if (this.water) {
      const wu = this.water.material.uniforms;
      wu.time.value = this._time;
      wu.uSky.value.copy(bottom);
      wu.uSunDir.value.copy(sunDir);
      wu.uSunCol.value.copy(this.sun.color).multiplyScalar(0.2 + daylight * 0.8);
      if (wu.uLight) wu.uLight.value = 0.25 + daylight * 0.75 + dusk * 0.4;
    }
    // clouds drift
    for (let i = 0; i < this.cloudGroup.children.length; i++) {
      const cl = this.cloudGroup.children[i];
      cl.position.x += dt * (0.6 + i * 0.05);
      if (cl.position.x > 3200) cl.position.x = -3200;
    }
    // stream terrain chunks around the player (no-op unless chunk key changed)
    this.updateChunks(px, pz);
  },
};
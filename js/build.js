/* ============================================================
   build.js — static world props: town, castle tower, villages,
   boss arenas, cave entrances, NPC stalls and interactables.
   Mejoras: casas con tejado a dos aguas, kioscos de mercado,
   plaza empedrada, props del pueblo y animaciones (humo,
   gallinas, pájaros, banderas, fogatas, lámparas).
   ============================================================ */
const Build = {
  scene: null,
  group: null,
  interactables: [],
  npcTags: [],
  colliders: [],

  // animaciones del mundo
  smokeAnims: [],
  flags: [],
  chickens: [],
  birds: [],
  fires: [],
  lampMats: [],
  npcMixers: [],
  glbReady: 0,
  fountainWater: null,
  _animT: 0,

  init(scene) {
    this.group = new THREE.Group();
    this.group.name = "buildRoot";
    scene.add(this.group);
    this.scene = this.group;
    this.interactables = [];
    this.npcTags = [];
    this.colliders = [];
    this.smokeAnims = [];
    this.flags = [];
    this.chickens = [];
    this.birds = [];
    this.fires = [];
    this.lampMats = [];
    this.npcMixers = [];
    this.glbReady = 0;
    this.fountainWater = null;
    this._animT = 0;
    this.buildTown();
    this.buildCastle();
    this.buildMountPaddock();
    for (const v of World.POIS.villages) this.buildVillage(v);
    for (const b of World.POIS.bosses) this.buildBossArena(b);
    for (const c of World.POIS.caves) this.buildCaveEntrance(c);
    this.buildObelisks();
  },

  ground(x, z) { return { x: x, y: World.heightAt(x, z), z: z }; },

  mat(color, opts) { return Utils.mat(color, opts); },

  box(w, h, d, color, opts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color, opts));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  },

  cyl(rt, rb, h, seg, color, opts) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), this.mat(color, opts));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  },

  sph(r, color, opts) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), this.mat(color, opts));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  },

  addAO(props) {
    const g = new THREE.Group();
    for (const p of props) {
      const m = this.box(p.w, p.h, p.d, p.c, p);
      m.position.set(p.x || 0, p.y || 0, p.z || 0);
      m.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
      g.add(m);
    }
    return g;
  },

  // plano con icono (glifo) dibujado en canvas — para rótulos de puestos
  iconPlane(text, px) {
    const cv = document.createElement("canvas");
    cv.width = 128; cv.height = 128;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = (px || 92) + "px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f3e2b8";
    ctx.strokeStyle = "rgba(30,20,8,0.9)";
    ctx.lineWidth = 5;
    ctx.strokeText(text, 64, 68);
    ctx.fillText(text, 64, 68);
    const tex = new THREE.CanvasTexture(cv);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    return m;
  },

  // columna de humo (puffs animados en Build.update) montada en `parent`
  addSmoke(parent, x, y, z, n) {
    const puffs = [];
    const geo = new THREE.SphereGeometry(0.5, 7, 5);
    for (let i = 0; i < (n || 4); i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xb9b6c4, transparent: true, opacity: 0, depthWrite: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      puffs.push({ mesh: m, phase: i / (n || 4) });
    }
    this.smokeAnims.push({ x: x, y: y, z: z, puffs: puffs });
  },

  /* ============================================================
     CASA — muros, entramado de madera, tejado a dos aguas,
     puerta con marco, ventanas con repisa, chimenea y humo.
     ============================================================ */
  house(w, d, h, wall, roof, opts) {
    opts = opts || {};
    const g = new THREE.Group();
    const wood = 0x6b4a2f;
    const dark = 0x4a3018;

    // muros + zócalo de piedra
    const base = this.box(w, h, d, wall, { rough: 0.95 });
    base.position.y = h / 2;
    g.add(base);
    const found = this.box(w + 0.34, 0.55, d + 0.34, 0x8a8072, { rough: 1 });
    found.position.y = 0.27;
    g.add(found);

    // postes de esquina y viga superior
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = this.box(0.34, h, 0.34, wood);
      p.position.set(sx * (w / 2 - 0.08), h / 2, sz * (d / 2 - 0.08));
      g.add(p);
    }
    const beam = this.box(w + 0.18, 0.3, d + 0.18, wood);
    beam.position.y = h - 0.24;
    g.add(beam);

    // --- puerta (marco, hoja, listones, picaporte, escalón) ---
    const dw = 1.25, dh = 2.1;
    const dframe = this.box(dw + 0.38, dh + 0.18, 0.24, wood);
    dframe.position.set(0, dh / 2, d / 2);
    g.add(dframe);
    const door = this.box(dw, dh, 0.16, 0x4a2f18, { rough: 0.85 });
    door.position.set(0, dh / 2, d / 2 - 0.03);
    g.add(door);
    for (const yy of [0.5, 1.1, 1.7]) {
      const slat = this.box(dw - 0.12, 0.09, 0.05, dark);
      slat.position.set(0, yy, d / 2 + 0.06);
      g.add(slat);
    }
    const knob = this.sph(0.07, 0xd4a437, { metal: 0.7, rough: 0.3 });
    knob.position.set(dw / 2 - 0.2, 1.0, d / 2 + 0.08);
    g.add(knob);
    const step = this.box(1.9, 0.26, 0.5, 0x9a9184, { rough: 1 });
    step.position.set(0, 0.13, d / 2 + 0.06);
    g.add(step);

    // --- ventanas (marco + cristal cálido + guías + repisa) ---
    const win = (x, y, z, nx, nz) => {
      const ry = Math.atan2(nx, nz);
      const gw = 1.0, gh = 1.0;
      const fr = this.box(gw + 0.26, gh + 0.26, 0.2, wood);
      fr.position.set(x + nx * 0.1, y, z + nz * 0.1);
      fr.rotation.y = ry;
      const glass = this.box(gw, gh, 0.14, 0x8ec5dc, { emissive: 0xffdf9a, emissiveIntensity: 1.5, rough: 0.15 });
      glass.position.set(x + nx * 0.17, y, z + nz * 0.17);
      glass.rotation.y = ry;
      const vb = this.box(0.07, gh, 0.07, wood);
      vb.position.set(x + nx * 0.26, y, z + nz * 0.26);
      vb.rotation.y = ry;
      const hb = this.box(gw, 0.07, 0.07, wood);
      hb.position.set(x + nx * 0.26, y, z + nz * 0.26);
      hb.rotation.y = ry;
      const sill = this.box(gw + 0.36, 0.12, 0.28, wood);
      sill.position.set(x + nx * 0.2, y - gh / 2 - 0.17, z + nz * 0.2);
      sill.rotation.y = ry;
      g.add(fr, glass, vb, hb, sill);
    };
    const wy = Math.min(h - 1.05, Math.max(1.9, h * 0.55));
    win(-(w / 2 - 1.45), wy, d / 2, 0, 1);
    win(w / 2 - 1.45, wy, d / 2, 0, 1);
    win(w / 2, wy, 0, 1, 0);
    win(-w / 2, wy, 0, -1, 0);
    win(0, wy, -d / 2, 0, -1);

    // --- tejado a dos aguas (cumbrera a lo largo de z) ---
    const pitch = 0.61, ov = 0.55;
    const halfW = w / 2 + ov;
    const L = halfW / Math.cos(pitch);
    const rise = halfW * Math.tan(pitch);
    for (const s of [-1, 1]) {
      const plank = this.box(L, 0.26, d + 1.1, roof, { rough: 0.95 });
      plank.position.set(s * halfW / 2, h + rise / 2, 0);
      plank.rotation.z = -s * pitch;
      g.add(plank);
    }
    // caballos frontales (triángulos del hastial)
    const tri = new THREE.Shape();
    tri.moveTo(-w / 2, 0); tri.lineTo(w / 2, 0); tri.lineTo(0, Math.max(0.4, rise - 0.2)); tri.closePath();
    const triGeo = new THREE.ShapeGeometry(tri);
    const triMat = this.mat(wall, { rough: 0.95, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const gm = new THREE.Mesh(triGeo, triMat);
      gm.position.set(0, h - 0.02, s * d / 2);
      g.add(gm);
    }
    // cumbrera + aleros laterales
    const ridge = this.box(0.36, 0.2, d + 1.15, roof);
    ridge.position.set(0, h + rise - 0.04, 0);
    g.add(ridge);
    for (const s of [-1, 1]) {
      const eave = this.box(0.18, 0.3, d + 1.1, wood);
      eave.position.set(s * (w / 2 + 0.12), h - 0.05, 0);
      g.add(eave);
    }

    // --- chimenea + registro de humo ---
    if (opts.chimney !== false) {
      const chx = w / 2 - 1.3, chz = -d / 4;
      const surf = h + rise - Math.max(0, w / 2 - 1.3) * Math.tan(pitch);
      const ch = this.box(0.75, 2.1, 0.75, 0x8a8072, { rough: 1 });
      ch.position.set(chx, surf + 0.8, chz);
      const cap = this.box(0.98, 0.22, 0.98, 0x5c544a);
      cap.position.set(chx, surf + 1.95, chz);
      g.add(ch, cap);
      this.addSmoke(g, chx, surf + 2.15, chz, 4);
    }
    return g;
  },

  /* ============================================================
     CASA GLB — modelo KayKit con fallback procedural.
     opts: { h, wall, roof, chimney }. El grupo empieza con la casa
     procedural y se sustituye por el modelo cuando termina la carga.
     userData.size = huella final (para colisionadores sincrónicos).
     ============================================================ */
  houseGLB(kind, opts) {
    opts = opts || {};
    const cfg = {
      home_A: { ht: 0.93, w: 0.79, d: 0.85, chimney: [-0.30, 1.04, -0.12] },
      home_B: { ht: 1.28, w: 0.87, d: 1.10, chimney: null },
      tavern: { ht: 1.40, w: 1.17, d: 1.33, chimney: null },
    }[kind];
    const g = new THREE.Group();
    const h = opts.h || 6.5;
    const s = h / cfg.ht;
    g.userData.size = { w: cfg.w * s, d: cfg.d * s };
    const smokeBefore = this.smokeAnims.length;
    const fbopts = Object.assign({}, opts, { chimney: opts.chimney !== false && !!cfg.chimney });
    const fb = this.house(g.userData.size.w, g.userData.size.d, opts.wallH || h * 0.6, opts.wall, opts.roof, fbopts);
    g.add(fb);
    const fbSmoke = this.smokeAnims.length > smokeBefore ? this.smokeAnims[smokeBefore] : null;
    GLBCache.instance("models/kaykit/" + kind + ".gltf").then((entry) => {
      if (!entry) return;
      const root = entry.root;
      root.scale.setScalar(1);
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const k = h / ((box.max.y - box.min.y) || h);
      root.scale.setScalar(k);
      root.position.y = -box.min.y * k;
      root.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      // fuera el fallback (y su humo) — dentro el modelo, con humo propio
      if (fbSmoke) {
        const idx = this.smokeAnims.indexOf(fbSmoke);
        if (idx >= 0) this.smokeAnims.splice(idx, 1);
        for (const p of fbSmoke.puffs) if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
      }
      while (g.children.length) g.remove(g.children[0]);
      g.add(root);
      if (cfg.chimney) {
        this.addSmoke(g, cfg.chimney[0] * g.userData.size.w, h * cfg.chimney[1], cfg.chimney[2] * g.userData.size.d, 4);
      }
      g.userData.glb = kind;
      this.glbReady++;
    });
    return g;
  },

  /* prop KayKit suelto (barriles, carreta, vallas...). opts:
     { x, y, z, h, yaw, parent, collider } — si falla la carga, no añade nada */
  addKayProp(file, opts) {
    opts = opts || {};
    if (opts.collider) this.colliders.push(opts.collider);
    GLBCache.instance("models/kaykit/" + file + ".gltf").then((entry) => {
      if (!entry) return;
      const root = entry.root;
      root.scale.setScalar(1);
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const s = (opts.h || 1) / ((box.max.y - box.min.y) || 1);
      root.scale.setScalar(s);
      root.position.y = -box.min.y * s;
      if (opts.yaw) root.rotation.y = opts.yaw;
      root.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      const g = new THREE.Group();
      g.add(root);
      g.position.set(opts.x || 0, opts.y || 0, opts.z || 0);
      (opts.parent || this.scene).add(g);
      this.glbReady++;
    });
  },

  /* ---------------- NPC con personaje GLB animado ---------------- */
  _npcFileFor(n) {
    const m = {
      shop_weapon: "knight", shop_armor: "barbarian", shop_potion: "mage",
      gacha: "rogue_hooded", quest_alaric: "rogue", quest_maren: "rogue_hooded",
      quest_kralynn: "knight", quest_deus: "knight", mountshop: "barbarian",
      trade: "rogue", pvp: "barbarian",
    };
    return m[n.id] || "knight";
  },

  _attachNPCGLB(g, n) {
    GLBCache.instance("models/" + this._npcFileFor(n) + ".glb").then((entry) => {
      if (!entry || !g.parent) return;
      const root = entry.root;
      root.scale.setScalar(1);
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const s = 1.75 / ((box.max.y - box.min.y) || 1.75);
      root.scale.setScalar(s);
      root.position.y = -box.min.y * s;
      root.rotation.y = Math.PI / 2;
      root.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; }
      });
      while (g.children.length) g.remove(g.children[0]);
      g.add(root);
      const mixer = new THREE.AnimationMixer(root);
      const clips = {};
      for (const c of entry.animations) clips[c.name] = c;
      const idle = clips["Idle"] || clips["Unarmed_Idle"] || (entry.animations[0]);
      if (idle) {
        const act = mixer.clipAction(idle);
        act.play();
        mixer.setTime(Math.random() * (idle.duration || 1)); // desfase entre NPCs
      }
      this.npcMixers.push(mixer);
      this.glbReady++;
    });
  },

  /* ============================================================
     Plaza del pueblo
     ============================================================ */
  buildTown() {
    const PT = 2.04; // altura de la losa de la plaza (terreno aplanado en 2.0)

    // plataforma de la plaza + borde de piedra
    const plaza = this.box(86, 0.4, 86, 0xcbb88a, { rough: 0.92 });
    plaza.position.set(0, 1.84, 0);
    plaza.receiveShadow = true;
    this.scene.add(plaza);
    const plazaRing = this.box(89.5, 0.5, 89.5, 0x9a8a63, { rough: 1 });
    plazaRing.position.set(0, 1.78, 0);
    plazaRing.receiveShadow = true;
    this.scene.add(plazaRing);

    // adoquines: anillo perimetral + cuatro avenidas hacia las puertas
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(37.5, 41.5, 56),
      this.mat(0xb0a077, { rough: 1 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, PT + 0.005, 0);
    ring.receiveShadow = true;
    this.scene.add(ring);
    for (let i = 0; i < 4; i++) {
      const av = this.box(34, 0.05, 5.4, 0xb0a077, { rough: 1 });
      const a = i * Math.PI / 2;
      av.position.set(Math.sin(a) * 23.5, PT + 0.01, Math.cos(a) * 23.5);
      av.rotation.y = a;
      av.receiveShadow = true;
      this.scene.add(av);
      // juntas del adoquín
      for (let j = -2; j <= 2; j++) {
        const jt = this.box(0.18, 0.055, 5.4, 0x93855f, { rough: 1 });
        jt.position.set(Math.sin(a) * 23.5 + Math.cos(a) * j * 6.4, PT + 0.012, Math.cos(a) * 23.5 - Math.sin(a) * j * 6.4);
        jt.rotation.y = a;
        this.scene.add(jt);
      }
    }

    // --- fuente octogonal con estatuilla y chorros ---
    const fBase = this.cyl(3.5, 3.6, 1.4, 8, 0xb9c4d0, { rough: 0.5, metal: 0.15 });
    fBase.position.set(0, 2.65, 0);
    const fTrim = this.cyl(3.62, 3.62, 0.24, 8, 0x9aa6b5, { rough: 0.6 });
    fTrim.position.set(0, 3.24, 0);
    const fWater = this.cyl(3.0, 3.0, 0.14, 8, 0x4fb3e8,
      { emissive: 0x1d7ab0, emissiveIntensity: 0.5, transparent: true, opacity: 0.92, rough: 0.2 });
    fWater.position.set(0, 3.14, 0);
    fWater.castShadow = false;
    const fCol = this.cyl(0.7, 0.95, 1.7, 8, 0xd7d7d7, { rough: 0.35 });
    fCol.position.set(0, 4.0, 0);
    const fBowl = this.cyl(1.35, 0.85, 0.5, 8, 0xd7d7d7, { rough: 0.35 });
    fBowl.position.set(0, 5.05, 0);
    const fTop = this.sph(0.34, 0xe8e8e8, { rough: 0.3 });
    fTop.position.set(0, 5.6, 0);
    this.scene.add(fBase, fTrim, fWater, fCol, fBowl, fTop);
    // chorros del cuenco superior + chorro central
    const streamMat = this.mat(0x7fd0f4, { emissive: 0x2f8fc0, emissiveIntensity: 0.6, transparent: true, opacity: 0.75 });
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), streamMat);
      st.position.set(Math.cos(a) * 1.15, 4.15, Math.sin(a) * 1.15);
      st.castShadow = false;
      this.scene.add(st);
    }
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.9, 6), streamMat);
    jet.position.set(0, 6.15, 0);
    this.scene.add(jet);
    this.fountainWater = fWater;
    this.colliders.push({ x: 0, z: 0, hw: 3.5, hd: 3.5, a: 0 });

    // --- casas del pueblo (modelos KayKit con fallback procedural) ---
    const townHouses = [
      { a: 10, b: 31, angle: 0 },
      { a: 36, b: -24, angle: 1.2 },
      { a: -36, b: -14, angle: -1.2 },
      { a: 13, b: -59, angle: 2.4 },
      { a: -46, b: -46, angle: 1.9 },
      { a: -52, b: 2, angle: -2.4 },
      { a: 50, b: 26, angle: 0.5 },
    ];
    const townKinds = ["home_A", "home_B", "home_A", "home_B", "home_A", "home_B", "tavern"];
    const wallCols = [0xcfd8dc, 0xd7ccc8, 0xe0d0b0, 0xbfd0d8, 0xd8c9a8];
    const roofCols = [0x8d5a3a, 0x7c4a30, 0x9c6844, 0x6e4a58];
    for (let i = 0; i < townHouses.length; i++) {
      const hdef = townHouses[i];
      const kind = townKinds[i];
      const house = this.houseGLB(kind, {
        h: kind === "tavern" ? 7.0 : 6.5,
        wall: wallCols[i % wallCols.length],
        roof: roofCols[i % roofCols.length],
      });
      house.rotation.y = hdef.angle;
      const gpos = this.ground(hdef.a, hdef.b);
      house.position.set(gpos.x, gpos.y, gpos.z);
      this.scene.add(house);
      this.colliders.push({
        x: gpos.x, z: gpos.z,
        hw: house.userData.size.w / 2 + 0.15, hd: house.userData.size.d / 2 + 0.15,
        a: hdef.angle,
      });
    }

    // --- farolas del perímetro (brillo por noche) ---
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      const r = 58;
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      const ly = World.heightAt(lx, lz);
      const pole = this.box(0.24, 4.6, 0.24, 0x4a3c28);
      pole.position.set(lx, ly + 2.3, lz);
      const collar = this.box(0.4, 0.16, 0.4, 0x3a2f1f);
      collar.position.set(lx, ly + 4.55, lz);
      const lampMat = this.mat(0xffcf6a, { emissive: 0xffa020, emissiveIntensity: 1.4 });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.6), lampMat);
      lamp.position.set(lx, ly + 4.95, lz);
      lamp.castShadow = true;
      const cap = this.box(0.8, 0.18, 0.8, 0x3a2f1f);
      cap.position.set(lx, ly + 5.4, lz);
      this.scene.add(pole, collar, lamp, cap);
      this.lampMats.push(lampMat);
      this.colliders.push({ x: lx, z: lz, r: 0.35 });
    }

    // --- kioscos de mercado + NPCs ---
    for (const n of NPC_DEFS) {
      const shop = n.role === "weapons" || n.role === "armors" || n.role === "potions";
      const sx = n.x * 1.5, sz = n.z * 1.5;
      const sy = World.heightAt(sx, sz);
      // el kiosco mira al centro: NPC y rótulo hacia dentro
      const dl = Math.hypot(sx, sz) || 1;
      const dnx = -sx / dl, dnz = -sz / dl;
      const sry = Math.atan2(dnx, dnz);

      const kiosk = this.makeKiosk(n, shop);
      kiosk.position.set(sx, sy, sz);
      kiosk.rotation.y = sry; // el puesto mira al centro de la plaza
      this.scene.add(kiosk);

      // rótulo colgado del alero, con icono del oficio
      const signG = new THREE.Group();
      const board = this.box(1.6, 0.9, 0.16, 0x3a2c1a, { rough: 0.85 });
      const icon = this.iconPlane(n.icon || "\u2605", 88);
      icon.scale.set(0.85, 0.85, 1);
      icon.position.z = 0.1;
      signG.add(board, icon);
      for (const cx of [-0.55, 0.55]) {
        const chain = this.box(0.05, 0.34, 0.05, 0x6a5a40);
        chain.position.set(cx, 0.6, 0);
        signG.add(chain);
      }
      signG.position.set(sx + dnx * 2.45, sy + 2.42, sz + dnz * 2.45);
      signG.rotation.y = sry;
      this.scene.add(signG);

      // NPC delante del puesto (visible y accesible)
      const npx = sx + dnx * 3.8, npz = sz + dnz * 3.8;
      const nyy = World.heightAt(npx, npz);
      const npc = this.makeNPC(n, nyy + 0.1);
      npc.position.x = npx; npc.position.z = npz;
      npc.rotation.y = sry;
      this.scene.add(npc);
      this._attachNPCGLB(npc, n);
      this.npcTags.push({ x: npx, y: nyy + 2.6, z: npz, label: n.name, sub: n.title, color: n.roleColor || "#e8d8b8" });
      this.interactables.push({ id: n.id, type: "npc", x: npx, z: npz, radius: 3.6, npc: n });
      this.colliders.push({ x: sx, z: sz, hw: 3.2, hd: 2.5, a: sry });
    }

    // --- mobiliario de la plaza ---
    // bancos (entre los paseos, radio 16)
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const bx = Math.cos(a) * 17, bz = Math.sin(a) * 17;
      const bench = new THREE.Group();
      const seat = this.box(2.4, 0.14, 0.62, 0x7a5636);
      seat.position.y = 0.52;
      const back = this.box(2.4, 0.5, 0.12, 0x7a5636);
      back.position.set(0, 0.85, -0.28);
      bench.add(seat, back);
      for (const lx of [-1, 1]) {
        const leg = this.box(0.16, 0.52, 0.5, 0x4a3c28);
        leg.position.set(lx * 1.0, 0.26, 0);
        bench.add(leg);
      }
      bench.position.set(bx, PT, bz);
      bench.rotation.y = -a + Math.PI / 2; // mirando a la fuente
      this.scene.add(bench);
      this.colliders.push({ x: bx, z: bz, hw: 1.2, hd: 0.35, a: -a + Math.PI / 2 });
    }
    // jardinerías con flores en los cuadrantes (en diagonal, entre puestos)
    const flowerCols = [0xd85a6a, 0xe8c84a, 0xb97ad8, 0xe88a3c];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const px = Math.cos(a) * 39, pz = Math.sin(a) * 39;
      const bed = new THREE.Group();
      const boxm = this.box(3.0, 0.5, 1.4, 0x7a5636);
      boxm.position.y = 0.25;
      const soil = this.box(2.7, 0.14, 1.1, 0x3f2f1f, { rough: 1 });
      soil.position.y = 0.53;
      bed.add(boxm, soil);
      for (let f = 0; f < 7; f++) {
        const fx = Utils.rand(-1.2, 1.2), fz = Utils.rand(-0.4, 0.4);
        const stem = this.box(0.05, 0.3, 0.05, 0x3f7a34);
        stem.position.set(fx, 0.7, fz);
        const bloom = this.sph(0.14, flowerCols[f % flowerCols.length], { emissive: flowerCols[f % flowerCols.length], emissiveIntensity: 0.15 });
        bloom.position.set(fx, 0.9, fz);
        bed.add(stem, bloom);
      }
      bed.position.set(px, PT, pz);
      bed.rotation.y = -a;
      this.scene.add(bed);
      this.colliders.push({ x: px, z: pz, hw: 1.5, hd: 0.7, a: -a });
    }
    // barriles y cajas de mercancía
    const crateCluster = (x, z) => {
      const g = new THREE.Group();
      const c1 = this.box(0.9, 0.9, 0.9, 0x8a6a42, { rough: 1 });
      c1.position.set(0, 0.45, 0);
      const c2 = this.box(0.8, 0.8, 0.8, 0x96744a, { rough: 1 });
      c2.position.set(0.55, 0.4, 0.75);
      const c3 = this.box(0.75, 0.75, 0.75, 0x8a6a42, { rough: 1 });
      c3.position.set(0.1, 1.28, 0.1);
      c3.rotation.y = 0.4;
      g.add(c1, c2, c3);
      const b1 = this.cyl(0.42, 0.46, 1.0, 10, 0x6d4c33, { rough: 0.9 });
      b1.position.set(-1.1, 0.5, 0.6);
      const band1 = this.cyl(0.47, 0.47, 0.1, 10, 0x4a3c28);
      band1.position.set(-1.1, 0.75, 0.6);
      const band2 = this.cyl(0.47, 0.47, 0.1, 10, 0x4a3c28);
      band2.position.set(-1.1, 0.3, 0.6);
      g.add(b1, band1, band2);
      g.position.set(x, PT, z);
      this.scene.add(g);
      this.colliders.push({ x: x - 0.2, z: z + 0.3, r: 1.75 });
    };
    crateCluster(-8, -14);
    crateCluster(10, 14);
    crateCluster(-30, 6);
    // carreta de mercado
    const cart = new THREE.Group();
    const cartBed = this.box(3.0, 0.5, 1.7, 0x7a5636);
    cartBed.position.y = 0.85;
    cart.add(cartBed);
    for (const sx of [-1, 1]) {
      const side = this.box(3.0, 0.5, 0.12, 0x8a6a42);
      side.position.set(0, 1.3, sx * 0.8);
      cart.add(side);
    }
    for (const sx of [-1, 1]) {
      const wheel = this.cyl(0.62, 0.62, 0.16, 12, 0x4a3c28);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 1.0, 0.62, 0.92);
      cart.add(wheel);
      const wheel2 = wheel.clone();
      wheel2.position.z = -0.92;
      cart.add(wheel2);
    }
    const handle = this.box(0.14, 0.14, 2.0, 0x6d4c33);
    handle.position.set(1.55, 0.9, 0);
    handle.rotation.x = 0.25;
    cart.add(handle);
    const hayB = this.box(1.1, 0.6, 1.2, 0xd8b84a, { rough: 1 });
    hayB.position.set(-0.6, 1.4, 0);
    cart.add(hayB);
    cart.position.set(-14, PT, 20);
    cart.rotation.y = 0.7;
    this.scene.add(cart);
    this.colliders.push({ x: -14, z: 20, hw: 1.7, hd: 1.55, a: 0.7 });

    // --- props KayKit junto a las casas del pueblo ---
    const propSpot = (x, z) => World.heightAt(x, z);
    this.addKayProp("resource_lumber", { x: 15.5, y: propSpot(15.5, 33), z: 33, h: 0.8, yaw: 0.6 });
    this.addKayProp("barrel", { x: 6.2, y: propSpot(6.2, 34.5), z: 34.5, h: 1.0 });
    this.addKayProp("barrel", { x: 40, y: propSpot(40, -20.5), z: -20.5, h: 1.0 });
    this.addKayProp("crate_A_big", { x: 41.4, y: propSpot(41.4, -21.6), z: -21.6, h: 0.9, yaw: 0.5 });
    this.addKayProp("wheelbarrow", { x: 45.5, y: propSpot(45.5, 22.5), z: 22.5, h: 0.6, yaw: 1.0 });
    this.addKayProp("crate_open", { x: 54, y: propSpot(54, 30), z: 30, h: 0.8, yaw: -0.4 });
    this.addKayProp("sack", { x: 47.6, y: propSpot(47.6, 30.5), z: 30.5, h: 0.6, yaw: 0.8 });
    this.addKayProp("well", {
      x: 11, y: propSpot(11, -49), z: -49, h: 2.6, yaw: 0.4,
      collider: { x: 11, z: -49, r: 1.1 },
    });

    // --- gallinas y gallinero ---
    const coop = new THREE.Group();
    const coopBox = this.box(2.4, 1.5, 1.8, 0x8a6a42);
    coopBox.position.y = 0.75;
    const coopRoof = this.box(2.7, 0.16, 2.1, 0x5c4024);
    coopRoof.position.y = 1.6;
    const coopDoor = this.box(0.8, 0.9, 0.1, 0x3a2a16);
    coopDoor.position.set(0, 0.5, 0.95);
    coop.add(coopBox, coopRoof, coopDoor);
    coop.position.set(-30, PT, -40);
    coop.rotation.y = 0.5;
    this.scene.add(coop);
    this.colliders.push({ x: -30, z: -40, hw: 1.4, hd: 1.15, a: 0.5 });
    const chickenSpots = [[-27.5, -37.5], [-32.5, -37], [-28.5, -43.5]];
    const chickCols = [0xf0ead8, 0xc8743c, 0xe8d8b0];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const body = this.sph(0.24, chickCols[i]);
      body.scale.set(1, 0.9, 1.25);
      body.position.y = 0.3;
      const head = this.sph(0.14, chickCols[i]);
      head.position.set(0, 0.56, 0.2);
      const beak = this.cyl(0.0, 0.06, 0.14, 5, 0xe8a030);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.55, 0.36);
      const comb = this.box(0.05, 0.1, 0.12, 0xc03a2e);
      comb.position.set(0, 0.68, 0.18);
      const tail = this.box(0.06, 0.2, 0.14, chickCols[i]);
      tail.position.set(0, 0.42, -0.26);
      tail.rotation.x = -0.5;
      g.add(body, head, beak, comb, tail);
      g.position.set(chickenSpots[i][0], PT, chickenSpots[i][1]);
      this.scene.add(g);
      this.chickens.push({
        g: g, cx: chickenSpots[i][0], cz: chickenSpots[i][1],
        r: 1.4 + i * 0.6, spd: 0.22 + i * 0.07, ph: i * 2.1, base: PT,
      });
    }

    // --- palomas sobrevolando el pueblo ---
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const body = this.sph(0.17, 0x6a6a78);
      body.scale.set(1, 0.8, 1.7);
      const headB = this.sph(0.1, 0x5a5a68);
      headB.position.set(0, 0.06, 0.24);
      g.add(body, headB);
      const wingGeo = new THREE.BoxGeometry(0.6, 0.04, 0.2);
      const wingMat = this.mat(0x74748a, { rough: 1 });
      const wL = new THREE.Mesh(wingGeo, wingMat);
      wL.position.set(-0.3, 0.04, 0);
      const wR = new THREE.Mesh(wingGeo, wingMat);
      wR.position.set(0.3, 0.04, 0);
      g.add(wL, wR);
      this.scene.add(g);
      this.birds.push({
        g: g, wL: wL, wR: wR,
        r: 26 + i * 4.5, h: 13 + (i % 3) * 3.2,
        spd: 0.22 + i * 0.05, ph: i * 1.7,
      });
    }

    // --- banderas del pueblo ---
    const flagSpots = [[30, 30], [-30, 30], [30, -30], [-30, -30]];
    for (const [fx, fz] of flagSpots) {
      this.spawnTownFlag(fx, PT, fz, fx > 0 ? 0xb4374a : 0x3a6ea5);
    }

    // --- marcador de aparición del jugador ---
    const halo = this.box(3, 0.1, 3, 0x6fe0a0, { emissive: 0x2f9a6a, emissiveIntensity: 1.2, transparent: true, opacity: 0.5 });
    halo.position.set(6, PT + 0.02, 8);
    this.scene.add(halo);
  },

  /* ---------------- kiosco de mercado ---------------- */
  makeKiosk(n, shop) {
    const g = new THREE.Group();
    const wood = 0x6b4a2f;
    const A = shop ? 0xb4374a : 0x3a6ea5;   // color principal del toldo
    const B = 0xf0e6d2;                       // franja clara

    // cuerpo base: procedural como fallback hasta que carga el modelo
    const body = new THREE.Group();
    g.add(body);

    // plataforma
    const plat = this.box(5.4, 0.28, 4.6, 0x8a8072, { rough: 1 });
    plat.position.y = 0.14;
    body.add(plat);

    // 4 postes
    for (const px of [-1, 1]) for (const pz of [-1, 1]) {
      const post = this.box(0.2, 2.9, 0.2, wood);
      post.position.set(px * 2.4, 1.45 + 0.28, pz * 2.0);
      body.add(post);
    }

    // mostradores dobles (mercancía por ambos lados)
    for (const sz of [-1, 1]) {
      const counter = this.box(4.6, 0.9, 1.0, 0x7a5636, { rough: 0.9 });
      counter.position.set(0, 0.73, sz * 1.62);
      const top = this.box(4.8, 0.12, 1.2, 0x5c4024, { rough: 0.85 });
      top.position.set(0, 1.24, sz * 1.62);
      body.add(counter, top);
    }
    // panel lateral bajo (silueta del kiosco)
    for (const sx of [-1, 1]) {
      const side = this.box(0.14, 1.1, 3.4, 0x7a5636);
      side.position.set(sx * 2.5, 0.83, 0);
      body.add(side);
    }

    // techo de listones a rayas
    const roofBase = this.box(5.7, 0.14, 4.9, wood);
    roofBase.position.y = 3.05;
    body.add(roofBase);
    const stripes = 6, sw = 5.6 / stripes;
    for (let i = 0; i < stripes; i++) {
      const st = this.box(sw, 0.1, 4.94, i % 2 === 0 ? A : B, { rough: 0.8 });
      st.position.set(-2.8 + sw / 2 + i * sw, 3.16, 0);
      body.add(st);
    }
    // fleco colgante en los dos bordes largos
    for (const sz of [-1, 1]) {
      for (let i = 0; i < stripes; i++) {
        const flap = this.box(sw * 0.92, 0.4, 0.06, i % 2 === 0 ? B : A, { rough: 0.85 });
        flap.position.set(-2.8 + sw / 2 + i * sw, 2.88, sz * 2.46);
        flap.rotation.x = sz * 0.16;
        body.add(flap);
      }
    }

    // el modelo KayKit (market) sustituye al cuerpo cuando carga
    GLBCache.instance("models/kaykit/market.gltf").then((entry) => {
      if (!entry) return;
      const root = entry.root;
      root.scale.setScalar(1);
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const k = 3.4 / ((box.max.y - box.min.y) || 3.4);
      root.scale.setScalar(k);
      root.position.y = -box.min.y * k;
      root.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      g.remove(body);
      g.add(root);
      this.glbReady++;
      this._settleGoods(g, goods, root);
    });

    // mercancía según el oficio
    const goods = new THREE.Group();
    const role = n.role;
    const crate = (x, z, s) => {
      const c = this.box(s, s, s, 0x8a6a42, { rough: 1 });
      c.position.set(x, 1.3 + s / 2, z);
      c.rotation.y = Utils.rand(0, 1);
      goods.add(c);
    };
    if (role === "weapons") {
      for (let i = 0; i < 3; i++) {
        const blade = this.box(0.07, 1.0, 0.14, 0xcfd4dc, { metal: 0.8, rough: 0.25 });
        blade.position.set(-1.4 + i * 0.5, 1.9, 1.6);
        blade.rotation.z = Utils.rand(-0.18, 0.18);
        const guard = this.box(0.3, 0.08, 0.16, 0xd4a437, { metal: 0.6 });
        guard.position.set(-1.4 + i * 0.5, 1.44, 1.6);
        const grip = this.box(0.09, 0.28, 0.1, 0x4a3018);
        grip.position.set(-1.4 + i * 0.5, 1.3, 1.6);
        goods.add(blade, guard, grip);
      }
      crate(1.6, 1.6, 0.7);
      crate(-1.8, -1.6, 0.6);
    } else if (role === "armors") {
      for (let i = 0; i < 2; i++) {
        const shield = this.cyl(0.45, 0.45, 0.12, 8, i ? 0x4a6ea5 : 0xb4374a, { metal: 0.4, rough: 0.5 });
        shield.rotation.x = Math.PI / 2 - 0.35;
        shield.position.set(-1.1 + i * 1.1, 1.75, 1.55);
        const boss = this.sph(0.12, 0xd4a437, { metal: 0.7, rough: 0.3 });
        boss.position.set(-1.1 + i * 1.1, 1.78, 1.72);
        goods.add(shield, boss);
      }
      const helm = this.sph(0.4, 0xb8bec8, { metal: 0.55, rough: 0.4 });
      helm.scale.set(1, 0.9, 1.05);
      helm.position.set(1.7, 1.7, -1.6);
      goods.add(helm);
      crate(-1.9, -1.5, 0.65);
    } else if (role === "potions") {
      const potCols = [0xef5350, 0x4fc3f7, 0x66bb6a, 0xba68c8, 0xffb74d];
      for (let i = 0; i < 5; i++) {
        const bottle = this.cyl(0.1, 0.15, 0.36, 7, potCols[i], { emissive: potCols[i], emissiveIntensity: 0.5, rough: 0.25 });
        bottle.position.set(-1.6 + i * 0.55, 1.48, 1.6);
        const neck = this.cyl(0.05, 0.05, 0.12, 6, 0xd8c8a0);
        neck.position.set(-1.6 + i * 0.55, 1.7, 1.6);
        goods.add(bottle, neck);
      }
      for (let i = 0; i < 3; i++) {
        const bottle = this.cyl(0.09, 0.13, 0.3, 7, potCols[(i + 2) % 5], { emissive: potCols[(i + 2) % 5], emissiveIntensity: 0.4 });
        bottle.position.set(-0.6 + i * 0.55, 1.45, -1.6);
        goods.add(bottle);
      }
      crate(1.8, -1.5, 0.6);
    } else if (role === "gacha") {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.34),
        this.mat(0xb45aff, { emissive: 0x7c3aff, emissiveIntensity: 1.6, rough: 0.2 }));
      gem.position.set(0, 1.9, 1.6);
      goods.add(gem);
      for (const cx of [-1.4, 1.4]) {
        const candle = this.cyl(0.07, 0.07, 0.3, 6, 0xe8dcc0);
        candle.position.set(cx, 1.45, 1.6);
        const flame = this.sph(0.07, 0xffcf6a, { emissive: 0xffa020, emissiveIntensity: 2.4 });
        flame.position.set(cx, 1.66, 1.6);
        goods.add(candle, flame);
      }
      crate(-1.7, -1.6, 0.6);
    } else if (role === "quests") {
      const bookCols = [0x8a3a3a, 0x3a5a8a, 0x3a7a4a];
      for (let i = 0; i < 3; i++) {
        const book = this.box(0.6, 0.14, 0.44, bookCols[i], { rough: 0.8 });
        book.position.set(-1.3 + i * 0.16, 1.38 + i * 0.15, 1.55);
        book.rotation.y = 0.2 * i;
        goods.add(book);
      }
      const scroll = this.cyl(0.1, 0.1, 0.7, 8, 0xe8dcc0);
      scroll.rotation.z = Math.PI / 2;
      scroll.position.set(1.4, 1.4, 1.6);
      goods.add(scroll);
      crate(1.7, -1.55, 0.6);
    } else if (role === "mounts" || role === "mountshop") {
      const hay = this.box(1.2, 0.6, 0.9, 0xd8b84a, { rough: 1 });
      hay.position.set(-1.2, 1.6, 1.55);
      const bucket = this.cyl(0.24, 0.2, 0.36, 8, 0x6d4c33);
      bucket.position.set(1.3, 1.48, 1.55);
      goods.add(hay, bucket);
      crate(1.6, -1.5, 0.7);
      crate(0.9, -1.7, 0.55);
    } else if (role === "trade") {
      for (let i = 0; i < 3; i++) {
        const sack = this.sph(0.32, 0xcdb891, { rough: 1 });
        sack.scale.set(1, 1.15, 1);
        sack.position.set(-1.3 + i * 0.75, 1.6, 1.55);
        goods.add(sack);
      }
      for (let i = 0; i < 4; i++) {
        const coin = this.cyl(0.12, 0.12, 0.04, 8, 0xe8c040, { metal: 0.7, rough: 0.3 });
        coin.position.set(0.9 + (i % 2) * 0.2, 1.34 + i * 0.045, -1.55);
        goods.add(coin);
      }
      crate(-1.8, -1.6, 0.6);
    } else if (role === "pvp") {
      for (let i = 0; i < 2; i++) {
        const haft = this.box(0.08, 1.1, 0.08, 0x6d4c33);
        haft.position.set(-1.0 + i * 0.9, 1.9, 1.55);
        haft.rotation.z = i ? 0.25 : -0.25;
        const axeHead = this.box(0.34, 0.26, 0.1, 0xcfd4dc, { metal: 0.8, rough: 0.25 });
        axeHead.position.set(-1.0 + i * 0.9 + (i ? 0.16 : -0.16), 2.35, 1.55);
        goods.add(haft, axeHead);
      }
      crate(1.6, 1.55, 0.7);
      crate(-1.7, -1.55, 0.6);
    } else {
      // guardián de la torre / misceláneo
      const map = this.box(1.1, 0.05, 0.8, 0xe8dcc0);
      map.position.set(0, 1.33, 1.55);
      const lantern = this.cyl(0.14, 0.16, 0.3, 6, 0xffcf6a, { emissive: 0xffa020, emissiveIntensity: 2 });
      lantern.position.set(1.5, 1.48, 1.55);
      goods.add(map, lantern);
      crate(-1.6, -1.6, 0.65);
    }
    // barril de la esquina
    const barrel = this.cyl(0.4, 0.44, 0.95, 10, 0x6d4c33, { rough: 0.9 });
    barrel.position.set(2.1, 0.76, -1.75);
    g.add(barrel, goods);
    return g;
  },

  /* Recoloca la mercancía sobre las superficies reales del modelo KayKit.
     Medido por raycast: mostrador frontal y=1.56 (z 0.5-1.0, x -3..2),
     estante izquierdo y=0.71, estante derecho y=1.26 (rel. a la losa).
     La mercancía procedural va en z ±1.6: al cargar el GLB se reubica. */
  _settleGoods(g, goods, glbRoot) {
    g.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    ray.far = 20;
    const down = new THREE.Vector3(0, -1, 0);
    const surf = (lx, lz) => {
      const p = new THREE.Vector3(lx, 12, lz).applyMatrix4(g.matrixWorld);
      ray.set(p, down);
      const h = ray.intersectObject(glbRoot, true);
      return h.length ? h[0].point.y - g.position.y : null;
    };
    const hf = surf(0, 0.55), hl = surf(-3.05, -1.2), hr = surf(3.05, -1.2);
    const slots = { l: [-1.35, -0.75], r: [-1.35, -0.75] };
    const used = { l: 0, r: 0 };
    const seen = {};
    for (const ch of goods.children) {
      const p = ch.position;
      if (p.z > 1.0) {
        p.z = 0.55;
        if (hf !== null) p.y += hf - 1.3;
      } else if (p.z < -1.0) {
        const side = p.x <= 0 ? "l" : "r";
        const key = side + Math.round(p.x * 2);
        if (!(key in seen)) seen[key] = slots[side][used[side]++ % 2];
        p.x = side === "l" ? -3.05 : 3.05;
        p.z = seen[key];
        const t = side === "l" ? hl : hr;
        if (t !== null) p.y += t - 1.3;
      }
    }
  },

  /* ---------------- NPC del pueblo ---------------- */
  makeNPC(n, y) {
    const g = new THREE.Group();
    const roleCols = {
      weapons: 0xb4452f, armors: 0x4a6ea5, potions: 0x59a55c, gacha: 0x8a5fc8,
      quests: 0xc8a03c, mountshop: 0xa5683c, mounts: 0xa5683c, trade: 0xc8963c,
      pvp: 0xa53c50, castle: 0x6a7a8a,
    };
    const col = roleCols[n.role] || 0x7a6a9a;
    const skin = 0xefc49a;
    let hair = 0x4a3524;
    for (let i = 0; i < n.id.length; i++) hair = (hair * 31 + n.id.charCodeAt(i)) >>> 0;
    const hairCols = [0x4a3524, 0x2a2018, 0x8a6a3c, 0x9a9285, 0x6a3a2a];

    // túnica cónica
    const robe = this.cyl(0.34, 0.56, 1.45, 8, col, { rough: 1 });
    robe.position.y = 0.78;
    // zapatillas
    for (const sx of [-1, 1]) {
      const foot = this.box(0.18, 0.14, 0.3, 0x3a2a1a);
      foot.position.set(sx * 0.15, 0.07, 0.1);
      g.add(foot);
    }
    // cinturón
    const belt = this.cyl(0.4, 0.4, 0.12, 8, 0x4a3520, { rough: 0.9 });
    belt.position.y = 1.06;
    // delantal / pecho con el color del oficio
    const apron = this.box(0.5, 0.6, 0.1, col === 0x7a6a9a ? 0xc8b8d8 : 0xe8dcc0, { rough: 1 });
    apron.position.set(0, 1.05, 0.42);
    // brazos
    for (const sx of [-1, 1]) {
      const arm = this.box(0.16, 0.62, 0.16, col);
      arm.position.set(sx * 0.44, 1.14, 0);
      arm.rotation.z = sx * 0.1;
      const hand = this.sph(0.1, skin);
      hand.position.set(sx * 0.47, 0.8, 0);
      g.add(arm, hand);
    }
    // cabeza, pelo y ojos
    const head = this.sph(0.24, skin, { rough: 0.75 });
    head.position.y = 1.68;
    const hairM = this.sph(0.255, hairCols[Math.abs(hair) % hairCols.length], { rough: 1 });
    hairM.scale.set(1, 0.82, 1);
    hairM.position.set(0, 1.78, -0.03);
    for (const sx of [-1, 1]) {
      const eye = this.box(0.05, 0.06, 0.04, 0x2a2a35);
      eye.position.set(sx * 0.09, 1.7, 0.215);
      g.add(eye);
    }
    g.add(robe, belt, apron, head, hairM);
    g.userData.npc = n;
    g.name = "npc_" + n.id;
    g.traverse(o => { if (o.isMesh) { o.userData.npcId = n.id; } });
    g.position.y = y;
    return g;
  },

  /* ---------------- Castle tower (exterior landmark) ---------------- */
  buildCastle() {
    const y0 = World.heightAt(0, -96);
    const g = new THREE.Group();
    const tiers = 14;
    const baseR = 13, topR = 8.6;
    const wallMat = this.mat(0x8d94a5, { rough: 0.9 });
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const r = Utils.lerp(baseR, topR, t * t);
      const h = 16;
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), wallMat);
      cyl.position.y = y0 + (i + 0.5) * h;
      cyl.castShadow = true; cyl.receiveShadow = true;
      g.add(cyl);
      // merlon ring
      for (let m = 0; m < 10; m++) {
        const ma = m / 10 * Math.PI * 2;
        const mer = this.box(1.2, 1.6, 1.2, 0x6c7487);
        mer.position.set(Math.cos(ma) * r, y0 + (i + 1) * h + 0.8, Math.sin(ma) * r);
        g.add(mer);
      }
      // band
      const bandS = this.box(r * 2.02, 1.4, r * 2.02, 0x5c6478);
      bandS.position.y = y0 + (i + 1) * h - 0.7;
      g.add(bandS);
    }
    // spire top
    const spire = new THREE.Mesh(new THREE.ConeGeometry(5, 20, 8), this.mat(0x5c6478, { metal: 0.3, rough: 0.5 }));
    spire.position.y = y0 + tiers * 16 + 9;
    spire.castShadow = true;
    g.add(spire);
    // glowing window strips for flavor
    for (let i = 0; i < 6; i++) {
      const wr = this.box(0.7, 3.4, 0.7, 0xffcf6a, { emissive: 0xffb040, emissiveIntensity: 2 });
      wr.position.set(0, y0 + 8 + i * 22, -baseR);
      g.add(wr);
    }
    // base platform
    const plat = this.box(34, 2, 34, 0x8d94a5, { rough: 0.9 });
    plat.position.set(0, y0 - 1, 0);
    g.add(plat);
    // door + braziers
    const door = this.box(3.4, 5, 1.2, 0x3a2c1c);
    door.position.set(0, y0 + 2.5, 17);
    g.add(door);
    for (const sx of [-1, 1]) {
      const brazier = this.cyl(0.5, 0.35, 0.7, 8, 0x3c3c46, { metal: 0.4, rough: 0.6 });
      brazier.position.set(sx * 3.4, y0 + 2.4, 17.6);
      const flameM = this.mat(0xffb040, { emissive: 0xff6a20, emissiveIntensity: 3 });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 6), flameM);
      flame.position.set(sx * 3.4, y0 + 3.2, 17.6);
      g.add(brazier, flame);
      this.fires.push({ mesh: flame, mat: flameM, ph: sx > 0 ? 1.7 : 0.3, base: 3 });
      this.addSmoke(g, sx * 3.4, y0 + 3.9, 17.6, 3);
      this.colliders.push({ x: sx * 3.4, z: -96 + 17.6, r: 0.6 });
    }
    this.colliders.push({ x: 0, z: -96, hw: 17, hd: 17, a: 0 });
    // el cuerpo de la torre va en el yacimiento del castillo (z=-96),
    // junto a puerta/plataforma/interactable (coordenadas ya relativas a g)
    g.position.set(0, 0, -96);
    this.scene.add(g);

    // gatehouses / walls of town
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const wx = Math.cos(a) * 74, wz = Math.sin(a) * 74;
      const towerG = new THREE.Group();
      const w = this.box(7, 9, 7, 0x9a8a63);
      w.position.y = 4.5;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(5.4, 4, 4), this.mat(0x8d5a3a));
      cone.position.y = 9.5; cone.rotation.y = Math.PI / 4;
      towerG.add(w, cone);
      towerG.position.set(wx, World.heightAt(wx, wz), wz);
      this.scene.add(towerG);
      this.colliders.push({ x: wx, z: wz, hw: 3.5, hd: 3.5, a: 0 });
    }

    // castle entrance interactable
    this.interactables.push({ id: "castle_door", type: "castle", x: 0, z: -96 + 8, radius: 10.5, npc: null });
    this.gate = g;
  },

  /* ---------------- Mount paddock ---------------- */
  buildMountPaddock() {
    const y0 = World.heightAt(30 * 1.5, -6 * 1.5);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      const fx = 30 * 1.5 + Math.cos(a) * 9, fz = -6 * 1.5 + Math.sin(a) * 9;
      const post = this.box(0.35, 1.6, 0.35, 0x6d4c33);
      post.position.set(fx, y0 + 0.8, fz);
      this.scene.add(post);
      this.colliders.push({ x: fx, z: fz, r: 0.35 });
      // travesaño tangente entre postes (hueco de entrada en i=4, mirando al pueblo)
      if (i !== 4) {
        const phi = a + Math.PI / 10;
        const rx = 30 * 1.5 + Math.cos(phi) * 8.56, rz = -6 * 1.5 + Math.sin(phi) * 8.56;
        const rot = -(phi + Math.PI / 2);
        const rail = this.box(5.58, 0.18, 0.18, 0x6d4c33);
        rail.position.set(rx, y0 + 1.25, rz);
        rail.rotation.y = rot;
        this.scene.add(rail);
        this.colliders.push({ x: rx, z: rz, hw: 2.79, hd: 0.12, a: rot });
      }
    }
    // pajareras: pacas de heno y comedero (dentro del corral, alejadas del poste del corral)
    const hay1 = this.box(1.4, 1.0, 1.2, 0xd8b84a, { rough: 1 });
    hay1.position.set(41.5, y0 + 0.5, -13.8);
    const hay2 = this.box(1.1, 0.8, 1.0, 0xc8a83c, { rough: 1 });
    hay2.position.set(41.9, y0 + 1.4, -14.0);
    hay2.rotation.y = 0.5;
    this.scene.add(hay1, hay2);
    this.colliders.push({ x: 41.5, z: -13.8, r: 1.1 });
    const trough = this.box(2.2, 0.6, 0.8, 0x6d4c33);
    trough.position.set(41, y0 + 0.3, -3.5);
    this.scene.add(trough);
    this.colliders.push({ x: 41, z: -3.5, hw: 1.1, hd: 0.4, a: 0 });

    // a couple of idle mounts
    const idleMount = new THREE.Group();
    const body = this.box(2.4, 1, 0.9, 0x8d6e63);
    body.position.y = 0.9;
    const neck = this.box(0.6, 1, 0.6, 0x8d6e63);
    neck.position.set(-1.25, 1.5, 0);
    const headM = this.box(0.6, 0.6, 0.8, 0x8d6e63);
    headM.position.set(-1.35, 1.7, 0);
    const mane = this.box(0.2, 0.7, 0.7, 0x4a3524);
    mane.position.set(-1.0, 1.7, 0);
    idleMount.add(body, neck, headM, mane);
    idleMount.position.set(30 * 1.5 - 4.5, y0, -6 * 1.5);
    this.scene.add(idleMount);
    this.colliders.push({ x: 30 * 1.5 - 4.5, z: -6 * 1.5, hw: 1.6, hd: 0.55, a: 0 });
  },

  /* ---------------- Villages (raid grounds) ---------------- */
  buildVillage(v) {
    const g = new THREE.Group();
    const y0 = World.heightAt(v.x, v.z);
    g.position.set(v.x, y0, v.z);
    const wallCol = v.biome === "desert" ? 0xd9b37a : v.biome === "tundra" ? 0xcfe4ee : v.biome === "swamp" ? 0x4e564a : v.biome === "volcanic" ? 0x6a3a2a : 0xa89a6a;
    const roofCol = v.biome === "desert" ? 0x8a6f3c : v.biome === "tundra" ? 0x5c89a5 : v.biome === "swamp" ? 0x3a443a : v.biome === "volcanic" ? 0x3a1c14 : 0x8d5a3a;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const r = 16 + (i % 2) * 7;
      const hx = Math.cos(a) * r, hz = Math.sin(a) * r;
      const h = this.houseGLB(i % 2 ? "home_B" : "home_A", {
        h: 5.0, wall: wallCol, roof: roofCol, chimney: i % 2 === 0,
      });
      h.rotation.y = a;
      h.position.set(hx, 0, hz);
      // aspecto ruinoso
      if (i % 2 === 0) h.rotation.z = 0.12;
      g.add(h);
      this.colliders.push({
        x: v.x + hx, z: v.z + hz,
        hw: h.userData.size.w / 2 + 0.15, hd: h.userData.size.d / 2 + 0.15, a: a,
      });
      // escombros junto a las casas caídas
      if (i % 2 === 0) {
        for (let k = 0; k < 3; k++) {
          const rub = this.box(Utils.rand(0.4, 0.9), Utils.rand(0.2, 0.5), Utils.rand(0.4, 0.8), 0x8a8072, { rough: 1 });
          rub.position.set(hx + Utils.rand(-3.5, 3.5), 0.2, hz + Utils.rand(-3.5, 3.5));
          rub.rotation.y = Utils.rand(0, 3);
          g.add(rub);
        }
      }
    }
    // tienda de campaña y bodegas de los ocupantes
    this.addKayProp("tent", { x: -8, y: 0, z: 7, h: 2.6, yaw: 0.7, parent: g, collider: { x: v.x - 8, z: v.z + 7, r: 0.9 } });
    this.addKayProp("barrel", { x: -7.5, y: 0, z: -2.6, h: 1.0, parent: g });
    this.addKayProp("crate_A_big", { x: 5.4, y: 0, z: 2.4, h: 0.9, yaw: 0.4, parent: g });
    // barricades + campfire
    const bf = this.box(5, 0.9, 1, 0x8a6f3c);
    bf.position.set(4, 0.45, 4);
    g.add(bf);
    this.colliders.push({ x: v.x + 4, z: v.z + 4, hw: 2.5, hd: 0.5, a: 0 });
    // fogata animada (llamas + humo)
    for (let i = 0; i < 3; i++) {
      const logm = this.cyl(0.16, 0.16, 1.4, 6, 0x5c4024);
      logm.rotation.z = Math.PI / 2;
      logm.rotation.y = i * 1.1;
      logm.position.set(-5, 0.18, -5);
      g.add(logm);
    }
    const fireM = this.mat(0xff8a40, { emissive: 0xff5a10, emissiveIntensity: 3, transparent: true, opacity: 0.92 });
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.5, 7), fireM);
    fire.position.set(-5, 0.95, -5);
    fire.castShadow = false;
    g.add(fire);
    this.fires.push({ mesh: fire, mat: fireM, ph: v.x * 0.01, base: 3 });
    this.addSmoke(g, -5, 1.9, -5, 4);
    this.colliders.push({ x: v.x - 5, z: v.z - 5, r: 0.7 });
    // central chest (raid reward)
    const chest = this.buildChest();
    chest.position.set(2, 0, 7.5);
    g.add(chest);
    this.colliders.push({ x: v.x + 2, z: v.z + 7.5, hw: 1.1, hd: 0.75, a: 0 });
    this.scene.add(g);
    this.interactables.push({ id: "chest_" + v.id, type: "chest", x: v.x + 2, z: v.z + 7.5, radius: 3, chest: v });
    // name banner
    this.spawnBanner(v.x, y0, v.z, v.name, "#e0c04a");
  },

  buildChest() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.5), this.mat(0x8d5a3a, { rough: 0.7 }));
    base.castShadow = true;
    base.position.y = 0.55;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 1.5), this.mat(0x9a643f, { rough: 0.7 }));
    lid.castShadow = true;
    lid.position.y = 1.2;
    lid.rotation.x = 0.15;
    const band = this.box(0.4, 0.35, 1.5, 0xd4a437, { metal: 0.6, rough: 0.3 });
    band.position.y = 1.45;
    const lock = this.box(0.4, 0.4, 0.2, 0xd4a437, { metal: 0.6 });
    lock.position.set(0, 0.9, 0.77);
    g.add(base, lid, band, lock);
    return g;
  },

  spawnBanner(x, y, z, text, color) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 6), this.mat(0x5d3a1a));
    post.castShadow = true;
    post.position.y = 3;
    const pivot = new THREE.Group();
    pivot.position.y = 4.6;
    const flag = this.box(5, 1.6, 0.15, 0x8d2020, { rough: 0.7 });
    flag.position.x = -2.8;
    pivot.add(flag);
    g.add(post, pivot);
    g.position.set(x, y, z);
    this.scene.add(g);
    this.flags.push({ pivot: pivot, ph: x * 0.02 + z * 0.013, spd: 1.2 + Math.abs(x % 3) * 0.2 });
    this.npcTags.push({ x, y: y + 5.9, z, label: text, sub: "", color: "#e8d8b8" });
    this.colliders.push({ x: x, z: z, r: 0.3 });
  },

  // bandera corta de la plaza (sin rótulo)
  spawnTownFlag(x, y, z, color) {
    const g = new THREE.Group();
    const post = this.box(0.22, 6.2, 0.22, 0x4a3c28);
    post.position.y = 3.1;
    const finial = this.sph(0.2, 0xd4a437, { metal: 0.6, rough: 0.3 });
    finial.position.y = 6.3;
    const pivot = new THREE.Group();
    pivot.position.y = 5.3;
    const flag = this.box(3.4, 1.9, 0.12, color, { rough: 0.75 });
    flag.position.x = -1.8;
    pivot.add(flag);
    g.add(post, finial, pivot);
    g.position.set(x, y, z);
    g.rotation.y = Math.atan2(x, z);
    this.scene.add(g);
    this.flags.push({ pivot: pivot, ph: x * 0.03, spd: 1.5 });
    this.colliders.push({ x: x, z: z, r: 0.35 });
  },

  /* ---------------- Boss arenas ---------------- */
  buildBossArena(b) {
    const g = new THREE.Group();
    const y0 = World.heightAt(b.x, b.z);
    g.position.set(b.x, y0, b.z);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(22, 23, 1.6, 24), this.mat(0x5c5666, { rough: 0.9 }));
    ring.position.y = 0.8;
    ring.castShadow = true; ring.receiveShadow = true;
    g.add(ring);
    // pillars
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const p = this.box(2, 7, 2, 0x3c3c46);
      p.position.set(Math.cos(a) * 19, 3.5, Math.sin(a) * 19);
      g.add(p);
      this.colliders.push({ x: b.x + Math.cos(a) * 19, z: b.z + Math.sin(a) * 19, r: 1.5 });
      const torchM = this.mat(0xffb040, { emissive: 0xff6a20, emissiveIntensity: 3 });
      const torch = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.7), torchM);
      torch.position.set(Math.cos(a) * 19, 7.4, Math.sin(a) * 19);
      g.add(torch);
      this.fires.push({ mesh: torch, mat: torchM, ph: i * 1.1, base: 3 });
    }
    // dormant boss altar crystal
    const altar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2, 3, 8), this.mat(0x3c3c46));
    altar.position.y = 1.5;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.3), this.mat(0xb45aff, { emissive: 0x7c3aff, emissiveIntensity: 2, transparent: true, opacity: 0.9 }));
    gem.position.y = 4.4;
    gem.name = "bossgem_" + b.id;
    g.add(altar, gem);
    this.scene.add(g);
    this.colliders.push({ x: b.x, z: b.z, r: 2 });
    this.interactables.push({ id: "boss_" + b.id, type: "boss", x: b.x, z: b.z, radius: 24, bossData: b });
  },

  /* ---------------- Cave entrances ---------------- */
  buildCaveEntrance(c) {
    const g = new THREE.Group();
    const y0 = World.heightAt(c.x, c.z);
    g.position.set(c.x, y0, c.z);
    // mound
    const mound = new THREE.Mesh(new THREE.IcosahedronGeometry(10, 1), this.mat(0x5c5c66, { rough: 1 }));
    mound.scale.set(2, 1.1, 1.6);
    mound.position.y = 2;
    mound.castShadow = true;
    g.add(mound);
    // arch
    for (let i = 0; i < 2; i++) {
      const side = this.box(1.4, 5.4, 1.4, 0x4a4a55);
      side.position.set(i === 0 ? -4 : 4, 2.7, 0);
      g.add(side);
    }
    const lintel = this.box(10.4, 1.6, 1.4, 0x4a4a55);
    lintel.position.set(0, 5.6, 0);
    g.add(lintel);
    // dark portal
    const portal = new THREE.Mesh(new THREE.CircleGeometry(3.4, 16), this.mat(0x000008, { emissive: 0x1a0a3a, emissiveIntensity: 1.6, transparent: true, opacity: 0.93, side: THREE.DoubleSide }));
    portal.position.set(0, 3.2, 3.1);
    g.add(portal);
    g.userData.cavePortal = { x: c.x, y: y0 + 3.2, z: c.z + 3.1 };
    this.scene.add(g);
    this.interactables.push({ id: "cave_" + c.id, type: "cave_enter", x: c.x, z: c.z + 4.5, radius: 5.5, cave: c, portal: g.userData.cavePortal });
    // bloqueo del interior del túnel: impide atravesar el túnel por detrás (entrada libre por la boca sur)
    this.colliders.push({ x: c.x, z: c.z - 7, hw: 22, hd: 9, a: 0 });
    // marker
    this.spawnBanner(c.x, y0, c.z, c.name, "#b45aff");
  },

  /* ---------------- World edge obelisk markers ---------------- */
  buildObelisks() {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      const r = 3090;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const g = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 26, 6), this.mat(0x3c3f56, { rough: 0.6, metal: 0.2 }));
      g.position.set(x, World.heightAt(x, z) + 13, z);
      g.rotation.y = a;
      g.castShadow = true;
      this.scene.add(g);
      this.colliders.push({ x: x, z: z, r: 2.6 });
    }
  },

  /* ============================================================
     Animaciones del mundo (llamado desde el bucle de Game)
     ============================================================ */
  update(dt, playerPos) {
    this._animT += dt;
    const t = this._animT;

    // NPCs: animación Idle (mezcladores con desfase entre sí)
    for (const m of this.npcMixers) m.update(dt);

    // humo de chimeneas y fogatas
    for (const s of this.smokeAnims) {
      for (const p of s.puffs) {
        const k = (t * 0.24 + p.phase) % 1;
        p.mesh.position.set(s.x + Math.sin(k * 6 + p.phase * 9) * 0.28 * k, s.y + k * 2.7, s.z + Math.cos(k * 5 + p.phase * 7) * 0.24 * k);
        const sc = 0.32 + k * 1.15;
        p.mesh.scale.set(sc, sc, sc);
        p.mesh.material.opacity = 0.42 * (k < 0.15 ? k / 0.15 : 1 - k);
      }
    }

    // banderas
    for (const f of this.flags) {
      f.pivot.rotation.y = Math.sin(t * f.spd + f.ph) * 0.16;
      f.pivot.rotation.z = Math.sin(t * 2.1 + f.ph) * 0.05;
    }

    // gallinas: caminan en círculos y picotean
    for (const c of this.chickens) {
      const a = t * c.spd + c.ph;
      c.g.position.set(c.cx + Math.cos(a) * c.r, c.base + Math.abs(Math.sin(t * 9 + c.ph)) * 0.05, c.cz + Math.sin(a) * c.r);
      c.g.rotation.y = -a;
      c.g.rotation.x = Math.sin(t * 9 + c.ph) * 0.12;
    }

    // palomas en vuelo
    for (const b of this.birds) {
      const a = t * b.spd + b.ph;
      b.g.position.set(Math.cos(a) * b.r, b.h + Math.sin(t * 0.5 + b.ph) * 1.6, Math.sin(a) * b.r);
      b.g.rotation.y = -a;
      const flap = Math.sin(t * 9 + b.ph) * 0.55;
      b.wL.rotation.z = flap;
      b.wR.rotation.z = -flap;
    }

    // fogatas: parpadeo de la llama
    for (const f of this.fires) {
      const fl = 1 + Math.sin(t * 13 + f.ph) * 0.16;
      f.mesh.scale.set(1 / Math.sqrt(fl), fl, 1 / Math.sqrt(fl));
      f.mat.emissiveIntensity = f.base + Math.sin(t * 17 + f.ph) * 0.9;
    }

    // agua de la fuente
    if (this.fountainWater) {
      this.fountainWater.material.emissiveIntensity = 0.45 + Math.sin(t * 2.2) * 0.18;
      this.fountainWater.position.y = 3.14 + Math.sin(t * 1.7) * 0.02;
    }

    // lámparas: brillan de noche
    if (this.lampMats.length && typeof World !== "undefined") {
      const tod = World.timeOfDay;
      const target = (tod < 6.5 || tod > 19.5) ? 3.4 : 1.1;
      const k = Math.min(1, dt * 3);
      for (const m of this.lampMats) m.emissiveIntensity += (target - m.emissiveIntensity) * k;
    }
  },
};

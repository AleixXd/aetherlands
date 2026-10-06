/* ============================================================
   game.js — Aetherlands: la saga del Aetherbound
   Orquestador maestro: renderer/cámara/escena, bucle principal,
   regiones, pegamento de combate, interacción, progresión,
   guardado y conexión con la UI.
   ============================================================ */
const Game = {
  /* ---------- núcleo ---------- */
  scene: null,
  camera: null,
  renderer: null,
  time: 0,
  dt: 0,
  clock: null,
  paused: false,
  dead: false,
  _deathHandled: false,
  respawnT: 0,
  _saveT: 0,
  _uiTick: 0,

  region: "overworld",      // overworld | castle | cave
  regionData: null,
  invulnT: 0,
  totalElapsed: 0,

  menuMode: false,          // menú principal: cámara orbital de fondo
  _menuA: 0.6,

  camYaw: 0, camPitch: 0.32, camDist: 8.5,

  /* subsistemas */
  player: null,
  enemyDirector: null,
  fx: null,
  sfx: null,
  ui: null,
  input: null,
  world: null,
  build: null,
  castle: null,
  caves: null,
  inventory: null,
  quests: null,

  NOTIFY_CAP: 5,

  mat(color, opts) { return Utils.mat(color, opts); },

  // resolución de colisores estáticos, según región
  resolveColliders(ent) {
    if (!ent || !ent.pos) return;
    if (this.region === "cave") { this.caves.resolveBounds(ent); return; }
    if (this.region === "castle") {
      const R = (this.castle.roomW || 44) / 2 - 1.2;
      const d = Math.hypot(ent.pos.x, ent.pos.z);
      if (d > R) { const f = R / d; ent.pos.x *= f; ent.pos.z *= f; }
      return;
    }
    // mundo exterior: árboles/rocas del chunk + construcciones
    const pr = ent === this.player ? (this.player.riding ? 0.75 : 0.45) : 0.55;
    this.world.solidPush(ent, pr);
    this._pushStatics(ent, pr);
  },

  // empuje fuera de construcciones: círculos {x,z,r} y cajas orientadas {x,z,hw,hd,a}
  _pushStatics(ent, pr) {
    for (const c of Build.colliders) {
      const dx = ent.pos.x - c.x, dz = ent.pos.z - c.z;
      if (c.hw === undefined) {
        const rr = c.r + pr;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const l = Math.sqrt(d2);
          if (l < 0.001) { ent.pos.x = c.x + rr; ent.pos.z = c.z; }
          else { ent.pos.x = c.x + dx / l * rr; ent.pos.z = c.z + dz / l * rr; }
        }
      } else {
        const ca = Math.cos(c.a || 0), sa = Math.sin(c.a || 0);
        const lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
        const ex = c.hw + pr, ez = c.hd + pr;
        if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
          const px = ex - Math.abs(lx), pz = ez - Math.abs(lz);
          let mlx, mlz;
          if (px < pz) { mlx = lx >= 0 ? ex : -ex; mlz = lz; }
          else { mlx = lx; mlz = lz >= 0 ? ez : -ez; }
          ent.pos.x = c.x + mlx * ca + mlz * sa;
          ent.pos.z = c.z - mlx * sa + mlz * ca;
        }
      }
    }
  },

  // primer choque del segmento contra construcciones/árboles, t ∈ (0,1) o null
  _segStatics(ax, ay, az, bx, by, bz) {
    const CLR = 0.35;
    const dx = bx - ax, dz = bz - az;
    const qa = dx * dx + dz * dz;
    if (qa < 1e-9) return null;
    let best = null;
    const sphereHit = (cx, cz, R) => {
      const mx = ax - cx, mz = az - cz;
      const qb = 2 * (mx * dx + mz * dz);
      const qc = mx * mx + mz * mz - R * R;
      if (qc < 0) { if (best === null || 0 < best) best = 0; return; }
      const disc = qb * qb - 4 * qa * qc;
      if (disc <= 0) return;
      const t = (-qb - Math.sqrt(disc)) / (2 * qa);
      if (t >= 0 && t <= 1 && (best === null || t < best)) best = t;
    };
    for (const c of Build.colliders) {
      if (c.hw === undefined) {
        sphereHit(c.x, c.z, c.r + CLR);
      } else {
        const ca = Math.cos(c.a || 0), sa = Math.sin(c.a || 0);
        const mx = ax - c.x, mz = az - c.z;
        const lx = mx * ca - mz * sa, lz = mx * sa + mz * ca;
        const ddx = dx * ca - dz * sa, ddz = dx * sa + dz * ca;
        const ex = c.hw + CLR, ez = c.hd + CLR;
        let t1 = -Infinity, t2 = Infinity, bad = false;
        if (Math.abs(ddx) < 1e-9) { if (Math.abs(lx) > ex) bad = true; }
        else {
          let u1 = (-ex - lx) / ddx, u2 = (ex - lx) / ddx;
          if (u1 > u2) { const s = u1; u1 = u2; u2 = s; }
          if (u1 > t1) t1 = u1;
          if (u2 < t2) t2 = u2;
        }
        if (!bad && Math.abs(ddz) < 1e-9) { if (Math.abs(lz) > ez) bad = true; }
        else if (!bad) {
          let u1 = (-ez - lz) / ddz, u2 = (ez - lz) / ddz;
          if (u1 > u2) { const s = u1; u1 = u2; u2 = s; }
          if (u1 > t1) t1 = u1;
          if (u2 < t2) t2 = u2;
        }
        if (bad || t1 > t2 || t2 <= 0 || t1 >= 1) continue;
        const t = t1 > 0 ? t1 : 0;
        if (best === null || t < best) best = t;
      }
    }
    // árboles y rocas del terreno
    const S = CFG.WORLD.CHUNK;
    const gx = Math.floor(ax / S), gz = Math.floor(az / S);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const ch = World.terrain.get(World._chunkKey(gx + i, gz + j));
        if (!ch || !ch.solids) continue;
        for (const s of ch.solids) sphereHit(s.x, s.z, s.r + CLR);
      }
    }
    return best;
  },

  /* ============================================================
     arranque
     ============================================================ */
  init() {
    Save.init(false);
    this.clock = new THREE.Clock();

    const canvas = document.getElementById("game-canvas") || document.body;
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xbfd8a8, 0.0022);

    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, CFG.WORLD.SIZE * 2);
    this.camera.position.set(0, 44, -14);
    this.camera.lookAt(0, 0, 0);

    // postprocesado (bloom + SSAO + ACES artesanal)
    if (typeof PostFX !== "undefined") PostFX.init(this.renderer, this.scene, this.camera);

    // mundo + constructor
    this.world = World;
    this.world.init(this.scene);

    this.build = Build;
    this.build.init(this.scene);

    // fx / sfx
    this.fx = Effects;
    this.fx.init(this.scene, this.camera, document.body);
    this.sfx = Sfx;
    this.sfx.init();

    // entrada
    this.input = Input;
    this.input.init(this.renderer.domElement);
    this.input.onKeyDown = (k) => this._onKeyDown(k);
    this.input.onClick = () => {
      this.sfx.resume();
      if (this.canAct()) { this.input.requestLock(); this.player.attack(); }
    };
    this.input.onRClick = () => this.sfx.resume();
    this.input.onUnlock = () => {
      // Esc libera el ratón: abre pausa en una sola pulsación
      if (this.canAct()) this.ui.togglePause(true);
    };

    // jugador
    this.player = Player;
    this.player.init(this);

    // directores y gestores
    this.enemyDirector = EnemyDirector;
    this.enemyDirector.init(this);
    this.castle = Castle;
    this.castle.init(this);
    this.caves = CaveManager;
    this.inventory = Inventory;
    this.quests = QuestManager;

    // UI
    this.ui = UI;
    this.ui.init(this);

    // ajustes guardados (audio + gráfica)
    if (typeof Settings !== "undefined") Settings.apply();

    this._bindEvents();
    this._spawnInitial();

    // menú principal siempre al entrar (da igual si hay partida guardada)
    this.menuMode = true;
    this.paused = true;
    this.ui.showMainMenu();

    const bn = document.getElementById("boot-note");
    if (bn) bn.classList.add("hidden");
    window.__gameReady = true;

    this.regionVisuals();
    this._render();
    requestAnimationFrame(() => this._loop());
  },

  _render() {
    if (typeof PostFX !== "undefined" && PostFX.inited) PostFX.render();
    else this.renderer.render(this.scene, this.camera);
  },

  _bindEvents() {
    addEventListener("resize", () => this._onResize());
    document.addEventListener("contextmenu", e => e.preventDefault());
    window.addEventListener("blur", () => { if (this.input) this.input.keys.clear(); });
  },

  _onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    if (typeof PostFX !== "undefined") PostFX.setSize();
  },

  // órbita lenta sobre el pueblo mientras dure el menú principal
  _updateMenuCamera(dt) {
    this._menuA += dt * 0.07;
    const a = this._menuA;
    const r = 47;
    const h = 25 + Math.sin(this._menuA * 0.6) * 3.5;
    this.camera.position.set(Math.sin(a) * r, h, Math.cos(a) * r);
    this.camera.lookAt(0, 2.6, 0);
  },

  // del menú al mundo: reanuda partida y captura el ratón
  enterWorld() {
    this.menuMode = false;
    this.paused = false;
    if (this.ui) { this.ui.hideMainMenu(); this.ui.menuOpen = false; }
    this._updateCamera(0.016, true);
    if (typeof Input !== "undefined") Input.requestLock();
  },

  _updateCamera(dt, snap) {
    const inp = this.input;
    if (inp && inp.mouse) {
      const sens = (typeof Settings !== "undefined" && Settings.s.sens) || 1;
      if (inp.locked) {
        // ratón capturado: giro libre
        this.camYaw -= (inp.mouse.dx || 0) * 0.0024 * sens;
        this.camPitch = Utils.clamp(this.camPitch + (inp.mouse.dy || 0) * 0.0022 * sens, -0.12, 1.05);
      } else if (!inp.everLocked && inp.mouse.inCanvas) {
        // fallback antes de la primera captura: giro por posición del cursor
        const ty = -inp.mouse.ndcX * 1.9;
        const tp = Utils.clamp(0.34 - inp.mouse.ndcY * 0.35, -0.12, 1.05);
        this.camYaw = Utils.dampAngle(this.camYaw, ty, 4, dt);
        this.camPitch = Utils.damp(this.camPitch, tp, 4, dt);
      }
      inp.mouse.dx = 0; inp.mouse.dy = 0;
    }
    const p = this.player.pos;
    const d = this.camDist, cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    let tx = p.x + Math.sin(this.camYaw) * cp * d;
    let tz = p.z + Math.cos(this.camYaw) * cp * d;
    let ty = p.y + 2.0 + sp * d;
    // la cámara no atraviesa construcciones ni árboles
    if (this.region === "overworld") {
      const ox = p.x, oy = p.y + 1.6, oz = p.z;
      const L = Math.hypot(tx - ox, ty - oy, tz - oz);
      if (L > 0.01) {
        const t = this._segStatics(ox, oy, oz, tx, ty, tz);
        if (t !== null && t < 1) {
          const ta = Math.max(t - 0.35 / L, 0.4 / L);
          tx = ox + (tx - ox) * ta;
          ty = oy + (ty - oy) * ta;
          tz = oz + (tz - oz) * ta;
        }
      }
    }
    const minY = this.groundHeight(tx, tz) + 0.6;
    if (ty < minY) ty = minY;
    const k = snap ? 1 : 1 - Math.exp(-10 * Math.max(dt, 0.001));
    this.camera.position.x += (tx - this.camera.position.x) * k;
    this.camera.position.y += (ty - this.camera.position.y) * k;
    this.camera.position.z += (tz - this.camera.position.z) * k;
    this.camera.lookAt(p.x, p.y + 1.8, p.z);
  },

  _spawnInitial() {
    const p = Save.data.player.pos;
    this.player.pos.set(p.x, this.groundHeight(p.x, p.z) + 0.6, p.z);
    this.player.vel.set(0, 0, 0);
    // el modelo se posiciona en buildModel (antes del spawn): recolócalo
    if (this.player.model) this.player.model.position.copy(this.player.pos);
    this.player.hp = this.player.stats().maxHp;
    this.player.stam = this.player.stats().maxStam;
  },

  /* ============================================================
     altura del suelo según región
     ============================================================ */
  groundHeight(x, z) {
    if (this.region === "castle") return Castle.groundHeight(x, z);
    if (this.region === "cave") return this.caves.groundHeight(x, z);
    return World.heightAt(x, z);
  },

  /* ============================================================
     bucle principal
     ============================================================ */
  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.dt = dt;

    // muerte / reaparición (antes que la pausa para que el contador siga)
    if (this.dead) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this._respawn();
      this.player.deathPose(dt);
      this._render();
      return;
    }

    if (this.paused && !this.menuMode) { this._render(); return; }

    // menú principal: mundo vivo de fondo con cámara orbital lenta
    if (this.menuMode) {
      this.time += dt;
      this._updateMenuCamera(dt);
      World.update(dt, this.camera.position.x, this.camera.position.z);
      if (this.build && this.build.update) this.build.update(dt, this.player.pos);
      if (this.fx) this.fx.update(dt, this);
      this._render();
      return;
    }

    this.time += dt;
    this.totalElapsed += dt;
    if (this.invulnT > 0) this.invulnT -= dt;

    // jugador
    this.player.update(dt);

    // cámara
    this._updateCamera(dt);

    // enemigos
    this.enemyDirector.update(dt);

    // gestores de región
    if (this.region === "castle") Castle.update(dt);
    else if (this.region === "cave") this.caves.update(dt);
    else World.update(dt, this.player.pos.x, this.player.pos.z);

    // fx
    this.fx.update(dt, this);
    if (this.build && this.build.update) this.build.update(dt, this.player.pos);

    // consagración (paladín)
    if (this.player.buffs.consecUntil > this.time) this.player.heal(14 * dt);

    // minimapa a ~4 Hz, nameplates y pista de interacción a ~7 Hz
    this._mmTick = ((this._mmTick || 0) + 1) % 15;
    if (this._mmTick === 0 && this.ui && this.ui.drawMinimap) this.ui.drawMinimap();
    this._uiTick = (this._uiTick + 1) % 9;
    if (this._uiTick === 0 && this.ui) {
      this.ui.updateNameplates();
      this.ui.updatePrompt(this._interactHint());
      this.ui.refreshHUD();
    }

    // guardado periódico
    this._saveT += dt;
    if (Save.data.stats) Save.data.stats.playTime += dt;
    if (this._saveT > CFG.PLAYER.SAVE_INTERVAL) { this._saveT = 0; Save.save(); }

    if (this.player.hp <= 0) this._onDeath();

    this._render();
  },

  /* ============================================================
     transiciones de región
     ============================================================ */
  _leaveRegion() {
    if (this.region === "castle") this.castle.dispose();
    else if (this.region === "cave") this.caves.disposeAll();
    else if (this.region === "overworld") World.resetChunks();
    this.enemyDirector.clearAll();
  },

  enterRegion(name, data) {
    this._leaveRegion();
    this.region = name;
    this.regionData = data || null;
    this.regionVisuals();
  },

  regionVisuals() {
    const ow = this.region === "overworld";
    if (this.build && this.build.group) this.build.group.visible = ow;
    if (World.water) World.water.visible = ow;
    if (this.ui) this.ui.refreshHUD();
  },

  onRegionEnter() {
    if (this.ui) this.ui.refreshHUD();
    Save.save();
  },

  /* ============================================================
     entrada (teclas)
     ============================================================ */
  _onKeyDown(k) {
    if (k === "escape") { this.ui.closeTop(); return; }
    if (this.ui && this.ui.menuOpen) return;   // en el menú principal solo actúan los botones
    if (k === "tab") { this.ui.toggleStats(); return; }
    if (k === "l") { this.ui.toggleQuestLog(); return; }
    if (k === "p") { this.pause(); return; }
    if (k === "e") { this.doInteract(); return; }
    if (k === "h" || k === "5") { if (this.canAct()) this.player.useHpPotion(); return; }
    if (k === "m") { this.toggleMount(); return; }
    if (k === " ") { this.player.tryJump(); return; }
  },

  canAct() {
    if (this.paused || this.dead || this._deathHandled) return false;
    if (this.ui && this.ui.overlayOpen && this.ui.overlayOpen()) return false;
    return true;
  },

  /* ============================================================
     pegamento de combate
     ============================================================ */
  dealDamageTo(e, combat) {
    if (!e || e.dead) return { dmg: 0, killed: false, crit: false };
    return this.enemyDirector.damageEnemy(e, combat || {});
  },

  meleeArc(range, mult, arc, color, knock) {
    if (!this.canAct()) return [];
    const p = this.player;
    range = range || CFG.PLAYER.ATTACK_RANGE;
    const half = (arc || 2.4) / 2;
    const yaw = p.faceAimYaw || p.yaw;
    const hits = [];
    for (const e of this.enemyDirector.getNear(p.pos, range)) {
      if (e.dead) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      let d = Math.atan2(dx, dz) - yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > half) continue;
      const r = this.dealDamageTo(e, { dmg: mult, element: "phys", knock: knock });
      if (r && r.dmg) hits.push(e);
    }
    this.fx.slashArc(
      new THREE.Vector3(p.pos.x, p.pos.y + 1.3, p.pos.z),
      new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
      color || 0xffffff, Math.min(2.4, range * 0.55), 0.22);
    return hits;
  },

  aoeAround(target, radius, mult, color, knock) {
    const pos = target.pos;
    const hits = [];
    for (const e of this.enemyDirector.getNear(pos, radius)) {
      if (e.dead) continue;
      const r = this.dealDamageTo(e, { dmg: mult, element: "phys", knock: knock });
      if (r && r.dmg) hits.push(e);
    }
    this.fx.shockwave(new THREE.Vector3(pos.x, pos.y + 0.3, pos.z), color || 0xffffff, radius, 0.5);
    return hits;
  },

  spellTargetAoe(caster, radius, mult, element, flat, color, opt) {
    if (!this.canAct()) return [];
    const st = caster.stats();
    const base = (element === "phys" ? st.atk : st.matk) * (mult || 1) + (flat || 0);
    let cx = caster.pos.x, cz = caster.pos.z;
    let best = null, bd = Infinity;
    for (const e of this.enemyDirector.getNear(caster.pos, 22)) {
      if (e.dead) continue;
      const d2 = Utils.dist2(e.pos.x, e.pos.z, cx, cz);
      if (d2 < bd) { bd = d2; best = e; }
    }
    if (best) { cx = best.pos.x; cz = best.pos.z; }
    const center = new THREE.Vector3(cx, this.groundHeight(cx, cz) + 0.5, cz);
    this.fx.shockwave(center, color || 0xffffff, radius, 0.7);
    this.fx.burst(center, color || 0xffffff, 26, { up: 5, speedMax: 9 });
    const hits = [];
    for (const e of this.enemyDirector.getNear(center, radius)) {
      if (e.dead) continue;
      const r = this.dealDamageTo(e, { flat: base, element: element, slow: element === "ice" ? 3 : 0 });
      if (r && r.dmg) hits.push(e);
    }
    return hits;
  },

  spellTargetSingle(caster, range, mult, element) {
    if (!this.canAct()) return null;
    const st = caster.stats();
    const base = (element === "phys" ? st.atk : st.matk) * (mult || 1);
    let best = null, bd = Infinity;
    for (const e of this.enemyDirector.getNear(caster.pos, range)) {
      if (e.dead) continue;
      const d2 = Utils.dist2(e.pos.x, e.pos.z, caster.pos.x, caster.pos.z);
      if (d2 < bd) { bd = d2; best = e; }
    }
    if (!best) { this.notify("No hay objetivos a la vista.", "warn"); return null; }
    this.fx.bolt(
      new THREE.Vector3(caster.pos.x, caster.pos.y + 1.4, caster.pos.z),
      new THREE.Vector3(best.pos.x, best.pos.y + best.def.size, best.pos.z),
      element === "holy" ? 0xffe66a : 0x9fd8ff);
    this.dealDamageTo(best, { flat: base, element: element });
    return best;
  },

  shadowStep(caster, dist) {
    let best = null, bd = Infinity;
    for (const e of this.enemyDirector.getNear(caster.pos, (dist || 3) + 9)) {
      if (e.dead) continue;
      const d2 = Utils.dist2(e.pos.x, e.pos.z, caster.pos.x, caster.pos.z);
      if (d2 < bd) { bd = d2; best = e; }
    }
    if (!best) return false;
    const dx = best.pos.x - caster.pos.x, dz = best.pos.z - caster.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    const behind = 1.4 + (best.radius || 1);
    caster.pos.x = best.pos.x - dx / l * behind;
    caster.pos.z = best.pos.z - dz / l * behind;
    caster.pos.y = this.groundHeight(caster.pos.x, caster.pos.z) + 0.05;
    caster.faceAimYaw = Math.atan2(dx, dz);
    if (caster.model) caster.model.rotation.y = caster.faceAimYaw;
    this.fx.burst(new THREE.Vector3(caster.pos.x, caster.pos.y + 1, caster.pos.z), 0x9fd8ff, 16, { up: 3 });
    const st = caster.stats();
    this.dealDamageTo(best, { flat: st.atk * 2.4, element: "phys", knock: 5 });
    return true;
  },

  fireSkillFx(pl) {
    const yaw = pl.faceAimYaw || pl.yaw;
    this.fx.slashArc(
      new THREE.Vector3(pl.pos.x, pl.pos.y + 1.3, pl.pos.z),
      new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
      pl.classDef.color, 2.0, 0.3);
  },

  /* ---------- avisos de combate / jefes / progresión ---------- */
  notify(msg, kind) {
    if (this.ui && this.ui.notify) this.ui.notify(msg, kind);
  },

  onLevelUp() {
    const pl = Save.data.player;
    this.notify("¡Has subido al nivel " + pl.level + "!", "good");
    this.fx.pillar(new THREE.Vector3(this.player.pos.x, this.player.pos.y, this.player.pos.z), 0xffe66a, 6, 1.3, 0.7);
    this.fx.shockwave(new THREE.Vector3(this.player.pos.x, this.player.pos.y + 0.2, this.player.pos.z), 0xffe66a, 4, 0.7);
    if (this.ui) this.ui.refreshHUD();
    Save.save();
  },

  onBossSpawn(e) {
    this.notify("¡" + e.def.name + " ha aparecido!", "warn");
    this.sfx.boss();
    this.fx.shockwave(new THREE.Vector3(e.pos.x, e.pos.y + 0.3, e.pos.z), 0xff5030, 8, 0.8);
  },

  onBossDefeated(e) {
    const t = e.def.id;
    const poi = World.POIS.bosses.find(b => b.boss === t);
    if (poi) {
      const bs = this.enemyDirector.bossState[poi.id];
      if (bs) { bs.defeated = true; bs.respawnAt = this.time + 300; bs.spawned = null; bs.kicked = false; }
      if (Save.data.world.bossesDefeated.indexOf(poi.id) < 0) Save.data.world.bossesDefeated.push(poi.id);
    }
    this.notify("¡" + e.def.name + " derrotado!", "good");
    this.sfx.levelup();
    Save.save();
  },

  onBossEnrage(e) {
    this.notify("¡" + e.def.name + " se ha enfurecido!", "warn");
    this.sfx.roar();
  },

  onEnemyAggro(e) { /* el combate ya es visible con los efectos */ },

  /* ============================================================
     daño al jugador / muerte
     ============================================================ */
  dealPlayerDamage(amount, src) {
    if (this.dead || this._deathHandled) return;
    if (this.invulnT > 0) return;
    this.player.takeDamage(amount, src || {});
  },

  _onDeath() {
    if (this.dead || this._deathHandled) return;
    this.dead = true;
    this._finishDeath();
  },

  onDeath() {
    if (this._deathHandled) return;
    this.dead = true;
    this._finishDeath();
  },

  _finishDeath() {
    this._deathHandled = true;
    this.dead = true;
    this.respawnT = CFG.PLAYER.RESPAWN_TIME;
    if (this.ui) this.ui.showDeath();
    const pl = Save.data.player;
    const lost = Math.floor(pl.gold * CFG.GOLD.DEATH_TAX);
    if (lost > 0) {
      pl.gold -= lost;
      if (Save.data.stats) Save.data.stats.deathsTaxGold = (Save.data.stats.deathsTaxGold || 0) + lost;
    }
    if (Save.data.stats) Save.data.stats.deaths += 1;
    if (this.sfx) this.sfx.hurt();
    this.notify("Has caído en batalla.", "error");
    Save.save();
  },

  _respawn() {
    if (!this.dead && !this._deathHandled) return;
    this.dead = false;
    this._deathHandled = false;
    this.paused = false;
    if (this.ui) this.ui.togglePause(false);
    if (this.region !== "overworld") {
      // regresa al mundo exterior junto al pueblo
      this.player.pos.set(0, this.groundHeight(0, 60) + 0.6, 60);
      this.player.vel.set(0, 0, 0);
      this.enterRegion("overworld");
    }
    this.player.hp = Math.floor(this.player.stats().maxHp * 0.8);
    const s = Save.data.spawn;
    Save.data.player.pos = { x: s.x, z: s.z };
    this.player.pos.set(s.x, this.groundHeight(s.x, s.z) + 0.6, s.z);
    this.player.vel.set(0, 0, 0);
    this.invulnT = 2;
    if (this.ui) { this.ui.hideDeath(); this.ui.refreshHUD(); }
    this.notify("Has reaparecido en el pueblo.", "info");
    Save.save();
  },

  /* ============================================================
     recompensas / progresión
     ============================================================ */
  addGold(n) {
    Save.data.player.gold += n;
    if (Save.data.player.gold < 0) Save.data.player.gold = 0;
    if (this.ui) this.ui.refreshHUD();
    Save.save();
  },

  addCrystals(n) {
    Save.data.player.crystals += n;
    if (Save.data.player.crystals < 0) Save.data.player.crystals = 0;
    if (this.ui) this.ui.refreshHUD();
    Save.save();
  },

  pause() {
    if (this.ui) this.ui.togglePause();
  },

  restart() {
    Save.wipe();
    location.reload();
  },

  chooseClass(id) {
    const cls = CLASSES[id];
    if (!cls) return;
    const pl = Save.data.player;
    const first = !pl.classId;
    pl.classId = id;
    pl.baseStats = Object.assign({}, cls.base);
    if (first) {
      const item = Inventory.add("w_" + cls.weapon + "_common", 1, true);
      if (item) {
        const idx = Inventory._findIndexByUid(item.uid);
        Inventory.equip(idx);
      }
      this.notify("Bienvenido a Éterlands, " + cls.name + ".", "good");
    } else {
      this.notify("Clase: " + cls.name, "info");
    }
    if (this.player.model) this.scene.remove(this.player.model);
    this.player.buildModel();
    this.scene.add(this.player.model);
    this.player.hp = this.player.stats().maxHp;
    this.player.stam = this.player.stats().maxStam;
    this.ui.hideClassSelect();
    this.enterWorld();
    this.sfx.levelup();
    this.ui.refreshHUD();
    Save.save();
  },

  toggleMount() {
    const owned = Save.data.mounts.owned;
    if (!owned.length) { this.notify("No tienes montura. Visita a Branwen en los establos.", "warn"); return; }
    if (!Inventory.activeMount()) Inventory.setActiveMount(owned[0]);
    this.player.riding = !this.player.riding;
    if (this.player.riding) {
      const mm = this.player.buildMountMesh();
      mm.visible = true;
      mm.position.set(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    } else if (this.player.mountMesh) {
      this.player.mountMesh.visible = false;
    }
    const mid = Inventory.activeMount();
    this.notify(this.player.riding ? "Montando: " + ITEM.defs[mid].name : "Has bajado de la montura.", "info");
    this.sfx.click();
  },

  /* ============================================================
     interacción (tecla E)
     ============================================================ */
  _interactTarget() {
    if (this.dead || this.paused) return null;
    const p = this.player.pos;

    if (this.region === "castle") {
      const t = this.castle.promptAt(p.x, p.z);
      return t ? { type: "castle_portal", text: t } : null;
    }

    if (this.region === "cave") {
      const node = this.caves.nearestNode(p.x, p.z, 3.4);
      if (node) return { type: "mine", node: node, text: "Minar " + (node.def ? node.def.name : "mena") };
      const room = this.regionData;
      if (room && Utils.dist2(p.x, p.z, room.exit.x, room.exit.z) < 5 * 5) {
        return { type: "cave_exit", text: "Salir de la cueva" };
      }
      return null;
    }

    // mundo exterior
    let best = null, bd = Infinity;
    for (const it of this.build.interactables) {
      if (it.type === "boss") continue;
      const r = (it.radius || 3) + 1.4;
      const d = Utils.dist2(p.x, p.z, it.x, it.z);
      if (d < r * r && d < bd) { bd = d; best = it; }
    }
    if (!best) return null;

    if (best.type === "npc") return { type: "npc", it: best, text: "Hablar con " + best.npc.name };
    if (best.type === "cave_enter") return { type: "cave_enter", it: best, text: "Entrar en " + best.cave.name };
    if (best.type === "castle_door" || best.type === "castle") {
      const f = (Save.data.castle.highestFloor || 0) + 1;
      return { type: "castle_door", it: best, text: "Entrar a la Aguja (piso " + f + ")" };
    }
    if (best.type === "chest") {
      const v = best.chest;
      const cleared = Save.data.world.raids.indexOf(v.id) >= 0;
      const opened = Save.data.world.chestsOpened.indexOf(best.id) >= 0;
      if (!cleared) return { type: "chest", it: best, text: "Cofre sellado — limpia " + v.name };
      if (opened) return { type: "chest", it: best, text: "Cofre vacío" };
      return { type: "chest", it: best, text: "Abrir cofre de " + v.name };
    }
    return null;
  },

  _interactHint() {
    const t = this._interactTarget();
    return t ? t.text : "";
  },

  doInteract() {
    if (!this.canAct()) return;
    const t = this._interactTarget();
    if (!t) return;

    if (t.type === "npc") return this._npcInteract(t.it.npc);

    if (t.type === "cave_enter") {
      const c = t.it.cave;
      if (Save.data.player.level + 3 < c.lvl) {
        this.notify("Necesitas nivel " + (c.lvl - 3) + " para " + c.name + ".", "warn");
        this.sfx.error();
        return;
      }
      this.caves.enter(c);
      return;
    }

    if (t.type === "cave_exit") { this.caves.exit(); return; }

    if (t.type === "castle_door") {
      const f = (Save.data.castle.highestFloor || 0) + 1;
      if (!this.castle.canEnter(f)) {
        this.notify("Necesitas nivel " + this.castle.requiredLevel(f) + " para pisar la Aguja.", "warn");
        this.sfx.error();
        return;
      }
      this.castle.enter(f);
      return;
    }

    if (t.type === "castle_portal") { this.castle.interact(this.player.pos.x, this.player.pos.z); return; }

    if (t.type === "mine") { this.caves.mineNode(t.node, this.player); if (this.ui) this.ui.refreshHUD(); return; }

    if (t.type === "chest") { this._openChest(t.it); return; }
  },

  _npcInteract(npc) {
    switch (npc.role) {
      case "weapons": case "armors": case "potions": return this.ui.openShop(npc);
      case "gacha": return this.ui.openGacha();
      case "quests": return this.ui.openQuestGiver(npc);
      case "mounts": return this.ui.openMountShop(npc);
      case "trade": return this.ui.openTrade(npc);
      case "pvp": return this.ui.openPvp();
      case "castle": {
        const f = (Save.data.castle.highestFloor || 0) + 1;
        if (!this.castle.canEnter(f)) {
          this.notify("Necesitas nivel " + this.castle.requiredLevel(f) + " para pisar la Aguja.", "warn");
          this.sfx.error();
          return;
        }
        this.castle.enter(f);
        return;
      }
    }
  },

  _openChest(it) {
    const v = it.chest;
    const cleared = Save.data.world.raids.indexOf(v.id) >= 0;
    if (!cleared) { this.notify("El cofre está sellado. Limpia la aldea primero.", "warn"); return; }
    if (Save.data.world.chestsOpened.indexOf(it.id) >= 0) { this.notify("El cofre está vacío.", "info"); return; }
    Save.data.world.chestsOpened.push(it.id);
    const gold = Utils.irand(140, 360) + v.lvl * 12;
    this.addGold(gold);
    const tier = v.lvl >= 24 ? "epic" : v.lvl >= 10 ? "rare" : "common";
    const loot = Utils.pick([
      "w_" + Utils.pick(["sword", "staff", "bow", "scepter"]) + "_" + tier,
      "a_" + Utils.pick(["armor", "helmet", "boots", "accessory"]) + "_" + tier,
      "potion_hp2",
    ]);
    Inventory.add(loot, 1);
    this.notify("Cofre: +" + gold + " de oro y " + ITEM.defs[loot].name, "good");
    this.sfx.chest();
    this.fx.burst(new THREE.Vector3(it.x, this.groundHeight(it.x, it.z) + 1.2, it.z), 0xffd060, 22, { up: 5 });
    Save.save();
  },
};

/* arranca tras cargar todos los módulos */
if (typeof window !== "undefined") {
  window.Game = Game;
  window.addEventListener("load", () => Game.init());
}

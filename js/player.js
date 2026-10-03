/* ============================================================
   player.js — character controller, stats, progression, combat
   skills, dash/block/mount, death.
   ============================================================ */
const Player = {
  scene: null, camera: null, cameraHolder: null,
  model: null, mount: null,
  pos: new THREE.Vector3(0, 3, 60),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0, faceAimYaw: 0,
  hp: 100, stam: 100,
  onGround: true,
  riding: false,
  dashT: 0, dashDir: new THREE.Vector3(),
  attackCd: 0, skillCds: {},
  swingT: 0, swingA: 0,
  blockHeld: false,
  mountMesh: null,
  _shiftHeld: false,
  _skillLatch: [false, false, false],
  buffs: { atkMult: 0, atkUntil: 0, dps: null, consecUntil: 0 },
  hpots: [], 
  xp: 0,
  timers: {},
  combo: 0, comboT: 0,
  anim: { t: 0, falling: 0 },
  // personaje GLB (KayKit, esqueleto + AnimationMixer)
  glbActive: false, mixer: null, clips: {},
  _glbGen: 0, _glbCache: {}, _glbCur: null,
  _glbOnce: null, _glbAttack: false, _glbDead: false,
  _glbYawFix: Math.PI / 2,

  init(game) {
    this.game = game;
    this.scene = game.scene;
    this.camera = game.camera;
    const pl = Save.data.player;
    this.pos.set(pl.pos.x, pl.pos.y, pl.pos.z);
    this.hp = StatCalc.maxHP(pl);
    this.stam = StatCalc.maxStam(pl);
    if (Save.data.equipment.weapon >= 0) this.equipFromInventory(Save.data.equipment.weapon);
    this.buildModel();
    this.scene.add(this.model);
  },

  get classDef() { return CLASSES[Save.data.player.classId] || CLASSES.warrior; },
  get weapon() { return Inventory.weapon(); },
  get armor() { return Inventory.equipped().armor; },

  // ---------- derived stats ----------
  stats() {
    const pl = Save.data.player;
    const w = Inventory.weapon();
    const eq = Inventory.equipped();
    const base = StatCalc;
    let move = CFG.PLAYER.RUN;
    if (this.riding) move = CFG.PLAYER.RIDE * (MOUNTS[Inventory.activeMount()] ? MOUNTS[Inventory.activeMount()].speed : 1);
    return {
      maxHp: base.maxHP(pl),
      maxStam: base.maxStam(pl),
      atk: base.atk(pl, w),
      matk: base.matk(pl, w),
      def: base.def(pl, eq.armor),
      mdef: base.mdef(pl, eq.armor),
      crit: base.crit(pl),
      move: move,
      weapon: w,
      weaponType: this.classDef.weapon,
      level: pl.level,
    };
  },

  // ---------- model ----------
  buildModel() {
    const g = new THREE.Group();
    const classCol = new THREE.Color(this.classDef.color);
    const cloth = this.game.mat(classCol.getHex(), { rough: 1 });
    const armorC = this.game.mat(0xb8c4cc, { metal: 0.5, rough: 0.5 });
    const skin = this.game.mat(0xf0c9a0, { rough: 0.9 });
    const legs = [];
    const arms = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.9, 0.3), this.game.mat(0x3c4657, { rough: 1 }));
      leg.geometry.translate(0, -0.45, 0); // pivote en la cadera
      leg.position.set(0.24 * side, 0.9, 0);
      g.add(leg); legs.push(leg);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.24), cloth);
      arm.geometry.translate(0, -0.39, 0); // pivote en el hombro
      arm.position.set(0.42 * side, 1.67, 0);
      g.add(arm); arms.push(arm);
    }
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.44), armorC);
    torso.position.y = 1.32;
    g.add(torso);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.18, 0.48), this.game.mat(0x8a6f3c));
    belt.position.y = 1.02;
    g.add(belt);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), skin);
    head.position.y = 1.84;
    g.add(head);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), armorC);
    helm.position.y = 1.9;
    g.add(helm);
    // weapon modeled per class
    const wpnG = new THREE.Group();
    const wpnType = this.classDef.weapon;
    if (wpnType === "sword") {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.0, 0.22), this.game.mat(0xd8dee6, { metal: 0.9, rough: 0.2 }));
      blade.position.y = 0.6;
      const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.1), this.game.mat(0x5d3a1a));
      hilt.position.y = 0;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.08), this.game.mat(0xc0a24a, { metal: 0.6 }));
      wpnG.add(blade, hilt, guard);
    } else if (wpnType === "staff") {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), this.game.mat(0x6d4c33));
      rod.rotation.z = Math.PI / 2;
      rod.position.y = 0.55;
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), this.game.mat(0x7c4dff, { emissive: 0x4a2fc0, emissiveIntensity: 1.6, transparent: true, opacity: 0.95 }));
      orb.position.set(0.85, 0.55, 0);
      wpnG.add(rod, orb);
    } else if (wpnType === "bow") {
      const body = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 16, Math.PI * 1.6), this.game.mat(0x6d4c33));
      body.position.y = 0.4;
      wpnG.add(body);
    } else if (wpnType === "scepter") {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 6), this.game.mat(0x8a6f3c));
      shaft.position.y = 0.45;
      const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), this.game.mat(0xffd060, { emissive: 0xffa020, emissiveIntensity: 1.2 }));
      crest.position.y = 1.05;
      wpnG.add(shaft, crest);
    }
    wpnG.position.set(0.42, 1.1, 0.15);
    wpnG.rotation.x = -0.5;
    wpnG.rotation.z = -0.15;
    g.add(wpnG);
    wpnG.name = "handWeapon";
    g.userData = { legs, arms, torso, head, wpn: wpnG };
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    g.position.copy(this.pos).y += 0;
    this.model = g;
    this.enableModel();
    // GLB: se carga en segundo plano y sustituye al modelo procedural
    this.glbActive = false;
    this.mixer = null;
    this.clips = {};
    this._glbCur = null; this._glbOnce = null;
    this._glbAttack = false; this._glbDead = false;
    this._loadGLB();
  },

  enableModel(swordVisible) { this.model.visible = true; },

  // ---------- personaje GLB animado (KayKit) ----------
  _glbFileFor(cls) {
    const map = { warrior: "knight", mage: "mage", rogue: "rogue", paladin: "knight" };
    return map[cls.id] || "knight";
  },

  _loadGLB() {
    const file = this._glbFileFor(this.classDef);
    const gen = ++this._glbGen;
    const start = () => {
      if (gen !== this._glbGen || !window.GLTFLoader) return;
      const cached = this._glbCache[file];
      if (cached) { this._applyGLB(cached); return; }
      const loader = new window.GLTFLoader();
      loader.load("models/" + file + ".glb",
        (gltf) => {
          if (gen !== this._glbGen) return;
          const entry = { root: gltf.scene, animations: gltf.animations || [] };
          this._glbCache[file] = entry;
          this._applyGLB(entry);
        },
        undefined,
        (err) => { console.warn("[GLB] carga fallida:", file, err && (err.message || err)); });
    };
    if (window.GLTFLoader) start();
    else window.addEventListener("gltfloader-ready", start, { once: true });
  },

  _applyGLB(entry) {
    if (!this.model) return;
    const root = entry.root;
    // separa del grupo anterior para medir en coordenadas locales
    // (setFromObject usa la matriz del padre sin actualizarla: si el root
    //  queda parenteado entre usos, la caja sale en coordenadas de mundo)
    if (root.parent) root.parent.remove(root);
    root.scale.setScalar(1);
    root.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(root);
    const h = (box.max.y - box.min.y) || 1.7;
    const s = 1.85 / h;
    root.scale.setScalar(s);
    root.position.y = -box.min.y * s;
    root.rotation.y = this._glbYawFix;
    root.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    // quita el modelo procedural y coloca el GLB en su sitio
    while (this.model.children.length) this.model.remove(this.model.children[0]);
    this.model.add(root);
    if (this.mixer) this.mixer.stopAllAction();
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = {};
    for (const c of entry.animations) this.clips[c.name] = c;
    this._glbCur = null;
    this._playGLB("Idle", 0);
    this.glbActive = true;
  },

  _playGLB(name, fade) {
    if (!this.mixer || !this.clips[name] || this._glbCur === name) return;
    const next = this.mixer.clipAction(this.clips[name]);
    next.enabled = true;
    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    if (this._glbCur && this.clips[this._glbCur]) this.mixer.clipAction(this.clips[this._glbCur]).fadeOut(fade);
    next.fadeIn(fade).play();
    this._glbCur = name;
  },

  _playGLBOnce(name) {
    if (!this.mixer || !this.clips[name]) return;
    const act = this.mixer.clipAction(this.clips[name]);
    act.enabled = true;
    act.reset();
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
    if (this._glbCur && this.clips[this._glbCur]) this.mixer.clipAction(this.clips[this._glbCur]).fadeOut(0.08);
    act.fadeIn(0.08).play();
    this._glbOnce = { name, act };
    this._glbCur = null;
  },

  _attackClipName() {
    const w = this.classDef.weapon;
    if (w === "staff" && this.clips["Spellcast_Shoot"]) return "Spellcast_Shoot";
    if (w === "bow" && this.clips["1H_Ranged_Shoot"]) return "1H_Ranged_Shoot";
    return this.clips["1H_Melee_Attack_Chop"] ? "1H_Melee_Attack_Chop" : "Idle";
  },

  _animateGLB(dt, moving, speed) {
    if (this.swingT > 0) this.swingT -= dt;
    // fin del one-shot en curso (ataque/muerte)
    if (this._glbOnce) {
      const a = this._glbOnce.act;
      if (a.time >= a.getClip().duration - 0.04) {
        a.fadeOut(0.12);
        this._glbOnce = null;
        this._glbCur = null;
      }
    }
    // reaparición: cancela la animación de muerte
    if (this._glbDead && !this.game.dead) {
      this._glbDead = false;
      if (this._glbOnce) { this._glbOnce.act.stop(); this._glbOnce = null; }
      this._glbCur = null;
    }
    // ataque: borde de subida de swingT
    if (this.swingT > 0 && !this._glbAttack) {
      this._glbAttack = true;
      this._playGLBOnce(this._attackClipName());
    } else if (this.swingT <= 0) {
      this._glbAttack = false;
    }
    // locomoción (mientras no haya one-shot)
    if (!this._glbOnce && !this._glbDead) {
      let want = "Idle";
      if (!this.onGround && !this.riding) want = "Jump_Idle";
      else if (moving && !this.riding) want = speed >= 7.5 ? "Running_A" : "Walking_A";
      else if (this.blockHeld && this.clips["Blocking"]) want = "Blocking";
      if (!this.clips[want]) want = "Idle";
      this._playGLB(want, 0.18);
    }
    this.mixer.update(dt);
  },

    // montura visible (cuadrúpedo simple, mirando hacia +Z como el personaje)
    buildMountMesh() {
      if (this.mountMesh) return this.mountMesh;
      const mid = Inventory.activeMount();
      const def = MOUNTS[mid] || { color: 0x8d6e63 };
      const g = new THREE.Group();
      const bodyM = this.game.mat(def.color, { rough: 1 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.75, 2.0), bodyM);
      body.position.y = 1.0;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.62), this.game.mat(0x6d4c33, { rough: 1 }));
      head.position.set(0, 1.5, 1.05);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), this.game.mat(0x4e342e, { rough: 1 }));
      tail.position.set(0, 1.2, -1.02);
      g.add(body, head, tail);
      const mlegs = [];
      for (const sx of [-0.34, 0.34]) {
        for (const sz of [-0.72, 0.72]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.95, 0.2), this.game.mat(0x5d4037, { rough: 1 }));
          leg.geometry.translate(0, -0.475, 0); // pivote en la cadera
          leg.position.set(sx, 0.95, sz);
          g.add(leg); mlegs.push(leg);
        }
      }
      g.userData.legs = mlegs;
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      g.visible = false;
      this.scene.add(g);
      this.mountMesh = g;
      return g;
    },

  // ---------- region helpers ----------
  groundHeight(x, z) { return this.game.groundHeight(x, z); },

  // ---------- input/movement ----------
  update(dt) {
    const pl = Save.data.player;
    const st = this.stats();
    const inp = Input;

    // timers
    this.attackCd = Math.max(0, this.attackCd - dt);
    for (const k in this.skillCds) this.skillCds[k] = Math.max(0, this.skillCds[k] - dt);
    this.comboT -= dt;

    // stamina regen
    this.stam = Math.min(st.maxStam, this.stam + CFG.PLAYER.STAMINA_REGEN * dt * (Input.down("shift") ? 0.2 : 1));

    // giro: la cámara (Game.camYaw) es la única fuente de verdad
    this.yaw = this.game.camYaw + Math.PI; // dirección a la que mira la cámara
    this.pitch = -this.game.camPitch;      // mira arriba = pitch positivo

    // movement input
    let mx = 0, mz = 0;
    if (inp.down("w", "arrowup")) mz += 1;
    if (inp.down("s", "arrowdown")) mz -= 1;
    if (inp.down("a", "arrowleft")) mx -= 1;
    if (inp.down("d", "arrowright")) mx += 1;
    const mag = Math.hypot(mx, mz);
    let speed = st.move;
    const walk = inp.down("x");
    if (walk) speed = CFG.PLAYER.WALK;
    // dash (bordes de Shift)
    const shiftDown = inp.down("shift");
    const shiftEdge = shiftDown && !this._shiftHeld;
    this._shiftHeld = shiftDown;
    if (this.dashT > 0) {
      this.dashT -= dt;
      speed = CFG.PLAYER.DASH_SPEED;
    } else if (shiftEdge && this.canDash()) {
      this.doDash(mx, mz);
    }
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.sin(this.yaw - Math.PI / 2), 0, Math.cos(this.yaw - Math.PI / 2));
    if (mag > 0.01) {
      const dir = new THREE.Vector3().addScaledVector(forward, mz / mag).addScaledVector(right, mx / mag);
      dir.normalize();
      this.vel.x = dir.x * speed; this.vel.z = dir.z * speed;
      this.faceAimYaw = Math.atan2(dir.x, dir.z);
    } else {
      this.vel.x = Utils.damp(this.vel.x, 0, 8, dt);
      this.vel.z = Utils.damp(this.vel.z, 0, 8, dt);
      this.faceAimYaw = this.yaw; // quieto: el cuerpo mira a cámara
    }
    // giro del modelo por el camino corto (sin vueltas largas)
    this.model.rotation.y = Utils.dampAngle(this.model.rotation.y, this.faceAimYaw, 10, dt);
    if (this.dashT > 0) {
      this.vel.x = this.dashDir.x * CFG.PLAYER.DASH_SPEED;
      this.vel.z = this.dashDir.z * CFG.PLAYER.DASH_SPEED;
    }

    // gravity & ground
    this.vel.y -= CFG.PLAYER.GRAVITY * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // world bounds
    const dr = Math.sqrt(this.pos.x * this.pos.x + this.pos.z * this.pos.z);
    if (dr > 3560) { const f = 3560 / Math.max(1, dr); this.pos.x *= f * 0.999; this.pos.z *= f * 0.999; this.pos.x = Utils.clamp(this.pos.x, -3560, 3560); this.pos.z = Utils.clamp(this.pos.z, -3560, 3560); }

    const gh = this.groundHeight(this.pos.x, this.pos.z);
    const waterH = CFG.WORLD.WATER_LEVEL;
    this.onGround = this.pos.y <= gh + 0.6 && this.vel.y <= 0;
    if (this.onGround) {
      this.pos.y = Math.max(gh + 0.01, this.pos.y - 0.4);
      this.vel.y = 0;
    }
    // swim on water
    if (this.pos.y < waterH && !this.onGround) {
      this.pos.y = waterH;
      this.vel.y = Utils.damp(this.vel.y, 0.5, 3, dt);
    }

    // collide with static colliders
    this.game.resolveColliders(this);

    // bloqueo: Q o botón derecho del ratón (antes de animar para que la pose sea al instante)
    this.blockHeld = this.game.canAct() && (Input.down("q") || Input.mouse.right);

    // model animation
    this.animate(dt, mag > 0.01, speed, forward);

    // skills hotkeys (bordes: 1/2/3)
    for (let i = 0; i < 3; i++) {
      const dn = inp.down(String(i + 1));
      if (dn && !this._skillLatch[i]) this.castSkill(i);
      this._skillLatch[i] = dn;
    }
  },

  canDash() {
    return this.stam >= CFG.PLAYER.DASH_COST && this.dashT <= 0 && this.game.canAct();
  },

  doDash(mx, mz) {
    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const r = new THREE.Vector3(Math.sin(this.yaw + Math.PI / 2), 0, Math.cos(this.yaw + Math.PI / 2));
    if (Math.abs(mx) + Math.abs(mz) > 0.01) {
      const m = Math.hypot(mx, mz);
      this.dashDir.copy(f).multiplyScalar(mz / m).addScaledVector(r, mx / m).normalize();
    } else this.dashDir.copy(f);
    this.dashDir.y = 0;
    this.dashT = CFG.PLAYER.DASH_TIME;
    this.spendStamina(CFG.PLAYER.DASH_COST);
    this.faceAimYaw = Math.atan2(this.dashDir.x, this.dashDir.z);
    this.model.rotation.y = this.faceAimYaw;
    this.game.fx.dashTrail(this.pos, this.dashDir, this.classDef.color);
    this.game.sfx.dash();
    if (Save.data.stats) Save.data.stats.dashes = (Save.data.stats.dashes || 0) + 1;
  },

  tryJump() {
    if (!this.game.canAct() || !this.onGround) return;
    this.vel.y = CFG.PLAYER.JUMP;
    this.onGround = false;
    this.game.sfx.jump();
  },

  animate(dt, moving, speed, forward) {
    if (this.glbActive && this.mixer) {
      this._animateGLB(dt, moving, speed);
      this._placeModel(dt, moving);
      this.anim.t += dt;
      return;
    }
    const a = this.model.userData;
    const t = this.anim.t;
    const bob = Math.sin(t * 10) * (moving ? 0.18 : 0.03);
    const swingSpd = moving ? (this.riding ? 8 : 10) : 0;
    const airborne = !this.onGround && !this.riding;
    for (let i = 0; i < 2; i++) {
      const leg = a.legs[i];
      const ph = i === 0 ? 0 : Math.PI;
      if (airborne) leg.rotation.x = i === 0 ? -0.5 : 0.55;      // pose de salto
      else if (this.riding) leg.rotation.x = 0.55;               // piernas sentadas
      else leg.rotation.x = moving ? Math.sin(t * swingSpd + ph) * 0.7 : 0;
    }
    a.torso.rotation.z = moving && !this.riding ? 0.06 : 0;
    a.torso.position.y = 1.32 + bob * 0.5;
    const hd = Utils.clamp(Utils.angleDelta(this.model.rotation.y, this.yaw) * 0.4, -0.7, 0.7);
    a.head.rotation.y = hd;
    // pose de muerte: recupera al estar vivo
    if (!this.game.dead) this.model.rotation.x = Utils.damp(this.model.rotation.x, 0, 6, dt);
    // arms: attack swing / guard
    const wpn = a.wpn;
    if (this.swingT > 0) {
      this.swingT -= dt;
      const k = 1 - this.swingT / this.swingA;
      const ease = Math.sin(Math.min(1, k) * Math.PI);
      wpn.rotation.x = -0.5 - ease * 2.2;
      wpn.rotation.z = -0.15 + ease * 0.6;
      a.arms[1].rotation.x = -1.6 * ease;
    } else if (this.blockHeld) {
      wpn.rotation.x = -2.5;   // guarda: arma en alto
      wpn.rotation.z = -0.1;
      a.arms[1].rotation.x = -1.3;
    } else {
      wpn.rotation.x = -0.5 - Math.sin(t * 4) * 0.06;
      wpn.rotation.z = -0.15;
      a.arms[1].rotation.x = Math.sin(t * 10) * 0.08 * (moving ? 1 : 0);
    }
    this._placeModel(dt, moving);
    this.anim.t += dt;
  },

  // posición del modelo (suelo, montura y balanceo)
  _placeModel(dt, moving) {
    const t = this.anim.t;
    if (this.riding) {
      const mm = this.buildMountMesh();
      mm.visible = true;
      mm.position.set(this.pos.x, this.pos.y, this.pos.z);
      mm.rotation.y = this.model.rotation.y;
      const ml = mm.userData.legs;
      if (ml) {
        for (let i = 0; i < ml.length; i++) {
          const ph = (i === 0 || i === 3) ? Math.PI : 0; // trote en diagonales
          ml[i].rotation.x = moving ? Math.sin(t * 10 + ph) * 0.55 : Utils.damp(ml[i].rotation.x, 0, 8, dt);
        }
      }
      this.model.position.set(this.pos.x, this.pos.y + 1.28 + Math.sin(t * 8) * 0.1, this.pos.z);
    } else {
      if (this.mountMesh) this.mountMesh.visible = false;
      this.model.position.set(this.pos.x, this.pos.y + 0.02, this.pos.z);
    }
  },

  // caída al morir (el bucle la llama mientras Game.dead)
  deathPose(dt) {
    if (!this.model) return;
    if (this.glbActive && this.mixer) {
      if (!this._glbDead) {
        this._glbDead = true;
        this._glbOnce = null;
        this._glbCur = null;
        this._playGLBOnce(this.clips["Death_A"] ? "Death_A" : "Death_B");
      }
      this.mixer.update(dt);
      this.model.rotation.x = 0;
      this.model.position.set(this.pos.x, this.pos.y + 0.02, this.pos.z);
      this.anim.t += dt;
      return;
    }
    this.model.rotation.x = Utils.damp(this.model.rotation.x, -1.5, 5, dt);
    this.model.position.set(this.pos.x, this.pos.y + 0.3, this.pos.z);
    this.anim.t += dt;
  },

  // ---------- combat ----------
  castSkill(idx) {
    const cls = this.classDef;
    const skill = cls.skills[idx] || { cost: 0, cd: 0 };
    this.activateSkill(skill);
  },

  activateSkill(skill) {
    if (!skill) return;
    const myCd = this.skillCds[skill.id] || 0;
    if (myCd > 0) { this.game.notify("Habilidad en recarga.", "warn"); return; }
    if (!this.game.canAct()) return;
    if (this.stam < skill.cost) { this.game.notify("Sin resistencia.", "warn"); this.game.sfx.error(); return; }
    if (!this.consumeIfCan(skill.cost)) return;
    this.spendStamina(skill.cost);
    this.skillCds[skill.id] = skill.cd;
    this.skillExec[skill.id](skill);
    this.game.fireSkillFx(this);
  },

  skillExec: {
    heavy(s) { Player.game.meleeArc(5.2, 2.2, 3.4, 0xffb040, 6); Player.game.sfx.hit(); },
    whirl(s) { Player.game.aoeAround(Player, 4.6, 1.6, Player.classDef.color, 8); Player.game.sfx.hit(); },
    shout(s) { Player.buffs.atkUntil = Player.game.time + 8; Player.buffs.atkMult = 0.35; Player.game.fx.shockwave(Player.pos, 0xffd080, 3, 0.6); Player.game.sfx.roar(); Player.game.notify("Grito de Guerra: +35% de ataque.", "info"); },
    fireball(s) { const dmg = Player.statDamage.magic(Player, s, 2.2); Player.fireProjectile("fire", 26, dmg, { explode: 5, explodeR: 3.6 }); Player.game.sfx.fireball(); },
    blizzard(s) { Player.game.spellTargetAoe(Player, 7, 1.9, "ice", 18, 0xff7f6f, 840); Player.game.sfx.freeze(); },
    meteor(s) { Player.game.spellTargetAoe(Player, 16, 3.1, "fire", 30, 0xff5030, 22); Player.game.sfx.explode(); },
    pierce(s) { const dmg = Player.statDamage.phys(Player, s, 1.8); Player.fireProjectile("phys", 40, dmg, { pierce: 2, hitR: 0.6 }); Player.game.sfx.shoot(); },
    fan(s) { const dmg = Player.statDamage.phys(Player, s, 1.3); const dirs = Player.aimDirs(5, 0.45); for (const d of dirs) Player.fireProjectileDir("phys", d, 30, dmg, { hitR: 0.6 }); Player.game.sfx.shoot(); },
    step(s) { Player.game.shadowStep(Player, 2.6); Player.game.sfx.dash(); },
    bolt(s) { const dmg = Player.statDamage.magic(Player, s, 1.9); Player.fireProjectile("holy", 30, dmg, {}); Player.game.sfx.spell(); },
    consecrate(s) { Player.buffs.consecUntil = Player.game.time + 6; Player.game.fx.shockwave(Player.pos, 0xffe66a, 5, 0.8); Player.game.sfx.spell(); },
    smite(s) { Player.game.spellTargetSingle(Player, 26, 3.2, "holy"); Player.game.sfx.lightning(); },
  },

  statDamage: {
    phys(p, skill, mult) {
      const st = p.stats();
      let d = st.atk * mult;
      if (p.buffs.atkUntil > p.game.time) d *= 1 + p.buffs.atkMult;
      return d;
    },
    magic(p, skill, mult) {
      const st = p.stats();
      let d = st.matk * mult;
      if (p.buffs.atkUntil > p.game.time) d *= 1 + p.buffs.atkMult;
      return d;
    },
  },

  fireProjectile(element, speed, dmg, opts) {
    const dir = this.aimDir();
    this.fireProjectileDir(element, dir, speed, dmg, opts);
  },

  fireProjectileDir(element, dir, speed, dmg, opts) {
    opts = opts || {};
    const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z);
    from.addScaledVector(dir, 1.2);
    const colors = { fire: 0xff8a40, ice: 0x8fd8ff, holy: 0xffe66a, phys: 0xfff2d0 };
    this.game.fx.shoot(from, dir, {
      color: colors[element] || 0xffffff, speed: speed, dmg: dmg, element: element,
      size: element === "phys" ? 0.18 : 0.4, from: "player", owner: this,
      explode: opts.explode, explodeR: opts.explodeR, pierce: opts.pierce, hitR: opts.hitR,
    });
    this.swingT = 0.16; this.swingA = 0.16;
  },

  aimDir() {
    // la mira sale del centro exacto de la cámara
    const v = new THREE.Vector3();
    if (this.game.camera) {
      this.game.camera.getWorldDirection(v);
      if (v.lengthSq() > 0.0001) return v.normalize();
    }
    const y = this.yaw + Math.PI;
    const p = this.pitch;
    return new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)).normalize();
  },

  aimDirs(n, spread) {
    const base = this.aimDir();
    const right = new THREE.Vector3().crossVectors(base, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, base).normalize();
    const out = [];
    for (let i = 0; i < n; i++) {
      const d = i - (n - 1) / 2;
      out.push(new THREE.Vector3().addScaledVector(base, 1).addScaledVector(right, d * spread).addScaledVector(up, 0).normalize());
    }
    return out;
  },

  attack() {
    if (this.attackCd > 0 || !this.game.canAct()) return;
    const st = this.stats();
    const t = this.classDef.weapon;
    this.attackCd = t === "bow" ? 0.42 : t === "staff" ? 0.5 : 0.6;
    if (t === "bow") {
      // aimed normal shot
      const dmg = this.statDamage.phys(this, null, 1.0);
      const dir = this.aimDir();
      this.fireProjectileDir("phys", dir, 40, dmg, { hitR: 0.55 });
      this.game.sfx.shoot();
    } else if (t === "staff") {
      const dmg = this.statDamage.magic(this, null, 0.85);
      this.fireProjectile("fire", 22, dmg, { explode: 1.6, explodeR: 2.4 });
      this.game.sfx.spell();
    } else {
      // melee swing
      this.swingT = 0.22; this.swingA = 0.22;
      this.game.meleeArc(3.4, 1.0, 2.6, 0xffffff, 4);
      this.game.sfx.swing();
    }
    this.combo++;
  },

  meleeSwing(arc) { this.swingT = 0.2; this.swingA = 0.2; },

  // ---------- damage intake ----------
  takeDamage(amount, opts) {
    opts = opts || {};
    if (this.game.invulnT > 0 || !this.game.canAct()) return; 
    const st = this.stats();
    const isMagic = opts.magic;
    const dmgDef = isMagic ? st.mdef : st.def;
    let d = Math.max(1, amount - dmgDef * 0.35);
    if (this.blockHeld && this.stam >= 8) {
      d *= CFG.DAMAGE.BLOCK_REDUCTION;
      this.stam -= 8;
      this.game.fx.hitSpark(this.pos, 0xffffff);
      this.game.sfx.block();
    }
    if (this.dashT > 0) { this.game.sfx.dashback(); return; }
    d = Math.round(d);
    this.hp -= d;
    this.game.invulnT = 0.4;
    this.game.sfx.hurt();
    this.game.fx.hitSpark(new THREE.Vector3(this.pos.x, this.pos.y + 1.2, this.pos.z), 0xff5540);
    if (this.hp <= 0) { this.die(); }
    if (Save.data.stats) Save.data.stats.damageTaken = (Save.data.stats.damageTaken || 0) + d;
  },

  die() {
    if (this.game.dead) return;
    this.game.dead = true;
    this.hp = 0;
    this.game.onDeath();
  },

  // ---------- resources ----------
  spendStamina(n) { this.stam = Math.max(0, this.stam - n); },
  recoverStamina(n) { this.stam = Math.min(this.stats().maxStam, this.stam + n); },
  consumeIfCan(n) { return this.stam >= n; },

  heal(amount, showFx) {
    const st = this.stats();
    const before = this.hp;
    this.hp = Math.min(st.maxHp, this.hp + amount);
    const gained = this.hp - before;
    if (gained > 0 && showFx) {
      this.game.fx.damageNumber(new THREE.Vector3(this.pos.x, this.pos.y + 2, this.pos.z), gained, { heal: true });
      this.game.sfx.pickup();
    }
    return gained;
  },

  useHpPotion() {
    const idx = Inventory.findPotion();
    if (idx < 0) { this.game.notify("No quedan pociones.", "warn"); this.game.sfx.error(); return; }
    const item = Inventory.at(idx);
    const def = ITEM.defs[item.id];
    const amount = def.heal + StatCalc.healing(Save.data.player);
    this.heal(amount, true);
    if (def.buffAtk) { this.buffs.atkUntil = this.game.time + def.buffTime; this.buffs.atkMult = Math.max(this.buffs.atkMult, def.buffAtk); }
    Inventory.remove(idx);
    Save.save();
  },

  // ---------- progression ----------
  addXp(amount, opts) {
    opts = opts || {};
    const pl = Save.data.player;
    pl.xp += amount;
    let leveled = false;
    while (pl.xp >= CFG.XP_FOR_LEVEL(pl.level)) {
      pl.xp -= CFG.XP_FOR_LEVEL(pl.level);
      pl.level++;
      pl.statPoints += 5;
      pl.skillPoints += 1;
      leveled = true;
    }
    if (leveled) {
      this.hp = this.stats().maxHp;
      this.stam = this.stats().maxStam;
      this.game.onLevelUp();
      this.game.sfx.levelup();
    } else if (opts.show) {
      this.game.fx.damageNumber(new THREE.Vector3(this.pos.x, this.pos.y + 2.2, this.pos.z), amount, { color: "#e0c04a" });
    }
    this.game.ui && this.game.ui.refreshHUD();
    return this.level;
  },

  allocateStat(stat, n) {
    const pl = Save.data.player;
    stat = stat || "str";
    n = n || 1;
    if (pl.statPoints < n) return false;
    pl.statPoints -= n;
    pl.baseStats[stat] += n;
    Save.save();
    this.game.ui && this.game.ui.openStats && this.game.ui.openStats();
    return true;
  },

  get level() { return Save.data.player.level; },

  // equipa por uid (guardados) o por índice legado
  equipFromInventory(ref) {
    let idx = -1;
    if (ref !== undefined && ref !== null && ref !== -1) {
      idx = Inventory._findIndexByUid(ref);
      if (idx < 0 && typeof ref === "number" && ref >= 0 && ref < Inventory.inv.length) idx = ref;
    }
    if (idx < 0) return false;
    const item = Inventory.at(idx);
    if (!item) return false;
    const def = ITEM.defs[item.id];
    if (!def) return false;
    const r = Inventory.equip(idx);
    if (r && r.ok) {
      if (this.game.ui) this.game.ui.refreshHUD();
      return true;
    }
    if (r && r.reason) this.game.notify(r.reason, "warn");
    return false;
  },

  canUse(itemDef) { return Save.data.player.level >= (itemDef.lvl || 1); },
};
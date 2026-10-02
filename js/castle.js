/* ============================================================
   castle.js — The Veranthian Spire (100 floors)
   Sequential gauntlets: scale-filled rooms, warden every 10th
   floor, level gates, clear rewards, up/down portals, sessions.
   ============================================================ */
const Castle = {
  floor: 1,
  maxFloor: CFG.CASTLE.FLOORS,
  minLevelReq: CFG.CASTLE.MIN_LEVEL,
  gateMult: CFG.CASTLE.GATE_PER_FLOOR,
  group: null,
  room: null,
  roomW: 44,
  roomD: 28,
  roomH: 24,
  theme: CFG.CASTLE.THEMES[0],
  enemies: [],
  boss: null,
  bossPresent: false,
  clearedInSession: false,
  _added: false,
  _upPortal: null,
  _downPortal: null,
  _upR: 0.001,
  _downR: 0.001,
  _tier: 0,
  game: null,

  init(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.userData.castleRoot = true;
    this._floorPools = this._floorPools || {};
  },

  requiredLevel(f) {
    return Math.max(this.minLevelReq, Math.floor(this.minLevelReq + (f - 1) * this.gateMult * 4));
  },

  canEnter(f) {
    return this.game.player.level >= this.requiredLevel(f);
  },

  highEnough(f) {
    const save = Save.data.castle;
    return f === 1 || save.highestFloor >= f - 1;
  },

  enter(f) {
    Game.enterRegion("castle", this);
    this.floor = f;
    this.clearedInSession = false;
    this.boss = null;
    this.bossPresent = false;
    this.theme = CFG.CASTLE.THEMES[Math.min(3, Math.floor((f - 1) / 25))];
    // position player at room center-north facing in
    Game.player.pos.set(0, 0 + 0.6, this.roomD / 2 - 5);
    Game.player.vel.set(0, 0, 0);
    this.buildFloor();
    this.spawnEnemies();
    Game.onRegionEnter();
    Game.notify("Piso " + f + " — " + this.theme.name, "info");
    Game.sfx.spell();
    Save.save();
  },

  exit() {
    const c = World.POIS.castle;
    this.dispose();
    Game.enterRegion("overworld");
    Game.player.pos.set(c.x, World.heightAt(c.x, c.z + 20) + 0.6, c.z + 20);
    Game.player.vel.set(0, 0, 0);
    Game.onRegionEnter();
    Game.notify("Has abandonado la Aguja.", "info");
  },

  update(dt) {
    const f = this.floor;
    const cleared = this.floorCleared();
    const needBoss = f % 10 === 0 && this.boss && !this.boss.dead;
    const okUp = cleared && !needBoss;
    const okDown = f > 1;
    this._upR = Utils.damp(this._upR, okUp ? 2.6 : 0.6, 4, dt);
    this._downR = Utils.damp(this._downR, okDown ? 2.6 : 0.6, 4, dt);
    if (this.room && this.room.group) {
      const tg = this.room.group;
      for (const ch of tg.children) {
        if (ch.userData && ch.userData.ringPort === "up") ch.scale.setScalar(this._upR);
        if (ch.userData && ch.userData.ringPort === "down") ch.scale.setScalar(this._downR);
      }
    }
  },

  interact(x, z) {
    const W = this.roomW;
    const upX = 0, upZ = W / 2 - 4;
    const downX = 0, downZ = -(W / 2 - 4);
    const pu = Game.player.pos;
    if (Utils.dist2(x, z, upX, upZ) < 4 * 4) {
      if (this.floorCleared() && (this.floor % 10 !== 0 || (this.boss && this.boss.dead) || !this.boss)) {
        if (this.floor < this.maxFloor) {
          if (this.canEnter(this.floor + 1)) this.enter(this.floor + 1);
          else Game.notify("Necesitas nivel " + this.requiredLevel(this.floor + 1) + " para el piso " + (this.floor + 1) + ".", "warn");
        }
        else { this.exit(); }
      } else {
        Game.notify("Primero limpia el piso (y al guardián).", "warn");
      }
    } else if (Utils.dist2(x, z, downX, downZ) < 4 * 4) {
      if (this.floor > 1) this.enter(this.floor - 1);
      else this.exit();
    }
  },

  floorCleared() {
    if (this.clearedInSession) return true;
    const save = Save.data.castle;
    return save.cleared.indexOf(this.floor) >= 0;
  },

  promptAt(x, z) {
    if (!this.room) return "";
    const W = this.roomW;
    if (Utils.dist2(x, z, 0, W / 2 - 4) < 4 * 4) {
      if (this.floorCleared() && (this.floor % 10 !== 0 || (this.boss && this.boss.dead) || !this.boss)) {
        if (this.floor < this.maxFloor) return "Subir al piso " + (this.floor + 1);
        return "Salir de la Aguja";
      }
      return "Portal sellado — limpia el piso";
    }
    if (Utils.dist2(x, z, 0, -(W / 2 - 4)) < 4 * 4) {
      if (this.floor > 1) return "Bajar al piso " + (this.floor - 1);
      return "Salir de la Aguja";
    }
    return "";
  },

  groundHeight(x, z) { return 0; },

  /* ============================================================
     floor build
     ============================================================ */
  buildFloor() {
    const f = this.floor;
    const W = this.roomW, D = this.roomD, H = this.roomH;
    const theme = this.theme;
    const tier = Math.min(3, Math.floor((f - 1) / 25));
    // (theme chosen in enter(); keep consistent with tier)

    const g = new THREE.Group();
    g.userData.castleFloor = true;

    const matFloor = new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.9 });
    const matWall = new THREE.MeshStandardMaterial({ color: theme.wall, roughness: 0.95 });

    // floor slab
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W / 2, 0.6, 36), matFloor);
    floor.rotation.x = 0; floor.position.y = -0.3;
    floor.receiveShadow = true;
    g.add(floor);

    // concentric ring grooves
    const matSeal = new THREE.MeshStandardMaterial({ color: theme.accent, metalness: 0.6, roughness: 0.4 });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(W / 2 - 1.5 - i * 1.6, 0.18, 5, 48), matSeal);
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.02;
      g.add(ring);
    }

    // walls
    const wallMesh = new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W / 2, H, 40, 1, true), matWall);
    wallMesh.position.y = H / 2;
    g.add(wallMesh);

    // pillars + braziers
    const matPillar = new THREE.MeshStandardMaterial({ color: 0x3c3450, roughness: 0.8 });
    const matFlame = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.9 });
    const flick = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.5;
      const r = W / 2 - 3;
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, H, 8), matPillar);
      pil.position.set(Math.cos(a) * r, H / 2, Math.sin(a) * r);
      g.add(pil);
      if (i % 2 === 0) {
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 5), matFlame);
        flame.position.set(Math.cos(a) * r, H - 1.8, Math.sin(a) * r);
        g.add(flame);
        flick.push(flame);
      }
    }

    // rune circle at center
    const rune = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 36), new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.9, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    rune.rotation.x = -Math.PI / 2; rune.position.y = 0.03;
    g.add(rune);

    // corner rocks w/ accent gems (procedural determinism)
    const matAccent = new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 1.2 });
    let seed = (f * 977 + 3) % 2147483647;
    const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rng() * 0.5;
      const r = 6 + rng() * (W / 2 - 14);
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + rng() * 0.7, 0), new THREE.MeshStandardMaterial({ color: theme.wall, roughness: 1 }));
      rock.position.set(Math.cos(a) * r, 0.4 + rng() * 0.5, Math.sin(a) * r);
      rock.castShadow = true; g.add(rock);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.3 + rng() * 0.2), matAccent);
      gem.position.set(Math.cos(a) * r, 1.4 + rng() * 0.6, Math.sin(a) * r);
      g.add(gem);
    }

    // floating accent orb
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.7 }));
    orb.position.set(0, 6, 0); g.add(orb);

    // portals
    this._upR = 0.001; this._downR = 0.001;
    const mkPortal = (ringColor, dep, name) => {
      const pg = new THREE.Group();
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.35, 8, 30), new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.9 }));
      ringM.rotation.x = Math.PI / 2;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(2.0, 24), new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      disc.rotation.x = -Math.PI / 2;
      pg.add(ringM, disc);
      pg.userData.ringPort = name;
      pg.position.set(0, 0, dep);
      g.add(pg);
      return pg;
    };
    this._upPortal = mkPortal(0x69f0d8, W / 2 - 4, "up");
    this._downPortal = mkPortal(0xff8a6a, -(W / 2 - 4), "down");
    this._upPortal.name = "castle_up";
    this._downPortal.name = "castle_down";

    // lights
    const amb = new THREE.AmbientLight(0x8b95c0, 0.4);
    g.add(amb);
    const sun = new THREE.DirectionalLight(0xfff2d0, 0.5);
    sun.position.set(-40, 60, 20); g.add(sun);
    const hemi = new THREE.HemisphereLight(0x9aa6e0, 0x3a3460, 0.4);
    g.add(hemi);

    // swap old room
    if (this.room && this.room.group) {
      Game.scene.remove(this.room.group);
    }
    this.room = { group: g };
    Game.scene.add(g);
    if (!this._added) { Game.scene.add(this.group); this._added = true; }
  },

  /* add floors into the castle root group (used by build.js) */
  roomMesh() { return this.room ? this.room.group : this.group; },

  /* ============================================================
     enemies / wardens
     ============================================================ */
  requiredLevel(f) {
    return Math.max(this.minLevelReq, Math.floor(this.minLevelReq + (f - 1) * (this.gateMult * 4)));
  },

  spawnEnemies() {
    const f = this.floor;
    const lvl = this.requiredLevel(f);
    const defs = this._floorPool(f);
    const count = Math.min(14, 3 + Math.ceil(f / 7) + Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.4;
      const r = 6 + (i % 3) * 7;
      const e = this.game.enemyDirector.spawn({
        x: Math.cos(a) * r, z: Math.sin(a) * r,
        def: ENEMIES[Utils.pick(defs)], level: lvl,
        castleFloor: f, despawnDelay: 4000,
      });
      this.enemies.push(e);
    }
    if (f % 10 === 0) this.spawnWarden();
  },

  _floorPool(f) {
    const pools = [
      ["slime", "bat"], ["zombie", "skeleton"], ["wolf", "goblin"], ["yeti", "ghost"],
      ["scorpion", "croc"], ["demon", "imp"], ["ghost", "skeleton"], ["golem", "demon"],
    ];
    return pools[Math.floor((f - 1) / 12) % pools.length];
  },

  spawnWarden() {
    const f = this.floor;
    const tier = Math.floor((f - 1) / 25);
    const names = ["Guardián de Piedra", "Guardián Carmesí", "Guardián del Vacío", "Señor de la Aguja"];
    const colors = [0x8d9a7a, 0xbf6a6a, 0x9a5ac8, 0xd8d8b0];
    const color = colors[Math.min(3, tier)];
    const lvl = this.requiredLevel(f);
    const en = this.game.enemyDirector.spawnBoss({ x: 0, z: 0, y: 0 }, {
      name: names[Math.min(3, tier)] + " · " + this.theme.name,
      level: lvl, hp: Math.round(1400 + f * 380), atk: Math.round(26 + f * 6),
      def: Math.round(10 + f), mdef: Math.round(8 + f), xp: Math.round(80 + f * 12),
      gold: Math.round(CFG.CASTLE.CLEAR_REWARD_GOLD + f * 2),
    });
    en.def.type = "boss"; en.def.color = color;
    en.userData.castleWarden = true;
    this.boss = en; this.bossPresent = true;
  },

  onEnemyDefeated(e) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i] === e) this.enemies.splice(i, 1);
    }
    if (e.userData && e.userData.castleWarden) {
      this.bossPresent = false;
      this.boss = null;
      this.clearedInSession = true;
      this._markCleared();
      Game.fx.shockwave(new THREE.Vector3(0, 1, 0), 0xffffff, 26, 1.2);
      Game.sfx.roar();
      Game.addGold(CFG.CASTLE.CLEAR_REWARD_GOLD + this.floor * 2);
      Game.notify("¡Guardián derrotado! +" + (CFG.CASTLE.CLEAR_REWARD_GOLD + this.floor * 2) + " de oro", "good");
      QuestManager.onCastleFloor(this.floor);
      Save.save();
    } else if (this.enemies.length === 0) {
      this.clearedInSession = true;
      this._markCleared();
      Game.notify("Piso " + this.floor + " superado.", "good");
    }
  },

  _markCleared() {
    const sv = Save.data.castle;
    if (this.floor > sv.highestFloor) sv.highestFloor = this.floor;
    if (sv.cleared.indexOf(this.floor) < 0) sv.cleared.push(this.floor);
  },

  resetFloor() {
    this.clearedInSession = false;
    Save.save();
  },

  dispose() {
    if (this.room && this.room.group) { Game.scene.remove(this.room.group); this.room = null; }
    for (const e of this.enemies) {
      if (e && !e.dead) this.game.enemyDirector._removeEnemy(e);
    }
    this.enemies.length = 0;
    this.boss = null;
    this.bossPresent = false;
    this.clearedInSession = false;
    this.floor = 1;
  },

  /* — helpers expected by UI/quests — */
  highestCleared() { return Save.data.castle.highestFloor || 1; },
  floorTier(f) { return Math.min(3, Math.floor((f - 1) / 25)); },
};

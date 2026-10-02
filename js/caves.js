/* ============================================================
   caves.js — interior cave scenes: ore nodes, enemies, exit,
   closed dark chamber with flickering lights.
   ============================================================ */
const CaveManager = {
  currentId: null,
  group: null,
  rooms: new Map(),          // id -> room data
  nodeTimer: 0,

  build(scene, caveInfo) {
    const R = 44;
    const FLOOR_Y = 1.8;
    const matRock = new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 1 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 1 });
    const matCrys = new THREE.MeshStandardMaterial({ color: 0x7cd8ff, emissive: 0x2a5a8a, emissiveIntensity: 0.8, transparent: true, opacity: 0.9 });
    const g = new THREE.Group();

    // floor disk
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1.6, 40), matRock);
    floor.position.y = FLOOR_Y - 0.8;
    floor.receiveShadow = true;
    g.add(floor);
    // walls
    const wallGeo = new THREE.CylinderGeometry(R, R, 26, 40, 1, true);
    const walls = new THREE.Mesh(wallGeo, matDark);
    walls.position.y = FLOOR_Y + 13;
    walls.side = THREE.FrontSide;
    g.add(walls);
    // ceiling
    const ceil = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1.4, 40, 1, true), matDark);
    ceil.position.y = FLOOR_Y + 26.2;
    g.add(ceil);
    // stalagmites
    const rng = Utils.mulberry(caveInfo.x * 31 + caveInfo.z * 7);
    for (let i = 0; i < 34; i++) {
      const a = rng() * Math.PI * 2, r = 6 + rng() * (R - 12);
      const st = new THREE.Mesh(new THREE.ConeGeometry(0.8 + rng() * 1.4, 2.5 + rng() * 4, 6), rng() < 0.4 ? matDark : matRock);
      st.position.set(Math.cos(a) * r, FLOOR_Y + st.geometry.parameters.height / 2 - 0.4, Math.sin(a) * r);
      st.rotation.y = rng() * Math.PI;
      st.castShadow = true;
      st.userData.static = true;
      g.add(st);
    }
    const colliders = [];
    for (const m of g.children) {
      if (m.userData.static) colliders.push({ x: m.position.x, z: m.position.z, r: m.geometry.parameters.radiusTop || 0.8 });
    }

    // lights
    const flick = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.5;
      const r = 24;
      const pl = new THREE.PointLight(0x4a7aff, 55, 60, 2);
      pl.position.set(Math.cos(a) * r, FLOOR_Y + 8, Math.sin(a) * r);
      flick.push(pl);
      g.add(pl);
    }
    // blue crystals glow piles
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2, r = rng() * (R - 8);
      const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.5 + rng() * 0.6), matCrys);
      cr.position.set(Math.cos(a) * r, FLOOR_Y + 0.4, Math.sin(a) * r);
      g.add(cr);
    }

    // ore nodes (deterministic)
    const nodes = [];
    const oreDef = ITEM.defs[caveInfo.ore];
    for (let i = 0; i < caveInfo.nodes; i++) {
      const a = rng() * Math.PI * 2, r = 8 + rng() * (R - 16);
      const nx = Math.cos(a) * r, nz = Math.sin(a) * r;
      nodes.push({
        x: nx, z: nz, defId: caveInfo.ore, def: oreDef,
        hp: 100, maxHp: 100, respawnAt: 0, alive: true,
        mesh: null,
      });
    }
    // spawn additional small rocks for nodes
    for (const n of nodes) {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), new THREE.MeshStandardMaterial({ color: 0x54546a, roughness: 1, metalness: 0 }));
      rock.position.set(n.x, FLOOR_Y + 0.7, n.z);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), oreDef ? new THREE.MeshStandardMaterial({ color: oreDef.color, emissive: oreDef.color, emissiveIntensity: 1.2, transparent: true, opacity: 0.95 }) : matCrys);
      gem.position.set(n.x, FLOOR_Y + 1.5, n.z);
      gem.name = "oregem";
      n.mesh = { rock: rock, gem: gem };
      g.add(rock, gem);
    }

    // exit portal (center-north)
    const exitMat = new THREE.MeshBasicMaterial({ color: 0x54d8ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const exitPortal = new THREE.Mesh(new THREE.CircleGeometry(2.6, 16), exitMat);
    exitPortal.rotation.y = Math.PI;
    exitPortal.position.set(0, FLOOR_Y + 2.2, R - 3);
    g.add(exitPortal);
    const ecol = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.25, 8, 24), new THREE.MeshStandardMaterial({ color: 0x2b7ab0, emissive: 0x2b7ab0, emissiveIntensity: 1.2, roughness: 0.4 }));
    ecol.rotation.x = Math.PI / 2;
    ecol.position.set(0, FLOOR_Y + 2.2, R - 3);
    g.add(ecol);

    scene.add(g);

    const room = {
      id: caveInfo.id, info: caveInfo, group: g,
      floorY: FLOOR_Y, R: R, nodes: nodes, flick,
      exit: { x: 0, z: R - 5 }, entry: { x: 0, z: 0 },
      colliders, spawnT: 0, enemies: [],
    };
    this.rooms.set(caveInfo.id, room);
    return room;
  },

  enter(caveInfo) {
    Game.enterRegion("cave");
    const room = this.rooms.get(caveInfo.id) || this.build(Game.scene, caveInfo);
    this.currentId = caveInfo.id;
    this.group = room.group;
    Game.regionData = room;
    // reposition player at entry
    const p = Game.player;
    p.pos.set(room.entry.x + 2, room.floorY + 0.5, room.entry.z + 2);
    p.vel.set(0, 0, 0);
    Game.onRegionEnter();
    this.spawnEnemies(room);
    Game.notify(caveInfo.name + " — " + (caveInfo.ore ? ITEM.defs[caveInfo.ore].name : "caverna"), "info");
    Game.sfx.spell();
    Game.ui.refreshHUD();
    // explore quest hook for crystal cave
    if (caveInfo.id === "cave_silver") QuestManager.onEvent("explore", "explore_crystalcave");
  },

  exit() {
    const c = World.POIS.caves.find(cv => cv.id === this.currentId);
    this.disposeAll();
    this.group = null;
    Game.enterRegion("overworld");
    if (c) {
      Game.player.pos.set(c.x + 2, World.heightAt(c.x + 2, c.z + 5) + 0.6, c.z + 5);
    }
    Game.player.vel.set(0, 0, 0);
    Game.onRegionEnter();
    Game.notify("Has vuelto a la superficie.", "info");
  },

  groundHeight(x, z) {
    const room = this.rooms.get(this.currentId);
    if (!room) return 1.8;
    return room.floorY;
  },

  resolveBounds(p) {
    const room = this.rooms.get(this.currentId);
    if (!room) return;
    const dx = p.pos.x, dz = p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > room.R - 1.2) {
      const f = (room.R - 1.2) / d;
      p.pos.x *= f; p.pos.z *= f;
    }
    for (const col of room.colliders) {
      const ddx = p.pos.x - col.x, ddz = p.pos.z - col.z;
      const rr = col.r + 0.9;
      if (ddx * ddx + ddz * ddz < rr * rr) {
        const l = Math.hypot(ddx, ddz) || 1;
        p.pos.x = col.x + ddx / l * rr;
        p.pos.z = col.z + ddz / l * rr;
      }
    }
  },

  spawnEnemies(room) {
    const pool = ["bat", "slime", "zombie"];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.4;
      const r = 8 + (i % 4) * 7;
      const def = ENEMIES[pool[i % 3]];
      const e = Game.enemyDirector.spawn({
        x: Math.cos(a) * r, z: Math.sin(a) * r, def,
        level: Math.max(1, Math.round(room.info.lvl - 2 + (i % 3))),
        goldMin: 3, goldMax: 14, respawnDelay: 50,
      });
      room.enemies.push(e);
    }
  },

  update(dt) {
    const room = this.rooms.get(this.currentId);
    if (!room) return;
    // flicker
    const t = Game.time;
    room.flick[0].intensity = 50 + Math.sin(t * 7) * 8;
    room.flick[1].intensity = 48 + Math.sin(t * 9 + 2) * 10;
    room.flick[2].intensity = 52 + Math.sin(t * 6 + 4) * 7;
    room.flick[3].intensity = 49 + Math.sin(t * 8 + 1) * 9;
    // node respawn
    for (const n of room.nodes) {
      if (!n.alive && Game.time > n.respawnAt) {
        n.alive = true;
        if (n.mesh) { n.mesh.rock.visible = true; n.mesh.gem.visible = true; }
      }
    }
    // exit portal pulse
    room.group.traverse(o => { if (o.name === "oregem") o.rotation.y += dt * 2; });
    // enemy respawn if cleared
    if (room.enemies.filter(e => !e.dead && !e.removed).length === 0 && Game.time > room.spawnT) {
      room.spawnT = Game.time + 40;
      this.spawnEnemies(room);
    }
  },

  mineNode(node, player) {
    // returns collected ore defId or null
    if (!node.alive) return null;
    node.hp -= 34;
    Game.fx.hitSpark(new THREE.Vector3(node.x, this.groundHeight(node.x, node.z) + 1.2, node.z), node.def ? node.def.color : 0xffffff);
    Game.sfx.swing();
    if (node.hp <= 0) {
      node.alive = false;
      node.respawnAt = Game.time + 70;
      if (node.mesh) { node.mesh.rock.visible = false; node.mesh.gem.visible = false; }
      const oreId = node.defId;
      Inventory.add(oreId, Utils.irand(1, 2));
      QuestManager.onEvent("mine");
      Save.data.mining.xp += 5;
      Game.fx.burst(new THREE.Vector3(node.x, this.groundHeight(node.x, node.z) + 1.2, node.z), 0xffd060, 12, { up: 4, speedMax: 6 });
      Game.sfx.pickup();
      Game.notify("¡Has minado " + ITEM.defs[oreId].name + "!", "good");
      Game.addGold(Utils.irand(2, 6));
      return oreId;
    }
    return null;
  },

  nearestNode(x, z, radius) {
    const room = this.rooms.get(this.currentId);
    if (!room) return null;
    let best = null, bd = radius * radius;
    for (const n of room.nodes) {
      if (!n.alive) continue;
      const d = Utils.dist2(n.x, n.z, x, z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  },

  disposeAll() {
    for (const [k, room] of this.rooms) {
      Game.scene.remove(room.group);
      for (const e of room.enemies) Game.enemyDirector._removeEnemy(e);
    }
    this.rooms.clear();
    this.currentId = null;
    this.group = null;
  },
};
/* ============================================================
   enemies.js — procedural enemy/boss models + EnemyDirector
   (spawning, AI behaviours, drops, quest hooks, raids).
   ============================================================ */
const EnemyDirector = {
  game: null, scene: null,
  active: [],          // living / inert enemies
  roamSlots: [],       // {x,z,enemies[], alive, respawnAt, enemy}
  DEACTIVATE: 230,     // despawn radius
  spawnTick: 0,
  raidState: {},       // villageId -> {cleared, defenders, respawnAt}
  bossState: {},       // bossId   -> {dead, respawnAt}

  init(game) {
    this.game = game;
    this.scene = game.scene;
    for (const k in ENEMIES) if (!ENEMIES[k].id) ENEMIES[k].id = k;
    for (const k in BOSSES) if (!BOSSES[k].id) BOSSES[k].id = k;
    World.makeRoamSpawns();
    for (const s of World.roamEnemies) this.roamSlots.push({ x: s.x, z: s.z, pool: s.enemies, alive: false, respawnAt: 0, enemy: null });
    for (const v of World.POIS.villages) this.raidState[v.id] = { cleared: Save.data.world.raids.indexOf(v.id) >= 0, respawnAt: 0, enemies: [] };
    for (const b of World.POIS.bosses) this.bossState[b.id] = { defeated: Save.data.world.bossesDefeated.indexOf(b.id) >= 0, respawnAt: 0 };
  },

  clearAll() {
    for (const e of this.active) this._removeEnemy(e);
    this.active.length = 0;
    for (const s of this.roamSlots) { s.alive = false; s.enemy = null; }
    for (const v in this.raidState) this.raidState[v].enemies.length = 0;
    for (const b in this.bossState) { this.bossState[b].spawned = null; this.bossState[b].kicked = false; }
    if (this.castleRoom) this.castleRoom.length = 0;
  },

  /* ---------- main update ---------- */
  update(dt) {
    const p = Game.player.pos;
    this.spawnTick -= dt;

    // roaming spawns
    if (this.spawnTick <= 0) {
      this.spawnTick = CFG.SPAWN.TICK;
      const near = [];
      for (const s of this.roamSlots) {
        const d = Utils.dist2(s.x, s.z, p.x, p.z);
        if (d < 140 * 140) {
          if (!s.alive && d > 20 * 20 && this.active.length < 64) {
            if (this.game.time > s.respawnAt) {
              const def = ENEMIES[Utils.pick(s.pool)];
              s.enemy = this.spawn({ x: s.x, z: s.z, def, level: def.lvl, anchor: { x: s.x, z: s.z }, roam: s, respawnDelay: 26 });
              s.alive = true;
            }
          } else if (s.alive && s.enemy && s.enemy.dead) {
            s.alive = false;
          }
        } else if (s.alive && s.enemy && !s.enemy.dead && d > this.DEACTIVATE * this.DEACTIVATE) {
          this._removeEnemy(s.enemy); s.enemy = null; s.alive = false;
        }
      }
      // village raids
      for (const v of World.POIS.villages) {
        const rs = this.raidState[v.id];
        const d = Utils.dist2(v.x, v.z, p.x, p.z);
        if (rs.cleared && this.game.time > rs.respawnAt && d < 160 * 160) rs.cleared = false;
        if (!rs.cleared && d < 70 * 70 && rs.enemies.length === 0) {
          rs.parent = v;
          const lvl = Math.max(v.lvl, Save.data.player.level - 1);
          const pool = this.raidPool(v.biome);
          const count = 5;
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + 0.7;
            const r = 15 + (i % 3) * 6;
            const ex = v.x + Math.cos(a) * r, ez = v.z + Math.sin(a) * r;
            const en = this.spawn({ x: ex, z: ez, def: ENEMIES[Utils.pick(pool)], level: lvl, anchor: { x: v.x, z: v.z }, raid: rs, respawnDelay: 40 });
            rs.enemies.push(en);
          }
          this.game.notify("¡" + v.name + " está bajo ataque!", "warn");
          this.game.sfx.roar();
        }
      }
      // bosses
      for (const b of World.POIS.bosses) {
        const bs = this.bossState[b.id];
        const d = Utils.dist2(b.x, b.z, p.x, p.z);
        if (bs.defeated && this.game.time > bs.respawnAt && d < 80 * 80 && !bs.kicked) { bs.defeated = false; bs.kicked = true; }
        if (d < 40 * 40 && !bs.defeated && !bs.spawned) {
          const bossDef = BOSSES[b.boss];
          const en = this.spawnBoss(b, bossDef);
          bs.spawned = en;
          bs.kicked = false;
        } else if (bs.spawned && (d > 90 * 90 || bs.spawned.dead)) {
          if (bs.spawned.dead) {
            bs.defeated = true; bs.respawnAt = this.game.time + 300; bs.spawned = null;
          } else {
            this._removeEnemy(bs.spawned); bs.spawned = null;
          }
        }
      }
    }

    // update all enemies
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.updateT -= dt;
      if (this.game.time > e.despawnAt && !e.dead && e.def.type !== "boss") {
        if (e.roam) e.roam.respawnAt = this.game.time + 8;
        this._removeEnemy(e, i); continue;
      }
      this.aiUpdate(e, dt);
      if (!e.dead) this.game.resolveColliders(e);
      this.animate(e, dt);
    }
  },

  raidPool(biome) {
    const map = { plains: ["goblin", "wolf"], forest: ["goblin", "skeleton"], desert: ["scorpion", "vulture"], tundra: ["yeti", "icewisp"], swamp: ["zombie", "croc"], volcanic: ["demon", "imp"] };
    return map[biome] || ["slime"];
  },

  /* ---------- spawning ---------- */
  spawn(opts) {
    const def = opts.def;
    const level = opts.level || def.lvl;
    const hpScale = opts.hpScale || 1;
    const e = {
      id: Utils.uid(), def: def, type: def.beh === "boss" ? "boss" : "mob",
      level, pos: new THREE.Vector3(opts.x, World.heightAt(opts.x, opts.z), opts.z),
      yaw: Math.random() * Math.PI * 2, hp: def.hp * hpScale, maxHp: def.hp * hpScale,
      atk: Math.round(def.atk * (1 + (level - def.lvl) * 0.05)),
      radius: (def.size || 1) * 0.75, dead: false,
      aggro: false, anchor: opts.anchor || new THREE.Vector3(opts.x, 0, opts.z),
      roam: opts.roam || null, raid: opts.raid || null,
      updateT: 0, attackT: 0, skillT: Math.random() * 2, slowUntil: 0, hitT: 0,
      despawnAt: this.game.time + (opts.despawnDelay || opts.respawnDelay || 60),
      model: null, vel: new THREE.Vector3(), insane: 0,
    };
    e.def.xp = def.xp; e.def.goldMin = opts.goldMin !== undefined ? opts.goldMin : CFG.GOLD.DROP_MIN;
    e.def.goldMax = opts.goldMax !== undefined ? opts.goldMax : CFG.GOLD.DROP_MAX;
    e.model = ModelFor(def.model, def.color, def.size || 1, e);
    this.scene.add(e.model);
    this.active.push(e);
    return e;
  },

  spawnBoss(poi, bossDef) {
    const level = bossDef.lvl;
    const e = {
      id: Utils.uid(), def: bossDef, type: "boss", level,
      pos: new THREE.Vector3(poi.x, World.heightAt(poi.x, poi.z), poi.z),
      yaw: 0, hp: bossDef.hp, maxHp: bossDef.hp,
      atk: bossDef.atk, radius: (bossDef.size || 3) * 0.8, dead: false,
      aggro: true, anchor: { x: poi.x, z: poi.z }, roam: null, raid: null,
      updateT: 0, attackT: 6, skillT: 0, slowUntil: 0, hitT: 0, isBoss: true,
      despawnAt: this.game.time + 9999, model: null, vel: new THREE.Vector3(),
      pattern: bossDef.pattern || ["charge"], patIdx: 0,
      enraged: false, userData: {},
    };
    e.model = ModelFor(bossDef.model, bossDef.color, bossDef.size || 4, e);
    this.scene.add(e.model);
    this.active.push(e);
    this.game.onBossSpawn(e);
    // rock formation warning particles handled by Game
    return e;
  },

  _removeEnemy(e, i) {
    if (e.model) { this.scene.remove(e.model); }
    e.dead = true;
    e.removed = true;
    if (i === undefined) { const j = this.active.indexOf(e); if (j >= 0) this.active.splice(j, 1); }
  },

  /* ---------- AI ---------- */
  aiUpdate(e, dt) {
    const p = Game.player.pos;
    const d = Utils.len(p.x - e.pos.x, 0, p.z - e.pos.z);
    if (!e.aggro && d > 34) return;                       // idle when far
    e.updateT -= dt;
    e.attackT -= dt;
    e.vel.multiplyScalar(Math.pow(0.6, dt * 60));

    // slow effect
    const slowed = this.game.time < e.slowUntil;
    const speed = e.def.speed * (slowed ? 0.55 : 1);

    if (e.isBoss) { this.bossAI(e, dt, d); return; }

    const range = e.def.beh === "ranged" ? 12 : e.def.beh === "caster" ? 14 : 2.1 + e.def.size * 0.5;

    if (!e.aggro) {
      // wander around anchor
      if (e.updateT <= 0) {
        e.updateT = Utils.rand(2, 5);
        e.yaw = Math.random() * Math.PI * 2;
      }
      e.pos.x += Math.sin(e.yaw) * speed * 0.5 * dt;
      e.pos.z += Math.cos(e.yaw) * speed * 0.5 * dt;
      e.pos.y = this.game.groundHeight(e.pos.x, e.pos.z) + 0.01;
      if (d < 7) { e.aggro = true; this.game.onEnemyAggro(e); }
      return;
    }

    // keep near anchor
    if (this.game.time > e.despawnAt) return;
    const ad = Utils.len(e.pos.x - e.anchor.x, 0, e.pos.z - e.anchor.z);
    if (e.type !== "boss" && !e.roam && ad > 90) { e.aggro = false; return; }

    e.pos.y = this.game.groundHeight(e.pos.x, e.pos.z) + 0.01;
    if (e.def.beh === "ranged" || e.def.beh === "caster") {
      // kite at preferred range
      if (d > range + 2) {
        this.moveToward(e, p, speed, dt);
      } else if (d < range - 4) {
        this.moveAway(e, p, speed * 0.7, dt);
      } else {
        e.pos.x += (Math.sin(e.yaw + 0.4) - Math.sin(e.yaw)) * 0.01;
        if (e.updateT <= 0) { e.updateT = 2; e.yaw += Utils.rand(-0.5, 0.5); }
      }
      e.yaw = Math.atan2(p.x - e.pos.x, p.z - e.pos.z);
      // shoot
      if (e.attackT <= 0 && d < 26) {
        e.attackT = e.def.beh === "caster" ? Utils.rand(2.4, 3.2) : Utils.rand(1.8, 2.6);
        this.rangeAttack(e);
      }
    } else {
      // melee
      if (d > range) {
        this.moveToward(e, p, speed, dt);
      } else {
        e.pos.x += (Math.sin(e.yaw + 0.4) - Math.sin(e.yaw)) * 0.01;
        if (e.attackT <= 0) {
          e.attackT = 1.1 + Math.random() * 0.6;
          this.meleeAttack(e, p);
        }
      }
      e.yaw = Math.atan2(p.x - e.pos.x, p.z - e.pos.z);
    }
    e.walk = true;
  },

  moveToward(e, p, speed, dt) {
    const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    e.pos.x += dx / l * speed * dt; e.pos.z += dz / l * speed * dt;
  },
  moveAway(e, p, speed, dt) {
    const dx = e.pos.x - p.x, dz = e.pos.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    e.pos.x += dx / l * speed * dt; e.pos.z += dz / l * speed * dt;
  },

  meleeAttack(e, p) {
    e.pos.y = this.game.groundHeight(e.pos.x, e.pos.z);
    e.animT = 0; e.doHit = true;
    const dist = Utils.len(p.x - e.pos.x, p.y - e.pos.y, p.z - e.pos.z);
    if (dist < e.radius + 2.2) {
      Game.dealPlayerDamage(e.atk, { magic: false });
      this.game.sfx.hit();
      if (Game.player.dashT <= 0) {
        Game.player.pos.x += (Game.player.pos.x - e.pos.x) * 0.04;
        Game.player.pos.z += (Game.player.pos.z - e.pos.z) * 0.04;
      }
    }
  },

  rangeAttack(e) {
    const p = Game.player.pos;
    const from = new THREE.Vector3(e.pos.x, e.pos.y + e.def.size * 1.4 + 0.6, e.pos.z);
    const dir = new THREE.Vector3(p.x - from.x, p.y + 0.4 - from.y, p.z - from.z).normalize();
    const el = e.def.beh === "caster" ? "ice" : "phys";
    Game.fx.shoot(from, dir, {
      color: el === "ice" ? 0x8fd8ff : 0xffc060, speed: 16, dmg: e.atk * (e.def.beh === "caster" ? 1.3 : 1.0),
      element: el, from: "enemy", hitR: 0.8, owner: e,
    });
    this.game.sfx.shoot();
  },

  bossAI(e, dt, d) {
    const p = Game.player.pos;
    // enrage below 30%
    if (!e.enraged && e.hp / e.maxHp < 0.3) { e.enraged = true; this.game.onBossEnrage(e); }
    const speed = e.def.speed * (e.enraged ? 1.25 : 1);
    e.skillT -= dt;
    e.attackT -= dt;
    // phase by pattern
    const pat = e.pattern[e.patIdx % e.pattern.length];
    const preferred = { charge: 4, slam: 3.4, summon: 16, roots: 12, swarm: 8, sting: 3.4, sandstorm: 10, icewall: 9, fury: 3.4, meteor: 18, poison: 6 };

    if (d > preferred[pat] + 1) {
      this.moveToward(e, p, speed * (pat === "charge" ? 1.7 : 1), dt);
    } else if (d < preferred[pat] - 2) {
      this.moveAway(e, p, speed * 0.6, dt);
    } else {
      e.pos.x += (Math.random() - 0.5) * 0.4;
      e.pos.z += (Math.random() - 0.5) * 0.4;
    }
    e.pos.y = this.game.groundHeight(e.pos.x, e.pos.z) + 0.01;
    e.yaw = Math.atan2(p.x - e.pos.x, p.z - e.pos.z);

    if (e.attackT <= 0) {
      e.attackT = pat === "charge" ? 3.2 : pat === "meteor" ? 4.2 : 2.6;
      this.bossAttack(e, pat);
      e.patIdx++;
    }
  },

  bossAttack(e, pat) {
    const p = Game.player.pos;
    const fx = Game.fx;
    switch (pat) {
      case "charge": {
        e.doHit = true; e.charge = 1;
        const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
        const l = Math.hypot(dx, dz) || 1;
        e.chargeDir = new THREE.Vector3(dx / l, 0, dz / l);
        this.game.sfx.roar();
        break;
      }
      case "slam": {
        fx.shockwave(e.pos.clone().setY(e.pos.y + 0.4), 0xffb040, 6, 0.5);
        fx.burst(e.pos, 0xbf8a4a, 20, { speedMax: 10, up: 4 });
        const dist = Utils.len(p.x - e.pos.x, 0, p.z - e.pos.z);
        if (dist < 6.5) Game.dealPlayerDamage(e.atk * 1.3, { magic: false });
        e.doHit = true; this.game.sfx.explode();
        break;
      }
      case "fury": {
        if (e.enraged) Game.dealPlayerDamage(e.atk * 1.8, { magic: true });
        else Game.dealPlayerDamage(e.atk * 1.25, { magic: true });
        fx.bolt(new THREE.Vector3(e.pos.x, e.pos.y + e.def.size * 1.4, e.pos.z), new THREE.Vector3(p.x, p.y + 1.4, p.z), 0xffffff);
        this.game.sfx.lightning();
        break;
      }
      case "roots": case "poison": {
        fx.shockwave(e.pos.clone().setY(e.pos.y + 0.4), 0x4a8a3a, 8, 0.6);
        const dist = Utils.len(p.x - e.pos.x, 0, p.z - e.pos.z);
        if (dist < 8.5) { Game.dealPlayerDamage(e.atk * 1.2, { magic: true }); Game.player.buffs.slowUntil = undefined; }
        this.game.sfx.hit();
        break;
      }
      case "swarm": case "summon": {
        const pool = e.def.zone === "forest" ? ["wolf", "skeleton"] : e.def.zone === "plains" ? ["slime", "goblin"] : ["imp", "ghost"];
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2, r = Utils.rand(5, 9);
          const from = new THREE.Vector3(e.pos.x + Math.cos(a) * r, e.pos.y, e.pos.z + Math.sin(a) * r);
          const m = ENEMIES[Utils.pick(pool)];
          this.spawn({ x: from.x, z: from.z, def: m, level: Math.max(1, e.level - 2) });
        }
        fx.burst(e.pos.clone().setY(e.pos.y + 1), 0x8a4ab0, 18, { up: 5 });
        this.game.sfx.spell();
        break;
      }
      case "sting": {
        Game.dealPlayerDamage(e.atk * 1.5, { magic: false });
        fx.hitSpark(p.clone().setY(p.y + 1.2), 0xc9a227);
        this.game.sfx.hit();
        break;
      }
      case "sandstorm": {
        fx.shockwave(e.pos.clone().setY(e.pos.y + 0.4), 0xd0a050, 10, 0.7);
        const dist = Utils.len(p.x - e.pos.x, 0, p.z - e.pos.z);
        if (dist < 10) Game.dealPlayerDamage(e.atk * 1.2, { magic: true });
        this.game.sfx.shoot();
        break;
      }
      case "icewall": {
        fx.shockwave(e.pos.clone().setY(e.pos.y + 0.4), 0x9fd8ff, 7, 0.6);
        fx.burst(e.pos.clone().setY(e.pos.y + 2), 0xb0e0ff, 25, { up: 6, speedMax: 9 });
        const dist = Utils.len(p.x - e.pos.x, 0, p.z - e.pos.z);
        if (dist < 7) { Game.dealPlayerDamage(e.atk * 1.2, { magic: true }); Game.playerStagger = 1.2; }
        this.game.sfx.freeze();
        break;
      }
      case "meteor": {
        // place explosive projectile above player
        const fall = new THREE.Vector3(p.x, p.y + 24, p.z);
        const from = new THREE.Vector3(e.pos.x, e.pos.y + 30, e.pos.z);
        fx.bolt(from, fall, 0xff5030);
        const dir = new THREE.Vector3(p.x - from.x, p.y - from.y, p.z - from.z).normalize();
        Game.fx.shoot(from, dir, { color: 0xff6030, speed: 18, dmg: e.atk * 2.4, element: "fire", from: "enemy", owner: e, explode: 7, explodeR: 6 });
        Game.fx.shockwave(fall, 0xff6030, 3, 0.5);
        this.game.sfx.explode();
        break;
      }
    }
  },

  /* ---------- damage handling ---------- */
  damageEnemy(e, combat) {
    if (e.dead) return { dmg: 0, killed: false, crit: false };
    const p = Game.player;
    const st = p.stats();
    const isMag = !!combat.element && combat.element !== "phys";
    const baseDmg = combat.flat !== undefined ? combat.flat : (isMag ? st.matk : st.atk);
    let d = baseDmg * (combat.dmg || 1);
    if (p.buffs.atkUntil > Game.time) d *= 1 + p.buffs.atkMult;
    const crit = Math.random() < st.crit;
    if (crit) d *= CFG.DAMAGE.CRIT_MULT;
    const def = isMag ? e.def.mdef : e.def.def;
    d = Math.max(1, d - def * 0.4);
    d = Math.round(d);
    e.hp -= d;
    if (Save.data.stats) Save.data.stats.damageDealt += d;
    e.hitT = 0.25;
    Game.fx.hitSpark(e.pos.clone().setY(e.pos.y + e.def.size * 1.1), isMag ? 0xa0b0ff : 0xffdda0);
    if (combat.slow && !e.isBoss) e.slowUntil = Game.time + combat.slow;
    if (combat.knock) {
      const k = new THREE.Vector3(e.pos.x - p.pos.x, 0, e.pos.z - p.pos.z).normalize().multiplyScalar(combat.knock);
      e.vel.add(k);
      e.pos.x += k.x * 0.3; e.pos.z += k.z * 0.3;
    }
    if (e.hp <= 0) {
      this.kill(e, crit);
      return { dmg: d, killed: true, crit };
    }
    if (!e.aggro) { e.aggro = true; }
    return { dmg: d, killed: false, crit };
  },

  kill(e, crit) {
    e.dead = true;
    e.hp = 0;
    const fx = Game.fx;
    fx.burst(e.pos.clone().setY(e.pos.y + e.def.size * 0.8), e.def.color, Math.min(40, e.def.size * 14), { up: 5, speedMax: 9, life: 0.7 });
    // xp + gold
    const xpGain = Math.round((e.def.xp || 10) * (1 + (e.level - (e.def.lvl || 1)) * 0.05));
    Game.player.addXp(xpGain, { show: true });
    const goldGain = Math.round((e.def.goldMin || 2) + Math.random() * ((e.def.goldMax || e.def.goldMin || 4) - (e.def.goldMin || 2)));
    Game.addGold(goldGain);
    fx.damageNumber(e.pos.clone().setY(e.pos.y + e.def.size * 1.8), goldGain, { color: "#ffd060" });
    // drops from def
    const bossDef = e.def.drops;
    if (bossDef && bossDef.items) {
      for (const [defId, prob] of bossDef.items) {
        if (Math.random() < prob && ITEM.defs[defId]) { Inventory.add(defId, 1); fx.damageNumber(e.pos.clone().setY(e.pos.y + 2.6), " " + ITEM.defs[defId].name, { color: ITEM.defs[defId].color }); }
      }
    } else if (Utils.chance(0.04)) {
      const loot = this.lootTable(e);
      if (loot) { Inventory.add(loot, 1); fx.damageNumber(e.pos.clone().setY(e.pos.y + 2.6), " " + ITEM.defs[loot].name, { color: ITEM.defs[loot].color }); }
    }
    // quest kill hooks
    Save.data.world.enemiesKilled += 1;
    QuestManager.onKill(e.def.id, e);
    // raid clearing
    if (e.raid) {
      e.raid.enemies = e.raid.enemies.filter(x => x !== e && !x.dead);
      if (e.raid.enemies.length === 0 && !e.raid.cleared) {
        this.onRaidCleared(e.raid.parent);
      }
    }
    // boss defeat
    if (e.isBoss) Game.onBossDefeated(e);
    if (Game.region === "castle" && typeof Castle !== "undefined") Castle.onEnemyDefeated(e);
    this._removeEnemy(e);
  },

  lootTable(e) {
    const lvl = e.level;
    const tier = lvl >= 18 ? "epic" : lvl >= 9 ? "rare" : "common";
    const types = ["sword", "staff", "bow", "scepter"];
    const wt = Utils.pick(types);
    if (Utils.chance(0.5)) return "w_" + wt + "_" + tier;
    const slots = ["armor", "helmet", "boots", "accessory"];
    return "a_" + Utils.pick(slots) + "_" + tier;
  },

  /* ---------- misc ---------- */
  onRaidCleared(v) {
    const rs = this.raidState[v.id];
    rs.cleared = true;
    rs.respawnAt = Game.time + 240;
    if (Save.data.world.raids.indexOf(v.id) < 0) Save.data.world.raids.push(v.id);
    QuestManager.onEvent("raid", v.id);
    Game.notify("¡" + v.name + " asegurada! Cofre de recompensa desbloqueado.", "good");
    Game.fx.shockwave(new THREE.Vector3(v.x, World.heightAt(v.x, v.z) + 0.5, v.z), 0x8fe06a, 7, 0.8);
    Game.sfx.chest();
    Save.save();
  },

  getNear(pos, r) {
    const out = [];
    for (const e of this.active) {
      if (e.dead || e.removed) continue;
      if (Utils.dist2(e.pos.x, e.pos.z, pos.x, pos.z) < r * r) out.push(e);
    }
    return out;
  },

  /* ---------- animation ---------- */
  animate(e, dt) {
    if (e.dead) return;
    e.animT = (e.animT || 0) + dt;
    const m = e.model;
    if (!m) return;
    const t = e.animT;
    const walk = e.walk; e.walk = false;
    const kind = e.def.model;
    m.position.copy(e.pos).y += 0.01;
    m.rotation.y = e.yaw;
    const hitFlash = e.hitT > 0;
    m.traverse(o => { if (o.isMesh) o.material && o.material.toneMapped === undefined; });
    if (m.userData.hitFlash) { m.userData.hitFlash.visible = hitFlash; }
    if (e.doHit) { e.doHit = false; this.swingAnim(e, m); }
    if (m.userData.anim) m.userData.anim(e, m, t, dt, walk);
  },

  swingAnim(e, m) {
    if (m.userData.armR) { m.userData.armR.rotation.x = -2.2; }
    if (m.userData.body) m.userData.body.rotation.z = 0.7;
  },

  /* ---------- castle helpers ---------- */
  makeCastleEnemy(floor, defId, x, z) {
    const scale = 1 + (floor - 1) * 0.12;
    const def = typeof defId === "string" ? ENEMIES[defId] : defId;
    return this.spawn({ x, z, def, level: Math.round((def.lvl || 1) + floor * 0.4), hpScale: scale, goldMin: 4, goldMax: 20, respawnDelay: 60 });
  },
};/* ============================================================
   ModelFor(kind, color, size, enemy) — generic procedural
   enemy/boss meshes with simple procedural animation.
   ============================================================ */
function ModelFor(kind, color, size, enemy) {
  const g = new THREE.Group();
  const C = new THREE.Color(color);
  const dark = C.clone().multiplyScalar(0.55);
  const mMat = new THREE.MeshStandardMaterial({ color: C.getHex(), roughness: 0.9 });
  const dMat = new THREE.MeshStandardMaterial({ color: dark.getHex(), roughness: 1 });
  const eye = new THREE.MeshStandardMaterial({ color: 0xffe050, emissive: 0xff8020, emissiveIntensity: 1.6, roughness: 0.4 });
  const scale = size || 1;
  const mk = (w, h, d, mat, x, y, z, parent) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || mMat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    (parent || g).add(m);
    return m;
  };
  const sphere = (r, mat, x, y, z, parent) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat || mMat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    (parent || g).add(m);
    return m;
  };
  let anim = null, armR = null, legs = [], body = null;

  switch (kind) {
    case "slime": {
      body = sphere(0.7, mMat, 0, 0.6, 0);
      body.scale.y = 0.8;
      sphere(0.12, eye, -0.22, 0.85, 0.55); sphere(0.12, eye, 0.22, 0.85, 0.55);
      anim = (e, m, t, dt, walk) => { m.scale.y = 0.8 + Math.sin(t * (walk ? 9 : 3)) * 0.12; };
      break;
    }
    case "bat": case "vulture": case "wraith": {
      const winged = kind !== "wraith";
      body = sphere(0.5 * (kind === "vulture" ? 1.3 : 0.8), winged ? mMat : new THREE.MeshStandardMaterial({ color: M4COPY(color, 0.55), transparent: true, opacity: 0.55, roughness: 0.5 }), 0, 0.9, 0);
      const wL = mk(0.12, 0.05, winged ? 1.1 : 0, mMat, -0.3, 1.15, 0); wL.rotation.y = -0.5;
      const wR = mk(0.12, 0.05, winged ? 1.1 : 0, mMat, 0.3, 1.15, 0); wR.rotation.y = 0.5;
      sphere(0.14, eye, -0.2, 1.1, 0.42); sphere(0.14, eye, 0.2, 1.1, 0.42);
      wL.position.x = -0.05; wR.position.x = 0.05;
      wL.geometry.translate(0, 0, -0.55); wR.geometry.translate(0, 0, -0.55);
      g.add(wL, wR);
      const wA = { L: wL, R: wR };
      anim = (e, m, t, dt, walk) => {
        const s = Math.sin(t * (walk ? 12 : 5));
        wA.L.rotation.z = s * 0.9; wA.R.rotation.z = -s * 0.9;
        m.position.y = e.pos.y + 1.8 + Math.sin(t * 2.4) * 0.4;
      };
      break;
    }
    case "wolf": case "croc": case "snake": case "worm": case "scorpion": {
      const long = kind === "croc" || kind === "snake" || kind === "worm";
      body = mk(long ? 1.6 : 1.0, 0.7, 0.4, mMat, 0, long ? 0.5 : 0.7, 0);
      const head = mk(0.5, 0.45, 0.45, dMat, long ? 1.0 : 0.55, long ? 0.6 : 1.0, 0);
      sphere(0.12, eye, long ? 1.1 : 0.6, long ? 0.8 : 1.15, 0.2); sphere(0.12, eye, long ? 1.1 : 0.6, long ? 0.8 : 1.15, -0.2);
      const tail = mk(0.18, 0.18, 0.9, dMat, long ? -1.5 : -0.7, 0.4, 0);
      if (kind === "scorpion") {
        const pinc1 = mk(0.4, 0.3, 0.3, dMat, 0.8, 1.0, 0.5);
        const pinc2 = mk(0.4, 0.3, 0.3, dMat, 0.8, 1.0, -0.5);
        const stinger = sphere(0.25, eye, 0, 0.8, 0);
        stinger.position.set(0.9, 1.7, 0);
        g.add(stinger);
      }
      legs = [mk(0.12, 0.4, 0.12, dMat, 0.5, 0.2, 0.35), mk(0.12, 0.4, 0.12, dMat, 0.5, 0.2, -0.35), mk(0.12, 0.4, 0.12, dMat, -0.5, 0.2, 0.35), mk(0.12, 0.4, 0.12, dMat, -0.5, 0.2, -0.35)];
      g.add(head, tail, ...legs);
      anim = (e, m, t, dt, walk) => {
        const sp = walk ? 9 : 0.4;
        legs.forEach((l, i) => { l.rotation.x = Math.sin(t * sp + i * 1.7) * (walk ? 0.6 : 0); });
        if (kind === "snake" || kind === "worm") {
          m.rotation.z = Math.sin(t * 3) * 0.12;
          m.position.y = e.pos.y + Math.sin(t * 3) * 0.15;
        }
      };
      break;
    }
    case "humanoid": case "skeleton": case "yeti": case "demon": case "imp": case "golem": case "treant": {
      const colMat = kind === "skeleton" ? new THREE.MeshStandardMaterial({ color: 0xd7ccc8, roughness: 0.9 }) : mMat;
      const lMat = kind === "yeti" ? new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 1 }) : colMat;
      const h = kind === "yeti" || kind === "golem" || kind === "treant" ? 1.2 : 0.8;
      const torso = mk(0.5, h, 0.36, colMat, 0, 1.1, 0);
      const headM = sphere(0.22, colMat, 0, 1.1 + h * 0.6, 0);
      sphere(0.09, eye, -0.09, 1.1 + h * 0.6, 0.18); sphere(0.09, eye, 0.09, 1.1 + h * 0.6, 0.18);
      for (const s of [-1, 1]) {
        const arm = mk(0.16, 0.9, 0.16, colMat, 0.4 * s, 1.0, 0);
        const leg = mk(0.2, 0.7, 0.22, colMat, 0.2 * s, 0.35, 0);
        g.add(arm, leg);
        arm.name = "arm_" + s; leg.name = "leg_" + s;
        if (s === 1) armR = arm;
      }
      if (kind === "demon") {
        sphere(0.28, dMat, 0, 0, 0).position.set(-0.2, 1.1 + h * 0.6 + 0.22, 0); sphere(0.28, dMat, 0, 0, 0).position.set(0.2, 1.1 + h * 0.6 + 0.22, 0);
        body = torso;
        mk(0.5, 0.4, 0.4, mMat, 0, 0.4, 0.2).name = "tailStack";
      }
      if (kind === "golem") { torso.scale.set(1.3, 1.2, 1.3); headM.material = dMat; }
      if (kind === "treant") { torso.scale.set(1.4, 1.4, 1.4); torso.material = new THREE.MeshStandardMaterial({ color: 0x4e7a3a, roughness: 1 }); headM.material = dMat; }
      body = torso;
      legs = g.children.filter(c => c.name && c.name.startsWith("leg"));
      anim = (e, m, t, dt, walk) => {
        const sp = walk ? 9 : 0.4;
        const legParts = g.children.filter(c => c.name === "leg_1" || c.name === "leg_-1");
        legParts.forEach((l, i) => { l.rotation.x = Math.sin(t * sp + i * Math.PI) * (walk ? 0.7 : 0); });
        if (armR) armR.rotation.x = Math.sin(t * sp) * (walk ? 0.4 : 0);
        if (kind === "imp") { m.position.y = e.pos.y + 0.6 + Math.sin(t * 4) * 0.25; }
        if (kind === "treant") { m.position.y = e.pos.y + Math.sin(t * 1.4) * 0.12; }
      };
      break;
    }
    default: {
      body = sphere(0.6, mMat, 0, 0.8, 0);
      anim = (e, m, t, dt, walk) => { m.rotation.y = e.yaw + Math.sin(t * 2) * 0.2; };
    }
  }

  g.scale.setScalar(scale);
  g.userData.anim = anim;
  g.userData.armR = armR;
  g.userData.body = body;
  g.userData.legs = legs;
  if (g.position.y === undefined) g.position.y = -1.4;
  return g;
}

function M4COPY(hex, f) {
  const c = new THREE.Color(hex); return c.multiplyScalar(f); }

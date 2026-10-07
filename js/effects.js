/* ============================================================
   effects.js — particles, projectile trails, impact FX and
   floating damage numbers (DOM overlay).
   ============================================================ */
const Effects = {
  scene: null, camera: null, container: null,
  particles: null, MAX: 2200, count: 0, cursor: 0,
  pos: null, vel: null, col: null, sizeA: null, life: null, maxLife: null, grav: null,
  projectiles: [],   // {mesh, vel, dmg, from:'player'|'enemy', element, life, hitR, pierce, ...}
  meshes: [],        // transient FX meshes (arcs, rings, bolts)
  dmgEls: [],

  init(scene, camera, container) {
    this.scene = scene; this.camera = camera; this.container = container;
    const N = this.MAX;
    this.pos = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.sizeA = new Float32Array(N);
    this.life = new Float32Array(N);
    this.maxLife = new Float32Array(N);
    this.grav = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.particles = new THREE.Points(geo, mat);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  },

  _next() {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.MAX;
    return i;
  },

  // ajuste "Partículas": desactiva el humo decorativo (no los proyectiles)
  _fxOn() {
    try { return !Save.data || Save.data.settings.fx !== false; }
    catch (e) { return true; }
  },

  spawnParticle(p, opts) {
    opts = opts || {};
    const i = this._next();
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    const v = opts.vel || { x: 0, y: 0, z: 0 };
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    const c = opts.color || 0xffffff;
    this.col[i * 3] = ((c >> 16) & 255) / 255;
    this.col[i * 3 + 1] = ((c >> 8) & 255) / 255;
    this.col[i * 3 + 2] = (c & 255) / 255;
    this.sizeA[i] = opts.size || 0.6;
    this.life[i] = this.maxLife[i] = opts.life || 0.6;
    this.grav[i] = opts.grav || 0;
    this.count++;
  },

  burst(p, color, n, opts) {
    if (!this._fxOn()) return;
    opts = opts || {};
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI;
      const sp = Utils.rand(opts.speedMin ?? 5, opts.speedMax ?? 12);
      this.spawnParticle(p, {
        vel: { x: Math.sin(b) * Math.cos(a) * sp, y: (Math.random() - 0.2) * sp * 0.9 + (opts.up || 2), z: Math.sin(b) * Math.sin(a) * sp },
        color: color, size: opts.size, life: opts.life, grav: opts.grav || 9,
      });
    }
  },

  // ---------- typed FX ----------
  hitSpark(p, color, dir) {
    if (!this._fxOn()) return;
    for (let i = 0; i < 7; i++) {
      const a = 2 * Math.PI * Math.random();
      this.spawnParticle(p, {
        vel: dir ? { x: -dir.x * (3 + Math.random() * 4) + Math.cos(a) * 4, y: Math.abs(Math.sin(a * 2)) * 4, z: -dir.z * (3 + Math.random() * 4) + Math.sin(a) * 4 }
          : { x: Math.cos(a) * 4, y: 3 + Math.random() * 3, z: Math.sin(a) * 4 },
        color: color, size: 0.7, life: 0.4, grav: 10,
      });
    }
  },

  slashArc(p, dir, color, size, dur) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: color || 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const arc = new THREE.Mesh(new THREE.RingGeometry(size * 0.7, size, 24, 1, -Math.PI * 0.45, Math.PI * 0.9), mat);
    arc.rotation.y = Math.PI / 2;
    arc.rotation.z = Math.PI * 0.25;
    g.add(arc);
    g.position.copy(p);
    const up = new THREE.Vector3(0, 1, 0);
    const f = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f);
    g.rotateOnAxis(up, Math.PI / 2);
    this.scene.add(g);
    const t = dur || 0.22;
    g.userData = { life: t, max: t, type: "arc", yaw: 0 };
    this.meshes.push(g);
  },

  shockwave(p, color, size, dur) {
    if (!this._fxOn()) return;
    const geo = new THREE.RingGeometry(0.4, 1, 32);
    const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(p); m.position.y += 0.3;
    m.rotation.x = -Math.PI / 2;
    const t = dur || 0.5;
    m.userData = { life: t, max: t, type: "ring", size: size, grow: true };
    this.scene.add(m);
    this.meshes.push(m);
  },

  bolt(from, to, color) {
    const n = 7;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = new THREE.Vector3().lerpVectors(from, to, t);
      if (i > 0 && i < n) { p.x += (Math.random() - 0.5) * 1.2; p.y += (Math.random() - 0.5) * 1.2; p.z += (Math.random() - 0.5) * 1.2; }
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 1 });
    const m = new THREE.Line(geo, mat);
    this.scene.add(m);
    const t = 0.18;
    m.userData = { life: t, max: t, type: "line" };
    this.meshes.push(m);
  },

  pillar(p, color, height, radius, dur) {
    const geo = new THREE.CylinderGeometry(radius, radius * 1.4, height, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(p); m.position.y += height / 2 - 0.5;
    const t = dur || 0.6;
    m.userData = { life: t, max: t, type: "pillar" };
    this.scene.add(m);
    this.meshes.push(m);
  },

  glowyOrbTrail(p, color) {
    if (!this._fxOn()) return;
    this.spawnParticle(p, { vel: { x: 0, y: -1, z: 0 }, color: color, size: 0.5, life: 0.25, grav: 0 });
  },

  dashTrail(pp, dir, color) {
    if (!this._fxOn()) return;
    if (Math.random() > 0.5) return;
    this.spawnParticle(pp, { vel: { x: -dir.x * 2, y: 0, z: -dir.z * 2 }, color: color || 0x9fd8ff, size: 1.0, life: 0.35, grav: 0 });
  },

  // ---------- damage numbers ----------
  damageNumber(p, amount, opts) {
    opts = opts || {};
    const el = document.createElement("div");
    el.className = "dmg-num " + (opts.crit ? "crit" : "") + (opts.heal ? "heal" : "") + (opts.miss ? "miss" : "");
    if (typeof amount === "string") el.textContent = amount.trim();
    else el.textContent = opts.miss ? "FALLO" : (opts.heal ? "+" + Math.round(amount) : "-" + Math.round(amount));
    if (opts.element === "ice") el.textContent = "\u2744 " + el.textContent;
    if (opts.element === "fire") el.textContent = "\uD83D\uDD25 " + el.textContent;
    if (opts.element === "holy") el.textContent = "\u2726 " + el.textContent;
    el.style.color = opts.color || (opts.heal ? "#5fe08a" : opts.element === "ice" ? "#8fd8ff" : opts.element === "fire" ? "#ff9a5a" : "#ffffff");
    this.container.appendChild(el);
    const item = { el: el, life: 1.1, t: 0, p: p.clone() };
    el.style.left = "0px"; el.style.top = "0px";
    this._project(el, p);
    this.dmgEls.push(item);
    if (this.dmgEls.length > 40) { const q = this.dmgEls.shift(); if (q.el.parentNode) q.el.parentNode.removeChild(q.el); }
  },

  _project(el, p, extraY) {
    const v = p.clone().project(this.camera);
    const x = (v.x * 0.5 + 0.5) * this.container.clientWidth;
    const y = (-v.y * 0.5 + 0.5) * this.container.clientHeight - (extraY || 0);
    const depth = (1 + v.z);
    el.style.opacity = 1;
    el.style.transform = "translate(" + x + "px," + y + "px) translate(-50%,-50%) scale(" + Math.min(1.6, Math.max(0.6, 3 - depth)) + ")";
  },

  /* ---------- projectiles ---------- */
  shoot(from, dir, opts) {
    opts = opts || {};
    const col = opts.color || 0xffb040;
    const sp = opts.speed || 30;
    let m;
    if (opts.kind === "arrow") {
      m = this._arrow(col);
      m.position.copy(from);
      m.lookAt(from.x + dir.x, from.y + dir.y, from.z + dir.z);
    } else {
      const size = opts.size || 0.35;
      const geo = new THREE.SphereGeometry(size, 8, 6);
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending });
      m = new THREE.Mesh(geo, mat);
      m.position.copy(from);
      const trail = new THREE.Mesh(geo.clone(), mat.clone());
      trail.scale.multiplyScalar(1.5);
      m.add(trail);
    }
    this.scene.add(m);
    const life = (opts.range || 60) / sp;
    this.projectiles.push({
      mesh: m, vel: new THREE.Vector3(dir.x, dir.y, dir.z).normalize().multiplyScalar(sp),
      dmg: opts.dmg, from: opts.from || "player", element: opts.element || "fire",
      kind: opts.kind,
      life: life, max: life, hitR: opts.hitR || 1.1, pierce: opts.pierce || 0,
      knock: opts.knock || 0, explode: opts.explode || 0, explodeR: opts.explodeR || 3.5,
      owner: opts.owner, onHit: opts.onHit,
    });
    return this.projectiles[this.projectiles.length - 1];
  },

  /* flecha física (arquero): geometría alineada a +Z, sin brillo */
  _arrow(col) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xcfd4dc, metalness: 0.7, roughness: 0.35 });
    const feather = new THREE.MeshStandardMaterial({ color: col || 0xfff2d0, roughness: 1, side: THREE.DoubleSide });
    const shaftGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.72, 5);
    shaftGeo.rotateX(Math.PI / 2);
    g.add(new THREE.Mesh(shaftGeo, wood));
    const headGeo = new THREE.ConeGeometry(0.055, 0.16, 5);
    headGeo.rotateX(Math.PI / 2);
    const head = new THREE.Mesh(headGeo, steel);
    head.position.z = 0.44;
    g.add(head);
    const finGeo = new THREE.BoxGeometry(0.012, 0.1, 0.17);
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.z = i * Math.PI * 2 / 3;
      const fin = new THREE.Mesh(finGeo, feather);
      fin.position.set(0, 0.05, -0.26);
      pivot.add(fin);
      g.add(pivot);
    }
    return g;
  },

  _disposeProjectile(m) {
    if (m.isGroup) {
      m.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    } else {
      m.geometry.dispose();
      m.material.dispose();
    }
  },

  // ---------- transient FX update ----------
  update(dt, game) {
    // particles
    const arr = this.particles.geometry.attributes.position.array;
    for (let i = 0; i < this.MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt - this.grav[i] * 0.5 * dt * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.material.opacity = 1;
    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      if (pr.life <= 0) { this.scene.remove(pr.mesh); this._disposeProjectile(pr.mesh); this.projectiles.splice(i, 1); continue; }
      pr.mesh.position.addScaledVector(pr.vel, dt);
      if (pr.kind === "arrow") {
        pr.mesh.lookAt(pr.mesh.position.x + pr.vel.x, pr.mesh.position.y + pr.vel.y, pr.mesh.position.z + pr.vel.z);
      } else {
        this.glowyOrbTrail(pr.mesh.position, pr.element === "fire" ? 0xff8a30 : pr.element === "ice" ? 0x80d8ff : pr.element === "holy" ? 0xffe66a : 0x90c8ff);
      }
      let hit = false;
      const enemies = game.enemyDirector ? game.enemyDirector.getNear(pr.mesh.position, 12) : [];
      if (pr.from === "player") {
        for (const e of enemies) {
          if (e.dead) continue;
          if (Utils.dist2(e.pos.x, e.pos.z, pr.mesh.position.x, pr.mesh.position.z) < Math.pow(e.radius + pr.hitR, 2)) {
            const dmg = game.dealDamageTo(e, { flat: pr.dmg, element: pr.element, from: "player", knock: pr.knock });
            this.hitSpark(pr.mesh.position, 0xffddaa);
            if (pr.explode) { this.shockwave(pr.mesh.position, 0xff7a30, pr.explodeR, 0.45); const targets = game.enemyDirector.getNear(pr.mesh.position, pr.explodeR); for (const t2 of targets) if (t2 !== e && !t2.dead) game.dealDamageTo(t2, { flat: pr.dmg * 0.7, from: "player", element: pr.element, knock: pr.knock }); }
            hit = true;
            break;
          }
        }
      } else if (pr.from === "enemy") {
        const ppos = game.player.pos;
        const dx = ppos.x - pr.mesh.position.x, dz = ppos.z - pr.mesh.position.z;
        const dy = (ppos.y + 1.0) - pr.mesh.position.y;
        const hd2 = dx * dx + dz * dz;
        const reach = 0.9 + pr.hitR;
        let h = hd2 < reach * reach && Math.abs(dy) < 1.8;
        if (!h && pr.explode && hd2 < pr.explodeR * pr.explodeR && Math.abs(dy) < 4) h = true;
        if (h) {
          game.dealPlayerDamage(pr.dmg, { magic: pr.element === "ice" || pr.element === "fire", source: pr.owner });
          this.hitSpark(pr.mesh.position, 0xffcc66);
          if (pr.explode) this.shockwave(pr.mesh.position, 0xff7a30, pr.explodeR, 0.45);
          hit = true;
        }
      }
      if (hit) { this.scene.remove(pr.mesh); this._disposeProjectile(pr.mesh); this.projectiles.splice(i, 1); }
    }
    // FX meshes
    for (let i = this.meshes.length - 1; i >= 0; i--) {
      const m = this.meshes[i];
      m.userData.life -= dt;
      const t = m.userData.life / m.userData.max;
      const fade = m.userData.grow ? t * 0.9 : t;
      if (m.userData.grow) m.scale.setScalar((1 - t) * m.userData.size);
      if (m.material) {
        m.material.opacity = fade;
      } else if (m.children) {
        for (const c of m.children) if (c.material) c.material.opacity = fade;
      }
      if (m.userData.life <= 0) {
        this.scene.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
        this.meshes.splice(i, 1);
      }
    }
    // damage numbers
    for (let i = this.dmgEls.length - 1; i >= 0; i--) {
      const d = this.dmgEls[i];
      d.t += dt;
      const k = d.life - d.t;
      if (k <= 0) { if (d.el.parentNode) d.el.parentNode.removeChild(d.el); this.dmgEls.splice(i, 1); continue; }
      d.el.style.opacity = Math.min(1, k / 0.4);
      d.p.y += dt * 1.6;
      this._project(d.el, d.p, d.t * 26);
    }
  },
};
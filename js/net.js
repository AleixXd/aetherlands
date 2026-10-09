/* ============================================================
   net.js — multijugador en tiempo real (ligero)
   Jugadores remotos vía Supabase Realtime: canal público con
   broadcast efímero (sin tablas, sin RLS). Cada cliente emite
   su posición a ~5 Hz y el resto interpola. Todo es opcional:
   si la red falla, el juego sigue igual en solitario.
   Params de URL: ?bot=1 (cliente de prueba que patrulla la
   plaza) · ?nomulti=1 (desactiva la red)
   Requiere: CFG, THREE, Utils, GLBCache, Save.
   ============================================================ */
const Net = {
  TOPIC: "realtime:aetherlands",
  HZ: 5,            // envíos por segundo
  TIMEOUT: 7000,    // ms sin noticias → el remoto desaparece
  MAX: 24,          // tope de jugadores simultáneos en pantalla
  TICK_MS: 200,     // cadencia del emisor (1000/HZ)

  state: "off",     // off | connecting | on | error
  players: new Map(), // id → remoto { id, name, cls, lvl, r, pos, tgt, ... }
  id: null,
  ws: null,
  _ref: 0,
  _joined: false,
  _retry: 0,
  _retryTimer: null,
  _tickTimer: null,
  _hbTicks: 0,
  _lastPos: null,
  _bot: false,
  _botName: "",
  _off: false,
  _botA: 0,

  /* ---------------- utilidades ---------------- */
  enabled() {
    return !this._off && !!(CFG.CLOUD && CFG.CLOUD.URL && CFG.CLOUD.ANON) &&
      typeof WebSocket !== "undefined";
  },

  _id() {
    const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    for (let i = 0; i < 8; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  },

  _frame(event, data) {
    return { topic: this.TOPIC, event: "broadcast", payload: { type: "broadcast", event: event, payload: data }, ref: String(++this._ref) };
  },

  _sendRaw(obj) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false; // OPEN (nunca send en CONNECTING: lanza)
    try { ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  },

  _send(event, data) { return this._sendRaw(this._frame(event, data)); },

  _regionKey() {
    if (typeof Game === "undefined" || !Game.region) return "overworld";
    if (Game.region === "castle") return "castle:" + (typeof Castle !== "undefined" ? (Castle.floor || 0) : 0);
    if (Game.region === "cave") {
      const d = Game.regionData;
      return "cave:" + (d && (d.id || d.name) || "");
    }
    return Game.region;
  },

  _myName() {
    try {
      const pl = Save.data.player;
      if (!pl.name) {
        pl.name = "Aventurero-" + Math.random().toString(36).slice(2, 6);
        Save.save();
      }
      return pl.name;
    } catch (e) { return "Héroe"; }
  },

  /* ---------------- arranque ---------------- */
  boot() {
    if (!this.enabled()) return;
    if (!this.id) this.id = this._id();

    if (this._bot) {
      // segundo cliente de prueba: nombre fijo y entrada automática
      try {
        if (Save.data) Save.data.player.name = this._botName || "Jugador de prueba";
        setTimeout(() => {
          try {
            if (typeof Game === "undefined" || !Game.menuMode) return;
            if (!Save.data.player.classId) Game.chooseClass("warrior");
            else Game.enterWorld();
          } catch (e) { console.warn("[Net] bot:", e.message); }
        }, 800);
      } catch (e) {}
    }

    this.connect();
    if (!this._tickTimer) this._tickTimer = setInterval(() => this._tick(), this.TICK_MS);
    addEventListener("pagehide", () => this.shutdown());
    addEventListener("beforeunload", () => this.shutdown());
  },

  shutdown() {
    this._send("bye", { id: this.id });
    try { if (this.ws) this.ws.close(); } catch (e) {}
  },

  /* ---------------- conexión ---------------- */
  connect() {
    if (!this.enabled() || this.state === "on" || this.state === "connecting") return;
    this.state = "connecting";
    try {
      const base = CFG.CLOUD.URL.replace("https://", "wss://").replace("http://", "ws://");
      const url = base + "/realtime/v1/websocket?apikey=" + encodeURIComponent(CFG.CLOUD.ANON) + "&vsn=1.0.0";
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => { try { this._join(); } catch (e) {} };
      ws.onmessage = (ev) => { try { this._onMessage(ev); } catch (e) { console.warn("[Net] msg:", e.message); } };
      ws.onerror = () => {};
      ws.onclose = () => this._onClose();
    } catch (e) {
      this.state = "error";
      this._scheduleRetry();
    }
  },

  _join() {
    this._joined = false;
    this._sendRaw({ topic: this.TOPIC, event: "phx_join", payload: { config: { broadcast: { ack: false, self: false } } }, ref: String(++this._ref) });
  },

  _onMessage(ev) {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (!m || typeof m !== "object" || !m.event) return;
    if (m.topic === "phoenix") return; // eco de heartbeat
    if (m.event === "phx_reply") {
      const st = m.payload && m.payload.status;
      if (m.topic === this.TOPIC && st === "ok" && !this._joined) {
        this._joined = true;
        this.state = "on";
        this._retry = 0;
        console.log("[Net] conectado (" + this.id + ")");
      } else if (st === "error") {
        this.state = "error";
        console.warn("[Net] canal rechazado:", JSON.stringify(m.payload.response || {}));
      }
      return;
    }
    if (m.event === "phx_close" || m.event === "phx_error") {
      this._joined = false;
      this.state = "off";
      return;
    }
    if (m.event === "broadcast") {
      const p = m.payload;
      if (!p || p.type !== "broadcast") return;
      if (p.event === "upd") this._upd(p.payload);
      else if (p.event === "bye" && p.payload) this._drop(p.payload.id);
    }
  },

  _onClose() {
    const was = this.state;
    this.ws = null;
    this._joined = false;
    this.state = "off";
    for (const id of Array.from(this.players.keys())) this._drop(id);
    if (was !== "error") this._scheduleRetry();
  },

  _scheduleRetry() {
    if (!this.enabled() || this._retryTimer) return;
    const wait = Math.min(30000, 4000 * Math.pow(1.7, this._retry++));
    this._retryTimer = setTimeout(() => { this._retryTimer = null; this.connect(); }, wait);
  },

  /* ---------------- emisión (intervalo propio, no depende de rAF) ---------------- */
  _tick() {
    try {
      if (typeof Game === "undefined" || !Game.player) return;
      if (this._bot && !Game.menuMode) this._botStep(this.TICK_MS / 1000);
      if (++this._hbTicks >= 125) {
        this._hbTicks = 0;
        this._sendRaw({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++this._ref) });
      }
      if (Game.menuMode || !this._joined) return;
      const pl = Save.data.player;
      const p = Game.player.pos;
      const lp = this._lastPos;
      const mv = !lp || Math.abs(p.x - lp.x) + Math.abs(p.z - lp.z) > 0.06;
      this._lastPos = { x: p.x, z: p.z };
      this._send("upd", {
        id: this.id,
        n: this._myName(),
        c: pl.classId || "warrior",
        l: pl.level || 1,
        r: this._regionKey(),
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        z: Math.round(p.z * 100) / 100,
        a: Math.round((Game.player.faceAimYaw || 0) * 100) / 100,
        m: mv ? 1 : 0
      });
    } catch (e) {}
  },

  /* ---------------- bot de prueba: patrulla circular por la plaza ---------------- */
  _botStep(dt) {
    this._botA = (this._botA + dt * 0.5) % (Math.PI * 2);
    const a = this._botA, R = 13;
    const x = Math.sin(a) * R, z = Math.cos(a) * R;
    const yaw = Math.atan2(Math.cos(a), -Math.sin(a));
    const pl = Game.player;
    pl.pos.x = x;
    pl.pos.z = z;
    pl.yaw = yaw;
    pl.faceAimYaw = yaw;
    if (pl.model) { pl.model.rotation.y = yaw; pl.model.position.x = x; pl.model.position.z = z; }
  },

  /* ---------------- recepción ---------------- */
  _upd(d) {
    if (!d || !d.id || d.id === this.id) return;
    let p = this.players.get(d.id);
    if (!p) {
      if (this.players.size >= this.MAX) return;
      p = {
        id: d.id, name: d.n || "Jugador", cls: d.c || "warrior", lvl: d.l || 1,
        r: d.r || "overworld", pos: new THREE.Vector3(), tgt: new THREE.Vector3(),
        yaw: 0, yawT: 0, sp: 0, mv: false, init: false, seen: 0,
        g: null, mixer: null, clips: null, cur: null, dead: false
      };
      this.players.set(d.id, p);
      this._build(p);
    }
    if (d.n) p.name = d.n;
    if (d.c) p.cls = d.c;
    if (d.l) p.lvl = d.l;
    if (d.r) p.r = d.r;
    p.mv = !!d.m;
    p.seen = performance.now();
    const tx = +d.x || 0, ty = +d.y || 0, tz = +d.z || 0;
    if (!p.init) { p.pos.set(tx, ty, tz); p.tgt.set(tx, ty, tz); p.init = true; }
    else {
      const step = Math.hypot(tx - p.tgt.x, tz - p.tgt.z);
      p.sp = p.sp * 0.6 + (step * this.HZ) * 0.4;
      p.tgt.set(tx, ty, tz);
    }
    p.yawT = +d.a || 0;
  },

  _drop(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.dead = true;
    try {
      if (p.mixer) p.mixer.stopAllAction();
      if (p.g && p.g.parent) p.g.parent.remove(p.g);
    } catch (e) {}
    this.players.delete(id);
  },

  /* ---------------- avatar remoto (GLB clonado + animación) ---------------- */
  _build(p) {
    const g = new THREE.Group();
    g.position.copy(p.pos);
    g.visible = false;
    if (typeof Game !== "undefined" && Game.scene) Game.scene.add(g);
    p.g = g;
    const map = { warrior: "knight", mage: "mage", rogue: "rogue", paladin: "knight" };
    const file = map[p.cls] || "knight";
    GLBCache.instance("models/" + file + ".glb").then((entry) => {
      if (!entry || p.dead || !p.g) return;
      const root = entry.root;
      root.scale.setScalar(1);
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const s = 1.85 / ((box.max.y - box.min.y) || 1.7);
      root.scale.setScalar(s);
      root.position.y = -box.min.y * s;
      root.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; }
      });
      while (p.g.children.length) p.g.remove(p.g.children[0]);
      p.g.add(root);
      p.mixer = new THREE.AnimationMixer(root);
      p.clips = {};
      for (const c of entry.animations) p.clips[c.name] = c;
      p.cur = null;
      this._play(p, "Idle", 0);
      const idle = p.clips["Idle"];
      if (idle && p.mixer.setTime) p.mixer.setTime(Math.random() * (idle.duration || 1));
    });
  },

  _play(p, name, fade) {
    if (!p.mixer || !p.clips || !p.clips[name] || p.cur === name) return;
    const next = p.mixer.clipAction(p.clips[name]);
    next.enabled = true;
    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    if (p.cur && p.clips[p.cur]) p.mixer.clipAction(p.clips[p.cur]).fadeOut(fade);
    next.fadeIn(fade).play();
    p.cur = name;
  },

  /* ---------------- bucle de render: interpolación ---------------- */
  update(dt) {
    if (!this.players.size) return;
    const now = performance.now();
    for (const p of Array.from(this.players.values())) {
      if (now - p.seen > this.TIMEOUT) { this._drop(p.id); continue; }
      if (!p.init) continue;
      const d = p.pos.distanceTo(p.tgt);
      if (d > 18) p.pos.copy(p.tgt);              // salto/teleport: sin perseguir
      else p.pos.lerp(p.tgt, 1 - Math.exp(-11 * dt));
      p.yaw = Utils.dampAngle(p.yaw, p.yawT, 13, dt);
      if (!p.g) continue;
      p.g.visible = (p.r === this._regionKey());
      p.g.position.copy(p.pos);
      p.g.rotation.y = p.yaw;
      if (p.mixer) {
        let want = "Idle";
        if (p.mv && p.sp > 0.4) want = p.sp > 6.6 ? "Running_A" : "Walking_A";
        this._play(p, p.clips && p.clips[want] ? want : "Idle", 0.2);
        p.mixer.update(dt);
      }
    }
  },

  /* ---------------- nameplates de jugadores remotos ---------------- */
  plates() {
    const out = [];
    if (!this.players.size) return out;
    const rk = this._regionKey();
    for (const p of this.players.values()) {
      if (p.r !== rk || !p.init) continue;
      out.push({ x: p.pos.x, y: p.pos.y + 2.5, z: p.pos.z, label: p.name, sub: "Nv " + (p.lvl || 1), pl: true });
    }
    return out;
  }
};

/* params de URL: se leen al cargar (antes de Game.init) */
(function () {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("nomulti") === "1") Net._off = true;
    if (q.get("bot") !== null && typeof Save !== "undefined") {
      Net._bot = true;
      Net._botName = q.get("name") || "Jugador de prueba";
      Save.key = CFG.SAVE_KEY + "_bot"; // el bot no pisa la partida real
    }
  } catch (e) {}
})();

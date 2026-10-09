/* ============================================================
   ui.js — HUD, paneles, toasts, misiones, minimapa, nameplates
   y sistema de interacción con data-act. DOM real de index.html.
   ============================================================ */
const UI = {
  game: null,
  els: {},
  refCount: 0,
  paused: false,          // pause overlay visible
  menuOpen: false,        // menú principal visible
  showingStats: false,
  showingQuests: false,
  deathVisible: false,
  panelId: null,          // panel abierto (pausa el juego)
  toastPool: [],
  questLogDirty: true,
  _npEls: [],
  _shopCtx: null,         // {kind:'shop'|'mounts'|'trade'|'quests', npc}
  _lastHint: "",
  _delArmed: false,
  _accArm: null,

  $(id) { return document.getElementById(id); },

  init(game) {
    this.game = game;
    if (typeof game !== "object" || !game.scene) return;
    this.els = {
      hud: this.$("hud"),
      minimap: this.$("minimap"),
      toastBox: this.$("toastbox"),
      hint: this.$("interact-hint"),
      hintText: this.$("interact-text"),
      nameplates: this.$("nameplates"),
      questPanel: this.$("questlog-panel"),
      questBody: this.$("questlog-body"),
      statsPanel: this.$("stats-panel"),
      statsBody: this.$("stats-body"),
      statName: this.$("stat-name"),
      shopPanel: this.$("shop-panel"),
      shopTitle: this.$("shop-title-text"),
      shopBody: this.$("shop-body"),
      gachaPanel: this.$("gacha-panel"),
      gachaBody: this.$("gacha-body"),
      pvpPanel: this.$("pvp-panel"),
      pvpBody: this.$("pvp-body"),
      settingsPanel: this.$("settings-panel"),
      settingsBody: this.$("settings-body"),
      deathPanel: this.$("death-panel"),
      pausePanel: this.$("pause-panel"),
      classSelect: this.$("class-select"),
      classCards: this.$("class-cards"),
      stamWarn: this.$("stam-warn"),
      mainMenu: this.$("mainmenu"),
      menuPlaySub: this.$("menu-play-sub"),
      menuLoadBtn: this.$("menu-load"),
      controlsPanel: this.$("controls-panel"),
      controlsBody: this.$("controls-body"),
      loadPanel: this.$("load-panel"),
      loadBody: this.$("load-body"),
      loadDelBtn: this.$("load-del-btn"),
      accountPanel: this.$("account-panel"),
      accountBody: this.$("account-body"),
      quitScreen: this.$("quit-screen"),
    };
    this._cloneHud();
    this._bindActions();
    this.refreshHUD();
    document.body.classList.add("ready");
  },

  _cloneHud() {
    const tpl = this.$("hud-tpl");
    const hud = this.els.hud;
    if (!tpl || !hud) return;
    hud.innerHTML = tpl.innerHTML;
    this.els.hpFill = this.$("hp-fill");
    this.els.hpNum = this.$("hp-num");
    this.els.stamFill = this.$("stam-fill");
    this.els.stamNum = this.$("stam-num");
    this.els.xpFill = this.$("xp-fill");
    this.els.xpNum = this.$("xp-num");
    this.els.gold = this.$("gold-res");
    this.els.crystals = this.$("crystal-res");
    this.els.lvl = this.$("lvl-res");
  },

  /* ---------- acciones globales (data-act) ---------- */
  _bindActions() {
    document.addEventListener("click", (e) => {
      const t = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
      if (!t) return;
      const act = t.dataset.act;
      const ds = t.dataset;
      if (act === "close-stats" || act === "close-quests" || act === "close-shop" ||
          act === "close-gacha" || act === "close-pvp" || act === "close-settings") { this.closePanels(); }
      else if (act === "close-controls") this.hideControls();
      else if (act === "close-load") this.hideLoad();
      else if (act === "menu-play") this._menuPlay();
      else if (act === "menu-load") this.showLoad();
      else if (act === "menu-account") this.showAccount();
      else if (act === "close-account") this.hideAccount();
      else if (act === "acc-login") this._accAuth(false);
      else if (act === "acc-signup") this._accAuth(true);
      else if (act === "acc-up") this._accUp();
      else if (act === "acc-down") this._accDown();
      else if (act === "acc-out") this._accOut();
      else if (act === "menu-settings") this.openSettings();
      else if (act === "menu-controls") this.showControls();
      else if (act === "menu-quit") this.showQuit();
      else if (act === "quit-back") this.hideQuit();
      else if (act === "quit-reload") location.reload();
      else if (act === "load-do") this._loadDo();
      else if (act === "load-del") this._loadDel();
      else if (act === "controls") this.showControls();
      else if (act === "menu") this.backToMenu();
      else if (act === "class-back") this.backToMenu();
      else if (act === "stats") this.toggleStats();
      else if (act === "quests") this.toggleQuestLog();
      else if (act === "respawn") this.game._respawn();
      else if (act === "resume") { this.togglePause(false); if (typeof Input !== "undefined") Input.requestLock(); }
      else if (act === "restart") { this.game.restart(); this.togglePause(false); }
      else if (act === "export") { Save.exportFile(); this.notify("Guardado exportado.", "good"); }
      else if (act === "settings") this.openSettings();
      else if (act === "set-toggle") { Settings.set(ds.key, !Settings.s[ds.key]); this.renderSettings(); }
      else if (act === "set-quality") { Settings.set("quality", ds.v); this.renderSettings(); }
      else if (act === "set-reset") { Settings.reset(); this.renderSettings(); this.notify("Ajustes restaurados.", "good"); }
      else if (act === "pick-class") this.game.chooseClass(ds.cls);
      else if (act === "alloc") { this.game.player.allocateStat(ds.stat); this.renderStatsPanel(); }
      else if (act === "claim-quest") this._claimQuest(ds.id);
      else if (act === "accept-quest") { QuestManager.start(ds.id); this._renderShopCtx(); }
      else if (act === "buy") this._buy(ds.id);
      else if (act === "sell") this._sell(ds.uid);
      else if (act === "gacha-spin") this._spin();
      else if (act === "mount-buy") this._buyMount(ds.id);
      else if (act === "mount-equip") this._equipMount(ds.id);
      this.game.sfx && this.game.sfx.click();
    });
  },

  /* ---------- toasts ---------- */
  notify(text, kind) {
    if (!this.els.toastBox) return;
    const el = document.createElement("div");
    el.className = "toast " + (kind || "info");
    el.textContent = text;
    this.els.toastBox.appendChild(el);
    const pool = this.toastPool;
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); const i = pool.indexOf(el); if (i >= 0) pool.splice(i, 1); }, 300);
    }, 2800);
    while (this.els.toastBox.children.length > 5) this.els.toastBox.removeChild(this.els.toastBox.firstChild);
  },

  /* ---------- HUD ---------- */
  refreshHUD() {
    const game = this.game;
    if (!game || !game.player) return;
    const p = game.player;
    const st = p.stats ? p.stats() : { maxHp: 100, maxStam: 100 };
    const pl = Save.data.player;
    const xpNeed = CFG.XP_FOR_LEVEL(pl.level);
    this._fill(this.els.hpFill, p.hp, st.maxHp);
    this._fill(this.els.stamFill, p.stam, st.maxStam);
    this._fill(this.els.xpFill, pl.xp, xpNeed);
    if (this.els.hpNum) this.els.hpNum.textContent = Math.max(0, Math.ceil(p.hp)) + "/" + st.maxHp;
    if (this.els.stamNum) this.els.stamNum.textContent = Math.max(0, Math.ceil(p.stam)) + "/" + st.maxStam;
    if (this.els.xpNum) this.els.xpNum.textContent = Math.floor(pl.xp) + "/" + xpNeed;
    if (this.els.lvl) this.els.lvl.textContent = "Nv " + (pl.level || 1);
    if (this.els.gold) this.els.gold.textContent = "\u269B" + Utils.fmt(pl.gold || 0);
    if (this.els.crystals) this.els.crystals.textContent = "\u2726" + Utils.fmt(pl.crystals || 0);
    if (this.els.stamWarn) this.els.stamWarn.classList.toggle("on", p.stam < 12);
    this.refCount++;
  },

  _fill(el, v, max) {
    if (!el) return;
    const pct = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
    el.style.width = (pct * 100).toFixed(1) + "%";
  },

  /* ---------- minimapa: caché de terreno (se reconstruye al moverse >32 m) ---------- */
  buildMinimapTerrain(px, pz) {
    const R = 240, rad = 77, RC = R + 48, scale = rad / R;
    const size = Math.ceil(2 * RC * scale) + 4;
    let cv = this._mmTerrain;
    if (!cv) { cv = document.createElement("canvas"); this._mmTerrain = cv; }
    if (cv.width !== size) { cv.width = size; cv.height = size; }
    const g = cv.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, size, size);
    const half = size / 2, cell = 10, n = Math.ceil(2 * RC / cell);
    const WL = CFG.WORLD.WATER_LEVEL;
    const hard = [[0, 0, 180, "#b09a68"], [0, -96, 30, "#8a8fa0"]];
    const P = World.POIS;
    for (const v of (P.villages || [])) hard.push([v.x, v.z, 60, "#a58f5e"]);
    for (const b of (P.bosses || [])) hard.push([b.x, b.z, 60, "#8f7a4e"]);
    for (const c of (P.caves || [])) hard.push([c.x, c.z, 45, "#544c36"]);
    for (let ix = 0; ix < n; ix++) {
      for (let iz = 0; iz < n; iz++) {
        const wx = px - RC + (ix + 0.5) * cell, wz = pz - RC + (iz + 0.5) * cell;
        const dx = wx - px, dz = wz - pz;
        if (dx * dx + dz * dz > RC * RC) continue;
        let col = null;
        for (let i = 0; i < hard.length; i++) {
          const h = hard[i], hx = wx - h[0], hz = wz - h[1];
          if (hx * hx + hz * hz < h[2] * h[2]) { col = h[3]; break; }
        }
        if (!col) col = World.heightAt(wx, wz) < WL ? "#2e6fa9" : (World.biomeAt(wx, wz).color || "#6da94c");
        g.fillStyle = col;
        const s = Math.ceil(cell * scale) + 1;
        g.fillRect(half + (wx - px) * scale - cell * scale / 2, half + (wz - pz) * scale - cell * scale / 2, s, s);
      }
    }
    this._mmTerrC = { x: px, z: pz };
  },

  /* ---------- minimap (≈4 Hz desde el bucle) ---------- */
  drawMinimap() {
    const mm = (this.els && this.els.minimap) || null;
    const game = this.game;
    if (!mm || !game || !game.player || !game.player.pos) return;
    let ctx = null;
    try { ctx = mm.getContext("2d"); } catch (e) { return; }
    if (!ctx) return;
    const W = mm.width || 156, H = mm.height || 156;
    const cx = W / 2, cy = H / 2, rad = Math.min(cx, cy) - 1;
    const R = 240;
    const p = game.player.pos;
    try {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "rgba(8,12,20,0.9)";
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.clip();
      // terreno de fondo (caché mundial, centrada en el jugador)
      const need = !this._mmTerrC || Math.abs(p.x - this._mmTerrC.x) > 32 || Math.abs(p.z - this._mmTerrC.z) > 32;
      if (need && World && World.heightAt) this.buildMinimapTerrain(p.x, p.z);
      if (this._mmTerrain && this._mmTerrC) {
        const sc = rad / R;
        ctx.drawImage(this._mmTerrain,
          cx - this._mmTerrain.width / 2 + (this._mmTerrC.x - p.x) * sc,
          cy - this._mmTerrain.height / 2 + (this._mmTerrC.z - p.z) * sc);
      }
      const dot = (wx, wz, color, r) => {
        if (wx === undefined || wz === undefined) return;
        const dx = (wx - p.x) / R * rad, dz = (wz - p.z) / R * rad;
        if (dx * dx + dz * dz > rad * rad) return;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(cx + dx, cy + dz, r, 0, Math.PI * 2); ctx.fill();
      };
      const POIS = (typeof World !== "undefined" && World.POIS) ? World.POIS : null;
      if (POIS) {
        if (POIS.town) dot(POIS.town.x, POIS.town.z, "#ffffff", 3);
        if (POIS.castle) dot(POIS.castle.x, POIS.castle.z, "#ff5252", 3);
        for (const v of (POIS.villages || [])) dot(v.x, v.z, "#ffd060", 2);
        for (const b of (POIS.bosses || [])) dot(b.x, b.z, "#ff8a3c", 2);
        for (const c of (POIS.caves || [])) dot(c.x, c.z, "#4dd0e1", 2);
      }
      const ed = game.enemyDirector;
      if (ed && ed.active) {
        const n = Math.min(ed.active.length, 80);
        for (let i = 0; i < n; i++) {
          const e = ed.active[i];
          if (e && e.pos) dot(e.pos.x, e.pos.z, "#ff1744", 1.6);
        }
      }
      const yaw = game.player.yaw || 0;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(yaw) * 6, cy + Math.cos(yaw) * 6);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "rgba(160,180,220,0.6)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
    } catch (e) { /* el minimapa nunca rompe el frame */ }
  },

  refreshQuestLog() { this.questLogDirty = true; if (this.showingQuests) this.renderQuestLog(); },

  /* ---------- paneles ---------- */
  openPanel(id) {
    this.closePanels(true);
    const el = this.$(id);
    if (!el) return;
    el.classList.remove("hidden");
    this.panelId = id;
    this.game.paused = true;
    if (typeof Input !== "undefined") Input.exitLock();
    this.game.sfx && this.game.sfx.open();
    this.refreshHUD();
  },

  closePanels(keepPaused) {
    for (const id of ["stats-panel", "questlog-panel", "shop-panel", "gacha-panel", "pvp-panel", "settings-panel"]) {
      const el = this.$(id);
      if (el) el.classList.add("hidden");
    }
    this.showingStats = false;
    this.showingQuests = false;
    this.panelId = null;
    this._shopCtx = null;
    if (!keepPaused) this.game.paused = this.paused || this.menuOpen;
  },

  panelOpen() {
    if (this.panelId !== null || this.deathVisible) return true;
    if (this.els.classSelect && !this.els.classSelect.classList.contains("hidden")) return true;
    if (this.menuOpen) return true;
    if (this.els.controlsPanel && !this.els.controlsPanel.classList.contains("hidden")) return true;
    if (this.els.loadPanel && !this.els.loadPanel.classList.contains("hidden")) return true;
    if (this.els.accountPanel && !this.els.accountPanel.classList.contains("hidden")) return true;
    if (this.els.quitScreen && !this.els.quitScreen.classList.contains("hidden")) return true;
    return false;
  },

  overlayOpen() { return this.panelOpen() || this.paused; },

  closeTop() {
    if (this.deathVisible) return;                       // la muerte se responde con REAPARECER
    if (this.els.controlsPanel && !this.els.controlsPanel.classList.contains("hidden")) { this.hideControls(); return; }
    if (this.els.loadPanel && !this.els.loadPanel.classList.contains("hidden")) { this.hideLoad(); return; }
    if (this.els.accountPanel && !this.els.accountPanel.classList.contains("hidden")) { this.hideAccount(); return; }
    if (this.els.quitScreen && !this.els.quitScreen.classList.contains("hidden")) { this.hideQuit(); return; }
    if (this.panelId) { this.closePanels(); return; }
    if (this.showingStats) { this.toggleStats(false); return; }
    if (this.showingQuests) { this.toggleQuestLog(false); return; }
    if (this.menuOpen) return;                            // el menú principal no se cierra con Esc
    if (this.els.classSelect && !this.els.classSelect.classList.contains("hidden")) { this.backToMenu(); return; }
    this.togglePause();
  },

  /* ---------- ajustes ---------- */
  openSettings() {
    this.openPanel("settings-panel");
    this.renderSettings();
  },

  renderSettings() {
    const el = this.els.settingsBody;
    if (!el || typeof Settings === "undefined") return;
    const s = Settings.s;
    const tog = (key, label) => {
      const on = !!s[key];
      return '<div class="setrow"><span>' + label + '</span>' +
        '<button data-act="set-toggle" data-key="' + key + '" class="setbtn ' + (on ? "on" : "off") + '">' +
        (on ? "Sí" : "No") + "</button></div>";
    };
    const rng = (key, label, min, max, step) => {
      const v = key === "vol" ? Math.round((s.vol || 0) * 100) : Math.round((s.sens || 1) * 100);
      return '<div class="setrow"><span>' + label + '</span>' +
        '<input type="range" data-key="' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '">' +
        '<b data-lbl="' + key + '">' + v + "%</b></div>";
    };
    const qbtn = (v, label) =>
      '<button data-act="set-quality" data-v="' + v + '" class="setbtn' + (s.quality === v ? " on" : "") + '">' + label + "</button>";
    el.innerHTML =
      tog("sound", "Sonido") +
      rng("vol", "Volumen", 0, 100, 5) +
      rng("sens", "Sensibilidad del ratón", 30, 200, 10) +
      '<div class="setrow"><span>Calidad gráfica</span><div class="setbtns">' +
        qbtn("low", "Baja") + qbtn("med", "Media") + qbtn("high", "Alta") + "</div></div>" +
      tog("shadows", "Sombras") +
      tog("fx", "Partículas") +
      '<div class="row-gap" style="margin-top:14px">' +
        '<button data-act="set-reset" class="btn-big btn-alt set-reset">RESTAURAR</button>' +
      "</div>" +
      '<div class="hint">Los cambios se aplican y se guardan al instante.</div>';
    el.querySelectorAll("input[type=range]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const key = inp.dataset.key;
        const val = parseFloat(inp.value);
        Settings.set(key, key === "vol" ? val / 100 : val);
        const lbl = el.querySelector('[data-lbl="' + key + '"]');
        if (lbl) lbl.textContent = Math.round(val) + "%";
      });
    });
  },

  /* ---------- stats ---------- */
  toggleStats(force) {
    if (this.menuOpen) return;
    const show = force !== undefined ? force : !this.showingStats;
    if (show) {
      this.openPanel("stats-panel");
      this.showingStats = true;
      this.renderStatsPanel();
    } else this.closePanels();
  },

  openStats() { this.toggleStats(true); },

  renderStatsPanel() {
    const el = this.els.statsBody;
    if (!el) return;
    const pl = Save.data.player;
    const P = this.game.player;
    const st = P.stats();
    el.innerHTML = "";
    if (this.els.statName) this.els.statName.textContent = P.classDef.name + " " + P.classDef.icon;
    const mk = (label, v, sub) => {
      const row = document.createElement("div");
      row.className = "statrow";
      row.innerHTML = "<span>" + label + "</span><b>" + v + "</b>" + (sub ? "<small>" + sub + "</small>" : "");
      el.appendChild(row);
    };
    mk("Nivel", pl.level);
    mk("Experiencia", Math.floor(pl.xp) + " / " + CFG.XP_FOR_LEVEL(pl.level));
    mk("Vida", Math.ceil(P.hp) + " / " + st.maxHp);
    mk("Resistencia", Math.ceil(P.stam) + " / " + st.maxStam);
    mk("Oro", Utils.fmt(pl.gold));
    mk("Cristales", Utils.fmt(pl.crystals));
    mk("Ataque", st.atk);
    mk("Defensa", st.def);
    mk("Magia", st.matk);
    mk("Res. mágica", st.mdef);
    mk("Velocidad", st.move.toFixed(1));
    mk("Crítico", (st.crit * 100).toFixed(1) + "%");
    mk("Clase", P.classDef.name);
    const w = st.weapon;
    mk("Arma", w ? w.name : "—");
    if (pl.statPoints > 0) {
      const hint = document.createElement("div");
      hint.className = "stat-points";
      hint.textContent = "Puntos de atributo: " + pl.statPoints;
      el.appendChild(hint);
      const addStatRow = (stat, label) => {
        const row = document.createElement("div");
        row.className = "statrow";
        row.innerHTML = "<span>" + label + "</span><b>" + pl.baseStats[stat] + "</b>";
        const btn = document.createElement("button");
        btn.dataset.act = "alloc";
        btn.dataset.stat = stat;
        btn.textContent = "+";
        row.appendChild(btn);
        el.appendChild(row);
      };
      addStatRow("str", "Fuerza");
      addStatRow("agi", "Agilidad");
      addStatRow("vit", "Vitalidad");
      addStatRow("mag", "Magia");
      addStatRow("spr", "Espíritu");
    }
    const info = document.createElement("div");
    info.className = "hint";
    info.textContent = "Misiones: L · Atributos: Tab · Poción: 5/H · Montura: M · Pausa: Esc.";
    el.appendChild(info);
  },

  saveStats() { this.closePanels(); },

  /* ---------- pausa / muerte ---------- */
  togglePause(force) {
    const show = force !== undefined ? force : !this.paused;
    if (show && this.menuOpen) return;                    // nunca pausa encima del menú principal
    this.paused = show;
    if (this.els.pausePanel) this.els.pausePanel.classList.toggle("hidden", !show);
    if (show) { this.closePanels(true); this.game.paused = true; if (typeof Input !== "undefined") Input.exitLock(); }
    else if (!this.panelId && !this.deathVisible) this.game.paused = false;
  },

  showDeath() {
    this.deathVisible = true;
    if (this.els.deathPanel) this.els.deathPanel.classList.remove("hidden");
    if (typeof Input !== "undefined") Input.exitLock();
    const pl = Save.data.player;
    const lost = Math.floor(pl.gold * CFG.GOLD.DEATH_TAX);
    const reason = this.$("death-reason");
    if (reason) reason.textContent = "Pierdes " + Utils.fmt(lost) + " de oro. El pueblo te espera.";
    this.closePanels(true);
    this.togglePause(false);
    this.game.paused = false;
  },

  hideDeath() {
    this.deathVisible = false;
    if (this.els.deathPanel) this.els.deathPanel.classList.add("hidden");
    if (typeof Input !== "undefined") Input.requestLock();
  },

  /* ---------- selección de clase ---------- */
  showClassSelect() {
    const box = this.els.classCards;
    if (!box) return;
    box.innerHTML = "";
    for (const id in CLASSES) {
      const c = CLASSES[id];
      const card = document.createElement("div");
      card.className = "class-card";
      card.dataset.act = "pick-class";
      card.dataset.cls = id;
      card.innerHTML = "<div class='ico'>" + c.icon + "</div><h3>" + c.name + "</h3><p>" + c.desc + "</p>" +
        "<div class='skills'>" + c.skills.map(s => s.name).join(" · ") + "</div>";
      box.appendChild(card);
    }
    if (this.els.classSelect) this.els.classSelect.classList.remove("hidden");
    this.game.paused = true;
  },

  hideClassSelect() {
    if (this.els.classSelect) this.els.classSelect.classList.add("hidden");
    this.game.paused = this.menuOpen;
  },

  /* ---------- menú principal ---------- */
  showMainMenu() {
    this.menuOpen = true;
    if (typeof Input !== "undefined") Input.exitLock();
    this.closePanels(true);
    this.togglePause(false);
    this.hideControls(); this.hideLoad(); this.hideQuit();
    this.refreshMenu();
    if (this.els.mainMenu) this.els.mainMenu.classList.remove("hidden");
    document.body.classList.add("in-menu");
    if (this.game) { this.game.menuMode = true; this.game.paused = true; }
  },

  hideMainMenu() {
    this.menuOpen = false;
    if (this.els.mainMenu) this.els.mainMenu.classList.add("hidden");
    document.body.classList.remove("in-menu");
  },

  refreshMenu() {
    const sub = this.els.menuPlaySub, lb = this.els.menuLoadBtn;
    const has = Save.exists();
    if (sub) {
      if (has && Save.data && Save.data.player.classId) {
        const cls = CLASSES[Save.data.player.classId];
        sub.textContent = "Continuar · " + (cls ? cls.name : "héroe") + " Nv " + (Save.data.player.level || 1);
      } else if (has) sub.textContent = "Nueva partida · elige tu clase";
      else sub.textContent = "Nueva partida · elige tu clase";
    }
    if (lb) lb.disabled = !has;
  },

  _menuPlay() {
    Save.init(false);                    // sincroniza con el guardado local
    this.hideMainMenu();
    if (this.game) {
      this.game._spawnInitial();
      if (Save.data.player.classId) this.game.enterWorld();
      else this.showClassSelect();
    }
  },

  backToMenu() {
    this.hideControls(); this.hideLoad(); this.hideQuit();
    this.closePanels(true);
    if (this.els.classSelect) this.els.classSelect.classList.add("hidden");
    this.togglePause(false);
    if (typeof Input !== "undefined") Input.exitLock();
    if (this.game) {
      // si estabas en cueva/aguja, vuelve al mundo exterior junto al pueblo
      if (this.game.region && this.game.region !== "overworld") {
        this.game.enterRegion("overworld");
        const s = Save.data.spawn || { x: 0, z: 60 };
        this.game.player.pos.set(s.x, this.game.groundHeight(s.x, s.z) + 0.6, s.z);
        this.game.player.vel.set(0, 0, 0);
      }
      Save.save();
    }
    this.showMainMenu();
  },

  /* ---------- controles ---------- */
  showControls() {
    const b = this.els.controlsBody;
    if (b && !b._built) {
      const list = [
        ["Clic en el mundo", "Capturar el ratón para mirar (Esc libera y pausa)"],
        ["WASD / flechas", "Moverse respecto a la cámara"],
        ["Espacio", "Saltar"],
        ["Shift", "Dash (esquivar corto, gasta resistencia)"],
        ["X", "Andar despacio"],
        ["Clic izquierdo", "Atacar con el arma"],
        ["Clic derecho / Q", "Bloquear (gasta resistencia)"],
        ["1 · 2 · 3", "Habilidades de clase"],
        ["5 / H", "Poción de vida"],
        ["E", "Interactuar (NPCs, cofres, portales…)"],
        ["Tab", "Estadísticas y atributos"],
        ["L", "Registro de misiones"],
        ["Esc / P", "Pausa (y cerrar paneles)"],
        ["M", "Montar / desmontar"],
      ];
      let html = "<div class='ctl-grid'>";
      for (const r of list) html += "<div class='ctl-row'><kbd>" + r[0] + "</kbd><span>" + r[1] + "</span></div>";
      b.innerHTML = html + "</div>";
      b._built = true;
    }
    if (this.els.controlsPanel) this.els.controlsPanel.classList.remove("hidden");
    if (typeof Input !== "undefined") Input.exitLock();
  },

  hideControls() {
    if (this.els.controlsPanel) this.els.controlsPanel.classList.add("hidden");
  },

  /* ---------- cargar partida ---------- */
  showLoad() {
    this._delArmed = false;
    if (this.els.loadDelBtn) { this.els.loadDelBtn.textContent = "BORRAR GUARDADO"; this.els.loadDelBtn.disabled = !Save.exists(); }
    this.renderLoadBody();
    if (this.els.loadPanel) this.els.loadPanel.classList.remove("hidden");
    if (typeof Input !== "undefined") Input.exitLock();
  },

  hideLoad() {
    this._delArmed = false;
    if (this.els.loadPanel) this.els.loadPanel.classList.add("hidden");
  },

  /* ---------- cuenta y guardado en la nube ---------- */
  showAccount() {
    this._accArm = null;
    this.renderAccount();
    if (this.els.accountPanel) this.els.accountPanel.classList.remove("hidden");
    if (typeof Input !== "undefined") Input.exitLock();
  },

  hideAccount() {
    this._accArm = null;
    if (this.els.accountPanel) this.els.accountPanel.classList.add("hidden");
  },

  renderAccount() {
    const el = this.els.accountBody;
    if (!el) return;
    if (typeof CloudSave === "undefined" || !CloudSave.enabled()) {
      el.innerHTML = "<div class='load-empty'>Guardado en la nube no disponible.</div>";
      return;
    }
    const s = CloudSave.session || CloudSave._load();
    if (!s) {
      el.innerHTML =
        "<div class='load-empty'>Inicia sesión para jugar desde cualquier equipo.<br>La partida se sube sola mientras juegas.</div>" +
        "<div class='acc-form'>" +
        "<input id='acc-email' type='email' placeholder='Correo electrónico' autocomplete='email'>" +
        "<input id='acc-pass' type='password' placeholder='Contraseña (mínimo 6 caracteres)'>" +
        "</div>" +
        "<div class='load-actions'>" +
        "<button data-act='acc-login' class='btn-big primary'>INICIAR SESIÓN</button>" +
        "<button data-act='acc-signup' class='btn-big btn-alt'>CREAR CUENTA</button>" +
        "</div>";
    } else {
      const upTxt = this._accArm === "up" ? "¿SEGURO? SUSTITUIR LA NUBE" : "SUBIR PARTIDA";
      const downTxt = this._accArm === "down" ? "¿SEGURO? SUSTITUIR LA LOCAL" : "CARGAR PARTIDA DE LA NUBE";
      el.innerHTML =
        "<div class='acc-session'>Sesión iniciada: <b>" + s.email + "</b></div>" +
        "<div class='acc-form'>" +
        "<button data-act='acc-up' class='btn-big primary'>" + upTxt + "</button>" +
        "<button data-act='acc-down' class='btn-big btn-alt'>" + downTxt + "</button>" +
        "<button data-act='acc-out' class='btn-big btn-ghost'>CERRAR SESIÓN</button>" +
        "</div>";
    }
  },

  async _accAuth(signup) {
    const emEl = document.getElementById("acc-email"), pwEl = document.getElementById("acc-pass");
    const em = emEl ? emEl.value.trim() : "", pw = pwEl ? pwEl.value : "";
    if (!em || !pw) { this.notify("Correo y contraseña obligatorios.", "warn"); return; }
    try {
      if (signup) await CloudSave.signup(em, pw);
      else await CloudSave.login(em, pw);
      this.notify(signup ? "¡Cuenta creada! Sesión iniciada." : "Sesión iniciada.", "good");
      try {
        const cloud = await CloudSave.download();
        if (cloud && cloud.saveAt) this.notify("Hay una partida en la nube (" + new Date(cloud.saveAt).toLocaleString("es-ES") + "). Puedes cargarla con CARGAR PARTIDA DE LA NUBE.", "info");
      } catch (e) {}
      this._accArm = null;
      this.renderAccount();
    } catch (e) { this.notify(e.message, "warn"); }
  },

  async _accUp() {
    if (this._accArm !== "up") {
      this._accArm = "up";
      this.renderAccount();
      this.notify("Pulsa otra vez para sustituir la partida de la nube.", "warn");
      setTimeout(() => { if (this._accArm === "up") { this._accArm = null; this.renderAccount(); } }, 4000);
      return;
    }
    this._accArm = null;
    try {
      await CloudSave.upload(Save.exportJSON());
      this.notify("Partida subida a la nube.", "good");
    } catch (e) { this.notify("No se pudo subir: " + e.message, "warn"); }
    this.renderAccount();
  },

  async _accDown() {
    if (this._accArm !== "down") {
      this._accArm = "down";
      this.renderAccount();
      this.notify("Pulsa otra vez para sustituir tu partida local.", "warn");
      setTimeout(() => { if (this._accArm === "down") { this._accArm = null; this.renderAccount(); } }, 4000);
      return;
    }
    this._accArm = null;
    try {
      const cloud = await CloudSave.download();
      if (!cloud) { this.notify("No hay ninguna partida en la nube.", "warn"); this.renderAccount(); return; }
      if (!Save.importJSON(JSON.stringify(cloud.data))) { this.notify("La partida de la nube está dañada.", "warn"); this.renderAccount(); return; }
      this.notify("Partida cargada de la nube. Recargando...", "good");
      setTimeout(() => location.reload(), 900);
    } catch (e) { this.notify("No se pudo cargar: " + e.message, "warn"); this.renderAccount(); }
  },

  async _accOut() {
    try { await CloudSave.logout(); } catch (e) {}
    this.notify("Sesión cerrada.", "info");
    this._accArm = null;
    this.renderAccount();
  },

  _fmtDur(sec) {
    sec = Math.floor(sec || 0);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    if (h > 0) return h + " h " + m + " min";
    if (m > 0) return m + " min " + (sec % 60) + " s";
    return sec + " s";
  },

  renderLoadBody() {
    const el = this.els.loadBody;
    if (!el) return;
    const doBtn = document.querySelector('[data-act="load-do"]');
    if (!Save.exists()) {
      el.innerHTML = "<div class='load-empty'>No hay ninguna partida guardada en este navegador.</div>";
      if (doBtn) doBtn.disabled = true;
      if (this.els.loadDelBtn) this.els.loadDelBtn.disabled = true;
      return;
    }
    if (doBtn) doBtn.disabled = false;
    if (this.els.loadDelBtn) this.els.loadDelBtn.disabled = false;
    const p = Save.data.player, st = Save.data.stats || {}, w = Save.data.world || {}, q = Save.data.quests || {};
    const cls = p.classId && CLASSES[p.classId] ? CLASSES[p.classId] : null;
    const row = (k, v) => "<div class='load-row'><span>" + k + "</span><b>" + v + "</b></div>";
    el.innerHTML = "<div class='load-info'>" +
      row("Clase", cls ? cls.icon + " " + cls.name : "—") +
      row("Nivel", (p.level || 1)) +
      row("Oro", Utils.fmt(p.gold || 0) + " ⚻ · " + Utils.fmt(p.crystals || 0) + " ✦") +
      row("Tiempo de juego", this._fmtDur(st.playTime)) +
      row("Jefes derrotados", (w.bossesDefeated || []).length + " / 6") +
      row("Misiones completadas", (q.completed || []).length) +
      row("Muertes", st.deaths || 0) +
      row("Última sesión", new Date(Save.data.updatedAt || Date.now()).toLocaleString("es-ES")) +
      "</div>";
  },

  _loadDo() {
    if (!Save.exists()) { this.notify("No hay ninguna partida guardada.", "warn"); return; }
    Save.init(false);
    this.hideLoad();
    this.hideMainMenu();
    this.game._spawnInitial();
    this.game.enterWorld();
    this.refreshHUD();
    this.notify("Partida cargada. ¡Bienvenido de nuevo!", "good");
    this.game.sfx && this.game.sfx.levelup();
  },

  _loadDel() {
    if (!Save.exists()) return;
    if (!this._delArmed) {
      this._delArmed = true;
      if (this.els.loadDelBtn) this.els.loadDelBtn.textContent = "¿SEGURO? PULSA OTRA VEZ";
      setTimeout(() => {
        if (this._delArmed) {
          this._delArmed = false;
          if (this.els.loadDelBtn) this.els.loadDelBtn.textContent = "BORRAR GUARDADO";
        }
      }, 4000);
      return;
    }
    Save.wipe();
    Save.init(false);
    this._delArmed = false;
    if (this.els.loadDelBtn) this.els.loadDelBtn.textContent = "BORRAR GUARDADO";
    this.renderLoadBody();
    this.refreshMenu();
    if (this.game && this.game._spawnInitial) this.game._spawnInitial();
    this.notify("Guardado borrado.", "info");
  },

  /* ---------- salir ---------- */
  showQuit() {
    if (this.els.quitScreen) this.els.quitScreen.classList.remove("hidden");
    if (typeof Input !== "undefined") Input.exitLock();
  },

  hideQuit() {
    if (this.els.quitScreen) this.els.quitScreen.classList.add("hidden");
  },

  /* ---------- misiones ---------- */
  toggleQuestLog(force) {
    if (this.menuOpen) return;
    const show = force !== undefined ? force : !this.showingQuests;
    if (show) {
      this.openPanel("questlog-panel");
      this.showingQuests = true;
      this.questLogDirty = false;
      this.renderQuestLog();
    } else this.closePanels();
  },

  renderQuestLog() {
    const el = this.els.questBody;
    if (!el) return;
    el.innerHTML = "";
    const active = (Save.data.quests && Save.data.quests.active) || [];
    for (const q of active) el.appendChild(this._questRow(q));
    if (!active.length) {
      const e = document.createElement("div");
      e.className = "empty";
      e.textContent = "Sin misiones activas. Habla con los guardias del pueblo (Alaric, Maren, Kralynn).";
      el.appendChild(e);
    }
    const done = (Save.data.quests && Save.data.quests.completed) || [];
    if (done.length) {
      const h = document.createElement("div");
      h.className = "stat-points";
      h.textContent = "Completadas: " + done.length;
      el.appendChild(h);
    }
  },

  _questRow(q, withAccept) {
    const t = QuestManager.template(q.id) || q;
    const done = QuestManager.checkComplete(q);
    const row = document.createElement("div");
    row.className = "quest-entry" + (q.type === "boss" ? " boss" : "");
    const pct = Math.min(100, (q.progress / Math.max(1, q.count)) * 100);
    row.innerHTML =
      "<h4>" + (done ? "\u2713 " : "") + q.name + "</h4>" +
      "<p style='color:#9ab;font-size:12px;margin-top:4px;'>" + q.desc + "</p>" +
      "<div class='progress'><div class='fill' style='width:" + pct + "%'></div></div>" +
      "<small class='" + (done ? "done" : "") + "'>" + q.progress + " / " + q.count + "</small>" +
      "<small class='reward'>Recompensa: " + (q.reward.gold || 0) + " de oro" +
      ((q.reward.items && q.reward.items.length) ? " + " + q.reward.items.length + " objeto(s)" : "") + "</small>";
    if (done) {
      const btn = document.createElement("button");
      btn.dataset.act = "claim-quest";
      btn.dataset.id = q.id;
      btn.className = "btn-small";
      btn.style.cssText = "background:#3a6b45;margin-left:8px;";
      btn.textContent = "RECLAMAR";
      row.querySelector("h4").appendChild(btn);
    }
    return row;
  },

  _claimQuest(id) {
    const r = QuestManager.claim(id);
    if (r) {
      this.renderQuestLog();
      if (this._shopCtx && this._shopCtx.kind === "quests") this._renderShopCtx();
      this.refreshHUD();
    }
  },

  /* ---------- tienda / gachá / monturas / comercio ---------- */
  openShop(npc) {
    this._shopCtx = { kind: "shop", npc: npc };
    const role = npc.role;
    let title = "TIENDA";
    if (role === "weapons") title = "ARMERÍA";
    else if (role === "armors") title = "HERRERÍA";
    else if (role === "potions") title = "POCIONERÍA";
    if (this.els.shopTitle) this.els.shopTitle.textContent = title + " — " + npc.name;
    this.openPanel("shop-panel");
    this._renderShopCtx();
  },

  openMountShop(npc) {
    this._shopCtx = { kind: "mounts", npc: npc };
    if (this.els.shopTitle) this.els.shopTitle.textContent = "ESTABLOS — " + npc.name;
    this.openPanel("shop-panel");
    this._renderShopCtx();
  },

  openTrade(npc) {
    this._shopCtx = { kind: "trade", npc: npc };
    if (this.els.shopTitle) this.els.shopTitle.textContent = "COMERCIO — " + npc.name;
    this.openPanel("shop-panel");
    this._renderShopCtx();
  },

  openQuestGiver(npc) {
    this._shopCtx = { kind: "quests", npc: npc };
    if (this.els.shopTitle) this.els.shopTitle.textContent = "MISIONES — " + npc.name;
    this.openPanel("shop-panel");
    this._renderShopCtx();
  },

  openPvp() {
    this.openPanel("pvp-panel");
    if (this.els.pvpBody) {
      this.els.pvpBody.innerHTML =
        "<div class='empty'>Arena de duelos: próximamente.</div>" +
        "<p class='hint'>Aquí podrás retar a otros aventureros cuando se active el modo PvP.</p>";
    }
  },

  openGacha() {
    this.openPanel("gacha-panel");
    this._renderGacha();
  },

  _renderShopCtx() {
    const ctx = this._shopCtx;
    const body = this.els.shopBody;
    if (!ctx || !body) return;
    body.innerHTML = "";
    if (ctx.kind === "shop") {
      let stock = [];
      const role = ctx.npc.role;
      if (role === "weapons") stock = SHOPS.weapon.stockFrom(Save.data.player.level);
      else if (role === "armors") stock = Object.keys(ITEM.defs).filter(id => ITEM.defs[id].type === ItemType.ARMOR && ITEM.defs[id].shop);
      else if (role === "potions") stock = ["potion_hp", "potion_hp2", "potion_hp3", "potion_stam", "potion_buff"];
      for (const id of stock) this._itemRow(body, id, "buy");
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "Oro disponible: " + Utils.fmt(Save.data.player.gold);
      body.appendChild(hint);
    } else if (ctx.kind === "mounts") {
      for (const id of Object.keys(ITEM.defs)) {
        const d = ITEM.defs[id];
        if (d.type !== ItemType.MOUNT) continue;
        const owned = Inventory.hasMount(id);
        this._mountRow(body, id, owned);
      }
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "Oro disponible: " + Utils.fmt(Save.data.player.gold) + " · Pulsa M en el mundo para montar/desmontar.";
      body.appendChild(hint);
    } else if (ctx.kind === "trade") {
      let any = false;
      for (const it of Save.data.inventory) {
        if (!Inventory.canSell(Inventory._findIndexByUid(it.uid))) continue;
        any = true;
        this._sellRow(body, it);
      }
      if (!any) {
        const e = document.createElement("div");
        e.className = "empty";
        e.textContent = "No tienes nada que vender.";
        body.appendChild(e);
      }
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "Oro disponible: " + Utils.fmt(Save.data.player.gold);
      body.appendChild(hint);
    } else if (ctx.kind === "quests") {
      const giver = ctx.npc.name;
      const open = QUEST_TEMPLATES.filter(t => t.giver === giver && QuestManager.canStart(t.id));
      const mine = Save.data.quests.active.filter(q => q.giver === giver);
      if (mine.length) {
        const h = document.createElement("div");
        h.className = "stat-points";
        h.textContent = "Tus misiones:";
        body.appendChild(h);
        for (const q of mine) body.appendChild(this._questRow(q));
      }
      if (open.length) {
        const h = document.createElement("div");
        h.className = "stat-points";
        h.textContent = "Disponibles:";
        body.appendChild(h);
        for (const t of open) {
          const row = document.createElement("div");
          row.className = "quest-entry";
          row.innerHTML = "<h4>" + t.name + "</h4><p style='color:#9ab;font-size:12px;margin-top:4px;'>" + t.desc + "</p>" +
            "<small class='reward'>Recompensa: " + (t.reward.gold || 0) + " de oro · Nv " + t.lvl + "</small>";
          const btn = document.createElement("button");
          btn.dataset.act = "accept-quest";
          btn.dataset.id = t.id;
          btn.className = "btn-small";
          btn.style.cssText = "background:#3a6b45;margin-left:8px;";
          btn.textContent = "ACEPTAR";
          row.querySelector("h4").appendChild(btn);
          body.appendChild(row);
        }
      }
      if (!open.length && !mine.length) {
        const e = document.createElement("div");
        e.className = "empty";
        e.textContent = "Sin misiones disponibles ahora mismo.";
        body.appendChild(e);
      }
    }
  },

  _itemRow(body, id, mode) {
    const def = ITEM.defs[id];
    if (!def) return;
    const row = document.createElement("div");
    row.className = "row-item";
    const stats = def.type === ItemType.WEAPON ? ("ATQ " + def.atk + " · MAG " + def.matk)
      : def.type === ItemType.ARMOR ? ("DEF " + def.def + " · MDEF " + def.mdef)
      : def.heal ? ("Cura " + def.heal) : def.stam ? ("Resist. +" + def.stam) : (def.desc || "");
    row.innerHTML = "<span style='font-size:17px'>" + def.icon + "</span>" +
      "<span class='nm'><b style='color:" + (def.color || "#e8ecf8") + "'>" + def.name + "</b><br><small style='color:#7c8db0'>" + stats + "</small></span>" +
      "<span class='price'>" + Utils.fmt(def.cost || 0) + " \u269B</span>";
    const btn = document.createElement("button");
    btn.dataset.act = mode;
    btn.dataset.id = id;
    btn.textContent = "COMPRAR";
    if (Save.data.player.level < (def.lvl || 1)) { btn.disabled = true; btn.textContent = "Nv " + def.lvl; }
    row.appendChild(btn);
    body.appendChild(row);
  },

  _sellRow(body, it) {
    const def = ITEM.defs[it.id];
    if (!def) return;
    const row = document.createElement("div");
    row.className = "row-item";
    const v = Inventory.sellValue(Inventory._findIndexByUid(it.uid));
    row.innerHTML = "<span style='font-size:17px'>" + def.icon + "</span>" +
      "<span class='nm'><b style='color:" + (def.color || "#e8ecf8") + "'>" + def.name + "</b>" +
      (it.count > 1 ? " x" + it.count : "") + "</span>" +
      "<span class='price'>" + v + " \u269B</span>";
    const btn = document.createElement("button");
    btn.dataset.act = "sell";
    btn.dataset.uid = it.uid;
    btn.className = "red";
    btn.textContent = "VENDER";
    row.appendChild(btn);
    body.appendChild(row);
  },

  _mountRow(body, id, owned) {
    const def = ITEM.defs[id];
    const row = document.createElement("div");
    row.className = "row-item";
    const active = Save.data.mounts.active === id;
    row.innerHTML = "<span style='font-size:17px'>" + def.icon + "</span>" +
      "<span class='nm'><b style='color:" + def.color + "'>" + def.name + "</b><br><small style='color:#7c8db0'>Velocidad x" + def.speed.toFixed(2) + "</small></span>" +
      (owned ? "<span class='price'>" + (active ? "ACTIVA" : "En establo") + "</span>" : "<span class='price'>" + Utils.fmt(def.cost) + " \u269B</span>");
    const btn = document.createElement("button");
    if (owned) {
      btn.dataset.act = "mount-equip";
      btn.textContent = active ? "USANDO" : "MONTAR";
      if (active) btn.disabled = true;
    } else {
      btn.dataset.act = "mount-buy";
      btn.dataset.id = id;
      btn.textContent = "COMPRAR";
      if (Save.data.player.gold < def.cost) btn.disabled = true;
    }
    row.appendChild(btn);
    body.appendChild(row);
  },

  _buy(id) {
    const def = ITEM.defs[id];
    if (!def) return;
    const cost = def.cost || 0;
    if (Save.data.player.gold < cost) { this.notify("No tienes suficiente oro.", "warn"); this.game.sfx.error(); return; }
    if (Save.data.player.level < (def.lvl || 1)) { this.notify("Necesitas nivel " + def.lvl + ".", "warn"); return; }
    Save.data.player.gold -= cost;
    const item = Inventory.add(id, 1);
    let msg = "Comprado: " + def.name;
    if (item && (def.type === ItemType.WEAPON || def.type === ItemType.ARMOR)) {
      const idx = Inventory._findIndexByUid(item.uid);
      const r = Inventory.equip(idx);
      if (r.ok) msg = "Equipado: " + def.name;
    }
    this.notify(msg, "good");
    this.game.sfx.coin();
    this.refreshHUD();
    this._renderShopCtx();
    Save.save();
  },

  _sell(uid) {
    const i = Inventory._findIndexByUid(uid);
    if (i < 0 || !Inventory.canSell(i)) return;
    const v = Inventory.sellValue(i);
    const def = ITEM.defs[Inventory.at(i).id];
    Inventory.remove(i);
    this.game.addGold(v);
    this.notify("Vendido " + (def ? def.name : "objeto") + " por " + v + " de oro.", "good");
    this.game.sfx.coin();
    this._renderShopCtx();
  },

  _buyMount(id) {
    const def = ITEM.defs[id];
    if (!def) return;
    if (Save.data.player.gold < def.cost) { this.notify("No tienes suficiente oro.", "warn"); return; }
    Save.data.player.gold -= def.cost;
    Inventory.addMount(id);
    Inventory.setActiveMount(id);
    QuestManager.onEvent("mount");
    this.notify("¡Nueva montura: " + def.name + "!", "good");
    this.game.sfx.chest();
    this.refreshHUD();
    this._renderShopCtx();
    Save.save();
  },

  _equipMount(id) {
    if (!Inventory.hasMount(id)) return;
    Inventory.setActiveMount(id);
    this.notify("Montura activa: " + ITEM.defs[id].name, "info");
    this._renderShopCtx();
  },

  _renderGacha() {
    const body = this.els.gachaBody;
    if (!body) return;
    const g = Save.data.gacha;
    const cost = CFG.GACHA.SPIN_COST;
    body.innerHTML =
      "<div class='gacha-blurb'>El Altar de las Estrellas convierte tu oro en tesoros. " +
      "Cada giro cuesta <b class='pity'>" + cost + " de oro</b>. Cada <b>" + CFG.GACHA.GUARANTEE_EVERY +
      "</b> giros garantizan un objeto <b>épico</b> o superior.</div>" +
      "<div class='gacha-blurb'>Giros: <b>" + g.spins + "</b> · Racha hasta garantía: <b class='pity'>" +
      g.pity + "/" + CFG.GACHA.GUARANTEE_EVERY + "</b></div>" +
      "<div id='gacha-result'></div>";
    const row = document.createElement("div");
    row.className = "row-item";
    row.innerHTML = "<span style='font-size:17px'>\uD83C\uDFB2</span><span class='nm'>Girar el altar</span><span class='price'>" + cost + " \u269B</span>";
    const btn = document.createElement("button");
    btn.dataset.act = "gacha-spin";
    btn.textContent = "GIRAR";
    if (Save.data.player.gold < cost) btn.disabled = true;
    row.appendChild(btn);
    body.appendChild(row);
    if (g.rolls && g.rolls.length) {
      const h = document.createElement("div");
      h.className = "stat-points";
      h.textContent = "Últimos giros:";
      body.appendChild(h);
      for (const r of g.rolls.slice(-6).reverse()) {
        const d = ITEM.defs[r.id];
        if (!d) continue;
        const rr = document.createElement("div");
        rr.className = "row-item";
        rr.innerHTML = "<span style='font-size:15px'>" + d.icon + "</span><span class='nm' style='color:" + (d.color || "#e8ecf8") + "'>" + d.name + "</span><span class='price' style='color:" + TierColors[d.tier] + "'>" + TierNames[d.tier] + "</span>";
        body.appendChild(rr);
      }
    }
  },

  _spin() {
    const cost = CFG.GACHA.SPIN_COST;
    if (Save.data.player.gold < cost) { this.notify("Necesitas " + cost + " de oro para girar.", "warn"); this.game.sfx.error(); return; }
    Save.data.player.gold -= cost;
    const g = Save.data.gacha;
    g.spins++; g.pity++;
    let tier = Utils.roll(CFG.GACHA.RATES);
    if (g.pity >= CFG.GACHA.GUARANTEE_EVERY) { tier = (tier === "legendary") ? tier : "epic"; g.pity = 0; }
    const pool = getGachaPool();
    let cands = pool.filter(p => p.tier === tier);
    if (!cands.length) cands = pool.filter(p => p.tier === "rare");
    const pick = Utils.pick(cands);
    const def = ITEM.defs[pick.defId];
    let name = def.name;
    if (def.type === ItemType.MOUNT) {
      if (!Inventory.hasMount(def.id)) { Inventory.addMount(def.id); QuestManager.onEvent("mount"); }
      name = def.name + " (montura)";
    } else Inventory.add(def.id, 1);
    QuestManager.onEvent("gacha");
    g.rolls.push({ id: def.id, t: Date.now() });
    if (g.rolls.length > 40) g.rolls.shift();
    Save.save();
    this.refreshHUD();
    this.game.sfx.chest();
    this.notify("Gira: " + name + " (" + TierNames[def.tier] + ")", "good");
    this._renderGacha();
    const res = this.$("gacha-result");
    if (res) {
      res.innerHTML = "<div class='row-item' style='border-color:" + TierColors[def.tier] + "'>" +
        "<span style='font-size:20px'>" + def.icon + "</span><span class='nm' style='color:" + def.color + "'>" + name + "</span>" +
        "<span class='price' style='color:" + TierColors[def.tier] + "'>" + TierNames[def.tier] + "</span></div>";
    }
  },

  /* ---------- pista de interacción ---------- */
  updatePrompt(text) {
    const h = this.els.hint;
    if (!h) return;
    if (!text) {
      if (!h.classList.contains("hidden")) h.classList.add("hidden");
      this._lastHint = "";
      return;
    }
    if (text !== this._lastHint) {
      if (this.els.hintText) this.els.hintText.textContent = text;
      this._lastHint = text;
    }
    h.classList.remove("hidden");
  },

  /* ---------- nameplates ---------- */
  updateNameplates() {
    const box = this.els.nameplates;
    if (!box) return;
    let tags = [];
    if (this.game.region === "overworld" && typeof Build !== "undefined" && Build.npcTags) tags = Build.npcTags;
    // jugadores remotos (multijugador): se añaden encima de los tags del mundo
    if (typeof Net !== "undefined" && Net.plates) {
      const pl = Net.plates();
      if (pl.length) tags = tags.concat(pl);
    }
    const show = tags.length > 0;
    while (this._npEls.length < tags.length) {
      const d = document.createElement("div");
      d.className = "nameplate";
      box.appendChild(d);
      this._npEls.push(d);
    }
    // candidatos: NPCs primero (prioridad), luego hitos; cull por distancia
    const cam = this.game.camera;
    const cand = [];
    if (show) {
      for (let i = 0; i < tags.length; i++) {
        const t = tags[i];
        const isNpc = !!t.sub;
        const maxD = isNpc ? 55 : 340;
        const d2 = Utils.dist2(t.x, t.z, cam.position.x, cam.position.z);
        if (d2 > maxD * maxD) continue;
        const v = new THREE.Vector3(t.x, t.y, t.z).project(cam);
        if (v.z > 1 || Math.abs(v.x) > 1.15 || Math.abs(v.y) > 1.15) continue;
        cand.push({ i: i, t: t, x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, d2: d2, p: t.pl ? -1 : (isNpc ? 0 : 1) });
      }
      cand.sort((a, b) => (a.p - b.p) || (a.d2 - b.d2));
    }
    // anti-solape: se colocan hasta 9 y se descartan los que se pisan
    const placed = [];
    const used = new Set();
    for (const c of cand) {
      if (placed.length >= 9) break;
      let ok = true;
      for (const p of placed) {
        if (Math.abs(c.x - p.x) < 190 && Math.abs(c.y - p.y) < 44) { ok = false; break; }
      }
      if (ok) { placed.push(c); used.add(c.i); }
    }
    for (let i = 0; i < this._npEls.length; i++) {
      const el = this._npEls[i];
      const t = tags[i];
      if (!used.has(i) || !t) { el.style.display = "none"; continue; }
      if (el._label !== t.label) {
        el.innerHTML = "<b>" + t.label + "</b>" + (t.sub ? "<small>" + t.sub + "</small>" : "");
        el._label = t.label;
        el.classList.toggle("village", !t.sub);
        el.classList.toggle("player", !!t.pl);
      }
      let x = 0, y = 0;
      for (const p of placed) if (p.i === i) { x = p.x; y = p.y; break; }
      el.style.display = "block";
      el.style.transform = "translate(-50%,-100%) translate(" + x + "px," + y + "px)";
    }
  },
};

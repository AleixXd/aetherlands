/* ============================================================
   save.js — persistence via localStorage + JSON export/import
   ============================================================ */
const Save = {
  key: CFG.SAVE_KEY,
  data: null,

  defaults() {
    return {
      version: CFG.VERSION,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      player: {
        name: "",
        classId: null,
        level: 1,
        xp: 0,
        gold: 50,
        crystals: 0,
        statPoints: 0,
        skillPoints: 0,
        baseStats: { str: 5, agi: 5, vit: 5, mag: 5, spr: 5 },
        pos: { x: 0, y: 40, z: 60 },
        rotation: 0,
        pvpConsent: false,
        pvpKills: 0,
        pvpDeaths: 0,
      },
      equipment: { weapon: -1, armor: -1, helmet: -1, boots: -1, accessory: -1 },
      inventory: [],
      activeSkill: { 1: 0, 2: 0, 3: 0 },
      quests: { active: [], completed: [] },
      gacha: { spins: 0, pity: 0, rolls: [] },
      mounts: { owned: [], active: -1 },
      castle: { highestFloor: 0, cleared: [], floorResets: {}, crowned: false },
      world: { bossesDefeated: [], raids: [], ores: {}, enemiesKilled: 0, chestsOpened: [] },
      mining: { xp: 0 },
      settings: { quality: CFG.QUALITY.DEFAULT, sfx: true, vol: 0.5, sound: true, fx: true, shadows: true, sens: 1 },
      stats: { kills: 0, deaths: 0, damageDealt: 0, playTime: 0, floorsCleared: 0, spikes: 0, deathsTaxGold: 0 },
      tutorialDone: false,
      spawn: { x: 0, z: 60 },
    };
  },

  init(newGame) {
    let raw = null;
    try { raw = localStorage.getItem(this.key); } catch (e) {}
    if (raw && !newGame) {
      try {
        const parsed = JSON.parse(raw);
        this.data = Object.assign(this.defaults(), parsed);
        // ensure nested objects exist after version upgrades
        const def = this.defaults();
        this.data.player.baseStats = Object.assign(def.player.baseStats, this.data.player.baseStats || {});
        this.data.settings = Object.assign(def.settings, this.data.settings || {});
        this.data.stats = Object.assign(def.stats, this.data.stats || {});
        this.data.castle = Object.assign(def.castle, this.data.castle || {});
        this.data.gacha = Object.assign(def.gacha, this.data.gacha || {});
        this.data.mounts = Object.assign(def.mounts, this.data.mounts || {});
        this.data.world = Object.assign(def.world, this.data.world || {});
        this.data.quests = Object.assign(def.quests, this.data.quests || {});
        this.data.equipment = Object.assign(def.equipment, this.data.equipment || {});
        this.data.spawn = Object.assign(def.spawn, this.data.spawn || {});
        return true;
      } catch (e) { console.warn("Corrupted save", e); }
    }
    this.data = this.defaults();
    return false;
  },

  exists() {
    try { return localStorage.getItem(this.key) !== null; } catch (e) { return false; }
  },

  save() {
    if (!this.data) return;
    this.data.updatedAt = Date.now();
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) {}
    if (typeof CloudSave !== "undefined") CloudSave.scheduleUpload();
  },

  wipe() {
    try { localStorage.removeItem(this.key); } catch (e) {}
    this.data = null;
  },

  exportJSON() {
    this.save();
    return JSON.stringify(this.data, null, 2);
  },

  importJSON(json) {
    try {
      const obj = JSON.parse(json);
      if (!obj || !obj.player) return false;
      this.data = Object.assign(this.defaults(), obj);
      this.save();
      return true;
    } catch (e) { return false; }
  },

  exportFile() {
    const blob = new Blob([this.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ael-save.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};
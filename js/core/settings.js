/* ============================================================
   settings.js — ajustes del juego (audio, gráfica, cámara)
   Se aplican al instante y se guardan en Save.data.settings.
   ============================================================ */
const Settings = {
  PRESETS: {
    low:  { pr: 1.0, chunks: 3, shadow: 512,  bloom: false, ssao: false },
    med:  { pr: 1.5, chunks: 5, shadow: 2048, bloom: true,  ssao: false },
    high: { pr: 2.0, chunks: 5, shadow: 4096, bloom: true,  ssao: true },
  },

  get s() { return Save.data ? Save.data.settings : Save.defaults().settings; },

  set(key, value) {
    if (!Save.data) return;
    const s = Save.data.settings;
    if (key === "vol") value = Utils.clamp(Number(value) || 0, 0, 1);
    else if (key === "sens") value = Utils.clamp(Number(value) || 1, 0.3, 2);
    else if (key === "quality") { if (!this.PRESETS[value]) return; }
    s[key] = value;
    Save.save();
    this.apply();
  },

  reset() {
    if (!Save.data) return;
    Save.data.settings = Save.defaults().settings;
    Save.save();
    this.apply();
  },

  apply() {
    if (!Save.data) return;
    const s = Save.data.settings;
    if (typeof Sfx !== "undefined") Sfx.setVol(s.sound ? s.vol : 0);
    this.applyGraphics();
  },

  applyGraphics() {
    if (!Save.data) return;
    const s = Save.data.settings;
    const q = this.PRESETS[s.quality] || this.PRESETS.high;
    const G = (typeof Game !== "undefined") ? Game : null;
    if (!G || !G.renderer) return;
    try {
      G.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pr));
      const on = s.shadows !== false;
      if (G.renderer.shadowMap.enabled !== on) {
        G.renderer.shadowMap.enabled = on;
        G.scene.traverse(o => {
          if (!o.material) return;
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of ms) m.needsUpdate = true;
        });
      }
      if (World && World.sun && World.sun.shadow) {
        if (World.sun.shadow.mapSize.x !== q.shadow) {
          World.sun.shadow.mapSize.set(q.shadow, q.shadow);
          if (World.sun.shadow.map) {
            World.sun.shadow.map.dispose();
            World.sun.shadow.map = null;
          }
        }
      }
      if (typeof PostFX !== "undefined" && PostFX.setQuality) PostFX.setQuality(q);
      if (CFG.WORLD.VIEW_CHUNKS !== q.chunks) {
        CFG.WORLD.VIEW_CHUNKS = q.chunks;
        World.lastChunkKey = null;
        if (G.player && G.player.pos) World.updateChunks(G.player.pos.x, G.player.pos.z);
      }
    } catch (e) { console.warn("Settings.applyGraphics", e); }
  },
};

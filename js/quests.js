/* ============================================================
   quests.js — active/completed quest tracking, progress events,
   rewards and the in-world quest board.
   ============================================================ */
const QuestManager = {
  get active() { return Save.data.quests.active; },
  get completedList() { return Save.data.quests.completed; },

  template(id) { return QUEST_TEMPLATES.find(q => q.id === id); },

  canStart(id) {
    const t = this.template(id);
    if (!t) return false;
    if (Save.data.player.level < t.lvl) return false;
    if (this.active.some(q => q.id === id)) return false;
    if (this.completedList.includes(id)) return false;
    if (this.active.length >= 8) { Game.notify("No puedes llevar más misiones (máx. 8).", "warn"); return false; }
    return true;
  },

  start(id) {
    if (!this.canStart(id)) return;
    const t = this.template(id);
    this.active.push({
      id, name: t.name, giver: t.giver, type: t.type, target: t.target, count: t.count,
      progress: 0, desc: t.desc, lvl: t.lvl, reward: t.reward, startedAt: Date.now(),
    });
    Save.save();
    Game.notify("Misión iniciada: " + t.name, "good");
    Game.sfx.open();
  },

  abandon(id) {
    const i = this.active.findIndex(q => q.id === id);
    if (i >= 0) { this.active.splice(i, 1); Save.save(); }
  },

  _progress(type, target, amount) {
    for (const q of this.active) {
      if (q.type !== type || q.target !== target) continue;
      q.progress = Math.min(q.count, q.progress + (amount || 1));
      Game.ui.refreshQuestLog && Game.ui.refreshQuestLog();
      Save.save();
    }
  },

  onKill(enemyId, enemy) {
    const t = enemy ? enemy.def && enemy.def.id : null;
    if (t) this._progress("kill", t, 1);
    if (enemy && enemy.isBoss) {
      this._progress("boss", t, 1);
      const poi = World.POIS.bosses.find(b => b.boss === t);
      if (poi) this._progress("boss", poi.id, 1);
    }
  },

  onEvent(kind, target) {
    // kind: 'raid' | 'gacha' | 'mount' | 'mine' | 'explore' | 'castle'
    if (kind === "raid") this._progress("raid", target, 1);
    if (kind === "gacha") this._progress("gacha", 1, 1);
    if (kind === "mount") this._progress("mount", 1, 1);
    if (kind === "mine") this._progress("mine", "mine", 1);
    if (kind === "explore") this._progress("explore", target, 1);
    if (kind === "castle") this._progress("castle", target, 1);
  },

  onCastleFloor(floor) {
    // completes any castle quest with target <= floor
    for (const q of this.active) {
      if (q.type === "castle" && typeof q.target === "number" && q.target <= floor && q.progress < q.count) {
        q.progress = Math.min(q.count, q.progress + 1);
        Save.save();
        Game.ui.refreshQuestLog && Game.ui.refreshQuestLog();
      }
    }
    this._progress("castle", floor, 1);
  },

  onCollect(defId, amount) { this._progress("collect", defId, amount || 1); },

  checkComplete(q) { return q.progress >= q.count; },

  finishable() { return this.active.filter(q => this.checkComplete(q)); },

  claim(id) {
    const i = this.active.findIndex(q => q.id === id);
    if (i < 0) return false;
    const q = this.active[i];
    if (!this.checkComplete(q)) return false;
    const ret = this._grantRewards(q.reward, q);
    this.active.splice(i, 1);
    this.completedList.push(q.id);
    Save.save();
    return ret;
  },

  _grantRewards(reward, q) {
    const cls = (Save.data.player.classId || "warrior");
    const rewardItems = reward.items || [];
    let goldBonus = 0;
    const grantedItems = [];
    for (const it of rewardItems) {
      if (typeof it === "object") { if (Math.random() < it[1]) grantedItems.push(it[0]); continue; }
      if (it === "w_any_common" || it === "w_any_rare" || it === "w_any_epic" || it === "w_any_legendary") {
        const tier = it.split("_")[2];
        const type = CLASSES[cls].weapon;
        grantedItems.push("w_" + type + "_" + tier);
      } else grantedItems.push(it);
    }
    const totalGold = (reward.gold || 0) + goldBonus;
    Game.addGold(totalGold);
    const grantedNames = [];
    for (const itemId of grantedItems) {
      if (ITEM.defs[itemId]) { Inventory.add(itemId, 1); grantedNames.push(ITEM.defs[itemId].name); }
    }
    Game.player.addXp(Math.round((q ? q.lvl : 1) * 40), { show: false });
    Game.notify("Recompensa: " + totalGold + " de oro" + (grantedNames.length ? " + " + grantedNames.join(", ") : ""), "good");
    Game.sfx.chest();
    return { gold: totalGold, items: grantedItems };
  },

  available(giverId) {
    // quest board shows templates not yet taken (giver optional)
    return QUEST_TEMPLATES.filter(t => this.canStart(t.id));
  },
};
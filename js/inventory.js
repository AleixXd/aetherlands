/* ============================================================
   inventory.js — item instances, stacks, equipment, mounts
   ============================================================ */
const Inventory = {
  get inv() { return Save.data.inventory; },

  _findIndexByUid(uid) { return this.inv.findIndex(it => it.uid === uid); },

  at(i) { return this.inv[i]; },

  uid() { return Utils.uid(); },

  add(defId, count, noStack) {
    const def = ITEM.defs[defId];
    if (!def) return null;
    const c = count || 1;
    // stack consumables / materials / misc (not equipment)
    if (!noStack && def.type !== ItemType.WEAPON && def.type !== ItemType.ARMOR) {
      const ex = this.inv.find(it => it.id === defId && it.count !== undefined);
      if (ex) { ex.count += c; Save.save(); return ex; }
      const item = { uid: this.uid(), id: defId, count: c };
      this.inv.push(item);
      Save.save();
      return item;
    }
    const item = { uid: this.uid(), id: defId, count: 1 };
    this.inv.push(item);
    Save.save();
    return item;
  },

  remove(i, count) {
    const it = this.inv[i];
    if (!it) return;
    // unequip if currently equipped
    for (const slot in Save.data.equipment) if (Save.data.equipment[slot] === it.uid) {
      Save.data.equipment[slot] = -1;
    }
    if (count && it.count !== undefined && it.count > count) it.count -= count;
    else this.inv.splice(i, 1);
    Save.save();
  },

  removeByUid(uid, count) {
    const i = this._findIndexByUid(uid);
    if (i >= 0) this.remove(i, count);
  },

  count(defId) {
    let n = 0;
    for (const it of this.inv) if (it.id === defId) n += it.count || 1;
    return n;
  },

  findPotion() {
    return this.inv.findIndex(it => ITEM.defs[it.id] && ITEM.defs[it.id].type === ItemType.POTION && ITEM.defs[it.id].heal);
  },

  /* ---------- equipment ---------- */
  equipped() {
    const eq = Save.data.equipment;
    const out = { weapon: null, armor: null, helmet: null, boots: null, accessory: null };
    for (const slot in eq) {
      const idx = this._findIndexByUid(eq[slot]);
      if (idx >= 0 && ITEM.defs[this.inv[idx].id]) out[slot] = ITEM.defs[this.inv[idx].id];
    }
    return out;
  },

  weapon() { return this.equipped().weapon; },
  armorDef() { return this.equipped().armor; },

  equip(i) {
    const it = this.inv[i];
    if (!it) return { ok: false, reason: "Objeto no válido." };
    const def = ITEM.defs[it.id];
    if (!def) return { ok: false, reason: "Objeto no válido." };
    if (def.type !== ItemType.WEAPON && def.type !== ItemType.ARMOR) return { ok: false, reason: "No se puede equipar." };
    if (Save.data.player.level < (def.lvl || 1)) return { ok: false, reason: "Requiere nivel " + (def.lvl || 1) + "." };
    // weapon class check
    const cls = CLASSES[Save.data.player.classId] || CLASSES.warrior;
    if (def.type === ItemType.WEAPON && def.sub !== cls.weapon) {
      return { ok: false, reason: cls.name + " no puede empuñar esto." };
    }
    const slot = def.type === ItemType.WEAPON ? "weapon" : def.sub;
    const oldUid = Save.data.equipment[slot];
    if (oldUid === it.uid) { return { ok: false, reason: "Ya está equipado." }; }
    Save.data.equipment[slot] = it.uid;
    Save.save();
    return { ok: true, slot: slot };
  },

  unequip(slot) {
    const uid = Save.data.equipment[slot];
    if (uid === -1 || uid === undefined) return;
    Save.data.equipment[slot] = -1;
    Save.save();
  },

  sellValue(i) {
    const it = this.inv[i];
    if (!it) return 0;
    const def = ITEM.defs[it.id];
    return Math.floor((def.cost || def.value || 0) * 0.55 * (it.count || 1));
  },

  canSell(i) {
    const it = this.inv[i];
    if (!it) return false;
    const def = ITEM.defs[it.id];
    return def.type !== ItemType.QUEST && it.uid !== Save.data.equipment.weapon && it.uid !== Save.data.equipment.armor && it.uid !== Save.data.equipment.helmet && it.uid !== Save.data.equipment.boots && it.uid !== Save.data.equipment.accessory;
  },

  /* ---------- mounts ---------- */
  addMount(defId) {
    if (!Save.data.mounts.owned.includes(defId)) Save.data.mounts.owned.push(defId);
    Save.save();
  },

  hasMount(defId) { return Save.data.mounts.owned.includes(defId); },

  activeMount() {
    const a = Save.data.mounts.active;
    if (a < 0 || !this.hasMount(a)) return null;
    return a;
  },

  setActiveMount(defId) { Save.data.mounts.active = defId; Save.save(); },

  mountsOwned() { return Save.data.mounts.owned; },
};
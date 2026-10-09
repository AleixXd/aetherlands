/* ============================================================
   data.js — clases, objetos, enemigos, jefes, biomas, misiones,
   monturas, gacha y tiendas (fuente única de verdad)
   ============================================================ */

// ---------------- Clases ----------------
const CLASSES = {
  warrior: {
    id: "warrior", name: "Guerrero", icon: "\u2694", color: "#e05a3a",
    desc: "Maestro del acero. Alta vitalidad y golpes demoledores.",
    weapon: "sword",
    base: { str: 8, agi: 4, vit: 8, mag: 2, spr: 3 },
    skills: [
      { id: "heavy", key: 1, name: "Golpe Demoledor", icon: "\u26A1", cost: 20, cd: 3, desc: "Golpe contundente. 2,2x de daño + empujón." },
      { id: "whirl", key: 2, name: "Tornado", icon: "\uD83C\uDF2A", cost: 35, cd: 7, desc: "Gira golpeando a todos los enemigos circundantes." },
      { id: "shout", key: 3, name: "Grito de Guerra", icon: "\uD83D\uDCAB", cost: 25, cd: 14, desc: "+35% de ataque durante 8 s." },
    ],
  },
  mage: {
    id: "mage", name: "Mago", icon: "\uD83E\uDDE9", color: "#5a7dff",
    desc: "Poder arcano. Hechizos devastadores a distancia.",
    weapon: "staff",
    base: { str: 2, agi: 4, vit: 5, mag: 9, spr: 5 },
    skills: [
      { id: "fireball", key: 1, name: "Bola de Fuego", icon: "\uD83D\uDD25", cost: 22, cd: 2.5, desc: "Proyectil explosivo." },
      { id: "blizzard", key: 2, name: "Ventisca", icon: "\u2744", cost: 38, cd: 9, desc: "Congela y daña en área." },
      { id: "meteor", key: 3, name: "Meteoro", icon: "\u2604", cost: 55, cd: 18, desc: "Golpe de área devastador." },
    ],
  },
  rogue: {
    id: "rogue", name: "Pícaro", icon: "\uD83C\uDFF9", color: "#59c25f",
    desc: "Errante de las sombras. Flechas rápidas y críticos letales.",
    weapon: "bow",
    base: { str: 4, agi: 9, vit: 5, mag: 3, spr: 4 },
    skills: [
      { id: "pierce", key: 1, name: "Flecha Perforante", icon: "\u27B8", cost: 15, cd: 1.6, desc: "Flecha rápida que perfora." },
      { id: "fan", key: 2, name: "Abanico de Cuchillas", icon: "\uD83D\uDD28", cost: 30, cd: 8, desc: "Abanico de hojas afiladas." },
      { id: "step", key: 3, name: "Paso de Sombra", icon: "\uD83D\uDC7B", cost: 22, cd: 12, desc: "Parpadea tras el enemigo + golpe fuerte." },
    ],
  },
  paladin: {
    id: "paladin", name: "Paladín", icon: "\u2694\uFE0F", color: "#e0c04a",
    desc: "Guardián sagrado. Castiga a los enemigos y cura las heridas.",
    weapon: "scepter",
    base: { str: 5, agi: 4, vit: 7, mag: 6, spr: 6 },
    skills: [
      { id: "bolt", key: 1, name: "Rayo Sagrado", icon: "\u2726", cost: 18, cd: 2, desc: "Descarga radiante a distancia." },
      { id: "consecrate", key: 2, name: "Consagración", icon: "\u2605", cost: 40, cd: 12, desc: "Zona de curación de 6 s." },
      { id: "smite", key: 3, name: "Castigo", icon: "\u26F1", cost: 45, cd: 15, desc: "Daño sagrado masivo a un solo objetivo." },
    ],
  },
};

// ---------------- Helpers de stats ----------------
const StatCalc = {
  maxHP(p) { return Math.floor(80 + p.baseStats.vit * 10 + p.level * 4); },
  maxStam(p) { return Math.floor(100 + p.baseStats.agi * 1.5 + p.level * 1); },
  atk(p, weapon) { return Math.floor(3 + p.baseStats.str * 2.2 + (weapon ? weapon.atk : 2)); },
  matk(p, weapon) { return Math.floor(2 + p.baseStats.mag * 2.6 + (weapon ? weapon.matk : 1)); },
  def(p, armor) { return Math.floor((armor ? armor.def : 0) + p.baseStats.vit * 0.6 + 1); },
  mdef(p, armor) { return Math.floor((armor ? armor.mdef : 0) + p.baseStats.spr * 1.2); },
  crit(p) { return Math.min(0.6, 0.05 + p.baseStats.agi * 0.006); },
  speed(p) { return 0.5 + p.baseStats.agi * 0.02; },
  healing(p) { return p.baseStats.spr * 0.4; },
};

// ---------------- Fábrica / definiciones de objetos ----------------
const ItemType = { WEAPON: "weapon", ARMOR: "armor", POTION: "potion", MATERIAL: "material", QUEST: "quest", MOUNT: "mount", MISC: "misc" };
const TierNames = { common: "Común", rare: "Raro", epic: "Épico", legendary: "Legendario" };
const TierAdj = {
  common: ["común", "común"],
  rare: ["raro", "rara"],
  epic: ["épico", "épica"],
  legendary: ["legendario", "legendaria"],
};
const TierColors = { common: "#9aa4b2", rare: "#3f9bff", epic: "#b45aff", legendary: "#ffb020" };

const ITEM = {
  defs: {},
  _i: 0,
  def(id, cfg) { this.defs[id] = Object.assign({ id: id }, cfg); return id; },
};

// ---------- Armas (una base por clase, en niveles) ----------
function weaponDefs() {
  const lines = {
    sword: { icon: "\u2694", matk: 0, color: 0xb0bec5 },
    staff: { icon: "\u26E8", matk: 0, color: 0x7e57c2 },
    bow: { icon: "\uD83C\uDFF9", matk: 0, color: 0x8d6e63 },
    scepter: { icon: "\u2698", matk: 0, color: 0xc0a24a },
  };
  const tiers = {
    common: { lvl: 1, atk: 6, matk: 4, cost: 120, min: 1 },
    rare: { lvl: 1, atk: 13, matk: 9, cost: 420, min: 5 },
    epic: { lvl: 1, atk: 24, matk: 17, cost: 1500, min: 12 },
    legendary: { lvl: 1, atk: 40, matk: 29, cost: 5000, min: 20 },
  };
  const flavor = {
    sword: ["Espada de hierro", "Sable", "Claymore", "Colmillo de Veranth"],
    staff: ["Báculo", "Cetro", "Vara arcana", "Cetro del Éter"],
    bow: ["Arco corto", "Arco de tejo", "Arco largo", "Ala de Halcón"],
    scepter: ["Maza", "Martillo de guerra", "Aplastadora", "Vengador"],
  };
  for (const w in lines) {
    const base = lines[w];
    for (const tr in tiers) {
      const t = tiers[tr];
      const name = flavor[w][Object.keys(tiers).indexOf(tr)];
      // variantes de tienda (nivel fijo) + de botín (escaladas) comparten plantilla
      ITEM.def("w_" + w + "_" + tr, {
        type: ItemType.WEAPON, sub: w, name: name, icon: base.icon,
        tier: tr, color: TierColors[tr], atk: t.atk, matk: t.matk, lvl: t.min,
        cost: t.cost, shop: true,
      });
    }
  }
}

// ---------- Armaduras (peto, yelmo, botas, amuleto x 4 niveles) ----------
function armorDefs() {
  const slots = {
    armor: { name: "Cota", icon: "\uD83D\uDEE1", fem: 1 },
    helmet: { name: "Yelmo", icon: "\uD83C\uDFA9", fem: 0 },
    boots: { name: "Botas", icon: "\uD83E\uDD7E", fem: 1 },
    accessory: { name: "Amuleto", icon: "\uD83D\uDCDE", fem: 0 },
  };
  const tiers = {
    common: { def: 3, mdef: 2, cost: 100, lvl: 1, bonus: {} },
    rare: { def: 8, mdef: 6, cost: 380, lvl: 5, bonus: {} },
    epic: { def: 16, mdef: 12, cost: 1300, lvl: 12, bonus: { vit: 3 } },
    legendary: { def: 26, mdef: 21, cost: 4200, lvl: 20, bonus: { vit: 6, spr: 4 } },
  };
  for (const s in slots) {
    for (const tr in tiers) {
      const t = tiers[tr];
      ITEM.def("a_" + s + "_" + tr, {
        type: ItemType.ARMOR, sub: s, name: slots[s].name + " " + TierAdj[tr][slots[s].fem], icon: slots[s].icon,
        tier: tr, color: TierColors[tr], def: t.def, mdef: t.mdef, lvl: t.lvl,
        cost: t.cost, bonus: t.bonus, shop: (s === "armor" || s === "helmet"),
      });
    }
  }
}

// ---------- Pociones y consumibles ----------
function potionDefs() {
  ITEM.def("potion_hp", { type: ItemType.POTION, name: "Poción de vida", icon: "\uD83E\uDDEA", color: "#ef5350", tier: "common", heal: 45, cost: 40, lvl: 1 });
  ITEM.def("potion_hp2", { type: ItemType.POTION, name: "Poción de vida superior", icon: "\uD83C\uDF7E", color: "#ff7043", tier: "rare", heal: 160, cost: 150, lvl: 5 });
  ITEM.def("potion_hp3", { type: ItemType.POTION, name: "Elixir eterno", icon: "\uD83E\uDD7C", color: "#ffab40", tier: "epic", heal: 450, cost: 540, lvl: 12 });
  ITEM.def("potion_stam", { type: ItemType.POTION, name: "Tónico de resistencia", icon: "\u26A1", color: "#4fc3f7", tier: "common", stam: 60, cost: 35, lvl: 1 });
  ITEM.def("potion_buff", { type: ItemType.POTION, name: "Brebaje de batalla", icon: "\u2615", color: "#ffe082", tier: "epic", buffAtk: 0.25, buffTime: 30, cost: 320, lvl: 8, desc: "+25% de ATQ durante 30 s" });
}

// ---------- Materiales (minería y botines) ----------
function materialDefs() {
  ITEM.def("ore_copper", { type: ItemType.MATERIAL, name: "Mineral de cobre", icon: "\uD83E\uDDF1", color: "#b87333", tier: "common", value: 8 });
  ITEM.def("ore_iron", { type: ItemType.MATERIAL, name: "Mineral de hierro", icon: "\uD83E\uDDF1", color: "#9aa4b2", tier: "common", value: 16 });
  ITEM.def("ore_silver", { type: ItemType.MATERIAL, name: "Mineral de plata", icon: "\uD83C\uDF08", color: "#cfd8dc", tier: "rare", value: 40 });
  ITEM.def("ore_aether", { type: ItemType.MATERIAL, name: "Cristal de éter", icon: "\uD83D\uDC8E", color: "#7c4dff", tier: "epic", value: 120 });
  ITEM.def("shard_raw", { type: ItemType.MATERIAL, name: "Fragmento en bruto", icon: "\uD83D\uDD2E", color: "#ffd180", tier: "rare", value: 65 });
}

// ---------- Armas de la corona (recompensa unica del piso 100) ----------
function crownWeaponDefs() {
  const lines = {
    sword: { icon: "\u2694", name: "Veranth, la Aguja Rota" },
    staff: { icon: "\u26E8", name: "Vara de las Mil Pisadas" },
    bow: { icon: "\uD83C\uDFF9", name: "Arco del Senor de la Aguja" },
    scepter: { icon: "\u2698", name: "Cetro de la Obsidiana" },
  };
  for (const w in lines) {
    const b = lines[w];
    ITEM.def("w_crown_" + w, {
      type: ItemType.WEAPON, sub: w, name: b.name, icon: b.icon,
      tier: "legendary", color: "#ffb020", atk: 58, matk: 44, lvl: 1, cost: 0,
      desc: "Se forjo en la cima de la Aguja al vencer al Senor de la Aguja.",
    });
  }
}

// ---------- Monturas ----------
function mountDefs() {
  ITEM.def("mount_stag", { type: ItemType.MOUNT, name: "Ciervo del bosque", icon: "\uD83E\uDD8C", color: "#8d6e63", tier: "rare", speed: 1.0, gachaRate: 0.16, cost: 800 });
  ITEM.def("mount_wolf", { type: ItemType.MOUNT, name: "Lobo temible", icon: "\uD83D\uDC3A", color: "#546e7a", tier: "epic", speed: 1.18, gachaRate: 0.09, cost: 1600 });
  ITEM.def("mount_roc", { type: ItemType.MOUNT, name: "Roc celeste", icon: "\uD83E\uDD85", color: "#b0bec5", tier: "epic", speed: 1.30, gachaRate: 0.07, cost: 2600 });
  ITEM.def("mount_serpent", { type: ItemType.MOUNT, name: "Serpiente astral", icon: "\uD83D\uDC0D", color: "#7c4dff", tier: "legendary", speed: 1.5, gachaRate: 0.03, cost: 5000 });
}

// ---------- Varios / de misión ----------
function miscDefs() {
  ITEM.def("crystal", { type: ItemType.MISC, name: "Cristal estelar", icon: "\uD83D\uDC8E", color: "#4fc3f7", value: 500, desc: "Moneda premium para el Altar del Gacha." });
  ITEM.def("wanted_token", { type: ItemType.MISC, name: "Ficha de recompensa", icon: "\uD83D\uDCC3", color: "#ffe082", value: 0, desc: "Prueba de una caza recompensada." });
  ITEM.def("boss_key", { type: ItemType.QUEST, name: "Sello del castillo", icon: "\uD83D\uDD11", color: "#b45aff", value: 0, desc: "Abre el siguiente piso del castillo." });
}

// ---------------- Enemigos ----------------
const ENEMIES = {
  // nombre, nivel, vida, atk, def física, def mágica, velocidad, xp, modelo, IA, color, tamaño
  slime:   { name: "Limo",    lvl: 1,  hp: 34,  atk: 7,  def: 1,  mdef: 1,  speed: 2.6, xp: 12, model: "slime",  beh: "melee", color: 0x66d87c, size: 0.75 },
  bat:     { name: "Murciélago", lvl: 3,  hp: 30,  atk: 9,  def: 0,  mdef: 4,  speed: 5.0, xp: 16, model: "bat",    beh: "ranged", color: 0x8e6bb5, size: 0.6 },
  wolf:    { name: "Lobo",     lvl: 4,  hp: 88,  atk: 14, def: 3,  mdef: 2,  speed: 6.0, xp: 28, model: "wolf",   beh: "melee", color: 0x8d7b68, size: 1.2 },
  goblin:  { name: "Trasgo",   lvl: 6,  hp: 95,  atk: 16, def: 4,  mdef: 3,  speed: 4.6, xp: 34, model: "humanoid", beh: "melee", color: 0x6a994e, size: 1.0 },
  skeleton: { name: "Esqueleto",lvl: 8,  hp: 130, atk: 20, def: 5,  mdef: 3,  speed: 4.2, xp: 48, model: "skeleton", beh: "melee", color: 0xd7ccc8, size: 1.4 },
  zombie:  { name: "Podrido", lvl: 10, hp: 210, atk: 24, def: 6,  mdef: 4,  speed: 2.8, xp: 62, model: "humanoid", beh: "melee", color: 0x7a9e5c, size: 1.35 },
  scorpion: {name: "Escorpión de arena",lvl: 12, hp: 260, atk: 30, def: 8,  mdef: 5,  speed: 5.2, xp: 90, model: "scorpion", beh: "melee", color: 0xc9a227, size: 1.5 },
  vulture: { name: "Buitre carroñero", lvl: 13, hp: 175, atk: 28, def: 4, mdef: 6, speed: 6.4, xp: 85, model: "vulture", beh: "ranged", color: 0x546e7a, size: 1.3 },
  yeti:    { name: "Yeti",     lvl: 16, hp: 430, atk: 40, def: 12, mdef: 6,  speed: 4.0, xp: 150, model: "yeti",    beh: "melee", color: 0xcfd8dc, size: 2.1 },
  icewisp: { name: "Alma de escarcha", lvl: 14, hp: 200, atk: 34, def: 3,  mdef: 10, speed: 5.5, xp: 120, model: "wisp",   beh: "caster", color: 0x81d4fa, size: 0.7 },
  croc:    { name: "Cocodrilo de ciénaga", lvl: 17, hp: 480, atk: 42, def: 13, mdef: 7, speed: 4.2, xp: 165, model: "croc",   beh: "melee", color: 0x5d8a3c, size: 2.0 },
  viper:   { name: "Víbora pantanosa",lvl: 18, hp: 320, atk: 44, def: 7,  mdef: 11, speed: 5.6, xp: 175, model: "snake",  beh: "caster", color: 0x7cad35, size: 1.7 },
  demon:   { name: "Demonio", lvl: 22, hp: 700, atk: 58, def: 15, mdef: 14, speed: 4.4, xp: 260, model: "demon", beh: "melee", color: 0xb4374a, size: 1.9 },
  imp:     { name: "Duende de ceniza",  lvl: 21, hp: 380, atk: 48, def: 8,  mdef: 16, speed: 6.2, xp: 230, model: "imp",   beh: "caster", color: 0xef6c00, size: 0.95 },
  magmaworm:{ name: "Gusano de magma", lvl: 24, hp: 850, atk: 66, def: 18, mdef: 10, speed: 3.6, xp: 320, model: "worm", beh: "melee", color: 0xd84315, size: 2.0 },
  golem:   { name: "Gólem de escombros", lvl: 26, hp: 1200, atk: 72, def: 24, mdef: 8, speed: 3.0, xp: 420, model: "golem", beh: "melee", color: 0x8d8d8d, size: 2.4 },
  ghost:   { name: "Espectro",  lvl: 40, hp: 1600, atk: 90, def: 12, mdef: 26, speed: 5.2, xp: 680, model: "wraith", beh: "caster", color: 0x9fa8da, size: 1.3 },
};

const ENEMY_BIOMES = {
  plains:  ["slime", "wolf", "goblin"],
  forest:  ["wolf", "goblin", "skeleton"],
  tundra:  ["yeti", "icewisp", "wolf"],
  desert:  ["scorpion", "vulture", "skeleton"],
  swamp:   ["croc", "viper", "zombie"],
  volcanic:["demon", "imp", "magmaworm"],
  castle:  ["skeleton", "zombie", "ghost", "golem", "imp"],
  cave:    ["bat", "slime", "zombie"],
};

// ---------------- Jefes ----------------
const BOSSES = {
  slimeking: { name: "Rey del Lodo", lvl: 7, hp: 720, atk: 26, def: 8, mdef: 6, xp: 420, gold: 120, zone: "plains", model: "slime", color: 0x4caf50, size: 3.2, drops: { gold: 120, items: [["a_armor_rare", 0.9], ["ore_copper", 1]], }, pattern: ["charge", "slam", "summon"] },
  treant:    { name: "Anciano Lamento", lvl: 14, hp: 2100, atk: 46, def: 16, mdef: 12, xp: 1100, gold: 320, zone: "forest", model: "treant", color: 0x4e7a3a, size: 3.6, drops: { gold: 320, items: [["a_armor_epic", 0.5], ["ore_iron", 1], ["ore_silver", 0.6]] }, pattern: ["slam", "roots", "swarm"] },
  scarabix:  { name: "Scarabix el Devorasoles", lvl: 22, hp: 4300, atk: 74, def: 24, mdef: 14, xp: 2600, gold: 750, zone: "desert", model: "scorpion", color: 0xe6a817, size: 4.4, drops: { gold: 750, items: [["ore_silver", 1], ["a_accessory_epic", 0.55], ["w_bow_epic", 0.5]] }, pattern: ["charge", "sting", "sandstorm"] },
  frostbrand: { name: "Escarcha, Guardián de Invierno", lvl: 28, hp: 6800, atk: 92, def: 28, mdef: 26, xp: 4600, gold: 1300, zone: "tundra", model: "yeti", color: 0x90caf9, size: 4.6, drops: { gold: 1300, items: [["ore_aether", 0.6], ["a_helmet_legendary", 0.4], ["potion_hp3", 1]] }, pattern: ["icewall", "slam", "fury"] },
  bogcreed:  { name: "Fangal, Señor de la Ciénaga", lvl: 32, hp: 9500, atk: 110, def: 30, mdef: 28, xp: 7200, gold: 2000, zone: "swamp", model: "croc", color: 0x2e7d32, size: 5.2, drops: { gold: 2000, items: [["a_boots_legendary", 0.5], ["w_staff_legendary", 0.35], ["shard_raw", 0.8]] }, pattern: ["charge", "poison", "summon"] },
  ashtyrant: { name: "Tirano de las Cenizas", lvl: 40, hp: 16000, atk: 145, def: 38, mdef: 32, xp: 12000, gold: 3500, zone: "volcanic", model: "demon", color: 0xe64a19, size: 5.6, drops: { gold: 3500, items: [["a_armor_legendary", 0.8], ["w_" + "sword" + "_legendary", 0.5], ["ore_aether", 1.0], ["crystal", 0.6]] }, pattern: ["meteor", "charge", "fury"] },
};

// ---------------- Monturas (formas) ----------------
const MOUNTS = {
  mount_stag: { legs: 4, horned: true, color: 0x8d6e63, speed: 1.0 },
  mount_wolf: { legs: 4, horned: false, color: 0x546e7a, speed: 1.18 },
  mount_roc: { legs: 2, wings: true, color: 0xb0bec5, speed: 1.3 },
  mount_serpent: { legs: 0, wings: true, color: 0x7c4dff, speed: 1.5 },
};

// ---------------- Piscina del Gacha ----------------
const GACHA = {
  poolBuild() {
    const pool = [];
    const add = (defId, w, tier) => pool.push({ defId, w, tier });
    for (const id in ITEM.defs) {
      const d = ITEM.defs[id];
      if (d.type === ItemType.WEAPON || d.type === ItemType.ARMOR) add(id, 1, d.tier);
    }
    for (const id in ITEM.defs) {
      const d = ITEM.defs[id];
      if (d.type === ItemType.MOUNT) add(id, d.gachaRate * 2, d.tier);
    }
    add("potion_hp3", 3, "rare");
    add("potion_buff", 3, "epic");
    add("ore_silver", 4, "rare");
    add("ore_aether", 2, "epic");
    return pool;
  },
};

// ---------------- Misiones ----------------
const QUEST_TEMPLATES = [
  { id: "q_slimes", name: "La plaga de los limos", giver: "Alaric", type: "kill", target: "slime", count: 8, lvl: 1,
    reward: { gold: 120, items: ["potion_hp"] }, desc: "Las granjas de Veranth están desbordadas. Derriba 8 limos cerca del pueblo." },
  { id: "q_wolves", name: "Lobos en los límites", giver: "Maren", type: "kill", target: "wolf", count: 10, lvl: 4,
    reward: { gold: 320, items: ["ore_iron"] }, desc: "Elise la cazadora necesita adelgazar el bosque. Mata 10 lobos." },
  { id: "q_goblins", name: "La amenaza de los trasgos", giver: "Alaric", type: "kill", target: "goblin", count: 12, lvl: 6,
    reward: { gold: 540, items: ["w_any_rare"] }, desc: "Los trasgos asaltan la ruta comercial. Derriba a 12." },
  { id: "q_ore", name: "Fundición", giver: "Torvald", type: "collect", target: "ore_copper", count: 10, lvl: 2,
    reward: { gold: 260, items: [] }, desc: "Tráeme 10 minerales de cobre de la Cueva del Buscador." },
  { id: "q_iron", name: "Hierro para la milicia", giver: "Torvald", type: "collect", target: "ore_iron", count: 12, lvl: 8,
    reward: { gold: 900, items: ["a_helmet_rare"] }, desc: "Entrega 12 minerales de hierro para armar a la guardia." },
  { id: "q_boss_slime", name: "Hermano del Lodo", giver: "Alaric", type: "boss", target: "slimeking", count: 1, lvl: 5,
    reward: { gold: 500, items: ["potion_hp2", "ore_copper"] }, desc: "El Rey del Lodo ha sido avistado al oeste del pueblo. Derótalo." },
  { id: "q_raids", name: "La aldea de Velo de Arena", giver: "Kralynn", type: "raid", target: "village_desert", count: 1, lvl: 16,
    reward: { gold: 1600, items: ["ore_silver", "potion_buff"] }, desc: "Limpia la aldea asaltada de Velo de Arena." },
  { id: "q_cave", name: "La Cámara de los Ecos", giver: "Kralynn", type: "explore", target: "explore_crystalcave", count: 1, lvl: 12,
    reward: { gold: 1300, items: ["ore_aether"] }, desc: "Alcanza la cámara de cristal dentro de la Cueva de los Ecos." },
  { id: "q_boss_frost", name: "El fin del invierno", giver: "Maren", type: "boss", target: "frostbrand", count: 1, lvl: 24,
    reward: { gold: 2400, items: ["w_scepter_epic", "ore_aether"] }, desc: "Derriba a Escarcha, el Guardián de Invierno." },
  { id: "q_castle10", name: "El décimo portal", giver: "Gideon", type: "castle", target: 10, count: 1, lvl: 12,
    reward: { gold: 2200, items: ["w_any_epic"] }, desc: "Derrota al jefe del piso 10 del castillo." },
  { id: "q_castle25", name: "El Bastión Carmesí", giver: "Gideon", type: "castle", target: 25, count: 1, lvl: 20,
    reward: { gold: 5200, items: ["a_armor_epic", "crystal"] }, desc: "Derrota al jefe del piso 25 del Bastión Carmesí." },
  { id: "q_gacha", name: "La prueba del altar", giver: "Sylas", type: "gacha", target: 1, count: 1, lvl: 4,
    reward: { gold: 200, items: ["crystal"] }, desc: "Gira el Altar del Gacha una vez para demostrar que la fortuna te favorece." },
  { id: "q_mount", name: "Jinete coronado", giver: "Branwen", type: "mount", target: 1, count: 1, lvl: 10,
    reward: { gold: 300, items: [] }, desc: "Consigue una montura y cabalga por Éterlands." },
  { id: "q_mining10", name: "Vetas de Veranth", giver: "Torvald", type: "mine", target: "mine", count: 10, lvl: 3,
    reward: { gold: 450, items: ["ore_iron"] }, desc: "Extrae 10 depósitos de mineral en cualquier lugar del reino." },
  { id: "q_boss_ashtyrant", name: "Corona de cenizas", giver: "Kralynn", type: "boss", target: "ashtyrant", count: 1, lvl: 36,
    reward: { gold: 6000, items: ["crystal", "a_accessory_legendary"] }, desc: "Derrota al Tirano de las Cenizas en la Comarca Ardiente." },
];

// ---------------- Tiendas ----------------
const SHOPS = {
  weapon: {
    title: "Armería Hueso y Yunque", npc: "Helga",
    stockFrom: function (level) {
      const type = (CLASSES[Save.data.player.classId] || CLASSES.warrior).weapon;
      const out = [];
      for (const tr of ["common", "rare", "epic", "legendary"]) out.push("w_" + type + "_" + tr);
      return out;
    },
  },
  armor: { title: "Yunque y Cuero — Herrería", npc: "Torvald" },
  potion: { title: "Casa de Elixires", npc: "Poppy" },
};

// ---------------- NPCs del pueblo ----------------
const NPC_DEFS = [
  { id: "shop_weapon", name: "Helga", role: "weapons", icon: "\u2694", x: 14, z: -18, title: "Armera" },
  { id: "shop_armor", name: "Torvald", role: "armors", icon: "\uD83D\uDEE1", x: -14, z: -18, title: "Herrero" },
  { id: "shop_potion", name: "Poppy", role: "potions", icon: "\uD83E\uDDEA", x: -22, z: 8, title: "Alquimista" },
  { id: "gacha", name: "Sylas", role: "gacha", icon: "\uD83C\uDFB2", x: 22, z: 8, title: "Guardián de la fe" },
  { id: "quest_alaric", name: "Alaric", role: "quests", icon: "\u2693", x: -10, z: 24, title: "Vigía" },
  { id: "quest_maren", name: "Maren", role: "quests", icon: "\uD83C\uDFF9", x: 0, z: 26, title: "Exploradora" },
  { id: "quest_kralynn", name: "Kralynn", role: "quests", icon: "\uD83D\uDDE1", x: 10, z: 26, title: "Jefa de expedición" },
  { id: "quest_deus", name: "Gideon", role: "castle", icon: "\uD83C\uDFDB", x: -30, z: -6, title: "Guardián de la torre" },
  { id: "mountshop", name: "Branwen", role: "mounts", icon: "\uD83E\uDD8C", x: 30, z: -6, title: "Maestra de establos" },
  { id: "trade", name: "Milo", role: "trade", icon: "\uD83D\uDCB0", x: 24, z: 20, title: "Mercader" },
  { id: "pvp", name: "Vael", role: "pvp", icon: "\u2694", x: -24, z: 20, title: "Maestro de la arena" },
];

// ---------------- Biomas ----------------
const BIOMES = {
  plains: {
    name: "Llanuras de Veranth", color: "#6da94c", col: 0x5d9a45, veg: "grass", treeCol: 0x3f7d32,
    height: [0.35, 0.9], treeDensity: 0.012, enemies: ["slime", "wolf", "goblin"],
    radius: [0, 650], fog: 0xbfd8a8, fogD: 0.0020,
  },
  forest: {
    name: "Bosque Frondoso", color: "#3f7d32", col: 0x3a7430, veg: "tree", treeCol: 0x2e5d24,
    height: [0.4, 1.1], treeDensity: 0.055, enemies: ["wolf", "goblin", "skeleton"],
    radius: [650, 1500], fog: 0x7f9e6b, fogD: 0.0030,
  },
  tundra: {
    name: "Comarca Helada", color: "#cfe4ee", col: 0xc9dfea, veg: "pine", treeCol: 0x274e3a,
    height: [0.5, 1.25], treeDensity: 0.025, enemies: ["yeti", "icewisp", "wolf"],
    radius: [1500, 2300], fog: 0xcddfe8, fogD: 0.0016,
  },
  desert: {
    name: "Dunas Agostadas", color: "#d9b37a", col: 0xdcb26b, veg: "cactus", treeCol: 0x6a4e2e,
    height: [0.3, 0.9], treeDensity: 0.01, enemies: ["scorpion", "vulture", "skeleton"],
    radius: [0, 2300], fog: 0xe6cf9e, fogD: 0.0011,
  },
  swamp: {
    name: "Ciénaga Sombría", color: "#4e6b4e", col: 0x47644a, veg: "dead", treeCol: 0x37473a,
    height: [0.15, 0.6], treeDensity: 0.03, enemies: ["croc", "viper", "zombie"],
    radius: [0, 2000], fog: 0x6b7a62, fogD: 0.0038,
  },
  volcanic: {
    name: "Comarca Ardiente", color: "#4a2b2b", col: 0x4c2e2a, veg: "cinder", treeCol: 0x2b1b18,
    height: [0.5, 1.2], treeDensity: 0.015, enemies: ["demon", "imp", "magmaworm"],
    radius: [0, 2300], fog: 0x7a4a3a, fogD: 0.0042,
  },
  cave: { name: "Cavernas Profundas", color: "#2b2b33", col: 0x23232b, veg: "crystal", treeCol: 0x1b1b22, height: [0, 1], treeDensity: 0, enemies: ["bat", "slime", "zombie"], fog: 0x1a1a22, fogD: 0.0090 },
};

// caché de la piscina plana para el gacha
let _gachaPool = null;
function getGachaPool() {
  if (!_gachaPool) _gachaPool = GACHA.poolBuild();
  return _gachaPool;
}

function tierCaps(tr) { return TierNames[tr] || (tr.charAt(0).toUpperCase() + tr.slice(1)); }

// Construye todas las definiciones al cargar
weaponDefs();
  crownWeaponDefs();
  armorDefs();
potionDefs();
materialDefs();
mountDefs();
miscDefs();

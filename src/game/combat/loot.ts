import { Container, Sprite, Text } from 'pixi.js';
import { Transform, attachView, makeTransform, type Rng } from '@engine';
import { Health, type HeroId } from '../components';
import { Foe, Hero, type FoeC } from './components';
import { BODY_Y, type CombatCtx } from './context';
import { applyStatus, foesAround } from './status';
import lootJson from '../../../data/loot.json';

/**
 * Butin d'équipement (data/loot.json) : tirages par source (normal, élite, boss), raretés, niveau d'objet,
 * affixes, pouvoirs légendaires, pitié, ramassage avec aimant, équipement automatique (score pondéré
 * par héros, smartLoot.heroWeights) et démantèlement en Poussière d'étoile.
 */
export type ItemRarity = 'common' | 'magic' | 'rare' | 'epic' | 'legendary' | 'ancestral';
export type Slot = 'weapon' | 'armor' | 'ring' | 'boots';
export const ITEM_RARITIES: ItemRarity[] = ['common', 'magic', 'rare', 'epic', 'legendary', 'ancestral'];
export const SLOTS: Slot[] = ['weapon', 'armor', 'ring', 'boots'];

interface RarityDef { name: string; color: string; statMul: number; affixes: [number, number]; legendaryPower: boolean; perfectRoll?: boolean; fx: { beam: boolean; glow: number; dropShake: number; slowMo?: number; banner?: boolean } }
interface AffixDef { id: string; name: string; stat: string; range: [number, number]; slots: Slot[]; weight: number; minRarity?: ItemRarity }
export interface PowerDef { id: string; slot: Slot; hero?: HeroId; name: string; short: string; desc: string; patronHint: string }
interface LootData {
  rarities: Record<ItemRarity, RarityDef>;
  slots: Record<Slot, { icon: string; label: string; baseStats: Record<string, [number, number]> }>;
  itemLevel: { statScalePerIlvl: number };
  dropTables: { sources: {
    normal: { chance: number; byWave: Record<string, Partial<Record<ItemRarity, number>>> };
    elite: { chance: number; byWave: Record<string, Partial<Record<ItemRarity, number>>> };
    boss: { rolls: number; byWave: Record<string, Partial<Record<ItemRarity, number>>> };
  } };
  pity: { epic: { afterDropsWithout: number }; legendary: { afterDropsWithout: number; softStart: number; softBonusPerDrop: number } };
  smartLoot: { heroBias: number; heroWeights: Record<HeroId, Record<string, number>> };
  affixes: AffixDef[];
  legendaryPowers: PowerDef[];
  salvage: { dust: Record<ItemRarity, number> };
}
export const LOOT = lootJson as unknown as LootData;

export interface Item {
  uid: number;
  slot: Slot;
  rarity: ItemRarity;
  ilvl: number;
  name: string;
  /** Statistiques de base du slot (atk, def, maxHp, maxMana, crit, speed). */
  stats: Record<string, number>;
  affixes: Array<{ id: string; name: string; stat: string; value: number }>;
  power?: PowerDef;
}

export interface LootConfig {
  hero: HeroId;
  /** Bonus de rareté (Forge > Qualité). */
  luckPct: number;
  /** Premier boss du profil : une légendaire garantie. */
  firstBossLegendary: boolean;
  /** Pitié légendaire du profil (drops sans légendaire). */
  legendaryPity: number;
  ancestralUnlocked: boolean;
  /** +4 niveaux d'objet en Cauchemar. */
  ilvlBonus: number;
  /** Rareté minimum des objets (Faveur de la Forge). */
  minRarity?: ItemRarity;
  /** Bonus d'or (%) : Veillée > Fortune. */
  goldFindPct?: number;
}

/** Poids des statistiques hors smartLoot (par unité de stat). */
const EXTRA_WEIGHT: Record<string, number> = {
  atkPct: 1.6, critDamage: 0.5, cooldownPct: 1.1, lifesteal: 2.2, statusDamagePct: 0.6, goldFind: 0.08, shardFind: 0.2, patronResonanceBonus: 12,
};
/** Statistiques plates mises à l'échelle avec le niveau d'objet (les pourcentages ne le sont pas). */
const FLAT = new Set(['atk', 'def', 'maxHp', 'maxMana']);

const bandOf = (table: Record<string, unknown>, wave: number): string => {
  for (const k of Object.keys(table)) {
    const [a, b] = k.split('-').map(Number);
    if (wave >= a && wave <= (b ?? a)) return k;
  }
  // Vagues de boss : clé la plus proche en dessous ; au-delà : dernière tranche.
  const keys = Object.keys(table);
  const nums = keys.map((k) => Number(k.split('-')[0]));
  let best = keys[0];
  nums.forEach((n, i) => { if (n <= wave) best = keys[i]; });
  return best;
};

interface Pickup { e: number; item: Item | null; gold: number; t: number; pulled: boolean }

export class LootSystem {
  equipped: Partial<Record<Slot, Item>> = {};
  /** Poussière d'étoile gagnée (démantèlement). */
  dust = 0;
  /** Objets trouvés (ordre de ramassage). */
  found: Item[] = [];
  legendaryPity: number;
  private epicPity = 0;
  private uid = 1;
  /** Or de la run (relances payantes, succès « Trésor de guerre »). */
  gold = 0;
  goldEarned = 0;
  private readonly rng: Rng;
  private pickups: Pickup[] = [];
  private firstBossDone = false;
  // Pouvoirs légendaires
  private hits = 0;
  private cd = new Map<string, number>();
  private phoenixUsed = false;
  private moveT = 0;
  private sealBudget = 0;
  private windT = 0;
  /** Équipement changé : la scène recalcule les stats du héros. */
  onChange: (() => void) | null = null;
  /** Objet ramassé (équipé ou démantelé) : l'UI affiche un toast. */
  onItem: ((item: Item, equipped: boolean, dust: number) => void) | null = null;

  constructor(private readonly c: CombatCtx, readonly cfg: LootConfig, rng?: Rng) {
    this.legendaryPity = cfg.legendaryPity;
    this.rng = rng ?? c.rng;
  }

  // ============================================================ Tirages

  /** Un ennemi meurt : tirage selon sa source. */
  onKill(e: number, f: FoeC, x: number, y: number): void {
    this.dropGold(f.boss ? 80 + this.c.wave * 8 : f.def.elite ? 12 + this.c.wave * 2 : this.rng.int(1, 3) + Math.floor(this.c.wave / 3), x, y);
    if (f.boss) { this.bossChest(x, y); return; }
    const src = f.def.elite ? LOOT.dropTables.sources.elite : LOOT.dropTables.sources.normal;
    if (!this.rng.chance(src.chance)) { this.powerKill(e, f); return; }
    const r = this.rollRarity(src.byWave[bandOf(src.byWave, this.c.wave)]);
    this.drop(this.make(r, this.c.wave + this.cfg.ilvlBonus), x, y);
    this.powerKill(e, f);
  }

  /** Coffre du boss : 2 tirages (rare minimum). Le tout premier boss du profil donne une légendaire. */
  bossChest(x: number, y: number): void {
    const src = LOOT.dropTables.sources.boss;
    const table = src.byWave[bandOf(src.byWave, this.c.wave)];
    for (let k = 0; k < src.rolls; k++) {
      let r = this.rollRarity(table, 'rare');
      if (k === 0 && this.cfg.firstBossLegendary && !this.firstBossDone && ITEM_RARITIES.indexOf(r) < 4) r = 'legendary';
      const a = (k / src.rolls) * Math.PI * 2;
      this.drop(this.make(r, this.c.wave + this.cfg.ilvlBonus + 2), x + Math.cos(a) * 70, y + Math.sin(a) * 50);
    }
    this.firstBossDone = true;
  }

  rollRarity(weights: Partial<Record<ItemRarity, number>>, min: ItemRarity = 'common'): ItemRarity {
    const rng = this.rng, P = LOOT.pity;
    const floor = this.cfg.minRarity ?? 'common';
    if (ITEM_RARITIES.indexOf(floor) > ITEM_RARITIES.indexOf(min)) min = floor;
    const luck = 1 + this.cfg.luckPct / 100;
    const list = ITEM_RARITIES.filter((r) => ITEM_RARITIES.indexOf(r) >= ITEM_RARITIES.indexOf(min) && (r !== 'ancestral' || this.cfg.ancestralUnlocked));
    const w = list.map((r) => {
      let x = weights[r] ?? 0;
      if (r === 'legendary' && this.legendaryPity >= P.legendary.softStart) x += (this.legendaryPity - P.legendary.softStart) * P.legendary.softBonusPerDrop;
      return ITEM_RARITIES.indexOf(r) >= 2 ? x * luck : x;
    });
    let r: ItemRarity = w.some((x) => x > 0) ? rng.weighted(list, w) : min;
    const idx = () => ITEM_RARITIES.indexOf(r);
    // Pitié : épique dans la run, légendaire sur le profil.
    if (this.legendaryPity >= P.legendary.afterDropsWithout && idx() < 4) r = 'legendary';
    else if (this.epicPity >= P.epic.afterDropsWithout && idx() < 3) r = 'epic';
    this.epicPity = idx() >= 3 ? 0 : this.epicPity + 1;
    this.legendaryPity = idx() >= 4 ? 0 : this.legendaryPity + 1;
    return r;
  }

  /** Fabrique un objet : stats de base × statMul × (1 + 0,06 × ilvl), affixes, pouvoir légendaire. */
  make(rarity: ItemRarity, ilvl: number, slot?: Slot): Item {
    const rng = this.rng, R = LOOT.rarities[rarity];
    const s = slot ?? rng.pick(SLOTS);
    const scale = 1 + LOOT.itemLevel.statScalePerIlvl * ilvl;
    const roll = (lo: number, hi: number) => (R.perfectRoll ? hi : lo + (hi - lo) * rng.next());
    const round = (stat: string, v: number) => (FLAT.has(stat) ? Math.round(v) : Math.round(v * 1000) / 1000);
    const stats: Record<string, number> = {};
    for (const [k, [lo, hi]] of Object.entries(LOOT.slots[s].baseStats)) stats[k] = round(k, roll(lo, hi) * R.statMul * (FLAT.has(k) ? scale : 1));
    const n = rng.int(R.affixes[0], R.affixes[1]);
    const pool = LOOT.affixes.filter((a) => a.slots.includes(s) && ITEM_RARITIES.indexOf(rarity) >= ITEM_RARITIES.indexOf(a.minRarity ?? 'common'));
    const affixes: Item['affixes'] = [];
    for (let k = 0; k < n && pool.length; k++) {
      const a = rng.weighted(pool, pool.map((x) => x.weight));
      pool.splice(pool.indexOf(a), 1);
      const v = roll(a.range[0], a.range[1]) * (FLAT.has(a.stat) ? scale * (1 + 0.15 * ITEM_RARITIES.indexOf(rarity)) : 1);
      affixes.push({ id: a.id, name: a.name, stat: a.stat, value: round(a.stat, v) });
    }
    let power: PowerDef | undefined;
    if (R.legendaryPower) {
      const all = LOOT.legendaryPowers.filter((p) => p.slot === s);
      const mine = all.filter((p) => !p.hero || p.hero === this.cfg.hero);
      power = rng.pick(rng.chance(LOOT.smartLoot.heroBias) && mine.length ? mine : all);
    }
    const name = power ? power.name : affixes.length ? `${LOOT.slots[s].label} ${affixes[0].name}` : LOOT.slots[s].label;
    return { uid: this.uid++, slot: s, rarity, ilvl, name, stats, affixes, power };
  }

  // ============================================================ Au sol et ramassage

  drop(item: Item, x: number, y: number): void {
    const c = this.c, R = LOOT.rarities[item.rarity];
    const color = parseInt(R.color.slice(1), 16);
    const e = c.world.create();
    c.world.add(e, Transform, makeTransform(x, y));
    const node = new Container();
    const glow = new Sprite(c.fx.glow);
    glow.anchor.set(0.5); glow.tint = color; glow.blendMode = 'add'; glow.scale.set(0.9 + R.fx.glow, 0.45 + R.fx.glow * 0.3); glow.alpha = 0.8;
    node.addChild(glow);
    if (R.fx.beam) {
      const beam = new Sprite(c.fx.glow);
      beam.anchor.set(0.5, 1); beam.tint = color; beam.blendMode = 'add'; beam.scale.set(0.22, 2.4 + R.fx.glow * 2); beam.alpha = 0.55;
      node.addChild(beam);
    }
    const icon = new Text({ text: LOOT.slots[item.slot].icon, style: { fontSize: 26, fill: 0xffffff } });
    icon.anchor.set(0.5); icon.y = -22;
    node.addChild(icon);
    attachView(c.world, c.g.renderer, e, node, 'entities', 20);
    this.pickups.push({ e, item, gold: 0, t: 0, pulled: false });
    if (R.fx.dropShake) c.g.camera.shake(R.fx.dropShake * 0.06);
    if (R.fx.slowMo) c.g.hitStop(R.fx.slowMo, 0.3);
    c.particles.emit(x, y - 20, { color, count: 10 + ITEM_RARITIES.indexOf(item.rarity) * 6, speed: 160, size: 0.5, life: 0.6 });
    c.g.events.emit('loot:drop', { rarity: item.rarity, x, y, slot: item.slot, name: item.name });
  }

  /** Pièces d'or au sol (bonus : Pillard, Fortune, Ruée vers l'or). */
  dropGold(base: number, x: number, y: number): void {
    const c = this.c;
    const amount = Math.max(1, Math.round(base * c.mods.goldMul * (1 + ((this.bonus().goldFind ?? 0) + (this.cfg.goldFindPct ?? 0)) / 100)));
    const e = c.world.create();
    c.world.add(e, Transform, makeTransform(x + this.rng.range(-20, 20), y + this.rng.range(-14, 14)));
    const node = new Container();
    const glow = new Sprite(c.fx.glow);
    const big = amount >= 20;
    glow.anchor.set(0.5); glow.tint = 0xffc94a; glow.blendMode = 'add'; glow.scale.set(big ? 0.7 : 0.4, big ? 0.4 : 0.24);
    const coin = new Sprite(c.fx.glow);
    coin.anchor.set(0.5); coin.tint = 0xfff0b0; coin.scale.set(big ? 0.22 : 0.13); coin.y = -8;
    node.addChild(glow, coin);
    attachView(c.world, c.g.renderer, e, node, 'entities', 10);
    this.pickups.push({ e, item: null, gold: amount, t: 0.2, pulled: false });
  }

  /** Fin de vague : tout le butin restant vole vers le héros. */
  collectAll(): void { for (const p of this.pickups) p.pulled = true; }

  update(dt: number): void {
    const c = this.c, pt = c.world.get(c.player, Transform)!;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      const t = c.world.get(p.e, Transform);
      if (!t) { this.pickups.splice(i, 1); continue; }
      const dx = pt.x - t.x, dy = pt.y - t.y, d = Math.hypot(dx, dy) || 1;
      if (p.t > 0.5 && (d < (p.item ? 170 : 230) || p.pulled)) {
        const sp = Math.min(d / dt, 380 + p.t * 400);
        t.x += (dx / d) * sp * dt; t.y += (dy / d) * sp * dt;
      }
      if (d < 38 && p.t > 0.5) {
        this.pickups.splice(i, 1); c.world.destroy(p.e);
        if (p.item) this.take(p.item);
        else {
          this.gold += p.gold; this.goldEarned += p.gold;
          c.stats.max('goldHeld', this.gold);
          c.g.events.emit('currency:pickup', { currency: 'gold', amount: p.gold });
        }
      }
    }
    this.updatePowers(dt);
  }

  /** Ramasse : équipe si meilleur que l'objet porté, sinon démantèle. */
  take(item: Item): void {
    const c = this.c;
    this.found.push(item);
    const cur = this.equipped[item.slot];
    const better = !cur || this.score(item) > this.score(cur);
    let dust = 0;
    if (better) {
      if (cur) dust = this.salvage(cur);
      this.equipped[item.slot] = item;
      this.onChange?.();
    } else dust = this.salvage(item);
    if (item.rarity === 'legendary' || item.rarity === 'ancestral') c.stats.add(item.rarity === 'legendary' ? 'legendaryFound' : 'ancestralFound');
    c.stats.max('equippedEpicPlus', Object.values(this.equipped).filter((x) => x && ITEM_RARITIES.indexOf(x.rarity) >= 3).length);
    c.g.events.emit('loot:pickup', { rarity: item.rarity, slot: item.slot, name: item.name, equipped: better, dust });
    this.onItem?.(item, better, dust);
  }

  private salvage(item: Item): number {
    const d = LOOT.salvage.dust[item.rarity] ?? 1;
    this.dust += d;
    this.c.stats.add('salvaged');
    return d;
  }

  /** Valeur d'un objet pour le héros joué (smartLoot.heroWeights). */
  score(item: Item): number {
    const w = LOOT.smartLoot.heroWeights[this.cfg.hero];
    let s = 0;
    for (const [k, v] of Object.entries(item.stats)) s += v * (w[k] ?? 1);
    for (const a of item.affixes) s += a.value * (w[a.stat] ?? EXTRA_WEIGHT[a.stat] ?? 0.5);
    if (item.power && (!item.power.hero || item.power.hero === this.cfg.hero)) s += 12 + item.ilvl * 0.5;
    return s;
  }

  /** Bonus cumulés de l'équipement porté (stats plates, pourcentages, drapeaux de pouvoirs). */
  bonus(): Record<string, number> {
    const out: Record<string, number> = {};
    const add = (k: string, v: number) => (out[k] = (out[k] ?? 0) + v);
    for (const it of Object.values(this.equipped)) {
      if (!it) continue;
      for (const [k, v] of Object.entries(it.stats)) add(k, v);
      for (const a of it.affixes) add(a.stat, a.value);
      if (it.power?.id === 'chronoring') add('cooldownPct', 15);
      if (it.power?.id === 'new_oathbreaker') add('oathbreaker', 1);
      if (it.power?.id === 'new_eclipse') add('eclipse', 1);
    }
    return out;
  }

  /** Bonus transmis au moteur de bénédictions. */
  blessBonus(): Record<string, number> {
    const b = this.bonus();
    return { critDamage: b.critDamage ?? 0, lifesteal: b.lifesteal ?? 0, statusDamagePct: b.statusDamagePct ?? 0,
      patronResonanceBonus: b.patronResonanceBonus ?? 0, oathbreaker: b.oathbreaker ?? 0, eclipse: b.eclipse ?? 0 };
  }

  has(power: string): boolean {
    return Object.values(this.equipped).some((it) => it?.power?.id === power && (!it.power.hero || it.power.hero === this.cfg.hero));
  }
  get naked(): boolean { return !Object.values(this.equipped).some(Boolean); }

  // ============================================================ Pouvoirs légendaires (comportements simplifiés)

  private ready(id: string, cd: number): boolean {
    if ((this.cd.get(id) ?? 0) > this.c.time) return false;
    this.cd.set(id, this.c.time + cd);
    return true;
  }
  private get atk(): number { return this.c.bless.heroAtk(); }

  /** Coup direct d'une technique du héros. */
  onHit(e: number, dmg: number): void {
    const c = this.c;
    const t = c.world.get(e, Transform);
    if (!t) return;
    this.hits++;
    if (this.has('crimson') && this.hits % 3 === 0) {
      for (const f of foesAround(c, t.x, t.y, 220, e).slice(0, 3)) {
        const ft = c.world.get(f, Transform)!;
        c.feedback.streak(t.x, t.y - BODY_Y, ft.x, ft.y - BODY_Y, 0xff3050, 10);
        c.damageFoe(f, Math.round(this.atk * 0.65), { noProc: true, fromX: t.x, fromY: t.y, knock: 120 });
      }
    }
    if (this.has('moonstaff') && this.hits % 4 === 0) c.bless.areaDamage(t.x, t.y, 130, this.atk * 0.7, 'givre', 1, undefined, undefined, 80);
    if (this.has('shadowblade') && this.hits % 3 === 0 && c.world.isAlive(e)) {
      const f = c.world.get(e, Foe);
      if (f) f.cd += 0.4;
      c.damageFoe(e, Math.round(this.atk * 0.6), { noProc: true });
    }
    if (this.has('hunter') && this.ready('hunter', 3)) {
      const next = foesAround(c, t.x, t.y, 420, e)[0];
      if (next !== undefined) {
        const nt = c.world.get(next, Transform)!;
        c.feedback.streak(t.x, t.y - BODY_Y, nt.x, nt.y - BODY_Y, 0xffd65c, 8);
        c.damageFoe(next, Math.round(dmg * 0.8), { noProc: true, fromX: t.x, fromY: t.y, knock: 120 });
      }
    }
    if (this.has('plague') && c.rng.chance(0.3)) applyStatus(c, e, 'poison', 1);
    if (this.has('bloodseal') && this.sealBudget > 0) {
      const heal = Math.min(dmg * 0.09, this.sealBudget);
      this.sealBudget -= heal;
      c.bless.heal(heal);
    }
  }

  onHurt(attacker: number | undefined): void {
    const c = this.c, h = c.world.get(c.player, Hero)!, hp = c.world.get(c.player, Health)!, t = c.world.get(c.player, Transform)!;
    if (this.has('aegis') && this.ready('aegis', 8)) {
      c.bless.gainShield(15 + h.def_);
      c.bless.areaDamage(t.x, t.y, 170, this.atk * 0.2, undefined, 1, undefined, undefined, 520);
    }
    if (this.has('frostmail') && this.ready('frostmail', 7)) {
      for (const f of foesAround(c, t.x, t.y, 220)) applyStatus(c, f, 'givre', 2);
      c.bless.areaDamage(t.x, t.y, 220, this.atk * 0.35, 'choc', 1, undefined, undefined, 100);
    }
    if (this.has('new_juge') && attacker !== undefined && c.world.isAlive(attacker)) applyStatus(c, attacker, 'marque', 1);
    if (this.has('phoenix') && !this.phoenixUsed && hp.hp > 0 && hp.hp / hp.max < 0.3) {
      this.phoenixUsed = true;
      hp.hp = Math.min(hp.max, hp.hp + hp.max * 0.3);
      h.invuln = Math.max(h.invuln, 1.4);
      c.feedback.ring(t.x, t.y - BODY_Y, 160, 0xff9a4a, 0.6, 14);
      c.particles.emit(t.x, t.y - BODY_Y, { color: 0xff9a4a, count: 50, speed: 260, size: 0.7, life: 0.9, gravity: -120 });
      c.feedback.number(t.x, t.y - 160, 'Phénix', { color: 0xffb070, size: 24 });
      c.stats.addWave('phoenix');
    }
  }

  /** Coup mortel : le Manteau du Phénix l'annule une fois par vague. */
  onLethal(): boolean {
    if (!this.has('phoenix') || this.phoenixUsed) return false;
    const hp = this.c.world.get(this.c.player, Health)!;
    hp.hp = Math.max(hp.hp, 1);
    this.onHurt(undefined);
    return this.phoenixUsed;
  }

  private powerKill(e: number, f: FoeC): void {
    const c = this.c;
    if (this.has('new_juge') && f.statuses.marque) c.bless.heal(c.world.get(c.player, Health)!.max * 0.04);
    if (this.has('wind')) this.windT = 2;
    void e;
  }

  onDodge(x: number, y: number): void {
    const c = this.c;
    if (this.has('phantom')) c.bless.areaDamage(x, y, 130, this.atk * 0.6, undefined, 1, undefined, undefined, 260);
    if (this.has('new_brumepas')) {
      c.hazards.add({ side: 'hero', zone: { shape: 'circle', x, y, r: 70 }, delay: 0.1, linger: 2, tickEvery: 0.5, damage: Math.max(1, Math.round(this.atk * 0.1)),
        color: 0xaade8f, status: 'poison', stacks: 2, knock: 0, owner: -1 });
    }
  }

  onSkill(_i: number): void { /* réservé (Arc : Élan) */ }

  /** Vitesse de déplacement apportée par les pouvoirs (Bottes du vent). */
  moveMul(): number { return this.windT > 0 ? 1.25 : 1; }

  waveStart(): void { this.phoenixUsed = false; }

  private updatePowers(dt: number): void {
    const c = this.c;
    const hp = c.world.get(c.player, Health)!;
    this.sealBudget = Math.min(hp.max * 0.05, this.sealBudget + hp.max * 0.05 * dt);
    this.windT = Math.max(0, this.windT - dt);
    if (this.has('stormstep')) {
      const v = c.g.input.move;
      this.moveT = Math.hypot(v.x, v.y) > 0.3 ? this.moveT + dt : 0;
      if (this.moveT >= 1.5) {
        this.moveT = 0;
        const t = c.world.get(c.player, Transform)!;
        const f = foesAround(c, t.x, t.y, 380)[0];
        if (f !== undefined) {
          const ft = c.world.get(f, Transform)!;
          c.feedback.streak(ft.x + 20, ft.y - 380, ft.x, ft.y - BODY_Y, 0xffd65c, 12);
          c.damageFoe(f, Math.round(this.atk * 0.5), { lightning: true, status: 'choc', stacks: 1 });
        }
      }
    }
  }
}

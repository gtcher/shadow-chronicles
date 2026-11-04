import { shieldCap } from './rules';
import { Transform, Velocity, type Rng } from '@engine';
import { Health } from '../components';
import { Foe, Hero, type FoeC, type HeroC } from './components';
import { BODY_Y, type CombatCtx } from './context';
import type { FoeStatusId } from './data';
import { applyStatus, foesAround, isSlowed } from './status';
import blessingsJson from '../../../data/blessings.json';

/**
 * Moteur des bénédictions (data/blessings.json) : offres de fin de vague, emplacements,
 * raretés, résonances 2/4/6, duos et légendaires, et interprétation du DSL d'effets
 * (déclencheurs onHit, onSkill, onDodge, onHurt, onKill… et leurs actions).
 */
export type Rarity = 'commun' | 'rare' | 'epique' | 'heroique';
export const RARITIES: Rarity[] = ['commun', 'rare', 'epique', 'heroique'];
type Num = number | string;
export interface Action { type: string; [k: string]: unknown }
export interface Effect { trigger: string; skill?: number; chance?: Num; cooldown?: number; condition?: string; every?: number; oncePer?: string; status?: string; action: Action; extra?: Action; cost?: Record<string, unknown>; drawback?: { stat: string; addPct: number } }
export interface BlessingDef { id: string; patron: string; slot: string; name: string; desc: string; values?: Partial<Record<Rarity, number>>; tags: string[]; effect: Effect }
export interface DuoDef { id: string; patrons: string[]; name: string; desc: string; requires: { anyTags: string[][] }; effect: Effect }
export interface LegendaryDef { id: string; patron: string; name: string; desc: string; requires: { patronCount: number; anyOf: string[] }; effect: Effect }
export interface Owned { blessing: BlessingDef; rarity: Rarity }
export interface OfferChoice { blessing: BlessingDef; rarity: Rarity; upgradeFrom?: Rarity }

interface Data {
  rarities: Record<Rarity, { name: string; weight: number; minWave: number }>;
  offerRules: { choices: number; rerollBase: number; maxSamePatronInOffer: number; guaranteeNewPatronBeforeWave: number; upgradeOfferChance: number; pityRareAfterCommonOffers: number; heroAffinityWeightBonus: number; rarityPerWavePct?: number };
  patrons: Record<string, { name: string; icon: string; color: string; heroAffinity: string[]; forbidden?: boolean; resonance: Array<{ count: number; desc: string }> }>;
  blessings: BlessingDef[];
  duos: DuoDef[];
  legendaries: LegendaryDef[];
}
export const BLESSING_DATA = blessingsJson as unknown as Data;

/** Ce que la méta-progression (Sanctuaire) apporte à une run. */
export interface RunConfig {
  patrons: string[];
  rerolls: number;
  rarityLuckPct: number;
  /** Bonus permanents de la Veillée. */
  maxHpPct: number; atkPct: number; defPct: number; crit: number; maxManaPct: number; potions: number;
  lootLuckPct: number;
  /** Pour la légendaire garantie du premier boss. */
  firstBossLegendary: boolean;
}
export const DEFAULT_RUN_CONFIG: RunConfig = {
  patrons: ['veilleurs', 'lune', 'sang'], rerolls: 0, rarityLuckPct: 0,
  maxHpPct: 0, atkPct: 0, defPct: 0, crit: 0, maxManaPct: 0, potions: 0, lootLuckPct: 0, firstBossLegendary: false,
};

/** Remplace "{v}" par la valeur de la rareté, récursivement. */
export function resolve<T>(x: T, v: number): T {
  if (x === '{v}') return v as unknown as T;
  if (Array.isArray(x)) return x.map((y) => resolve(y, v)) as unknown as T;
  if (x && typeof x === 'object') { const o: Record<string, unknown> = {}; for (const [k, y] of Object.entries(x)) o[k] = resolve(y, v); return o as T; }
  return x;
}

interface Active { id: string; effect: Effect; v: number; kind: 'blessing' | 'duo' | 'legendary' }
interface Ctx { target?: number; x?: number; y?: number; skill?: number; amount?: number; attacker?: number }

export class BlessingEngine {
  owned: Owned[] = [];
  duos: DuoDef[] = [];
  legendaries: LegendaryDef[] = [];
  rerolls: number;
  private offersWithoutRare = 0;
  private active: Active[] = [];
  /** Statistiques passives agrégées (en %, sauf indication). */
  stat: Record<string, number> = {};
  private ready = new Map<string, number>();
  private oncePerWave = new Set<string>();
  private buffs: Array<{ stat: string; pct: number; charges: number }> = [];
  private movingT = 0;
  private everyT = 0;
  private stormT = 0;
  private stormReady = false;
  private inLightning = false;
  private inSpread = false;
  /** Statut appliqué par l'esquive le long du trajet (Éclair fendu). */
  dashStatus: FoeStatusId | null = null;
  /** Bonus apportés par l'équipement (fournis par LootSystem). */
  itemBonus: Record<string, number> = {};

  /** Relances payées en or pendant la run (coût 40 / 80 / 160…). */
  paidRerolls = 0;
  /** Flux de tirage des offres (graine du défi quotidien ; sinon celui de la scène). */
  private readonly offerRng: Rng;

  constructor(private readonly c: CombatCtx, readonly cfg: RunConfig, offerRng?: Rng) {
    this.rerolls = BLESSING_DATA.offerRules.rerollBase + cfg.rerolls;
    this.offerRng = offerRng ?? c.rng;
  }

  /** Coût en or de la prochaine relance payante. */
  rerollGoldCost(): number { return Math.round(40 * 2 ** this.paidRerolls * this.c.mods.rerollCostMul); }

  private get hero(): HeroC { return this.c.world.get(this.c.player, Hero)!; }
  private get t() { return this.c.world.get(this.c.player, Transform)!; }
  private get hp() { return this.c.world.get(this.c.player, Health)!; }

  // ============================================================ Requêtes

  heroAtk(): number { const h = this.hero; return h.atk * h.atkMul; }
  critChance(): number { return this.hero.crit; }
  critMultiplier(): number { return 1.75 + (this.stat.critDamage ?? 0) / 100 + (this.itemBonus.critDamage ?? 0) / 100; }
  patronCount(p: string): number {
    const n = this.owned.filter((o) => o.blessing.patron === p).length;
    if (n === 0) return 0;
    const main = this.mainPatron();
    return n + (this.itemBonus.patronResonanceBonus ?? 0) + (this.itemBonus.eclipse && p === main ? 1 : 0);
  }
  res(p: string, level: number): boolean { return this.patronCount(p) >= level; }
  mainPatron(): string | null {
    const counts = new Map<string, number>();
    for (const o of this.owned) counts.set(o.blessing.patron, (counts.get(o.blessing.patron) ?? 0) + 1);
    let best: string | null = null, n = 0;
    for (const [p, k] of counts) if (k > n) { n = k; best = p; }
    return best;
  }
  statusCap(id: FoeStatusId, base: number): number {
    if (id === 'poison' && this.res('brume', 4)) return 8;
    if (id === 'saignement' && this.legendaries.some((l) => l.id === 'leg_sang')) return 999;
    return base;
  }
  givreBonusTime(): number { return this.res('lune', 2) ? 1 : 0; }
  dotCanCrit(): boolean { return this.res('sang', 4); }
  dotMultiplier(f: FoeC): number {
    let m = 1 + (this.itemBonus.statusDamagePct ?? 0) / 100;
    const syn = this.duos.find((d) => d.id === 'duo_sang_brume');
    if (syn && f.statuses.saignement && f.statuses.poison) m *= 1 + 0.1 * f.statuses.poison.stacks;
    return m;
  }
  /** Coût d'une technique (certaines bénédictions paient en PV). */
  skillCost(i: number, mana: number): { mana: number; hpPct: number; currentHpPct: number } {
    const out = { mana, hpPct: 0, currentHpPct: 0 };
    for (const a of this.active) {
      if (a.effect.trigger !== 'onSkill' || a.effect.skill !== i || !a.effect.cost) continue;
      const cost = a.effect.cost as { hpPct?: number; replacesMana?: boolean; currentHpPct?: number };
      if (cost.hpPct) { out.hpPct += cost.hpPct; if (cost.replacesMana) out.mana = 0; }
      if (cost.currentHpPct) out.currentHpPct += cost.currentHpPct;
    }
    return out;
  }

  // ============================================================ Dégâts

  /** Multiplicateur des dégâts sortants (avant défense / garde). */
  outgoing(_e: number, f: FoeC, o: { skill?: number; lightning?: boolean; dot?: boolean; crit?: boolean }): number {
    if (o.dot) return 1;
    const h = this.hero, hp = this.hp;
    let pct = (this.stat.damage ?? 0) + (this.itemBonus.damage ?? 0);
    for (const a of this.active) {
      if (a.effect.trigger === 'passive' && a.effect.condition === 'hasShield' && a.effect.action.type === 'stat' && a.effect.action.stat === 'damage' && h.shield > 0) pct += a.v;
    }
    const st = (k: string) => (this.stat[k] ?? 0) + (o.skill === 0 ? this.stat[`${k}@0`] ?? 0 : 0);
    if (f.statuses.marque) pct += st('dmgVsMarked');
    if (isSlowed(f)) pct += st('dmgVsSlowed') + (this.res('lune', 4) ? 20 : 0);
    if (o.skill === 2) pct += this.stat.skillDamage2 ?? 0;
    if (o.skill === 3) pct += this.stat.skillDamage3 ?? 0;
    if (f.statuses.poison) pct += st('dmgPerPoisonStack') * f.statuses.poison.stacks;
    if (o.lightning && f.statuses.gel) pct += this.stat.lightningVsFrozen ?? 0;
    if (this.res('sang', 6) && hp.hp / hp.max < 0.4) pct += 30;
    let mul = 1 + pct / 100;
    // Charges de buff consommées par les coups directs.
    if (!o.lightning) {
      for (const b of this.buffs) if (b.stat === 'damage' && b.charges > 0) { mul *= 1 + b.pct / 100; b.charges--; }
      this.buffs = this.buffs.filter((b) => b.charges > 0);
    }
    if (o.crit) mul *= this.critMultiplier() / 1.75;
    return mul;
  }

  /** Après un coup direct : vol de vie, déclencheurs onHit. */
  afterHit(e: number, f: FoeC, dmg: number, o: { skill?: number; lightning?: boolean }): void {
    const hp = this.hp;
    let ls = (this.stat.lifesteal ?? 0) + (o.skill === 0 ? this.stat['lifesteal@0'] ?? 0 : 0) + (this.itemBonus.lifesteal ?? 0) + (this.res('sang', 2) ? 3 : 0);
    for (const b of this.buffs) if (b.stat === 'lifesteal' && b.charges > 0) { ls += b.pct; b.charges--; }
    if (this.res('sang', 6) && hp.hp / hp.max < 0.4) ls *= 2;
    if (ls > 0) {
      // Vol de vie : au plus 0,8 % des PV max par seconde (les frappes de zone touchent beaucoup d'ennemis).
      const now = this.c.time;
      if (now - this.lsWindow >= 1) { this.lsWindow = now; this.lsHealed = 0; }
      const amt = Math.min(dmg * ls / 100, hp.max * 0.008 - this.lsHealed);
      if (amt > 0) { this.lsHealed += amt; this.heal(amt); }
    }
    if (o.lightning) return;
    const t = this.c.world.get(e, Transform);
    this.fire('onHit', { target: e, skill: o.skill, x: t?.x, y: t?.y, amount: dmg }, f);
  }

  /** Éclair qui saute d'ennemi en ennemi (Choc, Arc, duos d'Orage). */
  lightning(from: number, dmg: number, jumps: number): void {
    const c = this.c;
    const extra = this.res('orage', 4) ? 1 : 0;
    const hit = new Set<number>([from]);
    const ft = c.world.get(from, Transform);
    if (!ft) return;
    let px = ft.x, py = ft.y;
    for (let k = 0; k < jumps + extra; k++) {
      const next = foesAround(c, px, py, 260).find((x) => !hit.has(x));
      if (next === undefined) break;
      hit.add(next);
      const nt = c.world.get(next, Transform)!;
      c.feedback.streak(px, py - BODY_Y, nt.x, nt.y - BODY_Y, 0xffd65c, 10);
      const nf = c.world.get(next, Foe)!;
      if (this.stat.lightningVsFrozen && nf.statuses.gel) delete nf.statuses.gel;
      c.damageFoe(next, Math.max(1, Math.round(dmg)), { lightning: true, fromX: px, fromY: py });
      px = nt.x; py = nt.y;
    }
    if (!this.inLightning) {
      this.inLightning = true;
      this.fire('onLightning', { target: from, amount: dmg });
      this.inLightning = false;
    }
  }

  private lsWindow = 0;
  private lsHealed = 0;

  gainShield(amount: number): void {
    if (amount <= 0) return;
    const h = this.hero;
    h.shield = Math.max(h.shield, Math.min(shieldCap(this.hp.max), h.shield + amount));
    this.c.g.events.emit('player:shield', {});
    this.fire('onShieldGain', { amount });
  }

  heal(amount: number): number {
    const hp = this.hp;
    amount *= 1 + ((this.stat.healingReceived ?? 0) + (this.legendaries.some((l) => l.id === 'leg_sang') ? 25 : 0)) / 100;
    if (amount <= 0) return 0;
    amount *= this.c.mods.healMul;
    const before = hp.hp;
    hp.hp = Math.min(hp.max, hp.hp + amount);
    const over = amount - (hp.hp - before);
    const duo = this.duos.find((d) => d.id === 'duo_garde_sang');
    if (duo && over > 0) { const h = this.hero; h.shield = Math.max(h.shield, Math.min(hp.max * 0.15, h.shield + over)); }
    if (amount > 10) this.fire('onHeal', { amount });
    return amount;
  }

  // ============================================================ Événements de combat

  onSkill(i: number, x: number, y: number): void {
    this.fire('onSkill', { skill: i, x, y });
    if (this.stormReady && i > 0) {
      this.stormReady = false; this.stormT = 0;
      this.strikes(4, 150, 'choc');
    }
  }
  onDodge(x: number, y: number): void {
    this.fire('onDodge', { x, y });
    // Résonance Brume 6 : voile d'invisibilité (approché par une invulnérabilité prolongée) et frappe +100 %.
    if (this.res('brume', 6)) {
      const h = this.hero;
      h.invuln = Math.max(h.invuln, 1.5);
      if (!this.buffs.some((b) => b.stat === 'damage' && b.pct === 100)) this.buffs.push({ stat: 'damage', pct: 100, charges: 1 });
    }
  }
  /** Un coup évité pendant l'esquive (condition « avoidedHit »). */
  onDodgeAvoid(x: number, y: number): void { this.fire('onDodge', { x, y, amount: -1 }); }
  onPerfectDodge(_x: number, _y: number): void { /* réservé : effets propres à l'esquive parfaite */ }
  has(id: string): boolean { return this.duos.some((d) => d.id === id) || this.legendaries.some((l) => l.id === id); }
  onHurt(attacker: number | undefined, dmg: number): void { this.fire('onHurt', { attacker, amount: dmg, target: attacker }); }
  /** Coup mortel : renvoie vrai s'il est annulé. */
  onLethal(): boolean {
    for (const a of this.active) {
      if (a.effect.trigger !== 'onLethal' || this.oncePerWave.has(a.id)) continue;
      this.oncePerWave.add(a.id);
      this.exec(a, a.effect.action, {});
      return true;
    }
    return false;
  }
  onKill(e: number, f: FoeC, x: number, y: number): void { this.fire('onKill', { target: e, x, y }, f); }
  onShatter(e: number): void {
    const t = this.c.world.get(e, Transform);
    this.fire('onShatter', { target: e, x: t?.x, y: t?.y });
    if (this.res('lune', 6) && t) this.areaDamage(t.x, t.y, 110, this.heroAtk() * 0.9, 'givre', 1);
  }
  onStatus(e: number, id: string): void {
    if (this.inSpread) return;
    this.inSpread = true;
    const t = this.c.world.get(e, Transform);
    for (const a of this.active) if (a.effect.trigger === 'onStatus' && a.effect.status === id) this.exec(a, a.effect.action, { target: e, x: t?.x, y: t?.y });
    this.inSpread = false;
  }
  onShieldBreak(): void {
    if (!this.res('veilleurs', 6)) return;
    const t = this.t;
    this.areaDamage(t.x, t.y, 140, this.heroAtk() * 1.2, 'marque', 1);
    this.c.feedback.ring(t.x, t.y - 10, 140, 0xffe5a8, 0.45, 10);
  }
  waveStart(): void {
    this.oncePerWave.clear();
    if (this.res('veilleurs', 4)) this.gainShield(this.hp.max * 0.15);
  }

  update(dt: number): void {
    const v = this.c.world.get(this.c.player, Velocity)!;
    const moving = Math.hypot(v.x, v.y) > 60;
    this.movingT = moving ? this.movingT + dt : 0;
    for (const a of this.active) {
      if (a.effect.condition === 'moving>=2s' && this.movingT >= 2 && this.ok(a)) {
        this.movingT = 0;
        if (!this.buffs.some((b) => b.stat === 'damage' && b.pct === a.v)) this.exec(a, a.effect.action, {});
      }
    }
    this.everyT += dt;
    if (this.everyT >= 1) {
      this.everyT -= 1;
      const t = this.t;
      for (const a of this.active) if (a.effect.trigger === 'every' && this.cond(a.effect.condition, {})) this.exec(a, a.effect.action, { x: t.x, y: t.y });
    }
    if (this.res('orage', 6) && !this.stormReady) { this.stormT += dt; if (this.stormT >= 6) this.stormReady = true; }
  }

  /** Bonus d'attaque par % de PV manquants (Frénésie). */
  attackSpeedBonus(): number {
    let pct = (this.stat.attackSpeed ?? 0) + (this.res('orage', 2) ? 6 : 0);
    const fr = this.active.find((a) => a.effect.action.stat === 'attackSpeed' && a.effect.action.addPctPerMissingHp10 !== undefined);
    if (fr) {
      const steps = Math.min(Number(fr.effect.action.maxSteps ?? 5), Math.floor((1 - this.hp.hp / this.hp.max) * 10));
      pct += fr.v * steps;
    }
    return pct;
  }

  // ============================================================ Interprète du DSL

  private fire(trigger: string, ctx: Ctx, f?: FoeC): void {
    for (const a of this.active) {
      const e = a.effect;
      if (e.trigger !== trigger) continue;
      if (e.skill !== undefined && ctx.skill !== e.skill) continue;
      if (!this.cond(e.condition, ctx, f)) continue;
      if (!this.ok(a)) continue;
      if (e.chance !== undefined && !this.c.rng.chance(Number(resolve(e.chance, a.v)) / 100)) continue;
      if (e.cooldown) this.ready.set(a.id, this.c.time + e.cooldown);
      this.exec(a, e.action, ctx);
      if (e.extra && e.extra.type !== 'stat') this.exec(a, e.extra, ctx);
    }
  }

  private ok(a: Active): boolean { return (this.ready.get(a.id) ?? 0) <= this.c.time; }

  private cond(cond: string | undefined, ctx: Ctx, f?: FoeC): boolean {
    if (ctx.amount === -1) return cond === 'avoidedHit'; // coup évité : seuls les effets « avoidedHit »
    if (!cond) return true;
    if (cond === 'hasShield') return this.hero.shield > 0;
    if (cond === 'moving>=2s') return false; // géré dans update()
    if (cond === 'target.poisoned') return !!f?.statuses.poison;
    if (cond === 'avoidedHit') return ctx.amount === -1;
    const m = /^amount>(\d+)$/.exec(cond);
    if (m) return (ctx.amount ?? 0) > Number(m[1]);
    return true;
  }

  private exec(a: Active, raw: Action, ctx: Ctx): void {
    const act = resolve(raw, a.v) as Action & Record<string, number & string & boolean & number[]>;
    const c = this.c, h = this.hero, t = this.t;
    const at = (): { x: number; y: number } => {
      if (ctx.target !== undefined) { const tt = c.world.get(ctx.target, Transform); if (tt) return tt; }
      if (ctx.x !== undefined && ctx.y !== undefined) return { x: ctx.x, y: ctx.y };
      return t;
    };
    const atk = this.heroAtk();
    switch (act.type) {
      case 'stat': break; // agrégé dans recompute()
      case 'status': {
        const stacks = Number(act.stacks ?? 1);
        if (act.target === 'attacker') { if (ctx.attacker && c.world.isAlive(ctx.attacker)) applyStatus(c, ctx.attacker, act.status, stacks); }
        else if (act.target === 'nearest') { const n = foesAround(c, t.x, t.y, 400)[0]; if (n !== undefined) applyStatus(c, n, act.status, stacks); }
        else if (act.radius) { for (const f of foesAround(c, t.x, t.y, act.radius)) applyStatus(c, f, act.status, stacks); }
        else if (act.status === 'gel' && ctx.target !== undefined && a.effect.trigger === 'onStatus') {
          const p = at();
          for (const f of foesAround(c, p.x, p.y, Number(act.radius ?? 80), ctx.target)) applyStatus(c, f, 'gel');
        } else if (ctx.target !== undefined && c.world.isAlive(ctx.target)) applyStatus(c, ctx.target, act.status, stacks);
        else { const p = at(); for (const f of foesAround(c, p.x, p.y, 200)) applyStatus(c, f, act.status, stacks); }
        break;
      }
      case 'spreadStatus': {
        const p = at();
        for (const f of foesAround(c, p.x, p.y, Number(act.radius ?? 80), ctx.target)) applyStatus(c, f, act.status as FoeStatusId);
        break;
      }
      case 'shield': {
        const amt = act.maxHpPct ? this.hp.max * act.maxHpPct / 100 : Number(act.flat ?? 0) + Number(act.defMul ?? 0) * h.def_;
        this.gainShield(amt);
        if (act.duration) h.invuln = Math.max(h.invuln, 0.3);
        c.feedback.ring(t.x, t.y - BODY_Y * 0.5, 80, 0xffe5a8, 0.4, 6);
        break;
      }
      case 'damage': {
        let dmg = atk * Number(act.atkPct ?? 0) / 100;
        if (act.shieldPct) { dmg += h.shield * act.shieldPct / 100; if (act.consumeShield) h.shield = 0; }
        const p = { ...at() };
        const go = () => {
          if (act.target === 'chain') { const from = ctx.target ?? foesAround(c, p.x, p.y, 300)[0]; if (from !== undefined) { c.damageFoe(from, Math.round(dmg), { lightning: true }); this.lightning(from, dmg, Number(act.chains ?? 2)); } return; }
          if (act.radius) { this.areaDamage(p.x, p.y, act.radius, dmg, act.status as FoeStatusId | undefined, Number(act.stacks ?? 1), act.spreadStatus as FoeStatusId | undefined, ctx.target, Number(act.knockback ?? 160)); return; }
          if (ctx.target !== undefined && c.world.isAlive(ctx.target)) c.damageFoe(ctx.target, Math.round(dmg), { noProc: true, fromX: t.x, fromY: t.y, knock: Number(act.knockback ?? 0), status: act.status as FoeStatusId | undefined, stacks: Number(act.stacks ?? 1) });
        };
        if (act.delay) c.hazards.add({ side: 'hero', zone: { shape: 'circle', x: p.x, y: p.y, r: Number(act.radius ?? 60) }, delay: Number(act.delay), damage: 0, color: 0x86cffa, onFire: go });
        else go();
        break;
      }
      case 'reflect': {
        if (ctx.attacker && c.world.isAlive(ctx.attacker)) c.damageFoe(ctx.attacker, Math.max(1, Math.round((ctx.amount ?? 0) * act.pct / 100 + atk * 0.3)), { noProc: true });
        break;
      }
      case 'projectiles': {
        const base = Math.atan2(h.aimY, h.aimX), n = Number(act.count);
        for (let k = 0; k < n; k++) {
          const ang = base + (k - (n - 1) / 2) * 0.22 + 0.11;
          c.spawnShot({ side: 'hero', x: t.x, y: t.y, dx: Math.cos(ang), dy: Math.sin(ang), speed: 820, damage: Math.round(atk * act.atkPct / 100), color: 0x86cffa, owner: c.player, status: act.status as FoeStatusId, stacks: Number(act.stacks ?? 1), life: 0.7, skill: -1 });
        }
        break;
      }
      case 'detonate': {
        let total = 0;
        for (const f of foesAround(c, t.x, t.y, 650)) {
          const fc = c.world.get(f, Foe)!, st = fc.statuses.saignement;
          if (!st) continue;
          const dmg = st.power * 0.08 * st.stacks * Math.max(1, st.t) * act.pct / 100;
          delete fc.statuses.saignement;
          total += dmg;
          const ft = c.world.get(f, Transform)!;
          c.particles.emit(ft.x, ft.y - BODY_Y, { color: 0xff3050, count: 14, speed: 220, size: 0.5, life: 0.4 });
          c.damageFoe(f, Math.round(dmg), { noProc: true });
        }
        if (total > 0) this.heal(total * Number(act.healPct ?? 0) / 100);
        break;
      }
      case 'buff': this.buffs.push({ stat: act.stat, pct: act.addPct, charges: Number(act.charges ?? 1) }); break;
      case 'heal': this.heal(Number(act.flat ?? 0)); break;
      case 'zone': {
        const p = at();
        const status = act.status as FoeStatusId | undefined;
        c.hazards.add({ side: 'hero', zone: { shape: 'circle', x: p.x, y: p.y, r: act.radius }, delay: 0.1, linger: Number(act.duration), tickEvery: Number(act.tick ?? 0.5),
          damage: Math.max(1, Math.round(atk * Number(act.atkPct ?? 10) / 100)), color: status ? (status === 'poison' ? 0xaade8f : 0x86cffa) : 0xffd65c, status, stacks: Number(act.stacks ?? 1), knock: 0, owner: -1 });
        break;
      }
      case 'strikes': this.strikes(Number(act.count), Number(act.atkPct), act.status as FoeStatusId | undefined); break;
      case 'dashModifier': {
        const v = c.world.get(c.player, Velocity)!;
        const k = 1 + act.distancePct / 100;
        v.x *= k; v.y *= k;
        this.dashStatus = (act.status as FoeStatusId) ?? null;
        break;
      }
      case 'cooldownReduce': for (const i of act.skills as number[]) h.cds[i] = Math.max(0, h.cds[i] - act.seconds); break;
      case 'cooldownReset': for (const i of act.skills as number[]) h.cds[i] = 0; break;
      case 'echo': {
        const skill = ctx.skill ?? 2;
        h.queued.push({ at: c.time + Number(act.delay ?? 0.35), run: () => this.echo?.(skill, act.pct / 100) });
        break;
      }
      case 'duplicate': {
        if (ctx.target !== undefined && c.world.isAlive(ctx.target)) { this.inLightning = true; this.lightning(ctx.target, (ctx.amount ?? atk * 0.4), 1); this.inLightning = false; }
        break;
      }
      default: break; // statusSynergy, zoneAddStatus, overhealToShield, cloneInheritsStatus, statusCap : lus ailleurs
    }
  }

  /** Relance d'une technique à puissance réduite (Ombres jumelles) : branché par la scène. */
  echo: ((skill: number, scale: number) => void) | null = null;

  private strikes(count: number, atkPct: number, status?: FoeStatusId): void {
    const c = this.c, t = this.t;
    const list = foesAround(c, t.x, t.y, 750);
    for (let k = 0; k < count && list.length; k++) {
      const f = list.splice(c.rng.int(0, list.length - 1), 1)[0];
      const ft = c.world.get(f, Transform)!;
      c.feedback.streak(ft.x + 30, ft.y - 420, ft.x, ft.y - BODY_Y, 0xffd65c, 14);
      c.damageFoe(f, Math.round(this.heroAtk() * atkPct / 100), { lightning: true, status, stacks: 1 });
    }
    c.g.camera.shake(0.15);
  }

  /** Dégâts de zone utilitaires (ondes, éclats). */
  areaDamage(x: number, y: number, r: number, dmg: number, status?: FoeStatusId, stacks = 1, spread?: FoeStatusId, exclude?: number, knock = 160): void {
    const c = this.c;
    c.feedback.ring(x, y - 10, r, status === 'poison' ? 0xaade8f : status === 'givre' ? 0x86cffa : 0xffd9a0, 0.35, 8);
    let spreadStacks = 0;
    if (spread && exclude !== undefined) spreadStacks = c.world.get(exclude, Foe)?.statuses[spread]?.stacks ?? 1;
    for (const f of foesAround(c, x, y, r, exclude)) {
      c.damageFoe(f, Math.max(1, Math.round(dmg)), { noProc: true, fromX: x, fromY: y, knock, status, stacks });
      if (spread) applyStatus(c, f, spread, spreadStacks);
    }
  }

  // ============================================================ Construction du build

  private value(b: BlessingDef, r: Rarity): number {
    let rr = r;
    if (this.itemBonus.oathbreaker && b.slot === 'frappe') rr = RARITIES[Math.min(3, RARITIES.indexOf(r) + 1)];
    return b.values?.[rr] ?? 0;
  }

  /** Recalcule les effets actifs et les statistiques passives. */
  recompute(): void {
    this.active = [];
    this.stat = {};
    const add = (k: string, v: number) => (this.stat[k] = (this.stat[k] ?? 0) + v);
    const take = (id: string, effect: Effect, v: number, kind: Active['kind']) => {
      this.active.push({ id, effect, v, kind });
      for (const raw of [effect.action, effect.extra]) {
        if (!raw || raw.type !== 'stat') continue;
        const act = resolve(raw, v) as Action & { stat: string; add?: number; addPct?: number; addPctPerMissingHp10?: number };
        if (effect.condition || act.addPctPerMissingHp10 !== undefined) continue; // conditionnels : évalués au moment du coup
        // Bonus propres à l'attaque de base (onHit, technique 0) ou au bris de Gel : clés suffixées.
        const key = effect.trigger === 'onHit' && effect.skill === 0 ? `${act.stat}@0` : effect.trigger === 'onShatter' ? `${act.stat}@shatter` : act.stat;
        if (act.stat === 'dodgeCharges') add('dodgeCharges', Number(act.add ?? 0));
        else add(key, Number(act.addPct ?? 0));
      }
      if (effect.drawback) add(effect.drawback.stat + 'Pct', effect.drawback.addPct);
    };
    for (const o of this.owned) take(o.blessing.id, o.blessing.effect, this.value(o.blessing, o.rarity), 'blessing');
    for (const d of this.duos) take(d.id, d.effect, 0, 'duo');
    for (const l of this.legendaries) take(l.id, l.effect, 0, 'legendary');
    if (this.res('veilleurs', 2)) add('defPct', 8);
    if (this.res('orage', 2)) add('speedPct', 6);
  }

  /** Statistiques du build pour le menu pause / la fin de run. */
  maxResonance(): number { return Math.max(0, ...Object.keys(BLESSING_DATA.patrons).map((p) => this.patronCount(p))); }

  // ============================================================ Offres

  /** Tire une offre de fin de vague selon offerRules. */
  makeOffer(wave: number, heroId: string): OfferChoice[] {
    const rng = this.offerRng, R = BLESSING_DATA.offerRules, M = this.c.mods;
    const n = M.offerChoices;
    const ownedIds = new Set(this.owned.map((o) => o.blessing.id));
    const pool = BLESSING_DATA.blessings.filter((b) => this.cfg.patrons.includes(b.patron) && !ownedIds.has(b.id) && (!M.monoPatron || b.patron === M.monoPatron));
    // Harmonie (défi) : les cartes qui complètent un Duo sont plus fréquentes.
    const duoBoost = (b: BlessingDef) => (M.duoWeight > 1 && BLESSING_DATA.duos.some((d) => !this.duos.includes(d) && d.patrons.includes(b.patron)
      && d.patrons.every((p, i) => (p === b.patron ? b.tags : this.owned.filter((o) => o.blessing.patron === p).flatMap((o) => o.blessing.tags)).some((t) => (d.requires.anyTags[i] ?? []).includes(t)))) ? M.duoWeight : 1);
    const out: OfferChoice[] = [];
    const perPatron = new Map<string, number>();
    const rarityRoll = (forceRare: boolean): Rarity => {
      const allowed = RARITIES.filter((r) => BLESSING_DATA.rarities[r].minWave <= wave && (!forceRare || r !== 'commun'));
      if (!allowed.length) return 'rare';
      // Les raretés hautes deviennent plus fréquentes au fil des vagues (retours des testeurs : « trop de communs »).
      const waveBoost = 1 + ((R.rarityPerWavePct ?? 0) * Math.max(0, wave - 1)) / 100;
      const w = allowed.map((r) => BLESSING_DATA.rarities[r].weight * (r === 'commun' ? 1 : (1 + this.cfg.rarityLuckPct / 100) * waveBoost));
      return rng.weighted(allowed, w);
    };
    const forceRareSlot = this.offersWithoutRare >= R.pityRareAfterCommonOffers ? rng.int(0, n - 1) : -1;
    // Amélioration d'une bénédiction possédée.
    const upgradable = this.owned.filter((o) => o.rarity !== 'heroique' && (!M.monoPatron || o.blessing.patron === M.monoPatron));
    if (upgradable.length && rng.chance(R.upgradeOfferChance)) {
      const o = rng.pick(upgradable);
      out.push({ blessing: o.blessing, rarity: RARITIES[RARITIES.indexOf(o.rarity) + 1], upgradeFrom: o.rarity });
      perPatron.set(o.blessing.patron, 1);
    }
    const ownedPatrons = new Set(this.owned.map((o) => o.blessing.patron));
    let guard = 0;
    while (out.length < n && pool.length && guard++ < 200) {
      const needNew = wave < R.guaranteeNewPatronBeforeWave && out.length === n - 1 && !out.some((c) => !ownedPatrons.has(c.blessing.patron));
      const cand = pool.filter((b) => (perPatron.get(b.patron) ?? 0) < R.maxSamePatronInOffer && !out.some((c) => c.blessing.id === b.id) && (!needNew || !ownedPatrons.has(b.patron)));
      if (!cand.length) break;
      const w = cand.map((b) => (BLESSING_DATA.patrons[b.patron].heroAffinity.includes(heroId) ? R.heroAffinityWeightBonus : 1) * duoBoost(b));
      const b = rng.weighted(cand, w);
      perPatron.set(b.patron, (perPatron.get(b.patron) ?? 0) + 1);
      out.push({ blessing: b, rarity: rarityRoll(out.length === forceRareSlot) });
    }
    this.offersWithoutRare = out.some((c) => c.rarity !== 'commun') ? 0 : this.offersWithoutRare + 1;
    return out;
  }

  /** Prend une carte. Renvoie les duos et légendaires nouvellement débloqués. */
  pick(choice: OfferChoice): { replaced?: Owned; duos: DuoDef[]; legendaries: LegendaryDef[] } {
    let replaced: Owned | undefined;
    const existing = this.owned.find((o) => o.blessing.id === choice.blessing.id);
    if (existing) existing.rarity = choice.rarity;
    else {
      if (choice.blessing.slot !== 'passif') {
        const i = this.owned.findIndex((o) => o.blessing.slot === choice.blessing.slot);
        if (i >= 0) replaced = this.owned.splice(i, 1)[0];
      }
      this.owned.push({ blessing: choice.blessing, rarity: choice.rarity });
    }
    const has = (p: string, tags: string[]) => this.owned.some((o) => o.blessing.patron === p && o.blessing.tags.some((t) => tags.includes(t)));
    const duos = BLESSING_DATA.duos.filter((d) => !this.duos.includes(d) && d.patrons.every((p, i) => has(p, d.requires.anyTags[i] ?? [])));
    this.duos.push(...duos);
    const legs = BLESSING_DATA.legendaries.filter((l) => !this.legendaries.includes(l)
      && this.owned.filter((o) => o.blessing.patron === l.patron).length >= l.requires.patronCount
      && this.owned.some((o) => l.requires.anyOf.includes(o.blessing.id)));
    this.legendaries.push(...legs);
    this.recompute();
    return { replaced, duos, legendaries: legs };
  }
}

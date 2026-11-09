import { cyrb53 } from '../save';
import type { HeroId } from './components';
import type { ItemRarity } from './combat/loot';
import dailyJson from '../../data/daily.json';
import sanctuaryJson from '../../data/sanctuary.json';

/**
 * Modificateurs de run : un seul format pour les Pactes de la Brume (sanctuary.json > pacts),
 * le défi quotidien (daily.json) et le mode Cauchemar. RunScene, BlessingEngine et LootSystem les lisent.
 */
export interface RunMods {
  /** Multiplicateurs ennemis. */
  foeHp: number; foeDmg: number; bossHp: number;
  /** Ennemis en plus (+0,3 = +30 %) et élites en plus par vague. */
  foeCount: number; extraElites: number;
  /** Failles au sol : une zone toutes les `rifts` s (0 = aucune). */
  rifts: number;
  /** Sablier : temps max d'une vague avant renforts (0 = aucun). */
  chrono: number;
  healMul: number; dmgTaken: number; goldMul: number;
  /** Choix par offre de bénédiction (3 par défaut). */
  offerChoices: number;
  lootMin: ItemRarity; duoWeight: number;
  potions: number; crit: number; cdMul: number;
  /** Champ de vision : >1 rapproche la caméra (Brume Épaisse). */
  zoom: number;
  /** Toutes les offres viennent de ce patron. */
  monoPatron: string | null;
  /** Soin de fin de vague (part des PV max). */
  waveHealPct: number;
  rerollCostMul: number;
  /** Dernière vague : victoire et fin de run (0 = campagne de 20 puis infini). */
  maxWaves: number;
  ilvlBonus: number;
  /** Noms affichés (bannière de départ, écran de fin). */
  labels: string[];
}

export const BASE_MODS: RunMods = {
  foeHp: 1, foeDmg: 1, bossHp: 1, foeCount: 0, extraElites: 0, rifts: 0, chrono: 0, healMul: 1, dmgTaken: 1, goldMul: 1,
  offerChoices: 3, lootMin: 'common', duoWeight: 1, potions: 0, crit: 0, cdMul: 1, zoom: 1, monoPatron: null,
  waveHealPct: 0.15, rerollCostMul: 1, maxWaves: 0, ilvlBonus: 0, labels: [],
};

/**
 * Mode Découverte (testeurs débutants : « je veux apprendre sans mourir en 2 minutes ») :
 * ennemis plus doux, 2 fioles de plus, gros soin de fin de vague. Pas de Pactes en même temps.
 */
export const DISCOVERY = { foeDmg: 0.6, foeHp: 0.8, bossHp: 0.8, potions: 2, waveHealPct: 0.35 } as const;
export function applyDiscovery(m: RunMods): RunMods {
  return { ...m, foeDmg: m.foeDmg * DISCOVERY.foeDmg, foeHp: m.foeHp * DISCOVERY.foeHp, bossHp: m.bossHp * DISCOVERY.bossHp,
    potions: m.potions + DISCOVERY.potions, waveHealPct: Math.max(m.waveHealPct, DISCOVERY.waveHealPct), labels: [...m.labels, 'Découverte'] };
}

export type GameMode = 'survie' | 'cauchemar';

/** Mode Cauchemar : ennemis +40 % PV, +25 % ATQ ; objets +4 niveaux, ancestrales possibles. */
export function applyMode(m: RunMods, mode: GameMode): RunMods {
  if (mode !== 'cauchemar') return m;
  return { ...m, foeHp: m.foeHp * 1.4, foeDmg: m.foeDmg * 1.25, ilvlBonus: m.ilvlBonus + 4, labels: [...m.labels, 'Cauchemar'] };
}

// ================================================================ Pactes de la Brume

interface PactDef { id: string; name: string; ranks: number; pointsPerRank: number; effect: string }
interface PactsData { requires: string; rewardPerPoint: { eclatsPct: number; lootRarityLuckPct: number }; milestones: Array<{ points: number; reward: Record<string, unknown> }>; list: PactDef[] }
export const PACTS = (sanctuaryJson as unknown as { pacts: PactsData }).pacts;

export type PactRanks = Record<string, number>;
export const pactPoints = (r: PactRanks) => PACTS.list.reduce((s, p) => s + Math.min(p.ranks, r[p.id] ?? 0) * p.pointsPerRank, 0);

/** Effets des pactes (approximations là où le jeu n'a pas encore le système : marchand, routes). */
export function applyPacts(m: RunMods, r: PactRanks): RunMods {
  const k = (id: string) => Math.min(PACTS.list.find((p) => p.id === id)?.ranks ?? 0, r[id] ?? 0);
  const out = { ...m, labels: [...m.labels] };
  out.foeHp *= 1 + 0.15 * k('p_vigueur');
  out.foeDmg *= 1 + 0.1 * k('p_rage');
  out.foeCount += 0.2 * k('p_nombre');
  out.extraElites += k('p_elites');
  out.rerollCostMul *= 1 + 0.25 * k('p_avare');
  if (k('p_pas_soin')) out.waveHealPct = 0.05;
  if (k('p_failles')) out.rifts = k('p_failles') >= 2 ? 4 : 7;
  out.bossHp *= 1 + 0.3 * k('p_boss');
  if (k('p_chrono')) out.chrono = k('p_chrono') >= 2 ? 70 : 90;
  if (k('p_benediction')) out.offerChoices = 2;
  if (k('p_fragile')) out.dmgTaken *= 1.35;
  const pts = pactPoints(r);
  if (pts > 0) out.labels.push(`Pacte ${pts}`);
  return out;
}

// ================================================================ Défi quotidien (daily.json, reference/daily-seed.js)

interface DailyMod { id: string; type: 'positive' | 'negative'; family: string; name: string; desc: string }
interface DailyData {
  seed: { streams: { list: string[] } };
  setup: { hero: { pool: HeroId[] }; mode: { pool: Array<{ id: GameMode; weight: number }> }; waves: number; modifiers: { positive: number; negative: number; noDuplicateFamily: boolean } };
  modifiers: DailyMod[];
  scoring: Record<string, unknown>;
  leaderboard: { shareTemplate: string };
}
export const DAILY = dailyJson as unknown as DailyData;

/** PRNG mulberry32 : renvoie next() -> uint32. */
export function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** Flux nommé, comme reference/daily-seed.js. */
export function seedStream(base: string, name: string) {
  const next = mulberry32(cyrb53(base + ':' + name) >>> 0);
  const float = () => next() / 4294967296;
  return {
    uint: next, float,
    int: (min: number, max: number) => min + Math.floor(float() * (max - min + 1)),
    weighted<T extends { weight: number }>(items: T[]): T {
      let r = float() * items.reduce((s, it) => s + it.weight, 0);
      for (const it of items) { r -= it.weight; if (r < 0) return it; }
      return items[items.length - 1];
    },
    shuffle<T>(arr: T[]): T[] {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(float() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    },
  };
}

/** Graine 32 bits d'un flux (pour l'Rng du moteur). */
export const streamSeed = (base: string, name: string) => cyrb53(base + ':' + name) >>> 0;

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const dailySeedString = (d = new Date()) => `SC-D-${dayKey(d)}`;

export interface DailyConfig { seedString: string; day: string; hero: HeroId; mode: GameMode; waves: number; modifiers: DailyMod[] }

export function buildDaily(date = new Date()): DailyConfig {
  const seedString = dailySeedString(date);
  const s = seedStream(seedString, 'setup');
  const heroes = DAILY.setup.hero.pool;
  const prevHero = heroes[seedStream(dailySeedString(new Date(date.getTime() - 86_400_000)), 'setup').int(0, heroes.length - 1)];
  let idx = s.int(0, heroes.length - 1);
  if (heroes[idx] === prevHero) idx = (idx + 1) % heroes.length;
  const mode = s.weighted(DAILY.setup.mode.pool).id;
  const pick = (type: DailyMod['type'], n: number) => {
    const out: DailyMod[] = [], fam = new Set<string>();
    for (const m of s.shuffle(DAILY.modifiers.filter((x) => x.type === type))) {
      if (out.length >= n) break;
      if (DAILY.setup.modifiers.noDuplicateFamily && fam.has(m.family)) continue;
      fam.add(m.family); out.push(m);
    }
    return out;
  };
  return { seedString, day: dayKey(date), hero: heroes[idx], mode, waves: DAILY.setup.waves,
    modifiers: [...pick('positive', DAILY.setup.modifiers.positive), ...pick('negative', DAILY.setup.modifiers.negative)] };
}

export function applyDailyMods(m: RunMods, d: DailyConfig, monoPatron: string): RunMods {
  const out = applyMode({ ...m, maxWaves: d.waves, labels: [...m.labels] }, d.mode);
  for (const x of d.modifiers) {
    switch (x.id) {
      case 'm_pos_or': out.goldMul *= 1.5; break;
      case 'm_pos_benedict': out.offerChoices = 4; break;
      case 'm_pos_rare': out.lootMin = 'magic'; break;
      case 'm_pos_duo': out.duoWeight = 2; break;
      case 'm_pos_potion': out.potions += 2; break;
      case 'm_pos_crit': out.crit += 0.15; break;
      case 'm_pos_cdr': out.cdMul *= 0.75; break;
      case 'm_neg_vigueur': out.foeHp *= 1.3; break;
      case 'm_neg_rage': out.foeDmg *= 1.2; break;
      case 'm_neg_maree': out.foeCount += 0.3; break;
      case 'm_neg_elites': out.extraElites += 1; break;
      case 'm_neg_failles': out.rifts = 6; break;
      case 'm_neg_brouillard': out.zoom *= 1.18; break;
      case 'm_neg_soin': out.healMul *= 0.6; break;
      case 'm_neg_chrono': out.chrono = 80; break;
      case 'm_neg_marchand': break; // pas encore de routes marchandes
      case 'm_neg_monopatron': out.monoPatron = monoPatron; break;
      case 'm_neg_verre': out.dmgTaken *= 1.25; break;
    }
    out.labels.push(x.name);
  }
  return out;
}

export interface DailyScoreInput { wavesCleared: number; kills: number; elites: number; bosses: number; timeSec: number; contracts: number; won: boolean; damageTaken: number }

/** daily.json > scoring.formula. */
export function dailyScore(r: DailyScoreInput): { total: number; parts: Array<[string, number]> } {
  const parts: Array<[string, number]> = [
    ['Vagues', r.wavesCleared * 1000], ['Éliminations', r.kills * 10], ['Élites', r.elites * 75], ['Boss', r.bosses * 1500],
    ['Rapidité', Math.max(0, 600 - r.timeSec) * 5], ['Contrats', r.contracts * 200], ['Victoire', r.won ? 5000 : 0], ['Dégâts subis', -Math.round(r.damageTaken * 0.5)],
  ];
  return { total: Math.max(0, Math.round(parts.reduce((s, [, v]) => s + v, 0))), parts };
}

export function shareText(d: DailyConfig, heroName: string, wave: number, score: number, streak: number): string {
  const [y, mo, da] = d.day.split('-');
  return DAILY.leaderboard.shareTemplate.replace('{date}', `${da}/${mo}/${y}`).replace('{hero}', heroName).replace('{wave}', String(wave))
    .replace('{score}', score.toLocaleString('fr-FR')).replace('{streak}', String(streak)).replace('/10', `/${d.waves}`);
}

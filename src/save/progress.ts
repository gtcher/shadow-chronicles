/**
 * Opérations de méta-progression sur le profil (fonctions pures : elles modifient le profil
 * reçu et renvoient ce qui a changé, pour l'écran de fin « gains d'abord »).
 * Les chiffres viennent de game/data/*.json ; rien n'est codé en dur ici.
 *
 * Utilisation avec le gestionnaire : `save.update(p => buyUpgrade(p, 'veillee', 'endurance'))`.
 */
import achievementsData from '../../data/achievements.json';
import dailyData from '../../data/daily.json';
import sanctuaryData from '../../data/sanctuary.json';
import type { CurrencyId, GameMode, HeroId, Profile } from './types';

interface Reward { eclats?: number; poussiere?: number; sceaux?: number; title?: string; cosmetic?: string }
interface UpgradeDef { id: string; maxRank: number; cost: number[]; currency?: CurrencyId; requires?: string }
interface BuildingDef { id: string; currency: CurrencyId; unlockedAtStart: boolean; unlockCost?: Partial<Record<CurrencyId, number>>; requires?: string; upgrades: UpgradeDef[] }
interface AchievementDef { id: string; tier: string; reward?: Reward }

const SANCTUARY = sanctuaryData as unknown as {
  buildings: BuildingDef[];
  deathPayout: { eclatsPerWaveReached: number; bonusIfNewBestWave: number };
  heroMastery: { xpPerWave: number; xpPerBoss: number; xpWinBonus: number; levels: { level: number; xp: number; reward: unknown }[] };
  pacts?: { requires?: string };
};
/** Condition d'ouverture des Pactes de la Brume (sanctuary.json > pacts.requires). */
export const PACTS_REQUIRES = SANCTUARY.pacts?.requires ?? 'bossKilled:4';
const ACH = achievementsData as unknown as { tiers: Record<string, Reward>; achievements: AchievementDef[] };
const DAILY = (dailyData as unknown as {
  rewards: {
    participation: Reward;
    completion: Reward & { masteryXp?: number };
    scoreThresholds: (Reward & { score: number })[];
    streak: { graceTokens: { max: number; earnEveryDays: number }; milestones: { days: number; reward: Reward }[] };
  };
}).rewards;
const STREAK = DAILY.streak;

// ─── monnaies, statistiques, récompenses ────────────────────────────────────

export function addCurrency(p: Profile, c: CurrencyId, n: number): void {
  p.currencies[c] = Math.max(0, Math.floor(p.currencies[c] + n));
}

export function canAfford(p: Profile, cost: Partial<Record<CurrencyId, number>>): boolean {
  return (Object.entries(cost) as [CurrencyId, number][]).every(([c, n]) => p.currencies[c] >= n);
}

function pay(p: Profile, cost: Partial<Record<CurrencyId, number>>): boolean {
  if (!canAfford(p, cost)) return false;
  for (const [c, n] of Object.entries(cost) as [CurrencyId, number][]) addCurrency(p, c, -n);
  return true;
}

/** Compteur cumulé (succès de portée « lifetime »). */
export function addStat(p: Profile, key: string, n = 1): void {
  p.stats.lifetime[key] = (p.stats.lifetime[key] ?? 0) + n;
}

/** Garde la meilleure valeur (portée « run »). `lower` pour les records où plus petit = mieux (chrono). */
export function recordBest(p: Profile, key: string, value: number, lower = false): boolean {
  const cur = p.stats.best[key];
  if (cur !== undefined && (lower ? value >= cur : value <= cur)) return false;
  p.stats.best[key] = value;
  return true;
}

/** Valeur d'une statistique pour les conditions « stat>=n » : record de run, sinon cumul. */
export function statValue(p: Profile, key: string): number {
  if (key === 'bestWave') return p.stats.best.waveReached ?? 0;
  if (key === 'runs') return p.stats.lifetime.runs ?? 0;
  return Math.max(p.stats.best[key] ?? 0, p.stats.lifetime[key] ?? 0);
}

/** Progression vers une condition (pour les barres de l'interface) : valeur actuelle et cible. */
export function requirementProgress(p: Profile, req: string | undefined): { have: number; need: number; ok: boolean } {
  if (!req) return { have: 1, need: 1, ok: true };
  const boss = /^bossKilled:(\d+)$/.exec(req);
  if (boss) { const have = p.stats.best.bossWaveKilled ?? 0, need = Number(boss[1]); return { have: Math.min(have, need), need, ok: have >= need }; }
  const m = /^(\w+)\s*>=\s*(\d+)$/.exec(req);
  if (!m) return { have: 0, need: 1, ok: meetsRequirement(p, req) };
  const have = statValue(p, m[1]), need = Number(m[2]);
  return { have, need, ok: have >= need };
}

/** Conditions de sanctuary.json : « bestWave>=6 », « runs>=3 », « bossKilled:5 » (boss de la vague 5 vaincu). */
export function meetsRequirement(p: Profile, req: string | undefined): boolean {
  if (!req) return true;
  const boss = /^bossKilled:(\d+)$/.exec(req);
  if (boss) return (p.stats.best.bossWaveKilled ?? 0) >= Number(boss[1]);
  const m = /^(\w+)\s*(>=|>|<=|<|==)\s*(-?\d+(?:\.\d+)?)$/.exec(req);
  if (!m) return false;
  const v = statValue(p, m[1]), t = Number(m[3]);
  return m[2] === '>=' ? v >= t : m[2] === '>' ? v > t : m[2] === '<=' ? v <= t : m[2] === '<' ? v < t : v === t;
}

export function grant(p: Profile, r: Reward | null | undefined): void {
  if (!r) return;
  if (r.eclats) addCurrency(p, 'eclats', r.eclats);
  if (r.poussiere) addCurrency(p, 'poussiere', r.poussiere);
  if (r.sceaux) addCurrency(p, 'sceaux', r.sceaux);
  if (r.title && !p.unlocks.titles.includes(r.title)) p.unlocks.titles.push(r.title);
  if (r.cosmetic && !p.unlocks.cosmetics.includes(r.cosmetic)) p.unlocks.cosmetics.push(r.cosmetic);
}

// ─── Sanctuaire ─────────────────────────────────────────────────────────────

export const building = (id: string) => SANCTUARY.buildings.find((b) => b.id === id);

export function isBuildingOpen(p: Profile, id: string): boolean {
  const b = building(id);
  return !!b && (b.unlockedAtStart || p.buildingsUnlocked.includes(id));
}

export type BuyResult = { ok: true; rank: number } | { ok: false; reason: 'unknown' | 'locked' | 'requirement' | 'max' | 'funds' };

export function unlockBuilding(p: Profile, id: string): BuyResult {
  const b = building(id);
  if (!b) return { ok: false, reason: 'unknown' };
  if (isBuildingOpen(p, id)) return { ok: false, reason: 'max' };
  if (!meetsRequirement(p, b.requires)) return { ok: false, reason: 'requirement' };
  if (!pay(p, b.unlockCost ?? {})) return { ok: false, reason: 'funds' };
  p.buildingsUnlocked.push(id);
  return { ok: true, rank: 1 };
}

export const upgradeRank = (p: Profile, b: string, u: string) => p.sanctuary[b]?.[u] ?? 0;

export function nextUpgradeCost(p: Profile, b: string, u: string): Partial<Record<CurrencyId, number>> | null {
  const bd = building(b), ud = bd?.upgrades.find((x) => x.id === u);
  if (!bd || !ud) return null;
  const rank = upgradeRank(p, b, u);
  if (rank >= ud.maxRank) return null;
  return { [ud.currency ?? bd.currency]: ud.cost[Math.min(rank, ud.cost.length - 1)] };
}

export function buyUpgrade(p: Profile, b: string, u: string): BuyResult {
  const bd = building(b), ud = bd?.upgrades.find((x) => x.id === u);
  if (!bd || !ud) return { ok: false, reason: 'unknown' };
  if (!isBuildingOpen(p, b)) return { ok: false, reason: 'locked' };
  const cost = nextUpgradeCost(p, b, u);
  if (!cost) return { ok: false, reason: 'max' };
  if (!meetsRequirement(p, ud.requires)) return { ok: false, reason: 'requirement' };
  if (!pay(p, cost)) return { ok: false, reason: 'funds' };
  (p.sanctuary[b] ??= {})[u] = upgradeRank(p, b, u) + 1;
  return { ok: true, rank: p.sanctuary[b][u] };
}

// ─── maîtrise des héros ─────────────────────────────────────────────────────

export function masteryLevel(xp: number): number {
  let level = 1;
  for (const l of SANCTUARY.heroMastery.levels) if (xp >= l.xp) level = l.level;
  return level;
}

/** Ajoute de l'XP de maîtrise et renvoie les paliers franchis (récompenses à afficher). */
export function addMasteryXp(p: Profile, hero: HeroId, xp: number): { from: number; to: number; rewards: unknown[] } {
  const m = p.mastery[hero];
  const from = masteryLevel(m.xp);
  m.xp += Math.max(0, Math.floor(xp));
  const to = masteryLevel(m.xp);
  const rewards = SANCTUARY.heroMastery.levels
    .filter((l) => l.level > from && l.level <= to && l.reward)
    .map((l) => JSON.parse(JSON.stringify(l.reward).replaceAll('{hero}', hero)) as unknown);
  for (const r of rewards as { type?: string; id?: string }[]) {
    if (r.type === 'title' && r.id) grant(p, { title: r.id });
    if (r.type === 'cosmetic' && r.id) grant(p, { cosmetic: r.id });
  }
  recordBest(p, 'maxHeroMastery', to);
  return { from, to, rewards };
}

// ─── succès ─────────────────────────────────────────────────────────────────

export const achievementDef = (id: string) => ACH.achievements.find((a) => a.id === id);

/** Débloque un succès (une seule fois) et verse sa récompense de palier + sa récompense propre. */
export function unlockAchievement(p: Profile, id: string, now = Date.now()): boolean {
  const def = achievementDef(id);
  if (!def || p.achievements[id]) return false;
  p.achievements[id] = now;
  const tier = ACH.tiers[def.tier];
  grant(p, { eclats: tier?.eclats, sceaux: tier?.sceaux });
  grant(p, def.reward);
  return true;
}

// ─── fin de run ─────────────────────────────────────────────────────────────

export interface RunSummary {
  hero: HeroId;
  mode: GameMode;
  /** Vague atteinte (en cours au moment de la mort ou de la victoire). */
  wave: number;
  wavesCleared: number;
  /** Vagues de boss vaincues pendant la run (ex. [5, 10]). */
  bossWaves: number[];
  won: boolean;
  daily: boolean;
  pactPoints: number;
  playTimeSec: number;
  /** Monnaies ramassées pendant la run (contrats, boss…), hors prime de fin. */
  earned: Partial<Record<CurrencyId, number>>;
  /** Compteurs de la run (kills, maxCombo, legendaryFound…) : cumulés et records. */
  counters: Record<string, number>;
}

export interface RunRewards {
  currencies: Record<CurrencyId, number>;
  newBestWave: boolean;
  mastery: { from: number; to: number; rewards: unknown[] };
}

/** Clôture une run : prime de fin, records, cumul des compteurs, maîtrise. Le défi quotidien ne paie pas ici (voir recordDaily). */
export function recordRunEnd(p: Profile, s: RunSummary): RunRewards {
  const prevBest = s.daily ? Infinity : p.stats.bestWaveByMode[s.mode];
  const newBestWave = s.wave > prevBest;
  const payout = SANCTUARY.deathPayout;
  const gained: Record<CurrencyId, number> = { eclats: 0, poussiere: 0, sceaux: 0 };
  for (const [c, n] of Object.entries(s.earned) as [CurrencyId, number][]) gained[c] += Math.max(0, Math.floor(n));
  if (!s.daily) gained.eclats += s.wave * payout.eclatsPerWaveReached + (newBestWave ? payout.bonusIfNewBestWave : 0);
  for (const c of Object.keys(gained) as CurrencyId[]) addCurrency(p, c, gained[c]);

  if (!s.daily) p.stats.bestWaveByMode[s.mode] = Math.max(p.stats.bestWaveByMode[s.mode], s.wave);
  addStat(p, 'runs');
  addStat(p, 'wavesCleared', s.wavesCleared);
  if (s.won) addStat(p, 'victories');
  addStat(p, 'bossKilled', s.bossWaves.length);
  for (const [k, v] of Object.entries(s.counters)) {
    addStat(p, k, v);
    recordBest(p, k, v);
  }
  recordBest(p, 'waveReached', s.wave);
  recordBest(p, 'wavesCleared', s.wavesCleared);
  if (s.bossWaves.length) recordBest(p, 'bossWaveKilled', Math.max(...s.bossWaves));
  p.stats.playTimeSec += Math.max(0, s.playTimeSec);

  if (s.pactPoints > 0 && s.bossWaves.length) p.pacts.bestPoints = Math.max(p.pacts.bestPoints, s.pactPoints);
  if (!p.pacts.unlocked && meetsRequirement(p, PACTS_REQUIRES)) p.pacts.unlocked = true;

  const hm = SANCTUARY.heroMastery;
  const m = p.mastery[s.hero];
  m.runs += 1;
  if (s.won) {
    m.wins += 1;
    p.stats.lifetime.heroesWon = (Object.values(p.mastery) as { wins: number }[]).filter((x) => x.wins > 0).length;
  }
  const mastery = addMasteryXp(p, s.hero, s.wavesCleared * hm.xpPerWave + s.bossWaves.length * hm.xpPerBoss + (s.won ? hm.xpWinBonus : 0));
  return { currencies: gained, newBestWave, mastery };
}

// ─── défi quotidien ─────────────────────────────────────────────────────────

const dayNumber = (day: string) => Math.round(Date.parse(day + 'T00:00:00Z') / 86_400_000);

export interface DailyResult { counted: boolean; streak: number; usedGrace: boolean; rewards: Reward[] }

/**
 * Enregistre une tentative du défi du jour (`day` = AAAA-MM-JJ en UTC). Seul le premier essai
 * compte ; il fait avancer la série (une bougie de veille couvre un jour manqué).
 */
export function recordDaily(p: Profile, day: string, r: { score: number; wave: number; hero: HeroId; won: boolean }, now = Date.now()): DailyResult {
  const d = p.daily;
  if (d.history[day]) return { counted: false, streak: d.streak, usedGrace: false, rewards: [] };
  d.history[day] = { ...r, at: now };
  const keep = Object.keys(d.history).sort().slice(-30);
  for (const k of Object.keys(d.history)) if (!keep.includes(k)) delete d.history[k];

  let usedGrace = false;
  const gap = d.lastDay ? dayNumber(day) - dayNumber(d.lastDay) : Infinity;
  if (gap === 1) d.streak += 1;
  else if (gap === 2 && d.graceTokens > 0) { d.graceTokens -= 1; d.streak += 1; usedGrace = true; }
  else if (gap <= 0) { /* date antérieure (horloge modifiée) : la série ne bouge pas */ }
  else d.streak = 1;
  if (gap > 0) d.lastDay = day;
  d.streakMax = Math.max(d.streakMax, d.streak);
  if (d.streak > 0 && d.streak % STREAK.graceTokens.earnEveryDays === 0) d.graceTokens = Math.min(STREAK.graceTokens.max, d.graceTokens + 1);
  if (r.won) d.completed += 1;
  recordBest(p, 'dailyStreakMax', d.streakMax);
  p.stats.lifetime.dailiesCompleted = d.completed;

  // Récompenses du jour : participation, victoire, meilleur palier de score atteint.
  const rewards: Reward[] = [DAILY.participation];
  if (r.won) {
    rewards.push({ eclats: DAILY.completion.eclats });
    addMasteryXp(p, r.hero, DAILY.completion.masteryXp ?? 0);
  }
  const tier = [...DAILY.scoreThresholds].reverse().find((t) => r.score >= t.score);
  if (tier) rewards.push({ eclats: tier.eclats, poussiere: tier.poussiere });
  for (const rw of rewards) grant(p, rw);

  for (const ms of STREAK.milestones) {
    if (ms.days !== d.streak) continue;
    rewards.push(ms.reward);
    grant(p, ms.reward);
    if (!d.streakMilestonesClaimed.includes(ms.days)) d.streakMilestonesClaimed.push(ms.days);
  }
  return { counted: true, streak: d.streak, usedGrace, rewards };
}

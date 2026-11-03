import achievementsJson from '../../data/achievements.json';
import { masteryLevel, type Profile } from '../save';
import blessingsJson from '../../data/blessings.json';

/**
 * Évaluation des succès (data/achievements.json) à partir des compteurs de la run (RunStats)
 * et du profil. Condition = { stat, op, value, scope: run | wave | lifetime, where? }.
 * Appelée en fin de vague (compteurs de la run pas encore versés au profil : `pending`)
 * et juste après recordRunEnd (déjà versés).
 */
export interface AchievementDef {
  id: string; cat: string; tier: string; icon: string; name: string; desc: string; hidden?: boolean;
  cond: { stat: string; op: '>=' | '<=' | '>' | '<' | '=='; value: number; scope: 'run' | 'wave' | 'lifetime'; where?: { hero?: string; mode?: string; patron?: string } };
}
const BLESSING_IDS = new Set((blessingsJson as unknown as { blessings: Array<{ id: string }> }).blessings.map((b) => b.id));
const TOTAL_BLESSINGS = BLESSING_IDS.size;
const DATA = achievementsJson as unknown as { achievements: AchievementDef[]; tiers: Record<string, { color: string }> };
export const ACHIEVEMENT_DEFS = DATA.achievements;
export const tierColor = (tier: string) => DATA.tiers[tier]?.color ?? '#d9ab74';

export interface RunView {
  hero: string;
  mode: string;
  wave: number;
  wavesCleared: number;
  bossWaves: number[];
  counters: Record<string, number>;
  waveCounters: Record<string, number>;
  fastestBossKill: number;
  /** Les compteurs de la run ne sont pas encore dans profile.stats.lifetime. */
  pending: boolean;
}

/** Valeur courante d'une condition, ou null si le `where` ne correspond pas à la run. */
export function achievementValue(p: Profile, a: AchievementDef, r: RunView): number | null {
  const { stat, scope, where } = a.cond;
  if (where?.hero && where.hero !== r.hero) return null;
  if (where?.mode && where.mode !== r.mode) return null;
  if (scope === 'wave') return r.waveCounters[stat] ?? 0;
  if (scope === 'run') {
    if (where?.patron) return r.counters[`${stat}:${where.patron}`] ?? 0;
    if (stat === 'waveReached') return r.wave;
    if (stat === 'wavesCleared') return r.wavesCleared;
    return r.counters[stat] ?? 0;
  }
  // lifetime
  if (stat === 'fastestBossKill') return Math.min(p.stats.best.fastestBossKill ?? Infinity, r.fastestBossKill);
  // Codex (profil > unlocks.seen*), tenu à jour par flow.ts à chaque découverte.
  if (stat === 'duosDiscovered') return p.unlocks.seenDuos.length;
  if (stat === 'legendaryPowersDiscovered') return p.unlocks.seenLegendaryPowers.length;
  if (stat === 'blessingsDiscoveredPct') return Math.floor((100 * p.unlocks.seenBlessings.filter((id) => BLESSING_IDS.has(id)).length) / Math.max(1, TOTAL_BLESSINGS));
  if (stat === 'maxHeroMastery') return Math.max(0, ...Object.values(p.mastery).map((m) => masteryLevel(m.xp)));
  const pend = r.pending ? (stat === 'bossKilled' ? r.bossWaves.length : r.counters[stat] ?? 0) : 0;
  return Math.max((p.stats.lifetime[stat] ?? 0) + pend, p.stats.best[stat] ?? 0);
}

const meets = (v: number, op: string, t: number) =>
  op === '>=' ? v >= t : op === '<=' ? v <= t : op === '>' ? v > t : op === '<' ? v < t : v === t;

/** Succès remplis et pas encore débloqués. */
export function checkAchievements(p: Profile, r: RunView): AchievementDef[] {
  return ACHIEVEMENT_DEFS.filter((a) => {
    if (p.achievements[a.id]) return false;
    const v = achievementValue(p, a, r);
    return v !== null && Number.isFinite(v) && meets(v, a.cond.op, a.cond.value);
  });
}

/** Les succès les plus proches (≥ 60 %), pour l'écran de fin de run. */
export function nearAchievements(p: Profile, r: RunView, n = 3): Array<{ icon: string; name: string; progress: number; label: string }> {
  const out: Array<{ icon: string; name: string; progress: number; label: string }> = [];
  for (const a of ACHIEVEMENT_DEFS) {
    if (p.achievements[a.id] || a.hidden || a.cond.op.startsWith('<')) continue;
    const v = achievementValue(p, a, r);
    if (v === null) continue;
    const prog = v / a.cond.value;
    if (prog >= 0.6 && prog < 1) out.push({ icon: a.icon, name: a.name, progress: prog, label: `${Math.floor(v)} / ${a.cond.value}` });
  }
  return out.sort((x, y) => y.progress - x.progress).slice(0, n);
}

/**
 * Classement personnel (retour des testeurs : « je veux battre mes records, voir mes meilleures runs »).
 * Pas de serveur (jeu statique sur GitHub Pages) : le classement est celui de l'appareil, par héros ou tous héros.
 * Ordre : vague atteinte, puis victoire, puis temps le plus court, puis ombres vaincues.
 * Module pur (aucun DOM) : testé dans tests/records.test.ts.
 */
import type { HeroId, Profile } from '../save';

export interface RunRecord {
  at: number;
  hero: HeroId;
  wave: number;
  won: boolean;
  timeSec: number;
  kills: number;
  mode: string;
  /** Points de Pacte engagés. */
  pact: number;
  discovery: boolean;
}

/** Runs gardées : les 30 meilleures + les 10 plus récentes. */
const KEEP_BEST = 30, KEEP_RECENT = 10;

export function compareRuns(a: RunRecord, b: RunRecord): number {
  return b.wave - a.wave || Number(b.won) - Number(a.won) || a.timeSec - b.timeSec || b.kills - a.kills || a.at - b.at;
}

/** Classement (meilleures d'abord), tous héros ou un seul. */
export function leaderboard(p: Profile | null, hero?: HeroId, n = 10): RunRecord[] {
  return [...(p?.records ?? [])].filter((r) => !hero || r.hero === hero).sort(compareRuns).slice(0, n);
}

/** Ajoute une run et renvoie son rang (1 = meilleure) tous héros et pour son héros. */
export function pushRecord(p: Profile, rec: RunRecord): { rank: number; heroRank: number; total: number } {
  const all = [...(p.records ?? []), rec];
  const best = [...all].sort(compareRuns).slice(0, KEEP_BEST);
  const recent = [...all].sort((a, b) => b.at - a.at).slice(0, KEEP_RECENT);
  p.records = [...new Set([...best, ...recent])].sort((a, b) => a.at - b.at);
  const sorted = [...p.records].sort(compareRuns);
  return {
    rank: sorted.indexOf(rec) + 1,
    heroRank: sorted.filter((r) => r.hero === rec.hero).indexOf(rec) + 1,
    total: p.records.length,
  };
}

/** « 1er », « 2e »… */
export const ordinal = (n: number): string => (n === 1 ? '1er' : `${n}e`);

/** Durée « 12 min 05 s ». */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`;
}

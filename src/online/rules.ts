/**
 * Règles pures du jeu en ligne (aucun réseau, aucun DOM) : testées dans tests/online.test.ts.
 *  - vraisemblance des scores : le même contrôle que la base (supabase/schema.sql), fait avant l'envoi
 *    pour ne pas envoyer ce qui serait refusé ;
 *  - décision de synchronisation entre la sauvegarde de l'appareil et celle du cloud.
 */
import type { HeroId, Profile } from '../save';
import { regionForWave } from '../game/combat/rules';

export interface RunSubmission {
  hero: HeroId; mode: string; wave: number; won: boolean; timeSec: number; kills: number; pact: number; discovery: boolean;
}
export interface DailySubmission { day: string; hero: HeroId; score: number; wave: number; won: boolean; timeSec: number; kills: number }

const HEROES = ['taro', 'mei', 'sena', 'ren'];

/** Miroir de submit_run (schema.sql). */
export function plausibleRun(r: RunSubmission): boolean {
  const t = Math.round(r.timeSec), w = Math.round(r.wave);
  return HEROES.includes(r.hero) && (r.mode === 'survie' || r.mode === 'cauchemar') && w >= 1 && w <= 200
    && t >= w * 8 && t <= 36000 && r.kills >= 0 && r.kills <= t * 4 && r.kills <= w * 150
    && (!r.won || w >= 20) && r.pact >= 0 && r.pact <= 100;
}

/** Miroir de submit_daily (schema.sql). */
export function plausibleDaily(d: DailySubmission): boolean {
  const t = Math.round(d.timeSec), w = Math.round(d.wave);
  return HEROES.includes(d.hero) && /^\d{4}-\d{2}-\d{2}$/.test(d.day) && w >= 1 && w <= 200 && t >= w * 8
    && d.kills >= 0 && d.kills <= t * 4 && d.score >= 0 && d.score <= w * 4000 + d.kills * 10 + 8000 && (!d.won || w >= 5);
}

/** Pseudo accepté par la base. */
export const PSEUDO_RE = /^[A-Za-z0-9À-ÖØ-öø-ÿ _.-]{3,16}$/;
export const validPseudo = (p: string): boolean => PSEUDO_RE.test(p.trim());

/** Ce que l'appareil sait de la dernière synchronisation (localStorage). */
export interface SyncState {
  user: string;
  /** Version de la sauvegarde cloud à la dernière synchro (colonne rev). */
  cloudRev: number;
  /** profile.rev local à la dernière synchro. */
  localRev: number;
}

export interface CloudSave { profile: Profile; settings: unknown; rev: number; device: string | null; updated_at: string }

export type SyncDecision =
  | { action: 'none' }
  | { action: 'push' }
  | { action: 'pull' }
  | { action: 'ask' };

/** Un profil sans aucune run (nouvel appareil, navigateur vidé). */
export function emptyProfile(p: Profile): boolean {
  return (p.stats.lifetime.runs ?? 0) === 0 && (p.records?.length ?? 0) === 0 && Object.keys(p.daily.history).length === 0;
}

/**
 * Que faire en se connectant (ou au retour sur le jeu) ?
 *  - pas de sauvegarde cloud → on envoie celle de l'appareil ;
 *  - le cloud n'a pas bougé depuis notre dernière synchro → on envoie si l'appareil a progressé ;
 *  - le cloud a bougé (autre appareil) : on le reprend si l'appareil n'a rien fait depuis (ou est vide),
 *    sinon les deux ont avancé → on demande au joueur.
 */
export function decideSync(local: Profile, cloud: CloudSave | null, st: SyncState | null, user: string): SyncDecision {
  if (!cloud) return { action: 'push' };
  const mine = st && st.user === user ? st : null;
  if (mine && mine.cloudRev === cloud.rev) return local.rev !== mine.localRev ? { action: 'push' } : { action: 'none' };
  if (emptyProfile(local)) return { action: 'pull' };
  if (mine && local.rev === mine.localRev) return { action: 'pull' };
  if (emptyProfile(cloud.profile)) return { action: 'push' };
  return { action: 'ask' };
}

/** Résumé lisible d'un profil (choix entre deux sauvegardes). */
export function profileSummary(p: Profile): { eclats: number; bestWave: number; runs: number; achievements: number } {
  return {
    eclats: p.currencies.eclats,
    bestWave: Math.max(0, ...Object.values(p.stats.bestWaveByMode as Record<string, number>)),
    runs: p.stats.lifetime.runs ?? 0,
    achievements: Object.keys(p.achievements).length,
  };
}

/** Chapitre (1..4) d'une vague, comme le fond du menu (regionForWave). */
export const chapterOfWave = (wave: number): number => regionForWave(Math.max(1, wave)) + 1;

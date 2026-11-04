/**
 * Missions du jour : 3 objectifs courts tirés chaque jour (même tirage pour tout le monde, graine = date UTC),
 * qui avancent sur toutes les runs du jour. Chaque mission rapporte des Éclats ; les 3 remplies ouvrent
 * le coffre du jour. Demande des testeurs (Lucas, Chloé, Mehdi, Jean-Pierre) : une raison de revenir demain.
 * Module pur (aucun DOM) : testé dans tests/missions.test.ts.
 */
import type { Profile, HeroId } from '../save';
import { addCurrency } from '../save';
import { dayKey, seedStream } from './modes';

export interface MissionDef {
  id: string;
  icon: string;
  /** Texte avec {n} = objectif. */
  text: string;
  /** Mesure : compteur de run (somme sur la journée) ou record d'une seule run (`best`). */
  stat: string;
  best?: boolean;
  /** Objectifs possibles (un est tiré). */
  targets: number[];
  hero?: HeroId;
}

/** Ce qu'une run apporte aux missions (calculé par la fin de run). */
export interface MissionRun {
  hero: HeroId;
  wave: number;
  wavesCleared: number;
  bosses: number;
  counters: Record<string, number>;
}

const HERO_NAMES: Record<HeroId, string> = { taro: 'Taro', mei: 'Mei', sena: 'Sena', ren: 'Ren' };

export const MISSION_POOL: MissionDef[] = [
  { id: 'kills', icon: '☠', text: 'Vaincre {n} ombres', stat: 'kills', targets: [250, 400, 600] },
  { id: 'elites', icon: '◆', text: 'Abattre {n} élites', stat: 'elitesKilled', targets: [4, 8, 12] },
  { id: 'boss', icon: '♛', text: 'Terrasser {n} boss', stat: 'bosses', targets: [1, 2] },
  { id: 'waves', icon: '⚑', text: 'Franchir {n} vagues', stat: 'wavesCleared', targets: [10, 15, 25] },
  { id: 'reach', icon: '★', text: 'Atteindre la vague {n} en une run', stat: 'wave', best: true, targets: [6, 8, 11] },
  { id: 'dodge', icon: '➶', text: 'Réussir {n} esquives parfaites', stat: 'perfectDodges', targets: [8, 15, 25] },
  { id: 'combo', icon: '✕', text: 'Faire un combo de {n}', stat: 'maxCombo', best: true, targets: [60, 100, 150] },
  { id: 'duo', icon: '⚭', text: 'Obtenir {n} Duo', stat: 'duosTaken', targets: [1] },
  { id: 'salvage', icon: '✧', text: 'Démanteler {n} objets', stat: 'salvaged', targets: [10, 20] },
  { id: 'runs', icon: '⟳', text: 'Lancer {n} runs', stat: 'runs', targets: [2, 3] },
  ...(Object.keys(HERO_NAMES) as HeroId[]).map((h): MissionDef => (
    { id: `hero_${h}`, icon: '⚔', text: `Atteindre la vague {n} avec ${HERO_NAMES[h]}`, stat: 'wave', best: true, targets: [5, 7], hero: h })),
];

export const MISSION_REWARD = { eclats: 12 };
export const CHEST_REWARD = { eclats: 30, poussiere: 25 };

export interface Mission { id: string; def: MissionDef; icon: string; text: string; target: number; progress: number; done: boolean }

/** Les 3 missions d'un jour : jamais deux du même type, au plus une mission de héros. */
export function missionsForDay(day: string): Array<{ def: MissionDef; target: number }> {
  const rng = seedStream(`SC-M-${day}`, 'missions').float;
  const pool = [...MISSION_POOL];
  const out: Array<{ def: MissionDef; target: number }> = [];
  while (out.length < 3 && pool.length) {
    const def = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    if (def.hero && out.some((m) => m.def.hero)) continue;
    out.push({ def, target: def.targets[Math.floor(rng() * def.targets.length)] });
  }
  return out;
}

type State = NonNullable<Profile['missions']>;

/** État du jour (remis à zéro si la date a changé). */
export function missionState(p: Profile, day = dayKey()): State {
  if (!p.missions || p.missions.day !== day) p.missions = { day, progress: {}, done: [], chest: false, chestsOpened: p.missions?.chestsOpened ?? 0 };
  return p.missions;
}

/** Missions du jour avec leur progression (lecture seule : ne modifie pas le profil). */
export function dailyMissions(p: Profile | null, day = dayKey()): { missions: Mission[]; chest: boolean; done: number } {
  const st: { progress: Record<string, number>; done: string[]; chest: boolean } = p?.missions && p.missions.day === day ? p.missions : { progress: {}, done: [], chest: false };
  const missions = missionsForDay(day).map(({ def, target }) => {
    const progress = Math.min(target, st.progress[def.id] ?? 0);
    return { id: def.id, def, icon: def.icon, text: def.text.replace('{n}', String(target)), target, progress, done: st.done.includes(def.id) };
  });
  return { missions, chest: st.chest, done: missions.filter((m) => m.done).length };
}

const runValue = (def: MissionDef, r: MissionRun): number => {
  if (def.hero && def.hero !== r.hero) return 0;
  switch (def.stat) {
    case 'wave': return r.wave;
    case 'wavesCleared': return r.wavesCleared;
    case 'bosses': return r.bosses;
    case 'runs': return 1;
    default: return Math.max(0, Math.floor(r.counters[def.stat] ?? 0));
  }
};

export interface MissionResult {
  /** Avant / après pour chaque mission (affichage de fin de run). */
  lines: Array<{ icon: string; text: string; from: number; to: number; target: number; justDone: boolean; done: boolean }>;
  eclats: number;
  poussiere: number;
  chestOpened: boolean;
}

/** Verse une run dans les missions du jour et paie les missions remplies (et le coffre). */
export function applyRunToMissions(p: Profile, r: MissionRun, day = dayKey()): MissionResult {
  const st = missionState(p, day);
  const out: MissionResult = { lines: [], eclats: 0, poussiere: 0, chestOpened: false };
  for (const { def, target } of missionsForDay(day)) {
    const from = Math.min(target, st.progress[def.id] ?? 0);
    const v = runValue(def, r);
    const to = Math.min(target, def.best ? Math.max(from, v) : from + v);
    st.progress[def.id] = to;
    const was = st.done.includes(def.id);
    const justDone = !was && to >= target;
    if (justDone) { st.done.push(def.id); out.eclats += MISSION_REWARD.eclats; }
    out.lines.push({ icon: def.icon, text: def.text.replace('{n}', String(target)), from, to, target, justDone, done: was || justDone });
  }
  if (!st.chest && st.done.length >= 3) {
    st.chest = true; st.chestsOpened += 1; out.chestOpened = true;
    out.eclats += CHEST_REWARD.eclats; out.poussiere += CHEST_REWARD.poussiere;
  }
  if (out.eclats) addCurrency(p, 'eclats', out.eclats);
  if (out.poussiere) addCurrency(p, 'poussiere', out.poussiere);
  return out;
}

/** Temps restant avant les nouvelles missions (minuit UTC), ex. « 5 h 12 ». */
export function timeToReset(now = new Date()): string {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const min = Math.max(0, Math.round((next - now.getTime()) / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
}

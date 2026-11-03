import type { InstrumentId } from './synth';

/**
 * Partitions de la musique adaptative. Aucune donnée audio : uniquement des motifs.
 *
 * Format d'un motif (`bars`) : une chaîne par mesure, jetons séparés par des espaces.
 * Le nombre de jetons fixe la subdivision (4 = noires, 8 = croches, 16 = doubles).
 *   .   silence          -   prolonge la note précédente
 *   n   entier (peut être négatif) : degré (voir `rel`)
 *   x/X frappe normale / accentuée (percussions)
 * `rel: 'chord'` → n = n-ième note de l'accord de la mesure (0,1,2 puis 3 = octave…)
 * `rel: 'scale'` → n = degré de la gamme du thème (0 = tonique)
 * `chord: true`  → joue l'accord entier (nappes)
 *
 * Couches : chaque piste a un seuil `min` d'intensité (0..1). L'intensité monte avec
 * le combat, baisse au calme : les percussions puis la mélodie entrent progressivement.
 */
export interface Track {
  inst: InstrumentId;
  bars: string[];
  rel?: 'chord' | 'scale';
  chord?: boolean;
  octave?: number;     // décalage en octaves par rapport à la racine du thème
  gain?: number;
  min?: number;        // intensité minimale pour entendre la piste
  reverb?: number;     // envoi vers la réverbération (0..1)
}

export interface Theme {
  id: string;
  name: string;
  kind: 'synth' | 'file';
  /** kind 'file' : clé du manifest d'assets (boucle). */
  asset?: string;
  bpm: number;
  root: number;        // note MIDI de la tonique
  scale: number[];     // intervalles en demi-tons
  /** Accords : degré de la gamme par mesure (boucle). */
  progression: number[];
  tracks: Track[];
  /** Gain global du thème. */
  gain?: number;
  /** Ambiance d'arrière-plan associée (bus ambiance). */
  ambience?: AmbienceId;
}

export type AmbienceId = 'wind' | 'mist' | 'crypt' | 'rift' | 'shrine';

export const SCALES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  hungarian: [0, 2, 3, 6, 7, 8, 11],
} as const;

const S = (s: readonly number[]): number[] => [...s];

export const THEMES: Record<string, Theme> = {
  /* ───────────── Biomes ───────────── */

  citadel: {
    id: 'citadel', name: 'Citadelle en ruine', kind: 'synth', ambience: 'wind',
    bpm: 84, root: 50 /* Ré */, scale: S(SCALES.aeolian), progression: [0, 5, 2, 6, 0, 5, 3, 4],
    tracks: [
      { inst: 'drone', bars: ['0 - - -'], rel: 'scale', octave: -2, gain: 0.9 },
      { inst: 'strings', bars: ['0 - - -'], chord: true, octave: -1, gain: 0.8, reverb: 0.5 },
      { inst: 'lyre', rel: 'chord', octave: 0, reverb: 0.45, gain: 0.85,
        bars: ['0 . 1 . 2 . 1 . 3 . 2 . 1 . 2 .', '0 . 2 . 1 . 3 . 2 . 1 . 0 . . .'] },
      { inst: 'frame', min: 0.3, gain: 0.8, bars: ['X . . . x . . x . . x . . . x .'] },
      { inst: 'rim', min: 0.45, gain: 0.5, bars: ['. . x . . . x . . . x . . x x .'] },
      { inst: 'taiko', min: 0.6, gain: 0.7, bars: ['X . . . . . . . X . . . . . . .'] },
      { inst: 'horn', min: 0.62, rel: 'scale', octave: 0, gain: 0.7, reverb: 0.5,
        bars: ['4 - - 3 2 - 0 -', '2 - 3 4 5 - - -', '4 - - 3 2 - 3 -', '1 - - - 0 - - -'] },
    ],
  },

  mists: {
    id: 'mists', name: 'Forêt des Brumes', kind: 'synth', ambience: 'mist',
    bpm: 72, root: 49 /* Do# */, scale: S(SCALES.phrygian), progression: [0, 1, 0, 6, 5, 1, 0, 0],
    tracks: [
      { inst: 'drone', bars: ['0 - - -'], rel: 'scale', octave: -2 },
      { inst: 'choir', bars: ['0 - - -', '. 0 - -'], chord: true, octave: 0, gain: 0.7, reverb: 0.8 },
      { inst: 'harp', rel: 'chord', octave: 1, gain: 0.6, reverb: 0.7,
        bars: ['0 . . 2 . . 1 . . 3 . . 2 . . .', '. . 0 . . 1 . . 2 . . . 4 . . .'] },
      { inst: 'bell', rel: 'scale', octave: 1, gain: 0.5, reverb: 0.9, bars: ['4 . . .', '. . . .', '. . 1 .', '. . . .'] },
      { inst: 'tom', min: 0.35, gain: 0.7, bars: ['x . . . . . x . . . x . . . . .'] },
      { inst: 'taiko', min: 0.55, gain: 0.6, bars: ['X . . . . . . x . . . . X . . .'] },
      { inst: 'strings', min: 0.65, rel: 'scale', octave: 0, gain: 0.9, reverb: 0.6,
        bars: ['0 - 1 - 3 - - -', '4 - 3 - 1 - - -', '0 - 1 - 3 - 5 -', '4 - - - - - - -'] },
    ],
  },

  crypt: {
    id: 'crypt', name: 'Crypte des Offrandes', kind: 'synth', ambience: 'crypt',
    bpm: 92, root: 47 /* Si */, scale: S(SCALES.harmonic), progression: [0, 5, 3, 4, 0, 5, 1, 4],
    tracks: [
      { inst: 'organ', bars: ['0 - - -'], chord: true, octave: -1, gain: 0.8, reverb: 0.6 },
      { inst: 'bass', rel: 'chord', octave: -2, gain: 0.8, bars: ['0 . . 0 . . 0 . 0 . . 0 . . 2 .'] },
      { inst: 'lyre', rel: 'chord', octave: 1, gain: 0.55, reverb: 0.5,
        bars: ['2 1 0 1 2 1 0 1 3 2 1 2 3 2 1 2'] },
      { inst: 'frame', min: 0.25, bars: ['X . . x . . X . . . x . X . . .'] },
      { inst: 'anvil', min: 0.5, gain: 0.5, reverb: 0.5, bars: ['. . . . X . . . . . . . X . . .'] },
      { inst: 'taiko', min: 0.5, bars: ['X . . . . . X . . . X . . . . .'] },
      { inst: 'choir', min: 0.7, rel: 'scale', octave: 0, gain: 0.8, reverb: 0.8,
        bars: ['0 - - - 1 - - -', '2 - - - 1 - 6 -', '0 - - - 4 - - -', '3 - 2 - 1 - - -'] },
    ],
  },

  rift: {
    id: 'rift', name: 'Faille de la Lune brisée', kind: 'synth', ambience: 'rift',
    bpm: 104, root: 42 /* Fa# */, scale: S(SCALES.hungarian), progression: [0, 1, 0, 6, 0, 1, 3, 4],
    tracks: [
      { inst: 'drone', bars: ['0 - - -'], rel: 'scale', octave: -1, gain: 0.8 },
      { inst: 'strings', bars: ['0 - - -'], chord: true, octave: 0, gain: 0.6, reverb: 0.6 },
      { inst: 'bass', rel: 'chord', octave: -1, gain: 0.7, bars: ['0 0 . 0 0 . 0 . 0 0 . 0 1 . 0 .'] },
      { inst: 'bell', rel: 'chord', octave: 2, gain: 0.35, reverb: 0.9, bars: ['0 . . . . . 2 . . . . . 1 . . .'] },
      { inst: 'tom', min: 0.25, bars: ['x . x . . x . . x . x . . x . x'] },
      { inst: 'taiko', min: 0.45, bars: ['X . . X . . X . . . X . X . . .'] },
      { inst: 'horn', min: 0.6, rel: 'scale', gain: 0.75, reverb: 0.5,
        bars: ['0 - 1 - 3 - 2 1', '0 - - - - - - -', '4 - 3 - 2 - 3 -', '1 - - - 0 - - -'] },
      { inst: 'choir', min: 0.8, chord: true, gain: 0.5, reverb: 0.8, bars: ['0 - - -'] },
    ],
  },

  /* ───────────── Boss ───────────── */

  bossJudge: {
    id: 'bossJudge', name: 'Le Juge Pourpre', kind: 'synth', ambience: 'wind', gain: 1.05,
    bpm: 132, root: 50 /* Ré */, scale: S(SCALES.harmonic), progression: [0, 0, 5, 4, 0, 0, 3, 4],
    tracks: [
      { inst: 'bass', rel: 'chord', octave: -2, gain: 0.85, bars: ['0 0 0 0 0 0 1 0 0 0 0 0 2 0 1 0'] },
      { inst: 'strings', rel: 'chord', octave: 0, gain: 0.55, bars: ['0 2 1 2 0 2 1 2 0 2 1 2 0 2 3 2'] },
      { inst: 'taiko', gain: 0.9, bars: ['X . . x . . X . X . . x . . X x'] },
      { inst: 'rim', gain: 0.4, bars: ['x x . x x x . x x x . x x x . x'] },
      { inst: 'anvil', gain: 0.55, reverb: 0.6, bars: ['. . . . X . . . . . . . X . . .'] },
      { inst: 'horn', rel: 'scale', gain: 0.9, reverb: 0.4,
        bars: ['0 - - - 4 - - 3', '2 - 1 - 0 - - -', '5 - - - 4 - 3 -', '6 - - - 4 - - -'] },
      { inst: 'choir', chord: true, gain: 0.7, reverb: 0.7, min: 0.5, bars: ['0 - - -'] },
    ],
  },

  bossWarden: {
    id: 'bossWarden', name: 'Gardien du Sceau lunaire', kind: 'synth', ambience: 'mist', gain: 1.05,
    bpm: 120, root: 48 /* Do */, scale: S(SCALES.phrygian), progression: [0, 1, 0, 1, 5, 6, 0, 1],
    tracks: [
      { inst: 'drone', bars: ['0 - - -'], rel: 'scale', octave: -2 },
      { inst: 'bass', rel: 'chord', octave: -2, gain: 0.8, bars: ['0 . 0 0 . 0 0 . 0 . 0 0 . 0 1 .'] },
      { inst: 'harp', rel: 'chord', octave: 1, gain: 0.5, reverb: 0.5, bars: ['0 1 2 3 2 1 0 1 2 3 4 3 2 1 2 1'] },
      { inst: 'taiko', gain: 0.85, bars: ['X . . . X . . x X . . . X . x x'] },
      { inst: 'tom', gain: 0.6, bars: ['. . x . . . x . . . x . . x . .'] },
      { inst: 'choir', rel: 'scale', gain: 0.9, reverb: 0.8,
        bars: ['0 - - - 1 - - -', '3 - - - 1 - - -', '5 - - - 4 - 3 -', '1 - - - - - - -'] },
      { inst: 'bell', rel: 'scale', octave: 1, gain: 0.45, reverb: 0.9, bars: ['0 . . .', '1 . . .'] },
    ],
  },

  bossEclipse: {
    id: 'bossEclipse', name: "L'Éclipse", kind: 'synth', ambience: 'rift', gain: 1.08,
    bpm: 144, root: 52 /* Mi */, scale: S(SCALES.hungarian), progression: [0, 1, 0, 3, 0, 1, 5, 4],
    tracks: [
      { inst: 'bass', rel: 'chord', octave: -2, gain: 0.9, bars: ['0 0 1 0 0 0 1 0 0 0 1 0 2 1 0 1'] },
      { inst: 'organ', chord: true, octave: -1, gain: 0.6, reverb: 0.6, bars: ['0 - - -'] },
      { inst: 'strings', rel: 'chord', octave: 1, gain: 0.45, bars: ['0 1 2 1 0 1 2 1 3 2 1 2 3 2 1 2'] },
      { inst: 'taiko', gain: 0.95, bars: ['X . x . X . . x X . x . X x X x'] },
      { inst: 'anvil', gain: 0.5, reverb: 0.6, bars: ['. . . . X . . . . . . . X . . X'] },
      { inst: 'horn', rel: 'scale', gain: 0.85, reverb: 0.4,
        bars: ['0 - 1 - 3 - 4 -', '3 - 1 - 0 - - -', '4 - 5 - 6 - 7 -', '6 - 4 - 3 - 1 -'] },
      { inst: 'choir', chord: true, gain: 0.75, reverb: 0.8, bars: ['0 - - -'] },
    ],
  },

  /* ───────────── Hors combat (fichier extrait du prototype) ───────────── */

  sanctuary: {
    id: 'sanctuary', name: 'Lyre d’Akar (Sanctuaire)', kind: 'file', asset: 'music-lyre-akar', ambience: 'shrine',
    bpm: 60, root: 50, scale: S(SCALES.aeolian), progression: [0], tracks: [], gain: 0.9,
  },
};

/** Biome d'une vague (même découpage que le prototype : 1–3, 4–7, 8–10, 11+). */
export function biomeForWave(wave: number): 'citadel' | 'mists' | 'crypt' | 'rift' {
  return wave <= 3 ? 'citadel' : wave <= 7 ? 'mists' : wave <= 10 ? 'crypt' : 'rift';
}

/** Thème de boss : Juge Pourpre (5), Gardien (10), Éclipse (15, 20 et au-delà). */
export function bossThemeForWave(wave: number, bossId?: string): string {
  if (bossId) {
    const k = bossId.toLowerCase();
    if (k.includes('juge') || k.includes('judge')) return 'bossJudge';
    if (k.includes('gard') || k.includes('warden')) return 'bossWarden';
    if (k.includes('eclipse') || k.includes('éclipse')) return 'bossEclipse';
  }
  return wave <= 5 ? 'bossJudge' : wave <= 10 ? 'bossWarden' : 'bossEclipse';
}

/** Durée d'une mesure (4 temps) en secondes. */
export const barSeconds = (bpm: number): number => (60 / bpm) * 4;

/** Note MIDI d'un degré de gamme (degrés négatifs et > 6 acceptés). */
export function scaleNote(root: number, scale: number[], degree: number): number {
  const n = scale.length;
  const oct = Math.floor(degree / n);
  const i = ((degree % n) + n) % n;
  return root + 12 * oct + scale[i];
}

/** Notes MIDI de l'accord (triade) construit sur un degré. */
export function chordNotes(root: number, scale: number[], degree: number): number[] {
  return [0, 2, 4].map((k) => scaleNote(root, scale, degree + k));
}

/** n-ième note d'un accord (3 = octave de la fondamentale, etc.). */
export function chordTone(chord: number[], n: number): number {
  const oct = Math.floor(n / chord.length);
  return chord[((n % chord.length) + chord.length) % chord.length] + 12 * oct;
}

export interface ParsedToken { kind: 'rest' | 'hold' | 'note' | 'hit'; value: number; accent: boolean }

export function parseBar(bar: string): ParsedToken[] {
  return bar.trim().split(/\s+/).map((tok) => {
    if (tok === '.') return { kind: 'rest', value: 0, accent: false };
    if (tok === '-') return { kind: 'hold', value: 0, accent: false };
    if (tok === 'x' || tok === 'X') return { kind: 'hit', value: 0, accent: tok === 'X' };
    const v = Number(tok);
    if (!Number.isFinite(v)) throw new Error(`Jeton de partition invalide : « ${tok} »`);
    return { kind: 'note', value: v, accent: false };
  });
}

/** Événements d'une mesure : position (0..1 de la mesure), durée (fraction), valeur. */
export interface BarEvent { pos: number; len: number; value: number; accent: boolean; hit: boolean }

export function barEvents(bar: string): BarEvent[] {
  const toks = parseBar(bar);
  const step = 1 / toks.length;
  const out: BarEvent[] = [];
  toks.forEach((tk, i) => {
    if (tk.kind !== 'note' && tk.kind !== 'hit') return;
    let len = 1;
    while (toks[i + len]?.kind === 'hold') len++;
    out.push({ pos: i * step, len: len * step, value: tk.value, accent: tk.accent, hit: tk.kind === 'hit' });
  });
  return out;
}

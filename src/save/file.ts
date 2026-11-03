/**
 * Fichier de sauvegarde exportable (.json) : copie de secours manuelle, changement d'appareil.
 *
 * {
 *   "format": "shadow-chronicles-save", "formatVersion": 1,
 *   "createdAt": "…", "checksum": "<cyrb53 hex des données>",
 *   "data": { "profile": {…}, "settings": {…}, "run": {…} | null }
 * }
 *
 * L'import accepte aussi le fichier « Exporter » du prototype (shadow-chronicles-v36-backup).
 * Chaque document passe par migrate() : un fichier ancien est mis à jour, un fichier abîmé nettoyé.
 */
import { bundleFromEntries, entriesFromLegacyFile } from './legacy';
import { FutureVersionError, migrate } from './migrations';
import { isObj } from './sanitize';
import type { Profile, RunSnapshot, Settings } from './types';

export const SAVE_FILE_FORMAT = 'shadow-chronicles-save';
export const SAVE_FILE_VERSION = 1;
export const MAX_IMPORT_BYTES = 2_000_000;

/** Hash cyrb53 (même fonction que la graine du défi quotidien). */
export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export interface SaveData { profile: Profile; settings: Settings; run: RunSnapshot | null }

export function buildSaveFile(data: SaveData, now = new Date()): { filename: string; text: string } {
  const json = JSON.stringify(data);
  const file = {
    format: SAVE_FILE_FORMAT,
    formatVersion: SAVE_FILE_VERSION,
    createdAt: now.toISOString(),
    checksum: cyrb53(json).toString(16),
    data,
  };
  const day = now.toISOString().slice(0, 10);
  return { filename: `shadow-chronicles-sauvegarde-${day}.json`, text: JSON.stringify(file, null, 1) };
}

export interface ImportPreview extends SaveData {
  source: 'native' | 'prototype';
  /** Avertissements non bloquants (somme de contrôle, run du prototype non reprenable…). */
  warnings: string[];
  summary: { eclats: number; poussiere: number; sceaux: number; bestWave: number; runs: number; achievements: number; hasRun: boolean };
}

export class ImportError extends Error {
  constructor(message: string) { super(message); this.name = 'ImportError'; }
}

/** Lit un fichier (texte JSON) et renvoie un aperçu prêt à appliquer. Lève ImportError avec un message joueur. */
export function parseSaveFile(text: string): ImportPreview {
  if (text.length > MAX_IMPORT_BYTES) throw new ImportError('Fichier trop volumineux (limite 2 Mo).');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new ImportError("Ce fichier ne contient pas de JSON valide."); }
  if (!isObj(raw)) throw new ImportError('Format de fichier inconnu.');

  const warnings: string[] = [];
  let profile: Profile, settings: Settings, run: RunSnapshot | null, source: ImportPreview['source'];

  try {
    if (raw.format === SAVE_FILE_FORMAT) {
      if (typeof raw.formatVersion !== 'number' || raw.formatVersion > SAVE_FILE_VERSION)
        throw new ImportError('Ce fichier vient d’une version plus récente du jeu. Mets le jeu à jour puis réessaie.');
      if (!isObj(raw.data) || !isObj(raw.data.profile)) throw new ImportError('Fichier incomplet : profil absent.');
      if (raw.checksum !== cyrb53(JSON.stringify(raw.data)).toString(16))
        warnings.push('Le fichier a été modifié ou abîmé depuis son export : les valeurs invalides ont été corrigées.');
      profile = migrate('profile', raw.data.profile);
      settings = migrate('settings', raw.data.settings ?? {});
      run = raw.data.run ? migrate('run', raw.data.run) : null;
      if (raw.data.run && !run) warnings.push("L'expédition en cours du fichier est illisible et ne sera pas reprise.");
      source = 'native';
    } else {
      const entries = entriesFromLegacyFile(raw);
      if (!entries) throw new ImportError('Format incompatible : utilise un export Shadow Chronicles (nouveau jeu ou prototype V3.6).');
      const b = bundleFromEntries(entries, 'file');
      profile = migrate('profile', b.profile);
      settings = migrate('settings', b.settings);
      run = null;
      source = 'prototype';
      if (b.run) warnings.push(`L'expédition du prototype (vague ${Number(b.run.wave) || 0}) ne peut pas être reprise dans le nouveau moteur : sa meilleure vague est conservée.`);
    }
  } catch (err) {
    if (err instanceof ImportError) throw err;
    if (err instanceof FutureVersionError) throw new ImportError('Ce fichier vient d’une version plus récente du jeu. Mets le jeu à jour puis réessaie.');
    throw new ImportError('Fichier illisible.');
  }

  return {
    profile, settings, run, source, warnings,
    summary: {
      eclats: profile.currencies.eclats,
      poussiere: profile.currencies.poussiere,
      sceaux: profile.currencies.sceaux,
      bestWave: Math.max(profile.stats.bestWaveByMode.survie, profile.stats.bestWaveByMode.cauchemar),
      runs: profile.stats.lifetime.runs ?? 0,
      achievements: Object.keys(profile.achievements).length,
      hasRun: !!run,
    },
  };
}

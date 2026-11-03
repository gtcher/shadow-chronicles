/**
 * Import des sauvegardes du prototype H1.5.x (index.html d'origine).
 *
 * Deux sources possibles :
 *   - le localStorage, si le nouveau jeu est servi depuis la même origine que le prototype ;
 *   - le fichier « Exporter » du prototype (format `shadow-chronicles-v36-backup`).
 *
 * Les clés lues sont exactement celles que le prototype écrivait (liste ALLOWED du module V3.6
 * + sc-v3-badges + mode « effets réduits »). Rien n'est jamais effacé côté prototype.
 */
import { isObj, num } from './sanitize';

export const LEGACY_KEYS = {
  run: 'shadow-chronicles-isometrique-v1-4-save',
  runBackup: 'shadow-chronicles-isometrique-v1-4-save-backup',
  record: 'shadow-chronicles-isometrique-v1-4-record',
  profile: 'shadow-chronicles-akar-progression-v21',
  badges: 'sc-v3-badges',
  theme: 'sc_ux_theme',
  equipment: 'sc_v23_equipment_settings',
  presentation: 'sc-reborn-v18-presentation',
  accessibility: 'sc36_accessibility',
  lowFx: 'shadow-chronicles-v5-rc6-lowfx',
} as const;

export const LEGACY_FILE_FORMAT = 'shadow-chronicles-v36-backup';

/** Valeurs brutes (chaînes) par clé localStorage du prototype. */
export type LegacyEntries = Partial<Record<string, string>>;

export interface LegacyBundle {
  /** Profil au format v1 (voir migrations.ts) : passe ensuite par migrate('profile'). */
  profile: Record<string, unknown>;
  settings: Record<string, unknown>;
  /** Expédition du prototype (non reprenable dans le nouveau moteur, gardée pour mémoire). */
  run: Record<string, unknown> | null;
  sourceKeys: string[];
}

const parse = (s: string | undefined): unknown => {
  if (typeof s !== 'string') return undefined;
  try { return JSON.parse(s); } catch { return s; }
};
const validRun = (d: unknown): d is Record<string, unknown> =>
  isObj(d) && d.version === 1 && Array.isArray(d.heroes) && d.heroes.length === 4;

/** Lit les clés du prototype dans un Storage (localStorage). Renvoie {} si rien. */
export function readLegacyEntries(ls: Storage | undefined = globalThis.localStorage): LegacyEntries {
  const out: LegacyEntries = {};
  if (!ls) return out;
  for (const key of Object.values(LEGACY_KEYS)) {
    try {
      const v = ls.getItem(key);
      if (v !== null && v.length < 400_000) out[key] = v;
    } catch { /* stockage bloqué */ }
  }
  return out;
}

/** Vrai si les entrées contiennent une progression qui vaut la peine d'être importée. */
export function hasLegacyProgress(e: LegacyEntries): boolean {
  return [LEGACY_KEYS.profile, LEGACY_KEYS.badges, LEGACY_KEYS.record, LEGACY_KEYS.run, LEGACY_KEYS.runBackup].some((k) => e[k] !== undefined);
}

/** Reconnaît le fichier exporté par le prototype et en extrait les entrées. */
export function entriesFromLegacyFile(data: unknown): LegacyEntries | null {
  if (!isObj(data) || data.format !== LEGACY_FILE_FORMAT || !isObj(data.entries)) return null;
  const out: LegacyEntries = {};
  for (const key of Object.values(LEGACY_KEYS)) {
    const v = data.entries[key];
    if (typeof v === 'string' && v.length < 400_000) out[key] = v;
  }
  return out;
}

export function bundleFromEntries(e: LegacyEntries, source: 'localStorage' | 'file', now = new Date()): LegacyBundle {
  const sourceKeys = Object.keys(e).filter((k) => e[k] !== undefined);
  const prof = parse(e[LEGACY_KEYS.profile]);
  const badges = parse(e[LEGACY_KEYS.badges]);
  const mainRun = parse(e[LEGACY_KEYS.run]);
  const backupRun = parse(e[LEGACY_KEYS.runBackup]);
  const run = validRun(mainRun) ? mainRun : validRun(backupRun) ? backupRun : null;
  const record = Math.max(num(parse(e[LEGACY_KEYS.record])), run ? num(run.wave) : 0);

  const profile: Record<string, unknown> = {
    ...(isObj(prof) ? prof : {}),
    version: 1,
    badges: isObj(badges) ? badges : {},
    record,
    legacy: { importedAt: now.toISOString(), source, sourceKeys, ...(run ? { run } : {}) },
  };
  const settings: Record<string, unknown> = {
    version: 1,
    presentation: parse(e[LEGACY_KEYS.presentation]),
    accessibility: parse(e[LEGACY_KEYS.accessibility]),
    equipment: parse(e[LEGACY_KEYS.equipment]),
    theme: e[LEGACY_KEYS.theme],
    lowFx: parse(e[LEGACY_KEYS.lowFx]),
  };
  return { profile, settings, run, sourceKeys };
}

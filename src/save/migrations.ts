/**
 * Migrations de schéma. `MIGRATIONS[kind][n]` transforme un document de version n en n + 1.
 *
 * Pour faire évoluer le format :
 *   1. incrémenter CURRENT_VERSION[kind] dans types.ts ;
 *   2. ajouter ici la fonction n → n + 1 (pure, sans accès au stockage) ;
 *   3. ajouter un test dans tests/save.test.ts avec un document de l'ancienne version.
 *
 * La version 1 du profil et des réglages est le format du prototype H1.5.x (localStorage) :
 * l'import du prototype passe donc par la même chaîne que les futures mises à jour.
 */
import sanctuaryData from '../../data/sanctuary.json';
import { defaultProfile, defaultSettings } from './defaults';
import { isObj, int, num, sanitizeProfile, sanitizeRun, sanitizeSettings } from './sanitize';
import { CURRENT_VERSION, type DocKind, type Profile, type RunSnapshot, type Settings } from './types';

type Doc = Record<string, unknown>;
type Migration = (doc: Doc) => Doc;

export class FutureVersionError extends Error {
  constructor(readonly kind: DocKind, readonly found: number) {
    super(`Sauvegarde « ${kind} » en version ${found}, plus récente que ce jeu (v${CURRENT_VERSION[kind]}). Mets le jeu à jour.`);
    this.name = 'FutureVersionError';
  }
}

interface MigrationMap { fromKey: string; map: Record<string, string>; badgesKey: string; badgesMap: Record<string, string> }
const LEGACY_MAP = (sanctuaryData as unknown as { migration: MigrationMap }).migration;

/**
 * Profil v1 (prototype) : { shards, levels: { endurance, offense, guard }, runs, completed, best }
 * + champs ajoutés par l'import : badges (sc-v3-badges), record (meilleure vague), legacy.
 */
function profile1to2(v1: Doc): Doc {
  const p = defaultProfile();
  const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (isObj(o) ? o[k] : undefined), v1);
  for (const [from, to] of Object.entries(LEGACY_MAP.map)) {
    const value = int(get(from));
    const [head, key] = to.split('.');
    if (to === 'eclats') p.currencies.eclats += value;
    else if (key && head in p.sanctuary) p.sanctuary[head][key] = Math.max(p.sanctuary[head][key] ?? 0, value);
    else if (head === 'stats' && key === 'bestWave') {
      p.stats.best.waveReached = Math.max(p.stats.best.waveReached ?? 0, value);
      p.stats.bestWaveByMode.survie = Math.max(p.stats.bestWaveByMode.survie, value);
    } else if (head === 'stats' && key) p.stats.lifetime[key] = (p.stats.lifetime[key] ?? 0) + value;
  }
  const record = int(v1.record);
  if (record > 0) {
    p.stats.best.waveReached = Math.max(p.stats.best.waveReached ?? 0, record);
    p.stats.bestWaveByMode.survie = Math.max(p.stats.bestWaveByMode.survie, record);
  }
  if (isObj(v1.badges)) {
    for (const [old, at] of Object.entries(v1.badges)) {
      const id = LEGACY_MAP.badgesMap[old];
      if (id && at) p.achievements[id] = int(at, Date.now()) || Date.now();
    }
  }
  if (isObj(v1.legacy)) p.legacy = v1.legacy as Profile['legacy'];
  return p as unknown as Doc;
}

/**
 * Réglages v1 (prototype) : clés localStorage regroupées par l'import.
 *   presentation  ← sc-reborn-v18-presentation { music, volume, detail, shake, weather }
 *   accessibility ← sc36_accessibility { largeText, scale, contrast, reducedMotion, bigTap, reminders }
 *   equipment     ← sc_v23_equipment_settings { autoEquip, autoSell, sellMax }
 *   theme         ← sc_ux_theme ; lowFx ← shadow-chronicles-v5-rc6-lowfx
 */
function settings1to2(v1: Doc): Doc {
  const s = defaultSettings();
  const pres = isObj(v1.presentation) ? v1.presentation : {};
  const acc = isObj(v1.accessibility) ? v1.accessibility : {};
  const eq = isObj(v1.equipment) ? v1.equipment : {};
  if (typeof pres.volume === 'number') s.audio.master = num(pres.volume, s.audio.master, 0, 1);
  if (pres.music === false) s.audio.music = 0;
  if (pres.enabled === false) s.audio.muted = true;
  if (pres.detail === 'low' || pres.detail === 'high') s.video.quality = pres.detail;
  if (typeof pres.shake === 'boolean') s.video.screenShake = pres.shake;
  if (typeof pres.weather === 'boolean') s.video.weather = pres.weather;
  if (v1.lowFx === true || v1.lowFx === '1' || v1.lowFx === 'true') s.video.quality = 'low';
  s.accessibility = {
    largeText: acc.largeText === true,
    textScale: num(acc.scale, 1, 0.8, 1.6),
    highContrast: acc.contrast === true,
    reducedMotion: acc.reducedMotion === true,
    bigTap: acc.bigTap === true,
    reminders: acc.reminders !== false,
  };
  s.equipment = { ...s.equipment, ...(eq as object) } as typeof s.equipment;
  if (typeof v1.theme === 'string') s.theme = v1.theme;
  return s as unknown as Doc;
}

export const MIGRATIONS: Record<DocKind, Record<number, Migration>> = {
  profile: { 1: profile1to2 },
  settings: { 1: settings1to2 },
  run: {},
};

function versionOf(doc: unknown): number {
  return isObj(doc) && Number.isInteger(doc.version) && (doc.version as number) > 0 ? (doc.version as number) : 1;
}

/** Applique les migrations manquantes puis nettoie. Lève FutureVersionError pour une version inconnue. */
export function migrate(kind: 'profile', doc: unknown): Profile;
export function migrate(kind: 'settings', doc: unknown): Settings;
export function migrate(kind: 'run', doc: unknown): RunSnapshot | null;
export function migrate(kind: DocKind, doc: unknown): Profile | Settings | RunSnapshot | null {
  let v = versionOf(doc);
  const target = CURRENT_VERSION[kind];
  if (v > target) throw new FutureVersionError(kind, v);
  let cur: Doc = isObj(doc) ? structuredClone(doc) : {};
  while (v < target) {
    const step = MIGRATIONS[kind][v];
    if (!step) throw new Error(`Migration manquante : ${kind} v${v} → v${v + 1}`);
    cur = step(cur);
    v += 1;
    cur.version = v;
  }
  if (kind === 'profile') return sanitizeProfile(cur);
  if (kind === 'settings') return sanitizeSettings(cur);
  return sanitizeRun(cur);
}

/** Façade publique de la sauvegarde : `import { SaveManager, buyUpgrade } from '../save'` (depuis src/game ou src/ui). */
export { SaveManager, type BackupInfo, type OpenOptions, type SaveChange, type SaveStatus } from './SaveManager';
export { CURRENT_VERSION, HERO_IDS, type CurrencyId, type DocKind, type GameMode, type HeroId, type Profile, type RunSnapshot, type Settings } from './types';
export { defaultProfile, defaultSettings } from './defaults';
export { migrate, MIGRATIONS, FutureVersionError } from './migrations';
export { sanitizeProfile, sanitizeSettings, sanitizeRun } from './sanitize';
export { buildSaveFile, parseSaveFile, ImportError, cyrb53, type ImportPreview } from './file';
export { LEGACY_KEYS, readLegacyEntries, bundleFromEntries, entriesFromLegacyFile, hasLegacyProgress } from './legacy';
export { IdbStore, LocalStorageStore, MemoryStore, openBestStore, type KVStore } from './storage';
export { applyBindings, diffBindings } from './bindings';
export * from './progress';

/**
 * Gestionnaire de sauvegarde : point d'entrée unique pour le reste du jeu.
 *
 *   const save = await SaveManager.open();          // au démarrage, avant la première scène
 *   save.profile.currencies.eclats                  // lecture directe (ne pas modifier sans update)
 *   save.update(p => buyUpgrade(p, 'veillee', 'endurance'));   // écriture différée (~1 s)
 *   await save.saveRun(snapshot);                   // fin de vague, mise en pause, onglet caché
 *   save.on('change', ({ doc }) => ui.refresh());
 *
 * Garanties :
 *   - IndexedDB (repli localStorage / mémoire), écriture atomique profil + réglages + run ;
 *   - migrations automatiques à l'ouverture, refus d'écraser une sauvegarde d'une version plus récente ;
 *   - import automatique du prototype au premier lancement (même origine) ;
 *   - copies de secours tournantes (une par jour, 5 gardées) + une avant chaque import / remise à zéro ;
 *   - écriture forcée quand l'onglet est caché ou fermé ; synchronisation entre onglets.
 */
import { defaultProfile, defaultSettings } from './defaults';
import { buildSaveFile, ImportError, parseSaveFile, type ImportPreview, type SaveData } from './file';
import { bundleFromEntries, hasLegacyProgress, readLegacyEntries } from './legacy';
import { FutureVersionError, migrate } from './migrations';
import { sanitizeRun } from './sanitize';
import { openBestStore, type KVStore } from './storage';
import type { Profile, RunSnapshot, Settings } from './types';

const K = { profile: 'profile', settings: 'settings', run: 'run', meta: 'meta' } as const;
const BACKUP_PREFIX = 'backup:';
const MAX_DAILY_BACKUPS = 5;
const MAX_MANUAL_BACKUPS = 5;
const CHANNEL = 'shadow-chronicles-save';

interface Meta { legacyChecked: boolean; lastBackupDay: string | null }

export interface BackupInfo { key: string; at: string; reason: string; eclats: number; bestWave: number }
interface BackupDoc { at: string; reason: string; profile: Profile; settings: Settings }

export type SaveChange = { doc: 'profile' | 'settings' | 'run' | 'all'; external?: boolean };
export type SaveStatus = { storage: KVStore['kind']; persisted: boolean; lastSavedAt: string | null; lastError: string | null; readOnly: boolean };

export interface OpenOptions {
  store?: KVStore;
  /** Storage où chercher les clés du prototype (null = ne pas chercher). Par défaut : localStorage. */
  legacyStorage?: Storage | null;
  /** Délai d'écriture différée (ms). */
  autosaveMs?: number;
  now?: () => Date;
  /** Brancher pagehide / visibilitychange / BroadcastChannel (désactivé dans les tests). */
  attachToWindow?: boolean;
}

export class SaveManager {
  profile: Profile;
  settings: Settings;
  private runDoc: RunSnapshot | null;
  private meta: Meta;
  private dirty = new Set<'profile' | 'settings'>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();
  private listeners = new Set<(c: SaveChange) => void>();
  private channel: BroadcastChannel | null = null;
  private detach: (() => void) | null = null;
  readonly status: SaveStatus;
  /** Rempli si le profil a été importé du prototype à l'ouverture (pour afficher un message d'accueil). */
  importedFromPrototype: ImportPreview['summary'] | null = null;

  private constructor(
    private readonly store: KVStore,
    private readonly opts: Required<Pick<OpenOptions, 'autosaveMs' | 'now'>>,
    init: { profile: Profile; settings: Settings; run: RunSnapshot | null; meta: Meta; readOnly: boolean; error: string | null },
  ) {
    this.profile = init.profile;
    this.settings = init.settings;
    this.runDoc = init.run;
    this.meta = init.meta;
    this.status = { storage: store.kind, persisted: false, lastSavedAt: null, lastError: init.error, readOnly: init.readOnly };
  }

  static async open(options: OpenOptions = {}): Promise<SaveManager> {
    const store = options.store ?? (await openBestStore());
    const now = options.now ?? (() => new Date());
    const [rawProfile, rawSettings, rawRun, rawMeta] = await Promise.all([
      store.get(K.profile), store.get(K.settings), store.get(K.run), store.get<Meta>(K.meta),
    ]);
    const meta: Meta = { legacyChecked: !!rawMeta?.legacyChecked, lastBackupDay: rawMeta?.lastBackupDay ?? null };

    let readOnly = false, error: string | null = null;
    let profile: Profile, settings: Settings, run: RunSnapshot | null = null;
    try {
      profile = rawProfile ? migrate('profile', rawProfile) : defaultProfile(now());
      settings = rawSettings ? migrate('settings', rawSettings) : defaultSettings();
      try { run = rawRun ? migrate('run', rawRun) : null; } catch { run = null; }
    } catch (err) {
      // Sauvegarde venue d'une version plus récente (retour en arrière de version) : on joue
      // sur une copie en mémoire sans jamais écraser les données du joueur.
      if (!(err instanceof FutureVersionError)) throw err;
      readOnly = true;
      error = err.message;
      profile = defaultProfile(now());
      settings = defaultSettings();
    }

    const sm = new SaveManager(store, { autosaveMs: options.autosaveMs ?? 1000, now }, { profile, settings, run, meta, readOnly, error });

    // Premier lancement : reprendre la progression du prototype si elle est sur la même origine.
    if (!readOnly && !rawProfile && !meta.legacyChecked) {
      const ls = options.legacyStorage === undefined ? (globalThis as { localStorage?: Storage }).localStorage : options.legacyStorage ?? undefined;
      const entries = ls ? readLegacyEntries(ls) : {};
      if (hasLegacyProgress(entries)) {
        const b = bundleFromEntries(entries, 'localStorage', now());
        sm.profile = migrate('profile', b.profile);
        if (!rawSettings) sm.settings = migrate('settings', b.settings);
        sm.importedFromPrototype = {
          eclats: sm.profile.currencies.eclats, poussiere: 0, sceaux: 0,
          bestWave: sm.profile.stats.bestWaveByMode.survie, runs: sm.profile.stats.lifetime.runs ?? 0,
          achievements: Object.keys(sm.profile.achievements).length, hasRun: false,
        };
        sm.dirty.add('profile').add('settings');
      }
      sm.meta.legacyChecked = true;
      if (!rawProfile) sm.dirty.add('profile');
    }

    if (!readOnly) {
      await sm.flush();
      await sm.dailyBackup();
    }
    if (options.attachToWindow !== false && typeof window !== 'undefined') sm.attach();
    void sm.requestPersistence();
    return sm;
  }

  // ─── lecture / écriture ───────────────────────────────────────────────────

  get run(): RunSnapshot | null { return this.runDoc; }

  /** Modifie le profil et programme une écriture. Renvoie la valeur de `fn` (pratique pour buyUpgrade). */
  update<T>(fn: (p: Profile) => T): T {
    const out = fn(this.profile);
    this.markDirty('profile');
    return out;
  }

  updateSettings<T>(fn: (s: Settings) => T): T {
    const out = fn(this.settings);
    this.markDirty('settings');
    return out;
  }

  /** Enregistre l'expédition en cours immédiatement (avec le profil s'il a changé). */
  async saveRun(snapshot: Omit<RunSnapshot, 'version' | 'savedAt'> & Partial<Pick<RunSnapshot, 'savedAt'>>): Promise<boolean> {
    const run = sanitizeRun({ ...snapshot, savedAt: this.opts.now().toISOString() });
    if (!run) throw new Error('saveRun : instantané invalide (hero, seed et state sont obligatoires)');
    this.runDoc = run;
    return this.write({ run: true });
  }

  /** Fin de run (mort, victoire, abandon) : l'expédition ne peut plus être reprise. */
  async clearRun(): Promise<boolean> {
    this.runDoc = null;
    return this.write({ run: true });
  }

  private markDirty(doc: 'profile' | 'settings'): void {
    this.dirty.add(doc);
    this.emit({ doc });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, this.opts.autosaveMs);
  }

  /** Écrit tout ce qui est en attente. À appeler avant un changement de scène important. */
  flush(): Promise<boolean> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    return this.write({});
  }

  /** Les écritures sont mises en file : jamais deux transactions entremêlées. */
  private write(extra: { run?: boolean }): Promise<boolean> {
    const job = this.writing.then(() => this.doWrite(extra));
    this.writing = job.then(() => undefined, () => undefined);
    return job;
  }

  private async doWrite(extra: { run?: boolean }): Promise<boolean> {
    if (this.status.readOnly) return false;
    if (!this.dirty.size && !extra.run) return true;
    const entries: Record<string, unknown> = { [K.meta]: this.meta };
    const docs = new Set(this.dirty);
    this.dirty.clear();
    if (docs.has('profile')) {
      this.profile.rev += 1;
      this.profile.updatedAt = this.opts.now().toISOString();
      entries[K.profile] = this.profile;
    }
    if (docs.has('settings')) entries[K.settings] = this.settings;
    try {
      if (extra.run) {
        if (this.runDoc) entries[K.run] = this.runDoc;
        else await this.store.delete(K.run);
      }
      await this.store.setMany(entries);
      this.status.lastSavedAt = this.opts.now().toISOString();
      this.status.lastError = null;
      if (docs.size || extra.run) this.channel?.postMessage({ rev: this.profile.rev, docs: [...docs, ...(extra.run ? ['run'] : [])] });
      return true;
    } catch (err) {
      for (const d of docs) this.dirty.add(d); // on réessaiera à la prochaine écriture
      this.status.lastError = err instanceof Error ? err.message : String(err);
      console.error('[save] écriture impossible', err);
      return false;
    }
  }

  // ─── copies de secours ────────────────────────────────────────────────────

  private async dailyBackup(): Promise<void> {
    const day = this.opts.now().toISOString().slice(0, 10);
    if (this.meta.lastBackupDay === day) return;
    await this.backup('auto');
    this.meta.lastBackupDay = day;
    await this.store.setMany({ [K.meta]: this.meta });
  }

  /** Crée une copie de secours du profil et des réglages actuels. */
  async backup(reason: 'auto' | 'before-import' | 'before-reset' | 'manual'): Promise<string> {
    const at = this.opts.now().toISOString();
    const key = `${BACKUP_PREFIX}${at}`;
    const doc: BackupDoc = { at, reason, profile: this.profile, settings: this.settings };
    await this.store.setMany({ [key]: doc });
    // Rotation : on garde les N plus récentes de chaque famille (auto / autres).
    const all = (await this.store.keys()).filter((k) => k.startsWith(BACKUP_PREFIX)).sort();
    const docs = await Promise.all(all.map(async (k) => ({ k, d: await this.store.get<BackupDoc>(k) })));
    const autos = docs.filter((x) => x.d?.reason === 'auto').map((x) => x.k);
    const others = docs.filter((x) => x.d?.reason !== 'auto').map((x) => x.k);
    for (const k of [...autos.slice(0, -MAX_DAILY_BACKUPS), ...others.slice(0, -MAX_MANUAL_BACKUPS)]) await this.store.delete(k);
    return key;
  }

  async listBackups(): Promise<BackupInfo[]> {
    const keys = (await this.store.keys()).filter((k) => k.startsWith(BACKUP_PREFIX)).sort().reverse();
    const out: BackupInfo[] = [];
    for (const key of keys) {
      const d = await this.store.get<BackupDoc>(key);
      if (!d?.profile) continue;
      const p = migrate('profile', d.profile);
      out.push({ key, at: d.at, reason: d.reason, eclats: p.currencies.eclats, bestWave: Math.max(p.stats.bestWaveByMode.survie, p.stats.bestWaveByMode.cauchemar) });
    }
    return out;
  }

  async restoreBackup(key: string): Promise<boolean> {
    const d = await this.store.get<BackupDoc>(key);
    if (!d?.profile) return false;
    await this.backup('before-import');
    this.replaceAll({ profile: migrate('profile', d.profile), settings: migrate('settings', d.settings ?? {}), run: null });
    return this.write({ run: true });
  }

  // ─── export / import fichier ──────────────────────────────────────────────

  exportData(): { filename: string; text: string } {
    const data: SaveData = { profile: this.profile, settings: this.settings, run: this.runDoc };
    return buildSaveFile(structuredClone(data), this.opts.now());
  }

  /** Télécharge le fichier de sauvegarde (navigateur). */
  async download(): Promise<void> {
    await this.flush();
    const { filename, text } = this.exportData();
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** Étape 1 : lire le fichier et montrer au joueur ce qu'il contient. Lève ImportError. */
  async previewImport(input: File | Blob | string): Promise<ImportPreview> {
    if (typeof input !== 'string' && input.size > 2_000_000) throw new ImportError('Fichier trop volumineux (limite 2 Mo).');
    return parseSaveFile(typeof input === 'string' ? input : await input.text());
  }

  /** Étape 2 (après confirmation) : remplace la sauvegarde, avec copie de secours de l'actuelle. */
  async applyImport(preview: ImportPreview): Promise<boolean> {
    if (this.status.readOnly) return false;
    await this.flush();
    await this.backup('before-import');
    const profile = structuredClone(preview.profile);
    profile.rev = Math.max(profile.rev, this.profile.rev); // l'import « gagne » face aux autres onglets
    this.replaceAll({ profile, settings: structuredClone(preview.settings), run: preview.run ? structuredClone(preview.run) : null });
    return this.write({ run: true });
  }

  /**
   * Reprend la progression du compte en ligne (src/online/sync.ts). Réglages et expédition en cours
   * restent ceux de l'appareil ; une copie de secours de la progression actuelle est gardée.
   */
  async replaceFromCloud(profile: Profile): Promise<boolean> {
    if (this.status.readOnly) return false;
    await this.flush();
    await this.backup('before-import');
    const p = structuredClone(profile);
    p.rev = Math.max(p.rev, this.profile.rev);
    this.replaceAll({ profile: p, settings: this.settings, run: this.runDoc });
    return this.write({ run: true });
  }

  /** Recommencer de zéro (une copie de secours est gardée). */
  async reset(keepSettings = true): Promise<boolean> {
    await this.flush();
    await this.backup('before-reset');
    const rev = this.profile.rev;
    const profile = defaultProfile(this.opts.now());
    profile.rev = rev;
    this.replaceAll({ profile, settings: keepSettings ? this.settings : defaultSettings(), run: null });
    return this.write({ run: true });
  }

  private replaceAll(d: SaveData): void {
    this.profile = d.profile;
    this.settings = d.settings;
    this.runDoc = d.run;
    this.dirty.add('profile').add('settings');
    this.emit({ doc: 'all' });
  }

  // ─── événements, navigateur ───────────────────────────────────────────────

  on(_type: 'change', fn: (c: SaveChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(c: SaveChange): void {
    for (const fn of [...this.listeners]) {
      try { fn(c); } catch (err) { console.error('[save] listener', err); }
    }
  }

  /** Demande au navigateur de ne pas effacer les données en cas de manque de place. */
  async requestPersistence(): Promise<boolean> {
    try {
      const sm = (globalThis as { navigator?: Navigator }).navigator?.storage;
      if (!sm?.persist) return false;
      this.status.persisted = (await sm.persisted()) || (await sm.persist());
    } catch { /* non pris en charge */ }
    return this.status.persisted;
  }

  /** Recharge depuis le stockage (un autre onglet a écrit). */
  async reload(): Promise<void> {
    const [p, s, r] = await Promise.all([this.store.get(K.profile), this.store.get(K.settings), this.store.get(K.run)]);
    if (p) {
      const profile = migrate('profile', p);
      if (profile.rev >= this.profile.rev) this.profile = profile;
    }
    if (s) this.settings = migrate('settings', s);
    this.runDoc = r ? migrate('run', r) : null;
    this.emit({ doc: 'all', external: true });
  }

  private attach(): void {
    const flushNow = () => { void this.flush(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flushNow(); };
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', onVisibility);
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (e: MessageEvent<{ rev: number }>) => {
        // Un autre onglet a sauvegardé : si on n'a rien en attente, on se met à jour.
        if (!this.dirty.size && e.data.rev >= this.profile.rev) void this.reload();
      };
    }
    this.detach = () => {
      window.removeEventListener('pagehide', flushNow);
      document.removeEventListener('visibilitychange', onVisibility);
      this.channel?.close();
      this.channel = null;
    };
  }

  async close(): Promise<void> {
    await this.flush();
    this.detach?.();
    this.listeners.clear();
  }
}

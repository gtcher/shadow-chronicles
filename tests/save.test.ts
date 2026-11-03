import { describe, expect, it } from 'vitest';
import {
  SaveManager, MemoryStore, migrate, parseSaveFile, buildSaveFile, ImportError, FutureVersionError,
  buyUpgrade, unlockBuilding, recordRunEnd, recordDaily, unlockAchievement, masteryLevel,
  applyBindings, diffBindings, LEGACY_KEYS, CURRENT_VERSION, type KVStore,
} from '../src/save';

/** Storage minimal (localStorage du prototype). */
class FakeStorage implements Storage {
  private m = new Map<string, string>();
  constructor(init: Record<string, string> = {}) { for (const [k, v] of Object.entries(init)) this.m.set(k, v); }
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}

const clock = (iso = '2026-11-02T12:00:00Z') => { let t = Date.parse(iso); return { now: () => new Date(t), advance: (ms: number) => (t += ms) }; };
const open = (store: KVStore = new MemoryStore(), extra: Record<string, unknown> = {}) =>
  SaveManager.open({ store, legacyStorage: null, attachToWindow: false, autosaveMs: 5, now: clock().now, ...extra });

/** Données réalistes du prototype H1.5.2 (formats lus dans index.html). */
const prototypeEntries = () => ({
  [LEGACY_KEYS.profile]: JSON.stringify({ shards: 57, levels: { endurance: 2, offense: 3, guard: 1 }, runs: 9, completed: 14, best: 11 }),
  [LEGACY_KEYS.badges]: JSON.stringify({ first: 1761000000000, chapter: 1761000100000, judge: 1761000200000 }),
  [LEGACY_KEYS.record]: '12',
  [LEGACY_KEYS.run]: JSON.stringify({ version: 1, wave: 7, gold: 300, heroes: [{}, {}, {}, {}], lead: 1 }),
  [LEGACY_KEYS.presentation]: JSON.stringify({ enabled: true, music: false, volume: 0.3, detail: 'high', shake: false, weather: true }),
  [LEGACY_KEYS.accessibility]: JSON.stringify({ largeText: true, scale: 1.3, contrast: true, reducedMotion: true }),
  [LEGACY_KEYS.equipment]: JSON.stringify({ autoEquip: true, autoSell: false, sellMax: 'rare' }),
  [LEGACY_KEYS.theme]: 'ember',
});

describe('migrations', () => {
  it('profil v1 (prototype) → v2 selon sanctuary.json > migration', () => {
    const p = migrate('profile', { shards: 57, levels: { endurance: 2, offense: 3, guard: 1 }, runs: 9, completed: 14, best: 11, badges: { first: 5, lore: 6, inconnu: 7 } });
    expect(p.version).toBe(CURRENT_VERSION.profile);
    expect(p.currencies.eclats).toBe(57);
    expect(p.sanctuary.veillee).toEqual({ endurance: 2, offense: 3, guard: 1 });
    expect(p.stats.lifetime.runs).toBe(9);
    expect(p.stats.lifetime.contractsCompleted).toBe(14);
    expect(p.stats.best.waveReached).toBe(11);
    expect(p.stats.bestWaveByMode.survie).toBe(11);
    expect(Object.keys(p.achievements).sort()).toEqual(['a_eclat_lune', 'a_premieres_cendres']);
  });

  it('nettoie un profil abîmé sans planter', () => {
    const p = migrate('profile', { version: 2, currencies: { eclats: -5, sceaux: 'x', poussiere: 1e99 }, sanctuary: { veillee: { endurance: 99, hack: 3 }, fake: { a: 1 } }, mastery: null, daily: { history: { 'pas-une-date': {}, '2026-11-01': { score: 10 } } } });
    expect(p.currencies).toEqual({ eclats: 0, poussiere: 9_999_999, sceaux: 0 });
    expect(p.sanctuary.veillee).toEqual({ endurance: 5 });
    expect(p.sanctuary.fake).toBeUndefined();
    expect(p.mastery.mei.xp).toBe(0);
    expect(Object.keys(p.daily.history)).toEqual(['2026-11-01']);
  });

  it('refuse une sauvegarde d’une version future', () => {
    expect(() => migrate('profile', { version: 99 })).toThrow(FutureVersionError);
  });

  it('réglages v1 (prototype) → v2', () => {
    const s = migrate('settings', { presentation: { music: false, volume: 0.3, detail: 'high', shake: false }, accessibility: { scale: 1.3, contrast: true }, equipment: { sellMax: 'rare', autoEquip: true }, theme: 'ember' });
    expect(s.audio.master).toBe(0.3);
    expect(s.audio.music).toBe(0);
    expect(s.video.quality).toBe('high');
    expect(s.video.screenShake).toBe(false);
    expect(s.accessibility.textScale).toBe(1.3);
    expect(s.accessibility.highContrast).toBe(true);
    expect(s.equipment).toEqual({ autoEquip: true, autoSell: false, sellMax: 'rare' });
    expect(s.theme).toBe('ember');
  });

  it('une run sans héros ou sans état est rejetée', () => {
    expect(migrate('run', { version: 1, seed: 'x', state: {} })).toBeNull();
    expect(migrate('run', { version: 1, hero: 'mei', seed: 'x', state: { a: 1 }, rng: { waves: 123 } })?.rng.waves).toBe(123);
  });
});

describe('SaveManager', () => {
  it('crée un profil neuf puis le relit', async () => {
    const store = new MemoryStore();
    const a = await open(store);
    a.update((p) => { p.currencies.eclats = 42; });
    await a.flush();
    const b = await open(store);
    expect(b.profile.currencies.eclats).toBe(42);
    expect(b.profile.id).toBe(a.profile.id);
    expect(b.profile.rev).toBeGreaterThan(0);
  });

  it('écriture différée automatique', async () => {
    const store = new MemoryStore();
    const a = await open(store);
    a.update((p) => { p.currencies.sceaux = 3; });
    await new Promise((r) => setTimeout(r, 30));
    expect((store.data.get('profile') as { currencies: { sceaux: number } }).currencies.sceaux).toBe(3);
  });

  it('importe le prototype au premier lancement, une seule fois', async () => {
    const store = new MemoryStore();
    const ls = new FakeStorage(prototypeEntries());
    const a = await open(store, { legacyStorage: ls });
    expect(a.importedFromPrototype).toMatchObject({ eclats: 57, bestWave: 12, runs: 9, achievements: 3 });
    expect(a.profile.legacy?.source).toBe('localStorage');
    expect((a.profile.legacy?.run as { wave: number }).wave).toBe(7);
    expect(a.settings.audio.master).toBe(0.3);
    expect(ls.getItem(LEGACY_KEYS.profile)).not.toBeNull(); // le prototype n'est pas touché

    a.update((p) => { p.currencies.eclats = 0; });
    await a.flush();
    const b = await open(store, { legacyStorage: ls });
    expect(b.importedFromPrototype).toBeNull();
    expect(b.profile.currencies.eclats).toBe(0);
  });

  it('sauvegarde, reprend et efface une run', async () => {
    const store = new MemoryStore();
    const a = await open(store);
    await a.saveRun({ seed: 'SC-D-2026-11-02', rng: { waves: 99, loot: 7 }, hero: 'ren', mode: 'cauchemar', daily: true, wave: 6, pactPoints: 0, elapsedSec: 300, stateVersion: 1, state: { hp: 40 } });
    const b = await open(store);
    expect(b.run).toMatchObject({ hero: 'ren', wave: 6, rng: { waves: 99, loot: 7 }, state: { hp: 40 } });
    await b.clearRun();
    expect((await open(store)).run).toBeNull();
  });

  it('ne réécrit jamais une sauvegarde plus récente (lecture seule)', async () => {
    const store = new MemoryStore();
    await store.setMany({ profile: { version: 99, secret: true } });
    const a = await open(store);
    expect(a.status.readOnly).toBe(true);
    a.update((p) => { p.currencies.eclats = 1; });
    await a.flush();
    expect(store.data.get('profile')).toEqual({ version: 99, secret: true });
  });

  it('copie de secours quotidienne, rotation et restauration', async () => {
    const store = new MemoryStore();
    const c = clock();
    const a = await open(store, { now: c.now });
    a.update((p) => { p.currencies.eclats = 10; });
    await a.flush();
    for (let i = 0; i < 7; i++) { c.advance(86_400_000); await open(store, { now: c.now }); }
    const list = await a.listBackups();
    expect(list.filter((b) => b.reason === 'auto')).toHaveLength(5);
    a.update((p) => { p.currencies.eclats = 999; });
    await a.flush();
    expect(await a.restoreBackup(list[0].key)).toBe(true);
    expect(a.profile.currencies.eclats).toBe(10);
  });
});

describe('fichier export / import', () => {
  it('aller-retour complet avec somme de contrôle', async () => {
    const a = await open();
    a.update((p) => { p.currencies.eclats = 77; p.achievements.a_premieres_cendres = 1; });
    await a.saveRun({ seed: '42', rng: {}, hero: 'mei', mode: 'survie', daily: false, wave: 3, pactPoints: 0, elapsedSec: 1, stateVersion: 1, state: {} });
    const { text, filename } = a.exportData();
    expect(filename).toMatch(/^shadow-chronicles-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/);

    const b = await open();
    const preview = await b.previewImport(text);
    expect(preview.warnings).toEqual([]);
    expect(preview.summary).toMatchObject({ eclats: 77, achievements: 1, hasRun: true });
    await b.applyImport(preview);
    expect(b.profile.currencies.eclats).toBe(77);
    expect(b.run?.hero).toBe('mei');
    expect((await b.listBackups()).some((x) => x.reason === 'before-import')).toBe(true);
  });

  it('signale un fichier modifié et corrige les valeurs', () => {
    const { text } = buildSaveFile({ profile: migrate('profile', { version: 2 }), settings: migrate('settings', {}), run: null });
    const f = JSON.parse(text);
    f.data.profile.currencies.eclats = -50;
    const p = parseSaveFile(JSON.stringify(f));
    expect(p.warnings).toHaveLength(1);
    expect(p.profile.currencies.eclats).toBe(0);
  });

  it('accepte le fichier « Exporter » du prototype V3.6', () => {
    const p = parseSaveFile(JSON.stringify({ format: 'shadow-chronicles-v36-backup', formatVersion: 1, createdAt: '', entries: prototypeEntries() }));
    expect(p.source).toBe('prototype');
    expect(p.profile.currencies.eclats).toBe(57);
    expect(p.profile.legacy?.source).toBe('file');
    expect(p.warnings[0]).toMatch(/vague 7/);
  });

  it('messages clairs pour les mauvais fichiers', () => {
    expect(() => parseSaveFile('pas du json')).toThrow(ImportError);
    expect(() => parseSaveFile('{"format":"autre"}')).toThrow(/Format incompatible/);
    expect(() => parseSaveFile(JSON.stringify({ format: 'shadow-chronicles-save', formatVersion: 9, data: {} }))).toThrow(/plus récente/);
  });
});

describe('méta-progression', () => {
  const fresh = () => migrate('profile', { version: 2 });

  it('Sanctuaire : achat, coût croissant, rang max, fonds, verrou', () => {
    const p = fresh();
    expect(buyUpgrade(p, 'veillee', 'endurance')).toEqual({ ok: false, reason: 'funds' });
    p.currencies.eclats = 24;
    expect(buyUpgrade(p, 'veillee', 'endurance')).toEqual({ ok: true, rank: 1 }); // 8
    expect(buyUpgrade(p, 'veillee', 'endurance')).toEqual({ ok: true, rank: 2 }); // 16
    expect(p.currencies.eclats).toBe(0);
    expect(buyUpgrade(p, 'forge', 'quality')).toEqual({ ok: false, reason: 'locked' });
    p.currencies.eclats = 100;
    expect(unlockBuilding(p, 'forge')).toEqual({ ok: false, reason: 'requirement' }); // bestWave>=4
    p.stats.best.waveReached = 4;
    expect(unlockBuilding(p, 'forge').ok).toBe(true);
    expect(p.currencies.eclats).toBe(75);
  });

  it('fin de run : prime, records, maîtrise', () => {
    const p = fresh();
    const r = recordRunEnd(p, { hero: 'sena', mode: 'survie', wave: 6, wavesCleared: 5, bossWaves: [5], won: false, daily: false, pactPoints: 0, playTimeSec: 600, earned: { eclats: 9 }, counters: { kills: 120, maxCombo: 30 } });
    expect(r.currencies.eclats).toBe(9 + 6 + 5);
    expect(r.newBestWave).toBe(true);
    expect(p.stats.lifetime).toMatchObject({ runs: 1, kills: 120, bossKilled: 1, wavesCleared: 5 });
    expect(p.stats.best).toMatchObject({ maxCombo: 30, waveReached: 6, bossWaveKilled: 5 });
    expect(p.mastery.sena.xp).toBe(5 * 10 + 40);
    expect(masteryLevel(90)).toBe(2);
    expect(r.mastery.to).toBe(2);
    expect(p.unlocks.titles).toContain('t_sena_novice');
  });

  it('succès : une seule fois, récompense de palier', () => {
    const p = fresh();
    expect(unlockAchievement(p, 'a_premieres_cendres')).toBe(true);
    expect(unlockAchievement(p, 'a_premieres_cendres')).toBe(false);
    expect(p.currencies.eclats).toBe(5);
    expect(unlockAchievement(p, 'inexistant')).toBe(false);
  });

  it('défi quotidien : premier essai seulement, série, bougie de veille', () => {
    const p = fresh();
    const res = { score: 15000, wave: 10, hero: 'taro' as const, won: true };
    expect(recordDaily(p, '2026-11-01', res).streak).toBe(1);
    expect(recordDaily(p, '2026-11-01', res).counted).toBe(false);
    for (let d = 2; d <= 7; d++) recordDaily(p, `2026-11-0${d}`, res);
    expect(p.daily.streak).toBe(7);
    expect(p.daily.graceTokens).toBe(1);
    const skip = recordDaily(p, '2026-11-09', res); // le 8 est manqué
    expect(skip).toMatchObject({ streak: 8, usedGrace: true });
    recordDaily(p, '2026-11-12', res); // trou de 3 jours
    expect(p.daily.streak).toBe(1);
    expect(p.daily.streakMax).toBe(8);
  });

  it('touches : seules les modifications sont stockées', () => {
    const b = applyBindings({});
    b.dash = { keys: ['KeyK'], pad: [1] };
    const diff = diffBindings(b);
    expect(Object.keys(diff)).toEqual(['dash']);
    expect(applyBindings(diff).dash.keys).toEqual(['KeyK']);
  });
});

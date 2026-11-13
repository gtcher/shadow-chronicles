import { describe, expect, it } from 'vitest';
import { defaultProfile, SaveManager, MemoryStore } from '../src/save';
import { decideSync, plausibleDaily, plausibleRun, validPseudo, chapterOfWave, type CloudSave } from '../src/online/rules';

const run = { hero: 'ren' as const, mode: 'survie', wave: 8, won: false, timeSec: 300, kills: 200, pact: 0, discovery: false };
const played = (rev: number, runs = 3) => { const p = defaultProfile(new Date('2026-11-13')); p.rev = rev; p.stats.lifetime.runs = runs; return p; };
const cloud = (rev: number, runs = 5): CloudSave => ({ profile: played(9, runs), settings: {}, rev, device: 'Android · Chrome', updated_at: '2026-11-13T10:00:00Z' });

describe('vraisemblance des scores (miroir de schema.sql)', () => {
  it('accepte une run normale et une victoire du robot', () => {
    expect(plausibleRun(run)).toBe(true);
    expect(plausibleRun({ ...run, wave: 21, won: true, timeSec: 1247, kills: 1178 })).toBe(true);
  });
  it('refuse les runs impossibles', () => {
    expect(plausibleRun({ ...run, timeSec: 20 })).toBe(false); // 8 vagues en 20 s
    expect(plausibleRun({ ...run, won: true })).toBe(false); // victoire avant la vague 20
    expect(plausibleRun({ ...run, kills: 5000 })).toBe(false);
    expect(plausibleRun({ ...run, hero: 'zorg' as never })).toBe(false);
    expect(plausibleRun({ ...run, wave: 500, timeSec: 30000 })).toBe(false);
  });
  it('défi du jour : score plafonné par vagues et éliminations', () => {
    const d = { day: '2026-11-13', hero: 'mei' as const, score: 12000, wave: 5, won: false, timeSec: 200, kills: 100 };
    expect(plausibleDaily(d)).toBe(true);
    expect(plausibleDaily({ ...d, score: 99_000 })).toBe(false);
    expect(plausibleDaily({ ...d, day: '13/11/2026' })).toBe(false);
  });
  it('pseudo', () => {
    expect(validPseudo('Gabriel')).toBe(true);
    expect(validPseudo('Élise_42')).toBe(true);
    expect(validPseudo('ab')).toBe(false);
    expect(validPseudo('<script>')).toBe(false);
  });
  it('chapitre d\'une vague', () => {
    expect([1, 4, 8, 11, 20, 40].map(chapterOfWave)).toEqual([1, 2, 3, 4, 4, 4]);
  });
});

describe('synchronisation appareil ↔ cloud', () => {
  const st = { user: 'u1', cloudRev: 4, localRev: 10 };
  it('pas de sauvegarde en ligne : on envoie', () => expect(decideSync(played(10), null, null, 'u1').action).toBe('push'));
  it('cloud inchangé : on envoie seulement si l\'appareil a progressé', () => {
    expect(decideSync(played(10), cloud(4), st, 'u1').action).toBe('none');
    expect(decideSync(played(12), cloud(4), st, 'u1').action).toBe('push');
  });
  it('cloud modifié ailleurs, appareil inchangé : on reprend', () => expect(decideSync(played(10), cloud(6), st, 'u1').action).toBe('pull'));
  it('nouvel appareil vide : on reprend sans demander', () => expect(decideSync(played(1, 0), cloud(6), null, 'u1').action).toBe('pull'));
  it('les deux ont avancé : on demande', () => {
    expect(decideSync(played(12), cloud(6), st, 'u1').action).toBe('ask');
    expect(decideSync(played(12), cloud(6), null, 'u1').action).toBe('ask');
  });
  it('autre compte sur cet appareil : l\'état de synchro est ignoré', () => expect(decideSync(played(10), cloud(4), st, 'u2').action).toBe('ask'));
  it('compte en ligne vide : on envoie celle de l\'appareil', () => expect(decideSync(played(12), cloud(1, 0), null, 'u1').action).toBe('push'));
});

describe('SaveManager.replaceFromCloud', () => {
  it('remplace la progression, garde les réglages et une copie de secours', async () => {
    const save = await SaveManager.open({ store: new MemoryStore(), legacyStorage: null, attachToWindow: false, autosaveMs: 5 });
    save.updateSettings((s) => { s.audio.master = 0.3; });
    await save.flush();
    const p = played(2, 42);
    p.currencies.eclats = 777;
    expect(await save.replaceFromCloud(p)).toBe(true);
    expect(save.profile.currencies.eclats).toBe(777);
    expect(save.profile.rev).toBeGreaterThan(2);
    expect(save.settings.audio.master).toBe(0.3);
    expect((await save.listBackups()).some((b) => b.key)).toBe(true);
    await save.close();
  });
});

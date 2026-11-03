import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/math/Rng';
import { BLESSING_DATA, BlessingEngine, DEFAULT_RUN_CONFIG, resolve } from '../src/game/combat/blessings';
import { ITEM_RARITIES, LOOT, LootSystem } from '../src/game/combat/loot';
import { RunStats } from '../src/game/combat/stats';
import { ACHIEVEMENT_DEFS, checkAchievements, type RunView } from '../src/game/achievements';
import { defaultProfile } from '../src/save';
import type { CombatCtx } from '../src/game/combat/context';
import { BASE_MODS } from '../src/game/modes';

const fakeCtx = (wave = 5) => ({ rng: new Rng(7), wave, time: 0, stats: new RunStats(), mods: BASE_MODS } as unknown as CombatCtx);

describe('bénédictions', () => {
  it('remplace {v} par la valeur de rareté, en profondeur', () => {
    expect(resolve({ a: '{v}', b: ['{v}', 2], c: { d: '{v}' } }, 12)).toEqual({ a: 12, b: [12, 2], c: { d: 12 } });
  });

  it('offre 3 cartes des patrons ouverts, jamais deux fois la même, au plus 2 par patron', () => {
    const b = new BlessingEngine(fakeCtx(), DEFAULT_RUN_CONFIG);
    for (let w = 1; w <= 20; w++) {
      const offer = b.makeOffer(w, 'taro');
      expect(offer.length).toBe(BLESSING_DATA.offerRules.choices);
      expect(new Set(offer.map((c) => c.blessing.id)).size).toBe(offer.length);
      for (const c of offer) expect(DEFAULT_RUN_CONFIG.patrons).toContain(c.blessing.patron);
      const per: Record<string, number> = {};
      for (const c of offer) per[c.blessing.patron] = (per[c.blessing.patron] ?? 0) + 1;
      expect(Math.max(...Object.values(per))).toBeLessThanOrEqual(BLESSING_DATA.offerRules.maxSamePatronInOffer);
      b.pick(offer[0]);
    }
  });

  it("un emplacement non passif n'accepte qu'une bénédiction ; les duos s'activent", () => {
    const b = new BlessingEngine(fakeCtx(), DEFAULT_RUN_CONFIG);
    const frappes = BLESSING_DATA.blessings.filter((x) => x.slot === 'frappe' && DEFAULT_RUN_CONFIG.patrons.includes(x.patron));
    b.pick({ blessing: frappes[0], rarity: 'commun' });
    const r = b.pick({ blessing: frappes[1], rarity: 'rare' });
    expect(r.replaced?.blessing.id).toBe(frappes[0].id);
    expect(b.owned.filter((o) => o.blessing.slot === 'frappe')).toHaveLength(1);
    const shield = BLESSING_DATA.blessings.find((x) => x.patron === 'veilleurs' && x.tags.includes('bouclier'))!;
    const heal = BLESSING_DATA.blessings.find((x) => x.patron === 'sang' && x.tags.includes('soin') && x.slot !== shield.slot)!;
    b.pick({ blessing: shield, rarity: 'commun' });
    const got = b.pick({ blessing: heal, rarity: 'commun' });
    expect([...b.duos, ...got.duos].map((d) => d.id)).toContain('duo_garde_sang');
  });
});

describe('butin', () => {
  it('fabrique des objets cohérents : stats à l\'échelle du niveau, pouvoir pour les légendaires', () => {
    const l = new LootSystem(fakeCtx(), { hero: 'mei', luckPct: 0, firstBossLegendary: false, legendaryPity: 0, ancestralUnlocked: false, ilvlBonus: 0 });
    const lo = l.make('common', 1, 'weapon'), hi = l.make('epic', 20, 'weapon');
    expect(hi.stats.atk).toBeGreaterThan(lo.stats.atk);
    const leg = l.make('legendary', 10, 'ring');
    expect(leg.power?.slot).toBe('ring');
    expect(leg.affixes.length).toBeGreaterThanOrEqual(LOOT.rarities.legendary.affixes[0]);
  });

  it('la pitié garantit une épique puis une légendaire', () => {
    const l = new LootSystem(fakeCtx(1), { hero: 'taro', luckPct: 0, firstBossLegendary: false, legendaryPity: 0, ancestralUnlocked: false, ilvlBonus: 0 });
    const table = { common: 100 };
    const got = Array.from({ length: LOOT.pity.legendary.afterDropsWithout + 1 }, () => l.rollRarity(table));
    expect(got).toContain('epic');
    expect(got).toContain('legendary');
    expect(got.every((r) => ITEM_RARITIES.includes(r))).toBe(true);
  });
});

describe('succès', () => {
  const view = (counters: Record<string, number>, extra: Partial<RunView> = {}): RunView => ({
    hero: 'taro', mode: 'survie', wave: 1, wavesCleared: 0, bossWaves: [], counters, waveCounters: {}, fastestBossKill: Infinity, pending: true, ...extra,
  });
  it('chaque succès a une condition lisible', () => {
    for (const a of ACHIEVEMENT_DEFS) expect(['run', 'wave', 'lifetime']).toContain(a.cond.scope);
  });
  it('débloque selon la run, le cumul et le filtre héros', () => {
    const p = defaultProfile();
    p.stats.lifetime.kills = 95;
    const ids = (r: RunView) => checkAchievements(p, r).map((a) => a.id);
    expect(ids(view({ kills: 4 }))).not.toContain('a_cent_ombres');
    expect(ids(view({ kills: 5 }))).toContain('a_cent_ombres');
    expect(ids(view({}, { wave: 15, hero: 'mei' }))).toContain('a_mei_15');
    expect(ids(view({}, { wave: 15, hero: 'mei' }))).not.toContain('a_taro_15');
    expect(ids(view({}, { fastestBossKill: 18 }))).toContain('a_boss_rapide');
    p.achievements.a_cent_ombres = 1;
    expect(ids(view({ kills: 50 }))).not.toContain('a_cent_ombres');
  });
});

describe('défi quotidien et pactes', () => {
  it('reproduit les vecteurs de daily.json (graine, héros, mode, modificateurs)', async () => {
    const { DAILY, buildDaily, seedStream } = await import('../src/game/modes');
    const vectors = (DAILY as unknown as { validation: { vectors: Array<{ seedString: string; stream: string; expectedFirstUint32: number; expectedConfig: { hero: string; mode: string; modifiers: string[] } }> } }).validation.vectors;
    for (const v of vectors) {
      expect(seedStream(v.seedString, v.stream).uint()).toBe(v.expectedFirstUint32);
      const [, y, m, d] = /SC-D-(\d+)-(\d+)-(\d+)/.exec(v.seedString)!.map(Number);
      const cfg = buildDaily(new Date(Date.UTC(y, m - 1, d, 12)));
      expect(cfg.hero).toBe(v.expectedConfig.hero);
      expect(cfg.mode).toBe(v.expectedConfig.mode);
      expect(cfg.modifiers.map((x) => x.id)).toEqual(v.expectedConfig.modifiers);
    }
  });

  it('compte les points de pacte et applique les contraintes', async () => {
    const { BASE_MODS, applyPacts, pactPoints, dailyScore } = await import('../src/game/modes');
    const r = { p_vigueur: 3, p_fragile: 1, p_benediction: 1, p_vigueur_inconnu: 9 };
    expect(pactPoints(r)).toBe(3 + 4 + 3);
    const m = applyPacts(BASE_MODS, r);
    expect(m.foeHp).toBeCloseTo(1.45);
    expect(m.dmgTaken).toBeCloseTo(1.35);
    expect(m.offerChoices).toBe(2);
    expect(applyPacts(BASE_MODS, { p_vigueur: 99 }).foeHp).toBeCloseTo(1.45);
    expect(dailyScore({ wavesCleared: 10, kills: 100, elites: 2, bosses: 2, timeSec: 500, contracts: 0, won: true, damageTaken: 200 }).total)
      .toBe(10000 + 1000 + 150 + 3000 + 500 + 5000 - 100);
  });
});

import { describe, expect, it } from 'vitest';
import { addMasteryXp, defaultProfile, sanitizeProfile } from '../src/save';
import { autoEquip, equipLook, heroLook, lookOptions, masteryTrack, nextCosmetic, unlockedIds } from '../src/game/cosmetics';
import { compareRuns, leaderboard, pushRecord, formatTime, type RunRecord } from '../src/game/records';

describe('cosmétiques de maîtrise', () => {
  it('les paliers débloquent titre, sillage, tenue et cadre, portés d\'office', () => {
    const p = defaultProfile();
    expect(heroLook(p, 'mei')).toEqual({ frame: false, title: undefined, trail: undefined, skinHue: undefined, aura: undefined });
    const m = addMasteryXp(p, 'mei', 2500);
    const ids = unlockedIds(m.rewards, 'mei');
    expect(ids).toEqual(['t_mei_novice', 'trail_mei', 'skin_mei_alt', 'portrait_mei_gold']);
    autoEquip(p, 'mei', ids);
    const look = heroLook(p, 'mei');
    expect(look.title).toBe('Novice de l\'Ombre');
    expect(look.trail).toBeTypeOf('number');
    expect(look.skinHue).toBeTypeOf('number');
    expect(look.frame).toBe(true);
    // Rien pour les autres héros.
    expect(heroLook(p, 'taro').trail).toBeUndefined();
  });

  it('on ne peut porter que ce qu\'on possède, et retirer', () => {
    const p = defaultProfile();
    expect(equipLook(p, 'taro', 'trail', 'trail_taro')).toBe(false);
    p.unlocks.cosmetics.push('trail_taro');
    expect(equipLook(p, 'taro', 'trail', 'trail_taro')).toBe(true);
    expect(heroLook(p, 'taro').trail).toBeDefined();
    equipLook(p, 'taro', 'trail', undefined);
    expect(heroLook(p, 'taro').trail).toBeUndefined();
    // Sauvegarde modifiée à la main : un cosmétique non possédé n'est pas appliqué.
    p.unlocks.equipped.taro = { aura: 'aura_cauchemar' };
    expect(heroLook(p, 'taro').aura).toBeUndefined();
    expect(sanitizeProfile(JSON.parse(JSON.stringify(p))).unlocks.equipped.taro).toEqual({ aura: 'aura_cauchemar' });
  });

  it('liste des choix, paliers et prochain cosmétique', () => {
    const p = defaultProfile();
    expect(lookOptions(p, 'sena', 'trail').map((o) => o.id)).toEqual(['trail_sena']);
    expect(lookOptions(p, 'sena', 'aura').length).toBe(3);
    p.unlocks.titles.push('Gardien de l\'Aube');
    expect(lookOptions(p, 'sena', 'title').some((o) => o.id === 'Gardien de l\'Aube' && o.owned)).toBe(true);
    expect(masteryTrack('ren', 0)).toHaveLength(9);
    expect(nextCosmetic('ren', 0)).toMatchObject({ level: 2, xpLeft: 60 });
    expect(nextCosmetic('ren', 200)).toMatchObject({ level: 4, label: 'Sillage de Ren', xpLeft: 120 });
    expect(nextCosmetic('ren', 99999)).toBeUndefined();
  });
});

describe('classement personnel', () => {
  const rec = (o: Partial<RunRecord>): RunRecord => ({ at: 1, hero: 'taro', wave: 5, won: false, timeSec: 300, kills: 100, mode: 'survie', pact: 0, discovery: false, ...o });

  it('ordre : vague, victoire, temps, ombres', () => {
    const rows = [rec({ at: 1, wave: 5 }), rec({ at: 2, wave: 8 }), rec({ at: 3, wave: 8, timeSec: 200 }), rec({ at: 4, wave: 20, won: true, timeSec: 1500 })];
    expect(rows.sort(compareRuns).map((r) => r.at)).toEqual([4, 3, 2, 1]);
  });

  it('rang tous héros et par héros, garde les meilleures et les récentes, survit à la sauvegarde', () => {
    const p = defaultProfile();
    for (let i = 0; i < 45; i++) pushRecord(p, rec({ at: i + 1, wave: (i % 9) + 1, hero: i % 2 ? 'mei' : 'taro' }));
    expect(p.records!.length).toBeLessThanOrEqual(40);
    const r = pushRecord(p, rec({ at: 100, wave: 12, hero: 'sena' }));
    expect(r).toMatchObject({ rank: 1, heroRank: 1 });
    const low = pushRecord(p, rec({ at: 101, wave: 1, hero: 'mei' }));
    expect(low.rank).toBeGreaterThan(10);
    expect(p.records!.some((x) => x.at === 101)).toBe(true); // récente : gardée
    expect(leaderboard(p, 'sena')).toHaveLength(1);
    expect(leaderboard(p)[0].at).toBe(100);
    const back = sanitizeProfile(JSON.parse(JSON.stringify(p)));
    expect(back.records).toEqual(p.records);
    expect(formatTime(65)).toBe('1 min 05 s');
  });
});

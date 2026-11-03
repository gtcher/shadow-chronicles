import { describe, expect, it } from 'vitest';
import { codexProgress } from '../src/ui/screens/Codex';
import { sanctuaryGoals, type MetaProfile } from '../src/ui/screens/Sanctuary';
import { codexFromProfile, metaFromProfile } from '../src/ui/saveBridge';
import { requirementText, BLESSINGS, LOOT_UI } from '../src/ui/data';
import { defaultProfile, requirementProgress } from '../src/save';

describe('Codex', () => {
  it('compte les découvertes par section (bénédictions, légendaires, Duos, reliques)', () => {
    const empty = codexProgress({ seenBlessings: [], seenDuos: [], seenPowers: [] });
    expect(empty.found).toBe(0);
    expect(empty.total).toBe(BLESSINGS.blessings.length + BLESSINGS.legendaries.length + BLESSINGS.duos.length + LOOT_UI.legendaryPowers.length);
    const some = codexProgress({ seenBlessings: ['vei_frappe_marteau', 'leg_lune', 'inconnu'], seenDuos: ['duo_givre_foudre'], seenPowers: ['crimson'] });
    expect(some.blessings.found).toBe(1);
    expect(some.legendaries.found).toBe(1);
    expect(some.duos.found).toBe(1);
    expect(some.relics.found).toBe(1);
    expect(some.found).toBe(4);
  });

  it('lit le profil : patrons de départ, patrons débloqués à l’Autel, savoir des Archives', () => {
    const p = defaultProfile();
    let d = codexFromProfile(p);
    expect(d.patronsOpen).toEqual(['veilleurs', 'lune', 'sang']);
    expect(d.scholar).toBe(false);
    p.sanctuary.autel = { patron_orage: 1 };
    p.sanctuary.archives = { codex: 1 };
    d = codexFromProfile(p);
    expect(d.patronsOpen).toContain('orage');
    expect(d.scholar).toBe(true);
  });
});

describe('Sanctuaire : conditions et objectifs', () => {
  it('écrit toutes les conditions de sanctuary.json en clair', () => {
    expect(requirementText('bestWave>=4')).toBe('Atteindre la vague 4');
    expect(requirementText('runs>=3')).toBe('Terminer 3 runs');
    expect(requirementText('bossKilled:5')).toBe('Vaincre le boss de la vague 5');
    expect(requirementText('legendaryFound>=5')).toBe('Trouver 5 objets légendaires');
  });

  it('« bossKilled:5 » n’est pas rempli tant que le boss n’est pas vaincu (avant : affiché comme débloqué)', () => {
    const p = defaultProfile();
    expect(requirementProgress(p, 'bossKilled:5')).toEqual({ have: 0, need: 5, ok: false });
    p.stats.best.bossWaveKilled = 5;
    expect(requirementProgress(p, 'bossKilled:5').ok).toBe(true);
  });

  it('propose le prochain bâtiment à restaurer avec sa progression', () => {
    const p = defaultProfile();
    p.stats.lifetime.runs = 2;
    const meta: MetaProfile = metaFromProfile(p);
    const goals = sanctuaryGoals(meta);
    expect(goals[0]).toMatchObject({ building: 'forge', ready: false, need: 4 });
    expect(goals.find((g) => g.building === 'archives')).toMatchObject({ have: 2, need: 3 });
    p.stats.best.waveReached = 4; p.currencies.eclats = 30;
    expect(sanctuaryGoals(metaFromProfile(p))[0]).toMatchObject({ building: 'forge', ready: true });
  });
});

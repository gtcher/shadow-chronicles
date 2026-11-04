import { describe, expect, it } from 'vitest';
import { defaultProfile, sanitizeProfile } from '../src/save';
import { applyRunToMissions, dailyMissions, missionsForDay, CHEST_REWARD, MISSION_REWARD, type MissionRun } from '../src/game/missions';

const run = (o: Partial<MissionRun> = {}): MissionRun => ({ hero: 'taro', wave: 5, wavesCleared: 4, bosses: 0, counters: {}, ...o });

describe('missions du jour', () => {
  it('3 missions distinctes, stables pour un jour, différentes le lendemain', () => {
    const a = missionsForDay('2026-11-04'), b = missionsForDay('2026-11-04');
    expect(a).toHaveLength(3);
    expect(new Set(a.map((m) => m.def.id)).size).toBe(3);
    expect(a.map((m) => m.def.id)).toEqual(b.map((m) => m.def.id));
    expect(a.filter((m) => m.def.hero).length).toBeLessThanOrEqual(1);
    const days = Array.from({ length: 10 }, (_, i) => missionsForDay(`2026-11-${String(i + 1).padStart(2, '0')}`).map((m) => m.def.id).join());
    expect(new Set(days).size).toBeGreaterThan(5);
  });

  it('cumule sur les runs du jour, paie chaque mission une fois puis le coffre', () => {
    const p = defaultProfile();
    const day = '2026-11-04';
    const huge = run({ wave: 20, wavesCleared: 20, bosses: 4, counters: { kills: 5000, elitesKilled: 99, perfectDodges: 99, maxCombo: 999, duosTaken: 3, salvaged: 99 } });
    const before = p.currencies.eclats;
    const r1 = applyRunToMissions(p, { ...huge, hero: missionsForDay(day).find((m) => m.def.hero)?.def.hero ?? 'taro' }, day);
    // « Lancer N runs » demande plusieurs runs : on rejoue jusqu'au coffre.
    let last = r1, n = 1;
    while (!p.missions!.chest && n++ < 5) last = applyRunToMissions(p, { ...huge, hero: missionsForDay(day).find((m) => m.def.hero)?.def.hero ?? 'taro' }, day);
    expect(p.missions!.chest).toBe(true);
    expect(last.chestOpened || r1.chestOpened).toBe(true);
    expect(p.currencies.eclats - before).toBe(3 * MISSION_REWARD.eclats + CHEST_REWARD.eclats);
    // Plus rien à gagner aujourd'hui.
    const again = applyRunToMissions(p, huge, day);
    expect(again.eclats).toBe(0);
    expect(again.chestOpened).toBe(false);
  });

  it('les records (« en une run ») ne se cumulent pas', () => {
    const p = defaultProfile();
    p.missions = { day: 'x', progress: {}, done: [], chest: false, chestsOpened: 0 };
    // Jour où la mission « reach » existe.
    let day = '';
    for (let i = 1; i < 400 && !day; i++) { const d = new Date(Date.UTC(2026, 0, i)).toISOString().slice(0, 10); if (missionsForDay(d).some((m) => m.def.id === 'reach')) day = d; }
    const target = missionsForDay(day).find((m) => m.def.id === 'reach')!.target;
    applyRunToMissions(p, run({ wave: target - 1 }), day);
    applyRunToMissions(p, run({ wave: target - 1 }), day);
    expect(dailyMissions(p, day).missions.find((m) => m.id === 'reach')!.done).toBe(false);
    applyRunToMissions(p, run({ wave: target }), day);
    expect(dailyMissions(p, day).missions.find((m) => m.id === 'reach')!.done).toBe(true);
  });

  it('remise à zéro le lendemain et survie à la sauvegarde', () => {
    const p = defaultProfile();
    applyRunToMissions(p, run({ counters: { kills: 100 } }), '2026-11-04');
    const back = sanitizeProfile(JSON.parse(JSON.stringify(p)));
    expect(back.missions?.day).toBe('2026-11-04');
    expect(dailyMissions(back, '2026-11-05').missions.every((m) => m.progress === 0 || m.def.id === 'runs' ? true : m.progress === 0)).toBe(true);
    applyRunToMissions(back, run(), '2026-11-05');
    expect(back.missions?.day).toBe('2026-11-05');
  });
});

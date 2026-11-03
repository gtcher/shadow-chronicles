import { describe, expect, it } from 'vitest';
import lootRaw from '../data/loot.json?raw';
import { THEMES, barEvents, biomeForWave, bossThemeForWave, chordNotes, chordTone, parseBar, scaleNote, SCALES } from '../src/game/audio/themes';
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, sliderToGain } from '../src/game/audio/AudioEngine';
import { layerLevel } from '../src/game/audio/Music';
import { SFX_DEFS, lootSound } from '../src/game/audio/Sfx';

describe('Partitions', () => {
  it('chaque mesure de chaque thème est valide (4, 8 ou 16 jetons)', () => {
    for (const th of Object.values(THEMES)) {
      for (const tr of th.tracks) for (const bar of tr.bars) {
        const n = parseBar(bar).length;
        expect([4, 8, 16], `${th.id}/${tr.inst} « ${bar} »`).toContain(n);
      }
      for (const d of th.progression) expect(Number.isInteger(d)).toBe(true);
    }
  });

  it('les notes tenues allongent la durée', () => {
    const ev = barEvents('0 - - 2');
    expect(ev).toHaveLength(2);
    expect(ev[0].len).toBeCloseTo(0.75);
    expect(ev[1].pos).toBeCloseTo(0.75);
    expect(barEvents('X . x .').map((e) => e.accent)).toEqual([true, false]);
  });

  it('rejette un jeton inconnu', () => { expect(() => parseBar('0 a . .')).toThrow(); });

  it('gammes, accords et octaves', () => {
    const am = [...SCALES.aeolian];
    expect(scaleNote(57, am, 0)).toBe(57);
    expect(scaleNote(57, am, 7)).toBe(69);
    expect(scaleNote(57, am, -1)).toBe(55);
    expect(chordNotes(57, am, 0)).toEqual([57, 60, 64]); // la mineur
    expect(chordTone([57, 60, 64], 3)).toBe(69);
  });

  it('couches : fondu autour du seuil', () => {
    expect(layerLevel(0, 0)).toBe(1);
    expect(layerLevel(0.1, 0.6)).toBe(0);
    expect(layerLevel(0.9, 0.6)).toBe(1);
    const mid = layerLevel(0.6, 0.6);
    expect(mid).toBeGreaterThan(0.3); expect(mid).toBeLessThan(0.7);
  });
});

describe('Choix de la musique', () => {
  it('un thème par biome (découpage du prototype)', () => {
    expect([1, 3, 4, 7, 8, 10, 11, 20].map(biomeForWave)).toEqual(['citadel', 'citadel', 'mists', 'mists', 'crypt', 'crypt', 'rift', 'rift']);
  });
  it('un thème par boss', () => {
    expect(bossThemeForWave(5)).toBe('bossJudge');
    expect(bossThemeForWave(10)).toBe('bossWarden');
    expect(bossThemeForWave(15)).toBe('bossEclipse');
    expect(bossThemeForWave(20, 'Juge Pourpre')).toBe('bossJudge');
  });
  it('tous les thèmes référencés existent', () => {
    for (const w of [1, 5, 8, 12]) expect(THEMES[biomeForWave(w)]).toBeDefined();
    for (const w of [5, 10, 20]) expect(THEMES[bossThemeForWave(w)]).toBeDefined();
    expect(THEMES.sanctuary.asset).toBe('music-lyre-akar');
  });
});

describe('Bruitages', () => {
  const loot = JSON.parse(lootRaw);
  it('un son pour chaque rareté de loot.json (fx.sound)', () => {
    for (const [k, r] of Object.entries<{ fx: { sound: string } }>(loot.rarities)) {
      expect(SFX_DEFS[r.fx.sound], k).toBeDefined();
      expect(lootSound(k)).toBe(r.fx.sound);
    }
    expect(lootSound('inconnue')).toBe('loot_common');
  });
  it('un son de tir par héros', () => {
    for (const h of ['taro', 'mei', 'sena', 'ren']) expect(SFX_DEFS[`shoot_${h}`]).toBeDefined();
  });
});

describe('Réglages de volume', () => {
  it('corrige les valeurs invalides', () => {
    expect(sanitizeSettings({ music: 3, sfx: -1, ui: 'x', muted: 1 })).toEqual({ ...DEFAULT_SETTINGS, music: 1, sfx: 0 });
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it('lit une sauvegarde abîmée sans planter', () => {
    expect(loadSettings({ getItem: () => '{oops' })).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({ getItem: () => '{"music":0.25}' }).music).toBe(0.25);
  });
  it('courbe perceptive', () => { expect(sliderToGain(0.5)).toBeCloseTo(0.25); expect(sliderToGain(1)).toBe(1); });
});

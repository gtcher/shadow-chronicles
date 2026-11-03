import { CURRENT_VERSION, HERO_IDS, type HeroId, type Profile, type Settings } from './types';

export function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function perHero<T>(make: () => T): Record<HeroId, T> {
  return Object.fromEntries(HERO_IDS.map((h) => [h, make()])) as Record<HeroId, T>;
}

export function defaultProfile(now = new Date()): Profile {
  const iso = now.toISOString();
  return {
    version: CURRENT_VERSION.profile,
    id: newId(),
    createdAt: iso,
    updatedAt: iso,
    rev: 0,
    currencies: { eclats: 0, poussiere: 0, sceaux: 0 },
    sanctuary: { veillee: {}, autel: {}, forge: {}, archives: {} },
    buildingsUnlocked: [],
    stats: { lifetime: {}, best: {}, bestWaveByMode: { survie: 0, cauchemar: 0 }, playTimeSec: 0 },
    achievements: {},
    mastery: perHero(() => ({ xp: 0, runs: 0, wins: 0 })),
    pity: { legendary: 0, ancestral: 0 },
    pacts: { unlocked: false, bestPoints: 0, milestonesClaimed: [] },
    daily: {
      lastDay: null, streak: 0, streakMax: 0, graceTokens: 0, streakMilestonesClaimed: [],
      history: {}, weeklyDone: [], completed: 0,
    },
    unlocks: { titles: [], cosmetics: [], equipped: {}, seenBlessings: [], seenDuos: [], seenLegendaryPowers: [] },
    heirlooms: [],
  };
}

export function defaultSettings(): Settings {
  return {
    version: CURRENT_VERSION.settings,
    audio: { master: 0.8, music: 0.6, sfx: 0.9, muted: false },
    video: { quality: 'normal', screenShake: true, weather: true, damageNumbers: true },
    accessibility: { largeText: false, textScale: 1, highContrast: false, reducedMotion: false, bigTap: false, reminders: true },
    equipment: { autoEquip: false, autoSell: false, sellMax: 'magic' },
    bindings: {},
    theme: null,
    locale: 'fr',
    lastHero: 'taro',
    tutorialDone: false,
  };
}

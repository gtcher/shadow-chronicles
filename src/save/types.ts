/**
 * Schéma des données sauvegardées (méta-progression, réglages, run en cours).
 *
 * Trois « documents » indépendants, chacun versionné et migré séparément :
 *   - `profile`  : tout ce qui survit à la mort (Sanctuaire, monnaies, maîtrise, succès, quotidien…)
 *   - `settings` : préférences du joueur (audio, accessibilité, touches…)
 *   - `run`      : l'expédition en cours, pour reprendre après fermeture de l'onglet
 *
 * Règle : on n'enlève jamais un champ sans migration. Ajouter un champ facultatif ne demande
 * qu'une valeur par défaut dans `defaults.ts` (le nettoyage complète les profils anciens).
 */
import type { Bindings } from '@engine';

export type HeroId = 'taro' | 'mei' | 'sena' | 'ren';
export const HERO_IDS: readonly HeroId[] = ['taro', 'mei', 'sena', 'ren'];

export type CurrencyId = 'eclats' | 'poussiere' | 'sceaux';
export type GameMode = 'survie' | 'cauchemar';

/** Version courante de chaque document. Incrémenter = ajouter une migration dans migrations.ts. */
export const CURRENT_VERSION = { profile: 2, settings: 2, run: 1 } as const;
export type DocKind = keyof typeof CURRENT_VERSION;

export interface Profile {
  version: number;
  /** Identifiant aléatoire du profil (utile pour un futur classement / synchro). */
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Compteur d'écritures : sert à départager deux onglets ou deux fichiers. */
  rev: number;

  currencies: Record<CurrencyId, number>;
  /** Rangs achetés : sanctuary.veillee.endurance = 3 (ids = sanctuary.json). */
  sanctuary: Record<string, Record<string, number>>;
  /** Bâtiments débloqués (ceux marqués unlockedAtStart sont toujours ouverts). */
  buildingsUnlocked: string[];

  stats: {
    /** Compteurs cumulés sur toute la vie du profil (succès de portée « lifetime »). */
    lifetime: Record<string, number>;
    /** Meilleures valeurs atteintes dans une seule run (succès de portée « run »/« wave »). */
    best: Record<string, number>;
    bestWaveByMode: Record<GameMode, number>;
    playTimeSec: number;
  };

  /** Succès débloqués : id → horodatage (ms). */
  achievements: Record<string, number>;

  mastery: Record<HeroId, { xp: number; runs: number; wins: number }>;

  /** Compteurs de pitié qui survivent à la run (loot.json > pity, scope « profile »). */
  pity: { legendary: number; ancestral: number };

  pacts: { unlocked: boolean; bestPoints: number; milestonesClaimed: number[] };

  daily: {
    /** Dernier jour (AAAA-MM-JJ, UTC) avec une tentative notée. */
    lastDay: string | null;
    streak: number;
    streakMax: number;
    graceTokens: number;
    streakMilestonesClaimed: number[];
    /** Premier essai de chaque jour (30 derniers jours) : c'est lui qui compte. */
    history: Record<string, { score: number; wave: number; hero: HeroId; won: boolean; at: number }>;
    /** Semaines terminées (AAAA-Www). */
    weeklyDone: string[];
    completed: number;
  };

  unlocks: {
    titles: string[];
    cosmetics: string[];
    equipped: Partial<Record<HeroId, { title?: string; skin?: string; trail?: string }>>;
    /** Codex : bénédictions / pouvoirs légendaires déjà vus (pour les % de découverte). */
    seenBlessings: string[];
    seenDuos: string[];
    seenLegendaryPowers: string[];
  };

  /** Coffre-Souvenir (Forge) : objets gardés d'une run à l'autre. Format libre défini par le butin. */
  heirlooms: unknown[];

  /** Trace de l'import depuis le prototype H1.5.x (jamais effacée, pour le support). */
  legacy?: {
    importedAt: string;
    source: 'localStorage' | 'file';
    sourceKeys: string[];
    /** Expédition du prototype, gardée telle quelle : format incompatible avec le nouveau moteur. */
    run?: unknown;
  };
}

export interface Settings {
  version: number;
  audio: { master: number; music: number; sfx: number; muted: boolean };
  video: { quality: 'low' | 'normal' | 'high'; screenShake: boolean; weather: boolean; damageNumbers: boolean };
  accessibility: {
    largeText: boolean;
    textScale: number;
    highContrast: boolean;
    reducedMotion: boolean;
    bigTap: boolean;
    reminders: boolean;
  };
  equipment: { autoEquip: boolean; autoSell: boolean; sellMax: 'common' | 'magic' | 'rare' };
  /** Seules les actions modifiées par le joueur sont stockées (voir applyBindings). */
  bindings: Partial<Bindings>;
  theme: string | null;
  locale: string;
  /** Héros choisi la dernière fois (écran de sélection). */
  lastHero: HeroId;
  /** Le joueur a vu le tutoriel. */
  tutorialDone: boolean;
}

/**
 * Expédition en cours. L'en-tête est fixe ; `state` appartient au gameplay (format libre,
 * versionné par `stateVersion` pour que le gameplay gère ses propres évolutions).
 */
export interface RunSnapshot {
  version: number;
  savedAt: string;
  /** Graine de la run, ex. "SC-D-2026-11-02" pour un défi quotidien ou un nombre en texte. */
  seed: string;
  /** État courant de chaque flux aléatoire nommé : `new Rng(rng.waves)` reprend la suite exacte. */
  rng: Record<string, number>;
  hero: HeroId;
  mode: GameMode;
  daily: boolean;
  wave: number;
  pactPoints: number;
  elapsedSec: number;
  stateVersion: number;
  state: unknown;
}

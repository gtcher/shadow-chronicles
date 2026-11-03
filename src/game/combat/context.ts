import type { Game, PhysicsSystem, Rect, Rng, World } from '@engine';
import type { GameEvents } from '../events';
import type { FxTextures } from '../textures';
import type { CombatFeedback } from './feedback';
import type { HazardField } from './hazards';
import type { EnemyId, FoeStatusId, StatusId } from './data';
import type { AnyStatus } from './components';
import type { BlessingEngine } from './blessings';
import type { RunStats } from './stats';
import type { LootSystem } from './loot';
import type { RunMods } from '../modes';

/** Émetteur de particules (FxParticles de l'agent VFX, ou Particles de la démo). */
export interface ParticleSink {
  emit(x: number, y: number, o: { color: number; count?: number; speed?: number; size?: number; life?: number; angle?: number; spread?: number; drag?: number; grow?: number; gravity?: number; alpha?: number }): void;
}

/** Hauteur du « torse » : les coups voyagent au sol mais s'affichent à cette hauteur. */
export const BODY_Y = 46;

export interface FoeHitOpts {
  crit?: boolean;
  /** Origine du coup (recul et garde frontale). */
  fromX?: number;
  fromY?: number;
  knock?: number;
  status?: FoeStatusId;
  /** Cumuls du statut appliqué. */
  stacks?: number;
  /** Indice de la technique (-1 : bénédiction). */
  skill?: number;
  /** Dégâts sur la durée : pas de multiplicateurs ni de déclencheurs. */
  dot?: boolean;
  /** Éclair (Choc, chaînes) : ne consomme ni Gel ni Choc, ne déclenche pas onHit. */
  lightning?: boolean;
  /** Dégât secondaire d'une bénédiction : pas de déclencheur onHit (évite les boucles). */
  noProc?: boolean;
}

export interface HeroHitOpts {
  status?: StatusId;
  statusTime?: number;
  fromX?: number;
  fromY?: number;
  knock?: number;
  /** Entité à l'origine (le boss Arbitre se soigne quand il touche). */
  owner?: number;
}

/** Tout ce dont les modules de combat ont besoin ; implémenté par RunScene. */
export interface CombatCtx {
  /** Le jeu, typé avec les événements de jeu. */
  readonly g: Game<GameEvents>;
  readonly world: World;
  readonly physics: PhysicsSystem;
  readonly rng: Rng;
  readonly fx: FxTextures;
  readonly particles: ParticleSink;
  readonly hazards: HazardField;
  readonly feedback: CombatFeedback;
  readonly bounds: Rect;
  readonly player: number;
  readonly time: number;
  readonly wave: number;
  /** Moteur des bénédictions de la run. */
  readonly bless: BlessingEngine;
  /** Compteurs de la run (succès, fin de run). */
  readonly stats: RunStats;
  /** Butin et équipement de la run. */
  readonly loot: LootSystem;
  /** Modificateurs (pactes, défi quotidien, Cauchemar). */
  readonly mods: RunMods;
  damageFoe(e: number, dmg: number, o?: FoeHitOpts): void;
  /** Renvoie vrai si le coup a porté (faux : invulnérable / esquive). */
  hurtHero(dmg: number, o?: HeroHitOpts): boolean;
  spawnFoe(id: EnemyId, x: number, y: number, o?: { portal?: boolean; scale?: { hp: number; dmg: number } }): number;
  spawnShot(o: { side: 'hero' | 'foe'; x: number; y: number; dx: number; dy: number; speed: number; damage: number; crit?: boolean; pierce?: number; radius?: number; life?: number; color: number; status?: AnyStatus; statusTime?: number; stacks?: number; skill?: number; owner: number; size?: number }): number;
  announce(title: string, sub?: string, color?: number): void;
}

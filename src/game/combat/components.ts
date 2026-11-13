import { defineComponent } from '@engine';
import type { BossDef, EnemyDef, FoeStatusId, HeroDef, StatusId } from './data';
import type { FoeStatuses } from './status';

/** Statuts actifs sur le héros : durée restante (s) par statut. */
export type Statuses = Partial<Record<StatusId, number>>;
/** Statut porté par un projectile ou une zone : StatusId côté ennemi (vise le héros), FoeStatusId côté héros. */
export type AnyStatus = StatusId | FoeStatusId;

export interface HeroC {
  def: HeroDef;
  mana: number;
  maxMana: number;
  atk: number;
  def_: number;
  crit: number;
  speed: number;
  shield: number;
  /** Recharges restantes des 4 techniques. */
  cds: [number, number, number, number];
  dashCd: number;
  dashCharges: number;
  dashT: number;
  /** Instant (temps de simulation) du dernier départ d'esquive : sert à l'esquive parfaite. */
  dashAt: number;
  /** Ennemis déjà traversés par l'esquive en cours (statut d'esquive). */
  dashHit?: Set<number>;
  /** Une seule esquive parfaite par esquive. */
  perfectReady: boolean;
  /** Multiplicateur d'ATQ temporaire (buffs). Les bonus permanents sont dans `atk`. */
  atkMul: number;
  /** Charges d'esquive max (2 + bénédictions). */
  dashMax: number;
  /** Recharge d'une charge d'esquive (s). */
  dashRecharge: number;
  /** Multiplicateur des recharges de techniques (< 1 = plus rapide). */
  cdMul: number;
  /** Bonus de vitesse d'attaque (multiplie la recharge de l'attaque de base). */
  atkSpd: number;
  invuln: number;
  /** Verrou d'action après une technique (s). */
  lock: number;
  facing: 1 | -1;
  aimX: number;
  aimY: number;
  /** Tactile / manette : temps pendant lequel la visée garde la direction du dernier tir (au lieu de suivre le déplacement). */
  aimHold?: number;
  statuses: Statuses;
  potions: number;
  /** Ruée de technique en cours (dashStrike / execute). */
  rush: { t: number; vx: number; vy: number; hit: Set<number>; mult: number; radius: number; critBonus: number } | null;
  /** Coups différés (2e coup de Double taille, ondes de Tempête…). */
  queued: Array<{ at: number; run: () => void }>;
}
export const Hero = defineComponent<HeroC>('Hero');

export type FoeState = 'move' | 'windup' | 'act' | 'recover';

export interface FoeC {
  def: EnemyDef;
  dmg: number;
  speed: number;
  state: FoeState;
  /** Temps restant dans l'état courant. */
  t: number;
  /** Recharge de l'attaque. */
  cd: number;
  contactCd: number;
  blinkCd: number;
  summonCd: number;
  /** Cible et direction figées pendant le télégraphe. */
  tx: number;
  ty: number;
  angle: number;
  facing: 1 | -1;
  flash: number;
  spawnT: number;
  statuses: FoeStatuses;
  /** Orbite (kite) : sens de rotation autour du joueur. */
  orbit: 1 | -1;
  /** Ruée en cours (charge / bond). */
  rush: { t: number; vx: number; vy: number; hitDone: boolean } | null;
  boss: BossState | null;
  /** Mort déjà traitée (évite un double traitement pendant les réactions en chaîne). */
  dead?: boolean;
}
export const Foe = defineComponent<FoeC>('Foe');

export interface BossState {
  def: BossDef;
  phase: 1 | 2 | 3;
  /** Invulnérable pendant la transition de phase. */
  transition: number;
  /** Prochaine attaque (s). */
  next: number;
  /** Compteur d'attaques de la phase (alterne les motifs). */
  step: number;
  /** Rotation courante des motifs tournants. */
  spin: number;
  /** Bord dangereux actif (Souverain, phase 3). */
  edge: number;
}

export interface ShotC {
  side: 'hero' | 'foe';
  damage: number;
  crit: boolean;
  pierce: number;
  hit: Set<number>;
  status?: AnyStatus;
  statusTime?: number;
  stacks?: number;
  /** Indice de la technique d'origine (-1 : bénédiction). */
  skill?: number;
  owner: number;
}
export const Shot = defineComponent<ShotC>('Shot');

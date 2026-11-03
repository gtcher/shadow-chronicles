import { defineComponent } from './World';

/**
 * Composants de base fournis par le moteur. Le gameplay définit les siens
 * (Health, Damage, Loot…) dans src/game/ avec `defineComponent`.
 */

/** Position courante + position au pas précédent (pour l'interpolation du rendu). */
export interface TransformC { x: number; y: number; prevX: number; prevY: number; rotation: number; prevRotation: number }
export const Transform = defineComponent<TransformC>('Transform');
export const makeTransform = (x: number, y: number, rotation = 0): TransformC =>
  ({ x, y, prevX: x, prevY: y, rotation, prevRotation: rotation });

/** Vitesse en px/s. `drag` = freinage exponentiel par seconde (0 = aucun). */
export interface VelocityC { x: number; y: number; drag: number; maxSpeed: number }
export const Velocity = defineComponent<VelocityC>('Velocity');
export const makeVelocity = (maxSpeed = Infinity, drag = 0): VelocityC => ({ x: 0, y: 0, drag, maxSpeed });

/**
 * Collisionneur circulaire (adapté aux personnages vus de dessus).
 * - `layer` : catégorie de l'entité (bitmask, voir `Layers`).
 * - `mask`  : catégories avec lesquelles elle interagit.
 * - `solid` : si deux solides se touchent, ils se repoussent (selon `mass`).
 *             Sinon c'est un déclencheur (trigger) : contact signalé, pas de poussée.
 * - `mass`  : Infinity = immobile (ne se fait jamais pousser).
 */
export interface ColliderC { radius: number; layer: number; mask: number; solid: boolean; mass: number }
export const Collider = defineComponent<ColliderC>('Collider');

/** Catégories de collision par défaut ; le gameplay peut en ajouter (bits 6+). */
export const Layers = {
  None: 0,
  Player: 1 << 0,
  Enemy: 1 << 1,
  PlayerShot: 1 << 2,
  EnemyShot: 1 << 3,
  Pickup: 1 << 4,
  Wall: 1 << 5,
  All: 0xffffffff,
} as const;

/** Durée de vie automatique (secondes) : l'entité est détruite à 0. */
export const Lifetime = defineComponent<{ remaining: number }>('Lifetime');

/** Marqueur : la caméra suit cette entité. */
export const CameraTarget = defineComponent<true>('CameraTarget');

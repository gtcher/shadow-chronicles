import { Container, Sprite, type Texture } from 'pixi.js';
import {
  Collider, Layers, Lifetime, Transform, Velocity, CameraTarget,
  attachView, makeTransform, makeVelocity, type Game, type World,
} from '@engine';
import { Enemy, Health, HEROES, Player, Projectile, type HeroId } from './components';
import type { FxTextures } from './textures';

/**
 * Fabriques d'entités. Chaque personnage = Container { ombre, corps } :
 * le corps est animé (respiration, marche, flash) sans toucher à la position.
 */
function character(tex: Texture, fx: FxTextures, height: number, radius: number): Container {
  const node = new Container();
  const shadow = new Sprite(fx.shadow);
  shadow.anchor.set(0.5);
  shadow.width = radius * 3.2; shadow.height = radius * 1.1;
  shadow.label = 'shadow';
  const body = new Sprite(tex);
  body.anchor.set(0.5, 0.92);
  body.scale.set(height / tex.height);
  body.label = 'body';
  node.addChild(shadow, body);
  return node;
}

export function spawnHero(game: Game, world: World, fx: FxTextures, hero: HeroId, x: number, y: number): number {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, y));
  world.add(e, Velocity, makeVelocity(900, 0));
  world.add(e, Collider, { radius: 22, layer: Layers.Player, mask: Layers.Enemy | Layers.Wall | Layers.Pickup, solid: true, mass: 4 });
  world.add(e, Player, { hero, dashCd: 0, dashTime: 0, fireCd: 0, invuln: 0, facing: 1, speed: HEROES[hero].speed });
  world.add(e, Health, { hp: 100, max: 100 });
  world.add(e, CameraTarget, true);
  attachView(world, game.renderer, e, character(game.assets.texture(`hero-${hero}`), fx, 118, 22));
  return e;
}

export const ENEMY_TYPES = {
  wolf: { tex: 'enemy-wolf', h: 78, r: 20, speed: 150, hp: 3, dmg: 8, weight: 4 },
  raider: { tex: 'enemy-raider', h: 96, r: 21, speed: 110, hp: 5, dmg: 10, weight: 3 },
  shade: { tex: 'enemy-shade', h: 100, r: 20, speed: 95, hp: 6, dmg: 10, weight: 2 },
  brute: { tex: 'enemy-brute', h: 124, r: 30, speed: 70, hp: 14, dmg: 18, weight: 1 },
  shadeElite: { tex: 'enemy-shadeElite', h: 150, r: 34, speed: 80, hp: 30, dmg: 22, weight: 0.3 },
} as const;
export type EnemyKind = keyof typeof ENEMY_TYPES;

export function spawnEnemy(game: Game, world: World, fx: FxTextures, kind: EnemyKind, x: number, y: number): number {
  const d = ENEMY_TYPES[kind];
  const e = world.create();
  world.add(e, Transform, makeTransform(x, y));
  world.add(e, Velocity, makeVelocity(d.speed * 1.5, 0));
  world.add(e, Collider, { radius: d.r, layer: Layers.Enemy, mask: Layers.Enemy | Layers.Player | Layers.PlayerShot | Layers.Wall, solid: true, mass: d.r / 10 });
  world.add(e, Enemy, { kind, speed: d.speed, touchDamage: d.dmg, flash: 0, spawnT: 0 });
  world.add(e, Health, { hp: d.hp, max: d.hp });
  attachView(world, game.renderer, e, character(game.assets.texture(d.tex), fx, d.h, d.r));
  return e;
}

export function spawnBolt(game: Game, world: World, fx: FxTextures, x: number, y: number, dx: number, dy: number, color: number): number {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, y, Math.atan2(dy, dx)));
  const v = world.add(e, Velocity, makeVelocity());
  v.x = dx * 820; v.y = dy * 820;
  world.add(e, Collider, { radius: 10, layer: Layers.PlayerShot, mask: Layers.Enemy, solid: false, mass: 1 });
  world.add(e, Projectile, { damage: 1, pierce: 1, hit: new Set() });
  world.add(e, Lifetime, { remaining: 0.9 });
  const node = new Container();
  const halo = new Sprite(fx.glow);
  halo.anchor.set(0.5); halo.tint = color; halo.blendMode = 'add'; halo.scale.set(1.3, 0.7);
  const core = new Sprite(fx.glow);
  core.anchor.set(0.5); core.scale.set(0.5, 0.28); core.blendMode = 'add';
  // Le collisionneur est au sol (comme les pieds des ennemis) ; le visuel flotte à hauteur de torse.
  const body = new Container();
  body.y = -46;
  body.rotation = Math.atan2(dy, dx);
  body.addChild(halo, core);
  const shadow = new Sprite(fx.shadow);
  shadow.anchor.set(0.5); shadow.width = 26; shadow.height = 9; shadow.alpha = 0.6;
  node.addChild(shadow, body);
  attachView(world, game.renderer, e, node, 'entities', 40);
  return e;
}

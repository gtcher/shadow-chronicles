import { defineComponent } from '@engine';

/** Composants de la scène de démonstration. Les agents gameplay les remplaceront/étendront. */
export interface PlayerC { hero: HeroId; dashCd: number; dashTime: number; fireCd: number; invuln: number; facing: 1 | -1; speed: number }
export const Player = defineComponent<PlayerC>('Player');

export interface EnemyC { kind: string; speed: number; touchDamage: number; flash: number; spawnT: number }
export const Enemy = defineComponent<EnemyC>('Enemy');

export const Health = defineComponent<{ hp: number; max: number }>('Health');

export interface ProjectileC { damage: number; pierce: number; hit: Set<number> }
export const Projectile = defineComponent<ProjectileC>('Projectile');

export type HeroId = 'taro' | 'mei' | 'sena' | 'ren';
export const HEROES: Record<HeroId, { name: string; color: number; speed: number }> = {
  taro: { name: 'Taro', color: 0xff5a4a, speed: 250 },
  mei: { name: 'Mei', color: 0x7fd4ff, speed: 270 },
  sena: { name: 'Sena', color: 0xc58bff, speed: 260 },
  ren: { name: 'Ren', color: 0x9dff8a, speed: 280 },
};

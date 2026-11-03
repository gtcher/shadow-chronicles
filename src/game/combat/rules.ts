/**
 * Règles pures du combat (sans Pixi ni ECS) : formules, plan des vagues, phases de boss,
 * géométrie des zones. Tout est testé dans tests/combat.test.ts.
 */
import type { Rng } from '@engine';
import {
  BOSS_PHASE_THRESHOLDS, ENEMY_DEFS, WAVE_THEMES,
  type BossId, type EnemyDef, type EnemyId,
} from './data';

/** Nombre de vagues de la campagne ; au-delà, mode infini (boss toutes les 5 vagues, plus forts). */
export const CAMPAIGN_WAVES = 20;

export const regionForWave = (wave: number): number => (wave <= 3 ? 0 : wave <= 7 ? 1 : wave <= 10 ? 2 : 3);

export const isBossWave = (wave: number): boolean => wave > 0 && wave % 5 === 0;

/** Même rotation que le prototype : 5 Capitaine, 10 Matriarche, 15 Arbitre, 20 Souverain. */
export function bossForWave(wave: number): BossId | null {
  if (!isBossWave(wave)) return null;
  const m = wave % 20;
  return m === 5 ? 'captain' : m === 10 ? 'oracle' : m === 15 ? 'arbiter' : 'sovereign';
}

/** Boucle du mode infini (0 pendant la campagne). */
export const loopForWave = (wave: number): number => Math.max(0, Math.floor((wave - 1) / CAMPAIGN_WAVES));

/** Multiplicateurs de PV / dégâts ennemis selon la vague. */
export function enemyScaling(wave: number): { hp: number; dmg: number } {
  const w = Math.max(1, wave) - 1;
  const loop = loopForWave(wave);
  // Équilibrage (robot, 2026-11-03) : l'équipement et les bénédictions font croître le héros
  // bien plus vite que +12 %/vague ; la courbe des PV est donc quadratique douce.
  return { hp: (1 + 0.16 * w + 0.004 * w * w) * (1 + 0.5 * loop), dmg: (1 + 0.12 * w + 0.009 * w * w) * (1 + 0.25 * loop) };
}

/**
 * Tempo des ennemis selon la vague : télégraphe plus court et visée qui anticipe davantage.
 * `windup` multiplie la durée du télégraphe (1 → 0,8 en vague 20) ; `lead` = secondes d'anticipation
 * du déplacement du héros (0,15 → 0,45). Les vagues 1-3 restent celles de l'apprentissage.
 */
export function enemyTempo(wave: number): { windup: number; lead: number } {
  const w = Math.max(0, Math.min(CAMPAIGN_WAVES, wave) - 3);
  return { windup: Math.max(0.8, 1 - 0.0118 * w), lead: Math.min(0.45, 0.15 + 0.018 * w) };
}

/** Plafond du bouclier (fraction des PV max) : sans lui, les boucliers cumulés rendent le héros intouchable. */
export const SHIELD_CAP = 0.4;
export const shieldCap = (maxHp: number): number => Math.round(maxHp * SHIELD_CAP);

export function bossScaling(wave: number): number {
  return 1 + 0.6 * loopForWave(wave);
}

/**
 * Puissance de la Brume : bonus du héros par vague franchie. C'est un palliatif
 * tant que les bénédictions (data/blessings.json) ne sont pas branchées.
 */
export function heroWaveBonus(wavesCleared: number): { atk: number; hp: number } {
  return { atk: 1 + 0.08 * wavesCleared, hp: 1 + 0.05 * wavesCleared };
}

export const phaseForHp = (ratio: number): 1 | 2 | 3 =>
  ratio > BOSS_PHASE_THRESHOLDS[0] ? 1 : ratio > BOSS_PHASE_THRESHOLDS[1] ? 2 : 3;

/** Dégâts infligés par le héros. `rand` dans [0,1[ pour la variance (±8 %). */
export function heroDamage(atk: number, mult: number, crit: boolean, rand: number): number {
  return Math.max(1, Math.round(atk * mult * (crit ? 1.75 : 1) * (0.92 + rand * 0.16)));
}

/** Réduction par la défense : 10 DEF ≈ -14 %. */
export function mitigate(dmg: number, def: number): number {
  return Math.max(1, Math.round(dmg * (1 - def / (def + 60))));
}

// ---------------------------------------------------------------- Vagues

export interface WavePlan {
  wave: number;
  region: number;
  theme: string;
  boss: BossId | null;
  /** Ennemis dans l'ordre d'apparition, déjà groupés en meutes. */
  packs: EnemyId[][];
  /** Nombre maximum d'ennemis en vie en même temps. */
  maxAlive: number;
  /** Intervalle entre deux meutes (s). */
  interval: number;
}

/** Types disponibles à cette vague : types de base débloqués + variantes des régions atteintes. */
export function enemyPool(wave: number): EnemyDef[] {
  const region = regionForWave(wave);
  return Object.values(ENEMY_DEFS).filter((d) => d.minWave <= wave && (d.region === -1 || d.region <= region));
}

export function planWave(wave: number, rng: Rng): WavePlan {
  const region = regionForWave(wave);
  const boss = bossForWave(wave);
  const theme = WAVE_THEMES[wave % 5];
  const pool = enemyPool(wave);
  const weights = pool.map((d) => {
    let w = d.weight;
    if (d.region === region) w *= 1.8;               // les variantes de la région dominent
    else if (d.region >= 0) w *= 0.5;                // anciennes variantes : plus rares
    if (theme.family && d.family === theme.family) w *= 3;
    return w;
  });
  const loop = loopForWave(wave);
  let total = Math.min(90, 10 + wave * 5 + loop * 10);
  if (boss) total = Math.round(total * 0.3);
  // Élites plafonnées pour garder la vague lisible.
  const maxElites = boss ? 0 : Math.min(3, Math.floor((wave - 4) / 3) + loop);
  let elites = 0;
  const list: EnemyId[] = [];
  while (list.length < total) {
    const d = rng.weighted(pool, weights);
    if (d.elite) { if (elites >= maxElites) continue; elites++; }
    list.push(d.id);
  }
  // Meutes de 2 à 5 ennemis ; les élites arrivent après le premier tiers.
  list.sort((a, b) => Number(!!ENEMY_DEFS[a].elite) - Number(!!ENEMY_DEFS[b].elite));
  const firstElite = list.findIndex((id) => ENEMY_DEFS[id].elite);
  if (firstElite > 0) {
    const el = list.splice(firstElite);
    for (let i = 0; i < el.length; i++) list.splice(Math.floor(list.length * (0.35 + 0.55 * (i / Math.max(1, el.length)))), 0, el[i]);
  }
  const packs: EnemyId[][] = [];
  for (let i = 0; i < list.length;) {
    const n = Math.min(list.length - i, rng.int(2, 3 + Math.min(2, Math.floor(wave / 6))));
    packs.push(list.slice(i, i + n));
    i += n;
  }
  return {
    wave, region, boss, packs,
    theme: boss ? 'Le Jugement des Ombres' : theme.name,
    maxAlive: Math.min(60, 12 + wave * 2 + loop * 8),
    interval: Math.max(0.7, 2.2 - wave * 0.07),
  };
}

// ---------------------------------------------------------------- Géométrie des zones

export type ZoneShape = 'circle' | 'ring' | 'line' | 'cone' | 'cross';

export interface Zone {
  shape: ZoneShape;
  x: number;
  y: number;
  /** Direction (rad) pour line, cone, cross. */
  angle: number;
  /** Rayon (circle, ring, cone). */
  r: number;
  /** Rayon intérieur (ring). */
  r2: number;
  /** Longueur (line : depuis l'origine ; cross : demi-longueur de chaque bras). */
  len: number;
  width: number;
  /** Ouverture totale (cone). */
  arc: number;
}

/** Un cercle (px, py, pr) touche-t-il la zone ? */
export function zoneHits(z: Zone, px: number, py: number, pr = 0): boolean {
  const dx = px - z.x, dy = py - z.y;
  switch (z.shape) {
    case 'circle': return dx * dx + dy * dy <= (z.r + pr) ** 2;
    case 'ring': {
      const d = Math.hypot(dx, dy);
      return d <= z.r + pr && d >= z.r2 - pr;
    }
    case 'line': {
      const c = Math.cos(z.angle), s = Math.sin(z.angle);
      const along = dx * c + dy * s, perp = -dx * s + dy * c;
      return along >= -pr && along <= z.len + pr && Math.abs(perp) <= z.width / 2 + pr;
    }
    case 'cone': {
      const d = Math.hypot(dx, dy);
      if (d > z.r + pr) return false;
      if (d <= pr) return true;
      return Math.abs(angleDiff(Math.atan2(dy, dx), z.angle)) <= z.arc / 2 + Math.asin(Math.min(1, pr / d));
    }
    case 'cross': {
      for (const a of [z.angle, z.angle + Math.PI / 2]) {
        const c = Math.cos(a), s = Math.sin(a);
        const along = dx * c + dy * s, perp = -dx * s + dy * c;
        if (Math.abs(along) <= z.len + pr && Math.abs(perp) <= z.width / 2 + pr) return true;
      }
      return false;
    }
  }
}

export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const makeZone = (z: Partial<Zone> & Pick<Zone, 'shape' | 'x' | 'y'>): Zone =>
  ({ angle: 0, r: 0, r2: 0, len: 0, width: 0, arc: 0, ...z });

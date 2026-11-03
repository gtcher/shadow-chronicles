import { BOSS_DEFS, ENEMY_DEFS, HERO_DEFS, type BossId, type EnemyId } from '../combat/data';
import { bossForWave, enemyPool } from '../combat/rules';
import { RIG_KEY_BY_BOSS, RIG_KEY_BY_FAMILY, bakeResolution, rigBaker, rigDef } from './index';

export { rigBaker };
import type { BakeInput } from './atlas';

/**
 * Qui cuire, et quand : la liste des combattants dont une run aura besoin, pour lancer leur
 * cuisson à l'avance (worker) plutôt qu'à leur apparition.
 */
export interface RigOrder { key: string; input: BakeInput }

export const rigsEnabled = (): boolean =>
  typeof document !== 'undefined' && typeof location !== 'undefined' && new URLSearchParams(location.search).get('persos') !== 'v1';

export function heroOrder(id: string): RigOrder | null {
  const d = (HERO_DEFS as Record<string, { height: number }>)[id];
  const def = rigDef(id);
  return d && def ? { key: id, input: { def, heightPx: d.height, style: 'A', res: bakeResolution(true) } } : null;
}

export function foeOrder(id: EnemyId): RigOrder | null {
  const d = ENEMY_DEFS[id];
  const def = d && rigDef(RIG_KEY_BY_FAMILY[d.family] ?? d.id, d.tint);
  return def ? { key: d.id, input: { def, heightPx: d.h, style: 'B', res: bakeResolution(false) } } : null;
}

export function bossOrder(id: BossId): RigOrder | null {
  const b = BOSS_DEFS[id];
  const def = b && rigDef(RIG_KEY_BY_BOSS[id] ?? id);
  return def ? { key: `boss-${id}`, input: { def, heightPx: b.h, style: 'B', res: bakeResolution(false) } } : null;
}

/** Combattants utiles autour de la vague `wave` : ennemis de cette vague et de la suivante, prochain boss. */
export function waveOrders(wave: number): RigOrder[] {
  const out: RigOrder[] = [];
  const seen = new Set<string>();
  const push = (o: RigOrder | null) => { if (o && !seen.has(o.key)) { seen.add(o.key); out.push(o); } };
  // Les plus probables d'abord (poids d'apparition).
  for (const d of [...enemyPool(wave)].sort((a, b) => b.weight - a.weight)) push(foeOrder(d.id));
  for (let w = wave; w <= wave + 5; w++) { const b = bossForWave(w); if (b) { push(bossOrder(b)); break; } }
  for (const d of enemyPool(wave + 1)) push(foeOrder(d.id));
  return out;
}

/** Lance la cuisson en arrière-plan. */
export function prefetch(orders: RigOrder[]): void {
  if (!rigsEnabled()) return;
  for (const o of orders) rigBaker.request(o.key, o.input);
}

/** Après l'écran titre : les 4 héros se cuisent pendant que le joueur choisit. */
export function prewarmHeroes(first?: string): void {
  if (!rigsEnabled()) return;
  const ids = Object.keys(HERO_DEFS);
  if (first && ids.includes(first)) ids.sort((a) => (a === first ? -1 : 1));
  prefetch(ids.map(heroOrder).filter((o): o is RigOrder => !!o));
  // Puis les ennemis des premières vagues.
  prefetch(waveOrders(1));
}

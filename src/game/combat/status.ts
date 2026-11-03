import { Layers, Transform } from '@engine';
import { Health } from '../components';
import { Foe, type FoeC } from './components';
import type { CombatCtx } from './context';
import type { FoeStatusId } from './data';
import blessingsJson from '../../../data/blessings.json';

/**
 * Statuts infligés aux ennemis (data/blessings.json > statuses) :
 * Givre (ralentit, 3 cumuls → Gel), Gel (immobile, +25 % au prochain coup qui le brise),
 * Saignement et Poison (dégâts sur la durée, cumulables), Choc (le prochain coup déclenche un éclair),
 * Marque (+15 % de dégâts subis).
 */
export interface FoeStatusState { stacks: number; t: number; /** ATQ de la source (dégâts sur la durée). */ power: number }
export type FoeStatuses = Partial<Record<FoeStatusId, FoeStatusState>> & { gelImmune?: number; dotAcc?: number; dotTick?: number };

const DEFS = (blessingsJson as unknown as { statuses: Record<FoeStatusId, { maxStacks: number; duration: number }> }).statuses;

/** Applique un statut. Renvoie vrai s'il a pris. */
export function applyStatus(c: CombatCtx, e: number, id: FoeStatusId, stacks = 1, power?: number): boolean {
  const f = c.world.get(e, Foe);
  if (!f || stacks <= 0) return false;
  const s = f.statuses;
  const atk = power ?? c.bless.heroAtk();
  const bossK = f.boss ? 0.5 : 1;
  if (id === 'gel' || id === 'givre') {
    if ((s.gelImmune ?? 0) > 0 || s.gel) { if (id === 'givre' && s.givre) s.givre.t = DEFS.givre.duration; return false; }
  }
  if (id === 'gel') return freeze(c, e, f);
  const max = c.bless.statusCap(id, DEFS[id].maxStacks);
  const dur = (DEFS[id].duration + (id === 'givre' ? c.bless.givreBonusTime() : 0)) * (id === 'givre' || id === 'marque' ? bossK : 1);
  const cur = s[id];
  if (cur) { cur.stacks = Math.min(max, cur.stacks + stacks); cur.t = dur; cur.power = Math.max(cur.power, atk); }
  else s[id] = { stacks: Math.min(max, stacks), t: dur, power: atk };
  if (id === 'givre' && s.givre!.stacks >= 3) { delete s.givre; freeze(c, e, f); }
  c.stats.statusApplied(id);
  return true;
}

function freeze(c: CombatCtx, e: number, f: FoeC): boolean {
  const s = f.statuses;
  s.gel = { stacks: 1, t: DEFS.gel.duration * (f.boss ? 0.4 : 1), power: c.bless.heroAtk() };
  s.gelImmune = s.gel.t + 3;
  c.bless.onStatus(e, 'gel');
  return true;
}

/** Multiplicateur de vitesse d'un ennemi (Gel = 0, Givre = -15 % par cumul). */
export function speedMul(f: FoeC): number {
  if (f.statuses.gel) return f.boss ? 0.25 : 0;
  return 1 - 0.15 * (f.statuses.givre?.stacks ?? 0);
}

export const isSlowed = (f: FoeC) => !!(f.statuses.gel || f.statuses.givre);

/** Minuteries et dégâts sur la durée (appelé à chaque pas). */
export function tickStatuses(c: CombatCtx, e: number, f: FoeC, dt: number): void {
  const s = f.statuses;
  if (s.gelImmune) s.gelImmune = Math.max(0, s.gelImmune - dt);
  let dps = 0;
  for (const k of Object.keys(DEFS) as FoeStatusId[]) {
    const st = s[k];
    if (!st) continue;
    st.t -= dt;
    if (k === 'saignement') dps += st.power * 0.08 * st.stacks;
    if (k === 'poison') dps += st.power * 0.05 * st.stacks;
    if (st.t <= 0) delete s[k];
  }
  if (dps <= 0) return;
  dps *= c.bless.dotMultiplier(f);
  s.dotAcc = (s.dotAcc ?? 0) + dps * dt;
  s.dotTick = (s.dotTick ?? 0) + dt;
  // Livré par paquets toutes les 0,5 s : chiffres lisibles.
  if (s.dotTick >= 0.5 && s.dotAcc >= 1) {
    const dmg = Math.floor(s.dotAcc);
    s.dotAcc -= dmg; s.dotTick = 0;
    const crit = c.bless.dotCanCrit() && c.rng.chance(c.bless.critChance());
    c.damageFoe(e, crit ? Math.round(dmg * c.bless.critMultiplier()) : dmg, { dot: true, crit });
  }
}

/**
 * Effets des statuts au moment d'un coup direct : Marque (+15 %), Gel (+25 % puis brisé),
 * Choc (éclair de 40 % ATQ). Renvoie le multiplicateur de dégâts.
 */
export function consumeOnHit(c: CombatCtx, e: number, f: FoeC, lightning: boolean): number {
  const s = f.statuses;
  let mul = 1;
  if (s.marque) mul *= 1.15;
  if (s.gel && !lightning) {
    mul *= 1.25;
    // Brisure (Lune) : coup critique garanti avec bonus de dégâts critiques.
    const sc = c.bless.stat['critDamage@shatter'];
    if (sc) mul *= c.bless.critMultiplier() + sc / 100;
    delete s.gel;
    c.bless.onShatter(e);
  }
  if (s.choc && !lightning) {
    delete s.choc;
    c.bless.lightning(e, c.bless.heroAtk() * 0.4, 1);
  }
  return mul;
}

/** Ennemis vivants dans un cercle, triés du plus proche au plus lointain. */
export function foesAround(c: CombatCtx, x: number, y: number, r: number, exclude?: number): number[] {
  const list = c.physics.overlapCircle(c.world, x, y, r, Layers.Enemy).filter((f) => f !== exclude && c.world.has(f, Foe) && (c.world.get(f, Health)?.hp ?? 0) > 0);
  const d = (f: number) => { const t = c.world.get(f, Transform)!; return (t.x - x) ** 2 + (t.y - y) ** 2; };
  return list.sort((a, b) => d(a) - d(b));
}

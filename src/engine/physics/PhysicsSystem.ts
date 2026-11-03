import { SystemPriority, type Entity, type System, type World } from '../ecs/World';
import { Collider, Transform, Velocity, Lifetime } from '../ecs/components';
import { SpatialHash } from './SpatialHash';
import { circleCircle, circleRect, type Manifold, type Rect } from './shapes';

export interface Contact { a: Entity; b: Entity; nx: number; ny: number; depth: number }

/**
 * Intégration du mouvement (Velocity → Transform) + mémorisation de la position précédente.
 * Priorité Movement (300).
 */
export class MovementSystem implements System {
  readonly name = 'movement';
  readonly priority = SystemPriority.Movement;

  update(world: World, dt: number): void {
    for (const e of world.query(Transform)) {
      const t = world.get(e, Transform)!;
      t.prevX = t.x; t.prevY = t.y; t.prevRotation = t.rotation;
    }
    for (const e of world.query(Transform, Velocity)) {
      const t = world.get(e, Transform)!;
      const v = world.get(e, Velocity)!;
      if (v.drag > 0) { const k = Math.exp(-v.drag * dt); v.x *= k; v.y *= k; }
      const sp = Math.hypot(v.x, v.y);
      if (sp > v.maxSpeed) { v.x *= v.maxSpeed / sp; v.y *= v.maxSpeed / sp; }
      t.x += v.x * dt; t.y += v.y * dt;
    }
    for (const e of world.query(Lifetime)) {
      const l = world.get(e, Lifetime)!;
      l.remaining -= dt;
      if (l.remaining <= 0) world.destroy(e);
    }
  }
}

/**
 * Détection et résolution des collisions.
 * - Paires dynamiques via hachage spatial (cercles).
 * - Obstacles statiques (rectangles) via `walls`.
 * - Limites du monde via `bounds` (facultatif).
 * Les contacts du pas courant sont lisibles dans `contacts` (pour les dégâts, ramassages…)
 * et transmis à `onContact` si défini. Priorité Physics (400).
 */
export class PhysicsSystem implements System {
  readonly name = 'physics';
  readonly priority = SystemPriority.Physics;
  readonly hash: SpatialHash;
  walls: Rect[] = [];
  bounds: Rect | null = null;
  /** Contacts détectés au dernier pas (vidés à chaque pas). */
  readonly contacts: Contact[] = [];
  onContact: ((c: Contact, world: World) => void) | null = null;
  /** Itérations de résolution : plus = foules plus stables, mais plus coûteux. */
  iterations = 2;

  private m: Manifold = { nx: 0, ny: 0, depth: 0 };
  private seen = new Set<number>();
  private tmp = new Set<Entity>();

  constructor(cellSize = 96) { this.hash = new SpatialHash(cellSize); }

  update(world: World): void {
    this.contacts.length = 0;
    const ents: Entity[] = [...world.query(Transform, Collider)];

    for (let it = 0; it < this.iterations; it++) {
      const record = it === 0;
      this.hash.clear();
      for (const e of ents) {
        const t = world.get(e, Transform)!, c = world.get(e, Collider)!;
        this.hash.insert(e, t.x, t.y, c.radius);
      }
      this.seen.clear();
      this.hash.forEachCell((cell) => {
        for (let i = 0; i < cell.length; i++) {
          for (let j = i + 1; j < cell.length; j++) this.pair(world, cell[i], cell[j], record);
        }
      });
      this.solveStatic(world, ents);
    }
    if (this.onContact) for (const c of this.contacts) this.onContact(c, world);
  }

  /** Entités dont le collisionneur chevauche le cercle donné (ex. explosion, aimant à loot). */
  overlapCircle(world: World, x: number, y: number, r: number, mask = 0xffffffff): Entity[] {
    this.tmp.clear();
    const res: Entity[] = [];
    for (const e of this.hash.queryCircle(x, y, r, this.tmp)) {
      const t = world.get(e, Transform), c = world.get(e, Collider);
      if (!t || !c || !(c.layer & mask)) continue;
      if ((t.x - x) ** 2 + (t.y - y) ** 2 <= (r + c.radius) ** 2) res.push(e);
    }
    return res;
  }

  private pair(world: World, a: Entity, b: Entity, record: boolean): void {
    const lo = a < b ? a : b, hi = a < b ? b : a;
    const key = lo * 67108864 + hi; // clé unique tant que les ids < 2^26
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const ca = world.get(a, Collider)!, cb = world.get(b, Collider)!;
    if (!((ca.mask & cb.layer) || (cb.mask & ca.layer))) return;
    const ta = world.get(a, Transform)!, tb = world.get(b, Transform)!;
    const m = this.m;
    if (!circleCircle({ x: ta.x, y: ta.y, r: ca.radius }, { x: tb.x, y: tb.y, r: cb.radius }, m)) return;
    if (record) this.contacts.push({ a, b, nx: m.nx, ny: m.ny, depth: m.depth });
    if (!ca.solid || !cb.solid) return;
    const ia = ca.mass === Infinity ? 0 : 1 / ca.mass;
    const ib = cb.mass === Infinity ? 0 : 1 / cb.mass;
    const sum = ia + ib;
    if (sum === 0) return;
    const push = m.depth / sum;
    ta.x -= m.nx * push * ia; ta.y -= m.ny * push * ia;
    tb.x += m.nx * push * ib; tb.y += m.ny * push * ib;
  }

  private solveStatic(world: World, ents: Entity[]): void {
    if (this.walls.length === 0 && !this.bounds) return;
    const m = this.m;
    for (const e of ents) {
      const c = world.get(e, Collider)!;
      if (!c.solid || c.mass === Infinity) continue;
      const t = world.get(e, Transform)!;
      for (const w of this.walls) {
        if (circleRect({ x: t.x, y: t.y, r: c.radius }, w, m)) { t.x += m.nx * m.depth; t.y += m.ny * m.depth; }
      }
      const b = this.bounds;
      if (b) {
        t.x = Math.max(b.x + c.radius, Math.min(b.x + b.w - c.radius, t.x));
        t.y = Math.max(b.y + c.radius, Math.min(b.y + b.h - c.radius, t.y));
      }
    }
  }
}

/**
 * Mini-ECS (Entity – Component – System), volontairement simple et lisible.
 *
 * - Une entité est un simple numéro (`Entity`).
 * - Un composant est une donnée pure, rangée dans un « store » par type.
 * - Un système est une fonction appelée à chaque pas de simulation, dans l'ordre de `priority`.
 *
 *   const Health = defineComponent<{ hp: number; max: number }>('Health');
 *   const e = world.create();
 *   world.add(e, Health, { hp: 10, max: 10 });
 *   for (const id of world.query(Health)) world.get(id, Health)!.hp -= 1;
 */
export type Entity = number;

export interface ComponentType<T> {
  readonly name: string;
  /** Champ fantôme, sert uniquement à porter le type T. */
  readonly __type?: T;
}

export const defineComponent = <T>(name: string): ComponentType<T> => ({ name });

export interface System {
  readonly name: string;
  /** Plus petit = exécuté en premier. Voir `SystemPriority`. */
  readonly priority: number;
  update(world: World, dt: number): void;
}

/** Ordre conventionnel des systèmes ; laissez des trous pour vos propres systèmes. */
export const SystemPriority = {
  Input: 0,
  AI: 100,
  Gameplay: 200,
  Movement: 300,
  Physics: 400,
  PostPhysics: 500,
  Cleanup: 1000,
} as const;

export class World {
  private nextId = 1;
  private alive = new Set<Entity>();
  private stores = new Map<ComponentType<unknown>, Map<Entity, unknown>>();
  private pendingDestroy = new Set<Entity>();
  private systems: System[] = [];
  /** Appelés juste avant la suppression réelle d'une entité (ex. retirer son sprite). */
  private destroyHooks: Array<(e: Entity, w: World) => void> = [];
  /** Temps de simulation écoulé (secondes). */
  time = 0;

  get count(): number { return this.alive.size; }

  create(): Entity {
    const e = this.nextId++;
    this.alive.add(e);
    return e;
  }

  isAlive(e: Entity): boolean { return this.alive.has(e) && !this.pendingDestroy.has(e); }

  /** Destruction différée : effective à la fin du pas courant (sûr pendant une itération). */
  destroy(e: Entity): void { if (this.alive.has(e)) this.pendingDestroy.add(e); }

  onDestroy(fn: (e: Entity, w: World) => void): void { this.destroyHooks.push(fn); }

  add<T>(e: Entity, type: ComponentType<T>, value: T): T {
    this.store(type).set(e, value);
    return value;
  }

  get<T>(e: Entity, type: ComponentType<T>): T | undefined {
    return this.stores.get(type as ComponentType<unknown>)?.get(e) as T | undefined;
  }

  /** Comme `get` mais lève une erreur si le composant manque. */
  req<T>(e: Entity, type: ComponentType<T>): T {
    const v = this.get(e, type);
    if (v === undefined) throw new Error(`Entité ${e} : composant ${type.name} manquant`);
    return v;
  }

  has(e: Entity, type: ComponentType<unknown>): boolean {
    return this.stores.get(type)?.has(e) ?? false;
  }

  remove(e: Entity, type: ComponentType<unknown>): void { this.stores.get(type)?.delete(e); }

  /** Entités possédant tous les composants demandés (et pas en cours de destruction). */
  *query(...types: ComponentType<unknown>[]): IterableIterator<Entity> {
    if (types.length === 0) { yield* this.alive; return; }
    let smallest: Map<Entity, unknown> | undefined;
    const others: Map<Entity, unknown>[] = [];
    for (const t of types) {
      const s = this.stores.get(t);
      if (!s) return;
      if (!smallest || s.size < smallest.size) { if (smallest) others.push(smallest); smallest = s; }
      else others.push(s);
    }
    for (const e of [...smallest!.keys()]) {
      if (this.pendingDestroy.has(e)) continue;
      let ok = true;
      for (const o of others) if (!o.has(e)) { ok = false; break; }
      if (ok) yield e;
    }
  }

  /** Première entité correspondant à la requête (pratique pour le joueur). */
  first(...types: ComponentType<unknown>[]): Entity | undefined {
    for (const e of this.query(...types)) return e;
    return undefined;
  }

  addSystem(sys: System): this {
    this.systems.push(sys);
    this.systems.sort((a, b) => a.priority - b.priority);
    return this;
  }

  removeSystem(name: string): void { this.systems = this.systems.filter((s) => s.name !== name); }

  getSystem<S extends System>(name: string): S | undefined {
    return this.systems.find((s) => s.name === name) as S | undefined;
  }

  /** Un pas de simulation : tous les systèmes, puis les destructions différées. */
  update(dt: number): void {
    this.time += dt;
    for (const s of this.systems) s.update(this, dt);
    this.flush();
  }

  flush(): void {
    if (this.pendingDestroy.size === 0) return;
    for (const e of this.pendingDestroy) {
      for (const h of this.destroyHooks) h(e, this);
      for (const s of this.stores.values()) s.delete(e);
      this.alive.delete(e);
    }
    this.pendingDestroy.clear();
  }

  clear(): void {
    for (const e of this.alive) this.pendingDestroy.add(e);
    this.flush();
  }

  private store<T>(type: ComponentType<T>): Map<Entity, T> {
    let s = this.stores.get(type as ComponentType<unknown>);
    if (!s) this.stores.set(type as ComponentType<unknown>, (s = new Map()));
    return s as Map<Entity, T>;
  }
}

import { describe, expect, it } from 'vitest';
import { FixedLoop } from '../src/engine/core/FixedLoop';
import { EventBus } from '../src/engine/core/EventBus';
import { World, defineComponent } from '../src/engine/ecs/World';
import { Collider, Layers, Transform, Velocity, Lifetime, makeTransform, makeVelocity } from '../src/engine/ecs/components';
import { MovementSystem, PhysicsSystem } from '../src/engine/physics/PhysicsSystem';
import { circleCircle, circleRect } from '../src/engine/physics/shapes';
import { SpatialHash } from '../src/engine/physics/SpatialHash';
import { Camera } from '../src/engine/camera/Camera';
import { Rng } from '../src/engine/math/Rng';

describe('FixedLoop', () => {
  it('simule à pas constant quel que soit le framerate', () => {
    let updates = 0;
    const alphas: number[] = [];
    const loop = new FixedLoop(() => updates++, (a) => alphas.push(a), { step: 1 / 60 });
    loop.advance(0);
    for (let i = 1; i <= 144; i++) loop.advance(i / 144); // 1 s à 144 Hz
    expect(updates).toBeGreaterThanOrEqual(59);
    expect(updates).toBeLessThanOrEqual(60);
    expect(alphas.every((a) => a >= 0 && a < 1)).toBe(true);
  });

  it('limite le rattrapage (spirale de la mort) et le timeScale ralentit', () => {
    let updates = 0;
    const loop = new FixedLoop(() => updates++, () => {}, { step: 1 / 60, maxSteps: 5 });
    loop.advance(0);
    loop.advance(10); // 10 s de gel
    expect(updates).toBe(5);
    updates = 0;
    loop.timeScale = 0.5;
    for (let i = 1; i <= 60; i++) loop.advance(10 + i / 60);
    expect(updates).toBeGreaterThanOrEqual(29);
    expect(updates).toBeLessThanOrEqual(31);
  });
});

describe('World (ECS)', () => {
  const Hp = defineComponent<{ hp: number }>('Hp');
  it('crée, interroge et détruit en différé', () => {
    const w = new World();
    const a = w.create(), b = w.create();
    w.add(a, Hp, { hp: 3 }); w.add(a, Transform, makeTransform(0, 0));
    w.add(b, Hp, { hp: 1 });
    expect([...w.query(Hp, Transform)]).toEqual([a]);
    const destroyed: number[] = [];
    w.onDestroy((e) => destroyed.push(e));
    w.destroy(b);
    expect([...w.query(Hp)]).toEqual([a]); // déjà exclu des requêtes
    expect(w.count).toBe(2);
    w.flush();
    expect(w.count).toBe(1);
    expect(destroyed).toEqual([b]);
    expect(w.get(b, Hp)).toBeUndefined();
  });

  it('exécute les systèmes par priorité', () => {
    const w = new World();
    const order: string[] = [];
    w.addSystem({ name: 'b', priority: 2, update: () => order.push('b') });
    w.addSystem({ name: 'a', priority: 1, update: () => order.push('a') });
    w.update(1 / 60);
    expect(order).toEqual(['a', 'b']);
  });
});

describe('Collisions', () => {
  it('cercle/cercle et cercle/rectangle', () => {
    const m = { nx: 0, ny: 0, depth: 0 };
    expect(circleCircle({ x: 0, y: 0, r: 10 }, { x: 15, y: 0, r: 10 }, m)).toBe(true);
    expect(m.nx).toBeCloseTo(1); expect(m.depth).toBeCloseTo(5);
    expect(circleCircle({ x: 0, y: 0, r: 10 }, { x: 25, y: 0, r: 10 }, m)).toBe(false);
    expect(circleRect({ x: 5, y: -3, r: 5 }, { x: 0, y: 0, w: 10, h: 10 }, m)).toBe(true);
    expect(m.ny).toBeCloseTo(-1); expect(m.depth).toBeCloseTo(2);
    expect(circleRect({ x: 5, y: 1, r: 2 }, { x: 0, y: 0, w: 10, h: 10 }, m)).toBe(true); // centre dedans
    expect(m.ny).toBe(-1);
  });

  it('sépare deux solides, signale un trigger sans le pousser, respecte murs et masses', () => {
    const w = new World();
    const phys = new PhysicsSystem(64);
    w.addSystem(new MovementSystem()).addSystem(phys);
    const mk = (x: number, layer: number, mask: number, solid: boolean, mass = 1) => {
      const e = w.create();
      w.add(e, Transform, makeTransform(x, 0));
      w.add(e, Collider, { radius: 10, layer, mask, solid, mass });
      return e;
    };
    const a = mk(0, Layers.Enemy, Layers.Enemy, true);
    const b = mk(5, Layers.Enemy, Layers.Enemy, true);
    const wall = mk(100, Layers.Wall, Layers.All, true, Infinity);
    const c = mk(95, Layers.Enemy, Layers.Wall, true);
    const shot = mk(-5, Layers.PlayerShot, Layers.Enemy, false);
    for (let i = 0; i < 10; i++) w.update(1 / 60);
    const ta = w.get(a, Transform)!, tb = w.get(b, Transform)!;
    expect(tb.x - ta.x).toBeGreaterThanOrEqual(19.9);
    expect(w.get(wall, Transform)!.x).toBe(100); // masse infinie : immobile
    expect(w.get(c, Transform)!.x).toBeLessThanOrEqual(80.1);
    expect(w.get(shot, Transform)!.x).toBe(-5);
    w.update(1 / 60);
    w.get(shot, Transform)!.x = ta.x;
    w.update(1 / 60);
    expect(phys.contacts.some((k) => k.a === shot || k.b === shot)).toBe(true);
  });

  it('bloque contre les murs statiques et les limites', () => {
    const w = new World();
    const phys = new PhysicsSystem();
    phys.walls.push({ x: 50, y: -50, w: 20, h: 100 });
    phys.bounds = { x: -200, y: -200, w: 400, h: 400 };
    w.addSystem(new MovementSystem()).addSystem(phys);
    const e = w.create();
    w.add(e, Transform, makeTransform(0, 0));
    w.add(e, Collider, { radius: 10, layer: Layers.Player, mask: Layers.All, solid: true, mass: 1 });
    const v = w.add(e, Velocity, makeVelocity());
    v.x = 300;
    for (let i = 0; i < 60; i++) w.update(1 / 60);
    expect(w.get(e, Transform)!.x).toBeLessThanOrEqual(40.01);
    v.x = 0; v.y = -1000;
    for (let i = 0; i < 60; i++) w.update(1 / 60);
    expect(w.get(e, Transform)!.y).toBeCloseTo(-190, 0);
  });

  it('Lifetime détruit l’entité', () => {
    const w = new World();
    w.addSystem(new MovementSystem());
    const e = w.create();
    w.add(e, Transform, makeTransform(0, 0));
    w.add(e, Lifetime, { remaining: 0.05 });
    for (let i = 0; i < 4; i++) w.update(1 / 60);
    expect(w.isAlive(e)).toBe(false);
  });

  it('SpatialHash retrouve les voisins', () => {
    const h = new SpatialHash(32);
    h.insert(1, 0, 0, 5); h.insert(2, 500, 500, 5); h.insert(3, 30, 0, 5);
    const near = h.queryCircle(10, 0, 30);
    expect(near.has(1)).toBe(true); expect(near.has(3)).toBe(true); expect(near.has(2)).toBe(false);
  });
});

describe('Camera', () => {
  it('suit la cible, respecte les limites et convertit écran/monde', () => {
    const cam = new Camera();
    cam.viewW = 800; cam.viewH = 600; cam.lookAhead = 0;
    const target = { x: 0, y: 0 };
    cam.follow(target);
    target.x = 300;
    for (let i = 0; i < 120; i++) cam.update(1 / 60);
    expect(cam.x).toBeCloseTo(300, 0);
    const w = cam.screenToWorld(400, 300);
    expect(w.x).toBeCloseTo(cam.x); expect(w.y).toBeCloseTo(cam.y);
    const s = cam.worldToScreen(w.x + 10, w.y);
    expect(s.x).toBeCloseTo(410);
    cam.bounds = { x: 0, y: 0, w: 1000, h: 1000 };
    target.x = -500; target.y = -500;
    for (let i = 0; i < 120; i++) cam.update(1 / 60);
    expect(cam.x).toBeCloseTo(400); expect(cam.y).toBeCloseTo(300);
  });

  it('la secousse décroît jusqu’à zéro', () => {
    const cam = new Camera();
    cam.shake(1);
    for (let i = 0; i < 120; i++) cam.update(1 / 60);
    expect(cam.trauma).toBe(0);
  });
});

describe('Rng & EventBus', () => {
  it('Rng est déterministe', () => {
    const a = new Rng(42), b = new Rng(42);
    const sa = Array.from({ length: 5 }, () => a.next()), sb = Array.from({ length: 5 }, () => b.next());
    expect(sa).toEqual(sb);
    expect(new Rng(1).weighted(['x', 'y'], [0, 1])).toBe('y');
  });
  it('EventBus émet et se désabonne', () => {
    const bus = new EventBus<{ hit: { n: number } }>();
    let got = 0;
    const off = bus.on('hit', (p) => (got += p.n));
    bus.emit('hit', { n: 2 }); off(); bus.emit('hit', { n: 5 });
    expect(got).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { CAST } from '../src/game/rig/draw';
import { solveHumanoid, apply, type Def } from '../src/game/puppet/bones';
import { poseOf, type PuppetAnim } from '../src/game/puppet/pose';

const ANIMS: PuppetAnim[] = ['idle', 'course', 'attaque', 'touche', 'mort'];
const cast = CAST as unknown as Record<string, Def>;

describe('pantins : squelette', () => {
  it('chaque humanoïde produit ses pièces, pieds au sol en idle', () => {
    for (const [k, c] of Object.entries(cast)) {
      if (c.kind === 'w') continue;
      for (const a of ANIMS) {
        const placed = solveHumanoid(c, poseOf(c, a, 0.3), 0);
        expect(placed.length, `${k} ${a}`).toBeGreaterThan(5);
        expect(placed.some((p) => p.id.startsWith('head-')), `${k} ${a} tête`).toBe(true);
      }
      if (!c.float) {
        const P = poseOf(c, 'idle', 0);
        const feet = solveHumanoid(c, P, 0).filter((p) => p.id === 'foot').map((p) => apply(p.m, 0, 0)[1]);
        for (const y of feet) expect(Math.abs(y), `${k} pied`).toBeLessThan(6);
      }
    }
  });

  it("l'arc de Ren pointe vers la cible à tous les angles de visée", () => {
    const c = cast.ren;
    for (const aim of [-1.1, -0.5, 0, 0.5, 1.1]) {
      const w = solveHumanoid(c, poseOf(c, 'attaque', 0.4, aim), 0).find((p) => p.id === 'weapon')!;
      // Dans le repère de l'arc, la flèche part vers -y : sa direction monde doit suivre la visée.
      const [x0, y0] = apply(w.m, 0, 0), [x1, y1] = apply(w.m, 0, -20);
      const ang = Math.atan2(y1 - y0, x1 - x0);
      expect(Math.abs(ang - aim), `visée ${aim}`).toBeLessThan(0.35);
    }
  });

  it('coût : 60 pantins posés en moins de 4 ms', () => {
    const keys = ['ren', 'raider', 'brute', 'shade', 'shadeElite', 'taro'];
    const t0 = performance.now();
    for (let f = 0; f < 10; f++) for (let i = 0; i < 60; i++) { const c = cast[keys[i % keys.length]]; solveHumanoid(c, poseOf(c, 'course', (i * 0.07 + f * 0.016) % 1), f); }
    expect((performance.now() - t0) / 10).toBeLessThan(4);
  });
});

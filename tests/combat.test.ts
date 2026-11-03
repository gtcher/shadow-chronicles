import { describe, expect, it } from 'vitest';
// @ts-ignore -- pas de types Node dans ce projet navigateur ; vitest s'exécute sous Node.
import { readFileSync } from 'node:fs';
import { Rng } from '../src/engine/math/Rng';
import { BOSS_DEFS, ENEMY_DEFS, HERO_DEFS } from '../src/game/combat/data';
import {
  CAMPAIGN_WAVES, bossForWave, enemyPool, enemyScaling, heroDamage, isBossWave, makeZone, mitigate, phaseForHp, planWave, regionForWave, zoneHits,
} from '../src/game/combat/rules';
import { WaveDirector } from '../src/game/combat/waves';

const manifest = JSON.parse(readFileSync(new URL('../public/assets/manifest.json', import.meta.url), 'utf8')) as Record<string, string>;

describe('données de combat', () => {
  it('4 héros jouables, 4 techniques chacun, sprites présents', () => {
    expect(Object.keys(HERO_DEFS)).toEqual(['taro', 'mei', 'sena', 'ren']);
    for (const h of Object.values(HERO_DEFS)) {
      expect(h.skills).toHaveLength(4);
      expect(manifest[`hero-${h.id}`]).toBeTruthy();
      expect(h.skills[0].cost).toBe(0); // l'attaque de base est gratuite
    }
  });
  it('au moins 12 ennemis et 4 boss, textures présentes', () => {
    expect(Object.keys(ENEMY_DEFS).length).toBeGreaterThanOrEqual(12);
    expect(Object.keys(BOSS_DEFS)).toHaveLength(4);
    for (const d of [...Object.values(ENEMY_DEFS), ...Object.values(BOSS_DEFS)]) expect(manifest[d.tex]).toBeTruthy();
    for (const b of Object.values(BOSS_DEFS)) expect(b.phases).toHaveLength(3);
  });
});

describe('règles', () => {
  it('boss aux vagues 5/10/15/20 dans l’ordre du prototype, puis en boucle', () => {
    expect([5, 10, 15, 20].map(bossForWave)).toEqual(['captain', 'oracle', 'arbiter', 'sovereign']);
    expect(bossForWave(25)).toBe('captain');
    expect(bossForWave(7)).toBeNull();
    expect(isBossWave(CAMPAIGN_WAVES)).toBe(true);
  });
  it('régions et phases', () => {
    expect([1, 3, 4, 7, 8, 10, 11, 20].map(regionForWave)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(phaseForHp(1)).toBe(1);
    expect(phaseForHp(0.68)).toBe(2);
    expect(phaseForHp(0.5)).toBe(2);
    expect(phaseForHp(0.34)).toBe(3);
  });
  it('formules de dégâts', () => {
    expect(heroDamage(20, 1, false, 0.5)).toBe(20);
    expect(heroDamage(20, 1, true, 0.5)).toBe(35);
    expect(mitigate(100, 0)).toBe(100);
    expect(mitigate(100, 10)).toBe(86);
    expect(enemyScaling(1)).toEqual({ hp: 1, dmg: 1 });
    expect(enemyScaling(21).hp).toBeGreaterThan(enemyScaling(20).hp * 1.3); // mode infini plus dur
  });
  it('le pool d’ennemis s’élargit avec les régions', () => {
    expect(enemyPool(1).map((d) => d.id).sort()).toEqual(['raider', 'wolf']);
    const late = enemyPool(12).map((d) => d.id);
    expect(late).toContain('voidHerald');
    expect(late).toContain('emberHound');
    expect(late.length).toBe(13);
  });
  it('plan de vague : taille, élites plafonnées, vagues de boss allégées', () => {
    for (let w = 1; w <= 30; w++) {
      const p = planWave(w, new Rng(w));
      const ids = p.packs.flat();
      const elites = ids.filter((id) => ENEMY_DEFS[id].elite).length;
      expect(elites).toBeLessThanOrEqual(3 + Math.floor((w - 1) / 20));
      for (const id of ids) expect(ENEMY_DEFS[id].minWave).toBeLessThanOrEqual(w);
      if (p.boss) expect(elites).toBe(0);
      expect(p.packs.every((pk) => pk.length >= 1 && pk.length <= 5)).toBe(true);
    }
    expect(planWave(4, new Rng(1)).packs.flat().length).toBe(30);
    expect(planWave(5, new Rng(1)).boss).toBe('captain');
  });
  it('même graine → même vague (runs reproductibles)', () => {
    expect(planWave(9, new Rng(42))).toEqual(planWave(9, new Rng(42)));
  });
});

describe('zones télégraphiées', () => {
  it('cercle, anneau, ligne, cône, croix', () => {
    const c = makeZone({ shape: 'circle', x: 0, y: 0, r: 100 });
    expect(zoneHits(c, 90, 0)).toBe(true);
    expect(zoneHits(c, 120, 0)).toBe(false);
    expect(zoneHits(c, 120, 0, 25)).toBe(true);
    const ring = makeZone({ shape: 'ring', x: 0, y: 0, r: 400, r2: 200 });
    expect(zoneHits(ring, 100, 0)).toBe(false); // sûr au centre
    expect(zoneHits(ring, 300, 0)).toBe(true);
    const line = makeZone({ shape: 'line', x: 0, y: 0, angle: 0, len: 300, width: 60 });
    expect(zoneHits(line, 200, 20)).toBe(true);
    expect(zoneHits(line, 200, 50)).toBe(false);
    expect(zoneHits(line, -50, 0)).toBe(false);
    const cone = makeZone({ shape: 'cone', x: 0, y: 0, angle: 0, r: 200, arc: Math.PI / 2 });
    expect(zoneHits(cone, 100, 50)).toBe(true);
    expect(zoneHits(cone, -100, 0)).toBe(false); // derrière : sûr
    const cross = makeZone({ shape: 'cross', x: 0, y: 0, angle: 0, len: 500, width: 80 });
    expect(zoneHits(cross, 300, 0)).toBe(true);
    expect(zoneHits(cross, 0, -300)).toBe(true);
    expect(zoneHits(cross, 200, 200)).toBe(false); // diagonale libre
  });
});

describe('directeur de vagues', () => {
  it('intermission → vague → nettoyage → vague suivante, boss compris', () => {
    const d = new WaveDirector(new Rng(3), 4);
    const log: string[] = [];
    let alive = 0, boss = false;
    const cb = {
      start: (p: { wave: number }) => log.push(`start ${p.wave}`),
      spawnPack: (ids: unknown[]) => { alive += ids.length; },
      spawnBoss: () => { boss = true; log.push('boss'); },
      cleared: (p: { wave: number }) => log.push(`clear ${p.wave}`),
    };
    for (let i = 0; i < 60 * 120; i++) {
      d.update(1 / 60, alive, boss, cb);
      if (i % 30 === 0) { alive = Math.max(0, alive - 3); }
      if (log.includes('boss') && boss && i % 600 === 0) boss = false;
      if (log.includes('clear 5')) break;
    }
    expect(log.slice(0, 2)).toEqual(['start 4', 'clear 4']);
    expect(log).toContain('start 5');
    expect(log).toContain('boss');
    expect(log).toContain('clear 5');
  });
  it('hold bloque l’intermission jusqu’à next()', () => {
    const d = new WaveDirector(new Rng(1));
    d.hold = true;
    const cb = { start: () => {}, spawnPack: () => {}, spawnBoss: () => {}, cleared: () => {} };
    for (let i = 0; i < 600; i++) d.update(1 / 60, 0, false, cb);
    expect(d.wave).toBe(0);
    d.next();
    d.update(1 / 60, 0, false, cb);
    expect(d.wave).toBe(1);
  });
});

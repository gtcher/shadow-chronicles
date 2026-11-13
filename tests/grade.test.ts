import { describe, expect, it } from 'vitest';
import { CHAPTER_GRADES, NEUTRAL_GRADE, gradeForChapter, gradePixel, mixGrade, type Vec3 } from '../src/game/vfx/grade/grades';

const luma = (c: Vec3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const close = (a: Vec3, b: Vec3, eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < eps);

describe('étalonnage couleur par chapitre', () => {
  it("l'ambiance neutre ne change rien", () => {
    for (const c of [[0, 0, 0], [1, 1, 1], [0.2, 0.5, 0.8], [0.9, 0.1, 0.3]] as Vec3[]) expect(close(gradePixel(c, NEUTRAL_GRADE), c)).toBe(true);
  });

  it('un chapitre par région, bornes respectées', () => {
    expect(CHAPTER_GRADES).toHaveLength(4);
    expect(gradeForChapter(-3)).toBe(CHAPTER_GRADES[0]);
    expect(gradeForChapter(9)).toBe(CHAPTER_GRADES[3]);
  });

  it('le fondu va exactement de A à B', () => {
    const a = CHAPTER_GRADES[0], b = CHAPTER_GRADES[3];
    expect(mixGrade(a, b, 0)).toEqual({ ...a });
    const end = mixGrade(a, b, 1);
    expect(end.contrast).toBeCloseTo(b.contrast); expect(end.highTint).toBe(b.highTint); end.lift.forEach((v, i) => expect(v).toBeCloseTo(b.lift[i]));
  });

  it('chaque ambiance garde la lisibilité (pas de noir bouché, pas de blanc brûlé, gris moyen proche)', () => {
    for (const g of CHAPTER_GRADES) {
      const mid = gradePixel([0.45, 0.45, 0.45], g);
      expect(Math.abs(luma(mid) - 0.45)).toBeLessThan(0.08);
      expect(luma(gradePixel([0.08, 0.08, 0.08], g))).toBeGreaterThan(0.01);
      expect(luma(gradePixel([0.95, 0.95, 0.95], g))).toBeLessThan(1);
      // couleurs signature des héros : la teinte dominante reste la même
      for (const hero of [[0.88, 0.19, 0.24], [1, 0.25, 0.7], [0.31, 0.55, 1], [0.91, 0.71, 0.29]] as Vec3[]) {
        const out = gradePixel(hero, g);
        expect(out.indexOf(Math.max(...out))).toBe(hero.indexOf(Math.max(...hero)));
      }
    }
  });

  it('les ambiances ont leur caractère (ch2 chaud, ch3 froid et désaturé, ch4 violet)', () => {
    const grey: Vec3 = [0.3, 0.3, 0.3];
    const [c1, c2, c3, c4] = CHAPTER_GRADES.map((g) => gradePixel(grey, g));
    expect(c2[0]).toBeGreaterThan(c2[2]);
    expect(c3[2]).toBeGreaterThan(c3[0]);
    expect(c4[2]).toBeGreaterThan(c4[1]); expect(c4[0]).toBeGreaterThan(c4[1]);
    expect(c1[2]).toBeGreaterThan(c1[0]);
    expect(CHAPTER_GRADES[2].saturation).toBeLessThan(1);
  });

  it('la vignette assombrit les coins, pas le centre', () => {
    for (const g of CHAPTER_GRADES) {
      const c: Vec3 = [0.5, 0.5, 0.5];
      expect(luma(gradePixel(c, g, 0.7))).toBeLessThan(luma(gradePixel(c, g, 0)) - 0.1);
      expect(close(gradePixel(c, g, 0), gradePixel(c, g, 0.2))).toBe(true);
    }
  });
});

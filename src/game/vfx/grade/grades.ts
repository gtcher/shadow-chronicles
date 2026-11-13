/**
 * Étalonnage couleur par chapitre (« grading » de cinéma), sans dépendance au rendu :
 * paramètres, mélange entre deux chapitres et une version CPU de la formule du shader
 * (mêmes calculs que `grade.frag`) pour les tests.
 *
 * Ordre des opérations (par pixel, couleurs 0..1) :
 *   1. contraste autour du gris moyen
 *   2. lift / gamma / gain (ombres, tons moyens, hautes lumières) par canal
 *   3. saturation
 *   4. virage partagé : teinte ajoutée aux ombres et aux hautes lumières
 *   5. vignette colorée (bords de l'écran)
 *   6. grain léger (surtout dans les tons moyens)
 */

export type Vec3 = [number, number, number];

export interface GradeParams {
  /** Ajout dans les ombres (−0.1..0.1 par canal). */
  lift: Vec3;
  /** Tons moyens (1 = neutre ; > 1 éclaircit). */
  gamma: Vec3;
  /** Multiplicateur des hautes lumières (1 = neutre). */
  gain: Vec3;
  /** 1 = neutre. */
  contrast: number;
  /** 1 = neutre, 0 = noir et blanc. */
  saturation: number;
  /** Couleur poussée dans les ombres / les hautes lumières (hex) et force du virage. */
  shadowTint: number;
  highTint: number;
  split: number;
  /** Vignette : couleur des bords et force (0..1). */
  vignetteColor: number;
  vignette: number;
  /** Grain (amplitude, ~0.03 = discret). */
  grain: number;
  /** Multiplicateur du bloom existant (lueurs des braseros, sorts). */
  bloom: number;
}

export const NEUTRAL_GRADE: GradeParams = {
  lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], contrast: 1, saturation: 1,
  shadowTint: 0x808080, highTint: 0x808080, split: 0, vignetteColor: 0x000000, vignette: 0, grain: 0, bloom: 1,
};

/**
 * Une ambiance par chapitre (régions des vagues 1-3, 4-7, 8-10, 11+), accordée aux thèmes
 * de `ChapterArena` (lumière ambiante, brume, lueurs) :
 *  - ch1 Ruines au clair de lune : ombres bleu-vert froides, braseros orangés (bleu/orange).
 *  - ch2 Forges de cendre : chaud et contrasté, ombres pourpres, hautes lumières dorées.
 *  - ch3 Glacier : désaturé, ombres bleu acier relevées, hautes lumières blanc-cyan.
 *  - ch4 Néant : ombres violettes profondes, éclats magenta, vignette plus lourde.
 */
export const CHAPTER_GRADES: GradeParams[] = [
  { lift: [-0.012, 0.004, 0.022], gamma: [0.98, 1.0, 1.04], gain: [1.06, 1.02, 0.97], contrast: 1.08, saturation: 1.06,
    shadowTint: 0x1f5a78, highTint: 0xffb066, split: 0.07, vignetteColor: 0x020814, vignette: 0.55, grain: 0.028, bloom: 1.05 },
  { lift: [0.008, -0.004, -0.008], gamma: [1.0, 0.98, 0.97], gain: [1.03, 1.0, 0.95], contrast: 1.12, saturation: 0.94,
    shadowTint: 0x4a1020, highTint: 0xffd080, split: 0.08, vignetteColor: 0x120202, vignette: 0.6, grain: 0.032, bloom: 1.2 },
  { lift: [0.004, 0.01, 0.016], gamma: [0.99, 1.0, 1.02], gain: [0.99, 1.01, 1.03], contrast: 1.06, saturation: 0.76,
    shadowTint: 0x3a5068, highTint: 0xe0f4ff, split: 0.05, vignetteColor: 0x010612, vignette: 0.5, grain: 0.022, bloom: 1.1 },
  { lift: [0.01, -0.008, 0.024], gamma: [1.0, 0.96, 1.03], gain: [1.02, 0.97, 1.06], contrast: 1.1, saturation: 1.02,
    shadowTint: 0x3a1460, highTint: 0xff8ae0, split: 0.08, vignetteColor: 0x08020f, vignette: 0.7, grain: 0.034, bloom: 1.25 },
];

export const gradeForChapter = (idx: number): GradeParams => CHAPTER_GRADES[Math.max(0, Math.min(CHAPTER_GRADES.length - 1, idx | 0))];

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
export const hexToRgb = (c: number): Vec3 => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const rgbToHex = (v: Vec3) => (Math.round(v[0] * 255) << 16) | (Math.round(v[1] * 255) << 8) | Math.round(v[2] * 255);
const lerpHex = (a: number, b: number, k: number) => rgbToHex(lerp3(hexToRgb(a), hexToRgb(b), k));

/** Mélange deux ambiances (fondu entre chapitres). */
export function mixGrade(a: GradeParams, b: GradeParams, k: number): GradeParams {
  k = Math.max(0, Math.min(1, k));
  return {
    lift: lerp3(a.lift, b.lift, k), gamma: lerp3(a.gamma, b.gamma, k), gain: lerp3(a.gain, b.gain, k),
    contrast: lerp(a.contrast, b.contrast, k), saturation: lerp(a.saturation, b.saturation, k),
    shadowTint: lerpHex(a.shadowTint, b.shadowTint, k), highTint: lerpHex(a.highTint, b.highTint, k), split: lerp(a.split, b.split, k),
    vignetteColor: lerpHex(a.vignetteColor, b.vignetteColor, k), vignette: lerp(a.vignette, b.vignette, k),
    grain: lerp(a.grain, b.grain, k), bloom: lerp(a.bloom, b.bloom, k),
  };
}

export const LUMA: Vec3 = [0.2126, 0.7152, 0.0722];
const luma = (c: Vec3) => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];

/** Teinte de virage « sans luminance » : on n'ajoute que l'écart de couleur, pas de lumière. */
export function tintOffset(hex: number): Vec3 {
  const c = hexToRgb(hex), l = luma(c);
  return [c[0] - l, c[1] - l, c[2] - l];
}

const smooth = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/**
 * Formule du shader en JS (sans grain) : sert aux tests et à vérifier une ambiance sans GPU.
 * `r` = distance au centre de l'écran (0 au centre, ~0.7 dans les coins), pour la vignette.
 */
export function gradePixel(rgb: Vec3, p: GradeParams, r = 0): Vec3 {
  let c: Vec3 = rgb.map((v) => (v - 0.5) * p.contrast + 0.5) as Vec3;
  c = c.map((v, i) => {
    const x = Math.max(0, p.gain[i] * (v + p.lift[i] * (1 - v)));
    return Math.pow(x, 1 / p.gamma[i]);
  }) as Vec3;
  const l = luma(c);
  c = c.map((v) => l + (v - l) * p.saturation) as Vec3;
  const sh = tintOffset(p.shadowTint), hi = tintOffset(p.highTint);
  const ws = (1 - smooth(0, 0.55, l)) * p.split, wh = smooth(0.45, 1, l) * p.split;
  c = c.map((v, i) => v + sh[i] * ws + hi[i] * wh) as Vec3;
  const vc = hexToRgb(p.vignetteColor), vw = smooth(0.32, 0.85, r) * p.vignette;
  c = c.map((v, i) => v + (vc[i] - v) * vw) as Vec3;
  return c.map((v) => Math.max(0, Math.min(1, v))) as Vec3;
}

/**
 * Niveaux de qualité graphique. `auto` choisit selon l'appareil puis descend
 * d'un cran si le jeu passe sous ~48 i/s pendant plusieurs secondes.
 */
export type QualityLevel = 'low' | 'medium' | 'high';
export type QualitySetting = QualityLevel | 'auto';

export interface QualityPreset {
  /** Résolution interne max du canvas (×devicePixelRatio). */
  resolution: number;
  /** Échelle de la carte de lumière (0 = éclairage désactivé, ambiance plate). */
  lightScale: number;
  /** Échelle du bloom (0 = désactivé). */
  bloomScale: number;
  bloomBlur: number;
  /** Couches de brouillard (0 à 2). */
  fogLayers: number;
  maxParticles: number;
  maxDamageNumbers: number;
  maxDecals: number;
  /** Multiplicateur du nombre de particules émises. */
  particleDensity: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: { resolution: 1, lightScale: 0.25, bloomScale: 0, bloomBlur: 0, fogLayers: 1, maxParticles: 300, maxDamageNumbers: 24, maxDecals: 40, particleDensity: 0.5 },
  medium: { resolution: 1.5, lightScale: 0.35, bloomScale: 0.2, bloomBlur: 4, fogLayers: 1, maxParticles: 700, maxDamageNumbers: 48, maxDecals: 90, particleDensity: 0.8 },
  high: { resolution: 2, lightScale: 0.5, bloomScale: 0.25, bloomBlur: 6, fogLayers: 2, maxParticles: 1600, maxDamageNumbers: 80, maxDecals: 160, particleDensity: 1 },
};

const ORDER: QualityLevel[] = ['low', 'medium', 'high'];

/** Estimation de départ selon l'appareil (mobile/tablette → medium, petit appareil → low). */
export function detectQuality(): QualityLevel {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = matchMedia?.('(pointer: coarse)').matches;
  const mem = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;
  if (mem <= 2 || cores <= 2) return 'low';
  if (coarse || mem <= 4 || cores <= 4) return 'medium';
  return 'high';
}

export function lowerQuality(q: QualityLevel): QualityLevel {
  return ORDER[Math.max(0, ORDER.indexOf(q) - 1)];
}

/** Surveille les i/s et signale quand il faut baisser la qualité (mode auto). */
export class FpsGovernor {
  private acc = 0;
  private frames = 0;
  private slowFor = 0;
  /** Ignore les premières secondes (chargement des textures, compilation des shaders). */
  private warmup = 3;

  /** Retourne true quand une baisse est recommandée. */
  sample(frameDt: number): boolean {
    if (this.warmup > 0) { this.warmup -= frameDt; return false; }
    this.acc += frameDt; this.frames++;
    if (this.acc < 1) return false;
    const fps = this.frames / this.acc;
    this.acc = 0; this.frames = 0;
    this.slowFor = fps < 48 ? this.slowFor + 1 : 0;
    if (this.slowFor >= 4) { this.slowFor = 0; this.warmup = 3; return true; }
    return false;
  }
}

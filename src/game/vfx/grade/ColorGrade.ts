import type { Filter } from 'pixi.js';
import { GLSL, createFilter, type PostStack } from '@engine';
import { NEUTRAL_GRADE, hexToRgb, mixGrade, tintOffset, type GradeParams } from './grades';

/**
 * Post-traitement plein écran : étalonnage couleur + vignette + grain, en UNE passe GPU
 * (voir `grades.ts` pour la formule et les ambiances par chapitre).
 *
 * Posé sur l'étage `world` de `renderer.post` (monde + bloom + effets écran, order 100) :
 * l'interface Pixi (`hud`) n'est pas filtrée.
 * Coût : une lecture de texture par pixel. Coupé en qualité « low », par le réglage joueur
 * « Effet cinéma », ou si le moteur n'est pas en WebGL.
 */

const fragment = /* glsl */ `${GLSL.hash}
in vec2 vTextureCoord;
in vec2 vScreen;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform vec3 uVigColor;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uAspect;
uniform float uMix;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);
  if (src.a <= 0.0) { finalColor = src; return; }
  vec3 c = src.rgb / src.a;
  vec3 orig = c;
  c = (c - 0.5) * uContrast + 0.5;
  c = max(uGain * (c + uLift * (1.0 - c)), 0.0);
  c = pow(c, 1.0 / uGamma);
  float l = dot(c, LUMA);
  c = l + (c - l) * uSaturation;
  c += uShadowTint * (1.0 - smoothstep(0.0, 0.55, l)) + uHighTint * smoothstep(0.45, 1.0, l);
  // vignette elliptique (suit la forme de l'écran, portrait comme paysage)
  float r = length(vScreen - 0.5);
  c = mix(c, uVigColor, smoothstep(0.32, 0.85, r) * uVignette);
  // grain : surtout dans les tons moyens, presque rien dans les noirs et les blancs
  float n = hash12(floor(vScreen * vec2(uAspect, 1.0) * 720.0) + fract(uTime) * 517.0) - 0.5;
  c += n * uGrain * (1.0 - abs(l - 0.5) * 1.6);
  c = mix(orig, clamp(c, 0.0, 1.0), uMix);
  finalColor = vec4(c * src.a, src.a);
}`;

export class ColorGrade {
  readonly filter: Filter;
  /** Ambiance actuellement appliquée (après fondu). */
  params: GradeParams = NEUTRAL_GRADE;
  private readonly u: Record<string, any>;
  private post: PostStack | null = null;
  private remove: (() => void) | null = null;
  private on = false;
  private t = 0;
  private from: GradeParams = NEUTRAL_GRADE;
  private to: GradeParams = NEUTRAL_GRADE;
  private k = 1;
  private dur = 1;
  /** Grain coupé (mode confort). */
  grainScale = 1;
  /** Force globale 0..1 (1 = ambiance pleine). */
  amount = 1;

  constructor() {
    const v3 = () => ({ value: new Float32Array(3), type: 'vec3<f32>' as const });
    const f = (value: number) => ({ value, type: 'f32' as const });
    const filter = createFilter({ name: 'color-grade', fragment, options: { antialias: 'off' }, uniforms: {
      uLift: v3(), uGamma: v3(), uGain: v3(), uShadowTint: v3(), uHighTint: v3(), uVigColor: v3(),
      uContrast: f(1), uSaturation: f(1), uVignette: f(0), uGrain: f(0), uTime: f(0), uAspect: f(1), uMix: f(1),
    } });
    this.u = filter.resources.u.uniforms;
    this.filter = filter;
    this.write(NEUTRAL_GRADE);
  }

  get enabled(): boolean { return this.on; }

  /** Branche sur les étages de post-traitement du moteur (le filtre n'y est posé que s'il est actif). */
  attach(post: PostStack, on: boolean): void {
    this.post = post;
    this.setEnabled(on);
  }

  /** Sans filtre posé : zéro coût. */
  setEnabled(on: boolean): void {
    this.on = on;
    if (on && !this.remove && this.post) this.remove = this.post.add('world', this.filter, 100);
    if (!on && this.remove) { this.remove(); this.remove = null; }
  }

  /** Change d'ambiance avec un fondu (secondes ; 0 = immédiat). */
  set(p: GradeParams, duration = 0): void {
    this.from = this.params;
    this.to = p;
    this.dur = Math.max(0.0001, duration);
    this.k = duration > 0 ? 0 : 1;
    if (this.k >= 1) { this.params = p; this.write(p); }
  }

  update(dt: number, aspect: number): void {
    this.t += dt;
    if (this.k < 1) {
      this.k = Math.min(1, this.k + dt / this.dur);
      this.params = mixGrade(this.from, this.to, this.k);
      this.write(this.params);
    }
    this.u.uTime = this.t;
    this.u.uAspect = aspect;
    this.u.uGrain = this.params.grain * this.grainScale;
    this.u.uMix = this.amount;
  }

  private write(p: GradeParams): void {
    const u = this.u;
    (u.uLift as Float32Array).set(p.lift);
    (u.uGamma as Float32Array).set(p.gamma);
    (u.uGain as Float32Array).set(p.gain);
    (u.uShadowTint as Float32Array).set(tintOffset(p.shadowTint).map((v) => v * p.split));
    (u.uHighTint as Float32Array).set(tintOffset(p.highTint).map((v) => v * p.split));
    (u.uVigColor as Float32Array).set(hexToRgb(p.vignetteColor));
    u.uContrast = p.contrast;
    u.uSaturation = p.saturation;
    u.uVignette = p.vignette;
    u.uGrain = p.grain * this.grainScale;
  }

  destroy(): void {
    this.setEnabled(false);
    this.post = null;
    this.filter.destroy();
  }
}

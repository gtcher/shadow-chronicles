import { BlurFilter, ColorMatrixFilter, Matrix, RenderTexture, Sprite } from 'pixi.js';
import type { Renderer } from '@engine';

/**
 * Bloom économique, sans shader maison :
 * 1. le monde est rendu à 20–25 % de la résolution ;
 * 2. un seuil (matrice de couleur) ne garde que les zones très lumineuses ;
 * 3. un flou gaussien les étale ; le tout est ajouté (mode `add`) par-dessus l'écran.
 * Les filtres travaillent sur la petite texture : coût faible même sur mobile milieu de gamme.
 */
export class Bloom {
  /** Intensité de l'ajout (0..1.5). */
  strength = 0.75;
  /** Seuil de luminosité (0..1) au-dessus duquel un pixel « brille ». */
  threshold = 0.62;
  private scale = 0.25;
  private src: RenderTexture | null = null;
  private dst: RenderTexture | null = null;
  private readonly srcSprite = new Sprite();
  private readonly overlay = new Sprite();
  private readonly thresholdFilter = new ColorMatrixFilter();
  private readonly blur = new BlurFilter({ strength: 6, quality: 3 });
  private readonly mat = new Matrix();

  constructor(private readonly renderer: Renderer) {
    this.overlay.blendMode = 'add';
    this.overlay.label = 'bloom';
    this.srcSprite.filters = [this.thresholdFilter, this.blur];
    this.setThreshold(this.threshold);
    renderer.layers.screenFx.addChildAt(this.overlay, 0);
  }

  setThreshold(t: number): void {
    this.threshold = t;
    const k = 1 / Math.max(0.05, 1 - t);
    // rgb' = (rgb - t) * k ; alpha = 1
    this.thresholdFilter.matrix = [k, 0, 0, 0, -t * k, 0, k, 0, 0, -t * k, 0, 0, k, 0, -t * k, 0, 0, 0, 1, 0];
  }

  /** scale = 0 désactive. */
  configure(scale: number, blur: number): void {
    this.scale = scale;
    this.blur.strength = blur;
    this.overlay.visible = scale > 0;
    this.src?.destroy(true); this.dst?.destroy(true);
    this.src = this.dst = null;
  }

  get enabled(): boolean { return this.scale > 0; }

  render(): void {
    if (!this.enabled) return;
    const r = this.renderer, s = this.scale;
    const tw = Math.max(1, Math.ceil(r.width * s)), th = Math.max(1, Math.ceil(r.height * s));
    if (!this.src || this.src.width !== tw || this.src.height !== th) {
      this.src?.destroy(true); this.dst?.destroy(true);
      this.src = RenderTexture.create({ width: tw, height: th, resolution: 1 });
      this.dst = RenderTexture.create({ width: tw, height: th, resolution: 1 });
      this.srcSprite.texture = this.src;
      this.overlay.texture = this.dst;
    }
    const wt = r.world.localTransform;
    this.mat.set(wt.a * s, wt.b * s, wt.c * s, wt.d * s, wt.tx * s, wt.ty * s);
    const pr = r.app.renderer;
    pr.render({ container: r.world, target: this.src, transform: this.mat, clear: true, clearColor: [0, 0, 0, 1] });
    pr.render({ container: this.srcSprite, target: this.dst!, clear: true, clearColor: [0, 0, 0, 0] });
    this.overlay.alpha = this.strength;
    this.overlay.width = r.width; this.overlay.height = r.height;
  }

  destroy(): void {
    this.overlay.destroy(); this.srcSprite.destroy();
    this.src?.destroy(true); this.dst?.destroy(true);
  }
}

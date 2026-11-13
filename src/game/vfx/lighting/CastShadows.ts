import { BlurFilter, Container, Sprite } from 'pixi.js';
import type { Light } from '../Lighting';

/**
 * Ombres portées douces : chaque combattant et chaque décor projette au sol une silhouette sombre,
 * étirée à l'opposé de la lumière dominante (torche du héros, braseros, boss…).
 *
 * - Lanceurs : les enfants de la couche `entities` (sprites de décor, ou conteneurs avec un enfant
 *   « body »). Rien à déclarer côté gameplay.
 * - Toutes les ombres vont dans un seul conteneur, flouté une fois (filtre à demi-résolution) :
 *   coût fixe, quel que soit le nombre de lanceurs.
 * - Sans lumière proche : ombre courte vers le bas-droite (lune), pour garder les personnages posés.
 */
export class CastShadows {
  readonly root = new Container({ label: 'cast-shadows' });
  enabled = true;
  /** Opacité maximale d'une ombre. */
  strength = 0.85;
  private readonly pool: Sprite[] = [];
  private readonly blur = new BlurFilter({ strength: 3, quality: 2 });

  constructor(private readonly casters: Container, shadowLayer: Container) {
    this.blur.resolution = 0.5;
    this.root.filters = [this.blur];
    shadowLayer.addChildAt(this.root, 0);
  }

  setEnabled(on: boolean, soft = true): void {
    this.enabled = on;
    this.root.visible = on;
    this.root.filters = on && soft ? [this.blur] : null;
  }

  /** À appeler une fois par image, avec les lumières de l'image (avant qu'elles soient vidées). */
  update(lights: Iterable<Light>, extra: readonly Light[]): void {
    if (!this.enabled) return;
    const strong: Light[] = [];
    const take = (l: Light) => { if (l.radius >= 150 && l.intensity >= 0.45 && (l.life === undefined || (l.maxLife ?? 0) > 0.3)) strong.push(l); };
    for (const l of lights) take(l);
    for (const l of extra) take(l);

    let n = 0;
    for (const child of this.casters.children) {
      if (!child.visible || child.alpha < 0.3) continue;
      let src: Sprite | null = null, ox = 0, oy = 0;
      if (child instanceof Sprite) {
        if (child.blendMode === 'add') continue;
        src = child;
      } else {
        const b = child.getChildByLabel('body');
        if (!b || !b.visible) continue;
        // Corps composé (pantin peint) : il fournit sa silhouette via `shadow`.
        const sh = b instanceof Sprite ? b : (b as { shadow?: Sprite | null }).shadow;
        if (!sh) continue;
        src = sh; ox = b.x; oy = b.y;
      }
      const fx = child.x, fy = child.y; // pieds
      // Lumière dominante : la plus forte au point des pieds (hors lumière posée sur le lanceur lui-même).
      let best = 0, dx = 0.35, dy = 1, dist = 0, rad = 1;
      for (const l of strong) {
        const lx = fx - l.x, ly = fy - l.y, d = Math.hypot(lx, ly);
        if (d < 28 || d > l.radius) continue;
        const a = 1 - d / l.radius, s = l.intensity * a * a;
        if (s > best) { best = s; dx = lx / d; dy = ly / d; dist = d; rad = l.radius; }
      }
      let alpha: number, len: number;
      if (best > 0) {
        alpha = Math.min(1, 0.45 + best * 2) * this.strength;
        len = Math.min(1.25, 0.35 + (dist / rad) * 1.3);
      } else {
        const k = Math.hypot(dx, dy); dx /= k; dy /= k;
        alpha = 0.55 * this.strength; len = 0.55;
      }
      let s = this.pool[n];
      if (!s) { s = new Sprite(); s.tint = 0x000000; this.pool.push(s); this.root.addChild(s); }
      s.visible = true;
      s.texture = src.texture;
      s.anchor.copyFrom(src.anchor);
      s.position.set(fx + ox, fy + oy);
      // La silhouette se couche au sol : son « haut » pointe à l'opposé de la lumière.
      s.rotation = Math.atan2(dx, -dy);
      s.scale.set(src.scale.x, Math.abs(src.scale.y) * len * 0.7);
      s.alpha = alpha * src.alpha;
      n++;
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.blur.destroy();
  }
}

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
  /** État lissé par lanceur (direction, longueur, opacité) : l'ombre tourne en douceur, sans saut. */
  private readonly smooth = new WeakMap<object, { dx: number; dy: number; len: number; alpha: number }>();
  private last = 0;

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
    const now = performance.now() / 1000;
    const dt = this.last ? Math.min(0.1, Math.max(0, now - this.last)) : 1;
    this.last = now;
    const ease = 1 - Math.exp(-dt * 5);
    const strong: Light[] = [];
    // Lumières fixes ou durables seulement : les éclairs brefs (impacts, projectiles) feraient sauter les ombres.
    const take = (l: Light) => { if (l.radius >= 150 && l.intensity >= 0.45 && l.life === undefined) strong.push(l); };
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
      // Direction : moyenne pondérée des lumières proches et de la lune (bas-droite). Le poids d'une lumière
      // s'éteint en douceur vers son bord et tout près de sa source : plus de bascule d'un coup.
      const MOON = 0.12;
      let wx = 0.33 * MOON, wy = 0.94 * MOON, wsum = MOON, lsum = 0.55 * MOON, best = 0;
      for (const l of strong) {
        const lx = fx - l.x, ly = fy - l.y, d = Math.hypot(lx, ly);
        if (d > l.radius || d < 1) continue;
        const a = 1 - d / l.radius, near = Math.min(1, d / 60);
        const s = l.intensity * a * a * near;
        if (s <= 0) continue;
        wx += (lx / d) * s; wy += (ly / d) * s; wsum += s;
        lsum += Math.min(1.25, 0.35 + (d / l.radius) * 1.3) * s;
        best = Math.max(best, s);
      }
      const k = Math.hypot(wx, wy) || 1;
      const tdx = wx / k, tdy = wy / k, tlen = lsum / wsum;
      const talpha = (best > 0 ? Math.min(1, 0.55 + best * 1.6) : 0.55) * this.strength;
      let st = this.smooth.get(child);
      if (!st) { st = { dx: tdx, dy: tdy, len: tlen, alpha: talpha }; this.smooth.set(child, st); }
      else {
        st.dx += (tdx - st.dx) * ease; st.dy += (tdy - st.dy) * ease;
        const m = Math.hypot(st.dx, st.dy) || 1; st.dx /= m; st.dy /= m;
        st.len += (tlen - st.len) * ease; st.alpha += (talpha - st.alpha) * ease;
      }
      const dx = st.dx, dy = st.dy, len = st.len, alpha = st.alpha;
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

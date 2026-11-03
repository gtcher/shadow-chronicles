import { clamp, damp, type Vec2Like } from '../math/Vec2';
import type { Rect } from '../physics/shapes';

/**
 * Caméra 2D : suivi amorti, anticipation (look-ahead), zone morte, zoom, secousses
 * (modèle « trauma » : l'intensité décroît, l'amplitude = trauma²) et limites du monde.
 *
 * La caméra ne connaît pas Pixi : elle produit `x`, `y`, `zoom`, `rotation` que
 * le `Renderer` applique au conteneur du monde. (x, y) = point du monde au centre de l'écran.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  rotation = 0;
  /** Taille de la vue en pixels écran (mise à jour par le Renderer au redimensionnement). */
  viewW = 1280;
  viewH = 720;

  /** Réactivité du suivi (plus grand = plus nerveux). */
  followLambda = 7;
  /** Anticipation : décalage dans le sens de la vitesse de la cible (secondes de trajet). */
  lookAhead = 0.18;
  /** Demi-taille de la zone morte en pixels monde. */
  deadZone = { w: 0, h: 0 };
  bounds: Rect | null = null;
  targetZoom = 1;
  zoomLambda = 6;

  /** Secousse : 0..1. Ajoutez via `shake()`. */
  trauma = 0;
  traumaDecay = 1.6;
  maxShakeOffset = 18;
  maxShakeAngle = 0.035;
  /** Multiplicateur global des secousses et à-coups (option d'accessibilité : 0 = aucun). */
  shakeScale = 1;
  /** À-coup directionnel (ressort amorti), en pixels monde. */
  private kickX = 0;
  private kickY = 0;
  private kickVX = 0;
  private kickVY = 0;
  private shakeX = 0;
  private shakeY = 0;
  private shakeT = 0;

  private target: Vec2Like | null = null;
  private targetVel: Vec2Like | null = null;
  // État précédent pour l'interpolation.
  private prevX = 0;
  private prevY = 0;

  follow(target: Vec2Like | null, velocity: Vec2Like | null = null, snap = true): void {
    this.target = target;
    this.targetVel = velocity;
    if (target && snap) { this.x = this.prevX = target.x; this.y = this.prevY = target.y; }
  }

  /** Ajoute de la secousse (0.2 = petit choc, 0.6 = gros impact, cumulable, plafonné à 1). */
  shake(amount: number): void { this.trauma = Math.min(1, this.trauma + amount); }

  /**
   * À-coup directionnel : la vue est poussée dans la direction (dx, dy) puis revient
   * en ressort. Ex. recul d'un tir lourd, coup reçu. `force` en pixels (≈ 4…16).
   */
  kick(dx: number, dy: number, force = 8): void {
    const l = Math.hypot(dx, dy) || 1;
    this.kickVX += (dx / l) * force * 30 * this.shakeScale;
    this.kickVY += (dy / l) * force * 30 * this.shakeScale;
  }

  /** Appelé à chaque pas de simulation. */
  update(dt: number): void {
    this.prevX = this.x; this.prevY = this.y;
    if (this.target) {
      let tx = this.target.x, ty = this.target.y;
      if (this.targetVel) { tx += this.targetVel.x * this.lookAhead; ty += this.targetVel.y * this.lookAhead; }
      // Zone morte : la caméra ne bouge que si la cible en sort.
      const dzw = this.deadZone.w, dzh = this.deadZone.h;
      if (dzw > 0) tx = tx > this.x + dzw ? tx - dzw : tx < this.x - dzw ? tx + dzw : this.x;
      if (dzh > 0) ty = ty > this.y + dzh ? ty - dzh : ty < this.y - dzh ? ty + dzh : this.y;
      this.x = damp(this.x, tx, this.followLambda, dt);
      this.y = damp(this.y, ty, this.followLambda, dt);
    }
    this.zoom = damp(this.zoom, this.targetZoom, this.zoomLambda, dt);
    this.clampToBounds();

    this.trauma = Math.max(0, this.trauma - this.traumaDecay * dt);
    this.shakeT += dt;
    const s = this.trauma * this.trauma;
    // Bruit pseudo-continu (somme de sinus) : plus doux qu'un aléatoire pur.
    const n = (f: number, p: number) => Math.sin(this.shakeT * f + p) * 0.6 + Math.sin(this.shakeT * f * 2.3 + p * 1.7) * 0.4;
    // Ressort critique-amorti pour l'à-coup.
    const k = 260, c = 2 * Math.sqrt(k) * 0.9;
    this.kickVX += (-k * this.kickX - c * this.kickVX) * dt;
    this.kickVY += (-k * this.kickY - c * this.kickVY) * dt;
    this.kickX += this.kickVX * dt;
    this.kickY += this.kickVY * dt;
    const amp = s * this.shakeScale;
    this.shakeX = n(37, 0) * amp * this.maxShakeOffset + this.kickX;
    this.shakeY = n(41, 3.1) * amp * this.maxShakeOffset + this.kickY;
    this.rotation = n(29, 7.4) * amp * this.maxShakeAngle;
  }

  /** Position de rendu interpolée (+ secousse). */
  renderPos(alpha: number): { x: number; y: number } {
    return {
      x: this.prevX + (this.x - this.prevX) * alpha + this.shakeX,
      y: this.prevY + (this.y - this.prevY) * alpha + this.shakeY,
    };
  }

  /** Rectangle visible en coordonnées monde (pour le culling, le spawn hors écran…). */
  visibleRect(margin = 0): Rect {
    const w = this.viewW / this.zoom, h = this.viewH / this.zoom;
    return { x: this.x - w / 2 - margin, y: this.y - h / 2 - margin, w: w + margin * 2, h: h + margin * 2 };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: this.x + (sx - this.viewW / 2) / this.zoom, y: this.y + (sy - this.viewH / 2) / this.zoom };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.x) * this.zoom + this.viewW / 2, y: (wy - this.y) * this.zoom + this.viewH / 2 };
  }

  private clampToBounds(): void {
    const b = this.bounds;
    if (!b) return;
    const hw = this.viewW / this.zoom / 2, hh = this.viewH / this.zoom / 2;
    this.x = b.w <= hw * 2 ? b.x + b.w / 2 : clamp(this.x, b.x + hw, b.x + b.w - hw);
    this.y = b.h <= hh * 2 ? b.y + b.h / 2 : clamp(this.y, b.y + hh, b.y + b.h - hh);
  }
}

/** Vecteur 2D mutable. Les méthodes `*Self` modifient l'instance (zéro allocation). */
export class Vec2 {
  constructor(public x = 0, public y = 0) {}

  set(x: number, y: number): this { this.x = x; this.y = y; return this; }
  copy(v: Readonly<Vec2Like>): this { this.x = v.x; this.y = v.y; return this; }
  clone(): Vec2 { return new Vec2(this.x, this.y); }
  addSelf(v: Readonly<Vec2Like>, s = 1): this { this.x += v.x * s; this.y += v.y * s; return this; }
  scaleSelf(s: number): this { this.x *= s; this.y *= s; return this; }
  len(): number { return Math.hypot(this.x, this.y); }
  normalizeSelf(): this {
    const l = this.len();
    if (l > 1e-9) { this.x /= l; this.y /= l; }
    return this;
  }
  /** Limite la longueur à `max` (utile pour les sticks analogiques). */
  clampLenSelf(max: number): this {
    const l = this.len();
    if (l > max) this.scaleSelf(max / l);
    return this;
  }
}

export interface Vec2Like { x: number; y: number }

export const dist2 = (a: Vec2Like, b: Vec2Like): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const dist = (a: Vec2Like, b: Vec2Like): number => Math.sqrt(dist2(a, b));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
/** Lissage exponentiel indépendant du framerate : `rate` = fraction restante par seconde. */
export const damp = (a: number, b: number, lambda: number, dt: number): number => lerp(a, b, 1 - Math.exp(-lambda * dt));

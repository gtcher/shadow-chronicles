/** Fonctions géométriques pures (testées dans tests/physics.test.ts). */

export interface Circle { x: number; y: number; r: number }
export interface Rect { x: number; y: number; w: number; h: number }

export interface Manifold {
  /** Normale de séparation (de A vers B), unitaire. */
  nx: number;
  ny: number;
  /** Profondeur de pénétration (> 0 si collision). */
  depth: number;
}

export function circleCircle(a: Circle, b: Circle, out: Manifold): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  const rs = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rs * rs) return false;
  const d = Math.sqrt(d2);
  if (d > 1e-6) { out.nx = dx / d; out.ny = dy / d; }
  else { out.nx = 1; out.ny = 0; } // superposition parfaite : direction arbitraire stable
  out.depth = rs - d;
  return true;
}

/** Collision cercle / rectangle aligné (murs, obstacles). Normale du rectangle vers le cercle. */
export function circleRect(c: Circle, r: Rect, out: Manifold): boolean {
  const cx = Math.max(r.x, Math.min(c.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(c.y, r.y + r.h));
  let dx = c.x - cx, dy = c.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > 1e-12) {
    if (d2 >= c.r * c.r) return false;
    const d = Math.sqrt(d2);
    out.nx = dx / d; out.ny = dy / d; out.depth = c.r - d;
    return true;
  }
  // Centre du cercle à l'intérieur du rectangle : sortir par le côté le plus proche.
  const left = c.x - r.x, right = r.x + r.w - c.x, top = c.y - r.y, bottom = r.y + r.h - c.y;
  const m = Math.min(left, right, top, bottom);
  dx = m === left ? -1 : m === right ? 1 : 0;
  dy = m === top ? -1 : m === bottom ? 1 : 0;
  if (dx !== 0) dy = 0;
  out.nx = dx; out.ny = dy; out.depth = m + c.r;
  return true;
}

export const pointInRect = (x: number, y: number, r: Rect): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

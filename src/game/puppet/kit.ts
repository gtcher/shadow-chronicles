// @ts-nocheck
/**
 * Boîte à outils de peinture des pièces de pantin (Canvas 2D, fil principal ou worker).
 *
 * Style « peint encré » (héros, piste A) : aplat, modelé doux en dégradé, ombre propre en bas-droite,
 * reflet haut-gauche, liseré de contre-jour, touches de pinceau, trait d'encre.
 * Style « ombres à contre-jour » (ennemis, piste B) : cœur sombre, lumière de dos qui dessine la forme.
 *
 * Toutes les mesures sont en unités du squelette (un combattant fait 96 unités) : le pinceau est mis à
 * l'échelle par la transformation du contexte.
 */

export const TAU = Math.PI * 2;
export const INK = '#0b0a12';
export const SHADE = '#160c2c';

export function hex2rgb(h: string): [number, number, number] {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
export function rgba(h: string, a: number): string { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; }
export function mix(a: string, b: string, t: number): string {
  const A = hex2rgb(a), B = hex2rgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
/** Pseudo-hasard déterministe. */
export function rnd(i: number): number { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

export type Pt = [number, number] | [number, number, number];

/** Chemin lissé fermé passant près des points ; un point [x, y, 1] fait un angle vif. */
export function pathOf(pts: Pt[], closed = true): Path2D {
  const p = new Path2D();
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (!closed) {
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n - 1; i++) {
      if (pts[i][2]) p.lineTo(pts[i][0], pts[i][1]);
      else { const m = mid(pts[i], pts[i + 1]); p.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
    }
    p.lineTo(pts[n - 1][0], pts[n - 1][1]);
    return p;
  }
  const ends = (i) => { const q = pts[i], pv = pts[(i + n - 1) % n], nx = pts[(i + 1) % n]; return [pv[2] ? pv : mid(pv, q), nx[2] ? nx : mid(q, nx)]; };
  const first = pts[0][2] ? pts[0] : ends(0)[0];
  p.moveTo(first[0], first[1]);
  for (let i = 0; i < n; i++) {
    const q = pts[i];
    if (q[2]) { p.lineTo(q[0], q[1]); continue; }
    const [a, b] = ends(i);
    p.lineTo(a[0], a[1]); p.quadraticCurveTo(q[0], q[1], b[0], b[1]);
  }
  p.closePath();
  return p;
}

/**
 * Membre vu de profil, pivot en (0, 0), dirigé vers +y sur la longueur L.
 * w0 / w1 : épaisseurs à l'attache et au bout ; `back` / `front` : galbe arrière (mollet, triceps) et avant.
 */
export function limbPath(L: number, w0: number, w1: number, back = 0, front = 0): Path2D {
  const p = new Path2D();
  p.moveTo(-w0 / 2, 0);
  p.bezierCurveTo(-w0 / 2 - back, L * 0.3, -w1 / 2 - back * 0.35, L * 0.72, -w1 / 2, L);
  p.arc(0, L, w1 / 2, Math.PI, 0, true);
  p.bezierCurveTo(w1 / 2 + front * 0.4, L * 0.7, w0 / 2 + front, L * 0.3, w0 / 2, 0);
  p.arc(0, 0, w0 / 2, 0, Math.PI, true);
  p.closePath();
  return p;
}

export interface Look {
  /** 'A' peint encré (héros), 'B' ombres à contre-jour (ennemis). */
  style: 'A' | 'B';
  rim: string;
  sig: string;
}

export interface PaintOpts {
  /** Ombre propre : décalage (unités). */
  d?: number;
  dark?: string;
  hi?: string;
  shade?: boolean;
  light?: boolean;
  /** Liseré de contre-jour (largeur, unités). 0 = aucun. */
  rimW?: number;
  rimA?: number;
  /** Modelé en dégradé : direction du volume ('x' = cylindre vertical, 'y' = horizontal, 'r' = sphère). */
  vol?: 'x' | 'y' | 'r' | null;
  /** Touches de pinceau (densité 0..1). */
  brush?: number;
  ink?: boolean;
  lw?: number;
  /** Dessin intérieur supplémentaire, clippé dans la forme. */
  after?: (g: CanvasRenderingContext2D) => void;
  seed?: number;
  /** Boîte du volume [x0, y0, x1, y1] (unités) pour le modelé. */
  box?: number[];
}

const BIG = (() => { try { const b = new Path2D(); b.rect(-5000, -5000, 10000, 10000); return b; } catch { return null; } })();

/**
 * Remplit une forme dans le style du combattant.
 * La lumière du jeu vient du haut-gauche ; le contre-jour est à droite (couleur `rim`).
 */
export function paint(g: CanvasRenderingContext2D, path: Path2D | Pt[], col: string, L: Look, o: PaintOpts = {}): Path2D {
  if (Array.isArray(path)) path = pathOf(path, true);
  const B = L.style === 'B';
  const base = B ? mix(col, '#06070c', 0.6) : col;
  g.save();
  g.fillStyle = base; g.fill(path);
  g.clip(path);
  const big = new Path2D(); if (BIG) big.addPath(BIG); else big.rect(-5000, -5000, 10000, 10000); big.addPath(path);
  const d = o.d ?? 3;
  // Modelé doux : le volume tourne, plus sombre sur les bords et vers le bas-droite.
  if (o.vol !== null) {
    const bb = boundsOf(g, o.box);
    const vol = o.vol ?? 'x';
    let gr;
    if (vol === 'r') {
      gr = g.createRadialGradient(bb.cx - bb.w * 0.18, bb.cy - bb.h * 0.2, 0, bb.cx, bb.cy, Math.max(bb.w, bb.h) * 0.62);
    } else if (vol === 'x') {
      gr = g.createLinearGradient(bb.x0, 0, bb.x1, 0);
    } else {
      gr = g.createLinearGradient(0, bb.y0, 0, bb.y1);
    }
    if (B) {
      gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)');
    } else if (vol === 'r') {
      gr.addColorStop(0, 'rgba(255,244,228,0.22)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, rgba(SHADE, 0.5));
    } else {
      gr.addColorStop(0, rgba(SHADE, 0.22)); gr.addColorStop(0.28, 'rgba(255,244,228,0.16)'); gr.addColorStop(0.62, 'rgba(0,0,0,0)'); gr.addColorStop(1, rgba(SHADE, 0.45));
    }
    g.fillStyle = gr; g.fillRect(-5000, -5000, 10000, 10000);
  }
  // Ombre propre (aplat, bas-droite) et reflet (haut-gauche).
  if (!B && o.shade !== false) { g.save(); g.translate(-d * 0.7, -d); g.fillStyle = o.dark ?? rgba(mix(col, SHADE, 0.55), 0.78); g.fill(big, 'evenodd'); g.restore(); }
  if (B) { g.save(); g.translate(d * 0.6, -d * 0.4); g.fillStyle = 'rgba(0,0,0,0.38)'; g.fill(big, 'evenodd'); g.restore(); }
  if (!B && o.light !== false) { g.save(); g.translate(d * 0.45, d * 0.5); g.globalAlpha = 0.5; g.fillStyle = o.hi ?? mix(col, '#fff4e4', 0.3); g.fill(big, 'evenodd'); g.restore(); }
  // Touches de pinceau : petites virgules claires et sombres qui cassent l'aplat numérique.
  const br = o.brush ?? (B ? 0.4 : 0.7);
  if (br > 0) brushStrokes(g, path, col, B, br, o.seed ?? 1);
  if (o.after) o.after(g);
  // Contre-jour : bande nette sur le bord droit (piste B : plus franche et colorée).
  const rw = o.rimW ?? (B ? 1.2 : 0.9);
  if (rw > 0) {
    g.save(); g.translate(-rw, rw * 0.35);
    g.globalAlpha = o.rimA ?? (B ? 0.95 : 0.75);
    g.fillStyle = L.rim; g.fill(big, 'evenodd');
    g.restore();
    if (B) { g.save(); g.translate(-rw * 2.4, rw * 0.9); g.globalAlpha = 0.28; g.fillStyle = L.sig; g.fill(big, 'evenodd'); g.restore(); }
  }
  g.restore();
  if (o.ink !== false) {
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
    g.lineWidth = o.lw ?? (B ? 0.7 : 1.05);
    g.strokeStyle = B ? 'rgba(0,0,0,0.85)' : INK;
    g.stroke(path); g.restore();
  }
  return path;
}

/** Boîte du volume : `o.box` [x0, y0, x1, y1] en unités, sinon tout le canevas de la pièce. */
function boundsOf(g: CanvasRenderingContext2D, box?: number[]) {
  let x0, y0, x1, y1;
  if (box) [x0, y0, x1, y1] = box;
  else {
    const inv = g.getTransform().inverse(), W = g.canvas.width, H = g.canvas.height;
    x0 = inv.e; y0 = inv.f; x1 = inv.a * W + inv.e; y1 = inv.d * H + inv.f;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

function brushStrokes(g, path, col, B, k, seed) {
  const t = g.getTransform(); const s = Math.hypot(t.a, t.b) || 1;
  g.save(); g.lineCap = 'round';
  const W = g.canvas.width / s, H = g.canvas.height / s;
  const inv = t.inverse();
  // centre du canevas en unités
  const cx = inv.a * g.canvas.width / 2 + inv.c * g.canvas.height / 2 + inv.e;
  const cy = inv.b * g.canvas.width / 2 + inv.d * g.canvas.height / 2 + inv.f;
  const n = Math.floor(W * H * 0.05 * k);
  for (let i = 0; i < n; i++) {
    const x = cx + (rnd(seed * 31 + i * 3.1) - 0.5) * W, y = cy + (rnd(seed * 17 + i * 5.3) - 0.5) * H;
    const light = rnd(seed + i * 7.7) > 0.55;
    g.strokeStyle = light ? (B ? 'rgba(255,255,255,0.05)' : 'rgba(255,240,220,0.09)') : (B ? 'rgba(0,0,0,0.16)' : rgba(mix(col, SHADE, 0.6), 0.14));
    g.lineWidth = 0.6 + rnd(i * 9.1 + seed) * 1.3;
    const a = -0.9 + rnd(i * 2.7) * 0.6, L = 1.2 + rnd(i * 4.1) * 2.6;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * L * 0.5 + 0.4, y + Math.sin(a) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
  }
  g.restore();
}

/** Trait d'encre intérieur (couture, pli, détail). */
export function line(g: CanvasRenderingContext2D, pts: Pt[], w = 0.6, col = 'rgba(10,8,14,0.6)', closed = false): void {
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = w; g.strokeStyle = col;
  g.stroke(pathOf(pts, closed)); g.restore();
}

/** Lueur : point lumineux (gemme, œil d'ennemi, rune). */
export function glowDot(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, a = 1): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba('#ffffff', a)); gr.addColorStop(0.25, rgba(col, a * 0.9)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

/** Trait lumineux (tranchant, rune) avec halo serré. */
export function glowLine(g: CanvasRenderingContext2D, pts: Pt[], w: number, col: string, blur = 2.5): void {
  const t = g.getTransform(); const s = Math.hypot(t.a, t.b) || 1;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = col; g.shadowBlur = blur * s;
  g.strokeStyle = col; g.lineWidth = w; g.stroke(pathOf(pts, false));
  g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = w * 0.4; g.stroke(pathOf(pts, false));
  g.restore();
}

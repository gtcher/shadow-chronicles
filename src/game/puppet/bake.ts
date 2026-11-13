/**
 * Cuisson des pièces d'un pantin : chaque pièce est peinte une fois, à haute résolution, puis rangée
 * dans un atlas couleur et un atlas jumeau de normales (même découpe). Sans Pixi ni DOM obligatoire :
 * tourne dans le worker (OffscreenCanvas) comme sur le fil principal.
 *
 * Normal map (convention OpenGL, tangent-space) : R = +x (droite), G = +y (haut), B = vers la caméra,
 * alpha = couverture. Le relief vient d'un biseau calculé depuis la silhouette (distance au bord) et des
 * détails peints (plis, coutures, traits d'encre en creux).
 */
import type { Def } from './bones';
import type { Look } from './kit';
import type { PartDef, Parts } from './parts';
import { painterFor } from './cast';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface PuppetBakeInput {
  key: string;
  def: Def;
  style: 'A' | 'B';
  /** Pixels de texture par unité de squelette. */
  ppu: number;
  /** Cuire aussi les normales (éclairage avec relief). */
  normals?: boolean;
}

export interface PartCell { x: number; y: number; w: number; h: number; /** Ancre (pivot) en fraction de la cellule. */ ax: number; ay: number }
export interface PuppetMeta { ppu: number; width: number; height: number; parts: Record<string, PartCell> }

const PAD = 2;
const MAX_ATLAS = 4096;

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}

export function canPaint(key: string): boolean { return !!painterFor(key); }

/** Pièces d'un combattant (pour les labos et les tests). */
export function partsOf(input: PuppetBakeInput): Parts | null {
  const painter = painterFor(input.key);
  if (!painter) return null;
  const L: Look = { style: input.style, rim: String(input.def.rim ?? '#ffffff'), sig: String(input.def.sig ?? '#ffffff') };
  return painter(input.def, L);
}

/** Marge autour de chaque pièce (unités) : place du contour. */
export const OUTLINE_U = 1.6;

function paintPart(p: PartDef, ppu: number): { cv: AnyCanvas; w: number; h: number; ax: number; ay: number } {
  const m = OUTLINE_U + 0.4;
  const x0 = p.box[0] - m, y0 = p.box[1] - m, x1 = p.box[2] + m, y1 = p.box[3] + m;
  const w = Math.max(1, Math.ceil((x1 - x0) * ppu)), h = Math.max(1, Math.ceil((y1 - y0) * ppu));
  const cv = makeCanvas(w, h);
  const g = cv.getContext('2d') as Ctx;
  g.setTransform(ppu, 0, 0, ppu, -x0 * ppu, -y0 * ppu);
  g.lineJoin = 'round'; g.lineCap = 'round';
  p.draw(g as CanvasRenderingContext2D);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return { cv, w, h, ax: -x0 / (x1 - x0), ay: -y0 / (y1 - y0) };
}

/** Distance (chanfrein 3-4, en tiers de pixel) aux pixels où `seed` est vrai. */
function chamfer(W: number, H: number, seed: (i: number) => boolean): Float32Array {
  const d = new Float32Array(W * H);
  const BIG = 1e6;
  for (let i = 0; i < W * H; i++) d[i] = seed(i) ? 0 : BIG;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!d[i]) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 3);
    if (y > 0) { v = Math.min(v, d[i - W] + 3); if (x > 0) v = Math.min(v, d[i - W - 1] + 4); if (x < W - 1) v = Math.min(v, d[i - W + 1] + 4); }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; if (!d[i]) continue;
    let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + 3);
    if (y < H - 1) { v = Math.min(v, d[i + W] + 3); if (x < W - 1) v = Math.min(v, d[i + W + 1] + 4); if (x > 0) v = Math.min(v, d[i + W - 1] + 4); }
    d[i] = v;
  }
  return d;
}

/**
 * Contour d'une pièce : silhouette élargie, blanche (teintée à l'exécution : liseré de contre-jour,
 * flash blanc du coup reçu). Dessinée sous toutes les pièces, elle redonne au pantin une silhouette
 * d'un seul tenant, lisible sur le sol sombre.
 */
export function outlineMask(src: ImageData, rPx: number): ImageData {
  const { width: W, height: H, data: s } = src;
  const d = chamfer(W, H, (i) => s[i * 4 + 3] > 96);
  const out = new ImageData(W, H), o = out.data;
  for (let i = 0; i < W * H; i++) {
    const t = d[i] / 3 / rPx;
    const a = t <= 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45);
    o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = 255;
    o[i * 4 + 3] = Math.round(Math.max(a * 255, s[i * 4 + 3]));
  }
  return out;
}

/** Normal map d'une pièce peinte (même taille). */
export function normalMap(src: ImageData, bevelPx: number): ImageData {
  const { width: W, height: H, data: s } = src;
  const N = W * H;
  // Distance au bord, en tiers de pixel.
  const d = chamfer(W, H, (i) => s[i * 4 + 3] <= 24);
  // Hauteur : biseau arrondi + détail peint (le sombre creuse : traits d'encre, plis).
  const h = new Float32Array(N);
  const bv = Math.max(1, bevelPx);
  for (let i = 0; i < N; i++) {
    if (!d[i]) { h[i] = 0; continue; }
    const t = Math.min(1, d[i] / 3 / bv);
    const lum = (0.3 * s[i * 4] + 0.59 * s[i * 4 + 1] + 0.11 * s[i * 4 + 2]) / 255;
    h[i] = Math.sqrt(1 - (1 - t) * (1 - t)) * bv * 0.9 + lum * 1.6;
  }
  // Lissage (deux flous boîte 3×3) : efface les marches du chanfrein.
  for (let pass = 0; pass < 2; pass++) {
    const t = new Float32Array(h);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (!d[i]) continue;
      t[i] = (h[i - W - 1] + h[i - W] + h[i - W + 1] + h[i - 1] + h[i] + h[i + 1] + h[i + W - 1] + h[i + W] + h[i + W + 1]) / 9;
    }
    h.set(t);
  }
  const out = new ImageData(W, H);
  const o = out.data;
  const at = (x: number, y: number) => h[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, a = s[i * 4 + 3];
    if (!a) continue;
    const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5, dy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
    // y image vers le bas → G (haut) = +dh/dy image.
    let nx = -dx, ny = dy, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    o[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
    o[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    o[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    o[i * 4 + 3] = a;
  }
  return out;
}

/** Cuisson complète : atlas couleur (+ normales) et découpe. */
export function bakePuppet(input: PuppetBakeInput): { color: AnyCanvas; normal: AnyCanvas | null; meta: PuppetMeta } | null {
  const parts = partsOf(input);
  if (!parts) return null;
  const ppu = input.ppu;
  const painted: Array<{ id: string; p: PartDef; cv: AnyCanvas; w: number; h: number; ax: number; ay: number; img?: ImageData }> = [];
  for (const [id, p] of Object.entries(parts)) {
    const r = paintPart(p, ppu);
    painted.push({ id, p, ...r });
    // Contour (silhouette élargie) : même cellule, même ancre.
    const src = (r.cv.getContext('2d') as Ctx).getImageData(0, 0, r.w, r.h);
    const oc = makeCanvas(r.w, r.h);
    (oc.getContext('2d') as Ctx).putImageData(outlineMask(src, OUTLINE_U * ppu), 0, 0);
    painted.push({ id: id + '~o', p, cv: oc, w: r.w, h: r.h, ax: r.ax, ay: r.ay });
  }
  // Rangement en étagères.
  const area = painted.reduce((a, r) => a + (r.w + PAD) * (r.h + PAD), 0);
  const maxW = Math.max(...painted.map((r) => r.w + PAD));
  const shelfW = Math.min(MAX_ATLAS, Math.max(maxW, Math.ceil(Math.sqrt(area) * 1.1)));
  const sorted = [...painted].sort((a, b) => b.h - a.h);
  let cx = 0, cy = 0, rowH = 0, usedW = 0;
  const pos = new Map<string, [number, number]>();
  for (const r of sorted) {
    if (cx + r.w + PAD > shelfW) { cx = 0; cy += rowH; rowH = 0; }
    pos.set(r.id, [cx + 1, cy + 1]);
    cx += r.w + PAD; rowH = Math.max(rowH, r.h + PAD); usedW = Math.max(usedW, cx);
  }
  const W = usedW, H = Math.min(MAX_ATLAS, cy + rowH);
  const color = makeCanvas(W, H), cg = color.getContext('2d') as Ctx;
  const normal = input.normals ? makeCanvas(W, H) : null;
  const ng = normal ? (normal.getContext('2d') as Ctx) : null;
  const meta: PuppetMeta = { ppu, width: W, height: H, parts: {} };
  for (const r of painted) {
    const [x, y] = pos.get(r.id)!;
    cg.drawImage(r.cv as CanvasImageSource, x, y);
    if (ng && !r.id.endsWith('~o')) {
      const src = (r.cv.getContext('2d') as Ctx).getImageData(0, 0, r.w, r.h);
      ng.putImageData(normalMap(src, (r.p.bevel ?? 3) * ppu), x, y);
    }
    meta.parts[r.id] = { x, y, w: r.w, h: r.h, ax: r.ax, ay: r.ay };
    r.cv.width = r.cv.height = 1;
  }
  return { color, normal, meta };
}

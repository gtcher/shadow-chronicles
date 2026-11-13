import { ANIM_LEN, RIG, renderSprite } from './draw';

/**
 * Cuisson d'un combattant en atlas, sans Pixi ni DOM obligatoire : ce module tourne aussi bien
 * dans le worker de cuisson (OffscreenCanvas) que sur le fil principal (repli).
 *
 * - Plus d'images qu'avant (50 au lieu de 36) : idle et course passent de 8 à 12 images.
 * - Chaque image est rognée au plus juste puis rangée en étagères (Pixi recompose l'image complète
 *   grâce à `trim`/`orig`) : bien moins de mémoire, donc des feuilles plus nettes pour le même coût.
 * - Les animations en boucle sont cuites avec RIG.loop : la cape et les lueurs rebouclent sans saut.
 */
export type RigAnim = 'idle' | 'course' | 'attaque' | 'touche' | 'mort';
export const RIG_ANIMS: RigAnim[] = ['idle', 'course', 'attaque', 'touche', 'mort'];
export const RIG_LEN = ANIM_LEN as Record<RigAnim, number>;
/** Nombre d'images cuites par animation. */
export const BAKE_FRAMES: Record<RigAnim, number> = { idle: 12, course: 12, attaque: 10, touche: 4, mort: 12 };
const LOOPS = new Set<RigAnim>(['idle', 'course']);
/**
 * Armes de tir (arc) : angles de visée cuits en plus de l'horizontale (radians, négatif = haut).
 * Seules idle, course et attaque tournent ; elles sont cuites avec moins d'images par angle.
 */
export const AIM_ANGLES = [-1.15, -0.6, 0.6, 1.15];
export const AIM_ANIMS: RigAnim[] = ['idle', 'course', 'attaque'];
const AIM_FRAMES: Partial<Record<RigAnim, number>> = { idle: 6, course: 8, attaque: 10 };
export const aimsFor = (def: Record<string, unknown>): number[] => (def.weapon === 'bow' ? AIM_ANGLES : []);

/** Hauteur nominale d'un combattant du squelette, en unités, avant son `scale`. */
const NOMINAL = { h: 96, w: 48 } as const;
/** Largeur maximale d'une image avant rognage (px) : borne la mémoire des boss. */
const MAX_FRAME_W = 480;
/** Côté maximal d'un atlas (sûr sur tous les GPU mobiles). */
const MAX_ATLAS = 4096;
const PAD = 2;

/** Image rognée : position (x, y, w, h) dans l'atlas, décalage (tx, ty) dans l'image complète. */
export interface AtlasCell { anim: RigAnim; /** Indice dans AIM_ANGLES, -1 = horizontale. */ aim: number; x: number; y: number; w: number; h: number; tx: number; ty: number }
export interface AtlasMeta {
  /** Taille d'une image complète, avant rognage (px). */
  fw: number;
  fh: number;
  /** Ancre (pieds) en fraction de l'image complète. */
  anchorX: number;
  anchorY: number;
  /** Échelle d'affichage (la feuille est suréchantillonnée). */
  scale: number;
  cells: AtlasCell[];
  /** Angles de visée cuits (vide pour les armes sans visée). */
  aims: number[];
  width: number;
  height: number;
}

export interface BakeInput {
  def: Record<string, unknown>;
  heightPx: number;
  style: 'A' | 'B';
  /** Suréchantillonnage (netteté sous zoom / écrans haute densité). */
  res: number;
  /**
   * Pantin peint (src/game/puppet) au lieu de la feuille d'images : clé du peintre (CAST), pixels de
   * texture par unité, et cuisson des normal maps pour l'éclairage en relief.
   */
  puppet?: { key: string; ppu: number; normals: boolean };
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

/**
 * Cuisson pas à pas : chaque `next()` dessine une image (≈ 5–10 ms), ce qui permet au fil principal
 * de répartir le travail sur plusieurs frames. Le worker l'exécute d'une traite.
 */
export function* bakeAtlasSteps(input: BakeInput): Generator<void, { canvas: AnyCanvas; meta: AtlasMeta }> {
  const { def, heightPx, style, res } = input;
  const scale = (def.scale as number) ?? 1;
  const nominal = def.kind === 'w' ? NOMINAL.w : NOMINAL.h;
  const ppu = heightPx / (nominal * scale);
  let s = ppu * res;
  if (240 * s * scale > MAX_FRAME_W) s = MAX_FRAME_W / (240 * scale);

  const aims = aimsFor(def);
  // Passes : la série horizontale complète, puis une série réduite par angle de visée.
  const passes: Array<{ anim: RigAnim; aim: number; n: number }> = RIG_ANIMS.map((anim) => ({ anim, aim: -1, n: BAKE_FRAMES[anim] }));
  aims.forEach((_, ai) => { for (const anim of AIM_ANIMS) passes.push({ anim, aim: ai, n: AIM_FRAMES[anim]! }); });
  const total = passes.reduce((n, a) => n + a.n, 0);
  const COLS = 8;
  let stage: AnyCanvas | null = null, sg: Ctx | null = null;
  let fw = 0, fh = 0, ox = 0, oy = 0, i = 0;
  // Boîte des pixels visibles de chaque image.
  const bounds: Array<[number, number, number, number] | null> = [];
  const order: Array<{ anim: RigAnim; aim: number }> = [];
  try {
    for (const { anim, aim, n } of passes) {
      const len = RIG_LEN[anim];
      RIG.aim = aim < 0 ? 0 : aims[aim];
      for (let k = 0; k < n; k++) {
        // La mort s'arrête juste avant la disparition complète pour garder une dernière braise.
        // Mort : commence juste après le flash blanc (l'éclat de mort est déjà fait par les effets).
        // Touché : seule la 1re image porte le flash blanc (p < 0,34), les suivantes montrent le recul.
        const p = anim === 'mort' ? 0.09 + (k / (n - 1)) * 0.77 : anim === 'touche' ? (k === 0 ? 0 : 0.36 + ((k - 1) / (n - 1)) * 0.64) : k / n;
        RIG.now = (p * len + 0.37) * 1000;
        RIG.loop = LOOPS.has(anim) ? len * 1000 : 0;
        RIG.phase = p;
        const spr = renderSprite('rig', def, anim, p, style, s, 1) as { cv: AnyCanvas; W: number; H: number; ox: number; oy: number };
        if (!stage) {
          fw = spr.W; fh = spr.H; ox = spr.ox; oy = spr.oy;
          stage = makeCanvas(fw * COLS, fh * Math.ceil(total / COLS));
          sg = stage.getContext('2d') as Ctx;
        }
        const sx = (i % COLS) * fw, sy = Math.floor(i / COLS) * fh;
        sg!.drawImage(spr.cv as CanvasImageSource, 0, 0, fw, fh, sx, sy, fw, fh);
        bounds.push(alphaBounds((spr.cv.getContext('2d') as Ctx), fw, fh));
        order.push({ anim, aim });
        i++;
        yield;
      }
    }
  } finally {
    RIG.loop = 0; RIG.phase = 0; RIG.aim = 0;
  }
  // Rognage image par image puis rangement en étagères : chaque image ne garde que ses pixels
  // utiles (les traînées d'attaque n'élargissent plus les images d'idle).
  const rects = bounds.map((b, j) => {
    const r = b ?? [0, 0, 0, 0];
    const bx = Math.max(0, r[0] - PAD), by = Math.max(0, r[1] - PAD);
    const bw = b ? Math.min(fw - 1, r[2] + PAD) - bx + 1 : 1, bh = b ? Math.min(fh - 1, r[3] + PAD) - by + 1 : 1;
    return { j, bx, by, bw, bh, x: 0, y: 0 };
  });
  const area = rects.reduce((a, r) => a + r.bw * r.bh, 0);
  const maxW = Math.max(...rects.map((r) => r.bw));
  const shelfW = Math.min(MAX_ATLAS, Math.max(maxW, Math.ceil(Math.sqrt(area) * 1.08)));
  const sorted = [...rects].sort((a, b) => b.bh - a.bh);
  let cx = 0, cy = 0, rowH = 0, usedW = 0;
  for (const r of sorted) {
    if (cx + r.bw > shelfW) { cx = 0; cy += rowH; rowH = 0; }
    r.x = cx; r.y = cy;
    cx += r.bw; rowH = Math.max(rowH, r.bh); usedW = Math.max(usedW, cx);
  }
  const out = makeCanvas(usedW, Math.min(MAX_ATLAS, cy + rowH));
  const og = out.getContext('2d') as Ctx;
  const cells: AtlasCell[] = [];
  for (const r of rects) {
    const sx = (r.j % COLS) * fw + r.bx, sy = Math.floor(r.j / COLS) * fh + r.by;
    og.drawImage(stage as CanvasImageSource, sx, sy, r.bw, r.bh, r.x, r.y, r.bw, r.bh);
    cells.push({ anim: order[r.j].anim, aim: order[r.j].aim, x: r.x, y: r.y, w: r.bw, h: r.bh, tx: r.bx, ty: r.by });
  }
  // Libère la mémoire de la planche intermédiaire.
  stage!.width = stage!.height = 1;
  const meta: AtlasMeta = {
    fw, fh, anchorX: ox / fw, anchorY: oy / fh,
    scale: ppu / s, cells, aims, width: out.width, height: out.height,
  };
  return { canvas: out, meta };
}

/** Cuisson d'une traite. */
export function bakeAtlas(input: BakeInput): { canvas: AnyCanvas; meta: AtlasMeta } {
  const it = bakeAtlasSteps(input);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/** Boîte [x0, y0, x1, y1] des pixels visibles (alpha > 2), ou null si l'image est vide. */
function alphaBounds(g: Ctx, w: number, h: number): [number, number, number, number] | null {
  const d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    let first = -1, last = -1;
    for (let x = 0; x < w; x++) if (d[row + x * 4 + 3] > 2) { first = x; break; }
    if (first < 0) continue;
    for (let x = w - 1; x >= first; x--) if (d[row + x * 4 + 3] > 2) { last = x; break; }
    if (y < y0) y0 = y;
    y1 = y;
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

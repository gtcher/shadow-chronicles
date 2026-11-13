import { Container, Graphics, Matrix, Rectangle, Sprite, Texture, type TextureSource } from 'pixi.js';
import { solveHumanoid, mul, type Def, type M } from './bones';
import { poseOf, type PuppetAnim } from './pose';
import type { PuppetMeta } from './bake';
import { mix } from './kit';

/**
 * Pantin peint (rendu Pixi) : un Sprite par pièce, placé à chaque image par le squelette (bones.ts).
 * Les membres tournent librement : l'animation est continue (plus d'images cuites), l'arc suit
 * la visée à n'importe quel angle, le bâton reste orienté dans le monde.
 *
 * Deux couches : contours (silhouette élargie, teintée) dessinés sous toutes les pièces couleur, ce qui
 * garde une silhouette d'un seul tenant ; puis les pièces. Le contour devient blanc pour le flash d'impact.
 */
export interface PuppetSheet {
  key: string;
  def: Def;
  meta: PuppetMeta;
  color: TextureSource;
  normal: TextureSource | null;
  tex: Record<string, Texture>;
  ntex: Record<string, Texture>;
  /** Pixels du monde par unité de squelette. */
  scale: number;
  bytes: number;
}

export function makePuppetSheet(key: string, def: Def, meta: PuppetMeta, color: TextureSource, normal: TextureSource | null, heightPx: number): PuppetSheet {
  const tex: Record<string, Texture> = {}, ntex: Record<string, Texture> = {};
  for (const [id, c] of Object.entries(meta.parts)) {
    tex[id] = new Texture({ source: color, frame: new Rectangle(c.x, c.y, c.w, c.h) });
    if (normal && !id.endsWith('~o')) ntex[id] = new Texture({ source: normal, frame: new Rectangle(c.x, c.y, c.w, c.h) });
  }
  return { key, def, meta, color, normal, tex, ntex, scale: heightPx / 96, bytes: meta.width * meta.height * 4 * (normal ? 2 : 1) };
}

const OUTLINE_ALPHA = 0.92;
const hexNum = (h: string) => parseInt(h.replace('#', ''), 16);

/** Fabrique d'une pièce de normales (fournie par l'éclairage) : même transform que la pièce couleur. */
export type NormalPieceFactory = (tex: Texture) => Container;

export class Puppet extends Container {
  readonly sheet: PuppetSheet;
  private readonly back = new Container();
  private readonly front = new Container();
  private readonly fx = new Graphics();
  private readonly outl: Sprite[] = [];
  private readonly parts: Sprite[] = [];
  private readonly outlineTint: number;
  private readonly outlineAlpha: number;
  /** Couche de normales (monde) et ses pièces, si l'éclairage en relief est branché. */
  private normals: Container | null = null;
  private readonly npieces: Container[] = [];
  private nfactory: NormalPieceFactory | null = null;
  private flashOn = false;
  anim: PuppetAnim = 'idle';

  constructor(sheet: PuppetSheet) {
    super();
    this.sheet = sheet;
    this.label = 'body';
    const d = sheet.def;
    // Héros : contour lumineux dans leur couleur de contre-jour (on les repère dans la mêlée) ;
    // ennemis (piste B) : contour sombre teinté de leur lueur.
    this.outlineTint = hexNum(d.group === 'h' ? mix(String(d.rim ?? '#ffffff'), '#0b0a12', 0.15) : mix(String(d.rim ?? '#000000'), '#06070c', 0.82));
    this.outlineAlpha = d.group === 'h' ? 0.7 : OUTLINE_ALPHA;
    this.addChild(this.back, this.front, this.fx);
    this.set('idle', 0);
  }

  /** Branche la couche de normales de l'éclairage (pièces dessinées dans `layer`, en espace monde). */
  attachNormals(layer: Container, factory: NormalPieceFactory): void {
    if (!this.sheet.normal) return;
    this.normals = new Container();
    this.nfactory = factory;
    layer.addChild(this.normals);
  }

  /** Met le pantin dans la pose `anim` à la phase p ∈ [0, 1]. `aim` : visée relative au regard (arc). */
  set(anim: PuppetAnim, p: number, aim = 0, now = performance.now() / 1000): void {
    this.anim = anim;
    const s = this.sheet, c = s.def;
    const P = poseOf(c, anim, p, aim, now);
    const placed = solveHumanoid(c, P, now);
    const k = 1 / s.meta.ppu;
    const flash = (P.flash ?? 0) > 0;
    const fade = (P.alpha ?? 1) * (1 - (P.dis ?? 0) * 0.9);
    let n = 0;
    const g = this.fx; g.clear();
    for (const it of placed) {
      const t = s.tex[it.id];
      if (!t) continue;
      const m = mul(it.m, [k, 0, 0, k, 0, 0]);
      const cell = s.meta.parts[it.id];
      const o = this.sprite(this.outl, this.back, n, s.tex[it.id + '~o']);
      const sp = this.sprite(this.parts, this.front, n, t);
      for (const q of [o, sp]) { q.anchor.set(cell.ax, cell.ay); place(q, m); q.visible = true; }
      o.tint = flash ? 0xffffff : this.outlineTint;
      o.alpha = flash ? 1 : this.outlineAlpha;
      sp.tint = it.tint ?? 0xffffff;
      sp.alpha = flash ? 0.3 : 1;
      if (this.normals && this.nfactory) {
        let np = this.npieces[n];
        const nt = s.ntex[it.id];
        if (!np && nt) { np = this.nfactory(nt); this.npieces[n] = np; this.normals.addChild(np); }
        if (np && nt) { (np as unknown as { texture: Texture }).texture = nt; place(np, m, cell); np.visible = true; }
      }
      if (it.id === 'weapon' && c.weapon === 'bow') this.bowString(g, it.m, P.drawPull ?? 0);
      n++;
    }
    for (let i = n; i < this.parts.length; i++) { this.parts[i].visible = false; this.outl[i].visible = false; }
    for (let i = n; i < this.npieces.length; i++) this.npieces[i].visible = false;
    this.front.alpha = this.back.alpha = fade;
    this.flashOn = flash;
  }

  /** Recopie la transformation monde du pantin sur sa couche de normales (appelé après le placement). */
  syncNormals(): void {
    if (!this.normals) return;
    const wt = this.worldTransform;
    this.normals.setFromMatrix(new Matrix(wt.a, wt.b, wt.c, wt.d, wt.tx, wt.ty));
    this.normals.visible = this.visible && (this.parent?.visible ?? true) && !this.flashOn;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.normals?.destroy({ children: true });
    this.normals = null;
    super.destroy(options);
  }

  private sprite(list: Sprite[], parent: Container, i: number, t: Texture): Sprite {
    let sp = list[i];
    if (!sp) { sp = new Sprite(t); list[i] = sp; parent.addChild(sp); }
    else if (sp.texture !== t) sp.texture = t;
    return sp;
  }

  /** Corde de l'arc et flèche encochée, tracées en direct dans le repère de l'arc. */
  private bowString(g: Graphics, m: M, pull: number): void {
    const tip = 29.6, ty = -4.6, ny = 2 + pull * 20;
    const p = (x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    const a = p(-tip, ty), b = p(0, ny), c = p(tip, ty);
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).lineTo(c[0], c[1]).stroke({ width: 0.6, color: 0xf0ecdc, alpha: 0.9 });
    if (pull > 0.05) {
      const e = p(0, -17), h0 = p(-2.2, -15), h1 = p(0, -21), h2 = p(2.2, -15);
      g.moveTo(b[0], b[1]).lineTo(e[0], e[1]).stroke({ width: 1, color: 0xe8dcc0 });
      g.poly([h0[0], h0[1], h1[0], h1[1], h2[0], h2[1]]).fill({ color: 0xdffbff });
    }
  }
}

/** Place un objet Pixi selon une matrice 2D (avec décomposition rotation / échelle / biais). */
const TMP = new Matrix();
function place(o: Container, m: M, cell?: { ax: number; ay: number; w: number; h: number }): void {
  // Pièce de normales (Mesh sans ancre) : l'ancre est appliquée dans la matrice.
  const t: M = cell ? mul(m, [1, 0, 0, 1, -cell.ax * cell.w, -cell.ay * cell.h]) : m;
  TMP.set(t[0], t[1], t[2], t[3], t[4], t[5]);
  o.setFromMatrix(TMP);
}

import { Container, Graphics, Matrix, Rectangle, Sprite, Texture, type TextureSource } from 'pixi.js';
import { solvePuppet, poseAnimFor, mul, type Def, type M } from './bones';
import { poseOf, type PuppetAnim } from './pose';
import type { PuppetMeta } from './bake';
import { outlineOf } from './kit';

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
  return { key, def, meta, color, normal, tex, ntex, scale: heightPx / (def.kind === 'w' ? 48 : 96), bytes: meta.width * meta.height * 4 * (normal ? 2 : 1) };
}

const hexNum = (h: string) => parseInt(h.replace('#', ''), 16);

/** Fabrique d'une pièce de normales (fournie par l'éclairage) : même transform que la pièce couleur. */
export type NormalPieceFactory = (tex: Texture, anchorX: number, anchorY: number) => Container & { normalAlpha: number };

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
  private readonly npieces = new Map<string, Container & { normalAlpha: number }>();
  /** Silhouette au repos pour les ombres portées (hors scène, lue par CastShadows). */
  private shadowSprite: Sprite | null = null;
  private nfactory: NormalPieceFactory | null = null;
  private flashOn = false;
  private readonly seen = new Set<string>();
  anim: PuppetAnim = 'idle';
  /** Flash d'impact venu du jeu (0..1) : la silhouette blanche transparaît à travers les pièces. */
  hit = 0;

  constructor(sheet: PuppetSheet) {
    super();
    this.sheet = sheet;
    this.label = 'body';
    const d = sheet.def;
    // Héros : contour lumineux dans leur couleur de contre-jour (on les repère dans la mêlée) ;
    // ennemis (piste B) : contour sombre teinté de leur lueur.
    const ol = outlineOf(d);
    this.outlineTint = hexNum(ol.color);
    this.outlineAlpha = ol.alpha;
    this.fx.blendMode = 'add';
    this.addChild(this.back, this.front, this.fx);
    this.set('idle', 0);
  }

  /** Branche la couche de normales de l'éclairage (pièces dessinées dans `layer`, en espace monde). */
  attachNormals(layer: Container, factory: NormalPieceFactory): boolean {
    if (!this.sheet.normal) return false;
    this.normals = new Container({ label: 'puppet-normals' });
    this.normals.sortableChildren = true;
    this.nfactory = factory;
    layer.addChild(this.normals);
    return true;
  }

  /** Met le pantin dans la pose `anim` à la phase p ∈ [0, 1]. `aim` : visée relative au regard (arc). */
  set(anim: PuppetAnim, p: number, aim = 0, now = performance.now() / 1000): void {
    this.anim = anim;
    const s = this.sheet, c = s.def;
    const P = poseOf(c, poseAnimFor(c, anim), p, aim, now);
    const placed = solvePuppet(c, P, anim, p, now);
    const k = 1 / s.meta.ppu;
    const flash = (P.flash ?? 0) > 0;
    const fl = flash ? 1 : Math.min(1, this.hit);
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
      o.tint = fl > 0.05 ? 0xffffff : this.outlineTint;
      o.alpha = this.outlineAlpha + (1 - this.outlineAlpha) * fl;
      sp.tint = it.tint ?? 0xffffff;
      sp.alpha = 1 - 0.7 * fl;
      if (this.normals && this.nfactory) {
        // Une pièce de normales par id (sa géométrie est fixée à la création) ; zIndex = ordre de dessin.
        let np = this.npieces.get(it.id);
        const nt = s.ntex[it.id];
        if (!np && nt) { np = this.nfactory(nt, cell.ax, cell.ay); this.npieces.set(it.id, np); this.normals.addChild(np); }
        if (np) { place(np, m); np.visible = true; np.zIndex = n; np.normalAlpha = fade; this.seen.add(it.id); }
      }
      if (it.id === 'weapon' && c.weapon === 'bow') this.bowString(g, it.m, P.drawPull ?? 0);
      if (it.id === 'weapon' && (c.weapon === 'staff' || c.weapon === 'orb') && (P.charge ?? 0) > 0.02) {
        // Charge du sort : la gemme s'embrase (sommet du bâton, ou orbe dans la main).
        const [x, y] = c.weapon === 'staff' ? [it.m[0] * 43 + it.m[4], it.m[1] * 43 + it.m[5]] : [it.m[4] + 2, it.m[5] + 6];
        const col = hexNum(String(c.group === 'h' ? c.sig : c.rim ?? '#ffffff'));
        g.circle(x, y, 3 + 7 * P.charge).fill({ color: col, alpha: 0.35 * P.charge });
        g.circle(x, y, 1.5 + 2.5 * P.charge).fill({ color: 0xffffff, alpha: 0.8 * P.charge });
      }
      n++;
    }
    drawFx(g, c, P, now);
    for (let i = n; i < this.parts.length; i++) { this.parts[i].visible = false; this.outl[i].visible = false; }
    if (this.npieces.size) { for (const [id, np] of this.npieces) if (!this.seen.has(id)) np.visible = false; this.seen.clear(); }
    this.front.alpha = this.back.alpha = fade;
    this.flashOn = flash;
  }

  /** Silhouette figée de la pose courante (traînée de l'esquive) : copies des contours, à teinter. */
  ghost(): Container {
    const g = new Container();
    for (const o of this.outl) {
      if (!o.visible) continue;
      const c = new Sprite(o.texture);
      c.anchor.copyFrom(o.anchor);
      c.setFromMatrix(o.localTransform);
      g.addChild(c);
    }
    return g;
  }

  /** Recopie la transformation monde du pantin sur sa couche de normales (appelé après le placement). */
  syncNormals(): void {
    if (!this.normals) return;
    // Le tampon de normales est dessiné en espace monde : transformation du nœud (dans la couche des
    // entités, sans décalage) composée avec celle du pantin, caméra exclue.
    const node = this.parent;
    this.updateLocalTransform();
    NM.copyFrom(this.localTransform);
    if (node) { node.updateLocalTransform(); NM.prepend(node.localTransform); }
    this.normals.setFromMatrix(NM);
    this.normals.visible = this.visible && this.alpha > 0.05 && (node?.visible ?? true) && !this.flashOn;
  }

  /** Silhouette (texture figée au repos) servant aux ombres portées ; échelle et opacité suivent le pantin. */
  setShadow(tex: Texture, ax: number, ay: number): void {
    this.shadowSprite ??= new Sprite();
    this.shadowSprite.texture = tex;
    this.shadowSprite.anchor.set(ax, ay);
  }

  get shadow(): Sprite | null {
    const s = this.shadowSprite;
    if (s) { s.scale.copyFrom(this.scale); s.alpha = this.alpha; s.visible = this.visible; }
    return s;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.normals?.destroy({ children: true });
    this.normals = null;
    this.npieces.clear();
    this.shadowSprite?.destroy();
    this.shadowSprite = null;
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
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const eo = (t: number) => 1 - Math.pow(1 - t, 3);
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/**
 * Effets liés à la pose (rig/draw.ts drawFx), tracés en direct en mode additif dans le repère du pantin :
 * traînée de l'arme, onde d'impact, anneau d'incantation, lucioles (Sena), braises de la mort.
 */
function drawFx(g: Graphics, c: Def, P: ReturnType<typeof poseOf>, now: number): void {
  const fx = (P as unknown as { fx?: Array<Record<string, number | string | boolean>> }).fx;
  if (!fx?.length) return;
  const col = hexNum(String(c.group === 'h' ? c.sig : c.rim ?? '#ffffff'));
  const T = c.torso, L = c.leg;
  const shoulder = (i: number): [number, number] => {
    const lean = P.lean + c.hunch, sx = i ? c.sw * 0.5 * 0.55 : -c.sw * 0.5 * 0.45, sy = -T + c.aw * 0.4;
    const ca = Math.cos(lean), sa = Math.sin(lean);
    return [P.x + sx * ca - sy * sa, -L + P.y + sx * sa + sy * ca];
  };
  for (const f of fx) {
    if (f.t === 'smear') {
      const [sx, sy] = shoulder(Number(f.arm));
      const w = c.weapon;
      const wl = w === 'greatsword' ? 56 : w === 'scythe' || w === 'halberd' ? 60 : w === 'fists' ? 6 : w === 'daggers' ? 18 : 36;
      const R = c.arm + wl * 0.85, a0 = Number(f.a0), a1 = Math.max(a0 + 0.1, Number(f.a1)), N = 16;
      const pts: number[] = [];
      for (let i = 0; i <= N; i++) { const a = a0 + (a1 - a0) * i / N; pts.push(sx + Math.sin(a) * R, sy + Math.cos(a) * R); }
      for (let i = N; i >= 0; i--) { const a = a0 + (a1 - a0) * i / N, r = R - (wl * 0.55 + 4) * (i / N); pts.push(sx + Math.sin(a) * r, sy + Math.cos(a) * r); }
      const al = clamp(Number(f.al), 0, 1);
      g.poly(pts).fill({ color: col, alpha: 0.45 * al });
      const edge: number[] = [];
      for (let i = 0; i <= N; i++) { const a = a0 + (a1 - a0) * i / N; edge.push(sx + Math.sin(a) * R, sy + Math.cos(a) * R); }
      g.poly(edge, false).stroke({ width: 1.6, color: 0xffffff, alpha: 0.7 * al });
    } else if (f.t === 'impact') {
      const d = Number(f.d), x = P.x + c.arm + 30, y = f.ground ? 0 : -c.leg - 10, e = eo(d);
      if (f.ground) g.ellipse(x, y, 10 + 50 * e, 3 + 12 * e); else g.circle(x, y, 6 + 24 * e);
      g.stroke({ width: 3 * (1 - d) + 0.5, color: col, alpha: 1 - d });
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI * 0.1 - rnd(i + 3) * Math.PI * 0.8, r = 8 + 40 * e * (0.5 + rnd(i));
        g.rect(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, 2.2, 2.2).fill({ color: i % 2 ? 0xffffff : col, alpha: 1 - d });
      }
    } else if (f.t === 'ring') {
      const [sx, sy] = shoulder(1), d = Number(f.d), r = 6 + 26 * eo(d);
      g.circle(sx + c.arm * 0.6, sy - 20, r).stroke({ width: 2, color: col, alpha: 1 - d });
    } else if (f.t === 'motes') {
      for (let i = 0; i < 4; i++) {
        const a = now * (1 + i * 0.15) + i * 1.7;
        const x = Math.cos(a) * (26 + i * 3), y = -62 + Math.sin(a * 1.3) * 16 - i * 4;
        g.circle(x, y, 1.1 + (i % 2) * 0.8).fill({ color: i % 2 ? 0xffffff : col, alpha: 0.5 + 0.4 * Math.sin(a * 2) });
      }
    } else if (f.t === 'embers') {
      const fd = Number(f.d);
      for (let i = 0; i < 26; i++) {
        const st = rnd(i * 5) * 0.4, d = clamp((fd - st) / (1 - st), 0, 1);
        if (d <= 0 || d >= 1) continue;
        const x = P.x + (rnd(i * 11) - 0.5) * 40 + Math.sin(d * 6 + i) * 6, y = -10 - rnd(i * 13) * 50 - d * 70 * (0.6 + rnd(i)), r = 1.2 + rnd(i * 17) * 2;
        g.rect(x - r / 2, y - r / 2, r, r).fill({ color: i % 3 ? col : 0xffffff, alpha: 1 - d });
      }
    }
  }
}
const NM = new Matrix();
function place(o: Container, m: M): void {
  TMP.set(m[0], m[1], m[2], m[3], m[4], m[5]);
  o.setFromMatrix(TMP);
}

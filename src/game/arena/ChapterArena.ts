import { Container, Graphics, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { Game, Rect, Rng } from '@engine';
import type { Vfx } from '../vfx';

/**
 * Décor de l'arène par chapitre (guide DA §4) : sol en tuiles du chapitre, calque (mousse, sang,
 * givre, failles), décors peints (piliers, stèles, arches, gravats, cristaux, braseros animés),
 * lumière ambiante, brume et poussières. Le décor change avec la région des vagues
 * (1-3, 4-7, 8-10, 11+) par un fondu enchaîné.
 *
 * Les emplacements des décors sont tirés une seule fois par run : seules leurs images changent
 * d'un chapitre à l'autre, donc les collisions (murs) restent identiques pendant toute la run.
 */

export type ChapterKey = 'ch1' | 'ch2' | 'ch3' | 'ch4';
export const CHAPTER_KEYS: ChapterKey[] = ['ch1', 'ch2', 'ch3', 'ch4'];

export interface ChapterTheme {
  key: ChapterKey;
  /** Teinte du sol (règle de valeur : le sol reste sombre). */
  groundTint: number;
  calqueAlpha: number;
  calqueAdd: boolean;
  calqueScale: number;
  /** Lumière ambiante de la carte d'éclairage (VFX). */
  ambient: number;
  fog: number;
  /** Couleur des braseros, runes et cristaux. */
  glow: number;
  /** Bord de l'arène : brume au-delà des limites et liseré. */
  edge: number;
  rim: number;
  /** Poussières d'ambiance. */
  motes: { color: number; alt: number; vy: number; kind: 'drift' | 'rise' | 'fall' };
  /** Taches de couleur au sol (additives, très diffuses). */
  blots: number[];
}

export const CHAPTER_THEMES: ChapterTheme[] = [
  { key: 'ch1', groundTint: 0x939eb0, calqueAlpha: 0.75, calqueAdd: false, calqueScale: 1.1, ambient: 0x5d6b8c, fog: 0x7f95c4, glow: 0xffb35c, edge: 0x03060c, rim: 0x8fa6c8,
    motes: { color: 0xffc98a, alt: 0xcfe0ff, vy: -6, kind: 'drift' }, blots: [0x3b6b8f, 0x2f5a3a, 0x4a5a7a] },
  { key: 'ch2', groundTint: 0xa08480, calqueAlpha: 0.8, calqueAdd: false, calqueScale: 1.1, ambient: 0x6e4a48, fog: 0x8a4a3a, glow: 0xff7a2a, edge: 0x0c0303, rim: 0xff6a3a,
    motes: { color: 0xff8a3a, alt: 0xffd27a, vy: -38, kind: 'rise' }, blots: [0x8f2a1a, 0x6a1a10, 0x8f4a1a] },
  { key: 'ch3', groundTint: 0x8c9cba, calqueAlpha: 0.45, calqueAdd: false, calqueScale: 1.2, ambient: 0x52688e, fog: 0x9fc0e6, glow: 0xbfe6ff, edge: 0x01040c, rim: 0xbfe6ff,
    motes: { color: 0xe8f4ff, alt: 0xbfe6ff, vy: 26, kind: 'fall' }, blots: [0x2a5a8f, 0x3a7aaf, 0x1a3a6a] },
  { key: 'ch4', groundTint: 0x8c80a8, calqueAlpha: 0.5, calqueAdd: true, calqueScale: 0.8, ambient: 0x4e3e6e, fog: 0x7a5aaa, glow: 0xb46bff, edge: 0x06020c, rim: 0xb46bff,
    motes: { color: 0xc89bff, alt: 0xf0d8ff, vy: -18, kind: 'rise' }, blots: [0x5a2a8f, 0x7a3aaf, 0x3a1a6a] },
];

/** Région (0..3) d'une vague ; au-delà de la campagne, le chapitre 4 reste (Néant). */
export const chapterForRegion = (region: number): number => Math.max(0, Math.min(3, region | 0));

type PropKind = 'pilier' | 'stele' | 'cristal' | 'gravats' | 'arche' | 'brasero';
/** Taille d'affichage (hauteur en px monde) et ancre de chaque décor (decor.json). */
const PROP: Record<PropKind, { h: number; ay: number; light?: { r: number; i: number; y: number } }> = {
  pilier: { h: 236, ay: 0.95 },
  stele: { h: 150, ay: 0.95, light: { r: 170, i: 0.55, y: 70 } },
  cristal: { h: 170, ay: 0.95, light: { r: 230, i: 0.75, y: 70 } },
  gravats: { h: 80, ay: 0.95 },
  arche: { h: 250, ay: 0.95 },
  brasero: { h: 150, ay: 0.97, light: { r: 420, i: 1, y: 105 } },
};
const BRAZIER_FRAMES = 8;

interface Slot { kind: PropKind; x: number; y: number; flip: boolean; scale: number; phase: number }

interface Skin {
  idx: number;
  ground: Container;
  props: Sprite[];
  braziers: { s: Sprite; frames: Texture[]; phase: number }[];
  /** Textures cuites pour ce décor (sources à libérer). */
  baked: Texture[];
  /** Découpes de la bande du brasero (la source appartient au chargeur d'assets). */
  frames: Texture[];
  alpha: number;
}

export class ChapterArena {
  /** Murs à ajouter à la physique (pieds des décors pleins). */
  readonly walls: Rect[] = [];
  private slots: Slot[] = [];
  private skins: Skin[] = [];
  private current = -1;
  private edge = new Graphics();
  private motes: { s: Sprite; x: number; y: number; vx: number; vy: number; ph: number }[] = [];
  private moteLayer = new Container();
  private t = 0;
  private vfx: Vfx | null = null;
  private amb = { from: 0, to: 0, k: 1 };

  constructor(private readonly game: Game, private readonly arena: Rect, private readonly rng: Rng, private readonly fxLight: Texture) {
    this.layout();
    game.renderer.layers.decals.addChild(this.edge);
    this.moteLayer.label = 'motes';
    game.renderer.layers.fx.addChild(this.moteLayer);
    for (let i = 0; i < 70; i++) {
      const s = new Sprite(fxLight);
      s.anchor.set(0.5); s.blendMode = 'add';
      this.moteLayer.addChild(s);
      this.motes.push({ s, x: 0, y: 0, vx: 0, vy: 0, ph: rng.next() * 10 });
    }
  }

  /** Branche l'éclairage (le VFX est créé après l'arène). */
  attach(vfx: Vfx): void { this.vfx = vfx; this.applyAtmosphere(1); vfx.setChapter(this.amb.to, 0); }

  get chapter(): number { return this.current; }

  /** Change de chapitre ; `instant` évite le fondu (début de run). */
  setChapter(idx: number, instant = false): void {
    idx = chapterForRegion(idx);
    if (idx === this.current) return;
    const prev = this.current;
    this.current = idx;
    const skin = this.buildSkin(idx);
    skin.alpha = instant ? 1 : 0;
    this.applySkinAlpha(skin);
    this.skins.push(skin);
    if (instant) { for (const s of this.skins.slice(0, -1)) this.destroySkin(s); this.skins = [skin]; }
    this.drawEdge(idx);
    this.amb = { from: prev < 0 ? idx : prev, to: idx, k: instant ? 1 : 0 };
    // Étalonnage couleur du chapitre : même fondu que le décor.
    this.vfx?.setChapter(idx, instant ? 0 : 2.2);
    this.resetMotes();
  }

  /** À appeler à chaque image (rendu) : fondu, braseros animés, lumières, poussières. */
  update(frameDt: number): void {
    this.t += frameDt;
    // fondu enchaîné : le nouveau décor apparaît, l'ancien s'efface puis est libéré
    const last = this.skins[this.skins.length - 1];
    if (last && last.alpha < 1) {
      last.alpha = Math.min(1, last.alpha + frameDt / 2.2);
      this.applySkinAlpha(last);
      if (last.alpha >= 1) { for (const s of this.skins.slice(0, -1)) this.destroySkin(s); this.skins = [last]; }
    }
    if (this.amb.k < 1) { this.amb.k = Math.min(1, this.amb.k + frameDt / 2.2); this.applyAtmosphere(this.amb.k); }

    const view = this.game.camera.visibleRect(260);
    const vis = (x: number, y: number) => x > view.x && x < view.x + view.w && y > view.y && y < view.y + view.h;
    for (const skin of this.skins) {
      const theme = CHAPTER_THEMES[skin.idx];
      for (const b of skin.braziers) b.s.texture = b.frames[Math.floor((this.t + b.phase) * 12) % BRAZIER_FRAMES];
      if (!this.vfx) continue;
      for (let i = 0; i < this.slots.length; i++) {
        const sl = this.slots[i], L = PROP[sl.kind].light;
        if (!L || !vis(sl.x, sl.y)) continue;
        const flick = sl.kind === 'brasero' ? 0.88 + 0.12 * Math.sin(this.t * 13 + sl.phase * 7) * Math.sin(this.t * 5.3 + sl.phase) : 0.85 + 0.15 * Math.sin(this.t * 1.7 + sl.phase);
        this.vfx.lighting.push(sl.x, sl.y - L.y * sl.scale, L.r * sl.scale, theme.glow, L.i * flick * skin.alpha);
      }
    }
    this.updateMotes(frameDt, view);
  }

  destroy(): void {
    for (const s of this.skins) this.destroySkin(s);
    this.skins = [];
    this.edge.destroy();
    this.moteLayer.destroy({ children: true });
  }

  // ------------------------------------------------------------------ disposition

  private layout(): void {
    const A = this.arena, r = this.rng;
    const add = (kind: PropKind, x: number, y: number, scale = 1) => {
      this.slots.push({ kind, x, y, flip: r.chance(0.5), scale, phase: r.next() * 10 });
    };
    const near = (x: number, y: number, d: number) => this.slots.some((s) => Math.abs(s.x - x) < d && Math.abs(s.y - y) < d * 0.7);
    // Intérieur : îlots de ruines (piliers, stèles, cristaux, gravats) et braseros, loin du centre.
    const inner: PropKind[] = ['pilier', 'pilier', 'stele', 'cristal', 'gravats', 'gravats', 'pilier', 'cristal'];
    for (let n = 0, tries = 0; n < 24 && tries < 400; tries++) {
      const x = r.range(A.x + 180, A.x + A.w - 180), y = r.range(A.y + 200, A.y + A.h - 160);
      if (Math.hypot(x, y) < 560 || near(x, y, 300)) continue;
      const kind = inner[n % inner.length];
      add(kind, x, y, r.range(0.85, 1.1));
      // petit groupe : gravats au pied
      if (kind !== 'gravats' && r.chance(0.6)) add('gravats', x + r.range(-90, 90), y + r.range(30, 60), r.range(0.6, 0.85));
      n++;
    }
    // Braseros : un anneau autour du centre, pour lire l'espace et éclairer le combat.
    const nb = 8;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 + r.range(-0.15, 0.15), d = r.range(700, 1000);
      const x = Math.cos(a) * d * 1.15, y = Math.sin(a) * d * 0.9;
      if (near(x, y, 160)) continue;
      add('brasero', x, y, 1);
    }
    // Bord nord : colonnade d'arches et de piliers (derrière l'arène, hors limites).
    for (let x = A.x + 120; x < A.x + A.w; x += r.range(300, 380)) add(r.chance(0.45) ? 'arche' : 'pilier', x, A.y - 30, r.range(1, 1.2));
    // Côtés : piliers ; bord sud : gravats bas (ne cachent pas le héros).
    for (let y = A.y + 180; y < A.y + A.h - 100; y += r.range(320, 420)) { add('pilier', A.x - 70, y, r.range(0.95, 1.15)); add('pilier', A.x + A.w + 70, y, r.range(0.95, 1.15)); }
    for (let x = A.x + 80; x < A.x + A.w; x += r.range(260, 360)) add('gravats', x, A.y + A.h + 70, r.range(0.9, 1.2));

    // Collisions des décors intérieurs (pieds) : les mêmes dans tous les chapitres.
    for (const s of this.slots) {
      if (s.x < A.x || s.x > A.x + A.w || s.y < A.y || s.y > A.y + A.h) continue;
      const w = { pilier: 80, stele: 78, cristal: 70, gravats: 0, arche: 0, brasero: 46 }[s.kind] * s.scale;
      if (w > 0) this.walls.push({ x: s.x - w / 2, y: s.y - 24, w, h: 30 });
    }
  }

  // ------------------------------------------------------------------ habillage

  private tex(key: string): Texture { return this.game.assets.texture(key); }

  private buildSkin(idx: number): Skin {
    const theme = CHAPTER_THEMES[idx], ch = theme.key, A = this.arena, pad = 900;
    const { renderer } = this.game;
    const baked: Texture[] = [];
    const ground = new Container();
    ground.label = `sol-${ch}`;
    const macro = Texture.from(bakeGround(ch, (k) => this.tex(k), this.rng));
    baked.push(macro);
    const base = new TilingSprite({ texture: macro, width: A.w + pad * 2, height: A.h + pad * 2 });
    base.position.set(A.x - pad, A.y - pad); base.tileScale.set(0.5); base.tint = theme.groundTint;
    const calque = new TilingSprite({ texture: this.tex(`tiles-${ch}-calque`), width: A.w + pad * 2, height: A.h + pad * 2 });
    calque.position.set(A.x - pad, A.y - pad); calque.tileScale.set(theme.calqueScale); calque.tileRotation = 0.37; calque.tilePosition.set(173, 91);
    calque.alpha = theme.calqueAlpha; if (theme.calqueAdd) calque.blendMode = 'add';
    const shade = new TilingSprite({ texture: lowNoise(this.rng), width: A.w + pad * 2, height: A.h + pad * 2 });
    baked.push(shade.texture);
    shade.position.set(A.x - pad, A.y - pad); shade.tileScale.set(9); shade.blendMode = 'multiply';
    ground.addChild(base, calque, shade);
    for (let i = 0; i < 26; i++) {
      const blot = new Sprite(this.fxLight);
      blot.anchor.set(0.5);
      blot.position.set(this.rng.range(A.x, A.x + A.w), this.rng.range(A.y, A.y + A.h));
      blot.scale.set(this.rng.range(1.4, 3.4), this.rng.range(0.9, 2)); blot.rotation = this.rng.range(0, Math.PI);
      blot.tint = this.rng.pick(theme.blots); blot.alpha = this.rng.range(0.4, 0.9); blot.blendMode = 'add';
      ground.addChild(blot);
    }
    renderer.layers.ground.addChild(ground);

    const props: Sprite[] = [];
    const braziers: Skin['braziers'] = [];
    const bz = this.tex(`decor-${ch}-brasero`);
    const fw = bz.width / BRAZIER_FRAMES;
    const frames = Array.from({ length: BRAZIER_FRAMES }, (_, i) => new Texture({ source: bz.source, frame: new Rectangle(bz.frame.x + i * fw, bz.frame.y, fw, bz.height) }));
    for (const sl of this.slots) {
      const P = PROP[sl.kind];
      const tex = sl.kind === 'brasero' ? frames[0] : this.tex(`decor-${ch}-${sl.kind}`);
      const s = new Sprite(tex);
      s.anchor.set(0.5, P.ay);
      const k = (P.h * sl.scale) / tex.height;
      s.scale.set(sl.flip && sl.kind !== 'stele' ? -k : k, k);
      s.position.set(sl.x, sl.y); s.zIndex = sl.y;
      // hors de l'arène : un peu plus sombre (profondeur)
      const out = sl.y < A.y || sl.y > A.y + A.h || sl.x < A.x || sl.x > A.x + A.w;
      s.tint = out ? 0x8088a0 : 0xffffff;
      renderer.layers.entities.addChild(s);
      props.push(s);
      if (sl.kind === 'brasero') braziers.push({ s, frames, phase: sl.phase });
    }
    return { idx, ground, props, braziers, baked, frames, alpha: 1 };
  }

  private applySkinAlpha(s: Skin): void {
    s.ground.alpha = s.alpha;
    for (const p of s.props) p.alpha = s.alpha;
  }

  private destroySkin(s: Skin): void {
    s.ground.destroy({ children: true });
    for (const p of s.props) p.destroy();
    for (const t of s.frames) t.destroy(false);
    for (const t of s.baked) t.destroy(true);
  }

  private drawEdge(idx: number): void {
    const th = CHAPTER_THEMES[idx], A = this.arena, pad = 900, e = this.edge;
    e.clear();
    e.rect(A.x - pad, A.y - pad, A.w + pad * 2, pad).fill({ color: th.edge, alpha: 0.72 });
    e.rect(A.x - pad, A.y + A.h, A.w + pad * 2, pad).fill({ color: th.edge, alpha: 0.72 });
    e.rect(A.x - pad, A.y, pad, A.h).fill({ color: th.edge, alpha: 0.72 });
    e.rect(A.x + A.w, A.y, pad, A.h).fill({ color: th.edge, alpha: 0.72 });
    // fondu vers l'intérieur
    for (let i = 1; i <= 6; i++) {
      const d = i * 22;
      e.rect(A.x - d, A.y - d, A.w + d * 2, A.h + d * 2).stroke({ color: th.edge, width: 22, alpha: 0.1 + i * 0.07 });
    }
    e.rect(A.x, A.y, A.w, A.h).stroke({ color: th.rim, width: 3, alpha: 0.32 });
  }

  private applyAtmosphere(k: number): void {
    if (!this.vfx) return;
    const a = CHAPTER_THEMES[this.amb.from] ?? CHAPTER_THEMES[0], b = CHAPTER_THEMES[this.amb.to] ?? CHAPTER_THEMES[0];
    this.vfx.lighting.ambient = lerpColor(a.ambient, b.ambient, k);
    this.vfx.fog.color = lerpColor(a.fog, b.fog, k);
  }

  // ------------------------------------------------------------------ poussières d'ambiance

  private resetMotes(): void {
    const th = CHAPTER_THEMES[this.current];
    for (const m of this.motes) {
      m.ph = this.rng.next() * 10;
      m.s.tint = this.rng.chance(0.65) ? th.motes.color : th.motes.alt;
      m.s.scale.set(this.rng.range(0.025, 0.07));
      m.x = Number.NaN;
    }
  }

  private updateMotes(dt: number, view: Rect): void {
    if (this.current < 0) return;
    const th = CHAPTER_THEMES[this.current];
    for (const m of this.motes) {
      if (Number.isNaN(m.x) || m.x < view.x || m.x > view.x + view.w || m.y < view.y || m.y > view.y + view.h) {
        m.x = view.x + this.rng.next() * view.w; m.y = view.y + this.rng.next() * view.h;
        m.vx = this.rng.range(-10, 10); m.vy = th.motes.vy * this.rng.range(0.6, 1.4);
      }
      m.ph += dt;
      m.x += (m.vx + Math.sin(m.ph * 0.9) * (th.motes.kind === 'fall' ? 16 : 8)) * dt;
      m.y += m.vy * dt;
      m.s.position.set(m.x, m.y);
      m.s.alpha = 0.35 + 0.35 * Math.sin(m.ph * 2.3);
    }
  }
}

// ------------------------------------------------------------------ cuisson du sol

function img(t: Texture): CanvasImageSource { return t.source.resource as CanvasImageSource; }

/**
 * Sol « macro » 1024 px raccordable : dallage A, plaques de dallage B, zones usées et terre
 * posées par un masque de taches périodique (casse la répétition des tuiles 512).
 */
export function bakeGround(ch: ChapterKey, tex: (k: string) => Texture, rng: Rng, size = 1024): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!;
  const tile = (key: string, dst: CanvasRenderingContext2D) => {
    const t = tex(`tiles-${ch}-${key}`), im = img(t), n = Math.ceil(size / t.width);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) dst.drawImage(im, i * t.width, j * t.height);
  };
  tile('dalles_a', g);
  const layer = document.createElement('canvas'); layer.width = layer.height = size;
  const lg = layer.getContext('2d')!;
  for (const [key, count, rMin, rMax, a] of [['dalles_b', 5, 140, 260, 1], ['dalles_usees', 7, 90, 200, 0.95], ['terre', 6, 60, 150, 0.9]] as const) {
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, size, size);
    // masque : taches douces périodiques (copiées sur les bords)
    for (let i = 0; i < count; i++) {
      const x = rng.next() * size, y = rng.next() * size, R = rng.range(rMin, rMax);
      for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
        const gr = lg.createRadialGradient(x + dx, y + dy, R * 0.35, x + dx, y + dy, R);
        gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        lg.fillStyle = gr; lg.fillRect(x + dx - R, y + dy - R, R * 2, R * 2);
      }
    }
    lg.globalCompositeOperation = 'source-in';
    tile(key, lg);
    g.drawImage(layer, 0, 0);
  }
  return c;
}

/** Bruit très basse fréquence (multiplicatif) : grandes zones plus sombres sur le sol. */
function lowNoise(rng: Rng): Texture {
  const n = 64, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 9; i++) {
    const x = rng.next() * n, y = rng.next() * n, R = rng.range(8, 20), a = rng.range(0.25, 0.5);
    for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, R);
      gr.addColorStop(0, `rgba(40,44,60,${a})`); gr.addColorStop(1, 'rgba(40,44,60,0)');
      g.fillStyle = gr; g.fillRect(x + dx - R, y + dy - R, R * 2, R * 2);
    }
  }
  const t = Texture.from(c);
  t.source.scaleMode = 'linear';
  return t;
}

function lerpColor(a: number, b: number, k: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

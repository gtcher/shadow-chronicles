import { Container, Matrix, RenderTexture, Sprite, type Texture } from 'pixi.js';
import type { Renderer } from '@engine';
import { createReliefFilter, type ReliefLight, type ReliefParams } from './lighting/ReliefFilter';
import { CastShadows } from './lighting/CastShadows';

/**
 * Éclairage dynamique par carte de lumière (« lightmap ») :
 *
 * 1. Chaque frame, les lumières (sprites radiaux additifs) sont rendues dans une petite
 *    texture effacée à la couleur d'ambiance (nuit bleutée).
 * 2. Cette texture est posée par-dessus le décor et les personnages en mode `multiply` :
 *    tout ce qui est loin d'une lumière s'assombrit.
 * 3. Elle est placée en tête de la couche `fx` : particules, projectiles lumineux et
 *    chiffres de dégâts restent donc vifs, même dans le noir (ils « émettent »).
 *
 * Coût : 1 passe de rendu à 25–50 % de la résolution + 1 quad plein écran.
 *
 * Relief (qualité medium/high, `setRelief(true)`) : au lieu de multiplier à plat, la carte est lue
 * par un filtre plein écran sur l'étage `scene` (lighting/ReliefFilter) qui ajoute l'ombrage selon
 * la direction de la lumière et des reflets sur les arêtes. Les normales viennent du tampon
 * `normals` (pièces peintes, voir lighting/NormalPiece) ou, à défaut, de la luminance de l'image.
 * Ombres portées : lighting/CastShadows (`shadows`).
 */
export interface Light {
  x: number;
  y: number;
  /** Rayon en pixels monde. */
  radius: number;
  color: number;
  /** 0..~1.5 */
  intensity: number;
  /** Scintillement (0 = stable, 0.15 = torche). */
  flicker?: number;
  /** Durée de vie (s) pour les éclairs temporaires ; undefined = permanente. */
  life?: number;
  maxLife?: number;
}

export class Lighting {
  /** Couleur d'ambiance : ce que devient le « noir » (plus clair = nuit moins profonde). */
  ambient = 0x5d6b8c;
  /**
   * Part de lumière ajoutée (mode `add`) en plus de la multiplication : les zones éclairées
   * deviennent plus vives que le décor de base (flaques chaudes autour des torches).
   */
  glow = 0.22;
  enabled = true;
  private readonly root = new Container();
  private readonly lightLayer = new Container();
  private rt: RenderTexture | null = null;
  private rtGlow: RenderTexture | null = null;
  private readonly glowOverlay: Sprite;
  private readonly overlay: Sprite;
  private scale = 0.5;
  private readonly lights = new Set<Light>();
  private readonly sprites: Sprite[] = [];
  private readonly frameLights: Light[] = [];
  private readonly mat = new Matrix();
  private readonly inv = new Matrix();
  private t = 0;
  /**
   * Tampon de normales (espace monde, dessiné avec la caméra) : y ajouter des `NormalPiece`
   * aux mêmes transformations que les sprites couleur. Vide = relief deviné partout.
   */
  readonly normals = new Container({ label: 'normals' });
  /** Appelés juste avant le tampon de normales (pantins : recopier la pose finale, caméra comprise). */
  readonly prepare = new Set<() => void>();
  /** Ombres portées des combattants et du décor. */
  readonly shadows: CastShadows;
  private rtNormals: RenderTexture | null = null;
  private normalScale = 0.5;
  private relief: ReliefLight | null = null;
  private removeRelief: (() => void) | null = null;

  constructor(private readonly renderer: Renderer, private readonly tex: Texture) {
    this.root.addChild(this.lightLayer);
    this.overlay = new Sprite();
    this.overlay.blendMode = 'multiply';
    this.overlay.label = 'lightmap';
    this.glowOverlay = new Sprite();
    this.glowOverlay.blendMode = 'add';
    this.glowOverlay.label = 'lightglow';
    renderer.layers.fx.addChildAt(this.overlay, 0);
    renderer.layers.fx.addChildAt(this.glowOverlay, 1);
    this.shadows = new CastShadows(renderer.layers.entities, renderer.layers.shadows);
  }

  /**
   * Active l'éclairage avec relief (filtre sur l'étage `scene`) ; sinon multiplication à plat.
   * `normalScale` : résolution du tampon de normales (fraction de l'écran).
   */
  setRelief(on: boolean, normalScale = 0.5): void {
    this.normalScale = normalScale;
    this.rtNormals?.destroy(true); this.rtNormals = null;
    if (on && !this.relief) {
      this.relief = createReliefFilter();
      this.removeRelief = this.renderer.post.add('scene', this.relief.filter, 0);
    } else if (!on && this.relief) {
      this.removeRelief?.(); this.removeRelief = null;
      this.relief.filter.destroy(); this.relief = null;
    }
    this.overlay.visible = this.enabled && !this.relief;
    if (this.relief) this.relief.filter.enabled = this.enabled;
  }

  get reliefOn(): boolean { return !!this.relief; }

  /** Réglages fins du relief (console : vfx.lighting.tuneRelief({ bump: 9 })). */
  tuneRelief(p: Partial<ReliefParams>): void { this.relief?.set(p); }

  /** Lumière persistante (héros, braseros…). La modifier directement, `remove()` pour l'enlever. */
  add(l: Light): Light { this.lights.add(l); return l; }
  remove(l: Light): void { this.lights.delete(l); }

  /** Éclair bref qui s'éteint seul (explosion, impact, tir). */
  flash(x: number, y: number, radius: number, color: number, intensity = 1, life = 0.15): void {
    this.lights.add({ x, y, radius, color, intensity, life, maxLife: life });
  }

  /** Lumière valable pour cette frame seulement (projectiles, objets lumineux suivis). */
  push(x: number, y: number, radius: number, color: number, intensity = 0.8): void {
    this.frameLights.push({ x, y, radius, color, intensity });
  }

  setScale(s: number): void {
    this.scale = s;
    this.enabled = s > 0;
    this.overlay.visible = this.glowOverlay.visible = this.enabled;
    if (this.relief) { this.overlay.visible = false; this.relief.filter.enabled = this.enabled; }
    this.rt?.destroy(true); this.rt = null;
    this.rtGlow?.destroy(true); this.rtGlow = null;
  }

  /** Mise à jour au rythme de l'affichage (durées de vie des éclairs). */
  update(frameDt: number): void {
    this.t += frameDt;
    for (const l of this.lights) {
      if (l.life === undefined) continue;
      l.life -= frameDt;
      if (l.life <= 0) this.lights.delete(l);
    }
  }

  /** Passe de rendu : à appeler via `renderer.onBeforeRender`. */
  render(): void {
    if (!this.enabled) { this.frameLights.length = 0; return; }
    const r = this.renderer, w = r.width, h = r.height, s = this.scale;
    const tw = Math.max(1, Math.ceil(w * s)), th = Math.max(1, Math.ceil(h * s));
    if (!this.rt || this.rt.width !== tw || this.rt.height !== th) {
      this.rt?.destroy(true); this.rtGlow?.destroy(true);
      this.rt = RenderTexture.create({ width: tw, height: th, resolution: 1, antialias: false });
      this.rtGlow = RenderTexture.create({ width: tw, height: th, resolution: 1, antialias: false });
      this.overlay.texture = this.rt;
      this.glowOverlay.texture = this.rtGlow;
    }

    // Placer les sprites de lumière (réserve d'objets).
    let i = 0;
    const place = (l: Light) => {
      let sp = this.sprites[i];
      if (!sp) {
        sp = new Sprite(this.tex); sp.anchor.set(0.5); sp.blendMode = 'add';
        this.sprites.push(sp); this.lightLayer.addChild(sp);
      }
      sp.visible = true;
      sp.position.set(l.x, l.y);
      sp.scale.set((l.radius * 2) / this.tex.width);
      sp.tint = l.color;
      let a = l.intensity;
      if (l.life !== undefined && l.maxLife) a *= l.life / l.maxLife;
      if (l.flicker) a *= 1 - l.flicker * (0.5 + 0.5 * Math.sin(this.t * 23 + l.x) * Math.sin(this.t * 7.3 + l.y));
      sp.alpha = Math.min(1, a);
      i++;
    };
    for (const l of this.lights) place(l);
    for (const l of this.frameLights) place(l);
    this.shadows.update(this.lights, this.frameLights);
    this.frameLights.length = 0;
    for (let k = i; k < this.sprites.length; k++) this.sprites[k].visible = false;

    // Même transformation que le monde (caméra), réduite à l'échelle de la carte.
    const wt = r.world.localTransform;
    this.mat.set(wt.a * s, wt.b * s, wt.c * s, wt.d * s, wt.tx * s, wt.ty * s);
    const amb = this.ambient;
    r.app.renderer.render({
      container: this.root, target: this.rt!, transform: this.mat, clear: true,
      clearColor: [((amb >> 16) & 255) / 255, ((amb >> 8) & 255) / 255, (amb & 255) / 255, 1],
    });
    this.glowOverlay.visible = this.glow > 0;
    if (this.glow > 0) {
      r.app.renderer.render({ container: this.root, target: this.rtGlow!, transform: this.mat, clear: true, clearColor: [0, 0, 0, 1] });
      this.glowOverlay.alpha = this.glow;
    }

    // La carte est dessinée dans la couche fx (espace monde) : on lui applique l'inverse
    // de la caméra pour qu'elle couvre exactement l'écran.
    this.inv.copyFrom(wt).invert();
    const kx = w / this.rt!.width, ky = h / this.rt!.height;
    this.inv.set(this.inv.a * kx, this.inv.b * kx, this.inv.c * ky, this.inv.d * ky, this.inv.tx, this.inv.ty);
    this.overlay.setFromMatrix(this.inv);
    if (this.relief) this.renderNormals(wt);
    this.glowOverlay.setFromMatrix(this.inv);
    const fx = this.overlay.parent;
    if (fx && (fx.children[0] !== this.overlay || fx.children[1] !== this.glowOverlay)) {
      fx.addChildAt(this.overlay, 0); fx.addChildAt(this.glowOverlay, 1);
    }
  }

  /** Tampon de normales + liaison des textures du filtre de relief. */
  private renderNormals(wt: Matrix): void {
    const relief = this.relief!;
    for (const f of this.prepare) f();
    if (!this.normals.children.length) { relief.bind(this.rt!.source, null); return; }
    const r = this.renderer, s = this.normalScale;
    const tw = Math.max(1, Math.ceil(r.width * s)), th = Math.max(1, Math.ceil(r.height * s));
    if (!this.rtNormals || this.rtNormals.width !== tw || this.rtNormals.height !== th) {
      this.rtNormals?.destroy(true);
      this.rtNormals = RenderTexture.create({ width: tw, height: th, resolution: 1, antialias: false });
    }
    this.mat.set(wt.a * s, wt.b * s, wt.c * s, wt.d * s, wt.tx * s, wt.ty * s);
    r.app.renderer.render({ container: this.normals, target: this.rtNormals, transform: this.mat, clear: true, clearColor: [0, 0, 0, 0] });
    relief.bind(this.rt!.source, this.rtNormals.source);
  }

  destroy(): void {
    this.removeRelief?.(); this.relief?.filter.destroy();
    this.shadows.destroy();
    this.normals.destroy({ children: true });
    this.rtNormals?.destroy(true);
    this.overlay.destroy(); this.glowOverlay.destroy();
    this.rtGlow?.destroy(true);
    this.root.destroy({ children: true });
    this.rt?.destroy(true);
  }
}

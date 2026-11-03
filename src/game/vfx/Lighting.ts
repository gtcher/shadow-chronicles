import { Container, Matrix, RenderTexture, Sprite, type Texture } from 'pixi.js';
import type { Renderer } from '@engine';

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
  }

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
    this.glowOverlay.setFromMatrix(this.inv);
    const fx = this.overlay.parent;
    if (fx && (fx.children[0] !== this.overlay || fx.children[1] !== this.glowOverlay)) {
      fx.addChildAt(this.overlay, 0); fx.addChildAt(this.glowOverlay, 1);
    }
  }

  destroy(): void {
    this.overlay.destroy(); this.glowOverlay.destroy();
    this.rtGlow?.destroy(true);
    this.root.destroy({ children: true });
    this.rt?.destroy(true);
  }
}

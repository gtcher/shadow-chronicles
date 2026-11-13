import { Container, Sprite, type Texture } from 'pixi.js';
import type { Game } from '@engine';
import type { GameEvents } from '../events';
import { makeVfxTextures, type VfxTextures } from './textures';
import { Lighting, type Light } from './Lighting';
import { Bloom } from './Bloom';
import { Fog } from './Fog';
import { FxParticles } from './FxParticles';
import { DamageNumbers } from './DamageNumbers';
import { ColorGrade } from './grade/ColorGrade';
import { gradeForChapter } from './grade/grades';
import { FpsGovernor, QUALITY_PRESETS, detectQuality, lowerQuality, type QualityLevel, type QualitySetting } from './quality';

/**
 * Directeur des effets visuels (agent Rendu / VFX).
 *
 * Utilisation minimale dans une scène :
 *   enter():  this.vfx = new Vfx(this.game, { bodyY: 46 });
 *             this.vfx.follow(playerTransform, playerNode, 0xff5a4a);
 *   render(): this.vfx.update(frameDt);
 *   exit():   this.vfx.destroy();
 *
 * Il s'abonne seul aux événements de jeu (`enemy:hit`, `enemy:killed`, `player:hurt`,
 * `player:dash`, `player:shoot`) : le gameplay n'a qu'à les émettre. Les effets
 * (particules, chiffres, secousse, pause d'impact, éclairs de lumière) sont déclenchés ici.
 * Pour un effet spécial : `vfx.explosion()`, `vfx.shockwave()`, `vfx.pickup()`,
 * `vfx.lighting.add({...})`, `vfx.particles.emit(...)`, `vfx.numbers.show(...)`.
 */
export interface VfxOptions {
  /** Hauteur du torse au-dessus des pieds (les événements donnent la position des pieds). */
  bodyY?: number;
  /** Ennemis « lourds » : mort plus spectaculaire (onde de choc, pause d'impact). */
  heavyKinds?: string[];
  /** Couleurs de sang/essence par type d'ennemi (défaut : rouge sombre). */
  kindColors?: Record<string, number>;
  /** Qualité initiale (sinon : paramètre d'URL `?quality=`, puis détection auto). */
  quality?: QualitySetting;
}

export interface VfxSettings {
  quality: QualitySetting;
  /** Multiplicateur de secousses (0 = désactivées, option d'accessibilité). */
  shake: number;
  /** Flashs plein écran (désactivables : photosensibilité). */
  flashes: boolean;
  damageNumbers: boolean;
  /** Confort visuel : bloom, particules et brume allégés (réglage joueur). */
  comfort?: boolean;
  /** Effet cinéma : étalonnage couleur, vignette et grain propres à chaque chapitre (défaut : oui). */
  cinematic?: boolean;
}

type Tracked = { x: number; y: number; prevX?: number; prevY?: number };

export class Vfx {
  readonly tex: VfxTextures;
  readonly lighting: Lighting;
  readonly bloom: Bloom;
  readonly fog: Fog;
  readonly particles: FxParticles;
  readonly numbers: DamageNumbers;
  /** Étalonnage couleur par chapitre (post-traitement plein écran). */
  readonly grade = new ColorGrade();
  readonly settings: VfxSettings;
  level: QualityLevel = 'high';
  /** Appelé quand la qualité change (l'UI peut l'afficher, la sauvegarde la mémoriser). */
  onQualityChange: ((q: QualityLevel) => void) | null = null;

  private readonly bodyY: number;
  private readonly heavy: Set<string>;
  private readonly kindColors: Record<string, number>;
  private readonly decals = new Container({ label: 'vfx-decals' });
  private decalSprites: Sprite[] = [];
  private maxDecals = 160;
  private readonly ghosts = new Container({ label: 'vfx-ghosts' });
  private ghostList: Array<{ s: Sprite; life: number }> = [];
  private readonly vignette: Sprite;
  private readonly hurtFlash: Sprite;
  private readonly whiteFlash: Sprite;
  private readonly lowHp: Sprite;
  private readonly governor = new FpsGovernor();
  private readonly offs: Array<() => void> = [];
  private target: Tracked | null = null;
  private targetNode: Container | null = null;
  private playerLight: Light | null = null;
  private heroColor = 0xffc27a;
  private hpRatio = 1;
  private dashT = 0;
  private ghostT = 0;
  private t = 0;
  private emberT = 0;
  private lastCoreT = -1;
  private lastCoreX = 0;
  private lastCoreY = 0;

  constructor(private readonly game: Game<GameEvents>, opts: VfxOptions = {}) {
    const { renderer } = game;
    this.bodyY = opts.bodyY ?? 46;
    this.heavy = new Set(opts.heavyKinds ?? ['brute', 'shadeElite']);
    this.kindColors = { shade: 0x6a4cff, shadeElite: 0x8a5cff, ...(opts.kindColors ?? {}) };
    this.tex = makeVfxTextures();

    renderer.layers.decals.addChild(this.decals);
    renderer.layers.shadows.addChild(this.ghosts);
    this.lighting = new Lighting(renderer, this.tex.light);
    this.fog = new Fog(this.tex.fog, renderer.layers.decals, renderer.layers.overlay);
    this.particles = new FxParticles(renderer.layers.fx, this.tex);
    this.numbers = new DamageNumbers(renderer.layers.overlay);
    this.bloom = new Bloom(renderer);

    const full = (tex: Texture, tint: number, blend: 'normal' | 'add') => {
      const s = new Sprite(tex); s.tint = tint; s.blendMode = blend; s.alpha = 0;
      renderer.layers.screenFx.addChild(s); return s;
    };
    this.vignette = full(this.tex.vignette, 0x000000, 'normal');
    this.vignette.tint = 0x02040a; this.vignette.alpha = 1;
    this.lowHp = full(this.tex.vignette, 0xb0101a, 'normal');
    this.hurtFlash = full(this.tex.vignette, 0xff2a1a, 'add');
    this.whiteFlash = full(this.tex.white, 0xfff2dc, 'add');
    const resize = (w: number, h: number) => {
      for (const s of [this.vignette, this.lowHp, this.hurtFlash, this.whiteFlash]) { s.width = w; s.height = h; }
    };
    resize(renderer.width, renderer.height);
    this.offs.push(renderer.onResize(resize)); // sinon une rotation d’écran après la scène touche des sprites détruits

    this.offs.push(renderer.onBeforeRender(() => { this.lighting.render(); this.bloom.render(); }));
    // Étalonnage : sur le monde + effets écran (pas sur l'interface). WebGL seulement (le shader est en GLSL).
    this.gradeOk = (renderer.app.renderer as { type?: number }).type === 1 && new URLSearchParams(location.search).get('grade') !== '0';
    this.grade.attach(renderer.post, renderer.app.screen, false);

    const ev = game.events;
    this.offs.push(
      ev.on('enemy:hit', (e) => this.onHit(e.id, e.x, e.y, e.damage, (e as { crit?: boolean }).crit ?? false)),
      ev.on('enemy:killed', (e) => this.onKill(e.kind, e.x, e.y)),
      ev.on('player:hurt', (e) => this.onHurt(e.hp, e.max, e.damage)),
      ev.on('player:dash', (e) => this.onDash(e.x, e.y)),
      ev.on('player:shoot', (e) => this.onShoot(e.x, e.y, e.dirX, e.dirY)),
    );

    const param = new URLSearchParams(location.search).get('quality') as QualitySetting | null;
    this.settings = { quality: opts.quality ?? (param && ['auto', 'low', 'medium', 'high'].includes(param) ? param : 'auto'), shake: 1, flashes: true, damageNumbers: true };
    this.setQuality(this.settings.quality);
  }

  // ---------- Réglages ----------

  setQuality(q: QualitySetting): void {
    this.settings.quality = q;
    this.applyLevel(q === 'auto' ? detectQuality() : q);
  }

  private applyLevel(level: QualityLevel): void {
    this.level = level;
    if (!this.enabled) return;
    const p = QUALITY_PRESETS[level];
    this.game.renderer.setResolution(Math.min(window.devicePixelRatio || 1, p.resolution));
    this.lighting.setScale(p.lightScale);
    this.bloom.configure(p.bloomScale, p.bloomBlur);
    this.fog.setLayers(p.fogLayers);
    this.particles.max = p.maxParticles;
    this.particles.density = p.particleDensity * (this.settings?.comfort ? 0.5 : 1);
    this.applyGrade();
    this.numbers.max = p.maxDamageNumbers;
    this.maxDecals = p.maxDecals;
    this.onQualityChange?.(level);
  }

  /**
   * Coupe/rétablit les effets lourds (éclairage, bloom, brouillard, chiffres) :
   * comparaison avant/après, ou mode « économie » extrême.
   */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) { this.applyLevel(this.level); this.numbers.enabled = this.settings.damageNumbers; return; }
    this.lighting.setScale(0);
    this.bloom.configure(0, 0);
    this.fog.setLayers(0);
    this.numbers.enabled = false;
    this.applyGrade();
  }

  /** Étalonnage actif ? (qualité medium/high, réglage « Effet cinéma », effets allumés). */
  private applyGrade(): void {
    const s = this.settings;
    const on = this.gradeOk && this.enabled && QUALITY_PRESETS[this.level].grade && (s?.cinematic ?? true);
    this.grade.setEnabled(on);
    this.grade.grainScale = s?.comfort ? 0 : 1;
    // Le shader fait sa propre vignette colorée : l'ancienne (noire, en sprite) ne sert qu'en secours.
    this.vignette.visible = !on;
  }

  /** Ambiance couleur du chapitre (0..3), en fondu sur `duration` secondes. */
  setChapter(idx: number, duration = 0): void { this.grade.set(gradeForChapter(idx), duration); }
  enabled = true;
  private gradeOk = false;
  /** Intensité de référence du bloom (modulée par la densité d'effets). */
  bloomBase = 0.62;

  /** Applique les options d'accessibilité (à appeler après modification de `settings`). */
  applySettings(): void {
    this.game.camera.shakeScale = this.settings.shake;
    this.numbers.enabled = this.settings.damageNumbers;
    this.bloomBase = this.settings.comfort ? 0.22 : 0.62;
    if (this.enabled) this.applyLevel(this.level);
  }

  /** Lumière et traînées suivent cette entité (le héros). */
  follow(transform: Tracked, node: Container | null, color: number): void {
    this.target = transform;
    this.targetNode = node;
    this.heroColor = color;
    if (this.playerLight) this.lighting.remove(this.playerLight);
    this.playerLight = this.lighting.add({ x: transform.x, y: transform.y, radius: 430, color: 0xffd7a0, intensity: 1, flicker: 0.06 });
  }

  // ---------- Réactions aux événements ----------

  private onHit(id: number, x: number, y: number, dmg: number, crit: boolean): void {
    const by = y - this.bodyY;
    // Direction : du héros vers la cible (les éclats partent vers l'arrière de l'ennemi).
    let ang = -Math.PI / 2;
    if (this.target) ang = Math.atan2(y - this.target.y, x - this.target.x);
    this.particles.emit(x, by, { shape: 'spark', color: 0xffd28a, endColor: 0xff5a2a, count: crit ? 10 : 6, speed: 380, angle: ang, spread: 1.4, size: 0.5, life: 0.22, drag: 6 });
    // Éclat central : un seul par zone toutes les 60 ms (sinon une mêlée de 6 coups devient une tache blanche).
    if (crit || this.t - this.lastCoreT > 0.06 || Math.abs(x - this.lastCoreX) + Math.abs(by - this.lastCoreY) > 90) {
      this.lastCoreT = this.t; this.lastCoreX = x; this.lastCoreY = by;
      this.particles.emit(x, by, { color: crit ? 0xffe6b0 : 0xffd9a8, count: 1, speed: 0, size: crit ? 1.3 : 0.8, life: 0.09, grow: 4, alpha: crit ? 0.95 : 0.75 });
    }
    this.lighting.flash(x, by, crit ? 200 : 120, 0xffb070, crit ? 0.9 : 0.5, 0.1);
    this.numbers.show(x, by - 24, dmg, crit ? 'crit' : 'normal', id);
    this.game.camera.shake(crit ? 0.12 : 0.04);
    if (crit) this.game.hitStop(0.045);
  }

  private onKill(kind: string, x: number, y: number): void {
    const by = y - this.bodyY;
    const heavy = this.heavy.has(kind);
    const col = this.kindColors[kind] ?? 0xc0202a;
    const k = heavy ? 1.8 : 1;
    // Éclatement : étincelles chaudes + essence colorée + fumée sombre + âme qui s'élève.
    this.particles.emit(x, by, { shape: 'spark', color: 0xffe0a0, endColor: 0xff4020, count: 14 * k, speed: 480 * Math.sqrt(k), size: 0.6, life: 0.35, drag: 5 });
    this.particles.emit(x, by, { color: col, count: 16 * k, speed: 220 * Math.sqrt(k), size: 0.6, life: 0.6, gravity: 380, drag: 2, jitter: 10 });
    this.particles.emit(x, by + 10, { shape: 'smoke', color: 0x1a1622, count: 6 * k, speed: 60, size: 0.9 * k, life: 1.1, grow: 0.9, drag: 2, gravity: -30, alpha: 0.75, jitter: 14, spin: 1.5 });
    this.particles.emit(x, by, { color: 0x9a8cff, endColor: 0x3a2c8f, count: 5 * k, speed: 40, angle: -Math.PI / 2, spread: 1.2, size: 0.8, life: 1.3, drag: 1, gravity: -90, alpha: 0.7, jitter: 12 });
    this.particles.emit(x, by, { color: 0xfff0d8, count: 1, speed: 0, size: 1.8 * k, life: 0.12, grow: 5, alpha: 0.75 });
    this.lighting.flash(x, by, 260 * k, 0xff9a5a, 1, heavy ? 0.35 : 0.2);
    this.decal(x, y, col, heavy ? 1.6 : 0.9);
    if (heavy) {
      this.shockwave(x, y, col);
      this.game.camera.shake(0.4);
      this.game.hitStop(0.09);
      this.flash(0.25);
    } else {
      this.game.camera.shake(0.1);
      this.game.hitStop(0.02, 0.2);
    }
  }

  private onHurt(hp: number, max: number, dmg: number): void {
    this.hpRatio = max > 0 ? hp / max : 1;
    if (this.settings.flashes) this.hurtFlash.alpha = 0.9;
    const t = this.target;
    if (t) {
      this.numbers.show(t.x, t.y - this.bodyY - 50, dmg, 'hurt');
      this.particles.emit(t.x, t.y - this.bodyY, { color: 0xff3a2a, count: 12, speed: 260, size: 0.5, life: 0.4, gravity: 300 });
      this.lighting.flash(t.x, t.y, 300, 0xff3020, 0.8, 0.25);
    }
    this.game.camera.shake(0.45);
    this.game.hitStop(0.07);
  }

  private onDash(x: number, y: number): void {
    this.dashT = 0.2;
    this.ghostT = 0;
    this.particles.emit(x, y, { shape: 'smoke', color: 0x9aa6bc, count: 5, speed: 90, size: 0.6, life: 0.6, grow: 1.2, drag: 4, alpha: 0.5, jitter: 10 });
    this.particles.emit(x, y - this.bodyY, { shape: 'ring', color: this.heroColor, count: 1, speed: 0, size: 0.4, life: 0.25, grow: 7, alpha: 0.7 });
    this.game.camera.shake(0.12);
  }

  private onShoot(x: number, y: number, dx: number, dy: number): void {
    const by = y - this.bodyY, a = Math.atan2(dy, dx);
    this.particles.emit(x, by, { shape: 'spark', color: this.heroColor, count: 4, speed: 260, angle: a, spread: 0.7, size: 0.4, life: 0.14, drag: 8 });
    this.particles.emit(x, by, { color: 0xffffff, count: 1, speed: 0, size: 0.7, life: 0.06, grow: 3 });
    this.lighting.flash(x, by, 150, this.heroColor, 0.7, 0.07);
    this.game.camera.kick(-dx, -dy, 2.5);
    this.game.camera.shake(0.02);
  }

  // ---------- Effets à la demande ----------

  /** Explosion (sorts de zone, barils, boss). */
  explosion(x: number, y: number, radius = 120, color = 0xff8a3a): void {
    const k = radius / 120;
    this.particles.emit(x, y, { shape: 'spark', color: 0xfff0c0, endColor: color, count: 24 * k, speed: 520 * Math.sqrt(k), size: 0.7, life: 0.4, drag: 4 });
    this.particles.emit(x, y, { color, count: 18 * k, speed: 260 * Math.sqrt(k), size: 1.1, life: 0.5, drag: 3, endColor: 0x5a1a08 });
    this.particles.emit(x, y, { shape: 'smoke', color: 0x221a1a, count: 10 * k, speed: 120 * Math.sqrt(k), size: 1.2 * k, life: 1.4, grow: 0.8, drag: 2.5, gravity: -40, alpha: 0.8, jitter: radius * 0.3, spin: 1 });
    this.shockwave(x, y + this.bodyY, color, radius / 60);
    this.lighting.flash(x, y, radius * 3, color, 1.2, 0.35);
    this.decal(x, y + this.bodyY, 0x0a0806, 1.4 * k);
    this.game.camera.shake(Math.min(0.6, 0.25 * k));
    this.game.camera.kick(0, 1, 6 * k);
    this.game.hitStop(0.06);
    this.flash(0.2);
  }

  /** Anneau d'onde de choc au sol (pieds). */
  shockwave(x: number, y: number, color = 0xffffff, size = 1): void {
    this.particles.emit(x, y - this.bodyY * 0.5, { shape: 'ring', color, count: 1, speed: 0, size: 0.3 * size, life: 0.4, grow: 7, alpha: 0.9 });
  }

  /** Ramassage d'objet / d'âme : petite gerbe montante. */
  pickup(x: number, y: number, color = 0xffd36d): void {
    this.particles.emit(x, y - 20, { color, count: 10, speed: 120, angle: -Math.PI / 2, spread: 1.6, size: 0.4, life: 0.5, gravity: -120, drag: 3 });
    this.particles.emit(x, y - 20, { shape: 'ring', color, count: 1, speed: 0, size: 0.15, life: 0.25, grow: 8, alpha: 0.8 });
    this.lighting.flash(x, y - 20, 140, color, 0.8, 0.2);
  }

  /** Soin : chiffre vert + étincelles. */
  heal(x: number, y: number, amount: number): void {
    this.numbers.show(x, y - this.bodyY - 50, amount, 'heal');
    this.particles.emit(x, y - this.bodyY, { color: 0x8dff9a, count: 14, speed: 60, angle: -Math.PI / 2, spread: 2, size: 0.45, life: 0.8, gravity: -100, jitter: 20 });
  }

  /** Flash plein écran blanc chaud (respecte l'option photosensibilité). */
  flash(alpha = 0.3): void {
    if (this.settings.flashes) this.whiteFlash.alpha = Math.max(this.whiteFlash.alpha, alpha);
  }

  /** Indique le ratio de PV (pulsation rouge sous 30 %). Le gameplay l'appelle aussi après un soin. */
  setHealth(ratio: number): void { this.hpRatio = ratio; }

  private decal(x: number, y: number, color: number, size: number): void {
    let s: Sprite;
    if (this.decalSprites.length >= this.maxDecals) s = this.decalSprites.shift()!;
    else { s = new Sprite(this.tex.scorch); s.anchor.set(0.5); this.decals.addChild(s); }
    s.position.set(x, y);
    s.rotation = Math.random() * Math.PI * 2;
    s.scale.set(size * (0.8 + Math.random() * 0.5), size * 0.55 * (0.8 + Math.random() * 0.5));
    s.tint = mixDark(color);
    s.alpha = 0.75;
    this.decalSprites.push(s);
  }

  // ---------- Frame ----------

  /** À appeler une fois par image, depuis `Scene.render()`. */
  update(frameDt: number): void {
    const dt = this.game.paused ? 0 : frameDt;
    this.t += dt;
    const cam = this.game.camera;
    this.game.camera.shakeScale = this.settings.shake;

    if (this.settings.quality === 'auto' && this.governor.sample(frameDt) && this.level !== 'low') this.applyLevel(lowerQuality(this.level));

    // Lumière du héros (position interpolée lue sur le nœud affiché).
    if (this.playerLight && this.target) {
      const n = this.targetNode;
      this.playerLight.x = n ? n.x : this.target.x;
      this.playerLight.y = (n ? n.y : this.target.y) - 30;
    }

    // Traînée fantôme pendant l'esquive.
    if (this.dashT > 0 && this.targetNode) {
      this.dashT -= dt; this.ghostT -= dt;
      if (this.ghostT <= 0) { this.ghostT = 0.025; this.spawnGhost(this.targetNode); }
    }
    for (let i = this.ghostList.length - 1; i >= 0; i--) {
      const g = this.ghostList[i];
      g.life -= dt;
      if (g.life <= 0) { g.s.destroy(); this.ghostList.splice(i, 1); continue; }
      g.s.alpha = (g.life / 0.28) * 0.55;
    }

    // Braises et poussière d'ambiance.
    this.emberT += dt;
    const r = cam.visibleRect();
    while (this.emberT > 0.05) {
      this.emberT -= 0.05;
      if (Math.random() > this.particles.density) continue;
      const warm = Math.random() < 0.7;
      this.particles.emit(r.x + Math.random() * r.w, r.y + r.h * (0.2 + Math.random() * 0.9), {
        color: warm ? 0xff8a3a : 0x8f7bff, endColor: warm ? 0x5a1a08 : 0x2a2060, count: 1, speed: 24, angle: -Math.PI / 2, spread: 1.2,
        size: 0.14 + Math.random() * 0.1, life: 2.6, drag: 0.2, grow: 0, gravity: -22, alpha: 0.8,
      });
    }

    this.particles.update(dt);
    this.numbers.update(dt);
    this.lighting.update(dt);
    this.fog.update(dt, cam);
    for (const s of this.decalSprites) s.alpha = Math.max(0.25, s.alpha - dt * 0.02);

    // Effets écran.
    this.hurtFlash.alpha = Math.max(0, this.hurtFlash.alpha - frameDt * 2.5);
    this.whiteFlash.alpha = Math.max(0, this.whiteFlash.alpha - frameDt * 4);
    const danger = Math.max(0, 1 - this.hpRatio / 0.3);
    this.lowHp.alpha = danger > 0 ? danger * (0.45 + 0.35 * Math.sin(this.t * (5 + danger * 4))) : 0;
    // Quads plein écran invisibles : on ne les dessine pas (le remplissage coûte cher sur mobile).
    this.lowHp.visible = this.lowHp.alpha > 0.004;
    this.hurtFlash.visible = this.hurtFlash.alpha > 0.004;
    this.whiteFlash.visible = this.whiteFlash.alpha > 0.004;
    // Bloom moins fort quand l'écran est déjà saturé d'effets.
    this.bloom.strength = this.bloomBase * (0.55 + 0.45 * this.particles.crowd) * (this.grade.enabled ? this.grade.params.bloom : 1);
    if (this.grade.enabled) this.grade.update(frameDt, this.game.renderer.width / Math.max(1, this.game.renderer.height));
  }

  private spawnGhost(node: Container): void {
    const body = node.getChildByLabel('body') as Sprite | null;
    if (!body) return;
    const s = new Sprite(body.texture);
    s.anchor.copyFrom(body.anchor);
    s.position.set(node.x + body.x, node.y + body.y);
    s.scale.copyFrom(body.scale);
    s.rotation = body.rotation;
    s.tint = this.heroColor;
    s.blendMode = 'add';
    s.alpha = 0.55;
    this.ghosts.addChild(s);
    this.ghostList.push({ s, life: 0.28 });
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.lighting.destroy();
    this.bloom.destroy();
    this.fog.destroy();
    this.particles.destroy();
    this.numbers.destroy();
    this.grade.destroy();
    this.decals.destroy({ children: true });
    this.ghosts.destroy({ children: true });
    for (const s of [this.vignette, this.lowHp, this.hurtFlash, this.whiteFlash]) s.destroy();
  }
}

/** Assombrit une couleur pour les traces au sol. */
function mixDark(c: number): number {
  const r = ((c >> 16) & 255) * 0.35, g = ((c >> 8) & 255) * 0.35, b = (c & 255) * 0.35;
  return (r << 16) | (g << 8) | b;
}

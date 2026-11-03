import { Container, Graphics, Sprite, Text, TilingSprite } from 'pixi.js';
import {
  Collider, Layers, PhysicsSystem, MovementSystem, Rng, Scene, SystemPriority, Transform, Velocity, View,
  World, installViewCleanup, syncViews, type Contact, type Rect, type Game,
} from '@engine';
import { Enemy, Health, HEROES, Player, Projectile, type HeroId } from '../components';
import { ENEMY_TYPES, spawnBolt, spawnEnemy, spawnHero, type EnemyKind } from '../prefabs';
import { makeFxTextures, makeSeamless, type FxTextures } from '../textures';
import { Vfx } from '../vfx';
import type { FxParticles } from '../vfx/FxParticles';
import type { GameEvents } from '../events';

/** Hauteur du « torse » au-dessus des pieds : les tirs voyagent au sol mais s'affichent à cette hauteur. */
export const BODY_Y = 46;
const WORLD: Rect = { x: -2400, y: -2400, w: 4800, h: 4800 };

/**
 * Scène de démonstration du moteur : un héros, des vagues d'ennemis, des ruines
 * (obstacles statiques), projectiles, dash, caméra, particules, overlay debug (F3).
 * Elle sert de banc d'essai et d'exemple aux autres agents — ce n'est pas le jeu final.
 */
export class DemoScene extends Scene {
  private world = new World();
  private physics = new PhysicsSystem(96);
  private rng = new Rng(1337);
  private fx!: FxTextures;
  private particles!: FxParticles;
  private vfx!: Vfx;
  private torches: Array<{ x: number; y: number }> = [];
  private player = 0;
  private hud!: Text;
  private debugText!: Text;
  private debugGfx = new Graphics();
  private debug = false;
  private kills = 0;
  private spawnTimer = 0;
  private elapsed = 0;
  private time = 0;

  constructor(private readonly hero: HeroId = 'taro') { super(); }

  private get g(): Game<GameEvents> { return this.game as unknown as Game<GameEvents>; }

  enter(): void {
    const { renderer, camera } = this.game;
    this.fx = makeFxTextures();
    installViewCleanup(this.world);

    // Sol peint en mosaïque + teinte d'ambiance.
    const groundTex = makeSeamless(this.game.assets.texture('stone-ground'));
    const ground = new TilingSprite({ texture: groundTex, width: WORLD.w, height: WORLD.h });
    ground.position.set(WORLD.x, WORLD.y);
    ground.tileScale.set(0.75);
    ground.tint = 0x9aa6b8;
    // Deuxième passe de la même texture, plus grande et décalée : casse la répétition visible.
    const ground2 = new TilingSprite({ texture: groundTex, width: WORLD.w, height: WORLD.h });
    ground2.position.set(WORLD.x, WORLD.y);
    ground2.tileScale.set(1.9); ground2.tilePosition.set(311, 157); ground2.tileRotation = 0.6;
    ground2.alpha = 0.35; ground2.tint = 0x6f7d92; ground2.blendMode = 'multiply';
    renderer.layers.ground.addChild(ground, ground2);
    // Taches de mousse / lumière lunaire peintes au sol.
    for (let i = 0; i < 70; i++) {
      const blot = new Sprite(this.fx.light);
      blot.anchor.set(0.5);
      blot.position.set(this.rng.range(WORLD.x, WORLD.x + WORLD.w), this.rng.range(WORLD.y, WORLD.y + WORLD.h));
      blot.scale.set(this.rng.range(1.2, 3.2), this.rng.range(0.8, 2));
      blot.rotation = this.rng.range(0, Math.PI);
      blot.tint = this.rng.pick([0x3b6b8f, 0x2f5a3a, 0x6a4c8f]);
      blot.alpha = this.rng.range(0.5, 1);
      blot.blendMode = 'add';
      renderer.layers.decals.addChild(blot);
    }

    // Citadelle en ruine au nord, en toile de fond.
    const cit = new Sprite(this.game.assets.texture('ruined-citadel'));
    cit.anchor.set(0.5, 1); cit.position.set(0, WORLD.y + 40); cit.scale.set(2.2);
    cit.tint = 0xb8c2d4;
    renderer.layers.background.addChild(cit);

    // Ruines = obstacles statiques : piliers brisés peints avec la texture de pierre.
    const stone = this.game.assets.texture('stone-ground');
    for (let i = 0; i < 46; i++) {
      const x = this.rng.range(WORLD.x + 200, WORLD.x + WORLD.w - 200);
      const y = this.rng.range(WORLD.y + 200, WORLD.y + WORLD.h - 200);
      if (Math.hypot(x, y) < 420) continue;
      const ruin = this.makeRuin(stone);
      ruin.position.set(x, y); ruin.zIndex = y;
      renderer.layers.entities.addChild(ruin);
      const w = ruin.width * 0.8;
      this.physics.walls.push({ x: x - w / 2, y: y - 26, w, h: 34 });
      if (i % 4 === 0) this.torches.push({ x: x + w * 0.7, y: y + 8 });
    }
    this.physics.bounds = WORLD;
    this.physics.onContact = (c) => this.onContact(c);

    // Rendu / VFX : éclairage, brouillard, bloom, particules, chiffres de dégâts, effets écran.
    // Le directeur s'abonne seul aux événements de jeu (impacts, morts, dash, tirs, blessures).
    this.vfx = new Vfx(this.g, { bodyY: BODY_Y });
    this.particles = this.vfx.particles;
    (window as unknown as { vfx: Vfx }).vfx = this.vfx; // console : window.vfx.setQuality('low')
    renderer.layers.overlay.addChild(this.debugGfx);
    // Braseros près de certaines ruines : lumière vacillante.
    for (const t of this.torches) {
      this.vfx.lighting.add({ x: t.x, y: t.y - 20, radius: 300, color: 0xff8a3a, intensity: 0.95, flicker: 0.25 });
      const bowl = new Graphics().ellipse(0, 0, 14, 6).fill({ color: 0x1a120c }).stroke({ color: 0x0b0806, width: 2 })
        .rect(-3, 0, 6, 18).fill({ color: 0x2a1c12 });
      bowl.position.set(t.x, t.y - 18); bowl.zIndex = t.y;
      renderer.layers.entities.addChild(bowl);
    }

    this.hud = new Text({ text: '', style: { fontFamily: 'Georgia, serif', fontSize: 18, fill: 0xf1e5ca, dropShadow: { color: 0x000000, distance: 2, alpha: 0.9, blur: 2 } } });
    this.hud.position.set(16, 12);
    this.debugText = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 12, fill: 0x9dffb0 } });
    this.debugText.position.set(16, 44);
    renderer.layers.hud.addChild(this.hud);
    renderer.layers.debug.addChild(this.debugText);

    this.player = spawnHero(this.game, this.world, this.fx, this.hero, 0, 0);
    const pt = this.world.get(this.player, Transform)!;
    camera.follow(pt, this.world.get(this.player, Velocity)!);
    this.vfx.follow(pt, this.world.get(this.player, View)!.node, HEROES[this.hero].color);
    camera.bounds = WORLD;
    camera.zoom = camera.targetZoom = window.innerWidth < 700 ? 0.7 : 1;

    this.world
      .addSystem({ name: 'player', priority: SystemPriority.Input, update: (_w, dt) => this.updatePlayer(dt) })
      .addSystem({ name: 'chase', priority: SystemPriority.AI, update: (_w, dt) => this.updateChase(dt) })
      .addSystem({ name: 'spawn', priority: SystemPriority.Gameplay, update: (_w, dt) => this.updateSpawns(dt) })
      .addSystem(new MovementSystem())
      .addSystem(this.physics);

  }

  exit(): void {
    this.vfx.destroy();
    this.world.clear();
    for (const l of Object.values(this.game.renderer.layers)) l.removeChildren().forEach((c) => c.destroy());
  }

  update(dt: number): void {
    this.time += dt;
    this.elapsed += dt;
    if (this.game.input.pressed('debug')) this.debug = !this.debug;
    this.world.update(dt);
  }

  // ---------- Systèmes de la démo ----------

  private updatePlayer(dt: number): void {
    const { input, camera } = this.game;
    const p = this.world.get(this.player, Player)!;
    const t = this.world.get(this.player, Transform)!;
    const v = this.world.get(this.player, Velocity)!;
    input.updateAim(t, (sx, sy) => camera.screenToWorld(sx, sy));

    p.dashCd = Math.max(0, p.dashCd - dt);
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);

    if (p.dashTime > 0) {
      p.dashTime -= dt;
      if (Math.random() < 0.8) this.particles.emit(t.x, t.y - BODY_Y, { color: HEROES[p.hero].color, count: 2, speed: 40, size: 0.6, life: 0.35, alpha: 0.6 });
    } else {
      // Accélération douce vers la vitesse cible (sensation « lourde » mais réactive).
      const k = 1 - Math.exp(-14 * dt);
      v.x += (input.move.x * p.speed - v.x) * k;
      v.y += (input.move.y * p.speed - v.y) * k;
    }

    if (input.pressed('dash') && p.dashCd <= 0) {
      let dx = input.move.x, dy = input.move.y;
      if (Math.hypot(dx, dy) < 0.1) { dx = input.aim.x; dy = input.aim.y; }
      const l = Math.hypot(dx, dy) || 1;
      v.x = (dx / l) * 820; v.y = (dy / l) * 820;
      p.dashTime = 0.16; p.dashCd = 0.7; p.invuln = 0.3;
      this.g.events.emit('player:dash', { x: t.x, y: t.y });
    }

    if (Math.abs(input.aim.x) > 0.05) p.facing = input.aim.x > 0 ? 1 : -1;

    if (input.held('attack') && p.fireCd <= 0 && (input.aim.x || input.aim.y)) {
      p.fireCd = 0.16;
      const ox = t.x + input.aim.x * 30, oy = t.y + input.aim.y * 30;
      // Légère dispersion : le tir paraît plus vivant.
      const a = Math.atan2(input.aim.y, input.aim.x) + (Math.random() - 0.5) * 0.06;
      spawnBolt(this.game, this.world, this.fx, ox, oy, Math.cos(a), Math.sin(a), HEROES[p.hero].color);
      this.g.events.emit('player:shoot', { x: ox, y: oy, dirX: Math.cos(a), dirY: Math.sin(a) });
    }
  }

  private updateChase(dt: number): void {
    const pt = this.world.get(this.player, Transform)!;
    for (const e of this.world.query(Enemy, Transform, Velocity)) {
      const en = this.world.get(e, Enemy)!, t = this.world.get(e, Transform)!, v = this.world.get(e, Velocity)!;
      en.flash = Math.max(0, en.flash - dt);
      en.spawnT += dt;
      const dx = pt.x - t.x, dy = pt.y - t.y;
      const d = Math.hypot(dx, dy) || 1;
      const k = 1 - Math.exp(-5 * dt);
      v.x += ((dx / d) * en.speed - v.x) * k;
      v.y += ((dy / d) * en.speed - v.y) * k;
    }
  }

  private updateSpawns(dt: number): void {
    this.spawnTimer -= dt;
    let alive = 0;
    for (const _ of this.world.query(Enemy)) alive++;
    const cap = Math.min(30 + Math.floor(this.elapsed * 1.5), 220);
    if (this.spawnTimer > 0 || alive >= cap) return;
    this.spawnTimer = Math.max(0.15, 1.1 - this.elapsed * 0.012);
    const pt = this.world.get(this.player, Transform)!;
    const r = this.game.camera.visibleRect(120);
    const radius = Math.hypot(r.w, r.h) / 2;
    const n = 1 + Math.floor(this.elapsed / 20);
    const kinds = Object.keys(ENEMY_TYPES) as EnemyKind[];
    const weights = kinds.map((k) => ENEMY_TYPES[k].weight * (k === 'shadeElite' && this.elapsed < 40 ? 0 : 1));
    const base = this.rng.range(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = base + this.rng.range(-0.5, 0.5);
      const x = Math.max(WORLD.x + 40, Math.min(WORLD.x + WORLD.w - 40, pt.x + Math.cos(a) * radius));
      const y = Math.max(WORLD.y + 40, Math.min(WORLD.y + WORLD.h - 40, pt.y + Math.sin(a) * radius));
      spawnEnemy(this.game, this.world, this.fx, this.rng.weighted(kinds, weights), x, y);
    }
  }

  private onContact(c: Contact): void {
    const w = this.world;
    for (const [a, b] of [[c.a, c.b], [c.b, c.a]] as const) {
      // Projectile → ennemi
      const pr = w.get(a, Projectile);
      if (pr && w.has(b, Enemy) && w.isAlive(a) && !pr.hit.has(b)) {
        pr.hit.add(b);
        if (--pr.pierce <= 0) w.destroy(a);
        // Démo : dégâts variables + 15 % de critiques (affichage ×10 en attendant l'équilibrage).
        const crit = this.rng.next() < 0.15;
        this.damageEnemy(b, pr.damage * this.rng.range(0.8, 1.25) * (crit ? 2 : 1), w.get(a, Velocity)!, crit);
      }
      // Ennemi → joueur
      if (a === this.player && w.has(b, Enemy)) this.hurtPlayer(b);
    }
  }

  private damageEnemy(e: number, dmg: number, from: { x: number; y: number }, crit = false): void {
    if (!this.world.isAlive(e)) return;
    const w = this.world, h = w.get(e, Health)!, en = w.get(e, Enemy)!, t = w.get(e, Transform)!, v = w.get(e, Velocity)!;
    h.hp -= dmg;
    en.flash = 0.1;
    const l = Math.hypot(from.x, from.y) || 1;
    v.x += (from.x / l) * 220; v.y += (from.y / l) * 220; // recul
    this.g.events.emit('enemy:hit', { id: e, x: t.x, y: t.y, damage: Math.round(dmg * 10), crit });
    if (h.hp > 0) return;
    this.kills++;
    this.g.events.emit('enemy:killed', { id: e, kind: en.kind, x: t.x, y: t.y });
    w.destroy(e);
  }

  private hurtPlayer(enemy: number): void {
    const p = this.world.get(this.player, Player)!;
    if (p.invuln > 0) return;
    const h = this.world.get(this.player, Health)!, en = this.world.get(enemy, Enemy)!;
    h.hp = Math.max(0, h.hp - en.touchDamage);
    p.invuln = 0.7;
    this.g.events.emit('player:hurt', { hp: h.hp, max: h.max, damage: en.touchDamage });
    if (h.hp <= 0) { h.hp = h.max; this.vfx.setHealth(1); this.kills = 0; this.elapsed = 0; for (const e of this.world.query(Enemy)) this.world.destroy(e); }
  }

  // ---------- Rendu ----------

  render(alpha: number, frameDt: number): void {
    syncViews(this.world, this.game.camera, alpha);
    const p = this.world.get(this.player, Player)!;
    const v = this.world.get(this.player, Velocity)!;
    const h = this.world.get(this.player, Health)!;

    // Animation procédurale : respiration à l'arrêt, rebond en marche, clignement d'invulnérabilité.
    const speed = Math.hypot(v.x, v.y);
    this.animateBody(this.player, speed / p.speed, p.facing, p.invuln > 0 && Math.floor(this.time * 20) % 2 === 0 ? 0.45 : 1, 0, 0);
    for (const e of this.world.query(Enemy, View)) {
      const en = this.world.get(e, Enemy)!, ev = this.world.get(e, Velocity)!;
      this.animateBody(e, Math.hypot(ev.x, ev.y) / en.speed, ev.x >= 0 ? 1 : -1, Math.min(1, en.spawnT * 3), en.flash, e * 0.37);
    }

    // Projectiles lumineux : une lumière par tir (position affichée, interpolée).
    const heroColor = HEROES[p.hero].color;
    for (const e of this.world.query(Projectile, View)) {
      const n = this.world.get(e, View)!.node;
      if (n.visible) this.vfx.lighting.push(n.x, n.y - BODY_Y, 130, heroColor, 0.7);
    }
    // Flammes des braseros (seulement à l'écran).
    const vr = this.game.camera.visibleRect(40);
    for (const tc of this.torches) {
      if (tc.x < vr.x || tc.x > vr.x + vr.w || tc.y < vr.y || tc.y > vr.y + vr.h || Math.random() > frameDt * 40) continue;
      this.particles.emit(tc.x, tc.y - 24, { color: 0xffb04a, endColor: 0xa02010, count: 1, speed: 50, angle: -Math.PI / 2, spread: 0.6, size: 0.55, life: 0.55, drag: 1, grow: -1.2, gravity: -60, jitter: 6 });
    }
    this.vfx.update(frameDt);

    let enemies = 0;
    for (const _ of this.world.query(Enemy)) enemies++;
    this.hud.text = `${HEROES[p.hero].name}  ·  PV ${Math.ceil(h.hp)}/${h.max}  ·  Éliminés ${this.kills}  ·  ${Math.floor(this.elapsed)} s`;

    this.debugText.visible = this.debug;
    this.debugGfx.clear();
    if (this.debug) {
      const s = this.game.stats;
      this.debugText.text = `FPS ${s.fps} (${s.frameMs.toFixed(1)} ms)  tick ${this.game.loop.tick}\nentités ${this.world.count}  ennemis ${enemies}  particules ${this.particles.count}  qualité ${this.vfx.level}\ncaméra ${this.game.camera.x.toFixed(0)},${this.game.camera.y.toFixed(0)} zoom ${this.game.camera.zoom.toFixed(2)}  entrée ${this.game.input.lastDevice}`;
      for (const e of this.world.query(Collider, Transform)) {
        const c = this.world.get(e, Collider)!, tr = this.world.get(e, Transform)!;
        const col = c.layer & Layers.Player ? 0x6dff8a : c.layer & Layers.Enemy ? 0xff5a5a : 0x7fd4ff;
        this.debugGfx.circle(tr.x, tr.y, c.radius).stroke({ color: col, width: 1.5, alpha: 0.9 });
      }
      for (const wl of this.physics.walls) this.debugGfx.rect(wl.x, wl.y, wl.w, wl.h).stroke({ color: 0xffd36d, width: 2 });
    }
  }

  /** Pilier brisé : base, fût, éclats ; rempli de texture de pierre et ombré. */
  private makeRuin(stone: import('pixi.js').Texture): Container {
    const c = new Container();
    const sh = new Sprite(this.fx.shadow);
    sh.anchor.set(0.5); sh.width = 190; sh.height = 60; sh.y = -6;
    const w = this.rng.range(46, 70), h = this.rng.range(90, 220), lean = this.rng.range(-8, 8);
    const g = new Graphics();
    // Socle
    g.roundRect(-w * 0.95, -26, w * 1.9, 30, 6).fill({ texture: stone, color: 0x8f9aae }).stroke({ color: 0x0b111c, width: 3 });
    // Fût avec sommet cassé en dents de scie
    const pts = [-w / 2, -22, -w / 2 + lean, -h];
    const teeth = 4;
    for (let i = 1; i <= teeth; i++) pts.push(-w / 2 + lean + (w * i) / teeth, -h + (i % 2 ? this.rng.range(14, 34) : this.rng.range(-6, 6)));
    pts.push(w / 2, -22);
    g.poly(pts).fill({ texture: stone, color: 0xa7b2c4 }).stroke({ color: 0x0b111c, width: 3 });
    // Ombre latérale (volume) et rehaut de lumière lunaire
    g.poly([w / 6, -22, w / 6 + lean, -h + 18, w / 2 + lean * 0.9, -h + 20, w / 2, -22]).fill({ color: 0x050a14, alpha: 0.45 });
    g.rect(-w / 2 + 4 + lean * 0.5, -h * 0.85, 4, h * 0.6).fill({ color: 0xcfe0ff, alpha: 0.18 });
    // Cannelures
    for (let i = -1; i <= 1; i++) g.moveTo(i * w * 0.22, -26).lineTo(i * w * 0.22 + lean * 0.8, -h + 30).stroke({ color: 0x0b111c, width: 2, alpha: 0.35 });
    // Éclats au sol
    for (let i = 0; i < 3; i++) {
      const fx = this.rng.range(-w * 1.6, w * 1.6), fs = this.rng.range(8, 16);
      g.poly([fx - fs, 0, fx - fs * 0.3, -fs, fx + fs, -fs * 0.4, fx + fs * 0.6, 2]).fill({ texture: stone, color: 0x7d889b }).stroke({ color: 0x0b111c, width: 2 });
    }
    c.addChild(sh, g);
    return c;
  }

  private animateBody(e: number, moving: number, facing: number, alpha: number, flash: number, phase: number): void {
    const node = this.world.get(e, View)!.node as Container;
    const body = node.getChildByLabel('body') as Sprite;
    if (!body.visible) return;
    const base = Math.abs(body.scale.y);
    const m = Math.min(1, moving);
    const bob = Math.sin(this.time * 14 + phase) * m;
    const breathe = Math.sin(this.time * 2.4 + phase) * (1 - m);
    body.y = -Math.abs(bob) * 5;
    body.rotation = bob * 0.05;
    const sx = base * (1 + breathe * 0.015 - Math.abs(bob) * 0.03) * (flash > 0 ? 1.08 : 1);
    body.scale.x = facing * sx;
    body.scale.y = base;
    body.skew.x = 0;
    body.alpha = alpha;
    body.tint = flash > 0 ? 0xff7a7a : 0xffffff;
  }
}

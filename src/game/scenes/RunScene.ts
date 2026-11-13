import { ColorMatrixFilter, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import {
  Collider, Layers, Lifetime, MovementSystem, PhysicsSystem, Rng, Scene, SystemPriority, Transform, Velocity, View,
  World, attachView, installViewCleanup, makeTransform, makeVelocity, syncViews, CameraTarget,
  type Contact, type Game, type Rect,
} from '@engine';
import { Health, type HeroId } from '../components';
import type { GameEvents } from '../events';
import { makeFxTextures, type FxTextures } from '../textures';
import { Vfx } from '../vfx';
import type { FrameQuad } from '../vfx/combat/FrameQuad';
import { Foe, Hero, Shot, type FoeC, type HeroC } from '../combat/components';
import { BODY_Y, type CombatCtx, type ParticleSink, type FoeHitOpts, type HeroHitOpts } from '../combat/context';
import { BOSS_DEFS, ENEMY_DEFS, HERO_DEFS, REGIONS, STATUS_COLORS, type BossId, type EnemyId, type FoeStatusId, type StatusId } from '../combat/data';
import { BlessingEngine, DEFAULT_RUN_CONFIG, type RunConfig } from '../combat/blessings';
import { LootSystem, type Item, type LootConfig } from '../combat/loot';
import { RunStats } from '../combat/stats';
import { BASE_MODS, streamSeed, type RunMods } from '../modes';
import { applyStatus, consumeOnHit } from '../combat/status';
import { CombatFeedback } from '../combat/feedback';
import { HazardField, type Hazard } from '../combat/hazards';
import { DODGE, castSkill, updateHero } from '../combat/hero';
import { updateFoes } from '../combat/foes';
import { enterPhase, updateBosses } from '../combat/boss';
import { WaveDirector } from '../combat/waves';
import { ChapterArena } from '../arena/ChapterArena';
import { RIG_LEN, rigBaker, rigFrame, type RigAnim, type RigSheet } from '../rig';
import { bossOrder, foeOrder, heroOrder, prefetch, waveOrders, type RigOrder } from '../rig/roster';
import { CAMPAIGN_WAVES, regionForWave, bossScaling, enemyPool, enemyScaling, mitigate, phaseForHp, zoneHits, type WavePlan, type Zone } from '../combat/rules';

/** Arène de combat : rectangle borné, ruines en obstacles. */
const ARENA: Rect = { x: -1500, y: -1300, w: 3000, h: 2600 };

/**
 * Combattants v2 (squelette animé). `?persos=v1` dans l'URL rend les anciens sprites (comparaison).
 * Désactivé hors navigateur (tests) : pas de Canvas 2D.
 */
const RIG_ON = typeof document !== 'undefined' && typeof location !== 'undefined' && new URLSearchParams(location.search).get('persos') !== 'v1';

/** État d'animation d'un combattant v2. */
interface RigState { sheet: RigSheet; anim: RigAnim; t: number; hurt: number; atk: number; wind: number; flash: number; hp: number; prevState: string; lastHurt?: number; aim?: number; shotAt?: number }

/** Instantané lisible par l'UI (HUD DOM, mobile) à chaque image. */
/** Résumé de fin de run (pour l'écran de fin et la sauvegarde). */
/** Altérations du héros, pour « Abattu par … » en fin de run. */
const STATUS_FR: Record<string, string> = { burn: 'Brûlure', frost: 'Givre', void: 'Néant', slow: 'Entrave' };

export interface RunResult {
  hero: HeroId; wave: number; wavesCleared: number; bossWaves: number[]; won: boolean; kills: number; timeSec: number; bestCombo: number; perfectDodges: number;
  /** Compteurs pour recordRunEnd (succès). */
  counters: Record<string, number>;
  /** Boss le plus vite vaincu (s), Infinity si aucun. */
  fastestBossKill: number;
  /** Poussière d'étoile gagnée (démantèlement). */
  dust: number;
  /** Pitié légendaire du profil à reporter. */
  legendaryPity: number;
  blessings: Array<{ id: string; name: string; patron: string; rarity: string }>;
  items: Item[];
  /** Dernier coup reçu avant la chute (nom de l'ennemi ou du boss), null si victoire / abandon. */
  killedBy: string | null;
  /** Conseil contre ce qui a porté le dernier coup (data.ts > hint). */
  killedHint: string | null;
  /** Dégâts reçus par source, du plus grand au plus petit (écran de fin). */
  damageBy: Array<{ name: string; damage: number }>;
  /** Statistiques détaillées (écran de fin). */
  detail: RunDetail;
}

/** Statistiques détaillées d'une run (retour des testeurs : chrono et chiffres de fin de run). */
export interface RunDetail {
  /** Dégâts infligés par source (techniques, altérations, bénédictions), du plus grand au plus petit. */
  dealtBy: Array<{ name: string; damage: number }>;
  dealt: number; taken: number; hits: number; crits: number; maxHit: number; potions: number;
  /** Durée de chaque vague franchie (s). */
  waves: Array<{ wave: number; sec: number; boss: boolean }>;
}

/** Options de run venant de la méta-progression (Sanctuaire). */
export interface RunOptions {
  run?: RunConfig; loot?: Partial<LootConfig>;
  /** Pactes, défi quotidien, Cauchemar. */
  mods?: RunMods;
  /** Graine (défi quotidien) : vagues, offres et butin tirés de flux séparés. */
  seed?: string;
  mode?: 'survie' | 'cauchemar';
  /** Apparence (cosmétiques de maîtrise) : couleur du sillage, de l'aura, teinte de la tenue. */
  look?: { trail?: number; aura?: number; skinHue?: number };
  /** Points de Pacte de la Brume engagés (succès, récompenses). */
  pactPoints?: number;
}

export interface RunSnapshot {
  hero: HeroId; heroName: string;
  hp: number; maxHp: number; mana: number; maxMana: number; shield: number;
  skills: Array<{ name: string; cd: number; maxCd: number; cost: number; ready: boolean }>;
  dashCharges: number; dashMax: number; dashCd: number; potions: number; gold: number;
  wave: number; waveTotal: number; region: string; theme: string; phase: 'intermission' | 'active' | 'done';
  enemiesLeft: number; kills: number; combo: number; time: number; over: boolean;
  boss: { name: string; subtitle: string; hp: number; maxHp: number; phase: number; phaseName: string; color: number } | null;
}

/**
 * Scène de run : un héros, les vagues 1 → 20 (boss aux vagues 5, 10, 15, 20) puis mode infini.
 * Implémente CombatCtx : les modules de combat/ agissent à travers elle.
 *
 * URL de test : `?hero=mei&wave=10` (commencer directement à une vague, ex. un boss).
 */
export class RunScene extends Scene implements CombatCtx {
  world = new World();
  physics = new PhysicsSystem(96);
  /** Graine imposée (tests, robot) ; sinon l'horloge. Le défi quotidien a sa propre graine (RunOptions.seed). */
  static seed: number | null = null;
  rng = new Rng(RunScene.seed ?? Date.now());
  fx!: FxTextures;
  particles!: ParticleSink;
  vfx!: Vfx;
  private arena!: ChapterArena;
  hazards!: HazardField;
  feedback!: CombatFeedback;
  bounds = ARENA;
  player = 0;
  time = 0;
  bless!: BlessingEngine;
  loot!: LootSystem;
  stats = new RunStats();
  private bossSpawnT = 0;
  private timers: Array<{ at: number; fn: () => void }> = [];
  private lastAttackT = 0;
  private avoidedDash = -1;
  director: WaveDirector;
  /** L'UI met ce drapeau à vrai pour garder l'intermission ouverte (choix de bénédiction). */
  holdIntermission = false;
  /** Mettre à faux si l'UI fournit son propre HUD (le HUD Pixi minimal est alors masqué). */
  showBuiltinHud = true;
  /** Appelé à chaque image après le rendu (l'UI DOM y lit `snapshot()`). */
  onFrame: ((s: RunScene) => void) | null = null;
  /** Fin de run (mort) : si défini, remplace l'écran « recommencer » intégré. */
  onEnd: ((r: RunResult) => void) | null = null;
  /** Bannières (vague, boss, phase) : si défini, l'UI DOM les affiche à la place du texte Pixi. */
  onAnnounce: ((title: string, sub: string, color?: number) => void) | null = null;
  private endSent = false;
  private offResize: (() => void) | null = null;

  private kills = 0;
  private combo = 0;
  private bestCombo = 0;
  private comboT = 0;
  private perfectStreak = 0;
  private bossesKilled = 0;
  private bossWaves: number[] = [];
  private wavesCleared = 0;
  private perfectTotal = 0;
  private dealtBy: Record<string, number> = {};
  private hits = 0;
  private crits = 0;
  private potionsStart = 0;
  private potionsGot = 0;
  private waveTimes: RunDetail['waves'] = [];
  private trailT = 0;
  private trails: Array<{ g: Graphics; life: number }> = [];
  private waveKills = 0;
  private waveDamage = 0;
  private waveStartT = 0;
  private over = false;
  private overT = 0;
  private bossEntity = 0;
  private renderTime = 0;
  /** Feuilles cuites par clé (héros, ennemi + teinte, boss). */
  private rigs = new Map<number, RigState>();
  private corpses: Array<{ node: Container; sheet: RigSheet; t: number; quad: FrameQuad | null; color: number }> = [];
  private heroAtkSeq = 0;
  private heroAtkSeen = 0;
  private offRig: (() => void) | null = null;

  // Rendu
  private hud!: Text;
  private bossBar!: Graphics;
  private bossText!: Text;
  private skillBar!: Container;
  private skillGfx!: Graphics;
  private skillTexts: Text[] = [];
  private banner!: Text;
  private bannerSub!: Text;
  private bannerT = 0;
  private center!: Text;

  readonly mods: RunMods;
  get mode(): 'survie' | 'cauchemar' { return this.opts.mode ?? 'survie'; }
  private won = false;
  private riftT = 0;
  private chronoT = 0;

  constructor(private heroId: HeroId = 'taro', private readonly startWave = 1, private readonly opts: RunOptions = {}) {
    super();
    this.mods = opts.mods ?? BASE_MODS;
    if (opts.seed) this.rng = new Rng(streamSeed(opts.seed, 'waves'));
    this.director = new WaveDirector(this.rng, startWave);
    this.director.adjust = (p) => this.adjustPlan(p);
  }

  /** La run s'arrête après cette vague (défi quotidien). */
  isFinalWave(wave: number): boolean { return this.mods.maxWaves > 0 && wave >= this.mods.maxWaves; }

  /** Ennemis et élites en plus (Marée Noire, Garde Corrompue). */
  private adjustPlan(plan: WavePlan): WavePlan {
    const m = this.mods;
    if (!m.foeCount && !m.extraElites) return plan;
    const packs = plan.packs.map((p) => [...p]);
    if (!packs.length) return plan;
    const all = packs.flat().filter((id) => !ENEMY_DEFS[id].elite);
    const extra = Math.round(all.length * m.foeCount);
    for (let k = 0; k < extra && all.length; k++) packs[this.rng.int(0, packs.length - 1)].push(this.rng.pick(all));
    const elites = enemyPool(plan.wave).filter((d) => d.elite);
    for (let k = 0; k < (plan.boss ? 0 : m.extraElites) && elites.length; k++) packs[Math.floor(packs.length * (0.4 + 0.5 * this.rng.next()))].push(this.rng.pick(elites).id);
    return { ...plan, packs };
  }

  /** Le jeu, typé avec les événements de jeu (exposé aux modules de combat). */
  get g(): Game<GameEvents> { return this.game as unknown as Game<GameEvents>; }
  get wave(): number { return this.director.wave; }

  // ================================================================ Cycle de vie

  enter(): void {
    const { renderer, camera } = this.game;
    this.fx = makeFxTextures();
    installViewCleanup(this.world);
    this.buildArena();
    this.hazards = new HazardField(renderer.layers.decals);
    // Effets (agent VFX) : lumière, bloom, brume, particules, chiffres de dégâts, flashs.
    // Il réagit seul à enemy:hit / enemy:killed / player:hurt / player:dash / player:shoot.
    this.vfx = new Vfx(this.g, {
      bodyY: BODY_Y,
      heavyKinds: ['brute', 'shadeElite', 'ironRam', 'voidHerald', ...Object.keys(BOSS_DEFS)],
      kindColors: { ashMage: 0xff7a3a, frostWraith: 0x8bdefb, moonStalker: 0x8bb0ff, voidHerald: 0xa070ff, eclipseReaver: 0xd070c0 },
    });
    (window as unknown as { vfx: Vfx }).vfx = this.vfx;
    this.arena.attach(this.vfx);
    this.particles = this.vfx.particles;
    this.feedback = new CombatFeedback(renderer.layers.overlay);
    this.feedback.fancy = this.vfx.combat;
    this.buildHud();

    this.physics.bounds = ARENA;
    this.physics.onContact = (c) => this.onContact(c);
    const seed = this.opts.seed;
    this.bless = new BlessingEngine(this, this.opts.run ?? DEFAULT_RUN_CONFIG, seed ? new Rng(streamSeed(seed, 'blessings')) : undefined);
    const lc: LootConfig = { hero: this.heroId, luckPct: 0, firstBossLegendary: false, legendaryPity: 0, ancestralUnlocked: false, ilvlBonus: 0, ...this.opts.loot };
    lc.ilvlBonus += this.mods.ilvlBonus;
    if (this.mods.lootMin !== 'common') lc.minRarity = this.mods.lootMin;
    if (this.opts.mode === 'cauchemar') lc.ancestralUnlocked = true;
    this.loot = new LootSystem(this, lc, seed ? new Rng(streamSeed(seed, 'loot')) : undefined);
    this.loot.onChange = () => { this.bless.itemBonus = this.loot.blessBonus(); this.recomputeHero(); };
    this.bless.echo = (skill, scale) => { const h = this.world.get(this.player, Hero); if (h) castSkill(this, h, skill, scale); };
    this.g.events.on('player:skill', () => { this.lastAttackT = this.time; });
    this.offRig = this.g.events.on('player:skill', () => { this.heroAtkSeq++; });
    // Combattants de cette run : on ne garde en cache que ceux-là, et on lance leur cuisson tout de suite.
    if (RIG_ON) {
      const orders = [heroOrder(this.heroId), ...waveOrders(this.startWave)].filter((o): o is RigOrder => !!o);
      rigBaker.retain(new Set(orders.map((o) => o.key)));
      prefetch(orders);
    }
    this.spawnHero();
    camera.bounds = ARENA;
    camera.zoom = camera.targetZoom = this.baseZoom();

    this.world
      .addSystem({ name: 'hero', priority: SystemPriority.Input, update: (_w, dt) => updateHero(this, dt) })
      .addSystem({ name: 'foes', priority: SystemPriority.AI, update: (_w, dt) => updateFoes(this, dt) })
      .addSystem({ name: 'bosses', priority: SystemPriority.AI + 10, update: (_w, dt) => updateBosses(this, dt) })
      .addSystem({ name: 'waves', priority: SystemPriority.Gameplay, update: (_w, dt) => this.updateWaves(dt) })
      .addSystem({ name: 'blessings', priority: SystemPriority.Gameplay + 5, update: (_w, dt) => { this.bless.update(dt); this.loot.update(dt); } })
      .addSystem({ name: 'hazards', priority: SystemPriority.Gameplay + 10, update: (_w, dt) => this.hazards.update(dt, (h, first) => this.detonate(h, first), (z) => this.anyFoeIn(z)) })
      .addSystem({ name: 'lifetime', priority: SystemPriority.Gameplay + 20, update: (w, dt) => {
        for (const e of w.query(Lifetime)) { const l = w.get(e, Lifetime)!; if ((l.remaining -= dt) <= 0) w.destroy(e); }
      } })
      .addSystem({ name: 'hero-mask', priority: SystemPriority.Movement - 1, update: (w) => {
        // Pendant une esquive ou une ruée, le héros traverse les ennemis.
        const h = w.get(this.player, Hero)!, col = w.get(this.player, Collider)!;
        col.mask = h.dashT > 0 || h.rush ? Layers.Wall | Layers.EnemyShot : Layers.Enemy | Layers.Wall | Layers.EnemyShot;
      } })
      .addSystem(new MovementSystem())
      .addSystem(this.physics);

    // Rotation de l'écran (portrait ↔ paysage) : le HUD Pixi et le zoom suivent.
    const resize = (w: number, h: number) => { this.layoutHud(w, h); camera.targetZoom = this.baseZoom(); };
    resize(renderer.width, renderer.height);
    this.offResize = renderer.onResize(resize);
    this.g.events.emit('run:start', { hero: this.heroId, wave: this.startWave });
    this.announce(HERO_DEFS[this.heroId].name, HERO_DEFS[this.heroId].role, HERO_DEFS[this.heroId].color);
  }

  exit(): void {
    this.offResize?.();
    this.offRig?.();
    this.rigs.clear(); this.corpses = [];
    this.arena.destroy();
    this.vfx.destroy();
    this.hazards.clear();
    this.world.clear();
    for (const l of Object.values(this.g.renderer.layers)) l.removeChildren().forEach((c) => c.destroy());
  }

  update(dt: number): void {
    this.time += dt;
    if (this.over) {
      this.overT += dt;
      if (this.onEnd) { if (this.overT > 1.6 && !this.endSent) { this.endSent = true; this.onEnd(this.result()); } }
      else this.updateGameOverInput();
      this.world.update(dt * 0.25);
      return;
    }
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].at <= this.time) { const t = this.timers[i]; this.timers.splice(i, 1); t.fn(); }
    }
    this.comboT -= dt;
    if (this.comboT <= 0 && this.combo > 0) this.combo = 0;
    this.updateTrail(dt);
    this.director.hold = this.holdIntermission;
    this.world.update(dt);
  }

  /** Outils de test (console : game.scenes.current.debug…) : blesse le boss d'une fraction de ses PV, soigne le héros. */
  debugHitBoss(frac = 0.05): void {
    const hp = this.bossEntity ? this.world.get(this.bossEntity, Health) : undefined;
    if (hp) this.damageFoe(this.bossEntity, Math.round(hp.max * frac), {});
  }
  /** Test : tous les ennemis (hors boss) reçoivent un coup direct de `frac` de leurs PV max. */
  debugHitAll(frac = 1): void {
    for (const e of [...this.world.query(Foe)]) {
      const f = this.world.get(e, Foe), hp = this.world.get(e, Health);
      if (f && hp && !f.boss) this.damageFoe(e, Math.ceil(hp.max * frac), { skill: 0 });
    }
  }
  debugKillHero(): void {
    const h = this.world.get(this.player, Hero)!, hp = this.world.get(this.player, Health)!;
    h.invuln = 0; h.shield = 0; h.dashT = 0;
    this.hurtHero(1e6, {});
    if (hp.hp > 0 && !this.over) { hp.hp = 0; this.die(); }
  }
  debugHeal(): void { const hp = this.world.get(this.player, Health)!; hp.hp = hp.max; }

  /** Exécute `fn` après `sec` secondes de temps de jeu (suspendu pendant la pause). */
  later(sec: number, fn: () => void): void { this.timers.push({ at: this.time + sec, fn }); }

  /** Passe à la vague suivante (à appeler par l'UI après un choix de bénédiction). */
  nextWave(): void { this.holdIntermission = false; this.director.next(); }

  // ================================================================ Fabriques

  private spawnHero(): void {
    const d = HERO_DEFS[this.heroId];
    const e = (this.player = this.world.create());
    this.world.add(e, Transform, makeTransform(0, 200));
    this.world.add(e, Velocity, makeVelocity(1400, 0));
    this.world.add(e, Collider, { radius: 22, layer: Layers.Player, mask: Layers.Enemy | Layers.Wall | Layers.EnemyShot, solid: true, mass: 4 });
    this.world.add(e, Health, { hp: d.base.maxHp, max: d.base.maxHp });
    this.world.add(e, Hero, {
      def: d, mana: d.base.maxMana, maxMana: d.base.maxMana, atk: d.base.atk, def_: d.base.def, crit: d.base.crit, speed: d.base.speed,
      shield: 0, cds: [0, 0, 0, 0], dashCd: 0, dashCharges: DODGE.charges, dashT: 0, dashAt: -9, perfectReady: false, atkMul: 1,
      dashMax: DODGE.charges, dashRecharge: DODGE.recharge, cdMul: 1, atkSpd: 0,
      invuln: 1, lock: 0, facing: 1, aimX: 1, aimY: 0, statuses: {}, potions: 3 + this.bless.cfg.potions + this.mods.potions, rush: null, queued: [],
    } as HeroC);
    this.world.add(e, CameraTarget, true);
    this.recomputeHero();
    const look = this.opts.look ?? {};
    const heroNode = this.character(this.g.assets.texture(`hero-${d.id}`), d.height, 22, 0xffffff, look.aura, this.rigSheet(heroOrder(d.id)), e);
    if (look.skinHue) { const cm = new ColorMatrixFilter(); cm.hue(look.skinHue, false); const body = heroNode.getChildByLabel('body'); if (body) body.filters = [cm]; }
    attachView(this.world, this.g.renderer, e, heroNode);
    this.potionsStart = this.world.get(e, Hero)!.potions;
    // Anneau au sol aux couleurs du héros : on le retrouve dans la mêlée (retour des testeurs : « je ne vois plus mon perso »).
    const ring = new Graphics().ellipse(0, 0, 34, 13).stroke({ width: 3, color: d.color, alpha: 0.85 }).ellipse(0, 0, 40, 16).stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 });
    this.world.get(e, View)!.node.addChildAt(ring, 0);
    const t = this.world.get(e, Transform)!;
    this.g.camera.follow(t, this.world.get(e, Velocity)!);
    this.vfx.follow(t, this.world.get(e, View)!.node, d.color);
  }

  /**
   * Statistiques du héros = base × (Veillée du Sanctuaire) + équipement + bénédictions.
   * Appelé au départ, à chaque bénédiction prise et à chaque objet équipé. Les PV manquants sont conservés.
   */
  recomputeHero(): void {
    const h = this.world.get(this.player, Hero)!, hp = this.world.get(this.player, Health)!;
    const b = h.def.base, it = this.loot.bonus(), bs = this.bless.stat, cfg = this.bless.cfg;
    const n = (x: number | undefined) => x ?? 0;
    const maxHp = Math.max(1, Math.round((b.maxHp + n(it.maxHp)) * (1 + (cfg.maxHpPct + n(bs.maxHpPct)) / 100)));
    hp.hp = Math.max(1, Math.min(maxHp, hp.hp + (maxHp - hp.max))); hp.max = maxHp;
    h.atk = (b.atk + n(it.atk)) * (1 + (cfg.atkPct + n(it.atkPct)) / 100);
    h.def_ = (b.def + n(it.def)) * (1 + (cfg.defPct + n(bs.defPct)) / 100);
    h.crit = Math.min(0.9, b.crit + n(it.crit) + cfg.crit + this.mods.crit);
    const maxMana = Math.round((b.maxMana + n(it.maxMana)) * (1 + cfg.maxManaPct / 100));
    h.mana = Math.min(maxMana, h.mana + Math.max(0, maxMana - h.maxMana)); h.maxMana = maxMana;
    h.speed = b.speed * (1 + n(it.speed) + n(bs.speedPct) / 100);
    const dashMax = DODGE.charges + n(bs.dodgeCharges);
    if (dashMax > h.dashMax) h.dashCharges += dashMax - h.dashMax;
    h.dashMax = dashMax; h.dashCharges = Math.min(h.dashCharges, dashMax);
    h.dashRecharge = DODGE.recharge - (this.bless.res('brume', 2) ? 0.3 : 0);
    h.cdMul = (1 - Math.min(40, n(it.cooldownPct)) / 100) * this.mods.cdMul;
  }

  spawnFoe(id: EnemyId, x: number, y: number, o: { portal?: boolean; scale?: { hp: number; dmg: number } } = {}): number {
    const d = ENEMY_DEFS[id];
    const s = o.scale ?? enemyScaling(this.wave);
    x = Math.max(ARENA.x + 60, Math.min(ARENA.x + ARENA.w - 60, x));
    y = Math.max(ARENA.y + 60, Math.min(ARENA.y + ARENA.h - 60, y));
    const e = this.world.create();
    this.world.add(e, Transform, makeTransform(x, y));
    this.world.add(e, Velocity, makeVelocity(1300, 0));
    this.world.add(e, Collider, { radius: d.r, layer: Layers.Enemy, mask: Layers.Enemy | Layers.Player | Layers.PlayerShot | Layers.Wall, solid: true, mass: d.r / 10 * (d.elite ? 3 : 1) });
    const hp = Math.round(d.hp * s.hp * this.mods.foeHp);
    this.world.add(e, Health, { hp, max: hp });
    this.world.add(e, Foe, this.makeFoe(d, d.dmg * s.dmg * this.mods.foeDmg, d.speed * this.rng.range(0.92, 1.08)));
    const sheet = this.rigSheet(foeOrder(id));
    const eliteCol = d.elite ? STATUS_COLORS[d.status ?? 'void'] : undefined;
    // Élite : un anneau net au sol plutôt qu'une lueur additive (retour mobile : halos baveux en mêlée).
    const node = this.character(this.g.assets.texture(d.tex), d.h, d.r, sheet ? 0xffffff : d.tint, sheet ? undefined : eliteCol, sheet, e);
    if (sheet && eliteCol !== undefined) {
      const ring = new Graphics().ellipse(0, 0, d.r * 1.55, d.r * 0.6).stroke({ width: 2.5, color: eliteCol, alpha: 0.9 });
      ring.label = 'aura';
      node.addChildAt(ring, 1);
    }
    attachView(this.world, this.g.renderer, e, node);
    if (o.portal !== false) {
      this.feedback.ring(x, y, d.r * 2.6, d.elite ? 0xff5ad1 : 0x8a5cff, 0.5, 5);
      this.particles.emit(x, y - 10, { color: 0x8a5cff, count: 10, speed: 90, size: 0.6, life: 0.6, gravity: -80 });
    }
    this.g.events.emit('enemy:spawn', { id: e, kind: id, x, y, elite: !!d.elite });
    return e;
  }

  private makeFoe(d: FoeC['def'], dmg: number, speed: number): FoeC {
    return { def: d, dmg, speed, state: 'move', t: 0, cd: this.rng.range(0.6, 1.6), contactCd: 0, blinkCd: 2, summonCd: 6, tx: 0, ty: 0, angle: 0, facing: 1,
      flash: 0, spawnT: 0, statuses: {}, orbit: this.rng.chance(0.5) ? 1 : -1, rush: null, boss: null };
  }

  private spawnBoss(id: BossId, x: number, y: number): number {
    const b = BOSS_DEFS[id];
    const k = bossScaling(this.wave);
    const e = this.world.create();
    this.world.add(e, Transform, makeTransform(x, y));
    this.world.add(e, Velocity, makeVelocity(1500, 0));
    this.world.add(e, Collider, { radius: b.r, layer: Layers.Enemy, mask: Layers.Enemy | Layers.Player | Layers.PlayerShot | Layers.Wall, solid: true, mass: 60 });
    const hp = Math.round(b.hp * k * this.mods.foeHp * this.mods.bossHp);
    this.world.add(e, Health, { hp, max: hp });
    // Le boss réutilise la fiche d'un ennemi pour la taille et la mêlée ; ses attaques sont dans boss.ts.
    const base = { ...ENEMY_DEFS.brute, name: b.name, tex: b.tex, tint: b.tint, h: b.h, r: b.r, hp, dmg: b.dmg, speed: b.speed, elite: true, guard: false };
    const f = this.world.add(e, Foe, this.makeFoe(base, b.dmg * (1 + 0.25 * (k - 1)) * this.mods.foeDmg, b.speed));
    f.boss = { def: b, phase: 1, transition: 0, next: 2.2, step: 0, spin: 0, edge: 0 };
    const sheet = this.rigSheet(bossOrder(id));
    const bossNode = this.character(this.g.assets.texture(b.tex), b.h, b.r, sheet ? 0xffffff : b.tint, sheet ? undefined : b.color, sheet, e);
    if (sheet) {
      const ring = new Graphics().ellipse(0, 0, b.r * 1.5, b.r * 0.58).stroke({ width: 3.5, color: b.color, alpha: 0.9 })
        .ellipse(0, 0, b.r * 1.68, b.r * 0.66).stroke({ width: 1.5, color: 0xffffff, alpha: 0.3 });
      ring.label = 'aura';
      bossNode.addChildAt(ring, 1);
    }
    attachView(this.world, this.g.renderer, e, bossNode);
    this.bossEntity = e;
    this.feedback.ring(x, y, 360, b.color, 1.2, 20);
    this.particles.emit(x, y - 60, { color: b.color, count: 80, speed: 420, size: 1, life: 1.1 });
    this.g.camera.shake(0.7);
    this.g.camera.targetZoom = this.baseZoom();
    this.announce(`${b.icon} ${b.name}`, b.subtitle, b.color);
    this.bossSpawnT = this.time;
    this.g.events.emit('boss:spawn', { wave: this.wave, id, name: b.name, entity: e, subtitle: b.subtitle, maxHp: hp });
    return e;
  }

  spawnShot(o: Parameters<CombatCtx['spawnShot']>[0]): number {
    const e = this.world.create();
    this.world.add(e, Transform, makeTransform(o.x, o.y, Math.atan2(o.dy, o.dx)));
    const v = this.world.add(e, Velocity, makeVelocity());
    v.x = o.dx * o.speed; v.y = o.dy * o.speed;
    const hero = o.side === 'hero';
    this.world.add(e, Collider, { radius: o.radius ?? 10, layer: hero ? Layers.PlayerShot : Layers.EnemyShot, mask: hero ? Layers.Enemy : Layers.Player, solid: false, mass: 1 });
    this.world.add(e, Shot, { side: o.side, damage: o.damage, crit: !!o.crit, pierce: o.pierce ?? 1, hit: new Set<number>(), status: o.status, statusTime: o.statusTime, stacks: o.stacks, skill: o.skill, owner: o.owner });
    this.world.add(e, Lifetime, { remaining: o.life ?? 1 });
    const node = new Container();
    const sz = o.size ?? 1;
    const halo = new Sprite(this.fx.glow);
    halo.anchor.set(0.5); halo.tint = o.color; halo.blendMode = 'add';
    halo.scale.set(hero ? 1.3 * sz : 1.1 * sz, hero ? 0.7 * sz : 1.1 * sz);
    const core = new Sprite(this.fx.glow);
    core.anchor.set(0.5); core.scale.set(0.5 * sz, (hero ? 0.28 : 0.5) * sz); core.blendMode = 'add';
    const body = new Container();
    body.y = -BODY_Y; body.rotation = Math.atan2(o.dy, o.dx);
    body.addChild(halo, core);
    const sh = new Sprite(this.fx.shadow);
    sh.anchor.set(0.5); sh.width = 26 * sz; sh.height = 9 * sz; sh.alpha = 0.6;
    node.addChild(sh, body);
    attachView(this.world, this.g.renderer, e, node, 'entities', 40);
    this.vfx.combat.trail(node, hero ? o.color : 0xb07bff, (hero ? 9 : 8) * sz, BODY_Y);
    return e;
  }

  // ================================================================ Dégâts

  damageFoe(e: number, dmg: number, o: FoeHitOpts = {}): void {
    const w = this.world;
    if (!w.isAlive(e)) return;
    const f = w.get(e, Foe), hp = w.get(e, Health), t = w.get(e, Transform), v = w.get(e, Velocity);
    if (!f || !hp || !t || !v || hp.hp <= 0 || f.dead) return;
    if (f.boss && (f.boss.transition > 0 || f.spawnT < 1.2)) {
      if (dmg > 1) this.feedback.number(t.x, t.y - f.def.h - 10, 'Invulnérable', { color: 0x9aa6b8, size: 16 });
      return;
    }
    // Garde frontale (Pillards) : réduite de face, sauf pendant leur attaque.
    let guarded = false;
    if (f.def.guard && f.state === 'move' && o.fromX !== undefined && o.fromY !== undefined) {
      const ax = o.fromX - t.x, ay = o.fromY - t.y, l = Math.hypot(ax, ay) || 1;
      if ((ax / l) * Math.cos(f.angle) + (ay / l) * Math.sin(f.angle) > 0.35) { dmg = Math.max(1, Math.round(dmg * 0.4)); guarded = true; }
    }
    // Bénédictions (bonus, charges de buff, critiques) puis statuts consommés (Marque, bris de Gel, Choc).
    if (!o.dot) dmg *= this.bless.outgoing(e, f, o) * consumeOnHit(this, e, f, !!o.lightning);
    dmg = Math.max(1, Math.round(dmg));
    if (!w.isAlive(e) || f.dead) return; // tué par une réaction en chaîne
    hp.hp -= dmg;
    this.stats.hit(dmg);
    const src = o.dot ? 'Altérations' : o.skill === undefined || o.skill < 0 ? 'Bénédictions' : HERO_DEFS[this.heroId].skills[o.skill]?.name ?? 'Attaque';
    this.dealtBy[src] = (this.dealtBy[src] ?? 0) + Math.min(dmg, hp.hp + dmg);
    if (!o.dot) { this.hits++; if (o.crit) this.crits++; }
    f.flash = 0.12;
    if (o.knock && o.fromX !== undefined && o.fromY !== undefined) {
      const kx = t.x - o.fromX, ky = t.y - o.fromY, l = Math.hypot(kx, ky) || 1;
      const resist = f.boss ? 0.06 : f.def.elite ? 0.35 : 1;
      v.x += (kx / l) * o.knock * resist; v.y += (ky / l) * o.knock * resist;
    }
    if (o.status && hp.hp > 0) applyStatus(this, e, o.status, o.stacks ?? 1);
    // Chiffres, étincelles et secousses : gérés par Vfx sur enemy:hit. La garde est signalée en plus.
    if (guarded) this.feedback.number(t.x + 26, t.y - f.def.h - 20, '⛨', { color: 0x9aa6b8, size: 18 });
    if (o.crit) this.g.events.emit('player:crit', { x: t.x, y: t.y });
    this.g.events.emit('enemy:hit', { id: e, x: t.x, y: t.y, damage: dmg, crit: o.crit, kind: f.def.id, guarded, skill: o.skill });
    if (f.boss && hp.hp > 0) {
      const ph = phaseForHp(hp.hp / hp.max);
      if (ph > f.boss.phase) enterPhase(this, e, f, ph as 2 | 3);
    }
    const x = t.x, y = t.y;
    if (hp.hp <= 0) this.killFoe(e, f, { x, y });
    // Déclencheurs « au toucher » : coups directs du héros seulement (pas les dégâts secondaires).
    if (!o.dot && !o.lightning && !o.noProc) {
      this.bless.afterHit(e, f, dmg, o);
      this.loot.onHit(e, dmg);
    }
  }

  private killFoe(e: number, f: FoeC, t: { x: number; y: number }): void {
    if (f.dead) return;
    f.dead = true;
    this.kills++; this.waveKills++;
    this.stats.kill(this.time);
    if (f.def.elite && !f.boss) this.stats.add('elitesKilled');
    this.combo++; this.comboT = 2.6;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    if (this.combo >= 5 && this.combo % 5 === 0) {
      // Le compteur du HUD suit le combo : dans le monde, seulement les paliers (×25, ×50…) pour ne pas noyer l'action.
      if (this.combo % 25 === 0) this.feedback.number(t.x, t.y - 150, `Combo ×${this.combo}`, { color: 0xffb04a, size: 26 });
      this.g.events.emit('combo', { count: this.combo, best: this.bestCombo });
    }
    const big = !!f.def.elite || f.def.h > 120;
    // Mana au kill : récompense l'agressivité.
    const h = this.world.get(this.player, Hero)!;
    h.mana = Math.min(h.maxMana, h.mana + (big ? 12 : 3));
    this.g.events.emit('enemy:killed', { id: e, kind: f.def.id, x: t.x, y: t.y, elite: !!f.def.elite && !f.boss, boss: !!f.boss, wave: this.wave });
    if (f.def.elite && !f.boss) this.g.events.emit('elite:killed', { x: t.x, y: t.y, kind: f.def.id });
    this.bless.onKill(e, f, t.x, t.y);
    this.loot.onKill(e, f, t.x, t.y);
    if (f.boss) this.killBoss(e, f, t);
    this.spawnCorpse(e, t);
    this.world.destroy(e);
  }

  private killBoss(e: number, f: FoeC, t: { x: number; y: number }): void {
    const b = f.boss!;
    this.bossesKilled++;
    this.bossWaves.push(this.wave);
    this.stats.fastestBossKill = Math.min(this.stats.fastestBossKill, this.time - this.bossSpawnT);
    if (this.loot.naked) this.stats.add('bossKilledNaked');
    if (this.stats.wave.phoenix) this.stats.addWave('phoenixThenBoss');
    const pts = this.opts.pactPoints ?? 0;
    if (pts > 0 && this.wave === 10) this.stats.max('bossKilledWithPact', pts);
    this.bossEntity = 0;
    // Les zones du boss s'éteignent ; ses serviteurs fuient dans la brume.
    for (const hz of this.hazards.list) if (hz.side === 'foe') { hz.damage = 0; hz.linger = 0; }
    for (const o of [...this.world.query(Foe)]) if (o !== e) this.killFoe(o, this.world.get(o, Foe)!, this.world.get(o, Transform)!);
    this.feedback.ring(t.x, t.y - 40, 700, b.def.color, 1.4, 26);
    this.particles.emit(t.x, t.y - 80, { color: b.def.color, count: 120, speed: 620, size: 1.1, life: 1.4 });
    this.particles.emit(t.x, t.y - 80, { color: 0xffffff, count: 40, speed: 300, size: 0.7, life: 1.0 });
    this.g.camera.shake(1);
    this.g.hitStop(0.6, 0.15);
    this.g.camera.targetZoom = this.baseZoom();
    const h = this.world.get(this.player, Hero)!, hp = this.world.get(this.player, Health)!;
    h.potions++; this.potionsGot++;
    hp.hp = Math.min(hp.max, hp.hp + hp.max * 0.3);
    this.announce(`${b.def.name} est vaincu`, '+1 potion · PV restaurés', 0xffe0a5);
    this.g.events.emit('boss:killed', { wave: this.wave, id: b.def.id, entity: e, x: t.x, y: t.y, time: this.time });
  }

  /** Source du dernier coup reçu et cumul des dégâts par source (fin de run). */
  private lastHurtBy: string | null = null;
  private lastHurtHint: string | null = null;
  private damageBy: Record<string, number> = {};

  hurtHero(dmg: number, o: HeroHitOpts = {}): boolean {
    const w = this.world;
    const h = w.get(this.player, Hero)!, hp = w.get(this.player, Health)!, t = w.get(this.player, Transform)!, v = w.get(this.player, Velocity)!;
    if (hp.hp <= 0 || this.over) return false;
    if (h.invuln > 0) {
      if (this.time - h.dashAt <= DODGE.invuln + 0.05) {
        this.stats.add('dodgedHits');
        // « Esquiver un coup » : une fois par esquive.
        if (this.avoidedDash !== h.dashAt) { this.avoidedDash = h.dashAt; this.bless.onDodgeAvoid(t.x, t.y); }
      }
      if (h.perfectReady && this.time - h.dashAt <= DODGE.perfectWindow) this.perfectDodge(h, t);
      return false;
    }
    this.perfectStreak = 0;
    let taken = Math.round(mitigate(dmg * this.mods.dmgTaken, h.def_));
    let absorbed = 0;
    if (h.shield > 0) {
      absorbed = Math.min(h.shield, taken); h.shield -= absorbed; taken -= absorbed;
      if (h.shield <= 0) { h.shield = 0; this.bless.onShieldBreak(); }
    }
    // Coup mortel : une bénédiction peut l'annuler (une fois par vague).
    if (taken >= hp.hp && (this.bless.onLethal() || this.loot.onLethal())) taken = Math.max(0, hp.hp - 1);
    hp.hp = Math.max(0, hp.hp - taken);
    if (taken > 0 && dmg < 1e6) {
      // Qui frappe ? (hors coup de test debugKillHero) (écran de fin : « Abattu par … », dégâts par source)
      const f = o.owner !== undefined ? w.get(o.owner, Foe) : undefined;
      const src = f ? (f.boss?.def.name ?? f.def.name) : o.status ? (STATUS_FR[o.status] ?? 'Altération') : 'Piège du décor';
      this.lastHurtBy = src;
      this.lastHurtHint = f && !f.boss ? f.def.hint ?? null : f?.boss ? 'Les boss annoncent chaque attaque : observe le cercle qui se remplit, puis esquive au dernier moment.' : null;
      this.damageBy[src] = (this.damageBy[src] ?? 0) + taken;
    }
    this.stats.addWave('damageTaken', taken);
    this.stats.add('damageTaken', taken);
    this.waveDamage += taken;
    h.invuln = 0.5;
    if (o.status) {
      h.statuses[o.status as StatusId] = Math.max(h.statuses[o.status as StatusId] ?? 0, o.statusTime ?? 2);
      this.g.events.emit('player:status', { status: o.status, time: o.statusTime ?? 2 });
    }
    if (o.knock && o.fromX !== undefined && o.fromY !== undefined) {
      const kx = t.x - o.fromX, ky = t.y - o.fromY, l = Math.hypot(kx, ky) || 1;
      v.x += (kx / l) * o.knock; v.y += (ky / l) * o.knock;
    }
    // L'Arbitre se soigne quand il touche (prototype : « se soigne en te frappant »).
    if (o.owner && o.owner === this.bossEntity) {
      const bf = w.get(o.owner, Foe), bh = w.get(o.owner, Health);
      if (bf?.boss?.def.id === 'arbiter' && bh) bh.hp = Math.min(bh.max, bh.hp + taken * 4);
    }
    if (absorbed) this.feedback.number(t.x, t.y - 150, `⛨ ${absorbed}`, { color: 0x9fd0ff, size: 20 });
    this.vfx.setHealth(hp.hp / hp.max);
    if (taken <= 0) return true;
    if (hp.hp > 0) { this.bless.onHurt(o.owner, taken); this.loot.onHurt(o.owner); }
    this.g.events.emit('player:hurt', { hp: hp.hp, max: hp.max, damage: taken, status: o.status, shieldAbsorbed: absorbed });
    if (hp.hp <= 0) this.die();
    return true;
  }

  /** Esquive parfaite : ralenti, charge d'esquive rendue, mana. Le cœur du « encore une fois ». */
  private perfectDodge(h: HeroC, t: { x: number; y: number }): void {
    h.perfectReady = false;
    this.perfectStreak++;
    this.perfectTotal++;
    h.dashCharges = Math.min(h.dashMax, h.dashCharges + 1);
    this.bless.onPerfectDodge(t.x, t.y);
    h.mana = Math.min(h.maxMana, h.mana + 20);
    for (let i = 0; i < 4; i++) h.cds[i] = Math.max(0, h.cds[i] - 0.6);
    h.invuln = Math.max(h.invuln, 0.5);
    this.g.hitStop(0.35, 0.25);
    this.feedback.number(t.x, t.y - 150, this.perfectStreak > 1 ? `Esquive parfaite ×${this.perfectStreak}` : 'Esquive parfaite', { color: 0x9fe8ff, size: 22 });
    this.feedback.ring(t.x, t.y - BODY_Y * 0.5, 120, 0x9fe8ff, 0.5, 8);
    this.g.events.emit('player:perfect-dodge', { x: t.x, y: t.y, streak: this.perfectStreak });
  }

  private die(): void {
    this.over = true; this.overT = 0;
    const t = this.world.get(this.player, Transform)!;
    this.particles.emit(t.x, t.y - BODY_Y, { color: 0xff3040, count: 60, speed: 300, size: 0.8, life: 1 });
    this.g.hitStop(0.8, 0.2);
    this.g.events.emit('player:died', { hero: this.heroId, wave: this.wave, kills: this.kills, time: this.time, bossesKilled: this.bossesKilled });
    this.g.events.emit('run:defeat', {});
  }

  private updateGameOverInput(): void {
    if (this.overT < 1.2) return;
    const input = this.g.input;
    const keys: Array<[Parameters<typeof input.pressed>[0], HeroId]> = [['skill1', 'taro'], ['skill2', 'mei'], ['skill3', 'sena'], ['skill4', 'ren']];
    for (const [a, id] of keys) if (input.pressed(a)) { this.restart(id); return; }
    if (input.pressed('interact') || input.pressed('attack')) this.restart(this.heroId);
  }

  /** Sillage (cosmétique de maîtrise) : traînée de lueurs derrière le héros quand il se déplace. */
  private updateTrail(dt: number): void {
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const p = this.trails[i];
      p.life -= dt;
      p.g.alpha = Math.max(0, p.life / 0.45) * 0.7; p.g.scale.set(0.6 + p.life);
      if (p.life <= 0) { p.g.destroy(); this.trails.splice(i, 1); }
    }
    const color = this.opts.look?.trail;
    if (color === undefined || !this.world.isAlive(this.player)) return;
    const v = this.world.get(this.player, Velocity), t = this.world.get(this.player, Transform);
    if (!v || !t || Math.hypot(v.x, v.y) < 60 || (this.trailT -= dt) > 0) return;
    this.trailT = 0.04;
    const g = new Graphics().ellipse(0, 0, 16, 7).fill({ color, alpha: 0.55 }).ellipse(0, 0, 7, 3).fill({ color: 0xffffff, alpha: 0.6 });
    g.position.set(t.x + (Math.random() - 0.5) * 10, t.y + 2); g.blendMode = 'add';
    this.g.renderer.layers.decals.addChild(g);
    this.trails.push({ g, life: 0.45 });
  }

  /** Résumé de la run en cours. */
  result(): RunResult {
    // Pendant le compte à rebours de la première vague, le directeur est encore à startWave - 1.
    return { hero: this.heroId, wave: Math.max(this.startWave, this.wave), wavesCleared: this.wavesCleared, bossWaves: [...this.bossWaves], won: this.won || this.wavesCleared >= CAMPAIGN_WAVES,
      kills: this.kills, timeSec: Math.round(this.time), bestCombo: this.bestCombo, perfectDodges: this.perfectTotal,
      counters: this.runCounters(), fastestBossKill: this.stats.fastestBossKill, dust: this.loot.dust, legendaryPity: this.loot.legendaryPity,
      blessings: this.bless.owned.map((o) => ({ id: o.blessing.id, name: o.blessing.name, patron: o.blessing.patron, rarity: o.rarity })),
      items: Object.values(this.loot.equipped).filter((x): x is Item => !!x),
      killedBy: this.over && !this.won ? this.lastHurtBy : null,
      killedHint: this.over && !this.won ? this.lastHurtHint : null,
      damageBy: Object.entries(this.damageBy).map(([name, damage]) => ({ name, damage: Math.round(damage) })).sort((a, b) => b.damage - a.damage),
      detail: this.detail() };
  }

  /** Statistiques détaillées (écran de fin). */
  detail(): RunDetail {
    const h = this.world.get(this.player, Hero);
    const dealtBy = Object.entries(this.dealtBy).map(([name, damage]) => ({ name, damage: Math.round(damage) })).filter((d) => d.damage > 0).sort((a, b) => b.damage - a.damage);
    return {
      dealtBy, dealt: dealtBy.reduce((a, d) => a + d.damage, 0), taken: Math.round(Object.values(this.damageBy).reduce((a, v) => a + v, 0)),
      hits: this.hits, crits: this.crits, maxHit: Math.round(this.stats.counters.maxHit ?? 0),
      potions: Math.max(0, this.potionsStart + this.potionsGot - (h?.potions ?? 0)), waves: [...this.waveTimes],
    };
  }

  /** Compteurs versés à la sauvegarde (achievements.json > cond.stat). */
  runCounters(): Record<string, number> {
    const s = this.stats;
    s.max('maxCombo', this.bestCombo);
    s.max('maxResonance', this.bless.maxResonance());
    s.max('distinctPatrons', new Set(this.bless.owned.map((o) => o.blessing.patron)).size);
    s.max('heroicBlessings', this.bless.owned.filter((o) => o.rarity === 'heroique').length);
    s.counters.perfectDodges = this.perfectTotal;
    return { ...s.counters };
  }

  /** Recommence une run (même héros par défaut). */
  restart(hero: HeroId = this.heroId): void {
    void this.g.scenes.switch(new RunScene(hero, 1, this.opts));
  }

  announce(title: string, sub = '', color = 0xf1e5ca): void {
    if (this.onAnnounce) { this.onAnnounce(title, sub, color); return; }
    this.banner.text = title; this.banner.style.fill = color;
    this.bannerSub.text = sub;
    this.bannerT = 2.6;
  }

  // ================================================================ Vagues

  private updateWaves(dt: number): void {
    let alive = 0;
    for (const _ of this.world.query(Foe)) alive++;
    const bossAlive = this.bossEntity !== 0 && this.world.isAlive(this.bossEntity);
    if (this.director.phase === 'active') {
      this.stats.maxWave('secondsWithoutAttack', this.time - this.lastAttackT);
      this.updatePressure(dt);
    }
    this.director.update(dt, alive, bossAlive, {
      start: (plan) => this.onWaveStart(plan),
      spawnPack: (ids) => this.spawnPack(ids),
      spawnBoss: (plan) => {
        const pt = this.world.get(this.player, Transform)!;
        const p = this.spawnPoint(pt.x, pt.y, 480, 560);
        this.spawnBoss(plan.boss!, p.x, p.y);
      },
      cleared: (plan) => this.onWaveCleared(plan),
    });
  }

  private onWaveStart(plan: WavePlan): void {
    this.chronoT = 0; this.riftT = 0;
    this.waveKills = 0; this.waveDamage = 0; this.waveStartT = this.time; this.lastAttackT = this.time;
    this.stats.newWave();
    this.bless.waveStart();
    this.loot.waveStart();
    this.arena.setChapter(plan.region);
    // Prochaine vague et prochain boss : cuits pendant celle-ci.
    if (RIG_ON) prefetch(waveOrders(plan.wave + 1));
    const label = plan.wave > CAMPAIGN_WAVES ? `Vague ${plan.wave} · Infini` : `Vague ${plan.wave} / ${CAMPAIGN_WAVES}`;
    if (plan.boss) {
      const b = BOSS_DEFS[plan.boss];
      this.announce(`⚠ ${label}`, `${b.name} approche…`, b.color);
    } else this.announce(label, `${plan.theme} · ${REGIONS[plan.region]}`);
    this.g.events.emit('wave:start', { wave: plan.wave, boss: !!plan.boss, bossId: plan.boss, region: plan.region, regionName: REGIONS[plan.region], theme: plan.theme, enemies: this.director.total });
  }

  private onWaveCleared(plan: WavePlan): void {
    this.wavesCleared = Math.max(this.wavesCleared, plan.wave);
    this.waveTimes.push({ wave: plan.wave, sec: Math.round(this.time - this.waveStartT), boss: !!plan.boss });
    this.loot.collectAll();
    if (plan.boss && this.waveDamage <= 0) this.stats.add('bossWaveNoDamage');
    if ((this.opts.pactPoints ?? 0) > 0 && plan.wave === CAMPAIGN_WAVES) this.stats.max('winWithPact', this.opts.pactPoints!);
    const patrons = new Set(this.bless.owned.map((o) => o.blessing.patron));
    if (patrons.size === 1) this.stats.max(`onlyPatronUntilWave:${[...patrons][0]}`, plan.wave);
    const h = this.world.get(this.player, Hero)!, hp = this.world.get(this.player, Health)!;
    hp.hp = Math.min(hp.max, hp.hp + hp.max * this.mods.waveHealPct * this.mods.healMul);
    h.mana = h.maxMana;
    this.announce(`Vague ${plan.wave} terminée`, plan.wave < CAMPAIGN_WAVES ? 'Les Patrons t\'écoutent…' : '', 0xb9f0c0);
    this.g.events.emit('wave:clear', { wave: plan.wave, time: this.time - this.waveStartT, kills: this.waveKills, damageTaken: this.waveDamage });
    if (this.isFinalWave(plan.wave)) {
      this.won = true;
      this.announce('Défi accompli', `${plan.wave} vagues franchies`, 0xffe0a5);
      this.g.events.emit('run:victory', {});
      this.later(2.4, () => { if (!this.over) { this.over = true; this.overT = 0; } });
    } else if (plan.wave === CAMPAIGN_WAVES) {
      this.announce('Les Brumes reculent', 'Victoire ! Le mode infini commence', 0xffe0a5);
      this.g.events.emit('run:victory', {});
    }
  }

  /** Failles au sol et Sablier (pactes, défi quotidien). */
  private updatePressure(dt: number): void {
    const m = this.mods, pt = this.world.get(this.player, Transform)!;
    if (m.rifts > 0 && (this.riftT += dt) >= m.rifts) {
      this.riftT = 0;
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(0, 140);
      this.hazards.add({ side: 'foe', zone: { shape: 'circle', x: pt.x + Math.cos(a) * d, y: pt.y + Math.sin(a) * d, r: 95 }, delay: 1.3,
        damage: Math.round(14 * enemyScaling(this.wave).dmg * m.foeDmg), color: 0x9a6bff, knock: 200, owner: 0 });
    }
    const plan = this.director.plan;
    if (m.chrono > 0 && plan && !plan.boss && this.time - this.waveStartT > m.chrono) {
      if (this.chronoT <= 0) {
        if (this.chronoT === 0) this.announce('Le sablier est vide', 'Des renforts arrivent', 0xff9a6a);
        this.chronoT = 8;
        const ids = plan.packs.flat().filter((id) => !ENEMY_DEFS[id].elite);
        if (ids.length) this.spawnPack([0, 1, 2].map(() => this.rng.pick(ids)));
      }
      this.chronoT -= dt;
      if (this.chronoT === 0) this.chronoT = -0.0001;
    }
  }

  private zoom(base: number): number { return base * this.mods.zoom; }
  /**
   * Zoom de base selon le plus petit côté de l'écran, pas sa largeur : un téléphone en paysage
   * (≈ 390 px de haut) doit dézoomer autant qu'en portrait, sinon on ne voit pas venir les ennemis
   * par le haut et le bas. Plus large pendant un boss.
   */
  private baseZoom(): number {
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    const boss = this.bossEntity !== 0;
    return this.zoom(small ? (boss ? 0.6 : 0.68) : (boss ? 0.8 : 0.92));
  }

  private spawnPack(ids: EnemyId[]): void {
    const pt = this.world.get(this.player, Transform)!;
    const p = this.spawnPoint(pt.x, pt.y, 520, 760);
    for (let i = 0; i < ids.length; i++) {
      const a = (i / ids.length) * Math.PI * 2 + this.rng.next();
      this.spawnFoe(ids[i], p.x + Math.cos(a) * 60 * Math.min(i, 1.5), p.y + Math.sin(a) * 60 * Math.min(i, 1.5));
    }
  }

  /** Point d'apparition dans l'arène, à distance du héros, hors des ruines. */
  private spawnPoint(hx: number, hy: number, min: number, max: number): { x: number; y: number } {
    for (let tries = 0; tries < 20; tries++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(min, max);
      const x = hx + Math.cos(a) * d, y = hy + Math.sin(a) * d;
      if (x < ARENA.x + 80 || x > ARENA.x + ARENA.w - 80 || y < ARENA.y + 80 || y > ARENA.y + ARENA.h - 80) continue;
      if (this.physics.walls.some((wl) => x > wl.x - 60 && x < wl.x + wl.w + 60 && y > wl.y - 60 && y < wl.y + wl.h + 60)) continue;
      return { x, y };
    }
    return { x: hx > 0 ? hx - min : hx + min, y: hy };
  }

  // ================================================================ Zones et contacts

  private detonate(h: Hazard, first: boolean): void {
    if (h.damage <= 0) return;
    if (h.side === 'foe') {
      const t = this.world.get(this.player, Transform)!;
      if (zoneHits(h.zone, t.x, t.y, 16)) {
        this.hurtHero(first ? h.damage : h.damage * 0.35, { status: h.status as StatusId | undefined, statusTime: h.statusTime, fromX: h.zone.x, fromY: h.zone.y, knock: first ? h.knock : 0, owner: h.owner });
      }
      if (first) this.g.camera.shake(0.06);
      return;
    }
    const hero = this.world.get(this.player, Hero)!;
    const reach = h.zone.shape === 'circle' || h.zone.shape === 'cone' ? h.zone.r : h.zone.len;
    for (const f of this.physics.overlapCircle(this.world, h.zone.x, h.zone.y, reach + 10, Layers.Enemy)) {
      const ft = this.world.get(f, Transform)!;
      if (!zoneHits(h.zone, ft.x, ft.y, 16)) continue;
      const crit = first ? h.crit : this.rng.chance(hero.crit);
      const status = h.status as FoeStatusId | undefined;
      // Zones de bénédiction (owner -1) : dégâts secondaires, sans déclencheur.
      this.damageFoe(f, first ? h.damage : Math.max(1, Math.round(h.damage * (h.proximity ? 0.25 : 1))), { crit, fromX: h.zone.x, fromY: h.zone.y, knock: first ? h.knock : 0, status, stacks: h.stacks, skill: h.owner, noProc: h.owner < 0 || !first });
      // Duo Lune + Brume : les zones de poison appliquent aussi du Givre.
      if (status === 'poison' && this.bless.has('duo_lune_brume') && this.world.isAlive(f)) applyStatus(this, f, 'givre', 1);
    }
  }

  private anyFoeIn(z: Zone): boolean {
    for (const f of this.physics.overlapCircle(this.world, z.x, z.y, z.r, Layers.Enemy)) {
      const ft = this.world.get(f, Transform)!;
      if (zoneHits(z, ft.x, ft.y, 10)) return true;
    }
    return false;
  }

  private onContact(c: Contact): void {
    const w = this.world;
    for (const [a, b] of [[c.a, c.b], [c.b, c.a]] as const) {
      const s = w.get(a, Shot);
      if (s && w.isAlive(a)) {
        if (s.side === 'hero' && w.has(b, Foe) && !s.hit.has(b)) {
          s.hit.add(b);
          if (--s.pierce <= 0) w.destroy(a);
          const st = w.get(a, Transform)!;
          const vel = w.get(a, Velocity)!;
          this.damageFoe(b, s.damage, { crit: s.crit, fromX: st.x - vel.x * 0.05, fromY: st.y - vel.y * 0.05, knock: 160, status: s.status as FoeStatusId | undefined, stacks: s.stacks, skill: s.skill ?? 0, noProc: (s.skill ?? 0) < 0 });
        } else if (s.side === 'foe' && b === this.player) {
          const st = w.get(a, Transform)!;
          if (this.hurtHero(s.damage, { status: s.status as StatusId | undefined, statusTime: s.statusTime, fromX: st.x, fromY: st.y, knock: 120, owner: s.owner })) w.destroy(a);
        }
        continue;
      }
      if (a === this.player) {
        const f = w.get(b, Foe);
        if (f && f.contactCd <= 0 && f.spawnT > 0.4) {
          const ft = w.get(b, Transform)!;
          // Contact : usure légère ; le vrai danger reste dans les attaques télégraphiées (demande Tests).
          f.contactCd = 1.2;
          this.hurtHero(f.dmg * (f.boss ? 0.4 : 0.25), { fromX: ft.x, fromY: ft.y, knock: 220, owner: b });
        }
      }
    }
  }

  // ================================================================ Rendu

  render(alpha: number, frameDt: number): void {
    this.renderTime += frameDt;
    const time = this.renderTime;
    syncViews(this.world, this.g.camera, alpha);
    this.feedback.update(frameDt);
    this.hazards.draw(time);

    const h = this.world.get(this.player, Hero)!, v = this.world.get(this.player, Velocity)!, hp = this.world.get(this.player, Health)!;
    const blink = h.invuln > 0 && h.dashT <= 0 && !h.rush && Math.floor(time * 20) % 2 === 0;
    this.animateBody(this.player, Math.hypot(v.x, v.y) / h.speed, h.facing, this.over ? 0.35 : blink ? 0.45 : 1, 0, 0, h.dashT > 0 || !!h.rush ? 0x9fe8ff : 0xffffff);
    this.animateHeroRig(frameDt, Math.hypot(v.x, v.y) / h.speed, hp.hp, h);
    for (const e of this.world.query(Foe, View)) {
      const f = this.world.get(e, Foe)!, ev = this.world.get(e, Velocity)!;
      const windup = f.state === 'windup' || (f.boss?.transition ?? 0) > 0;
      const tint = f.statuses.gel ? 0x8fd0ff : f.statuses.givre ? 0xc8ecff : windup && Math.floor(time * 16) % 2 === 0 ? 0xffe0c0 : 0xffffff;
      const appear = Math.min(1, f.spawnT * (f.boss ? 1 : 2.5));
      this.animateBody(e, Math.hypot(ev.x, ev.y) / Math.max(1, f.speed), f.facing, appear, f.flash, e * 0.37, tint, f.def.tint, windup ? 1.08 : 1);
      this.animateFoeRig(e, f, frameDt, Math.hypot(ev.x, ev.y) / Math.max(1, f.speed));
    }
    this.animateCorpses(frameDt);
    // Lumières : boss et élites rayonnent, les projectiles éclairent le sol.
    for (const e of this.world.query(Foe, View)) {
      const f = this.world.get(e, Foe)!, n = this.world.get(e, View)!.node;
      if (n.visible && (f.boss || f.def.elite)) this.vfx.lighting.push(n.x, n.y - f.def.h * 0.5, f.boss ? 380 : 220, f.boss ? f.boss.def.color : STATUS_COLORS[f.def.status ?? 'void'], f.boss ? 0.9 : 0.6);
    }
    for (const e of this.world.query(Shot, View)) {
      const n = this.world.get(e, View)!.node;
      if (n.visible) this.vfx.lighting.push(n.x, n.y - BODY_Y, 110, this.world.get(e, Shot)!.side === 'hero' ? h.def.color : 0xb07bff, 0.6);
    }
    this.vfx.setHealth(hp.hp / hp.max);
    this.arena.update(frameDt);
    this.vfx.update(frameDt);
    this.bannerT -= frameDt;
    const ba = Math.max(0, Math.min(1, this.bannerT * 1.5));
    this.banner.alpha = ba; this.bannerSub.alpha = ba;
    this.banner.scale.set(1 + Math.max(0, this.bannerT - 2.3) * 0.6);
    this.drawHud(h, hp, time);
    this.onFrame?.(this);
  }

  private animateBody(e: number, moving: number, facing: number, alpha: number, flash: number, phase: number, tint: number, baseTint = 0xffffff, grow = 1): void {
    const node = this.world.get(e, View)!.node as Container;
    if (!node.visible) return;
    const body = node.getChildByLabel('body') as Sprite;
    const base = Math.abs(body.scale.y);
    const rig = this.rigs.get(e);
    if (rig) {
      // Échelle repartie de la feuille à chaque image : le grossissement d'élan ne se cumule pas.
      const k = rig.sheet.scale * grow;
      // Écrasement à l'impact (squash & stretch) : le coup « porte » visuellement.
      const sq = Math.max(0, Math.min(1, flash / 0.12));
      body.scale.x = facing * k * (1 + 0.1 * sq); body.scale.y = k * (1 - 0.08 * sq);
      body.alpha = alpha;
      body.tint = flash > 0 && !this.vfx.combat.on ? 0xffb0a0 : tint;
      this.vfx.combat.hitFlash(node, body, sq);
      const aura = node.getChildByLabel('aura');
      if (aura) aura.alpha = aura instanceof Graphics ? 0.7 + 0.3 * Math.sin(this.renderTime * 3 + phase) : 0.3 + 0.12 * Math.sin(this.renderTime * 3 + phase);
      return;
    }
    const m = Math.min(1, moving);
    const bob = Math.sin(this.renderTime * 14 + phase) * m;
    const breathe = Math.sin(this.renderTime * 2.4 + phase) * (1 - m);
    body.y = -Math.abs(bob) * 5;
    body.rotation = bob * 0.05;
    const sx = base * (1 + breathe * 0.015 - Math.abs(bob) * 0.03) * (flash > 0 ? 1.08 : 1) * grow;
    body.scale.x = facing * sx;
    body.alpha = alpha;
    body.tint = flash > 0 ? 0xff7a7a : tint !== 0xffffff ? tint : baseTint;
    const aura = node.getChildByLabel('aura') as Sprite | null;
    if (aura) aura.alpha = 0.35 + 0.15 * Math.sin(this.renderTime * 3 + phase);
  }

  /** Personnage = ombre + aura facultative + corps (animé sans toucher à la position). */
  private character(tex: Texture, height: number, radius: number, tint = 0xffffff, aura?: number, sheet: RigSheet | null = null, entity = -1): Container {
    const node = new Container();
    const shadow = new Sprite(this.fx.shadow);
    shadow.anchor.set(0.5); shadow.width = radius * 3.2; shadow.height = radius * 1.1; shadow.label = 'shadow';
    node.addChild(shadow);
    if (aura !== undefined) {
      const a = new Sprite(this.fx.glow);
      a.anchor.set(0.5); a.tint = aura; a.blendMode = 'add'; a.label = 'aura';
      a.width = radius * 5; a.height = radius * 2.2;
      node.addChild(a);
    }
    if (sheet) {
      const body = new Sprite(sheet.frames.idle[0]);
      body.anchor.set(sheet.anchorX, sheet.anchorY); body.scale.set(sheet.scale); body.label = 'body'; body.tint = tint;
      node.addChild(body);
      if (entity >= 0) this.rigs.set(entity, { sheet, anim: 'idle', t: Math.random(), hurt: 0, atk: -1, wind: 0, flash: 0, hp: Infinity, prevState: 'move' });
      return node;
    }
    const body = new Sprite(tex);
    body.anchor.set(0.5, 0.92); body.scale.set(height / tex.height); body.label = 'body'; body.tint = tint;
    node.addChild(body);
    return node;
  }

  // ================================================================ Combattants v2 (squelette animé)

  /** Feuille de sprites d'un combattant, cuite une fois par run et par clé. */
  private rigSheet(order: RigOrder | null): RigSheet | null {
    if (!RIG_ON || !order) return null;
    // Normalement déjà cuite en arrière-plan (prefetch) ; sinon cuisson immédiate (type imprévu).
    return rigBaker.now(order.key, order.input);
  }

  private setRigFrame(e: number, r: RigState, anim: RigAnim, p: number): void {
    r.anim = anim;
    const body = (this.world.get(e, View)!.node as Container).getChildByLabel('body') as Sprite;
    body.texture = rigFrame(r.sheet, anim, p, r.aim ?? 0);
  }

  private animateHeroRig(dt: number, moving: number, hp: number, h: HeroC): void {
    const r = this.rigs.get(this.player);
    if (!r) return;
    if (hp < r.hp - 0.5) r.hurt = RIG_LEN.touche;
    r.hp = hp;
    if (this.heroAtkSeq !== this.heroAtkSeen) r.shotAt = r.t;
    if (r.sheet.aims) {
      // Arc : il suit la visée (vers le haut, le bas ou en biais) tant que le héros tire, puis revient
      // à l'horizontale en garde. Le sprite est déjà retourné selon h.facing : l'angle est relatif au regard.
      const firing = r.shotAt !== undefined && r.t - r.shotAt < 1.4;
      const want = firing ? Math.atan2(h.aimY, Math.max(0.05, Math.abs(h.aimX))) : 0;
      r.aim = (r.aim ?? 0) + (want - (r.aim ?? 0)) * Math.min(1, dt * 16);
    }
    if (this.heroAtkSeq !== this.heroAtkSeen) {
      this.heroAtkSeen = this.heroAtkSeq;
      // Le coup part tout de suite en jeu : on démarre juste avant l'impact, l'élan est sauté.
      r.atk = RIG_LEN.attaque * 0.3;
    }
    r.t += dt;
    if (r.hurt > 0) { r.hurt -= dt; this.setRigFrame(this.player, r, 'touche', 1 - r.hurt / RIG_LEN.touche); return; }
    if (r.atk >= 0) {
      r.atk += dt * 1.25;
      if (r.atk < RIG_LEN.attaque * 0.8) { this.setRigFrame(this.player, r, 'attaque', r.atk / RIG_LEN.attaque); return; }
      r.atk = -1;
    }
    if (moving > 0.15) this.setRigFrame(this.player, r, 'course', r.t * Math.min(1.4, 0.6 + moving) / RIG_LEN.course);
    else this.setRigFrame(this.player, r, 'idle', r.t / RIG_LEN.idle);
  }

  private animateFoeRig(e: number, f: FoeC, dt: number, moving: number): void {
    const r = this.rigs.get(e);
    if (!r) return;
    r.t += dt;
    if (f.flash > r.flash + 0.02) {
      // Silhouette blanche (1re image de « touché ») : pas plus d'une fois tous les 0,3 s, sinon un
      // ennemi frappé en continu reste blanc et une mêlée devient une tache aveuglante.
      const full = RIG_LEN.touche * 0.7;
      r.hurt = r.lastHurt !== undefined && r.t - r.lastHurt < 0.3 ? full * 0.72 : full;
      if (r.hurt === full) r.lastHurt = r.t;
    }
    r.flash = f.flash;
    const st = f.state as string;
    // Élan calé sur la fenêtre d'attaque télégraphiée, frappe quand elle se termine.
    if (st === 'windup') {
      if (r.prevState !== 'windup') r.wind = Math.max(0.05, f.t);
      r.atk = -1;
      r.prevState = st;
      this.setRigFrame(e, r, 'attaque', (1 - f.t / r.wind) * 0.36);
      return;
    }
    if (r.prevState === 'windup') r.atk = RIG_LEN.attaque * 0.36;
    r.prevState = st;
    if (r.atk >= 0) {
      r.atk += dt;
      if (r.atk < RIG_LEN.attaque) { this.setRigFrame(e, r, 'attaque', r.atk / RIG_LEN.attaque); return; }
      r.atk = -1;
    }
    if (r.hurt > 0) { r.hurt -= dt; this.setRigFrame(e, r, 'touche', 1 - r.hurt / (RIG_LEN.touche * 0.7)); return; }
    if (moving > 0.12 || f.boss) this.setRigFrame(e, r, moving > 0.12 ? 'course' : 'idle', r.t * Math.min(1.5, 0.5 + moving) / RIG_LEN[moving > 0.12 ? 'course' : 'idle']);
    else this.setRigFrame(e, r, 'idle', r.t / RIG_LEN.idle);
  }

  /** Dépouille : le corps du combattant joue sa mort (effondrement puis braises) à l'endroit du coup fatal. */
  private spawnCorpse(e: number, t: { x: number; y: number }): void {
    const r = this.rigs.get(e);
    this.rigs.delete(e);
    if (!r) return;
    const view = this.world.get(e, View);
    const old = view?.node as Container | undefined;
    const ob = old?.getChildByLabel('body') as Sprite | undefined;
    const node = new Container();
    const f = this.world.get(e, Foe);
    const color = f?.boss ? f.boss.def.color : f?.def.elite ? STATUS_COLORS[f.def.status ?? 'void'] : 0xff7a3a;
    // Dissolution en shader (bord en braise) ; sinon l'ancien sprite qui s'efface.
    const quad = this.vfx.combat.corpse(r.sheet.frames.mort[0], r.sheet.anchorX, r.sheet.anchorY, color);
    const body = quad ?? new Sprite(r.sheet.frames.mort[0]);
    if (body instanceof Sprite) body.anchor.set(r.sheet.anchorX, r.sheet.anchorY);
    body.scale.set(ob ? ob.scale.x : r.sheet.scale, r.sheet.scale);
    node.addChild(body);
    node.position.set(t.x, t.y);
    node.zIndex = t.y;
    this.g.renderer.layers.entities.addChild(node);
    this.corpses.push({ node, sheet: r.sheet, t: 0, quad, color });
  }

  private animateCorpses(dt: number): void {
    for (const c of this.corpses) {
      c.t += dt;
      const p = c.t / RIG_LEN.mort;
      if (c.quad) {
        // Chute jusqu'au sol (avant la dissolution cuite dans l'atlas), puis dissolution en shader.
        c.quad.setFrame(rigFrame(c.sheet, 'mort', Math.min(p / 0.86, 0.335)));
        const k = Math.max(0, Math.min(1, (p - 0.25) / 0.61));
        this.vfx.combat.dissolve(c.quad, k, dt, c.node.x, c.node.y, c.quad.scale.x, c.quad.scale.y, c.color);
        c.node.alpha = 1;
        continue;
      }
      (c.node.children[0] as Sprite).texture = rigFrame(c.sheet, 'mort', p / 0.86);
      c.node.alpha = p > 0.75 ? Math.max(0, 1 - (p - 0.75) / 0.12) : 1;
    }
    for (const c of this.corpses) if (c.t >= RIG_LEN.mort * 0.87) c.node.destroy();
    this.corpses = this.corpses.filter((c) => !c.node.destroyed);
  }

  // ================================================================ Arène

  private buildArena(): void {
    // Générateur séparé : l'arène ne consomme pas l'aléatoire des vagues.
    this.arena = new ChapterArena(this.game, ARENA, new Rng((this.rng.seed ^ 0x5bd1e995) >>> 0), this.fx.light);
    this.physics.walls.push(...this.arena.walls);
    this.arena.setChapter(regionForWave(this.startWave), true);
  }

  // ================================================================ HUD minimal (remplaçable par l'UI)

  private buildHud(): void {
    const layer = this.g.renderer.layers.hud;
    const style = { fontFamily: 'Georgia, serif', fill: 0xf1e5ca, dropShadow: { color: 0x000000, distance: 2, alpha: 0.9, blur: 2 } };
    this.hud = new Text({ text: '', style: { ...style, fontSize: 17 } });
    this.hud.position.set(16, 12);
    this.bossBar = new Graphics();
    this.bossText = new Text({ text: '', style: { ...style, fontSize: 18, fontWeight: '700' } });
    this.bossText.anchor.set(0.5, 1);
    this.skillBar = new Container();
    this.skillGfx = new Graphics();
    this.skillBar.addChild(this.skillGfx);
    for (let i = 0; i < 6; i++) {
      const tx = new Text({ text: '', style: { ...style, fontSize: 12, align: 'center' } });
      tx.anchor.set(0.5, 0);
      this.skillTexts.push(tx); this.skillBar.addChild(tx);
    }
    this.banner = new Text({ text: '', style: { ...style, fontSize: 38, fontWeight: '700', stroke: { color: 0x05070c, width: 6 } } });
    this.banner.anchor.set(0.5);
    this.bannerSub = new Text({ text: '', style: { ...style, fontSize: 18, fontStyle: 'italic' } });
    this.bannerSub.anchor.set(0.5, 0);
    this.center = new Text({ text: '', style: { ...style, fontSize: 22, align: 'center', stroke: { color: 0x05070c, width: 5 } } });
    this.center.anchor.set(0.5);
    layer.addChild(this.hud, this.bossBar, this.bossText, this.skillBar, this.banner, this.bannerSub, this.center);
  }

  private layoutHud(w: number, h: number): void {
    this.banner.position.set(w / 2, h * 0.26);
    this.bannerSub.position.set(w / 2, h * 0.26 + 26);
    this.center.position.set(w / 2, h * 0.5);
    this.bossText.position.set(w / 2, 50);
    this.skillBar.position.set(w / 2, h - 86);
  }

  private drawHud(h: HeroC, hp: { hp: number; max: number }, time: number): void {
    const show = this.showBuiltinHud;
    this.hud.visible = this.bossBar.visible = this.bossText.visible = this.skillBar.visible = show;
    const s = this.snapshot();
    if (show) {
      const status = Object.keys(h.statuses).map((k) => ({ burn: '🔥', frost: '❄', void: '☾', slow: '⏳', bleed: '🩸', shock: 'ϟ' })[k] ?? '').join(' ');
      this.hud.text = `${s.heroName}  ·  PV ${Math.ceil(hp.hp)}/${hp.max}${h.shield > 0 ? ` (+${Math.ceil(h.shield)})` : ''}  ·  Mana ${Math.floor(h.mana)}/${h.maxMana}  ${status}\n`
        + `${s.wave > 0 ? (s.wave > CAMPAIGN_WAVES ? `Vague ${s.wave} (infini)` : `Vague ${s.wave}/${CAMPAIGN_WAVES}`) : 'Préparation'} · ${s.region}  ·  Ennemis ${s.enemiesLeft}  ·  Éliminés ${s.kills}${s.combo >= 3 ? `  ·  Combo ×${s.combo}` : ''}`;
      // Boss
      const W = this.g.renderer.width;
      this.bossBar.clear();
      if (s.boss) {
        const bw = Math.min(560, W - 40), x = (W - bw) / 2, y = 56;
        this.bossBar.roundRect(x - 3, y - 3, bw + 6, 18, 6).fill({ color: 0x05070c, alpha: 0.85 });
        this.bossBar.roundRect(x, y, bw * Math.max(0, s.boss.hp / s.boss.maxHp), 12, 4).fill({ color: s.boss.color });
        for (const th of [0.68, 0.34]) this.bossBar.rect(x + bw * th - 1, y - 2, 2, 16).fill({ color: 0xffffff, alpha: 0.6 });
        this.bossText.text = `${s.boss.name} · Phase ${s.boss.phase}/3 · ${s.boss.phaseName}`;
        this.bossText.style.fill = s.boss.color;
      } else this.bossText.text = '';
      // Techniques + esquive + potion
      const g = this.skillGfx;
      g.clear();
      const labels = ['Clic', '1', '2', '3', 'Esp.', '4'];
      const size = 54, gap = 10, total = 6 * size + 5 * gap;
      for (let i = 0; i < 6; i++) {
        const x = -total / 2 + i * (size + gap);
        let ready = 1, txt = '';
        if (i < 4) { const sk = s.skills[i]; ready = sk.maxCd ? 1 - sk.cd / sk.maxCd : 1; txt = `${labels[i]}\n${sk.name.split(' ')[0]}`; if (!sk.ready && sk.cd <= 0) ready = 0.35; }
        else if (i === 4) { ready = s.dashCharges > 0 ? 1 : 1 - s.dashCd / DODGE.recharge; txt = `${labels[i]}\nEsquive ×${s.dashCharges}`; }
        else { ready = s.potions > 0 ? 1 : 0.2; txt = `${labels[i]}\nPotion ×${s.potions}`; }
        const col = i === 4 ? 0x9fe8ff : i === 5 ? 0x7dff9a : h.def.color;
        g.roundRect(x, 0, size, size, 8).fill({ color: 0x0a0e18, alpha: 0.75 }).stroke({ color: col, width: 2, alpha: ready >= 1 ? 0.95 : 0.35 });
        g.roundRect(x + 3, 3 + (size - 6) * (1 - ready), size - 6, (size - 6) * ready, 6).fill({ color: col, alpha: ready >= 1 ? 0.28 + 0.06 * Math.sin(time * 4) : 0.18 });
        this.skillTexts[i].text = txt;
        this.skillTexts[i].position.set(x + size / 2, 8);
      }
    }
    // Texte central : intermission ou fin de run (affiché même avec un HUD externe tant qu'aucun écran ne le remplace).
    if (this.over) {
      this.center.text = this.overT > 1.2
        ? `Tombé à la vague ${s.wave}  ·  ${s.kills} éliminés\n\nClic ou Entrée : recommencer\n1 Taro · 2 Mei · 3 Sena · 4 Ren`
        : '';
    } else if (s.phase === 'intermission' && s.wave > 0 && !this.holdIntermission) {
      this.center.text = `Prochaine vague dans ${Math.ceil(this.director.timer)}…`;
    } else this.center.text = '';
    this.center.visible = show || this.over;
  }

  /** État lisible par une UI externe (DOM, mobile). */
  snapshot(): RunSnapshot {
    const w = this.world;
    const h = w.get(this.player, Hero)!, hp = w.get(this.player, Health)!;
    let enemies = 0;
    for (const _ of w.query(Foe)) enemies++;
    const plan = this.director.plan;
    let boss: RunSnapshot['boss'] = null;
    if (this.bossEntity && w.isAlive(this.bossEntity)) {
      const f = w.get(this.bossEntity, Foe)!, bh = w.get(this.bossEntity, Health)!;
      const b = f.boss!;
      boss = { name: b.def.name, subtitle: b.def.subtitle, hp: Math.max(0, bh.hp), maxHp: bh.max, phase: b.phase, phaseName: b.def.phases[b.phase - 1], color: b.def.color };
    }
    return {
      hero: this.heroId, heroName: h.def.name,
      hp: hp.hp, maxHp: hp.max, mana: h.mana, maxMana: h.maxMana, shield: h.shield,
      skills: h.def.skills.map((sk, i) => {
        const cost = this.bless.skillCost(i, sk.cost).mana;
        return { name: sk.name, cd: h.cds[i], maxCd: i === 0 ? sk.cd : sk.cd * h.cdMul, cost, ready: h.cds[i] <= 0 && h.mana >= cost };
      }),
      dashCharges: h.dashCharges, dashMax: h.dashMax, gold: this.loot.gold, dashCd: h.dashCd, potions: h.potions,
      wave: Math.max(this.startWave, this.wave), waveTotal: CAMPAIGN_WAVES, region: REGIONS[plan?.region ?? 0], theme: plan?.theme ?? '', phase: this.director.phase,
      enemiesLeft: enemies + this.director.remainingToSpawn, kills: this.kills, combo: this.combo, time: this.time, over: this.over, boss,
    };
  }
}

import { Transform, Velocity, type Game } from '@engine';
import { Health } from '../components';
import type { GameEvents } from '../events';
import { Foe, Hero, Shot } from '../combat/components';
import { zoneHits, type Zone } from '../combat/rules';
import type { RunScene } from '../scenes/RunScene';

/**
 * Robot joueur (agent Tests / équilibrage). Il pilote le héros par les mêmes entrées
 * qu'un joueur tactile (joystick virtuel + boutons) : visée assistée comprise, aucune triche.
 *
 * - `skill` (0 → 1) : 1 = réflexes d'un très bon joueur, 0.5 = joueur moyen, 0.2 = débutant.
 *   Il règle le temps de réaction aux télégraphes, la fiabilité des esquives et l'usage des techniques.
 * - Il enregistre une télémétrie par vague (durée, dégâts subis, PV, potions) pour l'équilibrage.
 *
 * Lancement visible : `?hero=sena&bot` (ou `?bot=0.5` pour un joueur moyen).
 * Les tests (tests/e2e) l'utilisent en accéléré : `window.bot.runFast(...)`.
 */

const PREF_RANGE: Record<string, number> = { taro: 95, mei: 95, sena: 320, ren: 360 };

export interface WaveLog {
  wave: number; boss: string | null; time: number; damageTaken: number; absorbed: number; hits: number; hpEnd: number; hpMax: number; potionsLeft: number; cleared: boolean;
}
export interface BotReport {
  hero: string; skill: number; seed: number; reached: number; cleared: number; won: boolean; died: boolean;
  time: number; kills: number; waves: WaveLog[]; deathCause: string | null; dodges: number; perfectDodges: number; potionsUsed: number;
}

export class Bot {
  enabled = true;
  private t = 0;
  /** Âge (s) à partir duquel un télégraphe est « vu ». */
  private readonly react: number;
  /** Probabilité d'esquiver une menace imminente. */
  private readonly dodgeRel: number;
  /** Probabilité de ne jamais remarquer une menace (inattention). */
  private readonly miss: number;
  private seenShots = new Map<number, number>();
  private noticed = new WeakMap<object, number>();
  private strafe = 1;
  private strafeT = 0;
  private holdT = 0;
  private plantT = 0;
  private planted = false;
  readonly report: BotReport;
  private cur: WaveLog | null = null;
  private lastHurt = '';
  private offs: Array<() => void> = [];
  private random: () => number;

  constructor(private readonly game: Game<GameEvents>, readonly skill = 0.85, seed = 1) {
    this.react = 0.1 + (1 - skill) * 0.6;
    this.dodgeRel = 0.3 + skill * 0.65;
    this.miss = (1 - skill) * 0.55;
    let s = seed >>> 0 || 1;
    this.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    this.report = { hero: '', skill, seed, reached: 0, cleared: 0, won: false, died: false, time: 0, kills: 0, waves: [], deathCause: null, dodges: 0, perfectDodges: 0, potionsUsed: 0 };
    const ev = game.events;
    this.offs.push(
      ev.on('wave:start', (e) => {
        const hp = this.heroHp();
        this.cur = { wave: e.wave, boss: e.bossId ?? null, time: 0, damageTaken: 0, absorbed: 0, hits: 0, hpEnd: 0, hpMax: hp?.max ?? 0, potionsLeft: 0, cleared: false };
        this.report.waves.push(this.cur);
        this.report.reached = Math.max(this.report.reached, e.wave);
      }),
      ev.on('wave:clear', (e) => {
        if (this.cur) { this.cur.cleared = true; this.cur.time = e.time ?? 0; this.close(); }
        this.report.cleared = Math.max(this.report.cleared, e.wave);
        if (e.wave >= 20) this.report.won = true;
      }),
      ev.on('player:perfect-dodge', () => this.report.perfectDodges++),
      ev.on('player:died', (e) => {
        this.report.died = true; this.report.kills = e.kills; this.report.time = e.time;
        this.report.deathCause = this.lastHurt;
        if (this.cur) this.close();
      }),
      ev.on('enemy:killed', () => this.report.kills++),
      ev.on('enemy:attack', (e) => { this.lastHurt = `${e.kind}:${e.attack}`; }),
      ev.on('boss:attack', (e) => { this.lastHurt = `boss ${e.id} p${e.phase}`; }),
    );
  }

  private wrapped: object | null = null;
  /** Mesure chaque coup encaissé (PV et bouclier) : player:hurt n'est pas émis quand le bouclier absorbe tout. */
  private wrap(s: RunScene): void {
    if (this.wrapped === s) return;
    this.wrapped = s;
    const orig = s.hurtHero.bind(s);
    s.hurtHero = (dmg, o) => {
      const h = s.world.get(s.player, Hero), hp = s.world.get(s.player, Health);
      const hp0 = hp?.hp ?? 0, sh0 = h?.shield ?? 0;
      const ok = orig(dmg, o);
      if (ok && this.cur && h && hp) {
        this.cur.hits++;
        this.cur.damageTaken += Math.max(0, hp0 - hp.hp);
        this.cur.absorbed += Math.max(0, sh0 - h.shield);
      }
      return ok;
    };
  }

  destroy(): void { for (const f of this.offs) f(); this.offs = []; }

  private get scene(): RunScene | null {
    const s = this.game.scenes.current as unknown as RunScene | undefined;
    return s && 'director' in s && 'hazards' in s ? s : null;
  }
  private heroHp() { const s = this.scene; return s ? s.world.get(s.player, Health) : undefined; }
  private close(): void {
    const s = this.scene; if (!s || !this.cur) return;
    const hp = s.world.get(s.player, Health)!, h = s.world.get(s.player, Hero)!;
    this.cur.hpEnd = Math.max(0, Math.round(hp.hp)); this.cur.hpMax = hp.max; this.cur.potionsLeft = h.potions;
    this.cur = null;
  }

  /** À appeler avant chaque `input.poll()` (installé par `Bot.attach`). */
  step(dt = 1 / 60): void {
    const s = this.scene, input = this.game.input;
    if (!this.enabled || !s || !s.hazards) return;
    this.wrap(s);
    this.t += dt;
    const w = s.world;
    const hero = w.get(s.player, Hero), t = w.get(s.player, Transform), hp = w.get(s.player, Health);
    if (!hero || !t || !hp || hp.hp <= 0) { input.setVirtualMove(0, 0); input.setVirtualHeld('attack', false); return; }
    this.report.hero = hero.def.id;

    // Intermission retenue (choix de bénédiction) : on choisit au hasard après une « lecture ».
    if (s.holdIntermission && s.director.phase === 'intermission') {
      this.holdT += dt;
      if (this.holdT > 0.8) { this.holdT = 0; this.pickBlessing(s); }
    } else this.holdT = 0;

    const px = t.x, py = t.y, R = 26;
    // ---- Ennemis
    let nearest = -1, nd = Infinity, nx = 0, ny = 0, crowdX = 0, crowdY = 0, count = 0, close = 0, bossE = -1;
    for (const e of w.query(Foe, Transform)) {
      const ft = w.get(e, Transform)!, f = w.get(e, Foe)!;
      const dx = ft.x - px, dy = ft.y - py, d = Math.hypot(dx, dy) || 1;
      count++;
      if (f.boss) bossE = e;
      if (d < 200) { close++; crowdX -= dx / d * (200 - d); crowdY -= dy / d * (200 - d); }
      const score = d - (f.boss ? 80 : 0) - (f.def.elite ? 40 : 0);
      if (score < nd) { nd = score; nearest = e; nx = ft.x; ny = ft.y; }
    }
    const dist = nearest >= 0 ? Math.hypot(nx - px, ny - py) : Infinity;

    // ---- Menaces : zones ennemies vues + projectiles
    const zones: Array<{ z: Zone; ttf: number; live: boolean }> = [];
    for (const h of s.hazards.list) {
      if (h.side !== 'foe') continue;
      const seenAt = this.noticed.get(h) ?? (this.noticed.set(h, this.random() < this.miss ? Infinity : this.t + this.react * (0.7 + this.random() * 0.6)), this.noticed.get(h)!);
      if (this.t < seenAt) continue;
      if (!h.fired) zones.push({ z: h.zone, ttf: h.delay - h.t, live: false });
      else if (h.linger > 0) zones.push({ z: h.zone, ttf: 0, live: true });
    }
    const shots: Array<{ x: number; y: number; vx: number; vy: number }> = [];
    for (const e of w.query(Shot, Transform, Velocity)) {
      if (w.get(e, Shot)!.side !== 'foe') continue;
      let seen = this.seenShots.get(e);
      if (seen === undefined) { seen = this.random() < this.miss ? Infinity : this.t + this.react * 0.6; this.seenShots.set(e, seen); }
      if (this.t < seen) continue;
      const st = w.get(e, Transform)!, sv = w.get(e, Velocity)!;
      shots.push({ x: st.x, y: st.y, vx: sv.x, vy: sv.y });
    }
    const inDanger = (x: number, y: number, horizon: number) => {
      let worst = 0;
      for (const zz of zones) if ((zz.live || zz.ttf < horizon) && zoneHits(zz.z, x, y, R)) worst = Math.max(worst, zz.live ? 0.6 : 1);
      return worst;
    };
    let threatT = Infinity;
    for (const zz of zones) if (!zz.live && zoneHits(zz.z, px, py, R)) threatT = Math.min(threatT, zz.ttf);
    for (const sh of shots) {
      const rx = px - sh.x, ry = py - sh.y, v2 = sh.vx * sh.vx + sh.vy * sh.vy || 1;
      const tc = (rx * sh.vx + ry * sh.vy) / v2;
      if (tc < 0 || tc > 0.6) continue;
      const mx = sh.x + sh.vx * tc - px, my = sh.y + sh.vy * tc - py;
      if (mx * mx + my * my < (R + 18) ** 2) threatT = Math.min(threatT, tc);
    }

    // ---- Choix de la direction : 16 candidats notés
    const pref = PREF_RANGE[hero.def.id] ?? 200;
    const speed = hero.speed;
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = 1.2 + this.random() * 1.6; this.strafe = this.random() < 0.5 ? -1 : 1; }
    let bx = 0, by = 0, best = -Infinity;
    const b = s.bounds;
    for (let i = 0; i <= 16; i++) {
      const stay = i === 16;
      const a = (i / 16) * Math.PI * 2;
      const cx = stay ? 0 : Math.cos(a), cy = stay ? 0 : Math.sin(a);
      const look = Math.min(0.55, Math.max(0.25, threatT));
      const fx = px + cx * speed * look, fy = py + cy * speed * look;
      let sc = -inDanger(fx, fy, 1.2) * 1000;
      // Projectiles vus : position future de chaque tir comparée à la position future du héros.
      for (const sh of shots) {
        for (const tt of [look * 0.5, look]) {
          const qx = sh.x + sh.vx * tt - (px + cx * speed * tt), qy = sh.y + sh.vy * tt - (py + cy * speed * tt);
          if (qx * qx + qy * qy < (R + 24) ** 2) { sc -= 600; break; }
        }
      }
      if (nearest >= 0) {
        const d2 = Math.hypot(nx - fx, ny - fy);
        sc -= Math.abs(d2 - pref) * 1.2;
        // tourner autour de la cible (évite de rester sur l'axe des attaques)
        const tx = -(ny - py), ty = nx - px, tl = Math.hypot(tx, ty) || 1;
        sc += (cx * tx / tl + cy * ty / tl) * this.strafe * 40;
      } else {
        sc -= Math.hypot(fx, fy - 200) * 0.2; // revient vers le centre
      }
      sc += (cx * crowdX + cy * crowdY) * (pref > 200 ? 0.5 : 0.08);
      const m = 160;
      if (fx < b.x + m || fx > b.x + b.w - m || fy < b.y + m || fy > b.y + b.h - m) sc -= 300;
      if (sc > best) { best = sc; bx = cx; by = cy; }
    }
    // Un joueur moins habile reste souvent planté pour frapper : il ne bouge que s'il voit un danger.
    this.plantT -= dt;
    if (this.plantT <= 0) { this.plantT = 0.5 + this.random() * 0.5; this.planted = this.random() < (1 - this.skill) * 0.75; }
    if (this.planted && threatT === Infinity && dist < hero.def.skills[0].range + 30) { bx = 0; by = 0; }
    input.setVirtualMove(bx, by);
    if (this.seenShots.size > 400) this.seenShots.clear();

    // ---- Esquive : menace imminente et pas de sortie à pied
    if (threatT < 0.28 && hero.dashCharges > 0 && hero.dashT <= 0 && !hero.rush) {
      const safeOnFoot = inDanger(px + bx * speed * threatT, py + by * speed * threatT, threatT + 0.05) === 0;
      if (!safeOnFoot && this.random() < this.dodgeRel * dt * 60 * 0.5 + (threatT < 0.12 ? this.dodgeRel * 0.5 : 0)) {
        input.trigger('dash');
        this.report.dodges++;
      }
    }

    // ---- Potion
    if (hp.hp < hp.max * (0.25 + this.skill * 0.12) && hero.potions > 0 && this.random() < 0.08) {
      input.trigger('skill4'); this.report.potionsUsed++;
    }

    // ---- Techniques (visée assistée tactile)
    const sk = hero.def.skills;
    input.setVirtualHeld('attack', dist < sk[0].range + 40);
    const busy = threatT < 0.35;
    const use = this.skill > this.random() * 1.2 || this.random() < 0.02;
    for (let i = 1; i < 4; i++) {
      if (hero.cds[i] > 0 || hero.mana < sk[i].cost || !use) continue;
      const k = sk[i];
      let ok = false;
      switch (k.kind) {
        case 'nova': ok = close >= 2 || (bossE >= 0 && dist < (k.radius ?? 150)); break;
        case 'dashStrike': ok = !busy || threatT < 0.2 ? dist < k.range : false; if (threatT < 0.2) ok = true; break;
        case 'execute': ok = dist < k.range; break;
        case 'slash': ok = dist < k.range + 20; break;
        default: ok = dist < k.range + 60 && (count >= 2 || bossE >= 0 || i === 1);
      }
      if (i === 3 && count < 3 && bossE < 0 && hp.hp > hp.max * 0.5) ok = false; // garde l'ultime
      if (ok) { input.trigger(`skill${i}` as 'skill1'); break; }
    }
  }

  private pickBlessing(s: RunScene): void {
    // L'écran de bénédictions de l'UI met le jeu en pause : `clickOffer` choisit une carte.
    if (!this.clickOffer()) s.nextWave();
  }

  /** Choisit une carte de l'offre de bénédictions affichée (s'il y en a une). */
  clickOffer(): boolean {
    const cards = Array.from(document.querySelectorAll<HTMLButtonElement>('.sc-card:not(.sc-chosen):not(.sc-discard)'));
    if (!cards.length) return false;
    cards[Math.floor(this.random() * cards.length)].click();
    return true;
  }

  /** Installe le robot avant chaque lecture des entrées. */
  static attach(game: Game<GameEvents>, skill = 0.85, seed = 1): Bot {
    const bot = new Bot(game, skill, seed);
    const input = game.input as unknown as { poll: () => void };
    const orig = input.poll.bind(game.input);
    input.poll = () => { bot.step(); orig(); };
    return bot;
  }

  /**
   * Simulation accélérée sans rendu (tests) : avance `seconds` de jeu par pas de 1/60 s,
   * s'arrête à la mort ou après la vague `untilWave`. Rend la main régulièrement (async).
   */
  async runFast(o: { seconds?: number; untilWave?: number; chunk?: number } = {}): Promise<BotReport> {
    const g = this.game as unknown as { tick: (dt: number) => void; stop: () => void };
    g.stop();
    const max = Math.round((o.seconds ?? 3600) * 60), until = o.untilWave ?? 20, chunk = o.chunk ?? 600;
    let n = 0;
    while (n < max && !this.report.died && this.report.cleared < until) {
      if ((this.game as unknown as { paused: boolean }).paused) {
        // Écran par-dessus le jeu (bénédictions) : on choisit, puis on laisse l'animation finir.
        this.clickOffer();
        await new Promise((r) => setTimeout(r, 120));
        g.tick(1 / 60);
        continue;
      }
      for (let k = 0; k < chunk && n < max; k++, n++) g.tick(1 / 60);
      await new Promise((r) => setTimeout(r, 0));
    }
    const s = this.scene;
    if (!this.report.died && s) this.report.time = Math.round(s.time);
    return this.report;
  }
}

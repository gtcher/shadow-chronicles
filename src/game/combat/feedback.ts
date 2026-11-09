import { Container, Graphics, Text } from 'pixi.js';

/**
 * Retours visuels du combat (rendu seulement) : chiffres de dégâts, arcs de coups,
 * ondes de choc. Volontairement simples : l'agent Rendu/VFX peut les enrichir
 * en s'abonnant aux mêmes événements.
 */
interface Num { t: Text; vx: number; vy: number; life: number; max: number }
interface Arc { g: Graphics; life: number; max: number; draw: (g: Graphics, k: number) => void }

export class CombatFeedback {
  private nums: Num[] = [];
  private numPool: Text[] = [];
  private arcs: Arc[] = [];
  private arcPool: Graphics[] = [];

  /** Confort visuel : seuls les chiffres et les textes importants (taille ≥ 26) flottent encore. */
  quiet = false;

  constructor(private readonly layer: Container) {}

  number(x: number, y: number, value: number | string, opts: { color?: number; crit?: boolean; size?: number } = {}): void {
    if (this.nums.length > 80) return;
    if (this.quiet && typeof value === 'string' && (opts.size ?? 20) < 26) return;
    const t = this.numPool.pop() ?? new Text({ text: '', style: { fontFamily: 'Georgia, serif', fontWeight: '700', fill: 0xffffff, stroke: { color: 0x120a08, width: 4 } } });
    t.text = String(value);
    t.style.fontSize = opts.size ?? (opts.crit ? 30 : 20);
    t.style.fill = opts.color ?? (opts.crit ? 0xffd25a : 0xfff1dc);
    t.anchor.set(0.5);
    t.position.set(x + (Math.random() - 0.5) * 20, y);
    t.scale.set(opts.crit ? 1.6 : 1.2);
    t.alpha = 1;
    this.layer.addChild(t);
    this.nums.push({ t, vx: (Math.random() - 0.5) * 60, vy: -150 - Math.random() * 40, life: 0.8, max: 0.8 });
  }

  /** Arc de coup de lame (mêlée). */
  slash(x: number, y: number, angle: number, range: number, arc: number, color: number): void {
    this.fx(0.16, (g, k) => {
      const r = range * (0.75 + 0.25 * (1 - k));
      const a0 = angle - arc / 2, a1 = angle + arc / 2;
      const sweep = a0 + (a1 - a0) * Math.min(1, (1 - k) * 2.2);
      g.moveTo(x + Math.cos(a0) * r * 0.35, y + Math.sin(a0) * r * 0.35);
      g.arc(x, y, r, a0, sweep);
      g.arc(x, y, r * 0.55, sweep, a0, true);
      g.fill({ color, alpha: 0.55 * k });
      g.arc(x, y, r, a0, sweep).stroke({ color: 0xffffff, width: 3, alpha: 0.9 * k });
    });
  }

  /** Onde circulaire qui s'étend. */
  ring(x: number, y: number, radius: number, color: number, life = 0.35, width = 6): void {
    this.fx(life, (g, k) => {
      g.circle(x, y, radius * (1.05 - 0.6 * k)).stroke({ color, width: width * k + 1, alpha: k });
    });
  }

  /** Traînée droite (ruée, charge). */
  streak(x0: number, y0: number, x1: number, y1: number, color: number, width = 26): void {
    this.fx(0.25, (g, k) => {
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ color, width: width * k, alpha: 0.6 * k, cap: 'round' });
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ color: 0xffffff, width: width * 0.25 * k, alpha: 0.9 * k, cap: 'round' });
    });
  }

  update(dt: number): void {
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.life -= dt;
      if (n.life <= 0) { n.t.removeFromParent(); this.numPool.push(n.t); this.nums.splice(i, 1); continue; }
      n.vy += 380 * dt;
      n.t.x += n.vx * dt; n.t.y += n.vy * dt;
      const k = n.life / n.max;
      n.t.alpha = Math.min(1, k * 2.5);
      const s = n.t.scale.x;
      n.t.scale.set(s + (1 - s) * Math.min(1, dt * 14));
    }
    const crowd = 1 / (1 + Math.max(0, this.arcs.length - 4) * 0.12);
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.life -= dt;
      a.g.clear();
      if (a.life <= 0) { a.g.removeFromParent(); this.arcPool.push(a.g); this.arcs.splice(i, 1); continue; }
      a.draw(a.g, a.life / a.max);
      // Arcs additifs superposés (mêlée, attaques rapides) : atténués pour ne pas saturer en blanc.
      a.g.alpha = crowd;
    }
  }

  private fx(life: number, draw: Arc['draw']): void {
    const g = this.arcPool.pop() ?? new Graphics();
    g.blendMode = 'add';
    this.layer.addChild(g);
    this.arcs.push({ g, life, max: life, draw });
  }
}

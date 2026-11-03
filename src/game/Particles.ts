import { Container, Sprite, type Texture } from 'pixi.js';

/**
 * Particules purement visuelles (pas d'entités ECS), avec réserve d'objets pour
 * éviter les allocations. Mises à jour au rythme de l'affichage.
 * L'agent rendu/VFX pourra la remplacer par un système plus riche.
 */
interface P { s: Sprite; vx: number; vy: number; life: number; max: number; drag: number; grow: number; gravity: number; a0: number }

export class Particles {
  private live: P[] = [];
  private pool: Sprite[] = [];
  constructor(private readonly layer: Container, private readonly tex: Texture) {}

  emit(x: number, y: number, o: { color: number; speed?: number; size?: number; life?: number; count?: number; spread?: number; angle?: number; drag?: number; grow?: number; gravity?: number; alpha?: number }): void {
    const n = o.count ?? 1;
    for (let i = 0; i < n; i++) {
      const s = this.pool.pop() ?? new Sprite(this.tex);
      s.anchor.set(0.5); s.blendMode = 'add'; s.tint = o.color;
      s.position.set(x, y);
      const size = (o.size ?? 0.5) * (0.6 + Math.random() * 0.8);
      s.scale.set(size);
      const ang = (o.angle ?? 0) + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2);
      const sp = (o.speed ?? 120) * (0.4 + Math.random() * 0.8);
      const life = (o.life ?? 0.6) * (0.7 + Math.random() * 0.6);
      s.alpha = o.alpha ?? 1;
      this.layer.addChild(s);
      this.live.push({ s, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life, max: life, drag: o.drag ?? 3, grow: o.grow ?? -0.6, gravity: o.gravity ?? 0, a0: s.alpha });
    }
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.s.removeFromParent(); this.pool.push(p.s);
        this.live[i] = this.live[this.live.length - 1]; this.live.pop();
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + p.gravity * dt;
      p.s.x += p.vx * dt; p.s.y += p.vy * dt;
      const t = p.life / p.max;
      p.s.alpha = p.a0 * Math.min(1, t * 2);
      p.s.scale.set(Math.max(0.01, p.s.scale.x * (1 + p.grow * dt)));
    }
  }

  get count(): number { return this.live.length; }
}

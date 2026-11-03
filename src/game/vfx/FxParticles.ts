import { Container, Sprite, type Texture } from 'pixi.js';

/**
 * Particules visuelles avec réserve d'objets et plafond (niveau de qualité).
 * Pas d'entités ECS : mises à jour au rythme de l'affichage.
 *
 * Formes : `glow` (lueur additive), `spark` (étincelle étirée selon la vitesse),
 * `smoke` (fumée en mélange normal), `ring` (onde de choc qui s'agrandit).
 */
export type ParticleShape = 'glow' | 'spark' | 'smoke' | 'ring';

export interface EmitOptions {
  color: number;
  shape?: ParticleShape;
  count?: number;
  speed?: number;
  /** Variation de vitesse (0 = toutes identiques). */
  speedVar?: number;
  size?: number;
  life?: number;
  /** Direction moyenne (rad) et ouverture du cône (rad, 2π = toutes directions). */
  angle?: number;
  spread?: number;
  drag?: number;
  /** Croissance de la taille par seconde (−0.6 = rétrécit, 2 = gonfle). */
  grow?: number;
  gravity?: number;
  alpha?: number;
  /** Rayon de dispersion de la position de départ. */
  jitter?: number;
  /** Vitesse de rotation (rad/s), pour la fumée. */
  spin?: number;
  /** Fondu de la couleur vers cette teinte en fin de vie (ex. braise orange → rouge sombre). */
  endColor?: number;
}

interface P {
  s: Sprite; shape: ParticleShape; vx: number; vy: number; life: number; max: number;
  drag: number; grow: number; gravity: number; a0: number; size: number; spin: number;
  c0: number; c1: number;
}

function mix(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (r << 16) | (g << 8) | bl;
}

export class FxParticles {
  max = 1500;
  density = 1;
  private live: P[] = [];
  private pool: Sprite[] = [];
  private readonly back = new Container({ label: 'smoke' });
  private readonly front = new Container({ label: 'glow' });

  constructor(layer: Container, private readonly tex: Record<'glow' | 'spark' | 'smoke' | 'ring', Texture>) {
    layer.addChild(this.back, this.front);
  }

  emit(x: number, y: number, o: EmitOptions): void {
    const shape = o.shape ?? 'glow';
    let n = o.count ?? 1;
    if (n > 1) n = Math.max(1, Math.round(n * this.density));
    const room = this.max - this.live.length;
    if (room <= 0) return;
    n = Math.min(n, room);
    const sv = o.speedVar ?? 0.6;
    for (let i = 0; i < n; i++) {
      const s = this.pool.pop() ?? new Sprite();
      s.texture = this.tex[shape];
      s.anchor.set(shape === 'spark' ? 0.85 : 0.5, 0.5);
      s.blendMode = shape === 'smoke' ? 'normal' : 'add';
      s.tint = o.color;
      const j = o.jitter ?? 0;
      s.position.set(x + (Math.random() - 0.5) * j * 2, y + (Math.random() - 0.5) * j * 2);
      const size = (o.size ?? 0.5) * (0.7 + Math.random() * 0.6);
      s.scale.set(size);
      s.rotation = shape === 'smoke' ? Math.random() * Math.PI * 2 : 0;
      const ang = (o.angle ?? 0) + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2);
      const sp = (o.speed ?? 120) * (1 - sv / 2 + Math.random() * sv);
      const life = (o.life ?? 0.6) * (0.75 + Math.random() * 0.5);
      s.alpha = o.alpha ?? 1;
      (shape === 'smoke' ? this.back : this.front).addChild(s);
      this.live.push({
        s, shape, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life, max: life,
        drag: o.drag ?? 3, grow: o.grow ?? -0.6, gravity: o.gravity ?? 0, a0: s.alpha, size,
        spin: (o.spin ?? 0) * (Math.random() - 0.5) * 2, c0: o.color, c1: o.endColor ?? -1,
      });
    }
  }

  /**
   * Atténuation des lueurs additives quand elles s'empilent : au-delà de ~140 particules vives,
   * chacune éclaire un peu moins. Les grosses mêlées restent lisibles au lieu de virer au blanc.
   */
  crowd = 1;

  update(dt: number): void {
    const target = 1 / (1 + Math.max(0, this.front.children.length - 140) / 300);
    this.crowd += (target - this.crowd) * Math.min(1, dt * 6);
    const crowd = this.crowd;
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
      const t = p.life / p.max; // 1 → 0
      p.size = Math.max(0.01, p.size * (1 + p.grow * dt));
      if (p.c1 >= 0) p.s.tint = mix(p.c0, p.c1, 1 - t);
      switch (p.shape) {
        case 'spark': {
          // Étirée dans le sens du mouvement, plus longue quand rapide.
          const v = Math.hypot(p.vx, p.vy);
          p.s.rotation = Math.atan2(p.vy, p.vx);
          p.s.scale.set(p.size * (0.4 + v / 260), p.size * 0.9);
          p.s.alpha = p.a0 * Math.min(1, t * 3) * crowd;
          break;
        }
        case 'smoke':
          p.s.rotation += p.spin * dt;
          p.s.scale.set(p.size);
          // Apparition douce puis disparition lente.
          p.s.alpha = p.a0 * Math.min(1, (1 - t) * 6) * t;
          break;
        case 'ring':
          p.s.scale.set(p.size);
          p.s.alpha = p.a0 * t * t * crowd;
          break;
        default:
          p.s.scale.set(p.size);
          p.s.alpha = p.a0 * Math.min(1, t * 2) * crowd;
      }
    }
  }

  clear(): void {
    for (const p of this.live) { p.s.removeFromParent(); this.pool.push(p.s); }
    this.live.length = 0;
  }

  get count(): number { return this.live.length; }

  destroy(): void {
    this.clear();
    for (const s of this.pool) s.destroy();
    this.back.destroy(); this.front.destroy();
  }
}

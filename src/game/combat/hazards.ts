import { Container, Graphics } from 'pixi.js';
import { STATUS_COLORS } from './data';
import type { AnyStatus } from './components';
import { makeZone, type Zone } from './rules';

/**
 * Zones télégraphiées au sol : chaque attaque dangereuse s'annonce (contour + remplissage
 * qui grandit) puis détone. C'est ce qui rend l'esquive lisible et juste.
 * Côté `foe` : blesse le héros. Côté `hero` : blesse les ennemis (comète, piège, pluie…).
 */
export interface Hazard {
  zone: Zone;
  side: 'hero' | 'foe';
  /** Délai avant détonation (s). */
  delay: number;
  /** Temps écoulé depuis la création. */
  t: number;
  damage: number;
  crit: boolean;
  status?: AnyStatus;
  statusTime?: number;
  stacks?: number;
  color: number;
  /** Zone persistante après détonation (s) : dégâts répétés toutes les `tickEvery` s. */
  linger: number;
  tickEvery: number;
  tickT: number;
  fired: boolean;
  /** La zone suit `follow.x/y()` jusqu'à `follow.until` (marque). */
  follow?: { x: () => number; y: () => number; until: number };
  /** Piège : détone quand un ennemi entre (durée max = delay). */
  proximity?: boolean;
  /** Recul appliqué aux cibles (px/s) depuis le centre. */
  knock: number;
  /** Rappel à la détonation (effets, secousse, ruée du lanceur…). */
  onFire?: (h: Hazard) => void;
  /** Entité à l'origine (pour le vol de vie du boss, statistiques). */
  owner: number;
  /** Pas de remplissage progressif (zone d'effet instantanée purement visuelle). */
  silent?: boolean;
  gfx: Graphics;
  /** Durée du flash après détonation. */
  flash: number;
}

export type HazardSpec = Partial<Omit<Hazard, 'zone' | 'gfx' | 't' | 'tickT' | 'fired' | 'flash'>> & { zone: Partial<Zone> & Pick<Zone, 'shape' | 'x' | 'y'> };

export class HazardField {
  readonly list: Hazard[] = [];
  private pool: Graphics[] = [];

  constructor(private readonly layer: Container) {}

  add(spec: HazardSpec): Hazard {
    const gfx = this.pool.pop() ?? new Graphics();
    this.layer.addChild(gfx);
    const h: Hazard = {
      side: 'foe', delay: 0.8, damage: 10, crit: false, color: STATUS_COLORS[spec.status ?? 'none'],
      linger: 0, tickEvery: 0.5, knock: 0, owner: 0,
      ...spec,
      zone: makeZone(spec.zone), t: 0, tickT: 0, fired: false, flash: 0, gfx,
    };
    this.list.push(h);
    return h;
  }

  /**
   * Avance les zones. `detonate(h, first)` applique les dégâts (first = détonation, sinon tic persistant).
   * `anyFoeIn(zone)` sert aux pièges.
   */
  update(dt: number, detonate: (h: Hazard, first: boolean) => void, anyFoeIn: (z: Zone) => boolean): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      h.t += dt;
      if (h.follow && h.t < h.follow.until) {
        const k = 1 - Math.exp(-6 * dt); // la marque traîne un peu derrière la cible
        h.zone.x += (h.follow.x() - h.zone.x) * k;
        h.zone.y += (h.follow.y() - h.zone.y) * k;
      }
      if (!h.fired) {
        if (h.proximity && h.t > 0.35 && anyFoeIn(h.zone)) h.delay = Math.min(h.delay, h.t);
        if (h.t >= h.delay) {
          h.fired = true; h.flash = 0.22;
          h.onFire?.(h);
          detonate(h, true);
        }
      } else {
        h.flash = Math.max(0, h.flash - dt);
        if (h.linger > 0) {
          h.tickT += dt;
          if (h.tickT >= h.tickEvery) { h.tickT -= h.tickEvery; detonate(h, false); }
        }
        if (h.t >= h.delay + Math.max(h.linger, 0.22)) this.removeAt(i);
      }
    }
  }

  clear(): void { for (let i = this.list.length - 1; i >= 0; i--) this.removeAt(i); }

  /** Dessin (phase de rendu uniquement). */
  draw(time: number): void {
    for (const h of this.list) {
      const g = h.gfx;
      g.clear();
      if (h.silent && !h.fired) continue;
      const z = h.zone, col = h.color;
      if (!h.fired) {
        const p = Math.min(1, h.t / Math.max(0.01, h.delay));
        const pulse = 0.75 + 0.25 * Math.sin(time * 18);
        const edge = h.side === 'foe' ? 0.85 * pulse : 0.6;
        this.shape(g, z, 1).fill({ color: col, alpha: h.side === 'foe' ? 0.12 : 0.08 }).stroke({ color: col, width: 3, alpha: edge });
        // Remplissage qui grandit : le joueur voit exactement quand ça frappe.
        if (h.proximity) this.shape(g, z, 0.35 + 0.1 * Math.sin(time * 6)).fill({ color: col, alpha: 0.25 });
        else this.shape(g, z, p).fill({ color: col, alpha: 0.18 + 0.22 * p });
      } else {
        const a = h.flash > 0 ? h.flash / 0.22 : 0;
        if (a > 0) this.shape(g, z, 1).fill({ color: 0xffffff, alpha: 0.5 * a }).stroke({ color: col, width: 6, alpha: a });
        if (h.linger > 0 && h.t < h.delay + h.linger) {
          const left = (h.delay + h.linger - h.t) / h.linger;
          this.shape(g, z, 1).fill({ color: col, alpha: (0.2 + 0.08 * Math.sin(time * 9)) * Math.min(1, left * 3) });
        }
      }
    }
  }

  /** Trace la forme ; `k` (0..1) réduit la forme depuis son origine (remplissage progressif). */
  private shape(g: Graphics, z: Zone, k: number): Graphics {
    switch (z.shape) {
      case 'circle': return g.circle(z.x, z.y, Math.max(1, z.r * k));
      case 'ring': {
        // Anneau en un seul polygone (contour extérieur puis intérieur à rebours).
        const inner = Math.max(0.5, z.r2), outer = inner + (z.r - inner) * k, n = 48, pts: number[] = [];
        for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push(z.x + Math.cos(a) * outer, z.y + Math.sin(a) * outer); }
        for (let i = n; i >= 0; i--) { const a = (i / n) * Math.PI * 2; pts.push(z.x + Math.cos(a) * inner, z.y + Math.sin(a) * inner); }
        return g.poly(pts);
      }
      case 'line': {
        const c = Math.cos(z.angle), s = Math.sin(z.angle), hw = z.width / 2, L = z.len * k;
        return g.poly([z.x - s * hw, z.y + c * hw, z.x + c * L - s * hw, z.y + s * L + c * hw, z.x + c * L + s * hw, z.y + s * L - c * hw, z.x + s * hw, z.y - c * hw]);
      }
      case 'cone': {
        const r = Math.max(1, z.r * k);
        g.moveTo(z.x, z.y);
        g.arc(z.x, z.y, r, z.angle - z.arc / 2, z.angle + z.arc / 2);
        return g.lineTo(z.x, z.y);
      }
      case 'cross': {
        const hw = (z.width / 2) * (k < 1 ? Math.max(0.15, k) : 1), L = z.len;
        for (const a of [z.angle, z.angle + Math.PI / 2]) {
          const c = Math.cos(a), s = Math.sin(a);
          g.poly([z.x - c * L - s * hw, z.y - s * L + c * hw, z.x + c * L - s * hw, z.y + s * L + c * hw, z.x + c * L + s * hw, z.y + s * L - c * hw, z.x - c * L + s * hw, z.y - s * L - c * hw]);
        }
        return g;
      }
    }
  }

  private removeAt(i: number): void {
    const h = this.list[i];
    h.gfx.clear(); h.gfx.removeFromParent(); this.pool.push(h.gfx);
    this.list[i] = this.list[this.list.length - 1]; this.list.pop();
  }
}

import { Transform, Velocity } from '@engine';
import { Foe, Hero, type FoeC } from './components';
import { BODY_Y, type CombatCtx } from './context';
import { speedMul, tickStatuses } from './status';
import { ENEMY_DEFS, STATUS_COLORS, type EnemyAttack, type EnemyId } from './data';
import { enemyTempo } from './rules';

/**
 * IA des ennemis : une petite machine à états  move → windup (télégraphe) → act → recover.
 * Toutes les attaques dangereuses passent par une zone au sol annoncée (HazardField).
 */
export function updateFoes(c: CombatCtx, dt: number): void {
  const { world } = c;
  const pt = world.get(c.player, Transform)!;
  const pv = world.get(c.player, Velocity)!;
  for (const e of world.query(Foe, Transform, Velocity)) {
    const f = world.get(e, Foe)!, t = world.get(e, Transform)!, v = world.get(e, Velocity)!;
    tickFoeCommon(c, e, f, dt);
    if (f.boss) continue; // voir boss.ts
    // Gelé : immobile, attaque suspendue (la ruée en cours s'arrête).
    if (f.statuses.gel) { v.x *= 0.7; v.y *= 0.7; f.rush = null; continue; }
    if (f.spawnT < 0.4) { v.x = 0; v.y = 0; continue; } // sortie du portail
    const dx = pt.x - t.x, dy = pt.y - t.y, d = Math.hypot(dx, dy) || 1;
    const sp = f.speed * speedMul(f);
    const k = 1 - Math.exp(-5 * dt);
    const a = f.def.attack;

    switch (f.state) {
      case 'move': {
        f.angle = Math.atan2(dy, dx);
        f.facing = dx >= 0 ? 1 : -1;
        let mx = dx / d, my = dy / d;
        if (f.def.move === 'kite') {
          // Garde ses distances et tourne autour du héros.
          const want = 300;
          const radial = d > want + 80 ? 1 : d < want - 70 ? -1 : 0;
          mx = (dx / d) * radial + (-dy / d) * f.orbit * 0.7;
          my = (dy / d) * radial + (dx / d) * f.orbit * 0.7;
          const l = Math.hypot(mx, my) || 1; mx /= l; my /= l;
          if (f.def.blink && d < 170 && f.blinkCd <= 0) blink(c, e, f, t, pt.x, pt.y, 340);
        }
        v.x += (mx * sp - v.x) * k;
        v.y += (my * sp - v.y) * k;
        if (f.def.summons && f.summonCd <= 0 && d < 700) summon(c, f, t.x, t.y);
        if (f.cd <= 0 && d <= a.trigger) { const lead = enemyTempo(c.wave).lead; startAttack(c, e, f, t.x, t.y, pt.x + pv.x * lead, pt.y + pv.y * lead); }
        break;
      }
      case 'windup': {
        // Les marques et les sorts à distance laissent l'ennemi bouger un peu ; les coups le figent.
        const drift = a.kind === 'mark' || a.kind === 'bolt' ? 0.3 : 0;
        v.x += ((dx / d) * sp * drift - v.x) * k * 2;
        v.y += ((dy / d) * sp * drift - v.y) * k * 2;
        if (a.kind === 'bolt' && c.rng.chance(0.5)) c.particles.emit(t.x, t.y - f.def.h * 0.6, { color: STATUS_COLORS[f.def.status ?? 'void'], count: 1, speed: 60, size: 0.5, life: 0.3 });
        f.t -= dt;
        if (f.t <= 0) act(c, e, f, t);
        break;
      }
      case 'act': {
        if (f.rush) {
          v.x = f.rush.vx; v.y = f.rush.vy;
          f.rush.t -= dt;
          if (c.rng.chance(0.6)) c.particles.emit(t.x, t.y - 20, { color: f.def.tint === 0xffffff ? 0xffc27a : f.def.tint, count: 2, speed: 50, size: 0.5, life: 0.3 });
          if (f.rush.t <= 0) { f.rush = null; v.x *= 0.2; v.y *= 0.2; f.state = 'recover'; f.t = 0.45; }
        } else { f.state = 'recover'; f.t = 0.35; }
        break;
      }
      case 'recover': {
        v.x *= Math.exp(-8 * dt); v.y *= Math.exp(-8 * dt);
        f.t -= dt;
        if (f.t <= 0) f.state = 'move';
        break;
      }
    }
  }
}

/** Minuteries, statuts et saignement, communs aux ennemis et aux boss. */
function tickFoeCommon(c: CombatCtx, e: number, f: FoeC, dt: number): void {
  f.flash = Math.max(0, f.flash - dt);
  f.spawnT += dt;
  f.cd -= dt; f.contactCd -= dt; f.blinkCd -= dt; f.summonCd -= dt;
  tickStatuses(c, e, f, dt);
}

function startAttack(c: CombatCtx, e: number, f: FoeC, x: number, y: number, hx: number, hy: number): void {
  const a0 = f.def.attack;
  const a = { ...a0, windup: a0.windup * enemyTempo(c.wave).windup };
  f.state = 'windup'; f.t = a.windup; f.cd = a.cd;
  f.tx = hx; f.ty = hy;
  f.angle = Math.atan2(hy - y, hx - x);
  const dmg = f.dmg * a.dmgMul;
  const base = { side: 'foe' as const, damage: dmg, status: f.def.status, statusTime: 2, owner: e };
  switch (a.kind) {
    case 'leap': c.hazards.add({ ...base, zone: { shape: 'circle', x: hx, y: hy, r: a.radius! }, delay: a.windup + 0.2, knock: 260 }); break;
    case 'cone': c.hazards.add({ ...base, zone: { shape: 'cone', x, y, angle: f.angle, r: a.radius!, arc: a.arc! }, delay: a.windup, knock: 320 }); break;
    case 'slam': c.hazards.add({ ...base, zone: { shape: 'circle', x, y, r: a.radius! }, delay: a.windup, knock: 380, onFire: (h) => c.feedback.ring(h.zone.x, h.zone.y, h.zone.r, 0xffd9a0) }); break;
    case 'charge': c.hazards.add({ ...base, zone: { shape: 'line', x, y, angle: f.angle, len: a.len!, width: a.width! }, delay: a.windup + 0.12, knock: 420 }); break;
    case 'line': c.hazards.add({ ...base, zone: { shape: 'line', x, y, angle: f.angle, len: a.len!, width: a.width! }, delay: a.windup, linger: 1.4, tickEvery: 0.45, damage: dmg }); break;
    case 'circleAt': c.hazards.add({ ...base, zone: { shape: 'circle', x: hx, y: hy, r: a.radius! }, delay: a.windup, statusTime: 1.6 }); break;
    case 'cross': c.hazards.add({ ...base, zone: { shape: 'cross', x: hx, y: hy, angle: c.rng.chance(0.5) ? 0 : Math.PI / 4, len: a.len!, width: a.width! }, delay: a.windup, knock: 200 }); break;
    case 'mark': {
      const pt = c.world.get(c.player, Transform)!;
      c.hazards.add({ ...base, zone: { shape: 'circle', x: pt.x, y: pt.y, r: a.radius! }, delay: a.windup, knock: 260,
        follow: { x: () => pt.x, y: () => pt.y, until: a.windup * 0.6 } });
      break;
    }
    case 'bolt': break; // incantation visible (particules), le tir part à la fin
  }
}

function act(c: CombatCtx, e: number, f: FoeC, t: { x: number; y: number }): void {
  const a: EnemyAttack = f.def.attack;
  f.state = 'act';
  switch (a.kind) {
    case 'leap': {
      const dx = f.tx - t.x, dy = f.ty - t.y;
      f.rush = { t: 0.2, vx: dx / 0.2, vy: dy / 0.2, hitDone: false };
      break;
    }
    case 'charge': {
      const sp = a.speed ?? 900;
      f.rush = { t: a.len! / sp, vx: Math.cos(f.angle) * sp, vy: Math.sin(f.angle) * sp, hitDone: false };
      break;
    }
    case 'bolt': {
      const pt = c.world.get(c.player, Transform)!;
      const base = Math.atan2(pt.y - t.y, pt.x - t.x);
      const n = a.count ?? 1;
      for (let i = 0; i < n; i++) {
        const ang = base + (n > 1 ? (i / (n - 1) - 0.5) * 0.5 : 0);
        c.spawnShot({ side: 'foe', x: t.x, y: t.y, dx: Math.cos(ang), dy: Math.sin(ang), speed: a.speed ?? 320, damage: f.dmg * a.dmgMul, color: STATUS_COLORS[f.def.status ?? 'void'],
          owner: e, status: f.def.status, statusTime: 1.5, life: 2.4, radius: 12 });
      }
      break;
    }
    default: break;
  }
  c.g.events.emit('enemy:attack', { id: e, kind: f.def.id, attack: a.kind, x: t.x, y: t.y });
}

export function blink(c: CombatCtx, e: number, f: FoeC, t: { x: number; y: number; prevX: number; prevY: number }, hx: number, hy: number, dist: number): void {
  const b = c.bounds;
  for (let tries = 0; tries < 6; tries++) {
    const ang = c.rng.range(0, Math.PI * 2);
    const nx = hx + Math.cos(ang) * dist, ny = hy + Math.sin(ang) * dist;
    if (nx < b.x + 80 || nx > b.x + b.w - 80 || ny < b.y + 80 || ny > b.y + b.h - 80) continue;
    c.particles.emit(t.x, t.y - BODY_Y, { color: 0xb07bff, count: 14, speed: 160, size: 0.6, life: 0.4 });
    t.x = t.prevX = nx; t.y = t.prevY = ny;
    c.particles.emit(t.x, t.y - BODY_Y, { color: 0xb07bff, count: 14, speed: 160, size: 0.6, life: 0.4 });
    f.blinkCd = 4;
    void e;
    return;
  }
}

function summon(c: CombatCtx, f: FoeC, x: number, y: number): void {
  f.summonCd = 11;
  const pool: EnemyId[] = c.wave >= 8 ? ['wolf', 'moonStalker'] : ['wolf', 'emberHound'];
  for (let i = 0; i < 2; i++) {
    const a = c.rng.range(0, Math.PI * 2);
    c.spawnFoe(c.rng.pick(pool), x + Math.cos(a) * 90, y + Math.sin(a) * 90, { portal: true });
  }
  c.g.events.emit('enemy:summon', { kind: f.def.id, x, y });
}

/** Le héros est-il en train d'esquiver (pour l'esquive parfaite) ? Utilisé par la scène. */
export function heroIsDodging(c: CombatCtx): boolean {
  const h = c.world.get(c.player, Hero)!;
  return h.invuln > 0 && c.time - h.dashAt < 0.4;
}

export const enemyName = (id: EnemyId) => ENEMY_DEFS[id].name;

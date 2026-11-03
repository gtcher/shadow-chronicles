import { Transform, Velocity } from '@engine';
import { Foe, type BossState, type FoeC } from './components';
import { BODY_Y, type CombatCtx } from './context';
import { STATUS_COLORS, type StatusId } from './data';
import { blink } from './foes';
import { speedMul } from './status';
import type { HazardSpec } from './hazards';

/**
 * Boss à 3 phases (seuils 68 % et 34 % PV, comme le Juge du prototype).
 * Chaque phase a ses motifs ; la transition rend le boss invulnérable 1,4 s, invoque
 * des serviteurs et accélère le rythme. Les motifs sont télégraphiés au sol.
 */
const CADENCE = [0, 2.5, 2.05, 1.6] as const;

export function updateBosses(c: CombatCtx, dt: number): void {
  const { world } = c;
  const pt = world.get(c.player, Transform)!;
  for (const e of world.query(Foe, Transform, Velocity)) {
    const f = world.get(e, Foe)!;
    if (!f.boss) continue;
    const b = f.boss, t = world.get(e, Transform)!, v = world.get(e, Velocity)!;
    const dx = pt.x - t.x, dy = pt.y - t.y, d = Math.hypot(dx, dy) || 1;
    f.facing = dx >= 0 ? 1 : -1;
    b.spin += dt * (b.phase === 3 ? 0.5 : 0.25);

    if (f.spawnT < 1.2) { v.x = 0; v.y = 0; continue; } // entrée en scène
    if (b.transition > 0) {
      b.transition -= dt;
      v.x *= 0.8; v.y *= 0.8;
      if (c.rng.chance(0.5)) c.particles.emit(t.x, t.y - f.def.h * 0.5, { color: b.def.color, count: 3, speed: 220, size: 0.8, life: 0.5 });
      continue;
    }

    // Phase 3 de l'Arbitre : Dévoration, le héros est attiré.
    if (b.def.id === 'arbiter' && b.phase === 3 && d < 900) { pt.x -= (dx / d) * 60 * dt; pt.y -= (dy / d) * 60 * dt; }

    if (f.rush) {
      v.x = f.rush.vx; v.y = f.rush.vy;
      f.rush.t -= dt;
      if (c.rng.chance(0.8)) c.particles.emit(t.x, t.y - 30, { color: b.def.color, count: 3, speed: 80, size: 0.8, life: 0.4 });
      if (f.rush.t <= 0) { f.rush = null; v.x = 0; v.y = 0; }
      continue;
    }

    // Approche à distance moyenne.
    const want = b.def.id === 'oracle' ? 380 : 220;
    const radial = d > want + 60 ? 1 : d < want - 80 ? -0.5 : 0;
    const k = 1 - Math.exp(-4 * dt);
    const sp = f.speed * speedMul(f) * (b.phase === 3 ? 1.2 : 1);
    v.x += ((dx / d) * radial * sp - (dy / d) * 0.3 * sp * (radial === 0 ? 1 : 0) - v.x) * k;
    v.y += ((dy / d) * radial * sp + (dx / d) * 0.3 * sp * (radial === 0 ? 1 : 0) - v.y) * k;

    b.next -= dt;
    if (b.next <= 0) {
      b.next = CADENCE[b.phase];
      PATTERNS[b.def.id](c, e, f, b, t, pt);
      b.step++;
      c.g.events.emit('boss:attack', { id: b.def.id, entity: e, phase: b.phase, step: b.step });
    }
  }
}

type Pos = { x: number; y: number; prevX: number; prevY: number };
type Pattern = (c: CombatCtx, e: number, f: FoeC, b: BossState, t: Pos, pt: Pos) => void;

const hz = (c: CombatCtx, e: number, f: FoeC, mul: number, spec: Omit<HazardSpec, 'damage'>, status?: StatusId) =>
  c.hazards.add({ side: 'foe', owner: e, damage: f.dmg * mul, status, statusTime: status ? 2 : undefined, color: STATUS_COLORS[status ?? 'none'], ...spec });

/** Charge en ligne droite (Capitaine, Souverain). */
function charge(c: CombatCtx, e: number, f: FoeC, t: Pos, tx: number, ty: number, windup: number, len: number, width: number, status?: StatusId) {
  const ang = Math.atan2(ty - t.y, tx - t.x);
  hz(c, e, f, 1.2, { zone: { shape: 'line', x: t.x, y: t.y, angle: ang, len, width }, delay: windup + 0.1, knock: 500,
    onFire: () => { f.rush = { t: len / 1300, vx: Math.cos(ang) * 1300, vy: Math.sin(ang) * 1300, hitDone: false }; c.g.camera.shake(0.3); } }, status);
}

/** Bandes parallèles qui détonent l'une après l'autre (« Colonnes de feu »). */
function bands(c: CombatCtx, e: number, f: FoeC, cx: number, cy: number, vertical: boolean, n: number, gap: number, status: StatusId) {
  const order = c.rng.chance(0.5) ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * gap;
    const x = vertical ? cx + off : cx - 900, y = vertical ? cy - 900 : cy + off;
    const idx = order > 0 ? i : n - 1 - i;
    hz(c, e, f, 0.9, { zone: { shape: 'line', x, y, angle: vertical ? Math.PI / 2 : 0, len: 1800, width: gap * 0.55 }, delay: 1.0 + idx * 0.22, linger: 1.2, tickEvery: 0.5 }, status);
  }
}

function ringNova(c: CombatCtx, e: number, f: FoeC, x: number, y: number, r: number, r2: number, delay: number, status?: StatusId) {
  hz(c, e, f, 1, { zone: { shape: 'ring', x, y, r, r2 }, delay, knock: 300 }, status);
}

function fan(c: CombatCtx, e: number, f: FoeC, t: Pos, toward: Pos, n: number, spread: number, speed: number, status: StatusId) {
  const base = Math.atan2(toward.y - t.y, toward.x - t.x);
  for (let i = 0; i < n; i++) {
    const a = base + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
    c.spawnShot({ side: 'foe', x: t.x, y: t.y, dx: Math.cos(a), dy: Math.sin(a), speed, damage: f.dmg * 0.6, color: STATUS_COLORS[status], owner: e, status, statusTime: 1.5, life: 3, radius: 14, size: 1.3 });
  }
}

function spiral(c: CombatCtx, e: number, f: FoeC, t: Pos, arms: number, shots: number, offset: number, status: StatusId) {
  for (let i = 0; i < shots; i++) {
    const a = offset + (i / shots) * Math.PI * 2 * (arms / Math.max(1, arms));
    c.spawnShot({ side: 'foe', x: t.x, y: t.y, dx: Math.cos(a), dy: Math.sin(a), speed: 260, damage: f.dmg * 0.5, color: STATUS_COLORS[status], owner: e, status, statusTime: 1.2, life: 3.4, radius: 13, size: 1.2 });
  }
}

const PATTERNS: Record<BossState['def']['id'], Pattern> = {
  // ⚔ Le Capitaine Cendrefer : charges, coups en cône, colonnes de feu.
  captain(c, e, f, b, t, pt) {
    const s = b.step;
    if (b.phase === 1) {
      if (s % 2 === 0) charge(c, e, f, t, pt.x, pt.y, 0.9, 640, 120, 'burn');
      else {
        const ang = Math.atan2(pt.y - t.y, pt.x - t.x);
        hz(c, e, f, 1, { zone: { shape: 'cone', x: t.x, y: t.y, angle: ang, r: 280, arc: 2.1 }, delay: 0.75, knock: 360 });
        hz(c, e, f, 1, { zone: { shape: 'cone', x: t.x, y: t.y, angle: ang + Math.PI, r: 220, arc: 1.6 }, delay: 1.25, knock: 300 });
      }
    } else if (b.phase === 2) {
      if (s % 3 === 2) charge(c, e, f, t, pt.x, pt.y, 0.75, 700, 120, 'burn');
      else bands(c, e, f, pt.x, pt.y, s % 2 === 0, 5, 170, 'burn');
    } else {
      if (s % 3 === 0) {
        bands(c, e, f, pt.x, pt.y, true, 5, 170, 'burn');
        bands(c, e, f, pt.x, pt.y, false, 3, 260, 'burn');
      } else if (s % 3 === 1) {
        // Trois charges enchaînées, chacune réajustée sur le héros.
        charge(c, e, f, t, pt.x, pt.y, 0.7, 700, 120, 'burn');
        for (let k = 1; k <= 2; k++) {
          setTimeoutSim(c, 0.7 + 0.65 * k, () => { const ft = c.world.get(e, Transform); const p = c.world.get(c.player, Transform)!; if (ft) charge(c, e, f, ft, p.x, p.y, 0.45, 600, 110, 'burn'); });
        }
      } else ringNova(c, e, f, t.x, t.y, 420, 150, 1.0, 'burn');
    }
  },

  // ❄ La Matriarche lunaire : fleurs de givre, fissures rayonnantes, étreinte.
  oracle(c, e, f, b, t, pt) {
    const s = b.step;
    if (b.phase === 1) {
      if (s % 2 === 0) {
        hz(c, e, f, 1, { zone: { shape: 'circle', x: pt.x, y: pt.y, r: 120 }, delay: 0.9 }, 'frost');
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + b.spin;
          hz(c, e, f, 0.8, { zone: { shape: 'circle', x: pt.x + Math.cos(a) * 230, y: pt.y + Math.sin(a) * 230, r: 95 }, delay: 1.3 }, 'frost');
        }
      } else fan(c, e, f, t, pt, 5, 0.9, 340, 'frost');
    } else if (b.phase === 2) {
      if (s % 2 === 0) {
        const n = 8;
        for (let i = 0; i < n; i++) hz(c, e, f, 1, { zone: { shape: 'line', x: t.x, y: t.y, angle: b.spin + (i / n) * Math.PI * 2, len: 1000, width: 64 }, delay: 1.1 }, 'frost');
        b.spin += Math.PI / n;
      } else {
        hz(c, e, f, 1, { zone: { shape: 'circle', x: pt.x, y: pt.y, r: 140 }, delay: 0.8 }, 'frost');
        fan(c, e, f, t, pt, 7, 1.2, 360, 'frost');
      }
    } else {
      if (s % 3 === 0) {
        // Étreinte : tout est gelé sauf près d'elle.
        ringNova(c, e, f, t.x, t.y, 1400, 300, 1.7, 'frost');
        c.announce('Rapproche-toi d’elle !', undefined, 0x86cfff);
      } else if (s % 3 === 1) {
        spiral(c, e, f, t, 3, 18, b.spin, 'frost');
        setTimeoutSim(c, 0.5, () => { const ft = c.world.get(e, Transform); if (ft) spiral(c, e, f, ft, 3, 18, b.spin + 0.17, 'frost'); });
      } else {
        blink(c, e, f, t, pt.x, pt.y, 420);
        for (let i = 0; i < 4; i++) hz(c, e, f, 1, { zone: { shape: 'line', x: t.x, y: t.y, angle: b.spin + (i / 4) * Math.PI * 2, len: 1000, width: 70 }, delay: 1.0 }, 'frost');
      }
    }
  },

  // ☾ L'Arbitre de l'Éclipse : téléportations, croix du néant, dévoration (se soigne en touchant).
  arbiter(c, e, f, b, t, pt) {
    const s = b.step;
    const strike = () => {
      blink(c, e, f, t, pt.x, pt.y, 170);
      const ang = Math.atan2(pt.y - t.y, pt.x - t.x);
      hz(c, e, f, 1.1, { zone: { shape: 'cone', x: t.x, y: t.y, angle: ang, r: 290, arc: 1.9 }, delay: 0.65, knock: 380 }, 'void');
    };
    if (b.phase === 1) {
      if (s % 2 === 0) strike(); else fan(c, e, f, t, pt, 3, 0.5, 400, 'void');
    } else if (b.phase === 2) {
      if (s % 2 === 0) {
        const x = pt.x, y = pt.y;
        hz(c, e, f, 1, { zone: { shape: 'cross', x, y, angle: 0, len: 950, width: 96 }, delay: 1.0 }, 'void');
        hz(c, e, f, 1, { zone: { shape: 'cross', x, y, angle: Math.PI / 4, len: 950, width: 96 }, delay: 1.7 }, 'void');
      } else strike();
    } else {
      if (s % 3 === 0) {
        for (let i = 0; i < 3; i++) {
          setTimeoutSim(c, i * 0.55, () => { const p = c.world.get(c.player, Transform)!; hz(c, e, f, 0.9, { zone: { shape: 'cross', x: p.x, y: p.y, angle: i % 2 ? Math.PI / 4 : 0, len: 900, width: 90 }, delay: 0.95 }, 'void'); });
        }
      } else if (s % 3 === 1) {
        spiral(c, e, f, t, 4, 24, b.spin, 'void');
      } else strike();
    }
  },

  // ♜ Le Souverain des Ruines : marteau, failles, bords du champ de bataille.
  sovereign(c, e, f, b, t, pt) {
    const s = b.step;
    const hammer = (x: number, y: number) => {
      hz(c, e, f, 1.3, { zone: { shape: 'circle', x, y, r: 175 }, delay: 1.0, knock: 500, onFire: () => { c.g.camera.shake(0.5); c.g.hitStop(0.05); } });
      ringNova(c, e, f, x, y, 420, 260, 1.4);
    };
    const faults = (n: number, spread: number) => {
      const base = Math.atan2(pt.y - t.y, pt.x - t.x);
      for (let j = 0; j < n; j++) {
        const a = base + (n > 1 ? (j / (n - 1) - 0.5) * spread : 0);
        for (let i = 1; i <= 11; i++) hz(c, e, f, 0.9, { zone: { shape: 'circle', x: t.x + Math.cos(a) * i * 90, y: t.y + Math.sin(a) * i * 90, r: 72 }, delay: 0.75 + i * 0.07 });
      }
    };
    if (b.phase === 1) {
      if (s % 2 === 0) hammer(pt.x, pt.y); else charge(c, e, f, t, pt.x, pt.y, 0.95, 560, 150);
    } else if (b.phase === 2) {
      if (s % 2 === 0) faults(3, 0.8); else hammer(pt.x, pt.y);
    } else {
      if (b.edge <= 0) {
        // Les abords deviennent mortels jusqu'à la fin du combat.
        b.edge = 1;
        const B = c.bounds, cx = B.x + B.w / 2, cy = B.y + B.h / 2;
        hz(c, e, f, 0.35, { zone: { shape: 'ring', x: cx, y: cy, r: Math.hypot(B.w, B.h), r2: Math.min(B.w, B.h) * 0.36 }, delay: 2.2, linger: 9999, tickEvery: 0.5, color: 0xffc878 });
        c.announce('Les abords s’effondrent !', 'Reste au centre', 0xffc878);
      } else if (s % 2 === 0) { faults(5, 1.4); } else { hammer(pt.x, pt.y); setTimeoutSim(c, 0.6, () => { const p = c.world.get(c.player, Transform)!; hammer(p.x, p.y); }); }
    }
  },
};

/**
 * Action différée en temps de simulation (respecte pause et ralenti) :
 * une zone invisible sans dégâts dont la détonation déclenche le rappel.
 */
function setTimeoutSim(c: CombatCtx, delay: number, fn: () => void): void {
  c.hazards.add({ side: 'hero', zone: { shape: 'circle', x: 0, y: 0, r: 0 }, delay, damage: 0, silent: true, onFire: fn });
}

/** Changement de phase (appelé par la scène quand les PV passent un seuil). */
export function enterPhase(c: CombatCtx, e: number, f: FoeC, phase: 2 | 3): void {
  const b = f.boss!;
  b.phase = phase; b.transition = 1.4; b.next = 1.9; b.step = 0;
  f.rush = null;
  const t = c.world.get(e, Transform)!;
  c.announce(`Phase ${phase === 2 ? 'II' : 'III'} · ${b.def.phases[phase - 1]}`, b.def.name, b.def.color);
  c.feedback.ring(t.x, t.y - 20, 520, b.def.color, 0.8, 18);
  c.particles.emit(t.x, t.y - BODY_Y * 2, { color: b.def.color, count: 60, speed: 480, size: 0.9, life: 0.9 });
  c.g.camera.shake(0.6);
  c.g.hitStop(0.12);
  const n = phase === 2 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + c.rng.next();
    c.spawnFoe(b.def.adds[i % b.def.adds.length], t.x + Math.cos(a) * 260, t.y + Math.sin(a) * 260, { portal: true });
  }
  c.g.events.emit('boss:phase', { phase, id: b.def.id, entity: e, name: b.def.phases[phase - 1] });
}

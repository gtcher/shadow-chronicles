import { Layers, Transform, Velocity } from '@engine';
import { Health } from '../components';
import { Foe, Hero, type HeroC } from './components';
import { BODY_Y, type CombatCtx } from './context';
import type { SkillDef } from './data';
import { heroDamage, makeZone, zoneHits, type Zone } from './rules';
import { applyStatus } from './status';

/** Réglages de l'esquive : 2 charges, invulnérabilité plus longue que la ruée elle-même. */
export const DODGE = { speed: 920, time: 0.17, invuln: 0.34, charges: 2, recharge: 1.1, perfectWindow: 0.24 } as const;
export const POTION_HEAL = 0.35;

const ACTIONS = ['attack', 'skill1', 'skill2', 'skill3'] as const;

export function updateHero(c: CombatCtx, dt: number): void {
  const { world, g: game } = c;
  const input = game.input;
  const e = c.player;
  const h = world.get(e, Hero)!, t = world.get(e, Transform)!, v = world.get(e, Velocity)!, hp = world.get(e, Health)!;
  if (hp.hp <= 0) { v.x *= 0.85; v.y *= 0.85; return; }

  input.updateAim(t, (sx, sy) => game.camera.screenToWorld(sx, sy));
  if (input.aim.x || input.aim.y) { h.aimX = input.aim.x; h.aimY = input.aim.y; }

  // Minuteries
  for (let i = 0; i < 4; i++) h.cds[i] = Math.max(0, h.cds[i] - dt);
  if (h.dashCharges < h.dashMax) {
    h.dashCd -= dt;
    if (h.dashCd <= 0) { h.dashCharges++; h.dashCd = h.dashCharges < h.dashMax ? h.dashRecharge : 0; }
  }
  h.invuln = Math.max(0, h.invuln - dt);
  h.lock = Math.max(0, h.lock - dt);
  h.mana = Math.min(h.maxMana, h.mana + h.maxMana * 0.055 * dt);
  tickHeroStatuses(c, h, hp, dt);
  for (let i = h.queued.length - 1; i >= 0; i--) {
    if (h.queued[i].at <= c.time) { const q = h.queued[i]; h.queued.splice(i, 1); q.run(); }
  }

  // Déplacement
  const slow = h.statuses.frost || h.statuses.slow ? 0.6 : 1;
  if (h.rush) {
    const r = h.rush;
    v.x = r.vx; v.y = r.vy;
    r.t -= dt;
    for (const f of c.physics.overlapCircle(world, t.x, t.y, r.radius, Layers.Enemy)) {
      if (r.hit.has(f)) continue;
      r.hit.add(f);
      const crit = c.rng.chance(h.crit + r.critBonus);
      c.damageFoe(f, heroDamage(h.atk * h.atkMul, r.mult, crit, c.rng.next()), { crit, fromX: t.x - r.vx, fromY: t.y - r.vy, knock: 300, skill: 2 });
    }
    if (c.rng.chance(0.9)) c.particles.emit(t.x, t.y - BODY_Y, { color: h.def.color, count: 3, speed: 50, size: 0.7, life: 0.35, alpha: 0.7 });
    if (r.t <= 0) { h.rush = null; v.x *= 0.3; v.y *= 0.3; }
  } else if (h.dashT > 0) {
    h.dashT -= dt;
    // Esquive chargée d'un statut (Éclair fendu, Pas de brume…) : touche ce qu'elle traverse.
    const ds = c.bless.dashStatus;
    if (ds && h.dashHit) {
      for (const f of c.physics.overlapCircle(world, t.x, t.y, 60, Layers.Enemy)) {
        if (h.dashHit.has(f)) continue;
        h.dashHit.add(f);
        applyStatus(c, f, ds, 1);
      }
    }
    if (c.rng.chance(0.8)) c.particles.emit(t.x, t.y - BODY_Y, { color: h.def.accent, count: 2, speed: 40, size: 0.6, life: 0.3, alpha: 0.55 });
  } else {
    const k = 1 - Math.exp(-14 * dt);
    const sp = h.speed * slow * c.loot.moveMul() * (h.lock > 0 ? 0.5 : 1);
    v.x += (input.move.x * sp - v.x) * k;
    v.y += (input.move.y * sp - v.y) * k;
  }

  // Esquive : direction du déplacement, sinon de la visée.
  if (input.pressed('dash') && h.dashCharges > 0 && !h.rush) {
    let dx = input.move.x, dy = input.move.y;
    if (Math.hypot(dx, dy) < 0.1) { dx = h.aimX; dy = h.aimY; }
    const l = Math.hypot(dx, dy) || 1;
    v.x = (dx / l) * DODGE.speed; v.y = (dy / l) * DODGE.speed;
    h.dashT = DODGE.time; h.invuln = Math.max(h.invuln, DODGE.invuln);
    h.dashAt = c.time; h.perfectReady = true;
    if (h.dashCharges === h.dashMax) h.dashCd = h.dashRecharge;
    h.dashCharges--;
    h.lock = 0;
    h.dashHit = new Set();
    c.bless.dashStatus = null;
    game.camera.shake(0.1);
    game.events.emit('player:dash', { x: t.x, y: t.y });
    c.bless.onDodge(t.x, t.y);
    c.loot.onDodge(t.x, t.y);
  }

  // Techniques : l'attaque se maintient ; 1-2-3 (ou A/E/R) pour les autres.
  for (let i = 0; i < 4; i++) {
    const a = ACTIONS[i];
    if (input.pressed(a) || (i === 0 && input.held(a))) castSkill(c, h, i);
  }
  if (input.pressed('skill4')) drinkPotion(c, h, hp);

  if (Math.abs(h.aimX) > 0.05) h.facing = h.aimX > 0 ? 1 : -1;
}

function tickHeroStatuses(c: CombatCtx, h: HeroC, hp: { hp: number; max: number }, dt: number): void {
  for (const k of Object.keys(h.statuses) as Array<keyof HeroC['statuses']>) {
    const left = (h.statuses[k] ?? 0) - dt;
    if (left <= 0) delete h.statuses[k]; else h.statuses[k] = left;
  }
  // Brûlure : 2,5 % PV max/s ; Néant : vide la mana. Ne tuent jamais à eux seuls.
  if (h.statuses.burn) hp.hp = Math.max(1, hp.hp - hp.max * 0.025 * dt);
  if (h.statuses.void) h.mana = Math.max(0, h.mana - 14 * dt);
  void c;
}

/** Point visé : souris si elle sert, sinon l'ennemi le plus pertinent dans la direction de visée. */
export function aimPoint(c: CombatCtx, h: HeroC, x: number, y: number, range: number): { x: number; y: number } {
  const input = c.g.input;
  if ((input.lastDevice === 'mouse' || input.lastDevice === 'keyboard') && input.pointer.inside) {
    const w = c.g.camera.screenToWorld(input.pointer.x, input.pointer.y);
    const dx = w.x - x, dy = w.y - y, d = Math.hypot(dx, dy);
    if (d <= range) return w;
    return { x: x + (dx / d) * range, y: y + (dy / d) * range };
  }
  const f = bestTarget(c, x, y, range, h.aimX, h.aimY);
  if (f !== undefined) { const ft = c.world.get(f, Transform)!; return { x: ft.x, y: ft.y }; }
  return { x: x + h.aimX * range * 0.6, y: y + h.aimY * range * 0.6 };
}

/** Ennemi le plus proche, en privilégiant ceux devant (visée assistée manette / tactile). */
export function bestTarget(c: CombatCtx, x: number, y: number, range: number, ax: number, ay: number): number | undefined {
  let best: number | undefined, score = Infinity;
  for (const f of c.physics.overlapCircle(c.world, x, y, range, Layers.Enemy)) {
    const ft = c.world.get(f, Transform)!;
    const dx = ft.x - x, dy = ft.y - y, d = Math.hypot(dx, dy) || 1;
    const s = d * (1.6 - 0.6 * ((dx * ax + dy * ay) / d));
    if (s < score) { score = s; best = f; }
  }
  return best;
}

export function castSkill(c: CombatCtx, h: HeroC, i: number, echo = 1): boolean {
  const base = h.def.skills[i];
  const sk = echo === 1 ? base : { ...base, mult: base.mult * echo };
  const cost = c.bless.skillCost(i, sk.cost);
  if (echo === 1 && (h.cds[i] > 0 || h.mana < cost.mana || h.rush || (h.lock > 0 && i === 0))) return false;
  const t = c.world.get(c.player, Transform)!;
  // Visée assistée hors souris : l'attaque de base se tourne vers l'ennemi le plus proche.
  const dev = c.g.input.lastDevice;
  if (dev === 'touch' || dev === 'gamepad') {
    const f = bestTarget(c, t.x, t.y, Math.max(sk.range, 260) + 80, h.aimX, h.aimY);
    if (f !== undefined) {
      const ft = c.world.get(f, Transform)!; const d = Math.hypot(ft.x - t.x, ft.y - t.y) || 1;
      h.aimX = (ft.x - t.x) / d; h.aimY = (ft.y - t.y) / d;
    }
  }
  if (echo === 1) {
    h.mana -= cost.mana;
    // Techniques payées en PV (Sang) : ne tuent jamais.
    const hp = c.world.get(c.player, Health)!;
    const pay = hp.max * cost.hpPct / 100 + hp.hp * cost.currentHpPct / 100;
    if (pay > 0) hp.hp = Math.max(1, hp.hp - pay);
    h.cds[i] = i === 0 ? sk.cd / (1 + h.atkSpd / 100 + c.bless.attackSpeedBonus() / 100) : sk.cd * h.cdMul;
    h.lock = i === 0 ? 0.1 : 0.2;
  }
  const SKILLS: Record<SkillDef['kind'], (c: CombatCtx, h: HeroC, sk: SkillDef, i: number, x: number, y: number) => void> = {
    slash, bolt, dashStrike, nova, blast, trap, rain, execute, comet,
  };
  SKILLS[sk.kind](c, h, sk, i, t.x, t.y);
  if (echo !== 1) return true;
  c.g.events.emit('player:skill', { slot: i, hero: h.def.id, name: sk.name, kind: sk.kind, x: t.x, y: t.y });
  if (i === 3) c.g.camera.shake(0.25);
  c.stats.addWave('skillsUsed');
  c.bless.onSkill(i, t.x, t.y);
  c.loot.onSkill(i);
  return true;
}

// ---------------------------------------------------------------- Techniques

const perHit = (c: CombatCtx, h: HeroC, sk: SkillDef, hits: number) => {
  const crit = c.rng.chance(h.crit + (sk.critBonus ?? 0));
  return { crit, dmg: heroDamage(h.atk * h.atkMul, sk.mult / hits, crit, c.rng.next()) };
};

/** Frappe tous les ennemis dans une zone. Renvoie le nombre touché. */
export function strikeZone(c: CombatCtx, h: HeroC, sk: SkillDef, i: number, z: Zone, hits: number, knock: number): number {
  const reach = z.shape === 'cone' || z.shape === 'circle' ? z.r : z.len;
  let n = 0;
  for (const f of c.physics.overlapCircle(c.world, z.x, z.y, reach + 10, Layers.Enemy)) {
    const ft = c.world.get(f, Transform)!;
    if (!zoneHits(z, ft.x, ft.y, 18)) continue;
    const { crit, dmg } = perHit(c, h, sk, hits);
    c.damageFoe(f, dmg, { crit, fromX: z.x, fromY: z.y, knock, status: sk.status, stacks: sk.stacks, skill: i });
    n++;
  }
  return n;
}

function slash(c: CombatCtx, h: HeroC, sk: SkillDef, i: number): void {
  const hits = sk.hits ?? 1;
  for (let k = 0; k < hits; k++) {
    const run = () => {
      const t = c.world.get(c.player, Transform)!;
      const ang = Math.atan2(h.aimY, h.aimX) + (hits > 1 ? (k % 2 ? 0.25 : -0.25) : 0);
      const z = makeZone({ shape: 'cone', x: t.x, y: t.y, angle: ang, r: sk.range, arc: sk.arc ?? 1.8 });
      const n = strikeZone(c, h, sk, i, z, hits, i === 0 ? 170 : 340);
      c.feedback.slash(t.x, t.y - BODY_Y * 0.6, ang, sk.range, sk.arc ?? 1.8, h.def.color);
      // Petit élan vers l'avant : le coup « porte ».
      const v = c.world.get(c.player, Velocity)!;
      v.x += h.aimX * 120; v.y += h.aimY * 120;
      if (n > 0) c.g.camera.shake(0.04 + 0.02 * Math.min(n, 4));
    };
    if (k === 0) run(); else h.queued.push({ at: c.time + 0.12 * k, run });
  }
  if (sk.shield) {
    h.shield = Math.max(h.shield, sk.shield);
    c.g.events.emit('player:shield', {});
    const t = c.world.get(c.player, Transform)!;
    c.feedback.ring(t.x, t.y - BODY_Y * 0.5, 70, 0x9fd0ff, 0.4);
  }
}

function bolt(c: CombatCtx, h: HeroC, sk: SkillDef, i: number, x: number, y: number): void {
  const n = sk.count ?? 1, spread = sk.spread ?? 0;
  const base = Math.atan2(h.aimY, h.aimX);
  for (let k = 0; k < n; k++) {
    const a = base + (n > 1 ? (k / (n - 1) - 0.5) * spread * 2 : (c.rng.next() - 0.5) * 0.05);
    const { crit, dmg } = perHit(c, h, sk, n);
    const ox = x + Math.cos(a) * 28, oy = y + Math.sin(a) * 28;
    c.spawnShot({ side: 'hero', x: ox, y: oy, dx: Math.cos(a), dy: Math.sin(a), speed: sk.speed ?? 800, damage: dmg, crit, pierce: sk.pierce ?? 1,
      life: sk.range / (sk.speed ?? 800), color: h.def.color, owner: c.player, status: sk.status, stacks: sk.stacks, skill: i, size: i === 0 ? 1 : 1.4, radius: i === 0 ? 10 : 14 });
    c.particles.emit(ox, oy - BODY_Y, { color: h.def.color, count: 3, speed: 160, angle: a, spread: 0.8, size: 0.35, life: 0.16 });
  }
  c.g.camera.shake(i === 0 ? 0.02 : 0.08);
  c.g.events.emit('player:shoot', { x, y, dirX: Math.cos(base), dirY: Math.sin(base), hero: h.def.id });
}

function dashStrike(c: CombatCtx, h: HeroC, sk: SkillDef, _i: number, x: number, y: number): void {
  const speed = 1150, time = sk.range / speed;
  h.rush = { t: time, vx: h.aimX * speed, vy: h.aimY * speed, hit: new Set(), mult: sk.mult, radius: sk.radius ?? 60, critBonus: sk.critBonus ?? 0 };
  h.invuln = Math.max(h.invuln, time + 0.12);
  c.feedback.streak(x, y - BODY_Y * 0.6, x + h.aimX * sk.range, y + h.aimY * sk.range - BODY_Y * 0.6, h.def.color);
}

function nova(c: CombatCtx, h: HeroC, sk: SkillDef, i: number): void {
  const hits = sk.hits ?? 1;
  for (let k = 0; k < hits; k++) {
    h.queued.push({ at: c.time + 0.05 + k * 0.28, run: () => {
      const t = c.world.get(c.player, Transform)!;
      const z = makeZone({ shape: 'circle', x: t.x, y: t.y, r: sk.radius ?? 150 });
      // Recul négatif : la tempête attire les ennemis vers le héros.
      strikeZone(c, h, sk, i, z, hits, h.def.id === 'taro' ? -260 : 120);
      c.feedback.ring(t.x, t.y - 10, sk.radius ?? 150, h.def.color, 0.4, 10);
      c.particles.emit(t.x, t.y - BODY_Y * 0.5, { color: h.def.color, count: 16, speed: (sk.radius ?? 150) * 2.2, size: 0.45, life: 0.35 });
      c.g.camera.shake(0.08);
    } });
  }
}

function blast(c: CombatCtx, h: HeroC, sk: SkillDef, i: number, x: number, y: number): void {
  const p = aimPoint(c, h, x, y, sk.range);
  const { crit, dmg } = perHit(c, h, sk, 1);
  c.hazards.add({ side: 'hero', zone: { shape: 'circle', x: p.x, y: p.y, r: sk.radius ?? 120 }, delay: 0.14, damage: dmg, crit, color: h.def.color,
    status: sk.status, stacks: sk.stacks, knock: 200, owner: i,
    onFire: (hz) => { c.feedback.ring(hz.zone.x, hz.zone.y, hz.zone.r, 0xdff6ff, 0.45, 12); c.g.camera.shake(0.12); } });
}

function trap(c: CombatCtx, h: HeroC, sk: SkillDef, i: number, x: number, y: number): void {
  const p = aimPoint(c, h, x, y, sk.range);
  const { crit, dmg } = perHit(c, h, sk, 1);
  c.hazards.add({ side: 'hero', zone: { shape: 'circle', x: p.x, y: p.y, r: sk.radius ?? 110 }, delay: 9, proximity: true, damage: dmg, crit,
    color: 0xb9e3ff, status: sk.status, stacks: sk.stacks, knock: 120, owner: i, linger: 1.2, tickEvery: 0.4,
    onFire: (hz) => { c.feedback.ring(hz.zone.x, hz.zone.y, hz.zone.r, 0xb9e3ff, 0.5, 10); c.g.camera.shake(0.1); } });
}

function rain(c: CombatCtx, h: HeroC, sk: SkillDef, i: number, x: number, y: number): void {
  const p = aimPoint(c, h, x, y, sk.range);
  const hits = sk.hits ?? 6, dur = sk.duration ?? 1.5;
  const { crit, dmg } = perHit(c, h, sk, hits);
  c.hazards.add({ side: 'hero', zone: { shape: 'circle', x: p.x, y: p.y, r: sk.radius ?? 160 }, delay: 0.3, damage: dmg, crit, color: h.def.color,
    linger: dur, tickEvery: dur / (hits - 1), knock: 40, owner: i,
    onFire: (hz) => {
      for (let k = 0; k < 24; k++) {
        const a = c.rng.range(0, Math.PI * 2), d = Math.sqrt(c.rng.next()) * hz.zone.r;
        c.particles.emit(hz.zone.x + Math.cos(a) * d, hz.zone.y + Math.sin(a) * d - 160, { color: 0xfff0c0, count: 1, speed: 420, angle: Math.PI / 2, spread: 0.1, size: 0.3, life: 0.4, drag: 0 });
      }
    } });
}

function execute(c: CombatCtx, h: HeroC, sk: SkillDef, i: number, x: number, y: number): void {
  const p = aimPoint(c, h, x, y, sk.range);
  let target: number | undefined, best = Infinity;
  for (const f of c.physics.overlapCircle(c.world, x, y, sk.range, Layers.Enemy)) {
    const ft = c.world.get(f, Transform)!;
    const d = Math.hypot(ft.x - p.x, ft.y - p.y);
    if (d < best) { best = d; target = f; }
  }
  if (target === undefined) { dashStrike(c, h, { ...sk, range: 220 }, i, x, y); return; }
  const ft = c.world.get(target, Transform)!, t = c.world.get(c.player, Transform)!;
  const dx = ft.x - x, dy = ft.y - y, d = Math.hypot(dx, dy) || 1;
  const fr = c.world.get(target, Foe)!;
  // Réapparaît juste derrière la cible.
  t.x = ft.x + (dx / d) * (fr.def.r + 30); t.y = ft.y + (dy / d) * (fr.def.r + 30);
  t.prevX = t.x; t.prevY = t.y;
  h.aimX = -dx / d; h.aimY = -dy / d;
  h.invuln = Math.max(h.invuln, 0.35);
  c.feedback.streak(x, y - BODY_Y * 0.6, t.x, t.y - BODY_Y * 0.6, h.def.color, 34);
  const hp = c.world.get(target, Health)!;
  const low = hp.hp / hp.max < 0.3;
  const crit = low || c.rng.chance(h.crit + 0.2);
  const dmg = heroDamage(h.atk * h.atkMul, sk.mult * (low ? 2 : 1), crit, c.rng.next());
  c.damageFoe(target, dmg, { crit, fromX: t.x, fromY: t.y, knock: 420, status: 'saignement', stacks: 2, skill: i });
  // Éclaboussure autour.
  strikeZone(c, h, { ...sk, mult: sk.mult * 0.35 }, i, makeZone({ shape: 'circle', x: ft.x, y: ft.y, r: sk.radius ?? 70 }), 1, 220);
  c.feedback.slash(ft.x, ft.y - BODY_Y * 0.6, Math.atan2(dy, dx) + Math.PI, 150, 3.4, 0xff3050);
  c.g.hitStop(0.07);
}

function comet(c: CombatCtx, h: HeroC, sk: SkillDef, i: number, x: number, y: number): void {
  const p = aimPoint(c, h, x, y, sk.range);
  const { crit, dmg } = perHit(c, h, sk, 1);
  c.hazards.add({ side: 'hero', zone: { shape: 'circle', x: p.x, y: p.y, r: sk.radius ?? 170 }, delay: sk.delay ?? 0.5, damage: dmg, crit, color: 0xbfe6ff,
    status: sk.status, stacks: sk.stacks, knock: 380, owner: i,
    onFire: (hz) => {
      c.feedback.ring(hz.zone.x, hz.zone.y, hz.zone.r * 1.2, 0xffffff, 0.6, 16);
      c.particles.emit(hz.zone.x, hz.zone.y - 20, { color: 0xbfe6ff, count: 40, speed: 520, size: 0.7, life: 0.6 });
      c.g.camera.shake(0.45); c.g.hitStop(0.06);
    } });
}

function drinkPotion(c: CombatCtx, h: HeroC, hp: { hp: number; max: number }): void {
  if (h.potions <= 0 || hp.hp >= hp.max) return;
  h.potions--;
  const amount = Math.round(c.bless.heal(hp.max * POTION_HEAL));
  delete h.statuses.burn; delete h.statuses.void;
  const t = c.world.get(c.player, Transform)!;
  c.feedback.number(t.x, t.y - 130, `+${amount}`, { color: 0x7dff9a, size: 26 });
  c.particles.emit(t.x, t.y - BODY_Y, { color: 0x7dff9a, count: 20, speed: 90, size: 0.5, life: 0.8, gravity: -80 });
  c.g.events.emit('player:heal', { hp: hp.hp, max: hp.max, amount, potions: h.potions });
}

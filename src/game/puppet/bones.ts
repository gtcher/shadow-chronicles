/**
 * Squelette des pantins : à partir d'une pose (la même que celle du squelette dessiné, rig/draw.ts →
 * `pose()`), calcule la matrice de chaque pièce peinte, de l'arrière vers l'avant.
 *
 * Repère : unités du squelette (un humain fait 96 unités), origine entre les pieds, y vers le bas,
 * combattant tourné vers la droite (+x). Les angles suivent rig/draw.ts : un membre au repos pend vers +y,
 * `rotate(-u)` le lève vers l'avant.
 */

export type M = [number, number, number, number, number, number];
export const I = (): M => [1, 0, 0, 1, 0, 0];
export function mul(m: M, n: M): M {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
export const T = (m: M, x: number, y: number): M => mul(m, [1, 0, 0, 1, x, y]);
export const R = (m: M, a: number): M => { const c = Math.cos(a), s = Math.sin(a); return mul(m, [c, s, -s, c, 0, 0]); };
export const S = (m: M, x: number, y = x): M => mul(m, [x, 0, 0, y, 0, 0]);
/** Point local → repère du pantin. */
export const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Pièce placée : identifiant de texture et matrice (pivot de la pièce → repère du pantin). */
export interface Placed { id: string; m: M; alpha?: number; tint?: number }

/** Pose produite par rig/draw.ts `pose()` (champs utilisés ici). */
export interface Pose {
  x: number; y: number; lean: number; head: number; sx: number; sy: number;
  legs: Array<{ t: number; s: number }>; arms: Array<{ u: number; f: number }>;
  hold: number; capeFlow: number; hairLag: number; charge: number; alpha: number;
  staffDir?: number; drawPull?: number; aimRot?: number; expr?: string; flash?: number; dis?: number;
}

/** Fiche CAST (rig/draw.ts), champs de morphologie. */
export interface Def {
  kind?: string; group?: string; enemy?: boolean; weapon?: string; head?: string;
  leg: number; torso: number; sw: number; hw: number; arm: number; aw: number; lw: number; headR: number; hunch: number;
  robe?: boolean; float?: boolean; cape?: string | null; scarf?: string | null; pauldron?: boolean; quiver?: boolean;
  coat?: boolean; sleeves?: boolean; shield?: boolean; shards?: boolean; [k: string]: unknown;
}

/** Ombre des membres côté éloigné (multiplie la couleur). */
export const FAR_TINT = 0xb4b0c4;

/**
 * Pièces d'un humanoïde, dans l'ordre de dessin. `now` (s) anime les accessoires libres (robe, éclats).
 */
export function solveHumanoid(c: Def, P: Pose, now: number): Placed[] {
  const out: Placed[] = [];
  const Tt = c.torso, L = c.leg, th = L / 2;
  const hipY = -L + P.y + (c.float ? -4 : 0);
  const hip = S(T(I(), P.x, hipY), P.sx, P.sy);
  const lean = P.lean + c.hunch;
  const body = R(hip, lean * 0.25);
  const torso = R(body, lean);
  const shX = c.sw * 0.5;
  const flow = P.capeFlow;
  const lag = P.hairLag || 0;
  const push = (id: string, m: M, tint?: number) => out.push({ id, m, tint });

  const leg = (i: number) => {
    if (c.float) return;
    const l = P.legs[i];
    const far = i === 0 ? FAR_TINT : undefined;
    const thigh = R(T(body, (i ? 1 : -1) * c.hw * 0.28, 0), -l.t);
    push('thigh', thigh, far);
    const shin = R(T(thigh, 0, th), -(l.s - l.t));
    push('shin', shin, far);
    push('foot', T(shin, 0, th), far);
  };
  const shoulder = (i: number): M => T(torso, i ? shX * 0.55 : -shX * 0.45, -Tt + c.aw * 0.4);
  const arm = (i: number) => {
    const a = P.arms[i];
    const far = i === 0 ? FAR_TINT : undefined;
    const up = R(shoulder(i), -a.u);
    push('upper', up, far);
    const fore = R(T(up, 0, c.arm / 2), -(a.f - a.u));
    push('fore', fore, far);
    const hand = T(fore, 0, c.arm / 2);
    const bare = c.weapon === 'fists';
    if (P.hold && (i === 1 || c.weapon === 'daggers')) weapon(hand, i, far);
    if (bare && (i === 0 || !P.hold)) weapon(hand, i, far);
    if (c.weapon !== 'blades' && !bare) push('hand', hand, far);
    if (c.sleeves) push('sleeve', R(shoulder(i), -a.u * 0.85 + (flow - 4) * 0.012), far);
  };
  const weapon = (hand: M, i: number, far?: number) => {
    const w = c.weapon;
    if (w === 'staff') {
      // Orientation donnée dans le monde (P.staffDir : -π/2 = debout), ramenée au repère de la main.
      push('weapon', R(hand, (P.arms[i]?.f ?? 1) + (P.staffDir ?? -1.62)), far);
    } else if (w === 'bow') {
      push('weapon', R(hand, Math.PI), far);
    } else push('weapon', hand, far);
  };

  // Cape (derrière tout), balancée par le mouvement.
  if (c.cape) push('cape', R(T(R(body, lean * 0.75), 0, -Tt), Math.max(-0.1, (flow - 4) * 0.022)));
  arm(0);
  leg(0);
  const robeLegs = !!c.robe && !c.float;
  if (robeLegs) leg(1);
  if (c.robe || c.float) {
    const sway = Math.sin(now * 3.3) * 0.03 - (flow - 4) * 0.012;
    push('robe', R(R(body, lean * 0.3), sway));
  }
  if (!robeLegs) leg(1);
  if (!c.robe && !c.float) {
    const fl = (flow - 4) * (c.coat ? 0.05 : 0.04);
    const fb = R(body, lean * 0.4);
    push('flapB', R(T(fb, -c.hw * 0.55 + c.hw * 0.25, -3), fl + 0.12), FAR_TINT);
    push('flapF', R(T(fb, c.hw * 0.05 + c.hw * 0.25, -3), fl - 0.05));
  }
  if (c.quiver) push('quiver', R(T(torso, -c.sw * 0.42, -Tt * 0.5), -0.45));
  push('torso', torso);
  if (c.scarf) push('scarf', R(T(torso, -c.sw * 0.3, -Tt + 3), -(flow - 4) * 0.035));
  const head = R(T(torso, 2, -Tt - 3 - c.headR * 0.95), P.head * 0.8);
  if (c.head === 'ponytail' || c.head === 'long' || c.head === 'spiky') push('hairBack', R(head, lag * 0.35));
  const ex = P.expr === 'angry' ? 'angry' : P.expr === 'hurt' || P.expr === 'ko' ? 'hurt' : 'n';
  push(`head-${ex}`, head);
  if (c.pauldron) push('pauldron', R(T(torso, shX * 0.55, -Tt + 3), -0.3 - (P.arms[1].u - 0.4) * 0.25));
  if (c.shield && P.hold) push('shield', T(torso, -c.sw * 0.1, -Tt * 0.45));
  arm(1);
  return out;
}

/** Points utiles aux effets (main avant, bout de l'arme, tête) dans le repère du pantin. */
export function anchors(c: Def, P: Pose): { hand: [number, number]; head: [number, number]; chest: [number, number] } {
  const Tt = c.torso, L = c.leg;
  const hip = S(T(I(), P.x, -L + P.y + (c.float ? -4 : 0)), P.sx, P.sy);
  const lean = P.lean + c.hunch;
  const torso = R(R(hip, lean * 0.25), lean);
  const a = P.arms[1];
  const up = R(T(torso, c.sw * 0.5 * 0.55, -Tt + c.aw * 0.4), -a.u);
  const hand = T(R(T(up, 0, c.arm / 2), -(a.f - a.u)), 0, c.arm / 2);
  return { hand: apply(hand, 0, 0), head: apply(torso, 2, -Tt - 3 - c.headR * 0.95), chest: apply(torso, c.sw * 0.1, -Tt * 0.6) };
}

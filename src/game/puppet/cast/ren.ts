// @ts-nocheck
/**
 * Ren, l'archer d'or — pantin peint (piste A « peint encré »).
 * Manteau bleu nuit à longs pans, plastron doré en V, brassards de cuir, carquois, arc recourbé doré.
 * Tête : celle de la carte de sélection (heads.ts), à l'échelle du squelette.
 */
import { box, limbPart, footPart, fistPart, paint, pathOf, line, mix, rgba, glowLine, glowDot, INK, TAU, type Parts, type Painter } from '../parts';
import { head, paintCard, lineCard, spikes } from '../heads';

const COL = { coat: '#1e2944', coatHi: '#2a3a5e', gold: '#e3b54e', gold2: '#d9a640', leather: '#5a3a22', boot: '#2a1d18', trousers: '#161c30', skin: '#eec5a2', glove: '#2a2030', hair: '#3d2b1e', rim: '#7fe0ff', eye: '#c88a2a' };

/** Échelle tête : repère carte (crâne r = 50) → unités du squelette. */
export const HEAD_S = 0.2;
/** Décalage vertical de la tête dans sa pièce (unités) : le menton se pose sur le col. */
export const HEAD_DY = -3;

const BANGS = [[-50, 40, 1], [-62, -26], [-38, -66], [6, -74], [48, -62], [66, -30], [62, 22, 1], [52, -8], [44, 16, 1], [34, -14], [22, 20, 1], [12, -14], [0, 14, 1], [-10, -14], [-24, 18, 1], [-32, -8], [-42, 20, 1], [-46, -4]];

function renHead(expr: string) {
  return (g) => {
    const bangs = pathOf(BANGS);
    const rim = COL.rim, hair = COL.hair;
    head(g, 0, HEAD_DY, HEAD_S, 0.04, {
      skin: COL.skin, hair, eye: COL.eye, rim, expr, frontPath: bangs, k: 0.95,
      back: (g) => { paintCard(g, spikes([[150, 82], [190, 100], [228, 106], [266, 102], [304, 92], [342, 78], [20, 66]], -0.24, 68), hair, { d: 12, lw: 4.2, rim, rimW: 5 }); },
      front: (g) => {
        paintCard(g, bangs, hair, { d: 9, lw: 4.2, rim, rimW: 4, after: (g) => { g.globalAlpha = 0.35; lineCard(g, [[-30, -50], [-10, -30], [4, -8]], 4, '#8a6a4a'); lineCard(g, [[10, -60], [24, -36], [30, -12]], 4, '#8a6a4a'); } });
      },
      extra: (g) => { // plume dorée à l'oreille (repère de Ren en jeu)
        g.save(); g.shadowColor = rim; g.shadowBlur = 10;
        paintCard(g, [[-44, -30], [-100, -70], [-120, -48], [-60, -20]], '#7fe0ff', { d: 4, lw: 3.5, light: false });
        g.restore();
      },
    });
  };
}

export const ren: Painter = (c, L) => {
  const th = c.leg / 2, T = c.torso, A = c.arm / 2, aw = c.aw, lw = c.lw, sw = c.sw, hw = c.hw;
  const P: Parts = {};
  // ---------------------------------------------------------------- jambes : pantalon sombre, bottes de cuir
  P.thigh = limbPart(L, th, lw * 1.24, lw * 0.9, COL.trousers, { back: lw * 0.12, front: lw * 0.05, seed: 3,
    deco: (g) => { line(g, [[lw * 0.2, th * 0.1], [lw * 0.12, th * 0.9]], 0.5); } });
  P.shin = limbPart(L, th, lw * 0.95, lw * 0.68, COL.trousers, { back: lw * 0.2, seed: 5, joint: true,
    deco: (g) => {
      // tige de botte : cuir sombre sur les deux tiers bas, revers doré
      const b = pathOf([[-lw * 0.6, th * 0.3], [lw * 0.58, th * 0.26], [lw * 0.5, th + 4], [-lw * 0.5, th + 4]]);
      paint(g, b, COL.boot, L, { d: 1.6, vol: 'x', box: [-lw * 0.5, th * 0.3, lw * 0.5, th], brush: 0.5, lw: 0.8 });
      line(g, [[-lw * 0.6, th * 0.3], [lw * 0.58, th * 0.26]], 1.1, COL.gold);
      line(g, [[-lw * 0.3, th * 0.55], [lw * 0.3, th * 0.53]], 0.45, 'rgba(255,230,190,0.25)');
    } });
  P.foot = footPart(L, lw, COL.boot, { deco: (g) => { line(g, [[-lw * 0.4, lw * 0.4], [lw * 1.3, lw * 0.4]], 0.5, 'rgba(255,230,190,0.18)'); } });

  // ---------------------------------------------------------------- bras : manches du manteau, brassards, gants
  P.upper = limbPart(L, A, aw * 1.15, aw * 0.88, COL.coat, { back: aw * 0.14, seed: 7,
    deco: (g) => { line(g, [[-aw * 0.5, A * 0.85], [aw * 0.5, A * 0.82]], 1.2, COL.gold); line(g, [[aw * 0.1, A * 0.1], [aw * 0.05, A * 0.7]], 0.45); } });
  P.fore = limbPart(L, A, aw * 0.98, aw * 0.76, COL.coat, { back: aw * 0.18, seed: 9, joint: true,
    deco: (g) => {
      const b = pathOf([[-aw * 0.56, A * 0.35], [aw * 0.56, A * 0.33], [aw * 0.46, A + 2], [-aw * 0.46, A + 2]]);
      paint(g, b, COL.leather, L, { d: 1.2, vol: 'x', box: [-aw * 0.5, A * 0.35, aw * 0.5, A], lw: 0.7 });
      for (const y of [0.45, 0.8]) line(g, [[-aw * 0.52, A * y], [aw * 0.52, A * y - 0.4]], 0.7, COL.gold);
    } });
  P.hand = fistPart(L, aw * 0.58, COL.glove);

  // ---------------------------------------------------------------- buste : manteau, plastron en V, baudrier, ceinture, col
  const wq = 1;
  P.torso = {
    box: box(-sw * 0.8, -T - 10, sw * 0.8, 6),
    bevel: 5,
    draw: (g) => {
      const bust = pathOf([[-hw * 0.6, 2, 1], [hw * 0.62, 2, 1], [sw * 0.5 * wq, -T * 0.25], [sw * 0.55, -T * 0.62], [sw * 0.6, -T * 0.86], [sw * 0.34, -T - 3], [0, -T - 4.5], [-sw * 0.5, -T - 1], [-sw * 0.62, -T * 0.8], [-sw * 0.48, -T * 0.4], [-hw * 0.66, -T * 0.1]]);
      paint(g, bust, COL.coat, L, { d: 3.2, vol: 'x', box: [-sw * 0.55, -T, sw * 0.55, 0], seed: 11,
        after: (g) => {
          // plis du manteau
          line(g, [[-sw * 0.3, -T * 0.8], [-sw * 0.36, -T * 0.3]], 0.5, 'rgba(10,8,20,0.45)');
          line(g, [[sw * 0.42, -T * 0.4], [sw * 0.3, -T * 0.08]], 0.5, 'rgba(10,8,20,0.45)');
        } });
      // plastron doré en V et boutons
      paint(g, [[sw * 0.02, -T - 2], [sw * 0.42, -T - 1.5], [sw * 0.32, -T * 0.55], [sw * 0.16, -T * 0.12], [sw * 0.06, -T * 0.55]], COL.gold2, L, { d: 1, vol: 'x', lw: 0.7, brush: 0.3 });
      line(g, [[sw * 0.22, -T], [sw * 0.18, -T * 0.16]], 0.45, mix(COL.gold2, INK, 0.5));
      for (let i = 0; i < 4; i++) { g.fillStyle = '#fff1c0'; g.beginPath(); g.arc(sw * 0.27 - i * 0.6, -T * 0.88 + i * T * 0.18, 0.8, 0, TAU); g.fill(); }
      // baudrier du carquois
      paint(g, [[-sw * 0.55, -T + 0.5], [-sw * 0.38, -T - 1.5], [sw * 0.5, -T * 0.18], [sw * 0.36, -T * 0.06]], COL.leather, L, { d: 0.8, vol: null, lw: 0.6, brush: 0.2 });
      g.fillStyle = COL.gold; g.beginPath(); g.arc(sw * 0.02, -T * 0.6, 1.1, 0, TAU); g.fill();
      // ceinture + boucle
      paint(g, [[-hw * 0.66, -6.5], [hw * 0.68, -7], [hw * 0.7, -1], [-hw * 0.66, -0.5]], COL.leather, L, { d: 1, vol: 'y', lw: 0.7, brush: 0.2 });
      paint(g, [[hw * 0.18, -7.6], [hw * 0.5, -7.8], [hw * 0.5, -0.6], [hw * 0.18, -0.4]], COL.gold, L, { d: 0.8, vol: null, lw: 0.6, brush: 0 });
      // col montant doré
      paint(g, [[-sw * 0.44, -T + 2], [-sw * 0.4, -T - 7.5], [0, -T - 4], [sw * 0.32, -T - 6], [sw * 0.4, -T + 2], [0, -T - 0.5]], COL.coat, L, { d: 1.4, vol: 'x', lw: 0.8, brush: 0.3 });
      line(g, [[-sw * 0.4, -T - 7.5], [0, -T - 4], [sw * 0.32, -T - 6]], 1.1, COL.gold);
    },
  };

  // ---------------------------------------------------------------- pans du manteau
  const flap = (shadeSide: boolean): Parts[string] => {
    const Lf = 27, w = hw * 0.62;
    return {
      box: box(-w - 2, -2, w + 3, Lf + 6),
      bevel: 2.5,
      draw: (g) => {
        const p = pathOf([[-w * 0.5, 0, 1], [w * 0.5, 0, 1], [w * 0.62, Lf * 0.6], [w * 0.5, Lf, 1], [0, Lf + 3.5, 1], [-w * 0.55, Lf - 1, 1], [-w * 0.6, Lf * 0.5]]);
        paint(g, p, COL.coat, L, { d: 2.2, vol: 'x', box: [-w * 0.6, 0, w * 0.6, Lf], seed: shadeSide ? 13 : 17,
          after: (g) => { line(g, [[w * 0.05, 2], [w * 0.15, Lf * 0.9]], 0.45, 'rgba(10,8,20,0.5)'); } });
        line(g, [[w * 0.5, Lf], [0, Lf + 3.5], [-w * 0.55, Lf - 1]], 1, COL.gold);
      },
    };
  };
  P.flapB = flap(true);
  P.flapF = flap(false);

  // ---------------------------------------------------------------- carquois
  P.quiver = {
    box: box(-6, -30, 6, 12),
    bevel: 2.5,
    draw: (g) => {
      for (let i = 0; i < 3; i++) {
        const x = -2.6 + i * 2.6;
        line(g, [[x, -18], [x + 0.2, -24]], 0.7, '#8a6a44');
        g.save(); g.shadowColor = COL.rim; g.shadowBlur = 4;
        paint(g, [[x, -24], [x - 1.6, -28.5], [x + 0.2, -27.5], [x + 1.8, -28.8]], i % 2 ? '#e8e0d0' : '#7fe0ff', L, { d: 0.4, vol: null, lw: 0.45, brush: 0, rimW: 0 });
        g.restore();
      }
      paint(g, [[-4.2, -20, 1], [4.2, -20, 1], [3.8, 10, 1], [-3.8, 10, 1]], COL.leather, L, { d: 1.2, vol: 'x', box: [-4, -20, 4, 10], lw: 0.7 });
      line(g, [[-4.2, -17.5], [4.2, -17.5]], 1, COL.gold); line(g, [[-4, 7], [4, 7]], 1, COL.gold);
    },
  };

  // ---------------------------------------------------------------- tête (expressions)
  const hb = box(-17, -22, 17, 18);
  for (const [k, ex] of [['n', 'fierce'], ['angry', 'fierce'], ['hurt', 'hurt']]) {
    P[`head-${k}`] = { box: hb, bevel: 6, draw: renHead(ex) };
  }

  // ---------------------------------------------------------------- arc : repère de la main tourné de π (bones.ts).
  // Branches perpendiculaires au bras (±x), flèche vers -y (la cible). Sans corde : la corde et la flèche
  // sont tracées en direct (la tension suit l'animation).
  P.weapon = {
    box: box(-33, -14, 33, 8),
    bevel: 1.6,
    draw: (g) => {
      const limbP = (s) => pathOf([[0, -4.8], [s * 7, -11], [s * 14, -13.5], [s * 21, -10], [s * 26, -5.5], [s * 30, -6.2, 1], [s * 29.5, -3.3, 1], [s * 25.5, -2.4], [s * 20.5, -5.2], [s * 13, -8], [s * 6, -4.2], [0, 1.2]]);
      for (const s of [1, -1]) {
        g.save(); g.shadowColor = rgba(COL.gold, 0.6); g.shadowBlur = 1.5 * Math.hypot(g.getTransform().a, g.getTransform().b);
        paint(g, limbP(s), COL.gold, L, { d: 0.9, vol: 'y', box: [-30, -13, 30, 0], lw: 0.75, brush: 0.4, rimW: 0.5 });
        g.restore();
      }
      // poignée de cuir
      paint(g, [[-3.2, -4.8], [3.2, -4.8], [3, 2], [-3, 2]], COL.leather, L, { d: 0.6, vol: 'x', lw: 0.6, brush: 0 });
      for (let i = 0; i < 3; i++) line(g, [[-3, -3.5 + i * 2], [3, -2.8 + i * 2]], 0.35, 'rgba(255,220,180,0.35)');
      // runes lumineuses
      glowLine(g, [[-20, -8], [-12, -11.4], [-5, -8.6]], 0.7, COL.rim, 2.5);
      glowLine(g, [[20, -8], [12, -11.4], [5, -8.6]], 0.7, COL.rim, 2.5);
      for (const s of [1, -1]) { g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(s * 29.8, -4.8, 0.9, 0, TAU); g.fill(); }
    },
  };
  return P;
};

/** Extrémités de la corde dans le repère de l'arc (pour le tracé en direct). */
export const BOW = { tipX: 29.6, tipY: -4.6, nockY: 2 };

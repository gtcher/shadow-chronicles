// @ts-nocheck
/**
 * Sena, prêtresse lunaire — pantin peint (piste A « peint encré »).
 * Robe longue bleu nuit à panneau blanc liseré d'or, corsage bleu et blanc, manches évasées,
 * longue chevelure blanc-bleuté, diadème doré à gemme, bâton à croissant doré et gemme lunaire.
 * Tête : celle de la carte de sélection (tools/art/heroes.ts, `sena`), à l'échelle du squelette.
 */
import { box, limbPart, fistPart, paint, pathOf, line, mix, rgba, glowDot, INK, TAU, type Parts, type Painter } from '../parts';
import { head, paintCard, lineCard, ribbon } from '../heads';

const COL = {
  robe: '#23437f', robeDk: '#16305e', white: '#e7ecf8', gold: '#e3c06a', goldDk: '#a8862e', skin: '#f6dccb',
  hair: '#e4ebf6', hairDk: '#a8b8d8', rim: '#cfe4ff', blue: '#4f8dff', gem: '#9fd0ff', eye: '#3a7aff',
  wood: '#6a4a2a', slipper: '#1a2a52',
};

/** Échelle tête : repère carte (crâne r = 50) → unités du squelette. */
const HEAD_S = 0.2;
const HEAD_DY = -3;

const BANGS = [[-60, 40, 1], [-60, -26], [-30, -60], [12, -66], [48, -54], [62, -20], [60, 30, 1], [48, 0], [38, 22, 1], [28, -6], [14, 14, 1], [2, -10], [-12, 16, 1], [-24, -4], [-38, 26, 1], [-46, 0]];

const HAIR = { rim: COL.rim, rimW: 3, dark: COL.hairDk };

function senaHead(expr: string) {
  return (g) => {
    const bangs = pathOf(BANGS);
    head(g, 0, HEAD_DY, HEAD_S, 0.02, {
      skin: COL.skin, hair: COL.hair, eye: COL.eye, rim: COL.rim, expr, frontPath: bangs, k: 0.95, shine: '#ffffff',
      back: (g) => { paintCard(g, [[-66, 80], [-74, -10], [-54, -60], [0, -76], [52, -62], [72, -10], [70, 76], [40, 40], [-40, 40]], COL.hair, { d: 12, lw: 4, ...HAIR }); },
      front: (g) => {
        paintCard(g, bangs, COL.hair, { d: 9, lw: 4, ...HAIR, after: (g) => { g.globalAlpha = 0.5; lineCard(g, [[-30, -50], [-16, -24]], 3, '#ffffff'); lineCard(g, [[14, -58], [24, -32]], 3, '#ffffff'); } });
        // mèches qui encadrent le visage
        ribbon(g, [[56, 14], [64, 62], [56, 108]], 18, 5, COL.hair, { lw: 3.6, ...HAIR, rimW: 2 });
        ribbon(g, [[-54, 14], [-62, 64], [-52, 116]], 20, 5, COL.hair, { lw: 3.6, ...HAIR, rimW: 2 });
        // diadème doré + gemme
        lineCard(g, [[-58, -22], [-20, -38], [24, -38], [60, -22]], 9, INK);
        lineCard(g, [[-58, -22], [-20, -38], [24, -38], [60, -22]], 5.5, COL.gold);
        lineCard(g, [[-40, -30], [-20, -36.5], [10, -37]], 1.8, '#fff4c8');
        g.save(); g.shadowColor = COL.blue; g.shadowBlur = 14;
        paintCard(g, [[0, -52], [12, -39], [0, -26], [-12, -39]], COL.gem, { d: 3, lw: 3, light: false });
        g.restore();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(-3, -43, 2.6, 0, TAU); g.fill();
      },
    });
  };
}

export const sena: Painter = (c, L) => {
  const th = c.leg / 2, T = c.torso, A = c.arm / 2, aw = c.aw, lw = c.lw, sw = c.sw, hw = c.hw;
  const P: Parts = {};
  const trim = String(c.trim ?? COL.gold);

  // ---------------------------------------------------------------- jambes (sous la robe) : bas blancs, chaussons bleus
  P.thigh = limbPart(L, th, lw * 1.2, lw * 0.88, COL.white, { back: lw * 0.1, seed: 3 });
  P.shin = limbPart(L, th, lw * 0.92, lw * 0.64, COL.white, { back: lw * 0.18, seed: 5, joint: true,
    deco: (g) => { line(g, [[-lw * 0.5, th * 0.82], [lw * 0.5, th * 0.8]], 0.9, trim); } });
  P.foot = {
    box: box(-lw * 0.9, -lw * 0.9, lw * 1.75, lw * 0.75),
    bevel: lw * 0.3,
    draw: (g) => {
      const p = pathOf([[-lw * 0.5, -lw * 0.6], [-lw * 0.6, lw * 0.2], [-lw * 0.4, lw * 0.45, 1], [lw * 1.45, lw * 0.42, 1], [lw * 1.55, lw * 0.1], [lw * 0.9, -lw * 0.2], [lw * 0.4, -lw * 0.6, 1]]);
      paint(g, p, COL.slipper, L, { d: lw * 0.16, vol: 'y', after: (g) => { line(g, [[-lw * 0.3, -lw * 0.25], [lw * 0.6, -lw * 0.22]], 0.8, trim); } });
    },
  };

  // ---------------------------------------------------------------- bras : haut bleu, avant-bras blanc à poignet doré, main nue
  P.upper = limbPart(L, A, aw * 1.12, aw * 0.86, COL.robe, { back: aw * 0.14, seed: 7 });
  P.fore = limbPart(L, A, aw * 0.94, aw * 0.72, COL.white, { back: aw * 0.16, seed: 9, joint: true,
    deco: (g) => { line(g, [[-aw * 0.5, A * 0.86], [aw * 0.5, A * 0.84]], 1.1, trim); } });
  P.hand = fistPart(L, aw * 0.6, COL.skin);

  // ---------------------------------------------------------------- manche évasée (pivot épaule, pend vers +y)
  P.sleeve = {
    box: box(-aw * 1.9, -aw * 0.9, aw * 2.2, A + 14),
    bevel: 2.4,
    draw: (g) => {
      const outer = pathOf([[-aw * 0.62, -aw * 0.5], [aw * 0.62, -aw * 0.55], [aw * 1.15, A * 0.45], [aw * 1.75, A + 8, 1], [aw * 0.6, A + 11], [-aw * 0.4, A + 12.5, 1], [-aw * 1.25, A * 0.7], [-aw * 0.85, A * 0.2]]);
      paint(g, outer, COL.robe, L, { d: 2.4, vol: 'x', box: [-aw, 0, aw * 1.6, A + 10], seed: 21,
        after: (g) => {
          // doublure blanche visible au revers
          paint(g, [[-aw * 0.6, A + 8.5], [aw * 1.6, A + 5.5], [aw * 1.75, A + 8], [aw * 0.6, A + 11], [-aw * 0.4, A + 12.5]], COL.white, L, { d: 0.8, vol: null, lw: 0.6, brush: 0, rimW: 0 });
          line(g, [[aw * 0.1, 1], [aw * 0.5, A + 6]], 0.5, 'rgba(10,8,20,0.45)');
          line(g, [[-aw * 0.5, A * 0.4], [-aw * 0.2, A + 8]], 0.45, 'rgba(10,8,20,0.4)');
        } });
      line(g, [[aw * 1.75, A + 8], [aw * 0.6, A + 11], [-aw * 0.4, A + 12.5]], 1.3, trim);
      line(g, [[-aw * 0.6, -aw * 0.45], [aw * 0.6, -aw * 0.5]], 0.9, trim);
    },
  };

  // ---------------------------------------------------------------- buste : corsage bleu, plastron blanc liseré d'or, broche, ceinture, col montant
  const wq = Number(c.waist ?? 1);
  P.torso = {
    box: box(-sw * 0.85, -T - 10, sw * 0.9, 5),
    bevel: 5,
    draw: (g) => {
      const bust = pathOf([[-hw * 0.6, 2, 1], [hw * 0.62, 2, 1], [sw * 0.48 * wq, -T * 0.22], [sw * 0.5, -T * 0.6], [sw * 0.62, -T * 0.82], [sw * 0.34, -T - 3], [0, -T - 4.5], [-sw * 0.52, -T - 1], [-sw * 0.62, -T * 0.78], [-sw * 0.46 * wq, -T * 0.42], [-hw * 0.66, -T * 0.1]]);
      paint(g, bust, COL.robe, L, { d: 3, vol: 'x', box: [-sw * 0.55, -T, sw * 0.55, 0], seed: 11,
        after: (g) => {
          line(g, [[-sw * 0.3, -T * 0.82], [-sw * 0.34, -T * 0.3]], 0.5, 'rgba(10,8,20,0.45)');
          line(g, [[sw * 0.48, -T * 0.72], [sw * 0.18, -T * 0.66]], 0.6, 'rgba(10,8,20,0.5)');
        } });
      // plastron blanc en V
      const pl = [[sw * 0.0, -T - 2], [sw * 0.46, -T - 1.5], [sw * 0.42, -T * 0.6], [sw * 0.28, -T * 0.16], [sw * 0.12, -T * 0.6]];
      paint(g, pl, COL.white, L, { d: 1.2, vol: 'x', box: [0, -T, sw * 0.46, 0], lw: 0.75, brush: 0.3 });
      line(g, [pl[0], pl[4], pl[3], pl[2], pl[1]], 1, trim);
      // broche lunaire
      g.save(); g.shadowColor = COL.blue; g.shadowBlur = 2.5 * Math.hypot(g.getTransform().a, g.getTransform().b);
      paint(g, [[sw * 0.28, -T * 0.66], [sw * 0.36, -T * 0.57], [sw * 0.28, -T * 0.48], [sw * 0.2, -T * 0.57]], '#8fc4ff', L, { d: 0.5, vol: null, lw: 0.55, brush: 0, rimW: 0 });
      g.restore();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(sw * 0.26, -T * 0.6, 0.5, 0, TAU); g.fill();
      // ceinture bleu sombre liserée d'or
      paint(g, [[-hw * 0.66, -6], [hw * 0.68, -6.5], [hw * 0.7, -0.8], [-hw * 0.66, -0.4]], COL.robeDk, L, { d: 1, vol: 'y', lw: 0.7, brush: 0.2 });
      line(g, [[-hw * 0.64, -3.4], [hw * 0.68, -3.8]], 0.9, trim);
      // col montant blanc
      paint(g, [[-sw * 0.42, -T + 1.5], [-sw * 0.38, -T - 7], [0, -T - 4.5], [sw * 0.34, -T - 6.5], [sw * 0.42, -T + 1], [0, -T - 0.5]], COL.white, L, { d: 1.3, vol: 'x', lw: 0.8, brush: 0.3 });
      line(g, [[-sw * 0.38, -T - 7], [0, -T - 4.5], [sw * 0.34, -T - 6.5]], 1.1, trim);
    },
  };

  // ---------------------------------------------------------------- robe longue (pivot hanches), panneau blanc devant
  const hem = c.leg - 1, fw = hw * 1.9;
  P.robe = {
    box: box(-fw * 0.72, -6, fw * 0.72, hem + 6),
    bevel: 4,
    draw: (g) => {
      const x0 = fw * 0.55, n = 5, step = (2 * x0) / n;
      const hemPts = [];
      for (let i = 0; i <= n; i++) hemPts.push([x0 - i * step, hem + (i % 2 ? -2.4 : 0.6) + (i === n ? -1 : 0), 1]);
      const sh = pathOf([[-hw * 0.62, -3, 1], [hw * 0.64, -3, 1], [hw * 0.95, hem * 0.4], ...hemPts, [-hw * 1.05, hem * 0.45]]);
      paint(g, sh, COL.robe, L, { d: 3.4, vol: 'x', box: [-fw * 0.55, 0, fw * 0.55, hem], seed: 31,
        after: (g) => {
          // plis
          for (const [a, b] of [[-0.25, -0.7], [-0.05, -0.3], [0.62, 0.8]]) line(g, [[hw * a, 2], [hw * (a + b * 0.4), hem * 0.55], [fw * 0.55 * b, hem - 1]], 0.55, 'rgba(10,8,20,0.42)');
          // panneau blanc devant, liseré d'or
          const p0 = [[hw * 0.12, -3], [hw * 0.5, -3], [fw * 0.5, hem + 0.6], [fw * 0.12, hem - 1.6]];
          paint(g, p0, COL.white, L, { d: 1.6, vol: 'x', box: [hw * 0.1, 0, fw * 0.5, hem], lw: 0, ink: false, brush: 0.4 });
          line(g, [p0[0], p0[3]], 1.3, trim); line(g, [p0[1], p0[2]], 1.3, trim);
          // lueur lunaire basse
          g.save(); g.globalAlpha = 0.35; line(g, [[-hw * 0.5, 6], [hw * 0.5, 6]], 0.8, COL.rim); g.restore();
        } });
      line(g, hemPts.map((q) => [q[0], q[1] - 0.6, 1]), 1.6, trim);
    },
  };

  // ---------------------------------------------------------------- longue chevelure (derrière la tête, pivot au centre de la tête)
  P.hairBack = {
    box: box(-24, -18, 12, 38),
    bevel: 3,
    draw: (g) => {
      g.save(); g.translate(0, HEAD_DY); g.scale(HEAD_S, HEAD_S);
      const k = 0.95;
      const lock = (pts, w) => ribbon(g, pts, w, 6, COL.hair, { lw: 4 * k, d: 10, ...HAIR, rimW: 4 });
      // masse principale, puis mèches qui se séparent en bas
      paintCard(g, [[-40, -50], [-78, -10], [-96, 60], [-108, 140], [-96, 178], [-70, 168], [-50, 160], [-28, 140], [-16, 80], [10, 30]], COL.hair, { d: 12, lw: 4 * k, ...HAIR, rimW: 4 });
      lock([[-70, 30], [-100, 100], [-112, 160], [-96, 196]], 40);
      lock([[-46, 40], [-62, 110], [-58, 170]], 30);
      lock([[-30, 50], [-30, 110], [-20, 150]], 22);
      g.save(); g.globalAlpha = 0.45;
      lineCard(g, [[-56, -20], [-78, 50], [-92, 120]], 3.2, '#ffffff');
      lineCard(g, [[-36, 10], [-52, 80], [-56, 140]], 2.6, '#ffffff');
      g.restore();
      lineCard(g, [[-60, 40], [-74, 110], [-80, 160]], 2.2, rgba('#5a6a90', 0.6));
      g.restore();
    },
  };

  // ---------------------------------------------------------------- tête (expressions)
  const hb = box(-17, -22, 18, 22);
  for (const [k, ex] of [['n', 'soft'], ['angry', 'fierce'], ['hurt', 'hurt']]) {
    P[`head-${k}`] = { box: hb, bevel: 6, draw: senaHead(ex) };
  }

  // ---------------------------------------------------------------- bâton : le long de +x (bas vers -x, sommet vers +x).
  // bones.ts le tourne de (f + staffDir) : l'axe +x est orienté dans le monde (staffDir = -π/2 → debout).
  P.weapon = {
    box: box(-29, -12, 53, 14),
    bevel: 1.4,
    draw: (g) => {
      const s = Math.hypot(g.getTransform().a, g.getTransform().b);
      // hampe de bois, légèrement effilée vers le bas
      paint(g, [[-26.5, -1.2], [36, -1.75], [36, 1.75], [-26.5, 1.2]], COL.wood, L, { d: 0.7, vol: 'y', box: [-26, -1.8, 36, 1.8], lw: 0.7, brush: 0.5, rimW: 0.5 });
      line(g, [[-20, -0.3], [30, -0.5]], 0.35, 'rgba(255,230,190,0.25)');
      // bagues dorées
      for (const x of [-25, -2, 30, 33.5]) paint(g, [[x, -2.3], [x + 1.8, -2.3], [x + 1.8, 2.3], [x, 2.3]], trim, L, { d: 0.4, vol: 'y', box: [x, -2.3, x + 1.8, 2.3], lw: 0.5, brush: 0, rimW: 0.3 });
      // ruban bleu noué sous la tête
      paint(g, [[31, 1.6], [27, 6], [19, 9.5], [20, 11.5], [28, 8.8], [32.5, 2.2]], mix(COL.blue, '#ffffff', 0.2), L, { d: 0.6, vol: null, lw: 0.55, brush: 0, rimW: 0.4 });
      paint(g, [[32, 1.8], [30.5, 7], [26, 12.5], [28, 13], [32, 8], [33.5, 2]], mix(COL.blue, '#ffffff', 0.05), L, { d: 0.5, vol: null, lw: 0.5, brush: 0, rimW: 0.3 });
      // halo serré de la gemme (derrière le croissant)
      g.save(); g.globalCompositeOperation = 'lighter'; glowDot(g, 43.2, 0, 8.5, COL.blue, 0.55); g.restore();
      // croissant forgé : dos vers la hampe, ouvert vers le sommet
      const cr = new Path2D();
      cr.arc(42, 0, 8.6, Math.PI * 0.3, Math.PI * 1.7);
      cr.arc(38.4, 0, 6.4, Math.PI * 1.62, Math.PI * 0.38, true);
      cr.closePath();
      g.save(); g.shadowColor = rgba(COL.gold, 0.7); g.shadowBlur = 1.5 * s;
      paint(g, cr, trim, L, { d: 0.9, vol: 'r', box: [33, -9, 51, 9], lw: 0.75, brush: 0.3, rimW: 0.6 });
      g.restore();
      line(g, [[35.6, -4.5], [34.2, 0], [35.6, 4.5]], 0.5, '#fff4c8');
      // gemme lunaire
      g.save(); g.shadowColor = COL.blue; g.shadowBlur = 3 * s;
      paint(g, [[43.2, -3.6], [46.4, 0], [43.2, 3.6], [40, 0]], COL.gem, L, { d: 0.7, vol: 'r', box: [40, -3.6, 46.4, 3.6], lw: 0.6, brush: 0, light: false, rimW: 0.4 });
      g.restore();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(42.6, -1.1, 0.9, 0, TAU); g.fill();
    },
  };
  return P;
};

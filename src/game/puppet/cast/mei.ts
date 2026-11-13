// @ts-nocheck
/**
 * Mei, la Danseuse d'ombre — pantin peint (piste A « peint encré »).
 * Assassin : tenue sombre moulante à panneaux magenta, taille fine, cuissardes, bandes sur les avant-bras,
 * écharpe rose qui flotte, deux dagues à tranchant rose. Tête : celle de la carte de sélection
 * (tools/art/heroes.ts → mei) : longue queue de cheval nouée d'un ruban rose, mèches latérales.
 */
import { box, limbPart, footPart, fistPart, paint, pathOf, line, mix, rgba, glowLine, INK, TAU, type Parts, type Painter } from '../parts';
import { head, paintCard, lineCard, ribbon } from '../heads';

const COL = {
  suit: '#1f1726', suitHi: '#2a2034', mag: '#b8277f', pink: '#ff3fb4', skin: '#f6d2bc', hair: '#1a1020', rim: '#ff9be0', eye: '#e0287f',
  boot: '#120c16', wrap: '#e8dce4', glove: '#2a1830', belt: '#2a1830', metal: '#6a5a70', steel: '#dcd6e2', grip: '#3a2040',
};

const HEAD_S = 0.2;
const HEAD_DY = -3;

const BANGS = [[-54, 46, 1], [-60, -28], [-32, -64], [12, -70], [50, -56], [64, -20], [60, 40, 1], [50, -4], [40, 16, 1], [30, -12], [18, 12, 1], [6, -14], [-6, 16, 1], [-18, -10], [-30, 18, 1], [-40, -6]];

function meiHead(expr: string) {
  return (g) => {
    const bangs = pathOf(BANGS);
    const { rim, hair, pink } = COL;
    head(g, 0, HEAD_DY, HEAD_S, -0.02, {
      skin: COL.skin, hair, eye: COL.eye, rim, expr, frontPath: bangs, k: 0.95,
      back: (g) => {
        paintCard(g, [[-60, 40, 1], [-70, -20], [-48, -60], [0, -74], [48, -60], [66, -20], [62, 30, 1], [40, 10], [-40, 10]], hair, { d: 10, lw: 4.2, rim, rimW: 4 });
        // nœud rose au sommet de la queue de cheval
        g.save(); g.shadowColor = rgba(pink, 0.7); g.shadowBlur = 6;
        paintCard(g, [[-30, -70], [-62, -98], [-58, -58], [-28, -64], [-8, -100], [-4, -58]], pink, { d: 5, lw: 3.6, rim: '#ffd0ee', rimW: 3 });
        g.restore();
        g.fillStyle = mix(pink, INK, 0.3); g.beginPath(); g.arc(-30, -66, 7, 0, TAU); g.fill();
      },
      front: (g) => {
        paintCard(g, bangs, hair, { d: 9, lw: 4.2, rim, rimW: 4, after: (g) => { g.globalAlpha = 0.4; lineCard(g, [[-26, -50], [-14, -26]], 4, '#7a4a8a'); lineCard(g, [[16, -58], [26, -30]], 4, '#7a4a8a'); } });
        // mèches latérales
        ribbon(g, [[52, 10], [58, 46], [52, 84]], 16, 5, hair, { rim, rimW: 3, lw: 4 });
        ribbon(g, [[-50, 10], [-54, 50], [-46, 90]], 18, 5, hair, { rim, rimW: 3, lw: 4 });
      },
    });
  };
}

export const mei: Painter = (c, L) => {
  const th = c.leg / 2, T = c.torso, A = c.arm / 2, aw = c.aw, lw = c.lw, sw = c.sw, hw = c.hw, wq = (c.waist as number) ?? 1;
  const P: Parts = {};
  const shine = 'rgba(255,230,245,0.35)', seam = 'rgba(10,8,14,0.55)';

  // ---------------------------------------------------------------- jambes : collant sombre, cuissardes à liseré rose
  P.thigh = limbPart(L, th, lw * 1.26, lw * 0.9, COL.suit, { back: lw * 0.14, front: lw * 0.06, seed: 3,
    deco: (g) => {
      // panneau magenta le long de la cuisse
      paint(g, [[lw * 0.15, th * 0.05], [lw * 0.6, th * 0.05], [lw * 0.45, th * 0.75], [lw * 0.2, th * 0.7]], COL.mag, L, { d: 0.8, vol: null, lw: 0.55, brush: 0.2 });
    } });
  const shin = limbPart(L, th, lw * 0.95, lw * 0.66, COL.suit, { back: lw * 0.22, seed: 5, joint: true,
    deco: (g) => {
      const b = pathOf([[-lw * 0.62, th * 0.02], [lw * 0.62, -th * 0.02], [lw * 0.48, th + 4], [-lw * 0.48, th + 4]]);
      paint(g, b, COL.boot, L, { d: 1.4, vol: 'x', box: [-lw * 0.5, 0, lw * 0.5, th], brush: 0.4, lw: 0.8,
        after: (g) => { line(g, [[lw * 0.1, th * 0.15], [lw * 0.06, th * 0.9]], 0.6, shine); for (let j = 0; j < 3; j++) line(g, [[-lw * 0.45, th * (0.4 + j * 0.17)], [lw * 0.42, th * (0.4 + j * 0.17) - 0.5]], 0.45, 'rgba(255,63,180,0.35)'); } });
    } });
  // revers rose de la cuissarde, au genou
  P.shin = { ...shin, box: box(-lw * 0.8, -lw * 0.6, lw * 0.8, shin.box[3]),
    draw: (g) => {
      shin.draw(g);
      paint(g, pathOf([[-lw * 0.62, -lw * 0.05, 1], [lw * 0.66, -lw * 0.22, 1], [lw * 0.66, lw * 0.25, 1], [-lw * 0.6, lw * 0.38, 1]]), COL.pink, L, { d: 0.6, vol: 'y', lw: 0.7, brush: 0.1, rimW: 0.4 });
    } };
  P.foot = footPart(L, lw, COL.boot, { deco: (g) => { line(g, [[-lw * 0.4, lw * 0.4], [lw * 1.3, lw * 0.4]], 0.5, 'rgba(255,190,230,0.25)'); line(g, [[-lw * 0.3, -lw * 0.5], [lw * 1.1, -lw * 0.1]], 0.5, shine); } });

  // ---------------------------------------------------------------- bras : manches sombres, avant-bras bandés, gants
  P.upper = limbPart(L, A, aw * 1.12, aw * 0.84, COL.suit, { back: aw * 0.14, seed: 7,
    deco: (g) => { line(g, [[-aw * 0.5, A * 0.12], [aw * 0.5, A * 0.1]], 1.1, COL.mag); line(g, [[aw * 0.1, A * 0.2], [aw * 0.05, A * 0.85]], 0.45, seam); } });
  P.fore = limbPart(L, A, aw * 0.96, aw * 0.74, COL.suit, { back: aw * 0.2, seed: 9, joint: true,
    deco: (g) => {
      // bandes de tissu clair enroulées en biais
      for (let j = 0; j < 4; j++) {
        const y = A * 0.3 + j * 2.6;
        paint(g, [[-aw * 0.6, y], [aw * 0.6, y + 1.4], [aw * 0.6, y + 3.1], [-aw * 0.6, y + 1.7]], COL.wrap, L, { d: 0.4, vol: 'x', box: [-aw * 0.5, y, aw * 0.5, y + 3], lw: 0.45, brush: 0, rimW: 0.4 });
      }
    } });
  P.hand = fistPart(L, aw * 0.56, COL.glove);

  // ---------------------------------------------------------------- buste : taille fine, panneau magenta, ceinture, col d'écharpe
  P.torso = {
    box: box(-sw * 0.85, -T - 10, sw * 0.9, 6),
    bevel: 4.5,
    draw: (g) => {
      const bust = pathOf([[-hw * 0.58, 2, 1], [hw * 0.6, 2, 1], [sw * 0.48 * wq, -T * 0.3], [sw * 0.56, -T * 0.66], [sw * 0.62, -T * 0.86], [sw * 0.34, -T - 3], [0, -T - 4.5], [-sw * 0.5, -T - 1], [-sw * 0.62, -T * 0.8], [-sw * 0.5 * wq, -T * 0.42], [-hw * 0.64, -T * 0.1]]);
      paint(g, bust, COL.suit, L, { d: 2.8, vol: 'x', box: [-sw * 0.55, -T, sw * 0.55, 0], seed: 11,
        after: (g) => {
          // panneau magenta central, en sablier
          paint(g, [[sw * 0.02, -T - 2], [sw * 0.36, -T - 2], [sw * 0.4, -T * 0.5], [sw * 0.22, -2], [sw * 0.02, -2], [-sw * 0.06, -T * 0.5]], COL.mag, L, { d: 1, vol: 'x', lw: 0.6, brush: 0.3 });
          line(g, [[-sw * 0.45, -T * 0.55], [sw * 0.55, -T * 0.6]], 0.9, COL.pink);
          line(g, [[-sw * 0.3, -T * 0.85], [-sw * 0.32, -T * 0.3]], 0.45, 'rgba(10,8,20,0.45)');
        } });
      // ceinture et boucle lumineuse
      paint(g, [[-hw * 0.64, -5], [hw * 0.66, -5.5], [hw * 0.68, -0.5], [-hw * 0.64, 0]], COL.belt, L, { d: 0.8, vol: 'y', lw: 0.7, brush: 0.1 });
      g.save(); g.shadowColor = COL.pink; g.shadowBlur = 2 * Math.hypot(g.getTransform().a, g.getTransform().b);
      paint(g, [[hw * 0.18, -5.8, 1], [hw * 0.42, -5.9, 1], [hw * 0.42, 0.1, 1], [hw * 0.18, 0.2, 1]], COL.pink, L, { d: 0.5, vol: null, lw: 0.55, brush: 0, rimW: 0 });
      g.restore();
      // écharpe enroulée autour du cou
      paint(g, pathOf([[-sw * 0.56, -T + 1.5, 1], [-sw * 0.1, -T - 4.5], [sw * 0.48, -T - 3.5, 1], [sw * 0.46, -T + 2.5, 1], [0, -T + 3.2], [-sw * 0.5, -T + 4, 1]]), COL.pink, L,
        { d: 1.4, vol: 'y', lw: 0.85, brush: 0.4, dark: rgba(mix(COL.pink, '#160c2c', 0.55), 0.8),
          after: (g) => { line(g, [[-sw * 0.4, -T - 0.5], [sw * 0.4, -T - 1]], 0.5, 'rgba(10,8,14,0.5)'); } });
    },
  };

  // ---------------------------------------------------------------- jupette fendue (pans magenta)
  const flap = (front: boolean): Parts[string] => {
    const Lf = 13, w = hw * 0.62;
    return {
      box: box(-w - 2, -2, w + 3, Lf + 6),
      bevel: 2,
      draw: (g) => {
        const p = pathOf([[-w * 0.5, 0, 1], [w * 0.5, 0, 1], [w * 0.5, Lf, 1], [0, Lf + 3, 1], [-w * 0.48, Lf - 1, 1]]);
        paint(g, p, COL.mag, L, { d: 1.8, vol: 'x', box: [-w * 0.5, 0, w * 0.5, Lf], seed: front ? 17 : 13, lw: 0.85,
          after: (g) => { line(g, [[w * 0.05, 1], [w * 0.1, Lf]], 0.45, 'rgba(10,8,20,0.5)'); } });
        line(g, [[w * 0.5, Lf], [0, Lf + 3], [-w * 0.48, Lf - 1]], 0.9, COL.pink);
      },
    };
  };
  P.flapB = flap(false);
  P.flapF = flap(true);

  // ---------------------------------------------------------------- pans de l'écharpe (pivot à la nuque, côté dos ; flottent vers -x)
  P.scarf = {
    box: box(-22, -4, 3, 17),
    bevel: 1.8,
    draw: (g) => {
      g.save(); g.scale(0.2, 0.2);
      ribbon(g, [[0, 0], [-30, 12], [-60, 20], [-85, 40], [-100, 70]], 26, 6, mix(COL.pink, '#5a1040', 0.3), { rim: COL.rim, rimW: 3, lw: 4, d: 6 });
      ribbon(g, [[0, -2], [-36, -2], [-70, 12], [-100, 18], [-104, 22]], 30, 8, COL.pink, { rim: COL.rim, rimW: 4, lw: 4.2, d: 7, dark: mix(COL.pink, '#160c2c', 0.55) });
      g.restore();
    },
  };

  // ---------------------------------------------------------------- queue de cheval (pivot au centre de la tête)
  P.hairBack = {
    box: box(-40, -24, 2, 18),
    bevel: 2.5,
    draw: (g) => {
      g.save(); g.translate(0, HEAD_DY); g.scale(HEAD_S, HEAD_S);
      ribbon(g, [[-18, -66], [-66, -82], [-108, -60], [-130, -18], [-138, 34], [-156, 80]], 54, 10, COL.hair, { rim: COL.rim, rimW: 5, lw: 4.2, d: 10 });
      ribbon(g, [[-24, -58], [-72, -60], [-104, -26], [-114, 30], [-108, 62]], 34, 8, COL.hair, { rim: COL.rim, rimW: 4, lw: 4.2, d: 8,
        after: (g) => { g.globalAlpha = 0.35; lineCard(g, [[-60, -74], [-106, -54], [-124, -10], [-128, 30]], 4, '#7a4a8a'); } });
      g.restore();
    },
  };

  // ---------------------------------------------------------------- tête (expressions)
  const hb = box(-17, -25, 17, 18);
  for (const [k, ex] of [['n', 'smirk'], ['angry', 'fierce'], ['hurt', 'hurt']]) {
    P[`head-${k}`] = { box: hb, bevel: 6, draw: meiHead(ex) };
  }

  // ---------------------------------------------------------------- dague : repère de la main (rig/draw.ts drawWeapon : rotate(-.2), lame vers +x)
  P.weapon = {
    box: box(-10, -9, 25, 7),
    bevel: 1.2,
    draw: (g) => {
      g.save(); g.rotate(-0.2);
      const s = Math.hypot(g.getTransform().a, g.getTransform().b);
      // lame courbe
      const blade = pathOf([[2, -2.4, 1], [12, -3.6], [22.5, 0.4, 1], [13, 1.4], [2, 2.4, 1]]);
      g.save(); g.shadowColor = rgba(COL.pink, 0.7); g.shadowBlur = 2.5 * s; g.fillStyle = COL.steel; g.fill(blade); g.restore();
      paint(g, blade, COL.steel, L, { d: 0.6, vol: null, lw: 0.75, brush: 0.15, rimW: 0.4,
        after: (g) => { g.fillStyle = 'rgba(120,110,140,0.55)'; g.beginPath(); g.moveTo(2, 0.4); g.quadraticCurveTo(13, 0.2, 22.5, 0.4); g.lineTo(13, 1.4); g.lineTo(2, 2.4); g.closePath(); g.fill(); } });
      glowLine(g, [[4, -1.9], [12, -3], [21, 0.1]], 0.7, COL.pink, 2.2);
      // garde
      paint(g, pathOf([[0, -4, 1], [1.4, -2], [1.6, 0], [1.4, 2], [0, 4, 1], [1.8, 4.2, 1], [3.4, 0], [1.8, -4.2, 1]]), COL.metal, L, { d: 0.4, vol: null, lw: 0.6, brush: 0 });
      // poignée + anneau
      paint(g, [[-5, -1.6, 1], [0, -1.6, 1], [0, 1.6, 1], [-5, 1.6, 1]], COL.grip, L, { d: 0.4, vol: 'y', lw: 0.55, brush: 0 });
      g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.arc(-6.6, 0, 1.8, 0, TAU); g.stroke();
      g.strokeStyle = COL.metal; g.lineWidth = 0.8; g.stroke();
      g.save(); g.shadowColor = COL.pink; g.shadowBlur = 2 * s; g.fillStyle = COL.pink; g.beginPath(); g.arc(-6.6, 0, 0.7, 0, TAU); g.fill(); g.restore();
      g.restore();
    },
  };
  return P;
};

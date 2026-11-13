// @ts-nocheck
/**
 * Taro, la Lame écarlate — pantin peint (piste A « peint encré »).
 * Tank : armure sombre, plastron de métal frappé d'un emblème rouge, épaulière en lames, gantelets et
 * jambières de métal, cape rouge déchirée, espadon à tranchant rouge. Tête : celle de la carte de
 * sélection (tools/art/heroes.ts → taro) : cheveux en pointes, bandeau rouge dont les pans flottent.
 */
import { box, limbPart, footPart, fistPart, paint, pathOf, line, mix, rgba, glowLine, INK, TAU, type Parts, type Painter } from '../parts';
import { head, paintCard, lineCard, spikes, ribbon } from '../heads';

const COL = {
  armor: '#2a2a33', armorHi: '#34343f', metal: '#6a6678', metalDk: '#4a4756', red: '#c4202e', band: '#d02634', band2: '#a81c28',
  cape: '#6e121b', skin: '#efc6a4', hair: '#221a20', rim: '#ff7a5c', eye: '#c42a36', grip: '#3a1a1e', glove: '#3e3a48',
  steel: '#d4d8e2', steelDk: '#8d93a6', edge: '#ff4a3a',
};

/** Échelle tête : repère carte (crâne r = 50) → unités du squelette (headR 12,5 contre 12 chez Ren). */
const HEAD_S = 0.205;
const HEAD_DY = -3;

const BANGS = [[-52, 34, 1], [-60, -30], [-30, -62], [10, -68], [48, -56], [62, -24], [60, 20, 1], [48, -12], [40, 20, 1], [28, -14], [16, 22, 1], [4, -14], [-8, 18, 1], [-20, -12], [-34, 24, 1], [-42, -6]];

function taroHead(expr: string) {
  return (g) => {
    const bangs = pathOf(BANGS);
    const { rim, hair } = COL;
    head(g, 0, HEAD_DY, HEAD_S, 0.03, {
      skin: COL.skin, hair, eye: COL.eye, rim, expr, frontPath: bangs, k: 0.95,
      back: (g) => {
        paintCard(g, spikes([[150, 94], [184, 108], [218, 114], [252, 112], [286, 104], [318, 96], [350, 88], [20, 80]], -0.3, 72), hair, { d: 12, lw: 4.2, rim, rimW: 5 });
      },
      front: (g) => {
        paintCard(g, bangs, hair, { d: 9, lw: 4.2, rim, rimW: 4, after: (g) => { g.globalAlpha = 0.3; lineCard(g, [[-28, -50], [-8, -28], [2, -6]], 4, '#6a5060'); lineCard(g, [[14, -58], [28, -34], [34, -10]], 4, '#6a5060'); } });
        // bandeau rouge et sa plaque de métal
        paintCard(g, [[-58, -30], [-20, -42], [30, -40], [62, -30], [62, -14], [30, -24], [-20, -26], [-60, -12]], COL.band, { d: 4, lw: 4, rim, rimW: 3 });
        paintCard(g, [[-4, -38], [18, -38], [18, -24], [-4, -24]], '#c9ccd8', { d: 3, lw: 3 });
      },
      extra: (g) => { lineCard(g, [[-36, 40], [-26, 52]], 3, '#b04050'); }, // cicatrice
    });
  };
}

export const taro: Painter = (c, L) => {
  const th = c.leg / 2, T = c.torso, A = c.arm / 2, aw = c.aw, lw = c.lw, sw = c.sw, hw = c.hw;
  const P: Parts = {};
  const shine = 'rgba(255,240,230,0.45)', seam = 'rgba(10,8,14,0.6)';

  // ---------------------------------------------------------------- jambes : armure sombre, jambières et solerets
  P.thigh = limbPart(L, th, lw * 1.24, lw * 0.92, COL.armor, { back: lw * 0.12, front: lw * 0.06, seed: 3,
    deco: (g) => {
      // cuissot de métal sur le devant de la cuisse
      paint(g, [[-lw * 0.1, th * 0.12], [lw * 0.66, th * 0.08], [lw * 0.6, th * 0.86], [-lw * 0.05, th * 0.9]], COL.metal, L, { d: 1.2, vol: 'x', box: [-lw * 0.1, 0, lw * 0.62, th], lw: 0.7, brush: 0.3 });
      line(g, [[lw * 0.38, th * 0.16], [lw * 0.34, th * 0.8]], 0.6, shine);
    } });
  const shin = limbPart(L, th, lw * 0.98, lw * 0.72, COL.armor, { back: lw * 0.2, seed: 5, joint: true,
    deco: (g) => {
      // jambière : plaque de métal du genou à la cheville
      const b = pathOf([[-lw * 0.62, th * 0.14], [lw * 0.62, th * 0.1], [lw * 0.5, th + 4], [-lw * 0.5, th + 4]]);
      paint(g, b, COL.metal, L, { d: 1.6, vol: 'x', box: [-lw * 0.5, th * 0.1, lw * 0.5, th], brush: 0.4, lw: 0.8 });
      line(g, [[lw * 0.08, th * 0.2], [lw * 0.04, th * 0.85]], 0.7, shine);
      line(g, [[-lw * 0.55, th * 0.62], [lw * 0.55, th * 0.58]], 0.55, seam);
    } });
  // genouillère par-dessus l'articulation (hors du membre, d'où la pièce élargie)
  P.shin = { ...shin, box: box(-lw * 0.85, -lw * 0.7, lw * 0.95, shin.box[3]),
    draw: (g) => {
      shin.draw(g);
      paint(g, pathOf([[-lw * 0.5, -lw * 0.1], [-lw * 0.2, -lw * 0.55], [lw * 0.45, -lw * 0.5], [lw * 0.8, -lw * 0.05], [lw * 0.55, lw * 0.45], [-lw * 0.3, lw * 0.42]]), COL.metal, L,
        { d: 1.2, vol: 'r', box: [-lw * 0.5, -lw * 0.5, lw * 0.8, lw * 0.45], lw: 0.85, brush: 0.2,
          after: (g) => { line(g, [[-lw * 0.1, -lw * 0.3], [lw * 0.4, -lw * 0.3]], 0.6, shine); } });
      g.fillStyle = '#d8d4c8'; g.beginPath(); g.arc(lw * 0.15, lw * 0.05, 0.75, 0, TAU); g.fill();
    } };
  P.foot = footPart(L, lw, COL.metalDk, { big: true,
    deco: (g) => {
      line(g, [[lw * 0.35, -lw * 0.55], [lw * 0.6, lw * 0.5]], 0.6, seam);
      line(g, [[lw * 0.95, -lw * 0.35], [lw * 1.15, lw * 0.5]], 0.6, seam);
      line(g, [[-lw * 0.3, -lw * 0.5], [lw * 1.3, -lw * 0.2]], 0.6, shine);
    } });

  // ---------------------------------------------------------------- bras : manche d'armure, gantelets
  P.upper = limbPart(L, A, aw * 1.15, aw * 0.88, COL.armor, { back: aw * 0.14, seed: 7,
    deco: (g) => {
      // brassard
      paint(g, [[-aw * 0.6, A * 0.5], [aw * 0.6, A * 0.48], [aw * 0.5, A * 0.95], [-aw * 0.5, A * 0.97]], COL.metal, L, { d: 1, vol: 'x', box: [-aw * 0.5, A * 0.5, aw * 0.5, A], lw: 0.7, brush: 0.2 });
      line(g, [[-aw * 0.5, A * 0.53], [aw * 0.5, A * 0.51]], 0.9, COL.red);
    } });
  P.fore = limbPart(L, A, aw * 1.0, aw * 0.8, COL.armor, { back: aw * 0.18, seed: 9, joint: true,
    deco: (g) => {
      // canon de gantelet évasé
      const b = pathOf([[-aw * 0.62, A * 0.18], [aw * 0.64, A * 0.16], [aw * 0.56, A + 2], [-aw * 0.56, A + 2]]);
      paint(g, b, COL.metal, L, { d: 1.3, vol: 'x', box: [-aw * 0.55, A * 0.15, aw * 0.55, A], lw: 0.75, brush: 0.3 });
      for (const y of [0.42, 0.68]) line(g, [[-aw * 0.56, A * y], [aw * 0.56, A * y - 0.4]], 0.55, seam);
      line(g, [[aw * 0.12, A * 0.24], [aw * 0.08, A * 0.9]], 0.65, shine);
    } });
  P.hand = fistPart(L, aw * 0.6, COL.glove);

  // ---------------------------------------------------------------- buste : armure, plastron, emblème, ceinture, gorgerin
  P.torso = {
    box: box(-sw * 0.8, -T - 10, sw * 0.8, 6),
    bevel: 5,
    draw: (g) => {
      const bust = pathOf([[-hw * 0.6, 2, 1], [hw * 0.62, 2, 1], [sw * 0.48, -T * 0.22], [sw * 0.56, -T * 0.62], [sw * 0.62, -T * 0.86], [sw * 0.34, -T - 3], [0, -T - 4.5], [-sw * 0.5, -T - 1], [-sw * 0.62, -T * 0.8], [-sw * 0.48, -T * 0.4], [-hw * 0.66, -T * 0.1]]);
      paint(g, bust, COL.armor, L, { d: 3.2, vol: 'x', box: [-sw * 0.55, -T, sw * 0.55, 0], seed: 11,
        after: (g) => { line(g, [[-sw * 0.32, -T * 0.8], [-sw * 0.36, -T * 0.3]], 0.5, 'rgba(10,8,20,0.45)'); } });
      // plaques ventrales (lames)
      for (let j = 0; j < 2; j++) {
        const y = -T * 0.34 + j * T * 0.13;
        paint(g, [[-sw * 0.36, y], [sw * 0.1, y - 1.6], [sw * 0.5, y - 0.8], [sw * 0.46, y + T * 0.12], [sw * 0.05, y + T * 0.11 - 1.2], [-sw * 0.34, y + T * 0.1]], COL.metalDk, L, { d: 1, vol: 'y', lw: 0.7, brush: 0.2 });
      }
      // plastron bombé
      const plate = pathOf([[-sw * 0.42, -T + 1], [sw * 0.1, -T - 1.5], [sw * 0.6, -T * 0.86], [sw * 0.6, -T * 0.6], [sw * 0.36, -T * 0.36], [-sw * 0.06, -T * 0.38], [-sw * 0.44, -T * 0.5]]);
      paint(g, plate, COL.metal, L, { d: 2.2, vol: 'r', box: [-sw * 0.4, -T, sw * 0.6, -T * 0.36], lw: 0.95, brush: 0.4,
        after: (g) => {
          line(g, [[sw * 0.08, -T + 0.5], [sw * 0.14, -T * 0.42]], 0.7, shine);
          line(g, [[-sw * 0.3, -T * 0.92], [sw * 0.3, -T * 0.94]], 0.5, 'rgba(255,240,230,0.25)');
        } });
      // emblème rouge lumineux
      const ex = -sw * 0.02, ey = -T * 0.5;
      g.save(); g.shadowColor = COL.edge; g.shadowBlur = 2.2 * Math.hypot(g.getTransform().a, g.getTransform().b);
      paint(g, [[ex - 2.8, ey - 3.2, 1], [ex + 2.8, ey - 3.2, 1], [ex, ey + 3.6, 1]], COL.red, L, { d: 0.6, vol: null, lw: 0.6, brush: 0, rimW: 0.4 });
      g.restore();
      g.fillStyle = '#ffd0c0'; g.beginPath(); g.arc(ex - 0.5, ey - 1.6, 0.55, 0, TAU); g.fill();
      // ceinture + boucle
      paint(g, [[-hw * 0.66, -6.5], [hw * 0.68, -7], [hw * 0.7, -1], [-hw * 0.66, -0.5]], COL.grip, L, { d: 1, vol: 'y', lw: 0.7, brush: 0.2 });
      paint(g, [[hw * 0.18, -7.6], [hw * 0.5, -7.8], [hw * 0.5, -0.6], [hw * 0.18, -0.4]], '#a8a4b4', L, { d: 0.8, vol: null, lw: 0.6, brush: 0 });
      // gorgerin
      paint(g, [[-sw * 0.42, -T + 1.5], [-sw * 0.36, -T - 5.5], [0, -T - 3], [sw * 0.34, -T - 4.5], [sw * 0.4, -T + 1.5], [0, -T - 0.2]], COL.metal, L, { d: 1.2, vol: 'y', lw: 0.8, brush: 0.2 });
      line(g, [[-sw * 0.36, -T - 3], [0, -T - 0.8], [sw * 0.34, -T - 2.5]], 0.5, seam);
    },
  };

  // ---------------------------------------------------------------- tassettes : plaques de métal sur les hanches, tabard rouge
  const flap = (front: boolean): Parts[string] => {
    const Lf = front ? 15 : 13, w = hw * 0.62;
    return {
      box: box(-w - 2, -2, w + 3, Lf + 7),
      bevel: 2.5,
      draw: (g) => {
        const p = pathOf([[-w * 0.5, 0, 1], [w * 0.5, 0, 1], [w * 0.44, Lf, 1], [0, Lf + 3, 1], [-w * 0.46, Lf - 1, 1]]);
        paint(g, p, COL.metal, L, { d: 1.8, vol: 'x', box: [-w * 0.5, 0, w * 0.5, Lf], seed: front ? 17 : 13, lw: 0.9,
          after: (g) => { for (const y of [0.33, 0.66]) line(g, [[-w * 0.5, Lf * y], [w * 0.5, Lf * y - 0.5]], 0.6, seam); line(g, [[-w * 0.1, 1], [-w * 0.12, Lf - 1]], 0.6, shine); } });
        if (front) { // tabard rouge par-dessus
          paint(g, [[-w * 0.2, 0, 1], [w * 0.26, 0, 1], [w * 0.22, Lf + 2], [0, Lf + 5.5, 1], [-w * 0.2, Lf + 2]], COL.red, L, { d: 1.2, vol: 'x', lw: 0.8, brush: 0.4 });
        }
      },
    };
  };
  P.flapB = flap(false);
  P.flapF = flap(true);

  // ---------------------------------------------------------------- cape rouge déchirée (pivot entre les épaules, pend vers +y)
  const Lc = T + c.leg * 0.76;
  P.cape = {
    box: box(-26, -3, 10, Lc + 6),
    bevel: 3,
    draw: (g) => {
      const hem = [[3, Lc, 1], [-1, Lc - 7, 1], [-5, Lc + 1, 1], [-8.5, Lc - 9, 1], [-12, Lc - 1, 1], [-15.5, Lc - 11, 1], [-19, Lc - 4, 1], [-21, Lc - 14, 1]];
      const p = pathOf([[-sw * 0.4, 0], [sw * 0.25, -0.5], [sw * 0.12, Lc * 0.3], [2, Lc * 0.7], ...hem, [-22, Lc * 0.5], [-18, Lc * 0.22], [-sw * 0.62, 6]]);
      paint(g, p, COL.cape, L, { d: 3.5, vol: 'x', box: [-22, 0, 6, Lc], seed: 21, dark: rgba(mix(COL.cape, '#160c2c', 0.6), 0.8),
        after: (g) => {
          // plis
          for (const [x0, x1] of [[-4, -6], [-9, -13], [-14, -19]]) line(g, [[x0 + 2, 4], [x0, Lc * 0.4], [x1, Lc - 8]], 0.6, 'rgba(10,4,14,0.5)');
          line(g, [[-2, 6], [-4, Lc * 0.5]], 0.6, 'rgba(255,200,180,0.18)');
        } });
      // déchirures : effilochage sombre sur l'ourlet
      line(g, [[-5, Lc + 1], [-6, Lc + 3]], 0.5, INK); line(g, [[-12, Lc - 1], [-12.5, Lc + 2]], 0.5, INK);
    },
  };

  // ---------------------------------------------------------------- épaulière en lames superposées (centre de l'épaule)
  const pw = aw * 1.35, ph = aw * 0.95;
  P.pauldron = {
    box: box(-pw - 1.5, -ph - 1.5, pw + 1.5, ph * 1.4 + 1.5),
    bevel: 3,
    draw: (g) => {
      // lame inférieure
      paint(g, pathOf([[-pw * 0.95, ph * 0.05], [-pw * 0.4, ph * 0.5], [pw * 0.45, ph * 0.55], [pw * 0.92, ph * 0.1], [pw * 0.8, ph * 0.85], [0, ph * 1.3], [-pw * 0.8, ph * 0.9]]), COL.metalDk, L, { d: 1.2, vol: 'y', lw: 0.85, brush: 0.3 });
      // coque principale
      paint(g, pathOf([[-pw, ph * 0.3], [-pw * 0.7, -ph * 0.7], [0, -ph], [pw * 0.75, -ph * 0.7], [pw, ph * 0.25], [pw * 0.5, ph * 0.55], [-pw * 0.5, ph * 0.6]]), COL.metal, L,
        { d: 2, vol: 'r', box: [-pw, -ph, pw, ph * 0.6], lw: 0.95, brush: 0.4,
          after: (g) => { g.strokeStyle = shine; g.lineWidth = 0.8; g.beginPath(); g.ellipse(0, 0, pw * 0.7, ph * 0.55, 0, Math.PI * 1.1, Math.PI * 1.6); g.stroke(); } });
      // liseré rouge + rivets
      line(g, [[-pw * 0.88, ph * 0.18], [0, ph * 0.42], [pw * 0.88, ph * 0.14]], 1, COL.red);
      g.fillStyle = '#d8d4c8'; for (const x of [-0.5, 0, 0.5]) { g.beginPath(); g.arc(x * pw, -ph * 0.15 + Math.abs(x) * ph * 0.1, 0.75, 0, TAU); g.fill(); }
    },
  };

  // ---------------------------------------------------------------- pans du bandeau (pivot au centre de la tête)
  P.hairBack = {
    box: box(-30, -14, 2, 10),
    bevel: 1.6,
    draw: (g) => {
      g.save(); g.translate(0, HEAD_DY); g.scale(HEAD_S, HEAD_S);
      ribbon(g, [[-46, -24], [-90, -14], [-120, -28], [-140, -14]], 22, 8, COL.band, { rim: COL.rim, rimW: 4, lw: 4.2, d: 6 });
      ribbon(g, [[-46, -18], [-80, 10], [-112, 12], [-132, 34]], 18, 6, COL.band2, { rim: COL.rim, rimW: 4, lw: 4.2, d: 6 });
      g.restore();
    },
  };

  // ---------------------------------------------------------------- tête (expressions)
  const hb = box(-23, -26, 18, 18);
  for (const [k, ex] of [['n', 'smirk'], ['angry', 'fierce'], ['hurt', 'hurt']]) {
    P[`head-${k}`] = { box: hb, bevel: 6, draw: taroHead(ex) };
  }

  // ---------------------------------------------------------------- espadon : repère de la main (rig/draw.ts drawWeapon : rotate(-.35), lame vers +x)
  const BL = 56, W = 8;
  P.weapon = {
    box: box(-20, -28, 62, 14),
    bevel: 1.4,
    draw: (g) => {
      g.save(); g.rotate(-0.35);
      const s = Math.hypot(g.getTransform().a, g.getTransform().b);
      // lame : pan clair (haut) et pan sombre (bas), pointe en losange
      const blade = pathOf([[3, -W / 2, 1], [2 + BL * 0.82, -W / 2, 1], [2 + BL, 0, 1], [2 + BL * 0.82, W / 2, 1], [3, W / 2, 1]]);
      g.save(); g.shadowColor = rgba(COL.edge, 0.55); g.shadowBlur = 3 * s; g.fillStyle = COL.steel; g.fill(blade); g.restore();
      paint(g, blade, COL.steel, L, { d: 0.8, vol: null, lw: 0.95, brush: 0.25, rimW: 0.5,
        after: (g) => {
          g.fillStyle = rgba(COL.steelDk, 0.85); g.beginPath(); g.moveTo(3, 0); g.lineTo(2 + BL, 0); g.lineTo(2 + BL * 0.82, W / 2); g.lineTo(3, W / 2); g.closePath(); g.fill();
          line(g, [[5, 0], [2 + BL * 0.74, 0]], 0.7, 'rgba(40,40,60,0.6)');
          for (let j = 0; j < 4; j++) { g.fillStyle = rgba(COL.edge, 0.9); g.fillRect(8 + j * BL * 0.16, -1.2, BL * 0.07, 1.1); }
        } });
      glowLine(g, [[5, -W / 2 + 0.7], [2 + BL * 0.82, -W / 2 + 0.7], [2 + BL - 1.4, 0]], 0.9, COL.edge, 2.5);
      // garde en croissant
      paint(g, pathOf([[-2, -W * 1.2, 1], [1, -W * 0.6], [1.5, 0], [1, W * 0.6], [-2, W * 1.2, 1], [-0.2, W * 1.28, 1], [3.8, W * 0.6], [4.2, 0], [3.8, -W * 0.6], [-0.2, -W * 1.28, 1]]), COL.metal, L, { d: 0.7, vol: null, lw: 0.8, brush: 0 });
      // fusée gainée de cuir rouge sombre
      paint(g, [[-12, -2.2, 1], [-1.5, -2.2, 1], [-1.5, 2.2, 1], [-12, 2.2, 1]], COL.grip, L, { d: 0.6, vol: 'y', lw: 0.7, brush: 0,
        after: (g) => { for (let j = 0; j < 4; j++) line(g, [[-11 + j * 2.4, -2], [-9.6 + j * 2.4, 2]], 0.5, 'rgba(200,90,90,0.5)'); } });
      // pommeau + gemme
      paint(g, [[-12, 0, 1], [-14.5, -3, 1], [-17, 0, 1], [-14.5, 3, 1]], COL.metal, L, { d: 0.5, vol: null, lw: 0.7, brush: 0 });
      g.save(); g.shadowColor = COL.edge; g.shadowBlur = 2 * s; g.fillStyle = COL.edge; g.beginPath(); g.arc(-14.5, 0, 1.2, 0, TAU); g.fill(); g.restore();
      g.restore();
    },
  };
  return P;
};

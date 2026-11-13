// @ts-nocheck
/**
 * Ennemis humanoïdes — pantins peints, piste B « ombres à contre-jour ».
 *
 * Un peintre humanoïde commun (jambes, bras, buste, pans, robe) paramétré par fiche, puis les détails
 * propres à chacun : Pillard (raider), Colosse (brute), Ombre arcanique (shade), Veilleur maudit
 * (shadeElite). Les silhouettes restent sombres ; la lecture vient du liseré de contre-jour (paint) et
 * des lueurs serrées. Toutes les lueurs viennent de L.rim / L.sig : les variantes régionales
 * (rigDef(key, tint)) recolorent yeux, runes et fissures sans repeindre à la main.
 */
import { box, limbPart, footPart, fistPart, paint, pathOf, line, mix, rgba, glowLine, glowDot, TAU, type Parts, type PartDef, type Painter } from '../parts';
import { rnd } from '../kit';

type Box = [number, number, number, number];
const BONE = '#cfc6b2';

// ------------------------------------------------------------------ petits outils de matière

/** Étend une pièce : dessin supplémentaire hors de la forme de base (genouillère, sangle…). */
function over(p: PartDef, extra: Box, fn: (g) => void): PartDef {
  return {
    box: box(Math.min(p.box[0], extra[0]), Math.min(p.box[1], extra[1]), Math.max(p.box[2], extra[2]), Math.max(p.box[3], extra[3])),
    bevel: p.bevel,
    draw: (g) => { p.draw(g); fn(g); },
  };
}

/** Reflet métallique : fil clair sur l'arête éclairée par le contre-jour. */
const spec = (g, L, pts, a = 0.45, w = 0.55) => line(g, pts, w, rgba(L.rim, a));
/** Rivets : point sombre + étincelle de contre-jour. */
function rivets(g, L, pts, r = 0.7) {
  for (const [x, y] of pts) {
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = rgba(L.rim, 0.75); g.beginPath(); g.arc(x + r * 0.35, y - r * 0.3, r * 0.4, 0, TAU); g.fill();
  }
}
/** Cotte de mailles : rangées d'anneaux à peine accrochés par la lumière. */
function mail(g, L, x0, y0, x1, y1, s = 1.6) {
  g.save(); g.lineWidth = 0.35;
  for (let y = y0, r = 0; y < y1; y += s * 0.8, r++) {
    for (let x = x0 + (r % 2) * s * 0.5; x < x1; x += s) {
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(x, y, s * 0.42, 0.2, Math.PI - 0.2); g.stroke();
      g.strokeStyle = rgba(L.rim, 0.13); g.beginPath(); g.arc(x + 0.15, y - 0.1, s * 0.42, -0.6, 0.6); g.stroke();
    }
  }
  g.restore();
}
/** Coutures de cuir. */
function stitches(g, L, pts) {
  g.save(); g.setLineDash([0.7, 0.9]); line(g, pts, 0.35, rgba(L.rim, 0.25)); g.restore();
}
/** Ourlet en lambeaux entre deux points (exclus), pointes vives. */
function tatters(x0, y0, x1, y1, n, depth, seed): any[] {
  const out = [];
  for (let i = 1; i < n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    out.push(i % 2 ? [x + (rnd(seed + i) - 0.5) * 1.2, y - depth * (0.45 + rnd(seed + i * 3.3) * 0.7), 1] : [x, y + depth * 0.25 * rnd(seed + i * 7.1), 1]);
  }
  return out;
}
/** Plis de tissu : traits sombres + fil de contre-jour. */
function folds(g, L, list, a = 0.22) {
  for (const pts of list) { line(g, pts, 0.7, 'rgba(0,0,0,0.5)'); line(g, pts.map(([x, y]) => [x + 0.6, y]), 0.35, rgba(L.rim, a)); }
}
/** Lueur serrée (fissure, rune) : pas de halo large. */
const glow = (g, L, pts, w = 0.7, col = L.rim) => glowLine(g, pts, w, col, 1.1);
/** Œil lumineux : amande nette, noyau blanc, halo court. */
function eye(g, L, x, y, rx, ry, rot = 0, k = 1) {
  g.save(); g.translate(x, y); g.rotate(rot);
  glowDot(g, 0, 0, Math.max(rx, ry) * 1.9, L.sig, 0.45 * k);
  g.shadowColor = L.rim; g.shadowBlur = 0.8 * Math.hypot(g.getTransform().a, g.getTransform().b);
  g.fillStyle = L.rim; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.fill();
  g.shadowBlur = 0; g.fillStyle = rgba('#ffffff', 0.85 * k); g.beginPath(); g.ellipse(rx * 0.15, 0, rx * 0.45, ry * 0.5, 0, 0, TAU); g.fill();
  g.restore();
}
/** Expressions : intensité et ouverture des yeux. */
const EXPR = { n: { k: 1, open: 1, tilt: 0 }, angry: { k: 1.2, open: 0.85, tilt: 0.28 }, hurt: { k: 0.65, open: 0.45, tilt: -0.2 } };

// ------------------------------------------------------------------ squelette commun

interface Mats { leg: string; shin: string; boot: string; arm: string; fore: string; glove: string; body: string }

/** Pièces communes d'un humanoïde B ; chaque ennemi remplace ou complète. */
function base(c, L, m: Mats, o: { bigFoot?: boolean; knee?: boolean; shinDeco?; thighDeco?; upperDeco?; foreDeco?; footDeco? } = {}): Parts {
  const th = c.leg / 2, A = c.arm / 2, aw = c.aw, lw = c.lw;
  const P: Parts = {};
  if (!c.float) {
    P.thigh = limbPart(L, th, lw * 1.24, lw * 0.9, m.leg, { back: lw * 0.12, front: lw * 0.05, seed: 3, deco: o.thighDeco });
    let shin = limbPart(L, th, lw * 0.95, lw * 0.68, m.shin, { back: lw * 0.2, seed: 5, joint: true, deco: o.shinDeco });
    if (o.knee) shin = over(shin, [-lw * 0.7, -lw * 0.7, lw * 0.9, lw * 0.7], (g) => {
      paint(g, [[-lw * 0.5, -lw * 0.15], [-lw * 0.1, -lw * 0.6], [lw * 0.55, -lw * 0.45], [lw * 0.75, lw * 0.1], [lw * 0.3, lw * 0.55, 1], [-lw * 0.35, lw * 0.4]], m.boot, L, { d: lw * 0.12, vol: 'r', box: [-lw * 0.5, -lw * 0.6, lw * 0.75, lw * 0.55], lw: 0.6, brush: 0.2 });
      spec(g, L, [[lw * 0.05, -lw * 0.45], [lw * 0.55, -lw * 0.25], [lw * 0.6, lw * 0.15]]);
      rivets(g, L, [[lw * 0.15, lw * 0.05]], lw * 0.06);
    });
    P.shin = shin;
    P.foot = footPart(L, lw, m.boot, { big: o.bigFoot, deco: o.footDeco ?? ((g) => {
      line(g, [[-lw * 0.3, -lw * 0.1], [lw * 0.5, -lw * 0.05], [lw * 1.1, lw * 0.15]], 0.5, 'rgba(0,0,0,0.6)');
      spec(g, L, [[lw * 0.6, -lw * 0.2], [lw * 1.3, lw * 0.1]], 0.35);
    }) });
  }
  P.upper = limbPart(L, A, aw * 1.15, aw * 0.88, m.arm, { back: aw * 0.16, seed: 7, deco: o.upperDeco });
  P.fore = limbPart(L, A, aw * 0.98, aw * 0.76, m.fore, { back: aw * 0.2, seed: 9, joint: true, deco: o.foreDeco });
  return P;
}

/** Buste : la même silhouette que l'ancien squelette (bassin, taille, poitrine vers +x, épaules). */
function bustPath(c, T): Path2D {
  const p = new Path2D(), sw = c.sw, hw = c.hw, wq = c.waist || 1;
  p.moveTo(-hw * 0.58, 2); p.lineTo(hw * 0.6, 2);
  p.bezierCurveTo(sw * 0.48 * wq, -T * 0.18, sw * 0.42 * wq, -T * 0.42, sw * 0.56, -T * 0.66);
  p.bezierCurveTo(sw * 0.66, -T * 0.84, sw * 0.56, -T - 2, sw * 0.32, -T - 3);
  p.quadraticCurveTo(0, -T - 5, -sw * 0.5, -T - 1);
  p.bezierCurveTo(-sw * 0.66, -T * 0.8, -sw * 0.5 * wq, -T * 0.45, -sw * 0.46 * wq, -T * 0.28);
  p.quadraticCurveTo(-hw * 0.68, -T * 0.1, -hw * 0.58, 2); p.closePath();
  return p;
}

/** Ceinture + boucle. */
function belt(g, c, L, col, metal) {
  const hw = c.hw;
  paint(g, [[-hw * 0.64, -6.5], [hw * 0.66, -7], [hw * 0.68, -0.8], [-hw * 0.64, -0.4]], col, L, { d: 0.8, vol: 'y', lw: 0.6, brush: 0.2 });
  stitches(g, L, [[-hw * 0.6, -5.6], [hw * 0.62, -6.1]]);
  paint(g, [[hw * 0.16, -7.8, 1], [hw * 0.5, -8, 1], [hw * 0.5, -0.2, 1], [hw * 0.16, 0, 1]], metal, L, { d: 0.6, vol: null, lw: 0.55, brush: 0 });
  spec(g, L, [[hw * 0.47, -7.4], [hw * 0.47, -0.8]], 0.6, 0.45);
}

/** Pans (tassette, pagne) : pivot en haut, longueur Lf. */
function flapPart(c, L, col, Lf, deco?, seed = 1): PartDef {
  const w = c.hw * 0.62;
  return {
    box: box(-w - 2, -2, w + 3, Lf + 6), bevel: 2,
    draw: (g) => {
      const p = pathOf([[-w * 0.5, 0, 1], [w * 0.5, 0, 1], [w * 0.55, Lf * 0.6], [w * 0.42, Lf, 1], ...tatters(w * 0.42, Lf, -w * 0.48, Lf - 1, 4, 2.4, seed), [-w * 0.48, Lf - 1, 1], [-w * 0.56, Lf * 0.5]]);
      paint(g, p, col, L, { d: 1.6, vol: 'x', box: [-w * 0.55, 0, w * 0.55, Lf], seed, after: deco });
    },
  };
}

/** Robe qui tombe des hanches, ourlet en lambeaux. `float` : traîne effilée sans jambes. */
function robePart(c, L, col, o: { float?: boolean; deco?; seed?: number } = {}): PartDef {
  const hw = c.hw, Lg = c.leg;
  if (o.float) {
    const hem = Lg * 0.85, fw = hw * 2;
    return {
      box: box(-fw - 3, -4, fw * 0.75 + 3, hem + 4), bevel: 3.5,
      draw: (g) => {
        const p = pathOf([[-hw * 0.62, -2, 1], [hw * 0.62, -2, 1], [fw * 0.62, hem * 0.45], [fw * 0.28, hem * 0.9], [4, hem, 1], [-1, hem * 0.84, 1], [-fw * 0.25, hem * 0.98, 1], [-fw * 0.36, hem * 0.76, 1], [-fw * 0.68, hem * 0.9, 1], [-fw * 0.62, hem * 0.62], [-fw * 0.95, hem * 0.64, 1], [-fw * 0.72, hem * 0.35], [-hw * 0.7, hem * 0.05]]);
        paint(g, p, col, L, { d: 2.4, vol: 'x', box: [-fw * 0.8, 0, fw * 0.6, hem], seed: o.seed ?? 21, after: (g) => {
          // le bas se dissout dans l'ombre
          const gr = g.createLinearGradient(0, hem * 0.35, 0, hem); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
          g.fillStyle = gr; g.fillRect(-fw * 2, 0, fw * 4, hem + 4);
          folds(g, L, [[[-2, 2], [-6, hem * 0.5], [-fw * 0.3, hem * 0.9]], [[hw * 0.3, 2], [fw * 0.2, hem * 0.55], [2, hem * 0.95]], [[-hw * 0.6, 4], [-fw * 0.55, hem * 0.55]]], 0.25);
          o.deco?.(g);
        } });
      },
    };
  }
  const hem = Lg - 1, fw = hw * 1.9;
  return {
    box: box(-fw * 0.7 - 2, -4, fw * 0.7 + 3, hem + 5), bevel: 3.5,
    draw: (g) => {
      const p = pathOf([[-hw * 0.62, -2, 1], [hw * 0.62, -2, 1], [hw * 0.95, Lg * 0.4], [fw * 0.55, hem, 1], ...tatters(fw * 0.55, hem, -fw * 0.6, hem - 1, 9, 6, o.seed ?? 31), [-fw * 0.6, hem - 1, 1], [-hw * 0.98, Lg * 0.4]]);
      paint(g, p, col, L, { d: 2.4, vol: 'x', box: [-fw * 0.6, 0, fw * 0.55, hem], seed: o.seed ?? 31, after: (g) => {
        folds(g, L, [[[-hw * 0.3, 3], [-fw * 0.3, hem * 0.6], [-fw * 0.35, hem * 0.95]], [[hw * 0.15, 3], [hw * 0.2, hem * 0.5], [hw * 0.4, hem * 0.9]], [[hw * 0.5, 3], [fw * 0.35, hem * 0.55]]], 0.25);
        o.deco?.(g);
      } });
    },
  };
}

/** Pièces de tête (les 3 expressions), même dessin, yeux qui changent. */
function heads(P: Parts, bx: Box, bevel: number, draw: (g, e) => void) {
  for (const k of ['n', 'angry', 'hurt']) P[`head-${k}`] = { box: bx, bevel, draw: (g) => draw(g, EXPR[k]) };
}

// ------------------------------------------------------------------ Pillard (raider)

export const raider: Painter = (c, L) => {
  const T = c.torso, sw = c.sw, hw = c.hw, aw = c.aw, A = c.arm / 2, lw = c.lw, th = c.leg / 2, r = c.headR;
  const cape = c.cape || c.body2;
  const P = base(c, L, { leg: c.body, shin: c.metal, boot: c.metal, arm: c.body, fore: c.body2, glove: c.metal, body: c.body }, {
    knee: true,
    thighDeco: (g) => { mail(g, L, -lw, th * 0.05, lw, th * 0.6, 1.5); line(g, [[-lw * 0.62, th * 0.62], [lw * 0.62, th * 0.6]], 1.4, 'rgba(0,0,0,0.6)'); },
    shinDeco: (g) => {
      // jambière de fer sur la face avant
      paint(g, [[lw * 0.05, th * 0.12], [lw * 0.62, th * 0.15], [lw * 0.48, th * 0.95, 1], [-lw * 0.05, th * 0.95, 1]], c.metal, L, { d: 0.9, vol: 'x', lw: 0.5, brush: 0.15 });
      spec(g, L, [[lw * 0.5, th * 0.2], [lw * 0.42, th * 0.9]]);
      line(g, [[-lw * 0.5, th * 0.4], [lw * 0.05, th * 0.42]], 0.9, 'rgba(0,0,0,0.6)'); line(g, [[-lw * 0.45, th * 0.72], [lw * 0.05, th * 0.74]], 0.9, 'rgba(0,0,0,0.6)');
    },
    upperDeco: (g) => mail(g, L, -aw, 0, aw, A + 2, 1.4),
    foreDeco: (g) => {
      // brassard de cuir lacé, plaque de fer
      paint(g, [[aw * 0.05, A * 0.3], [aw * 0.62, A * 0.32], [aw * 0.5, A * 0.92, 1], [aw * 0.02, A * 0.92, 1]], c.metal, L, { d: 0.7, vol: 'x', lw: 0.45, brush: 0 });
      spec(g, L, [[aw * 0.5, A * 0.35], [aw * 0.45, A * 0.88]], 0.5, 0.45);
      for (const y of [0.25, 0.55, 0.85]) line(g, [[-aw * 0.55, A * y], [aw * 0.55, A * y - 0.4]], 0.55, 'rgba(0,0,0,0.65)');
    },
  });
  P.hand = over(fistPart(L, aw * 0.58, c.metal), [-5, -5, 5, 5], (g) => spec(g, L, [[aw * 0.1, -aw * 0.55], [aw * 0.6, -aw * 0.2]], 0.55));

  // buste : cotte de mailles, plastron, plates ventrales, emblème du Culte
  P.torso = {
    box: box(-sw * 0.75, -T - 7, sw * 0.75, 6), bevel: 5,
    draw: (g) => {
      const bust = bustPath(c, T);
      paint(g, bust, c.body, L, { d: 3, vol: 'x', box: [-sw * 0.55, -T, sw * 0.55, 0], seed: 11, after: (g) => mail(g, L, -sw * 0.7, -T - 4, sw * 0.7, 2, 1.6) });
      // sur-cotte rouge (tabard) qui tombe sur le ventre
      paint(g, [[-sw * 0.1, -T * 0.5], [sw * 0.45, -T * 0.55], [sw * 0.42, -2, 1], [sw * 0.05, -1, 1]], c.body2, L, { d: 1.2, vol: 'x', lw: 0.6, after: (g) => folds(g, L, [[[sw * 0.18, -T * 0.45], [sw * 0.2, -4]]]) });
      // plastron
      const plate = pathOf([[-sw * 0.4, -T + 1], [sw * 0.1, -T - 2.2], [sw * 0.62, -T * 0.72], [sw * 0.52, -T * 0.4, 1], [-sw * 0.05, -T * 0.36, 1], [-sw * 0.45, -T * 0.5]]);
      paint(g, plate, c.metal, L, { d: 1.6, vol: 'r', box: [-sw * 0.4, -T, sw * 0.6, -T * 0.36], lw: 0.65, brush: 0.2, after: (g) => {
        spec(g, L, [[sw * 0.12, -T - 1], [sw * 0.5, -T * 0.78], [sw * 0.5, -T * 0.5]], 0.5, 0.6);
        line(g, [[sw * 0.15, -T + 1], [sw * 0.2, -T * 0.42]], 0.5, 'rgba(0,0,0,0.5)');
        // emblème : œil du Culte gravé, rouge sang
        glow(g, L, [[sw * 0.18, -T * 0.66], [sw * 0.3, -T * 0.72], [sw * 0.42, -T * 0.66], [sw * 0.3, -T * 0.6], [sw * 0.18, -T * 0.66]], 0.45, L.sig);
        g.fillStyle = L.rim; g.beginPath(); g.arc(sw * 0.3, -T * 0.66, 0.8, 0, TAU); g.fill();
        rivets(g, L, [[-sw * 0.3, -T * 0.55], [sw * 0.45, -T * 0.45], [-sw * 0.2, -T + 1]], 0.55);
      } });
      for (let j = 0; j < 2; j++) {
        const y = -T * 0.32 + j * T * 0.12;
        paint(g, [[-sw * 0.38, y], [sw * 0.1, y - 1.8], [sw * 0.5, y - 1, 1], [sw * 0.46, y + T * 0.1, 1], [sw * 0.05, y + T * 0.1 - 1.3], [-sw * 0.36, y + T * 0.09, 1]], c.metal, L, { d: 0.8, vol: 'y', lw: 0.55, brush: 0 });
        spec(g, L, [[sw * 0.1, y - 1], [sw * 0.46, y - 0.4]], 0.4, 0.45);
      }
      belt(g, c, L, c.body2, c.metal);
    },
  };
  // tassettes : bandes de cuir rivetées
  const tas = (seed) => flapPart(c, L, c.body2, 14, (g) => {
    for (const y of [4, 9]) line(g, [[-hw * 0.32, y], [hw * 0.34, y - 0.5]], 0.6, 'rgba(0,0,0,0.6)');
    rivets(g, L, [[-hw * 0.12, 2], [hw * 0.18, 2]], 0.5);
    stitches(g, L, [[hw * 0.24, 1], [hw * 0.22, 12]]);
  }, seed);
  P.flapB = tas(13); P.flapF = tas(17);

  // cape en lambeaux
  const shX = sw * 0.5, Lc = T + c.leg * 0.78;
  P.cape = {
    box: box(-shX * 1.4 - 9, -3, shX * 0.6 + 3, Lc + 4), bevel: 3,
    draw: (g) => {
      const fl = 4;
      const p = pathOf([[-shX * 0.7, 2, 1], [shX * 0.45, 1, 1], [-3, T * 0.65], [0.6, Lc - 2, 1],
        ...tatters(0.6, Lc - 2, -shX * 1.3 - 4, Lc - 6, 8, 7, 41), [-shX * 1.3 - 4, Lc - 6, 1], [-shX * 1.3 - fl * 0.55, T * 0.6], [-shX * 1.0, T * 0.15]]);
      paint(g, p, cape, L, { d: 2.4, vol: 'x', box: [-shX * 1.3, 0, shX * 0.4, Lc], seed: 23, after: (g) => {
        folds(g, L, [[[-shX * 0.3, 4], [-6, T * 0.6], [-4, Lc - 8]], [[-shX * 0.6, 4], [-shX * 0.8, T * 0.7], [-shX - 2, Lc - 10]], [[-shX * 0.9, 6], [-shX * 1.25, Lc * 0.6]]], 0.18);
        // déchirures : trous sombres
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fill(pathOf([[-shX * 0.85, Lc * 0.7], [-shX * 0.7, Lc * 0.76], [-shX * 0.82, Lc * 0.8]]));
      } });
    },
  };

  // épaulière : trois lames de fer rivetées
  const pw = aw * 1.35, ph = aw * 0.95;
  P.pauldron = {
    box: box(-pw - 2, -ph - 2, pw + 2, ph * 1.4 + 2), bevel: 3,
    draw: (g) => {
      paint(g, [[-pw, 0.5], [-pw * 0.6, -ph * 0.85], [pw * 0.4, -ph * 1.0], [pw, -ph * 0.15], [pw * 0.85, ph * 0.5, 1], [-pw * 0.9, ph * 0.55, 1]], c.metal, L, { d: 1.3, vol: 'r', lw: 0.65, brush: 0.2, after: (g) => {
        spec(g, L, [[-pw * 0.4, -ph * 0.7], [pw * 0.35, -ph * 0.85], [pw * 0.85, -ph * 0.2]], 0.55, 0.6);
      } });
      for (let j = 0; j < 2; j++) {
        const y = ph * (0.3 + j * 0.42);
        paint(g, [[-pw * 0.92, y], [0, y - ph * 0.12], [pw * 0.88, y, 1], [pw * 0.8, y + ph * 0.45, 1], [0, y + ph * 0.38], [-pw * 0.86, y + ph * 0.45, 1]], c.metal, L, { d: 0.8, vol: 'y', lw: 0.55, brush: 0 });
        spec(g, L, [[0, y - ph * 0.05], [pw * 0.8, y + 0.1]], 0.45, 0.45);
      }
      rivets(g, L, [[-pw * 0.5, ph * 0.15], [0, ph * 0.08], [pw * 0.5, ph * 0.15]], 0.65);
    },
  };

  // bouclier rond (vu de trois quarts) : cerclage de fer, planches, umbo, rune
  P.shield = {
    box: box(-11, -14, 11, 14), bevel: 4,
    draw: (g) => {
      paint(g, pathOf([[0, -12.2], [8, -8.8], [9.6, 0], [8, 8.8], [0, 12.2], [-8, 8.8], [-9.6, 0], [-8, -8.8]]), c.metal, L, { d: 1.6, vol: 'r', lw: 0.75, brush: 0.2 });
      const inner = pathOf([[0, -9.6], [6, -7], [7.2, 0], [6, 7], [0, 9.6], [-6, 7], [-7.2, 0], [-6, -7]]);
      paint(g, inner, c.body2, L, { d: 1.2, vol: 'r', lw: 0.6, brush: 0.5, rimW: 0.8, after: (g) => {
        for (const x of [-3.6, 0, 3.6]) line(g, [[x, -10], [x, 10]], 0.45, 'rgba(0,0,0,0.6)');
        line(g, [[-6, -3], [-1, 2], [-4, 6]], 0.5, 'rgba(0,0,0,0.5)'); // entaille
      } });
      spec(g, L, [[3, -11.4], [8.4, -6.6], [9.2, 1]], 0.6, 0.6);
      rivets(g, L, [[0, -11], [8.4, -1], [0, 11], [-8.4, 0], [6, 7.6], [-6, -7.6]], 0.5);
      glow(g, L, [[0, -7.5], [2.3, 0], [0, 7.5], [-2.3, 0], [0, -7.5]], 0.6, L.sig);
      paint(g, pathOf([[0, -2.4], [2.2, 0], [0, 2.4], [-2.2, 0]]), c.metal, L, { d: 0.5, vol: 'r', lw: 0.5, brush: 0, rimW: 0.6 });
      g.fillStyle = L.rim; g.beginPath(); g.arc(0.5, -0.5, 0.55, 0, TAU); g.fill();
    },
  };

  // heaume à cimier de crin
  heads(P, box(-r * 2.5, -r * 2.0, r * 1.45, r * 1.5), 4.5, (g, e) => {
    const crest = pathOf([[r * 0.25, -r * 0.9], [-r * 0.2, -r * 1.55], [-r * 0.9, -r * 1.6], [-r * 1.75, -r * 1.25], [-r * 2.3, -r * 0.5, 1], [-r * 1.9, -r * 0.7], [-r * 2.0, -r * 0.05, 1], [-r * 1.4, -r * 0.6], [-r * 0.7, -r * 0.65]]);
    paint(g, crest, cape, L, { d: 1.6, vol: 'y', lw: 0.6, brush: 0.6, after: (g) => {
      for (let i = 0; i < 6; i++) line(g, [[r * 0.1 - i * 0.6, -r * (1.25 - i * 0.02)], [-r * (0.8 + i * 0.12), -r * (1.45 - i * 0.05)], [-r * (1.6 + i * 0.1), -r * (1.1 - i * 0.1)]], 0.35, i % 2 ? 'rgba(0,0,0,0.5)' : rgba(L.rim, 0.22));
    } });
    // couvre-nuque en mailles
    paint(g, [[-r * 0.95, r * 0.1], [-r * 0.2, r * 0.6], [-r * 0.1, r * 1.35, 1], [-r * 1.1, r * 1.15, 1]], c.metal, L, { d: 0.8, vol: 'x', lw: 0.5, brush: 0, after: (g) => mail(g, L, -r * 1.2, r * 0.1, 0, r * 1.4, 1.3) });
    const shell = new Path2D();
    shell.moveTo(-r * 0.95, r * 0.35); shell.bezierCurveTo(-r * 1.1, -r * 0.9, -r * 0.2, -r * 1.25, r * 0.45, -r * 1.02); shell.quadraticCurveTo(r * 1.1, -r * 0.7, r * 1.05, -r * 0.05);
    shell.lineTo(r * 1.12, r * 0.5); shell.quadraticCurveTo(r * 0.9, r * 1.05, r * 0.35, r * 1.05); shell.lineTo(-r * 0.2, r * 0.95); shell.quadraticCurveTo(-r * 0.85, r * 0.85, -r * 0.95, r * 0.35); shell.closePath();
    paint(g, shell, c.metal, L, { d: 1.8, vol: 'r', box: [-r, -r * 1.1, r * 1.1, r * 1.05], lw: 0.7, brush: 0.3, after: (g) => {
      spec(g, L, [[-r * 0.3, -r * 1.02], [r * 0.45, -r * 0.95], [r * 0.95, -r * 0.45]], 0.55, 0.7);
      // arête centrale du heaume
      line(g, [[-r * 0.7, -r * 0.75], [r * 0.2, -r * 1.05], [r * 0.9, -r * 0.6]], 0.6, 'rgba(0,0,0,0.5)');
      // bandeau frontal
      paint(g, [[-r * 0.95, -r * 0.1], [0, -r * 0.5], [r * 1.1, -r * 0.38], [r * 1.1, -r * 0.18], [0, -r * 0.32], [-r * 0.95, r * 0.06]], c.metal, L, { d: 0.6, vol: null, lw: 0.5, brush: 0 });
      rivets(g, L, [[-r * 0.6, -r * 0.18], [-r * 0.15, -r * 0.33], [r * 0.4, -r * 0.38]], 0.5);
      // fente de la visière, regard lumineux
      g.fillStyle = '#030205'; g.fill(pathOf([[r * 0.05, -r * 0.14, 1], [r * 1.12, -r * 0.12, 1], [r * 1.12, r * 0.13, 1], [r * 0.05, r * 0.1, 1]]));
      eye(g, L, r * 0.68, -r * 0.01, r * 0.28, r * 0.07 * e.open, e.tilt * 0.25, e.k);
      // couvre-joue ajouré
      for (let j = 0; j < 3; j++) line(g, [[r * (0.45 + j * 0.2), r * 0.32], [r * (0.45 + j * 0.2), r * 0.78]], 0.75, 'rgba(0,0,0,0.75)');
      line(g, [[r * 0.25, r * 0.15], [r * 0.25, r * 1.0]], 0.5, 'rgba(0,0,0,0.5)');
    } });
  });

  // épée : repère de la main, lame inclinée (-0,35) comme l'ancien squelette
  P.weapon = {
    box: box(-19, -20, 40, 13), bevel: 1.4,
    draw: (g) => {
      g.rotate(-0.35);
      const Lb = 36, W = 5;
      paint(g, [[-12, -2.2, 1], [-2, -2.2, 1], [-2, 2.2, 1], [-12, 2.2, 1]], c.body2, L, { d: 0.6, vol: 'y', lw: 0.5, brush: 0, after: (g) => { for (let j = 0; j < 4; j++) line(g, [[-11 + j * 2.4, -2], [-9.6 + j * 2.4, 2]], 0.45, 'rgba(0,0,0,0.6)'); } });
      paint(g, [[-12, 0, 1], [-14.5, -3, 1], [-17, 0, 1], [-14.5, 3, 1]], c.metal, L, { d: 0.5, vol: 'r', lw: 0.5, brush: 0, rimW: 0.6 });
      g.fillStyle = L.rim; g.beginPath(); g.arc(-14.5, 0, 0.9, 0, TAU); g.fill();
      // garde en croissant
      paint(g, [[-2, -W * 1.2], [1.5, -W * 0.6], [1.5, 0], [1.5, W * 0.6], [-2, W * 1.2, 1], [-0.5, W * 1.3, 1], [4, W * 0.6], [4, -W * 0.6], [-0.5, -W * 1.3, 1]], c.metal, L, { d: 0.6, vol: 'x', lw: 0.5, brush: 0, rimW: 0.6 });
      // lame : deux pans et gouttière, ébréchée
      const blade = pathOf([[3, -W / 2, 1], [16, -W / 2, 1], [17, -W / 2 + 0.8, 1], [18.5, -W / 2, 1], [2 + Lb * 0.82, -W / 2, 1], [2 + Lb, 0, 1], [2 + Lb * 0.82, W / 2, 1], [3, W / 2, 1]]);
      paint(g, blade, '#8e94a4', L, { d: 0.8, vol: 'y', box: [3, -W / 2, 2 + Lb, W / 2], lw: 0.55, brush: 0.15, rimW: 0.5, after: (g) => {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(3, 0, Lb, W);
        line(g, [[5, 0], [2 + Lb * 0.72, 0]], 0.7, 'rgba(0,0,0,0.6)');
      } });
      // tranchant de contre-jour
      glow(g, L, [[5, -W / 2 + 0.55], [15.5, -W / 2 + 0.55]], 0.55);
      glow(g, L, [[19, -W / 2 + 0.55], [2 + Lb * 0.82, -W / 2 + 0.55], [2 + Lb - 1.2, 0]], 0.55);
    },
  };
  return P;
};

// ------------------------------------------------------------------ Colosse (brute)

export const brute: Painter = (c, L) => {
  const T = c.torso, sw = c.sw, hw = c.hw, aw = c.aw, A = c.arm / 2, lw = c.lw, th = c.leg / 2, r = c.headR;
  const skin = mix(c.skin, '#9a8e88', 0.3), leather = c.body2, iron = c.metal;
  const crack = (g, pts) => glow(g, L, pts, 0.75);
  const P = base(c, L, { leg: c.body, shin: leather, boot: iron, arm: skin, fore: skin, glove: iron, body: skin }, {
    bigFoot: true, knee: true,
    thighDeco: (g) => { folds(g, L, [[[-lw * 0.2, th * 0.1], [-lw * 0.3, th * 0.8]], [[lw * 0.3, th * 0.2], [lw * 0.2, th * 0.7]]], 0.15); },
    shinDeco: (g) => {
      // bandes de cuir enroulées
      for (let j = 0; j < 4; j++) { const y = th * (0.25 + j * 0.18); paint(g, [[-lw * 0.6, y], [lw * 0.6, y - 1.6, 1], [lw * 0.6, y + 1.4, 1], [-lw * 0.6, y + 3, 1]], leather, L, { d: 0.6, vol: null, lw: 0.45, brush: 0.2, rimW: 0.7 }); }
    },
    upperDeco: (g) => {
      // musculature et veine lumineuse
      line(g, [[-aw * 0.15, A * 0.15], [-aw * 0.2, A * 0.8]], 0.8, 'rgba(0,0,0,0.45)');
      crack(g, [[-aw * 0.05, A * 0.12], [aw * 0.15, A * 0.32], [aw * 0.05, A * 0.5], [aw * 0.25, A * 0.72]]);
    },
    foreDeco: (g) => {
      crack(g, [[-aw * 0.1, A * 0.15], [aw * 0.12, A * 0.3], [-aw * 0.05, A * 0.45]]);
      // manchette de fer cloutée au poignet
      paint(g, [[-aw * 0.6, A * 0.62], [aw * 0.6, A * 0.6, 1], [aw * 0.55, A + 2, 1], [-aw * 0.55, A + 2, 1]], iron, L, { d: 0.9, vol: 'x', box: [-aw * 0.5, A * 0.6, aw * 0.5, A], lw: 0.55, brush: 0.2 });
      spec(g, L, [[aw * 0.42, A * 0.65], [aw * 0.38, A]], 0.5);
      rivets(g, L, [[-aw * 0.25, A * 0.72], [aw * 0.1, A * 0.72], [-aw * 0.25, A * 0.9], [aw * 0.1, A * 0.9]], 0.7);
    },
  });

  // poings : gantelets cloutés (pas de pièce « hand » : le poing est l'arme)
  const fr = aw * 0.68;
  P.weapon = {
    box: box(-fr * 1.6, -fr * 1.6, fr * 2.2, fr * 1.7), bevel: fr * 0.5,
    draw: (g) => {
      g.translate(0.5, 1.5);
      const p = pathOf([[-fr * 0.95, -fr * 0.55], [fr * 0.2, -fr * 1.05], [fr * 1.05, -fr * 0.55], [fr * 1.15, fr * 0.45], [fr * 0.3, fr * 1.0], [-fr * 0.85, fr * 0.75]]);
      paint(g, p, iron, L, { d: fr * 0.3, vol: 'r', box: [-fr, -fr, fr, fr], lw: 0.7, after: (g) => {
        for (let i = 0; i < 3; i++) line(g, [[fr * 0.8, -fr * 0.4 + i * fr * 0.42], [fr * 0.2, -fr * 0.3 + i * fr * 0.44]], fr * 0.12, 'rgba(0,0,0,0.6)');
        spec(g, L, [[fr * 0.2, -fr * 0.95], [fr * 0.95, -fr * 0.5], [fr * 1.05, fr * 0.3]], 0.55, 0.65);
      } });
      // clous d'os sur les jointures
      for (let j = 0; j < 3; j++) {
        const y = -fr * 0.45 + j * fr * 0.48;
        paint(g, [[fr * 0.95, y - fr * 0.18, 1], [fr * 1.75, y + fr * 0.02, 1], [fr * 1.0, y + fr * 0.22, 1]], BONE, L, { d: 0.4, vol: null, lw: 0.45, brush: 0, rimW: 0.6 });
      }
      crack(g, [[-fr * 0.4, -fr * 0.1], [fr * 0.1, fr * 0.2], [fr * 0.05, fr * 0.55]]);
    },
  };

  // buste nu voûté : côtes lumineuses, fissure, collier de fer, sangle
  P.torso = {
    box: box(-sw * 0.75, -T - 8, sw * 0.75, 6), bevel: 7,
    draw: (g) => {
      const bust = bustPath(c, T);
      paint(g, bust, skin, L, { d: 3.6, vol: 'x', box: [-sw * 0.55, -T, sw * 0.55, 0], seed: 11, after: (g) => {
        // pectoraux, abdominaux
        line(g, [[sw * 0.05, -T * 0.9], [sw * 0.25, -T * 0.6], [sw * 0.55, -T * 0.62]], 0.9, 'rgba(0,0,0,0.5)');
        line(g, [[sw * 0.25, -T * 0.45], [sw * 0.22, -T * 0.12]], 0.7, 'rgba(0,0,0,0.4)');
        // côtes lumineuses (sous la peau)
        for (let j = 0; j < 3; j++) {
          const y = -T * 0.55 + j * 4.6;
          g.save(); g.globalAlpha = 0.85; glow(g, L, [[sw * 0.08, y - 1], [sw * 0.3, y - 0.6], [sw * 0.46, y + 2.2]], 0.8); g.restore();
        }
        // fissure du dos à la hanche
        glow(g, L, [[-sw * 0.25, -T * 0.85], [-sw * 0.12, -T * 0.6], [-sw * 0.2, -T * 0.38], [-sw * 0.02, -T * 0.18]], 0.8, L.sig);
        g.save(); g.globalAlpha = 0.8; glow(g, L, [[-sw * 0.12, -T * 0.6], [sw * 0.02, -T * 0.68]], 0.5); g.restore();
        // cicatrices
        line(g, [[sw * 0.32, -T * 0.32], [sw * 0.45, -T * 0.22]], 0.5, 'rgba(0,0,0,0.6)');
      } });
      belt(g, c, L, leather, iron);
      // collier de fer
      paint(g, [[-sw * 0.38, -T - 0.5], [-sw * 0.3, -T - 6], [sw * 0.2, -T - 6.5], [sw * 0.36, -T - 1.5, 1], [0, -T + 0.5]], iron, L, { d: 1, vol: 'y', lw: 0.6, brush: 0.2 });
      spec(g, L, [[-sw * 0.2, -T - 5.8], [sw * 0.25, -T - 5.6]], 0.5);
    },
  };
  // pagne de cuir
  const loin = (seed) => flapPart(c, L, leather, 16, (g) => {
    stitches(g, L, [[-hw * 0.3, 2], [-hw * 0.3, 13]]);
    rivets(g, L, [[0, 2.5]], 0.8);
  }, seed);
  P.flapB = loin(13); P.flapF = loin(17);

  // épaulière massive en deux plaques, clous
  const pw = aw * 1.12, ph = aw * 0.78; // plus basse que l'ancienne : la tête voûtée reste lisible
  P.pauldron = {
    box: box(-pw - 2, -ph * 1.5 - 2, pw + 2, ph * 1.3 + 2), bevel: 5,
    draw: (g) => {
      paint(g, [[-pw, 0.5], [-pw * 0.6, -ph * 0.85], [pw * 0.4, -ph * 1.0], [pw, -ph * 0.15], [pw * 0.85, ph * 0.5, 1], [-pw * 0.9, ph * 0.55, 1]], iron, L, { d: 2, vol: 'r', lw: 0.7, brush: 0.3, after: (g) => {
        spec(g, L, [[-pw * 0.4, -ph * 0.7], [pw * 0.35, -ph * 0.85], [pw * 0.85, -ph * 0.2]], 0.55, 0.7);
        line(g, [[-pw * 0.2, -ph * 0.5], [pw * 0.1, -ph * 0.1]], 0.5, 'rgba(0,0,0,0.6)');
      } });
      const y = ph * 0.35;
      paint(g, [[-pw * 0.92, y], [0, y - ph * 0.12], [pw * 0.88, y, 1], [pw * 0.8, y + ph * 0.6, 1], [0, y + ph * 0.52], [-pw * 0.86, y + ph * 0.6, 1]], iron, L, { d: 1, vol: 'y', lw: 0.6, brush: 0.2 });
      rivets(g, L, [[-pw * 0.55, ph * 0.1], [0, -ph * 0.1], [pw * 0.5, ph * 0.05], [-pw * 0.4, ph * 0.7], [pw * 0.4, ph * 0.7]], 0.9);
    },
  };

  // tête chauve, petite, cornes, muselière de fer, regard sous l'arcade
  heads(P, box(-r * 1.9, -r * 2.5, r * 1.6, r * 1.5), 3.5, (g, e) => {
    for (const [x, sgn, s] of [[-r * 0.25, 1, 0.85], [r * 0.2, -1, 1]]) {
      const horn = pathOf([[x - r * 0.35, -r * 0.55], [x - r * 1.05 * sgn * s, -r * 1.4], [x - r * 0.25 * sgn, -r * 2.25 * s, 1], [x - r * 0.25 * sgn + r * 0.05, -r * 1.35], [x + r * 0.35, -r * 0.7]]);
      paint(g, horn, BONE, L, { d: 0.8, vol: 'x', lw: 0.6, brush: 0.2, after: (g) => { for (let i = 0; i < 3; i++) line(g, [[x - r * 0.35, -r * (0.85 + i * 0.3)], [x + r * 0.3, -r * (0.95 + i * 0.3)]], 0.35, 'rgba(0,0,0,0.5)'); } });
    }
    const skull = pathOf([[-r * 0.95, r * 0.2], [-r * 0.9, -r * 0.75], [0, -r * 1.05], [r * 0.8, -r * 0.65], [r * 1.05, -r * 0.1, 1], [r * 0.95, r * 0.35], [r * 1.0, r * 0.95], [r * 0.2, r * 1.1], [-r * 0.6, r * 0.85]]);
    paint(g, skull, skin, L, { d: 1.3, vol: 'r', box: [-r, -r, r, r], lw: 0.65, brush: 0.4, after: (g) => {
      // arcade lourde et œil enfoncé
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fill(pathOf([[r * 0.15, -r * 0.18], [r * 1.05, -r * 0.2], [r * 0.95, r * 0.25], [r * 0.25, r * 0.22]]));
      line(g, [[r * 0.1, -r * 0.3], [r * 1.08, -r * 0.2]], 1.0, 'rgba(0,0,0,0.75)');
      eye(g, L, r * 0.62, r * 0.02, r * 0.22, r * 0.11 * e.open, -0.1 + e.tilt, e.k);
      // fissure lumineuse du crâne
      glow(g, L, [[-r * 0.6, -r * 0.55], [-r * 0.12, -r * 0.25], [-r * 0.32, r * 0.3]], 0.55);
    } });
    // muselière de fer, fente lumineuse
    paint(g, [[r * 0.1, r * 0.42], [r * 1.1, r * 0.32, 1], [r * 1.0, r * 0.95, 1], [r * 0.15, r * 1.1, 1]], c.metal, L, { d: 0.6, vol: 'y', lw: 0.55, brush: 0, after: (g) => {
      spec(g, L, [[r * 0.3, r * 0.42], [r * 1.0, r * 0.36]], 0.55);
    } });
    glow(g, L, [[r * 0.35, r * 0.66], [r * 0.95, r * 0.6]], 0.55 + 0.2 * (e.k - 1) * 2);
    rivets(g, L, [[r * 0.25, r * 0.55], [r * 0.25, r * 0.9]], 0.45);
  });
  return P;
};

// ------------------------------------------------------------------ Ombre arcanique (shade)

export const shade: Painter = (c, L) => {
  const T = c.torso, sw = c.sw, hw = c.hw, aw = c.aw, A = c.arm / 2, r = c.headR;
  const cloth = c.body, dark = c.body2;
  const P = base(c, L, { leg: cloth, shin: cloth, boot: cloth, arm: cloth, fore: cloth, glove: c.skin, body: cloth }, {
    upperDeco: (g) => folds(g, L, [[[0, A * 0.1], [-aw * 0.15, A * 0.85]]], 0.2),
  });
  // manche évasée en lambeaux, par-dessus l'avant-bras (déborde de la forme du membre)
  P.fore = over(P.fore, [-aw * 1.2, -aw, aw * 1.3, A + 5], (g) => {
    paint(g, [[-aw * 0.55, A * 0.35], [aw * 0.55, A * 0.3], [aw * 1.05, A + 2.5, 1], [aw * 0.45, A + 0.8, 1], [aw * 0.05, A + 3.8, 1], [-aw * 0.35, A + 1.2, 1], [-aw * 0.95, A + 3, 1]], dark, L, { d: 0.8, vol: 'x', box: [-aw, A * 0.3, aw, A + 3], lw: 0.5, brush: 0.3 });
    glow(g, L, [[-aw * 0.5, A * 0.45], [aw * 0.5, A * 0.4]], 0.4);
  });
  // main griffue d'ombre
  const hr = aw * 0.55;
  P.hand = over(fistPart(L, hr, c.skin), [-hr * 1.5, -hr * 1.4, hr * 2.4, hr * 2], (g) => {
    for (let i = 0; i < 3; i++) paint(g, [[hr * 0.7, -hr * 0.3 + i * hr * 0.45, 1], [hr * 1.9, hr * 0.15 + i * hr * 0.5, 1], [hr * 0.65, hr * 0.05 + i * hr * 0.45, 1]], c.skin, L, { d: 0.2, vol: null, lw: 0.35, brush: 0, rimW: 0.5 });
  });

  P.torso = {
    box: box(-sw * 0.8, -T - 8, sw * 0.8, 6), bevel: 5,
    draw: (g) => {
      paint(g, bustPath(c, T), cloth, L, { d: 3, vol: 'x', box: [-sw * 0.55, -T, sw * 0.55, 0], seed: 11, after: (g) => {
        folds(g, L, [[[-sw * 0.2, -T * 0.9], [-sw * 0.3, -T * 0.3]], [[sw * 0.3, -T * 0.7], [sw * 0.2, -T * 0.15]]], 0.2);
      } });
      // étole sombre croisée, runes cousues
      paint(g, [[-sw * 0.05, -T - 2], [sw * 0.4, -T - 1], [sw * 0.25, -T * 0.4], [sw * 0.15, 0, 1], [-sw * 0.05, 0, 1], [0, -T * 0.5]], dark, L, { d: 1, vol: 'x', lw: 0.55, brush: 0.3 });
      for (let i = 0; i < 3; i++) {
        const y = -T * 0.78 + i * T * 0.22, x = sw * 0.17 - i * 0.6;
        glow(g, L, [[x - 1.2, y - 1.2], [x + 1.2, y], [x - 1, y + 1.4]], 0.45);
      }
      // ceinture de cordes
      paint(g, [[-hw * 0.64, -6], [hw * 0.66, -6.4], [hw * 0.68, -2.5], [-hw * 0.64, -2]], dark, L, { d: 0.6, vol: 'y', lw: 0.5, brush: 0 });
      line(g, [[hw * 0.3, -3], [hw * 0.36, 6], [hw * 0.2, 11]], 0.9, 'rgba(0,0,0,0.75)');
      glowDot(g, hw * 0.2, 11.5, 1.6, L.sig, 0.8);
      // col haut qui encadre la capuche
      paint(g, [[-sw * 0.45, -T + 2], [-sw * 0.42, -T - 6.5], [0, -T - 3.5], [sw * 0.35, -T - 5.5], [sw * 0.42, -T + 2], [0, -T]], dark, L, { d: 1.2, vol: 'x', lw: 0.55, brush: 0.3 });
    },
  };
  // traîne flottante qui se dissout
  P.robe = robePart(c, L, cloth, { float: true, seed: 21 });

  // capuche pointue, visage de néant, deux yeux
  heads(P, box(-r * 1.6, -r * 2.4, r * 1.6, r * 1.6), 4.5, (g, e) => {
    const hood = pathOf([[-r * 1.25, r * 1.1, 1], [-r * 1.05, r * 0.5], [-r * 1.5, -r * 1.3], [r * 0.2, -r * 1.55], [-r * 0.25, -r * 2.2, 1], [r * 0.55, -r * 1.35], [r * 1.45, -r * 0.6], [r * 1.15, r * 0.6], [r * 1.3, r * 1.2, 1], [r * 0.8, r * 0.95, 1], [r * 0.55, r * 1.35, 1], [r * 0.1, r * 1.05, 1], [-r * 0.4, r * 1.4, 1], [-r * 0.7, r * 1.05, 1]]);
    paint(g, hood, dark, L, { d: 1.8, vol: 'r', box: [-r * 1.3, -r * 1.5, r * 1.3, r * 1.2], lw: 0.7, brush: 0.5, after: (g) => {
      folds(g, L, [[[-r * 0.8, -r * 0.6], [-r * 0.5, r * 0.4]], [[-r * 0.2, -r * 1.3], [-r * 0.6, -r * 0.4]]], 0.2);
    } });
    // ouverture : bord de capuche éclairé, puis néant
    const hole = pathOf([[r * 0.38 - r * 0.6, r * 0.1], [r * 0.25, -r * 0.75], [r * 1.0, -r * 0.4], [r * 1.05, r * 0.6], [r * 0.4, r * 0.95]]);
    g.save(); g.lineWidth = 0.9; g.strokeStyle = rgba(L.rim, 0.35); g.translate(0.4, -0.2); g.stroke(hole); g.restore();
    g.fillStyle = '#020104'; g.fill(hole);
    const a = e.tilt;
    eye(g, L, r * 0.34, -r * 0.02, r * 0.2, r * 0.08 * e.open, 0.25 + a, e.k);
    eye(g, L, r * 0.78, 0, r * 0.15, r * 0.07 * e.open, -0.15 - a, e.k * 0.9);
  });

  // orbe d'arcane : cœur blanc, sphère colorée nette, anneaux, aucune auréole large
  P.weapon = {
    box: box(-8, -1, 13, 19), bevel: 3,
    draw: (g) => {
      const x = 2.5, y = 8.5, R = 6;
      glowDot(g, x, y, R * 1.45, L.sig, 0.55);
      const gr = g.createRadialGradient(x - 1.2, y - 1.4, 0.3, x, y, R);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, L.rim); gr.addColorStop(0.85, mix(L.sig, '#06070c', 0.35)); gr.addColorStop(1, mix(L.sig, '#06070c', 0.6));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, TAU); g.fill();
      // volutes intérieures
      g.save(); g.beginPath(); g.arc(x, y, R, 0, TAU); g.clip();
      line(g, [[x - 4, y + 1], [x - 1, y - 1.5], [x + 2, y + 0.5], [x + 4.5, y - 2]], 0.5, rgba('#ffffff', 0.55));
      line(g, [[x - 3, y + 3.5], [x + 1, y + 2], [x + 4, y + 3.5]], 0.45, rgba(L.sig, 0.8));
      g.restore();
      g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 0.5; g.beginPath(); g.arc(x, y, R, 0, TAU); g.stroke();
      // anneau runique incliné
      g.save(); g.translate(x, y); g.rotate(-0.4);
      g.strokeStyle = L.rim; g.lineWidth = 0.5; g.setLineDash([1.2, 0.8]); g.beginPath(); g.ellipse(0, 0, R * 1.55, R * 0.45, 0, 0, TAU); g.stroke();
      g.restore();
    },
  };
  return P;
};

// ------------------------------------------------------------------ Veilleur maudit (shadeElite)

export const shadeElite: Painter = (c, L) => {
  const T = c.torso, sw = c.sw, hw = c.hw, aw = c.aw, A = c.arm / 2, lw = c.lw, th = c.leg / 2, r = c.headR;
  const robe = c.body, dark = c.body2, bone = mix(c.skin, '#ffffff', 0.6), iron = c.metal;
  const P = base(c, L, { leg: dark, shin: dark, boot: iron, arm: robe, fore: dark, glove: bone, body: robe }, {
    shinDeco: (g) => { for (let j = 0; j < 3; j++) line(g, [[-lw * 0.5, th * (0.3 + j * 0.2)], [lw * 0.5, th * (0.28 + j * 0.2)]], 0.8, 'rgba(0,0,0,0.6)'); },
    upperDeco: (g) => folds(g, L, [[[aw * 0.1, A * 0.1], [-aw * 0.1, A * 0.9]]], 0.2),
    foreDeco: (g) => {
      // os de l'avant-bras visibles par une déchirure
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fill(pathOf([[-aw * 0.3, A * 0.45], [aw * 0.35, A * 0.5], [aw * 0.25, A * 0.95], [-aw * 0.25, A * 0.9]]));
      line(g, [[-aw * 0.1, A * 0.5], [-aw * 0.05, A * 0.92]], 0.9, mix(bone, '#06070c', 0.55));
      line(g, [[aw * 0.15, A * 0.52], [aw * 0.12, A * 0.92]], 0.7, mix(bone, '#06070c', 0.55));
    },
  });
  // main squelettique
  const hr = aw * 0.55;
  P.hand = over(fistPart(L, hr, bone), [-hr * 1.5, -hr * 1.4, hr * 2.2, hr * 1.8], (g) => {
    for (let i = 0; i < 3; i++) line(g, [[hr * 0.2, -hr * 0.35 + i * hr * 0.42], [hr * 0.95, -hr * 0.3 + i * hr * 0.44], [hr * 1.25, hr * 0.05 + i * hr * 0.44]], 0.45, 'rgba(0,0,0,0.65)');
  });
  P.foot = footPart(L, lw, iron, { deco: (g) => {
    for (let i = 0; i < 3; i++) line(g, [[lw * (0.5 + i * 0.3), -lw * 0.2], [lw * (0.6 + i * 0.32), lw * 0.5]], 0.5, 'rgba(0,0,0,0.6)');
    spec(g, L, [[lw * 0.5, -lw * 0.3], [lw * 1.4, lw * 0.1]], 0.4);
  } });

  P.torso = {
    box: box(-sw * 0.8, -T - 9, sw * 0.8, 6), bevel: 5,
    draw: (g) => {
      paint(g, bustPath(c, T), robe, L, { d: 3, vol: 'x', box: [-sw * 0.55, -T, sw * 0.55, 0], seed: 11, after: (g) => {
        folds(g, L, [[[-sw * 0.25, -T * 0.85], [-sw * 0.32, -T * 0.2]], [[sw * 0.35, -T * 0.55], [sw * 0.25, -T * 0.05]]], 0.2);
      } });
      // cage thoracique d'os sur la poitrine, braise au cœur
      g.fillStyle = 'rgba(0,0,0,0.65)'; g.fill(pathOf([[sw * 0.0, -T * 0.92], [sw * 0.5, -T * 0.82], [sw * 0.5, -T * 0.42], [sw * 0.05, -T * 0.4]]));
      glowDot(g, sw * 0.22, -T * 0.64, 3.2, L.sig, 0.75);
      for (let j = 0; j < 4; j++) {
        const y = -T * 0.86 + j * T * 0.12;
        paint(g, [[sw * 0.02, y], [sw * 0.3, y - 1.2], [sw * 0.52, y + 1.4], [sw * 0.5, y + 2.5], [sw * 0.3, y + 0.6], [sw * 0.04, y + 1.3]], bone, L, { d: 0.4, vol: null, lw: 0.4, brush: 0, rimW: 0.7 });
      }
      paint(g, [[sw * 0.0, -T * 0.95, 1], [sw * 0.08, -T * 0.95, 1], [sw * 0.08, -T * 0.38, 1], [sw * 0.0, -T * 0.38, 1]], bone, L, { d: 0.3, vol: null, lw: 0.4, brush: 0, rimW: 0.5 });
      // chaîne en bandoulière
      for (let i = 0; i < 9; i++) {
        const t = i / 8, x = -sw * 0.45 + t * sw * 0.9, y = -T + 1 + t * T * 0.75;
        g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 0.9; g.beginPath(); g.ellipse(x, y, 1.3, 0.8, 0.7, 0, TAU); g.stroke();
        g.strokeStyle = rgba(L.rim, 0.45); g.lineWidth = 0.35; g.beginPath(); g.ellipse(x, y, 1.3, 0.8, 0.7, -0.8, 0.6); g.stroke();
      }
      belt(g, c, L, dark, iron);
      // col en lambeaux qui monte derrière le crâne
      paint(g, [[-sw * 0.48, -T + 2], [-sw * 0.5, -T - 8, 1], [-sw * 0.25, -T - 5], [-sw * 0.05, -T - 7, 1], [sw * 0.1, -T - 3.5], [sw * 0.38, -T - 4.5, 1], [sw * 0.42, -T + 2], [0, -T]], dark, L, { d: 1.2, vol: 'x', lw: 0.55, brush: 0.3 });
    },
  };
  P.robe = robePart(c, L, robe, { seed: 31, deco: (g) => {
    // glyphes de malédiction près de l'ourlet
    const y = c.leg * 0.72;
    const RUNES = [[[0, 0], [0, -3], [1.4, -1.6]], [[0, -3], [1.2, 0], [2.2, -3]], [[0, -1.5], [2, -1.5], [1, -3.2], [1, 0]], [[0, 0], [1, -3], [2, 0]]];
    RUNES.forEach((rn, i) => { const x = -hw * 0.95 + i * hw * 0.58; glow(g, L, rn.map(([a, b]) => [x + a, y + b]), 0.4, L.sig); });
    line(g, [[-hw * 1.1, y + 2.5], [hw * 1.0, y + 2]], 0.5, rgba(L.rim, 0.3));
  } });

  // crâne cornu
  heads(P, box(-r * 1.9, -r * 2.8, r * 1.8, r * 1.5), 4, (g, e) => {
    // cornes noires (arrière, puis avant)
    paint(g, [[-r * 0.3, -r * 0.8], [-r * 1.6, -r * 1.7], [-r * 1.2, -r * 2.7, 1], [-r * 0.9, -r * 1.75], [r * 0.15, -r * 0.95]], dark, L, { d: 0.9, vol: 'x', lw: 0.6, brush: 0.2, after: (g) => { for (let i = 0; i < 4; i++) line(g, [[-r * (0.4 + i * 0.25), -r * (0.95 + i * 0.25)], [-r * (0.1 + i * 0.3), -r * (1.1 + i * 0.25)]], 0.35, rgba(L.rim, 0.25)); } });
    const skull = new Path2D();
    skull.ellipse(0, 0, r * 0.95, r, 0, 0, TAU);
    paint(g, skull, bone, L, { d: 1.5, vol: 'r', box: [-r, -r, r, r], lw: 0.65, brush: 0.4, after: (g) => {
      line(g, [[-r * 0.5, -r * 0.7], [-r * 0.2, -r * 0.35], [-r * 0.35, 0]], 0.5, 'rgba(0,0,0,0.6)'); // fêlure
      g.fillStyle = '#060204'; g.beginPath(); g.ellipse(r * 0.45, -r * 0.05, r * 0.28, r * 0.32, 0, 0, TAU); g.fill();
      eye(g, L, r * 0.48, -r * 0.03, r * 0.13, r * 0.13 * Math.max(0.5, e.open), 0, e.k);
      g.fillStyle = '#060204'; g.fill(pathOf([[r * 0.85, r * 0.25, 1], [r * 0.98, r * 0.48, 1], [r * 0.78, r * 0.48, 1]]));
      line(g, [[-r * 0.85, r * 0.35], [r * 0.2, r * 0.45]], 0.6, 'rgba(0,0,0,0.5)'); // pommette
    } });
    // mâchoire et dents
    paint(g, [[r * 0.12, r * 0.55, 1], [r * 0.82, r * 0.5, 1], [r * 0.78, r * 0.9], [r * 0.45, r * 1.05], [r * 0.15, r * 0.9]], bone, L, { d: 0.6, vol: 'y', lw: 0.55, brush: 0.2, after: (g) => {
      for (let i = 0; i < 4; i++) line(g, [[r * (0.25 + i * 0.15), r * 0.52], [r * (0.25 + i * 0.15), r * 0.76]], 0.4, 'rgba(0,0,0,0.75)');
    } });
    paint(g, [[r * 0.2, -r * 0.9], [r * 0.6, -r * 2.0], [r * 1.45, -r * 2.3, 1], [r * 0.95, -r * 1.35], [r * 0.85, -r * 0.6]], dark, L, { d: 0.9, vol: 'x', lw: 0.6, brush: 0.2, after: (g) => { for (let i = 0; i < 4; i++) line(g, [[r * (0.35 + i * 0.2), -r * (0.95 + i * 0.3)], [r * (0.8 + i * 0.15), -r * (0.85 + i * 0.3)]], 0.35, rgba(L.rim, 0.25)); } });
    // couronne de fissures lumineuses entre les cornes
    glow(g, L, [[-r * 0.1, -r * 0.95], [r * 0.05, -r * 0.6], [-r * 0.1, -r * 0.35]], 0.45, L.sig);
  });

  // faux : repère de la main, tournée de -1,35 comme l'ancien squelette (lame au sommet, vers l'avant)
  P.weapon = {
    box: box(-12, -64, 54, 36), bevel: 1.6,
    draw: (g) => {
      g.rotate(-1.35);
      paint(g, [[-30, -1.6, 1], [52, -1.9, 1], [52, 1.9, 1], [-30, 1.6, 1]], '#3a2a20', L, { d: 0.6, vol: 'y', lw: 0.55, brush: 0.4, after: (g) => {
        line(g, [[-20, 0.2], [-14, -0.4], [6, 0.3], [30, -0.2]], 0.35, 'rgba(0,0,0,0.5)');
      } });
      for (const x of [-28, -4, 44]) {
        paint(g, [[x, -2.6, 1], [x + 3, -2.6, 1], [x + 3, 2.6, 1], [x, 2.6, 1]], iron, L, { d: 0.3, vol: null, lw: 0.4, brush: 0, rimW: 0.6 });
      }
      // talon pointu
      paint(g, [[-30, -1.8, 1], [-35, 0, 1], [-30, 1.8, 1]], iron, L, { d: 0.3, vol: null, lw: 0.4, brush: 0, rimW: 0.5 });
      g.translate(50, 0); g.scale(1.15, 1.15);
      // lame courbe, dos épais, crans
      const blade = new Path2D();
      blade.moveTo(-1, -3); blade.quadraticCurveTo(12, 16, -15, 35); blade.lineTo(-13, 31); blade.quadraticCurveTo(0, 18, -5, 2); blade.lineTo(-6, 1); blade.lineTo(-4.5, -0.5); blade.closePath();
      paint(g, blade, '#c4c8d2', L, { d: 1, vol: 'x', lw: 0.6, brush: 0.2, rimW: 0.7, after: (g) => {
        line(g, [[1, 2], [3, 12], [-4, 24]], 0.5, 'rgba(0,0,0,0.6)');
      } });
      // fil lumineux sur le tranchant intérieur
      glow(g, L, [[-4.4, 3], [-1.8, 14], [-12, 31.5]], 0.7);
      // ornement de fixation (crâne miniature)
      paint(g, pathOf([[-3.5, -3.5], [3.5, -3.5], [4, 2], [-4, 2]]), iron, L, { d: 0.4, vol: 'r', lw: 0.45, brush: 0, rimW: 0.6 });
      g.fillStyle = L.rim; g.beginPath(); g.arc(0.5, -0.8, 0.7, 0, TAU); g.fill();
    },
  };
  return P;
};

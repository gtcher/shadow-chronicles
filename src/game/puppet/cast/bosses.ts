// @ts-nocheck
/**
 * Les cinq boss — pantins peints (piste B « ombres à contre-jour »). Ils font 250–310 px en jeu : plus de
 * détail que les ennemis (plaques, rivets, runes, veines, déchirures), mais toujours une silhouette sombre
 * lisible, un liseré de contre-jour net et des lueurs serrées (pas de halo flou).
 *
 *   cendrefer  : Capitaine Cendrefer — hallebarde, heaume à cornes, épaulière à pointes, veines de braise, cape.
 *   matriarche : Matriarche lunaire — flotte (robe), couronne de glace, bâton à croissant, éclats en orbite.
 *   arbitre    : Arbitre de l'Éclipse — flotte (robe), masque, halo, lames en orbite, pas de mains.
 *   souverain  : Souverain des Ruines — espadon, couronne, épaulière à pointes, veines dorées, cape.
 *   juge       : Juge Pourpre — espadon, crâne à cornes, robe, cape.
 *
 * Repères des pièces : parts.ts ; accessoires (shard, blade, halo) : bones.ts → solveHumanoid.
 */
import { box, limbPart, footPart, fistPart, paint, pathOf, line, mix, rgba, glowLine, TAU, type Parts, type Painter, type PartDef } from '../parts';

const DARK = '#06070c';

/** Bornes d'un rectangle tourné de `a` (pour les armes peintes dans un repère tourné). */
function rotBox(x0, y0, x1, y1, a, m = 2) {
  const c = Math.cos(a), s = Math.sin(a);
  const xs = [], ys = [];
  for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { xs.push(x * c - y * s); ys.push(x * s + y * c); }
  return box(Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m);
}

/** Lueur serrée (flou de ~1 unité) : trait net sans halo baveux. */
function glow(g, pts, w, col, blur = 1.1) { glowLine(g, pts, w, col, blur); }
function glowFill(g, path, col, blur = 1) {
  const t = g.getTransform();
  g.save(); g.shadowColor = col; g.shadowBlur = blur * Math.hypot(t.a, t.b); g.fillStyle = col; g.fill(path instanceof Path2D ? path : pathOf(path)); g.restore();
}
function dot(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }

/** Pièce + dessin par-dessus (non clippé), boîte élargie. */
function over(p: PartDef, fn: (g) => void, b?: number[]): PartDef {
  return { box: b ? box(Math.min(p.box[0], b[0]), Math.min(p.box[1], b[1]), Math.max(p.box[2], b[2]), Math.max(p.box[3], b[3])) : p.box, bevel: p.bevel, draw: (g) => { p.draw(g); fn(g); } };
}

/** Œil lumineux en amande selon l'expression. */
function eye(g, x, y, rx, ry, col, ex, tilt = -0.1) {
  const k = ex === 'angry' ? 1.25 : ex === 'hurt' ? 0.75 : 1;
  const sy = ex === 'hurt' ? 0.45 : ex === 'angry' ? 0.8 : 1;
  const t = ex === 'angry' ? tilt + 0.25 : tilt;
  const p = new Path2D(); p.ellipse(x, y, rx * k, ry * sy, t, 0, TAU);
  glowFill(g, p, col, 1.2);
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(x + rx * 0.15, y, rx * k * 0.45, ry * sy * 0.4, t, 0, TAU); g.fill();
}

// =========================================================================== base commune
interface Opts {
  armored?: boolean;
  /** Veines lumineuses (braise / or). */
  veins?: string;
  head: (g, ex: string) => void;
  headBox: number[];
  weapon?: PartDef;
  /** Décor du buste (par-dessus la base). */
  chest?: (g) => void;
  sleeveCol?: string;
  /** Main remplacée (arbitre) : dessin au bout de l'avant-bras. */
  noHand?: (g, A: number, aw: number) => void;
}

function bossParts(c, L, o: Opts): Parts {
  const th = c.leg / 2, T = c.torso, A = c.arm / 2, aw = c.aw, lw = c.lw, sw = c.sw, hw = c.hw, shX = sw * 0.5;
  const body = String(c.body), body2 = String(c.body2), metal = String(c.metal), bone = String(c.skin), capeC = String(c.cape ?? c.body2);
  const P: Parts = {};
  const vein = o.veins;

  // ---------------------------------------------------------------- jambes
  if (!c.float) {
    P.thigh = limbPart(L, th, lw * 1.22, lw * 0.86, c.robe ? body2 : body, { back: lw * 0.12, seed: 3,
      deco: (g) => {
        if (o.armored) { // tassette de cuisse
          paint(g, [[-lw * 0.7, th * 0.05], [lw * 0.7, th * 0.02], [lw * 0.6, th * 0.55], [-lw * 0.6, th * 0.6]], metal, L, { d: 1.2, vol: 'x', lw: 0.6, brush: 0.2 });
          line(g, [[-lw * 0.55, th * 0.3], [lw * 0.6, th * 0.27]], 0.5, rgba(L.rim, 0.35));
        }
        if (vein) glow(g, [[lw * 0.1, th * 0.62], [-lw * 0.15, th * 0.78], [lw * 0.05, th * 0.95]], 0.55, vein);
      } });
    const shin = limbPart(L, th, lw * 0.94, lw * 0.66, body, { back: lw * 0.2, seed: 5, joint: true,
      deco: (g) => {
        if (o.armored || c.robe) { // jambière
          paint(g, [[-lw * 0.62, th * 0.12], [lw * 0.6, th * 0.1], [lw * 0.48, th + 2], [-lw * 0.5, th + 2]], metal, L, { d: 1.4, vol: 'x', box: [-lw * 0.6, 0, lw * 0.6, th], lw: 0.6, brush: 0.3 });
          line(g, [[lw * 0.08, th * 0.15], [lw * 0.02, th * 0.9]], 0.8, rgba(L.rim, 0.4));
          if (vein) glow(g, [[-lw * 0.3, th * 0.5], [-lw * 0.05, th * 0.62], [-lw * 0.2, th * 0.8]], 0.5, vein);
        }
      } });
    P.shin = o.armored ? over(shin, (g) => { // genouillère à arête
      const k = pathOf([[-lw * 0.5, -lw * 0.35], [lw * 0.2, -lw * 0.62], [lw * 0.8, -lw * 0.1], [lw * 0.85, lw * 0.4, 1], [lw * 0.15, lw * 0.6], [-lw * 0.5, lw * 0.3]]);
      paint(g, k, metal, L, { d: 1.2, vol: 'r', box: [-lw * 0.5, -lw * 0.6, lw * 0.8, lw * 0.6], lw: 0.7, brush: 0.2,
        after: (g) => { line(g, [[-lw * 0.3, 0], [lw * 0.75, lw * 0.05]], 0.5, rgba(L.rim, 0.45)); dot(g, lw * 0.2, -lw * 0.25, 0.6, L.rim); } });
    }, [-lw, -lw, lw, lw]) : shin;
    P.foot = footPart(L, lw, metal, { big: true, deco: (g) => {
      for (let i = 0; i < 3; i++) line(g, [[lw * (0.1 + i * 0.4), -lw * 0.5], [lw * (0.2 + i * 0.42), lw * 0.4]], 0.45, 'rgba(0,0,0,0.6)');
      line(g, [[-lw * 0.5, -lw * 0.55], [lw * 1.6, lw * 0.1]], 0.5, rgba(L.rim, 0.3));
    } });
  }

  // ---------------------------------------------------------------- bras
  const sleeve = o.sleeveCol ?? body;
  P.upper = limbPart(L, A, aw * 1.12, aw * 0.84, sleeve, { back: aw * 0.16, seed: 7,
    deco: (g) => {
      if (o.armored) {
        for (let i = 0; i < 2; i++) paint(g, [[-aw * 0.62, A * (0.35 + i * 0.28)], [aw * 0.62, A * (0.3 + i * 0.28)], [aw * 0.6, A * (0.55 + i * 0.28)], [-aw * 0.6, A * (0.6 + i * 0.28)]], metal, L, { d: 0.9, vol: 'x', lw: 0.55, brush: 0.15 });
      } else line(g, [[aw * 0.1, A * 0.15], [aw * 0.05, A * 0.85]], 0.5, 'rgba(0,0,0,0.5)');
      if (vein) glow(g, [[-aw * 0.2, A * 0.08], [aw * 0.12, A * 0.22], [-aw * 0.05, A * 0.32]], 0.55, vein);
    } });
  const fore = limbPart(L, A, aw * 0.96, aw * 0.74, c.robe ? body2 : bone, { back: aw * 0.2, seed: 9, joint: true,
    deco: (g) => {
      if (o.armored) { // canon d'avant-bras
        paint(g, [[-aw * 0.6, A * 0.3], [aw * 0.6, A * 0.26], [aw * 0.5, A + 2], [-aw * 0.5, A + 2]], metal, L, { d: 1, vol: 'x', box: [-aw * 0.5, A * 0.3, aw * 0.5, A], lw: 0.6 });
        for (const y of [0.42, 0.75]) line(g, [[-aw * 0.55, A * y], [aw * 0.55, A * y - 0.4]], 0.5, rgba(L.rim, 0.4));
        if (vein) glow(g, [[-aw * 0.25, A * 0.48], [aw * 0.1, A * 0.6]], 0.5, vein);
      } else if (c.robe) { // manche large de la robe
        line(g, [[-aw * 0.45, A * 0.8], [aw * 0.45, A * 0.78]], 0.9, rgba(L.rim, 0.45));
      }
    } });
  P.fore = o.noHand ? over(fore, (g) => o.noHand(g, A, aw), [-aw * 1.4, 0, aw * 1.6, A + aw * 2.2]) : fore;
  if (!o.noHand) P.hand = fistPart(L, aw * 0.58, o.armored ? metal : String(c.robe ? body2 : bone));

  // ---------------------------------------------------------------- buste
  P.torso = {
    box: box(-sw * 0.8, -T - 10, sw * 0.8, 6),
    bevel: 6,
    draw: (g) => {
      const wq = 1;
      const bust = new Path2D();
      bust.moveTo(-hw * 0.58, 2); bust.lineTo(hw * 0.6, 2);
      bust.bezierCurveTo(sw * 0.48 * wq, -T * 0.18, sw * 0.42 * wq, -T * 0.42, sw * 0.56, -T * 0.66);
      bust.bezierCurveTo(sw * 0.66, -T * 0.84, sw * 0.56, -T - 2, sw * 0.32, -T - 3);
      bust.quadraticCurveTo(0, -T - 5, -sw * 0.5, -T - 1);
      bust.bezierCurveTo(-sw * 0.66, -T * 0.8, -sw * 0.5 * wq, -T * 0.45, -sw * 0.46 * wq, -T * 0.28);
      bust.quadraticCurveTo(-hw * 0.68, -T * 0.1, -hw * 0.58, 2); bust.closePath();
      paint(g, bust, body, L, { d: 3.2, vol: 'x', box: [-sw * 0.55, -T, sw * 0.55, 0], seed: 11, rimW: 1.5,
        after: (g) => {
          line(g, [[-sw * 0.3, -T * 0.8], [-sw * 0.36, -T * 0.3]], 0.5, 'rgba(0,0,0,0.5)');
          line(g, [[sw * 0.42, -T * 0.4], [sw * 0.3, -T * 0.08]], 0.5, 'rgba(0,0,0,0.5)');
        } });
      if (o.armored) {
        // plastron bombé et deux plates ventrales
        const plate = pathOf([[-sw * 0.42, -T + 1], [sw * 0.1, -T - 1.5], [sw * 0.6, -T * 0.9], [sw * 0.6, -T * 0.6], [sw * 0.4, -T * 0.34], [-sw * 0.05, -T * 0.36], [-sw * 0.45, -T * 0.48]]);
        paint(g, plate, metal, L, { d: 2.4, vol: 'r', box: [-sw * 0.45, -T, sw * 0.6, -T * 0.35], seed: 13, lw: 0.8,
          after: (g) => {
            line(g, [[sw * 0.15, -T + 0.5], [sw * 0.2, -T * 0.4]], 0.9, rgba(L.rim, 0.35)); // arête
            line(g, [[-sw * 0.35, -T * 0.7], [sw * 0.05, -T * 0.66], [sw * 0.5, -T * 0.72]], 0.5, 'rgba(0,0,0,0.6)');
            if (vein) { // fissures lumineuses dans la plaque
              glow(g, [[-sw * 0.3, -T * 0.88], [-sw * 0.06, -T * 0.64], [-sw * 0.2, -T * 0.45]], 0.7, vein);
              glow(g, [[-sw * 0.06, -T * 0.64], [sw * 0.18, -T * 0.6], [sw * 0.32, -T * 0.72]], 0.6, vein);
              glow(g, [[sw * 0.18, -T * 0.6], [sw * 0.24, -T * 0.42]], 0.5, vein);
            }
          } });
        for (let j = 0; j < 2; j++) {
          const y = -T * 0.3 + j * T * 0.13;
          paint(g, [[-sw * 0.36, y], [sw * 0.1, y - 2], [sw * 0.48, y - 1], [sw * 0.44, y + T * 0.11], [sw * 0.05, y + T * 0.11 - 1.5], [-sw * 0.34, y + T * 0.1]], mix(metal, DARK, 0.25), L, { d: 1, vol: 'y', lw: 0.6, brush: 0.2,
            after: (g) => { for (const x of [-0.25, 0.1, 0.38]) dot(g, sw * x, y + 1.5, 0.45, rgba(L.rim, 0.8)); } });
        }
        if (vein) glow(g, [[sw * 0.05, -T * 0.29], [sw * 0.1, -T * 0.22], [sw * 0.02, -T * 0.12]], 0.55, vein);
      }
      if (o.chest) o.chest(g);
      // ceinture, boucle, gemme
      paint(g, [[-hw * 0.62, -6], [hw * 0.64, -6.5], [hw * 0.66, -1], [-hw * 0.62, -0.5]], body2, L, { d: 1, vol: 'y', lw: 0.65, brush: 0.2 });
      paint(g, [[hw * 0.2, -7.2, 1], [hw * 0.2 + 4.4, -7.2, 1], [hw * 0.2 + 4.4, -0.2, 1], [hw * 0.2, -0.2, 1]], metal, L, { d: 0.7, vol: null, lw: 0.6, brush: 0 });
      dot(g, hw * 0.2 + 2.2, -3.7, 0.9, L.rim);
      if (!o.armored) { const gp = new Path2D(); gp.arc(sw * 0.18, -T * 0.62, 1.8, 0, TAU); glowFill(g, gp, L.rim, 1.2); dot(g, sw * 0.18 - 0.4, -T * 0.62 - 0.4, 0.6, '#ffffff'); }
    },
  };

  // ---------------------------------------------------------------- pans (guerriers) : tassettes de tissu bordées de métal
  if (!c.robe && !c.float) {
    const flap = (seed) => {
      const Lf = 15, w = hw * 0.3;
      return {
        box: box(-w - 2, -2, w + 2.5, Lf + 6),
        bevel: 2,
        draw: (g) => {
          const p = pathOf([[-w, 0, 1], [w, 0, 1], [w * 0.85, Lf, 1], [0, Lf + 3, 1], [-w * 0.9, Lf - 1, 1]]);
          paint(g, p, body2, L, { d: 1.6, vol: 'x', box: [-w, 0, w, Lf], seed,
            after: (g) => { paint(g, [[-w, Lf * 0.55], [w, Lf * 0.5], [w * 0.85, Lf, 1], [0, Lf + 3, 1], [-w * 0.9, Lf - 1, 1]], metal, L, { d: 0.9, vol: null, lw: 0.55, brush: 0.2 }); } });
          if (vein) glow(g, [[0, Lf * 0.62], [0, Lf + 1.5]], 0.45, vein);
        },
      };
    };
    P.flapB = flap(17); P.flapF = flap(19);
  }

  // ---------------------------------------------------------------- épaulière en lames, pointes d'os
  if (c.pauldron) {
    const pw = aw * 1.35, ph = aw * 0.95;
    P.pauldron = {
      box: box(-pw - 6, -ph * 2.1 - 6, pw + 2.5, ph + 2.5),
      bevel: 4,
      draw: (g) => {
        if (c.spikes) for (let j = 0; j < 3; j++) {
          const x = -pw * 0.6 + j * pw * 0.5, hh = ph * 1.9 + (j === 1 ? 3 : 0);
          paint(g, [[x, -ph * 0.45, 1], [x - pw * 0.15 - 2.4, -hh, 1], [x + pw * 0.32, -ph * 0.7, 1]], bone, L, { d: 0.8, vol: null, lw: 0.6, brush: 0.2,
            after: (g) => { line(g, [[x - pw * 0.05, -ph * 0.6], [x - pw * 0.15 - 2, -hh + 1.5]], 0.4, rgba(L.rim, 0.5)); } });
        }
        const e = new Path2D(); e.ellipse(0, 0, pw, ph, 0, 0, TAU);
        paint(g, e, metal, L, { d: 2, vol: 'r', box: [-pw, -ph, pw, ph], seed: 23, rimW: 1.4,
          after: (g) => { line(g, [[-pw * 0.7, -ph * 0.35], [-pw * 0.1, -ph * 0.75], [pw * 0.6, -ph * 0.45]], 0.6, rgba(L.rim, 0.35)); } });
        const lame = new Path2D(); lame.ellipse(-pw * 0.05, ph * 0.5, pw * 0.9, ph * 0.62, 0, 0, Math.PI); lame.lineTo(-pw * 0.95, ph * 0.2); lame.lineTo(pw * 0.85, ph * 0.2); lame.closePath();
        paint(g, lame, mix(metal, DARK, 0.3), L, { d: 1, vol: 'y', lw: 0.6, brush: 0.2 });
        for (const x of [-0.5, 0, 0.5]) dot(g, x * pw, ph * 0.05, 0.75, L.rim);
        if (vein) glow(g, [[-pw * 0.4, -ph * 0.3], [0, -ph * 0.05], [pw * 0.35, -ph * 0.35]], 0.55, vein);
      },
    };
  }

  // ---------------------------------------------------------------- cape déchirée (pivot entre les épaules, pend vers +y)
  if (c.cape) {
    const Lc = T + c.leg * 0.78;
    P.cape = {
      box: box(-shX * 1.7 - 8, -1, shX * 0.6, Lc + 4),
      bevel: 3,
      draw: (g) => {
        const pts = [[-shX * 0.7, 2], [shX * 0.42, 0.5], [-3, T * 0.55], [-1, Lc * 0.9]];
        const n = 7;
        for (let i = 0; i < n; i++) {
          const x = -1.5 - i * (shX * 1.55 / n);
          pts.push([x, Lc - i * 0.6 + (i % 2 ? -5 - (i * 37 % 5) : 2), 1]);
        }
        pts.push([-shX * 1.55, Lc * 0.62], [-shX * 1.2, T * 0.35]);
        paint(g, pathOf(pts), capeC, L, { d: 3, vol: 'x', box: [-shX * 1.5, 0, 0, Lc], seed: 29,
          after: (g) => {
            for (let j = 0; j < 4; j++) line(g, [[-shX * (0.15 + j * 0.25), 4], [-shX * (0.2 + j * 0.32) - 1, Lc * 0.5], [-shX * (0.25 + j * 0.34), Lc - 6]], 0.7, rgba(L.rim, 0.14));
            for (let j = 0; j < 3; j++) line(g, [[-shX * (0.3 + j * 0.3), 6], [-shX * (0.35 + j * 0.32), Lc - 10]], 0.8, 'rgba(0,0,0,0.4)');
          } });
      },
    };
  }

  // ---------------------------------------------------------------- robe
  if (c.robe || c.float) {
    if (c.float) {
      const hem = c.leg * 0.85, fw = hw * 2;
      P.robe = {
        box: box(-fw - 4, -4, fw * 0.85, hem + 3),
        bevel: 4,
        draw: (g) => {
          const p = pathOf([[-hw * 0.6, -2, 1], [hw * 0.6, -2, 1], [fw * 0.62, hem * 0.45], [4, hem, 1], [-1, hem * 0.84, 1], [-fw * 0.25, hem * 0.98, 1], [-fw * 0.35, hem * 0.76, 1], [-fw * 0.7, hem * 0.9, 1], [-fw * 0.62, hem * 0.62], [-fw * 0.95, hem * 0.62, 1], [-fw * 0.62, hem * 0.3]]);
          paint(g, p, body, L, { d: 3, vol: 'x', box: [-fw * 0.8, 0, fw * 0.6, hem], seed: 31, rimW: 1.4,
            after: (g) => {
              for (let j = 0; j < 4; j++) line(g, [[-hw * 0.4 + j * hw * 0.3, 2], [-fw * 0.5 + j * fw * 0.3, hem * 0.85]], 0.7, rgba(L.rim, 0.16));
              paint(g, [[-hw * 0.6, -2], [hw * 0.6, -2], [hw * 0.75, 7], [-hw * 0.7, 7]], body2, L, { d: 1, vol: 'y', lw: 0.6, brush: 0.2 });
            } });
          glow(g, [[-hw * 0.55, 6.2], [hw * 0.7, 6.2]], 0.55, L.rim);
        },
      };
    } else {
      const hem = c.leg - 1, fw = hw * 1.9;
      P.robe = {
        box: box(-fw * 0.75, -4, fw * 0.75, hem + 6),
        bevel: 4,
        draw: (g) => {
          const pts = [[-hw * 0.6, -2, 1], [hw * 0.6, -2, 1], [hw * 1.05, c.leg * 0.45], [fw * 0.55, hem, 1]];
          for (let i = 0; i < 9; i++) pts.push([fw * 0.55 - (i + 1) * fw * 0.122, hem + (i % 2 ? -4 - ((i * 7) % 5) : 1 + (i % 3)), 1]);
          pts.push([-hw * 1.05, c.leg * 0.45]);
          paint(g, pathOf(pts), body, L, { d: 3, vol: 'x', box: [-fw * 0.55, 0, fw * 0.55, hem], seed: 37, rimW: 1.4,
            after: (g) => {
              for (let j = 0; j < 4; j++) line(g, [[-hw * 0.3 + j * hw * 0.25, 4], [-fw * 0.4 + j * fw * 0.28, hem - 3]], 0.8, 'rgba(0,0,0,0.45)');
              line(g, [[hw * 0.15, 0], [hw * 0.45, hem - 2]], 1, rgba(L.rim, 0.3));
            } });
          glow(g, [[-hw * 0.5, 6], [hw * 0.55, 6]], 0.55, L.rim);
        },
      };
    }
  }

  // ---------------------------------------------------------------- tête
  for (const ex of ['n', 'angry', 'hurt']) P[`head-${ex}`] = { box: o.headBox as never, bevel: 4.5, draw: (g) => o.head(g, ex) };
  if (o.weapon) P.weapon = o.weapon;
  return P;
}

// =========================================================================== armes
/** Espadon (repère de la main, tourné de -0,35 comme l'ancien dessin). */
function greatsword(c, L, rune: string): PartDef {
  const Lb = 56, W = 8, a = -0.35;
  return {
    box: rotBox(-18, -W * 1.3, Lb + 3, W * 1.3, a),
    bevel: 1.6,
    draw: (g) => {
      g.rotate(a);
      paint(g, [[-12, -2.2, 1], [-2, -2.2, 1], [-2, 2.2, 1], [-12, 2.2, 1]], String(c.body2), L, { d: 0.6, vol: 'y', lw: 0.55, brush: 0,
        after: (g) => { for (let j = 0; j < 4; j++) line(g, [[-11 + j * 2.4, -2], [-9.6 + j * 2.4, 2]], 0.4, rgba(L.rim, 0.3)); } });
      paint(g, [[-12, 0, 1], [-14.5, -3, 1], [-17, 0, 1], [-14.5, 3, 1]], String(c.metal), L, { d: 0.5, vol: null, lw: 0.55, brush: 0 });
      dot(g, -14.5, 0, 1.1, L.rim);
      // garde en croissant
      paint(g, [[-2, -W * 1.15], [1.5, -W * 0.55], [1.5, 0], [1.5, W * 0.55], [-2, W * 1.15, 1], [-0.5, W * 1.3, 1], [4, W * 0.6], [4, -W * 0.6], [-0.5, -W * 1.3, 1]], String(c.metal), L, { d: 0.9, vol: 'x', lw: 0.6, brush: 0.2 });
      // lame : pan clair (haut) / pan sombre (bas), gouttière
      const blade = pathOf([[3, -W / 2, 1], [2 + Lb * 0.82, -W / 2, 1], [2 + Lb, 0, 1], [2 + Lb * 0.82, W / 2, 1], [3, W / 2, 1]]);
      paint(g, blade, '#9aa0ad', L, { d: 1.2, vol: 'y', box: [3, -W / 2, Lb, W / 2], lw: 0.7, brush: 0.3,
        after: (g) => {
          g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(3, 0, Lb, W / 2);
          line(g, [[5, 0], [2 + Lb * 0.72, 0]], 1, 'rgba(0,0,0,0.6)');
          // éclats, ébréchures
          for (const x of [20, 34, 46]) line(g, [[x, W / 2], [x + 1.5, W / 2 - 1.4]], 0.5, 'rgba(0,0,0,0.6)');
        } });
      glow(g, [[5, -W / 2 + 0.7], [2 + Lb * 0.82, -W / 2 + 0.7], [2 + Lb - 1.2, 0]], 0.9, L.rim);
      for (let j = 0; j < 4; j++) { const x = 8 + j * Lb * 0.16; glow(g, rune === 'cross' ? [[x, -1], [x + 3, 1], [x + 1.5, 0], [x + 3, -1]] : [[x, -0.9], [x + Lb * 0.07, 0.9]], 0.6, L.sig, 0.9); }
    },
  };
}

/** Hallebarde (repère de la main, tournée de -1,35) : hampe, fer de hache, bec, pique. */
function halberd(c, L): PartDef {
  const a = -1.35;
  return {
    box: rotBox(-32, -16, 74, 27, a),
    bevel: 1.6,
    draw: (g) => {
      g.rotate(a);
      paint(g, [[-30, -1.8, 1], [52, -1.6, 1], [52, 1.6, 1], [-30, 1.8, 1]], '#3a2a20', L, { d: 0.7, vol: 'y', box: [-30, -2, 52, 2], lw: 0.6, brush: 0.4,
        after: (g) => { for (let x = -24; x < 40; x += 7) line(g, [[x, -1.6], [x + 2, 1.6]], 0.35, 'rgba(0,0,0,0.6)'); } });
      for (const x of [-28, -4, 44]) paint(g, [[x, -2.6, 1], [x + 3, -2.6, 1], [x + 3, 2.6, 1], [x, 2.6, 1]], String(c.metal), L, { d: 0.4, vol: null, lw: 0.5, brush: 0 });
      g.translate(50, 0); g.scale(1.25, 1.25);
      // pique
      paint(g, [[2, -1.8, 1], [12, -0.6], [17, 0, 1], [12, 0.6], [2, 1.8, 1]], '#9aa0ad', L, { d: 0.5, vol: 'y', lw: 0.6, brush: 0.2 });
      // bec (côté -y)
      paint(g, [[-1, -2, 1], [7, -2, 1], [10, -6.5], [6, -11, 1], [4, -6], [0, -4.5]], '#9aa0ad', L, { d: 0.7, vol: null, lw: 0.6, brush: 0.2 });
      // fer de hache (côté +y), échancré
      const axe = pathOf([[-6, 2, 1], [6, 2, 1], [13, 6], [15, 12], [10, 19, 1], [6, 14], [1, 12], [-6, 10.5, 1]]);
      paint(g, axe, '#9aa0ad', L, { d: 1.2, vol: 'x', box: [-6, 2, 15, 19], lw: 0.7, brush: 0.3,
        after: (g) => {
          line(g, [[-4, 4], [-4, 9.5]], 0.6, 'rgba(0,0,0,0.6)');
          for (const [x, y] of [[-3, 4.5], [-3, 8.5]]) dot(g, x, y, 0.55, L.rim);
          glow(g, [[0, 6], [4, 7], [2, 9.5]], 0.5, L.sig, 0.8); // rune de braise
        } });
      glow(g, [[8, 3], [13.6, 7], [14.5, 12], [10, 18]], 1, L.rim);
      glow(g, [[12, -0.2], [16.5, 0]], 0.5, L.rim, 0.8);
    },
  };
}

/** Bâton de la Matriarche : orienté dans le monde par bones.ts, dessiné le long de +x (tête vers +x). */
function iceStaff(c, L): PartDef {
  return {
    box: box(-28, -13, 54, 13),
    bevel: 1.5,
    draw: (g) => {
      const ice = String(c.metal);
      paint(g, [[-26, -1.3, 1], [34, -1.8, 1], [34, 1.8, 1], [-26, 1.3, 1]], '#4a5a72', L, { d: 0.6, vol: 'y', box: [-26, -2, 34, 2], lw: 0.55, brush: 0.3 });
      for (const x of [-24, -2, 30]) paint(g, [[x, -2.2, 1], [x + 1.8, -2.2, 1], [x + 1.8, 2.2, 1], [x, 2.2, 1]], ice, L, { d: 0.3, vol: null, lw: 0.45, brush: 0 });
      glow(g, [[-20, 0], [-6, 0]], 0.45, L.rim, 0.7);
      g.translate(42, 0);
      // croissant de glace en éclats
      const cr = new Path2D(); cr.arc(0, 0, 8.5, Math.PI * 0.3, Math.PI * 1.7); cr.arc(-3.6, 0, 6.4, Math.PI * 1.62, Math.PI * 0.38, true); cr.closePath();
      paint(g, cr, ice, L, { d: 1, vol: 'r', box: [-8, -8, 8, 8], lw: 0.65, brush: 0.2, rimW: 1.2 });
      for (const [x, y, s] of [[-6, -7.5, -1], [-6, 7.5, 1], [-8.4, -3, -1], [-8.4, 3, 1]]) paint(g, [[x, y, 1], [x - 2.2, y + s * 3.4, 1], [x + 1.2, y + s * 1.2, 1]], ice, L, { d: 0.3, vol: null, lw: 0.45, brush: 0, rimW: 0.7 });
      // gemme lunaire
      const gem = new Path2D(); gem.moveTo(1.2, -3.6); gem.lineTo(4, 0); gem.lineTo(1.2, 3.6); gem.lineTo(-1.6, 0); gem.closePath();
      glowFill(g, gem, L.rim, 1.4);
      dot(g, 0.8, -0.8, 1, '#ffffff');
    },
  };
}

// =========================================================================== têtes
function helmet(c, L, g, ex, crown) {
  const r = c.headR, metal = String(c.metal);
  if (c.horns) for (const sg of [1, -1]) { // cornes d'os (arrière puis avant)
    const p = sg > 0
      ? [[-r * 0.5, -r * 0.7], [-r * 1.4, -r * 0.85], [-r * 1.95, -r * 1.5], [-r * 1.6, -r * 2.45, 1], [-r * 1.15, -r * 1.45], [-r * 0.25, -r * 0.98]]
      : [[r * 0.1, -r * 0.7], [-r * 0.6, -r * 1.1], [-r * 1.0, -r * 1.6], [-r * 0.7, -r * 2.55, 1], [-r * 0.35, -r * 1.55], [r * 0.4, -r * 0.95]];
    paint(g, p, String(c.skin), L, { d: 1.2, vol: 'x', lw: 0.65, brush: 0.3,
      after: (g) => { for (let i = 0; i < 4; i++) { const t = 0.25 + i * 0.17; line(g, [[p[1][0] + (p[3][0] - p[1][0]) * t - 1.4, p[1][1] + (p[3][1] - p[1][1]) * t], [p[1][0] + (p[3][0] - p[1][0]) * t + 1.6, p[1][1] + (p[3][1] - p[1][1]) * t + 0.6]], 0.45, 'rgba(0,0,0,0.55)'); } } });
  }
  // calotte, nasal, couvre-joue
  const shell = pathOf([[-r * 0.95, r * 0.35], [-r * 1.1, -r * 0.9], [-r * 0.2, -r * 1.25], [r * 0.45, -r * 1.02], [r * 1.1, -r * 0.7], [r * 1.05, -r * 0.05], [r * 1.12, r * 0.5, 1], [r * 0.9, r * 1.05], [r * 0.35, r * 1.05, 1], [-r * 0.2, r * 0.95], [-r * 0.85, r * 0.85]]);
  paint(g, shell, metal, L, { d: 2, vol: 'r', box: [-r, -r * 1.1, r * 1.1, r], seed: 41, rimW: 1.4,
    after: (g) => {
      line(g, [[-r * 0.9, -r * 0.05], [0, -r * 0.43], [r * 1.05, -r * 0.28]], 1.8, 'rgba(0,0,0,0.45)');
      line(g, [[-r * 0.85, -r * 0.2], [0, -r * 0.58], [r * 0.9, -r * 0.45]], 0.5, rgba(L.rim, 0.4));
      line(g, [[-r * 0.3, -r * 1.1], [-r * 0.35, r * 0.6]], 0.5, rgba(L.rim, 0.25)); // arête de la calotte
      for (let j = 0; j < 3; j++) line(g, [[r * (0.45 + j * 0.2), r * 0.3], [r * (0.45 + j * 0.2), r * 0.75]], 0.6, 'rgba(0,0,0,0.6)');
      for (const x of [-0.6, -0.2]) dot(g, r * x, -r * 0.2, 0.6, rgba(L.rim, 0.9));
    } });
  // fente de visière et œil
  g.fillStyle = '#050406'; g.beginPath(); g.moveTo(r * 0.05, -r * 0.15); g.lineTo(r * 1.1, -r * 0.12); g.lineTo(r * 1.1, r * 0.12); g.lineTo(r * 0.05, r * 0.1); g.closePath(); g.fill();
  eye(g, r * 0.62, -r * 0.02, r * 0.28, r * 0.08, L.rim, ex, 0);
  if (ex === 'angry') glow(g, [[r * 0.35, -r * 0.3], [r * 0.95, -r * 0.18]], 0.4, L.rim, 0.6);
  if (crown) {
    const cp = [[-r * 0.95, -r * 0.62, 1]];
    for (let i = 0; i <= 4; i++) { cp.push([-r * 0.9 + i * r * 0.45, -r * (i % 2 ? 1.3 : 1.9), 1]); cp.push([-r * 0.9 + i * r * 0.45 + r * 0.22, -r * 0.85, 1]); }
    cp.push([r * 1.0, -r * 0.6, 1]);
    paint(g, cp, String(c.sig), L, { d: 0.8, vol: 'y', lw: 0.6, brush: 0.1, rimW: 1.2,
      after: (g) => { line(g, [[-r * 0.95, -r * 0.75], [r, -r * 0.72]], 0.8, rgba(L.rim, 0.6)); } });
    for (let i = 0; i <= 4; i += 2) { const gp = new Path2D(); gp.arc(-r * 0.9 + i * r * 0.45 + r * 0.06, -r * 1.55, r * 0.09, 0, TAU); glowFill(g, gp, L.rim, 0.8); }
    for (let i = 0; i < 3; i++) dot(g, -r * 0.6 + i * r * 0.62, -r * 0.95, r * 0.07, '#ffffff');
  }
}

function skull(c, L, g, ex) {
  const r = c.headR, bone = String(c.skin), horn = String(c.body2);
  // cornes recourbées
  paint(g, [[-r * 0.3, -r * 0.8], [-r * 1.3, -r * 1.3], [-r * 1.6, -r * 1.9], [-r * 1.1, -r * 2.65, 1], [-r * 0.95, -r * 1.85], [-r * 0.5, -r * 1.35], [r * 0.2, -r * 0.95]], horn, L, { d: 1.2, vol: 'x', lw: 0.65, brush: 0.3,
    after: (g) => { for (let i = 0; i < 4; i++) line(g, [[-r * (0.5 + i * 0.25), -r * (1.0 + i * 0.25)], [-r * (0.3 + i * 0.25), -r * (1.4 + i * 0.25)]], 0.45, rgba(L.rim, 0.3)); } });
  // couronne de pointes lumineuses
  for (let i = 0; i < 5; i++) {
    const x = -r * 0.8 + i * r * 0.38;
    paint(g, [[x, -r * 0.8, 1], [x + r * 0.18, -r * (1.45 + (i === 2 ? 0.25 : 0)), 1], [x + r * 0.36, -r * 0.8, 1]], String(c.sig), L, { d: 0.4, vol: null, lw: 0.5, brush: 0, rimW: 0.9 });
    glow(g, [[x + r * 0.18, -r * 0.9], [x + r * 0.18, -r * (1.3 + (i === 2 ? 0.25 : 0))]], 0.35, L.rim, 0.6);
  }
  // crâne
  const cr = new Path2D(); cr.ellipse(0, 0, r * 0.95, r, 0, 0, TAU);
  paint(g, cr, bone, L, { d: 2.2, vol: 'r', box: [-r, -r, r, r], seed: 43, rimW: 1.4,
    after: (g) => {
      line(g, [[-r * 0.4, -r * 0.9], [-r * 0.2, -r * 0.5], [-r * 0.45, -r * 0.1]], 0.5, 'rgba(0,0,0,0.6)'); // fêlure
      line(g, [[r * 0.15, r * 0.25], [r * 0.3, r * 0.42], [r * 0.45, r * 0.25]], 0.6, 'rgba(0,0,0,0.7)'); // narine
    } });
  // corne avant, recourbée vers l'avant
  paint(g, [[r * 0.15, -r * 0.85], [r * 0.45, -r * 1.7], [r * 1.3, -r * 2.35, 1], [r * 0.95, -r * 1.45], [r * 0.85, -r * 0.6]], horn, L, { d: 1, vol: 'x', lw: 0.65, brush: 0.3,
    after: (g) => { for (let i = 0; i < 3; i++) line(g, [[r * (0.35 + i * 0.2), -r * (1.0 + i * 0.3)], [r * (0.75 + i * 0.15), -r * (1.05 + i * 0.3)]], 0.45, rgba(L.rim, 0.3)); } });
  // mâchoire
  paint(g, [[r * 0.05, r * 0.55, 1], [r * 0.85, r * 0.55, 1], [r * 0.8, r * 1.0, 1], [r * 0.05, r * 1.05, 1]], mix(bone, DARK, 0.2), L, { d: 0.8, vol: 'y', lw: 0.6, brush: 0.1,
    after: (g) => { for (let i = 0; i < 4; i++) line(g, [[r * (0.18 + i * 0.18), r * 0.6], [r * (0.18 + i * 0.18), r * 0.95]], 0.45, 'rgba(0,0,0,0.65)'); } });
  // orbite et pupille
  g.fillStyle = '#0a0406'; g.beginPath(); g.ellipse(r * 0.45, -r * 0.05, r * 0.27, r * 0.31, 0, 0, TAU); g.fill();
  const k = ex === 'angry' ? 1.35 : ex === 'hurt' ? 0.7 : 1;
  const pu = new Path2D(); pu.arc(r * 0.47, -r * 0.02, r * 0.12 * k, 0, TAU); glowFill(g, pu, L.rim, 1);
  dot(g, r * 0.47, -r * 0.02, r * 0.05 * k, '#ffffff');
}

function mask(c, L, g, ex) {
  const r = c.headR, hood = String(c.hair), pale = String(c.skin);
  // capuche pointue derrière le masque
  paint(g, [[-r * 1.3, r * 1.25], [-r * 1.25, -r * 0.3], [-r * 0.7, -r * 1.25], [-r * 0.3, -r * 2.1, 1], [r * 0.3, -r * 1.25], [r * 0.95, -r * 0.6], [r * 0.6, r * 1.4]], hood, L, { d: 2, vol: 'x', box: [-r * 1.3, -r * 1.6, r, r * 1.3], seed: 47, rimW: 1.4,
    after: (g) => { line(g, [[-r * 0.9, -r * 0.2], [-r * 0.5, r * 1.1]], 0.6, rgba(L.rim, 0.2)); } });
  // masque lisse
  const m = new Path2D(); m.ellipse(r * 0.08, 0, r * 0.88, r * 1.12, 0.05, 0, TAU);
  paint(g, m, pale, L, { d: 1.8, vol: 'r', box: [-r * 0.8, -r * 1.1, r, r * 1.1], seed: 49, rimW: 1.2,
    after: (g) => { line(g, [[r * 0.6, -r * 0.6], [r * 0.85, r * 0.1], [r * 0.6, r * 0.8]], 0.6, rgba(L.rim, 0.35)); } });
  // fentes lumineuses et ligne médiane
  eye(g, r * 0.42, -r * 0.15, r * 0.32, r * 0.09, L.rim, ex, 0);
  eye(g, -r * 0.2, -r * 0.15, r * 0.22, r * 0.07, L.rim, ex, 0);
  glow(g, [[r * 0.1, -r * 1.02], [r * 0.1, -r * 0.35]], 0.5, L.rim, 0.8);
  glow(g, [[r * 0.1, r * 0.05], [r * 0.1, r * 1.0]], 0.5, L.rim, 0.8);
  // croissant d'éclipse au front
  const ec = new Path2D(); ec.arc(r * 0.1, -r * 0.62, r * 0.2, 0, TAU); ec.arc(r * 0.2, -r * 0.66, r * 0.16, 0, TAU, true);
  glowFill(g, ec, L.sig, 0.8);
}

function iceCrown(c, L, g, ex) {
  const r = c.headR, hair = String(c.hair), skin = String(c.skin);
  // longue chevelure arrière, en mèches
  paint(g, [[-r * 0.2, -r * 0.95], [-r * 1.3, -r * 0.5], [-r * 1.55, r * 0.9], [-r * 1.3, r * 2.7, 1], [-r * 1.0, r * 2.0], [-r * 0.75, r * 2.5, 1], [-r * 0.5, r * 1.6], [-r * 0.2, r * 2.3, 1], [-r * 0.1, r * 0.9], [r * 0.5, -r * 0.2]], hair, L, { d: 2, vol: 'x', box: [-r * 1.5, -r, r * 0.5, r * 2.6], seed: 51, rimW: 1.4,
    after: (g) => { for (let i = 0; i < 4; i++) line(g, [[-r * (0.4 + i * 0.25), -r * 0.4], [-r * (0.7 + i * 0.18), r * 1.9]], 0.55, rgba(L.rim, 0.2)); } });
  const f = new Path2D(); f.ellipse(0, 0, r * 0.92, r, 0, 0, TAU);
  paint(g, f, skin, L, { d: 2, vol: 'r', box: [-r, -r, r, r], seed: 53, rimW: 1.3 });
  eye(g, r * 0.5, r * 0.02, r * 0.2, r * 0.09, L.rim, ex, -0.1);
  line(g, [[r * 0.55, r * 0.55], [r * 0.82, r * 0.5]], 0.5, 'rgba(0,0,0,0.6)'); // bouche
  // calotte de cheveux
  paint(g, [[-r * 0.95, r * 0.5], [-r * 1.15, -r * 0.6], [-r * 0.6, -r * 1.12], [r * 0.2, -r * 1.12], [r * 0.95, -r * 0.7], [r * 0.95, -r * 0.1, 1], [r * 0.6, -r * 0.5], [r * 0.1, -r * 0.3], [-r * 0.2, r * 0.2]], hair, L, { d: 1.6, vol: 'y', lw: 0.65, brush: 0.2, rimW: 1.2 });
  // couronne de glace : cristaux nets
  for (let i = 0; i < 5; i++) {
    const x = -r * 0.9 + i * r * 0.42, h = r * (1.2 + ((i + 1) % 3) * 0.5);
    const p = pathOf([[x, -r * 0.8, 1], [x + r * 0.15, -r * 0.8 - h, 1], [x + r * 0.32, -r * 0.8, 1]]);
    paint(g, p, String(c.metal), L, { d: 0.5, vol: 'x', lw: 0.55, brush: 0, rimW: 1 });
    glow(g, [[x + r * 0.15, -r * 0.85], [x + r * 0.15, -r * 0.8 - h * 0.85]], 0.45, L.rim, 0.8);
  }
  const gm = new Path2D(); gm.arc(-r * 0.05, -r * 0.88, r * 0.12, 0, TAU); glowFill(g, gm, L.rim, 0.8);
}

// =========================================================================== accessoires en orbite
function shardPart(c, L): PartDef {
  return {
    box: box(-4.5, -11, 4.5, 8),
    bevel: 1.5,
    draw: (g) => {
      const ice = String(c.metal);
      paint(g, [[0, -9, 1], [3, 0, 1], [0, 6, 1], [-3, 0, 1]], ice, L, { d: 0.5, vol: 'x', box: [-3, -9, 3, 6], lw: 0.55, brush: 0, rimW: 1 });
      g.fillStyle = rgba(L.rim, 0.25); g.beginPath(); g.moveTo(0, -9); g.lineTo(-3, 0); g.lineTo(0, 6); g.closePath(); g.fill();
      glow(g, [[0, -8], [0, 5]], 0.5, L.rim, 0.8);
      dot(g, 0, -1, 0.7, '#ffffff');
    },
  };
}
function bladePart(c, L): PartDef {
  return {
    box: box(-4.5, -16, 4.5, 16),
    bevel: 1.5,
    draw: (g) => {
      paint(g, [[0, -14, 1], [3, -1, 1], [2.2, 2, 1], [0, 14, 1], [-2.2, 2, 1], [-3, -1, 1]], String(c.metal), L, { d: 0.6, vol: 'x', box: [-3, -14, 3, 14], lw: 0.6, brush: 0, rimW: 1 });
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.moveTo(0, -14); g.lineTo(3, -1); g.lineTo(2.2, 2); g.lineTo(0, 14); g.closePath(); g.fill();
      glow(g, [[0, -13], [0, 13]], 0.6, L.rim, 0.9);
      const c0 = new Path2D(); c0.arc(0, 0.5, 1.2, 0, TAU); glowFill(g, c0, L.sig, 0.8);
    },
  };
}
function haloPart(c, L): PartDef {
  const r = c.headR;
  return {
    box: box(-r * 2.5, -r * 2.5, r * 2.5, r * 2.5),
    bevel: 1,
    draw: (g) => {
      const t = g.getTransform(), s = Math.hypot(t.a, t.b);
      g.save(); g.shadowColor = L.sig; g.shadowBlur = 1.2 * s;
      g.strokeStyle = L.rim; g.lineWidth = 2.2; g.beginPath(); g.arc(0, 0, r * 1.9, 0, TAU); g.stroke();
      g.lineWidth = 0.8; g.beginPath(); g.arc(0, 0, r * 2.38, 0, TAU); g.stroke();
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 0.7; g.beginPath(); g.arc(0, 0, r * 1.9, 0, TAU); g.stroke();
      // runes sur l'anneau extérieur
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8 + 0.2;
        g.save(); g.rotate(a); g.fillStyle = L.rim; g.fillRect(r * 2.05, -0.6, r * 0.3, 1.2); g.restore();
      }
    },
  };
}

// =========================================================================== les boss
const hb = (r) => [-r * 2.1, -r * 2.8, r * 1.4, r * 1.5];

export const cendrefer: Painter = (c, L) => bossParts(c, L, {
  armored: true, veins: L.sig,
  head: (g, ex) => helmet(c, L, g, ex, false), headBox: hb(c.headR),
  weapon: halberd(c, L),
});

export const souverain: Painter = (c, L) => bossParts(c, L, {
  armored: true, veins: L.rim,
  head: (g, ex) => helmet(c, L, g, ex, true), headBox: hb(c.headR),
  weapon: greatsword(c, L, 'cross'),
});

export const juge: Painter = (c, L) => {
  const P = bossParts(c, L, {
    head: (g, ex) => skull(c, L, g, ex), headBox: [-c.headR * 1.9, -c.headR * 2.85, c.headR * 1.3, c.headR * 1.3],
    weapon: greatsword(c, L, 'bar'),
    chest: (g) => { // étole pourpre croisée, chaîne d'os
      const T = c.torso, sw = c.sw;
      paint(g, [[-sw * 0.3, -T - 1], [sw * 0.15, -T * 0.4], [sw * 0.36, -T * 0.5], [sw * 0.05, -T - 3]], String(c.body2), L, { d: 0.8, vol: null, lw: 0.6, brush: 0.2 });
      for (let i = 0; i < 5; i++) dot(g, -sw * 0.25 + i * sw * 0.12, -T * (0.88 - i * 0.09), 0.9, mix(String(c.skin), DARK, 0.45));
      glow(g, [[-sw * 0.3, -T - 0.5], [sw * 0.15, -T * 0.42]], 0.45, L.rim, 0.7);
    },
  });
  return P;
};

export const matriarche: Painter = (c, L) => {
  const P = bossParts(c, L, {
    head: (g, ex) => iceCrown(c, L, g, ex), headBox: [-c.headR * 1.7, -c.headR * 2.9, c.headR * 1.2, c.headR * 2.85],
    weapon: iceStaff(c, L),
    chest: (g) => { // col croisé pâle et broche lunaire
      const T = c.torso, sw = c.sw;
      paint(g, [[-sw * 0.32, -T - 1], [sw * 0.2, -T * 0.45], [sw * 0.42, -T * 0.55], [sw * 0.06, -T - 3]], String(c.body2), L, { d: 0.8, vol: null, lw: 0.6, brush: 0.2 });
      glow(g, [[-sw * 0.32, -T - 0.5], [sw * 0.2, -T * 0.47]], 0.45, L.rim, 0.7);
      for (let j = 0; j < 3; j++) line(g, [[sw * 0.1, -T * (0.3 - j * 0.1)], [sw * 0.4, -T * (0.36 - j * 0.1)]], 0.4, rgba(L.rim, 0.25));
    },
  });
  P.shard = shardPart(c, L);
  return P;
};

export const arbitre: Painter = (c, L) => {
  const P = bossParts(c, L, {
    head: (g, ex) => mask(c, L, g, ex), headBox: [-c.headR * 1.5, -c.headR * 2.3, c.headR * 1.2, c.headR * 1.6],
    chest: (g) => { // sceau d'éclipse
      const T = c.torso, sw = c.sw;
      paint(g, [[-sw * 0.35, -T + 1], [sw * 0.4, -T - 1], [sw * 0.3, -T * 0.75], [-sw * 0.3, -T * 0.72]], String(c.body2), L, { d: 0.8, vol: null, lw: 0.6, brush: 0.2 });
      const s = new Path2D(); s.arc(sw * 0.12, -T * 0.5, 3.2, 0, TAU); s.arc(sw * 0.2, -T * 0.53, 2.6, 0, TAU, true);
      glowFill(g, s, L.rim, 1);
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6; line(g, [[sw * 0.12 + Math.cos(a) * 4.2, -T * 0.5 + Math.sin(a) * 4.2], [sw * 0.12 + Math.cos(a) * 5.4, -T * 0.5 + Math.sin(a) * 5.4]], 0.5, rgba(L.rim, 0.7)); }
    },
    // pas de mains : manchettes évasées d'où sortent des doigts effilés lumineux
    noHand: (g, A, aw) => {
      paint(g, [[-aw * 0.55, A - 2], [aw * 0.55, A - 2.3], [aw * 1.0, A + aw * 0.6], [-aw * 0.9, A + aw * 0.7]], String(c.body), L, { d: 0.9, vol: 'y', lw: 0.6, brush: 0.2 });
      for (let i = 0; i < 3; i++) { const x = -aw * 0.4 + i * aw * 0.4; paint(g, [[x - 0.8, A + aw * 0.6, 1], [x + 0.8, A + aw * 0.6, 1], [x + 0.3 + i * 0.4, A + aw * 1.9, 1]], String(c.skin), L, { d: 0.3, vol: null, lw: 0.45, brush: 0, rimW: 0.6 }); }
      glow(g, [[-aw * 0.5, A + aw * 0.55], [aw * 0.6, A + aw * 0.5]], 0.45, L.rim, 0.8);
    },
  });
  P.blade = bladePart(c, L);
  P.halo = haloPart(c, L);
  return P;
};

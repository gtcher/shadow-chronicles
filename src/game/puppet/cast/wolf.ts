// @ts-nocheck
/**
 * Loup du Néant — pantin peint (piste B « ombres à contre-jour »), quadrupède (bones.ts → solveWolf).
 * Silhouette sombre en touffes, crinière en mèches, liseré de contre-jour net, veine et yeux lumineux.
 * Les loups régionaux sont recolorés par teinte : les lueurs viennent de L.rim / L.sig.
 *
 * Repères (unités du squelette, loup de 48 unités) : voir drawWolf (rig/draw.ts).
 *   wBody : centre du corps (épaule ≈ +x), wTail : attache de la queue (pend vers +y),
 *   wHead : base du crâne (museau vers +x), wJaw / wMaw : charnière de la mâchoire,
 *   wLeg*U : épaule / hanche (membre vers +y, 12 u), wLeg*L : coude / jarret (12 u puis patte).
 */
import { box, paint, pathOf, line, mix, rgba, glowLine, TAU, type Parts, type Painter } from '../parts';

/** Patte : coussinet et griffes, repère à la cheville (orteils vers +x). */
function paw(g, L, dark) {
  paint(g, [[-2.6, -2], [-3.1, 1.4], [-1.2, 2.3, 1], [6.2, 2.3, 1], [7, 0.6], [4.6, -1.4], [1.5, -2.2]], dark, L, { d: 0.8, vol: 'y', box: [-3, -2, 7, 2.3], lw: 0.6, brush: 0.2, rimW: 0.8 });
  g.fillStyle = mix(L.rim, '#16121a', 0.35);
  for (let j = 0; j < 3; j++) { g.beginPath(); g.moveTo(5 + j * 0.35, 0.3 + j * 0.65); g.lineTo(8.3 + j * 0.2, 1.4 + j * 0.55); g.lineTo(5.3, 1.3 + j * 0.65); g.closePath(); g.fill(); }
}

/** Segment de patte (pivot en haut, vers +y), galbe arrière, touffes de poil sur l'arrière. */
function legSeg(L, len, w0, w1, bulge, col, o: { paw?: string; tufts?: number; seed?: number; joint?: boolean } = {}) {
  const m = Math.max(w0, w1) / 2 + bulge + 2;
  return {
    box: box(-m - 1, -w0 / 2 - 1.5, o.paw ? 9.5 : m, len + (o.paw ? 3.5 : w1 / 2 + 1.5)),
    bevel: Math.min(w0, w1) * 0.45,
    draw: (g) => {
      // contour du membre avec mèches de poil sur l'arrière (côté -x)
      const pts = [[w0 / 2, 0], [w0 / 2 + bulge * 0.4, len * 0.3], [w1 / 2 + 0.2, len * 0.75], [w1 / 2, len]];
      pts.push([0, len + w1 / 2], [-w1 / 2, len]);
      const n = o.tufts ?? 0;
      for (let i = 1; i <= n; i++) {
        const t = 1 - i / (n + 1);
        const wx = -(w1 / 2 + (w0 / 2 - w1 / 2) * (1 - t)) - bulge * Math.sin(t * Math.PI) * 0.9;
        pts.push([wx - 1.4, len * t + 1.4, 1], [wx, len * t - 0.6]);
      }
      pts.push([-w0 / 2 - bulge * 0.5, len * 0.15], [-w0 / 2, 0], [0, -w0 / 2]);
      const p = pathOf(pts);
      paint(g, p, col, L, { d: Math.max(1.2, w0 * 0.2), vol: 'x', box: [-w0 / 2, 0, w0 / 2, len], seed: o.seed ?? 3, ink: !o.joint,
        after: (g) => { line(g, [[-w0 * 0.1, len * 0.15], [-w1 * 0.05, len * 0.7]], 0.4, rgba(L.rim, 0.16)); } });
      if (o.joint) { g.save(); g.beginPath(); g.rect(-w0 * 2, w0 * 0.25, w0 * 4, len + w1); g.clip(); g.lineWidth = 0.7; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.stroke(p); g.restore(); }
      if (o.paw) { g.save(); g.translate(0, len); paw(g, L, o.paw); g.restore(); }
    },
  };
}

export const wolf: Painter = (c, L) => {
  const fur = String(c.body), dark = String(c.body2);
  const P: Parts = {};

  // ---------------------------------------------------------------- pattes (avant : fines ; arrière : cuisse puissante)
  P.wLegFU = legSeg(L, 12, 8, 5, 1, fur, { tufts: 2, seed: 4 });
  P.wLegFL = legSeg(L, 12, 5.2, 3.6, 0.4, fur, { paw: dark, seed: 6, joint: true });
  P.wLegBU = legSeg(L, 12, 9.5, 5, 2.5, fur, { tufts: 3, seed: 8 });
  P.wLegBL = legSeg(L, 12, 5.2, 3.6, 1, fur, { paw: dark, seed: 10, joint: true });

  // ---------------------------------------------------------------- queue touffue (pend vers +y)
  P.wTail = {
    box: box(-11, -3, 9, 30),
    bevel: 2.5,
    draw: (g) => {
      const p = pathOf([[-4, 0], [-7.5, 6], [-8.5, 13], [-5.5, 19, 1], [-3.8, 18, 1], [-2.6, 24, 1], [-0.6, 20, 1], [1, 28, 1], [2.6, 20, 1], [5.5, 24, 1], [5, 17, 1], [7, 10], [5.5, 3], [4, 0]]);
      paint(g, p, dark, L, { d: 1.6, vol: 'x', box: [-8, 0, 7, 26], seed: 21,
        after: (g) => { for (let i = 0; i < 3; i++) line(g, [[-2 + i * 2.2, 4 + i], [-3 + i * 2.6, 15 + i * 2]], 0.45, rgba(L.rim, 0.18)); } });
      glowLine(g, [[1.2, 3], [0.4, 10], [1.6, 17]], 0.55, L.rim, 1);
    },
  };

  // ---------------------------------------------------------------- corps : poitrail profond, ventre rentré, échine, crinière
  P.wBody = {
    box: box(-30, -27, 30, 15),
    bevel: 6,
    draw: (g) => {
      const body = pathOf([[-27, -1], [-26.5, -11], [-17, -14], [-8, -14], [8, -19], [22, -14], [28.5, -3], [25, 7], [22, 10.5, 1], [18.5, 13.5, 1], [16, 9, 1], [12.5, 13, 1], [9.5, 8.5, 1], [-2, 5.5], [-12, 6.5, 1], [-15.5, 10, 1], [-18, 6, 1], [-21.5, 8.5, 1], [-23, 4.5, 1], [-26.5, 3.5]]);
      paint(g, body, fur, L, { d: 3, vol: 'y', box: [-27, -18, 28, 12], seed: 23,
        after: (g) => {
          // côtes et musculature en traits de contre-jour
          for (let j = 0; j < 4; j++) line(g, [[1 + j * 4, -9], [4.5 + j * 4, -2.5], [2.5 + j * 4, 4]], 0.7, rgba(L.rim, 0.22));
          line(g, [[-20, -6], [-16, 0], [-19, 5]], 0.8, rgba(L.rim, 0.2)); // cuisse
          line(g, [[-10, 2], [-2, 4], [8, 6]], 0.6, 'rgba(0,0,0,0.5)'); // ventre
        } });
      // crinière en mèches (plus sombre), qui coiffe l'échine jusqu'au poitrail
      const mane = [[-11, -12.5, 1]];
      for (let i = 0; i < 8; i++) { const x = -8 + i * 4.4; mane.push([x - 1.5, -19 - (i % 2 ? 1 : 5) - (i > 3 && i < 7 ? 3 : 0), 1], [x + 1.8, -14, 1]); }
      mane.push([27, -8, 1], [27.5, -2, 1], [25, 3, 1], [23.5, -1, 1], [21, 4, 1], [19, -2, 1], [15, -4], [11, -9, 1], [4, -10], [-4, -10.5]);
      paint(g, pathOf(mane), dark, L, { d: 2.2, vol: 'y', box: [-11, -27, 28, 4], seed: 29, rimW: 1.4,
        after: (g) => { for (let i = 0; i < 6; i++) line(g, [[-4 + i * 5, -15], [-1 + i * 5, -11]], 0.45, rgba(L.rim, 0.25)); } });
      // veine du Néant (fine, nette)
      glowLine(g, [[-17, -6], [-11, -3.5], [-7, -2], [0, -7], [6, -1.2], [10, -4]], 0.75, L.rim, 1.2);
      glowLine(g, [[-7, -2], [-6, 2.5]], 0.5, L.rim, 1);
    },
  };

  // ---------------------------------------------------------------- tête : crâne, long museau, oreilles, crocs, œil
  P.wHead = {
    box: box(-16, -21, 28.5, 8),
    bevel: 4,
    draw: (g) => {
      paint(g, [[-14.5, -4.5, 1], [-9, -16, 1], [-3.5, -7, 1]], dark, L, { d: 1, vol: null, lw: 0.6, brush: 0.2 });
      // crocs supérieurs (sous le museau, la mâchoire les recouvre en partie)
      g.fillStyle = '#d8d2c8';
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(12 + i * 3, 1.4); g.lineTo(13.2 + i * 3, 4.1 - (i === 0 ? -0.6 : 0)); g.lineTo(14.6 + i * 3, 1.2); g.closePath(); g.fill(); }
      const skull = pathOf([[-7.5, -5], [-4, -9.5], [2, -11.5], [10, -8.5, 1], [24.5, -4], [27, -2.2], [26, 0.3, 1], [17, 1.4], [9, 3.2], [1, 6.5], [-5, 5.5], [-8.5, 3.5, 1], [-6.5, 1, 1], [-9.5, -1.5, 1]]);
      paint(g, skull, fur, L, { d: 2, vol: 'y', box: [-8, -11, 27, 5], seed: 31,
        after: (g) => {
          line(g, [[10, -8], [16, -5.5], [24, -3.6]], 0.6, rgba(L.rim, 0.3)); // arête du museau
          line(g, [[-2, -2], [3, 2], [7, 2.5]], 0.6, 'rgba(0,0,0,0.5)'); // joue
          // orbite creusée sous l'arcade
          g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.ellipse(10, -4.4, 4.2, 1.8, 0.1, 0, TAU); g.fill();
        } });
      // oreille avant
      paint(g, [[-1.5, -8, 1], [2, -19.5, 1], [7.5, -8.5, 1]], dark, L, { d: 1.2, vol: null, lw: 0.65, brush: 0.2,
        after: (g) => { g.fillStyle = rgba(L.sig, 0.35); g.beginPath(); g.moveTo(1, -9); g.lineTo(2.3, -16); g.lineTo(4.5, -9.5); g.closePath(); g.fill(); } });
      // truffe
      g.fillStyle = '#050406'; g.beginPath(); g.ellipse(25.6, -2.3, 1.5, 1.1, 0, 0, TAU); g.fill();
      // œil en amande lumineux + traînée (pas de halo : lueur serrée)
      g.save(); g.shadowColor = L.rim; g.shadowBlur = 1.2 * Math.hypot(g.getTransform().a, g.getTransform().b);
      g.fillStyle = L.rim; g.beginPath(); g.moveTo(6.8, -5.3); g.lineTo(14.2, -4.3); g.lineTo(8.4, -2.9); g.closePath(); g.fill();
      g.globalAlpha = 0.6; g.beginPath(); g.moveTo(7, -4.6); g.lineTo(0.5, -5.8); g.lineTo(7, -3.6); g.closePath(); g.fill();
      g.restore();
      g.fillStyle = '#fff6ee'; g.beginPath(); g.ellipse(10.5, -4.3, 1.3, 0.55, 0.12, 0, TAU); g.fill();
    },
  };

  // ---------------------------------------------------------------- mâchoire (charnière en 0, 0) et lueur de la gueule
  P.wMaw = {
    box: box(-1, -7, 17, 3),
    bevel: 1,
    draw: (g) => {
      g.fillStyle = mix(L.sig, '#000000', 0.55); g.beginPath(); g.moveTo(0, -1.4); g.lineTo(15.5, -5); g.lineTo(14.5, 1.2); g.closePath(); g.fill();
      g.fillStyle = L.rim; g.beginPath(); g.moveTo(1.5, -0.6); g.lineTo(13.5, -3.4); g.lineTo(13, 0.4); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.moveTo(3, -0.4); g.lineTo(11.5, -2.2); g.lineTo(11.2, -0.6); g.closePath(); g.fill();
    },
  };
  P.wJaw = {
    box: box(-2, -3.5, 17, 6.5),
    bevel: 1.4,
    draw: (g) => {
      g.fillStyle = '#d8d2c8';
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(3 + i * 3, 0.3); g.lineTo(4.3 + i * 3, -2.4); g.lineTo(5.6 + i * 3, 0.3); g.closePath(); g.fill(); }
      paint(g, [[-0.5, -0.2, 1], [15.5, 0, 1], [13.5, 3.4], [6, 4.4], [-0.5, 4.8, 1]], dark, L, { d: 0.8, vol: 'y', box: [0, 0, 15, 4.5], lw: 0.6, brush: 0.2,
        after: (g) => { line(g, [[2, 3.6], [12, 2.6]], 0.35, rgba(L.rim, 0.3)); } });
    },
  };
  return P;
};

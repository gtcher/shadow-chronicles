// @ts-nocheck
/**
 * Pièces de pantin : contrat commun et pièces génériques réutilisables par chaque combattant.
 *
 * Une pièce est dessinée dans son repère de pivot (unités du squelette), au repos :
 *   - membres (thigh, shin, upper, fore) : pivot à l'articulation haute, membre dirigé vers +y ;
 *   - foot : pivot à la cheville, orteil vers +x ; hand : pivot au poignet (= centre du poing) ;
 *   - torso : pivot au milieu des hanches, buste vers -y (haut du buste à -torso) ;
 *   - head-<expr> / hairBack : pivot au centre de la tête (rayon headR) ;
 *   - cape : pivot entre les épaules (0, 0 = haut du buste), pend vers +y ;
 *   - robe : pivot aux hanches ; flapB / flapF : pivot en haut du pan ; quiver / pauldron / shield : centre ;
 *   - weapon : repère de la main (avant-bras vers +y), voir bones.ts pour les rotations propres à l'arme ;
 *   - sleeve : pivot à l'épaule.
 * `box` borne le dessin [x0, y0, x1, y1] (unités, marge comprise) : c'est la taille de la texture.
 */
import { paint, pathOf, limbPath, line, mix, rgba, glowLine, glowDot, INK, TAU, type Look } from './kit';
import type { Def } from './bones';

export interface PartDef {
  box: [number, number, number, number];
  draw: (g: CanvasRenderingContext2D) => void;
  /** Rayon du biseau de la normal map (unités) : plus grand = volume plus rond. */
  bevel?: number;
}
export type Parts = Record<string, PartDef>;

/** Pièces d'un combattant : (fiche CAST, style) → pièces. */
export type Painter = (c: Def, L: Look) => Parts;

export const box = (x0: number, y0: number, x1: number, y1: number): [number, number, number, number] => [x0, y0, x1, y1];

/** Membre générique : forme anatomique + modelé. `deco(g)` dessine les détails dans la forme. */
export function limbPart(L: Look, len: number, w0: number, w1: number, col: string, o: { back?: number; front?: number; deco?: (g) => void; d?: number; seed?: number; /** Membre « enfant » (tibia, avant-bras) : pas d'encre sur le haut arrondi, l'articulation reste d'un seul tenant. */ joint?: boolean } = {}): PartDef {
  const m = Math.max(w0, w1) / 2 + 1.5 + (o.back ?? 0);
  return {
    box: box(-m, -w0 / 2 - 1.5, m, len + w1 / 2 + 1.5),
    bevel: Math.min(w0, w1) * 0.45,
    draw: (g) => {
      const p = limbPath(len, w0, w1, o.back ?? 0, o.front ?? 0);
      paint(g, p, col, L, { d: o.d ?? Math.max(1.6, w0 * 0.22), vol: 'x', box: [-w0 / 2, 0, w0 / 2, len], seed: o.seed, after: o.deco, ink: !o.joint });
      if (o.joint) {
        g.save(); g.beginPath(); g.rect(-w0, w0 * 0.3, w0 * 2, len + w1); g.clip();
        g.lineJoin = 'round'; g.lineWidth = L.style === 'B' ? 0.7 : 1.05; g.strokeStyle = L.style === 'B' ? 'rgba(0,0,0,0.85)' : INK; g.stroke(p);
        g.restore();
      }
    },
  };
}

/** Botte vue de profil, orteil vers +x. */
export function bootPath(lw: number, big = false): Path2D {
  const h = lw * 0.62, toe = lw * (big ? 1.75 : 1.55);
  return pathOf([[-lw * 0.55, -h * 1.15], [-lw * 0.72, h * 0.15], [-lw * 0.5, h * 0.6, 1], [toe * 0.98, h * 0.6, 1], [toe * 1.08, h * 0.05], [toe * 0.78, -h * 0.3], [lw * 0.55, -h * 0.6], [lw * 0.38, -h * 1.15, 1]]);
}
export function footPart(L: Look, lw: number, col: string, o: { big?: boolean; deco?: (g) => void } = {}): PartDef {
  const toe = lw * (o.big ? 1.75 : 1.55);
  return {
    box: box(-lw * 0.9, -lw * 0.9, toe * 1.15 + 1.5, lw * 0.6 + 1.6),
    bevel: lw * 0.3,
    draw: (g) => paint(g, bootPath(lw, o.big), col, L, { d: lw * 0.18, vol: 'y', after: o.deco }),
  };
}

/** Poing fermé, pouce sur le dessus (repère : avant-bras vers +y). */
export function fistPart(L: Look, r: number, col: string, o: { rim?: string } = {}): PartDef {
  return {
    box: box(-r * 1.5, -r * 1.4, r * 1.6, r * 1.5),
    bevel: r * 0.5,
    draw: (g) => {
      const p = pathOf([[-r * 0.95, -r * 0.55], [r * 0.2, -r * 1.05], [r * 1.05, -r * 0.5], [r * 1.1, r * 0.45], [r * 0.3, r * 1.0], [-r * 0.8, r * 0.75]]);
      paint(g, p, col, L, { d: r * 0.35, vol: 'r', box: [-r, -r, r, r] });
      // doigts repliés et pouce
      for (let i = 0; i < 3; i++) line(g, [[r * 0.75, -r * 0.35 + i * r * 0.4], [r * 0.25, -r * 0.25 + i * r * 0.42]], r * 0.14, 'rgba(10,8,14,0.55)');
      const t = pathOf([[-r * 0.2, -r * 0.85], [r * 0.6, -r * 1.2], [r * 0.95, -r * 0.85], [r * 0.3, -r * 0.55]]);
      paint(g, t, col, L, { d: r * 0.2, vol: null, brush: 0, lw: L.style === 'B' ? 0.5 : 0.7 });
    },
  };
}

/** Normal map : biseau par défaut d'une pièce sans `bevel`. */
export const DEFAULT_BEVEL = 3;

export { paint, pathOf, limbPath, line, mix, rgba, glowLine, glowDot, INK, TAU };

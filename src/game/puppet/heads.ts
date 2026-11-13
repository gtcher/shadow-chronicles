// @ts-nocheck
/**
 * Têtes des héros en combat : le même dessin que les cartes de sélection (tools/art/heroes.ts), repris
 * ici pour que le visage en jeu soit celui de l'illustration. Repère « carte » : crâne de rayon 50 centré
 * en (0, 0), menton vers (14, 82) ; `heroHead` le met à l'échelle du squelette (rayon headR).
 *
 * Expressions : celles des cartes (calm, fierce, smirk, soft) + `hurt` (yeux plissés) pour le jeu.
 */
import { pathOf, mix, rgba, INK, TAU } from './kit';

const SHADE = '#140a2a';

/** Contour d'un membre : chaîne de [x, y, largeur] → polygone (extrémités arrondies). */
export function limb(chain, sharpEnd = false) {
  const L = [], R = [];
  for (let i = 0; i < chain.length; i++) {
    const a = chain[Math.max(0, i - 1)], b = chain[Math.min(chain.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const w = chain[i][2] / 2, x = chain[i][0], y = chain[i][1];
    L.push([x - dy * w, y + dx * w]); R.push([x + dy * w, y - dx * w]);
    if (i === chain.length - 1) L.push(sharpEnd ? [x + dx * Math.max(w * 2.2, 10), y + dy * Math.max(w * 2.2, 10), 1] : [x + dx * w * 0.9, y + dy * w * 0.9]);
    if (i === 0) R.push([x - dx * w * 0.9, y - dy * w * 0.9]);
  }
  return L.concat(R.reverse());
}

/**
 * Remplit une forme façon « peint encré » : aplat, ombre propre en bas-droite, reflet haut-gauche,
 * liseré de contre-jour à droite, puis trait d'encre.
 */
export function paintCard(g, path, col, o = {}) {
  if (Array.isArray(path)) path = pathOf(path, true);
  g.save();
  if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = o.glowBlur ?? 24; }
  g.fillStyle = col; g.fill(path);
  g.restore();
  g.save(); g.clip(path);
  const big = new Path2D(); big.rect(-5000, -5000, 10000, 10000); big.addPath(path);
  const d = o.d ?? 12;
  if (o.shade !== false) { g.save(); g.translate(-d * 0.7, -d); g.fillStyle = o.dark ?? mix(col, SHADE, 0.5); g.fill(big, 'evenodd'); g.restore(); }
  if (o.light !== false) { g.save(); g.translate(d * 0.5, d * 0.55); g.globalAlpha = 0.55; g.fillStyle = o.hi ?? mix(col, '#fff4e4', 0.28); g.fill(big, 'evenodd'); g.restore(); }
  if (o.rim) { g.save(); g.translate(-(o.rimW ?? 5), (o.rimW ?? 5) * 0.4); g.fillStyle = o.rim; g.globalAlpha = o.rimA ?? 0.9; g.fill(big, 'evenodd'); g.restore(); }
  if (o.after) o.after(g);
  g.restore();
  if (o.ink !== false) { g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = o.lw ?? 3.6; g.strokeStyle = o.inkCol ?? INK; g.stroke(path); g.restore(); }
  return path;
}

/** Trait d'encre (détail intérieur). */
export function lineCard(g, pts, w = 2.4, col = INK, closed = false) {
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = w; g.strokeStyle = col;
  g.stroke(pathOf(pts, closed)); g.restore();
}

/** Mèches / rubans qui flottent : bande effilée suivant une courbe. */
export function ribbon(g, pts, w0, w1, col, o = {}) {
  const chain = pts.map((p, i) => [p[0], p[1], w0 + (w1 - w0) * (i / (pts.length - 1))]);
  return paintCard(g, limb(chain, o.sharp !== false), col, { d: 6, ...o });
}

/** Chevelure en pointes balayées vers l'arrière : angles (degrés) et longueurs des pointes. */
export function spikes(tips, sweep = -0.3, r0 = 58) {
  const pts = [[-40, 10, 1]];
  const P = (a, r) => [Math.cos(a) * r, Math.sin(a) * r, 1];
  for (let i = 0; i < tips.length; i++) {
    const [deg, L] = tips[i], a = (deg * Math.PI) / 180;
    if (i) pts.push(P(((tips[i - 1][0] + deg) / 2) * Math.PI / 180, r0));
    pts.push(P(a + sweep, L));
  }
  pts.push([40, 10, 1]);
  return pts;
}

/**
 * Tête de 3/4 tournée vers la droite. Repère local : crâne de rayon 50 centré en (0, 0), menton vers (14, 80).
 * h : { skin, hair, eye, rim, back(g), front(g) → Path2D de la frange, expr, extra(g) }.
 */
export function head(g, x, y, s, ang, h) {
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
  const k = h.k ?? 1 / s;
  if (h.back) h.back(g);
  // oreille (côté proche)
  paintCard(g, [[-40, 14], [-56, 8], [-60, 26], [-50, 42], [-38, 40]], h.skin, { d: 4, lw: 3 * k, light: false });
  lineCard(g, [[-52, 18], [-55, 28], [-48, 36]], 2 * k, mix(h.skin, '#7a3a30', 0.5));
  // visage
  const face = pathOf([[-48, -12], [-47, 22], [-38, 48], [-18, 68], [12, 82, 1], [36, 62], [48, 34], [52, 4], [46, -24], [0, -40]]);
  paintCard(g, face, h.skin, { d: 7, lw: 3.4 * k, rim: h.rim, rimW: 3, rimA: 0.75, light: false, dark: mix(h.skin, '#b0606a', 0.38) });
  // ombre portée de la frange sur le front
  const fr = h.front ? h.frontPath : null;
  if (fr) { g.save(); g.clip(face); g.translate(-3, 9); g.fillStyle = mix(h.skin, '#a0505e', 0.42); g.fill(fr); g.restore(); }
  // joues
  g.save(); g.globalAlpha = 0.28; g.fillStyle = '#ff7a8a';
  g.beginPath(); g.ellipse(-20, 50, 11, 5, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(36, 48, 7, 4, 0, 0, TAU); g.fill(); g.restore();
  // yeux
  const ex = h.expr ?? 'calm';
  eye(g, -14, 26, 1, h, ex, k);
  eye(g, 30, 24, 0.74, h, ex, k);
  // sourcils
  const bA = ex === 'fierce' ? 0.22 : ex === 'hurt' ? -0.3 : ex === 'soft' ? -0.12 : 0.08;
  g.save(); g.lineCap = 'round'; g.strokeStyle = mix(h.hair, INK, 0.5); g.lineWidth = 4.2 * k;
  g.beginPath(); g.moveTo(-34, 2 - bA * 30); g.quadraticCurveTo(-16, -4, 2, 6 + bA * 20); g.stroke();
  g.lineWidth = 3.4 * k; g.beginPath(); g.moveTo(20, 6 + bA * 18); g.quadraticCurveTo(32, 0, 44, 2 - bA * 20); g.stroke(); g.restore();
  // nez
  lineCard(g, [[22, 44], [24, 51], [19, 53]], 2.2 * k, mix(h.skin, '#6a2a2a', 0.55));
  // bouche
  g.save(); g.lineCap = 'round'; g.strokeStyle = '#5a1e24'; g.lineWidth = 2.6 * k; g.beginPath();
  if (ex === 'hurt') { g.fillStyle = '#5a1e24'; g.beginPath(); g.moveTo(6, 66); g.quadraticCurveTo(18, 56, 30, 64); g.quadraticCurveTo(18, 74, 6, 66); g.fill(); }
  else if (ex === 'fierce') { g.moveTo(6, 64); g.quadraticCurveTo(18, 60, 30, 63); g.stroke(); g.fillStyle = '#7a2a30'; g.beginPath(); g.moveTo(10, 64); g.quadraticCurveTo(19, 70, 27, 63.5); g.closePath(); g.fill(); }
  else if (ex === 'smirk') { g.moveTo(6, 64); g.quadraticCurveTo(18, 66, 30, 59); g.stroke(); }
  else if (ex === 'soft') { g.moveTo(10, 63); g.quadraticCurveTo(18, 67, 26, 63); g.stroke(); }
  else { g.moveTo(8, 64); g.lineTo(26, 63); g.stroke(); }
  g.restore();
  if (h.front) h.front(g);
  if (fr) { // reflet annulaire des cheveux (« anneau d'ange »)
    g.save(); g.clip(fr); g.globalAlpha = 0.32; g.strokeStyle = h.shine ?? '#ffffff'; g.lineWidth = 7;
    g.setLineDash([16, 7]); g.beginPath(); g.ellipse(4, -22, 50, 24, -0.05, Math.PI * 1.08, Math.PI * 1.92); g.stroke(); g.restore();
  }
  if (h.extra) h.extra(g);
  g.restore();
}

function eye(g, cx, cy, sx, h, ex, k) {
  g.save(); g.translate(cx, cy); g.scale(sx, 1);
  if (ex === 'hurt') { // yeux plissés de douleur (> <)
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = 4.6 * k;
    g.beginPath(); g.moveTo(-16, -8); g.lineTo(10, 0); g.lineTo(-14, 8); g.stroke();
    g.restore(); return;
  }
  const narrow = ex === 'fierce' ? 0.8 : 1;
  const top = -14 * narrow, bot = 12;
  const white = pathOf([[-17, 2, 1], [-10, top], [6, top - 1], [17, -6, 1], [14, 6], [2, bot], [-10, 10]]);
  g.fillStyle = '#fbf6f2'; g.fill(white);
  g.save(); g.clip(white);
  // iris
  const ig = g.createLinearGradient(0, top, 0, bot + 2);
  ig.addColorStop(0, mix(h.eye, INK, 0.65)); ig.addColorStop(0.55, h.eye); ig.addColorStop(1, mix(h.eye, '#ffffff', 0.45));
  g.fillStyle = ig; g.beginPath(); g.ellipse(2, 0, 10, 15, 0, 0, TAU); g.fill();
  g.lineWidth = 1.6 * k; g.strokeStyle = mix(h.eye, INK, 0.7); g.stroke();
  g.fillStyle = mix(h.eye, INK, 0.8); g.beginPath(); g.ellipse(2, 0, 4.5, 7, 0, 0, TAU); g.fill();
  // ombre de paupière
  g.fillStyle = 'rgba(40,20,60,.35)'; g.fillRect(-20, top - 2, 40, 6);
  g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(-3, -6, 3.6, 4.6, -0.4, 0, TAU); g.fill();
  g.beginPath(); g.arc(7, 6, 1.8, 0, TAU); g.fill();
  g.restore();
  // paupière supérieure épaisse + cils
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = 4.6 * k;
  g.beginPath(); g.moveTo(-18, 3); g.quadraticCurveTo(-12, top - 3, 4, top - 1.5); g.quadraticCurveTo(14, top, 19, -7); g.lineTo(23, -10); g.stroke();
  g.lineWidth = 1.8 * k; g.beginPath(); g.moveTo(-6, bot + 0.5); g.quadraticCurveTo(6, bot + 1.5, 13, 6); g.stroke();
  g.restore();
  g.restore();
}


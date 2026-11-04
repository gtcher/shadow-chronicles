// @ts-nocheck
/**
 * Illustrations des cartes de sélection : les 4 héros dessinés en grand (plan genoux-tête),
 * dans le style validé « A v2 » (peint encré : trait d'encre, aplats d'ombre, liseré de contre-jour,
 * visages anime). Contrairement au squelette de combat (src/game/rig), qui est pensé pour 96 px,
 * ces figures ont leur propre dessin, pose et détails de costume à la taille de la carte (640×900).
 *
 * Lumière : clé haut-gauche, contre-jour à droite dans la couleur de liseré du héros.
 */
import { mix } from '../../src/game/rig/draw';

const TAU = Math.PI * 2;
const INK = '#0b0a12';
const SHADE = '#140a2a';

function hex2rgb(h) { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
function rgba(h, a) { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; }

// ------------------------------------------------------------------ tracés

/** Chemin lissé fermé (ou ouvert) passant près des points ; un point [x, y, 1] fait un angle vif. */
export function pathOf(pts, closed = true) {
  const p = new Path2D();
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (!closed) {
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n - 1; i++) {
      if (pts[i][2]) p.lineTo(pts[i][0], pts[i][1]);
      else { const m = mid(pts[i], pts[i + 1]); p.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
    }
    p.lineTo(pts[n - 1][0], pts[n - 1][1]);
    return p;
  }
  const ends = (i) => { const q = pts[i], pv = pts[(i + n - 1) % n], nx = pts[(i + 1) % n]; return [pv[2] ? pv : mid(pv, q), nx[2] ? nx : mid(q, nx)]; };
  const first = pts[0][2] ? pts[0] : ends(0)[0];
  p.moveTo(first[0], first[1]);
  for (let i = 0; i < n; i++) {
    const q = pts[i];
    if (q[2]) { p.lineTo(q[0], q[1]); continue; }
    const [a, b] = ends(i);
    p.lineTo(a[0], a[1]); p.quadraticCurveTo(q[0], q[1], b[0], b[1]);
  }
  p.closePath();
  return p;
}

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
export function paint(g, path, col, o = {}) {
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
export function line(g, pts, w = 2.4, col = INK, closed = false) {
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = w; g.strokeStyle = col;
  g.stroke(pathOf(pts, closed)); g.restore();
}

function glowDot(g, x, y, r, col, a = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba('#ffffff', a)); gr.addColorStop(0.18, rgba(col, a * 0.9)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

/** Mèches / rubans qui flottent : bande effilée suivant une courbe. */
function ribbon(g, pts, w0, w1, col, o = {}) {
  const chain = pts.map((p, i) => [p[0], p[1], w0 + (w1 - w0) * (i / (pts.length - 1))]);
  return paint(g, limb(chain, o.sharp !== false), col, { d: 6, ...o });
}

/** Chevelure en pointes balayées vers l'arrière : angles (degrés) et longueurs des pointes. */
function spikes(tips, sweep = -0.3, r0 = 58) {
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

// ------------------------------------------------------------------ tête anime

/**
 * Tête de 3/4 tournée vers la droite. Repère local : crâne de rayon 50 centré en (0, 0), menton vers (14, 80).
 * h : { skin, hair, eye, rim, back(g), front(g) → Path2D de la frange, expr, extra(g) }.
 */
export function head(g, x, y, s, ang, h) {
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
  const k = 1 / s;
  if (h.back) h.back(g);
  // oreille (côté proche)
  paint(g, [[-40, 14], [-56, 8], [-60, 26], [-50, 42], [-38, 40]], h.skin, { d: 4, lw: 3 * k, light: false });
  line(g, [[-52, 18], [-55, 28], [-48, 36]], 2 * k, mix(h.skin, '#7a3a30', 0.5));
  // visage
  const face = pathOf([[-48, -12], [-47, 22], [-38, 48], [-18, 68], [12, 82, 1], [36, 62], [48, 34], [52, 4], [46, -24], [0, -40]]);
  paint(g, face, h.skin, { d: 7, lw: 3.4 * k, rim: h.rim, rimW: 3, rimA: 0.75, light: false, dark: mix(h.skin, '#b0606a', 0.38) });
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
  const bA = ex === 'fierce' ? 0.22 : ex === 'soft' ? -0.12 : 0.08;
  g.save(); g.lineCap = 'round'; g.strokeStyle = mix(h.hair, INK, 0.5); g.lineWidth = 4.2 * k;
  g.beginPath(); g.moveTo(-34, 2 - bA * 30); g.quadraticCurveTo(-16, -4, 2, 6 + bA * 20); g.stroke();
  g.lineWidth = 3.4 * k; g.beginPath(); g.moveTo(20, 6 + bA * 18); g.quadraticCurveTo(32, 0, 44, 2 - bA * 20); g.stroke(); g.restore();
  // nez
  line(g, [[22, 44], [24, 51], [19, 53]], 2.2 * k, mix(h.skin, '#6a2a2a', 0.55));
  // bouche
  g.save(); g.lineCap = 'round'; g.strokeStyle = '#5a1e24'; g.lineWidth = 2.6 * k; g.beginPath();
  if (ex === 'fierce') { g.moveTo(6, 64); g.quadraticCurveTo(18, 60, 30, 63); g.stroke(); g.fillStyle = '#7a2a30'; g.beginPath(); g.moveTo(10, 64); g.quadraticCurveTo(19, 70, 27, 63.5); g.closePath(); g.fill(); }
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

// ------------------------------------------------------------------ mains

function fist(g, x, y, r, ang, skin, o = {}) {
  g.save(); g.translate(x, y); g.rotate(ang);
  paint(g, [[-r, -r * 0.7], [r * 0.7, -r * 0.9], [r * 1.05, -r * 0.2], [r * 0.9, r * 0.8], [-r * 0.4, r * 0.95], [-r * 1.05, r * 0.3]], o.glove ?? skin, { d: r * 0.3, lw: 3, rim: o.rim, rimW: 3 });
  // doigts repliés
  for (let i = 0; i < 3; i++) line(g, [[r * 0.1 + i * r * 0.28, -r * 0.75], [r * 0.25 + i * r * 0.26, -r * 0.2]], 1.8, rgba('#000000', 0.55));
  g.restore();
}

// ------------------------------------------------------------------ cadrage commun

function capeShape(g, pts, col, inner, rim) {
  paint(g, pts, col, { d: 22, dark: mix(col, SHADE, 0.6), rim, rimW: 6, rimA: 0.6 });
}

// ================================================================== REN

function ren(g) {
  const sk = '#eec5a2', coat = '#1e2944', gold = '#e3b54e', gold2 = '#d9a640', hair = '#3d2b1e', rim = '#7fe0ff', leather = '#5a3a22';
  // cape au vent (derrière)
  capeShape(g, [[232, 380], [300, 372], [250, 520], [190, 700], [120, 905, 1], [-10, 905, 1], [40, 760], [110, 560], [170, 420]], '#162038', gold, rim);
  paint(g, [[120, 905, 1], [150, 760], [196, 640], [178, 760], [170, 905, 1]], mix(gold2, SHADE, 0.35), { d: 6, light: false });
  // carquois dans le dos
  g.save(); g.translate(220, 430); g.rotate(-0.42);
  for (let i = 0; i < 4; i++) { const ax = -18 + i * 12; line(g, [[ax, -40], [ax + 2, -150]], 3, '#8a6a44'); paint(g, [[ax + 2, -150], [ax - 8, -184], [ax + 2, -176], [ax + 12, -186]], i % 2 ? '#e8e0d0' : gold, { d: 3, lw: 2 }); }
  paint(g, [[-34, -60], [34, -60], [30, 150], [-30, 150]], leather, { d: 12, rim, rimW: 4, rimA: 0.5 });
  line(g, [[-34, -46], [34, -46]], 5, gold); line(g, [[-32, 120], [30, 120]], 5, gold);
  g.restore();
  // jambes (sous le manteau)
  paint(g, limb([[278, 640, 66], [262, 780, 56], [256, 910, 50]]), '#141a2c', { d: 12, rim, rimW: 4 });
  paint(g, limb([[336, 640, 66], [352, 780, 56], [366, 910, 50]]), '#141a2c', { d: 12, rim, rimW: 4 });
  // pan arrière du manteau
  paint(g, [[246, 560], [358, 560], [392, 700], [430, 905, 1], [372, 905, 1], [330, 700], [290, 700], [240, 905, 1], [178, 905, 1], [214, 700]], coat, { d: 18, rim, rimW: 5 });
  line(g, [[214, 700], [190, 830], [178, 905]], 5, gold); line(g, [[392, 700], [416, 830], [430, 905]], 5, gold);
  // torse
  const torso = paint(g, [[232, 388], [300, 360], [366, 372], [380, 430], [358, 520], [352, 586], [252, 590], [244, 510], [222, 440]], coat, { d: 20, rim, rimW: 6 });
  // plastron doré en V et boutons
  paint(g, [[286, 380], [328, 376], [318, 470], [300, 560], [288, 470]], gold2, { d: 6, lw: 2.6 });
  line(g, [[300, 392], [300, 556]], 2.2, mix(gold2, INK, 0.5));
  for (let i = 0; i < 4; i++) { g.fillStyle = '#fff1c0'; g.beginPath(); g.arc(310, 410 + i * 36, 4, 0, TAU); g.fill(); }
  line(g, [[232, 400], [252, 560]], 5, gold);
  // ceinture
  paint(g, [[246, 560], [356, 556], [358, 590], [248, 594]], leather, { d: 6, lw: 3 });
  paint(g, [[290, 562], [318, 561], [318, 590], [290, 591]], gold, { d: 4, lw: 2.5 });
  // col haut
  paint(g, [[262, 352], [282, 330], [316, 326], [340, 344], [328, 384], [272, 388]], gold2, { d: 8, rim, rimW: 3 });
  // cou + tête
  paint(g, [[284, 300], [318, 300], [320, 350], [288, 352]], '#d9a888', { light: false, d: 10 });
  const hairBangs = pathOf([[-50, 40, 1], [-62, -26], [-38, -66], [6, -74], [48, -62], [66, -30], [62, 22, 1], [52, -8], [44, 16, 1], [34, -14], [22, 20, 1], [12, -14], [0, 14, 1], [-10, -14], [-24, 18, 1], [-32, -8], [-42, 20, 1], [-46, -4]]);
  head(g, 306, 250, 1.08, 0.04, {
    skin: sk, hair, eye: '#c88a2a', rim, expr: 'fierce', frontPath: hairBangs,
    back: (g) => { paint(g, spikes([[150, 82], [190, 100], [228, 106], [266, 102], [304, 92], [342, 78], [20, 66]], -0.24, 68), hair, { d: 12, lw: 3.2, rim, rimW: 4 }); },
    front: (g) => { paint(g, hairBangs, hair, { d: 9, lw: 3.2, rim, rimW: 3, after: (g) => { g.globalAlpha = 0.35; line(g, [[-30, -50], [-10, -30], [4, -8]], 3, '#8a6a4a'); line(g, [[10, -60], [24, -36], [30, -12]], 3, '#8a6a4a'); } }); },
  });
  // bras d'arc (loin) : tendu vers la droite
  paint(g, limb([[360, 386, 50], [448, 356, 40], [540, 340, 34]]), coat, { d: 10, rim, rimW: 5 });
  line(g, [[450, 340], [452, 372]], 5, gold);
  paint(g, limb([[484, 348, 40], [540, 340, 36]]), leather, { d: 6, lw: 3 }); // brassard
  // arc : vertical, ventre vers la cible, pointes qui se replient vers l'archer
  const top = [520, 112], bot = [520, 560], grip = [566, 336];
  const bow = limb([[top[0], top[1], 7], [548, 150, 12], [574, 236, 16], [grip[0], grip[1], 20], [574, 436, 16], [548, 522, 12], [bot[0], bot[1], 7]]);
  // corde tendue jusqu'à la main de tir
  const hand = [284, 346];
  g.save(); g.strokeStyle = '#f5ecd2'; g.lineWidth = 2.2; g.shadowColor = rim; g.shadowBlur = 6;
  g.beginPath(); g.moveTo(top[0] + 4, top[1]); g.lineTo(hand[0], hand[1]); g.lineTo(bot[0] + 4, bot[1]); g.stroke(); g.restore();
  paint(g, bow, gold, { d: 7, lw: 3.2, rim: '#fff3c4', rimW: 3, glow: rgba(gold, 0.7), glowBlur: 18 });
  for (const t of [top, bot]) { g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(t[0] + 2, t[1], 5, 0, TAU); g.fill(); }
  paint(g, [[560, 312], [578, 312], [578, 360], [560, 360]], leather, { d: 4, lw: 2.5 });
  fist(g, 556, 338, 18, -0.1, sk, { glove: '#2a2030', rim });
  // flèche : horizontale, pointe lumineuse au-delà de l'arc
  g.save(); g.shadowColor = rim; g.shadowBlur = 14; line(g, [[hand[0] - 6, hand[1] + 4], [612, 338]], 4.2, '#d9c7a0'); g.restore();
  paint(g, [[hand[0] - 30, hand[1] - 4], [hand[0] - 4, hand[1]], [hand[0] - 4, hand[1] + 8], [hand[0] - 30, hand[1] + 12], [hand[0] - 20, hand[1] + 4]], '#e8e0d0', { d: 3, lw: 2 });
  g.save(); g.globalCompositeOperation = 'lighter'; glowDot(g, 618, 338, 46, rim, 0.9); g.restore();
  paint(g, [[606, 326], [640, 338, 1], [606, 350], [612, 338]], '#dffbff', { glow: rim, glowBlur: 26, d: 3, lw: 2.4, light: false });
  // bras de tir (proche) : coude en arrière, main à la joue
  paint(g, limb([[238, 398, 54], [178, 360, 44], [168, 352, 42]]), coat, { d: 12, rim, rimW: 4 });
  paint(g, limb([[176, 350, 42], [236, 348, 36], [hand[0] - 6, hand[1] + 4, 32]]), coat, { d: 10, rim, rimW: 4 });
  paint(g, limb([[226, 350, 38], [hand[0] - 8, hand[1] + 4, 34]]), leather, { d: 6, lw: 3 });
  line(g, [[204, 344], [208, 366]], 5, gold);
  fist(g, hand[0], hand[1] + 2, 17, 0.2, sk, { glove: '#2a2030', rim });
}

// ================================================================== TARO

function taro(g) {
  const sk = '#efc6a4', armor = '#2a2a33', red = '#c4202e', metal = '#5f5c6c', hair = '#221a20', rim = '#ff7a5c';
  // cape déchirée
  capeShape(g, [[226, 392], [372, 388], [330, 520], [260, 700], [220, 905, 1], [150, 860, 1], [110, 905, 1], [60, 820, 1], [10, 870, 1], [40, 700], [120, 520]], '#6e121b', red, rim);
  // espadon posé sur l'épaule : lame derrière la tête, garde devant la poitrine
  g.save(); g.translate(318, 474); g.rotate(-2.42);
  const BL = 470;
  paint(g, [[30, -26, 1], [BL, -22], [BL + 54, 0, 1], [BL, 22], [30, 26, 1]], '#c9ccd8', { d: 10, lw: 3.6, rim: '#ffd0c0', rimW: 4, glow: rgba('#ff3a2a', 0.55), glowBlur: 28,
    after: (g) => { g.fillStyle = 'rgba(80,80,100,.55)'; g.fillRect(30, 0, BL + 60, 30); g.fillStyle = 'rgba(255,60,50,.85)'; g.fillRect(40, -6, BL - 40, 5); } });
  line(g, [[34, 0], [BL + 40, 0]], 2, 'rgba(10,10,20,.6)');
  paint(g, [[10, -62, 1], [36, -56], [36, 56], [10, 62, 1], [20, 0]], metal, { d: 6, lw: 3.2 }); // garde
  paint(g, [[18, -12], [-80, -10], [-80, 10], [18, 12]], '#3a1a1e', { d: 5, lw: 3 }); // fusée
  for (let i = 0; i < 5; i++) line(g, [[-70 + i * 18, -10], [-62 + i * 18, 10]], 2.4, '#7a2a30');
  g.save(); g.shadowColor = '#ff3a2a'; g.shadowBlur = 16; paint(g, [[-80, -16], [-104, 0], [-80, 16], [-92, 0]], red, { d: 4, lw: 2.6 }); g.restore();
  g.restore();
  // jambes
  paint(g, limb([[270, 650, 74], [252, 780, 62], [244, 910, 58]]), armor, { d: 14, rim, rimW: 4 });
  paint(g, limb([[344, 650, 74], [372, 780, 62], [390, 910, 58]]), armor, { d: 14, rim, rimW: 4 });
  for (const [x, y] of [[254, 770], [370, 770]]) paint(g, [[x - 34, y - 26], [x + 30, y - 30], [x + 34, y + 16], [x, y + 36], [x - 34, y + 14]], metal, { d: 8, lw: 3, rim, rimW: 3 });
  // jupe de plates + tabard
  paint(g, [[236, 590], [372, 590], [400, 700], [210, 700]], metal, { d: 12, rim, rimW: 4 });
  for (let i = 0; i < 4; i++) line(g, [[222 + i * 2, 618 + i * 22], [386 - i * 2, 618 + i * 22]], 2.4, rgba(INK, 0.8));
  paint(g, [[284, 592], [334, 592], [342, 760], [310, 790, 1], [276, 760]], red, { d: 10, rim, rimW: 3 });
  // torse cuirassé
  paint(g, [[220, 394], [300, 370], [384, 384], [392, 450], [372, 540], [370, 600], [238, 604], [232, 530], [212, 460]], armor, { d: 22, rim, rimW: 6 });
  paint(g, [[246, 420], [300, 404], [360, 418], [354, 500], [304, 528], [252, 500]], metal, { d: 12, lw: 3, rim, rimW: 4 });
  paint(g, [[284, 444], [318, 444], [301, 486, 1]], red, { d: 4, lw: 2.4, glow: rgba(red, 0.9), glowBlur: 14 }); // emblème
  for (let i = 0; i < 3; i++) line(g, [[240, 540 + i * 20], [370, 540 + i * 20]], 2.4, rgba(INK, 0.8));
  paint(g, [[236, 590], [372, 588], [372, 612], [236, 614]], '#3a1a1e', { d: 4, lw: 3 }); // ceinture
  paint(g, [[290, 588], [322, 588], [322, 614], [290, 614]], '#a8a4b4', { d: 4, lw: 2.4 });
  // cou + tête : cheveux en pointes, bandeau rouge dont les pans volent
  paint(g, [[282, 308], [322, 308], [326, 372], [284, 376]], '#d9a888', { light: false, d: 12 });
  paint(g, [[256, 362], [300, 348], [352, 358], [340, 392], [266, 394]], metal, { d: 8, lw: 3 }); // gorgerin
  const bangs = pathOf([[-52, 34, 1], [-60, -30], [-30, -62], [10, -68], [48, -56], [62, -24], [60, 20, 1], [48, -12], [40, 20, 1], [28, -14], [16, 22, 1], [4, -14], [-8, 18, 1], [-20, -12], [-34, 24, 1], [-42, -6]]);
  head(g, 306, 258, 1.08, 0.02, {
    skin: sk, hair, eye: '#c42a36', rim, expr: 'smirk', frontPath: bangs,
    back: (g) => {
      // pans du bandeau
      ribbon(g, [[-52, -26], [-110, -10], [-170, -36], [-232, -4]], 22, 8, '#d02634', { rim, rimW: 3 });
      ribbon(g, [[-52, -20], [-100, 18], [-160, 20], [-210, 56]], 18, 6, '#a81c28', { rim, rimW: 3 });
      paint(g, spikes([[150, 98], [186, 128], [222, 136], [258, 132], [294, 120], [330, 104], [4, 84], [32, 70]], -0.3, 72), hair, { d: 12, lw: 3.2, rim, rimW: 4 });
    },
    front: (g) => {
      paint(g, bangs, hair, { d: 9, lw: 3.2, rim, rimW: 3 });
      paint(g, [[-58, -30], [-20, -42], [30, -40], [62, -30], [62, -16], [30, -26], [-20, -28], [-60, -14]], '#d02634', { d: 4, lw: 3, rim, rimW: 3 });
      paint(g, [[-6, -38], [14, -38], [14, -26], [-6, -26]], '#c9ccd8', { d: 3, lw: 2.2 });
    },
    extra: (g) => { line(g, [[-36, 40], [-26, 50]], 2.4, '#b04050'); }, // cicatrice
  });
  // épaulières
  paint(g, [[184, 446, 1], [214, 430], [270, 414, 1], [262, 448], [214, 462]], mix(metal, '#000', .2), { d: 8, lw: 3.2, rim, rimW: 4 });
  paint(g, [[176, 428, 1], [190, 378], [236, 352], [282, 368], [280, 404, 1], [234, 420]], metal, { d: 14, lw: 3.4, rim, rimW: 5 });
  line(g, [[196, 396], [262, 388]], 3, red);
  paint(g, [[350, 418, 1], [396, 434], [430, 430, 1], [420, 452], [390, 456]], mix(metal, '#000', .2), { d: 8, lw: 3.2, rim, rimW: 4 });
  paint(g, [[336, 372, 1], [376, 356], [414, 374], [428, 424, 1], [394, 428], [348, 410]], metal, { d: 14, lw: 3.4, rim, rimW: 5 });
  // bras : les deux mains sur la fusée devant la poitrine
  paint(g, limb([[396, 410, 50], [414, 480, 44], [372, 528, 38]]), armor, { d: 12, rim, rimW: 5 });
  paint(g, limb([[234, 420, 54], [222, 500, 46], [290, 494, 40]]), armor, { d: 12, rim, rimW: 4 });
  paint(g, limb([[236, 480, 50], [222, 504, 48], [284, 496, 44]]), metal, { d: 8, lw: 3, rim, rimW: 3 }); // canon d'avant-bras
  fist(g, 300, 490, 20, -0.7, sk, { glove: '#3a3640', rim });
  fist(g, 364, 526, 20, -0.7, sk, { glove: '#3a3640', rim });
}

// ================================================================== MEI

function mei(g) {
  const sk = '#f6d2bc', suit = '#1f1726', pink = '#ff3fb4', mag = '#b8277f', hair = '#1a1020', rim = '#ff9be0', wrap = '#e8dce4';
  // queue de cheval et écharpe qui volent vers la gauche
  ribbon(g, [[268, 384], [214, 404], [160, 384], [110, 404], [60, 440], [10, 430]], 44, 8, pink, { rim, rimW: 4, dark: mix(pink, SHADE, 0.55) });
  ribbon(g, [[262, 394], [210, 446], [160, 468], [110, 500], [60, 560]], 34, 6, mag, { rim, rimW: 3 });
  // jambes : appui fléchi, prête à bondir
  paint(g, limb([[276, 640, 64], [226, 760, 54], [240, 910, 46]]), suit, { d: 12, rim, rimW: 4 });
  paint(g, limb([[340, 640, 64], [388, 770, 54], [372, 910, 46]]), suit, { d: 12, rim, rimW: 4 });
  paint(g, limb([[230, 744, 58], [234, 910, 50]]), '#120c16', { d: 10, rim, rimW: 4 }); // cuissardes
  paint(g, limb([[384, 752, 58], [374, 910, 50]]), '#120c16', { d: 10, rim, rimW: 4 });
  line(g, [[204, 748], [258, 742]], 4, pink); line(g, [[358, 756], [412, 750]], 4, pink);
  // short / jupe courte fendue
  paint(g, [[252, 586, 1], [354, 584, 1], [386, 668, 1], [342, 654], [314, 694, 1], [292, 652], [262, 694, 1], [224, 664, 1]], mag, { d: 10, rim, rimW: 4 });
  // torse : tenue moulante, panneaux magenta, taille fine
  paint(g, [[246, 392], [306, 376], [362, 390], [362, 450], [340, 520], [350, 592], [256, 594], [266, 520], [244, 452]], suit, { d: 18, rim, rimW: 6 });
  paint(g, [[288, 394], [326, 392], [334, 470], [308, 590], [288, 590], [276, 470]], mag, { d: 6, lw: 2.4 });
  line(g, [[260, 470], [348, 462]], 3, pink);
  paint(g, [[262, 572], [346, 570], [348, 594], [260, 596]], '#2a1830', { d: 4, lw: 3 });
  g.save(); g.shadowColor = pink; g.shadowBlur = 12; paint(g, [[296, 574], [312, 574], [312, 594], [296, 594]], pink, { d: 3, lw: 2 }); g.restore();
  // cou + écharpe enroulée
  paint(g, [[288, 320], [322, 320], [324, 372], [290, 374]], '#e3b8a2', { light: false, d: 10 });
  paint(g, [[252, 372, 1], [300, 352], [360, 360, 1], [354, 396, 1], [300, 404], [256, 400, 1]], pink, { d: 10, rim, rimW: 4, dark: mix(pink, SHADE, 0.55) });
  line(g, [[264, 380], [344, 374]], 2.4, rgba(INK, 0.6));
  const bangs = pathOf([[-54, 46, 1], [-60, -28], [-32, -64], [12, -70], [50, -56], [64, -20], [60, 40, 1], [50, -4], [40, 16, 1], [30, -12], [18, 12, 1], [6, -14], [-6, 16, 1], [-18, -10], [-30, 18, 1], [-40, -6]]);
  head(g, 310, 262, 1.06, -0.05, {
    skin: sk, hair, eye: '#e0287f', rim, expr: 'smirk', frontPath: bangs,
    back: (g) => {
      // grande queue de cheval
      ribbon(g, [[-10, -70], [-70, -96], [-150, -70], [-210, -20], [-250, 40], [-300, 70]], 56, 10, hair, { rim, rimW: 4 });
      ribbon(g, [[-20, -60], [-90, -50], [-150, 0], [-190, 70]], 34, 8, hair, { rim, rimW: 3 });
      paint(g, [[-60, 40, 1], [-70, -20], [-48, -60], [0, -74], [48, -60], [66, -20], [62, 30, 1], [40, 10], [-40, 10]], hair, { d: 10, lw: 3.2, rim, rimW: 3 });
      // nœud rose
      paint(g, [[-24, -76], [-46, -96], [-40, -64], [-8, -70], [0, -96], [6, -64]], pink, { d: 4, lw: 2.6, glow: rgba(pink, 0.6), glowBlur: 10 });
    },
    front: (g) => {
      paint(g, bangs, hair, { d: 9, lw: 3.2, rim, rimW: 3, after: (g) => { g.globalAlpha = 0.4; line(g, [[-26, -50], [-14, -26]], 3, '#7a4a8a'); line(g, [[16, -58], [26, -30]], 3, '#7a4a8a'); } });
      // mèches latérales
      ribbon(g, [[52, 10], [58, 50], [52, 92]], 14, 4, hair, { rim, rimW: 2 });
      ribbon(g, [[-50, 10], [-54, 50], [-46, 96]], 16, 4, hair, { rim, rimW: 2 });
    },
  });
  // bras loin : dague en prise inversée, tendue vers l'avant
  paint(g, limb([[360, 404, 40], [430, 450, 34], [492, 444, 30]]), suit, { d: 8, rim, rimW: 4 });
  for (let i = 0; i < 4; i++) line(g, [[440 + i * 12, 432], [436 + i * 12, 462]], 4, wrap);
  dagger(g, 500, 444, 1.25, pink, rim);
  fist(g, 500, 444, 16, 0.3, sk, { glove: '#2a1830', rim });
  // bras proche : levé près du visage, lame le long de l'avant-bras
  paint(g, limb([[256, 410, 44], [196, 456, 36], [214, 360, 30]]), suit, { d: 8, rim, rimW: 4 });
  for (let i = 0; i < 4; i++) line(g, [[190 + i * 4, 438 - i * 18], [222 + i * 4, 440 - i * 18]], 4, wrap);
  dagger(g, 216, 348, -2.6, pink, rim);
  fist(g, 216, 350, 16, -1.2, sk, { glove: '#2a1830', rim });
}

function dagger(g, x, y, ang, col, rim) {
  g.save(); g.translate(x, y); g.rotate(ang);
  paint(g, [[10, -9, 1], [120, -4], [150, 0, 1], [120, 6], [10, 9, 1]], '#d8d4e4', { d: 4, lw: 2.8, rim: '#ffffff', rimW: 2, glow: rgba(col, 0.75), glowBlur: 22,
    after: (g) => { g.fillStyle = rgba(col, 0.8); g.fillRect(20, -2, 110, 3); } });
  paint(g, [[0, -20, 1], [14, -16], [14, 16], [0, 20, 1]], '#6a5a70', { d: 3, lw: 2.4 });
  paint(g, [[0, -6], [-34, -6], [-34, 6], [0, 6]], '#3a2040', { d: 3, lw: 2.4 });
  g.save(); g.shadowColor = col; g.shadowBlur = 10; g.fillStyle = col; g.beginPath(); g.arc(-38, 0, 6, 0, TAU); g.fill(); g.restore();
  g.restore();
}

// ================================================================== SENA

function sena(g) {
  const sk = '#f6dccb', robe = '#23437f', white = '#e7ecf8', gold = '#e3c06a', hair = '#e4ebf6', rim = '#cfe4ff', blue = '#4f8dff';
  // longue chevelure, derrière tout
  const lock = (pts, w) => ribbon(g, pts, w, 6, hair, { rim, rimW: 4, dark: '#9fb0d0', d: 10 });
  lock([[250, 280], [212, 380], [222, 460], [184, 560], [176, 650], [120, 750]], 64);
  lock([[262, 300], [240, 400], [250, 480], [222, 580], [212, 690]], 44);
  lock([[364, 290], [392, 380], [380, 460], [408, 540], [430, 640]], 46);
  lock([[352, 300], [372, 400], [360, 480], [374, 570]], 32);
  // bâton : vertical, tenu de la main loin, croissant lumineux au sommet
  const sx = 476;
  paint(g, [[sx - 8, 150], [sx + 8, 150], [sx + 10, 910], [sx - 10, 910]], '#6a4a2a', { d: 6, lw: 3, rim, rimW: 3 });
  for (const y of [250, 600]) paint(g, [[sx - 13, y], [sx + 13, y], [sx + 13, y + 22], [sx - 13, y + 22]], gold, { d: 4, lw: 2.4 });
  g.save(); g.globalCompositeOperation = 'lighter'; glowDot(g, sx, 104, 120, blue, 0.75); g.restore();
  paint(g, [[sx - 6, 160], [sx - 58, 124], [sx - 66, 60], [sx - 30, 18, 1], [sx - 40, 70], [sx - 22, 118], [sx + 10, 140], [sx + 46, 120], [sx + 58, 84], [sx + 60, 120], [sx + 30, 154], [sx + 6, 162]], gold, { d: 6, lw: 3, rim: '#fff4c8', rimW: 3, glow: rgba(blue, 0.8), glowBlur: 20 });
  paint(g, [[sx, 70], [sx + 18, 100], [sx, 132], [sx - 18, 100]], '#bfe0ff', { glow: blue, glowBlur: 30, d: 5, lw: 2.6, light: false });
  // robe longue
  paint(g, [[244, 560], [362, 560], [410, 720], [446, 905, 1], [168, 905, 1], [200, 720]], robe, { d: 22, rim, rimW: 6 });
  paint(g, [[284, 560], [326, 560], [352, 905, 1], [262, 905, 1]], white, { d: 10, lw: 3 });
  line(g, [[284, 560], [262, 905]], 6, gold); line(g, [[326, 560], [352, 905]], 6, gold);
  line(g, [[200, 720], [168, 905]], 5, gold); line(g, [[410, 720], [446, 905]], 5, gold);
  // corsage
  paint(g, [[246, 392], [306, 374], [364, 388], [366, 450], [346, 520], [356, 572], [250, 574], [262, 520], [242, 452]], robe, { d: 18, rim, rimW: 6 });
  paint(g, [[284, 388], [328, 386], [322, 480], [304, 560], [290, 480]], white, { d: 6, lw: 2.6 });
  line(g, [[284, 388], [290, 480], [304, 560], [322, 480], [328, 386]], 4, gold);
  g.save(); g.shadowColor = blue; g.shadowBlur = 12; paint(g, [[306, 420], [318, 436], [306, 452], [294, 436]], '#8fc4ff', { d: 3, lw: 2 }); g.restore();
  paint(g, [[250, 552], [358, 550], [360, 578], [250, 580]], '#16305e', { d: 4, lw: 3 });
  line(g, [[250, 566], [360, 564]], 3, gold);
  // cou + col montant
  paint(g, [[288, 318], [326, 318], [326, 372], [290, 374]], '#e6c4b2', { light: false, d: 12 });
  paint(g, [[270, 360, 1], [306, 368], [344, 356, 1], [352, 396], [306, 404], [262, 398]], white, { d: 8, lw: 3, rim, rimW: 3 });
  line(g, [[270, 360], [306, 368], [344, 356]], 4, gold);
  const bangs = pathOf([[-60, 40, 1], [-60, -26], [-30, -60], [12, -66], [48, -54], [62, -20], [60, 30, 1], [48, 0], [38, 22, 1], [28, -6], [14, 14, 1], [2, -10], [-12, 16, 1], [-24, -4], [-38, 26, 1], [-46, 0]]);
  head(g, 308, 256, 1.06, -0.02, {
    skin: sk, hair, eye: '#3a7aff', rim, expr: 'soft', frontPath: bangs,
    back: (g) => { paint(g, [[-66, 80], [-74, -10], [-54, -60], [0, -76], [52, -62], [72, -10], [70, 90], [40, 40], [-40, 40]], hair, { d: 12, lw: 3, rim, rimW: 3, dark: '#a8b8d8' }); },
    front: (g) => {
      paint(g, bangs, hair, { d: 9, lw: 3, rim, rimW: 3, dark: '#a8b8d8', after: (g) => { g.globalAlpha = 0.5; line(g, [[-30, -50], [-16, -24]], 3, '#ffffff'); line(g, [[14, -58], [24, -32]], 3, '#ffffff'); } });
      ribbon(g, [[56, 14], [64, 70], [58, 130]], 18, 6, hair, { rim, rimW: 2, dark: '#a8b8d8' });
      ribbon(g, [[-54, 14], [-62, 70], [-52, 140]], 20, 6, hair, { rim, rimW: 2, dark: '#a8b8d8' });
      // diadème doré + gemme
      line(g, [[-58, -22], [-20, -38], [24, -38], [60, -22]], 4.4, gold);
      g.save(); g.shadowColor = blue; g.shadowBlur = 14; paint(g, [[0, -48], [10, -38], [0, -28], [-10, -38]], '#9fd0ff', { d: 3, lw: 2 }); g.restore();
    },
  });
  // manche loin + main sur le bâton
  paint(g, limb([[360, 400, 44], [420, 470, 46], [462, 470, 40]]), robe, { d: 10, rim, rimW: 5 });
  paint(g, [[408, 448], [468, 440], [486, 520], [470, 590, 1], [440, 560], [404, 580, 1], [398, 500]], white, { d: 10, lw: 3, rim, rimW: 3 });
  line(g, [[486, 520], [470, 590], [440, 560], [404, 580]], 4, gold);
  fist(g, sx, 470, 17, -1.4, sk, { rim });
  // bras proche : paume levée, orbe de lune
  paint(g, limb([[254, 404, 44], [214, 480, 40], [196, 450, 34]]), robe, { d: 10, rim, rimW: 4 });
  paint(g, [[174, 466], [236, 486], [252, 548], [232, 618, 1], [200, 586], [150, 610, 1], [156, 540]], white, { d: 10, lw: 3, rim, rimW: 3 });
  line(g, [[252, 548], [232, 618], [200, 586], [150, 610]], 4, gold);
  paint(g, [[176, 446], [206, 432], [222, 436], [214, 452], [182, 462]], sk, { d: 4, lw: 2.8, light: false });
  for (let i = 0; i < 3; i++) line(g, [[194 + i * 8, 438], [200 + i * 8, 424]], 3.2, INK);
  g.save(); g.globalCompositeOperation = 'lighter'; glowDot(g, 204, 394, 70, blue, 0.9); g.restore();
  paint(g, pathOf([[204, 372], [224, 382], [228, 400], [214, 416], [194, 414], [182, 398], [186, 380]]), '#d8ecff', { glow: blue, glowBlur: 30, d: 6, lw: 2.4, light: false });
  g.save(); g.strokeStyle = rgba('#cfe4ff', 0.7); g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(204, 396, 44 + i * 14, 14 + i * 4, -0.3, 0, TAU); g.stroke(); } g.restore();
}

export const HEROES = { ren, taro, mei, sena };

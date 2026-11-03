// @ts-nocheck
/**
 * Peintre procédural des fonds de menu et des illustrations de sélection des héros.
 * Tout est dessiné en Canvas 2D, puis exporté en WebP par tools/art/render.mjs.
 *
 * - `menu-ch1..ch4` (1920×1080) : panoramas des 4 chapitres (DA §4), un par région de vagues.
 * - `select-<héros>` (640×900) : carte de sélection, héros v2 (piste A) en pied devant une scène
 *   à sa couleur signature, contre-jour dans la couleur de liseré.
 *
 * Règles DA respectées : nuit éclairée par quelques sources fortes, lumière haut-gauche
 * (la lune peut être à droite : c'est alors un contre-jour), sol sombre, une couleur = une info.
 */
import { CAST, RIG, renderSprite, mix } from '../../src/game/rig/draw';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ outils

function rng(seed) {
  let s = seed >>> 0 || 1;
  const f = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
  f.range = (a, b) => a + (b - a) * f();
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}
function hex2rgb(h) { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
function rgba(h, a) { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }
function ctx2(c) { return c.getContext('2d'); }
/** Bruit de valeur 1D lissé, pour les lignes d'horizon. */
function noise1(r, n) { const v = Array.from({ length: n + 1 }, () => r()); return (x) => { const i = Math.floor(x), t = x - i, a = v[i % n], b = v[(i + 1) % n]; const s = t * t * (3 - 2 * t); return a + (b - a) * s; }; }
function fbm1(r, oct = 4) { const ns = Array.from({ length: oct }, () => noise1(r, 64)); return (x) => { let s = 0, a = 0.5, f = 1, n = 0; for (const fn of ns) { s += fn(x * f) * a; n += a; a *= 0.5; f *= 2.1; } return s / n; }; }

const images = {};
export async function loadImages(urls) {
  await Promise.all(Object.entries(urls).map(([k, u]) => new Promise((res, rej) => { const im = new Image(); im.onload = () => { images[k] = im; res(); }; im.onerror = rej; im.src = u; })));
}

// ------------------------------------------------------------------ chapitres

/** Palettes reprises du guide DA (§4), étendues pour le ciel. */
export const CHAPTERS = {
  ch1: { name: 'La Cour des Veilleurs', seed: 11,
    skyTop: '#03060d', skyMid: '#0b1626', horizon: '#26364c', moon: '#dfe8f4', moonHalo: '#9fb4d4', moonVeil: 0.55,
    glow: '#ffb35c', fog: '#6f84a6', far: '#1a2636', mid: '#0d141e', near: '#05080d', rim: '#a9bfdc',
    stone: ['#1b2430', '#2b3644', '#3d4a58', '#56626e'], particles: 'motes', accent: '#ffb35c' },
  ch2: { name: 'Les Remparts écarlates', seed: 23,
    skyTop: '#070304', skyMid: '#1d0a0a', horizon: '#6a2414', moon: '#ffb48a', moonHalo: '#ff6a3a', moonVeil: 0.75,
    glow: '#ff7a2a', fog: '#7a3a2a', far: '#2a1210', mid: '#140808', near: '#070303', rim: '#ff9a5a',
    stone: ['#1d1013', '#33191b', '#4a2723', '#6a3a2c'], particles: 'embers', accent: '#ff7a2a' },
  ch3: { name: 'La Nécropole lunaire', seed: 37,
    skyTop: '#02050d', skyMid: '#081428', horizon: '#20385a', moon: '#f2f8ff', moonHalo: '#bfe6ff', moonVeil: 0.15,
    glow: '#bfe6ff', fog: '#7aa0c8', far: '#13223a', mid: '#0a1424', near: '#040810', rim: '#cfe9ff',
    stone: ['#0e1626', '#1a2940', '#2c4260', '#4f6c8e'], particles: 'snow', accent: '#bfe6ff' },
  ch4: { name: 'La Porte de l’Éclipse', seed: 53,
    skyTop: '#030208', skyMid: '#0e0820', horizon: '#2e1a4e', moon: '#000000', moonHalo: '#b46bff', moonVeil: 0, eclipse: true,
    glow: '#b46bff', fog: '#5b3f8a', far: '#1a1230', mid: '#0d0a1a', near: '#05030a', rim: '#d2a8ff',
    stone: ['#0d0a17', '#1b1430', '#2c2148', '#45346a'], particles: 'void', accent: '#b46bff' },
};

// ------------------------------------------------------------------ couches

function sky(g, W, H, hz, P, r, moon) {
  const gr = g.createLinearGradient(0, 0, 0, hz);
  gr.addColorStop(0, P.skyTop); gr.addColorStop(0.55, P.skyMid); gr.addColorStop(1, P.horizon);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // lueur de la lune / de l'horizon
  const lg = g.createRadialGradient(moon.x, moon.y, 0, moon.x, moon.y, Math.max(W, H) * 0.7);
  lg.addColorStop(0, rgba(P.moonHalo, 0.24)); lg.addColorStop(0.25, rgba(P.moonHalo, 0.07)); lg.addColorStop(1, rgba(P.moonHalo, 0));
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  // étoiles
  g.save();
  for (let i = 0; i < W * 0.22; i++) {
    const x = r() * W, y = r() * hz * 0.85, d = Math.hypot(x - moon.x, y - moon.y);
    if (d < moon.r * 2.5) continue;
    const a = r() * 0.7 * Math.min(1, (hz * 0.9 - y) / (hz * 0.5));
    g.fillStyle = `rgba(220,230,255,${a * 0.6})`;
    const s = r() < 0.04 ? 1.8 : 0.9;
    g.fillRect(x, y, s, s);
  }
  g.restore();
}

function moonDisk(g, P, moon, r) {
  const { x, y, r: R } = moon;
  g.save();
  if (P.eclipse) {
    // couronne violette + disque noir
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const cg = g.createRadialGradient(x, y, R * 0.9, x, y, R * (1.6 + i * 0.5));
      cg.addColorStop(0, rgba('#e8d0ff', 0.5 / (i + 1))); cg.addColorStop(0.2, rgba(P.moonHalo, 0.35 / (i + 1))); cg.addColorStop(1, rgba(P.moonHalo, 0));
      g.fillStyle = cg; g.beginPath(); g.arc(x, y, R * (1.6 + i * 0.5), 0, TAU); g.fill();
    }
    // jets de la couronne
    g.strokeStyle = rgba('#d8b8ff', 0.22); g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const a = r() * TAU, l = R * (1.15 + r() * 0.9);
      g.lineWidth = 0.6 + r() * 1.6;
      g.beginPath(); g.moveTo(x + Math.cos(a) * R, y + Math.sin(a) * R);
      g.quadraticCurveTo(x + Math.cos(a + 0.08) * (R + l) * 0.6, y + Math.sin(a + 0.08) * (R + l) * 0.6, x + Math.cos(a + 0.05) * l, y + Math.sin(a + 0.05) * l); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#040208'; g.beginPath(); g.arc(x, y, R, 0, TAU); g.fill();
    g.strokeStyle = rgba('#f4e8ff', 0.85); g.lineWidth = 2; g.shadowColor = '#c08bff'; g.shadowBlur = 18;
    g.beginPath(); g.arc(x, y, R, 0, TAU); g.stroke();
    g.restore(); return;
  }
  g.globalCompositeOperation = 'lighter';
  const hg = g.createRadialGradient(x, y, R * 0.8, x, y, R * 4);
  hg.addColorStop(0, rgba(P.moonHalo, 0.45)); hg.addColorStop(1, rgba(P.moonHalo, 0));
  g.fillStyle = hg; g.beginPath(); g.arc(x, y, R * 4, 0, TAU); g.fill();
  g.globalCompositeOperation = 'source-over';
  const mg = g.createRadialGradient(x - R * 0.35, y - R * 0.35, R * 0.1, x, y, R);
  mg.addColorStop(0, '#ffffff'); mg.addColorStop(0.6, P.moon); mg.addColorStop(1, mix(P.moon, P.moonHalo, 0.5));
  g.fillStyle = mg; g.beginPath(); g.arc(x, y, R, 0, TAU); g.fill();
  // mers lunaires
  g.save(); g.beginPath(); g.arc(x, y, R, 0, TAU); g.clip();
  g.filter = `blur(${R * 0.06}px)`; g.fillStyle = rgba(mix(P.moonHalo, '#203048', 0.6), 0.12);
  for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(x + r.range(-0.7, 0.7) * R, y + r.range(-0.7, 0.7) * R, R * r.range(0.08, 0.3), R * r.range(0.06, 0.22), r() * 3, 0, TAU); g.fill(); }
  g.restore();
  g.restore();
}

function clouds(g, W, H, hz, P, r, moon, n, band) {
  const c = canvas(W, H), cg = ctx2(c);
  for (let i = 0; i < n; i++) {
    const y = r.range(band[0], band[1]) * hz, x = r.range(-0.1, 1.1) * W;
    const w = r.range(0.12, 0.35) * W, h = w * r.range(0.08, 0.16);
    const near = 1 - Math.min(1, Math.hypot(x - moon.x, y - moon.y) / (W * 0.45));
    const base = mix(P.skyMid, P.horizon, y / hz * 0.7);
    for (let k = 0; k < 9; k++) {
      const ox = r.range(-0.5, 0.5) * w, oy = r.range(-0.5, 0.4) * h;
      const gr = cg.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, w * 0.35);
      gr.addColorStop(0, rgba(mix(base, P.moonHalo, 0.15 + near * 0.5), 0.32)); gr.addColorStop(1, rgba(base, 0));
      cg.fillStyle = gr; cg.beginPath(); cg.ellipse(x + ox, y + oy, w * 0.35, h * 0.9, 0, 0, TAU); cg.fill();
    }
    // liseré lumineux côté lune
    cg.fillStyle = rgba(P.moonHalo, 0.08 + near * 0.18);
    cg.beginPath(); cg.ellipse(x + (moon.x > x ? w * 0.08 : -w * 0.08), y - h * 0.35, w * 0.3, h * 0.22, 0, 0, TAU); cg.fill();
  }
  g.save(); g.filter = 'blur(6px)'; g.drawImage(c, 0, 0); g.restore();
}

/** Montagnes / collines lointaines. */
function ridge(g, W, hz, P, r, height, color, rough = 1) {
  const f = fbm1(r, 5);
  const off = r() * 50;
  g.fillStyle = color; g.beginPath(); g.moveTo(0, hz + 40);
  for (let x = 0; x <= W; x += 4) g.lineTo(x, hz - f(off + x / W * 6 * rough) * height);
  g.lineTo(W, hz + 40); g.closePath(); g.fill();
}

/** Silhouette de citadelle (tours, flèches, remparts) + fenêtres éclairées et liseré. */
function citadel(g, W, hz, P, r, o) {
  const { x0, x1, base, hMin, hMax, color, rimSide, rim, lights, fire } = o;
  const towers = [];
  let x = x0;
  while (x < x1) {
    const w = r.range(o.wMin, o.wMax), h = r.range(hMin, hMax) * (1 - 0.5 * Math.abs((x - (x0 + x1) / 2) / ((x1 - x0) / 2)) ** 2);
    towers.push({ x, w, h, top: r.pick(o.tops) });
    x += w + r.range(o.gap * 0.4, o.gap * 1.6);
  }
  const shape = new Path2D();
  // rempart continu
  const wallH = hMin * 0.45;
  shape.rect(x0 - 10, base - wallH, x1 - x0 + 20, wallH + 60);
  for (let cx = x0; cx < x1; cx += 14) shape.rect(cx, base - wallH - 7, 8, 8);
  for (const t of towers) {
    const y = base - t.h;
    shape.rect(t.x, y, t.w, t.h + 60);
    if (t.top === 'spire') { shape.moveTo(t.x - t.w * 0.12, y); shape.lineTo(t.x + t.w / 2, y - t.h * r.range(0.35, 0.7)); shape.lineTo(t.x + t.w * 1.12, y); shape.closePath(); }
    else if (t.top === 'crenel') { for (let k = 0; k < 4; k++) shape.rect(t.x - 3 + k * (t.w + 6) / 4, y - 9, (t.w + 6) / 8, 10); shape.rect(t.x - 4, y - 2, t.w + 8, 5); }
    else if (t.top === 'dome') { shape.moveTo(t.x, y); shape.arc(t.x + t.w / 2, y, t.w / 2, Math.PI, 0); shape.moveTo(t.x + t.w / 2, y - t.w / 2); shape.rect(t.x + t.w / 2 - 1.5, y - t.w / 2 - 18, 3, 18); }
    else { // tour brisée
      shape.moveTo(t.x, y); const n = 5;
      for (let k = 0; k <= n; k++) shape.lineTo(t.x + (t.w * k) / n, y - r.range(-t.h * 0.12, t.h * 0.08));
      shape.lineTo(t.x + t.w, y); shape.closePath();
    }
  }
  g.fillStyle = color; g.fill(shape);
  // liseré côté source de lumière
  g.save(); g.clip(shape);
  for (const t of towers) {
    const y = base - t.h;
    const gx = rimSide > 0 ? t.x + t.w : t.x;
    const gr = g.createLinearGradient(gx, 0, gx - rimSide * t.w * 0.45, 0);
    gr.addColorStop(0, rgba(rim, o.rimA)); gr.addColorStop(1, rgba(rim, 0));
    g.fillStyle = gr; g.fillRect(t.x - 30, y - t.h, t.w + 60, t.h * 2 + 60);
  }
  // brume de base (perspective atmosphérique)
  const fg = g.createLinearGradient(0, base - hMax, 0, base);
  fg.addColorStop(0, rgba(P.fog, 0)); fg.addColorStop(1, rgba(P.fog, o.baseFog));
  g.fillStyle = fg; g.fillRect(x0 - 20, base - hMax * 1.8, x1 - x0 + 40, hMax * 1.8 + 60);
  g.restore();
  // fenêtres
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const t of towers) for (let k = 0; k < t.h / 26; k++) {
    if (r() > lights) continue;
    const wx = t.x + r.range(0.2, 0.75) * t.w, wy = base - t.h + 14 + r() * (t.h - 30);
    const ww = Math.max(1.5, t.w * 0.07), wh = ww * 2;
    const col = fire && r() < 0.5 ? fire : P.glow;
    const gr = g.createRadialGradient(wx, wy, 0, wx, wy, wh * 3.5);
    gr.addColorStop(0, rgba(col, 0.32)); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.fillRect(wx - wh * 4, wy - wh * 4, wh * 8, wh * 8);
    g.fillStyle = rgba(mix(col, '#ffffff', 0.4), 0.9); g.fillRect(wx - ww / 2, wy - wh / 2, ww, wh);
  }
  g.restore();
  return towers;
}

/** Ruines au second plan : arches brisées et colonnes en contre-jour. */
function ruins(g, W, H, hz, P, r, o) {
  const layer = canvas(W, H), lg = ctx2(layer);
  lg.fillStyle = o.color;
  for (const it of o.items) {
    const { kind, x, base, s } = it;
    if (kind === 'arch') {
      const w = 260 * s, h = 330 * s, t = 46 * s;
      const p = new Path2D();
      p.rect(x - w / 2, base - h, t, h); p.rect(x + w / 2 - t, base - h, t, h);
      p.moveTo(x - w / 2, base - h); p.arc(x, base - h, w / 2, Math.PI, 0); p.lineTo(x + w / 2 - t, base - h); p.arc(x, base - h, w / 2 - t, 0, Math.PI, true); p.closePath();
      p.rect(x - w / 2 - 10 * s, base - 16 * s, w + 20 * s, 16 * s);
      lg.fill(p);
      if (it.broken) { // brèche dans l'arc
        lg.save(); lg.globalCompositeOperation = 'destination-out'; lg.beginPath();
        const bx = x + it.broken * w * 0.3, by = base - h - w * 0.42;
        lg.moveTo(bx - 40 * s, by - 60 * s); for (let k = 0; k < 7; k++) lg.lineTo(bx - 30 * s + k * 12 * s, by + r.range(10, 70) * s); lg.lineTo(bx + 60 * s, by - 60 * s); lg.closePath(); lg.fill(); lg.restore();
      }
    } else if (kind === 'column') {
      const w = 44 * s, h = it.h * s;
      lg.fillRect(x - w / 2, base - h, w, h);
      lg.fillRect(x - w * 0.75, base - 18 * s, w * 1.5, 18 * s);
      if (it.cap) { lg.fillRect(x - w * 0.8, base - h - 14 * s, w * 1.6, 14 * s); }
      else { lg.beginPath(); lg.moveTo(x - w / 2, base - h); for (let k = 0; k <= 5; k++) lg.lineTo(x - w / 2 + (w * k) / 5, base - h - r.range(-6, 26) * s); lg.lineTo(x + w / 2, base - h); lg.fill(); }
    } else if (kind === 'stele') { // stèle runique (DA : rune lumineuse)
      const w = 120 * s, h = 300 * s;
      lg.beginPath(); lg.moveTo(x - w / 2, base); lg.lineTo(x - w / 2, base - h + w / 2); lg.arc(x, base - h + w / 2, w / 2, Math.PI, 0); lg.lineTo(x + w / 2, base); lg.fill();
      lg.fillRect(x - w * 0.7, base - 22 * s, w * 1.4, 22 * s);
      it.rune = { x, y: base - h * 0.55, s };
    }
  }
  // liseré (contre-jour) : décalage de la silhouette vers la source
  const rimC = canvas(W, H), rg = ctx2(rimC);
  rg.drawImage(layer, 0, 0); rg.globalCompositeOperation = 'source-in'; rg.fillStyle = o.rim; rg.fillRect(0, 0, W, H);
  g.save(); g.globalAlpha = o.rimA; g.shadowColor = o.rim; g.shadowBlur = 8;
  g.drawImage(rimC, o.rimDx, -Math.abs(o.rimDx) * 0.8); g.restore();
  g.drawImage(layer, 0, 0);
  for (const it of o.items) if (it.rune) {
    const { x, y, s } = it.rune;
    lightPool(g, x, y, 120 * s, P.glow, 0.35);
    g.save(); g.strokeStyle = rgba(mix(P.glow, '#ffffff', 0.35), 0.95); g.lineWidth = 4 * s; g.shadowColor = P.glow; g.shadowBlur = 16 * s; g.lineCap = 'round';
    g.beginPath(); g.arc(x, y - 18 * s, 20 * s, 0, TAU); g.moveTo(x, y - 52 * s); g.lineTo(x, y + 52 * s); g.moveTo(x - 18 * s, y + 26 * s); g.lineTo(x + 18 * s, y + 26 * s); g.stroke(); g.restore();
  }
  return layer;
}

function fogBand(g, W, y, h, color, a, r) {
  const gr = g.createLinearGradient(0, y - h, 0, y + h);
  gr.addColorStop(0, rgba(color, 0)); gr.addColorStop(0.5, rgba(color, a)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr; g.fillRect(0, y - h, W, h * 2);
  // nappes
  for (let i = 0; i < 26; i++) {
    const x = r() * W, yy = y + r.range(-0.5, 0.5) * h, w = r.range(0.1, 0.3) * W;
    const eg = g.createRadialGradient(x, yy, 0, x, yy, w);
    eg.addColorStop(0, rgba(color, a * 0.5)); eg.addColorStop(1, rgba(color, 0));
    g.fillStyle = eg; g.save(); g.translate(x, yy); g.scale(1, 0.14); g.translate(-x, -yy); g.beginPath(); g.arc(x, yy, w, 0, TAU); g.fill(); g.restore();
  }
}

/** Sol en perspective à partir d'une tuile du chapitre (balayage ligne par ligne). */
function floor(g, W, H, hz, P, tile, o = {}) {
  const T = canvas(tile.width * 4, tile.height), tg = ctx2(T);
  for (let i = 0; i < 4; i++) tg.drawImage(tile, i * tile.width, 0);
  const camH = o.camH ?? 220, focal = o.focal ?? W * 0.9;
  for (let y = Math.ceil(hz); y < H; y += 1) {
    const dy = y - hz + 0.5;
    const z = (camH * focal) / dy;               // profondeur de la ligne
    const v = ((z * (o.scale ?? 0.9)) % tile.height + tile.height) % tile.height;
    const span = (W * z) / focal * (o.scale ?? 0.9); // largeur monde visible
    const sx = (tile.width * 2 - span / 2) % tile.width;
    if (span > T.width - 2) continue;
    g.drawImage(T, sx + tile.width, v, span, 1, 0, y, W, 1);
  }
  // assombrir (règle de valeur) + brume vers l'horizon
  g.save();
  g.fillStyle = rgba('#000000', o.dark ?? 0.45); g.fillRect(0, hz, W, H - hz);
  const fg = g.createLinearGradient(0, hz, 0, hz + (H - hz) * 0.55);
  fg.addColorStop(0, rgba(mix(P.fog, P.horizon, 0.5), 0.55)); fg.addColorStop(1, rgba(P.fog, 0));
  g.fillStyle = fg; g.fillRect(0, hz, W, H - hz);
  const ng = g.createLinearGradient(0, H * 0.82, 0, H);
  ng.addColorStop(0, rgba(P.near, 0)); ng.addColorStop(1, rgba(P.near, 0.85));
  g.fillStyle = ng; g.fillRect(0, hz, W, H - hz);
  g.restore();
}

function waterReflection(g, W, H, hz, P, src, r) {
  // eau noire : reflet inversé, ondulé, assombri
  const h = H - hz;
  for (let y = 0; y < h; y += 2) {
    const sy = hz - y * 1.05 - 2;
    if (sy < 0) break;
    const off = Math.sin(y * 0.18) * (0.6 + y * 0.012);
    g.drawImage(src, 0, sy, W, 2, off, hz + y, W, 2);
  }
  g.save();
  g.fillStyle = rgba('#01030a', 0.55); g.fillRect(0, hz, W, h);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 160; i++) { // reflets de lune
    const y = hz + r() ** 1.6 * h, w = r.range(10, 80) * (0.4 + (y - hz) / h);
    g.fillStyle = rgba(P.moonHalo, 0.05 + r() * 0.08);
    g.fillRect(o_moonX(g) - w / 2 + r.range(-1, 1) * (y - hz) * 0.4, y, w, 1.5);
  }
  g.restore();
}
let MOONX = 0; const o_moonX = () => MOONX;

/** Braises, flocons, poussière, éclats du Néant. */
function particles(g, W, H, P, r, n, kind, area = [0, 0, 1, 1]) {
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x = (area[0] + r() * (area[2] - area[0])) * W, y = (area[1] + r() * (area[3] - area[1])) * H;
    if (kind === 'embers') {
      const s = r.range(0.8, 3.2), col = r() < 0.3 ? '#ffd27a' : P.glow;
      g.fillStyle = rgba(col, r.range(0.35, 0.9)); g.shadowColor = col; g.shadowBlur = 8;
      g.beginPath(); g.ellipse(x, y, s, s * r.range(1, 2.5), r.range(-0.6, 0.2), 0, TAU); g.fill();
    } else if (kind === 'snow') {
      const s = r.range(0.6, 2.4);
      g.fillStyle = rgba('#e8f4ff', r.range(0.2, 0.7)); g.shadowColor = '#bfe6ff'; g.shadowBlur = 4;
      g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
    } else if (kind === 'void') {
      const s = r.range(1, 5);
      g.fillStyle = rgba(r() < 0.3 ? '#f0d8ff' : P.glow, r.range(0.25, 0.75)); g.shadowColor = P.glow; g.shadowBlur = 10;
      g.beginPath(); g.moveTo(x, y - s * 1.6); g.lineTo(x + s * 0.6, y); g.lineTo(x, y + s * 1.6); g.lineTo(x - s * 0.6, y); g.closePath(); g.fill();
    } else {
      const s = r.range(0.6, 2);
      g.fillStyle = rgba(r() < 0.5 ? P.glow : '#cfe0ff', r.range(0.15, 0.55)); g.shadowColor = P.glow; g.shadowBlur = 6;
      g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
    }
  }
  g.restore();
}

function lightPool(g, x, y, R, col, a, sy = 1) {
  g.save(); g.globalCompositeOperation = 'lighter';
  g.translate(x, y); g.scale(1, sy);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
  gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.35, rgba(col, a * 0.35)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
  g.restore();
}

/** Brasero du chapitre (image 0 de la bande de decor/), avec halo additif. */
function brazier(g, ch, P, x, base, h) {
  const im = images[`brasero-${ch}`];
  if (!im) return;
  const fw = im.width / 8, s = h / im.height;
  lightPool(g, x, base - h * 0.6, h * 2.2, P.glow, 0.4);
  lightPool(g, x, base, h * 1.6, P.glow, 0.35, 0.25);
  g.drawImage(im, 0, 0, fw, im.height, x - (fw * s) / 2, base - im.height * s * 0.97, fw * s, im.height * s);
  lightPool(g, x, base - h * 0.78, h * 0.5, mix(P.glow, '#ffffff', 0.3), 0.5);
}

/** Failles du Néant (éclairs figés) : ch4. */
function rift(g, x, y, len, ang, P, r, w = 2) {
  g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
  const pts = [[x, y]]; let a = ang, cx = x, cy = y;
  for (let i = 0; i < 14; i++) { a += r.range(-0.6, 0.6); const l = len / 14; cx += Math.cos(a) * l; cy += Math.sin(a) * l; pts.push([cx, cy]); }
  for (const [lw, col, al, bl] of [[w * 6, P.glow, 0.15, 30], [w * 2.2, P.glow, 0.6, 14], [w * 0.8, '#f4e6ff', 0.95, 4]]) {
    g.strokeStyle = rgba(col, al); g.lineWidth = lw; g.shadowColor = P.glow; g.shadowBlur = bl;
    g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
  }
  g.restore();
}

/** Éclats d'obsidienne en lévitation (ch4) ou cristaux (ch3). */
function shard(g, x, y, s, P, r, fill, rim) {
  g.save(); g.translate(x, y); g.rotate(r.range(-0.5, 0.5));
  const p = new Path2D(); p.moveTo(0, -s * 1.8); p.lineTo(s * 0.55, -s * 0.2); p.lineTo(s * 0.3, s * 1.2); p.lineTo(-s * 0.4, s * 0.9); p.lineTo(-s * 0.6, -s * 0.3); p.closePath();
  g.shadowColor = rim; g.shadowBlur = s * 0.8; g.fillStyle = fill; g.fill(p); g.shadowBlur = 0;
  g.strokeStyle = rgba(rim, 0.7); g.lineWidth = Math.max(1, s * 0.06); g.stroke(p);
  g.fillStyle = rgba(rim, 0.25); g.beginPath(); g.moveTo(0, -s * 1.8); g.lineTo(s * 0.55, -s * 0.2); g.lineTo(0, 0); g.closePath(); g.fill();
  g.restore();
}

function banner(g, x, y, w, h, col, r) {
  g.save(); g.fillStyle = col;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y);
  const sway = r.range(-0.15, 0.15) * w;
  g.quadraticCurveTo(x + w + sway, y + h * 0.5, x + w + sway * 1.5, y + h); g.lineTo(x + w / 2 + sway * 1.5, y + h * 0.82); g.lineTo(x + sway * 1.5, y + h);
  g.quadraticCurveTo(x + sway, y + h * 0.5, x, y); g.fill();
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + w * 0.62, y, w * 0.38, h * 0.85);
  g.fillStyle = rgba('#ffb070', 0.5); g.beginPath(); g.arc(x + w / 2 + sway * 0.6, y + h * 0.35, w * 0.16, 0, TAU); g.fill();
  g.restore();
}

function smoke(g, x, base, h, P, r) {
  for (let i = 0; i < 40; i++) {
    const t = i / 40, yy = base - t * h, xx = x + Math.sin(t * 5 + r()) * h * 0.08 + t * h * 0.25, R = 20 + t * h * 0.22;
    const gr = g.createRadialGradient(xx, yy, 0, xx, yy, R);
    gr.addColorStop(0, rgba(mix(P.far, '#000000', 0.3), 0.18 * (1 - t))); gr.addColorStop(1, rgba(P.far, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(xx, yy, R, 0, TAU); g.fill();
  }
}

function grade(g, W, H, P, vignette = 0.75) {
  // grain peint
  const n = canvas(256, 256), ng = ctx2(n), id = ng.createImageData(256, 256);
  const r = rng(99);
  for (let i = 0; i < id.data.length; i += 4) { const v = 128 + (r() - 0.5) * 70; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  ng.putImageData(id, 0, 0);
  g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.09; g.fillStyle = g.createPattern(n, 'repeat'); g.fillRect(0, 0, W, H); g.restore();
  // vignettage
  const vg = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, rgba('#020308', vignette));
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------------ scènes

/**
 * Panorama d'un chapitre. `o.hero` (cartes de sélection) laisse le premier plan libre au centre.
 */
export function paintScene(ch, W, H, o = {}) {
  const P = { ...CHAPTERS[ch], ...(o.palette ?? {}) };
  const r = rng(P.seed * 7919 + (o.seed ?? 0));
  const c = canvas(W, H), g = ctx2(c);
  const S = W / 1920; // échelle des détails
  const hz = H * (o.horizon ?? 0.64);
  const moon = { x: W * (o.moonX ?? 0.76), y: H * (o.moonY ?? 0.2), r: Math.min(W, H) * (o.moonR ?? 0.075) };
  MOONX = moon.x;

  sky(g, W, H, hz, P, r, moon);
  clouds(g, W, H, hz, P, r, moon, 10, [0.15, 0.75]);
  moonDisk(g, P, moon, r);
  if (P.moonVeil > 0) { // voile de nuages devant la lune
    g.save(); g.globalAlpha = P.moonVeil; clouds(g, W, H, hz, P, r, moon, 5, [moon.y / hz - 0.05, moon.y / hz + 0.12]); g.restore();
  }
  if (ch === 'ch4') for (let i = 0; i < 4; i++) rift(g, r.range(0.05, 0.95) * W, r.range(0.05, 0.4) * hz, r.range(120, 320) * S, r.range(0.6, 2.4), P, r, 1.4 * S);

  // plans lointains
  ridge(g, W, hz, P, r, H * 0.16, mix(P.horizon, P.far, 0.55), 1.4);
  ridge(g, W, hz + 6 * S, P, r, H * 0.1, mix(P.horizon, P.far, 0.8), 2.2);
  fogBand(g, W, hz - H * 0.03, H * 0.06, P.fog, 0.22, r);

  // citadelle d'Akar
  const cx = W * (o.citadelX ?? 0.42), cw = W * (o.citadelW ?? 0.5);
  const rimSide = moon.x > cx ? 1 : -1;
  const towers = citadel(g, W, hz, P, r, { x0: cx - cw / 2, x1: cx + cw / 2, base: hz + 4 * S, hMin: H * 0.08, hMax: H * 0.34, wMin: 22 * S, wMax: 62 * S, gap: 26 * S,
    tops: ch === 'ch3' ? ['spire', 'spire', 'dome', 'broken'] : ch === 'ch4' ? ['broken', 'broken', 'spire'] : ['spire', 'crenel', 'broken', 'crenel'],
    color: mix(P.far, P.horizon, 0.25), rimSide, rim: P.rim, rimA: 0.3, baseFog: 0.3, lights: ch === 'ch3' ? 0.25 : ch === 'ch4' ? 0.15 : 0.4, fire: ch === 'ch2' ? '#ff5a1a' : null });
  if (ch === 'ch2') {
    for (const t of towers) if (r() < 0.35) smoke(g, t.x + t.w / 2, hz - t.h, H * 0.35, P, r);
    for (const t of towers) if (r() < 0.4 && t.h > H * 0.12) banner(g, t.x + t.w * 0.15, hz - t.h + 14 * S, t.w * 0.7, t.h * 0.35, '#7a1418', r);
    lightPool(g, cx, hz, cw * 0.6, '#ff4a1a', 0.35, 0.35);
  }
  fogBand(g, W, hz + 2 * S, H * 0.05, P.fog, 0.28, r);

  // eau noire (ch3) ou sol
  if (ch === 'ch3' && !o.hero) {
    const snap = canvas(W, H); ctx2(snap).drawImage(c, 0, 0);
    waterReflection(g, W, H, hz, P, snap, r);
  } else {
    const tile = images[`dalles-${ch}`];
    if (tile) floor(g, W, H, hz, P, tile, { camH: 150 * (H / 1080), focal: W * 0.8, scale: 1.4, dark: o.hero ? 0.35 : 0.42 });
  }

  // ruines au second plan, en contre-jour
  const items = o.ruins ?? [
    { kind: 'arch', x: W * 0.12, base: hz + H * 0.12, s: 1.05 * S * (H / 1080) * 1.4, broken: 1 },
    { kind: 'column', x: W * 0.3, base: hz + H * 0.08, s: S * 1.2, h: 300, cap: false },
    { kind: 'stele', x: W * 0.66, base: hz + H * 0.07, s: S * 1.1 },
    { kind: 'column', x: W * 0.9, base: hz + H * 0.14, s: S * 1.6, h: 330, cap: true },
  ];
  ruins(g, W, H, hz, P, r, { items, color: P.mid, rim: P.rim, rimA: 0.55, rimDx: rimSide * 3 * S });

  if (ch === 'ch3') for (let i = 0; i < 9; i++) shard(g, r.range(0.02, 0.98) * W, hz + r.range(0.04, 0.2) * H, r.range(14, 40) * S, P, r, rgba('#9fd0f0', 0.55), '#e6f6ff');
  if (ch === 'ch4') {
    for (let i = 0; i < 12; i++) shard(g, r.range(0.02, 0.98) * W, r.range(0.25, 0.85) * hz, r.range(8, 30) * S, P, r, '#0b0716', P.glow);
    for (let i = 0; i < 3; i++) rift(g, r.range(0.1, 0.9) * W, hz + r.range(0.08, 0.25) * H, r.range(160, 360) * S, r.range(-0.3, 0.3), P, r, 1.8 * S);
  }
  // premier plan : braseros + piliers de cadrage
  if (!o.hero) {
    brazier(g, ch, P, W * 0.2, hz + H * 0.27, 210 * S * (H / 1080) * 1.2);
    brazier(g, ch, P, W * 0.81, hz + H * 0.29, 230 * S * (H / 1080) * 1.2);
    fogBand(g, W, H * 0.9, H * 0.08, P.fog, 0.2, r);
    // bords du cadre : ombre portée latérale
    for (const [x0, x1] of [[0, W * 0.16], [W, W * 0.84]]) {
      const eg = g.createLinearGradient(x0, 0, x1, 0); eg.addColorStop(0, rgba(P.near, 0.9)); eg.addColorStop(1, rgba(P.near, 0));
      g.fillStyle = eg; g.fillRect(Math.min(x0, x1), 0, W * 0.16, H);
    }
    const tg = g.createLinearGradient(0, 0, 0, H * 0.18); tg.addColorStop(0, rgba(P.near, 0.7)); tg.addColorStop(1, rgba(P.near, 0));
    g.fillStyle = tg; g.fillRect(0, 0, W, H * 0.18);
  }
  particles(g, W, H, P, r, o.hero ? 70 : 220, P.particles, o.hero ? [0, 0.1, 1, 1] : [0, 0.05, 1, 1]);
  grade(g, W, H, P, o.vignette ?? 0.75);
  return c;
}

/** Carte de sélection : héros v2 en pied, contre-jour à sa couleur, scène du chapitre associé. */
export const HERO_SCENES = {
  taro: { ch: 'ch2', anim: 'attaque', p: 0.18, fx: 0.56, moonX: 0.62, moonY: 0.26 },
  mei: { ch: 'ch4', anim: 'idle', p: 0.3, moonX: 0.5, moonY: 0.22, palette: { glow: '#ff3fb4', rim: '#ff9be0', moonHalo: '#ff5ac8', fog: '#6a2c66', horizon: '#3a1640', particles: 'void' } },
  sena: { ch: 'ch3', anim: 'idle', p: 0.55, moonX: 0.5, moonY: 0.2 },
  ren: { ch: 'ch1', anim: 'attaque', p: 0.3, fx: 0.42, moonX: 0.4, moonY: 0.22, palette: { glow: '#e8b64a', moonHalo: '#ffd27a', fog: '#7a6a5a', horizon: '#3a3340', accent: '#7fe0ff' } },
};

export function paintHeroCard(id, W = 640, H = 900) {
  const hs = HERO_SCENES[id];
  const c = CAST[id];
  const P = { ...CHAPTERS[hs.ch], ...(hs.palette ?? {}) };
  const bg = paintScene(hs.ch, W, H, { hero: true, horizon: 0.6, moonX: hs.moonX, moonY: hs.moonY, moonR: 0.14, citadelX: 0.5, citadelW: 1.1, palette: hs.palette, vignette: 0.55, seed: id.length * 13,
    ruins: [{ kind: 'column', x: W * 0.08, base: H * 0.78, s: 1.0, h: 420, cap: false }, { kind: 'arch', x: W * 0.92, base: H * 0.74, s: 0.9, broken: -1 }] });
  const out = canvas(W, H), g = ctx2(out);
  g.drawImage(bg, 0, 0);
  // halo de contre-jour à la couleur signature, derrière le héros
  lightPool(g, W * 0.5, H * 0.42, W * 0.55, c.sig, 0.45);
  lightPool(g, W * 0.5, H * 0.42, W * 0.25, c.rim, 0.35);
  // le héros en pied
  RIG.now = 370 + hs.p * 1000;
  const s = (H * 0.56) / 96;
  const spr = renderSprite('card', c, hs.anim, hs.p, 'A', s, 1);
  const feetX = W * (hs.fx ?? 0.5), feetY = H * 0.86;
  // ombre au sol
  g.save(); g.translate(feetX, feetY); g.scale(1, 0.22);
  const sg = g.createRadialGradient(0, 0, 0, 0, 0, W * 0.3); sg.addColorStop(0, 'rgba(0,0,0,.75)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sg; g.beginPath(); g.arc(0, 0, W * 0.3, 0, TAU); g.fill(); g.restore();
  lightPool(g, feetX, feetY, W * 0.32, c.sig, 0.35, 0.2);
  // aura de liseré
  g.save(); g.shadowColor = c.rim; g.shadowBlur = 40; g.globalAlpha = 0.9;
  g.drawImage(spr.cv, feetX - spr.ox, feetY - spr.oy); g.restore();
  g.drawImage(spr.cv, feetX - spr.ox, feetY - spr.oy);
  // particules de premier plan à la couleur du héros
  const r = rng(id.charCodeAt(0) * 31);
  particles(g, W, H, { ...P, glow: c.sig }, r, 60, P.particles === 'snow' ? 'snow' : P.particles === 'void' ? 'void' : 'embers', [0, 0.2, 1, 1]);
  // fondu bas pour le texte de la carte
  const fg = g.createLinearGradient(0, H * 0.7, 0, H);
  fg.addColorStop(0, 'rgba(4,5,10,0)'); fg.addColorStop(1, 'rgba(4,5,10,.85)');
  g.fillStyle = fg; g.fillRect(0, H * 0.7, W, H * 0.3);
  return out;
}

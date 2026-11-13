// @ts-nocheck
/**
 * Maquette « proposition v4 » : on part de la v3 (src/game/rig/draw.ts) et on montre, côte à côte,
 * v3 / v4 (contours par membre, gestes plus marqués, effets d'action, paliers d'équipement visibles,
 * télégraphes et champions ennemis, phase 2 des boss). RIG.v4 n'est jamais posé par le jeu.
 *   node tools/rig-lab/v4.mjs <dossier>
 */
import { CAST, RIG, renderSprite } from '../../src/game/rig/draw';

const HEIGHT = { taro: 122, mei: 116, sena: 120, ren: 118, brute: 92, raider: 84, shade: 84, shadeElite: 96, wolf: 60, cendrefer: 250, matriarche: 260, arbitre: 275, souverain: 310, juge: 250 };
const V4 = { limbs: true, outline: 3, outlineB: 1.55, k: 1.22 };

/** Paliers d'équipement : on ne change que des couleurs et des pièces qui existent déjà dans la v3. */
export const TIERS = {
  taro: [
    {},
    { metal: '#7e7c90', trim: '#c8c8d8', cape: '#a01c28', blade: ['#eef4ff', '#9aa8c8'], wglow: 1.4, wscale: 1.08 },
    { metal: '#3c3a48', body2: '#b01e2c', cape: '#a3141f', trim: '#ff5a4a', veins: true, band: '#ff4a52', blade: ['#ffc0b0', '#c0303a'], wglow: 2.2, wscale: 1.18, aura: true },
  ],
  mei: [
    {},
    { pauldron: true, metal: '#9a86a6', trim: '#ff9be0', boots: '#3a1230', blade: ['#f4eefa', '#b0a0c0'], wglow: 1.4 },
    { pauldron: true, metal: '#e2c0ee', trim: '#ffd0f0', cape: '#5a0f3e', veins: true, blade: ['#ffd0f0', '#d040a0'], wglow: 2, aura: true },
  ],
  sena: [
    {},
    { trim: '#f4d77e', metal: '#dfe8f8', pauldron: true, wglow: 1.4 },
    { trim: '#ffe7a0', metal: '#f2f6ff', pauldron: true, halo: true, shards: true, cape: '#1a3570', wglow: 2, aura: true },
  ],
  ren: [
    {},
    { cape: '#26375c', pauldron: true, metal: '#a88a4a', bowCol: '#d8dce8' },
    { cape: '#1b2748', pauldron: true, metal: '#e3c06a', body2: '#f0c050', trim: '#ffe08a', emblem: true, veins: true, bowCol: '#ffd860', aura: true },
  ],
};
const ELITE = { rim: '#f2e6ff', sig: '#b070ff', champion: true };
/** Retouches de silhouette v4 des ennemis (audit game design). */
const ENEMY_V4 = { raider: { crest: false, shieldS: 1.3 }, shadeElite: { sig: '#d02a8a', rim: '#ff9ad8', body: '#4a0f3a', body2: '#22081c' } };

function bg(g, w, h) {
  const gr = g.createRadialGradient(w / 2, h * .7, 10, w / 2, h * .7, w * .7);
  gr.addColorStop(0, '#3a3440'); gr.addColorStop(1, '#14121a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}
function sprite(c, anim, p, zoom, v4, key) {
  const nominal = c.kind === 'w' ? 48 : 96;
  const s = HEIGHT[key] / (nominal * c.scale) * zoom * (c.bump || 1);
  RIG.now = p * 1000; RIG.phase = p; RIG.loop = 0; RIG.v4 = v4 ? V4 : null;
  const r = renderSprite('v4', c, anim, p, c.group === 'h' ? 'A' : 'B', s, 1);
  RIG.v4 = null;
  const cv = document.createElement('canvas'); cv.width = r.W; cv.height = r.H; cv.getContext('2d').drawImage(r.cv, 0, 0);
  return { cv, ox: r.ox, oy: r.oy, s };
}
function tinted(cv, col, blur) {
  const t = document.createElement('canvas'); t.width = cv.width + 40; t.height = cv.height + 40;
  const g = t.getContext('2d'); g.filter = `blur(${blur}px)`; g.drawImage(cv, 20, 20); g.filter = 'none';
  g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, t.width, t.height); return t;
}
function shadow(g, x, y, r, z) { g.fillStyle = 'rgba(0,0,0,.38)'; g.beginPath(); g.ellipse(x, y, r * z, 7 * z, 0, 0, Math.PI * 2); g.fill(); }
function aura(g, x, y, col, z, big = 1) {
  const R = 46 * z * big;
  const gr = g.createRadialGradient(x, y - R * .9, 4, x, y - R * .9, R * 1.3);
  gr.addColorStop(0, col + '55'); gr.addColorStop(1, col + '00'); g.fillStyle = gr; g.fillRect(x - R * 2, y - R * 2.6, R * 4, R * 3);
  g.save(); g.strokeStyle = col; g.globalAlpha = .75; g.lineWidth = 2 * z; g.shadowColor = col; g.shadowBlur = 10 * z;
  g.beginPath(); g.ellipse(x, y, R * .62, R * .17, 0, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = .9; g.fillStyle = '#fff';
  for (let i = 0; i < 9; i++) { const a = i * 2.4, rr = R * (.35 + (i % 3) * .14); g.globalAlpha = .4 + (i % 2) * .5; g.fillStyle = i % 2 ? '#fff' : col; g.fillRect(x + Math.cos(a) * rr - 1.2 * z, y - 12 * z - (i * 11 % 70) * z, 2.4 * z, 2.4 * z); }
  g.restore();
}
function put(g, sp, fx, fy) { g.drawImage(sp.cv, fx - sp.ox, fy - sp.oy); }
function label(g, txt, x, y, z, col = '#e8dcc0') { g.fillStyle = col; g.font = `600 ${12 * z}px Georgia, serif`; g.textAlign = 'center'; g.fillText(txt, x, y); }

/** Héros : 2 lignes × 4 colonnes. Ligne 1 = v3 | v4 base | v4 rare | v4 légendaire. Ligne 2 = action v3 | action v4 | course v4 | touché v4. */
window.heroCard = (key, zoom = 2) => {
  const base = CAST[key], tiers = TIERS[key];
  const cw = 200 * zoom, ch = 190 * zoom, cv = document.createElement('canvas'); cv.width = cw * 4; cv.height = ch * 2;
  const g = cv.getContext('2d'); bg(g, cv.width, cv.height);
  const atk = base.weapon === 'bow' ? .5 : base.weapon === 'staff' ? .46 : base.weapon === 'daggers' ? .34 : .5;
  const cells = [
    ['V3 (actuel)', base, 'idle', .25, false],
    ['V4 · tenue de départ', { ...base, ...tiers[0] }, 'idle', .25, true],
    ['V4 · équipement rare', { ...base, ...tiers[1] }, 'idle', .25, true],
    ['V4 · légendaire', { ...base, ...tiers[2] }, 'idle', .25, true],
    ['V3 · attaque', base, 'attaque', atk, false],
    ['V4 · attaque + effets', { ...base, ...tiers[0] }, 'attaque', atk, true, 'trail'],
    ['V4 · course', { ...base, ...tiers[1] }, 'course', .3, true],
    ['V4 · touché', { ...base, ...tiers[0] }, 'touche', .35, true, 'hit'],
  ];
  cells.forEach(([txt, c, anim, p, v4, extra], i) => {
    const col = i % 4, row = Math.floor(i / 4), fx = col * cw + cw * .45, fy = row * ch + ch * .86;
    if (v4) { g.fillStyle = 'rgba(232,182,74,.06)'; g.fillRect(col * cw + 2, row * ch + 2, cw - 4, ch - 4); }
    shadow(g, fx, fy, 26, zoom);
    if (c.aura) aura(g, fx, fy, c.sig, zoom);
    if (extra === 'trail') {
      for (const [dp, al] of [[-.06, .3]]) { const gh = sprite(c, anim, p + dp, zoom, true, key); g.globalAlpha = al; put(g, gh, fx, fy); g.globalAlpha = 1; }
    }
    const sp = sprite(c, anim, p, zoom, v4, key);
    if (extra === 'hit') { g.globalAlpha = .8; g.drawImage(tinted(sp.cv, '#ffffff', 3 * zoom), fx - sp.ox - 20, fy - sp.oy - 20); g.globalAlpha = 1; }
    put(g, sp, fx, fy);
    if (extra === 'trail') { // étincelle d'impact + onde au point de contact
      const ix = fx + (c.weapon === 'bow' ? 100 : c.weapon === 'staff' ? 105 : c.weapon === 'daggers' ? 70 : 92) * zoom, iy = fy - (c.weapon === 'bow' ? 78 : c.weapon === 'staff' ? 70 : c.weapon === 'daggers' ? 60 : 22) * zoom;
      g.save(); g.shadowColor = c.sig; g.shadowBlur = 14 * zoom; g.strokeStyle = '#fff'; g.lineWidth = 2 * zoom;
      for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4 + .3, r0 = 5 * zoom, r1 = (j % 2 ? 14 : 22) * zoom; g.beginPath(); g.moveTo(ix + Math.cos(a) * r0, iy + Math.sin(a) * r0); g.lineTo(ix + Math.cos(a) * r1, iy + Math.sin(a) * r1); g.stroke(); }
      g.strokeStyle = c.sig; g.globalAlpha = .7; g.beginPath(); g.arc(ix, iy, 26 * zoom, 0, Math.PI * 2); g.stroke(); g.restore();
    }
    if (extra === 'hit') { g.save(); g.fillStyle = '#ff5050'; g.font = `800 ${16 * zoom}px Georgia`; g.textAlign = 'center'; g.shadowColor = '#000'; g.shadowBlur = 4; g.fillText('-24', fx + 30 * zoom, fy - 110 * zoom); g.restore(); }
    label(g, txt, col * cw + cw / 2, row * ch + 18 * zoom, zoom, v4 ? '#f0c96a' : '#b8b0c8');
  });
  return cv.toDataURL('image/png');
};

/** Taille réelle en jeu (x1) : v3 | v4 pour les 4 héros, sur un sol sombre, pour juger la lecture au téléphone. */
const CH2_RIM = { taro: '#fff0e0', mei: '#ffd8f0', sena: '#e8f4ff', ren: '#bff0ff' };
window.heroesReal = async (zoom = 1.5) => {
  const img = new Image(); img.src = '/docs/planche-da/assets/tiles/ch2/dalles_a.webp'; await img.decode();
  const keys = ['taro', 'mei', 'sena', 'ren'], cw = 110 * zoom, ch = 165 * zoom, cv = document.createElement('canvas'); cv.width = cw * 8; cv.height = ch;
  const g = cv.getContext('2d'); g.fillStyle = g.createPattern(img, 'repeat'); g.fillRect(0, 0, cv.width, ch);
  g.fillStyle = 'rgba(90,10,10,.35)'; g.fillRect(0, 0, cv.width, ch);
  keys.forEach((k, i) => [false, true].forEach((v4, j) => {
    const x = (i * 2 + j) * cw + cw * .45, y = ch * .9; shadow(g, x, y, 22, zoom);
    if (v4) { g.save(); g.strokeStyle = CAST[k].sig; g.lineWidth = 2.5 * zoom; g.shadowColor = CAST[k].sig; g.shadowBlur = 8 * zoom; g.beginPath(); g.ellipse(x, y, 26 * zoom, 8 * zoom, 0, 0, Math.PI * 2); g.stroke(); g.restore(); }
    put(g, sprite(v4 ? { ...CAST[k], rim: CH2_RIM[k] } : CAST[k], 'idle', .25, zoom * (v4 ? 1.1 : 1), v4, k), x, y);
    label(g, v4 ? 'v4' : 'v3', (i * 2 + j) * cw + cw / 2, 16 * zoom, zoom, v4 ? '#f0c96a' : '#b8b0c8');
  }));
  return cv.toDataURL('image/png');
};

/** Ennemi : v3 | v4 | v4 télégraphe (préparation du coup) | v4 champion. */
window.enemyCard = (key, zoom = 2) => {
  const base = CAST[key], cw = 190 * zoom, ch = 175 * zoom, cv = document.createElement('canvas'); cv.width = cw * 4; cv.height = ch;
  const g = cv.getContext('2d'); bg(g, cv.width, cv.height);
  const wind = base.kind === 'w' ? ['touche', .2] : ['attaque', base.weapon === 'orb' ? .3 : .3];
  const b4 = { ...base, ...(ENEMY_V4[key] || {}) };
  const cells = [['V3 (actuel)', base, 'idle', .25, false], ['V4', b4, 'idle', .25, true], ['V4 · télégraphe (60 %)', b4, wind[0], wind[1], true, 'tel'], ['V4 · champion', { ...b4, ...ELITE, bump: 1.12 }, 'idle', .25, true, 'elite']];
  cells.forEach(([txt, c, anim, p, v4, extra], i) => {
    const fx = i * cw + cw * .45, fy = ch * .86;
    if (v4) { g.fillStyle = 'rgba(232,182,74,.06)'; g.fillRect(i * cw + 2, 2, cw - 4, ch - 4); }
    if (extra === 'tel') { // zone au sol qui se remplit + silhouette qui s'embrase
      g.save(); g.translate(fx + 18 * zoom, fy); g.scale(1, .32);
      g.fillStyle = 'rgba(255,40,40,.16)'; g.strokeStyle = 'rgba(255,70,60,.9)'; g.lineWidth = 2.5 * zoom;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 95 * zoom, -.55, .55); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,60,50,.4)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 57 * zoom, -.55, .55); g.closePath(); g.fill();
      g.strokeStyle = '#ffd0c8'; g.lineWidth = 2 * zoom; g.beginPath(); g.arc(0, 0, 57 * zoom, -.55, .55); g.stroke(); g.restore();
    }
    shadow(g, fx, fy, 24, zoom);
    if (extra === 'elite') aura(g, fx, fy, '#b070ff', zoom, .9);
    const sp = sprite(c, anim, p, zoom, v4, key);
    if (extra === 'tel') { g.drawImage(tinted(sp.cv, '#ff3020', 5 * zoom), fx - sp.ox - 20, fy - sp.oy - 20); g.drawImage(tinted(sp.cv, '#ff3020', 2 * zoom), fx - sp.ox - 20, fy - sp.oy - 20); }
    if (extra === 'elite') g.drawImage(tinted(sp.cv, '#e8d8ff', 2.5 * zoom), fx - sp.ox - 20, fy - sp.oy - 20);
    put(g, sp, fx, fy);
    if (extra === 'tel') { g.save(); g.fillStyle = '#ff4a3a'; g.font = `900 ${26 * zoom}px Georgia`; g.textAlign = 'center'; g.shadowColor = '#000'; g.shadowBlur = 6; g.fillText('!', fx, fy - HEIGHT[key] * zoom * 1.12 - 6 * zoom); g.restore(); }
    if (extra === 'elite') { g.save(); g.fillStyle = '#e0c8ff'; g.font = `700 ${10 * zoom}px Georgia`; g.textAlign = 'center'; g.fillText('Champion · Rapide · Brûlant', fx, fy - HEIGHT[key] * zoom * 1.2 - 4 * zoom); g.restore(); }
    label(g, txt, i * cw + cw / 2, 18 * zoom, zoom, v4 ? '#f0c96a' : '#b8b0c8');
  });
  return cv.toDataURL('image/png');
};

/** Boss : v3 | v4 phase 1 | v4 phase 2 (enragé, sous 50 % de vie). */
window.bossCard = (key, zoom = 1) => {
  const base = CAST[key], cw = 330 * zoom, ch = 380 * zoom, cv = document.createElement('canvas'); cv.width = cw * 3; cv.height = ch;
  const g = cv.getContext('2d'); bg(g, cv.width, cv.height);
  const enr = { veins: true, spikes: !!base.pauldron, sig: base.sig, rim: '#ffffff', bump: 1.08, horns: true };
  const cells = [['V3 (actuel)', base, 'idle', .25, false], ['V4 · phase 1', base, 'idle', .25, true], ['V4 · phase 2 (enragé)', { ...base, ...enr }, 'attaque', .3, true, 'p2']];
  cells.forEach(([txt, c, anim, p, v4, extra], i) => {
    const fx = i * cw + cw * .45, fy = ch * .9;
    if (v4) { g.fillStyle = 'rgba(232,182,74,.06)'; g.fillRect(i * cw + 2, 2, cw - 4, ch - 4); }
    shadow(g, fx, fy, 52, zoom);
    if (extra === 'p2') { aura(g, fx, fy, base.sig, zoom * 2.1, 1); }
    const sp = sprite(c, anim, p, zoom, v4, key);
    if (extra === 'p2') g.drawImage(tinted(sp.cv, base.sig, 6 * zoom), fx - sp.ox - 20, fy - sp.oy - 20);
    put(g, sp, fx, fy);
    label(g, txt, i * cw + cw / 2, 20 * zoom, zoom, v4 ? '#f0c96a' : '#b8b0c8');
  });
  return cv.toDataURL('image/png');
};
window.v4Ready = true;

// @ts-nocheck
/**
 * Labo des pantins peints : compare l'ancien combattant (squelette dessiné, rig/draw.ts) et le pantin
 * à pièces peintes (src/game/puppet), mêmes poses, à la taille du jeu.
 *   node tools/puppet-lab/capture.mjs <dossier>
 */
import { CAST, RIG, renderSprite } from '../../src/game/rig/draw';
import { bakePuppet } from '../../src/game/puppet/bake';
import { solvePuppet, poseAnimFor, mul, type M } from '../../src/game/puppet/bones';
import { poseOf } from '../../src/game/puppet/pose';
import { BOW } from '../../src/game/puppet/cast/ren';

const HEIGHT = { taro: 122, mei: 116, sena: 120, ren: 118, brute: 128, raider: 98, shade: 102, shadeElite: 152, wolf: 80, cendrefer: 250, matriarche: 260, arbitre: 275, souverain: 310, juge: 250 };
const POSES = [['idle', .25], ['course', .3], ['attaque', .3], ['attaque', .5], ['touche', .1], ['touche', .6], ['mort', .3]];
const cache = {};
const nominalOf = (c) => (c.kind === 'w' ? 48 : 96);

function bg(g, w, h) {
  const gr = g.createRadialGradient(w / 2, h * .7, 10, w / 2, h * .7, w * .7);
  gr.addColorStop(0, '#3a3440'); gr.addColorStop(1, '#14121a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}

function oldSprite(key, anim, p, zoom, aim = 0) {
  const c = CAST[key];
  const nominal = c.kind === 'w' ? 48 : 96;
  const s = HEIGHT[key] / (nominal * c.scale) * zoom;
  RIG.now = p * 1000; RIG.phase = p; RIG.loop = 0; RIG.aim = aim;
  const r = renderSprite('lab', c, anim, p, c.group === 'h' ? 'A' : 'B', s, 1);
  RIG.aim = 0;
  return r;
}

function baked(key, ppu) {
  const k = key + ppu;
  if (!cache[k]) { const c = CAST[key]; cache[k] = bakePuppet({ key, def: c, style: c.group === 'h' ? 'A' : 'B', ppu, normals: true }); }
  return cache[k];
}

/** Dessine le pantin en Canvas 2D (même calcul que le rendu Pixi). (fx, fy) = pieds, s = px/unité. */
const tinted = {};
function tintAtlas(b, col) {
  const k = col + b.meta.width;
  if (tinted[k]) return tinted[k];
  const cv = document.createElement('canvas'); cv.width = b.color.width; cv.height = b.color.height;
  const g = cv.getContext('2d'); g.drawImage(b.color, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, cv.width, cv.height);
  return (tinted[k] = cv);
}
window.OUTLINE = '#0b0a12';
function drawPuppet(g, key, anim, p, fx, fy, s, opt = {}) {
  const c = CAST[key];
  const b = baked(key, opt.ppu ?? 3);
  const atlas = opt.normals ? b.normal : b.color;
  const P = poseOf(c, poseAnimFor(c, anim), p, opt.aim ?? 0, p * 1.7);
  const placed = solvePuppet(c, P, anim, p, p * 1.7);
  const root: M = [s * c.scale, 0, 0, s * c.scale, fx, fy];
  const alpha = (P.alpha ?? 1) * (1 - (P.dis ?? 0) * 0.85);
  const flash = (P.flash ?? 0) > 0;
  if (!opt.normals) for (const it of placed) {
    const cell = b.meta.parts[it.id + '~o'];
    if (!cell) continue;
    const m = mul(root, mul(it.m, [1 / b.meta.ppu, 0, 0, 1 / b.meta.ppu, 0, 0]));
    g.save(); g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); g.globalAlpha = alpha * (flash ? 1 : c.group === 'h' ? 0.7 : 0.92);
    g.drawImage(tintAtlas(b, flash ? '#ffffff' : (opt.outline ?? (c.group === 'h' ? c.rim : '#0b0a12'))), cell.x, cell.y, cell.w, cell.h, -cell.ax * cell.w, -cell.ay * cell.h, cell.w, cell.h);
    g.restore();
  }
  for (const it of placed) {
    const cell = b.meta.parts[it.id];
    if (!cell) continue;
    const m = mul(root, mul(it.m, [1 / b.meta.ppu, 0, 0, 1 / b.meta.ppu, 0, 0]));
    g.save(); g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    g.globalAlpha = alpha * (flash ? 0.3 : 1);
    if (it.tint && !opt.normals) g.filter = 'brightness(0.72) saturate(0.9)';
    g.drawImage(atlas, cell.x, cell.y, cell.w, cell.h, -cell.ax * cell.w, -cell.ay * cell.h, cell.w, cell.h);
    g.restore();
    if (it.id === 'weapon' && c.weapon === 'bow' && !opt.normals) {
      const wm = mul(root, it.m);
      g.save(); g.setTransform(wm[0], wm[1], wm[2], wm[3], wm[4], wm[5]);
      const pull = P.drawPull || 0, ny = BOW.nockY + pull * 20;
      g.strokeStyle = 'rgba(240,236,220,.9)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-BOW.tipX, BOW.tipY); g.lineTo(0, ny); g.lineTo(BOW.tipX, BOW.tipY); g.stroke();
      if (pull > 0.05) { g.strokeStyle = '#e8dcc0'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, ny); g.lineTo(0, -17); g.stroke();
        g.shadowColor = '#7fe0ff'; g.shadowBlur = 8; g.fillStyle = '#dffbff'; g.beginPath(); g.moveTo(-2.2, -15); g.lineTo(0, -21); g.lineTo(2.2, -15); g.fill(); }
      g.restore();
    }
  }
}

window.compare = (key, zoom = 2) => {
  const c = CAST[key];
  // Cellules à la taille du combattant (les boss font 250–310 px).
  const k = Math.max(1, HEIGHT[key] / 125), cellW = 170 * zoom * k, cellH = 175 * zoom * k;
  const cv = document.createElement('canvas'); cv.width = cellW * POSES.length; cv.height = cellH * 2;
  const g = cv.getContext('2d'); bg(g, cv.width, cv.height);
  POSES.forEach(([a, p], col) => {
    const fx = col * cellW + cellW * .42;
    for (let row = 0; row < 2; row++) {
      const fy = row * cellH + cellH * .9;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(fx, fy, 26 * zoom, 7 * zoom, 0, 0, Math.PI * 2); g.fill();
      if (row === 0) { const r = oldSprite(key, a, p, zoom); g.drawImage(r.cv, 0, 0, r.W, r.H, fx - r.ox, fy - r.oy, r.W, r.H); }
      else drawPuppet(g, key, a, p, fx, fy, HEIGHT[key] / (nominalOf(c) * c.scale) * zoom);
    }
  });
  g.fillStyle = '#ddd'; g.font = `${12 * zoom}px sans-serif`; g.fillText('avant', 6, 16 * zoom); g.fillText('pantin peint', 6, cellH + 16 * zoom);
  return cv.toDataURL('image/png');
};

window.aims = (key, zoom = 2) => {
  const c = CAST[key];
  const A = [-1.15, -0.6, 0, 0.6, 1.15];
  const cellW = 180 * zoom, cellH = 175 * zoom;
  const cv = document.createElement('canvas'); cv.width = cellW * A.length; cv.height = cellH * 2;
  const g = cv.getContext('2d'); bg(g, cv.width, cv.height);
  A.forEach((aim, col) => ['idle', 'attaque'].forEach((anim, row) => {
    const fx = col * cellW + cellW * .4, fy = row * cellH + cellH * .9;
    drawPuppet(g, key, anim, anim === 'attaque' ? 0.4 : 0.25, fx, fy, HEIGHT[key] / (nominalOf(c) * c.scale) * zoom, { aim });
  }));
  return cv.toDataURL('image/png');
};

window.atlas = (key, which = 'color') => {
  const b = baked(key, 3);
  const src = which === 'normal' ? b.normal : b.color;
  const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
  const g = cv.getContext('2d'); g.fillStyle = which === 'normal' ? '#000' : '#2a2630'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(src, 0, 0);
  return cv.toDataURL('image/png');
};

window.big = (key, zoom0 = 5) => {
  const zoom = zoom0 * Math.min(1, 130 / HEIGHT[key]);
  const c = CAST[key];
  const cv = document.createElement("canvas"); cv.width = Math.max(260, HEIGHT[key] * 1.9) * zoom; cv.height = Math.max(150, HEIGHT[key] * 1.4) * zoom;
  const g = cv.getContext('2d'); bg(g, cv.width, cv.height);
  const s = HEIGHT[key] / (nominalOf(c) * c.scale) * zoom * 0.95;
  drawPuppet(g, key, 'idle', .25, cv.width * .25, cv.height * .93, s, { ppu: 3 * zoom / 2 });
  drawPuppet(g, key, 'idle', .25, cv.width * .72, cv.height * .93, s, { ppu: 3 * zoom / 2, normals: true });
  return cv.toDataURL('image/png');
};
window.labReady = true;

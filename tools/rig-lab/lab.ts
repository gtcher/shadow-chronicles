// @ts-nocheck
/**
 * Labo des combattants : dessine les 14 combattants du squelette (src/game/rig/draw.ts) dans
 * plusieurs poses, à la taille du jeu, pour comparer avant/après une retouche du dessin.
 *   node tools/rig-lab/capture.mjs <dossier>   → planches PNG
 */
import { CAST, RIG, renderSprite } from '../../src/game/rig/draw';

const GROUPS = { h: ['taro', 'mei', 'sena', 'ren'], e: ['brute', 'raider', 'shade', 'shadeElite', 'wolf'], b: ['cendrefer', 'matriarche', 'arbitre', 'souverain', 'juge'] };
const HEIGHT = { taro: 122, mei: 116, sena: 120, ren: 118, brute: 92, raider: 84, shade: 84, shadeElite: 96, wolf: 60, cendrefer: 250, matriarche: 260, arbitre: 275, souverain: 310, juge: 250 };
const POSES = [['idle', .25], ['course', .3], ['attaque', .3], ['attaque', .5], ['touche', .5], ['mort', .3]];

function bg(g, w, h) {
  const gr = g.createRadialGradient(w / 2, h * .7, 10, w / 2, h * .7, w * .7);
  gr.addColorStop(0, '#3a3440'); gr.addColorStop(1, '#14121a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}

function sprite(key, anim, p, zoom) {
  const c = CAST[key];
  const nominal = c.kind === 'w' ? 48 : 96;
  const s = HEIGHT[key] / (nominal * c.scale) * zoom;
  RIG.now = p * 1000; RIG.phase = p; RIG.loop = 0;
  const style = c.group === 'h' ? 'A' : 'B';
  const r = renderSprite('lab', c, anim, p, style, s, 1);
  const cv = document.createElement('canvas'); cv.width = r.W; cv.height = r.H;
  cv.getContext('2d').drawImage(r.cv, 0, 0);
  return { cv, ox: r.ox, oy: r.oy };
}

/** Planche : une ligne par combattant, une colonne par pose. */
window.sheet = (group, zoom = 1) => {
  const keys = GROUPS[group];
  const cellW = (group === 'b' ? 330 : 190) * zoom, cellH = (group === 'b' ? 380 : 170) * zoom;
  const cv = document.createElement('canvas'); cv.width = cellW * POSES.length; cv.height = cellH * keys.length;
  const g = cv.getContext('2d'); bg(g, cv.width, cv.height);
  keys.forEach((k, row) => POSES.forEach(([a, p], col) => {
    const s = sprite(k, a, p, zoom);
    const fx = col * cellW + cellW * .42, fy = row * cellH + cellH * .9;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(fx, fy, 26 * zoom * (group === 'b' ? 2 : 1), 7 * zoom, 0, 0, Math.PI * 2); g.fill();
    g.drawImage(s.cv, fx - s.ox, fy - s.oy);
  }));
  return cv.toDataURL('image/png');
};
window.labReady = true;
import { bakeAtlas } from '../../src/game/rig/atlas';
/** Temps de cuisson (ms) d'un combattant en atlas, comme dans le jeu. */
window.bakeTime = (key) => { const c = CAST[key]; const t = performance.now(); bakeAtlas({ def: c, heightPx: HEIGHT[key], style: c.group === 'h' ? 'A' : 'B', res: 1.5 }); return performance.now() - t; };

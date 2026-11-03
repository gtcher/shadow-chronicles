// @ts-nocheck
import { loadImages, paintScene, paintHeroCard } from './paint';

/** Appelé par render.mjs : peint tout et renvoie { nom: dataURL WebP }. */
async function paintAll(only?: string[], quality = 0.84) {
  const urls = {};
  for (const ch of ['ch1', 'ch2', 'ch3', 'ch4']) {
    urls[`dalles-${ch}`] = `/assets/tiles/${ch}/dalles_a.webp`;
    urls[`brasero-${ch}`] = `/assets/decor/${ch}/brasero.webp`;
  }
  await loadImages(urls);
  const out = {};
  const want = (k) => !only || only.includes(k);
  for (const ch of ['ch1', 'ch2', 'ch3', 'ch4']) if (want(`menu-${ch}`)) out[`menu-${ch}`] = paintScene(ch, 1920, 1080).toDataURL('image/webp', quality);
  for (const id of ['taro', 'mei', 'sena', 'ren']) if (want(`select-${id}`)) out[`select-${id}`] = paintHeroCard(id).toDataURL('image/webp', quality);
  return out;
}
(window as any).paintAll = paintAll;
// Aperçu dans le navigateur : npx vite puis /tools/art/art.html
if (!navigator.webdriver) paintAll().then((o) => { for (const [k, u] of Object.entries(o)) { const im = new Image(); im.src = u; im.title = k; im.style.maxWidth = '100%'; document.body.append(k, im); } });

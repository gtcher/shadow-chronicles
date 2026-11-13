/** node tools/rig-lab/v4.mjs <dossier> : planches de la maquette v4 (v3 vs proposition). */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(process.argv[2] ?? 'reports/rig-v4'); mkdirSync(out, { recursive: true });
const server = await createServer({ root, server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const save = (n, url) => { const f = resolve(out, n); writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log(f); };
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page:', e.message));
  await page.goto('http://localhost:5199/tools/rig-lab/v4.html');
  await page.waitForFunction(() => window.v4Ready, null, { timeout: 60_000 });
  for (const k of ['taro', 'mei', 'sena', 'ren']) save(`heros-${k}.png`, await page.evaluate((k) => window.heroCard(k, 2), k));
  save('heros-taille-reelle.png', await page.evaluate(() => window.heroesReal(1.5)));
  for (const k of ['brute', 'raider', 'shade', 'shadeElite', 'wolf']) save(`ennemi-${k}.png`, await page.evaluate((k) => window.enemyCard(k, 2), k));
  for (const k of ['cendrefer', 'matriarche', 'arbitre', 'souverain', 'juge']) save(`boss-${k}.png`, await page.evaluate((k) => window.bossCard(k, 1), k));
} finally { await browser.close(); await server.close(); }

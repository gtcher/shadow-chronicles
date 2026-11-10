/** node tools/rig-lab/bake-time.mjs : temps de cuisson de chaque combattant (ms, fil principal). */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const server = await createServer({ root, server: { port: 5197, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:5197/tools/rig-lab/lab.html');
  await page.waitForFunction(() => window.labReady, null, { timeout: 60_000 });
  for (const k of ['taro', 'mei', 'sena', 'ren', 'brute', 'raider', 'shade', 'shadeElite', 'wolf', 'cendrefer', 'matriarche', 'arbitre', 'souverain']) {
    await page.evaluate((k) => window.bakeTime(k), k);
    console.log(k, Math.round(await page.evaluate((k) => window.bakeTime(k), k)), 'ms');
  }
} finally { await browser.close(); await server.close(); }

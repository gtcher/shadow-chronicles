/** node tools/rig-lab/capture.mjs <dossier> : planches PNG des combattants (héros, ennemis, boss, x1 et x2). */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(process.argv[2] ?? 'reports/rig-lab');
mkdirSync(out, { recursive: true });
const server = await createServer({ root, server: { port: 5198, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page:', e.message));
  await page.goto('http://localhost:5198/tools/rig-lab/lab.html');
  await page.waitForFunction(() => window.labReady, null, { timeout: 60_000 });
  for (const [g, z] of [['h', 1], ['h', 2], ['e', 1], ['e', 2], ['b', 1]]) {
    const url = await page.evaluate(([g, z]) => window.sheet(g, z), [g, z]);
    const f = resolve(out, `${g}-x${z}.png`);
    writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
    console.log(f);
  }
} finally { await browser.close(); await server.close(); }

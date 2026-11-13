/** node tools/puppet-lab/capture.mjs <dossier> [clés…] : planches avant/pantin, visées, atlas. */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(process.argv[2] ?? 'reports/puppet-lab');
const keys = process.argv.slice(3).length ? process.argv.slice(3) : ['ren'];
mkdirSync(out, { recursive: true });
const server = await createServer({ root, server: { port: Number(process.env.PORT ?? 5199), strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const save = (name, url) => { const f = resolve(out, name); writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log(f); };
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://localhost:${server.config.server.port}/tools/puppet-lab/lab.html`);
  await page.waitForFunction(() => window.labReady, null, { timeout: 60_000 });
  for (const k of keys) {
    const t0 = Date.now();
    save(`${k}-compare.png`, await page.evaluate((k) => window.compare(k, 2), k));
    console.log(k, 'cuisson+planche', Date.now() - t0, 'ms');
    save(`${k}-grand.png`, await page.evaluate((k) => window.big(k, 5), k));
    save(`${k}-atlas.png`, await page.evaluate((k) => window.atlas(k), k));
    save(`${k}-normales.png`, await page.evaluate((k) => window.atlas(k, 'normal'), k));
    if (k === 'ren') save(`${k}-visee.png`, await page.evaluate((k) => window.aims(k, 2), k));
  }
} finally { await browser.close(); await server.close(); }

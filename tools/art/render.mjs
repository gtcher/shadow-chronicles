/**
 * Régénère les fonds de menu et les cartes de sélection :
 *   node tools/art/render.mjs [menu-ch1 select-taro …]
 * → public/assets/art/*.webp (peints par tools/art/paint.ts dans Chromium).
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const only = process.argv.slice(2);
const server = await createServer({ root, server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page:', e.message));
  await page.goto('http://localhost:5199/tools/art/art.html');
  await page.waitForFunction(() => typeof window.paintAll === 'function', null, { timeout: 60_000 });
  const out = await page.evaluate((o) => window.paintAll(o.length ? o : undefined), only);
  const dir = resolve(root, 'public/assets/art');
  mkdirSync(dir, { recursive: true });
  for (const [k, url] of Object.entries(out)) {
    const buf = Buffer.from(url.split(',')[1], 'base64');
    writeFileSync(resolve(dir, `${k}.webp`), buf);
    console.log(`${k}.webp  ${(buf.length / 1024).toFixed(0)} Ko`);
  }
} finally { await browser.close(); await server.close(); }

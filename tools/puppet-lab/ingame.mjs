/** node tools/puppet-lab/ingame.mjs <dossier> [héros…] : captures en combat, mobile (jeu servi par vite preview :4173). `?persos=v2` = avant. */
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const out = resolve(process.argv[2] ?? 'reports/puppet-lab'); mkdirSync(out, { recursive: true });
const heroes = process.argv.slice(3).length ? process.argv.slice(3) : ['ren'];
const browser = await chromium.launch();
try {
  for (const hero of heroes) for (const [tag, q] of [['avant', '&persos=v2'], ['apres', '']]) {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('page:', e.message));
    await page.addInitScript(() => { localStorage.setItem('sc-settings-v1', JSON.stringify({ tutorialDone: true, sanctuaryGuideDone: true, comfortAsked: true })); });
    await page.goto(`http://localhost:4173/?hero=${hero}&wave=3&seed=4&bot=1${q}`);
    await page.waitForFunction(() => window.game?.scenes?.current?.director, null, { timeout: 60000 });
    await page.waitForFunction(() => window.rigBaker?.busy === 0, null, { timeout: 120000 }).catch(() => {});
    for (const sec of [6, 9]) {
      await page.waitForTimeout(3000);
      await page.screenshot({ path: resolve(out, `jeu-${hero}-${tag}-${sec}.png`) });
    }
    await ctx.close();
  }
} finally { await browser.close(); }

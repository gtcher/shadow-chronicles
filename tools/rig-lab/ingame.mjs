/** node tools/rig-lab/ingame.mjs <dossier> [port] : captures en combat (jeu servi par vite preview). */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const out = resolve(process.argv[2] ?? 'reports/rig-lab'); mkdirSync(out, { recursive: true });
const port = process.argv[3] ?? '4173';
const browser = await chromium.launch();
const shots = [['taro', 3, 9], ['sena', 5, 14], ['ren', 7, 12], ['mei', 10, 14]];
try {
  for (const [hero, wave, sec] of shots) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    await page.addInitScript(() => { localStorage.setItem('sc-settings-v1', JSON.stringify({ tutorialDone: true, sanctuaryGuideDone: true, comfortAsked: true })); });
    await page.goto(`http://localhost:${port}/?hero=${hero}&wave=${wave}&seed=4&bot=1`);
    await page.waitForFunction(() => window.game?.scenes?.current?.director, null, { timeout: 60000 });
    await page.waitForFunction(() => window.rigBaker?.busy === 0, null, { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(sec * 1000);
    await page.screenshot({ path: resolve(out, `jeu-${hero}-v${wave}.png`) });
    await page.close();
  }
} finally { await browser.close(); }

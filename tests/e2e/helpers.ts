import { expect, type Page } from '@playwright/test';

export type W = Window & { game: any; bot: any; vfx: any };

/** Ouvre le jeu sans tutoriel et collecte les erreurs JS de la page. */
export async function open(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|AudioContext|autoplay/i.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('sc-settings-v1', JSON.stringify({ tutorialDone: true })); } catch { /* */ } });
  await page.goto(`/${query}`);
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 60_000 });
  return errors;
}

/** Attend que la scène de run soit prête. */
export async function waitRun(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as W).game?.scenes?.current?.director, null, { timeout: 30_000 });
}

/** Avance la simulation de `sec` secondes sans rendu (le robot joue s'il est actif). */
export async function sim(page: Page, sec: number): Promise<void> {
  await page.evaluate(async (s) => {
    const g = (window as unknown as W).game; g.stop();
    for (let i = 0; i < s * 60; i++) { g.tick(1 / 60); if (i % 600 === 599) await new Promise((r) => setTimeout(r, 0)); }
  }, sec);
}

/** Une image rendue (après une simulation manuelle). */
export async function frame(page: Page): Promise<void> {
  await page.evaluate(() => { const g = (window as unknown as W).game; g.frame(1, 1 / 60); });
}

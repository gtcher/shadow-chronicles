import { test, expect, type Page } from '@playwright/test';
import { waitRun, sim, type W } from './helpers';

/** Ouvre une run directe AVEC le tutoriel (première partie). */
async function openWithTuto(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?hero=taro&seed=3');
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 60_000 });
  await waitRun(page);
  return errors;
}

const coach = (page: Page) => page.locator('.sc-coach');
const tick = (page: Page, s: number) => sim(page, s).then(() => page.waitForTimeout(1100));

test('chaque étape disparaît dès que le joueur fait le geste demandé', async ({ page }) => {
  const errors = await openWithTuto(page);
  await expect(coach(page)).toContainText('Déplace-toi');
  // Alterner clavier / souris ne reconstruit pas le panneau (il « sautait »).
  await page.evaluate(() => { (document.querySelector('.sc-coach') as HTMLElement & { _mark?: number })._mark = 1; });
  await page.mouse.move(400, 400); await page.mouse.down(); await page.mouse.up();
  await page.keyboard.press('KeyL');
  expect(await page.evaluate(() => (document.querySelector('.sc-coach') as HTMLElement & { _mark?: number })?._mark)).toBe(1);

  await page.keyboard.down('KeyD'); await sim(page, 0.2); await page.keyboard.up('KeyD');
  await page.waitForTimeout(1100);
  await expect(coach(page)).toContainText('Frappe');

  await page.keyboard.down('KeyJ'); await sim(page, 0.3); await page.keyboard.up('KeyJ');
  await page.waitForTimeout(1100);
  await expect(coach(page)).toContainText('Esquive');

  await page.keyboard.down('Space'); await sim(page, 0.1); await page.keyboard.up('Space');
  await tick(page, 0.1);
  await expect(coach(page)).toContainText('Élimine');
  expect(errors).toEqual([]);
});

test('Passer ferme le tutoriel pour de bon', async ({ page }) => {
  await openWithTuto(page);
  await expect(coach(page)).toBeVisible();
  await page.keyboard.press('KeyL'); // dernier périphérique = clavier, puis clic souris sur Passer
  await page.getByRole('button', { name: 'Passer le tutoriel' }).click();
  await expect(coach(page)).toHaveCount(0);
  await sim(page, 5);
  await page.waitForTimeout(1500);
  await expect(coach(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as W).game !== undefined)).toBe(true);
  // Mémorisé : ne revient pas au rechargement.
  await page.reload();
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 60_000 });
  await waitRun(page);
  await page.waitForTimeout(1000);
  await expect(coach(page)).toHaveCount(0);
});

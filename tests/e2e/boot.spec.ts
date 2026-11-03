import { test, expect } from '@playwright/test';
import { open, waitRun, sim, frame, type W } from './helpers';

test('écran titre : 4 héros, aucun message d’erreur', async ({ page }) => {
  const errors = await open(page);
  const menu = page.getByRole('dialog', { name: 'Menu principal' });
  await expect(menu).toBeVisible();
  await expect(menu.locator('.sc-herocard')).toHaveCount(4);
  await expect(menu.getByRole('button', { name: /Partir en run|Nouvelle run/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('partir en run depuis le titre affiche le HUD et dessine l’arène', async ({ page }) => {
  const errors = await open(page, '?seed=7');
  await page.getByRole('dialog', { name: 'Menu principal' }).locator('.sc-herocard').nth(2).click();
  await page.getByRole('button', { name: /Partir en run|Nouvelle run/ }).click();
  await expect(page.getByRole('dialog', { name: 'Menu principal' })).toHaveCount(0);
  await expect(page.locator('.sc-hud')).toBeVisible();
  await waitRun(page);
  await sim(page, 3);
  await frame(page);
  // L'image n'est pas uniforme (le décor et le héros sont dessinés).
  const shot = await page.locator('canvas').first().screenshot();
  expect(shot.byteLength).toBeGreaterThan(20_000);
  expect(errors).toEqual([]);
});

test('pause au clavier (Échap) puis reprise', async ({ page }) => {
  await open(page, '?hero=taro&seed=3');
  await waitRun(page);
  await expect(page.locator('.sc-hud')).toBeVisible();
  await page.waitForTimeout(1000);
  // GPU logiciel : la page peut être lente à traiter la touche, on réessaie tant que la pause n'est pas ouverte.
  const paused = () => page.evaluate(() => (window as unknown as W).game.paused as boolean);
  await expect(async () => {
    if (!(await paused())) await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Pause' })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  expect(await paused()).toBe(true);
  await page.getByRole('button', { name: 'Reprendre' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).game.paused)).toBe(false);
});

test('mort du héros → écran de fin → nouvelle run', async ({ page }) => {
  const errors = await open(page, '?hero=mei&seed=5');
  await waitRun(page);
  await page.evaluate(() => (window as unknown as W).game.scenes.current.debugKillHero());
  await sim(page, 2.5);
  const end = page.getByRole('dialog', { name: 'Fin de la run' });
  await expect(end).toBeVisible();
  await end.getByRole('button', { name: /Encore une run/ }).click();
  await expect(end).toHaveCount(0);
  await waitRun(page);
  expect(await page.evaluate(() => (window as unknown as W).game.scenes.current.wave)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

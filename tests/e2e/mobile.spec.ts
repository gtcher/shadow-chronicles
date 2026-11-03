import { test, expect } from '@playwright/test';
import { open, waitRun, sim, type W } from './helpers';

test('mobile : titre lisible, commandes tactiles et joystick virtuel', async ({ page }) => {
  const errors = await open(page, '?seed=4');
  const menu = page.getByRole('dialog', { name: 'Menu principal' });
  await expect(menu).toBeVisible();
  // Aucun débordement horizontal sur un écran de téléphone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await menu.getByRole('button', { name: /Partir en run|Nouvelle run/ }).tap();
  await waitRun(page);
  await expect(page.locator('.sc-hud')).toBeVisible();
  await expect(page.locator('.sc-touch, .sc-touch-zone').first()).toBeAttached();
  // Le joystick virtuel déplace bien le héros.
  const before = await page.evaluate(() => { const s = (window as unknown as W).game.scenes.current; const w = s.world; const T = [...w.stores.entries()].find(([k]: [{ name?: string }]) => k.name === 'Transform')![1]; return T.get(s.player).x; });
  await page.evaluate(() => (window as unknown as W).game.input.setVirtualMove(1, 0));
  await sim(page, 1);
  const after = await page.evaluate(() => { const s = (window as unknown as W).game.scenes.current; const w = s.world; const T = [...w.stores.entries()].find(([k]: [{ name?: string }]) => k.name === 'Transform')![1]; return T.get(s.player).x; });
  expect(after - before).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

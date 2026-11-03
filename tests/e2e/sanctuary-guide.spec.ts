import { test, expect } from '@playwright/test';
import { open } from './helpers';

/** Guide du Sanctuaire : ouvert tout seul à la première visite, puis via « ? Guide ». */
test('Sanctuaire : guide à la première visite, objectif suivant et conditions visibles', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => {
    const sc = (window as unknown as { sc: {
      save: { update: (f: (p: { currencies: Record<string, number>; stats: { best: Record<string, number> } }) => void) => void };
      ui: { settings: { set: (k: string, v: boolean) => void } } } }).sc;
    sc.save.update((p) => { p.currencies.eclats = 30; p.stats.best.waveReached = 5; });
    sc.ui.settings.set('sanctuaryGuideSeen', false); // première visite
  });

  await page.getByRole('dialog', { name: 'Menu principal' }).getByRole('button', { name: /Sanctuaire/ }).click();
  const guide = page.getByRole('dialog', { name: 'Guide du Sanctuaire' });
  await expect(guide).toBeVisible();
  await expect(guide.getByText('Les trois monnaies')).toBeVisible();
  // Forge : vague 4 atteinte (record 5) et 30 éclats ≥ 25 → prête.
  const forge = guide.locator('.sc-glist li', { hasText: 'Bâtiment à restaurer' }).filter({ hasText: "Forge d'Akar" });
  await expect(forge).toHaveClass(/sc-ready/);
  await expect(guide.locator('.sc-glist li', { hasText: 'Pacte Interdit' })).toContainText('Vaincre le boss de la vague 5');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/guide.png`, fullPage: true });
  await guide.getByRole('button', { name: 'Compris' }).click();

  const sanct = page.getByRole('dialog', { name: "Sanctuaire d'Akar" });
  await expect(sanct).toBeVisible();
  await expect(sanct.locator('.sc-goal')).toContainText("Forge d'Akar");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/sanct.png` });
  // Pacte Interdit reste verrouillé tant que le boss de la vague 5 n'est pas tombé.
  await sanct.getByRole('tab', { name: /Autel des Serments/ }).click();
  await expect(sanct.locator('.sc-up', { hasText: 'Pacte Interdit' })).toContainText('🔒');

  // Le guide ne revient pas tout seul, mais reste accessible.
  await page.getByRole('button', { name: '← Retour' }).click();
  await page.getByRole('dialog', { name: 'Menu principal' }).getByRole('button', { name: /Sanctuaire/ }).click();
  await expect(sanct).toBeVisible();
  await expect(guide).toHaveCount(0);
  await sanct.getByRole('button', { name: 'Guide du Sanctuaire' }).click();
  await expect(guide).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(guide).toHaveCount(0);
  await expect(sanct).toBeVisible();
  expect(errors).toEqual([]);
});

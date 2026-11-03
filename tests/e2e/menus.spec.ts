import { test, expect, type Page } from '@playwright/test';
import { open, waitRun, sim, type W } from './helpers';

/**
 * Tour complet des menus : titre, réglages (son compris), Sanctuaire, défi du jour, Pactes,
 * pause, offre de bénédictions, fin de run. Chaque test vérifie aussi l'absence d'erreur JS.
 */

type A = { engine: { ready: boolean; ctx: { state: string } | null; settings: Record<string, number | boolean>; buses: Record<string, { gain: { value: number } }> } };
const audio = (page: Page) => page.evaluate(() => {
  const e = (window as unknown as { audio: A }).audio.engine;
  return { s: e.settings, running: e.ctx?.state === 'running', gains: e.ready ? Object.fromEntries(Object.entries(e.buses).map(([k, n]) => [k, n.gain.value])) : null };
});
const title = (page: Page) => page.getByRole('dialog', { name: 'Menu principal' });
const slider = (page: Page, label: string) => page.locator('.sc-settings label.sc-field', { hasText: label }).locator('input');

test('réglages Son : les curseurs changent vraiment le volume et sont gardés au rechargement', async ({ page }) => {
  test.setTimeout(420_000); // deux démarrages complets du jeu en GPU logiciel
  const errors = await open(page);
  await page.waitForFunction(() => (window as unknown as { audio?: unknown }).audio); // l'audio s'attache après l'écran titre
  await title(page).getByRole('button', { name: 'Réglages' }).click(); // ce clic débloque aussi l'audio
  await expect(page.getByRole('dialog', { name: 'Réglages' })).toBeVisible();
  await expect.poll(async () => (await audio(page)).gains !== null, { timeout: 30_000 }).toBe(true);

  await slider(page, 'Musique').fill('0');
  await slider(page, 'Volume général').fill('0.5');
  await slider(page, 'Effets').fill('0.2');
  await slider(page, 'Ambiance').fill('0');
  let a = await audio(page);
  expect(a.s).toMatchObject({ music: 0, master: 0.5, sfx: 0.2, ui: 0.2, ambience: 0 });
  // Les bus suivent (courbe perceptive v², rampe de 30 ms) : vérifiable seulement si l'horloge audio tourne.
  const live = a.running;
  if (live) {
    await expect.poll(async () => (await audio(page)).gains!.music, { timeout: 15_000 }).toBeLessThan(0.01);
    await expect.poll(async () => (await audio(page)).gains!.master, { timeout: 15_000 }).toBeCloseTo(0.25, 1);
  }

  await page.locator('.sc-settings label.sc-field', { hasText: 'Couper le son' }).locator('input').check();
  expect((await audio(page)).s.muted).toBe(true);
  if (live) await expect.poll(async () => (await audio(page)).gains!.master, { timeout: 15_000 }).toBeLessThan(0.01);
  await page.locator('.sc-settings label.sc-field', { hasText: 'Couper le son' }).locator('input').uncheck();
  await page.getByRole('button', { name: 'Fermer' }).click();
  await expect(title(page)).toBeVisible();

  // Rechargement : la sauvegarde rend les mêmes valeurs à l'audio.
  await page.waitForTimeout(1500); // écriture différée de la sauvegarde
  await page.reload();
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 120_000 });
  a = await audio(page);
  expect(a.s).toMatchObject({ music: 0, master: 0.5, sfx: 0.2, muted: false });
  await title(page).getByRole('button', { name: 'Réglages' }).click();
  await expect(slider(page, 'Musique')).toHaveValue('0');
  await expect(slider(page, 'Volume général')).toHaveValue('0.5');

  // Réinitialiser rétablit les volumes par défaut, y compris dans la sauvegarde.
  await page.getByRole('button', { name: 'Réinitialiser' }).click();
  a = await audio(page);
  expect(a.s.music).toBeGreaterThan(0.5);
  const saved = await page.evaluate(() => (window as unknown as { sc: { save: { settings: { audio: { music: number } } } } }).sc.save.settings.audio.music);
  expect(saved).toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
});

test('réglages visuels et gameplay : flashs, chiffres de dégâts, visée auto, accessibilité', async ({ page }) => {
  const errors = await open(page, '?hero=sena&seed=2');
  await waitRun(page);
  await expect(async () => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Pause' })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole('dialog', { name: 'Pause' }).getByRole('button', { name: 'Réglages' }).click();
  const field = (t: string) => page.locator('.sc-settings label.sc-field', { hasText: t }).locator('input');
  await field('Flashs plein écran').uncheck();
  await field('Chiffres de dégâts').uncheck();
  await field('Contraste élevé').check();
  await field('Mode gaucher').check();
  await page.locator('.sc-settings select').selectOption('deutan');
  const st = await page.evaluate(() => ({ vfx: (window as unknown as W).vfx.settings, cls: document.getElementById('sc-ui')!.className }));
  expect(st.vfx.flashes).toBe(false);
  expect(st.vfx.damageNumbers).toBe(false);
  expect(st.cls).toContain('sc-contrast');
  expect(st.cls).toContain('sc-lefty');
  expect(st.cls).toContain('sc-cb-deutan');
  // Échap ferme Réglages et revient à la pause, puis reprend.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Reprendre' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).game.paused)).toBe(false);
  expect(errors).toEqual([]);
});

test('titre → Sanctuaire (achat) → retour, défi du jour → retour, choix du héros', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => {
    const sc = (window as unknown as { sc: { save: { update: (f: (p: { currencies: Record<string, number> }) => void) => void }; title: () => void } }).sc;
    sc.save.update((p) => { p.currencies.eclats = 5000; p.currencies.poussiere = 5000; });
  });
  await title(page).getByRole('button', { name: /Sanctuaire/ }).click();
  const sanct = page.getByRole('dialog', { name: "Sanctuaire d'Akar" });
  await expect(sanct).toBeVisible();
  const buy = sanct.locator('.sc-up button:not([disabled])').first();
  await expect(buy).toBeVisible();
  const before = await sanct.locator('.sc-ranks .sc-on').count();
  await buy.click();
  await expect.poll(() => page.getByRole('dialog', { name: "Sanctuaire d'Akar" }).locator('.sc-ranks .sc-on').count()).toBeGreaterThan(before);
  await page.getByRole('button', { name: '← Retour' }).click();
  await expect(title(page)).toBeVisible();

  await title(page).getByRole('button', { name: /Défi du jour/ }).click();
  await expect(page.getByRole('dialog', { name: 'Défi du jour' })).toBeVisible();
  await page.getByRole('button', { name: 'Retour' }).click();
  await expect(title(page)).toBeVisible();

  // Sélection : un clic choisit, un clic sur le héros déjà choisi lance la run.
  const cards = title(page).locator('.sc-herocard');
  await cards.nth(3).click();
  await expect(cards.nth(3)).toHaveAttribute('aria-pressed', 'true');
  await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await title(page).getByRole('button', { name: /Partir en run/ }).click();
  await waitRun(page);
  expect(await page.evaluate(() => (window as unknown as W).game.scenes.current.heroId)).toBe('ren');
  expect(errors).toEqual([]);
});

test('run : fin de vague → offre de bénédictions → vague 2, puis abandon → titre', async ({ page }) => {
  const errors = await open(page, '?hero=taro&seed=11');
  await waitRun(page);
  const offer = page.getByRole('dialog', { name: 'Choisis une bénédiction' });
  for (let i = 0; i < 8 && !(await offer.isVisible()); i++) {
    await page.evaluate(() => (window as unknown as W).game.scenes.current.debugHitAll(99999));
    await sim(page, 2);
  }
  await expect(offer).toBeVisible();
  await expect(offer.locator('.sc-card')).toHaveCount(3);
  await offer.locator('.sc-card').first().click();
  await expect(offer).toHaveCount(0);
  await sim(page, 6); // compte à rebours de l'intermission
  expect(await page.evaluate(() => (window as unknown as W).game.scenes.current.wave)).toBe(2);

  await expect(async () => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Pause' })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByRole('dialog', { name: 'Pause' })).toContainText('vague 2');
  await page.getByRole('button', { name: 'Abandonner la run' }).click();
  await expect(title(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('fin de run : nouveau record, Sanctuaire et Menu principal', async ({ page }) => {
  const errors = await open(page, '?hero=mei&seed=5');
  await waitRun(page);
  await page.evaluate(() => (window as unknown as W).game.scenes.current.debugKillHero());
  await sim(page, 2.5);
  const end = page.getByRole('dialog', { name: 'Fin de la run' });
  await expect(end).toBeVisible();
  await expect(end).toContainText('Nouveau record'); // profil neuf : la première run est un record
  await end.getByRole('button', { name: /Sanctuaire/ }).click();
  await expect(page.getByRole('dialog', { name: "Sanctuaire d'Akar" })).toBeVisible();
  await page.getByRole('button', { name: '⚔ Partir' }).click();
  await waitRun(page);
  await expect(page.locator('.sc-hud')).toBeVisible();
  await page.evaluate(() => (window as unknown as W).game.scenes.current.debugKillHero());
  await sim(page, 2.5);
  await expect(end).toBeVisible();
  await expect(end).not.toContainText('Nouveau record'); // même vague qu'avant
  await end.getByRole('button', { name: 'Menu principal' }).click();
  await expect(title(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('défi du jour : run imposée, écran de résultat, retour', async ({ page }) => {
  const errors = await open(page);
  await title(page).getByRole('button', { name: /Défi du jour/ }).click();
  await page.getByRole('button', { name: /Relever le défi/ }).click();
  await waitRun(page);
  await expect(page.locator('.sc-hud')).toBeVisible();
  await page.evaluate(() => (window as unknown as W).game.scenes.current.debugKillHero());
  await sim(page, 2.5);
  const res = page.getByRole('dialog', { name: 'Résultat du défi' });
  await expect(res).toBeVisible();
  await res.getByRole('button', { name: 'Retour' }).click();
  await expect(title(page)).toBeVisible();
  // Second essai du jour : entraînement.
  await title(page).getByRole('button', { name: /Défi du jour/ }).click();
  await expect(page.getByRole('button', { name: /S'entraîner/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Pactes de la Brume : ouverture, rangs, retour', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => {
    const sc = (window as unknown as { sc: { save: { update: (f: (p: { pacts: { unlocked: boolean } }) => void) => void }; title: () => void } }).sc;
    sc.save.update((p) => { p.pacts.unlocked = true; });
    sc.title();
  });
  await title(page).getByRole('button', { name: /Pactes/ }).click();
  const pacts = page.getByRole('dialog', { name: 'Pactes de la Brume' });
  await expect(pacts).toBeVisible();
  await pacts.getByRole('button', { name: /Ajouter un rang/ }).first().click();
  await pacts.getByRole('button', { name: 'Retour' }).click();
  await expect(title(page).getByRole('button', { name: /Pactes · \d/ })).toBeVisible();
  expect(errors).toEqual([]);
});

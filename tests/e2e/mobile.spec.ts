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

test('mobile : bouton pause, réglages défilables (volume compris), fermer et reprendre', async ({ page }) => {
  const errors = await open(page, '?hero=sena&seed=4');
  await waitRun(page);
  await page.locator('.sc-hud').getByRole('button', { name: 'Pause' }).tap();
  const pause = page.getByRole('dialog', { name: 'Pause' });
  await expect(pause).toBeVisible();
  await pause.getByRole('button', { name: 'Réglages' }).tap();
  const settings = page.getByRole('dialog', { name: 'Réglages' });
  await expect(settings).toBeVisible();
  const music = settings.locator('label.sc-field', { hasText: 'Musique' }).locator('input');
  await music.scrollIntoViewIfNeeded();
  await music.fill('0.25');
  expect(await page.evaluate(() => (window as unknown as { audio: { engine: { settings: { music: number } } } }).audio.engine.settings.music)).toBe(0.25);
  const close = settings.getByRole('button', { name: 'Fermer' });
  await close.scrollIntoViewIfNeeded();
  await close.tap();
  await expect(pause).toBeVisible();
  await pause.getByRole('button', { name: 'Reprendre' }).tap();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).game.paused)).toBe(false);
  expect(errors).toEqual([]);
});

test('mobile en paysage : menu complet sans défiler, héros de front, caméra dézoomée et rotation', async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 412 });
  const errors = await open(page, '?seed=4');
  const menu = page.getByRole('dialog', { name: 'Menu principal' });
  await expect(menu).toBeVisible();
  // Les 4 héros tiennent sur une ligne et « Partir en run » est visible sans défiler.
  const tops = await menu.locator('.sc-herocard').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(20); // la carte choisie est juste un peu soulevée
  const go = menu.getByRole('button', { name: /Partir en run|Nouvelle run/ });
  const box = (await go.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(412);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await go.tap();
  await waitRun(page);
  // Téléphone en paysage : on voit autant de terrain en hauteur qu'en portrait.
  expect(await page.evaluate(() => (window as unknown as W).game.camera.targetZoom)).toBeLessThan(0.75);
  // Retour en portrait en pleine run : le canvas suit.
  await page.setViewportSize({ width: 412, height: 915 });
  await sim(page, 0.2);
  await page.evaluate(() => (window as unknown as W).game.frame(1, 1 / 60));
  expect(await page.evaluate(() => (window as unknown as W).game.renderer.height)).toBeCloseTo(915, -1);
  expect(errors).toEqual([]);
});

test('mobile : pas de zoom de la page, commandes écartées en portrait, menu sans voir la run avant', async ({ page }) => {
  // Le voile de chargement doit rester tant que le menu n'est pas affiché.
  await page.addInitScript(() => {
    (window as unknown as { seen: boolean }).seen = false;
    const check = () => {
      const l = document.getElementById('loading');
      const veiled = !!l && getComputedStyle(l).opacity === '1';
      if (!veiled && document.querySelector('canvas') && !document.querySelector('[aria-label="Menu principal"]')) (window as unknown as { seen: boolean }).seen = true;
      if (!document.querySelector('[aria-label="Menu principal"]') || l) requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
  const errors = await open(page, '');
  await expect(page.getByRole('dialog', { name: 'Menu principal' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { seen: boolean }).seen)).toBe(false);
  expect(await page.locator('meta[name=viewport]').getAttribute('content')).toContain('user-scalable=no');
  // Deux doigts posés (joystick + attaque) : le déplacement est annulé, donc pas de pincement.
  const prevented = await page.evaluate(() => {
    const t = (id: number, x: number) => new Touch({ identifier: id, target: document.body, clientX: x, clientY: 500 });
    const e = new TouchEvent('touchmove', { touches: [t(1, 60), t(2, 300)], cancelable: true, bubbles: true });
    document.body.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(true);

  await page.goto('/?hero=taro&seed=4');
  await waitRun(page);
  const gap = await page.evaluate(() => {
    const stick = document.querySelector('.sc-stick')!.getBoundingClientRect();
    const left = Math.min(...[...document.querySelectorAll('.sc-is-touch .sc-skill')].map((e) => e.getBoundingClientRect().left));
    return left - stick.right;
  });
  expect(gap).toBeGreaterThan(40);
  expect(errors).toEqual([]);
});

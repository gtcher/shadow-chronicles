import { test, expect } from '@playwright/test';
import { open, waitRun, type W } from './helpers';

/**
 * Fluidité : les combattants sont cuits à l'avance dans un worker. L'apparition d'un nouveau
 * type d'ennemi ne doit plus déclencher de cuisson sur le fil principal (gel de 0,2 à 0,5 s).
 */
type Baker = { busy: number; stats: { worker: number; main: number; sync: number; syncKeys: string[] }; size: number; bytes: number; pending(k: string): boolean };

test('cuisson des combattants en arrière-plan, sans gel en pleine vague', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await open(page, '?hero=mei&wave=2&seed=3&bot=1');
  await waitRun(page);
  // Laisser le worker cuire la vague en cours et la suivante (lent ici : GPU et canvas logiciels).
  await page.waitForFunction(() => {
    const rb = (window as unknown as { rigBaker: Baker }).rigBaker;
    return rb.busy === 0;
  }, null, { timeout: 120_000 });
  const before = await page.evaluate(() => { const st = (window as unknown as { rigBaker: Baker }).rigBaker.stats; return { ...st, syncKeys: [...st.syncKeys] }; });
  const r = await page.evaluate(async () => {
    const g = (window as unknown as W).game, s = g.scenes.current; g.stop();
    for (let i = 0; i < 60 * 45; i++) {
      g.tick(1 / 60);
      if (i % 20 === 0) g.frame(1, 1 / 60);
      if (i % 600 === 0) await new Promise((res) => setTimeout(res, 0));
    }
    const rb = (window as unknown as { rigBaker: Baker }).rigBaker;
    return { stats: { ...rb.stats, syncKeys: [...rb.stats.syncKeys] }, wave: s.wave, MB: rb.bytes / 1048576, size: rb.size };
  });
  // Le héros passé dans l'URL peut avoir été cuit d'urgence au lancement ; aucun ennemi ensuite.
  expect(r.stats.syncKeys, `cuissons sur le fil principal (avant : ${before.syncKeys})`).toEqual(before.syncKeys);
  expect(r.stats.worker + r.stats.main).toBeGreaterThanOrEqual(6);
  // Atlas rognés : la mémoire des feuilles reste raisonnable pour un mobile.
  expect(r.MB / Math.max(1, r.size), 'Mo par feuille').toBeLessThan(8);
  expect(errors).toEqual([]);
});

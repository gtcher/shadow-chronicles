import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { open, waitRun, type W } from './helpers';

/**
 * Budget de performance. Les mesures sont écrites dans reports/perf.json.
 * Chromium tourne ici avec un GPU logiciel (SwiftShader) : on mesure surtout le coût CPU
 * de la simulation, la mémoire, le nombre d'objets affichés et le poids du téléchargement,
 * qui sont fiables, plutôt que le nombre d'images par seconde.
 */
const BUDGET = {
  /**
   * JS compressé (gzip) chargé avant l'écran titre : le point d'entrée et ses modulepreload.
   * La run (combat, effets, combattants), le worker de cuisson et le rendu WebGPU se chargent à part.
   */
  jsGzipKB: 300,
  /** Octets téléchargés avant l'écran titre. */
  bootMB: 9,
  /** Coût moyen d'un pas de simulation (1/60 s) en pleine vague tardive. */
  tickAvgMs: 2.5,
  tickP99Ms: 8,
  /** Mémoire JS après 4 min de jeu, et croissance entre la 1re et la 4e minute (fuite). */
  heapMB: 160,
  heapGrowthMB: 25,
  /** Objets d'affichage dans la scène (particules comprises). */
  displayObjects: 4000,
};
const perf: Record<string, number> = {};
test.afterAll(() => {
  fs.mkdirSync('reports', { recursive: true });
  const prev = fs.existsSync('reports/perf.json') ? JSON.parse(fs.readFileSync('reports/perf.json', 'utf8')) : {};
  fs.writeFileSync('reports/perf.json', JSON.stringify({ ...prev, ...perf, budget: BUDGET, at: new Date().toISOString() }, null, 1));
});

test('poids : JS compressé et téléchargement au démarrage', async ({ page }) => {
  const gzKB = (files: string[]) => Math.round(files.reduce((s, f) => s + zlib.gzipSync(fs.readFileSync(path.join('dist', f))).byteLength, 0) / 1024);
  const html = fs.readFileSync('dist/index.html', 'utf8');
  const boot = [...html.matchAll(/(?:src|href)="\.\/(js\/[^"]+\.js)"/g)].map((m) => m[1]);
  expect(boot.length, 'scripts du démarrage trouvés dans index.html').toBeGreaterThan(0);
  perf.jsGzipKB = gzKB(boot);
  // Total (chargé à la demande compris), pour suivre la tendance.
  perf.jsTotalGzipKB = gzKB(fs.readdirSync('dist/js').filter((f) => f.endsWith('.js')).map((f) => `js/${f}`));
  const t0 = Date.now();
  await open(page);
  await expect(page.getByRole('dialog', { name: 'Menu principal' })).toBeVisible();
  perf.bootMs = Date.now() - t0;
  // Octets reçus (Resource Timing : images, sons, scripts) jusqu'à l'écran titre.
  const bytes = await page.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0));
  perf.bootMB = +(bytes / 1048576).toFixed(2);
  expect.soft(perf.jsGzipKB, 'JS gzip (Ko)').toBeLessThanOrEqual(BUDGET.jsGzipKB);
  expect.soft(perf.bootMB, 'téléchargement au démarrage (Mo)').toBeLessThanOrEqual(BUDGET.bootMB);
});

test('simulation : coût par pas, mémoire et fuites en vague tardive', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, '?hero=sena&wave=14&seed=9&bot=1');
  await waitRun(page);
  const m = await page.evaluate(async () => {
    const g = (window as unknown as W).game, s = g.scenes.current;
    g.stop();
    const heap = () => ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576;
    const times: number[] = [];
    let heap1 = 0, maxObjects = 0, maxEntities = 0;
    const count = (o: { children?: unknown[] }): number => 1 + (o.children ?? []).reduce((n: number, c) => n + count(c as { children?: unknown[] }), 0);
    for (let i = 0; i < 60 * 240; i++) {
      const t = performance.now();
      g.tick(1 / 60);
      times.push(performance.now() - t);
      if (i % 120 === 0) {
        g.frame(1, 1 / 60); // une image de temps en temps : les particules et vues vivent aussi
        maxObjects = Math.max(maxObjects, count(g.renderer.app.stage));
        maxEntities = Math.max(maxEntities, s.world.count);
      }
      if (i === 60 * 60) heap1 = heap();
      if (i % 600 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    times.sort((a, b) => a - b);
    return {
      tickAvgMs: times.reduce((a, b) => a + b, 0) / times.length, tickP99Ms: times[Math.floor(times.length * 0.99)],
      heapMB: heap(), heapGrowthMB: heap() - heap1, displayObjects: maxObjects, entities: maxEntities, wave: s.wave,
    };
  });
  for (const [k, v] of Object.entries(m)) perf[k] = +(+v).toFixed(2);
  expect.soft(m.tickAvgMs, 'pas moyen (ms)').toBeLessThanOrEqual(BUDGET.tickAvgMs);
  expect.soft(m.tickP99Ms, 'pas p99 (ms)').toBeLessThanOrEqual(BUDGET.tickP99Ms);
  expect.soft(m.heapMB, 'mémoire JS (Mo)').toBeLessThanOrEqual(BUDGET.heapMB);
  expect.soft(m.heapGrowthMB, 'croissance mémoire (Mo)').toBeLessThanOrEqual(BUDGET.heapGrowthMB);
  expect.soft(m.displayObjects, 'objets affichés').toBeLessThanOrEqual(BUDGET.displayObjects);
});

test('rendu : coût CPU d’une image (indicatif, GPU logiciel)', async ({ page }) => {
  await open(page, '?hero=ren&wave=12&seed=2&bot=1');
  await waitRun(page);
  const ms = await page.evaluate(async () => {
    const g = (window as unknown as W).game; g.stop();
    for (let i = 0; i < 60 * 20; i++) { g.tick(1 / 60); if (i % 600 === 0) await new Promise((r) => setTimeout(r, 0)); }
    const t: number[] = [];
    for (let i = 0; i < 60; i++) { g.tick(1 / 60); const a = performance.now(); g.frame(1, 1 / 60); t.push(performance.now() - a); }
    t.sort((a, b) => a - b);
    return t[30];
  });
  perf.frameMedianMsSwiftshader = +ms.toFixed(1);
});

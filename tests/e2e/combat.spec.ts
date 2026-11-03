import { test, expect } from '@playwright/test';
import { open, waitRun, type W } from './helpers';

for (const hero of ['taro', 'mei', 'sena', 'ren']) {
  test(`${hero} : le robot joue 90 s sans erreur et élimine des ennemis`, async ({ page }) => {
    const errors = await open(page, `?hero=${hero}&seed=11&bot=0.85`);
    await waitRun(page);
    const r = await page.evaluate(() => (window as unknown as W).bot.runFast({ seconds: 90 }));
    expect(errors).toEqual([]);
    expect(r.kills).toBeGreaterThan(15);
    expect(r.reached).toBeGreaterThanOrEqual(2);
    // Aucun ennemi « zombie » (PV ≤ 0 mais toujours en jeu) : c'était le bug du saignement.
    const zombies = await page.evaluate(() => {
      const s = (window as unknown as W).game.scenes.current, w = s.world;
      const st = (n: string) => [...w.stores.entries()].find(([k]: [{ name?: string }]) => k.name === n)?.[1];
      const F = st('Foe'), H = st('Health');
      return F ? [...F.keys()].filter((e: number) => H.get(e)?.hp <= 0).length : 0;
    });
    expect(zombies).toBe(0);
  });
}

for (const [wave, boss] of [[5, 'captain'], [10, 'oracle'], [15, 'arbiter'], [20, 'sovereign']] as const) {
  test(`boss vague ${wave} (${boss}) : 3 phases puis victoire de vague`, async ({ page }) => {
    const errors = await open(page, `?hero=sena&wave=${wave}&seed=4`);
    await waitRun(page);
    const log = await page.evaluate(async () => {
      const g = (window as unknown as W).game, out: string[] = [];
      g.events.on('boss:spawn', (e: { id: string }) => out.push(`spawn:${e.id}`));
      g.events.on('boss:phase', (e: { phase: number }) => out.push(`phase:${e.phase}`));
      g.events.on('boss:killed', (e: { id: string }) => out.push(`killed:${e.id}`));
      g.events.on('wave:clear', (e: { wave: number }) => out.push(`clear:${e.wave}`));
      g.stop();
      const s = g.scenes.current;
      for (let i = 0; i < 60 * 90 && !out.some((x) => x.startsWith('clear')); i++) {
        g.tick(1 / 60);
        s.debugHeal();
        if (i > 60 * 5 && i % 30 === 0) s.debugHitBoss(0.04);
        if (i % 600 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      return out;
    });
    expect(errors).toEqual([]);
    expect(log[0]).toBe(`spawn:${boss}`);
    expect(log).toContain('phase:2');
    expect(log).toContain('phase:3');
    expect(log).toContain(`killed:${boss}`);
  });
}

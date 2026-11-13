/**
 * node tools/puppet-lab/touchaim.mjs <préfixe> [query] : Ren au tactile (Pixel 7), court à gauche puis à droite
 * en tirant (visée assistée). Vérifie que l'arc et le regard suivent le tir, pas la course.
 */
import { chromium, devices } from 'playwright';
const out = process.argv[2] ?? 'reports/touchaim', q = process.argv[3] ?? '';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('page:', e.message));
await page.addInitScript(() => { localStorage.setItem('sc-settings-v1', JSON.stringify({ tutorialDone: true, sanctuaryGuideDone: true, comfortAsked: true })); });
await page.goto(`http://localhost:${process.env.PORT ?? 4173}/?hero=ren&wave=2&seed=4${q}`);
await page.waitForFunction(() => window.game?.scenes?.current?.director, null, { timeout: 60000 });
await page.waitForFunction(() => window.rigBaker?.busy === 0, null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(2500);
let bad = 0, n = 0;
for (let i = 0; i < 24; i++) {
  const st = await page.evaluate((i) => {
    const s = window.game.scenes.current, inp = window.game.input;
    const mx = i % 8 < 4 ? -1 : 1;
    inp.setVirtualMove(mx, 0.15); inp.setVirtualHeld('attack', true);
    const comp = (name) => [...s.world.stores].find(([t]) => t.name === name)?.[1];
    const h = comp('Hero').get(s.player), r = s.rigs.get(s.player);
    return { mx, facing: h.facing, shotX: h.shotX, shotY: h.shotY, aim: r?.aim };
  }, i);
  await page.waitForTimeout(250);
  if (st.shotX !== undefined && Math.abs(st.shotX) > 0.2) {
    n++;
    const want = Math.atan2(st.shotY, Math.abs(st.shotX));
    const ok = Math.sign(st.shotX) === st.facing && Math.abs((st.aim ?? 0) - want) < 0.5;
    if (!ok) bad++;
    console.log(`course ${st.mx > 0 ? '→' : '←'}  tir ${st.shotX > 0 ? '→' : '←'} (${st.shotX.toFixed(2)}, ${st.shotY.toFixed(2)})  regard ${st.facing > 0 ? '→' : '←'}  arc ${(st.aim ?? 0).toFixed(2)} / voulu ${want.toFixed(2)} ${ok ? '' : '  ✗'}`);
  }
  if (i === 6 || i === 14) await page.screenshot({ path: `${out}-${i}.png` });
}
console.log(`${n - bad}/${n} tirs avec l'arc et le regard dans l'axe du tir`);
await browser.close();

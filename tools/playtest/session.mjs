// Session de test « joueur » : profil neuf, écran titre, run(s) jouées par le robot avec un niveau donné,
// captures aux moments clés (titre, tutoriel, combat, offres de bénédictions, fin de run, Sanctuaire, Codex)
// et journal JSON (vagues, temps, gains, erreurs). Sert aux testeurs IA (tools/playtest/README.md).
// Usage : node tools/playtest/session.mjs --out reports/playtest/alice --device iphone --hero mei --skill 0.4 --runs 2 --minutes 12
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://localhost:4173');
const out = arg('out', 'reports/playtest/session');
const hero = arg('hero', 'taro');
const skill = Number(arg('skill', '0.6'));
const runs = Number(arg('runs', '2'));
const minutes = Number(arg('minutes', '12'));
const seed = Number(arg('seed', '7'));
const device = arg('device', 'desktop');
const DEV = {
  desktop: { viewport: { width: 1280, height: 720 } },
  laptop: { viewport: { width: 1440, height: 900 } },
  iphone: { ...devices['iPhone 13'] },
  pixel: { ...devices['Pixel 7'] },
  ipad: { ...devices['iPad (gen 7)'] },
};
fs.mkdirSync(out, { recursive: true });
const log = { device, hero, skill, seed, runs: [], errors: [], shots: [], timings: {} };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const ctx = await browser.newContext({ ...(DEV[device] ?? DEV.desktop), deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => log.errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|AudioContext|autoplay/i.test(m.text())) log.errors.push(m.text()); });
let n = 0;
const shot = async (name, note = '') => {
  const f = `${String(++n).padStart(2, '0')}-${name}.png`;
  try { await page.evaluate(() => { const g = window.game; if (g && !g.running) g.frame?.(1, 1 / 60); }); } catch { /* */ }
  await page.screenshot({ path: `${out}/${f}` });
  log.shots.push({ file: f, note });
};
// Clic DOM (insensible aux animations et aux surcouches) ; lève une erreur si rien ne correspond.
const click = async (sel, text) => {
  const ok = await page.evaluate(({ sel, src, flags }) => {
    const re = src ? new RegExp(src, flags) : null;
    const el = [...document.querySelectorAll(sel)].reverse().find((e) => e.offsetParent !== null && (!re || re.test(e.textContent)));
    if (el) el.click();
    return !!el;
  }, { sel, src: text ? (text instanceof RegExp ? text.source : text) : null, flags: text instanceof RegExp ? text.flags : '' });
  if (!ok) throw new Error(`introuvable : ${sel} ${text ?? ''}`);
};
const t0 = Date.now();
await page.goto(`${url}/?bot=${skill}&seed=${seed}`);
await page.locator('#loading').waitFor({ state: 'detached', timeout: 90_000 });
log.timings.loadMs = Date.now() - t0;
await page.waitForTimeout(1200);
await shot('titre', 'premier écran, profil neuf');

for (let r = 0; r < runs; r++) {
  // Choix du héros puis départ
  try { if (await page.locator(`.sc-herocard[aria-label^="${hero[0].toUpperCase() + hero.slice(1)}"][aria-pressed="false"]`).count()) await click(`.sc-herocard[aria-label^="${hero[0].toUpperCase() + hero.slice(1)}"]`); } catch { /* */ }
  await page.waitForTimeout(400);
  await click('.sc-btn', /Partir en run|Nouvelle run|Encore une run/);
  await page.waitForFunction(() => window.game?.scenes?.current?.director, null, { timeout: 60_000 });
  await page.waitForTimeout(2500);
  if (r === 0) await shot('debut-run', 'premières secondes (tutoriel si profil neuf)');
  // La page joue (robot) et rend la main à chaque moment à capturer : offre de bénédictions, combat, fin.
  await page.evaluate(({ minutes }) => {
    const g = window.game, s = g.scenes.current;
    const st = window.__pt = { ev: [], picks: [], offers: [], i: 0, max: minutes * 3600, lastShot: 0, hurt: 0, drops: 0 };
    const on = (k, f) => g.events.on(k, (e) => { if (g.scenes.current === s) f(e ?? {}); });
    on('wave:clear', (e) => st.ev.push({ t: Math.round(s.time), k: 'clear', wave: e.wave, damageTaken: e.damageTaken }));
    on('boss:spawn', (e) => st.ev.push({ t: Math.round(s.time), k: 'boss', id: e.id }));
    on('boss:killed', (e) => st.ev.push({ t: Math.round(s.time), k: 'bossKilled', id: e.id }));
    on('player:hurt', () => st.hurt++);
    on('loot:drop', (e) => { st.drops++; if (/legend|epic|heroic|ancestral/i.test(e.rarity)) st.ev.push({ t: Math.round(s.time), k: 'drop', rarity: e.rarity }); });
    on('achievement:unlock', (e) => st.ev.push({ t: Math.round(s.time), k: 'succes', name: e.name }));
    on('blessing:pick', (e) => st.ev.push({ t: Math.round(s.time), k: 'pick', rarity: e.rarity, duo: e.duo, legendary: e.legendary }));
    g.stop();
    window.__play = async (o) => {
      const bot = window.bot;
      const text = (c) => c.innerText.replace(/\s+/g, ' ').trim().slice(0, 170);
      while (st.i < st.max && !bot.report.died && bot.report.cleared < 20) {
        if (g.paused) {
          const cards = [...document.querySelectorAll('.sc-card:not(.sc-chosen):not(.sc-discard)')];
          if (cards.length && !st.shown) { st.shown = true; st.offers.push(cards.map(text)); if (o.offerShots > 0) return 'offer'; }
          if (cards.length) { bot.clickOffer(); st.shown = false; const c = document.querySelector('.sc-card.sc-chosen'); st.picks.push(c ? text(c).slice(0, 90) : '?'); }
          await new Promise((r) => setTimeout(r, 150)); g.tick(1 / 60); st.i++; continue;
        }
        for (let k = 0; k < 300 && !g.paused; k++, st.i++) g.tick(1 / 60);
        if (o.combatShots > 0 && st.i - st.lastShot > 3600 * o.combatEvery) { st.lastShot = st.i; g.frame(1, 1 / 60); return 'combat'; }
        await new Promise((r) => setTimeout(r, 0));
      }
      return 'done';
    };
  }, { minutes });
  let offerShots = r === 0 ? 2 : 0, combatShots = r === 0 ? 5 : 0;
  for (;;) {
    const why = await page.evaluate((o) => window.__play(o), { offerShots, combatShots, combatEvery: 1.5 });
    if (why === 'done') break;
    if (why === 'offer') { await page.waitForTimeout(800); await shot(`offre-${3 - offerShots}`, 'offre de bénédictions'); offerShots--; }
    if (why === 'combat') { const m = await page.evaluate(() => (window.__pt.i / 3600).toFixed(1)); await shot(`combat-${6 - combatShots}`, `combat, ${m} min de jeu`); combatShots--; }
  }
  const all = await page.evaluate(() => { const s = window.__pt; return { offersSeen: s.offers, picks: s.picks, ev: s.ev, hurt: s.hurt, drops: s.drops, minutes: +(s.i / 3600).toFixed(1) }; });
  const rep = await page.evaluate(() => ({ ...window.bot.report, waves: window.bot.report.waves }));
  log.runs.push({ run: r + 1, report: rep, minutesPlayed: all.minutes, hitsTaken: all.hurt, lootDrops: all.drops, offers: all.offersSeen, picks: all.picks, events: all.ev });
  // Fin de run : on relance la boucle réelle pour laisser l'écran de fin s'afficher.
  await page.evaluate(() => window.game.start());
  if (!rep.died) {
    // Temps limite atteint : le héros tombe pour afficher l'écran de fin.
    for (let k = 0; k < 12 && !(await page.locator('.sc-btn', { hasText: 'Encore une run' }).count()); k++) {
      await page.evaluate(() => { const s = window.game.scenes.current; if (s?.debugKillHero && !s.over) s.debugKillHero(); });
      await page.waitForTimeout(800);
    }
  }
  await page.locator('.sc-btn', { hasText: 'Encore une run' }).first().waitFor({ timeout: 20_000 }).catch(() => log.errors.push('écran de fin absent'));
  await page.waitForTimeout(1500);
  await shot(`fin-run-${r + 1}`, `écran de fin de run ${r + 1}`);
  log.runs[r].endText = await page.evaluate(() => document.querySelector('#ui, body').innerText.replace(/\s+/g, ' ').slice(0, 900));
  if (r < runs - 1) {
    // Passage par le Sanctuaire entre deux runs
    try {
      await click('.sc-btn', 'Sanctuaire'); await page.waitForTimeout(1500); await shot('sanctuaire', 'Sanctuaire après la run');
      log.sanctuaryText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1500));
      await page.keyboard.press('Escape'); await page.waitForTimeout(800);
    } catch (e) { log.errors.push('navigation sanctuaire: ' + e.message); }
    try { await page.evaluate(() => window.bot.report.died = false); } catch { /* */ }
    // Revenir au titre si besoin
    if (await page.locator('.sc-btn', { hasText: /Partir en run|Nouvelle run|Encore une run/ }).count() === 0) {
      try { await click('.sc-btn', /Menu principal|Retour/); await page.waitForTimeout(800); } catch { await page.goto(`${url}/?bot=${skill}&seed=${seed + r + 1}`); await page.locator('#loading').waitFor({ state: 'detached', timeout: 90_000 }); await page.waitForFunction(() => window.bot, null, { timeout: 30_000 }); }
    }
    await page.evaluate((sd) => { const b = window.bot; b.report = { ...b.report, reached: 0, cleared: 0, won: false, died: false, time: 0, kills: 0, waves: [], deathCause: null }; }, seed);
  }
}
try {
  if (await page.locator('.sc-btn', { hasText: 'Menu principal' }).count()) { await click('.sc-btn', 'Menu principal'); await page.waitForTimeout(1200); }
  await shot('titre-apres', 'écran titre après les runs');
  if (await page.locator('.sc-codex-btn').count()) { await click('.sc-codex-btn'); await page.waitForTimeout(1200); await shot('codex', 'Codex des Brumes'); }
} catch (e) { log.errors.push('fin: ' + e.message); }
fs.writeFileSync(`${out}/session.json`, JSON.stringify(log, null, 1));
console.log(`${out} : ${log.runs.map((x) => `run ${x.run} vague ${x.report.reached}${x.report.died ? ' mort' : x.report.won ? ' victoire' : ''} (${x.report.time}s)`).join(' · ')} · ${log.shots.length} captures · ${log.errors.length} erreurs`);
await browser.close();

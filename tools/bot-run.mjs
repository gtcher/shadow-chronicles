// Lance des runs du robot en accéléré dans Chromium (sans rendu) et écrit un rapport JSON.
// Usage : node tools/bot-run.mjs --url http://localhost:4173 --heroes taro,mei,sena,ren --seeds 1,2,3 --skill 0.85 --out reports/run.json
import { chromium } from 'playwright';
import fs from 'node:fs';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://localhost:4173');
const heroes = arg('heroes', 'taro,mei,sena,ren').split(',');
const seeds = arg('seeds', '1,2,3').split(',').map(Number);
const skills = arg('skill', '0.85').split(',').map(Number);
const until = Number(arg('until', '20'));
const startWave = Number(arg('wave', '1'));
const par = Number(arg('par', '4'));
const out = arg('out', 'reports/bot.json');
const jobs = [];
for (const skill of skills) for (const hero of heroes) for (const seed of seeds) jobs.push({ hero, seed, skill });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const results = [];
const t0 = Date.now();
async function worker() {
  while (jobs.length) {
    const j = jobs.shift();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => localStorage.setItem('sc-settings-v1', JSON.stringify({ tutorialDone: true })));
    await page.goto(`${url}/?hero=${j.hero}&wave=${startWave}&seed=${j.seed}&bot=${j.skill}`);
    await page.waitForFunction(() => window.bot && window.game?.scenes?.current?.director, null, { timeout: 60000 });
    const r = await page.evaluate((u) => window.bot.runFast({ seconds: 2400, untilWave: u }), until);
    r.errors = errors;
    results.push(r);
    console.log(`${j.hero.padEnd(5)} skill ${j.skill} seed ${j.seed} → vague ${r.reached}, ${r.died ? 'mort (' + r.deathCause + ')' : r.won ? 'VICTOIRE' : 'arrêt'} · ${r.time}s · ${r.kills} kills${errors.length ? ' · ERREURS ' + errors.length : ''}`);
    await page.close();
  }
}
await Promise.all(Array.from({ length: par }, worker));
await browser.close();
fs.mkdirSync(out.replace(/\/[^/]*$/, ''), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 1));
console.log(`${results.length} runs en ${Math.round((Date.now() - t0) / 1000)} s → ${out}`);

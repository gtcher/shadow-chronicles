// Résumé d'un rapport du robot : taux de victoire, vague atteinte, durée des vagues et des boss.
import fs from 'node:fs';
const runs = JSON.parse(fs.readFileSync(process.argv[2] ?? 'reports/bot.json', 'utf8'));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const groups = {};
for (const r of runs) (groups[`${r.hero} ${r.skill}`] ??= []).push(r);
console.log('héros  niveau  victoires  vague méd.  durée victoire  morts (cause)');
for (const [k, g] of Object.entries(groups).sort()) {
  const wins = g.filter((r) => r.won);
  const causes = {};
  for (const r of g) if (r.died) causes[r.deathCause?.split(':')[0] ?? '?'] = (causes[r.deathCause?.split(':')[0] ?? '?'] ?? 0) + 1;
  console.log(`${k.padEnd(14)} ${String(wins.length + '/' + g.length).padEnd(10)} ${String(med(g.map((r) => r.cleared))).padEnd(11)} ${wins.length ? Math.round(avg(wins.map((r) => r.time)) / 60) + ' min' : '-'}`.padEnd(54) + JSON.stringify(causes));
}
const all = runs.flatMap((r) => r.waves.filter((w) => w.cleared).map((w) => ({ ...w, hero: r.hero })));
console.log('\nvague  durée moy.  dégâts PV (% max)  bouclier absorbé  coups  survie (passé / atteint)');
for (let w = 1; w <= 20; w++) {
  const ws = all.filter((x) => x.wave === w);
  const reached = runs.filter((r) => r.reached >= w).length, passed = runs.filter((r) => r.cleared >= w).length;
  console.log(`${String(w).padStart(2)} ${(ws[0]?.boss ?? '').padEnd(9)} ${String(Math.round(avg(ws.map((x) => x.time))) + ' s').padEnd(10)} ${String(Math.round(100 * avg(ws.map((x) => x.damageTaken / x.hpMax))) + ' %').padEnd(18)} ${String(Math.round(100 * avg(ws.map((x) => (x.absorbed ?? 0) / x.hpMax))) + ' %').padEnd(17)} ${String(Math.round(avg(ws.map((x) => x.hits ?? 0)))).padEnd(6)} ${passed}/${reached}`);
}

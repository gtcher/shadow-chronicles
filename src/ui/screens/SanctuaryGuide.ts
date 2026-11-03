import { h, fmt } from '../dom';
import { SANCTUARY, BLESSINGS, requirementText, requirementProgress } from '../data';
import type { MetaProfile } from './Sanctuary';

/** Un déblocage du Sanctuaire, avec sa condition et où en est le joueur. */
export interface Goal {
  id: string;
  icon: string;
  name: string;
  /** Où le trouver (« Bâtiment », « Autel des Serments »…). */
  where: string;
  /** Ce que ça apporte, en une ligne. */
  gives: string;
  req?: string;
  cost?: { amount: number; currency: string };
  done: boolean;
  progress: { met: boolean; cur: number; target: number };
}

const PACTS_REQ = 'bossKilled:10';

/** Tous les déblocages qui ont une condition (bâtiments en ruine, patrons, Braises, Pactes), dans l'ordre de la partie. */
export function sanctuaryGoals(p: MetaProfile): Goal[] {
  const goals: Goal[] = [];
  for (const b of SANCTUARY.buildings) {
    if (b.unlockedAtStart) continue;
    const [[c, v]] = Object.entries(b.unlockCost ?? { eclats: 0 });
    goals.push({ id: b.id, icon: b.icon, name: b.name, where: 'Bâtiment à restaurer', gives: b.desc, req: b.requires,
      cost: { amount: v, currency: c }, done: p.unlocked.includes(b.id), progress: requirementProgress(b.requires, p.stats) });
  }
  for (const b of SANCTUARY.buildings) for (const u of b.upgrades) {
    if (!u.requires) continue;
    const patron = u.unlocksPatron ? BLESSINGS.patrons[u.unlocksPatron] : undefined;
    goals.push({ id: `${b.id}.${u.id}`, icon: patron?.icon ?? u.icon ?? b.icon, name: u.name, where: b.name,
      gives: patron ? `Nouveau patron de bénédictions : ${patron.name}.` : ((u as { desc?: string }).desc ?? ''),
      req: u.requires, cost: { amount: u.cost[0], currency: u.currency ?? b.currency },
      done: (p.ranks[`${b.id}.${u.id}`] ?? 0) > 0, progress: requirementProgress(u.requires, p.stats) });
  }
  const pr = requirementProgress(PACTS_REQ, p.stats);
  goals.push({ id: 'pacts', icon: '☁', name: 'Pactes de la Brume', where: 'Menu principal',
    gives: 'Difficulté à la carte : plus de récompenses et des Sceaux du Juge.', req: PACTS_REQ, done: pr.met, progress: pr });
  // Ordre de jeu : d'abord la vague / les runs à atteindre, puis les boss, puis le reste.
  const rank = (g: Goal) => g.progress.target * (g.req?.startsWith('bossKilled') ? 2 : g.req?.startsWith('legendary') ? 4 : 1);
  return goals.sort((a, b) => rank(a) - rank(b));
}

/** Le prochain objectif à montrer : un déblocage prêt (condition remplie) d'abord, sinon le plus avancé. */
export function nextGoal(p: MetaProfile): Goal | undefined {
  const open = sanctuaryGoals(p).filter((g) => !g.done);
  return open.find((g) => g.progress.met)
    ?? open.slice().sort((a, b) => b.progress.cur / (b.progress.target || 1) - a.progress.cur / (a.progress.target || 1))[0];
}

const SOURCES: Record<string, string> = {
  eclats: '1 par vague franchie, les contrats de vague, +10 par boss et les succès. Tu les gardes même si tu meurs.',
  poussiere: 'Chaque objet que tu ne gardes pas pendant une run est démantelé en poussière. Elle sert à la Forge.',
  sceaux: 'Monnaie rare : succès de rang « mythe » et paliers des Pactes de la Brume. Sert aux déblocages interdits.',
};

const cur = (c: string) => SANCTUARY.currencies[c] ?? { icon: '✦', color: '#d9ab74', name: c };

/** Barre « 2 / 4 » pour une condition (vide si pas de condition chiffrée). */
export function goalBar(g: Goal): HTMLElement | null {
  if (!g.progress.target) return null;
  const k = g.progress.cur / g.progress.target;
  return h('div', { class: 'sc-gbar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(g.progress.target), 'aria-valuenow': String(g.progress.cur) },
    h('span', { style: { width: `${Math.round(k * 100)}%` } }), h('em', {}, `${g.progress.cur} / ${g.progress.target}`));
}

export function costChip(g: Goal, wallet: Record<string, number>): HTMLElement | null {
  if (!g.cost) return null;
  const ok = (wallet[g.cost.currency] ?? 0) >= g.cost.amount;
  return h('span', { class: `sc-gcost${ok ? ' sc-ok' : ''}`, title: cur(g.cost.currency).name, '--c': cur(g.cost.currency).color },
    `${fmt(g.cost.amount)} ${cur(g.cost.currency).icon}`);
}

function status(g: Goal): HTMLElement {
  if (g.done) return h('span', { class: 'sc-gstate sc-done' }, '✓ Débloqué');
  if (g.progress.met) return h('span', { class: 'sc-gstate sc-ready' }, g.cost ? 'Prêt : il reste à payer' : 'Prêt');
  return h('span', { class: 'sc-gstate' }, 'Verrouillé');
}

/** Guide du Sanctuaire : la boucle de jeu, les monnaies, et tout ce qui reste à débloquer avec la progression. */
export function sanctuaryGuide(p: MetaProfile, onClose: () => void, assetUrl?: string): HTMLElement {
  const steps: Array<[string, string, string]> = [
    ['⚔', 'Pars en run', 'Choisis un héros et tiens le plus de vagues possible.'],
    ['✦', 'Ramène du butin', 'Éclats, poussière et sceaux sont gardés, même si tu meurs.'],
    ['♥', 'Dépense-les ici', 'Améliorations permanentes et nouveaux bâtiments.'],
    ['↻', 'Repars plus fort', 'Chaque run va un peu plus loin et débloque la suite.'],
  ];
  const goals = sanctuaryGoals(p);
  const left = goals.filter((g) => !g.done).length;
  const ok = h('button', { class: 'sc-btn sc-primary', 'data-autofocus': '', onclick: onClose }, 'Compris');
  const el = h('section', { class: `sc-screen${assetUrl ? ' sc-bg' : ''}`, style: assetUrl ? { backgroundImage: `url(${assetUrl})` } : undefined,
    role: 'dialog', 'aria-label': 'Guide du Sanctuaire' },
  h('div', { class: 'sc-guide sc-panel' },
    h('header', {}, h('div', { class: 'sc-sub' }, 'Guide'), h('h2', { class: 'sc-title' }, 'Comment progresser'),
      h('p', {}, 'Chaque run, même perdue, rapporte des ressources que tu gardes. Le Sanctuaire les transforme en puissance permanente et ouvre de nouveaux bâtiments, patrons et modes.')),
    h('ol', { class: 'sc-gloop' }, ...steps.map(([i, t, d], n) => h('li', { style: { animationDelay: `${n * 70}ms` } }, h('b', {}, i), h('strong', {}, t), h('span', {}, d)))),
    h('h3', {}, 'Les trois monnaies'),
    h('div', { class: 'sc-gcur' }, ...['eclats', 'poussiere', 'sceaux'].map((c) =>
      h('div', { '--c': cur(c).color }, h('b', {}, cur(c).icon), h('div', {}, h('strong', {}, `${cur(c).name} · ${fmt(p.wallet[c] ?? 0)}`), h('p', {}, SOURCES[c] ?? ''))))),
    h('h3', {}, left ? `À débloquer (${left} sur ${goals.length})` : 'Tout est débloqué !'),
    h('ul', { class: 'sc-glist' }, ...goals.map((g) => h('li', { class: g.done ? 'sc-done' : g.progress.met ? 'sc-ready' : '' },
      h('b', { class: 'sc-gico' }, g.icon),
      h('div', {}, h('strong', {}, g.name), h('small', {}, ` · ${g.where}`), h('p', {}, g.gives),
        h('div', { class: 'sc-greq' }, h('span', {}, `${g.done || g.progress.met ? '✓' : '🔒'} ${requirementText(g.req)}`), goalBar(g), g.cost ? h('span', { class: 'sc-gthen' }, 'puis') : null, costChip(g, p.wallet))),
      status(g)))),
    h('div', { class: 'sc-gtips' },
      h('p', {}, h('span', { class: 'sc-dot sc-inline' }), ' Un point doré sur un bâtiment signale une amélioration que tu peux acheter.'),
      h('p', {}, 'Les quatre héros sont jouables dès le départ. Chacun gagne de la maîtrise à chaque run, même perdue.')),
    h('div', { class: 'sc-row', style: { justifyContent: 'center' } }, ok)));
  return el;
}

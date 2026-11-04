import { h, countUp } from '../dom';

export interface RunEndOptions {
  victory: boolean;
  wave: number;
  bestWave: number;
  kills: number;
  timeSec: number;
  gains: { eclats: number; poussiere?: number; sceaux?: number };
  mastery: { hero: string; level: number; from: number; to: number; gained?: number };   // progression 0..1 du niveau, XP gagnée
  next?: { icon: string; name: string; cost: number; currencyIcon: string; affordable: boolean };
  near: Array<{ icon: string; name: string; progress: number; label: string }>;
  onRetry: () => void;
  onSanctuary: () => void;
  /** Retour à l'écran titre. */
  onMenu?: () => void;
}

/** Fin de run « gains d'abord » : ce qui est gagné, la prochaine amélioration, les succès presque atteints. */
export function runEndScreen(o: RunEndOptions): HTMLElement {
  const newBest = o.wave > o.bestWave;
  const gains = [
    { label: "Éclats d'Akar", value: o.gains.eclats, c: '#d9ab74', icon: '✦' },
    { label: 'Vague atteinte', value: o.wave, c: newBest ? '#f6dca4' : undefined, icon: '' },
    { label: 'Éliminations', value: o.kills, c: '#ff8a7a', icon: '' },
  ];
  const vals: HTMLElement[] = [];
  const xpBar = h('i', { style: { width: `${o.mastery.from * 100}%` } });
  const root = h('section', { class: 'sc-screen', role: 'dialog', 'aria-label': 'Fin de la run' },
    h('div', { class: 'sc-end sc-panel' },
      h('div', { class: 'sc-sub' }, o.victory ? 'Victoire' : `Tombé à la vague ${o.wave} · ${Math.floor(o.timeSec / 60)} min ${Math.floor(o.timeSec % 60)} s`),
      h('h2', { class: 'sc-title', style: { fontSize: '2em' } }, o.victory ? 'Le Juge est tombé' : 'Ce que tu rapportes'),
      newBest ? h('p', { style: { color: 'var(--gold-hi)', margin: '6px 0 0', fontWeight: '700' } }, `★ Nouveau record : vague ${o.wave} (+5 ✦)`) : null,
      h('div', { class: 'sc-gains' }, ...gains.map((g) => h('div', { class: 'sc-gain', '--c': g.c }, (vals[vals.length] = h('strong', {}, '0')), h('span', {}, g.label)))),
      h('div', { class: 'sc-xp' }, `Maîtrise de ${o.mastery.hero} · niveau ${o.mastery.level}`, o.mastery.gained ? h('b', { style: { color: 'var(--gold-hi)', marginLeft: '8px' } }, `+${o.mastery.gained} XP`) : null, h('div', { class: 'sc-track' }, xpBar)),
      o.next ? h('div', { class: 'sc-next' }, h('i', {}, o.next.icon),
        h('div', {}, h('b', {}, o.next.affordable ? 'Amélioration disponible !' : 'Prochaine amélioration'), h('div', { style: { color: 'var(--mute)', fontSize: '0.9em' } }, `${o.next.name} · ${o.next.cost} ${o.next.currencyIcon}`))) : null,
      o.near.length ? h('div', { class: 'sc-near' }, h('div', { class: 'sc-sub', style: { display: 'block' } }, 'Presque…'),
        ...o.near.map((a) => { const bar = h('i', { style: { width: `${a.progress * 100}%` } });
          return h('div', {}, h('span', {}, a.icon), h('span', {}, a.name), h('small', { style: { color: 'var(--mute)' } }, a.label), h('div', { class: 'sc-track' }, bar)); })) : null,
      h('div', { class: 'sc-row' },
        h('button', { class: 'sc-btn sc-primary', onclick: o.onRetry, 'data-autofocus': true }, '⟳ Encore une run'),
        h('button', { class: `sc-btn${o.next?.affordable ? ' sc-primary' : ''}`, onclick: o.onSanctuary }, '♜ Sanctuaire'),
        o.onMenu ? h('button', { class: 'sc-btn sc-ghost', onclick: o.onMenu }, 'Menu principal') : null)));
  requestAnimationFrame(() => {
    gains.forEach((g, i) => setTimeout(() => countUp(vals[i], g.value, 800, g.icon ? `+` : ''), 150 + i * 220));
    requestAnimationFrame(() => (xpBar.style.width = `${o.mastery.to * 100}%`));
  });
  return root;
}

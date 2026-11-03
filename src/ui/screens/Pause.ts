import { h } from '../dom';
import { BLESSINGS, HERO_INFO, type Blessing, type HeroId, type Rarity } from '../data';

export interface PauseOptions {
  hero: HeroId;
  owned: Array<{ blessing: Blessing; rarity: Rarity }>;
  wave: number;
  onResume: () => void;
  onSettings: () => void;
  onCodex?: () => void;
  onQuit: () => void;
}

/** Pause : reprendre / réglages / abandonner + rappel du build et des résonances. */
export function pauseScreen(o: PauseOptions): HTMLElement {
  const counts: Record<string, number> = {};
  for (const { blessing } of o.owned) counts[blessing.patron] = (counts[blessing.patron] ?? 0) + 1;
  const build = h('div', { class: 'sc-build' },
    h('h4', {}, `Build de ${HERO_INFO[o.hero].name} · vague ${o.wave}`),
    o.owned.length
      ? h('ul', {}, ...o.owned.map(({ blessing: b, rarity }) => {
        const p = BLESSINGS.patrons[b.patron];
        return h('li', { '--c': p.color }, h('i', {}, p.icon), h('div', {}, h('b', {}, b.name), h('small', {}, `${BLESSINGS.slots[b.slot]?.name ?? b.slot} · ${BLESSINGS.rarities[rarity].name}`)));
      }))
      : h('p', { style: { color: 'var(--mute)' } }, 'Aucune bénédiction pour l\'instant. Termine une vague pour en choisir une.'),
    h('div', { class: 'sc-reso' }, ...Object.entries(counts).map(([pid, n]) => {
      const p = BLESSINGS.patrons[pid];
      return h('div', { '--c': p.color, title: p.resonance.map((r) => `${r.count} : ${r.desc}`).join('\n') },
        p.icon, ...[2, 4, 6].map((t) => h('span', { class: `sc-pip${n >= t ? ' sc-on' : ''}` })));
    })));
  return h('section', { class: 'sc-screen', role: 'dialog', 'aria-label': 'Pause' },
    h('div', { class: 'sc-pause sc-panel' },
      h('h2', { class: 'sc-title' }, 'Pause'),
      h('div', { class: 'sc-stack' },
        h('button', { class: 'sc-btn sc-primary', onclick: o.onResume, 'data-autofocus': true }, 'Reprendre'),
        h('button', { class: 'sc-btn', onclick: o.onSettings }, 'Réglages'),
        o.onCodex ? h('button', { class: 'sc-btn', onclick: o.onCodex }, '📜 Codex') : null,
        h('button', { class: 'sc-btn sc-ghost', onclick: o.onQuit }, 'Abandonner la run'),
        h('p', { style: { color: 'var(--mute)', fontSize: '0.8em', textAlign: 'center' } }, h('span', { class: 'sc-kbd' }, 'Échap'), ' pour reprendre')),
      build));
}

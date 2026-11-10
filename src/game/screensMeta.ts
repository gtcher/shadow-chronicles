import { h } from '../ui/dom';
import { HERO_IDS, HERO_INFO, type HeroId } from '../ui/data';
import { LOOK_SLOTS, SLOT_NAMES, type LookSlot } from './cosmetics';
import { formatTime, ordinal, type RunRecord } from './records';

/**
 * Écrans « Apparence » (cosmétiques de maîtrise) et « Records » (classement personnel).
 * Style de src/ui (classes sc-*), affichés avec `ui.show(el)`.
 */

const sub = (text: string) => h('div', { class: 'sc-sub', style: { display: 'block' } }, text);
const hexc = (c?: number) => (c === undefined ? undefined : `#${c.toString(16).padStart(6, '0')}`);

export interface LookScreenOptions {
  hero: HeroId;
  mastery: { level: number; progress: number; xpInLevel: number; xpForNext: number | null };
  track: Array<{ level: number; label: string; cosmetic: boolean; reached: boolean }>;
  options: Record<LookSlot, Array<{ id: string; name: string; desc: string; owned: boolean; color?: number }>>;
  equipped: Partial<Record<LookSlot, string>>;
  onHero: (hero: HeroId) => void;
  onEquip: (slot: LookSlot, id: string | undefined) => void;
  onBack: () => void;
}

/** Apparence d'un héros : paliers de maîtrise, puis titre / sillage / tenue / aura à porter. */
export function lookScreen(o: LookScreenOptions): HTMLElement {
  const info = HERO_INFO[o.hero];
  const slot = (s: LookSlot) => {
    const opts = o.options[s];
    if (!opts.length) return null;
    const cur = o.equipped[s];
    return h('div', { class: 'sc-look-slot' }, h('h4', {}, SLOT_NAMES[s]),
      h('div', { class: 'sc-look-opts', role: 'group', 'aria-label': SLOT_NAMES[s] },
        h('button', { class: 'sc-look-opt', 'aria-pressed': String(!cur), onclick: () => o.onEquip(s, undefined) }, 'Aucun'),
        ...opts.map((x) => h('button', {
          class: `sc-look-opt${x.owned ? '' : ' sc-locked'}`, 'aria-pressed': String(cur === x.id), disabled: !x.owned, title: x.desc,
          '--c': hexc(x.color), onclick: () => o.onEquip(s, x.id),
        }, x.color !== undefined ? h('i', { class: 'sc-swatch' }) : null, x.owned ? x.name : `🔒 ${x.name}`))));
  };
  return h('section', { class: 'sc-screen', role: 'dialog', 'aria-label': 'Apparence' },
    h('div', { class: 'sc-end sc-panel sc-look', style: { maxWidth: '720px', '--c': info.color } },
      sub('Débloqué en jouant : chaque run compte, même perdue'),
      h('h2', { class: 'sc-title', style: { fontSize: '1.9em' } }, '🎨 Apparence'),
      h('div', { class: 'sc-tabs', role: 'tablist' }, ...HERO_IDS.map((id) =>
        h('button', { role: 'tab', 'aria-selected': String(id === o.hero), class: 'sc-tab', '--c': HERO_INFO[id].color, onclick: () => o.onHero(id) }, HERO_INFO[id].name))),
      h('div', { class: 'sc-xp' }, `Maîtrise de ${info.name} · niveau ${o.mastery.level}`,
        o.mastery.xpForNext ? h('small', { style: { color: 'var(--mute)', marginLeft: '8px' } }, `${o.mastery.xpInLevel} / ${o.mastery.xpForNext} XP`) : null,
        h('div', { class: 'sc-track' }, h('i', { style: { width: `${o.mastery.progress * 100}%` } }))),
      h('ol', { class: 'sc-look-track' }, ...o.track.map((l) => h('li', { class: `${l.reached ? 'sc-on' : ''}${l.cosmetic ? ' sc-cosm' : ''}` },
        h('b', {}, l.reached ? '✓' : String(l.level)), h('span', {}, l.label)))),
      ...LOOK_SLOTS.map(slot),
      h('div', { class: 'sc-row' }, h('button', { class: 'sc-btn sc-primary', onclick: o.onBack, 'data-autofocus': true }, 'Retour'))));
}

export interface RecordsScreenOptions {
  tab: HeroId | 'all';
  rows: RunRecord[];
  /** Run la plus récente (mise en avant si elle est classée). */
  latestAt?: number;
  bestByHero: Partial<Record<HeroId, RunRecord>>;
  dailyBest?: { score: number; day: string; wave: number };
  onTab: (tab: HeroId | 'all') => void;
  onPlay: () => void;
  onBack: () => void;
}

/** Classement personnel : 10 meilleures runs (tous héros ou un héros), record de chaque héros, meilleur défi. */
export function recordsScreen(o: RecordsScreenOptions): HTMLElement {
  const tabs: Array<[HeroId | 'all', string]> = [['all', 'Tous'], ...HERO_IDS.map((id): [HeroId, string] => [id, HERO_INFO[id].name])];
  const date = (at: number) => new Date(at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  return h('section', { class: 'sc-screen', role: 'dialog', 'aria-label': 'Records' },
    h('div', { class: 'sc-end sc-panel', style: { maxWidth: '720px' } },
      sub('Tes meilleures runs sur cet appareil'),
      h('h2', { class: 'sc-title', style: { fontSize: '1.9em' } }, '🏆 Records'),
      h('div', { class: 'sc-herobest' }, ...HERO_IDS.map((id) => {
        const b = o.bestByHero[id];
        return h('div', { '--c': HERO_INFO[id].color }, h('b', {}, HERO_INFO[id].name), h('span', {}, b ? (b.won ? '★ Victoire' : `Vague ${b.wave}`) : '—'),
          b ? h('small', {}, formatTime(b.timeSec)) : null);
      })),
      h('div', { class: 'sc-tabs', role: 'tablist' }, ...tabs.map(([id, name]) =>
        h('button', { role: 'tab', 'aria-selected': String(id === o.tab), class: 'sc-tab', '--c': id === 'all' ? undefined : HERO_INFO[id].color, onclick: () => o.onTab(id) }, name))),
      o.rows.length
        ? h('table', { class: 'sc-ranks' },
          h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Héros'), h('th', {}, 'Vague'), h('th', {}, 'Temps'), h('th', {}, 'Ombres'), h('th', {}, 'Date'))),
          h('tbody', {}, ...o.rows.map((r, i) => h('tr', { class: r.at === o.latestAt ? 'sc-latest' : '' },
            h('td', {}, i < 3 ? ['🥇', '🥈', '🥉'][i] : ordinal(i + 1)),
            h('td', { style: { color: HERO_INFO[r.hero].color } }, HERO_INFO[r.hero].name),
            h('td', {}, r.won ? '★ 20' : String(r.wave), r.discovery ? h('small', { title: 'Mode Découverte' }, ' 🌱') : null, r.pact ? h('small', { title: 'Pactes de la Brume' }, ` ☁${r.pact}`) : null),
            h('td', {}, formatTime(r.timeSec)), h('td', {}, String(r.kills)), h('td', {}, date(r.at))))))
        : h('p', { style: { color: 'var(--mute)', margin: '18px 0' } }, 'Aucune run classée pour l\'instant. Lance une run : elle entrera dans ton classement.'),
      o.dailyBest ? h('p', { style: { color: 'var(--mute)', fontSize: '0.9em' } }, `☀ Meilleur défi du jour : ${o.dailyBest.score.toLocaleString('fr-FR')} pts (vague ${o.dailyBest.wave}, le ${o.dailyBest.day.split('-').reverse().slice(0, 2).join('/')})`) : null,
      h('div', { class: 'sc-row' },
        h('button', { class: 'sc-btn sc-primary', onclick: o.onPlay, 'data-autofocus': true }, '⚔ Battre un record'),
        h('button', { class: 'sc-btn sc-ghost', onclick: o.onBack }, 'Retour'))));
}

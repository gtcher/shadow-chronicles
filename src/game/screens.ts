import { h, fmt, countUp } from '../ui/dom';
import { HERO_INFO, type HeroId } from '../ui/data';
import { PACTS, pactPoints, type DailyConfig, type PactRanks } from './modes';

/**
 * Écrans du défi quotidien et des Pactes de la Brume. Ils réutilisent le style de src/ui (classes sc-*)
 * et s'affichent avec `ui.show(el)`.
 */

const sub = (text: string) => h('div', { class: 'sc-sub', style: { display: 'block' } }, text);
const mute = (text: string) => h('p', { style: { color: 'var(--mute)', margin: '4px 0' } }, text);
const tag = (text: string, color: string) => h('span', { class: 'sc-tag', '--c': color, style: { display: 'inline-block', margin: '3px' } }, text);

export interface DailyIntroOptions {
  daily: DailyConfig;
  streak: number;
  /** Premier essai déjà joué aujourd'hui : les suivants sont de l'entraînement. */
  played: { score: number; wave: number } | null;
  history: Array<{ day: string; score: number; wave: number }>;
  onStart: () => void;
  onBack: () => void;
}

export function dailyIntroScreen(o: DailyIntroOptions): HTMLElement {
  const d = o.daily, info = HERO_INFO[d.hero as HeroId];
  const [y, m, da] = d.day.split('-');
  return h('section', { class: 'sc-screen', role: 'dialog', 'aria-label': 'Défi du jour' },
    h('div', { class: 'sc-end sc-panel', style: { maxWidth: '620px' } },
      sub(`Défi du ${da}/${m}/${y} · même run pour tous`),
      h('h2', { class: 'sc-title', style: { fontSize: '1.9em' } }, '☀ Défi du jour'),
      h('div', { class: 'sc-gains' },
        h('div', { class: 'sc-gain', '--c': info?.color }, h('strong', {}, info?.name ?? d.hero), h('span', {}, 'Héros imposé')),
        h('div', { class: 'sc-gain', '--c': d.mode === 'cauchemar' ? '#ff7a4d' : undefined }, h('strong', {}, d.mode === 'cauchemar' ? 'Cauchemar' : 'Survie'), h('span', {}, 'Mode')),
        h('div', { class: 'sc-gain' }, h('strong', {}, String(d.waves)), h('span', {}, 'Vagues'))),
      h('div', { style: { textAlign: 'left', margin: '12px 0' } },
        ...d.modifiers.map((x) => h('div', { class: 'sc-next', style: { margin: '6px 0' } },
          h('i', {}, x.type === 'positive' ? '✚' : '☠'),
          h('div', {}, h('b', { style: { color: x.type === 'positive' ? '#9fe8a8' : '#ff9a8a' } }, x.name), h('div', { style: { color: 'var(--mute)', fontSize: '0.9em' } }, x.desc))))),
      mute('Bénédiction de départ rare. Le Sanctuaire est désactivé pour l\'équité.'),
      o.played ? h('p', { style: { color: 'var(--gold-hi)', fontWeight: '700' } }, `Essai noté : ${fmt(o.played.score)} pts (vague ${o.played.wave}). Les essais suivants sont de l'entraînement.`) : null,
      h('p', {}, `Série : ${o.streak} 🔥`),
      o.history.length ? h('div', { style: { color: 'var(--mute)', fontSize: '0.85em' } }, 'Derniers jours : ',
        ...o.history.slice(-5).map((x) => tag(`${x.day.slice(8)}/${x.day.slice(5, 7)} · ${fmt(x.score)}`, '#d9ab74'))) : null,
      h('div', { class: 'sc-row' },
        h('button', { class: 'sc-btn sc-primary', onclick: o.onStart, 'data-autofocus': true }, o.played ? '⚔ S\'entraîner' : '⚔ Relever le défi'),
        h('button', { class: 'sc-btn sc-ghost', onclick: o.onBack }, 'Retour'))));
}

export interface DailyResultOptions {
  won: boolean;
  wave: number;
  waves: number;
  score: number;
  parts: Array<[string, number]>;
  counted: boolean;
  streak: number;
  rewards: string[];
  share: string;
  onRetry: () => void;
  onBack: () => void;
}

export function dailyResultScreen(o: DailyResultOptions): HTMLElement {
  const total = h('strong', {}, '0');
  const copyBtn = h('button', { class: 'sc-btn', onclick: () => {
    void navigator.clipboard?.writeText(o.share).then(() => { copyBtn.textContent = '✓ Copié'; }, () => { copyBtn.textContent = o.share; });
  } }, '⧉ Copier le résultat');
  const root = h('section', { class: 'sc-screen', role: 'dialog', 'aria-label': 'Résultat du défi' },
    h('div', { class: 'sc-end sc-panel', style: { maxWidth: '560px' } },
      sub(o.won ? 'Défi accompli' : `Tombé à la vague ${o.wave} / ${o.waves}`),
      h('h2', { class: 'sc-title', style: { fontSize: '1.9em' } }, o.counted ? 'Score du jour' : 'Entraînement'),
      h('div', { class: 'sc-gains' }, h('div', { class: 'sc-gain', '--c': '#ffd27a' }, total, h('span', {}, 'points'))),
      h('table', { style: { width: '100%', margin: '8px 0', fontSize: '0.92em' } },
        ...o.parts.filter(([, v]) => v !== 0).map(([k, v]) => h('tr', {}, h('td', { style: { color: 'var(--mute)', textAlign: 'left' } }, k),
          h('td', { style: { textAlign: 'right', color: v < 0 ? '#ff9a8a' : undefined } }, `${v > 0 ? '+' : ''}${fmt(v)}`)))),
      o.counted ? h('p', {}, `Série : ${o.streak} 🔥`, o.rewards.length ? ` · ${o.rewards.join(' · ')}` : '') : mute('Seul le premier essai du jour compte pour le score et la série.'),
      h('div', { class: 'sc-row' },
        copyBtn,
        h('button', { class: 'sc-btn sc-primary', onclick: o.onRetry, 'data-autofocus': true }, '⟳ S\'entraîner'),
        h('button', { class: 'sc-btn sc-ghost', onclick: o.onBack }, 'Retour'))));
  requestAnimationFrame(() => countUp(total, o.score, 1100));
  return root;
}

export interface PactsOptions {
  ranks: PactRanks;
  bestPoints: number;
  claimed: number[];
  onChange: (r: PactRanks) => void;
  onStart: () => void;
  onBack: () => void;
}

/** Choix des Pactes de la Brume : rangs par contrainte, total de points, paliers et bonus de récompense. */
export function pactsScreen(o: PactsOptions): HTMLElement {
  const ranks: PactRanks = { ...o.ranks };
  const totalEl = h('strong', {}, '0');
  const bonusEl = h('span', {}, '');
  const rows = PACTS.list.map((p) => {
    const val = h('b', { style: { minWidth: '2.6em', textAlign: 'center', display: 'inline-block' } }, '');
    const set = (v: number) => {
      ranks[p.id] = Math.max(0, Math.min(p.ranks, v));
      val.textContent = `${ranks[p.id]}/${p.ranks}`;
      refresh();
    };
    const row = h('div', { class: 'sc-next', style: { margin: '5px 0' } },
      h('div', { style: { flex: '1', textAlign: 'left' } }, h('b', {}, p.name), h('small', { style: { color: 'var(--gold-hi)' } }, `  ${p.pointsPerRank} pt${p.pointsPerRank > 1 ? 's' : ''}/rang`),
        h('div', { style: { color: 'var(--mute)', fontSize: '0.85em' } }, p.effect)),
      h('button', { class: 'sc-btn sc-ghost', 'aria-label': `Retirer un rang à ${p.name}`, onclick: () => set((ranks[p.id] ?? 0) - 1) }, '−'),
      val,
      h('button', { class: 'sc-btn sc-ghost', 'aria-label': `Ajouter un rang à ${p.name}`, onclick: () => set((ranks[p.id] ?? 0) + 1) }, '+'));
    val.textContent = `${ranks[p.id] ?? 0}/${p.ranks}`;
    return row;
  });
  const miles = h('div', { style: { margin: '8px 0' } });
  function refresh() {
    const pts = pactPoints(ranks);
    totalEl.textContent = String(pts);
    bonusEl.textContent = pts ? `+${pts * PACTS.rewardPerPoint.eclatsPct} % d'éclats · +${pts * PACTS.rewardPerPoint.lootRarityLuckPct} % de chance de butin` : 'Aucune contrainte : run normale.';
    miles.replaceChildren(...PACTS.milestones.map((m) => tag(`${o.claimed.includes(m.points) ? '✓' : pts >= m.points ? '◆' : '◇'} ${m.points} pts`, o.claimed.includes(m.points) ? '#9fe8a8' : pts >= m.points ? '#ffd27a' : '#8c8c8c')));
    o.onChange({ ...ranks });
  }
  const root = h('section', { class: 'sc-screen', role: 'dialog', 'aria-label': 'Pactes de la Brume' },
    h('div', { class: 'sc-end sc-panel', style: { maxWidth: '680px', maxHeight: '92vh', overflowY: 'auto' } },
      sub(`Record : ${o.bestPoints} points`),
      h('h2', { class: 'sc-title', style: { fontSize: '1.8em' } }, '☁ Pactes de la Brume'),
      h('div', { class: 'sc-gains' }, h('div', { class: 'sc-gain', '--c': '#b9a4ff' }, totalEl, h('span', {}, 'points de Brume'))),
      h('p', {}, bonusEl),
      mute('Paliers : vaincre le boss de la vague 10 avec ce total donne des Sceaux, des titres et des cosmétiques.'),
      miles,
      h('div', {}, ...rows),
      h('div', { class: 'sc-row' },
        h('button', { class: 'sc-btn sc-primary', onclick: o.onStart, 'data-autofocus': true }, '⚔ Partir avec ce pacte'),
        h('button', { class: 'sc-btn sc-ghost', onclick: o.onBack }, 'Retour'))));
  refresh();
  return root;
}

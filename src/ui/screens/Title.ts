import { h } from '../dom';
import { HERO_IDS, HERO_INFO, type HeroId } from '../data';

export interface TitleOptions {
  assetUrl: (key: string) => string | undefined;
  hero: HeroId;
  /** Progression de maîtrise 0..1 par héros (agent Sauvegarde). */
  mastery?: Partial<Record<HeroId, { level: number; progress: number }>>;
  daily?: { label: string; streak: number };
  /** Expédition sauvegardée à reprendre. */
  resume?: { label: string; onResume: () => void; onDiscard: () => void };
  onPlay: (hero: HeroId) => void;
  onDaily?: () => void;
  /** Pactes de la Brume (après le boss de la vague 10) : points engagés. */
  pacts?: { points: number };
  onPacts?: () => void;
  onSanctuary: () => void;
  onSettings: () => void;
  /** Codex des Brumes : % découvert et découvertes pas encore consultées. */
  codex?: { pct: number; fresh: number };
  onCodex?: () => void;
  /** Chapitre le plus loin atteint (0..3) : choisit le fond peint du menu. */
  chapter?: number;
}

/** Nom des chapitres (guide DA §4), affiché discrètement sous le titre. */
const CHAPTER_NAMES = ['La Cour des Veilleurs', 'Les Remparts écarlates', 'La Nécropole lunaire', 'La Porte de l’Éclipse'];

/** URL d'un asset, ou `fallback` s'il n'existe pas (anciens manifests, aperçu UI). */
function art(o: TitleOptions, key: string, fallback: string): string | undefined {
  try { return o.assetUrl(key) ?? o.assetUrl(fallback); } catch { try { return o.assetUrl(fallback); } catch { return undefined; } }
}

/** Écran titre : choix du héros + accès Sanctuaire, défi du jour, réglages. */
export function titleScreen(o: TitleOptions): HTMLElement {
  let hero = o.hero;
  const cards = HERO_IDS.map((id) => {
    const info = HERO_INFO[id];
    const m = o.mastery?.[id];
    const card = h('button', { class: 'sc-herocard', '--c': info.color, 'aria-pressed': String(id === hero), 'aria-label': `${info.name}, ${info.role}`,
      style: { backgroundImage: `url(${art(o, `select-${id}`, `hero-${id}`)})` },
      onclick: () => { if (hero === id) o.onPlay(hero); hero = id; cards.forEach((c, i) => c.setAttribute('aria-pressed', String(HERO_IDS[i] === id))); },
      ondblclick: () => o.onPlay(id) },
    h('div', {}, h('h4', {}, info.name), h('p', {}, info.role),
      h('div', { class: 'sc-mast', title: `Maîtrise ${m?.level ?? 1}` }, h('i', { style: { width: `${(m?.progress ?? 0) * 100}%` } }))));
    return card;
  });
  const ch = Math.max(0, Math.min(3, o.chapter ?? 0));
  return h('section', { class: `sc-screen sc-bg sc-menu sc-ch${ch + 1}`, role: 'dialog', 'aria-label': 'Menu principal' },
    h('div', { class: 'sc-bgart', 'aria-hidden': 'true', style: { backgroundImage: `url(${art(o, `menu-ch${ch + 1}`, 'ruined-citadel')})` } }),
    h('div', { class: 'sc-motes', 'aria-hidden': 'true' }, ...Array.from({ length: 18 }, (_, i) => h('i', { style: { left: `${(i * 53) % 100}%`, animationDelay: `${-(i * 1.7) % 14}s`, animationDuration: `${10 + (i * 7) % 9}s` } }))),
    h('div', { class: 'sc-center' },
      h('h1', { class: 'sc-title sc-logo' }, 'Shadow Chronicles', h('small', {}, 'Les Serments d\'Akar')),
      ch > 0 ? h('p', { class: 'sc-chapter' }, `Chapitre ${ch + 1} · ${CHAPTER_NAMES[ch]}`) : null,
      h('div', { class: 'sc-heroes', role: 'group', 'aria-label': 'Choix du héros' }, ...cards),
      o.resume ? h('div', { class: 'sc-next', style: { maxWidth: '560px', margin: '0 auto 14px' } }, h('i', {}, '⟲'),
        h('div', { style: { flex: '1' } }, h('b', {}, 'Expédition en cours'), h('div', { style: { color: 'var(--mute)', fontSize: '0.9em' } }, o.resume.label)),
        h('button', { class: 'sc-btn sc-primary', onclick: o.resume.onResume, 'data-autofocus': true }, 'Reprendre'),
        h('button', { class: 'sc-btn sc-ghost', onclick: o.resume.onDiscard, 'aria-label': 'Abandonner l\'expédition' }, '✕')) : null,
      h('div', { class: 'sc-row' },
        h('button', { class: `sc-btn${o.resume ? '' : ' sc-primary'}`, style: { minWidth: '220px', fontSize: '1.15em' }, onclick: () => o.onPlay(hero) }, o.resume ? '⚔  Nouvelle run' : '⚔  Partir en run'),
        h('button', { class: 'sc-btn', onclick: o.onSanctuary }, '♜ Sanctuaire'),
        o.onCodex ? h('button', { class: 'sc-btn sc-codex-btn', onclick: (e: Event) => { (e.currentTarget as HTMLElement).querySelector('.sc-badge')?.remove(); o.onCodex!(); }, title: o.codex ? `Codex des Brumes · ${o.codex.pct} % découvert` : 'Codex des Brumes' },
          '📜 Codex', o.codex?.fresh ? h('span', { class: 'sc-badge', 'aria-label': `${o.codex.fresh} nouvelles découvertes` }, String(Math.min(99, o.codex.fresh))) : null) : null,
        o.pacts && o.onPacts ? h('button', { class: 'sc-btn', onclick: o.onPacts, title: 'Pactes de la Brume' }, `☁ Pactes${o.pacts.points ? ` · ${o.pacts.points}` : ''}`) : null,
        h('button', { class: 'sc-btn sc-ghost', onclick: o.onSettings, 'aria-label': 'Réglages' }, '⚙ Réglages')),
      o.daily ? h('button', { class: 'sc-daily sc-panel sc-btn sc-ghost', onclick: o.onDaily },
        h('span', {}, '☀'), h('span', {}, 'Défi du jour : ', h('b', {}, o.daily.label)), h('span', {}, `Série ${o.daily.streak} 🔥`)) : null));
}

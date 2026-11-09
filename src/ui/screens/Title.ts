import { h } from '../dom';
import { HERO_IDS, HERO_INFO, type HeroId } from '../data';

export interface TitleOptions {
  assetUrl: (key: string) => string | undefined;
  hero: HeroId;
  /** Progression de maîtrise 0..1 par héros (agent Sauvegarde). */
  mastery?: Partial<Record<HeroId, { level: number; progress: number; xpInLevel?: number; xpForNext?: number | null }>>;
  daily?: { label: string; streak: number; next?: string };
  /** Missions du jour : remplies / 3, coffre ouvert. */
  missions?: { done: number; total: number; chest: boolean };
  onMissions?: () => void;
  /** Expédition sauvegardée à reprendre. */
  resume?: { label: string; onResume: () => void; onDiscard: () => void };
  onPlay: (hero: HeroId) => void;
  onDaily?: () => void;
  /** Pactes de la Brume (après le boss de la vague 10) : points engagés. */
  pacts?: { points: number };
  onPacts?: () => void;
  /** Pactes pas encore ouverts : ce qu'il reste à faire (bouton grisé, pour donner un cap). */
  pactsTeaser?: string;
  /** Premier lancement : proposer le confort visuel (flashs, secousses, effets). */
  comfortPrompt?: { onChoose: (on: boolean) => void };
  /** Mode Découverte (débutants) : interrupteur sous les héros. */
  discovery?: { on: boolean; toggle: (on: boolean) => void };
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
      // Maîtrise du héros : niveau + XP vers le palier suivant (gagnée à chaque run, même perdue).
      h('div', { class: 'sc-mastrow', title: m?.xpForNext ? `Maîtrise niveau ${m.level} : ${m.xpInLevel ?? 0} / ${m.xpForNext} XP avant le niveau ${m.level + 1}` : `Maîtrise niveau ${m?.level ?? 1}` },
        h('span', {}, `Maîtrise ${m?.level ?? 1}`),
        h('div', { class: 'sc-mast' }, h('i', { style: { width: `${(m?.progress ?? 0) * 100}%` } })))));
    return card;
  });
  const ch = Math.max(0, Math.min(3, o.chapter ?? 0));
  const comfort = o.comfortPrompt ? h('div', { class: 'sc-comfort-ask sc-panel', role: 'group', 'aria-label': 'Confort visuel' },
    h('span', { class: 'sc-ico', 'aria-hidden': 'true' }, '◐'),
    h('div', {}, h('b', {}, 'Confort visuel ?'), h('small', {}, 'Moins de flashs, de secousses et d\'effets à l\'écran. Modifiable à tout moment (Réglages, Pause).')),
    h('button', { class: 'sc-btn', onclick: () => { comfort?.remove(); o.comfortPrompt!.onChoose(true); } }, 'Activer'),
    h('button', { class: 'sc-btn sc-ghost', onclick: () => { comfort?.remove(); o.comfortPrompt!.onChoose(false); } }, 'Garder les effets')) : null;
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
      o.discovery ? h('label', { class: 'sc-discovery', title: 'Ennemis plus doux, 2 fioles de plus, soin entre les vagues. Les Pactes sont désactivés.' },
        h('input', { type: 'checkbox', class: 'sc-switch', checked: o.discovery.on, onchange: (e: Event) => o.discovery!.toggle((e.target as HTMLInputElement).checked) }),
        h('span', {}, '🌱 Mode Découverte', h('small', {}, ' · pour apprendre en douceur'))) : null,
      h('div', { class: 'sc-row' },
        h('button', { class: `sc-btn${o.resume ? '' : ' sc-primary'}`, style: { minWidth: '220px', fontSize: '1.15em' }, onclick: () => o.onPlay(hero) }, o.resume ? '⚔  Nouvelle run' : '⚔  Partir en run'),
        h('button', { class: 'sc-btn', onclick: o.onSanctuary }, '♜ Sanctuaire'),
        o.onCodex ? h('button', { class: 'sc-btn sc-codex-btn', onclick: (e: Event) => { (e.currentTarget as HTMLElement).querySelector('.sc-badge')?.remove(); o.onCodex!(); }, title: o.codex ? `Codex des Brumes · ${o.codex.pct} % découvert` : 'Codex des Brumes' },
          '📜 Codex', o.codex?.fresh ? h('span', { class: 'sc-badge', 'aria-label': `${o.codex.fresh} nouvelles découvertes` }, String(Math.min(99, o.codex.fresh))) : null) : null,
        o.pacts && o.onPacts ? h('button', { class: 'sc-btn', onclick: o.onPacts, title: 'Pactes de la Brume' }, `☁ Pactes${o.pacts.points ? ` · ${o.pacts.points}` : ''}`) : null,
        !o.pacts && o.pactsTeaser ? h('button', { class: 'sc-btn sc-ghost sc-teaser', disabled: true, title: `Pactes de la Brume : difficulté au choix, récompenses multipliées. ${o.pactsTeaser}` }, `☁ Pactes 🔒 ${o.pactsTeaser}`) : null,
        h('button', { class: 'sc-btn sc-ghost', onclick: o.onSettings, 'aria-label': 'Réglages' }, '⚙ Réglages')),
      o.daily ? h('button', { class: 'sc-daily sc-panel sc-btn sc-ghost', onclick: o.onDaily },
        h('span', {}, '☀'), h('span', {}, 'Défi du jour : ', h('b', {}, o.daily.label)), h('span', {}, `Série ${o.daily.streak} 🔥`, o.daily.next ? h('small', { class: 'sc-streak-next' }, ` · ${o.daily.next}`) : null)) : null,
      o.missions && o.onMissions ? h('button', { class: `sc-daily sc-panel sc-btn sc-ghost sc-missions-btn${o.missions.chest ? '' : ' sc-pending'}`, onclick: o.onMissions },
        h('span', {}, '🎯'), h('span', {}, 'Missions du jour : ', h('b', {}, `${o.missions.done} / ${o.missions.total}`)),
        h('span', {}, o.missions.chest ? '🎁 coffre ouvert' : '🎁 coffre à gagner')) : null,
      comfort));
}

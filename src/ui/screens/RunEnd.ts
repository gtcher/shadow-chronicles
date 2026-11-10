import { h, countUp } from '../dom';
import { gearList, type GearView } from './Gear';

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
  /** Nom de ce qui a porté le dernier coup (défaite). */
  killedBy?: string | null;
  /** Conseil pour la prochaine fois. */
  killedHint?: string | null;
  /** Sources de dégâts reçus (les 3 premières sont affichées). */
  damageBy?: Array<{ name: string; damage: number }>;
  /** D'où viennent les Éclats : [libellé, montant]. */
  breakdown?: Array<[string, number]>;
  /** Build de la run : bénédictions (couleur de rareté) et meilleur objet. */
  /** Objets portés en fin de run (liste dépliable). */
  gear?: GearView[];
  build?: { blessings: Array<{ name: string; color: string }>; item?: { name: string; color: string; rarity: string } };
  /** Missions du jour : avancée apportée par cette run. */
  missions?: { lines: Array<{ icon: string; text: string; from: number; to: number; target: number; justDone: boolean; done: boolean }>; chestOpened: boolean; chestReward: string; reset: string };
  /** Proposition après une chute rapide (ex. mode Découverte). */
  suggest?: { text: string; label: string; onAccept: () => void };
  /** Rang de la run dans le classement personnel (tous héros / ce héros). */
  rank?: { rank: number; heroRank: number; total: number };
  /** Cosmétiques et titres débloqués par cette run (maîtrise). */
  unlocked?: string[];
  /** Prochain cosmétique de maîtrise : « Sillage de Taro · encore 120 XP ». */
  nextLook?: { level: number; label: string; xpLeft: number };
  /** Statistiques détaillées (liste dépliable). */
  detail?: {
    dealtBy: Array<{ name: string; damage: number }>;
    dealt: number; taken: number; hits: number; crits: number; maxHit: number; potions: number;
    waves: Array<{ wave: number; sec: number; boss: boolean }>;
    perfectDodges: number; bestCombo: number; elites: number;
  };
  /** Texte à partager (bouton « Partager »). */
  share?: string;
}

/** Partage natif (mobile) ou copie dans le presse-papiers. */
async function shareRun(text: string, btn: HTMLElement): Promise<void> {
  const nav = navigator as Navigator & { share?: (d: { text: string; url?: string }) => Promise<void> };
  try {
    if (nav.share) { await nav.share({ text, url: location.origin + location.pathname }); return; }
    await navigator.clipboard.writeText(`${text}\n${location.origin + location.pathname}`);
    btn.textContent = '✓ Copié';
  } catch { btn.textContent = '✓ Copié'; }
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
      o.rank && o.rank.rank > 0 && o.rank.rank <= 10 ? h('p', { class: 'sc-rank' }, `🏆 ${o.rank.rank === 1 ? 'Ta meilleure run' : `${o.rank.rank === 2 ? '2e' : `${o.rank.rank}e`} de ton classement`}${o.rank.heroRank > 0 && o.rank.heroRank < o.rank.rank ? ` · ${o.rank.heroRank === 1 ? 'meilleure' : `${o.rank.heroRank}e`} avec ${o.mastery.hero}` : ''}`) : null,
      h('div', { class: 'sc-xp' }, `Maîtrise de ${o.mastery.hero} · niveau ${o.mastery.level}`, o.mastery.gained ? h('b', { style: { color: 'var(--gold-hi)', marginLeft: '8px' } }, `+${o.mastery.gained} XP`) : null, h('div', { class: 'sc-track' }, xpBar),
        o.nextLook ? h('small', { class: 'sc-nextlook' }, `🎨 Niveau ${o.nextLook.level} : ${o.nextLook.label} · encore ${o.nextLook.xpLeft} XP`) : null),
      o.unlocked?.length ? h('div', { class: 'sc-next sc-unlocked' }, h('i', {}, '🎨'), h('div', {}, h('b', {}, 'Débloqué !'), h('div', { style: { fontSize: '0.9em' } }, o.unlocked.join(' · '), h('small', { style: { display: 'block', color: 'var(--mute)' } }, 'Porté d\'office · à changer dans « Apparence » au menu')))) : null,
      o.killedBy ? h('div', { class: 'sc-cause' }, h('span', {}, '☠'), h('div', {}, h('b', {}, `Abattu par ${o.killedBy}`),
        o.damageBy?.length ? h('small', {}, 'Dégâts reçus : ', o.damageBy.slice(0, 3).map((d) => `${d.name} ${d.damage}`).join(' · ')) : null,
        o.killedHint ? h('small', { class: 'sc-hint' }, `💡 ${o.killedHint}`) : null)) : null,
      o.suggest ? h('div', { class: 'sc-next sc-suggest' }, h('i', {}, '🌱'), h('div', { style: { flex: '1' } }, o.suggest.text),
        h('button', { class: 'sc-btn', onclick: (e: Event) => { o.suggest!.onAccept(); (e.currentTarget as HTMLButtonElement).replaceWith(h('b', {}, '✓ Activé')); } }, o.suggest.label)) : null,
      o.breakdown && o.breakdown.length > 1 ? h('p', { class: 'sc-breakdown' }, o.breakdown.map(([l, v]) => `${l} +${v} ✦`).join(' · ')) : null,
      o.missions ? h('div', { class: 'sc-missions sc-near' }, h('div', { class: 'sc-sub', style: { display: 'block' } },
        o.missions.chestOpened ? `🎁 Coffre du jour ouvert : ${o.missions.chestReward}` : `Missions du jour · nouvelles dans ${o.missions.reset}`),
        ...o.missions.lines.map((m) => { const bar = h('i', { style: { width: `${(m.to / m.target) * 100}%` } });
          return h('div', { class: m.justDone ? 'sc-mdone sc-mnew' : m.done ? 'sc-mdone' : '' }, h('span', {}, m.done ? '✓' : m.icon), h('span', {}, m.text),
            h('small', {}, m.justDone ? '+12 ✦' : `${m.to} / ${m.target}${m.to > m.from ? ` (+${m.to - m.from})` : ''}`), h('div', { class: 'sc-track' }, bar)); })) : null,
      o.build && (o.build.blessings.length || o.build.item) ? h('div', { class: 'sc-build' },
        o.build.item ? h('span', { class: 'sc-chip-item', style: { color: o.build.item.color } }, `◆ ${o.build.item.name}`) : null,
        ...o.build.blessings.slice(0, 10).map((b) => h('span', { style: { borderColor: b.color, color: b.color } }, b.name))) : null,
      o.detail ? detailBlock(o.detail, o.timeSec) : null,
      o.gear?.length ? h('details', { class: 'sc-gear-end' }, h('summary', {}, `◆ Équipement porté (${o.gear.length})`), gearList(o.gear, '')) : null,
      o.next ? h('div', { class: 'sc-next' }, h('i', {}, o.next.icon),
        h('div', {}, h('b', {}, o.next.affordable ? 'Amélioration disponible !' : 'Prochaine amélioration'), h('div', { style: { color: 'var(--mute)', fontSize: '0.9em' } }, `${o.next.name} · ${o.next.cost} ${o.next.currencyIcon}`))) : null,
      o.near.length ? h('div', { class: 'sc-near' }, h('div', { class: 'sc-sub', style: { display: 'block' } }, 'Presque…'),
        ...o.near.map((a) => { const bar = h('i', { style: { width: `${a.progress * 100}%` } });
          return h('div', {}, h('span', {}, a.icon), h('span', {}, a.name), h('small', { style: { color: 'var(--mute)' } }, a.label), h('div', { class: 'sc-track' }, bar)); })) : null,
      h('div', { class: 'sc-row' },
        h('button', { class: 'sc-btn sc-primary', onclick: o.onRetry, 'data-autofocus': true }, '⟳ Encore une run'),
        h('button', { class: `sc-btn${o.next?.affordable ? ' sc-primary' : ''}`, onclick: o.onSanctuary }, '♜ Sanctuaire'),
        o.share ? h('button', { class: 'sc-btn sc-ghost', onclick: (e: Event) => void shareRun(o.share!, e.currentTarget as HTMLElement), 'aria-label': 'Partager le résultat' }, '⇪ Partager') : null,
        o.onMenu ? h('button', { class: 'sc-btn sc-ghost', onclick: o.onMenu }, 'Menu principal') : null)));
  requestAnimationFrame(() => {
    gains.forEach((g, i) => setTimeout(() => countUp(vals[i], g.value, 800, g.icon ? `+` : ''), 150 + i * 220));
    requestAnimationFrame(() => (xpBar.style.width = `${o.mastery.to * 100}%`));
  });
  return root;
}

/** Statistiques détaillées : tuiles, dégâts infligés par source, chrono par vague. */
function detailBlock(d: NonNullable<RunEndOptions['detail']>, timeSec: number): HTMLElement {
  const fr = (n: number) => Math.round(n).toLocaleString('fr-FR');
  const tiles: Array<[string, string]> = [
    ['Dégâts infligés', fr(d.dealt)], ['Dégâts par seconde', fr(d.dealt / Math.max(1, timeSec))], ['Plus gros coup', fr(d.maxHit)],
    ['Coups critiques', d.hits ? `${Math.round((d.crits / d.hits) * 100)} %` : '—'], ['Dégâts reçus', fr(d.taken)], ['Fioles bues', String(d.potions)],
    ['Esquives parfaites', String(d.perfectDodges)], ['Meilleur combo', String(d.bestCombo)], ['Élites abattues', String(d.elites)],
  ];
  const top = d.dealtBy[0]?.damage || 1;
  const slow = Math.max(1, ...d.waves.map((w) => w.sec));
  return h('details', { class: 'sc-stats-end' }, h('summary', {}, '📊 Statistiques de la run'),
    h('div', { class: 'sc-stat-tiles' }, ...tiles.map(([l, v]) => h('div', {}, h('b', {}, v), h('small', {}, l)))),
    d.dealtBy.length ? h('div', { class: 'sc-bars' }, h('h4', {}, 'Dégâts infligés'),
      ...d.dealtBy.slice(0, 6).map((x) => h('div', {}, h('span', {}, x.name), h('div', { class: 'sc-track' }, h('i', { style: { width: `${(x.damage / top) * 100}%` } })),
        h('small', {}, `${fr(x.damage)} · ${Math.round((x.damage / Math.max(1, d.dealt)) * 100)} %`)))) : null,
    d.waves.length ? h('div', { class: 'sc-bars sc-chrono' }, h('h4', {}, 'Chrono par vague'),
      ...d.waves.map((w) => h('div', { class: w.boss ? 'sc-boss' : '' }, h('span', {}, `${w.boss ? '♛ ' : ''}Vague ${w.wave}`),
        h('div', { class: 'sc-track' }, h('i', { style: { width: `${(w.sec / slow) * 100}%` } })), h('small', {}, `${Math.floor(w.sec / 60)}:${String(w.sec % 60).padStart(2, '0')}`)))) : null);
}

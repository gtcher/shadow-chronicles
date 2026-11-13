import { h, fmt } from '../ui/dom';
import { HERO_INFO, type HeroId } from '../ui/data';
import { formatTime } from './records';
import { ONLINE } from '../online/config';
import { friendlyError, type BoardKind, type BoardRow, type MyRanks, type OnlineService } from '../online/client';
import { chapterOfWave, validPseudo } from '../online/rules';
import type { CloudSync, ConflictInfo } from '../online/sync';

/**
 * Classement en ligne + compte joueur (connexion facultative par e-mail, pseudo, sauvegarde cloud).
 * Un seul écran : le compte en haut, le classement dessous (Progression / Défi du jour / Missions).
 * Style de src/ui (classes sc-*), affiché avec `ui.show(el)`.
 */

export interface OnlineScreenOptions {
  online: OnlineService;
  sync: CloudSync | null;
  tab?: BoardKind;
  /** Jour du défi (AAAA-MM-JJ, UTC). */
  day: string;
  onPlay: () => void;
  onBack: () => void;
}

const TAB_NAMES: Record<BoardKind, string> = { progress: 'Progression', daily: 'Défi du jour', missions: 'Missions' };
const CHAPTERS = ['La Cour des Veilleurs', 'Les Remparts écarlates', 'La Nécropole lunaire', 'La Porte de l’Éclipse'];
const mute = (text: string) => h('p', { class: 'sc-ol-mute' }, text);
const heroName = (id?: string) => (id && HERO_INFO[id as HeroId]?.name) || id || '';

export function onlineScreen(o: OnlineScreenOptions): HTMLElement {
  let tab: BoardKind = o.tab ?? 'progress';
  let step: 'idle' | 'email' | 'code' | 'pseudo' = 'idle';
  let email = '';
  let busy = false;
  let note = '';
  const account = h('div', { class: 'sc-ol-account sc-panel' });
  const board = h('div', { class: 'sc-ol-board', 'aria-live': 'polite' });
  const tabs = h('div', { class: 'sc-tabs', role: 'tablist' });

  const act = async (fn: () => Promise<void>) => {
    if (busy) return;
    busy = true; note = ''; drawAccount();
    try { await fn(); } catch (e) { note = e instanceof Error ? e.message : friendlyError(e); }
    busy = false; drawAccount();
  };

  const input = (attrs: Record<string, unknown>) => h('input', { class: 'sc-ol-input', ...attrs });

  function conflictBox(c: ConflictInfo): HTMLElement {
    const line = (title: string, s: ConflictInfo['local'], extra?: string) => h('div', { class: 'sc-ol-save' },
      h('b', {}, title), h('span', {}, `${fmt(s.eclats)} ✦ · record vague ${s.bestWave} · ${s.runs} runs · ${s.achievements} succès`), extra ? h('small', {}, extra) : null);
    const when = new Date(c.cloud.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return h('div', { class: 'sc-ol-conflict' },
      h('p', {}, '☁ Ton compte a déjà une progression différente de celle de cet appareil. Laquelle garder ?'),
      line('Cet appareil', c.local),
      line('Compte en ligne', c.cloud, `${c.cloud.device ?? 'autre appareil'} · ${when}`),
      mute('L\'autre n\'est pas perdue : une copie de secours est gardée dans ce navigateur.'),
      h('div', { class: 'sc-row' },
        h('button', { class: 'sc-btn', onclick: () => act(() => c.keepLocal()) }, 'Garder cet appareil'),
        h('button', { class: 'sc-btn sc-primary', onclick: () => act(() => c.takeCloud()) }, 'Reprendre le compte')));
  }

  function drawAccount(): void {
    const on = o.online, user = on.user, player = on.player;
    const kids: Array<HTMLElement | null> = [];
    if (!user) {
      if (step === 'idle') {
        kids.push(h('div', { class: 'sc-ol-row' },
          h('div', { style: { flex: '1' } }, h('b', {}, 'Joue en invité ou crée ton compte'),
            h('small', {}, 'Un compte (gratuit) te met au classement et garde ta progression sur tous tes appareils.')),
          h('button', { class: 'sc-btn sc-primary', onclick: () => { step = 'email'; drawAccount(); (account.querySelector('input') as HTMLInputElement | null)?.focus(); } }, 'Se connecter')));
      } else if (step === 'email') {
        const f = input({ type: 'email', placeholder: 'ton@email.fr', autocomplete: 'email', value: email, 'aria-label': 'Adresse e-mail', inputmode: 'email' }) as HTMLInputElement;
        const send = () => act(async () => {
          email = f.value.trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Adresse e-mail invalide.');
          await on.signInEmail(email);
          step = 'code';
        });
        f.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void send(); } });
        kids.push(h('b', {}, 'Connexion sans mot de passe'),
          h('small', {}, 'Tu reçois un code à 6 chiffres par e-mail. Pas de compte ? Il est créé tout seul.'),
          h('div', { class: 'sc-ol-row' }, f, h('button', { class: 'sc-btn sc-primary', disabled: busy, onclick: send }, busy ? '…' : 'Recevoir le code')),
          ONLINE.oauth.length ? h('div', { class: 'sc-ol-row' }, mute('ou'), ...ONLINE.oauth.map((p) =>
            h('button', { class: 'sc-btn', onclick: () => act(() => on.signInOAuth(p)) }, p === 'google' ? 'Google' : 'Discord'))) : null,
          h('button', { class: 'sc-link', onclick: () => { step = 'idle'; note = ''; drawAccount(); } }, 'Plus tard'));
      } else {
        const f = input({ type: 'text', placeholder: '123456', autocomplete: 'one-time-code', inputmode: 'numeric', maxlength: '10', 'aria-label': 'Code reçu par e-mail' }) as HTMLInputElement;
        const verify = () => act(async () => { await on.verifyCode(email, f.value); step = on.player ? 'idle' : 'pseudo'; });
        f.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void verify(); } });
        kids.push(h('b', {}, `Code envoyé à ${email}`),
          h('small', {}, 'Recopie le code reçu (pense aux spams), ou ouvre le lien de l\'e-mail sur cet appareil.'),
          h('div', { class: 'sc-ol-row' }, f, h('button', { class: 'sc-btn sc-primary', disabled: busy, onclick: verify }, busy ? '…' : 'Valider')),
          h('button', { class: 'sc-link', onclick: () => { step = 'email'; note = ''; drawAccount(); } }, 'Changer d\'adresse ou renvoyer le code'));
      }
    } else if (!player || step === 'pseudo') {
      const f = input({ type: 'text', placeholder: 'Ton pseudo', maxlength: '16', value: player?.pseudo ?? '', 'aria-label': 'Pseudo' }) as HTMLInputElement;
      const okp = () => act(async () => {
        if (!validPseudo(f.value)) throw new Error('Pseudo : 3 à 16 lettres, chiffres, espaces, . _ -');
        await on.setPseudo(f.value);
        step = 'idle';
        o.sync?.pushNow();
        void drawBoard();
      });
      f.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void okp(); } });
      kids.push(h('b', {}, player ? 'Changer de pseudo' : 'Choisis ton pseudo'),
        h('small', {}, 'C\'est le nom affiché au classement. 3 à 16 caractères.'),
        h('div', { class: 'sc-ol-row' }, f, h('button', { class: 'sc-btn sc-primary', disabled: busy, onclick: okp }, busy ? '…' : 'Valider')),
        player ? h('button', { class: 'sc-link', onclick: () => { step = 'idle'; drawAccount(); } }, 'Annuler') : null);
    } else {
      const s = o.sync;
      kids.push(h('div', { class: 'sc-ol-row' },
        h('div', { style: { flex: '1' } }, h('b', {}, `👤 ${player.pseudo}`),
          h('small', {}, s ? `${s.status === 'ok' ? '☁ ' : s.status === 'error' ? '⚠ ' : ''}${s.message || 'Sauvegarde cloud active'}` : user.email ?? '')),
        h('button', { class: 'sc-link', onclick: () => { step = 'pseudo'; drawAccount(); } }, 'Pseudo'),
        h('button', { class: 'sc-link', onclick: () => act(async () => { await on.signOut(); void drawBoard(); }) }, 'Se déconnecter')));
      if (s?.conflict) kids.push(conflictBox(s.conflict));
    }
    if (note) kids.push(h('p', { class: 'sc-ol-note', role: 'alert' }, note));
    account.replaceChildren(...kids.filter((k): k is HTMLElement => !!k));
  }

  const cell = (text: string, attrs: Record<string, unknown> = {}) => h('td', attrs, text);
  const medal = (r: number) => (r <= 3 ? ['🥇', '🥈', '🥉'][r - 1] : String(r));

  function table(rows: BoardRow[], me: string | undefined): HTMLElement {
    const head = tab === 'progress' ? ['#', 'Joueur', 'Chapitre', 'Vague', 'Victoires', 'Meilleur temps']
      : tab === 'daily' ? ['#', 'Joueur', 'Score', 'Vague', 'Héros'] : ['#', 'Joueur', 'Coffres', 'Meilleure série'];
    return h('table', { class: 'sc-ranks sc-ol-ranks' },
      h('thead', {}, h('tr', {}, ...head.map((x) => h('th', {}, x)))),
      h('tbody', {}, ...rows.map((r) => h('tr', { class: r.player_id === me ? 'sc-latest' : '' },
        cell(medal(r.rank)), cell(r.pseudo, { class: 'sc-ol-name' }),
        ...(tab === 'progress' ? [
          h('td', { title: CHAPTERS[chapterOfWave(r.best_wave ?? 1) - 1] }, `${chapterOfWave(r.best_wave ?? 1)}`),
          cell((r.best_wave ?? 0) >= 20 ? `★ ${r.best_wave}` : String(r.best_wave ?? 0)), cell(String(r.wins ?? 0)), cell(r.best_time ? formatTime(r.best_time) : '—'),
        ] : tab === 'daily' ? [
          cell(fmt(r.score ?? 0)), cell(`${r.won ? '★ ' : ''}${r.wave ?? 0}`), h('td', { style: { color: HERO_INFO[r.hero as HeroId]?.color } }, heroName(r.hero)),
        ] : [cell(`🎁 ${r.chests ?? 0}`), cell(`${r.streak_max ?? 0} 🔥`)])))));
  }

  let drawId = 0;
  async function drawBoard(): Promise<void> {
    const id = ++drawId;
    tabs.replaceChildren(...(Object.keys(TAB_NAMES) as BoardKind[]).map((k) =>
      h('button', { role: 'tab', class: 'sc-tab', 'aria-selected': String(k === tab), onclick: () => { tab = k; void drawBoard(); } }, TAB_NAMES[k])));
    board.replaceChildren(mute('Chargement du classement…'));
    try {
      const [rows, ranks] = await Promise.all([o.online.leaderboard(tab, o.day), o.online.user ? o.online.myRanks(o.day) : Promise.resolve(null as MyRanks | null)]);
      if (id !== drawId) return;
      const me = o.online.user?.id;
      const mine = ranks?.[tab];
      const hint = tab === 'progress' ? 'Classés par vague la plus loin atteinte, puis victoires, puis temps. Le mode Découverte ne compte pas.'
        : tab === 'daily' ? 'Même run pour tous aujourd\'hui : seul le premier essai compte.'
          : 'Coffres des missions du jour ouverts, puis meilleure série du défi.';
      board.replaceChildren(...[
        mute(hint),
        rows.length ? table(rows, me) : mute(tab === 'daily' ? 'Personne n\'a encore relevé le défi aujourd\'hui. Sois le premier !' : 'Le classement est vide pour l\'instant. À toi d\'ouvrir la marche !'),
        mine && !rows.some((r) => r.player_id === me) ? h('p', { class: 'sc-ol-me' }, `Ta place : ${mine}e sur ${ranks?.players ?? '?'}`) : null,
        !o.online.user ? mute('Connecte-toi pour y figurer. Tes runs en invité restent sur cet appareil.') : null,
      ].filter((x): x is HTMLElement => !!x));
    } catch (e) {
      if (id !== drawId) return;
      board.replaceChildren(h('p', { class: 'sc-ol-note' }, e instanceof Error ? e.message : friendlyError(e)),
        h('button', { class: 'sc-btn sc-ghost', onclick: () => void drawBoard() }, 'Réessayer'));
    }
  }

  const root = h('section', { class: 'sc-screen', role: 'dialog', 'aria-label': 'Classement en ligne' },
    h('div', { class: 'sc-end sc-panel sc-online', style: { maxWidth: '720px', maxHeight: '94vh', overflowY: 'auto' } },
      h('div', { class: 'sc-sub', style: { display: 'block' } }, 'Tous les joueurs de Shadow Chronicles'),
      h('h2', { class: 'sc-title', style: { fontSize: '1.9em' } }, '🌐 Classement en ligne'),
      account, tabs, board,
      h('div', { class: 'sc-row' },
        h('button', { class: 'sc-btn sc-primary', onclick: o.onPlay, 'data-autofocus': true }, '⚔ Partir en run'),
        h('button', { class: 'sc-btn sc-ghost', onclick: o.onBack }, 'Retour'))));

  // Mises à jour en direct : connexion, pseudo, état de la synchro.
  let lastUser = o.online.user?.id;
  const offs = [
    o.online.onChange(() => {
      if (o.online.user?.id !== lastUser) { lastUser = o.online.user?.id; if (o.online.user && !o.online.player) step = 'pseudo'; else if (!o.online.user) step = 'idle'; void drawBoard(); }
      if (!busy) drawAccount();
    }),
    o.sync?.onChange(() => { if (!busy) drawAccount(); }),
  ];
  (root as HTMLElement & { cleanup?: () => void }).cleanup = () => { for (const off of offs) off?.(); drawId++; };
  drawAccount();
  void o.online.ready().then(() => { if (o.online.user && !o.online.player && step === 'idle') step = 'pseudo'; drawAccount(); });
  void drawBoard();
  return root;
}

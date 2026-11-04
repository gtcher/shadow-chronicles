import { h, fmt } from '../dom';
import { SANCTUARY, requirementText, upgradeText, type Building, type Upgrade } from '../data';

/** Profil méta minimal lu par l'écran (fourni par l'agent Sauvegarde). */
export interface MetaProfile {
  wallet: Record<string, number>;          // eclats, poussiere, sceaux
  ranks: Record<string, number>;           // `${buildingId}.${upgradeId}` → rang
  unlocked: string[];                      // bâtiments ouverts
  stats: Record<string, number>;           // bestWave, runs…
  /** Avancement de chaque condition de sanctuary.json (« bestWave>=4 », « bossKilled:5 »…). */
  reqs?: Record<string, { have: number; need: number; ok: boolean }>;
}

export interface SanctuaryOptions {
  profile: MetaProfile;
  assetUrl: (key: string) => string | undefined;
  /** Achat validé par le jeu (retourne false pour refuser). */
  onBuy: (b: Building, u: Upgrade, cost: number, currency: string) => boolean;
  onUnlock: (b: Building) => boolean;
  onLeave: () => void;
  onPlay: () => void;
  onCodex?: () => void;
  /** Guide de la première visite : `false` l'ouvre automatiquement. */
  guideDone?: boolean;
  onGuideDone?: () => void;
  /** Bâtiment affiché à l'ouverture (après un achat, l'écran est reconstruit). */
  building?: string;
  onSelect?: (id: string) => void;
}

/** Progression d'une condition : valeur fournie par la sauvegarde, sinon lecture simple des stats. */
function progress(r: string | undefined, p: MetaProfile): { have: number; need: number; ok: boolean } {
  if (!r) return { have: 1, need: 1, ok: true };
  const known = p.reqs?.[r];
  if (known) return known;
  const m = r.match(/^(\w+)>=(\d+)$/);
  if (!m) return { have: 0, need: 1, ok: false };
  const have = p.stats[m[1]] ?? 0, need = Number(m[2]);
  return { have, need, ok: have >= need };
}

const cur = (c: string) => SANCTUARY.currencies[c] ?? { icon: '✦', color: '#d9ab74', name: c };
const isOpen = (b: Building, p: MetaProfile) => b.unlockedAtStart || p.unlocked.includes(b.id);

/** Prochains objectifs de déblocage (bâtiments en ruine, puis améliorations verrouillées). */
export function sanctuaryGoals(p: MetaProfile): Array<{ building: string; icon: string; title: string; text: string; have: number; need: number; ready: boolean }> {
  const out: ReturnType<typeof sanctuaryGoals> = [];
  for (const b of SANCTUARY.buildings) {
    if (isOpen(b, p)) continue;
    const pr = progress(b.requires, p);
    const [[c, v]] = Object.entries(b.unlockCost ?? { eclats: 0 });
    if (!pr.ok) out.push({ building: b.id, icon: b.icon, title: b.name, text: requirementText(b.requires), have: pr.have, need: pr.need, ready: false });
    else out.push({ building: b.id, icon: b.icon, title: b.name, text: (p.wallet[c] ?? 0) >= v ? `Touche ici pour la restaurer (${fmt(v)} ${cur(c).icon})` : `Conditions remplies · restauration : ${fmt(v)} ${cur(c).icon} ${cur(c).name}`, have: Math.min(p.wallet[c] ?? 0, v), need: v, ready: (p.wallet[c] ?? 0) >= v });
  }
  for (const b of SANCTUARY.buildings) {
    if (!isOpen(b, p)) continue;
    for (const u of b.upgrades) {
      if (!u.requires || (p.ranks[`${b.id}.${u.id}`] ?? 0) >= u.maxRank) continue;
      const pr = progress(u.requires, p);
      if (!pr.ok) out.push({ building: b.id, icon: u.icon ?? b.icon, title: u.name, text: `${requirementText(u.requires)} · ${b.name}`, have: pr.have, need: pr.need, ready: false });
      else if (u.unlocksPatron) out.push({ building: b.id, icon: u.icon ?? b.icon, title: u.name, text: `Disponible à ${b.name} : ${upgradeText(u)}`, have: 1, need: 1, ready: true });
    }
  }
  return out;
}

interface GuideStep { target: string | null; title: string; text: string }

const GUIDE: GuideStep[] = [
  { target: null, title: "Bienvenue au Sanctuaire d'Akar", text: 'Entre deux runs, tu reviens ici. Ce que tu as rapporté te rend plus fort pour toujours : même une défaite rapporte quelque chose.' },
  { target: '.sc-wallet', title: 'Tes trois monnaies', text: '✦ Éclats : vagues franchies, contrats et boss. ✧ Poussière d’étoile : démantèle les objets que tu ne portes pas. ♛ Sceaux du Juge, plus rares : boss des Pactes, séries de défis du jour, succès.' },
  { target: '.sc-buildings', title: 'Quatre bâtiments', text: 'La Veillée et l’Autel sont ouverts dès le départ. La Forge et les Archives sont en ruine : remplis leur condition pendant tes runs, puis restaure-les avec des éclats.' },
  { target: '.sc-goal', title: 'Ton prochain objectif', text: 'Ce bandeau montre toujours le prochain déblocage et où tu en es. Touche-le pour aller au bon bâtiment.' },
  { target: '.sc-upgrades', title: 'Améliorer', text: 'Chaque amélioration a plusieurs rangs. Un point doré sur un bâtiment veut dire qu’un achat est possible. À l’Autel, de nouveaux patrons (Orage, Brume) ajoutent des bénédictions aux offres.' },
  { target: '[data-codex]', title: 'Le Codex', text: 'Bénédictions, Duos et reliques que tu as trouvés sont rangés dans le Codex, avec ce qu’il te reste à découvrir.' },
];

/** Hub du Sanctuaire d'Akar : 4 bâtiments (les verrouillés sont visibles avec leur condition). */
export function sanctuaryScreen(o: SanctuaryOptions): HTMLElement {
  const p = o.profile;
  let current = SANCTUARY.buildings.some((b) => b.id === o.building) ? o.building! : SANCTUARY.buildings[0].id;
  const wallet = h('div', { class: 'sc-wallet' });
  const list = h('div', { class: 'sc-buildings', role: 'tablist' });
  const detail = h('div', { class: 'sc-upgrades sc-panel', role: 'tabpanel' });
  const goal = h('div', { class: 'sc-goal' });

  const affordableIn = (b: Building) => b.upgrades.some((u) => {
    const r = p.ranks[`${b.id}.${u.id}`] ?? 0;
    return r < u.maxRank && progress(u.requires, p).ok && (p.wallet[u.currency ?? b.currency] ?? 0) >= u.cost[r];
  });
  let animate = true;
  const select = (id: string) => { current = id; animate = true; o.onSelect?.(id); render(); };
  const track = (have: number, need: number) => h('span', { class: 'sc-track', 'aria-hidden': 'true' }, h('i', { style: { transform: `scaleX(${need ? Math.min(1, have / need) : 1})` } }));

  const render = () => {
    wallet.replaceChildren(...['eclats', 'poussiere', 'sceaux'].map((c) =>
      h('div', { class: 'sc-chip', title: cur(c).name }, h('span', { '--c': cur(c).color }, cur(c).icon), h('b', {}, fmt(p.wallet[c] ?? 0)))));

    const goals = sanctuaryGoals(p).slice(0, 2);
    goal.toggleAttribute('hidden', !goals.length);
    goal.replaceChildren(h('span', { class: 'sc-goal-k' }, 'Objectif'), ...goals.map((g) =>
      h('button', { class: `sc-goal-item${g.ready ? ' sc-ready' : ''}`, onclick: () => select(g.building), 'aria-label': `${g.title} : ${g.text}${g.ready ? '' : `, ${g.have} sur ${g.need}`}` },
        h('i', {}, g.icon), h('span', {}, h('b', {}, g.title), h('small', {}, g.text)),
        g.ready ? h('em', {}, 'Restaurer →') : h('em', {}, `${fmt(g.have)}/${fmt(g.need)}`), track(g.have, g.need))));

    list.replaceChildren(...SANCTUARY.buildings.map((b) => {
      const open = isOpen(b, p);
      const pr = progress(b.requires, p);
      return h('button', { class: `sc-bld${open ? '' : ' sc-locked'}`, role: 'tab', 'aria-pressed': String(b.id === current), 'aria-selected': String(b.id === current),
        onclick: () => select(b.id) },
      h('span', { class: 'sc-ico' }, b.icon), h('div', {}, h('h4', {}, b.name), h('p', {}, open ? b.desc : pr.ok ? 'À restaurer : touche-moi' : `${requirementText(b.requires)} · ${pr.have}/${pr.need}`),
        open ? null : track(pr.ok ? 1 : pr.have, pr.ok ? 1 : pr.need)),
      open && affordableIn(b) ? h('span', { class: 'sc-dot', title: 'Amélioration disponible' }) : null);
    }));

    const b = SANCTUARY.buildings.find((x) => x.id === current)!;
    detail.classList.toggle('sc-anim', animate); animate = false;
    if (!isOpen(b, p)) {
      const [[uc, uv]] = Object.entries(b.unlockCost ?? { eclats: 0 });
      const pr = progress(b.requires, p);
      const funds = (p.wallet[uc] ?? 0) >= uv;
      const ok = pr.ok && funds;
      detail.replaceChildren(h('header', {}, h('h3', {}, `${b.icon} ${b.name}`), h('p', {}, b.desc)),
        h('div', { class: 'sc-lockbox' },
          h('div', { class: 'sc-ruin', 'aria-hidden': 'true' }, b.icon),
          h('strong', {}, 'Bâtiment en ruine'),
          h('p', {}, 'Pour le restaurer :'),
          h('ul', { class: 'sc-checks' },
            h('li', { class: pr.ok ? 'sc-ok' : '' }, h('i', {}, pr.ok ? '✓' : '◌'), h('span', {}, requirementText(b.requires)), h('em', {}, `${fmt(Math.min(pr.have, pr.need))}/${fmt(pr.need)}`), track(pr.have, pr.need)),
            h('li', { class: funds ? 'sc-ok' : '' }, h('i', {}, funds ? '✓' : '◌'), h('span', {}, `${fmt(uv)} ${cur(uc).icon} ${cur(uc).name}`), h('em', {}, `${fmt(Math.min(p.wallet[uc] ?? 0, uv))}/${fmt(uv)}`), track(p.wallet[uc] ?? 0, uv))),
          h('button', { class: 'sc-btn sc-primary', disabled: !ok, onclick: () => { if (o.onUnlock(b)) render(); } }, ok ? 'Restaurer' : pr.ok ? 'Il manque des éclats' : 'Pas encore'),
          h('div', { class: 'sc-preview' }, h('small', {}, 'Une fois restauré :'), h('div', {}, ...b.upgrades.map((u) => h('span', { title: u.desc ?? upgradeText(u) }, `${u.icon ?? b.icon} ${u.name}`))))));
      return;
    }
    detail.replaceChildren(h('header', {}, h('h3', {}, `${b.icon} ${b.name}`), h('p', {}, b.desc)),
      h('div', { class: 'sc-uplist' }, ...b.upgrades.map((u, i) => {
        const key = `${b.id}.${u.id}`;
        const r = p.ranks[key] ?? 0;
        const c = u.currency ?? b.currency;
        const max = r >= u.maxRank;
        const cost = u.cost[Math.min(r, u.cost.length - 1)];
        const pr = progress(u.requires, p);
        const afford = !max && pr.ok && (p.wallet[c] ?? 0) >= cost;
        const card = h('div', { class: `sc-up${afford ? ' sc-afford' : ''}${max ? ' sc-max' : ''}${pr.ok ? '' : ' sc-uplocked'}`, '--i': String(i) },
          h('i', {}, u.icon ?? b.icon), h('h5', {}, u.name),
          h('p', {}, pr.ok ? (u.desc ?? upgradeText(u)) : `🔒 ${requirementText(u.requires)} (${fmt(Math.min(pr.have, pr.need))}/${fmt(pr.need)})`),
          h('div', { class: 'sc-ranks', 'aria-label': `Rang ${r} sur ${u.maxRank}` }, ...Array.from({ length: u.maxRank }, (_, k) => h('span', { class: k < r ? 'sc-on' : '' }))),
          h('button', { class: `sc-btn${afford ? ' sc-primary' : ''}`, disabled: !afford,
            onclick: () => { if (o.onBuy(b, u, cost, c)) { render(); detail.querySelectorAll('.sc-up')[b.upgrades.indexOf(u)]?.classList.add('sc-bought'); } } },
          max ? 'Maîtrisé' : `${fmt(cost)} ${cur(c).icon}`));
        return card;
      })));
  };
  render();

  // ── Guide de la première visite ────────────────────────────
  let step = -1;
  const guide = h('div', { class: 'sc-guide', hidden: true, role: 'group', 'aria-label': 'Guide du Sanctuaire', 'aria-live': 'polite' });
  let spot: Element | null = null;
  const showStep = () => {
    spot?.classList.remove('sc-spot'); spot = null;
    if (step < 0 || step >= GUIDE.length) {
      guide.hidden = true; section.classList.remove('sc-guiding');
      if (step >= GUIDE.length) o.onGuideDone?.();
      step = -1;
      return;
    }
    const s = GUIDE[step];
    spot = s.target ? section.querySelector(s.target) : null;
    if (spot && (spot as HTMLElement).hidden) spot = null;
    spot?.classList.add('sc-spot');
    spot?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    section.classList.add('sc-guiding');
    guide.hidden = false;
    const last = step === GUIDE.length - 1;
    guide.replaceChildren(h('div', { class: 'sc-guide-card sc-panel' },
      h('div', { class: 'sc-guide-n' }, `${step + 1}`),
      h('div', {}, h('h4', {}, s.title), h('p', {}, s.text)),
      h('div', { class: 'sc-guide-dots', 'aria-hidden': 'true' }, ...GUIDE.map((_, i) => h('i', { class: i === step ? 'sc-on' : i < step ? 'sc-past' : '' }))),
      h('div', { class: 'sc-guide-act' },
        h('button', { class: 'sc-btn sc-ghost', onclick: () => { step = GUIDE.length; showStep(); } }, 'Passer'),
        step > 0 ? h('button', { class: 'sc-btn', onclick: () => { step--; showStep(); } }, 'Précédent') : null,
        h('button', { class: 'sc-btn sc-primary', 'data-autofocus': true, onclick: () => { step++; showStep(); } }, last ? 'Compris !' : 'Suivant'))));
    requestAnimationFrame(() => guide.querySelector<HTMLElement>('.sc-primary')?.focus({ preventScroll: true }));
  };
  const openGuide = () => { step = 0; showStep(); };

  const bg = (() => { try { return o.assetUrl('sanctuary') ?? o.assetUrl('shrine-ruins'); } catch { try { return o.assetUrl('shrine-ruins'); } catch { return undefined; } } })();
  const section = h('section', { class: 'sc-screen sc-bg sc-menu sc-ch1 sc-sanct-scr', role: 'dialog', 'aria-label': "Sanctuaire d'Akar" },
    h('div', { class: 'sc-bgart', 'aria-hidden': 'true', style: bg ? { backgroundImage: `url(${bg})` } : {} }),
    h('div', { class: 'sc-motes', 'aria-hidden': 'true' }, ...Array.from({ length: 12 }, (_, i) => h('i', { style: { left: `${(i * 41 + 7) % 100}%`, animationDelay: `${-(i * 1.9) % 14}s`, animationDuration: `${11 + (i * 7) % 8}s` } }))),
    h('div', { class: 'sc-sanct' },
      h('div', { class: 'sc-sanct-head' },
        h('div', {}, h('div', { class: 'sc-sub' }, 'Entre deux runs'), h('h2', { class: 'sc-title', style: { fontSize: '1.8em' } }, "Sanctuaire d'Akar")),
        wallet,
        h('div', { class: 'sc-row' },
          h('button', { class: 'sc-btn sc-ghost', onclick: o.onLeave }, '← Retour'),
          h('button', { class: 'sc-btn sc-ghost sc-help', onclick: openGuide, 'aria-label': 'Comment ça marche ?', title: 'Comment ça marche ?' }, '?'),
          o.onCodex ? h('button', { class: 'sc-btn', onclick: o.onCodex, 'data-codex': '' }, '📜 Codex') : null,
          h('button', { class: 'sc-btn sc-primary', onclick: o.onPlay, 'data-autofocus': o.guideDone === false ? undefined : true }, '⚔ Partir'))),
      goal,
      h('div', { class: 'sc-sanct-body' }, list, detail)),
    guide);
  if (o.guideDone === false) queueMicrotask(openGuide);
  return section;
}

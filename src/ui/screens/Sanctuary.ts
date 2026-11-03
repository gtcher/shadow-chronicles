import { h, fmt } from '../dom';
import { SANCTUARY, requirementText, upgradeText, type Building, type Upgrade } from '../data';

/** Profil méta minimal lu par l'écran (fourni par l'agent Sauvegarde). */
export interface MetaProfile {
  wallet: Record<string, number>;          // eclats, poussiere, sceaux
  ranks: Record<string, number>;           // `${buildingId}.${upgradeId}` → rang
  unlocked: string[];                      // bâtiments ouverts
  stats: Record<string, number>;           // bestWave, runs…
}

export interface SanctuaryOptions {
  profile: MetaProfile;
  assetUrl: (key: string) => string | undefined;
  /** Achat validé par le jeu (retourne false pour refuser). */
  onBuy: (b: Building, u: Upgrade, cost: number, currency: string) => boolean;
  onUnlock: (b: Building) => boolean;
  onLeave: () => void;
  onPlay: () => void;
}

const req = (r: string | undefined, stats: Record<string, number>) => {
  if (!r) return true;
  const m = r.match(/^(\w+)>=(\d+)$/);
  return !m || (stats[m[1]] ?? 0) >= Number(m[2]);
};

/** Hub du Sanctuaire d'Akar : 4 bâtiments (les verrouillés sont visibles avec leur condition). */
export function sanctuaryScreen(o: SanctuaryOptions): HTMLElement {
  const p = o.profile;
  let current = SANCTUARY.buildings[0].id;
  const wallet = h('div', { class: 'sc-wallet' });
  const list = h('div', { class: 'sc-buildings', role: 'tablist' });
  const detail = h('div', { class: 'sc-upgrades sc-panel', role: 'tabpanel' });

  const cur = (c: string) => SANCTUARY.currencies[c] ?? { icon: '✦', color: '#d9ab74', name: c };
  const affordableIn = (b: Building) => b.upgrades.some((u) => {
    const r = p.ranks[`${b.id}.${u.id}`] ?? 0;
    return r < u.maxRank && req(u.requires, p.stats) && (p.wallet[u.currency ?? b.currency] ?? 0) >= u.cost[r];
  });

  const render = () => {
    wallet.replaceChildren(...['eclats', 'poussiere', 'sceaux'].map((c) =>
      h('div', { class: 'sc-chip', title: cur(c).name }, h('span', { '--c': cur(c).color }, cur(c).icon), h('b', {}, fmt(p.wallet[c] ?? 0)))));
    list.replaceChildren(...SANCTUARY.buildings.map((b) => {
      const open = b.unlockedAtStart || p.unlocked.includes(b.id);
      return h('button', { class: `sc-bld${open ? '' : ' sc-locked'}`, role: 'tab', 'aria-pressed': String(b.id === current), 'aria-selected': String(b.id === current),
        onclick: () => { current = b.id; render(); } },
      h('span', { class: 'sc-ico' }, b.icon), h('div', {}, h('h4', {}, b.name), h('p', {}, open ? b.desc : requirementText(b.requires))),
      open && affordableIn(b) ? h('span', { class: 'sc-dot', title: 'Amélioration disponible' }) : null);
    }));
    const b = SANCTUARY.buildings.find((x) => x.id === current)!;
    const open = b.unlockedAtStart || p.unlocked.includes(b.id);
    if (!open) {
      const [[uc, uv]] = Object.entries(b.unlockCost ?? { eclats: 0 });
      const ok = req(b.requires, p.stats) && (p.wallet[uc] ?? 0) >= uv;
      detail.replaceChildren(h('header', {}, h('h3', {}, `${b.icon} ${b.name}`), h('p', {}, b.desc)),
        h('div', { class: 'sc-lockbox' }, h('strong', {}, 'Bâtiment en ruine'),
          h('p', {}, `${requirementText(b.requires)} · Restauration : ${uv} ${cur(uc).icon}`),
          h('button', { class: 'sc-btn sc-primary', disabled: !ok, onclick: () => { if (o.onUnlock(b)) render(); } }, ok ? 'Restaurer' : 'Pas encore')));
      return;
    }
    detail.replaceChildren(h('header', {}, h('h3', {}, `${b.icon} ${b.name}`), h('p', {}, b.desc)),
      h('div', { class: 'sc-uplist' }, ...b.upgrades.map((u) => {
        const key = `${b.id}.${u.id}`;
        const r = p.ranks[key] ?? 0;
        const c = u.currency ?? b.currency;
        const max = r >= u.maxRank;
        const cost = u.cost[Math.min(r, u.cost.length - 1)];
        const unlocked = req(u.requires, p.stats);
        const afford = !max && unlocked && (p.wallet[c] ?? 0) >= cost;
        const card = h('div', { class: `sc-up${afford ? ' sc-afford' : ''}${max ? ' sc-max' : ''}` },
          h('i', {}, u.icon ?? b.icon), h('h5', {}, u.name), h('p', {}, unlocked ? upgradeText(u) : `🔒 ${requirementText(u.requires)}`),
          h('div', { class: 'sc-ranks', 'aria-label': `Rang ${r} sur ${u.maxRank}` }, ...Array.from({ length: u.maxRank }, (_, i) => h('span', { class: i < r ? 'sc-on' : '' }))),
          h('button', { class: `sc-btn${afford ? ' sc-primary' : ''}`, disabled: !afford,
            onclick: () => { if (o.onBuy(b, u, cost, c)) { render(); detail.querySelectorAll('.sc-up')[b.upgrades.indexOf(u)]?.classList.add('sc-bought'); } } },
          max ? 'Maîtrisé' : `${fmt(cost)} ${cur(c).icon}`));
        return card;
      })));
  };
  render();

  return h('section', { class: 'sc-screen sc-bg', style: { backgroundImage: `url(${o.assetUrl('shrine-ruins')})` }, role: 'dialog', 'aria-label': "Sanctuaire d'Akar" },
    h('div', { class: 'sc-sanct' },
      h('div', { class: 'sc-sanct-head' },
        h('div', {}, h('div', { class: 'sc-sub' }, 'Entre deux runs'), h('h2', { class: 'sc-title', style: { fontSize: '1.8em' } }, "Sanctuaire d'Akar")),
        wallet,
        h('div', { class: 'sc-row' }, h('button', { class: 'sc-btn sc-ghost', onclick: o.onLeave }, '← Retour'), h('button', { class: 'sc-btn sc-primary', onclick: o.onPlay }, '⚔ Partir'))),
      h('div', { class: 'sc-sanct-body' }, list, detail)));
}

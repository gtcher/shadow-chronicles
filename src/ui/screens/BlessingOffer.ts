import { h } from '../dom';
import { BLESSINGS, blessingText, duoUnlockedBy, tagColor, tagLabel, type Blessing, type Rarity } from '../data';

export interface OfferChoice { blessing: Blessing; rarity: Rarity; /** Offre d'amélioration : rareté d'avant. */ upgradeFrom?: Rarity }

export interface OfferOptions {
  wave: number;
  choices: OfferChoice[];
  owned: Array<{ blessing: Blessing; rarity: Rarity }>;
  rerolls: number;
  rerollGoldCost?: number;
  gold?: number;
  title?: string;
  onPick: (c: OfferChoice) => void;
  onReroll?: () => void;
}

/**
 * Offre de fin de vague : 3 cartes (4 sur la route Archives). Chaque carte montre patron, rareté,
 * emplacement, tags de synergie, le Duo qu'elle débloque et la bénédiction qu'elle remplace.
 * Choix au clic, au tap ou avec les touches 1–4.
 */
export function blessingOfferScreen(o: OfferOptions): HTMLElement {
  const owned = o.owned.map((x) => x.blessing);
  let picked = false;
  const cards = o.choices.map((c, i) => {
    const b = c.blessing;
    const p = BLESSINGS.patrons[b.patron];
    const slot = BLESSINGS.slots[b.slot];
    const replaced = b.slot !== 'passif' && !c.upgradeFrom ? o.owned.find((x) => x.blessing.slot === b.slot && x.blessing.id !== b.id) : undefined;
    const duo = c.upgradeFrom ? undefined : duoUnlockedBy(owned, b);
    const reso = owned.filter((x) => x.patron === b.patron).length + (c.upgradeFrom ? 0 : 1);
    const nextReso = p.resonance.find((r) => r.count === reso);
    const card = h('button', {
      class: `sc-card${duo ? ' sc-has-duo' : ''}`, 'data-rarity': c.rarity, '--pc': p.color, '--i': i,
      'aria-label': `${b.name}, ${BLESSINGS.rarities[c.rarity].name}, ${p.name}. ${b.desc.replace('{v}', String(b.values?.[c.rarity] ?? ''))}${duo ? `. Débloque le Duo ${duo.name}` : ''}`,
      onclick: () => choose(i),
    },
    h('div', { class: 'sc-rar' }, h('span', {}, h('span', { class: 'sc-rmark', 'aria-hidden': 'true' }), ' ', c.upgradeFrom ? `Amélioration → ${BLESSINGS.rarities[c.rarity].name}` : BLESSINGS.rarities[c.rarity].name), h('span', {}, slot?.name ?? b.slot)),
    h('span', { class: 'sc-kbd sc-key' }, String(i + 1)),
    h('div', { class: 'sc-sigil', 'aria-hidden': 'true' }, p.icon),
    h('div', { class: 'sc-ttl' }, h('h3', {}, b.name), h('div', { class: 'sc-patron' }, `${p.name}`)),
    h('p', { class: 'sc-desc', html: blessingText(b, c.rarity, c.upgradeFrom) }),
    h('div', { class: 'sc-tags' }, ...b.tags.map((t) => h('span', { class: 'sc-tag', '--c': tagColor(t) }, tagLabel(t)))),
    h('footer', {},
      duo ? h('span', { class: 'sc-duo' }, `⚭ Débloque un Duo : ${duo.name}`) : null,
      nextReso ? h('span', { style: { color: p.color } }, `${p.icon} Résonance ${reso} : ${nextReso.desc}`) : h('span', {}, `${p.icon} ${p.domain} : ${reso} / 6 pour la résonance max`),
      replaced ? h('span', { class: 'sc-replace' }, `⟳ Remplace ${replaced.blessing.name}`) : null));
    return card;
  });

  const choose = (i: number) => {
    if (picked) return;
    picked = true;
    removeEventListener('keydown', onKey);
    cards.forEach((c, j) => c.classList.add(j === i ? 'sc-chosen' : 'sc-discard'));
    setTimeout(() => o.onPick(o.choices[i]), 450);
  };
  const onKey = (e: KeyboardEvent) => {
    const n = Number(e.key);
    if (n >= 1 && n <= cards.length) { e.preventDefault(); choose(n - 1); }
  };
  addEventListener('keydown', onKey);

  const canReroll = o.rerolls > 0 || (o.rerollGoldCost !== undefined && (o.gold ?? 0) >= o.rerollGoldCost);
  const counts: Record<string, number> = {};
  for (const b of owned) counts[b.patron] = (counts[b.patron] ?? 0) + 1;

  const root = h('section', { class: 'sc-screen', role: 'dialog', 'aria-label': 'Choisis une bénédiction' },
    h('div', { class: 'sc-offer' },
      h('header', {}, h('div', { class: 'sc-sub' }, `Vague ${o.wave} franchie`), h('h2', { class: 'sc-title', style: { fontSize: '1.9em' } }, o.title ?? 'Choisis une bénédiction'),
        h('div', { class: 'sc-orn' }), h('p', {}, 'Les Serments répondent à ton appel.')),
      h('div', { class: 'sc-cards', '--n': cards.length }, ...cards),
      h('div', { class: 'sc-offer-foot' },
        o.onReroll ? h('button', { class: 'sc-btn', disabled: !canReroll, onclick: () => { removeEventListener('keydown', onKey); o.onReroll!(); } },
          o.rerolls > 0 ? `⟳ Relancer (${o.rerolls} gratuite${o.rerolls > 1 ? 's' : ''})` : `⟳ Relancer · ${o.rerollGoldCost ?? '—'} or`) : null),
      Object.keys(counts).length ? h('div', { class: 'sc-reso-bar' }, ...Object.entries(counts).map(([pid, n]) => {
        const p = BLESSINGS.patrons[pid];
        return h('div', { class: 'sc-reso' }, h('div', { '--c': p.color }, `${p.icon} ${p.domain}`, ...[2, 4, 6].map((t) => h('span', { class: `sc-pip${n >= t ? ' sc-on' : ''}` }))));
      })) : null));
  (root as HTMLElement & { cleanup?: () => void }).cleanup = () => removeEventListener('keydown', onKey);
  return root;
}

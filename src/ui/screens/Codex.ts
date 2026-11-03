import { h } from '../dom';
import { BLESSINGS, LOOT_UI, SANCTUARY, HERO_INFO, RARITY_ORDER, requirementText, tagColor, tagLabel, type Blessing, type Duo, type LegendaryPower, type PatronLegendary } from '../data';
import { sigil, RUNE_RING } from '../sigils';

/** Ce que le Codex affiche : les découvertes du profil (src/save : profile.unlocks.seen*). */
export interface CodexData {
  seenBlessings: string[];          // bénédictions + légendaires de patron (leg_*)
  seenDuos: string[];
  seenPowers: string[];             // pouvoirs légendaires des objets
  /** Patrons proposés en run (3 au départ, puis débloqués à l'Autel). */
  patronsOpen: string[];
  /** Amélioration « Codex des Brumes » des Archives : montre l'effet des entrées non découvertes. */
  scholar: boolean;
  assetUrl: (key: string) => string | undefined;
}

export interface CodexOptions extends CodexData {
  onBack: () => void;
  /** Onglet ouvert au départ. */
  tab?: CodexTab;
}

export type CodexTab = 'serments' | 'duos' | 'reliques' | 'savoir';

const PATRON_IDS = Object.keys(BLESSINGS.patrons);
const VIEWED_KEY = 'sc-codex-vu';

/** Compte des découvertes, par section et au total. */
export function codexProgress(d: Pick<CodexData, 'seenBlessings' | 'seenDuos' | 'seenPowers'>) {
  const sb = new Set(d.seenBlessings), sd = new Set(d.seenDuos), sp = new Set(d.seenPowers);
  const count = <T extends { id: string }>(list: T[], s: Set<string>) => ({ found: list.filter((x) => s.has(x.id)).length, total: list.length });
  const blessings = count(BLESSINGS.blessings, sb);
  const legendaries = count(BLESSINGS.legendaries, sb);
  const duos = count(BLESSINGS.duos, sd);
  const relics = count(LOOT_UI.legendaryPowers, sp);
  const found = blessings.found + legendaries.found + duos.found + relics.found;
  const total = blessings.total + legendaries.total + duos.total + relics.total;
  return { blessings, legendaries, duos, relics, found, total, pct: Math.floor((100 * found) / Math.max(1, total)) };
}

/** Découvertes pas encore regardées dans le Codex (pastille « nouveau » du menu). */
export function codexFresh(d: Pick<CodexData, 'seenBlessings' | 'seenDuos' | 'seenPowers'>): number {
  const viewed = readViewed();
  return [...d.seenBlessings, ...d.seenDuos.map((x) => `duo:${x}`), ...d.seenPowers.map((x) => `relic:${x}`)].filter((x) => !viewed.has(x)).length;
}

function readViewed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(VIEWED_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}
function writeViewed(ids: Iterable<string>): void {
  try { localStorage.setItem(VIEWED_KEY, JSON.stringify([...ids])); } catch { /* stockage indisponible */ }
}

const RARITY_VAR: Record<string, string> = { commun: 'var(--r-commun)', rare: 'var(--r-rare)', epique: 'var(--r-epique)', heroique: 'var(--r-heroique)' };
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

/** Effet d'une bénédiction avec ses 4 valeurs (commun → héroïque), chacune à la couleur de sa rareté. */
function rangeText(b: Blessing): string {
  return esc(b.desc).replace('{v}', () => {
    const vals = RARITY_ORDER.map((r) => (b.values?.[r] !== undefined ? `<em style="--rc:${RARITY_VAR[r]}" title="${BLESSINGS.rarities[r].name}">${b.values[r]}</em>` : '')).filter(Boolean);
    return vals.length ? `<span class="sc-cx-range">${vals.join('<i>/</i>')}</span>` : '';
  });
}

const ring = (pct: number, label: string) => {
  const C = 2 * Math.PI * 26;
  return h('div', { class: 'sc-cx-ring', role: 'img', 'aria-label': label, html:
    `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" class="sc-cx-ring-bg"/><circle cx="32" cy="32" r="26" class="sc-cx-ring-fg" style="stroke-dasharray:${C.toFixed(1)};--off:${(C * (1 - pct / 100)).toFixed(1)}"/></svg><b>${pct}<small>%</small></b>` });
};

const bar = (found: number, total: number) =>
  h('div', { class: 'sc-cx-bar', 'aria-hidden': 'true' }, h('i', { style: { transform: `scaleX(${total ? found / total : 0})` } }));

/** Codex des Brumes : bénédictions, Duos, reliques légendaires et savoir (statuts, raretés). */
export function codexScreen(o: CodexOptions): HTMLElement {
  const sb = new Set(o.seenBlessings), sd = new Set(o.seenDuos), sp = new Set(o.seenPowers);
  const viewed = readViewed();
  const fresh = (key: string, seen: boolean) => seen && !viewed.has(key);
  const prog = codexProgress(o);
  let tab: CodexTab = o.tab ?? 'serments';
  let patronId = PATRON_IDS.find((p) => BLESSINGS.blessings.some((b) => b.patron === p && fresh(b.id, sb.has(b.id)))) ?? PATRON_IDS[0];

  const body = h('div', { class: 'sc-cx-body', role: 'tabpanel', id: 'sc-cx-panel' });
  const tabs = h('div', { class: 'sc-cx-tabs', role: 'tablist', 'aria-label': 'Sections du Codex' });

  // ── Bénédictions par patron ────────────────────────────────
  const blessingCard = (b: Blessing, i: number) => {
    const p = BLESSINGS.patrons[b.patron];
    const seen = sb.has(b.id);
    const slot = BLESSINGS.slots[b.slot]?.name ?? b.slot;
    return h('article', { class: `sc-cx-card${seen ? '' : ' sc-unseen'}${fresh(b.id, seen) ? ' sc-new' : ''}`, tabindex: '0', '--pc': p.color, '--i': String(Math.min(i, 14)),
      'aria-label': seen ? `${b.name}, ${slot}` : `Bénédiction non découverte, ${slot}` },
    h('div', { class: 'sc-cx-slot' }, h('span', {}, slot), fresh(b.id, seen) ? h('span', { class: 'sc-cx-newtag' }, 'Nouveau') : null),
    h('div', { class: 'sc-cx-glyph', html: sigil(b.patron) }),
    h('h4', {}, seen ? b.name : '? ? ?'),
    seen || o.scholar
      ? h('p', { class: `sc-cx-desc${seen ? '' : ' sc-veiled'}`, html: rangeText(b) })
      : h('p', { class: 'sc-cx-hint' }, 'Choisis-la dans une offre de bénédictions pour la révéler.'),
    seen ? h('div', { class: 'sc-tags' }, ...b.tags.map((t) => h('span', { class: 'sc-tag', '--c': tagColor(t) }, tagLabel(t)))) : null);
  };

  const legendaryCard = (l: PatronLegendary) => {
    const p = BLESSINGS.patrons[l.patron];
    const seen = sb.has(l.id);
    const names = l.requires.anyOf.map((id) => { const b = BLESSINGS.blessings.find((x) => x.id === id); return b && sb.has(id) ? b.name : '???'; });
    return h('article', { class: `sc-cx-card sc-cx-leg${seen ? '' : ' sc-unseen'}${fresh(l.id, seen) ? ' sc-new' : ''}`, tabindex: '0', '--pc': p.color, '--i': '8',
      'aria-label': seen ? `Légendaire : ${l.name}` : 'Légendaire non découvert' },
    h('div', { class: 'sc-cx-slot' }, h('span', {}, '✪ Légendaire du patron'), fresh(l.id, seen) ? h('span', { class: 'sc-cx-newtag' }, 'Nouveau') : null),
    h('div', { class: 'sc-cx-glyph sc-big', html: sigil(l.patron) }),
    h('h4', {}, seen ? l.name : '? ? ?'),
    seen || o.scholar ? h('p', { class: `sc-cx-desc${seen ? '' : ' sc-veiled'}` }, l.desc) : null,
    h('p', { class: 'sc-cx-req' }, `Peut apparaître dès ${l.requires.patronCount} bénédictions de ce patron, dont l’une de : ${names.join(', ')}.`));
  };

  const patronLockNote = (pid: string) => {
    if (o.patronsOpen.includes(pid)) return null;
    const autel = SANCTUARY.buildings.find((b) => b.id === 'autel');
    const u = autel?.upgrades.find((x) => x.unlocksPatron === pid);
    const cur = u ? SANCTUARY.currencies[u.currency ?? autel!.currency] : undefined;
    return h('div', { class: 'sc-cx-lock' }, h('b', {}, '🔒 Patron scellé'),
      h('span', {}, u ? `Pour le croiser en run : Sanctuaire › Autel des Serments › « ${u.name} »${u.requires ? ` (${requirementText(u.requires).toLowerCase()})` : ''}, ${u.cost[0]} ${cur?.icon ?? ''}.` : 'Se débloque au Sanctuaire.'));
  };

  const renderSerments = () => {
    const rail = h('div', { class: 'sc-cx-rail', role: 'group', 'aria-label': 'Patrons' }, ...PATRON_IDS.map((pid) => {
      const p = BLESSINGS.patrons[pid];
      const list = BLESSINGS.blessings.filter((b) => b.patron === pid);
      const leg = BLESSINGS.legendaries.filter((l) => l.patron === pid);
      const found = [...list, ...leg].filter((b) => sb.has(b.id)).length, total = list.length + leg.length;
      const isNew = [...list, ...leg].some((b) => fresh(b.id, sb.has(b.id)));
      return h('button', { class: `sc-cx-patron${o.patronsOpen.includes(pid) ? '' : ' sc-sealed'}`, '--pc': p.color, 'aria-pressed': String(pid === patronId),
        onclick: () => { patronId = pid; render(); } },
      h('span', { class: 'sc-cx-mini', html: sigil(pid) }),
      h('span', { class: 'sc-cx-pname' }, p.domain, isNew ? h('i', { class: 'sc-cx-dot', title: 'Nouvelle découverte' }) : null),
      h('small', {}, `${found}/${total}`), bar(found, total));
    }));
    const p = BLESSINGS.patrons[patronId];
    const list = BLESSINGS.blessings.filter((b) => b.patron === patronId);
    const legs = BLESSINGS.legendaries.filter((l) => l.patron === patronId);
    const heroes = p.heroAffinity.map((id) => HERO_INFO[id as keyof typeof HERO_INFO]?.name).filter(Boolean);
    const banner = h('header', { class: 'sc-cx-banner', '--pc': p.color },
      h('div', { class: 'sc-cx-seal' }, h('span', { class: 'sc-cx-runes', html: RUNE_RING }), h('span', { class: 'sc-cx-sealglyph', html: sigil(patronId) })),
      h('div', { class: 'sc-cx-lore' },
        h('div', { class: 'sc-sub' }, `${p.domain}${heroes.length ? ` · affinité ${heroes.join(', ')}` : ''}`),
        h('h3', {}, p.name), h('p', { class: 'sc-cx-pitch' }, p.pitch),
        h('ol', { class: 'sc-cx-reso', 'aria-label': 'Résonances' }, ...p.resonance.map((r) => h('li', {}, h('b', {}, `${r.count}`), h('span', {}, r.desc)))),
        patronLockNote(patronId)));
    body.replaceChildren(rail, h('div', { class: 'sc-cx-swap' }, banner,
      h('div', { class: 'sc-cx-grid' }, ...list.map(blessingCard), ...legs.map(legendaryCard))));
  };

  // ── Duos ───────────────────────────────────────────────────
  const duoCard = (d: Duo, i: number) => {
    const seen = sd.has(d.id);
    const [a, b] = d.patrons.map((x) => BLESSINGS.patrons[x]);
    const need = d.patrons.map((pid, k) => {
      const p = BLESSINGS.patrons[pid];
      return h('span', { class: 'sc-cx-need', '--pc': p.color }, h('span', { class: 'sc-cx-mini', html: sigil(pid) }),
        h('span', {}, h('b', {}, p.domain), ' · ', (d.requires.anyTags[k] ?? []).map(tagLabel).join(' ou ')));
    });
    return h('article', { class: `sc-cx-card sc-cx-duo${seen ? '' : ' sc-unseen'}${fresh(`duo:${d.id}`, seen) ? ' sc-new' : ''}`, tabindex: '0',
      '--pa': a.color, '--pb': b.color, '--pc': a.color, '--i': String(i), 'aria-label': seen ? `Duo : ${d.name}` : 'Duo non découvert' },
    h('div', { class: 'sc-cx-slot' }, h('span', {}, '⚭ Duo'), fresh(`duo:${d.id}`, seen) ? h('span', { class: 'sc-cx-newtag' }, 'Nouveau') : null),
    h('div', { class: 'sc-cx-pair' }, h('span', { class: 'sc-cx-glyph', style: { color: a.color }, html: sigil(d.patrons[0]) }), h('span', { class: 'sc-cx-glyph', style: { color: b.color }, html: sigil(d.patrons[1]) })),
    h('h4', {}, seen ? d.name : '? ? ?'),
    seen || o.scholar ? h('p', { class: `sc-cx-desc${seen ? '' : ' sc-veiled'}` }, d.desc) : null,
    h('div', { class: 'sc-cx-needs' }, h('small', {}, 'Réunir :'), ...need));
  };
  const renderDuos = () => body.replaceChildren(
    h('p', { class: 'sc-cx-intro' }, 'Un Duo apparaît dans les offres quand ton build porte les bons mots-clés de deux patrons à la fois. Il remplace une carte et ne prend aucun emplacement.'),
    h('div', { class: 'sc-cx-grid sc-cx-swap' }, ...BLESSINGS.duos.map(duoCard)));

  // ── Reliques (pouvoirs légendaires des objets) ─────────────
  const ITEM_ART: Record<string, string> = { weapon: 'item-h14-weapon', armor: 'item-h14-armor', ring: 'item-h14-ring', boots: 'item-h14-boots' };
  const HERO_WEAPON: Record<string, string> = { sena: 'item-h14-staff', ren: 'item-h14-bow', mei: 'item-h14-dagger' };
  const art = (k: string) => { try { return o.assetUrl(k); } catch { return undefined; } };
  const relicCard = (r: LegendaryPower, i: number) => {
    const seen = sp.has(r.id);
    const key = (r.slot === 'weapon' && r.hero && HERO_WEAPON[r.hero]) || ITEM_ART[r.slot];
    const url = art(key) ?? art(key.replace('h14-', ''));
    const pc = r.patronHint ? BLESSINGS.patrons[r.patronHint]?.color : undefined;
    const hero = r.hero ? HERO_INFO[r.hero] : undefined;
    return h('article', { class: `sc-cx-card sc-cx-relic${seen ? '' : ' sc-unseen'}${fresh(`relic:${r.id}`, seen) ? ' sc-new' : ''}`, tabindex: '0', '--pc': pc ?? '#ffca73', '--i': String(Math.min(i, 14)),
      'aria-label': seen ? `Relique : ${r.name}` : 'Relique non découverte' },
    h('div', { class: 'sc-cx-slot' }, h('span', {}, `${LOOT_UI.slots[r.slot]?.icon ?? ''} ${LOOT_UI.slots[r.slot]?.label ?? r.slot}`),
      fresh(`relic:${r.id}`, seen) ? h('span', { class: 'sc-cx-newtag' }, 'Nouveau') : hero ? h('span', { class: 'sc-cx-hero', style: { color: hero.color } }, hero.name) : null),
    h('div', { class: 'sc-cx-item' }, url ? h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' }) : null),
    h('h4', {}, seen ? r.name : '? ? ?'),
    seen ? h('p', { class: 'sc-cx-short' }, r.short) : null,
    seen || o.scholar ? h('p', { class: `sc-cx-desc${seen ? '' : ' sc-veiled'}` }, r.desc)
      : h('p', { class: 'sc-cx-hint' }, `Sur un objet légendaire${hero ? ` (${hero.name} seulement)` : ''}. Les boss en lâchent plus souvent.`));
  };
  const renderRelics = () => body.replaceChildren(
    h('p', { class: 'sc-cx-intro' }, 'Chaque objet légendaire porte un pouvoir unique. Les armes de héros ne s’activent que pour leur porteur.'),
    h('div', { class: 'sc-cx-grid sc-cx-swap' }, ...LOOT_UI.legendaryPowers.map(relicCard)));

  // ── Savoir : raretés, emplacements, statuts ────────────────
  const renderSavoir = () => body.replaceChildren(h('div', { class: 'sc-cx-lore-grid sc-cx-swap' },
    h('section', { class: 'sc-cx-sheet' }, h('h3', {}, 'Raretés'),
      h('p', {}, 'La même bénédiction existe en 4 raretés : seule sa valeur change. Les raretés hautes n’apparaissent qu’à partir d’une certaine vague.'),
      h('ul', { class: 'sc-cx-list' }, ...RARITY_ORDER.map((r) => { const R = BLESSINGS.rarities[r];
        return h('li', { '--c': R.color }, h('i', { class: 'sc-cx-gem' }), h('b', {}, R.name), h('span', {}, R.minWave > 1 ? `dès la vague ${R.minWave}` : 'dès la vague 1')); }))),
    h('section', { class: 'sc-cx-sheet' }, h('h3', {}, 'Emplacements'),
      h('ul', { class: 'sc-cx-list' }, ...Object.values(BLESSINGS.slots).map((s) => h('li', {}, h('b', {}, s.name), h('span', {}, s.desc))))),
    h('section', { class: 'sc-cx-sheet' }, h('h3', {}, 'Altérations'),
      h('ul', { class: 'sc-cx-list' }, ...Object.values(BLESSINGS.statuses).map((s) => h('li', { '--c': s.color }, h('i', { class: 'sc-cx-gem' }), h('b', {}, s.name), h('span', {}, s.effect))))),
    h('section', { class: 'sc-cx-sheet' }, h('h3', {}, 'Résonances et légendaires'),
      h('p', {}, 'Cumuler les bénédictions d’un même patron éveille sa résonance à 2, 4 puis 6 bénédictions : des bonus gratuits qui s’ajoutent au reste.'),
      h('p', {}, 'Avec 3 bénédictions d’un patron, dont une bénédiction-clé, son légendaire peut apparaître : un pouvoir qui change la run.'),
      o.scholar ? null : h('p', { class: 'sc-cx-tip' }, '✦ Astuce : aux Archives du Sceau, « Codex des Brumes » dévoile l’effet de tout ce que tu n’as pas encore trouvé.'))));

  const TABS: Array<{ id: CodexTab; label: string; count?: { found: number; total: number }; render: () => void }> = [
    { id: 'serments', label: 'Serments', count: { found: prog.blessings.found + prog.legendaries.found, total: prog.blessings.total + prog.legendaries.total }, render: renderSerments },
    { id: 'duos', label: 'Duos', count: prog.duos, render: renderDuos },
    { id: 'reliques', label: 'Reliques', count: prog.relics, render: renderRelics },
    { id: 'savoir', label: 'Savoir', render: renderSavoir },
  ];
  const render = () => {
    tabs.replaceChildren(...TABS.map((t) => h('button', { class: 'sc-cx-tab', role: 'tab', 'aria-selected': String(t.id === tab), 'aria-controls': 'sc-cx-panel',
      onclick: () => { if (tab !== t.id) { tab = t.id; render(); } } },
    h('span', {}, t.label), t.count ? h('small', {}, `${t.count.found}/${t.count.total}`) : null)));
    TABS.find((t) => t.id === tab)!.render();
  };
  render();

  // Tout ce qui est découvert est désormais « vu » (la pastille du menu disparaît).
  writeViewed(new Set([...viewed, ...o.seenBlessings, ...o.seenDuos.map((x) => `duo:${x}`), ...o.seenPowers.map((x) => `relic:${x}`)]));

  const bg = art('codex');
  return h('section', { class: 'sc-screen sc-codex-scr', role: 'dialog', 'aria-label': 'Codex des Brumes' },
    h('div', { class: 'sc-cx-bg', 'aria-hidden': 'true', style: bg ? { backgroundImage: `url(${bg})` } : {} }),
    h('div', { class: 'sc-motes', 'aria-hidden': 'true' }, ...Array.from({ length: 14 }, (_, i) => h('i', { style: { left: `${(i * 37 + 11) % 100}%`, animationDelay: `${-(i * 2.3) % 16}s`, animationDuration: `${12 + (i * 5) % 9}s` } }))),
    h('div', { class: 'sc-codex' },
      h('div', { class: 'sc-cx-head' },
        h('button', { class: 'sc-btn sc-ghost', onclick: o.onBack, 'data-autofocus': true }, '← Retour'),
        h('div', { class: 'sc-cx-title' }, h('div', { class: 'sc-sub' }, 'Archives du Sceau'), h('h2', { class: 'sc-title' }, 'Codex des Brumes')),
        h('div', { class: 'sc-cx-total' }, ring(prog.pct, `${prog.pct} % du Codex découvert`), h('div', {}, h('b', {}, `${prog.found} / ${prog.total}`), h('small', {}, 'entrées découvertes')))),
      tabs, body));
}

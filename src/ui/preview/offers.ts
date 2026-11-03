import { BLESSINGS, RARITY_ORDER, type Blessing, type HeroId, type Rarity } from '../data';
import type { OfferChoice } from '../screens/BlessingOffer';

/**
 * Tirage d'offre simplifié pour la maquette (règles de blessings.json > offerRules, sans pitié ni routes).
 * Le vrai tirage appartient à l'agent Gameplay/Progression.
 */
export function rollOffer(hero: HeroId, wave: number, owned: Array<{ blessing: Blessing; rarity: Rarity }>, patrons: string[], rand = Math.random): OfferChoice[] {
  const rules = BLESSINGS.offerRules;
  const out: OfferChoice[] = [];
  const perPatron: Record<string, number> = {};
  const ownedIds = new Set(owned.map((o) => o.blessing.id));
  const rarity = (): Rarity => {
    const pool = RARITY_ORDER.filter((r) => BLESSINGS.rarities[r].minWave <= wave);
    let t = rand() * pool.reduce((s, r) => s + BLESSINGS.rarities[r].weight, 0);
    for (const r of pool) { t -= BLESSINGS.rarities[r].weight; if (t <= 0) return r; }
    return 'commun';
  };
  // Une amélioration possible (18 %).
  const upgradable = owned.filter((o) => o.rarity !== 'heroique');
  if (upgradable.length && rand() < 0.18) {
    const o = upgradable[Math.floor(rand() * upgradable.length)];
    out.push({ blessing: o.blessing, rarity: RARITY_ORDER[RARITY_ORDER.indexOf(o.rarity) + 1], upgradeFrom: o.rarity });
    perPatron[o.blessing.patron] = 1;
  }
  let guard = 0;
  while (out.length < rules.choices && guard++ < 200) {
    const pool = BLESSINGS.blessings.filter((b) => patrons.includes(b.patron) && !ownedIds.has(b.id) && !out.some((c) => c.blessing.id === b.id)
      && (perPatron[b.patron] ?? 0) < rules.maxSamePatronInOffer);
    if (!pool.length) break;
    const w = pool.map((b) => (BLESSINGS.patrons[b.patron].heroAffinity.includes(hero) ? rules.heroAffinityWeightBonus : 1));
    let t = rand() * w.reduce((a, b) => a + b, 0);
    let pick = pool[0];
    for (let i = 0; i < pool.length; i++) { t -= w[i]; if (t <= 0) { pick = pool[i]; break; } }
    perPatron[pick.patron] = (perPatron[pick.patron] ?? 0) + 1;
    out.push({ blessing: pick, rarity: rarity() });
  }
  return out;
}

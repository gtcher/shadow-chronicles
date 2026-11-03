/**
 * Données lues par l'UI. Les chiffres viennent des tables de l'agent Progression (game/data/*.json) ;
 * les héros et techniques reprennent le prototype H1.5.2 (noms, rôles, recharges, coûts).
 */
import blessingsJson from '../../data/blessings.json';
import sanctuaryJson from '../../data/sanctuary.json';
import achievementsJson from '../../data/achievements.json';
import lootJson from '../../data/loot.json';

export type HeroId = 'taro' | 'mei' | 'sena' | 'ren';
export type Rarity = 'commun' | 'rare' | 'epique' | 'heroique';
export const RARITY_ORDER: Rarity[] = ['commun', 'rare', 'epique', 'heroique'];

export interface SkillInfo { name: string; desc: string; cd: number; cost: number }
export interface HeroInfo { id: HeroId; name: string; role: string; color: string; skills: SkillInfo[] }

export const HERO_INFO: Record<HeroId, HeroInfo> = {
  taro: { id: 'taro', name: 'Taro', role: 'Tank · Lame sombre', color: '#eb4656', skills: [
    { name: 'Entaille', desc: 'Frappe de base.', cd: 0.55, cost: 0 }, { name: 'Rempart noir', desc: 'Gros coup + bouclier.', cd: 2.4, cost: 18 },
    { name: 'Ruée obscure', desc: 'Charge sur la cible.', cd: 4.5, cost: 22 }, { name: "Tempête d'ombres", desc: 'Zone circulaire massive.', cd: 10.5, cost: 42 }] },
  mei: { id: 'mei', name: 'Mei', role: 'Assassin · Burst', color: '#d04f7e', skills: [
    { name: 'Double taille', desc: 'Combo rapide.', cd: 0.48, cost: 0 }, { name: 'Pas fantôme', desc: 'Dash critique.', cd: 2.1, cost: 16 },
    { name: 'Cercle de lames', desc: 'Zone autour de la cible.', cd: 4.8, cost: 22 }, { name: 'Exécution rouge', desc: 'Mono-cible dévastateur.', cd: 9.2, cost: 39 }] },
  sena: { id: 'sena', name: 'Sena', role: 'Mage · Zone', color: '#6fc2ff', skills: [
    { name: 'Éclat arcanique', desc: 'Projectile magique.', cd: 0.62, cost: 6 }, { name: 'Anneau givré', desc: 'Explosion de glace.', cd: 2.9, cost: 18 },
    { name: 'Prisme', desc: 'Trois traits magiques.', cd: 5.1, cost: 22 }, { name: 'Comète lunaire', desc: 'Impact massif de zone.', cd: 11, cost: 48 }] },
  ren: { id: 'ren', name: 'Ren', role: 'Archer · Distance', color: '#d7b366', skills: [
    { name: 'Flèche rapide', desc: 'Tir basique.', cd: 0.48, cost: 0 }, { name: 'Salve perçante', desc: 'Tir renforcé.', cd: 2.5, cost: 14 },
    { name: 'Piège des brumes', desc: 'Piège et dégâts de zone.', cd: 5.3, cost: 20 }, { name: 'Pluie de flèches', desc: 'Bombardement de zone.', cd: 10, cost: 43 }] },
};
export const HERO_IDS = Object.keys(HERO_INFO) as HeroId[];

export interface Patron { name: string; domain: string; icon: string; color: string; pitch: string; heroAffinity: string[]; resonance: { count: number; desc: string }[] }
export interface Blessing { id: string; patron: string; slot: string; name: string; desc: string; values?: Partial<Record<Rarity, number>>; tags: string[] }
export interface Duo { id: string; patrons: string[]; name: string; requires: { anyTags: string[][] }; desc: string }
export interface PatronLegendary { id: string; patron: string; name: string; desc: string; requires: { patronCount: number; anyOf: string[] } }

export const BLESSINGS = blessingsJson as unknown as {
  rarities: Record<Rarity, { name: string; color: string; weight: number; minWave: number }>;
  slots: Record<string, { name: string; skillIndex: number | null; desc: string }>;
  statuses: Record<string, { name: string; color: string; effect: string }>;
  patrons: Record<string, Patron>;
  blessings: Blessing[];
  duos: Duo[];
  legendaries: PatronLegendary[];
  offerRules: { choices: number; maxSamePatronInOffer: number; heroAffinityWeightBonus: number; rerollGoldCost: number[] };
};

export interface Upgrade { id: string; name: string; icon?: string; desc?: string; stat?: string; perRank?: number; maxRank: number; cost: number[]; currency?: string; requires?: string; unlocksPatron?: string }
export interface Building { id: string; name: string; icon: string; currency: string; unlockedAtStart: boolean; unlockCost?: Record<string, number>; requires?: string; desc: string; upgrades: Upgrade[] }
export const SANCTUARY = sanctuaryJson as unknown as {
  currencies: Record<string, { name: string; icon: string; color: string }>;
  buildings: Building[];
  heroMastery: { levels: { level: number; xp: number }[]; xpPerWave: number };
};

/** Pouvoirs légendaires des objets (loot.json), recensés dans le Codex. */
export interface LegendaryPower { id: string; slot: string; hero?: HeroId; name: string; short: string; desc: string; patronHint?: string }
export const LOOT_UI = lootJson as unknown as {
  slots: Record<string, { icon: string; label: string }>;
  legendaryPowers: LegendaryPower[];
};

export interface Achievement { id: string; tier: string; icon: string; name: string; desc: string; secret?: boolean; cond: { stat: string; op: string; value: number } }
export const ACHIEVEMENTS = (achievementsJson as unknown as { achievements: Achievement[] }).achievements;

/** Valeur affichée d'une bénédiction pour une rareté (remplace {v}). */
export function blessingText(b: Blessing, r: Rarity, from?: Rarity): string {
  const v = b.values?.[r];
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  return esc(b.desc).replace('{v}', () => {
    if (v === undefined) return '';
    const old = from ? b.values?.[from] : undefined;
    return old !== undefined ? `<s>${old}</s> <span class="sc-upv">${v}</span>` : `<em>${v}</em>`;
  });
}

/** Tags d'un statut/mot-clé avec sa couleur, pour les pastilles des cartes. */
export function tagColor(tag: string): string {
  const st = BLESSINGS.statuses[tag];
  if (st) return st.color;
  const p = Object.values(BLESSINGS.patrons).find((x) => x.domain.toLowerCase() === tag);
  return p?.color ?? '#c9bda6';
}
export function tagLabel(tag: string): string {
  return BLESSINGS.statuses[tag]?.name ?? tag.charAt(0).toUpperCase() + tag.slice(1);
}

/** Duo qui deviendrait disponible si `candidate` rejoint `owned` (et ne l'était pas avant). */
export function duoUnlockedBy(owned: Blessing[], candidate: Blessing): Duo | undefined {
  const has = (list: Blessing[], tags: string[], patron: string) => list.some((b) => b.patron === patron && b.tags.some((t) => tags.includes(t)));
  const ok = (list: Blessing[], d: Duo) => d.patrons.every((p, i) => has(list, d.requires.anyTags[i] ?? [], p));
  return BLESSINGS.duos.find((d) => d.patrons.includes(candidate.patron) && !ok(owned, d) && ok([...owned, candidate], d));
}

const STAT_LABEL: Record<string, (v: number) => string> = {
  maxHpPct: (v) => `+${v} % PV max`, atkPct: (v) => `+${v} % attaque`, defPct: (v) => `+${v} % défense`,
  crit: (v) => `+${Math.round(v * 100)} % critique`, maxManaPct: (v) => `+${v} % mana max`,
  potionCharges: (v) => `+${v} fiole de soin`, goldFindPct: (v) => `+${v} % or trouvé`,
};
export function upgradeText(u: Upgrade): string {
  if (u.unlocksPatron) { const p = BLESSINGS.patrons[u.unlocksPatron]; return p ? `Débloque ${p.icon} ${p.name}.` : 'Déblocage.'; }
  if (u.stat && u.perRank !== undefined && STAT_LABEL[u.stat]) return `${STAT_LABEL[u.stat](u.perRank)} par rang.`;
  return u.maxRank > 1 ? `${u.maxRank} rangs.` : 'Déblocage unique.';
}
/** Condition de sanctuary.json en clair : « bestWave>=6 », « runs>=3 », « bossKilled:5 », « legendaryFound>=5 ». */
export function requirementText(req?: string): string {
  if (!req) return '';
  const boss = /^bossKilled:(\d+)$/.exec(req);
  if (boss) return `Vaincre le boss de la vague ${boss[1]}`;
  const m = req.match(/^(\w+)>=(\d+)$/);
  if (!m) return req;
  const n = Number(m[2]);
  const what: Record<string, string> = {
    bestWave: `Atteindre la vague ${n}`,
    runs: `Terminer ${n} run${n > 1 ? 's' : ''}`,
    legendaryFound: `Trouver ${n} objet${n > 1 ? 's' : ''} légendaire${n > 1 ? 's' : ''}`,
    bossKilled: `Vaincre ${n} boss`,
  };
  return what[m[1]] ?? `${m[1]} ${n}`;
}

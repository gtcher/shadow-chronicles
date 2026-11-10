/**
 * Cosmétiques et titres (retour des testeurs : « la maîtrise ne débloque rien qu'on voit »).
 * Les paliers de maîtrise (data/sanctuary.json > heroMastery) donnent des titres, un sillage, une tenue
 * d'éclipse et un cadre doré ; succès, Pactes et série du défi donnent des auras et une tenue commune.
 * Module pur (aucun DOM, aucun Pixi) : testé dans tests/cosmetics.test.ts.
 */
import type { HeroId, Profile } from '../save';
import sanctuaryJson from '../../data/sanctuary.json';

export type CosmeticKind = 'title' | 'trail' | 'skin' | 'aura' | 'frame' | 'trophy';
/** Emplacements que le joueur choisit (le cadre et les trophées s'appliquent seuls). */
export type LookSlot = 'title' | 'trail' | 'skin' | 'aura';
export const LOOK_SLOTS: LookSlot[] = ['title', 'trail', 'skin', 'aura'];
export const SLOT_NAMES: Record<LookSlot, string> = { title: 'Titre', trail: 'Sillage', skin: 'Tenue', aura: 'Aura' };

export interface CosmeticDef {
  id: string;
  kind: CosmeticKind;
  name: string;
  desc: string;
  /** Réservé à un héros (sinon : tous). */
  hero?: HeroId;
  /** Couleur du sillage ou de l'aura. */
  color?: number;
  /** Rotation de teinte (degrés) de la tenue. */
  hue?: number;
}

const HEROES: HeroId[] = ['taro', 'mei', 'sena', 'ren'];
const NAME: Record<HeroId, string> = { taro: 'Taro', mei: 'Mei', sena: 'Sena', ren: 'Ren' };
const ART: Record<HeroId, string> = { taro: 'de la Lame', mei: 'de l\'Ombre', sena: 'de la Lune', ren: 'de l\'Arc' };
const TRAIL: Record<HeroId, number> = { taro: 0xff6a4a, mei: 0xff5ad1, sena: 0x8fd8ff, ren: 0xffd27a };
// Rotations choisies sur captures : la tenue change de couleur sans trop toucher au teint.
const HUE: Record<HeroId, number> = { taro: -50, mei: -45, sena: 40, ren: -40 };

const DEFS: CosmeticDef[] = [
  ...HEROES.flatMap((h): CosmeticDef[] => [
    { id: `t_${h}_novice`, kind: 'title', hero: h, name: `Novice ${ART[h]}`, desc: `Maîtrise 2 avec ${NAME[h]}.` },
    { id: `trail_${h}`, kind: 'trail', hero: h, name: `Sillage de ${NAME[h]}`, desc: `Une traînée lumineuse suit ${NAME[h]} pendant ses déplacements.`, color: TRAIL[h] },
    { id: `skin_${h}_alt`, kind: 'skin', hero: h, name: 'Tenue d\'éclipse', desc: `Les couleurs de ${NAME[h]} passent à l'éclipse.`, hue: HUE[h] },
    { id: `portrait_${h}_gold`, kind: 'frame', hero: h, name: 'Cadre doré', desc: `La carte de ${NAME[h]} se pare d'or au menu.` },
    { id: `t_${h}_legende`, kind: 'title', hero: h, name: `Légende ${ART[h]}`, desc: `Maîtrise 10 avec ${NAME[h]}.` },
  ]),
  { id: 'aura_brume', kind: 'aura', name: 'Aura de Brume', desc: 'Palier 10 des Pactes de la Brume.', color: 0xb9a4ff },
  { id: 'aura_lune_pleine', kind: 'aura', name: 'Aura de Lune pleine', desc: '30 défis du jour d\'affilée.', color: 0xf6e7b0 },
  { id: 'aura_cauchemar', kind: 'aura', name: 'Aura du Cauchemar', desc: 'Vague 20 en mode Cauchemar.', color: 0xff4d4d },
  { id: 'skin_eclipse', kind: 'skin', name: 'Tenue de la Brume', desc: 'Palier 32 des Pactes de la Brume.', hue: -75 },
  { id: 'banniere_aube', kind: 'trophy', name: 'Bannière de l\'Aube', desc: '14 défis du jour d\'affilée.' },
  { id: 'vitrine_reliques', kind: 'trophy', name: 'Vitrine des reliques', desc: 'Les 17 pouvoirs légendaires trouvés.' },
];
const BY_ID = new Map(DEFS.map((d) => [d.id, d]));

/** Définition d'un cosmétique ou d'un titre ; un titre inconnu (ex. « Gardien de l'Aube ») garde son texte. */
export function cosmeticDef(id: string): CosmeticDef | undefined {
  return BY_ID.get(id);
}
export const titleName = (id: string): string => BY_ID.get(id)?.name ?? id;

/** Possédé ? (titres : unlocks.titles ; le reste : unlocks.cosmetics). */
export function owns(p: Profile, id: string): boolean {
  const d = BY_ID.get(id);
  return d?.kind === 'title' || !d ? p.unlocks.titles.includes(id) : p.unlocks.cosmetics.includes(id);
}

/** Choix possibles d'un emplacement pour ce héros (possédés ou non), dans l'ordre d'obtention. */
export function lookOptions(p: Profile, hero: HeroId, slot: LookSlot): Array<{ id: string; name: string; desc: string; owned: boolean; color?: number }> {
  const known = DEFS.filter((d) => d.kind === slot && (!d.hero || d.hero === hero));
  // Titres hors liste (série du défi, etc.) : affichés s'ils sont possédés.
  const extra = slot === 'title' ? p.unlocks.titles.filter((t) => !BY_ID.has(t)).map((t): CosmeticDef => ({ id: t, kind: 'title', name: t, desc: 'Titre spécial.' })) : [];
  return [...known, ...extra].map((d) => ({ id: d.id, name: d.name, desc: d.desc, owned: owns(p, d.id), color: d.color }));
}

/** Ce qui est porté (seulement si possédé : une sauvegarde modifiée ne débloque rien). */
export interface HeroLook { title?: string; trail?: number; skinHue?: number; aura?: number; frame: boolean }
export function heroLook(p: Profile | null, hero: HeroId): HeroLook {
  if (!p) return { frame: false };
  const eq = p.unlocks.equipped[hero] ?? {};
  const get = (id: string | undefined) => (id && owns(p, id) ? id : undefined);
  const title = get(eq.title), trail = get(eq.trail), skin = get(eq.skin), aura = get(eq.aura);
  return {
    title: title ? titleName(title) : undefined,
    trail: trail ? BY_ID.get(trail)?.color : undefined,
    skinHue: skin ? BY_ID.get(skin)?.hue : undefined,
    aura: aura ? BY_ID.get(aura)?.color : undefined,
    frame: owns(p, `portrait_${hero}_gold`),
  };
}

/** Porte (ou retire avec undefined) un cosmétique possédé. */
export function equipLook(p: Profile, hero: HeroId, slot: LookSlot, id: string | undefined): boolean {
  if (id && !owns(p, id)) return false;
  const eq = (p.unlocks.equipped[hero] ??= {});
  if (id) eq[slot] = id; else delete eq[slot];
  return true;
}

/** Après un palier : porte d'office les nouveautés si l'emplacement est vide (le joueur les voit tout de suite). */
export function autoEquip(p: Profile, hero: HeroId, ids: string[]): void {
  for (const id of ids) {
    const d = BY_ID.get(id);
    if (!d || d.kind === 'frame' || d.kind === 'trophy' || (d.hero && d.hero !== hero)) continue;
    const slot = d.kind as LookSlot;
    if (!p.unlocks.equipped[hero]?.[slot]) equipLook(p, hero, slot, id);
  }
}

interface LevelDef { level: number; xp: number; reward: null | { type: string; id?: string; stat?: string; value?: number; desc?: string } }
const LEVELS = (sanctuaryJson as unknown as { heroMastery: { levels: LevelDef[] } }).heroMastery.levels;

/** Texte d'une récompense de maîtrise. */
export function rewardLabel(r: LevelDef['reward'], hero: HeroId): string {
  if (!r) return '—';
  const id = r.id?.replaceAll('{hero}', hero);
  switch (r.type) {
    case 'title': return `Titre « ${titleName(id!)} »`;
    case 'cosmetic': return BY_ID.get(id!)?.name ?? id!;
    case 'stat': return r.stat === 'atkPct' ? `+${r.value} % d'attaque` : r.stat === 'maxHpPct' ? `+${r.value} % de vie` : `+${r.value} ${r.stat}`;
    case 'startBlessingAffinity': return 'Première bénédiction : patron favori proposé';
    case 'legendaryBias': return 'Légendaire du héros 2× plus fréquente';
    default: return r.desc ?? r.type;
  }
}

/** Les 10 paliers de maîtrise d'un héros, avec ce qu'ils donnent. */
export function masteryTrack(hero: HeroId, xp: number): Array<{ level: number; xp: number; label: string; cosmetic: boolean; reached: boolean }> {
  return LEVELS.filter((l) => l.reward).map((l) => ({
    level: l.level, xp: l.xp, label: rewardLabel(l.reward, hero),
    cosmetic: l.reward!.type === 'cosmetic' || l.reward!.type === 'title', reached: xp >= l.xp,
  }));
}

/** Prochain palier qui donne quelque chose à voir (fin de run : « encore 120 XP pour le Sillage »). */
export function nextCosmetic(hero: HeroId, xp: number): { level: number; label: string; xpLeft: number } | undefined {
  const n = masteryTrack(hero, xp).find((l) => !l.reached && l.cosmetic);
  return n ? { level: n.level, label: n.label, xpLeft: n.xp - xp } : undefined;
}

/** Ids débloqués par des paliers de maîtrise (récompenses renvoyées par addMasteryXp). */
export function unlockedIds(rewards: unknown[], hero: HeroId): string[] {
  return (rewards as Array<{ type?: string; id?: string }>).filter((r) => (r.type === 'title' || r.type === 'cosmetic') && r.id).map((r) => r.id!.replaceAll('{hero}', hero));
}

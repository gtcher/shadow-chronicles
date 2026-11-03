/**
 * Données de combat : héros, ennemis, boss. Reprises du prototype H1.5.2
 * (`partyDefs`, `V15_TYPES`, `variants34`, `bosses34`) et adaptées au jeu d'action.
 * Aucune logique ici : les systèmes de `combat/` lisent ces tables.
 */
import type { HeroId } from '../components';

/** Statuts que les ennemis infligent au héros. */
export type StatusId = 'burn' | 'frost' | 'void' | 'slow';
/** Statuts que le héros inflige aux ennemis (data/blessings.json > statuses). */
export type FoeStatusId = 'givre' | 'gel' | 'saignement' | 'choc' | 'poison' | 'marque';

/** Couleur de référence de chaque statut (télégraphes, particules, UI). */
export const STATUS_COLORS: Record<StatusId | FoeStatusId | 'none', number> = {
  none: 0xff4a3a, burn: 0xff8a3a, frost: 0x8bdefb, void: 0xb07bff, slow: 0x9fb6ff,
  givre: 0x86cffa, gel: 0xcfefff, saignement: 0xff6f7d, choc: 0xffd65c, poison: 0xaade8f, marque: 0xffe5a8,
};

// ---------------------------------------------------------------- Héros

/**
 * Forme d'une technique :
 * - slash      : arc de mêlée devant le héros (`range`, `arc`, `hits` coups rapprochés)
 * - bolt       : projectile(s) visé(s) (`count`, `spread`, `pierce`, `speed`)
 * - dashStrike : ruée vers la visée, frappe tout sur le trajet, invulnérable
 * - nova       : zone autour du héros (`radius`, `hits` impulsions, attire les ennemis)
 * - blast      : explosion à l'endroit visé (portée max `range`)
 * - trap       : piège posé à l'endroit visé, se déclenche au contact
 * - rain       : pluie de coups sur une zone visée pendant `duration`
 * - execute    : téléportation sur l'ennemi le plus proche de la visée + frappe (bonus si PV bas)
 * - comet      : impact retardé (`delay`) à l'endroit visé, télégraphié
 */
export type SkillKind = 'slash' | 'bolt' | 'dashStrike' | 'nova' | 'blast' | 'trap' | 'rain' | 'execute' | 'comet';

export interface SkillDef {
  name: string;
  desc: string;
  kind: SkillKind;
  /** Recharge (s). */
  cd: number;
  /** Coût en mana. */
  cost: number;
  /** Multiplicateur de l'ATQ (total de la technique). */
  mult: number;
  range: number;
  radius?: number;
  arc?: number;
  hits?: number;
  count?: number;
  spread?: number;
  pierce?: number;
  speed?: number;
  shield?: number;
  /** Statut appliqué aux ennemis touchés et nombre de cumuls. */
  status?: FoeStatusId;
  stacks?: number;
  critBonus?: number;
  delay?: number;
  duration?: number;
}

export interface HeroDef {
  id: HeroId;
  name: string;
  role: string;
  color: number;
  accent: number;
  /** Hauteur d'affichage du sprite (px). */
  height: number;
  base: { maxHp: number; maxMana: number; atk: number; def: number; speed: number; crit: number };
  skills: [SkillDef, SkillDef, SkillDef, SkillDef];
}

export const HERO_DEFS: Record<HeroId, HeroDef> = {
  taro: {
    id: 'taro', name: 'Taro', role: 'Tank · Lame sombre', color: 0xeb4656, accent: 0xffb078, height: 122,
    base: { maxHp: 210, maxMana: 90, atk: 16, def: 8, speed: 250, crit: 0.06 },
    skills: [
      { name: 'Entaille', desc: 'Large coup de sabre devant soi.', kind: 'slash', cd: 0.5, cost: 0, mult: 1.0, range: 130, arc: 2.0, hits: 1 },
      { name: 'Rempart noir', desc: 'Coup lourd qui donne un bouclier de 18.', kind: 'slash', cd: 2.8, cost: 18, mult: 1.8, range: 150, arc: 2.8, hits: 1, shield: 18 },
      { name: 'Ruée obscure', desc: 'Charge invulnérable qui fauche le trajet.', kind: 'dashStrike', cd: 4.5, cost: 22, mult: 1.55, range: 260, radius: 70 },
      { name: 'Tempête d’ombres', desc: 'Trois ondes autour de soi qui attirent les ennemis.', kind: 'nova', cd: 10.5, cost: 42, mult: 2.7, range: 0, radius: 190, hits: 3 },
    ],
  },
  mei: {
    id: 'mei', name: 'Mei', role: 'Assassin · Burst', color: 0xd04f7e, accent: 0xffd1dd, height: 116,
    base: { maxHp: 180, maxMana: 110, atk: 20, def: 6, speed: 285, crit: 0.14 },
    skills: [
      { name: 'Double taille', desc: 'Deux coups rapides.', kind: 'slash', cd: 0.45, cost: 0, mult: 1.04, range: 115, arc: 1.7, hits: 2 },
      { name: 'Pas fantôme', desc: 'Ruée critique à travers les ennemis.', kind: 'dashStrike', cd: 2.1, cost: 16, mult: 2.2, range: 240, radius: 55, critBonus: 0.16 },
      { name: 'Cercle de lames', desc: 'Lames tournoyantes qui font saigner.', kind: 'nova', cd: 4.8, cost: 22, mult: 1.3, range: 0, radius: 120, hits: 4, status: 'saignement', stacks: 1 },
      { name: 'Exécution rouge', desc: 'Bondit sur la cible ; ×2 sous 30 % PV.', kind: 'execute', cd: 9.2, cost: 39, mult: 3.9, range: 360, radius: 70 },
    ],
  },
  sena: {
    id: 'sena', name: 'Sena', role: 'Mage · Zone', color: 0x6fc2ff, accent: 0xeff6ff, height: 120,
    base: { maxHp: 200, maxMana: 145, atk: 18, def: 7, speed: 260, crit: 0.1 },
    skills: [
      { name: 'Éclat arcanique', desc: 'Projectile magique.', kind: 'bolt', cd: 0.5, cost: 0, mult: 1.3, range: 560, count: 1, speed: 860, pierce: 2 },
      { name: 'Anneau givré', desc: 'Explosion de glace qui ralentit.', kind: 'blast', cd: 2.6, cost: 18, mult: 1.6, range: 320, radius: 150, status: 'givre', stacks: 2 },
      { name: 'Prisme', desc: 'Trois traits perçants.', kind: 'bolt', cd: 4.6, cost: 22, mult: 3.0, range: 560, count: 3, spread: 0.32, speed: 900, pierce: 4 },
      { name: 'Comète lunaire', desc: 'Impact massif après un court délai.', kind: 'comet', cd: 9.5, cost: 44, mult: 3.05, range: 380, radius: 185, delay: 0.55, status: 'givre', stacks: 3 },
    ],
  },
  ren: {
    id: 'ren', name: 'Ren', role: 'Archer · Distance', color: 0xd7b366, accent: 0x99d6ff, height: 118,
    base: { maxHp: 180, maxMana: 105, atk: 19, def: 7, speed: 270, crit: 0.12 },
    skills: [
      { name: 'Flèche rapide', desc: 'Tir basique.', kind: 'bolt', cd: 0.4, cost: 0, mult: 1.0, range: 600, count: 1, speed: 980, pierce: 1 },
      { name: 'Salve perçante', desc: 'Flèche lourde qui traverse tout.', kind: 'bolt', cd: 2.5, cost: 14, mult: 1.85, range: 700, count: 1, speed: 1250, pierce: 8 },
      { name: 'Piège des brumes', desc: 'Piège qui explose et ralentit.', kind: 'trap', cd: 5.3, cost: 20, mult: 1.2, range: 300, radius: 120, status: 'givre', stacks: 1 },
      { name: 'Pluie de flèches', desc: 'Bombardement de zone pendant 1,6 s.', kind: 'rain', cd: 10, cost: 43, mult: 2.65, range: 400, radius: 175, hits: 8, duration: 1.6 },
    ],
  },
};

// ---------------------------------------------------------------- Ennemis

/**
 * Attaque d'un ennemi (toutes télégraphiées au sol, sauf `bolt` dont l'incantation brille) :
 * - leap     : bond sur la position visée (cercle)
 * - cone     : coup en cône devant lui
 * - slam     : percussion en cercle autour de lui
 * - charge   : ligne vers le joueur puis ruée le long de la ligne
 * - bolt     : projectile(s)
 * - line     : couloir enflammé depuis lui vers le joueur
 * - circleAt : cercle sous le joueur
 * - cross    : croix centrée sur le joueur (diagonales sûres)
 * - mark     : marque qui suit le joueur puis se fige et explose
 */
export type EnemyAttackKind = 'leap' | 'cone' | 'slam' | 'charge' | 'bolt' | 'line' | 'circleAt' | 'cross' | 'mark';

export interface EnemyAttack {
  kind: EnemyAttackKind;
  /** Distance au joueur à partir de laquelle l'attaque est lancée. */
  trigger: number;
  windup: number;
  cd: number;
  /** Multiplicateur des dégâts de base de l'ennemi. */
  dmgMul: number;
  radius?: number;
  arc?: number;
  len?: number;
  width?: number;
  count?: number;
  speed?: number;
}

export type EnemyId =
  | 'wolf' | 'raider' | 'shade' | 'brute' | 'shadeElite'
  | 'emberHound' | 'relicGuard' | 'ashMage' | 'ironRam' | 'frostWraith' | 'moonStalker' | 'voidHerald' | 'eclipseReaver';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  tex: string;
  tint: number;
  /** Hauteur d'affichage, rayon de collision. */
  h: number;
  r: number;
  speed: number;
  hp: number;
  /** Dégâts de base (contact et attaques). */
  dmg: number;
  /** chase = fonce ; kite = garde ses distances. */
  move: 'chase' | 'kite';
  attack: EnemyAttack;
  status?: StatusId;
  /** Garde frontale : dégâts reçus de face réduits de 60 %. */
  guard?: boolean;
  /** Se téléporte quand le joueur s'approche. */
  blink?: boolean;
  /** Invoque des serviteurs. */
  summons?: boolean;
  elite?: boolean;
  /** -1 = type de base (toutes régions), sinon région de la variante. */
  region: number;
  minWave: number;
  weight: number;
  /** Thème de vague qui favorise ce type (voir `WAVE_THEMES`). */
  family: 'wolf' | 'raider' | 'shade' | 'brute' | 'elite';
  hint: string;
}

const E = (d: EnemyDef) => d;

export const ENEMY_DEFS: Record<EnemyId, EnemyDef> = {
  // Types de base
  wolf: E({ id: 'wolf', name: 'Traqueur', tex: 'enemy-wolf', tint: 0xffffff, h: 80, r: 20, speed: 165, hp: 30, dmg: 10, move: 'chase', region: -1, minWave: 1, weight: 4, family: 'wolf',
    attack: { kind: 'leap', trigger: 250, windup: 0.5, cd: 2.6, dmgMul: 1.2, radius: 62 }, hint: 'Bond court : esquive au dernier moment.' }),
  raider: E({ id: 'raider', name: 'Pillard', tex: 'enemy-raider', tint: 0xffffff, h: 98, r: 21, speed: 118, hp: 50, dmg: 12, move: 'chase', guard: true, region: -1, minWave: 1, weight: 3, family: 'raider',
    attack: { kind: 'cone', trigger: 120, windup: 0.45, cd: 1.8, dmgMul: 1, radius: 125, arc: 1.6 }, hint: 'Sa garde réduit les dégâts. Frappe dans son dos.' }),
  shade: E({ id: 'shade', name: 'Ombre arcanique', tex: 'enemy-shade', tint: 0xffffff, h: 102, r: 20, speed: 100, hp: 38, dmg: 11, move: 'kite', blink: true, region: -1, minWave: 2, weight: 2.5, family: 'shade',
    attack: { kind: 'bolt', trigger: 460, windup: 0.45, cd: 2.2, dmgMul: 1, count: 1, speed: 330 }, hint: 'Évite son projectile et approche quand elle se téléporte.' }),
  brute: E({ id: 'brute', name: 'Colosse', tex: 'enemy-brute', tint: 0xffffff, h: 128, r: 30, speed: 74, hp: 150, dmg: 24, move: 'chase', region: -1, minWave: 3, weight: 1.2, family: 'brute',
    attack: { kind: 'cone', trigger: 175, windup: 0.85, cd: 3, dmgMul: 1, radius: 200, arc: 1.9 }, hint: 'Cône rouge : passe derrière ou esquive sur le côté.' }),
  shadeElite: E({ id: 'shadeElite', name: 'Veilleur maudit', tex: 'enemy-shadeElite', tint: 0xffffff, h: 152, r: 34, speed: 84, hp: 320, dmg: 26, move: 'kite', elite: true, summons: true, region: -1, minWave: 6, weight: 0.35, family: 'elite',
    attack: { kind: 'mark', trigger: 600, windup: 1.3, cd: 3.4, dmgMul: 1, radius: 115 }, hint: 'Marque les héros : sors du cercle avant qu’il se fige.' }),
  // Variantes régionales
  emberHound: E({ id: 'emberHound', name: 'Limier de suie', tex: 'enemy-wolf', tint: 0xffa070, h: 82, r: 20, speed: 178, hp: 36, dmg: 11, move: 'chase', status: 'burn', region: 0, minWave: 2, weight: 2, family: 'wolf',
    attack: { kind: 'leap', trigger: 270, windup: 0.5, cd: 2.4, dmgMul: 1.1, radius: 70 }, hint: 'Bond marqué : écarte-toi du cercle.' }),
  relicGuard: E({ id: 'relicGuard', name: 'Sentinelle fissurée', tex: 'enemy-raider', tint: 0xe4c393, h: 104, r: 23, speed: 105, hp: 70, dmg: 14, move: 'chase', guard: true, region: 0, minWave: 2, weight: 1.6, family: 'raider',
    attack: { kind: 'slam', trigger: 110, windup: 0.7, cd: 2.6, dmgMul: 1.2, radius: 110 }, hint: 'Protège son approche avant une percussion.' }),
  ashMage: E({ id: 'ashMage', name: 'Pyromancien du Culte', tex: 'enemy-shade', tint: 0xff8a5e, h: 104, r: 20, speed: 98, hp: 46, dmg: 13, move: 'kite', status: 'burn', region: 1, minWave: 4, weight: 1.8, family: 'shade',
    attack: { kind: 'line', trigger: 480, windup: 0.8, cd: 2.8, dmgMul: 1.2, len: 520, width: 62 }, hint: 'Traverse les couloirs enflammés entre les explosions.' }),
  ironRam: E({ id: 'ironRam', name: 'Bélier écarlate', tex: 'enemy-brute', tint: 0xff6a78, h: 132, r: 30, speed: 80, hp: 175, dmg: 26, move: 'chase', region: 1, minWave: 6, weight: 1, family: 'brute',
    attack: { kind: 'charge', trigger: 400, windup: 0.9, cd: 3.2, dmgMul: 0.9, len: 440, width: 74, speed: 900 }, hint: 'Sa ligne de charge est étroite, esquive de côté.' }),
  frostWraith: E({ id: 'frostWraith', name: 'Spectre de givre', tex: 'enemy-shade', tint: 0x8bdefb, h: 106, r: 20, speed: 104, hp: 58, dmg: 14, move: 'kite', blink: true, status: 'frost', region: 2, minWave: 8, weight: 1.8, family: 'shade',
    attack: { kind: 'circleAt', trigger: 480, windup: 0.9, cd: 2.6, dmgMul: 1.1, radius: 105 }, hint: 'Les zones bleues ralentissent brièvement.' }),
  moonStalker: E({ id: 'moonStalker', name: 'Traqueur lunaire', tex: 'enemy-wolf', tint: 0xa4b5fb, h: 84, r: 21, speed: 190, hp: 52, dmg: 13, move: 'chase', status: 'frost', region: 2, minWave: 8, weight: 2, family: 'wolf',
    attack: { kind: 'leap', trigger: 300, windup: 0.45, cd: 2.2, dmgMul: 1.1, radius: 75 }, hint: 'Évite la zone ciblée avant le bond.' }),
  voidHerald: E({ id: 'voidHerald', name: 'Héraut du néant', tex: 'enemy-shadeElite', tint: 0xcf9bff, h: 156, r: 34, speed: 86, hp: 420, dmg: 28, move: 'kite', elite: true, summons: true, status: 'void', region: 3, minWave: 11, weight: 0.45, family: 'elite',
    attack: { kind: 'cross', trigger: 600, windup: 1.0, cd: 3.4, dmgMul: 1, len: 620, width: 72 }, hint: 'Mets-toi dans les diagonales libres de la croix.' }),
  eclipseReaver: E({ id: 'eclipseReaver', name: 'Faucheur de l’éclipse', tex: 'enemy-raider', tint: 0xf2a3cf, h: 104, r: 22, speed: 130, hp: 90, dmg: 18, move: 'chase', guard: true, status: 'void', region: 3, minWave: 11, weight: 1.6, family: 'raider',
    attack: { kind: 'charge', trigger: 360, windup: 0.6, cd: 2.6, dmgMul: 1, len: 380, width: 54, speed: 1050 }, hint: 'Couloir étroit : sors de la trajectoire.' }),
};

// ---------------------------------------------------------------- Boss

export type BossId = 'captain' | 'oracle' | 'arbiter' | 'sovereign';

export interface BossDef {
  id: BossId;
  name: string;
  subtitle: string;
  icon: string;
  tex: string;
  tint: number;
  color: number;
  h: number;
  r: number;
  hp: number;
  dmg: number;
  speed: number;
  phases: [string, string, string];
  desc: string;
  /** Serviteurs invoqués aux changements de phase. */
  adds: EnemyId[];
}

export const BOSS_DEFS: Record<BossId, BossDef> = {
  captain: { id: 'captain', name: 'Le Capitaine Cendrefer', subtitle: 'Gardien des Remparts', icon: '⚔', tex: 'enemy-brute', tint: 0xffae78, color: 0xef955a,
    h: 250, r: 50, hp: 2400, dmg: 30, speed: 96, adds: ['emberHound', 'relicGuard'],
    phases: ['Charge des braises', 'Colonnes de feu', 'Dernière combustion'],
    desc: 'Un chevalier déchu qui quadrille le terrain avec ses flammes. Évite les bandes rouges avant leur détonation.' },
  oracle: { id: 'oracle', name: 'La Matriarche lunaire', subtitle: 'Oracle de la Nécropole', icon: '❄', tex: 'enemy-shade', tint: 0xa8e2ff, color: 0x86cfff,
    h: 260, r: 44, hp: 5600, dmg: 48, speed: 92, adds: ['frostWraith', 'moonStalker'],
    phases: ['Fleur de givre', 'Fissures cristallines', 'Étreinte de la lune'],
    desc: 'Elle gèle le sol sous tes pieds. Les cercles et les lignes de givre ralentissent les héros touchés.' },
  arbiter: { id: 'arbiter', name: 'L’Arbitre de l’Éclipse', subtitle: 'Messager du Néant', icon: '☾', tex: 'enemy-shadeElite', tint: 0xdcaaff, color: 0xcd91ef,
    h: 275, r: 48, hp: 9000, dmg: 64, speed: 110, adds: ['voidHerald', 'eclipseReaver'],
    phases: ['Frappe astrale', 'Croix du néant', 'Dévoration'],
    desc: 'Il draine la magie et se soigne en te frappant. Trouve les angles morts de ses attaques croisées.' },
  sovereign: { id: 'sovereign', name: 'Le Souverain des Ruines', subtitle: 'Roi sans Couronne', icon: '♜', tex: 'enemy-brute', tint: 0xffd890, color: 0xffc878,
    h: 310, r: 62, hp: 14000, dmg: 92, speed: 82, adds: ['ironRam', 'eclipseReaver', 'relicGuard'],
    phases: ['Le Marteau', 'La Terre s’ouvre', 'Jugement des ruines'],
    desc: 'De larges chocs de terre et des lignes de rupture. Les abords du champ de bataille deviennent dangereux.' },
};

/** Seuils de PV (fraction) qui déclenchent les phases 2 et 3, comme le Juge du prototype. */
export const BOSS_PHASE_THRESHOLDS = [0.68, 0.34] as const;

// ---------------------------------------------------------------- Régions et vagues

export const REGIONS = ['Cour des Veilleurs', 'Remparts écarlates', 'Nécropole lunaire', 'Porte de l’Éclipse'] as const;

/** Thème de vague (prototype : `themes[n % 5]`) : famille favorisée ×3. */
export const WAVE_THEMES: Array<{ name: string; family: EnemyDef['family'] | null }> = [
  { name: 'Le Jugement des Ombres', family: null },
  { name: 'Chasse des Loups', family: 'wolf' },
  { name: 'Voile Arcanique', family: 'shade' },
  { name: 'Assaut des Pillards', family: 'raider' },
  { name: 'Jugement des Brutes', family: 'brute' },
];

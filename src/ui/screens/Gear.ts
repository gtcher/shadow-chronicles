import { h } from '../dom';

/**
 * Équipement porté (demande des testeurs : « je ne sais jamais ce que je porte »).
 * Affiché dans la Pause et sur l'écran de fin. Vue pure : les objets arrivent déjà mis en forme.
 */
export interface GearView {
  icon: string;
  slot: string;
  name: string;
  rarity: string;
  color: string;
  /** Lignes de statistiques déjà formatées (« +6 ATQ », « +2 % critique »…). */
  lines: string[];
  power?: { name: string; desc: string };
}

const pct = (v: number, frac: boolean): string => `${(frac ? v * 100 : v).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
const STAT: Record<string, (v: number) => string> = {
  atk: (v) => `+${Math.round(v)} attaque`,
  def: (v) => `+${Math.round(v)} défense`,
  maxHp: (v) => `+${Math.round(v)} vie`,
  maxMana: (v) => `+${Math.round(v)} mana`,
  crit: (v) => `+${pct(v, true)} critique`,
  speed: (v) => `+${pct(v, true)} vitesse`,
  atkPct: (v) => `+${pct(v, false)} attaque`,
  critDamage: (v) => `+${pct(v, false)} dégâts critiques`,
  cooldownPct: (v) => `−${pct(v, false)} recharge`,
  lifesteal: (v) => `${pct(v, false)} vol de vie`,
  goldFind: (v) => `+${pct(v, false)} or trouvé`,
  shardFind: (v) => `+${pct(v, false)} Éclats trouvés`,
  statusDamagePct: (v) => `+${pct(v, false)} dégâts d'altération`,
  patronResonanceBonus: (v) => `+${Math.round(v)} résonance de patron`,
};

/** Statistiques d'un objet (base + affixes, cumulées par stat), en français. */
export function gearLines(stats: Record<string, number>, affixes: Array<{ stat: string; value: number }>): string[] {
  const sum: Record<string, number> = { ...stats };
  for (const a of affixes) sum[a.stat] = (sum[a.stat] ?? 0) + a.value;
  return Object.entries(sum).filter(([, v]) => v).map(([k, v]) => (STAT[k] ? STAT[k](v) : `+${v} ${k}`));
}

export function gearList(gear: GearView[], title = 'Équipement'): HTMLElement {
  return h('div', { class: 'sc-gear' },
    h('h4', {}, title),
    gear.length
      ? h('ul', {}, ...gear.map((g) => h('li', { '--c': g.color },
        h('i', {}, g.icon),
        h('div', {},
          h('b', {}, g.name),
          h('small', { class: 'sc-gear-r' }, `${g.slot} · ${g.rarity}`),
          h('small', {}, g.lines.join(' · ')),
          g.power ? h('small', { class: 'sc-gear-p' }, `✦ ${g.power.name} : ${g.power.desc}`) : null))))
      : h('p', { style: { color: 'var(--mute)' } }, 'Rien d\'équipé : les ennemis lâchent des objets, le meilleur s\'équipe tout seul.'));
}

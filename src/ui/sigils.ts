/**
 * Sceaux des patrons, en SVG inline (couleur = currentColor) : nets à toutes les tailles,
 * légers (aucune image) et animables en CSS. Utilisés par le Codex et le Sanctuaire.
 */
const wrap = (body: string) =>
  `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;

const SIGILS: Record<string, string> = {
  // Veilleurs (Garde) : écu, œil qui veille et créneaux
  veilleurs: wrap(`
    <path d="M32 6 L52 13 V30 C52 44 43 53 32 58 C21 53 12 44 12 30 V13 Z" fill="currentColor" fill-opacity=".14"/>
    <path d="M18 17 H23 V21 H28 V17 H36 V21 H41 V17 H46" stroke-width="2"/>
    <path d="M19 33 Q32 22 45 33 Q32 44 19 33 Z"/>
    <circle cx="32" cy="33" r="4.6" fill="currentColor"/>
    <path d="M32 44 V51" stroke-width="2"/>`),
  // Lune (Givre) : croissant et étoile de givre
  lune: wrap(`
    <path d="M38 8 A24 24 0 1 0 38 56 A19 19 0 1 1 38 8 Z" fill="currentColor" fill-opacity=".16"/>
    <path d="M45 18 V34 M37 26 H53 M39.5 20.5 L50.5 31.5 M50.5 20.5 L39.5 31.5" stroke-width="2"/>
    <circle cx="45" cy="26" r="2.2" fill="currentColor"/>
    <circle cx="48" cy="44" r="1.4" fill="currentColor" stroke="none"/>`),
  // Sang (Saignement) : goutte couronnée d'épines
  sang: wrap(`
    <path d="M32 12 C32 12 15 31 15 41 A17 17 0 0 0 49 41 C49 31 32 12 32 12 Z" fill="currentColor" fill-opacity=".16"/>
    <path d="M23 41 A9 9 0 0 0 30 50" stroke-width="2"/>
    <path d="M18 9 L22 15 L26 6 L30 13 L32 4 L34 13 L38 6 L42 15 L46 9" stroke-width="2"/>
    <circle cx="36" cy="40" r="3" fill="currentColor"/>`),
  // Orage (Choc) : éclair dans un cercle d'étincelles
  orage: wrap(`
    <circle cx="32" cy="32" r="24" stroke-dasharray="3 6" stroke-width="2"/>
    <path d="M36 6 L18 36 H30 L26 58 L46 26 H34 Z" fill="currentColor" fill-opacity=".2"/>
    <path d="M10 22 L4 20 M54 42 L60 44 M12 46 L6 50 M52 18 L58 14" stroke-width="2"/>`),
  // Brume (Poison) : spirale de brume et œil voilé
  brume: wrap(`
    <path d="M32 32 m-3 0 a3 3 0 1 1 6 0 a7 7 0 1 1 -14 0 a11 11 0 1 1 22 0 a15 15 0 1 1 -30 0 a19 19 0 1 1 38 0" stroke-width="2.2"/>
    <path d="M8 50 Q20 44 32 50 T56 50" stroke-width="2" opacity=".7"/>
    <path d="M14 57 Q26 52 38 57 T60 56" stroke-width="1.6" opacity=".45"/>
    <circle cx="32" cy="32" r="2.2" fill="currentColor"/>`),
};

/** SVG du sceau d'un patron (cercle runique par défaut). */
export function sigil(patron: string): string {
  return SIGILS[patron] ?? wrap('<circle cx="32" cy="32" r="20"/><path d="M32 14 V50 M14 32 H50"/>');
}

/** Couronne runique graduée (tourne lentement derrière un sceau). */
export const RUNE_RING = `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" fill="none" stroke="currentColor">
  <circle cx="50" cy="50" r="47" stroke-width=".8" opacity=".55"/>
  <circle cx="50" cy="50" r="41" stroke-width=".5" opacity=".35"/>
  ${Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2, r0 = i % 3 ? 43 : 41, r1 = 47;
    const p = (r: number) => `${(50 + Math.cos(a) * r).toFixed(2)} ${(50 + Math.sin(a) * r).toFixed(2)}`;
    return `<path d="M${p(r0)} L${p(r1)}" stroke-width="${i % 3 ? 0.6 : 1.2}"/>`;
  }).join('')}
  ${[0, 1, 2, 3].map((i) => { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; return `<circle cx="${(50 + Math.cos(a) * 44).toFixed(2)}" cy="${(50 + Math.sin(a) * 44).toFixed(2)}" r="1.8" fill="currentColor" stroke="none"/>`; }).join('')}
</svg>`;

import { h } from '../dom';
import type { SettingsStore, Settings, ColorBlind } from '../settings';
import type { SaveTools } from '../saveBridge';
import { saveSection } from './SaveSection';

/** Réglages : accessibilité, confort, commandes tactiles, son. Tout est appliqué en direct. */
export function settingsScreen(store: SettingsStore, onClose: () => void, save?: SaveTools): HTMLElement {
  const s = store.get();
  const sw = <K extends keyof Settings>(key: K, label: string, hint?: string) =>
    h('label', { class: 'sc-field' }, h('span', {}, label, hint ? h('small', {}, hint) : null),
      h('input', { type: 'checkbox', class: 'sc-switch', 'data-key': key, checked: Boolean(s[key]), onchange: (e: Event) => store.set(key, (e.target as HTMLInputElement).checked as Settings[K]) }));
  const range = <K extends keyof Settings>(key: K, label: string, min: number, max: number, step: number, show: (v: number) => string) => {
    const out = h('small', {}, show(s[key] as number));
    return h('label', { class: 'sc-field' }, h('span', {}, label, out),
      h('input', { type: 'range', 'data-key': key, min, max, step, value: s[key] as number,
        oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); out.textContent = show(v); store.set(key, v as Settings[K]); } }));
  };
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  return h('section', { class: 'sc-screen', role: 'dialog', 'aria-label': 'Réglages' },
    h('div', { class: 'sc-settings sc-panel' },
      h('h2', { class: 'sc-title' }, 'Réglages'),
      h('fieldset', {}, h('legend', {}, 'Lisibilité'),
        range('textScale', 'Taille du texte', 0.9, 1.4, 0.05, pct),
        sw('highContrast', 'Contraste élevé', 'Panneaux opaques, contours blancs'),
        h('label', { class: 'sc-field' }, h('span', {}, 'Mode daltonien', h('small', {}, 'Recolore raretés et barres, ajoute des symboles')),
          h('select', { onchange: (e: Event) => store.set('colorBlind', (e.target as HTMLSelectElement).value as ColorBlind) },
            ...([['none', 'Aucun'], ['protan', 'Protanopie'], ['deutan', 'Deutéranopie'], ['tritan', 'Tritanopie']] as const)
              .map(([v, l]) => h('option', { value: v, selected: s.colorBlind === v }, l)))),
        sw('damageNumbers', 'Chiffres de dégâts')),
      h('fieldset', {}, h('legend', {}, 'Confort visuel'),
        h('label', { class: 'sc-field' }, h('span', {}, 'Mode confort', h('small', {}, 'Coupe les flashs, calme secousses, lueurs et textes flottants')),
          h('input', { type: 'checkbox', class: 'sc-switch', checked: s.comfort, onchange: (e: Event) => {
            store.setComfort((e.target as HTMLInputElement).checked);
            // Flashs et secousses ont changé avec le mode : on met leurs contrôles à jour sur place.
            const root = (e.target as HTMLElement).closest('.sc-settings'), now = store.get();
            const fl = root?.querySelector<HTMLInputElement>('[data-key="flashes"]'); if (fl) fl.checked = now.flashes;
            const sh = root?.querySelector<HTMLInputElement>('[data-key="shake"]');
            if (sh) { sh.value = String(now.shake); const out = sh.previousElementSibling?.querySelector('small'); if (out) out.textContent = pct(now.shake); }
          } })),
        sw('reduceMotion', 'Réduire les animations', 'Interface plus calme'),
        range('shake', 'Secousses de caméra', 0, 1, 0.1, pct),
        sw('flashes', 'Flashs plein écran', 'Dégâts, éclairs, légendaires')),
      h('fieldset', {}, h('legend', {}, 'Commandes tactiles'),
        range('touchScale', 'Taille des boutons', 0.8, 1.3, 0.05, pct),
        sw('leftHanded', 'Mode gaucher', 'Joystick à droite, techniques à gauche'),
        sw('autoAim', 'Visée automatique', 'Vise l\'ennemi le plus proche'),
        sw('vibration', 'Vibrations')),
      h('fieldset', {}, h('legend', {}, 'Son'),
        sw('muted', 'Couper le son'),
        range('masterVolume', 'Volume général', 0, 1, 0.05, pct),
        range('musicVolume', 'Musique', 0, 1, 0.05, pct),
        range('sfxVolume', 'Effets', 0, 1, 0.05, pct),
        range('ambienceVolume', 'Ambiance', 0, 1, 0.05, pct)),
      save ? saveSection(save) : null,
      h('div', { class: 'sc-row', style: { marginTop: '18px' } },
        h('button', { class: 'sc-btn sc-ghost', onclick: () => { store.reset(); onClose(); } }, 'Réinitialiser'),
        h('button', { class: 'sc-btn sc-ghost', onclick: () => { store.set('tutorialDone', false); } }, 'Revoir le tutoriel'),
        h('button', { class: 'sc-btn sc-primary', onclick: onClose, 'data-autofocus': true }, 'Fermer'))));
}

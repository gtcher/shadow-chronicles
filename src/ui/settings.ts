/**
 * Réglages joueur (accessibilité, confort, son) — persistés dans localStorage.
 * Lus par l'UI (classes CSS) et exposés aux autres agents :
 *   - Rendu/caméra : `settings.get().shake` (0..1) et `flashes`
 *   - Audio : `masterVolume`, `musicVolume`, `sfxVolume`, `ambienceVolume`, `muted` (branchés dans src/main.ts)
 *   - Gameplay : `autoAim`, `damageNumbers`
 * L'agent Sauvegarde peut reprendre la clé `STORAGE_KEY` dans le profil v2.
 */
export type ColorBlind = 'none' | 'protan' | 'deutan' | 'tritan';

export interface Settings {
  textScale: number;       // 0.9 .. 1.4
  highContrast: boolean;
  colorBlind: ColorBlind;
  reduceMotion: boolean;
  shake: number;           // 0 .. 1 (multiplie camera.shake)
  flashes: boolean;        // flash rouge de dégâts, éclairs plein écran
  damageNumbers: boolean;
  vibration: boolean;
  touchScale: number;      // 0.8 .. 1.3
  leftHanded: boolean;     // joystick à droite, boutons à gauche
  autoAim: boolean;        // visée automatique en tactile
  masterVolume: number;    // 0 .. 1
  musicVolume: number;     // 0 .. 1
  sfxVolume: number;       // 0 .. 1 (bruitages et sons d'interface)
  ambienceVolume: number;  // 0 .. 1
  muted: boolean;
  tutorialDone: boolean;
  /** Guide du Sanctuaire vu (première visite). */
  sanctuaryGuideDone: boolean;
  /** Confort visuel : moins de flashs, de secousses, de lueurs et de textes flottants (retours des testeurs). */
  comfort: boolean;
  /** Le choix « Confort visuel » a été proposé au premier lancement. */
  comfortAsked: boolean;
  /** Effet cinéma : étalonnage couleur, vignette et grain propres à chaque chapitre. */
  cinematic: boolean;
  /** Mode Découverte : ennemis plus doux pour apprendre (pas de Pactes). */
  discovery: boolean;
}

export const STORAGE_KEY = 'sc-settings-v1';

const prefersReduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const prefersContrast = typeof matchMedia !== 'undefined' && matchMedia('(prefers-contrast: more)').matches;

export const DEFAULT_SETTINGS: Settings = {
  textScale: 1, highContrast: prefersContrast, colorBlind: 'none', reduceMotion: prefersReduced,
  shake: prefersReduced ? 0.3 : 1, flashes: !prefersReduced, damageNumbers: true, vibration: true,
  touchScale: 1, leftHanded: false, autoAim: true, masterVolume: 0.8, musicVolume: 0.7, sfxVolume: 0.8, ambienceVolume: 0.5, muted: false, tutorialDone: false, sanctuaryGuideDone: false,
  comfort: prefersReduced, comfortAsked: false, discovery: false, cinematic: true,
};

type Listener = (s: Readonly<Settings>, changed: keyof Settings | null) => void;

export class SettingsStore {
  private s: Settings;
  private listeners = new Set<Listener>();

  constructor() {
    let saved: Partial<Settings> = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { /* stockage indisponible */ }
    this.s = { ...DEFAULT_SETTINGS, ...saved };
  }

  get(): Readonly<Settings> { return this.s; }

  /** Active / coupe le confort visuel et règle d'un coup flashs et secousses. */
  setComfort(on: boolean): void {
    this.set('comfortAsked', true);
    this.set('comfort', on);
    this.set('flashes', !on);
    this.set('shake', on ? Math.min(this.s.shake, 0.3) : 1);
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    if (this.s[key] === value) return;
    this.s = { ...this.s, [key]: value };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.s)); } catch { /* ignore */ }
    for (const l of this.listeners) l(this.s, key);
  }

  reset(): void {
    this.s = { ...DEFAULT_SETTINGS, tutorialDone: this.s.tutorialDone, sanctuaryGuideDone: this.s.sanctuaryGuideDone, comfortAsked: this.s.comfortAsked };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.s)); } catch { /* ignore */ }
    for (const l of this.listeners) l(this.s, null);
  }

  onChange(fn: Listener): () => void { this.listeners.add(fn); fn(this.s, null); return () => this.listeners.delete(fn); }

  /** Applique les réglages visuels à la racine de l'UI. */
  applyTo(root: HTMLElement): void {
    const s = this.s;
    root.style.setProperty('--fs', String(s.textScale));
    root.style.setProperty('--ctl', String(s.touchScale));
    root.style.setProperty('--anim', s.reduceMotion ? '0' : '1');
    root.classList.toggle('sc-contrast', s.highContrast);
    root.classList.toggle('sc-reduce', s.reduceMotion);
    root.classList.toggle('sc-lefty', s.leftHanded);
    for (const c of ['protan', 'deutan', 'tritan']) root.classList.toggle(`sc-cb-${c}`, s.colorBlind === c);
  }

  vibrate(pattern: number | number[]): void {
    if (this.s.vibration && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  }
}

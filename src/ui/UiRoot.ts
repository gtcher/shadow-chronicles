import './ui.css';
import type { Game } from '@engine';
import { h, focusTrap } from './dom';
import { Hud } from './Hud';
import { TouchControls } from './TouchControls';
import { Tutorial } from './Tutorial';
import { SettingsStore } from './settings';
import { titleScreen, type TitleOptions } from './screens/Title';
import { pauseScreen, type PauseOptions } from './screens/Pause';
import { blessingOfferScreen, type OfferOptions, type OfferChoice } from './screens/BlessingOffer';
import { sanctuaryScreen, type SanctuaryOptions } from './screens/Sanctuary';
import { sanctuaryGuide } from './screens/SanctuaryGuide';
import { runEndScreen, type RunEndOptions } from './screens/RunEnd';
import { settingsScreen } from './screens/SettingsScreen';
import type { SaveTools } from './saveBridge';

type Dev = 'keyboard' | 'mouse' | 'gamepad' | 'touch';

/**
 * Interface complète posée en DOM par-dessus le canvas.
 *
 *   const ui = mountUI(game);
 *   ui.hud.setHero('mei', (k) => game.assets.url(k));
 *   ui.hud.setVitals({ hp, max, shield, mana, manaMax });
 *   const choice = await ui.offerBlessings({ wave, choices, owned, rerolls, onReroll });
 *
 * L'UI gère la pause (Échap / P / Start) : elle met `game.pauseOnAction = false`.
 * Les écrans se superposent (pile) ; ouvrir un écran met le jeu en pause et estompe le HUD.
 */
export class UiRoot {
  readonly root: HTMLElement;
  readonly hud = new Hud();
  readonly touch = new TouchControls();
  readonly settings = new SettingsStore();
  readonly tutorial: Tutorial;
  /** Fournit l'état affiché par le menu pause (le gameplay le renseigne). */
  pauseInfo: () => Omit<PauseOptions, 'onResume' | 'onSettings' | 'onQuit'> = () => ({ hero: 'taro', owned: [], wave: 1 });
  onQuitRun: () => void = () => {};
  /** Outils de sauvegarde (export / import), renseignés par connectSave(). */
  saveTools?: SaveTools;
  /** Une run est en cours : la pause est autorisée. */
  inRun = false;

  private sound: (id: string) => void = () => {};
  private screens: Array<{ el: HTMLElement; release: () => void; pauses: boolean }> = [];
  private device: Dev = 'keyboard';
  private lastPadStart = false;
  private raf = 0;
  private lastT = performance.now();

  constructor(private readonly game: Game) {
    this.root = h('div', { id: 'sc-ui', lang: 'fr' });
    this.tutorial = new Tutorial((sel) => this.root.querySelector(sel), () => this.touch.restPosition());
    this.root.append(this.hud.el, this.touch.el, this.tutorial.el);
    document.body.append(this.root);
    this.loadFonts();

    game.pauseOnAction = false;
    const input = game.input;
    this.touch.onMove = (x, y) => input.setVirtualMove(x, y);
    this.touch.onFirstUse = () => this.tutorial.notify('move', 1.2);
    this.hud.onSkillDown = (i) => {
      if (i === 0) input.setVirtualHeld('attack', true);
      else if (i === 4) input.trigger('dash');
      else input.trigger(`skill${i}` as 'skill1');
      this.settings.vibrate(8);
    };
    this.hud.onSkillUp = (i) => { if (i === 0) input.setVirtualHeld('attack', false); };
    this.hud.onPause = () => this.togglePause();
    this.tutorial.onDone = () => this.settings.set('tutorialDone', true);

    // Sons d'interface (bus « ui », réglé par le curseur Effets).
    const sound = (id: string) => (game.events as unknown as { emit: (e: string, p: unknown) => void }).emit('ui:sound', { id });
    this.root.addEventListener('click', (e) => { if ((e.target as Element).closest?.('button, .sc-btn')) sound('ui_click'); });
    this.sound = sound;

    // Réglages appliqués en direct.
    this.settings.onChange((s) => {
      this.settings.applyTo(this.root);
      this.touch.setScale(s.touchScale);
      this.touch.setLeftHanded(s.leftHanded);
    });
    // Secousse de caméra modulée par le réglage (sans toucher au moteur).
    const cam = game.camera;
    const shake = cam.shake.bind(cam);
    cam.shake = (a: number) => shake(a * this.settings.get().shake);

    // Détection du périphérique : affiche les commandes tactiles seulement si on touche l'écran.
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.setDevice(coarse ? 'touch' : 'keyboard');
    addEventListener('pointerdown', (e) => this.setDevice(e.pointerType === 'touch' ? 'touch' : 'mouse'), true);
    addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' && e.code !== 'KeyP') this.setDevice('keyboard');
      if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) { e.preventDefault(); this.back(); }
    });
    this.loop();
  }

  // ── Écrans ────────────────────────────────────────────────────
  get screenOpen(): boolean { return this.screens.length > 0; }

  /** Empile un écran. `pauses` : met le jeu en pause tant qu'il est ouvert. */
  push(el: HTMLElement, pauses = true): void {
    this.screens.at(-1)?.el.setAttribute('hidden', '');
    this.root.append(el);
    const release = focusTrap(el);
    this.screens.push({ el, release, pauses });
    this.syncPause();
    this.sound('ui_open');
    requestAnimationFrame(() => (el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true }));
  }

  /** Ferme l'écran du dessus. */
  pop(): void {
    const s = this.screens.pop();
    if (!s) return;
    s.release(); (s.el as HTMLElement & { cleanup?: () => void }).cleanup?.(); s.el.remove();
    this.screens.at(-1)?.el.removeAttribute('hidden');
    this.syncPause();
  }

  closeAll(): void { while (this.screens.length) this.pop(); }

  /** Remplace tous les écrans par un seul. */
  show(el: HTMLElement, pauses = true): void { this.closeAll(); this.push(el, pauses); }

  showTitle(o: TitleOptions): void { this.inRun = false; this.show(titleScreen(o)); }
  showSanctuary(o: SanctuaryOptions): void {
    this.inRun = false;
    const help = () => {
      this.settings.set('sanctuaryGuideSeen', true);
      this.push(sanctuaryGuide(o.profile, () => this.pop(), o.assetUrl('shrine-ruins')));
    };
    this.show(sanctuaryScreen({ onHelp: help, ...o }));
    // Première visite : le guide s'ouvre tout seul (une seule fois, puis bouton « ? Guide »).
    if (!this.settings.get().sanctuaryGuideSeen) help();
  }
  showRunEnd(o: RunEndOptions): void { this.inRun = false; this.show(runEndScreen(o)); }
  openSettings(): void { this.push(settingsScreen(this.settings, () => this.pop(), this.saveTools)); }

  /** Offre de bénédictions : met en pause et résout avec la carte choisie. */
  offerBlessings(o: Omit<OfferOptions, 'onPick'>): Promise<OfferChoice> {
    return new Promise((resolve) => {
      const open = (opts: Omit<OfferOptions, 'onPick'>) => {
        const el = blessingOfferScreen({ ...opts, onPick: (c) => { this.pop(); resolve(c); },
          onReroll: opts.onReroll ? () => { this.pop(); opts.onReroll!(); } : undefined });
        this.push(el);
        this.tutorial.notify('offer');
      };
      open(o);
    });
  }

  togglePause(): void {
    if (!this.inRun) return;
    if (this.screens.length) { this.back(); return; }
    this.push(pauseScreen({ ...this.pauseInfo(), onResume: () => this.pop(), onSettings: () => this.openSettings(),
      onQuit: () => { this.closeAll(); this.onQuitRun(); } }));
  }

  /** Échap / Start / bouton retour : ferme l'écran du dessus ou ouvre la pause. */
  private back(): void {
    const top = this.screens.at(-1);
    if (!top) { this.togglePause(); return; }
    // Les écrans de décision (offre, fin de run, titre) ne se ferment pas par Échap.
    const label = top.el.getAttribute('aria-label') ?? '';
    if (label === 'Pause' || label === 'Réglages' || label === 'Guide du Sanctuaire') this.pop();
  }

  private syncPause(): void {
    const pause = this.screens.some((s) => s.pauses);
    this.game.setPaused(pause);
    this.hud.dim(this.screens.length > 0);
    // Tout le calque du tutoriel (panneau, anneaux, main), pas seulement le panneau du moment :
    // un panneau recréé pendant qu'un écran est ouvert resterait sinon visible par-dessus.
    this.tutorial.el.toggleAttribute('hidden', this.screens.length > 0);
    if (pause) { this.game.input.setVirtualMove(0, 0); this.game.input.setVirtualHeld('attack', false); }
  }

  private setDevice(d: Dev): void {
    if (d === this.device && this.root.classList.contains(d === 'touch' ? 'sc-is-touch' : 'sc-is-desk')) return;
    this.device = d;
    this.root.classList.toggle('sc-is-touch', d === 'touch');
    this.root.classList.toggle('sc-is-desk', d !== 'touch');
    this.touch.el.hidden = d !== 'touch';
    this.hud.setDevice(d);
    this.tutorial.setDevice(d);
  }

  get currentDevice(): Dev { return this.device; }

  private loop = (): void => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    if (!this.game.paused) this.hud.tick(dt);
    // Manette : Start = pause, et changement d'icônes.
    const pads = navigator.getGamepads?.() ?? [];
    const gp = [...pads].find((p) => p && p.connected);
    if (gp) {
      const start = gp.buttons[9]?.pressed ?? false;
      if (start && !this.lastPadStart) this.back();
      this.lastPadStart = start;
      if (this.game.input.lastDevice === 'gamepad' && this.device !== 'gamepad') this.setDevice('gamepad');
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private loadFonts(): void {
    if (document.querySelector('link[data-sc-fonts]')) return;
    document.head.append(h('link', { rel: 'stylesheet', 'data-sc-fonts': '', href: 'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Alegreya+Sans:wght@400;500;700&display=swap' }));
  }

  destroy(): void { cancelAnimationFrame(this.raf); this.closeAll(); this.root.remove(); }
}

export function mountUI(game: Game): UiRoot { return new UiRoot(game); }

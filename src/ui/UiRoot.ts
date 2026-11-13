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
import { runEndScreen, type RunEndOptions } from './screens/RunEnd';
import { settingsScreen } from './screens/SettingsScreen';
import { codexScreen, type CodexData, type CodexTab } from './screens/Codex';
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
/** Durée du fondu d'entrée des écrans (ui.css, animation sc-fade). */
const SCREEN_FADE_MS = 280;
/** Une fois le fondu joué, l'écran ne le rejoue plus quand il réapparaît (retour depuis un sous-écran). */
function settle(el: HTMLElement): void { setTimeout(() => el.classList.add('sc-settled'), SCREEN_FADE_MS); }

export class UiRoot {
  readonly root: HTMLElement;
  readonly hud = new Hud();
  readonly touch = new TouchControls();
  readonly settings = new SettingsStore();
  readonly tutorial: Tutorial;
  /** Fournit l'état affiché par le menu pause (le gameplay le renseigne). */
  pauseInfo: () => Omit<PauseOptions, 'onResume' | 'onSettings' | 'onQuit'> = () => ({ hero: 'taro', owned: [], wave: 1 });
  onQuitRun: () => void = () => {};
  /** Découvertes affichées par le Codex (le jeu le renseigne depuis la sauvegarde). */
  codexInfo?: () => CodexData;
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
      // P ne doit pas fermer l'écran quand on tape dans un champ (e-mail, pseudo du classement en ligne).
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.code === 'Escape' || (e.code === 'KeyP' && !typing)) && !e.repeat) { e.preventDefault(); this.back(); }
    });
    this.loop();
  }

  // ── Écrans ────────────────────────────────────────────────────
  get screenOpen(): boolean { return this.screens.length > 0; }

  /**
   * Empile un écran. `pauses` : met le jeu en pause tant qu'il est ouvert.
   * L'écran du dessous reste affiché le temps du fondu d'entrée (sinon on voyait le jeu derrière),
   * puis il est masqué.
   */
  push(el: HTMLElement, pauses = true): void {
    const prev = this.screens.at(-1)?.el;
    this.root.append(el);
    settle(el);
    if (prev) setTimeout(() => { if (this.screens.at(-1)?.el !== prev) prev.setAttribute('hidden', ''); }, SCREEN_FADE_MS);
    const release = focusTrap(el);
    this.screens.push({ el, release, pauses });
    this.syncPause();
    this.sound('ui_open');
    requestAnimationFrame(() => (el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true }));
  }

  /** Ferme l'écran du dessus (celui du dessous, déjà « posé », réapparaît sans refaire son fondu). */
  pop(): void {
    const s = this.screens.pop();
    if (!s) return;
    this.drop(s);
    s.el.remove();
    this.screens.at(-1)?.el.removeAttribute('hidden');
    this.syncPause();
  }

  closeAll(): void { while (this.screens.length) this.pop(); }

  /**
   * Remplace tous les écrans par un seul : fondu enchaîné, l'ancien écran reste visible
   * (inerte) sous le nouveau pendant son apparition, puis il est retiré.
   */
  show(el: HTMLElement, pauses = true): void {
    const old = this.screens.splice(0);
    for (const s of old) this.drop(s);
    const top = old.at(-1)?.el;
    for (const s of old) if (s.el !== top) s.el.remove();
    if (top) {
      top.classList.add('sc-leaving'); top.setAttribute('aria-hidden', 'true'); top.inert = true;
      setTimeout(() => top.remove(), SCREEN_FADE_MS);
    }
    this.push(el, pauses);
  }

  private drop(s: { el: HTMLElement; release: () => void }): void {
    s.release(); (s.el as HTMLElement & { cleanup?: () => void }).cleanup?.();
  }

  showTitle(o: TitleOptions): void { this.inRun = false; this.show(titleScreen(o)); }
  showSanctuary(o: SanctuaryOptions): void { this.inRun = false; this.show(sanctuaryScreen(o)); }
  showRunEnd(o: RunEndOptions): void { this.inRun = false; this.show(runEndScreen(o)); }
  /** Codex des Brumes, par-dessus l'écran courant (titre, Sanctuaire ou pause). */
  openCodex(tab?: CodexTab): void {
    if (!this.codexInfo) return;
    this.push(codexScreen({ ...this.codexInfo(), tab, onBack: () => this.pop() }));
  }
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
      onCodex: this.codexInfo ? () => this.openCodex() : undefined,
      comfort: { on: this.settings.get().comfort, toggle: () => this.settings.setComfort(!this.settings.get().comfort) },
      onQuit: () => { this.closeAll(); this.onQuitRun(); } }));
  }

  /** Échap / Start / bouton retour : ferme l'écran du dessus ou ouvre la pause. */
  private back(): void {
    const top = this.screens.at(-1);
    if (!top) { this.togglePause(); return; }
    // Les écrans de décision (offre, fin de run, titre) ne se ferment pas par Échap.
    const label = top.el.getAttribute('aria-label') ?? '';
    if (label === 'Pause' || label === 'Réglages' || label === 'Codex des Brumes') this.pop();
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

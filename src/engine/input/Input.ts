import { DEFAULT_BINDINGS, type Action, type Bindings } from './bindings';

export type Device = 'keyboard' | 'mouse' | 'gamepad' | 'touch';

/**
 * Gestion unifiée clavier / souris / tactile / manette, par actions.
 *
 * Utilisation côté gameplay (dans un système, à chaque pas fixe) :
 *   input.move        → vecteur de déplacement normalisé (longueur ≤ 1)
 *   input.held('attack'), input.pressed('dash'), input.released('skill1')
 *   input.aim         → direction de visée (souris relative au joueur, ou stick droit)
 *
 * `poll()` doit être appelé une fois au DÉBUT de chaque pas fixe (fait par `Game`) :
 * ainsi `pressed()` est vrai pendant exactement un pas, quel que soit le framerate.
 */
export class Input {
  bindings: Bindings;
  /** Zone morte radiale des sticks. */
  deadZone = 0.22;
  /** Dernier périphérique utilisé (pour afficher les bonnes icônes de touches). */
  lastDevice: Device = 'keyboard';

  /** Vecteur de déplacement du pas courant (longueur ≤ 1). */
  readonly move = { x: 0, y: 0 };
  /** Direction de visée unitaire (0,0 si aucune). Calculée via `updateAim`. */
  readonly aim = { x: 0, y: 0 };
  /** Position du pointeur en pixels CSS dans le canvas. */
  readonly pointer = { x: 0, y: 0, inside: false };

  private keysDown = new Set<string>();
  private mouseDown = new Set<number>();
  private padDown = new Set<number>();
  // Fronts accumulés entre deux pas (événements DOM asynchrones).
  private edgeDown = new Set<string>();
  private actionHeld = new Set<Action>();
  private actionPressed = new Set<Action>();
  private actionReleased = new Set<Action>();
  private padStick = { x: 0, y: 0 };
  private padAim = { x: 0, y: 0 };
  private virtualMove = { x: 0, y: 0 };
  private virtualHeld = new Set<Action>();
  private cleanup: Array<() => void> = [];

  constructor(private readonly el: HTMLElement, bindings: Bindings = DEFAULT_BINDINGS) {
    this.bindings = structuredClone(bindings);
    this.attach();
  }

  held(a: Action): boolean { return this.actionHeld.has(a); }
  pressed(a: Action): boolean { return this.actionPressed.has(a); }
  released(a: Action): boolean { return this.actionReleased.has(a); }

  /** Pour un joystick virtuel tactile (agent UI/mobile) : vecteur -1..1. */
  setVirtualMove(x: number, y: number): void { this.virtualMove.x = x; this.virtualMove.y = y; this.lastDevice = 'touch'; }

  /** Maintient (ou relâche) une action depuis un bouton tactile (ex. « attack » tant que le doigt est posé). */
  setVirtualHeld(a: Action, on: boolean): void { if (on) { this.virtualHeld.add(a); this.lastDevice = 'touch'; } else this.virtualHeld.delete(a); }

  /** Déclenche une action depuis un bouton d'interface (tactile, menus). */
  trigger(a: Action): void { this.edgeDown.add(`act:${a}`); }

  /** À appeler une fois au début de chaque pas de simulation. */
  poll(): void {
    this.pollGamepad();
    const prevHeld = new Set(this.actionHeld);
    this.actionHeld.clear();
    this.actionPressed.clear();
    this.actionReleased.clear();

    for (const a of Object.keys(this.bindings) as Action[]) {
      const b = this.bindings[a];
      const held = b.keys.some((k) => this.keysDown.has(k))
        || (b.mouse?.some((m) => this.mouseDown.has(m)) ?? false)
        || (b.pad?.some((p) => this.padDown.has(p)) ?? false)
        || this.virtualHeld.has(a);
      // Un appui très court (down+up entre deux pas) compte quand même comme « pressed ».
      const tapped = b.keys.some((k) => this.edgeDown.has(`k:${k}`))
        || (b.mouse?.some((m) => this.edgeDown.has(`m:${m}`)) ?? false)
        || this.edgeDown.has(`act:${a}`);
      if (held) this.actionHeld.add(a);
      if ((held || tapped) && !prevHeld.has(a)) this.actionPressed.add(a);
      if (!held && prevHeld.has(a)) this.actionReleased.add(a);
      if (tapped && !held && !prevHeld.has(a)) this.actionReleased.add(a);
    }
    this.edgeDown.clear();

    // Déplacement : clavier/croix + stick + joystick virtuel, normalisé.
    let mx = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let my = (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0);
    mx += this.padStick.x + this.virtualMove.x;
    my += this.padStick.y + this.virtualMove.y;
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    this.move.x = mx; this.move.y = my;
  }

  /**
   * Met à jour `aim`. `toWorld` convertit l'écran en monde (caméra), `from` = position du joueur.
   * Priorité : stick droit s'il est incliné, sinon la souris si elle a servi en dernier,
   * sinon la direction de déplacement.
   */
  updateAim(from: { x: number; y: number }, toWorld: (sx: number, sy: number) => { x: number; y: number }): void {
    let ax = 0, ay = 0;
    if (Math.hypot(this.padAim.x, this.padAim.y) > 0) { ax = this.padAim.x; ay = this.padAim.y; }
    else if (this.lastDevice === 'mouse' || this.lastDevice === 'keyboard') {
      if (this.pointer.inside) { const w = toWorld(this.pointer.x, this.pointer.y); ax = w.x - from.x; ay = w.y - from.y; }
    }
    if (ax === 0 && ay === 0) { ax = this.move.x; ay = this.move.y; }
    const l = Math.hypot(ax, ay);
    if (l > 1e-6) { this.aim.x = ax / l; this.aim.y = ay / l; }
  }

  destroy(): void { for (const f of this.cleanup) f(); this.cleanup = []; }

  private on<K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn as EventListener, opts);
    this.cleanup.push(() => target.removeEventListener(type, fn as EventListener, opts));
  }

  private attach(): void {
    const gameKeys = () => new Set(Object.values(this.bindings).flatMap((b) => b.keys));
    this.on(window, 'keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (gameKeys().has(e.code)) e.preventDefault(); // évite le défilement (espace, flèches, Tab)
      if (!e.repeat) { this.keysDown.add(e.code); this.edgeDown.add(`k:${e.code}`); }
      this.lastDevice = 'keyboard';
    });
    this.on(window, 'keyup', (e) => { this.keysDown.delete(e.code); });
    this.on(window, 'blur', () => { this.keysDown.clear(); this.mouseDown.clear(); });

    const setPointer = (e: PointerEvent) => {
      const r = this.el.getBoundingClientRect();
      this.pointer.x = e.clientX - r.left; this.pointer.y = e.clientY - r.top;
      this.pointer.inside = true;
    };
    this.on(this.el, 'pointermove', (e) => { setPointer(e); if (e.pointerType === 'mouse') this.lastDevice = 'mouse'; });
    this.on(this.el, 'pointerdown', (e) => {
      setPointer(e);
      this.lastDevice = e.pointerType === 'touch' ? 'touch' : 'mouse';
      if (e.pointerType === 'mouse') { this.mouseDown.add(e.button); this.edgeDown.add(`m:${e.button}`); }
    });
    this.on(window, 'pointerup', (e) => { this.mouseDown.delete(e.button); });
    this.on(this.el, 'pointerleave', () => { this.pointer.inside = false; });
    this.on(this.el, 'contextmenu', (e) => e.preventDefault());
  }

  private pollGamepad(): void {
    this.padDown.clear();
    this.padStick.x = this.padStick.y = 0;
    this.padAim.x = this.padAim.y = 0;
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const stick = (ix: number, iy: number, out: { x: number; y: number }) => {
        const x = gp.axes[ix] ?? 0, y = gp.axes[iy] ?? 0;
        const m = Math.hypot(x, y);
        if (m < this.deadZone) return false;
        // Remise à l'échelle après la zone morte : réponse progressive dès la sortie.
        const k = Math.min(1, (m - this.deadZone) / (1 - this.deadZone)) / m;
        out.x = x * k; out.y = y * k;
        return true;
      };
      let used = stick(0, 1, this.padStick);
      used = stick(2, 3, this.padAim) || used;
      gp.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.5) { this.padDown.add(i); used = true; } });
      if (used) this.lastDevice = 'gamepad';
      break; // une seule manette (jeu solo)
    }
  }
}

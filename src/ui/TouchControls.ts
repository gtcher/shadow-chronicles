import { h } from './dom';

/**
 * Joystick virtuel « flottant » : il apparaît là où le pouce se pose dans la moitié gauche
 * de l'écran (droite si gaucher), et revient à sa place de repos au relâchement.
 * Les boutons (frappe à maintenir, esquive, techniques) sont ceux du HUD, rangés en arc.
 */
export class TouchControls {
  readonly el: HTMLElement;
  /** Vecteur -1..1 → `input.setVirtualMove`. */
  onMove: (x: number, y: number) => void = () => {};
  /** Premier mouvement du joystick (tutoriel). */
  onFirstUse: () => void = () => {};

  private zone: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private pointer = -1;
  private origin = { x: 0, y: 0 };
  private radius = 52;
  private used = false;
  private lefty = false;

  constructor() {
    this.knob = h('i');
    this.stick = h('div', { class: 'sc-stick', 'aria-hidden': 'true' }, this.knob);
    this.zone = h('div', { class: 'sc-touch-zone', 'aria-label': 'Zone du joystick' });
    this.el = h('div', { class: 'sc-touch' }, this.zone, this.stick);
    this.zone.addEventListener('pointerdown', (e) => this.down(e));
    this.zone.addEventListener('pointermove', (e) => this.moveTo(e));
    this.zone.addEventListener('pointerup', (e) => this.up(e));
    this.zone.addEventListener('pointercancel', (e) => this.up(e));
    this.setLeftHanded(false);
    addEventListener('resize', () => this.rest());
  }

  setLeftHanded(on: boolean): void {
    this.lefty = on;
    this.zone.style.left = on ? '50%' : '0';
    this.rest();
  }

  setScale(k: number): void { this.radius = 52 * k; this.rest(); }

  /** Position de repos du joystick (visible et donc découvrable). */
  restPosition(): { x: number; y: number } {
    const m = 40 + 66 * (this.radius / 52);
    return { x: this.lefty ? innerWidth - m : m, y: innerHeight - m };
  }

  private rest(): void {
    if (this.pointer !== -1) return;
    const p = this.restPosition();
    this.place(p.x, p.y);
    this.knob.style.transform = '';
  }

  private place(x: number, y: number): void { this.stick.style.left = `${x}px`; this.stick.style.top = `${y}px`; }

  private down(e: PointerEvent): void {
    if (this.pointer !== -1) return;
    e.preventDefault();
    this.pointer = e.pointerId;
    try { this.zone.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.origin = { x: e.clientX, y: e.clientY };
    this.place(e.clientX, e.clientY);
    this.stick.classList.add('sc-active');
  }

  private moveTo(e: PointerEvent): void {
    if (e.pointerId !== this.pointer) return;
    let dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y;
    const d = Math.hypot(dx, dy);
    // Le socle suit le pouce s'il dépasse le rayon : pas besoin de revenir au centre.
    if (d > this.radius * 1.4) {
      const k = (d - this.radius * 1.4) / d;
      this.origin.x += dx * k; this.origin.y += dy * k;
      this.place(this.origin.x, this.origin.y);
      dx = e.clientX - this.origin.x; dy = e.clientY - this.origin.y;
    }
    const l = Math.min(1, Math.hypot(dx, dy) / this.radius);
    const a = Math.atan2(dy, dx);
    const dead = 0.12;
    const out = l < dead ? 0 : (l - dead) / (1 - dead);
    this.knob.style.transform = `translate(${Math.cos(a) * l * this.radius}px, ${Math.sin(a) * l * this.radius}px)`;
    this.onMove(Math.cos(a) * out, Math.sin(a) * out);
    if (out > 0.3 && !this.used) { this.used = true; this.onFirstUse(); }
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointer) return;
    this.pointer = -1;
    this.stick.classList.remove('sc-active');
    this.onMove(0, 0);
    this.rest();
  }
}

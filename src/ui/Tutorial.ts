import { h } from './dom';

export type TutoEvent = 'move' | 'attack' | 'dash' | 'kill' | 'skill' | 'offer';
type Dev = 'keyboard' | 'mouse' | 'gamepad' | 'touch';

interface Step {
  id: TutoEvent | 'wave';
  title: string;
  text: Record<'kb' | 'pad' | 'touch', string>;
  goal: number;                     // quantité à atteindre (secondes de déplacement, nombre…)
  target?: string;                  // sélecteur à entourer en tactile
  hand?: boolean;                   // geste de glissement (joystick)
}

const STEPS: Step[] = [
  { id: 'move', title: 'Déplace-toi', goal: 1.2, hand: true,
    text: { kb: 'Utilise <span class="sc-kbd">Z</span><span class="sc-kbd">Q</span><span class="sc-kbd">S</span><span class="sc-kbd">D</span> ou les flèches.', pad: 'Incline le stick gauche.', touch: 'Pose le pouce à gauche de l\'écran et glisse.' } },
  { id: 'attack', title: 'Frappe', goal: 1.5, target: '.sc-skill[data-i="0"]',
    text: { kb: 'Maintiens le <b>clic gauche</b> (ou <span class="sc-kbd">J</span>) : tu vises à la souris.', pad: 'Maintiens <b>RT</b>, vise au stick droit.', touch: 'Maintiens le gros bouton : la visée est automatique.' } },
  { id: 'dash', title: 'Esquive', goal: 1, target: '.sc-skill[data-i="4"]',
    text: { kb: '<span class="sc-kbd">Espace</span> ou clic droit : tu traverses les coups.', pad: '<b>LT</b> pour esquiver.', touch: 'Touche ➶ pour traverser les ennemis.' } },
  { id: 'kill', title: 'Élimine 5 ombres', goal: 5,
    text: { kb: 'Enchaîne les éliminations pour faire monter le combo.', pad: 'Enchaîne les éliminations pour faire monter le combo.', touch: 'Enchaîne les éliminations pour faire monter le combo.' } },
  { id: 'skill', title: 'Technique', goal: 1, target: '.sc-skill[data-i="1"]',
    text: { kb: 'Touche <span class="sc-kbd">1</span>, <span class="sc-kbd">2</span> ou <span class="sc-kbd">3</span> : elles coûtent du mana.', pad: '<b>X</b>, <b>Y</b> ou <b>RB</b> pour tes techniques.', touch: 'Touche une technique autour du bouton de frappe.' } },
  { id: 'wave', title: 'Tiens jusqu\'à la fin de la vague', goal: 1,
    text: { kb: 'Une bénédiction t\'attend : c\'est elle qui fait ton build.', pad: 'Une bénédiction t\'attend : c\'est elle qui fait ton build.', touch: 'Une bénédiction t\'attend : c\'est elle qui fait ton build.' } },
];

/**
 * Première minute guidée : 6 étapes courtes, jamais bloquantes (le jeu continue),
 * adaptées au périphérique, avec un anneau sur le bon bouton en tactile.
 * Le jeu appelle `notify('move', dt)`, `notify('kill')`, etc.
 */
export class Tutorial {
  readonly el: HTMLElement;
  onDone: () => void = () => {};
  private i = -1;
  private acc = 0;
  private panel?: HTMLElement;
  private bar?: HTMLElement;
  private extra: HTMLElement[] = [];
  private device: Dev = 'keyboard';
  private active = false;
  private offerTipShown = false;

  constructor(private readonly locate: (sel: string) => HTMLElement | null, private readonly restPos: () => { x: number; y: number }) {
    this.el = h('div', { class: 'sc-tuto', 'aria-live': 'polite' });
  }

  get running(): boolean { return this.active; }

  start(device: Dev): void { this.device = device; this.active = true; this.i = -1; this.next(); }
  stop(): void { this.active = false; this.clear(); this.el.replaceChildren(); }

  setDevice(d: Dev): void { if (d !== this.device && this.active) { this.device = d; this.show(); } }

  notify(ev: TutoEvent, amount = 1): void {
    if (ev === 'offer') { this.offerTip(); return; }
    if (!this.active) return;
    const s = STEPS[this.i];
    if (!s || s.id !== ev) return;
    this.acc += amount;
    if (this.bar) this.bar.style.width = `${Math.min(1, this.acc / s.goal) * 100}%`;
    if (this.acc >= s.goal) this.complete();
  }

  /** Fin de la première vague (ou appel manuel) : clôt le tutoriel. */
  waveCleared(): void { if (this.active && STEPS[this.i]?.id === 'wave') this.complete(); else if (this.active) { this.stop(); this.onDone(); } }

  private complete(): void {
    const p = this.panel;
    if (p) { p.classList.add('sc-done'); p.querySelector('.sc-step')!.textContent = '✓'; }
    this.clear(false);
    setTimeout(() => this.next(), 650);
  }

  private next(): void {
    this.i++; this.acc = 0;
    if (this.i >= STEPS.length) { this.stop(); this.onDone(); return; }
    this.show();
    if (STEPS[this.i].id === 'wave') setTimeout(() => { if (STEPS[this.i]?.id === 'wave') this.complete(); }, 6000);
  }

  private key(): 'kb' | 'pad' | 'touch' { return this.device === 'gamepad' ? 'pad' : this.device === 'touch' ? 'touch' : 'kb'; }

  private show(): void {
    const s = STEPS[this.i];
    if (!s) return;
    this.clear();
    this.panel = h('div', { class: 'sc-coach sc-panel', role: 'status' },
      h('span', { class: 'sc-step' }, String(this.i + 1)),
      h('div', {}, h('h4', {}, s.title), h('p', { html: s.text[this.key()] })),
      h('button', { class: 'sc-btn sc-ghost', style: { minHeight: '36px', padding: '4px 10px', fontSize: '0.75em' }, onclick: () => { this.stop(); this.onDone(); }, 'aria-label': 'Passer le tutoriel' }, 'Passer'),
      h('div', { class: 'sc-prog' }, (this.bar = h('i'))));
    this.el.replaceChildren(this.panel);
    if (this.device === 'touch') {
      if (s.hand) { const p = this.restPos(); const g = h('div', { class: 'sc-ghost-hand', style: { left: `${p.x}px`, top: `${p.y}px` } }); this.extra.push(g); this.el.append(g); }
      if (s.target) {
        const t = this.locate(s.target);
        if (t) {
          const r = t.getBoundingClientRect(); const pad = 8;
          const ring = h('div', { class: 'sc-ring', style: { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` } });
          this.extra.push(ring); this.el.append(ring);
        }
      }
    }
  }

  private offerTip(): void {
    if (this.offerTipShown) return;
    this.offerTipShown = true;
    const tip = h('div', { class: 'sc-coach-tip sc-panel', style: { left: '50%', bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', transform: 'translateX(-50%)' } },
      '✦ Les ', h('b', {}, 'tags'), ' montrent les synergies. Un liseré doré = un ', h('b', {}, 'Duo'), ' se débloque.');
    tip.style.zIndex = '30';
    const screens = document.querySelectorAll('#sc-ui .sc-screen');
    (screens[screens.length - 1] ?? document.getElementById('sc-ui'))?.append(tip);
    tip.style.position = 'fixed';
    setTimeout(() => tip.remove(), 7000);
  }

  private clear(all = true): void {
    for (const e of this.extra) e.remove();
    this.extra = [];
    if (all) this.panel = undefined;
  }
}

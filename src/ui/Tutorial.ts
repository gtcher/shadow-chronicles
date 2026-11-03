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
  { id: 'move', title: 'Déplace-toi', goal: 1, hand: true,
    text: { kb: 'Utilise <span class="sc-kbd">Z</span><span class="sc-kbd">Q</span><span class="sc-kbd">S</span><span class="sc-kbd">D</span> ou les flèches.', pad: 'Incline le stick gauche.', touch: 'Pose le pouce à gauche de l\'écran et glisse.' } },
  { id: 'attack', title: 'Frappe', goal: 1, target: '.sc-skill[data-i="0"]',
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
  /** Incrémenté à chaque start/stop : les minuteries d'une session close ne font plus rien. */
  private gen = 0;
  private textEl?: HTMLElement;

  constructor(private readonly locate: (sel: string) => HTMLElement | null, private readonly restPos: () => { x: number; y: number }) {
    this.el = h('div', { class: 'sc-tuto', 'aria-live': 'polite' });
  }

  get running(): boolean { return this.active; }

  start(device: Dev): void { this.gen++; this.device = device; this.active = true; this.i = -1; this.next(); }
  stop(): void { this.gen++; this.active = false; this.clear(); this.el.replaceChildren(); }

  /** Passer : ferme le tutoriel pour de bon (mémorisé par `onDone`). */
  skip(): void { if (!this.active) return; this.stop(); this.onDone(); }

  /**
   * Changement de périphérique : on ne reconstruit jamais le panneau (sinon il « saute » à chaque
   * alternance clavier/souris et le bouton Passer est remplacé sous le doigt avant le clic).
   * Seul le texte change, et seulement s'il diffère (clavier et souris partagent le même).
   */
  setDevice(d: Dev): void {
    if (d === this.device) return;
    const before = this.key();
    this.device = d;
    if (!this.active || this.key() === before) return;
    const s = STEPS[this.i];
    if (s && this.textEl && this.panel && !this.panel.classList.contains('sc-done')) { this.textEl.innerHTML = s.text[this.key()]; this.decorate(s); }
  }

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
    if (!p || p.classList.contains('sc-done')) return;   // déjà validée : pas de double avance
    p.classList.add('sc-done'); p.querySelector('.sc-step')!.textContent = '✓';
    this.clear(false);
    const g = this.gen;
    // Le panneau validé s'efface tout de suite ; l'étape suivante arrive un peu après.
    setTimeout(() => { if (g === this.gen && this.panel === p) { p.remove(); this.panel = undefined; } }, 350);
    setTimeout(() => { if (g === this.gen) this.next(); }, 900);
  }

  private next(): void {
    if (!this.active) return;
    this.i++; this.acc = 0;
    if (this.i >= STEPS.length) { this.stop(); this.onDone(); return; }
    this.show();
    const g = this.gen, i = this.i;
    if (STEPS[i].id === 'wave') setTimeout(() => { if (g === this.gen && this.i === i) this.complete(); }, 6000);
  }

  private key(): 'kb' | 'pad' | 'touch' { return this.device === 'gamepad' ? 'pad' : this.device === 'touch' ? 'touch' : 'kb'; }

  private show(): void {
    const s = STEPS[this.i];
    if (!s) return;
    this.clear();
    // Passer réagit dès l'appui (pointerdown) : rien ne peut remplacer le bouton entre l'appui et le clic.
    const skip = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.skip(); };
    const btn = h('button', { class: 'sc-btn sc-ghost', type: 'button', style: { minHeight: '36px', padding: '4px 10px', fontSize: '0.75em' }, 'aria-label': 'Passer le tutoriel' }, 'Passer');
    btn.addEventListener('pointerdown', skip);
    btn.addEventListener('click', skip);
    this.panel = h('div', { class: 'sc-coach sc-panel', role: 'status' },
      h('span', { class: 'sc-step' }, String(this.i + 1)),
      h('div', {}, h('h4', {}, s.title), (this.textEl = h('p', { html: s.text[this.key()] }))),
      btn,
      h('div', { class: 'sc-prog' }, (this.bar = h('i'))));
    this.el.replaceChildren(this.panel);
    this.decorate(s);
  }

  /** Main fantôme et anneau autour du bouton, en tactile seulement. */
  private decorate(s: Step): void {
    for (const e of this.extra) e.remove();
    this.extra = [];
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

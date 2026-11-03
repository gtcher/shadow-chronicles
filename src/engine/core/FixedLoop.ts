/**
 * Boucle à pas fixe (« fix your timestep »).
 *
 * - `update(dt)` est appelé à fréquence constante (60 Hz par défaut) : la simulation
 *   est déterministe et indépendante du framerate de l'écran (60, 144 Hz…).
 * - `render(alpha)` est appelé une fois par frame affichée ; `alpha` ∈ [0,1] sert à
 *   interpoler entre l'état précédent et l'état courant pour un rendu fluide.
 * - Garde-fou « spirale de la mort » : on limite le nombre de pas rattrapés par frame.
 */
export interface FixedLoopOptions {
  /** Pas de simulation en secondes (défaut 1/60). */
  step?: number;
  /** Nombre maximum de pas exécutés par frame (défaut 5). */
  maxSteps?: number;
}

export class FixedLoop {
  readonly step: number;
  readonly maxSteps: number;
  /** Multiplicateur du temps (0.3 = ralenti, 0 = pause). Utilisé pour le « hit-stop ». */
  timeScale = 1;
  /** Nombre total de ticks simulés. */
  tick = 0;
  private acc = 0;
  private last = -1;
  private rafId = 0;
  private running = false;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number, frameDt: number) => void,
    opts: FixedLoopOptions = {},
  ) {
    this.step = opts.step ?? 1 / 60;
    this.maxSteps = opts.maxSteps ?? 5;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = -1;
    const frame = (t: number) => {
      if (!this.running) return;
      this.advance(t / 1000);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /**
   * Avance la boucle jusqu'au temps `now` (secondes). Public pour les tests
   * et pour piloter la boucle manuellement (replays, rendu hors ligne).
   * Retourne le nombre de pas simulés.
   */
  advance(now: number): number {
    if (this.last < 0) this.last = now;
    // Onglet en arrière-plan : on ne rattrape pas plus de 250 ms.
    const frameDt = Math.min(now - this.last, 0.25);
    this.last = now;
    this.acc += frameDt * this.timeScale;
    let steps = 0;
    while (this.acc >= this.step && steps < this.maxSteps) {
      this.update(this.step);
      this.acc -= this.step;
      this.tick++;
      steps++;
    }
    if (steps === this.maxSteps && this.acc > this.step) this.acc = 0; // on lâche le retard
    this.render(this.acc / this.step, frameDt);
    return steps;
  }
}

import type { Game } from '../core/Game';

/**
 * Une scène = un écran du jeu (titre, sanctuaire, run, game over…).
 * Le jeu n'a qu'une scène active à la fois (`game.scenes.switch(...)`).
 * Une scène peut aussi être empilée par-dessus (pause, choix d'amélioration) avec `push`.
 */
export abstract class Scene {
  /** Si vrai, la scène du dessous continue d'être simulée quand celle-ci est empilée. */
  readonly updateBelow: boolean = false;
  protected game!: Game;

  /** @internal */
  _bind(game: Game): void { this.game = game; }

  /** Appelé à l'entrée : créez entités, vues, écouteurs. Peut être asynchrone (chargements). */
  enter(): void | Promise<void> {}
  /** Appelé à la sortie : détruisez ce que vous avez créé. */
  exit(): void {}
  /** Pas de simulation fixe. */
  update(_dt: number): void {}
  /** Une fois par frame affichée, avant le dessin. `alpha` = interpolation. */
  render(_alpha: number, _frameDt: number): void {}
}

export class SceneManager {
  private stack: Scene[] = [];
  constructor(private readonly game: Game) {}

  get current(): Scene | undefined { return this.stack[this.stack.length - 1]; }

  async switch(scene: Scene): Promise<void> {
    while (this.stack.length) this.stack.pop()!.exit();
    await this.push(scene);
  }

  async push(scene: Scene): Promise<void> {
    scene._bind(this.game);
    this.stack.push(scene);
    await scene.enter();
  }

  pop(): void { this.stack.pop()?.exit(); }

  update(dt: number): void {
    // Simule la scène du dessus, et celles du dessous tant que `updateBelow` le permet.
    for (let i = this.stack.length - 1; i >= 0; i--) {
      this.stack[i].update(dt);
      if (!this.stack[i].updateBelow) break;
    }
  }

  render(alpha: number, frameDt: number): void {
    for (const s of this.stack) s.render(alpha, frameDt);
  }
}

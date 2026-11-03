import { FixedLoop } from './FixedLoop';
import { EventBus } from './EventBus';
import { Renderer } from '../render/Renderer';
import { Camera } from '../camera/Camera';
import { Input } from '../input/Input';
import { AssetStore } from '../assets/AssetStore';
import { SceneManager } from '../scene/Scene';

/**
 * Événements globaux connus du moteur. Le gameplay étend ce type
 * (voir src/game/events.ts) — les autres agents s'y abonnent (audio, UI, succès…).
 */
export interface EngineEvents extends Record<string, unknown> {
  'game:pause': { paused: boolean };
  'game:resize': { width: number; height: number };
}

export interface GameOptions {
  /** Fréquence de simulation (Hz). */
  tickRate?: number;
}

/**
 * Point d'entrée du moteur. Regroupe rendu, caméra, entrées, assets, scènes et boucle.
 *
 *   const game = await Game.create(document.getElementById('app')!);
 *   await game.assets.loadManifest(); await game.assets.loadImages();
 *   await game.scenes.switch(new MaScene());
 *   game.start();
 */
export class Game<Ev extends EngineEvents = EngineEvents> {
  readonly renderer = new Renderer();
  readonly camera = new Camera();
  readonly assets = new AssetStore();
  readonly events = new EventBus<Ev>();
  readonly scenes: SceneManager;
  readonly loop: FixedLoop;
  input!: Input;
  paused = false;
  /** Si vrai, l'action « pause » (Échap / P / Start) bascule la pause. Mettre à false si l'UI la gère. */
  pauseOnAction = true;
  /** Statistiques pour l'overlay de debug. */
  readonly stats = { fps: 0, frameMs: 0, updatesPerFrame: 0 };
  private fpsAcc = 0;
  private fpsFrames = 0;

  private constructor(opts: GameOptions) {
    this.scenes = new SceneManager(this as unknown as Game);
    this.loop = new FixedLoop(
      (dt) => this.tick(dt),
      (alpha, frameDt) => this.frame(alpha, frameDt),
      { step: 1 / (opts.tickRate ?? 60) },
    );
  }

  static async create<E extends EngineEvents = EngineEvents>(host: HTMLElement, opts: GameOptions = {}): Promise<Game<E>> {
    const g = new Game<E>(opts);
    await g.renderer.init(host);
    g.input = new Input(g.renderer.canvas);
    g.renderer.onResize((width, height) => (g.events as unknown as EventBus<EngineEvents>).emit('game:resize', { width, height }));
    // Pause automatique quand l'onglet est caché (évite de mourir en arrière-plan).
    document.addEventListener('visibilitychange', () => { if (document.hidden) g.setPaused(true); });
    return g;
  }

  start(): void { this.loop.start(); }
  stop(): void { this.loop.stop(); }

  setPaused(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    (this.events as unknown as EventBus<EngineEvents>).emit('game:pause', { paused: p });
  }

  /**
   * Gel bref de la simulation (« hit-stop ») pour donner du poids aux impacts.
   * Ex. `game.hitStop(0.06)` lors d'un coup critique.
   */
  hitStop(seconds: number, scale = 0.05): void {
    // Les gels se cumulent : on garde la fin la plus tardive et le ralenti le plus fort.
    const now = performance.now();
    const active = now < this.hitStopUntil;
    this.hitStopUntil = Math.max(this.hitStopUntil, now + seconds * 1000);
    this.loop.timeScale = active ? Math.min(this.loop.timeScale, scale) : scale;
  }
  private hitStopUntil = 0;

  private tick(dt: number): void {
    this.input.poll();
    if (this.pauseOnAction && this.input.pressed('pause')) this.setPaused(!this.paused);
    if (this.paused) return;
    this.scenes.update(dt);
    this.camera.update(dt);
  }

  private frame(alpha: number, frameDt: number): void {
    if (this.hitStopUntil && performance.now() >= this.hitStopUntil) { this.hitStopUntil = 0; this.loop.timeScale = 1; }
    this.fpsAcc += frameDt; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.stats.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.stats.frameMs = (this.fpsAcc / this.fpsFrames) * 1000;
      this.fpsAcc = 0; this.fpsFrames = 0;
    }
    this.scenes.render(this.paused ? 1 : alpha, frameDt);
    this.renderer.draw(this.camera, this.paused ? 1 : alpha);
  }
}

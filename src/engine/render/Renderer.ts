import { Application, Container, type ApplicationOptions } from 'pixi.js';
import type { Camera } from '../camera/Camera';

/**
 * Couches de rendu, de l'arrière vers l'avant.
 * Les couches « monde » suivent la caméra ; les couches « écran » sont fixes.
 */
export const WORLD_LAYERS = ['background', 'ground', 'decals', 'shadows', 'entities', 'fx', 'overlay'] as const;
export const SCREEN_LAYERS = ['screenFx', 'hud', 'debug'] as const;
export type WorldLayer = (typeof WORLD_LAYERS)[number];
export type ScreenLayer = (typeof SCREEN_LAYERS)[number];

export class Renderer {
  readonly app = new Application();
  /** Conteneur transformé par la caméra. */
  readonly world = new Container({ label: 'world' });
  readonly screen = new Container({ label: 'screen' });
  readonly layers = {} as Record<WorldLayer | ScreenLayer, Container>;
  private resizeHandlers: Array<(w: number, h: number) => void> = [];
  private beforeRender: Array<() => void> = [];
  private lastW = 0;
  private lastH = 0;

  async init(host: HTMLElement, opts: Partial<ApplicationOptions> = {}): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: '#07111f',
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoStart: false, // c'est notre FixedLoop qui pilote le rendu
      powerPreference: 'high-performance',
      ...opts,
    });
    this.app.ticker.stop();
    host.appendChild(this.app.canvas);
    this.app.canvas.style.display = 'block';
    this.app.canvas.style.touchAction = 'none';
    // Rotation portrait ↔ paysage : sur iOS et certains Android, l'évènement resize arrive parfois
    // avant que la page ait sa nouvelle taille. On remesure un peu après pour ne pas garder un canvas déformé.
    const late = () => { for (const ms of [120, 400]) setTimeout(() => this.app.resize(), ms); };
    addEventListener('orientationchange', late);
    window.visualViewport?.addEventListener('resize', late);

    for (const name of WORLD_LAYERS) this.world.addChild((this.layers[name] = new Container({ label: name })));
    for (const name of SCREEN_LAYERS) this.screen.addChild((this.layers[name] = new Container({ label: name })));
    // Tri par profondeur (y) pour l'effet de perspective vue de dessus.
    this.layers.entities.sortableChildren = true;
    this.app.stage.addChild(this.world, this.screen);
  }

  get width(): number { return this.app.screen.width; }
  get height(): number { return this.app.screen.height; }
  get canvas(): HTMLCanvasElement { return this.app.canvas; }

  /** Renvoie une fonction de désabonnement (à appeler dans `Scene.exit`). */
  onResize(fn: (w: number, h: number) => void): () => void {
    this.resizeHandlers.push(fn);
    return () => { this.resizeHandlers = this.resizeHandlers.filter((f) => f !== fn); };
  }

  /**
   * Passes de rendu supplémentaires (carte de lumière, bloom…), exécutées après
   * l'application de la caméra et juste avant le rendu final. Retourne une fonction de retrait.
   */
  onBeforeRender(fn: () => void): () => void {
    this.beforeRender.push(fn);
    return () => { this.beforeRender = this.beforeRender.filter((f) => f !== fn); };
  }

  /** Change la résolution interne (niveaux de qualité). */
  setResolution(r: number): void {
    const rr = this.app.renderer;
    if (Math.abs(rr.resolution - r) < 0.01) return;
    rr.resize(this.width, this.height, r);
  }

  /** Applique la caméra (interpolée) au monde puis dessine. */
  draw(camera: Camera, alpha: number): void {
    if (this.app.renderer.resolution === 0) return;
    const w = this.width, h = this.height;
    if (w !== this.lastW || h !== this.lastH) {
      this.lastW = w; this.lastH = h;
      camera.viewW = w; camera.viewH = h;
      for (const fn of this.resizeHandlers) fn(w, h);
    }
    const p = camera.renderPos(alpha);
    this.world.scale.set(camera.zoom);
    this.world.rotation = camera.rotation;
    // Centre de l'écran = point (p.x, p.y) du monde.
    this.world.pivot.set(p.x, p.y);
    this.world.position.set(w / 2, h / 2);
    this.world.updateLocalTransform();
    for (const fn of this.beforeRender) fn();
    this.app.render();
  }

  destroy(): void { this.app.destroy(true, { children: true }); }
}

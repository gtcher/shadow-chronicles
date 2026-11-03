import { TilingSprite, type Container, type Texture } from 'pixi.js';
import type { Camera } from '@engine';

/**
 * Brouillard : nappes de bruit raccordable qui dérivent lentement.
 * - nappe basse (couche `decals`, sous les personnages) : brume au ras du sol ;
 * - nappe haute (couche `overlay`, très transparente, légère parallaxe) : profondeur.
 * Les nappes suivent le rectangle visible ; la texture reste ancrée au monde.
 */
interface Sheet { s: TilingSprite; parallax: number; vx: number; vy: number; scale: number }

export class Fog {
  color = 0x7f95c4;
  /** Densité globale (0..1), modulable par biome ou par vague. */
  density = 1;
  private sheets: Sheet[] = [];
  private t = 0;

  constructor(private readonly tex: Texture, private readonly low: Container, private readonly high: Container) {}

  setLayers(n: number): void {
    for (const s of this.sheets) s.s.destroy();
    this.sheets = [];
    const mk = (parent: Container, alpha: number, scale: number, parallax: number, vx: number, vy: number) => {
      const s = new TilingSprite({ texture: this.tex, width: 16, height: 16 });
      s.alpha = alpha; s.tint = this.color; s.tileScale.set(scale);
      s.label = 'fog';
      parent.addChild(s);
      this.sheets.push({ s, parallax, vx, vy, scale });
    };
    if (n >= 1) mk(this.low, 0.2, 3.2, 1, 14, 5);
    if (n >= 2) mk(this.high, 0.12, 4.5, 1.12, -22, 8);
  }

  update(frameDt: number, camera: Camera): void {
    this.t += frameDt;
    const r = camera.visibleRect(80);
    for (const sh of this.sheets) {
      sh.s.position.set(r.x, r.y);
      sh.s.width = r.w; sh.s.height = r.h;
      sh.s.tint = this.color;
      // Ancré au monde (tilePosition = −position), + parallaxe (facteur > 1 = plus proche), + dérive.
      sh.s.tilePosition.set(-r.x * sh.parallax + this.t * sh.vx, -r.y * sh.parallax + this.t * sh.vy);
      sh.s.alpha = (sh.parallax > 1 ? 0.12 : 0.2) * this.density;
    }
  }

  destroy(): void { for (const s of this.sheets) s.s.destroy(); this.sheets = []; }
}
